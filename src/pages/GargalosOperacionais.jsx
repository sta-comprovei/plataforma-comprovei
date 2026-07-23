import { useCallback, useEffect, useRef, useState } from 'react'
import {
  buscarGargalos,
  buscarKpisSLA,
  buscarAlertasRotas,
  buscarAlertasMotoristas,
  buscarPedidosMaisLentosTransporte,
  buscarPedidosMaisLentosSeparacao,
  buscarCompetencias,
  buscarRankingGargalos,
  buscarEvolucaoMensal,
  buscarCompetenciasSnapshots,
  buscarEvolucaoGargalos,
  buscarPerformanceRotas,
  buscarKpisSLAComTolerancia,
  formatarTempo,
} from '../lib/funilService'
import { useDebouncedValue } from '../lib/useDebouncedValue'
import { useAutoRefresh } from '../lib/useAutoRefresh'
import Button from '../components/ui/Button'
import { IconAlertCircle, IconClock, IconFilter } from '../components/ui/Icons'
import { RankingGargalos, EvolucaoMensal } from '../components/ui/RelatoriosGargalos'
import { EvolucaoGargalos, PerformanceRotas, SLAComTolerancia } from '../components/ui/RelatoriosGerenciais'
import './GargalosOperacionais.css'

// ───────────────────────────────────────────────────────────
// Definição das etapas para tabela (mesma ordem da migration 0009)
// ───────────────────────────────────────────────────────────
const COR_CLASSIFICACAO = {
  vermelho: { bg: '#FEF2F2', cor: '#DC2626', label: 'Gargalo' },
  amarelo:  { bg: '#FFFBEB', cor: '#D97706', label: 'Atenção'  },
  verde:    { bg: '#F0FDF4', cor: '#16A34A', label: 'OK'       },
}

