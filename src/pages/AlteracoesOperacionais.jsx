import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import {
  buscarAlteracoes,
  buscarKpisAlteracoes,
  criarAlteracao,
  editarAlteracao,
  resolverAlteracao,
  excluirAlteracao,
  TIPOS_ALTERACAO,
  PRIORIDADES,
  labelTipo,
  labelPrioridade,
  corPrioridade,
  hoje,
} from '../lib/alteracoesOperacionaisService'
import { useDebouncedValue } from '../lib/useDebouncedValue'
import { useAutoRefresh } from '../lib/useAutoRefresh'
import Pagination from '../components/ui/Pagination'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import Button from '../components/ui/Button'
import { IconEdit, IconAlertCircle } from '../components/ui/Icons'
import './AlteracoesOperacionais.css'

// ───────────────────────────────────────────────────────────
const POR_PAGINA = 50

function BadgePrior({ prioridade }) {
  const cor = corPrioridade(prioridade)
  return (
    <span className="ao-badge-prior" style={{ color: cor }}>
      {labelPrioridade(prioridade)}
    </span>
  )
}

function fmtData(iso) {
  if (!iso) return '—'
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

// ───────────────────────────────────────────────────────────
// FORMULÁRIO (criar e editar)
// ───────────────────────────────────────────────────────────
const FORM_VAZIO = {
  data_alteracao: '',
  tipo:           '',
  prioridade:     'MEDIA',
  motorista:      '',
  rota:           '',
  descricao:      '',
  observacao:     '',
}

function FormAlteracao({ inicial, titulo, onSalvar, onCancelar, salvando, erro }) {
  const [form, setForm] = useState(
    inicial ? { ...inicial } : { ...FORM_VAZIO, data_alteracao: hoje() }
  )

  function handleChange(e) {
    const { name, value } = e.target
    setForm(f => ({ ...f, [name]: value }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.tipo || !form.descricao.trim()) return
    onSalvar(form)
  }

  return (
    <div className="ao-overlay" onClick={e => e.target === e.currentTarget && onCancelar()}>
      <div className="ao-modal">
        <div className="ao-modal-header">
          <h3>{titulo}</h3>
          <button type="button" className="ao-modal-fechar" onClick={onCancelar}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="ao-modal-corpo">
          {/* Linha 1: Data + Tipo + Prioridade */}
          <div className="ao-form-row">
            <div className="ao-form-grupo ao-fg-sm">
              <label className="ao-form-label">Data *</label>
              <input type="date" name="data_alteracao" value={form.data_alteracao}
                onChange={handleChange} required className="ao-form-input" />
            </div>
            <div className="ao-form-grupo ao-fg-md">
              <label className="ao-form-label">Tipo *</label>
              <select name="tipo" value={form.tipo} onChange={handleChange}
                required className="ao-form-select">
                <option value="">Selecione…</option>
                {TIPOS_ALTERACAO.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="ao-form-grupo ao-fg-sm">
              <label className="ao-form-label">Prioridade</label>
              <select name="prioridade" value={form.prioridade}
                onChange={handleChange} className="ao-form-select">
                {PRIORIDADES.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Linha 2: Motorista + Rota */}
          <div className="ao-form-row">
            <div className="ao-form-grupo ao-fg-lg">
              <label className="ao-form-label">Motorista</label>
              <input type="text" name="motorista" value={form.motorista}
                onChange={handleChange} className="ao-form-input"
                placeholder="Nome do motorista" />
            </div>
            <div className="ao-form-grupo ao-fg-md">
              <label className="ao-form-label">Rota</label>
              <input type="text" name="rota" value={form.rota}
                onChange={handleChange} className="ao-form-input"
                placeholder="Destino / rota" />
            </div>
          </div>

          {/* Descrição */}
          <div className="ao-form-grupo">
            <label className="ao-form-label">Descrição *</label>
            <textarea name="descricao" value={form.descricao}
              onChange={handleChange} required rows={3}
              className="ao-form-textarea"
              placeholder="Descreva a alteração…" />
          </div>

          {/* Observação */}
          <div className="ao-form-grupo">
            <label className="ao-form-label">Observação</label>
            <textarea name="observacao" value={form.observacao || ''}
              onChange={handleChange} rows={2}
              className="ao-form-textarea"
              placeholder="Tratativas, informações adicionais…" />
          </div>

          {erro && (
            <div className="ao-erro-form">
              <IconAlertCircle width={14} height={14} /> {erro}
            </div>
          )}

          <div className="ao-modal-acoes">
            <Button variant="ghost" size="sm" type="button" onClick={onCancelar}>
              Cancelar
            </Button>
            <Button variant="primary" size="sm" type="submit" carregando={salvando}
              disabled={!form.tipo || !form.descricao.trim()}>
              {titulo.startsWith('Editar') ? 'Salvar alterações' : 'Criar alteração'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ───────────────────────────────────────────────────────────
// KPI CARD
// ───────────────────────────────────────────────────────────
function CardKpi({ label, valor, cor, destaque }) {
  return (
    <div className={`ao-kpi${destaque ? ' ao-kpi-destaque' : ''}`}
      style={destaque ? { borderColor: cor } : {}}>
      <span className="ao-kpi-valor" style={{ color: cor }}>{valor ?? '—'}</span>
      <span className="ao-kpi-label">{label}</span>
    </div>
  )
}

// ───────────────────────────────────────────────────────────
// TABELA
// ───────────────────────────────────────────────────────────
function TabelaAlteracoes({ dados, total, pagina, onMudarPagina, carregando, onEditar, onResolver, onExcluir }) {
  if (carregando) return <div className="ao-carregando">Carregando alterações…</div>
  if (dados.length === 0) {
    return (
      <div className="ao-vazio">
        <IconEdit width={32} height={32} style={{ color: 'var(--text4)' }} />
        <p>Nenhuma alteração encontrada para este filtro.</p>
      </div>
    )
  }

  return (
    <>
      <div className="ao-tabela-wrap">
        <table className="ao-tabela">
          <thead>
            <tr>
              <th>Data</th>
              <th>Prioridade</th>
              <th>Tipo</th>
              <th>Motorista</th>
              <th>Rota</th>
              <th>Descrição</th>
              <th>Observação</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {dados.map(a => (
              <tr key={a.id} style={{ opacity: a.resolvido ? 0.55 : 1 }}>
                <td className="ao-td-data">{fmtData(a.data_alteracao)}</td>
                <td><BadgePrior prioridade={a.prioridade} /></td>
                <td className="ao-td-tipo">{labelTipo(a.tipo)}</td>
                <td className="ao-td-mot">{a.motorista ?? <span className="ao-tc">—</span>}</td>
                <td className="ao-td-rota">{a.rota ?? <span className="ao-tc">—</span>}</td>
                <td className="ao-td-desc">{a.descricao}</td>
                <td className="ao-td-obs">
                  {a.observacao
                    ? <span title={a.observacao}>{a.observacao.slice(0, 60)}{a.observacao.length > 60 ? '…' : ''}</span>
                    : <span className="ao-tc">—</span>}
                </td>
                <td>
                  {a.resolvido
                    ? <span className="ao-badge-res">Resolvida</span>
                    : <span className="ao-badge-aberta">Aberta</span>}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap' }}>
                    {!a.resolvido && (
                      <>
                        <button type="button" className="ao-btn-editar"
                          onClick={() => onEditar(a)}>
                          Editar
                        </button>
                        <button type="button" className="ao-btn-resolver"
                          onClick={() => onResolver(a.id)}>
                          Resolver
                        </button>
                      </>
                    )}
                    <button type="button" className="ao-btn-resolver"
                      style={{ color: 'var(--red)', borderColor: 'var(--red)' }}
                      onClick={() => onExcluir(a)}
                      title="Mover para Lixeira">
                      Excluir
                    </button>
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
export default function AlteracoesOperacionais() {
  const { usuario } = useAuth()
  const nomeUsuario = usuario?.nome || usuario?.email || null

  const [kpis, setKpis]             = useState(null)
  const [alteracoes, setAlteracoes] = useState([])
  const [total, setTotal]           = useState(0)
  const [pagina, setPagina]         = useState(1)

  // Modal
  const [modalAberto, setModalAberto]       = useState(false)
  const [editando, setEditando]             = useState(null)   // null = criar
  const [salvando, setSalvando]             = useState(false)
  const [erroModal, setErroModal]           = useState('')
  const [msgSucesso, setMsgSucesso]         = useState('')

  // Exclusão (mover para Lixeira)
  const [confirmExclusao, setConfirmExclusao] = useState(null) // registro a excluir
  const [excluindo, setExcluindo]             = useState(false)

  // Filtros
  const [dataIni, setDataIni]         = useState('')
  const [dataFim, setDataFim]         = useState('')
  const [filtTipo, setFiltTipo]       = useState('')
  const [filtPrior, setFiltPrior]     = useState('')
  const [filtMot, setFiltMot]         = useState('')
  const [filtRota, setFiltRota]       = useState('')
  const [filtRes, setFiltRes]         = useState('false')
  const [filtrosAb, setFiltrosAb]     = useState(false)

  // Loading
  const [carregKpis, setCarregKpis] = useState(true)
  const [carregLst, setCarregLst]   = useState(true)
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
    const { dados } = await buscarKpisAlteracoes()
    if (refKpis.current !== sig) return
    setKpis(dados)
    setCarregKpis(false)
  }, [])

  useEffect(() => { carregarKpis() }, [carregarKpis])
  useAutoRefresh(carregarKpis, 60000)

  // ── Lista ───────────────────────────────────────────────────────────
  const carregarLista = useCallback(async () => {
    const sig = [pagina, dataIni, dataFim, filtTipo, filtPrior, motDeb, rotaDeb, filtRes].join('|')
    refLst.current = sig
    setCarregLst(true)
    setErroLst('')

    const resolvidoFiltro = filtRes === '' ? undefined : filtRes === 'true'

    const { dados, total: t, erro } = await buscarAlteracoes({
      data_inicio: dataIni    || undefined,
      data_fim:    dataFim    || undefined,
      tipo:        filtTipo   || undefined,
      prioridade:  filtPrior  || undefined,
      motorista:   motDeb     || undefined,
      rota:        rotaDeb    || undefined,
      resolvido:   resolvidoFiltro,
      pagina,
      porPagina:   POR_PAGINA,
    })

    if (refLst.current !== sig) return
    if (erro) { setErroLst(erro); setAlteracoes([]); setTotal(0) }
    else       { setAlteracoes(dados); setTotal(t) }
    setCarregLst(false)
  }, [pagina, dataIni, dataFim, filtTipo, filtPrior, motDeb, rotaDeb, filtRes])

  useEffect(() => { carregarLista() }, [carregarLista])

  // ── Ações de formulário ──────────────────────────────────────────────────
  async function handleSalvar(form) {
    setSalvando(true)
    setErroModal('')

    const { erro } = editando
      ? await editarAlteracao(editando.id, form, nomeUsuario)
      : await criarAlteracao(form, nomeUsuario)

    setSalvando(false)
    if (erro) { setErroModal(erro); return }

    setMsgSucesso(editando ? 'Alteração atualizada.' : 'Alteração criada.')
    setTimeout(() => setMsgSucesso(''), 3000)
    fecharModal()
    carregarKpis()
    setPagina(1)
    carregarLista()
  }

  function fecharModal() {
    setModalAberto(false)
    setEditando(null)
    setErroModal('')
  }

  function abrirEditar(alteracao) {
    setEditando(alteracao)
    setErroModal('')
    setModalAberto(true)
  }

  async function handleResolver(id) {
    const { erro } = await resolverAlteracao(id, nomeUsuario)
    if (erro) { setErroLst(erro); return }
    carregarKpis()
    carregarLista()
  }

  async function handleExcluir() {
    if (!confirmExclusao) return
    setExcluindo(true)
    const { sucesso, erro: e } = await excluirAlteracao(confirmExclusao.id, nomeUsuario)
    setExcluindo(false)
    setConfirmExclusao(null)
    if (!sucesso) { setErroLst(e || 'Erro ao excluir.'); return }
    carregarKpis()
    carregarLista()
  }

  function limparFiltros() {
    setDataIni(''); setDataFim(''); setFiltTipo(''); setFiltPrior('')
    setFiltMot(''); setFiltRota(''); setFiltRes('false')
    setPagina(1)
  }

  const temFiltro = dataIni || dataFim || filtTipo || filtPrior || filtMot || filtRota || filtRes !== 'false'

  // ─────────────────────────────────────────────────────
  return (
    <div className="ao-page">

      {/* Cabeçalho */}
      <div className="ao-header">
        <div className="ao-header-left">
          <div className="ao-header-icon">
            <IconEdit width={22} height={22} />
          </div>
          <div>
            <h2 className="ao-titulo">Alterações do Dia</h2>
            <p className="ao-desc">Registro de alterações operacionais — substitui avisos por WhatsApp</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" size="sm"
            onClick={() => { carregarKpis(); carregarLista() }}>
            Atualizar
          </Button>
          <Button variant="primary" size="sm"
            onClick={() => { setEditando(null); setErroModal(''); setModalAberto(true) }}>
            + Nova Alteração
          </Button>
        </div>
      </div>

      {/* KPIs */}
      {!carregKpis && kpis && (
        <div className="ao-kpis">
          <CardKpi label="Alterações hoje"    valor={kpis.alteracoes_hoje} cor="var(--orange)" />
          <CardKpi label="Abertas"            valor={kpis.abertas}         cor="var(--amber)"  />
          <CardKpi label="Críticas abertas"   valor={kpis.criticas}        cor="var(--red)"    destaque={kpis.criticas > 0} />
          <CardKpi label="Resolvidas"         valor={kpis.resolvidas}      cor="var(--green)"  />
        </div>
      )}

      {/* Sucesso */}
      {msgSucesso && <div className="ao-sucesso">{msgSucesso}</div>}

      {/* Filtros */}
      <div className="ao-filtros-card">
        <button type="button" className="ao-filtros-toggle"
          onClick={() => setFiltrosAb(p => !p)}>
          Filtros
          {temFiltro && <span className="ao-filtros-badge">ativo</span>}
          <span className="ao-filtros-chevron">{filtrosAb ? '▲' : '▼'}</span>
        </button>
        {filtrosAb && (
          <div className="ao-filtros-corpo">
            <div className="ao-fg">
              <label className="ao-fl">Período</label>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="date" value={dataIni}
                  onChange={e => { setDataIni(e.target.value); setPagina(1) }} className="ao-fi" />
                <span style={{ fontSize: 12, color: 'var(--text3)' }}>até</span>
                <input type="date" value={dataFim}
                  onChange={e => { setDataFim(e.target.value); setPagina(1) }} className="ao-fi" />
              </div>
            </div>
            <div className="ao-fg">
              <label className="ao-fl">Tipo</label>
              <select value={filtTipo}
                onChange={e => { setFiltTipo(e.target.value); setPagina(1) }} className="ao-fs">
                <option value="">Todos</option>
                {TIPOS_ALTERACAO.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="ao-fg">
              <label className="ao-fl">Prioridade</label>
              <select value={filtPrior}
                onChange={e => { setFiltPrior(e.target.value); setPagina(1) }} className="ao-fs">
                <option value="">Todas</option>
                {PRIORIDADES.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
            <div className="ao-fg">
              <label className="ao-fl">Motorista</label>
              <input type="search" placeholder="Buscar…" value={filtMot}
                onChange={e => { setFiltMot(e.target.value); setPagina(1) }} className="ao-fi" />
            </div>
            <div className="ao-fg">
              <label className="ao-fl">Rota</label>
              <input type="search" placeholder="Buscar…" value={filtRota}
                onChange={e => { setFiltRota(e.target.value); setPagina(1) }} className="ao-fi" />
            </div>
            <div className="ao-fg">
              <label className="ao-fl">Status</label>
              <select value={filtRes}
                onChange={e => { setFiltRes(e.target.value); setPagina(1) }} className="ao-fs">
                <option value="">Todos</option>
                <option value="false">Abertas</option>
                <option value="true">Resolvidas</option>
              </select>
            </div>
            {temFiltro && (
              <div className="ao-fg" style={{ justifyContent: 'flex-end' }}>
                <Button variant="ghost" size="sm" onClick={limparFiltros}>Limpar</Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Lista */}
      <div className="ao-lista-card">
        <div className="ao-lista-header">
          <span className="ao-lista-titulo">
            Alterações
            {filtRes === 'false' && <span className="ao-lista-sub"> — abertas</span>}
          </span>
          <span className="ao-lista-count">{total.toLocaleString('pt-BR')} registro(s)</span>
        </div>
        {erroLst && (
          <div className="ao-erro" style={{ margin: 16 }}>
            <IconAlertCircle width={15} height={15} /> {erroLst}
          </div>
        )}
        <TabelaAlteracoes
          dados={alteracoes}
          total={total}
          pagina={pagina}
          onMudarPagina={setPagina}
          carregando={carregLst}
          onEditar={abrirEditar}
          onResolver={handleResolver}
          onExcluir={setConfirmExclusao}
        />
      </div>

      {/* Modal criar/editar */}
      {modalAberto && (
        <FormAlteracao
          inicial={editando}
          titulo={editando ? 'Editar Alteração' : 'Nova Alteração'}
          onSalvar={handleSalvar}
          onCancelar={fecharModal}
          salvando={salvando}
          erro={erroModal}
        />
      )}
    <ConfirmDialog
      aberto={!!confirmExclusao}
      titulo="Mover para a Lixeira"
      mensagem={confirmExclusao ? `A alteração "${confirmExclusao.tipo ?? ''}" será movida para a Lixeira. Pode ser restaurada depois.` : ''}
      textoConfirmar="Mover para Lixeira"
      variantConfirmar="danger"
      carregando={excluindo}
      onConfirmar={handleExcluir}
      onCancelar={() => setConfirmExclusao(null)}
    />
    </div>
  )
}
