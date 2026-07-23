import { useCallback, useEffect, useRef, useState } from 'react'
import {
  buscarKpisFunil,
  buscarPedidosConsolidados,
  buscarTotaisImportados,
} from '../lib/funilService'
import { useDebouncedValue } from '../lib/useDebouncedValue'
import { useAutoRefresh } from '../lib/useAutoRefresh'
import Pagination from '../components/ui/Pagination'
import Button from '../components/ui/Button'
import {
  IconFunnel,
  IconAlertCircle,
  IconFilter,
  IconBarChart,
} from '../components/ui/Icons'
import './FunilOperacional.css'

// ───────────────────────────────────────────────────────────
// DEFINIÇÃO DAS ETAPAS DO FUNIL
// Baseado na análise real dos arquivos e nas decisões aprovadas
// ───────────────────────────────────────────────────────────
const ETAPAS = [
  { key: 'Aguardando Faturamento', label: 'Aguardando Faturamento', kpi: 'total_aguardando_fat',  cor: '#94a3b8', fonte: 'ROTINA (POSICAO=M)' },
  { key: 'Faturado',               label: 'Faturado',               kpi: 'total_faturado',         cor: '#6366f1', fonte: 'ROTINA' },
  { key: 'Em Separação',           label: 'Em Separação',           kpi: 'total_em_separacao',     cor: '#0ea5e9', fonte: 'ROTINA' },
  { key: 'Separado',               label: 'Separado',               kpi: 'total_separado',         cor: '#14b8a6', fonte: 'ROTINA' },
  { key: 'Em Conferência',         label: 'Em Conferência',         kpi: 'total_em_conferencia',   cor: '#f59e0b', fonte: 'ROTINA' },
  { key: 'Conferido',              label: 'Conferido',              kpi: 'total_conferido',        cor: '#8b5cf6', fonte: 'ROTINA' },
  { key: 'Em Transporte',          label: 'Em Transporte',          kpi: 'total_em_transporte',    cor: '#f97316', fonte: 'ROTINA+COMPROVEI' },
  { key: 'Entregue',               label: 'Entregue',               kpi: 'total_entregue',         cor: '#16a34a', fonte: 'COMPROVEI' },
]

const POR_PAGINA = 50

