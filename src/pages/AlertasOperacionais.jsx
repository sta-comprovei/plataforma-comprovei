import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import {
  buscarAlertas,
  buscarKpisAlertas,
  resolverAlerta,
  gerarTodosOsAlertas,
  excluirAlerta,
  TIPOS_ALERTA,
  SEVERIDADES,
  labelTipo,
  corSeveridade,
} from '../lib/alertasService'
import { useDebouncedValue } from '../lib/useDebouncedValue'
import { useAutoRefresh } from '../lib/useAutoRefresh'
import Pagination from '../components/ui/Pagination'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import Button from '../components/ui/Button'
import { IconBell, IconAlertCircle } from '../components/ui/Icons'
import './AlertasOperacionais.css'

// ───────────────────────────────────────────────────────────
const POR_PAGINA = 50

const COR_SEV = {
  BAIXA:   { bg: '#F0FDF4', cor: '#16A34A', borda: '#86efac' },
  MEDIA:   { bg: '#FFFBEB', cor: '#D97706', borda: '#fde68a' },
  ALTA:    { bg: '#FFF7ED', cor: '#EA580C', borda: '#fed7aa' },
  CRITICA: { bg: '#FEF2F2', cor: '#DC2626', borda: '#fca5a5' },
}

function BadgeSev({ sev }) {
  const cls = COR_SEV[sev] ?? COR_SEV.MEDIA
  return (
    <span className="al-badge-sev" style={{ background: cls.bg, color: cls.cor, border: `1px solid ${cls.borda}` }}>
      {sev}
    </span>
  )
}

function BadgeTipo({ tipo }) {
  return (
    <span className="al-badge-tipo" style={{ color: corSeveridade('MEDIA') }}>
      {labelTipo(tipo)}
    </span>
  )
}

