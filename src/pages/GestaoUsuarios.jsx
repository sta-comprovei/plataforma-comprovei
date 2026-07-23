import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import {
  listarUsuarios,
  excluirUsuario,
  LABEL_PERFIL,
  PERFIS_USUARIO,
} from '../lib/usuariosService'
import { useDebouncedValue } from '../lib/useDebouncedValue'

import Button from '../components/ui/Button'
import StatusBadge from '../components/ui/StatusBadge'
import Pagination from '../components/ui/Pagination'
import Modal from '../components/ui/Modal'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import {
  IconSearch,
  IconPlus,
  IconEdit,
  IconTrash,
  IconShield,
  IconAlertCircle,
  IconUserCircle,
} from '../components/ui/Icons'

import UsuarioForm from './UsuarioForm'
import './GestaoUsuarios.css'

const POR_PAGINA = 15

function formatarData(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function BadgePerfil({ perfil }) {
  const cores = {
    administrador: { bg: 'var(--red-bg)',    cor: 'var(--red)'    },
    gestor:        { bg: 'var(--amber-bg)',   cor: 'var(--amber)'  },
    operador:      { bg: 'var(--blue-bg)',    cor: 'var(--blue)'   },
  }
  const { bg, cor } = cores[perfil] || { bg: 'var(--bg3)', cor: 'var(--text3)' }
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 20,
      fontSize: 11.5,
      fontWeight: 700,
      background: bg,
      color: cor,
      whiteSpace: 'nowrap',
    }}>
      {LABEL_PERFIL[perfil] ?? perfil}
    </span>
  )
}