// ───────────────────────────────────────────────────────────
// SUB-COMPONENTE: Funil em SVG nativo
// Sem dependência de biblioteca de gráficos (mesma filosofia das Etapas 4-7)
// ───────────────────────────────────────────────────────────
function FunilSVG({ kpis, etapaAtiva, onEtapaClick }) {
  if (!kpis) return null

  const total = Math.max(kpis.total_pedidos || 0, 1)
  const LABEL_W = 180
  const BAR_MAX = 380
  const BLOCO_H = 46
  const GAP = 4
  const SVG_W = 660
  const SVG_H = ETAPAS.length * (BLOCO_H + GAP) + 44

  return (
    <div className="funil-svg-wrap">
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        aria-label="Funil Operacional — clique em uma etapa para filtrar"
        className="funil-svg"
      >
        {ETAPAS.map((etapa, i) => {
          const val = kpis[etapa.kpi] ?? 0
          const pct = val / total
          const barW = Math.max(pct * BAR_MAX, val > 0 ? 6 : 0)
          const y = i * (BLOCO_H + GAP)
          const ativo = etapaAtiva === etapa.key

          // Taxa de conversão em relação à etapa anterior
          const valAnterior = i > 0 ? (kpis[ETAPAS[i - 1].kpi] ?? 0) : null
          const conv = valAnterior && valAnterior > 0
            ? Math.round(val / valAnterior * 100)
            : null

          return (
            <g
              key={etapa.key}
              onClick={() => onEtapaClick(etapa.key)}
              style={{ cursor: 'pointer' }}
              role="button"
              aria-label={`${etapa.label}: ${val.toLocaleString('pt-BR')} pedidos`}
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && onEtapaClick(etapa.key)}
            >
              {/* Fundo de hover */}
              <rect
                x={0} y={y}
                width={SVG_W} height={BLOCO_H}
                rx={4}
                fill={ativo ? `${etapa.cor}18` : 'transparent'}
              />

              {/* Label da etapa */}
              <text
                x={LABEL_W - 10}
                y={y + BLOCO_H / 2 + 5}
                textAnchor="end"
                fontSize={12}
                fontWeight={ativo ? 700 : 500}
                fill={ativo ? etapa.cor : '#444444'}
                fontFamily="'Segoe UI', system-ui, sans-serif"
              >
                {etapa.label}
              </text>

              {/* Barra */}
              <rect
                x={LABEL_W}
                y={y + 8}
                width={barW}
                height={BLOCO_H - 16}
                rx={4}
                fill={etapa.cor}
                opacity={ativo ? 1 : 0.80}
              />

              {/* Valor dentro da barra */}
              {barW > 44 && (
                <text
                  x={LABEL_W + barW / 2}
                  y={y + BLOCO_H / 2 + 5}
                  textAnchor="middle"
                  fontSize={13}
                  fontWeight={700}
                  fill="#fff"
                  fontFamily="'Segoe UI', system-ui, sans-serif"
                >
                  {val.toLocaleString('pt-BR')}
                </text>
              )}

              {/* % e conversão à direita */}
              <text
                x={LABEL_W + BAR_MAX + 12}
                y={y + BLOCO_H / 2 + 1}
                textAnchor="start"
                fontSize={12}
                fill="#888888"
                fontFamily="'Segoe UI', system-ui, sans-serif"
              >
                {(pct * 100).toFixed(1)}%
              </text>
              {conv !== null && (
                <text
                  x={LABEL_W + BAR_MAX + 12}
                  y={y + BLOCO_H / 2 + 14}
                  textAnchor="start"
                  fontSize={10}
                  fill={conv < 85 ? '#dc2626' : '#bbbbbb'}
                  fontFamily="'Segoe UI', system-ui, sans-serif"
                >
                  conv. {conv}%
                </text>
              )}
            </g>
          )
        })}

        {/* Legenda rodapé */}
        <text
          x={SVG_W / 2}
          y={SVG_H - 6}
          textAnchor="middle"
          fontSize={11}
          fill="#bbbbbb"
          fontFamily="'Segoe UI', system-ui, sans-serif"
        >
          {(kpis.total_pedidos ?? 0).toLocaleString('pt-BR')} pedidos únicos
          {' · '}ROTINA: {(kpis.total_rotina ?? 0).toLocaleString('pt-BR')}
          {' · '}COMPROVEI: {(kpis.total_comprovei ?? 0).toLocaleString('pt-BR')}
        </text>
      </svg>
    </div>
  )
}

// ───────────────────────────────────────────────────────────
// SUB-COMPONENTE: Card de KPI de origem
// ───────────────────────────────────────────────────────────
function CardOrigem({ label, valor, cor, ativo, onClick }) {
  return (
    <button
      type="button"
      className={`funil-card-origem${ativo ? ' ativo' : ''}`}
      style={{ '--card-cor': cor }}
      onClick={onClick}
    >
      <span className="funil-card-valor" style={{ color: cor }}>
        {(valor ?? 0).toLocaleString('pt-BR')}
      </span>
      <span className="funil-card-label">{label}</span>
    </button>
  )
}

// ───────────────────────────────────────────────────────────
// SUB-COMPONENTE: Tabela de pedidos consolidados
// ───────────────────────────────────────────────────────────
const COR_STATUS = {
  Entregue: '#16a34a',
  'Em Rota': '#2563eb',
  'A caminho': '#2563eb',
  Chegou: '#2563eb',
  Abortada: '#dc2626',
  Devolvido: '#dc2626',
}

function corStatus(s) {
  return COR_STATUS[s] ?? '#888888'
}

function corEtapa(e) {
  return ETAPAS.find((x) => x.key === e)?.cor ?? '#888888'
}

