import { supabase } from './supabaseClient'
const TABELA = 'indicadores_comprovei'
function mensagem(e) { return e?.message || 'Erro.' }
export async function salvarIndicadores(dados, nomeUsuario) {
  const { competencia, importacaoId, ...rest } = dados
  if (!competencia) return { erro: 'Competência obrigatória.' }
  const { data: ex } = await supabase.from(TABELA).select('id').eq('competencia',competencia).maybeSingle()
  if (ex) {
    const { error } = await supabase.from(TABELA).update({ ...rest, updated_at:new Date().toISOString(), usuario_criacao:nomeUsuario }).eq('id',ex.id)
    if (error) return { erro:mensagem(error) }
    return { erro:null, id:ex.id }
  }
  const { data, error } = await supabase.from(TABELA).insert({ competencia, importacao_id:importacaoId||null, ...rest, usuario_criacao:nomeUsuario }).select('id').single()
  if (error) return { erro:mensagem(error) }
  return { erro:null, id:data.id }
}
export async function buscarIndicadoresPorCompetencia(competencia) {
  const { data, error } = await supabase.from(TABELA).select('*').eq('competencia',competencia).maybeSingle()
  if (error) return { dados:null, erro:mensagem(error) }
  return { dados:data, erro:null }
}
export async function listarIndicadores({ pagina=1, porPagina=12 }={}) {
  const from = (pagina-1)*porPagina
  const { data, error, count } = await supabase.from(TABELA).select('*',{count:'exact'}).order('competencia',{ascending:false}).range(from,from+porPagina-1)
  if (error) return { dados:[], total:0, erro:mensagem(error) }
  return { dados:data??[], total:count??0, erro:null }
}
export async function buscarUltimoIndicador() {
  const { data, error } = await supabase.from(TABELA).select('*').order('competencia',{ascending:false}).limit(1).maybeSingle()
  if (error) return { dados:null, erro:mensagem(error) }
  return { dados:data, erro:null }
}
