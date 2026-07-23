import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  listarMotoristasComHistorico,
  buscarEvolucaoMotorista,
  listarCompetencias,
} from '../lib/evolucaoMotoristasService'
import LineChart from '../components/ui/LineChart'
import {
  IconSearch,
  IconAlertCircle,
  IconBarChart,
} from '../components/ui/Icons'
import './EvolucaoMotoristas.css'

// Indicadores reais do arquivo Comprovei — todos os campos disponíveis
const INDICADORES = [
  { id: 'qualidade_pct',     label: 'Qualidade (%)',               cor: '#F59E0B' },
  { id: 'inicio_cerca_pct',  label: 'Início Dentro da Cerca (%)',  cor: '#06B6D4' },
  { id: 'chegada_cerca_pct', label: 'Chegada Dentro da Cerca (%)', cor: '#10B981' },
  { id: 'ocorrencia_pct',    label: 'Ocorrência Apontada (%)',     cor: '#EF4444' },
  { id: 'intervalo_pct',     label: 'Intervalo Compatível (%)',    cor: '#8B5CF6' },
  { id: 'apontamento_pct',   label: 'Apontamento na Cerca (%)',    cor: '#F97316' },
  { id: 'rotas_qtd',         label: 'Rotas (qtd)',                 cor: '#3B82F6' },
  { id: 'documentos_qtd',    label: 'Documentos (qtd)',            cor: '#84CC16' },
]

