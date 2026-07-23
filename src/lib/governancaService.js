import { supabase } from './supabaseClient'

export async function buscarSaudeSistema() {
  const t0=Date.now()
  const [rOps,rMot,rImp,rInd,rPrazos,rAudit,rUltImp,rUltComp] = await Promise.allSettled([
    supabase.from('operacoes').select('id',{count:'exact',head:true}),
    supabase.from('motoristas').select('id',{count:'exact',head:true}).eq('ativo',true),
    supabase.from('historico_importacoes').select('id',{count:'exact',head:true}).eq('status','concluido'),
    supabase.from('indicadores_comprovei').select('id',{count:'exact',head:true}),
    supabase.from('prazo_rotas').select('id',{count:'exact',head:true}).eq('ativo',true),
    supabase.from('historico_auditoria').select('id',{count:'exact',head:true}),
    supabase.from('historico_importacoes').select('nome_arquivo,origem,competencia,created_at').eq('status','concluido').order('created_at',{ascending:false}).limit(1).maybeSingle(),
    supabase.from('historico_importacoes').select('competencia').eq('status','concluido').not('competencia','is',null).order('competencia',{ascending:false}).limit(1).maybeSingle(),
  ])
  const tempoMs=Date.now()-t0
  function cnt(r){return r.status==='fulfilled'?(r.value.count??0):null}
  function dat(r){return r.status==='fulfilled'?r.value.data:null}
  return { dados:{ total_operacoes:cnt(rOps), total_motoristas:cnt(rMot), total_importacoes:cnt(rImp), total_indicadores_ocr:cnt(rInd), total_prazos_rotas:cnt(rPrazos), total_registros_auditoria:cnt(rAudit), ultima_importacao:dat(rUltImp)?.nome_arquivo??null, ultima_importacao_data:dat(rUltImp)?.created_at??null, ultima_competencia:dat(rUltComp)?.competencia??null, tempo_consulta_ms:tempoMs, status_banco:tempoMs>5000?'critico':tempoMs>2000?'atencao':'saudavel' }, erro:null }
}

export async function buscarQualidadeDados() {
  const [rSemRota,rSemLT,rLTNeg,rTodasImps,rImpC,rRotasDup,rMots] = await Promise.allSettled([
    supabase.from('operacoes').select('id,nome_motorista,data_operacao',{count:'exact'}).or('rota.is.null,rota.eq.').limit(50),
    supabase.from('operacoes').select('id,nome_motorista,data_operacao',{count:'exact'}).eq('ativa',false).is('lead_time_min',null).limit(50),
    supabase.from('operacoes').select('id,nome_motorista,data_operacao,lead_time_min',{count:'exact'}).lt('lead_time_min',0).limit(50),
    supabase.from('historico_importacoes').select('competencia,origem').eq('status','concluido').not('competencia','is',null),
    supabase.from('historico_importacoes').select('competencia').eq('origem','comprovei').eq('status','concluido').not('competencia','is',null),
    supabase.rpc('fn_rotas_duplicadas'),
    supabase.from('motoristas').select('nome').eq('ativo',true).order('nome'),
  ])
  function ok(r){return r.status==='fulfilled'?r.value:{data:[],count:0}}
  const porComp={}
  for(const i of ok(rTodasImps).data??[]){if(!porComp[i.competencia])porComp[i.competencia]=new Set();porComp[i.competencia].add(i.origem)}
  const semC=Object.entries(porComp).filter(([,s])=>!s.has('comprovei')).map(([c])=>({competencia:c}))
  const semR=Object.entries(porComp).filter(([,s])=>!s.has('rotina')).map(([c])=>({competencia:c}))
  const compsC=(ok(rImpC).data??[]).map(i=>i.competencia)
  let semOCR=[]
  if(compsC.length){const{data:ind}=await supabase.from('indicadores_comprovei').select('competencia').in('competencia',compsC);const comInd=new Set((ind??[]).map(i=>i.competencia));semOCR=compsC.filter(c=>!comInd.has(c)).map(c=>({competencia:c}))}
  const mots=ok(rMots).data??[];const visto={};const dup=[]
  for(const m of mots){const k=m.nome?.trim().toLowerCase();if(!k)continue;if(visto[k])dup.push(m);else visto[k]=true}
  const sR=ok(rSemRota),sL=ok(rSemLT),sN=ok(rLTNeg)
  return { dados:{ operacoes_sem_rota:{total:sR.count??sR.data?.length??0,itens:sR.data??[]}, operacoes_sem_lead_time:{total:sL.count??sL.data?.length??0,itens:sL.data??[]}, lead_time_negativo:{total:sN.count??sN.data?.length??0,itens:sN.data??[]}, competencias_sem_comprovei:{total:semC.length,itens:semC}, competencias_sem_rotina:{total:semR.length,itens:semR}, importacoes_sem_ocr:{total:semOCR.length,itens:semOCR}, rotas_duplicadas:{total:ok(rRotasDup).data?.length??0,itens:ok(rRotasDup).data??[]}, motoristas_duplicados:{total:dup.length,itens:dup} }, erro:null }
}

