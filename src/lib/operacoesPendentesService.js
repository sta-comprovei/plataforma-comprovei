import { supabase } from './supabaseClient'
export const MOTIVOS_PENDENCIA = ['Possível Reentrega','Cliente Fechado','Aguardando Cliente','Aguardando Comercial','Problema Operacional','Outro']
function mensagem(e) { return e?.message || 'Erro.' }

export async function marcarComoPendente({ id, motivo, descricao, observacao, nomeUsuario }) {
  if (!id) return { erro: 'ID obrigatório.' }
  const { error } = await supabase.rpc('fn_marcar_pendente', { p_id: id, p_motivo: motivo, p_descricao: descricao || null, p_observacao: observacao || null, p_usuario: nomeUsuario || 'Sistema' })
  if (error) return { erro: mensagem(error) }
  return { erro: null }
}
export async function retornarParaOperacao(id) {
  if (!id) return { erro: 'ID obrigatório.' }
  const { error } = await supabase.rpc('fn_retornar_para_operacao', { p_id: id })
  if (error) return { erro: mensagem(error) }
  return { erro: null }
}
export async function listarPendentes({ busca='', motivo='', dataInicio='', dataFim='', pagina=1, porPagina=15 }={}) {
  let q = supabase.from('operacoes').select('id,data_operacao,motorista_id,codigo_motorista,nome_motorista,tipo_operacao,rota,placa,entregas_previstas,entregas_realizadas,status,motivo_pendencia,descricao_pendencia,observacao_pendencia,data_pendencia,usuario_pendencia', { count:'exact' }).eq('status_operacional','PENDENTE').order('data_pendencia',{ascending:false})
  if (busca) q = q.or(`nome_motorista.ilike.%${busca}%,rota.ilike.%${busca}%`)
  if (motivo) q = q.eq('motivo_pendencia', motivo)
  if (dataInicio) q = q.gte('data_pendencia', dataInicio)
  if (dataFim) q = q.lte('data_pendencia', `${dataFim}T23:59:59`)
  const from = (pagina-1)*porPagina
  q = q.range(from, from+porPagina-1)
  const { data, error, count } = await q
  if (error) return { dados:[], total:0, erro:mensagem(error) }
  return { dados: data??[], total: count??0, erro: null }
}
export async function buscarKpisPendentes() {
  const { data, error } = await supabase.rpc('fn_kpis_pendentes')
  if (error) return { dados:null, erro:mensagem(error) }
  return { dados:data, erro:null }
}
export async function editarPendencia({ id, motivo, descricao, observacao, nomeUsuario }) {
  if (!id) return { erro: 'ID obrigatório.' }
  const { error } = await supabase.from('operacoes').update({ motivo_pendencia:motivo||null, descricao_pendencia:descricao||null, observacao_pendencia:observacao||null, usuario_pendencia:nomeUsuario||'Sistema' }).eq('id',id).eq('status_operacional','PENDENTE')
  if (error) return { erro:mensagem(error) }
  return { erro:null }
}

export async function finalizarPendente(id, nomeUsuario) {
  if (!id) return { erro: 'ID obrigatório.' }
  // Define ativa=false e status_operacional=FINALIZADA, simulando finalização manual
  const { error } = await supabase
    .from('operacoes')
    .update({ ativa: false, status_operacional: 'FINALIZADA', usuario_ultima_alteracao: nomeUsuario })
    .eq('id', id)
    .eq('status_operacional', 'PENDENTE')
  if (error) return { erro: mensagem(error) }
  return { erro: null }
}
