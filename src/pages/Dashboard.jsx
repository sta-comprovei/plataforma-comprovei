import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  buscarOperacoesDashboard,
  calcularIndicadoresPrincipais,
  calcularEvolucaoOperacoes,
  calcularDistribuicaoPorTipo,
  calcularDistribuicaoPorStatus,
  calcularAlertasGerenciais,
  gerarInsightsAutomaticos,
  calcularComparacaoPeriodos,
} from '../lib/dashboardService'
import { calcularIntervaloPeriodo, buscarMetas } from '../lib/leadTimeService'
import { listarMotoristasComOperacao, TIPOS_OPERACAO } from '../lib/operacoesService'
import { useAutoRefresh } from '../lib/useAutoRefresh'
import { formatarLeadTime } from '../lib/dataHoraUtils'
import { buscarAlteracoesHoje, buscarKpisAlteracoes, labelTipo as labelTipoAlt, corPrioridade } from '../lib/alteracoesOperacionaisService'
import { buscarKpisPendentes } from '../lib/operacoesPendentesService'
import { buscarMapaPrazosPorRota } from '../lib/slaService'
import { buscarEvolucaoMensalDesempenho, buscarRankingDesempenho } from '../lib/evolucaoMotoristasService'

import LineChart from '../components/ui/LineChart'
import MetaBarChart from '../components/ui/MetaBarChart'
import DistribuicaoBarChart from '../components/ui/DistribuicaoBarChart'
import ComparacaoPeriodosChart from '../components/ui/ComparacaoPeriodosChart'
import {
  IconDashboard,
  IconAlert,
  IconTrendingUp,
  IconTrendingDown,
  IconCheck,
  IconAlertCircle,
  IconBarChart,
} from '../components/ui/Icons'

import './Dashboard.css'

const CORES_CATEGORIA = { DF: '#F97316', Adega: '#2563EB', Filial: '#7C3AED' }
const CORES_STATUS = {
  Pendente: '#D97706',
  'Em trânsito': '#2563EB',
  'Chegada ao cliente': '#7C3AED',
  'Entrega finalizada': '#EA6C0A',
  Concluído: '#16A34A',
}

