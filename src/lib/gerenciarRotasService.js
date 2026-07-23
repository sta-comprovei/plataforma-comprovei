import { supabase } from './supabaseClient'
function mensagem(e) { return e?.message || 'Erro.' }
export async function listarRotasDuplicadas() {
  const { data, error } = await supabase.rpc('fn_rotas_duplicadas')
  if (error) return { dados: [], erro: mensagem(error) }
  return { dados: data ?? [], erro: null }
}
export async function buscarRotasSemelhantes(rota) {
  if (!rota?.trim()) return { dados: [], erro: null }
  const { data, error } = await supabase.rpc('fn_buscar_rotas_semelhantes', { p_rota: rota.trim() })
  if (error) return { dados: [], erro: mensagem(error) }
  return { dados: data ?? [], erro: null }
}
export async function fundirRotas(rotaAntiga, rotaNova, nomeUsuario) {
  if (!rotaAntiga?.trim() || !rotaNova?.trim()) return { dados: null, erro: 'Rotas obrigatórias.' }
  const { data, error } = await supabase.rpc('fn_fundir_rotas', { p_rota_antiga: rotaAntiga.trim(), p_rota_nova: rotaNova.trim(), p_usuario: nomeUsuario || 'Sistema' })
  if (error) return { dados: null, erro: mensagem(error) }
  return { dados: data, erro: null }
}