function fmtTs(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// ───────────────────────────────────────────────────────────
// SUB: KPI card
// ───────────────────────────────────────────────────────────
function CardKpi({ label, valor, cor, destaque }) {
  return (
    <div className={`al-kpi${destaque ? ' al-kpi-destaque' : ''}`} style={destaque ? { borderColor: cor } : {}}>
      <span className="al-kpi-valor" style={{ color: cor }}>{valor ?? '—'}</span>
      <span className="al-kpi-label">{label}</span>
    </div>
  )
}

// ───────────────────────────────────────────────────────────
// SUB: Tabela de alertas
// ───────────────────────────────────────────────────────────
function TabelaAlertas({ dados, total, pagina, onMudarPagina, carregando, onResolver, onExcluir }) {
  if (carregando) return <div className="al-carregando">Carregando alertas…</div>
  if (dados.length === 0) {
    return (
      <div className="al-vazio">
        <IconBell width={32} height={32} style={{ color: 'var(--text4)' }} />
        <p>Nenhum alerta encontrado para este filtro.</p>
        <span>Use &quot;Verificar Agora&quot; para gerar alertas automaticamente.</span>
      </div>
    )
  }

  return (
    <>
      <div className="al-tabela-wrap">
        <table className="al-tabela">
          <thead>
            <tr>
              <th>Severidade</th>
              <th>Tipo</th>
              <th>NUMPED</th>
              <th>Motorista</th>
              <th>Rota</th>
              <th>Descrição</th>
              <th>Valor</th>
              <th>Gerado em</th>
              <th>Status</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody>
            {dados.map(a => (
              <tr key={a.id}
                style={{
                  opacity:    a.resolvido ? 0.55 : 1,
                  background: !a.resolvido && a.severidade === 'CRITICA' ? '#FEF2F208' : 'transparent',
                }}
              >
                <td><BadgeSev sev={a.severidade} /></td>
                <td><BadgeTipo tipo={a.tipo} /></td>
                <td className="al-td-mono">{a.numped ?? '—'}</td>
                <td className="al-td-mot">{a.motorista ?? <span className="al-tc">—</span>}</td>
                <td className="al-td-rota">{a.rota ?? <span className="al-tc">—</span>}</td>
                <td className="al-td-desc">{a.descricao}</td>
                <td className="al-td-val">
                  {a.valor_encontrado != null ? (
                    <span style={{ color: 'var(--red)', fontWeight: 600 }}>
                      {a.valor_encontrado.toFixed(1)}h
                    </span>
                  ) : '—'}
                </td>
                <td className="al-td-ts al-tc">{fmtTs(a.criado_em)}</td>
                <td>
                  {a.resolvido
                    ? <span className="al-badge-res">Resolvido</span>
                    : <span className="al-badge-aberto">Aberto</span>}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap' }}>
                    {!a.resolvido && (
                      <button type="button" className="al-btn-resolver"
                        onClick={() => onResolver(a.id)}>
                        Resolver
                      </button>
                    )}
                    <button type="button" className="al-btn-resolver"
                      style={{ color: 'var(--red)', borderColor: 'var(--red)' }}
                      onClick={() => onExcluir(a)}
                      title="Mover para Lixeira">
                      Excluir
                    </button>
                    {a.numped && (
                      <a href={`/funil?numped=${a.numped}`}
                        className="al-btn-link" target="_blank" rel="noreferrer"
                        title="Ver pedido no Funil">
                        Pedido
                      </a>
                    )}
                  </div>
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
// ───────────────────────────────────────────────────────────
export default function AlertasOperacionais() {
  const { usuario } = useAuth()
  const nomeUsuario = usuario?.nome || usuario?.email || null

  const [kpis, setKpis]       = useState(null)
  const [alertas, setAlertas] = useState([])
  const [total, setTotal]     = useState(0)
  const [pagina, setPagina]   = useState(1)

  // Filtros
  const [filtTipo, setFiltTipo]       = useState('')
  const [filtSev,  setFiltSev]        = useState('')
  const [filtMot,  setFiltMot]        = useState('')
  const [filtRota, setFiltRota]       = useState('')
  const [filtRes,  setFiltRes]        = useState('false')   // por padrão: abertos
  const [filtrosAb, setFiltrosAb]     = useState(false)

  // Estados de ação
  const [gerando, setGerando]       = useState(false)
  const [resultGer, setResultGer]   = useState(null)
  const [erroGer, setErroGer]       = useState('')
  const [confirmExclusao, setConfirmExclusao] = useState(null)
  const [excluindo, setExcluindo]   = useState(false)
  const [carregKpis, setCarregKpis] = useState(true)
  const [carregLst,  setCarregLst]  = useState(true)
  const [erroLst, setErroLst]       = useState('')

  const motDeb  = useDebouncedValue(filtMot,  400)
  const rotaDeb = useDebouncedValue(filtRota, 400)

  const refKpis = useRef('')
  const refLst  = useRef('')

  // ── KPIs ───────────────────────────────────────────────────────────
  const carregarKpis = useCallback(async () => {
    const sig = 'kpis'
    refKpis.current = sig
    setCarregKpis(true)
    const { dados } = await buscarKpisAlertas()
    if (refKpis.current !== sig) return
    setKpis(dados)
    setCarregKpis(false)
  }, [])

  useEffect(() => { carregarKpis() }, [carregarKpis])
  useAutoRefresh(carregarKpis, 60000)

  // ── Lista ───────────────────────────────────────────────────────────
  const carregarLista = useCallback(async () => {
    const sig = [pagina, filtTipo, filtSev, motDeb, rotaDeb, filtRes].join('|')
    refLst.current = sig
    setCarregLst(true)
    setErroLst('')

    const resolvidoFiltro = filtRes === '' ? undefined : filtRes === 'true'

    const { dados, total: t, erro } = await buscarAlertas({
      tipo:      filtTipo   || undefined,
      severidade: filtSev   || undefined,
      motorista: motDeb     || undefined,
      rota:      rotaDeb    || undefined,
      resolvido: resolvidoFiltro,
      pagina,
      porPagina: POR_PAGINA,
    })

    if (refLst.current !== sig) return
    if (erro) { setErroLst(erro); setAlertas([]); setTotal(0) }
    else       { setAlertas(dados); setTotal(t) }
    setCarregLst(false)
  }, [pagina, filtTipo, filtSev, motDeb, rotaDeb, filtRes])

  useEffect(() => { carregarLista() }, [carregarLista])

  // ── Gerar alertas ─────────────────────────────────────────────────────
  async function handleGerar() {
    setGerando(true)
    setResultGer(null)
    setErroGer('')
    const { resultados, erros } = await gerarTodosOsAlertas()
    setGerando(false)
    if (erros.length > 0) setErroGer(erros[0])
    setResultGer(resultados)
    carregarKpis()
    setPagina(1)
    carregarLista()
  }

  // ── Resolver alerta ──────────────────────────────────────────────────────
  async function handleResolver(id) {
    const { erro } = await resolverAlerta(id, nomeUsuario)
    if (erro) { setErroLst(erro); return }
    carregarKpis()
    carregarLista()
  }

  async function handleExcluir() {
    if (!confirmExclusao) return
    setExcluindo(true)
    const { sucesso, erro: e } = await excluirAlerta(confirmExclusao.id, nomeUsuario)
    setExcluindo(false)
    setConfirmExclusao(null)
    if (!sucesso) { setErroLst(e || 'Erro ao excluir.'); return }
    carregarKpis(); carregarLista()
  }

  function limparFiltros() {
    setFiltTipo(''); setFiltSev(''); setFiltMot(''); setFiltRota(''); setFiltRes('false')
    setPagina(1)
  }

  const temFiltro = filtTipo || filtSev || filtMot || filtRota || filtRes !== 'false'

  return (
    <div className="al-page">

      {/* Cabeçalho */}
      <div className="al-header">
        <div className="al-header-left">
          <div className="al-header-icon">
            <IconBell width={22} height={22} />
          </div>
          <div>
            <h2 className="al-titulo">Central de Alertas</h2>
            <p className="al-desc">Identificação automática de situações que exigem atenção</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="secondary" size="sm" onClick={() => { carregarKpis(); carregarLista() }}>
            Atualizar
          </Button>
          <Button variant="primary" size="sm" onClick={handleGerar} carregando={gerando}>
            {gerando ? 'Verificando…' : '⚡ Verificar Agora'}
          </Button>
        </div>
      </div>

      {/* Resultado da geração */}
      {resultGer && (
        <div className="al-resultado-ger">
          <strong>Verificação concluída:</strong>
          {' '}SLA: {resultGer.sla_atrasado} · Transporte: {resultGer.transporte_acima_prazo}
          {' '}· Separação: {resultGer.separacao_acima_prazo} · Conferência: {resultGer.conferencia_acima_prazo}
          {' '}· Divergências: {resultGer.divergencia} · Comunicados: {resultGer.comunicado_pendente}
          {resultGer.comprovei_pendencia > 0 && ` · COMPROVEI: ${resultGer.comprovei_pendencia}`}
          {' '}→ <strong>{resultGer.total} novos alertas</strong>
        </div>
      )}
      {erroGer && <div className="al-erro"><IconAlertCircle width={15} height={15} />{erroGer}</div>}

      {/* KPIs */}
      {!carregKpis && kpis && (
        <div className="al-kpis">
          <CardKpi label="Críticos abertos"  valor={kpis.criticos_abertos}  cor="var(--red)"    destaque={kpis.criticos_abertos > 0} />
          <CardKpi label="Total abertos"     valor={kpis.total_abertos}     cor="var(--amber)"  />
          <CardKpi label="Resolvidos"        valor={kpis.total_resolvidos}  cor="var(--green)"  />
          <CardKpi label="SLA atrasados"     valor={kpis.sla_atrasados}     cor="var(--orange)" />
        </div>
      )}

      {/* Filtros */}
      <div className="al-filtros-card">
        <button type="button" className="al-filtros-toggle" onClick={() => setFiltrosAb(p => !p)}>
          Filtros
          {temFiltro && <span className="al-filtros-badge">ativo</span>}
          <span className="al-filtros-chevron">{filtrosAb ? '▲' : '▼'}</span>
        </button>
        {filtrosAb && (
          <div className="al-filtros-corpo">
            <div className="al-fg">
              <label className="al-fl">Tipo</label>
              <select value={filtTipo} onChange={e => { setFiltTipo(e.target.value); setPagina(1) }} className="al-fs">
                <option value="">Todos</option>
                {TIPOS_ALERTA.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="al-fg">
              <label className="al-fl">Severidade</label>
              <select value={filtSev} onChange={e => { setFiltSev(e.target.value); setPagina(1) }} className="al-fs">
                <option value="">Todas</option>
                {SEVERIDADES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="al-fg">
              <label className="al-fl">Motorista</label>
              <input type="search" placeholder="Buscar…" value={filtMot}
                onChange={e => { setFiltMot(e.target.value); setPagina(1) }} className="al-fi" />
            </div>
            <div className="al-fg">
              <label className="al-fl">Rota</label>
              <input type="search" placeholder="Buscar…" value={filtRota}
                onChange={e => { setFiltRota(e.target.value); setPagina(1) }} className="al-fi" />
            </div>
            <div className="al-fg">
              <label className="al-fl">Status</label>
              <select value={filtRes} onChange={e => { setFiltRes(e.target.value); setPagina(1) }} className="al-fs">
                <option value="">Todos</option>
                <option value="false">Abertos</option>
                <option value="true">Resolvidos</option>
              </select>
            </div>
            {temFiltro && (
              <div className="al-fg" style={{ justifyContent: 'flex-end' }}>
                <Button variant="ghost" size="sm" onClick={limparFiltros}>Limpar</Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Listagem */}
      <div className="al-lista-card">
        <div className="al-lista-header">
          <span className="al-lista-titulo">
            Alertas
            {filtRes === 'false' && <span className="al-lista-sub"> — abertos</span>}
          </span>
          <span className="al-lista-count">{total.toLocaleString('pt-BR')} alerta(s)</span>
        </div>
        {erroLst && <div className="al-erro" style={{ margin: 16 }}><IconAlertCircle width={15} height={15} />{erroLst}</div>}
        <TabelaAlertas
          dados={alertas}
          total={total}
          pagina={pagina}
          onMudarPagina={setPagina}
          carregando={carregLst}
          onResolver={handleResolver}
          onExcluir={setConfirmExclusao}
        />
      </div>

    <ConfirmDialog
      aberto={!!confirmExclusao}
      titulo="Mover para a Lixeira"
      mensagem={confirmExclusao ? `O alerta "${confirmExclusao.tipo ?? ''}" será movido para a Lixeira. Pode ser restaurado depois.` : ''}
      textoConfirmar="Mover para Lixeira"
      variantConfirmar="danger"
      carregando={excluindo}
      onConfirmar={handleExcluir}
      onCancelar={() => setConfirmExclusao(null)}
    />
    </div>
  )
}
