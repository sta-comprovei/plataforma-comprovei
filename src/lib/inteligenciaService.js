import { supabase } from './supabaseClient'
function msg(e) { return e?.message||'Erro.' }

export async function buscarRotasAtrasadas() {
  const { data, error } = await supabase.from('vw_lead_time_por_rota').select('rota,media_min,prazo_efetivo_min,prazo_rota_dias,diferenca_min,eficiencia_pct,total_viagens,fonte_prazo').eq('situacao','vermelho').order('diferenca_min',{ascending:false})
  if (error) return { dados:[], erro:msg(error) }
  return { dados:data??[], erro:null }
}
export async function buscarRotasPiorDesempenho() {
  const { data, error } = await supabase.from('vw_lead_time_por_rota').select('rota,media_min,prazo_efetivo_min,eficiencia_pct,situacao,total_viagens,fonte_prazo').not('prazo_efetivo_min','is',null).order('eficiencia_pct',{ascending:false}).limit(10)
  if (error) return { dados:[], erro:msg(error) }
  return { dados:data??[], erro:null }
}
export async function buscarRotasMelhoraram() {
  const hoje=new Date(), d30=new Date(hoje), d60=new Date(hoje)
  d30.setDate(hoje.getDate()-30); d60.setDate(hoje.getDate()-60)
  const iso=d=>d.toISOString().slice(0,10)
  const [rR,rA] = await Promise.all([
    supabase.from('operacoes').select('rota,lead_time_min').not('lead_time_min','is',null).gte('data_operacao',iso(d30)).lte('data_operacao',iso(hoje)),
    supabase.from('operacoes').select('rota,lead_time_min').not('lead_time_min','is',null).gte('data_operacao',iso(d60)).lt('data_operacao',iso(d30)),
  ])
  if (rR.error||rA.error) return { dados:[], erro:msg(rR.error||rA.error) }
  function agg(rows){const m={};for(const r of rows){if(!r.rota)continue;if(!m[r.rota])m[r.rota]={t:0,q:0};m[r.rota].t+=r.lead_time_min;m[r.rota].q++}const o={};for(const[k,v]of Object.entries(m))o[k]=v.t/v.q;return o}
  const rec=agg(rR.data??[]),ant=agg(rA.data??[])
  const res=[]
  for(const rota of Object.keys(rec)){if(!ant[rota])continue;const red=ant[rota]-rec[rota];if(red<=0)continue;res.push({rota,media_anterior_min:Math.round(ant[rota]),media_recente_min:Math.round(rec[rota]),reducao_min:Math.round(red),ganho_pct:Math.round((red/ant[rota])*100*10)/10})}
  res.sort((a,b)=>b.ganho_pct-a.ganho_pct)
  return { dados:res.slice(0,10), erro:null }
}
export async function buscarMotoristasComDivergencias() {
  const { data, error } = await supabase.from('operacoes').select('nome_motorista,codigo_motorista,divergencia,data_operacao').not('divergencia','is',null).neq('divergencia','').order('data_operacao',{ascending:false}).limit(1000)
  if (error) return { dados:[], erro:msg(error) }
  const mapa={}
  for(const op of data??[]){const k=op.codigo_motorista||op.nome_motorista;if(!mapa[k])mapa[k]={nome:op.nome_motorista,codigo:op.codigo_motorista,total:0,ultima_ocorrencia:null};mapa[k].total++;if(!mapa[k].ultima_ocorrencia||op.data_operacao>mapa[k].ultima_ocorrencia)mapa[k].ultima_ocorrencia=op.data_operacao}
  return { dados:Object.values(mapa).sort((a,b)=>b.total-a.total).slice(0,10), erro:null }
}
export async function buscarImportacoesPendentes() {
  const { data, error } = await supabase.from('historico_importacoes').select('origem,competencia').eq('status','concluido').not('competencia','is',null).order('competencia',{ascending:false}).limit(200)
  if (error) return { dados:[], erro:msg(error) }
  const porComp={}
  for(const i of data??[]){if(!porComp[i.competencia])porComp[i.competencia]=new Set();porComp[i.competencia].add(i.origem)}
  const pend=[]
  for(const[comp,origens] of Object.entries(porComp)){if(!origens.has('comprovei')||!origens.has('rotina'))pend.push({competencia:comp,tem_comprovei:origens.has('comprovei'),tem_rotina:origens.has('rotina'),faltam:[!origens.has('comprovei')&&'Comprovei',!origens.has('rotina')&&'Rotina'].filter(Boolean)})}
  pend.sort((a,b)=>b.competencia.localeCompare(a.competencia))
  return { dados:pend, erro:null }
}
export async function buscarKpisPendentesCI() {
  const { data, error } = await supabase.rpc('fn_kpis_pendentes')
  if (error) return { dados:null, erro:msg(error) }
  return { dados:data, erro:null }
}
export async function buscarRotasDuplicadasCI() {
  const { data, error } = await supabase.rpc('fn_rotas_duplicadas')
  if (error) return { dados:[], erro:msg(error) }
  return { dados:data??[], erro:null }
}
export async function buscarImportacoesSemIndicadores() {
  const { data:imps, error:errI } = await supabase.from('historico_importacoes').select('id,competencia,created_at').eq('origem','comprovei').eq('status','concluido').not('competencia','is',null).order('competencia',{ascending:false}).limit(24)
  if (errI) return { dados:[], erro:msg(errI) }
  if (!imps?.length) return { dados:[], erro:null }
  const comps=[...new Set(imps.map(i=>i.competencia))]
  const { data:indics } = await supabase.from('indicadores_comprovei').select('competencia').in('competencia',comps)
  const comInd=new Set((indics??[]).map(i=>i.competencia))
  const sem=imps.filter(i=>!comInd.has(i.competencia)).reduce((acc,imp)=>{if(!acc.find(x=>x.competencia===imp.competencia))acc.push(imp);return acc},[])
  return { dados:sem, erro:null }
}
export async function buscarRotasSemPrazo() {
  const { data, error } = await supabase.from('vw_lead_time_por_rota').select('rota,total_viagens,fonte_prazo').eq('fonte_prazo','sem_prazo').order('total_viagens',{ascending:false})
  if (error) return { dados:[], erro:msg(error) }
  return { dados:data??[], erro:null }
}
export async function buscarPrevisaoAtraso() {
  const d4m=new Date(); d4m.setMonth(d4m.getMonth()-4)
  const { data, error } = await supabase.from('operacoes').select('rota,lead_time_min,data_operacao').not('lead_time_min','is',null).not('rota','is',null).gte('data_operacao',d4m.toISOString().slice(0,10)).order('data_operacao',{ascending:true}).limit(5000)
  if (error) return { dados:[], erro:msg(error) }
  const prm={}
  for(const op of data??[]){if(!op.rota)continue;const mes=op.data_operacao.slice(0,7);if(!prm[op.rota])prm[op.rota]={};if(!prm[op.rota][mes])prm[op.rota][mes]={t:0,q:0};prm[op.rota][mes].t+=op.lead_time_min;prm[op.rota][mes].q++}
  const res=[]
  for(const[rota,meses] of Object.entries(prm)){const mo=Object.keys(meses).sort();if(mo.length<3)continue;const u3=mo.slice(-3).map(m=>meses[m].t/meses[m].q);let sub=0;for(let i=1;i<u3.length;i++)if(u3[i]>u3[i-1])sub++;const var_=(u3[u3.length-1]-u3[0])/u3[0]*100;const risco=sub===2&&var_>20?'alto':sub>=1&&var_>10?'medio':'baixo';if(risco==='baixo')continue;res.push({rota,risco,variacao_pct:Math.round(var_*10)/10,media_atual_min:Math.round(u3[u3.length-1]),meses_analisados:mo.length})}
  res.sort((a,b)=>{const o={alto:0,medio:1};return(o[a.risco]??2)-(o[b.risco]??2)||b.variacao_pct-a.variacao_pct})
  return { dados:res.slice(0,10), erro:null }
}
