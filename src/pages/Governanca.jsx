import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  buscarSaudeSistema, buscarQualidadeDados, executarValidacaoAutomatica,
  medirPerformance, executarChecklistDeploy
} from '../lib/governancaService'
import { listarMotoristas } from '../lib/motoristasService'
import { buscarPrazosRotas } from '../lib/funilService'
import { buscarMetas } from '../lib/leadTimeService'
import { listarIndicadores } from '../lib/indicadoresComproveiService'
import { listarHistoricoImportacoes } from '../lib/importacoesService'
import { exportarExcel } from '../lib/exportUtils'
import { useAutoRefresh } from '../lib/useAutoRefresh'
import Auditoria from './Auditoria'
import GerenciarRotas from './GerenciarRotas'
import Button from '../components/ui/Button'
import { IconShield, IconBarChart, IconCheck, IconRefreshCw, IconDownload } from '../components/ui/Icons'
import './Governanca.css'

const KEY_M = 'tns_modo_manutencao'
function useModoManutencao() {
  const [ativo, setAtivo] = useState(() => sessionStorage.getItem(KEY_M) === '1')
  function toggle() { const n=!ativo; n?sessionStorage.setItem(KEY_M,'1'):sessionStorage.removeItem(KEY_M); setAtivo(n); window.dispatchEvent(new CustomEvent('manutencao',{detail:{ativo:n}})) }
  return { ativo, toggle }
}

