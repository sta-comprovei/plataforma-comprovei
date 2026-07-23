import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  listarAuditoria,
  listarUsuariosComAuditoria,
  ROTULOS_TIPO_ACAO,
  ROTULOS_TABELA,
} from '../lib/auditoriaService'
import { useDebouncedValue } from '../lib/useDebouncedValue'

import Pagination from '../components/ui/Pagination'
import Button from '../components/ui/Button'
import {
  IconSearch,
  IconArrowLeft,
  IconHistory,
  IconAlertCircle,
} from '../components/ui/Icons'

import AuditoriaDetalheModal from './AuditoriaDetalheModal'
import './Auditoria.css'

const POR_PAGINA = 20

function formatarDataCurta(dataHora) {
  const d = new Date(dataHora)
  return {
    data: d.toLocaleDateString('pt-BR'),
    hora: d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
  }
}

function iniciais(nome) {
  return (nome || '?').trim().charAt(0).toUpperCase()
}

export default function Auditoria() {
  const navigate = useNavigate()

  // ---- filtros ----
  const [busca, setBusca] = useState('')
  const buscaDebounced = useDebouncedValue(busca, 350)
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [usuarioId, setUsuarioId] = useState('')
  const [tipoAcao, setTipoAcao] = useState('')
  const [tabelaAfetada, setTabelaAfetada] = useState('')
  const [pagina, setPagina] = useState(1)

  // ---- dados ----
  const [registros, setRegistros] = useState([])
  const [total, setTotal] = useState(0)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [usuariosDisponiveis, setUsuariosDisponiveis] = useState([])
  const [registroSelecionado, setRegistroSelecionado] = useState(null)

  // assinatura do filtro atual, para resetar a página com segurança quando
  // qualquer filtro muda (mesmo padrão validado no módulo de Motoristas)
  const assinaturaFiltro = `${buscaDebounced}::${dataInicio}::${dataFim}::${usuarioId}::${tipoAcao}::${tabelaAfetada}`
  const filtroAnteriorRef = useRef(assinaturaFiltro)
  const ultimaBuscaAutomaticaRef = useRef('')

  const carregarAuditoria = useCallback(
    async ({ forcar = false } = {}) => {
      const mudouFiltro = assinaturaFiltro !== filtroAnteriorRef.current
      const paginaEfetiva = mudouFiltro ? 1 : pagina
      const chaveCompleta = `${assinaturaFiltro}::${paginaEfetiva}`

      if (!forcar && chaveCompleta === ultimaBuscaAutomaticaRef.current) {
        return
      }

      setCarregando(true)
      setErro('')

      if (mudouFiltro) {
        filtroAnteriorRef.current = assinaturaFiltro
        if (pagina !== 1) setPagina(1)
      }

      const resultado = await listarAuditoria({
        busca: buscaDebounced,
        dataInicio,
        dataFim,
        usuarioId,
        tipoAcao,
        tabelaAfetada,
        pagina: paginaEfetiva,
        porPagina: POR_PAGINA,
      })
      setCarregando(false)
      ultimaBuscaAutomaticaRef.current = chaveCompleta

      if (resultado.erro) {
        setErro(resultado.erro)
        setRegistros([])
        setTotal(0)
        return
      }
      setRegistros(resultado.dados)
      setTotal(resultado.total)
    },
    [assinaturaFiltro, pagina, buscaDebounced, dataInicio, dataFim, usuarioId, tipoAcao, tabelaAfetada]
  )

  useEffect(() => {
    carregarAuditoria()
  }, [carregarAuditoria])

  useEffect(() => {
    listarUsuariosComAuditoria().then((resultado) => {
      if (!resultado.erro) setUsuariosDisponiveis(resultado.dados)
    })
  }, [])

  function limparFiltros() {
    setBusca('')
    setDataInicio('')
    setDataFim('')
    setUsuarioId('')
    setTipoAcao('')
    setTabelaAfetada('')
  }

  const temFiltroAtivo = !!(busca || dataInicio || dataFim || usuarioId || tipoAcao || tabelaAfetada)

  return (
    <div>
      <div className="aud-header">
        <button
          type="button"
          className="aud-back-btn"
          onClick={() => navigate('/configuracoes')}
          aria-label="Voltar para Configurações"
        >
          <IconArrowLeft width={17} height={17} />
        </button>
        <div className="aud-header-text">
          <h2>Histórico de Alterações</h2>
          <p>Registro permanente de auditoria de todas as alterações realizadas no sistema.</p>
        </div>
      </div>

      <div className="aud-filters-card">
        <div className="aud-filters-grid">
          <div className="aud-field" style={{ gridColumn: 'span 2' }}>
            <label>Pesquisar</label>
            <div className="aud-search-wrap">
              <IconSearch />
              <input
                type="text"
                placeholder="Usuário, tabela, observação..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                aria-label="Pesquisar no histórico de alterações"
              />
            </div>
          </div>

          <div className="aud-field">
            <label>De</label>
            <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
          </div>

          <div className="aud-field">
            <label>Até</label>
            <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
          </div>

          <div className="aud-field">
            <label>Usuário</label>
            <select value={usuarioId} onChange={(e) => setUsuarioId(e.target.value)}>
              <option value="">Todos os usuários</option>
              {usuariosDisponiveis.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="aud-field">
            <label>Tipo de ação</label>
            <select value={tipoAcao} onChange={(e) => setTipoAcao(e.target.value)}>
              <option value="">Todas as ações</option>
              {Object.entries(ROTULOS_TIPO_ACAO).map(([valor, label]) => (
                <option key={valor} value={valor}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="aud-field">
            <label>Tabela afetada</label>
            <select value={tabelaAfetada} onChange={(e) => setTabelaAfetada(e.target.value)}>
              <option value="">Todas as tabelas</option>
              {Object.entries(ROTULOS_TABELA).map(([valor, label]) => (
                <option key={valor} value={valor}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {temFiltroAtivo && (
            <div className="aud-filters-actions">
              <Button variant="ghost" size="sm" onClick={limparFiltros} style={{ width: '100%' }}>
                Limpar filtros
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="aud-table-card">
        <div className="aud-table-wrap">
          <table className="aud-table">
            <thead>
              <tr>
                <th>Data/Hora</th>
                <th>Usuário</th>
                <th>Ação</th>
                <th>Tabela</th>
                <th>Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {!carregando && !erro && registros.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <EstadoVazio temFiltroAtivo={temFiltroAtivo} />
                  </td>
                </tr>
              )}
              {!carregando &&
                !erro &&
                registros.map((r) => {
                  const { data, hora } = formatarDataCurta(r.data_hora)
                  return (
                    <tr key={r.id} onClick={() => setRegistroSelecionado(r)}>
                      <td className="aud-data-cell">
                        {data} <span className="aud-hora">{hora}</span>
                      </td>
                      <td>
                        <div className="aud-usuario-cell">
                          <span className="aud-usuario-avatar">{iniciais(r.nome_usuario)}</span>
                          {r.nome_usuario}
                        </div>
                      </td>
                      <td>
                        <span className={`aud-acao-badge aud-acao-${r.tipo_acao}`}>
                          {ROTULOS_TIPO_ACAO[r.tipo_acao] || r.tipo_acao}
                        </span>
                      </td>
                      <td>{ROTULOS_TABELA[r.tabela_afetada] || r.tabela_afetada}</td>
                      <td>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            setRegistroSelecionado(r)
                          }}
                        >
                          Ver
                        </Button>
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
          {carregando && <CarregandoLista />}
          {erro && <ErroLista mensagem={erro} onTentarNovamente={() => carregarAuditoria({ forcar: true })} />}
        </div>

        <div className="aud-cards">
          {carregando && <CarregandoLista />}
          {erro && <ErroLista mensagem={erro} onTentarNovamente={() => carregarAuditoria({ forcar: true })} />}
          {!carregando && !erro && registros.length === 0 && <EstadoVazio temFiltroAtivo={temFiltroAtivo} />}
          {!carregando &&
            !erro &&
            registros.map((r) => {
              const { data, hora } = formatarDataCurta(r.data_hora)
              return (
                <div key={r.id} className="aud-card" onClick={() => setRegistroSelecionado(r)}>
                  <div className="aud-card-top">
                    <span className="aud-card-data">
                      {data} · {hora}
                    </span>
                  </div>
                  <div className="aud-card-usuario">{r.nome_usuario}</div>
                  <div className="aud-card-meta">
                    <span className={`aud-acao-badge aud-acao-${r.tipo_acao}`}>
                      {ROTULOS_TIPO_ACAO[r.tipo_acao] || r.tipo_acao}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--text3)' }}>
                      {ROTULOS_TABELA[r.tabela_afetada] || r.tabela_afetada}
                    </span>
                  </div>
                </div>
              )
            })}
        </div>

        {!erro && (
          <Pagination pagina={pagina} porPagina={POR_PAGINA} total={total} onMudarPagina={setPagina} />
        )}
      </div>

      <AuditoriaDetalheModal registro={registroSelecionado} onFechar={() => setRegistroSelecionado(null)} />
    </div>
  )
}

function EstadoVazio({ temFiltroAtivo }) {
  return (
    <div className="aud-empty">
      <IconHistory />
      <p>
        {temFiltroAtivo
          ? 'Nenhum registro encontrado para os filtros selecionados.'
          : 'Nenhuma alteração registrada ainda.'}
      </p>
    </div>
  )
}

function CarregandoLista() {
  return (
    <div className="aud-empty">
      <p style={{ color: 'var(--text3)' }}>Carregando histórico...</p>
    </div>
  )
}

function ErroLista({ mensagem, onTentarNovamente }) {
  return (
    <div className="aud-empty">
      <IconAlertCircle style={{ color: 'var(--red)' }} />
      <p style={{ color: 'var(--red)', marginBottom: 12 }}>{mensagem}</p>
      <Button variant="secondary" size="sm" onClick={onTentarNovamente}>
        Tentar novamente
      </Button>
    </div>
  )
}