function fmtData(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function TabelaPedidos({ pedidos, total, pagina, onMudarPagina, carregando }) {
  if (carregando) {
    return <div className="funil-tabela-loading">Carregando pedidos…</div>
  }

  if (pedidos.length === 0) {
    return (
      <div className="funil-tabela-vazio">
        <IconBarChart width={32} height={32} style={{ color: 'var(--text4)' }} />
        <p>Nenhum pedido encontrado para este filtro.</p>
      </div>
    )
  }

  return (
    <>
      <div className="funil-tabela-wrap">
        <table className="funil-tabela">
          <thead>
            <tr>
              <th>NUMPED</th>
              <th>NF</th>
              <th>Etapa</th>
              <th>Origem</th>
              <th>Pedido em</th>
              <th>Faturamento</th>
              <th>Expedição</th>
              <th>Entrega</th>
              <th>Status</th>
              <th>Motorista</th>
              <th>Reentregas</th>
            </tr>
          </thead>
          <tbody>
            {pedidos.map((p) => (
              <tr key={p.numped}>
                <td className="funil-td-mono">
                  {p.numped}
                  {p.divergencia_nf && (
                    <span className="funil-badge-divnf" title="Divergência de NF entre ROTINA e COMPROVEI">⚠</span>
                  )}
                </td>
                <td className="funil-td-mono funil-td-cinza">
                  {p.numnota || p.numnot_comprovei || '—'}
                </td>
                <td>
                  {p.etapa_atual ? (
                    <span className="funil-badge-etapa" style={{ background: corEtapa(p.etapa_atual) }}>
                      {p.etapa_atual}
                    </span>
                  ) : '—'}
                </td>
                <td>
                  <span className={`funil-badge-origem funil-origem-${p.origem}`}>
                    {p.origem === 'ambos' ? 'Ambos' : p.origem === 'apenas_rotina' ? 'Rotina' : 'Comprovei'}
                  </span>
                </td>
                <td className="funil-td-cinza">{fmtData(p.data_pedido)}</td>
                <td className="funil-td-cinza">{fmtData(p.datafaturamento)}</td>
                <td className="funil-td-cinza">{fmtData(p.dtwms)}</td>
                <td className="funil-td-cinza">{fmtData(p.data_finalizacao)}</td>
                <td>
                  {p.status_entrega ? (
                    <span style={{ color: corStatus(p.status_entrega), fontWeight: 500, fontSize: 12 }}>
                      {p.status_entrega}
                    </span>
                  ) : '—'}
                </td>
                <td className="funil-td-motorista">{p.motorista ?? '—'}</td>
                <td style={{ textAlign: 'center' }}>
                  {p.qtd_reentregas > 0 ? (
                    <span style={{ color: '#dc2626', fontWeight: 700 }}>{p.qtd_reentregas}</span>
                  ) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination pagina={pagina} porPagina={POR_PAGINA} total={total} onMudarPagina={onMudarPagina} />
    </>
  )
}

// ───────────────────────────────────────────────────────────
// PÁGINA PRINCIPAL
// Padrão de race condition: requisicaoEmVooRef (mesmo padrão de Dashboard.jsx)
// ───────────────────────────────────────────────────────────
export default function FunilOperacional() {
  const [kpis, setKpis]           = useState(null)
  const [totais, setTotais]       = useState(null)
  const [pedidos, setPedidos]     = useState([])
  const [total, setTotal]         = useState(0)
  const [pagina, setPagina]       = useState(1)

  // Filtros
  const [etapaAtiva, setEtapaAtiva]         = useState(null)
  const [origemAtiva, setOrigemAtiva]       = useState(null)
  const [statusFiltro, setStatusFiltro]     = useState('')
  const [motoristaBusca, setMotoristaBusca] = useState('')
  const [dataInicio, setDataInicio]         = useState('')
  const [dataFim, setDataFim]               = useState('')
  const [divergenciaNF, setDivergenciaNF]   = useState(false)
  const [filtrosAbertos, setFiltrosAbertos] = useState(false)

  const [carregandoKpis, setCarregandoKpis]     = useState(true)
  const [carregandoTabela, setCarregandoTabela] = useState(false)
  const [erroKpis, setErroKpis]                 = useState('')
  const [erroTabela, setErroTabela]             = useState('')

  const motoristaDebounced = useDebouncedValue(motoristaBusca, 400)

  // Proteção de race condition — mesmo padrão de Dashboard.jsx
  const requisicaoKpisRef   = useRef('')
  const requisicaoTabelaRef = useRef('')

  // ── Carregar KPIs ───────────────────────────────────────────────────────────
  const carregarKpis = useCallback(async () => {
    const assinatura = 'kpis'
    requisicaoKpisRef.current = assinatura
    setCarregandoKpis(true)
    setErroKpis('')

    const [resKpis, resTotais] = await Promise.all([
      buscarKpisFunil(),
      buscarTotaisImportados(),
    ])

    if (requisicaoKpisRef.current !== assinatura) return

    if (resKpis.erro) {
      setErroKpis(resKpis.erro)
    } else {
      setKpis(resKpis.dados)
    }
    setTotais(resTotais)
    setCarregandoKpis(false)
  }, [])

  useEffect(() => { carregarKpis() }, [carregarKpis])
  useAutoRefresh(carregarKpis, 120000)

  // ── Carregar tabela ao mudar filtros/página ────────────────────────
  useEffect(() => {
    const assinatura = [
      pagina, etapaAtiva, origemAtiva, statusFiltro,
      motoristaDebounced, dataInicio, dataFim, divergenciaNF,
    ].join('::')

    requisicaoTabelaRef.current = assinatura
    setCarregandoTabela(true)
    setErroTabela('')

    buscarPedidosConsolidados({
      etapa_atual:    etapaAtiva   || undefined,
      origem:         origemAtiva  || undefined,
      status_entrega: statusFiltro || undefined,
      motorista:      motoristaDebounced || undefined,
      data_inicio:    dataInicio   || undefined,
      data_fim:       dataFim      || undefined,
      divergencia_nf: divergenciaNF || undefined,
      pagina,
      porPagina: POR_PAGINA,
    }).then(({ dados, total: t, erro }) => {
      if (requisicaoTabelaRef.current !== assinatura) return
      if (erro) {
        setErroTabela(erro)
        setPedidos([])
        setTotal(0)
      } else {
        setPedidos(dados)
        setTotal(t)
      }
      setCarregandoTabela(false)
    })
  }, [pagina, etapaAtiva, origemAtiva, statusFiltro, motoristaDebounced, dataInicio, dataFim, divergenciaNF])

  // ── Handlers de filtro ───────────────────────────────────────────────────
  function toggleEtapa(key) {
    setEtapaAtiva((prev) => (prev === key ? null : key))
    setPagina(1)
  }

  function toggleOrigem(key) {
    setOrigemAtiva((prev) => (prev === key ? null : key))
    setPagina(1)
  }

  function limparFiltros() {
    setEtapaAtiva(null)
    setOrigemAtiva(null)
    setStatusFiltro('')
    setMotoristaBusca('')
    setDataInicio('')
    setDataFim('')
    setDivergenciaNF(false)
    setPagina(1)
  }

  const temFiltroAtivo = etapaAtiva || origemAtiva || statusFiltro || motoristaBusca || dataInicio || dataFim || divergenciaNF
  const semDados = !carregandoKpis && !erroKpis && (!kpis || (kpis.total_pedidos ?? 0) === 0)

  // ───────────────────────────────────────────────────────
  // RENDER
  // ───────────────────────────────────────────────────────
  return (
    <div className="funil-page">

      {/* Cabeçalho */}
      <div className="funil-header">
        <div className="funil-header-left">
          <div className="funil-header-icon">
            <IconFunnel width={22} height={22} />
          </div>
          <div>
            <h2 className="funil-titulo">Funil Operacional</h2>
            <p className="funil-descricao">
              Rastreamento ponta a ponta: Pedido → Entrega
            </p>
            {totais && (
              <p className="funil-totais-importados">
                ROTINA: {totais.total_rotina.toLocaleString('pt-BR')} registros
                {' · '}
                COMPROVEI: {totais.total_comprovei.toLocaleString('pt-BR')} registros
              </p>
            )}
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={carregarKpis}>
          Atualizar
        </Button>
      </div>

      {/* Erro de KPIs */}
      {erroKpis && (
        <div className="funil-erro">
          <IconAlertCircle width={16} height={16} />
          {erroKpis}
        </div>
      )}

      {/* Carregando KPIs */}
      {carregandoKpis && (
        <div className="funil-carregando">Carregando funil…</div>
      )}

      {/* Estado vazio */}
      {semDados && (
        <div className="funil-vazio">
          <IconFunnel width={40} height={40} style={{ color: 'var(--text4)' }} />
          <h3>Nenhum dado importado</h3>
          <p>
            Importe um arquivo <strong>ROTINA</strong> e um arquivo{' '}
            <strong>COMPROVEI</strong> na aba{' '}
            <a href="/importacoes">Importações</a> para visualizar o funil.
          </p>
        </div>
      )}

      {!carregandoKpis && !semDados && kpis && (
        <>
          {/* Cards de origem */}
          <div className="funil-cards-origem">
            <CardOrigem
              label="Em ambos"
              valor={kpis.total_ambos}
              cor="#16a34a"
              ativo={origemAtiva === 'ambos'}
              onClick={() => toggleOrigem('ambos')}
            />
            <CardOrigem
              label="Só ROTINA"
              valor={kpis.total_so_rotina}
              cor="#2563eb"
              ativo={origemAtiva === 'apenas_rotina'}
              onClick={() => toggleOrigem('apenas_rotina')}
            />
            <CardOrigem
              label="Só COMPROVEI"
              valor={kpis.total_so_comprovei}
              cor="#7c3aed"
              ativo={origemAtiva === 'apenas_comprovei'}
              onClick={() => toggleOrigem('apenas_comprovei')}
            />
            <CardOrigem
              label="Divergência NF"
              valor={kpis.total_divergencia_nf}
              cor="#dc2626"
              ativo={divergenciaNF}
              onClick={() => { setDivergenciaNF((p) => !p); setPagina(1) }}
            />
            {(kpis.total_com_reentrega ?? 0) > 0 && (
              <CardOrigem
                label="Com reentrega"
                valor={kpis.total_com_reentrega}
                cor="#f97316"
                ativo={false}
                onClick={() => {}}
              />
            )}
          </div>

          {/* Funil SVG */}
          <div className="funil-grafico-card">
            <div className="funil-grafico-header">
              <span className="funil-grafico-titulo">Volume por etapa</span>
              <span className="funil-grafico-hint">Clique em uma etapa para filtrar</span>
            </div>
            <FunilSVG
              kpis={kpis}
              etapaAtiva={etapaAtiva}
              onEtapaClick={toggleEtapa}
            />
          </div>

          {/* Painel de filtros avançados */}
          <div className="funil-filtros-card">
            <button
              type="button"
              className="funil-filtros-toggle"
              onClick={() => setFiltrosAbertos((p) => !p)}
            >
              <IconFilter width={15} height={15} />
              Filtros avançados
              {temFiltroAtivo && <span className="funil-filtros-badge">ativo</span>}
              <span className="funil-filtros-chevron">{filtrosAbertos ? '▲' : '▼'}</span>
            </button>

            {filtrosAbertos && (
              <div className="funil-filtros-corpo">
                <div className="funil-filtro-grupo">
                  <label className="funil-filtro-label">Período (data pedido)</label>
                  <div className="funil-filtro-datas">
                    <input
                      type="date"
                      value={dataInicio}
                      onChange={(e) => { setDataInicio(e.target.value); setPagina(1) }}
                      className="funil-filtro-input"
                    />
                    <span className="funil-filtro-ate">até</span>
                    <input
                      type="date"
                      value={dataFim}
                      onChange={(e) => { setDataFim(e.target.value); setPagina(1) }}
                      className="funil-filtro-input"
                    />
                  </div>
                </div>

                <div className="funil-filtro-grupo">
                  <label className="funil-filtro-label">Status de entrega</label>
                  <select
                    value={statusFiltro}
                    onChange={(e) => { setStatusFiltro(e.target.value); setPagina(1) }}
                    className="funil-filtro-select"
                  >
                    <option value="">Todos</option>
                    {['Entregue', 'Em Rota', 'A caminho', 'Chegou', 'Abortada', 'Devolvido', 'Sem Rota', 'Agendado'].map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <div className="funil-filtro-grupo">
                  <label className="funil-filtro-label">Motorista</label>
                  <input
                    type="search"
                    placeholder="Buscar motorista…"
                    value={motoristaBusca}
                    onChange={(e) => { setMotoristaBusca(e.target.value); setPagina(1) }}
                    className="funil-filtro-input"
                    style={{ width: 200 }}
                  />
                </div>

                {temFiltroAtivo && (
                  <div className="funil-filtro-grupo funil-filtro-limpar">
                    <Button variant="ghost" size="sm" onClick={limparFiltros}>
                      Limpar filtros
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Tabela de pedidos */}
          <div className="funil-tabela-card">
            <div className="funil-tabela-header">
              <span className="funil-tabela-titulo">
                Pedidos
                {etapaAtiva && (
                  <span className="funil-tabela-subtitulo"> — {etapaAtiva}</span>
                )}
                {temFiltroAtivo && (
                  <button
                    type="button"
                    className="funil-tabela-limpar-btn"
                    onClick={limparFiltros}
                  >
                    Limpar ✕
                  </button>
                )}
              </span>
              <span className="funil-tabela-count">
                {total.toLocaleString('pt-BR')} pedido(s)
              </span>
            </div>

            {erroTabela ? (
              <div className="funil-erro" style={{ margin: 16 }}>
                <IconAlertCircle width={16} height={16} />
                {erroTabela}
              </div>
            ) : (
              <TabelaPedidos
                pedidos={pedidos}
                total={total}
                pagina={pagina}
                onMudarPagina={setPagina}
                carregando={carregandoTabela}
              />
            )}
          </div>
        </>
      )}
    </div>
  )
}