function fmtData(iso) { if(!iso)return'—'; return new Date(iso).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'}) }
function fmtComp(c) { if(!c)return'—'; const[a,m]=c.split('-'); return `${'JanFevMarAbrMaiJunJulAgoSetOutNovDez'.slice((+m-1)*3,(+m)*3)}/${a}` }
function corMs(ms) { return ms>3000?'critico':ms>1500?'lento':'' }

const ABAS = [
  {id:'saude',label:'🩺 Saúde'},{id:'qualidade',label:'🔍 Qualidade'},{id:'auditoria',label:'📋 Auditoria'},
  {id:'rotas_dup',label:'🔀 Rotas Dup.'},{id:'backup',label:'💾 Backup'},{id:'validacao',label:'✅ Validação'},
  {id:'manutencao',label:'🔧 Manutenção'},{id:'performance',label:'⚡ Performance'},{id:'checklist',label:'🚀 Deploy'},
]

export default function Governanca() {
  const [aba, setAba] = useState('saude')
  const { ativo: modoM, toggle: toggleM } = useModoManutencao()
  return (
    <div className="gov-page">
      <div className="gov-header">
        <div className="gov-header-icon"><IconShield width={24} height={24}/></div>
        <div style={{flex:1}}><h2 className="gov-titulo">Governança do Sistema</h2><p className="gov-subtitulo">Saúde, qualidade de dados, auditoria, backup e manutenção preventiva.</p></div>
        {modoM&&<span style={{padding:'6px 14px',borderRadius:'var(--radius2)',background:'var(--amber-bg,#fff7e6)',color:'var(--amber,#b45309)',fontWeight:700,fontSize:13}}>⚠ MODO MANUTENÇÃO</span>}
      </div>
      <div className="gov-abas">
        {ABAS.map(a=><button key={a.id} onClick={()=>setAba(a.id)} className={`gov-aba-btn${aba===a.id?' ativa':''}`}>{a.label}</button>)}
      </div>
      <div>
        {aba==='saude'      &&<AbaSaude/>}
        {aba==='qualidade'  &&<AbaQualidade/>}
        {aba==='auditoria'  &&<Auditoria/>}
        {aba==='rotas_dup'  &&<GerenciarRotas/>}
        {aba==='backup'     &&<AbaBackup/>}
        {aba==='validacao'  &&<AbaValidacao/>}
        {aba==='manutencao' &&<AbaManutencao ativo={modoM} toggle={toggleM}/>}
        {aba==='performance'&&<AbaPerformance/>}
        {aba==='checklist'  &&<AbaChecklist/>}
      </div>
    </div>
  )
}

function AbaSaude() {
  const [d,setD]=useState(null); const [loading,setLoading]=useState(true)
  const carregar=useCallback(async()=>{setLoading(true);const{dados}=await buscarSaudeSistema();setD(dados);setLoading(false)},[])
  useEffect(()=>{carregar()},[carregar]); useAutoRefresh(carregar,60_000)
  if(loading)return<div className="gov-card-vazio">Verificando...</div>
  if(!d)return null
  const sCor=d.status_banco==='saudavel'?'saudavel':d.status_banco==='atencao'?'atencao':'critico'
  const sLabel={saudavel:'🟢 Saudável',atencao:'🟡 Atenção',critico:'🔴 Crítico'}[d.status_banco]??d.status_banco
  return (
    <div>
      <div className="gov-card" style={{marginBottom:16}}>
        <div className="gov-card-header"><h3 className="gov-card-titulo">Status do Banco</h3><span className={`gov-status ${sCor}`}>{sLabel}</span></div>
        <div className="gov-card-body" style={{display:'flex',gap:32,flexWrap:'wrap'}}>
          <div><div style={{fontSize:11.5,color:'var(--text3)',marginBottom:2}}>Última importação</div><div style={{fontWeight:600}}>{d.ultima_importacao??'—'}</div><div style={{fontSize:12,color:'var(--text3)'}}>{fmtData(d.ultima_importacao_data)}</div></div>
          <div><div style={{fontSize:11.5,color:'var(--text3)',marginBottom:2}}>Última competência</div><div style={{fontWeight:700,fontSize:20}}>{fmtComp(d.ultima_competencia)}</div></div>
          <div><div style={{fontSize:11.5,color:'var(--text3)',marginBottom:2}}>Tempo da consulta</div><div style={{fontWeight:600,color:d.tempo_consulta_ms>2000?'var(--red)':'var(--green)'}}>{d.tempo_consulta_ms} ms</div></div>
        </div>
      </div>
      <div className="gov-kpis">
        {[{label:'Total Operações',valor:d.total_operacoes?.toLocaleString('pt-BR')??'—'},{label:'Motoristas Ativos',valor:d.total_motoristas?.toLocaleString('pt-BR')??'—'},{label:'Importações',valor:d.total_importacoes?.toLocaleString('pt-BR')??'—'},{label:'Prazos de Rotas',valor:d.total_prazos_rotas?.toLocaleString('pt-BR')??'—'},{label:'Indicadores OCR',valor:d.total_indicadores_ocr?.toLocaleString('pt-BR')??'—'},{label:'Registros Auditoria',valor:d.total_registros_auditoria?.toLocaleString('pt-BR')??'—'}].map(k=>(
          <div key={k.label} className="gov-kpi"><div className="gov-kpi-valor">{k.valor}</div><div className="gov-kpi-label">{k.label}</div></div>
        ))}
      </div>
    </div>
  )
}

function AbaQualidade() {
  const navigate=useNavigate(); const [d,setD]=useState(null); const [loading,setLoading]=useState(true)
  const carregar=useCallback(async()=>{setLoading(true);const{dados}=await buscarQualidadeDados();setD(dados);setLoading(false)},[])
  useEffect(()=>{carregar()},[carregar])
  if(loading)return<div className="gov-card-vazio">Analisando...</div>
  if(!d)return null
  const ITENS=[
    {chave:'operacoes_sem_rota',label:'Operações sem rota',link:'/operacao',desc:'Sem rota registrada'},
    {chave:'operacoes_sem_lead_time',label:'Operações sem Lead Time',link:'/historico',desc:'Finalizadas sem LT'},
    {chave:'lead_time_negativo',label:'Lead Time negativo',link:'/historico',desc:'Datas inconsistentes'},
    {chave:'competencias_sem_comprovei',label:'Competências sem Comprovei',link:'/importacoes',desc:'Meses sem Comprovei'},
    {chave:'competencias_sem_rotina',label:'Competências sem Rotina',link:'/importacoes',desc:'Meses sem Rotina'},
    {chave:'importacoes_sem_ocr',label:'Importações sem OCR',link:'/importacoes',desc:'Comprovei sem indicadores'},
    {chave:'rotas_duplicadas',label:'Rotas duplicadas',link:'/configuracoes/gerenciar-rotas',desc:'Mesma rota, grafia diferente'},
    {chave:'motoristas_duplicados',label:'Motoristas duplicados',link:'/motoristas',desc:'Nomes idênticos'},
  ]
  const total=ITENS.reduce((s,i)=>s+(d[i.chave]?.total??0),0)
  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <p style={{fontSize:13,color:'var(--text3)',margin:0}}>{total===0?'✅ Nenhum problema encontrado.': `⚠ ${total} ocorrência(s).`}</p>
        <Button variant="ghost" size="sm" icon={IconRefreshCw} onClick={carregar}>Reanalisar</Button>
      </div>
      <div className="gov-qualidade-grid">
        {ITENS.map(it=>{const num=d[it.chave]?.total??0; return (
          <div key={it.chave} className="gov-qual-item">
            <div className={`gov-qual-num ${num===0?'zero':num>5?'critico':'alerta'}`}>{num}</div>
            <div style={{flex:1,minWidth:0}}><div className="gov-qual-label">{it.label}</div><div className="gov-qual-desc">{it.desc}</div></div>
            {num>0&&<Button variant="ghost" size="sm" onClick={()=>navigate(it.link)}>Corrigir</Button>}
          </div>
        )})}
      </div>
    </div>
  )
}