export async function executarValidacaoAutomatica() {
  const t0=Date.now()
  const [rOpsSemMot,rPrazosInv,rRotasSemPrazo,rImpSemComp,rMots] = await Promise.allSettled([
    supabase.from('operacoes').select('id,nome_motorista,data_operacao').is('motorista_id',null).limit(50),
    supabase.from('prazo_rotas').select('id,rota').or('prazo_dias.is.null,prazo_dias.lte.0').eq('ativo',true).limit(50),
    supabase.from('vw_lead_time_por_rota').select('rota,total_viagens').eq('fonte_prazo','sem_prazo').limit(50),
    supabase.from('historico_importacoes').select('id,nome_arquivo,origem',{count:'exact'}).is('competencia',null).eq('status','concluido').limit(20),
    supabase.from('motoristas').select('id,nome,codigo').eq('ativo',true).limit(300),
  ])
  function ok(r){return r.status==='fulfilled'?r.value:{data:[],count:0}}
  const todosM=ok(rMots).data??[],codigos=todosM.map(m=>m.codigo).filter(Boolean)
  let motSemOp=[]
  if(codigos.length){const{data:comOp}=await supabase.from('operacoes').select('codigo_motorista').in('codigo_motorista',codigos);const ativos=new Set((comOp??[]).map(o=>o.codigo_motorista));motSemOp=todosM.filter(m=>!ativos.has(m.codigo)).slice(0,20)}
  return { dados:{ operacoes_sem_motorista:{total:ok(rOpsSemMot).data?.length??0,itens:ok(rOpsSemMot).data??[]}, prazos_invalidos:{total:ok(rPrazosInv).data?.length??0,itens:ok(rPrazosInv).data??[]}, rotas_sem_prazo:{total:ok(rRotasSemPrazo).data?.length??0,itens:ok(rRotasSemPrazo).data??[]}, importacoes_sem_competencia:{total:ok(rImpSemComp).count??ok(rImpSemComp).data?.length??0,itens:ok(rImpSemComp).data??[]}, motoristas_sem_operacao:{total:motSemOp.length,itens:motSemOp}, tempo_validacao_ms:Date.now()-t0 }, erro:null }
}

export async function medirPerformance() {
  async function crono(fn){const t=Date.now();await fn();return Date.now()-t}
  const [tOps,tMot,tImp,tAud,tLT]=await Promise.all([
    crono(()=>supabase.from('operacoes').select('id,lead_time_min').eq('ativa',false).limit(100)),
    crono(()=>supabase.from('motoristas').select('id,nome').limit(100)),
    crono(()=>supabase.from('historico_importacoes').select('id,origem').limit(50)),
    crono(()=>supabase.from('historico_auditoria').select('id').limit(50)),
    crono(()=>supabase.from('vw_lead_time_por_rota').select('rota,media_min').limit(100)),
  ])
  return { dados:{ consulta_operacoes_ms:tOps, consulta_motoristas_ms:tMot, consulta_importacoes_ms:tImp, consulta_auditoria_ms:tAud, consulta_lead_time_ms:tLT, media_geral_ms:Math.round((tOps+tMot+tImp+tAud+tLT)/5) }, erro:null }
}

export async function executarChecklistDeploy() {
  const t0=Date.now()
  const checks=[
    {nome:'Operações (tabela)',fn:()=>supabase.from('operacoes').select('id').limit(1)},
    {nome:'Motoristas (tabela)',fn:()=>supabase.from('motoristas').select('id').limit(1)},
    {nome:'Lead Time (vw_lead_time_por_rota)',fn:()=>supabase.from('vw_lead_time_por_rota').select('rota').limit(1)},
    {nome:'SLA — vw_sla_entregas_com_tolerancia',fn:()=>supabase.from('vw_sla_entregas_com_tolerancia').select('numped').limit(1)},
    {nome:'Importações (tabela)',fn:()=>supabase.from('historico_importacoes').select('id').limit(1)},
    {nome:'Prazo de Rotas (tabela)',fn:()=>supabase.from('prazo_rotas').select('id').limit(1)},
    {nome:'Indicadores Comprovei',fn:()=>supabase.from('indicadores_comprovei').select('id').limit(1)},
    {nome:'fn_kpis_pendentes',fn:()=>supabase.rpc('fn_kpis_pendentes')},
    {nome:'fn_rotas_duplicadas',fn:()=>supabase.rpc('fn_rotas_duplicadas')},
    {nome:'fn_prazo_efetivo_minutos',fn:()=>supabase.rpc('fn_prazo_efetivo_minutos',{p_rota:'TESTE',p_tipo_operacao:'DF'})},
    {nome:'Auditoria (tabela)',fn:()=>supabase.from('historico_auditoria').select('id').limit(1)},
    {nome:'Lixeira (tabela)',fn:()=>supabase.from('lixeira').select('id').limit(1)},
    {nome:'Usuários (tabela)',fn:()=>supabase.from('usuarios').select('id').limit(1)},
    {nome:'Alertas (tabela)',fn:()=>supabase.from('alertas_operacionais').select('id').limit(1)},
    {nome:'Comunicados (tabela)',fn:()=>supabase.from('comunicados_operacionais').select('id').limit(1)},
  ]
  const resultados=await Promise.allSettled(checks.map(c=>c.fn()))
  const itens=checks.map((c,i)=>{const r=resultados[i];const ok=r.status==='fulfilled'&&!r.value?.error;return{nome:c.nome,ok,erro:ok?null:(r.reason?.message||r.value?.error?.message||'Falhou')}})
  const passaram=itens.filter(i=>i.ok).length,falharam=itens.filter(i=>!i.ok).length
  return { dados:{itens,passaram,falharam,total:itens.length,status:falharam===0?'ok':falharam<=2?'atencao':'critico',tempo_ms:Date.now()-t0}, erro:null }
}