function fmtComp(c) {
  if (!c) return '—'
  const [a, m] = c.split('-')
  const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${meses[+m - 1]}/${a.slice(2)}`
}

function fmtVal(v, id) {
  if (v == null) return '—'
  return id.endsWith('_pct') || id === 'qualidade_pct' ? `${v}%` : String(v)
}

function corQual(v) {
  if (v == null) return ''
  if (v >= 95) return 'evm-verde'
  if (v >= 80) return 'evm-amarelo'
  return 'evm-vermelho'
}

export default function EvolucaoMotoristas() {
  const [motoristas, setMotoristas]   = useState([])
  const [competencias, setCompetencias] = useState([])
  const [selecionado, setSelecionado] = useState(null) // { nome_normalizado, nome_motorista }
  const [busca, setBusca]             = useState('')
  const [compIni, setCompIni]         = useState('')
  const [compFim, setCompFim]         = useState('')
  const [indicadorId, setIndicId]     = useState(INDICADORES[0].id)

  const [historico, setHistorico]     = useState([])
  const [carregando, setCarreg]       = useState(false)
  const [carregLista, setCarregLista] = useState(true)
  const [erro, setErro]               = useState('')

  // Carregar lista e competências ao montar
  useEffect(() => {
    Promise.all([listarMotoristasComHistorico(), listarCompetencias()]).then(([rM, rC]) => {
      setCarregLista(false)
      if (!rM.erro) setMotoristas(rM.dados)
      if (!rC.erro && rC.dados.length) {
        setCompetencias(rC.dados)
        setCompFim(rC.dados[0].competencia)
        setCompIni(rC.dados[Math.min(11, rC.dados.length - 1)].competencia)
      }
    })
  }, [])

  // Carregar histórico quando motorista ou filtros mudarem
  const carregar = useCallback(async () => {
    if (!selecionado) { setHistorico([]); return }
    setCarreg(true); setErro('')
    const { dados, erro: e } = await buscarEvolucaoMotorista(selecionado.nome_normalizado, compIni || null, compFim || null)
    setCarreg(false)
    if (e) { setErro(e); return }
    setHistorico(dados)
  }, [selecionado, compIni, compFim])

  useEffect(() => { carregar() }, [carregar])

  const motoristasFiltrados = useMemo(() => {
    const t = busca.toLowerCase()
    return motoristas.filter(m => m.nome_motorista.toLowerCase().includes(t))
  }, [motoristas, busca])

  const indicador = INDICADORES.find(i => i.id === indicadorId)

  const dadosGrafico = useMemo(() => ({
    labels: historico.map(h => fmtComp(h.competencia)),
    series: [{
      nome: indicador?.label || '',
      cor: indicador?.cor || '#F59E0B',
      valores: historico.map(h => h[indicadorId] ?? null),
    }],
  }), [historico, indicadorId, indicador])

  const ult = historico[historico.length - 1]
  const pen = historico[historico.length - 2]

  return (
    <div className="evm-container">
      <div className="evm-header">
        <h2 className="evm-titulo">Evolução dos Motoristas</h2>
        <p className="evm-sub">Histórico de desempenho individual por competência — Relatório Gerencial Comprovei.</p>
      </div>

      <div className="evm-layout">
        {/* Seletor lateral */}
        <aside className="evm-sidebar">
          <div className="evm-busca-wrap">
            <IconSearch className="evm-busca-icon" />
            <input
              className="evm-busca-input"
              type="text"
              placeholder="Buscar motorista..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
            />
          </div>
          <div className="evm-lista">
            {carregLista && <div className="evm-lista-empty">Carregando...</div>}
            {!carregLista && motoristasFiltrados.length === 0 && (
              <div className="evm-lista-empty">
                {motoristas.length === 0
                  ? 'Nenhum histórico. Importe o relatório "Desempenho de Motoristas" na tela de Importações.'
                  : 'Nenhum motorista encontrado.'}
              </div>
            )}
            {motoristasFiltrados.map(m => (
              <button
                key={m.nome_normalizado}
                className={`evm-item${selecionado?.nome_normalizado === m.nome_normalizado ? ' ativo' : ''}`}
                onClick={() => setSelecionado(m)}
              >
                {m.nome_motorista}
              </button>
            ))}
          </div>
        </aside>

        {/* Conteúdo principal */}
        <main className="evm-main">
          {!selecionado && (
            <div className="evm-vazio">
              <IconBarChart className="evm-vazio-icon" />
              <p>Selecione um motorista para ver a evolução histórica de desempenho.</p>
            </div>
          )}

          {selecionado && (
            <>
              {/* Filtros de período */}
              <div className="evm-filtros">
                <div className="evm-filtro-campo">
                  <label>De</label>
                  <select value={compIni} onChange={e => setCompIni(e.target.value)}>
                    <option value="">Início</option>
                    {competencias.map(c => (
                      <option key={c.competencia} value={c.competencia}>{fmtComp(c.competencia)}</option>
                    ))}
                  </select>
                </div>
                <div className="evm-filtro-campo">
                  <label>Até</label>
                  <select value={compFim} onChange={e => setCompFim(e.target.value)}>
                    <option value="">Fim</option>
                    {competencias.map(c => (
                      <option key={c.competencia} value={c.competencia}>{fmtComp(c.competencia)}</option>
                    ))}
                  </select>
                </div>
              </div>

              {erro && (
                <div className="evm-erro">
                  <IconAlertCircle width={14} height={14} /> {erro}
                </div>
              )}

              {carregando && <div className="evm-loading">Carregando histórico...</div>}

              {!carregando && !erro && historico.length === 0 && (
                <div className="evm-vazio">
                  <p>Sem dados para {selecionado.nome_motorista} no período selecionado.</p>
                </div>
              )}

              {!carregando && historico.length > 0 && (
                <>
                  {/* KPIs do último período */}
                  <div className="evm-kpis">
                    {INDICADORES.slice(0, 6).map(ind => (
                      <div key={ind.id} className="evm-kpi-card" style={{ borderTopColor: ind.cor }}>
                        <div className="evm-kpi-label">{ind.label.replace(' (%)', '').replace(' (qtd)', '')}</div>
                        <div className="evm-kpi-valor">{fmtVal(ult?.[ind.id], ind.id)}</div>
                        {ind.id === 'qualidade_pct' && pen?.qualidade_pct != null && ult?.qualidade_pct != null && (
                          <div className="evm-kpi-delta" style={{
                            color: ult.qualidade_pct >= pen.qualidade_pct ? 'var(--green)' : 'var(--red)',
                          }}>
                            {ult.qualidade_pct >= pen.qualidade_pct ? '▲' : '▼'}
                            {' '}{Math.abs(Math.round((ult.qualidade_pct - pen.qualidade_pct) * 100) / 100)}%
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Seletor de indicador */}
                  <div className="evm-tabs">
                    {INDICADORES.map(ind => (
                      <button
                        key={ind.id}
                        className={`evm-tab${indicadorId === ind.id ? ' ativo' : ''}`}
                        style={indicadorId === ind.id ? { borderBottomColor: ind.cor, color: ind.cor } : {}}
                        onClick={() => setIndicId(ind.id)}
                      >
                        {ind.label}
                      </button>
                    ))}
                  </div>

                  {/* Gráfico */}
                  <div className="evm-grafico-card">
                    <h3 className="evm-grafico-titulo">
                      {indicador?.label} — {selecionado.nome_motorista}
                    </h3>
                    <LineChart
                      labels={dadosGrafico.labels}
                      series={dadosGrafico.series}
                      formatarValor={v => `${v}${indicador?.id.endsWith('_pct') ? '%' : ''}`}
                      altura={220}
                    />
                  </div>

                  {/* Tabela detalhada */}
                  <div className="evm-tabela-card">
                    <h3 className="evm-grafico-titulo">Detalhamento por período</h3>
                    <div className="evm-tabela-wrap">
                      <table className="evm-tabela">
                        <thead>
                          <tr>
                            <th>Período</th>
                            <th>Qualidade</th>
                            <th>Rotas</th>
                            <th>Docs</th>
                            <th>Início Cerca</th>
                            <th>Chegada Cerca</th>
                            <th>Ocorrência</th>
                            <th>Intervalo</th>
                            <th>Apontamento</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...historico].reverse().map((h, i) => (
                            <tr key={i}>
                              <td className="evm-td-periodo">{fmtComp(h.competencia)}</td>
                              <td className={corQual(h.qualidade_pct)}>
                                {h.qualidade_pct != null ? `${h.qualidade_pct}%` : '—'}
                              </td>
                              <td>{h.rotas_qtd ?? '—'}</td>
                              <td>{h.documentos_qtd ?? '—'}</td>
                              <td>{h.inicio_cerca_pct != null ? `${h.inicio_cerca_pct}%` : '—'}</td>
                              <td>{h.chegada_cerca_pct != null ? `${h.chegada_cerca_pct}%` : '—'}</td>
                              <td>{h.ocorrencia_pct != null ? `${h.ocorrencia_pct}%` : '—'}</td>
                              <td>{h.intervalo_pct != null ? `${h.intervalo_pct}%` : '—'}</td>
                              <td>{h.apontamento_pct != null ? `${h.apontamento_pct}%` : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  )
}