function AbaBackup() {
  const [baixando,setBaixando]=useState(null)
  async function baixar(label,fn,params,nomeArq,cols) {
    setBaixando(label)
    try {
      const res=await fn(params)
      const lista=res?.dados??res?.data??res??[]
      if(!Array.isArray(lista)||lista.length===0){alert('Nenhum dado.');return}
      exportarExcel(cols,lista,nomeArq,label)
    } catch(e){alert('Erro: '+e.message)} finally{setBaixando(null)}
  }
  const BACKUPS=[
    {label:'Motoristas',desc:'Cadastro da frota ativa',fn:listarMotoristas,params:{porPagina:9999},nomeArq:'backup-motoristas',cols:[{chave:'codigo',rotulo:'Código'},{chave:'nome',rotulo:'Nome'},{chave:'placa',rotulo:'Placa'},{chave:'ativo',rotulo:'Ativo'}]},
    {label:'Prazos de Rotas',desc:'Prazos SLA vigentes',fn:buscarPrazosRotas,params:true,nomeArq:'backup-prazo-rotas',cols:[{chave:'rota',rotulo:'rota'},{chave:'uf',rotulo:'uf'},{chave:'prazo_dias',rotulo:'prazo_dias'},{chave:'prazo_horas',rotulo:'prazo_horas'}]},
    {label:'Metas de Lead Time',desc:'Metas por categoria',fn:buscarMetas,params:undefined,nomeArq:'backup-metas',cols:[{chave:'tipo_operacao',rotulo:'Tipo'},{chave:'meta_minutos',rotulo:'Meta (min)'}]},
    {label:'Indicadores Comprovei',desc:'OCR por competência',fn:listarIndicadores,params:{porPagina:999},nomeArq:'backup-indicadores',cols:[{chave:'competencia',rotulo:'Competência'},{chave:'qualidade_pct',rotulo:'Qualidade %'}]},
    {label:'Histórico de Importações',desc:'Log das importações',fn:listarHistoricoImportacoes,params:{porPagina:500},nomeArq:'backup-importacoes',cols:[{chave:'nome_arquivo',rotulo:'Arquivo'},{chave:'origem',rotulo:'Origem'},{chave:'competencia',rotulo:'Competência'},{chave:'status',rotulo:'Status'}]},
  ]
  return (
    <div>
      <p style={{fontSize:13,color:'var(--text3)',marginBottom:20}}>Exporte dados críticos em Excel para backup externo ou migração.</p>
      <div className="gov-backup-grid">
        {BACKUPS.map(b=>(
          <div key={b.label} className="gov-backup-card">
            <div className="gov-backup-titulo">{b.label}</div><div className="gov-backup-desc">{b.desc}</div>
            <Button variant="secondary" size="sm" icon={IconDownload} carregando={baixando===b.label} disabled={!!baixando} onClick={()=>baixar(b.label,b.fn,b.params,b.nomeArq,b.cols)}>{baixando===b.label?'Exportando…':'Exportar'}</Button>
          </div>
        ))}
      </div>
    </div>
  )
}

function AbaValidacao() {
  const navigate=useNavigate(); const [d,setD]=useState(null); const [exec,setExec]=useState(false)
  async function executar(){setExec(true);const{dados}=await executarValidacaoAutomatica();setD(dados);setExec(false)}
  const ITEMS=[
    {chave:'operacoes_sem_motorista',label:'Operações sem motorista',link:'/operacao'},
    {chave:'prazos_invalidos',label:'Prazos inválidos (≤ 0)',link:'/prazo-rotas'},
    {chave:'rotas_sem_prazo',label:'Rotas sem prazo',link:'/prazo-rotas'},
    {chave:'importacoes_sem_competencia',label:'Importações sem competência',link:'/importacoes'},
    {chave:'motoristas_sem_operacao',label:'Motoristas sem operação',link:'/motoristas'},
  ]
  return (
    <div>
      <div style={{display:'flex',gap:12,alignItems:'center',marginBottom:20}}>
        <Button variant="primary" icon={IconCheck} carregando={exec} onClick={executar}>{exec?'Verificando…':'Executar Validação'}</Button>
        {d&&<span style={{fontSize:12.5,color:'var(--text3)'}}>Concluído em {d.tempo_validacao_ms} ms</span>}
      </div>
      {d&&<div className="gov-qualidade-grid">{ITEMS.map(it=>{const num=d[it.chave]?.total??0;return(<div key={it.chave} className="gov-qual-item"><div className={`gov-qual-num ${num===0?'zero':num>10?'critico':'alerta'}`}>{num}</div><div style={{flex:1}}><div className="gov-qual-label">{it.label}</div></div>{num>0&&<Button variant="ghost" size="sm" onClick={()=>navigate(it.link)}>Corrigir</Button>}</div>)})}</div>}
      {!d&&!exec&&<div className="gov-card-vazio">Clique em &quot;Executar Validação&quot; para iniciar.</div>}
    </div>
  )
}