// ───────────────────────────────────────────────────────────
// SUB-COMPONENTE: Tabela de gargalos por etapa
// ───────────────────────────────────────────────────────────
function TabelaGargalos({ dados, carregando }) {
  if (carregando) return <div className="garg-carregando">Calculando tempos…</div>
  if (!dados || dados.length === 0) return (
    <div className="garg-vazio">Nenhum dado de tempo disponível. Importe arquivos ROTINA e COMPROVEI.</div>
  )

  return (
    <div className="garg-tabela-wrap">
      <table className="garg-tabela">
        <thead>
          <tr>
            <th>Etapa</th>
            <th className="text-right">Pedidos</th>
            <th className="text-right">Tempo Médio</th>
            <th className="text-right">Tempo Máximo</th>
            <th>Classificação</th>
          </tr>
        </thead>
        <tbody>
          {dados.map((row) => {
            const cls = COR_CLASSIFICACAO[row.classificacao] ?? COR_CLASSIFICACAO.verde
            return (
              <tr key={row.etapa} style={{ background: row.classificacao === 'vermelho' ? '#FEF2F250' : 'transparent' }}>
                <td className="garg-td-etapa">
                  {row.rank_lentidao === 1 && (
                    <span className="garg-badge-gargalo" title="Etapa mais lenta">⚠</span>
                  )}
                  {row.etapa}
                </td>
                <td className="text-right garg-td-num">{(row.qtd_pedidos ?? 0).toLocaleString('pt-BR')}</td>
                <td className="text-right garg-td-tempo">{formatarTempo(row.media_horas)}</td>
                <td className="text-right garg-td-tempo">{formatarTempo(row.maximo_horas)}</td>
                <td>
                  <span className="garg-badge-cls" style={{ background: cls.bg, color: cls.cor }}>
                    {cls.label}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ───────────────────────────────────────────────────────────
// SUB-COMPONENTE: KPIs de SLA
// ───────────────────────────────────────────────────────────
function CardSLA({ label, valor, cor, sub }) {
  return (
    <div className="garg-card-sla">
      <span className="garg-card-sla-valor" style={{ color: cor }}>{valor ?? '—'}</span>
      <span className="garg-card-sla-label">{label}</span>
      {sub && <span className="garg-card-sla-sub">{sub}</span>}
    </div>
  )
}

function PainelSLA({ kpis, carregando }) {
  if (carregando) return <div className="garg-carregando">Calculando SLA…</div>
  if (!kpis || kpis.total_com_sla === 0) {
    return (
      <div className="garg-vazio">
        Nenhum dado de SLA disponível.
        Cadastre prazos de rota na aba <a href="/prazo-rotas">Prazo de Rotas</a>.
      </div>
    )
  }

  return (
    <div className="garg-sla-cards">
      <CardSLA
        label="Dentro do prazo"
        valor={`${kpis.total_dentro_prazo?.toLocaleString('pt-BR')} (${kpis.pct_dentro_prazo ?? 0}%)`}
        cor="var(--green)"
      />
      <CardSLA
        label="Atrasados"
        valor={`${kpis.total_atrasado?.toLocaleString('pt-BR')} (${kpis.pct_atrasado ?? 0}%)`}
        cor="var(--red)"
        sub={kpis.atraso_medio_dias != null ? `Atraso médio: ${kpis.atraso_medio_dias}d` : null}
      />
      <CardSLA
        label="Sem rota cadastrada"
        valor={(kpis.total_sem_rota_cadastrada ?? 0).toLocaleString('pt-BR')}
        cor="var(--text3)"
        sub="Cadastrar em Prazo de Rotas"
      />
      {kpis.atraso_maximo_dias != null && (
        <CardSLA
          label="Maior atraso"
          valor={`${kpis.atraso_maximo_dias}d`}
          cor="var(--red)"
        />
      )}
    </div>
  )
}

// ───────────────────────────────────────────────────────────
// SUB-COMPONENTE: Alertas
// ───────────────────────────────────────────────────────────
function TabelaAlertasRotas({ dados, carregando }) {
  if (carregando) return <div className="garg-carregando">Carregando…</div>
  if (!dados || dados.length === 0) return <div className="garg-vazio">Nenhum alerta de rota.</div>

  return (
    <div className="garg-tabela-wrap">
      <table className="garg-tabela">
        <thead>
          <tr>
            <th>Rota / Destino</th>
            <th>UF</th>
            <th className="text-right">Pedidos atrasados</th>
            <th className="text-right">Atraso médio</th>
          </tr>
        </thead>
        <tbody>
          {dados.map((r, i) => (
            <tr key={i}>
              <td style={{ fontWeight: 500 }}>{r.entidade}</td>
              <td className="garg-td-cinza">{r.detalhe}</td>
              <td className="text-right garg-td-num">{r.qtd_pedidos}</td>
              <td className="text-right garg-td-tempo" style={{ color: 'var(--red)' }}>
                +{r.valor_dias}d
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TabelaAlertasMotoristas({ dados, carregando }) {
  if (carregando) return <div className="garg-carregando">Carregando…</div>
  if (!dados || dados.length === 0) return <div className="garg-vazio">Nenhum alerta de motorista.</div>

  return (
    <div className="garg-tabela-wrap">
      <table className="garg-tabela">
        <thead>
          <tr>
            <th>Motorista</th>
            <th className="text-right">Atrasos</th>
            <th className="text-right">Atraso médio</th>
          </tr>
        </thead>
        <tbody>
          {dados.map((r, i) => (
            <tr key={i}>
              <td style={{ fontWeight: 500 }}>{r.motorista}</td>
              <td className="text-right garg-td-num">{r.qtd_atrasos}</td>
              <td className="text-right garg-td-tempo" style={{ color: 'var(--red)' }}>
                +{r.atraso_medio_dias}d
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TabelaPedidosLentos({ dados, carregando, campotempo, labelTempo }) {
  if (carregando) return <div className="garg-carregando">Carregando…</div>
  if (!dados || dados.length === 0) return <div className="garg-vazio">Nenhum dado disponível.</div>

  return (
    <div className="garg-tabela-wrap">
      <table className="garg-tabela">
        <thead>
          <tr>
            <th>NUMPED</th>
            <th>Destino</th>
            <th>Motorista</th>
            <th className="text-right">{labelTempo}</th>
          </tr>
        </thead>
        <tbody>
          {dados.map((r) => (
            <tr key={r.numped}>
              <td className="garg-td-mono">{r.numped}</td>
              <td className="garg-td-cinza">{r.cidade_destino ?? '—'}</td>
              <td className="garg-td-cinza" style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.motorista ?? '—'}
              </td>
              <td className="text-right garg-td-tempo" style={{ color: 'var(--amber)' }}>
                {formatarTempo(r[campotempo])}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ───────────────────────────────────────────────────────────
// PÁGINA PRINCIPAL
// ───────────────────────────────────────────────────────────
export default function GargalosOperacionais() {
  const [gargalos, setGargalos]             = useState(null)
  const [kpisSLA, setKpisSLA]               = useState(null)
  const [alertasRotas, setAlertasRotas]     = useState(null)
  const [alertasMot, setAlertasMot]         = useState(null)
  const [lentosTranp, setLentosTranp]       = useState(null)
  const [lentosSep, setLentosSep]           = useState(null)
  const [competencias, setCompetencias]     = useState([])
  // Relatórios (migration 0010)
  const [ranking, setRanking]               = useState(null)
  const [evolucao, setEvolucao]             = useState(null)
  const [compSnaps, setCompSnaps]           = useState([])
  const [compEvol, setCompEvol]             = useState([])  // filtro de competências na evolução
  // Gerencial (migration 0012)
  const [evolGargalos, setEvolGargalos]     = useState(null)
  const [perfRotas, setPerfRotas]           = useState(null)
  const [kpisSLATol, setKpisSLATol]         = useState(null)

  const [competencia, setCompetencia]     = useState('')
  const [motoristaBusca, setMotoristaBusca] = useState('')
  const [cidadeBusca, setCidadeBusca]     = useState('')
  const [filtrosAbertos, setFiltrosAbertos] = useState(false)
  const [abaAtiva, setAbaAtiva]           = useState('gargalos')

  const [carregando, setCarregando]   = useState(true)
  const [erro, setErro]               = useState('')

  const motoristaDeb = useDebouncedValue(motoristaBusca, 400)
  const cidadeDeb    = useDebouncedValue(cidadeBusca, 400)

  // Proteção de race condition — dois refs independentes
  const refGarg = useRef('')
  const refSLA  = useRef('')

  const filtros = { competencia: competencia || undefined, motorista: motoristaDeb || undefined, cidade: cidadeDeb || undefined }

  const carregarTudo = useCallback(async () => {
    const assinatura = JSON.stringify(filtros)
    refGarg.current = assinatura
    refSLA.current  = assinatura
    setCarregando(true)
    setErro('')

    const [resGarg, resSLA, resAlertR, resAlertM, resLT, resLS, resComp,
           resRanking, resEvol, resCompSnaps,
           resEvolGarg, resPerfRotas, resKpisSLATol] = await Promise.all([
      buscarGargalos(filtros),
      buscarKpisSLA(filtros),
      buscarAlertasRotas(),
      buscarAlertasMotoristas(10),
      buscarPedidosMaisLentosTransporte(10),
      buscarPedidosMaisLentosSeparacao(10),
      buscarCompetencias(),
      buscarRankingGargalos({ competencia: competencia || undefined }),
      buscarEvolucaoMensal({}),
      buscarCompetenciasSnapshots(),
      buscarEvolucaoGargalos({}),
      buscarPerformanceRotas({ competencia: competencia || undefined }),
      buscarKpisSLAComTolerancia({ competencia: competencia || undefined }),
    ])

    if (refGarg.current !== assinatura) return

    if (resGarg.erro) setErro(resGarg.erro)
    else setGargalos(resGarg.dados)

    setKpisSLA(resSLA.dados)
    setAlertasRotas(resAlertR.dados)
    setAlertasMot(resAlertM.dados)
    setLentosTranp(resLT.dados)
    setLentosSep(resLS.dados)
    setCompetencias(resComp.dados ?? [])
    setRanking(resRanking.dados)
    setEvolucao(resEvol.dados)
    setCompSnaps(resCompSnaps.dados ?? [])
    setEvolGargalos(resEvolGarg.dados)
    setPerfRotas(resPerfRotas.dados)
    setKpisSLATol(resKpisSLATol.dados)
    setCarregando(false)
  }, [competencia, motoristaDeb, cidadeDeb]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { carregarTudo() }, [carregarTudo])
  useAutoRefresh(carregarTudo, 120000)

  function limparFiltros() {
    setCompetencia('')
    setMotoristaBusca('')
    setCidadeBusca('')
  }

  const temFiltro = competencia || motoristaBusca || cidadeBusca
  const ABAS = [
    { key: 'gargalos',  label: 'Gargalos por Etapa'  },
    { key: 'sla',       label: 'SLA de Entrega'       },
    { key: 'alertas',   label: 'Alertas'              },
    { key: 'ranking',   label: 'Ranking de Gargalos'  },
    { key: 'evolucao',  label: 'Evolução Mensal'       },
    { key: 'gerencial', label: '📊 Gerencial'          },
  ]

  function toggleCompetenciaEvol(c) {
    setCompEvol(prev =>
      prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]
    )
  }

  return (
    <div className="garg-page">

      {/* Cabeçalho */}
      <div className="garg-header">
        <div className="garg-header-left">
          <div className="garg-header-icon">
            <IconClock width={22} height={22} />
          </div>
          <div>
            <h2 className="garg-titulo">Gargalos Operacionais</h2>
            <p className="garg-desc">Análise de tempos por etapa, SLA e alertas automáticos</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a href="/funil" className="garg-link-funil">← Funil</a>
          <Button variant="secondary" size="sm" onClick={carregarTudo}>Atualizar</Button>
        </div>
      </div>

      {/* Erro */}
      {erro && (
        <div className="garg-erro">
          <IconAlertCircle width={16} height={16} />
          {erro}
        </div>
      )}

      {/* Filtros */}
      <div className="garg-filtros-card">
        <button type="button" className="garg-filtros-toggle" onClick={() => setFiltrosAbertos(p => !p)}>
          <IconFilter width={15} height={15} />
          Filtros
          {temFiltro && <span className="garg-filtros-badge">ativo</span>}
          <span className="garg-filtros-chevron">{filtrosAbertos ? '▲' : '▼'}</span>
        </button>
        {filtrosAbertos && (
          <div className="garg-filtros-corpo">
            <div className="garg-filtro-grupo">
              <label className="garg-filtro-label">Competência</label>
              <select
                value={competencia}
                onChange={e => setCompetencia(e.target.value)}
                className="garg-filtro-select"
              >
                <option value="">Todas</option>
                {competencias.map(c => (
                  <option key={c} value={c}>
                    {/* Formatar YYYY-MM para MM/YYYY */}
                    {c.slice(5)}/{c.slice(0,4)}
                  </option>
                ))}
              </select>
            </div>
            <div className="garg-filtro-grupo">
              <label className="garg-filtro-label">Motorista</label>
              <input type="search" placeholder="Buscar…" value={motoristaBusca}
                onChange={e => setMotoristaBusca(e.target.value)} className="garg-filtro-input" />
            </div>
            <div className="garg-filtro-grupo">
              <label className="garg-filtro-label">Cidade / Rota</label>
              <input type="search" placeholder="Buscar…" value={cidadeBusca}
                onChange={e => setCidadeBusca(e.target.value)} className="garg-filtro-input" />
            </div>
            {temFiltro && (
              <div className="garg-filtro-grupo" style={{ justifyContent: 'flex-end' }}>
                <Button variant="ghost" size="sm" onClick={limparFiltros}>Limpar</Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Abas */}
      <div className="garg-abas">
        {ABAS.map(a => (
          <button
            key={a.key}
            type="button"
            className={`garg-aba${abaAtiva === a.key ? ' ativa' : ''}`}
            onClick={() => setAbaAtiva(a.key)}
          >
            {a.label}
          </button>
        ))}
      </div>

      {/* Conteúdo por aba */}
      {abaAtiva === 'gargalos' && (
        <div className="garg-card">
          <div className="garg-card-header">
            <span className="garg-card-titulo">Tempo por Etapa do Funil</span>
            <span className="garg-card-hint">Vermelho = gargalo principal · Amarelo = atenção · Verde = OK</span>
          </div>
          <TabelaGargalos dados={gargalos} carregando={carregando} />
          <div className="garg-nota">
            Tempos calculados a partir das datas reais: DATA, DATAFATURAMENTO, DTWMS,
            DATAINICIOOS, DATAFIMSEPARACAO, DATAINICIOCONFERENCIA, DATAFIMCONFERENCIA (ROTINA)
            e Data da rota, Data Finalização (COMPROVEI). Apenas pedidos com ambas as datas
            preenchidas são incluídos em cada intervalo.
          </div>
        </div>
      )}

      {abaAtiva === 'sla' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="garg-card">
            <div className="garg-card-header">
              <span className="garg-card-titulo">SLA de Entrega</span>
              <a href="/prazo-rotas" className="garg-link-funil">Gerenciar prazos →</a>
            </div>
            <PainelSLA kpis={kpisSLA} carregando={carregando} />
          </div>
        </div>
      )}

      {abaAtiva === 'alertas' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="garg-card">
            <div className="garg-card-header">
              <span className="garg-card-titulo">Rotas com maior atraso</span>
            </div>
            <TabelaAlertasRotas dados={alertasRotas} carregando={carregando} />
          </div>
          <div className="garg-card">
            <div className="garg-card-header">
              <span className="garg-card-titulo">Motoristas com maior atraso</span>
            </div>
            <TabelaAlertasMotoristas dados={alertasMot} carregando={carregando} />
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div className="garg-card" style={{ flex: '1 1 300px' }}>
              <div className="garg-card-header">
                <span className="garg-card-titulo">Pedidos com maior tempo em transporte</span>
              </div>
              <TabelaPedidosLentos dados={lentosTranp} carregando={carregando}
                campotempo="h_transporte" labelTempo="Tempo" />
            </div>
            <div className="garg-card" style={{ flex: '1 1 300px' }}>
              <div className="garg-card-header">
                <span className="garg-card-titulo">Pedidos com maior tempo em separação</span>
              </div>
              <TabelaPedidosLentos dados={lentosSep} carregando={carregando}
                campotempo="h_separacao" labelTempo="Tempo" />
            </div>
          </div>
        </div>
      )}

      {abaAtiva === 'ranking' && (
        <div className="garg-card">
          <div className="garg-card-header">
            <span className="garg-card-titulo">Ranking de Gargalos</span>
            <span className="garg-card-hint">
              Todas as etapas · maior para menor · campos fonte rastreáveis
            </span>
          </div>
          <RankingGargalos
            dados={ranking}
            carregando={carregando}
            competencia={competencia || null}
          />
        </div>
      )}

      {abaAtiva === 'evolucao' && (
        <div className="garg-card">
          <div className="garg-card-header">
            <span className="garg-card-titulo">Evolução Mensal</span>
            <span className="garg-card-hint">
              Comparação entre competências · cores relativas ao pior mês
            </span>
          </div>
          <EvolucaoMensal
            dados={compEvol.length > 0
              ? (evolucao ?? []).filter(r => compEvol.includes(r.competencia))
              : evolucao}
            carregando={carregando}
            competenciasSelecionadas={compEvol}
            todasCompetencias={compSnaps}
            onToggleCompetencia={toggleCompetenciaEvol}
          />
        </div>
      )}

      {abaAtiva === 'gerencial' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* SLA com Tolerância */}
          <div className="garg-card">
            <div className="garg-card-header">
              <span className="garg-card-titulo">SLA com Tolerância</span>
              <span className="garg-card-hint">Verde · Amarelo (faixa) · Vermelho (acima do limite)</span>
            </div>
            <SLAComTolerancia kpis={kpisSLATol} carregando={carregando} />
          </div>

          {/* Evolução de Gargalos */}
          <div className="garg-card">
            <div className="garg-card-header">
              <span className="garg-card-titulo">Evolução dos Gargalos por Competência</span>
              <span className="garg-card-hint">
                Fonte: snapshots · variação % em relação ao mês anterior
              </span>
            </div>
            <EvolucaoGargalos dados={evolGargalos} carregando={carregando} />
          </div>

          {/* Performance de Rotas */}
          <div className="garg-card">
            <div className="garg-card-header">
              <span className="garg-card-titulo">Performance das Rotas</span>
              <span className="garg-card-hint">Ranking: pior → melhor · com tolerância configurada</span>
            </div>
            <PerformanceRotas dados={perfRotas} carregando={carregando} />
          </div>
        </div>
      )}
    </div>
  )
}