function formatarAgora() {
  return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export default function Dashboard() {
  // ---- filtros globais ----
  const [periodo, setPeriodo] = useState('mes')
  const [dataInicioCustom, setDataInicioCustom] = useState('')
  const [dataFimCustom, setDataFimCustom] = useState('')
  const [motoristaId, setMotoristaId] = useState('')
  const [tipoOperacaoFiltro, setTipoOperacaoFiltro] = useState('')

  // ---- granularidade do gráfico de evolução ----
  const [granularidadeEvolucao, setGranularidadeEvolucao] = useState('diario')

  // ---- dados ----
  const [operacoes, setOperacoes] = useState([])
  const [operacoesAnterior, setOperacoesAnterior] = useState([])
  const [metas, setMetas] = useState({})
  const [motoristasDisponiveis, setMotoristasDisponiveis] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState('')
  // Alterações do Dia
  const [alteracoesHoje, setAlteracoesHoje] = useState([])
  const [kpisAlteracoes, setKpisAlteracoes] = useState(null)
  // Pendências Operacionais
  const [kpisPendentes, setKpisPendentes] = useState(null)
  const [prazosPorRota, setPrazosPorRota] = useState({})

  // Desempenho dos Motoristas
  const [desempenhoMensal, setDesempenhoMensal] = useState([])
  const [rankingDesempenho, setRankingDesempenho] = useState([])

  const intervalo = useMemo(() => {
    if (periodo === 'dia_especifico') {
      // Um único dia — início e fim idênticos
      return { dataInicio: dataInicioCustom, dataFim: dataInicioCustom }
    }
    if (periodo === 'personalizado') {
      return { dataInicio: dataInicioCustom, dataFim: dataFimCustom }
    }
    return calcularIntervaloPeriodo(periodo)
  }, [periodo, dataInicioCustom, dataFimCustom])

  // Intervalo do período "anterior", de mesma duração, para os insights
  // automáticos comparativos (ex.: "Lead Time reduziu X% em relação ao
  // período anterior").
  const intervaloAnterior = useMemo(() => {
    if (!intervalo.dataInicio || !intervalo.dataFim) return { dataInicio: '', dataFim: '' }
    const inicio = new Date(`${intervalo.dataInicio}T00:00:00`)
    const fim = new Date(`${intervalo.dataFim}T00:00:00`)
    const duracaoDias = Math.round((fim - inicio) / 864e5) + 1
    const fimAnterior = new Date(inicio)
    fimAnterior.setDate(fimAnterior.getDate() - 1)
    const inicioAnterior = new Date(fimAnterior)
    inicioAnterior.setDate(inicioAnterior.getDate() - duracaoDias + 1)
    const toISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return { dataInicio: toISO(inicioAnterior), dataFim: toISO(fimAnterior) }
  }, [intervalo.dataInicio, intervalo.dataFim])

  // Proteção contra race condition: se o usuário trocar de filtro
  // rapidamente (antes da resposta anterior voltar), a resposta mais
  // antiga não pode sobrescrever os dados do filtro mais recente.
  // requisicaoEmVooRef guarda a assinatura do filtro no exato momento
  // em que cada chamada é disparada; ao resolver, só aplicamos os
  // setters se essa assinatura ainda for a mais recente — caso
  // contrário, a resposta é descartada silenciosamente (uma chamada
  // mais nova já está em andamento ou já resolveu).
  const requisicaoEmVooRef = useRef('')

  const carregarDados = useCallback(async () => {
    const assinaturaDestaChamada = `${intervalo.dataInicio}::${intervalo.dataFim}::${intervaloAnterior.dataInicio}::${intervaloAnterior.dataFim}::${motoristaId}::${tipoOperacaoFiltro}`
    requisicaoEmVooRef.current = assinaturaDestaChamada

    setErro('')

    const filtrosBase = { motoristaId, tipoOperacao: tipoOperacaoFiltro }

    const [resultadoAtual, resultadoAnterior, resultadoMetas] = await Promise.all([
      buscarOperacoesDashboard({ ...filtrosBase, dataInicio: intervalo.dataInicio, dataFim: intervalo.dataFim }),
      intervaloAnterior.dataInicio
        ? buscarOperacoesDashboard({ ...filtrosBase, dataInicio: intervaloAnterior.dataInicio, dataFim: intervaloAnterior.dataFim })
        : Promise.resolve({ dados: [], erro: null }),
      buscarMetas(),
    ])

    // Se uma chamada mais recente já foi disparada enquanto esta estava
    // em voo, descarta esta resposta — ela é dado desatualizado para o
    // filtro atual.
    if (requisicaoEmVooRef.current !== assinaturaDestaChamada) {
      return
    }

    if (resultadoAtual.erro) {
      setErro(resultadoAtual.erro)
      setOperacoes([])
    } else {
      setOperacoes(resultadoAtual.dados)
    }

    if (!resultadoAnterior.erro) setOperacoesAnterior(resultadoAnterior.dados)
    if (!resultadoMetas.erro) setMetas(resultadoMetas.dados)

    // Alterações do Dia (em paralelo)
    Promise.all([buscarAlteracoesHoje(5), buscarKpisAlteracoes()]).then(([resAlt, resKpis]) => {
      if (requisicaoEmVooRef.current !== assinaturaDestaChamada) return
      if (!resAlt.erro)   setAlteracoesHoje(resAlt.dados ?? [])
      if (!resKpis.erro)  setKpisAlteracoes(resKpis.dados ?? null)
    })

    // Pendências Operacionais (em paralelo)
    buscarKpisPendentes().then(({ dados }) => {
      if (dados) setKpisPendentes(dados)
    })
    buscarMapaPrazosPorRota().then(({ dados }) => {
      if (dados) setPrazosPorRota(dados)
    })

    // Desempenho dos Motoristas (em paralelo, não bloqueia o dashboard)
    Promise.all([buscarEvolucaoMensalDesempenho(), buscarRankingDesempenho()]).then(([resMensal, resRanking]) => {
      if (requisicaoEmVooRef.current !== assinaturaDestaChamada) return
      if (!resMensal.erro)  setDesempenhoMensal(resMensal.dados ?? [])
      if (!resRanking.erro) setRankingDesempenho(resRanking.dados ?? [])
    })

    setCarregando(false)
    setUltimaAtualizacao(formatarAgora())
     
  }, [intervalo.dataInicio, intervalo.dataFim, intervaloAnterior.dataInicio, intervaloAnterior.dataFim, motoristaId, tipoOperacaoFiltro])

  useEffect(() => {
    setCarregando(true)
    carregarDados()
  }, [carregarDados])

  useEffect(() => {
    listarMotoristasComOperacao().then((resultado) => {
      if (!resultado.erro) setMotoristasDisponiveis(resultado.dados)
    })
  }, [])

  // Atualização automática (Etapa 6): sem exigir refresh manual da
  // página. Ver useAutoRefresh.js para a justificativa de usar
  // polling + refetch-on-focus em vez de Supabase Realtime.
  useAutoRefresh(carregarDados, 60000)

  const metasPorTipoMinutos = useMemo(() => {
    const m = {}
    for (const tipo of TIPOS_OPERACAO) {
      m[tipo] = metas[tipo]?.meta_minutos ?? null
    }
    return m
  }, [metas])

  const indicadores = useMemo(
    () => calcularIndicadoresPrincipais(operacoes, metasPorTipoMinutos, prazosPorRota),
    [operacoes, metasPorTipoMinutos, prazosPorRota]
  )

  const evolucaoOperacoes = useMemo(
    () => calcularEvolucaoOperacoes(operacoes, granularidadeEvolucao, granularidadeEvolucao === 'mensal' ? 6 : 14),
    [operacoes, granularidadeEvolucao]
  )

  const distribuicaoTipo = useMemo(() => calcularDistribuicaoPorTipo(operacoes), [operacoes])
  const distribuicaoStatus = useMemo(() => calcularDistribuicaoPorStatus(operacoes), [operacoes])

  const alertas = useMemo(
    () => calcularAlertasGerenciais(operacoes, metasPorTipoMinutos, prazosPorRota),
    [operacoes, metasPorTipoMinutos, prazosPorRota]
  )

  const insights = useMemo(
    () => gerarInsightsAutomaticos(operacoes, operacoesAnterior),
    [operacoes, operacoesAnterior]
  )

  // Evolução de Lead Time por categoria (reaproveita a mesma fonte de
  // dados já carregada — sem nova busca à parte).
  const evolucaoLeadTime = useMemo(() => {
    const porMes = {}
    for (const op of operacoes) {
      if (op.lead_time_min === null || op.lead_time_min === undefined) continue
      const mesChave = op.data_operacao.slice(0, 7)
      if (!porMes[mesChave]) porMes[mesChave] = {}
      if (!porMes[mesChave][op.tipo_operacao]) porMes[mesChave][op.tipo_operacao] = []
      porMes[mesChave][op.tipo_operacao].push(op.lead_time_min)
    }
    const meses = Object.keys(porMes).sort().slice(-6)
    const MESES_LABEL = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
    const labels = meses.map((m) => MESES_LABEL[Number(m.split('-')[1]) - 1])
    const series = TIPOS_OPERACAO.map((tipo) => ({
      nome: tipo,
      cor: CORES_CATEGORIA[tipo],
      valores: meses.map((m) => {
        const valores = porMes[m]?.[tipo]
        return valores && valores.length > 0
          ? Math.round((valores.reduce((s, v) => s + v, 0) / valores.length / 60) * 100) / 100
          : null
      }),
    }))
    return { labels, series }
  }, [operacoes])

  const comparacaoPeriodos = useMemo(
    () => calcularComparacaoPeriodos(operacoes, operacoesAnterior),
    [operacoes, operacoesAnterior]
  )

  const dadosMetaBarChart = TIPOS_OPERACAO.map((tipo) => {
    const doTipo = operacoes.filter((o) => o.tipo_operacao === tipo && o.lead_time_min !== null)
    const meta = metasPorTipoMinutos[tipo]
    if (doTipo.length === 0 || !meta) return null
    const dentro = doTipo.filter((o) => o.lead_time_min <= meta).length
    return {
      label: tipo,
      dentro: Math.round((dentro / doTipo.length) * 100),
      fora: Math.round(((doTipo.length - dentro) / doTipo.length) * 100),
    }
  }).filter(Boolean)

  const dadosDistribuicaoTipo = distribuicaoTipo.map((d) => ({ ...d, label: d.tipo, cor: CORES_CATEGORIA[d.tipo] }))
  const dadosDistribuicaoStatus = distribuicaoStatus.map((d) => ({ ...d, label: d.status, cor: CORES_STATUS[d.status] }))

  return (
    <div>
      <div className="dash-header">
        <div>
          <h2>Dashboard Executivo</h2>
          <p>Consolidação em tempo real de Operação do Dia, Histórico Operacional e Lead Time.</p>
        </div>
        {ultimaAtualizacao && (
          <span className="dash-atualizado">
            <span className="dot" />
            Atualizado às {ultimaAtualizacao}
          </span>
        )}
      </div>

      <div className="dash-filters-card">
        <div className="dash-filters-grid">
          <div className="dash-field">
            <label>Período</label>
            <select value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
              <option value="dia">Hoje</option>
              <option value="semana">Última semana</option>
              <option value="mes">Este mês</option>
              <option value="ano">Este ano</option>
              <option value="dia_especifico">Dia específico</option>
              <option value="personalizado">Intervalo personalizado</option>
            </select>
          </div>

          {periodo === 'dia_especifico' && (
            <div className="dash-field">
              <label>Data</label>
              <input
                type="date"
                value={dataInicioCustom}
                onChange={(e) => setDataInicioCustom(e.target.value)}
              />
            </div>
          )}

          {periodo === 'personalizado' && (
            <>
              <div className="dash-field">
                <label>De</label>
                <input type="date" value={dataInicioCustom} onChange={(e) => setDataInicioCustom(e.target.value)} />
              </div>
              <div className="dash-field">
                <label>Até</label>
                <input type="date" value={dataFimCustom} onChange={(e) => setDataFimCustom(e.target.value)} />
              </div>
            </>
          )}

          <div className="dash-field">
            <label>Motorista</label>
            <select value={motoristaId} onChange={(e) => setMotoristaId(e.target.value)}>
              <option value="">Todos</option>
              {motoristasDisponiveis.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="dash-field">
            <label>Tipo de operação</label>
            <select value={tipoOperacaoFiltro} onChange={(e) => setTipoOperacaoFiltro(e.target.value)}>
              <option value="">Todos</option>
              {TIPOS_OPERACAO.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {erro && (
        <div
          style={{
            marginBottom: 16,
            padding: '10px 14px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            background: 'var(--red-bg)',
            color: 'var(--red)',
            borderLeft: '3px solid var(--red)',
            display: 'flex',
            gap: 8,
            alignItems: 'center',
          }}
        >
          <IconAlertCircle width={15} height={15} />
          {erro}
        </div>
      )}

      {carregando ? (
        <div className="dash-empty">
          <p style={{ color: 'var(--text3)' }}>Carregando indicadores...</p>
        </div>
      ) : operacoes.length === 0 && !erro ? (
        <div className="dash-empty">
          <IconDashboard />
          <p>Nenhuma operação cadastrada para os filtros selecionados.</p>
        </div>
      ) : (
        <>
          {/* ---------- Indicadores principais ---------- */}
          <div className="dash-indicadores-grid">
            <CardIndicador classe="andamento" label="Em andamento" valor={indicadores.emAndamento} />
            <CardIndicador classe="finalizadas" label="Finalizadas" valor={indicadores.finalizadas} />
            <CardIndicador classe="total" label="Total de operações" valor={indicadores.total} />
            <CardIndicador classe="lt-geral" label="LT médio geral" valor={formatarLeadTime(indicadores.leadTimeMedioGeral)} pequeno />
            <CardIndicador classe="lt-df" label="LT médio DF" valor={formatarLeadTime(indicadores.leadTimeMedioDF)} pequeno />
            <CardIndicador classe="lt-adega" label="LT médio Adega" valor={formatarLeadTime(indicadores.leadTimeMedioAdega)} pequeno />
            <CardIndicador classe="lt-filial" label="LT médio Filial" valor={formatarLeadTime(indicadores.leadTimeMedioFilial)} pequeno />
            <CardIndicador classe="percentual" label="% médio conclusão" valor={`${indicadores.percentualMedioConclusao}%`} />
            <CardIndicador classe="divergencia" label="Com divergência" valor={indicadores.comDivergencia} />
            <CardIndicador classe="fora-meta" label="Fora da meta" valor={indicadores.foraDaMeta} />
          </div>

          {/* ---------- Alertas gerenciais ---------- */}
          <div className="dash-alertas-card">
            <div className="dash-alertas-header">
              <IconAlert width={17} height={17} style={{ color: 'var(--red)' }} />
              <h3>Alertas Gerenciais</h3>
            </div>
            <div className="dash-alertas-grid">
              <AlertaItem contagem={alertas.foraDaMeta.length} label="Operações fora da meta" />
              <AlertaItem contagem={alertas.comDivergencia.length} label="Operações com divergência" />
              <AlertaItem contagem={alertas.leadTimeElevado.length} label="Lead Time elevado (>150% da meta)" />
              <AlertaItem contagem={alertas.abertasHaVariosDias.length} label="Operações abertas há vários dias" />
            </div>
          </div>

          {/* ---------- Insights automáticos ---------- */}
          <div className="dash-insights-card">
            <div className="dash-insights-header">
              <IconBarChart width={16} height={16} style={{ color: 'var(--orange)' }} />
              <h3>Insights Automáticos</h3>
            </div>
            {insights.map((insight, i) => (
              <div className={`dash-insight-item ${insight.tipo}`} key={i}>
                <span className="dash-insight-icon">
                  {insight.tipo === 'positivo' && <IconTrendingDown width={14} height={14} />}
                  {insight.tipo === 'negativo' && <IconTrendingUp width={14} height={14} />}
                  {insight.tipo === 'atencao' && <IconAlertCircle width={14} height={14} />}
                  {insight.tipo === 'neutro' && <IconCheck width={14} height={14} />}
                </span>
                <span>{insight.texto}</span>
              </div>
            ))}
          </div>

          {/* ---------- Alterações do Dia — Etapa 9.5 ---------- */}
          {(alteracoesHoje.length > 0 || (kpisAlteracoes && kpisAlteracoes.abertas > 0)) && (
            <div className="dash-alteracoes-card">
              <div className="dash-alertas-header">
                <span style={{ fontSize: 16 }}>📋</span>
                <h3>Alterações do Dia</h3>
                <a href="/alteracoes" className="dash-alteracoes-link">Ver todas →</a>
              </div>
              {kpisAlteracoes && (
                <div className="dash-alteracoes-kpis">
                  <span className="dash-alt-kpi">
                    <strong style={{ color: 'var(--orange)' }}>{kpisAlteracoes.alteracoes_hoje}</strong> hoje
                  </span>
                  <span className="dash-alt-kpi">
                    <strong style={{ color: 'var(--amber)' }}>{kpisAlteracoes.abertas}</strong> abertas
                  </span>
                  {kpisAlteracoes.criticas > 0 && (
                    <span className="dash-alt-kpi">
                      <strong style={{ color: 'var(--red)' }}>{kpisAlteracoes.criticas}</strong> críticas
                    </span>
                  )}
                </div>
              )}
              {alteracoesHoje.map(a => (
                <div key={a.id} className="dash-alt-item">
                  <span className="dash-alt-prior" style={{ color: corPrioridade(a.prioridade) }}>
                    ●
                  </span>
                  <span className="dash-alt-tipo">{labelTipoAlt(a.tipo)}</span>
                  {a.motorista && <span className="dash-alt-mot">{a.motorista}</span>}
                  <span className="dash-alt-desc">{a.descricao}</span>
                </div>
              ))}
            </div>
          )}

          {/* ---------- Gráficos: Evolução de Operações ---------- */}
          <div className="dash-charts-grid">
            <div className="dash-chart-card">
              <h3>Evolução de Operações</h3>
              <p className="dash-chart-sub">Quantidade de operações registradas por período</p>
              <div className="dash-chart-tabs">
                <button
                  className={`dash-chart-tab${granularidadeEvolucao === 'diario' ? ' active' : ''}`}
                  onClick={() => setGranularidadeEvolucao('diario')}
                >
                  Diário
                </button>
                <button
                  className={`dash-chart-tab${granularidadeEvolucao === 'semanal' ? ' active' : ''}`}
                  onClick={() => setGranularidadeEvolucao('semanal')}
                >
                  Semanal
                </button>
                <button
                  className={`dash-chart-tab${granularidadeEvolucao === 'mensal' ? ' active' : ''}`}
                  onClick={() => setGranularidadeEvolucao('mensal')}
                >
                  Mensal
                </button>
              </div>
              <LineChart
                labels={evolucaoOperacoes.map((e) => e.label)}
                series={[{ nome: 'Operações', cor: '#F97316', valores: evolucaoOperacoes.map((e) => e.quantidade) }]}
                formatarValor={(v) => String(v)}
              />
            </div>

            <div className="dash-chart-card">
              <h3>Evolução de Lead Time (horas)</h3>
              <p className="dash-chart-sub">Lead Time médio por categoria, últimos 6 meses</p>
              <LineChart labels={evolucaoLeadTime.labels} series={evolucaoLeadTime.series} formatarValor={(v) => `${v}h`} />
            </div>

            <div className="dash-chart-card">
              <h3>Comparação entre Períodos</h3>
              <p className="dash-chart-sub">Lead Time médio: período atual vs. anterior, por categoria</p>
              <ComparacaoPeriodosChart dados={comparacaoPeriodos} cores={CORES_CATEGORIA} />
            </div>

            <div className="dash-chart-card">
              <h3>Cumprimento de Metas</h3>
              <p className="dash-chart-sub">% de operações dentro vs. fora da meta, por categoria</p>
              <MetaBarChart dados={dadosMetaBarChart} />
            </div>

            <div className="dash-chart-card">
              <h3>Tipos de Operação</h3>
              <p className="dash-chart-sub">Quantidade e percentual por categoria (DF / Adega / Filial)</p>
              <DistribuicaoBarChart dados={dadosDistribuicaoTipo} altura={160} />
            </div>

            <div className="dash-chart-card" style={{ gridColumn: '1 / -1' }}>
              <h3>Status Operacionais</h3>
              <p className="dash-chart-sub">Distribuição das operações por status atual</p>
              <DistribuicaoBarChart dados={dadosDistribuicaoStatus} altura={220} />
            </div>
          </div>

          {/* Desempenho dos Motoristas */}
          {desempenhoMensal.length > 0 && (() => {
            const ult = desempenhoMensal[desempenhoMensal.length - 1]
            const pen = desempenhoMensal[desempenhoMensal.length - 2]
            const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
            const fmtComp = (comp) => { if (!comp) return '—'; const [a,m] = comp.split('-'); return `${MESES[+m-1]}/${a.slice(2)}` }
            const vsAnt = pen?.media_qualidade != null
              ? Math.round((ult.media_qualidade - pen.media_qualidade) * 100) / 100
              : null
            const top5 = [...rankingDesempenho]
              .filter(m => m.qualidade_pct != null)
              .sort((a, b) => b.qualidade_pct - a.qualidade_pct)
              .slice(0, 5)
            return (
              <div style={{ marginTop: 24 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text2)', marginBottom: 12 }}>
                  Desempenho dos Motoristas · {fmtComp(ult?.competencia)}
                </h3>
                <div className="dash-indicadores" style={{ marginBottom: 16 }}>
                  <CardIndicador
                    classe="dash-indicador-neutro"
                    label="Qualidade média"
                    valor={ult?.media_qualidade != null ? `${ult.media_qualidade}%` : '—'}
                  />
                  {vsAnt != null && (
                    <CardIndicador
                      classe={vsAnt >= 0 ? 'dash-indicador-positivo' : 'dash-indicador-negativo'}
                      label="vs. mês anterior"
                      valor={`${vsAnt > 0 ? '+' : ''}${vsAnt}%`}
                    />
                  )}
                  <CardIndicador
                    classe="dash-indicador-neutro"
                    label="Motoristas no mês"
                    valor={ult?.total_motoristas ?? '—'}
                  />
                </div>
                {top5.length > 0 && (
                  <div className="dash-chart-card">
                    <h3>Top 5 Qualidade — mês mais recente</h3>
                    <p className="dash-chart-sub">Motoristas com maior qualidade no último mês importado.</p>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                          <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text3)', fontWeight: 600 }}>#</th>
                          <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text3)', fontWeight: 600 }}>Motorista</th>
                          <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text3)', fontWeight: 600 }}>Qualidade</th>
                        </tr>
                      </thead>
                      <tbody>
                        {top5.map((m, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '6px 8px', color: 'var(--text3)' }}>#{i + 1}</td>
                            <td style={{ padding: '6px 8px', fontWeight: 500 }}>{m.nome_motorista}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700,
                              color: m.qualidade_pct >= 95 ? 'var(--green)' : m.qualidade_pct >= 80 ? 'var(--orange)' : 'var(--red)' }}>
                              {m.qualidade_pct}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })()}
          {/* ── Pendências Operacionais ────────────────────────── */}
          {kpisPendentes && kpisPendentes.total > 0 && (
            <div style={{ marginTop: 24 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text2)', marginBottom: 12 }}>
                Pendências Operacionais
              </h3>
              <div className="dash-indicadores" style={{ marginBottom: 12 }}>
                <CardIndicador classe="dash-indicador-neutro" label="Total Pendentes" valor={kpisPendentes.total ?? 0} />
                <CardIndicador classe={kpisPendentes.acima_3_dias > 0 ? 'dash-indicador-negativo' : 'dash-indicador-neutro'} label="Acima de 3 dias" valor={kpisPendentes.acima_3_dias ?? 0} />
                <CardIndicador classe={kpisPendentes.acima_7_dias > 0 ? 'dash-indicador-negativo' : 'dash-indicador-neutro'} label="Acima de 7 dias" valor={kpisPendentes.acima_7_dias ?? 0} />
              </div>
              <Link to="/pendencias-operacionais" style={{ display:'inline-block', padding:'7px 16px', borderRadius:'var(--radius2)', background:'var(--orange)', color:'#fff', fontSize:13, fontWeight:600, textDecoration:'none' }}>
                Ver Pendências →
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function CardIndicador({ classe, label, valor, pequeno }) {
  return (
    <div className={`dash-indicador-card ${classe}`}>
      <div className="dash-indicador-label">{label}</div>
      <div className="dash-indicador-valor" style={pequeno ? { fontSize: 16 } : undefined}>
        {valor}
      </div>
    </div>
  )
}

function AlertaItem({ contagem, label }) {
  return (
    <div className={`dash-alerta-item${contagem > 0 ? ' tem-alerta' : ''}`}>
      <div className="dash-alerta-contagem">{contagem}</div>
      <div className="dash-alerta-label">{label}</div>
    </div>
  )
}
