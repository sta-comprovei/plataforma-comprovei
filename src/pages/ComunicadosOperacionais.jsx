import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import {
  buscarComunicados,
  buscarKpisComunicados,
  criarComunicado,
  resolverComunicado,
  excluirComunicado,
  TIPOS_COMUNICADO,
  labelTipo,
  hoje,
} from '../lib/comunicadosService'
import { useDebouncedValue } from '../lib/useDebouncedValue'
import { useAutoRefresh } from '../lib/useAutoRefresh'
import Pagination from '../components/ui/Pagination'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import Button from '../components/ui/Button'
import { IconMegaphone, IconAlertCircle } from '../components/ui/Icons'
import './ComunicadosOperacionais.css'

// ───────────────────────────────────────────────────────────
// Constantes
// ───────────────────────────────────────────────────────────
const POR_PAGINA = 50

const COR_TIPO = {
  ALTERACAO_MOTORISTA: { bg: '#EFF6FF', cor: '#2563EB' },
  TROCA_ROTA:          { bg: '#F5F3FF', cor: '#7C3AED' },
  PENDENCIA:           { bg: '#FEF2F2', cor: '#DC2626' },
  OBSERVACAO:          { bg: '#F0FDF4', cor: '#16A34A' },
  CARGA_INVERTIDA:     { bg: '#FFFBEB', cor: '#D97706' },
  OUTRO:               { bg: '#F5F5F5', cor: '#888888' },
}

function BadgeTipo({ tipo }) {
  const cls = COR_TIPO[tipo] ?? COR_TIPO.OUTRO
  return (
    <span className="co-badge-tipo" style={{ background: cls.bg, color: cls.cor }}>
      {labelTipo(tipo)}
    </span>
  )
}