export default function GestaoUsuarios() {
  const { usuario: usuarioLogado } = useAuth()

  // ── filtros ───────────────────────────────────────────────────────────
  const [busca,   setBusca]   = useState('')
  const [perfil,  setPerfil]  = useState('')
  const [situacao, setSituacao] = useState('') // '' | 'ativo' | 'inativo'
  const [pagina,  setPagina]  = useState(1)
  const buscaDebounced = useDebouncedValue(busca, 350)

  // ── dados ───────────────────────────────────────────────────────────
  const [usuarios,    setUsuarios]    = useState([])
  const [total,       setTotal]       = useState(0)
  const [carregando,  setCarregando]  = useState(true)
  const [erroLista,   setErroLista]   = useState('')

  // ── modais ───────────────────────────────────────────────────────────
  const [formAberto,  setFormAberto]  = useState(false)
  const [editando,    setEditando]    = useState(null)   // usuario completo
  const [confirmExclusao, setConfirmExclusao] = useState(null)
  const [processando, setProcessando] = useState(false)
  const [feedback,    setFeedback]    = useState(null)   // { tipo, texto }

  // reset de página ao mudar filtros
  const filtrosRef = useRef({ busca: '', perfil: '', situacao: '' })
  useEffect(() => {
    const prev = filtrosRef.current
    if (prev.busca !== buscaDebounced || prev.perfil !== perfil || prev.situacao !== situacao) {
      filtrosRef.current = { busca: buscaDebounced, perfil, situacao }
      setPagina(1)
    }
  }, [buscaDebounced, perfil, situacao])

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErroLista('')
    const ativoFiltro = situacao === 'ativo' ? true : situacao === 'inativo' ? false : null
    const res = await listarUsuarios({
      busca: buscaDebounced,
      perfil,
      ativo: ativoFiltro,
      pagina,
      porPagina: POR_PAGINA,
    })
    setCarregando(false)
    if (res.erro) { setErroLista(res.erro); return }
    setUsuarios(res.dados)
    setTotal(res.total)
  }, [buscaDebounced, perfil, situacao, pagina])

  useEffect(() => { carregar() }, [carregar])

  useEffect(() => {
    if (!feedback) return
    const t = setTimeout(() => setFeedback(null), 4000)
    return () => clearTimeout(t)
  }, [feedback])

  function abrirCriacao() {
    setEditando(null)
    setFormAberto(true)
  }

  function abrirEdicao(u) {
    setEditando(u)
    setFormAberto(true)
  }

  function handleSalvo() {
    setFormAberto(false)
    setFeedback({ tipo: 'success', texto: editando ? 'Usuário atualizado com sucesso.' : 'Usuário criado com sucesso.' })
    carregar()
  }

  async function confirmarExclusao() {
    if (!confirmExclusao) return
    setProcessando(true)
    const { erro } = await excluirUsuario(confirmExclusao.id)
    setProcessando(false)
    setConfirmExclusao(null)
    if (erro) { setFeedback({ tipo: 'error', texto: erro }); return }
    setFeedback({ tipo: 'success', texto: `Usuário "${confirmExclusao.nome}" excluído.` })
    carregar()
  }

  const ehEuMesmo = (u) => u.id === usuarioLogado?.id

  return (
    <div className="gu-page">
      {/* Cabeçalho */}
      <div className="gu-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="gu-header-icon">
            <IconShield width={22} height={22} />
          </div>
          <div>
            <h2 className="gu-titulo">Usuários e Permissões</h2>
            <p className="gu-subtitulo">Gerencie os acessos ao sistema. Somente administradores visualizam esta área.</p>
          </div>
        </div>
        <Button variant="primary" icon={IconPlus} onClick={abrirCriacao}>
          Novo usuário
        </Button>
      </div>

      {/* Feedback */}
      {feedback && (
        <div className={`gu-feedback gu-feedback-${feedback.tipo}`}>
          {feedback.tipo === 'error' && <IconAlertCircle width={15} height={15} />}
          {feedback.texto}
        </div>
      )}

      {/* Filtros */}
      <div className="gu-filtros">
        <div className="gu-busca-wrap">
          <IconSearch className="gu-busca-icon" />
          <input
            className="gu-busca-input"
            type="text"
            placeholder="Buscar por nome ou e-mail..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select
            className="gu-select"
            value={perfil}
            onChange={e => setPerfil(e.target.value)}
            aria-label="Filtrar por perfil"
          >
            <option value="">Todos os perfis</option>
            {PERFIS_USUARIO.map(p => (
              <option key={p.valor} value={p.valor}>{p.label}</option>
            ))}
          </select>
          <select
            className="gu-select"
            value={situacao}
            onChange={e => setSituacao(e.target.value)}
            aria-label="Filtrar por situação"
          >
            <option value="">Todas as situações</option>
            <option value="ativo">Ativos</option>
            <option value="inativo">Inativos</option>
          </select>
        </div>
      </div>

      {/* Tabela */}
      <div className="gu-card">
        <div className="gu-table-wrap">
          <table className="gu-table">
            <thead>
              <tr>
                <th>Usuário</th>
                <th>Perfil</th>
                <th>Situação</th>
                <th>Último acesso</th>
                <th>Criado em</th>
                <th style={{ textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {carregando && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text3)', padding: 32 }}>
                    Carregando...
                  </td>
                </tr>
              )}
              {!carregando && erroLista && (
                <tr>
                  <td colSpan={6}>
                    <div className="gu-erro-lista">
                      <IconAlertCircle width={16} />
                      {erroLista}
                    </div>
                  </td>
                </tr>
              )}
              {!carregando && !erroLista && usuarios.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text3)', padding: 32 }}>
                    Nenhum usuário encontrado para os filtros selecionados.
                  </td>
                </tr>
              )}
              {!carregando && !erroLista && usuarios.map(u => (
                <tr key={u.id} className={ehEuMesmo(u) ? 'gu-row-eu' : ''}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <IconUserCircle width={18} height={18} style={{ color: 'var(--text3)', flexShrink: 0 }} />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13.5 }}>
                          {u.nome}
                          {ehEuMesmo(u) && (
                            <span className="gu-badge-eu">você</span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text3)' }}>{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td><BadgePerfil perfil={u.perfil} /></td>
                  <td><StatusBadge ativo={u.ativo} /></td>
                  <td style={{ fontSize: 12.5, color: 'var(--text3)' }}>
                    {formatarData(u.last_sign_in_at)}
                  </td>
                  <td style={{ fontSize: 12.5, color: 'var(--text3)' }}>
                    {formatarData(u.created_at)}
                  </td>
                  <td>
                    <div className="gu-acoes">
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={IconEdit}
                        onClick={() => abrirEdicao(u)}
                        aria-label={`Editar ${u.nome}`}
                      />
                      {!ehEuMesmo(u) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={IconTrash}
                          onClick={() => setConfirmExclusao(u)}
                          aria-label={`Excluir ${u.nome}`}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Cards mobile */}
        <div className="gu-cards">
          {!carregando && !erroLista && usuarios.map(u => (
            <div key={u.id} className="gu-card-item">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 2 }}>
                    {u.nome}
                    {ehEuMesmo(u) && <span className="gu-badge-eu">você</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>{u.email}</div>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <Button variant="ghost" size="sm" icon={IconEdit} onClick={() => abrirEdicao(u)} />
                  {!ehEuMesmo(u) && (
                    <Button variant="ghost" size="sm" icon={IconTrash} onClick={() => setConfirmExclusao(u)} />
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <BadgePerfil perfil={u.perfil} />
                <StatusBadge ativo={u.ativo} />
              </div>
            </div>
          ))}
        </div>

        {!erroLista && (
          <Pagination pagina={pagina} porPagina={POR_PAGINA} total={total} onMudarPagina={setPagina} />
        )}
      </div>

      {/* Modal de criação/edição */}
      <Modal
        aberto={formAberto}
        titulo={editando ? `Editar usuário — ${editando.nome}` : 'Novo usuário'}
        onFechar={() => setFormAberto(false)}
      >
        <UsuarioForm
          usuario={editando}
          onSalvo={handleSalvo}
          onCancelar={() => setFormAberto(false)}
        />
      </Modal>

      {/* Confirmação de exclusão */}
      <ConfirmDialog
        aberto={!!confirmExclusao}
        titulo="Excluir usuário"
        mensagem={
          confirmExclusao
            ? `Tem certeza que deseja excluir "${confirmExclusao.nome}" (${confirmExclusao.email})? Esta ação não pode ser desfeita.`
            : ''
        }
        textoConfirmar="Excluir"
        variantConfirmar="danger"
        carregando={processando}
        onConfirmar={confirmarExclusao}
        onCancelar={() => setConfirmExclusao(null)}
      />
    </div>
  )
}