function AbaManutencao({ativo,toggle}) {
  return (
    <div>
      <div className={`gov-manutencao-toggle${ativo?' ativo':''}`} onClick={toggle} role="button" tabIndex={0} onKeyDown={e=>e.key==='Enter'&&toggle()}>
        <div style={{fontSize:36}}>{ativo?'🔧':'🟢'}</div>
        <div style={{flex:1}}><div style={{fontWeight:700,fontSize:15}}>{ativo?'Modo Manutenção ATIVO':'Sistema em Operação Normal'}</div><div style={{fontSize:12.5,color:'var(--text3)',marginTop:2}}>{ativo?'Clique para retornar ao modo normal.':'Clique para ativar o modo manutenção.'}</div></div>
        <div style={{width:48,height:26,borderRadius:13,background:ativo?'var(--amber,#f59e0b)':'var(--border)',position:'relative',transition:'background .2s',flexShrink:0}}>
          <div style={{width:20,height:20,borderRadius:'50%',background:'#fff',position:'absolute',top:3,left:ativo?25:3,transition:'left .2s',boxShadow:'0 1px 3px rgba(0,0,0,.25)'}}/>
        </div>
      </div>
      {ativo&&<div className="gov-manutencao-aviso">⚠ Modo manutenção ativo. Aviso exibido para todos os usuários.</div>}
    </div>
  )
}

function AbaPerformance() {
  const [d,setD]=useState(null); const [medindo,setMedindo]=useState(false)
  async function medir(){setMedindo(true);const{dados}=await medirPerformance();setD(dados);setMedindo(false)}
  return (
    <div>
      <div style={{display:'flex',gap:12,alignItems:'center',marginBottom:20}}>
        <Button variant="primary" icon={IconBarChart} carregando={medindo} onClick={medir}>{medindo?'Medindo…':'Medir Performance'}</Button>
        {d&&<span style={{fontSize:13,fontWeight:600}}>Média: {d.media_geral_ms} ms <span style={{fontSize:12,fontWeight:400,color:'var(--text3)'}}>{d.media_geral_ms<500?'🟢 Excelente':d.media_geral_ms<1500?'🟡 Normal':'🔴 Lento'}</span></span>}
      </div>
      {d&&<div className="gov-perf-grid">{[{label:'Operações',ms:d.consulta_operacoes_ms},{label:'Motoristas',ms:d.consulta_motoristas_ms},{label:'Importações',ms:d.consulta_importacoes_ms},{label:'Auditoria',ms:d.consulta_auditoria_ms},{label:'Lead Time',ms:d.consulta_lead_time_ms}].map(m=><div key={m.label} className="gov-perf-item"><div className={`gov-perf-ms ${corMs(m.ms)}`}>{m.ms} <span style={{fontSize:13,fontWeight:400}}>ms</span></div><div className="gov-perf-label">{m.label}</div></div>)}</div>}
      {!d&&!medindo&&<div className="gov-card-vazio">Clique em &quot;Medir Performance&quot; para testar.</div>}
    </div>
  )
}

function AbaChecklist() {
  const [d,setD]=useState(null); const [rodando,setRodando]=useState(false)
  async function executar(){setRodando(true);const{dados}=await executarChecklistDeploy();setD(dados);setRodando(false)}
  const sCor=d?.status==='ok'?'verde':d?.status==='atencao'?'amarelo':'vermelho'
  return (
    <div>
      <div style={{display:'flex',gap:12,alignItems:'center',marginBottom:20}}>
        <Button variant="primary" icon={IconCheck} carregando={rodando} onClick={executar}>{rodando?'Verificando…':'Executar Auditoria de Deploy'}</Button>
        {d&&<span className={`gov-status ${sCor}`}>{d.passaram}/{d.total} ({d.tempo_ms} ms)</span>}
      </div>
      {d&&<div className="gov-checklist">{d.itens.map(it=><div key={it.nome} className={`gov-check-item ${it.ok?'ok':'err'}`}><div className={`gov-check-dot ${it.ok?'ok':'err'}`}/><div className="gov-check-nome">{it.nome}</div><div className={`gov-check-status ${it.ok?'ok':'err'}`}>{it.ok?'✔ OK':`✗ ${it.erro??'Falha'}`}</div></div>)}</div>}
      {!d&&!rodando&&<div className="gov-card-vazio">Clique em &quot;Executar Auditoria de Deploy&quot; para verificar.</div>}
    </div>
  )
}