function fmtData(iso) {
  if (!iso) return '—'
  // data_operacao é date (YYYY-MM-DD) — formatar sem fuso
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

// ───────────────────────────────────────────────────────────
// SUB-COMPONENTE: Formulário de novo comunicado
// ───────────────────────────────────────────────────────────
const FORM_VAZIO = {
  data_operacao:    '',
  motorista:        '',
  codigo_motorista: '',
  rota:             '',
  tipo:             '',
  descricao:        '',
}

function FormComunicado({ onSalvar, salvando, erro }) {
  const [form, setForm] = useState({ ...FORM_VAZIO, data_operacao: hoje() })

  function handleChange(e) {
    const { name, value } = e.target
    setForm(f => ({ ...f, [name]: value }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.tipo || !form.descricao.trim()) return
    onSalvar(form)
  }

  function limpar() {
    setForm({ ...FORM_VAZIO, data_operacao: hoje() })
  }

  return (
    <div className="co-form-card">
      <div className="co-form-titulo">Novo Comunicado</div>

      <form onSubmit={handleSubmit} className="co-form-corpo">
        {/* Linha 1: Data + Tipo */}
        <div className="co-form-row">
          <div className="co-form-grupo co-form-grupo-sm">
            <label className="co-form-label">Data *</label>
            <input
              type="date"
              name="data_operacao"
              value={form.data_operacao}
              onChange={handleChange}
              required
              className="co-form-input"
            />
          </div>
          <div className="co-form-grupo co-form-grupo-md">
            <label className="co-form-label">Tipo *</label>
            <select
              name="tipo"
              value={form.tipo}
              onChange={handleChange}
              required
              className="co-form-select"
            >
              <option value="">Selecione…</option>
              {TIPOS_COMUNICADO.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Linha 2: Motorista + Código + Rota */}
        <div className="co-form-row">
          <div className="co-form-grupo co-form-grupo-lg">
            <label className="co-form-label">Motorista</label>
            <input
              type="text"
              name="motorista"
              value={form.motorista}
              onChange={handleChange}
              className="co-form-input"
              placeholder="Nome do motorista"
            />
          </div>
          <div className="co-form-grupo co-form-grupo-sm">
            <label className="co-form-label">Código</label>
            <input
              type="text"
              name="codigo_motorista"
              value={form.codigo_motorista}
              onChange={handleChange}
              className="co-form-input"
              placeholder="Cód."
            />
          </div>
          <div className="co-form-grupo co-form-grupo-md">
            <label className="co-form-label">Rota</label>
            <input
              type="text"
              name="rota"
              value={form.rota}
              onChange={handleChange}
              className="co-form-input"
              placeholder="Destino / rota"
            />
          </div>
        </div>

        {/* Linha 3: Descrição */}
        <div className="co-form-grupo">
          <label className="co-form-label">Descrição *</label>
          <textarea
            name="descricao"
            value={form.descricao}
            onChange={handleChange}
            required
            rows={3}
            className="co-form-textarea"
            placeholder="Descreva a ocorrência com detalhes…"
          />
        </div>

        {/* Erro inline */}
        {erro && (
          <div className="co-form-erro">
            <IconAlertCircle width={15} height={15} />
            {erro}
          </div>
        )}

        {/* Ações */}
        <div className="co-form-acoes">
          <Button variant="ghost" size="sm" type="button" onClick={limpar}>
            Limpar
          </Button>
          <Button
            variant="primary"
            size="sm"
            type="submit"
            carregando={salvando}
            disabled={!form.tipo || !form.descricao.trim()}
          >
            Salvar Comunicado
          </Button>
        </div>
      </form>
    </div>
  )
}

// ───────────────────────────────────────────────────────────
// SUB-COMPONENTE: KPIs do topo
// ───────────────────────────────────────────────────────────
function CardKpi({ label, valor, cor }) {
  return (
    <div className="co-kpi-card">
      <span className="co-kpi-valor" style={{ color: cor }}>{valor ?? '—'}</span>
      <span className="co-kpi-label">{label}</span>
    </div>
  )
}

// ───────────────────────────────────────────────────────────
// SUB-COMPONENTE: Tabela de comunicados
// ───────────────────────────────────────────────────────────
function TabelaComunicados({ dados, total, pagina, onMudarPagina, carregando, onResolver, onExcluir }) {
  if (carregando) return <div className="co-carregando">Carregando comunicados…</div>

  if (dados.length === 0) {
    return (
      <div className="co-vazio">
        <IconMegaphone width={32} height={32} style={{ color: 'var(--text4)' }} />
        <p>Nenhum comunicado encontrado para este filtro.</p>
      </div>
    )
  }

  return (
    <>
      <div className="co-tabela-wrap">
        <table className="co-tabela">
          <thead>
            <tr>
              <th>Data</th>
              <th>Tipo</th>
              <th>Motorista</th>
              <th>Rota</th>
              <th>Descrição</th>
              <th>Status</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody>
            {dados.map(c => (
              <tr key={c.id} style={{ opacity: c.resolvido ? 0.6 : 1 }}>
                <td className="co-td-data">{fmtData(c.data_operacao)}</td>
                <td><BadgeTipo tipo={c.tipo} /></td>
                <td className="co-td-motorista">
                  {c.motorista
                    ? <><span>{c.motorista}</span>{c.codigo_motorista && <span className="co-codigo"> {c.codigo_motorista}</span>}</>
                    : <span className="co-vazio-cel">—</span>}
                </td>
                <td className="co-td-rota">{c.rota ?? <span className="co-vazio-cel">—</span>}</td>
                <td className="co-td-desc">{c.descricao}</td>
                <td>
                  {c.resolvido
                    ? <span className="co-badge-resolvido">Resolvido</span>
                    : <span className="co-badge-pendente">Pendente</span>}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap' }}>
                    {!c.resolvido && (
                      <button
                        type="button"
                        className="co-btn-resolver"
                        onClick={() => onResolver(c.id)}
                      >
                        Resolver
                      </button>
                    )}
                    <button
                      type="button"
                      className="co-btn-resolver"
                      style={{ color: 'var(--red)', borderColor: 'var(--red)' }}
                      onClick={() => onExcluir(c)}
                      title="Mover para Lixeira"
                    >
                      Excluir
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination
        pagina={pagina}
        porPagina={POR_PAGINA}
        total={total}
        onMudarPagina={onMudarPagina}
      />
    </>
  )
}

// ───────────────────────────────────────────────────────────
// PÁGINA PRINCIPAL
// ───────────────────────────────────────────────────────────
export default function ComunicadosOperacionais() {
  const { usuario } = useAuth()
  const nomeUsuario = usuario?.nome || usuario?.email || null

  // ── Estado de exclusão ───────────────────────────────────────────────────
  const [confirmExclusao, setConfirmExclusao] = useState(null)
  const [excluindo, setExcluindo]             = useState(false)

  // ── Estado ───────────────────────────────────────────────────────────
  const [kpis, setKpis]         = useState(null)
  const [comunicados, setCom]   = useState([])
  const [total, setTotal]       = useState(0)
  const [pagina, setPagina]     = useState(1)

  // Filtros
  const [dataIni, setDataIni]         = useState('')
  const [dataFim, setDataFim]         = useState('')
  const [filtMotorista, setFiltMot]   = useState('')
  const [filtRota, setFiltRota]       = useState('')
  const [filtTipo, setFiltTipo]       = useState('')
  const [filtResolvido, setFiltRes]   = useState('')  // '' | 'false' | 'true'
  const [filtrosAbertos, setFiltAb]   = useState(false)

  // Formulário
  const [salvando, setSalvando]   = useState(false)
  const [erroForm, setErroForm]   = useState('')
  const [msgSucesso, setMsgSuc]   = useState('')

  // Loading
  const [carregandoKpis, setCarKpis] = useState(true)
  const [carregandoLista, setCarLst] = useState(true)
  const [erroLista, setErroLista]    = useState('')

  // Debounce nos campos de texto
  const motDebounced  = useDebouncedValue(filtMotorista, 400)
  const rotaDebounced = useDebouncedValue(filtRota,      400)

  // Race condition refs
  const refKpis  = useRef('')
  const refLista = useRef('')

  // ── Carregar KPIs ─────────────────────────────────────────────────────────
  const carregarKpis = useCallback(async () => {
    const sig = 'kpis'
    refKpis.current = sig
    setCarKpis(true)
    const { dados } = await buscarKpisComunicados()
    if (refKpis.current !== sig) return
    setKpis(dados)
    setCarKpis(false)
  }, [])

  useEffect(() => { carregarKpis() }, [carregarKpis])
  useAutoRefresh(carregarKpis, 60000) // atualiza a cada 1 min

  // ── Carregar lista ───────────────────────────────────────────────────────
  const carregarLista = useCallback(async () => {
    const sig = [pagina, dataIni, dataFim, motDebounced, rotaDebounced, filtTipo, filtResolvido].join('|')
    refLista.current = sig
    setCarLst(true)
    setErroLista('')

    const resolvidoFiltro = filtResolvido === '' ? undefined
      : filtResolvido === 'true'

    const { dados, total: t, erro } = await buscarComunicados({
      data_inicio: dataIni    || undefined,
      data_fim:    dataFim    || undefined,
      motorista:   motDebounced  || undefined,
      rota:        rotaDebounced || undefined,
      tipo:        filtTipo   || undefined,
      resolvido:   resolvidoFiltro,
      pagina,
      porPagina:   POR_PAGINA,
    })

    if (refLista.current !== sig) return
    if (erro) { setErroLista(erro); setCom([]); setTotal(0) }
    else       { setCom(dados); setTotal(t) }
    setCarLst(false)
  }, [pagina, dataIni, dataFim, motDebounced, rotaDebounced, filtTipo, filtResolvido])

  useEffect(() => { carregarLista() }, [carregarLista])

  // ── Salvar comunicado ────────────────────────────────────────────────────
  async function handleSalvar(form) {
    setSalvando(true)
    setErroForm('')
    const { erro } = await criarComunicado(form, nomeUsuario)
    setSalvando(false)
    if (erro) { setErroForm(erro); return }
    setMsgSuc('Comunicado registrado com sucesso.')
    setTimeout(() => setMsgSuc(''), 3000)
    carregarKpis()
    setPagina(1)
    carregarLista()
  }

  // ── Resolver comunicado ──────────────────────────────────────────────────────
  async function handleResolver(id) {
    const { erro } = await resolverComunicado(id, nomeUsuario)
    if (erro) { setErroLista(erro); return }
    carregarKpis()
    carregarLista()
  }

  async function handleExcluir() {
    if (!confirmExclusao) return
    setExcluindo(true)
    const { sucesso, erro: e } = await excluirComunicado(confirmExclusao.id, nomeUsuario)
    setExcluindo(false)
    setConfirmExclusao(null)
    if (!sucesso) { setErroLista(e || 'Erro ao excluir.'); return }
    carregarKpis()
    carregarLista()
  }

  function limparFiltros() {
    setDataIni(''); setDataFim(''); setFiltMot('')
    setFiltRota(''); setFiltTipo(''); setFiltRes('')
    setPagina(1)
  }

  const temFiltro = dataIni || dataFim || filtMotorista || filtRota || filtTipo || filtResolvido

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div className="co-page">

      {/* Cabeçalho */}
      <div className="co-header">
        <div className="co-header-left">
          <div className="co-header-icon">
            <IconMegaphone width={22} height={22} />
          </div>
          <div>
            <h2 className="co-titulo">Comunicados Operacionais</h2>
            <p className="co-desc">Registro de ocorrências e alterações do dia</p>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={() => { carregarKpis(); carregarLista() }}>
          Atualizar
        </Button>
      </div>

      {/* KPIs */}
      {!carregandoKpis && kpis && (
        <div className="co-kpis">
          <CardKpi label="Comunicados hoje"      valor={kpis.comunicados_hoje}     cor="var(--orange)" />
          <CardKpi label="Pendências abertas"    valor={kpis.pendencias_abertas}   cor="var(--red)"    />
          <CardKpi label="Alterações motorista"  valor={kpis.alteracoes_motorista} cor="var(--blue)"   />
          <CardKpi label="Trocas de rota"        valor={kpis.trocas_rota}          cor="var(--purple)" />
        </div>
      )}

      {/* Sucesso global */}
      {msgSucesso && (
        <div className="co-sucesso">{msgSucesso}</div>
      )}

      {/* Layout: formulário à esquerda, listagem à direita em desktop */}
      <div className="co-layout">

        {/* Formulário */}
        <div className="co-col-form">
          <FormComunicado
            onSalvar={handleSalvar}
            salvando={salvando}
            erro={erroForm}
          />
        </div>

        {/* Listagem */}
        <div className="co-col-lista">

          {/* Filtros */}
          <div className="co-filtros-card">
            <button
              type="button"
              className="co-filtros-toggle"
              onClick={() => setFiltAb(p => !p)}
            >
              Filtros
              {temFiltro && <span className="co-filtros-badge">ativo</span>}
              <span className="co-filtros-chevron">{filtrosAbertos ? '▲' : '▼'}</span>
            </button>
            {filtrosAbertos && (
              <div className="co-filtros-corpo">
                <div className="co-fg">
                  <label className="co-fl">Período</label>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input type="date" value={dataIni} onChange={e => { setDataIni(e.target.value); setPagina(1) }} className="co-fi" />
                    <span style={{ fontSize: 12, color: 'var(--text3)' }}>até</span>
                    <input type="date" value={dataFim} onChange={e => { setDataFim(e.target.value); setPagina(1) }} className="co-fi" />
                  </div>
                </div>
                <div className="co-fg">
                  <label className="co-fl">Motorista</label>
                  <input type="search" placeholder="Buscar…" value={filtMotorista}
                    onChange={e => { setFiltMot(e.target.value); setPagina(1) }} className="co-fi" />
                </div>
                <div className="co-fg">
                  <label className="co-fl">Rota</label>
                  <input type="search" placeholder="Buscar…" value={filtRota}
                    onChange={e => { setFiltRota(e.target.value); setPagina(1) }} className="co-fi" />
                </div>
                <div className="co-fg">
                  <label className="co-fl">Tipo</label>
                  <select value={filtTipo} onChange={e => { setFiltTipo(e.target.value); setPagina(1) }} className="co-fs">
                    <option value="">Todos</option>
                    {TIPOS_COMUNICADO.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div className="co-fg">
                  <label className="co-fl">Status</label>
                  <select value={filtResolvido} onChange={e => { setFiltRes(e.target.value); setPagina(1) }} className="co-fs">
                    <option value="">Todos</option>
                    <option value="false">Pendentes</option>
                    <option value="true">Resolvidos</option>
                  </select>
                </div>
                {temFiltro && (
                  <div className="co-fg" style={{ justifyContent: 'flex-end' }}>
                    <Button variant="ghost" size="sm" onClick={limparFiltros}>Limpar</Button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Tabela */}
          <div className="co-lista-card">
            <div className="co-lista-header">
              <span className="co-lista-titulo">Comunicados</span>
              <span className="co-lista-count">{total.toLocaleString('pt-BR')} registro(s)</span>
            </div>
            {erroLista && (
              <div className="co-erro">
                <IconAlertCircle width={15} height={15} />
                {erroLista}
              </div>
            )}
            <TabelaComunicados
              dados={comunicados}
              total={total}
              pagina={pagina}
              onMudarPagina={setPagina}
              carregando={carregandoLista}
              onResolver={handleResolver}
              onExcluir={setConfirmExclusao}
            />
          </div>

        </div>{/* co-col-lista */}
      </div>{/* co-layout */}
    <ConfirmDialog
      aberto={!!confirmExclusao}
      titulo="Mover para a Lixeira"
      mensagem={confirmExclusao ? `O comunicado "${confirmExclusao.tipo ?? ''}" será movido para a Lixeira. Pode ser restaurado depois.` : ''}
      textoConfirmar="Mover para Lixeira"
      variantConfirmar="danger"
      carregando={excluindo}
      onConfirmar={handleExcluir}
      onCancelar={() => setConfirmExclusao(null)}
    />
    </div>
  )
}
