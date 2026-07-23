import { useCallback, useEffect, useState } from 'react'
import { listarRotasDuplicadas, fundirRotas } from '../lib/gerenciarRotasService'
import { useAuth } from '../contexts/AuthContext'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import { IconRoute, IconSearch, IconAlertCircle, IconRefreshCw } from '../components/ui/Icons'
import './GerenciarRotas.css'

export default function GerenciarRotas() {
  const { usuario } = useAuth()
  const nomeUsuario = usuario?.nome || usuario?.email || 'Sistema'
  const [grupos, setGrupos] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const [fusaoAberta, setFusaoAberta] = useState(false)
  const [grupoAtual, setGrupoAtual] = useState(null)
  const [rotaPrincipal, setRotaPrincipal] = useState('')
  const [rotasSecundarias, setRotasSecundarias] = useState([])
  const [fundindo, setFundindo] = useState(false)
  const [erroFusao, setErroFusao] = useState('')
  const [confirmFusao, setConfirmFusao] = useState(false)
  const [feedback, setFeedback] = useState(null)

  const carregar = useCallback(async () => {
    setCarregando(true); setErro('')
    const { dados, erro: e } = await listarRotasDuplicadas()
    setCarregando(false)
    if (e) { setErro(e); return }
    setGrupos(dados)
  }, [])

  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { if (!feedback) return; const t = setTimeout(() => setFeedback(null), 5000); return () => clearTimeout(t) }, [feedback])

  function abrirFusao(g) {
    setGrupoAtual(g); setRotaPrincipal(g.rotas[0]); setRotasSecundarias(g.rotas.slice(1)); setErroFusao(''); setFusaoAberta(true)
  }

  async function executarFusao() {
    setConfirmFusao(false); if (!grupoAtual || !rotaPrincipal) return
    setFundindo(true); setErroFusao('')
    let totalOps = 0; const erros = []
    for (const ra of rotasSecundarias) {
      const { dados, erro: e } = await fundirRotas(ra, rotaPrincipal, nomeUsuario)
      if (e) erros.push(`"${ra}": ${e}`); else totalOps += dados?.operacoes ?? 0
    }
    setFundindo(false)
    if (erros.length > 0) { setErroFusao(erros.join(' | ')); return }
    setFusaoAberta(false)
    setFeedback({ tipo:'sucesso', texto:`Rotas fundidas em "${rotaPrincipal}". ${totalOps} operação(ões) atualizada(s).` })
    carregar()
  }

  const gruposFiltrados = busca ? grupos.filter(g => g.rotas.some(r => r.toLowerCase().includes(busca.toLowerCase()))) : grupos

  return (
    <div className="gr-page">
      <div className="gr-header">
        <div className="gr-header-icon"><IconRoute width={22} height={22} /></div>
        <div>
          <h2 className="gr-titulo">Gerenciar Rotas</h2>
          <p className="gr-subtitulo">Detecta rotas duplicadas (maiúsculas, acentos, espaços). Funde sem perder histórico.</p>
        </div>
      </div>
      {feedback && <div className={`gr-feedback gr-feedback-${feedback.tipo}`}>{feedback.texto}</div>}
      <div className="gr-filtros">
        <div className="gr-busca-wrap"><IconSearch className="gr-busca-icon" /><input className="gr-busca-input" placeholder="Filtrar rota..." value={busca} onChange={e => setBusca(e.target.value)} /></div>
        <Button variant="ghost" icon={IconRefreshCw} onClick={carregar} disabled={carregando}>Atualizar</Button>
      </div>
      {carregando && <div className="gr-estado">Analisando rotas...</div>}
      {!carregando && erro && <div className="gr-estado gr-estado-erro"><IconAlertCircle width={16} /> {erro}</div>}
      {!carregando && !erro && gruposFiltrados.length === 0 && <div className="gr-estado">✓ Nenhuma rota duplicada encontrada.</div>}
      {!carregando && !erro && gruposFiltrados.length > 0 && (
        <div className="gr-lista">
          {gruposFiltrados.map((g, i) => (
            <div key={i} className="gr-card">
              <div className="gr-card-header">
                <div><div className="gr-card-titulo">{g.rotas.length} variante(s) — normalizado: <strong>{g.rota_normalizada}</strong></div></div>
                <Button variant="primary" size="sm" onClick={() => abrirFusao(g)}>Fundir rotas</Button>
              </div>
              <div className="gr-card-rotas">{g.rotas.map((r, j) => <span key={j} className="gr-badge-rota">{r}</span>)}</div>
              <div className="gr-card-stats"><span>{g.total_operacoes} operação(ões)</span>{g.lead_time_medio && <span>LT médio: {g.lead_time_medio}h</span>}</div>
            </div>
          ))}
        </div>
      )}
      <Modal aberto={fusaoAberta} titulo="Fundir rotas duplicadas" onFechar={() => setFusaoAberta(false)}>
        {grupoAtual && (
          <div>
            <p style={{ fontSize:13, color:'var(--text2)', marginBottom:16 }}>Escolha a rota principal. As demais serão atualizadas em todo o sistema.</p>
            <div className="gr-fusao-lista">
              {grupoAtual.rotas.map((r, i) => (
                <label key={i} className={`gr-fusao-item${rotaPrincipal===r?' selecionado':''}`}>
                  <input type="radio" name="rota-principal" value={r} checked={rotaPrincipal===r} onChange={() => { setRotaPrincipal(r); setRotasSecundarias(grupoAtual.rotas.filter(x=>x!==r)) }} />
                  <span className="gr-fusao-rota">{r}</span>
                  {rotaPrincipal===r && <span className="gr-badge-principal">Principal</span>}
                </label>
              ))}
            </div>
            {erroFusao && <div className="gr-erro-fusao"><IconAlertCircle width={14} /> {erroFusao}</div>}
            <div style={{ display:'flex', gap:8, marginTop:20 }}>
              <Button variant="ghost" onClick={() => setFusaoAberta(false)} style={{ flex:1 }}>Cancelar</Button>
              <Button variant="primary" onClick={() => setConfirmFusao(true)} disabled={fundindo} style={{ flex:2 }}>Fundir rotas</Button>
            </div>
          </div>
        )}
      </Modal>
      <ConfirmDialog aberto={confirmFusao} titulo="Confirmar fusão" mensagem={grupoAtual&&rotaPrincipal?`As rotas ${rotasSecundarias.map(r=>`"${r}"`).join(', ')} serão renomeadas para "${rotaPrincipal}" em todo o sistema. Deseja continuar?`:''} textoConfirmar="Fundir" variantConfirmar="danger" carregando={fundindo} onConfirmar={executarFusao} onCancelar={() => setConfirmFusao(false)} />
    </div>
  )
}
