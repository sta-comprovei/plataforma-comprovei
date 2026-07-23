import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAutoRefresh } from '../lib/useAutoRefresh'
import { useAuth } from '../contexts/AuthContext'
import {
  buscarRotasAtrasadas, buscarRotasPiorDesempenho, buscarRotasMelhoraram,
  buscarMotoristasComDivergencias, buscarImportacoesPendentes, buscarKpisPendentesCI,
  buscarRotasDuplicadasCI, buscarImportacoesSemIndicadores, buscarRotasSemPrazo, buscarPrevisaoAtraso
} from '../lib/inteligenciaService'
import Button from '../components/ui/Button'
import { IconTarget, IconTrendingDown, IconTrendingUp, IconTruck, IconUpload, IconAlert, IconRoute, IconBarChart, IconMapPin, IconAlertCircle, IconRefreshCw } from '../components/ui/Icons'
import './CentroInteligencia.css'

function fmtHoras(min) { if (min==null) return '—'; const h=Math.round(min/60*10)/10; return h>=24?`${Math.round(h/24*10)/10}d`:`${h}h` }
function fmtData(iso) { if (!iso) return '—'; return new Date(iso).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit'}) }
function fmtComp(c) { if (!c) return '—'; const[a,m]=c.split('-'); return `${'JanFevMarAbrMaiJunJulAgoSetOutNovDez'.slice((+m-1)*3,(+m)*3)}/${a}` }

function Cartao({ titulo, subtitulo, icone:Icone, cor, badge, carregando, erro, vazio, children, acoes }) {
  return (
    <div className="ci-card">
      <div className="ci-card-header">
        <div className={`ci-card-icon ${cor??'neutro'}`}><Icone width={18} height={18}/></div>
        <div className="ci-card-titulo-wrap"><div className="ci-card-titulo">{titulo}</div>{subtitulo&&<div className="ci-card-sub">{subtitulo}</div>}</div>
        {badge!=null&&<span className={`ci-card-badge ${cor??'neutro'}`}>{badge}</span>}
      </div>
      <div className="ci-card-body">
        {carregando&&<div className="ci-card-carregando">Carregando…</div>}
        {!carregando&&erro&&<div className="ci-card-erro">{erro}</div>}
        {!carregando&&!erro&&vazio&&<div className="ci-card-vazio">✓ Nenhuma ocorrência.</div>}
        {!carregando&&!erro&&!vazio&&children}
      </div>
      {acoes&&<div className="ci-card-footer">{acoes}</div>}
    </div>
  )
}

export default function CentroInteligencia() {
  const navigate = useNavigate()
  const { perfil } = useAuth()
  const isAdmin = perfil === 'administrador'

  const [rotasAtrasadas,setRotasAtrasadas]=useState([])
  const [piorDesempenho,setPiorDesempenho]=useState([])
  const [melhoraram,setMelhoraram]=useState([])
  const [divergencias,setDivergencias]=useState([])
  const [impPendentes,setImpPendentes]=useState([])
  const [kpisPendentes,setKpisPendentes]=useState(null)
  const [rotasDup,setRotasDup]=useState([])
  const [semIndicadores,setSemIndicadores]=useState([])
  const [semPrazo,setSemPrazo]=useState([])
  const [previsaoAtraso,setPrevisaoAtraso]=useState([])
  const [carregando,setCarregando]=useState(true)
  const [erros,setErros]=useState({})
  const [atualizadoEm,setAtualizadoEm]=useState(null)
  const ref=useRef(0)

  const carregar = useCallback(async () => {
    const sig=++ref.current; setCarregando(true)
    const rs=await Promise.allSettled([
      buscarRotasAtrasadas(),buscarRotasPiorDesempenho(),buscarRotasMelhoraram(),buscarMotoristasComDivergencias(),
      buscarImportacoesPendentes(),buscarKpisPendentesCI(),buscarRotasDuplicadasCI(),buscarImportacoesSemIndicadores(),buscarRotasSemPrazo(),buscarPrevisaoAtraso()
    ])
    if(ref.current!==sig)return
    const e={}
    function ok(r){return r.status==='fulfilled'?r.value:{dados:null,erro:r.reason?.message??'Erro'}}
    const[v1,v2,v3,v4,v5,v6,v7,v8,v9,v10]=rs.map(ok)
    if(v1.erro)e.rotasAtrasadas=v1.erro;else setRotasAtrasadas(v1.dados??[])
    if(v2.erro)e.piorDesempenho=v2.erro;else setPiorDesempenho(v2.dados??[])
    if(v3.erro)e.melhoraram=v3.erro;else setMelhoraram(v3.dados??[])
    if(v4.erro)e.divergencias=v4.erro;else setDivergencias(v4.dados??[])
    if(v5.erro)e.impPendentes=v5.erro;else setImpPendentes(v5.dados??[])
    if(v6.erro)e.kpisPendentes=v6.erro;else setKpisPendentes(v6.dados)
    if(v7.erro)e.rotasDup=v7.erro;else setRotasDup(v7.dados??[])
    if(v8.erro)e.semIndicadores=v8.erro;else setSemIndicadores(v8.dados??[])
    if(v9.erro)e.semPrazo=v9.erro;else setSemPrazo(v9.dados??[])
    if(v10.erro)e.previsaoAtraso=v10.erro;else setPrevisaoAtraso(v10.dados??[])
    setErros(e); setCarregando(false); setAtualizadoEm(new Date())
  }, [])

  useEffect(()=>{carregar()},[carregar])
  useAutoRefresh(carregar, 5*60*1000)

  const kpip=kpisPendentes??{}

  return (
    <div className="ci-page">
      <div className="ci-header">
        <div className="ci-header-icon"><IconTarget width={24} height={24}/></div>
        <div style={{flex:1}}><h2 className="ci-titulo">Centro de Inteligência Operacional</h2><p className="ci-subtitulo">Painel automático de atenção — alimentado em tempo real.</p></div>
        <Button variant="ghost" size="sm" icon={IconRefreshCw} onClick={carregar} disabled={carregando}>Atualizar</Button>
      </div>
      {atualizadoEm&&<div className="ci-atualizado">Atualizado às {atualizadoEm.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</div>}
      <div className="ci-grid">

        <Cartao titulo="Rotas Atrasadas" subtitulo="Acima do prazo cadastrado ou meta da categoria" icone={IconAlertCircle} cor={rotasAtrasadas.length>0?'vermelho':'verde'} badge={rotasAtrasadas.length} carregando={carregando} erro={erros.rotasAtrasadas} vazio={rotasAtrasadas.length===0} acoes={rotasAtrasadas.length>0&&<Button variant="ghost" size="sm" onClick={()=>navigate('/leadtime')}>Ver Lead Time</Button>}>
          <table className="ci-mini-table"><thead><tr><th>Rota</th><th>Prazo</th><th>LT Médio</th><th>Excede</th></tr></thead><tbody>{rotasAtrasadas.slice(0,8).map(r=><tr key={r.rota}><td style={{fontWeight:600}}>{r.rota}</td><td>{fmtHoras(r.prazo_efetivo_min)}</td><td style={{color:'var(--red)',fontWeight:700}}>{fmtHoras(r.media_min)}</td><td style={{color:'var(--red)',fontWeight:700}}>+{fmtHoras(r.diferenca_min)}</td></tr>)}</tbody></table>
        </Cartao>

        <Cartao titulo="Pior Desempenho" subtitulo="Top 10 menor eficiência" icone={IconTrendingDown} cor={piorDesempenho.length>0?'vermelho':'verde'} badge={piorDesempenho.length} carregando={carregando} erro={erros.piorDesempenho} vazio={piorDesempenho.length===0} acoes={<Button variant="ghost" size="sm" onClick={()=>navigate('/leadtime')}>Ver detalhes</Button>}>
          <table className="ci-mini-table"><thead><tr><th>Rota</th><th>Eficiência</th><th>LT Médio</th></tr></thead><tbody>{piorDesempenho.map(r=><tr key={r.rota}><td style={{fontWeight:600}}>{r.rota}</td><td><span className={`ci-badge ci-badge-${r.situacao==='vermelho'?'vermelho':r.situacao==='amarelo'?'amarelo':'verde'}`}>{r.eficiencia_pct!=null?`${r.eficiencia_pct}%`:'—'}</span></td><td style={{fontWeight:700}}>{fmtHoras(r.media_min)}</td></tr>)}</tbody></table>
        </Cartao>

        <Cartao titulo="Mais Melhoraram" subtitulo="Últimos 30 dias vs. 30 anteriores" icone={IconTrendingUp} cor={melhoraram.length>0?'verde':'neutro'} badge={melhoraram.length} carregando={carregando} erro={erros.melhoraram} vazio={melhoraram.length===0}>
          <table className="ci-mini-table"><thead><tr><th>Rota</th><th>Ganho</th><th>Antes</th><th>Agora</th></tr></thead><tbody>{melhoraram.map(r=><tr key={r.rota}><td style={{fontWeight:600}}>{r.rota}</td><td style={{color:'var(--green)',fontWeight:700}}>-{r.ganho_pct}%</td><td style={{color:'var(--text3)'}}>{fmtHoras(r.media_anterior_min)}</td><td style={{color:'var(--green)',fontWeight:600}}>{fmtHoras(r.media_recente_min)}</td></tr>)}</tbody></table>
        </Cartao>

        <Cartao titulo="Divergências" subtitulo="Top 10 motoristas por ocorrências" icone={IconTruck} cor={divergencias.length>0?'amarelo':'verde'} badge={divergencias.length} carregando={carregando} erro={erros.divergencias} vazio={divergencias.length===0} acoes={<Button variant="ghost" size="sm" onClick={()=>navigate('/motoristas')}>Ver Motoristas</Button>}>
          <table className="ci-mini-table"><thead><tr><th>Motorista</th><th style={{textAlign:'center'}}>Total</th><th>Última</th></tr></thead><tbody>{divergencias.map(m=><tr key={m.codigo}><td><div style={{fontWeight:600}}>{m.nome}</div></td><td style={{textAlign:'center',fontWeight:700,color:'var(--amber,#b45309)'}}>{m.total}</td><td style={{fontSize:12,color:'var(--text3)'}}>{fmtData(m.ultima_ocorrencia)}</td></tr>)}</tbody></table>
        </Cartao>

        <Cartao titulo="Importações Incompletas" subtitulo="Competências com Comprovei ou Rotina faltando" icone={IconUpload} cor={impPendentes.length>0?'amarelo':'verde'} badge={impPendentes.length} carregando={carregando} erro={erros.impPendentes} vazio={impPendentes.length===0} acoes={isAdmin&&impPendentes.length>0&&<Button variant="ghost" size="sm" onClick={()=>navigate('/importacoes')}>Importar</Button>}>
          <table className="ci-mini-table"><thead><tr><th>Competência</th><th>Faltam</th></tr></thead><tbody>{impPendentes.map(i=><tr key={i.competencia}><td style={{fontWeight:600}}>{fmtComp(i.competencia)}</td><td>{i.faltam.map(f=><span key={f} className="ci-badge ci-badge-amarelo" style={{marginRight:4}}>{f}</span>)}</td></tr>)}</tbody></table>
        </Cartao>

        <Cartao titulo="Operações Pendentes" subtitulo="Retiradas da Operação do Dia" icone={IconAlert} cor={kpip.acima_7_dias>0?'vermelho':kpip.acima_3_dias>0?'amarelo':'verde'} badge={kpip.total??0} carregando={carregando} erro={erros.kpisPendentes} vazio={!kpip.total} acoes={<Button variant="ghost" size="sm" onClick={()=>navigate('/pendencias-operacionais')}>Ver pendências</Button>}>
          <div className="ci-kpi-row">
            <div className="ci-kpi-item"><div className="ci-kpi-valor">{kpip.total??0}</div><div className="ci-kpi-label">Total</div></div>
            <div className="ci-kpi-item"><div className="ci-kpi-valor" style={{color:kpip.acima_3_dias>0?'var(--amber,#b45309)':undefined}}>{kpip.acima_3_dias??0}</div><div className="ci-kpi-label">+3 dias</div></div>
            <div className="ci-kpi-item"><div className="ci-kpi-valor" style={{color:kpip.acima_7_dias>0?'var(--red)':undefined}}>{kpip.acima_7_dias??0}</div><div className="ci-kpi-label">+7 dias</div></div>
          </div>
        </Cartao>

        <Cartao titulo="Rotas Duplicadas" subtitulo="Mesma rota com grafias diferentes" icone={IconRoute} cor={rotasDup.length>0?'amarelo':'verde'} badge={rotasDup.length} carregando={carregando} erro={erros.rotasDup} vazio={rotasDup.length===0} acoes={isAdmin&&rotasDup.length>0&&<Button variant="primary" size="sm" onClick={()=>navigate('/configuracoes/gerenciar-rotas')}>Resolver agora</Button>}>
          <table className="ci-mini-table"><thead><tr><th>Normalização</th><th>Variantes</th><th style={{textAlign:'center'}}>Ops.</th></tr></thead><tbody>{rotasDup.slice(0,6).map((g,i)=><tr key={i}><td style={{fontWeight:600}}>{g.rota_normalizada}</td><td style={{fontSize:11.5,color:'var(--text3)'}}>{(g.rotas??[]).join(', ')}</td><td style={{textAlign:'center'}}>{g.total_operacoes}</td></tr>)}</tbody></table>
        </Cartao>

        <Cartao titulo="Indicadores Comprovei Pendentes" subtitulo="Importações sem indicadores OCR" icone={IconBarChart} cor={semIndicadores.length>0?'amarelo':'verde'} badge={semIndicadores.length} carregando={carregando} erro={erros.semIndicadores} vazio={semIndicadores.length===0}>
          <table className="ci-mini-table"><thead><tr><th>Competência</th><th>Importado em</th><th></th></tr></thead><tbody>{semIndicadores.map(i=><tr key={i.id}><td style={{fontWeight:600}}>{fmtComp(i.competencia)}</td><td style={{fontSize:12,color:'var(--text3)'}}>{fmtData(i.created_at)}</td><td>{isAdmin&&<Button variant="ghost" size="sm" onClick={()=>navigate('/importacoes')}>Adicionar</Button>}</td></tr>)}</tbody></table>
        </Cartao>

        <Cartao titulo="Rotas Sem Prazo" subtitulo="Com operações mas sem prazo específico cadastrado" icone={IconMapPin} cor={semPrazo.length>0?'amarelo':'verde'} badge={semPrazo.length} carregando={carregando} erro={erros.semPrazo} vazio={semPrazo.length===0} acoes={isAdmin&&semPrazo.length>0&&<Button variant="primary" size="sm" onClick={()=>navigate('/prazo-rotas')}>Cadastrar prazos</Button>}>
          <table className="ci-mini-table"><thead><tr><th>Rota</th><th style={{textAlign:'center'}}>Viagens</th></tr></thead><tbody>{semPrazo.slice(0,8).map(r=><tr key={r.rota}><td style={{fontWeight:600}}>{r.rota}</td><td style={{textAlign:'center',color:'var(--text3)'}}>{r.total_viagens}</td></tr>)}</tbody></table>
        </Cartao>

        <Cartao titulo="Previsão de Atraso" subtitulo="Tendência de alta no Lead Time" icone={IconAlertCircle} cor={previsaoAtraso.some(r=>r.risco==='alto')?'vermelho':previsaoAtraso.some(r=>r.risco==='medio')?'amarelo':'verde'} badge={previsaoAtraso.length} carregando={carregando} erro={erros.previsaoAtraso} vazio={previsaoAtraso.length===0}>
          <table className="ci-mini-table"><thead><tr><th>Rota</th><th>Risco</th><th>Variação</th></tr></thead><tbody>{previsaoAtraso.map(r=><tr key={r.rota}><td style={{fontWeight:600}}>{r.rota}</td><td><span className={`ci-badge ci-badge-${r.risco==='alto'?'vermelho':r.risco==='medio'?'amarelo':'verde'}`}>{r.risco==='alto'?'Alto':r.risco==='medio'?'Médio':'Baixo'}</span></td><td style={{color:r.variacao_pct>0?'var(--red)':'var(--green)',fontWeight:700}}>{r.variacao_pct>0?`+${r.variacao_pct}%`:`${r.variacao_pct}%`}</td></tr>)}</tbody></table>
        </Cartao>

      </div>
    </div>
  )
}
