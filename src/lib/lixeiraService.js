/**
 * lixeiraService.js
 * Service CENTRAL da Lixeira da plataforma TNS Gestão de Entregas.
 *
 * REGRA FUNDAMENTAL:
 *   Nenhuma tela executa DELETE diretamente.
 *   Todo "Excluir" deve chamar moverParaLixeira() ANTES de deletar o registro.
 *   A exclusão definitiva é exclusiva de administradores.
 *
 * FLUXO:
 *   1. Tela chama moverParaLixeira(tabela, id, descricao, dadosJson, nomeUsuario)
 *   2. lixeiraService insere snapshot em public.lixeira
 *   3. A função do service específico executa o DELETE na tabela original
 *   4. Em caso de erro no DELETE, o item fica na lixeira mas não some da tabela original
 *      (inofensivo — pode ser removido manualmente da lixeira pelo admin)
 *
 * RESTAURAR:
 *   A restauração é feita tabela por tabela via INSERT com os dados_json salvos.
 *   Cada tabela_origem tem sua lógica de restauração registrada aqui.
 */
import { supabase } from './supabaseClient'

const TABELA = 'lixeira'

// ── Labels dos módulos para o filtro da tela ───────────────────────────────────────
export const MODULOS_LIXEIRA = [
  { valor: 'motoristas',                  label: 'Motoristas'              },
  { valor: 'operacoes',                   label: 'Operação do Dia'         },
  { valor: 'comunicados_operacionais',    label: 'Comunicados'             },
  { valor: 'alertas_operacionais',        label: 'Alertas'                 },
  { valor: 'alteracoes_operacionais',     label: 'Alterações do Dia'       },
  { valor: 'prazo_rotas',                 label: 'Prazo de Rotas'          },
  { valor: 'usuarios',                    label: 'Usuários'                },
]

export const LABEL_MODULO = Object.fromEntries(
  MODULOS_LIXEIRA.map(m => [m.valor, m.label])
)

// ── Helpers ────────────────────────────────────────────────────────────────────

function mensagem(error) {
  if (!error) return 'Erro desconhecido.'
  const msg = (error.message || '').toLowerCase()
  if (msg.includes('network') || msg.includes('fetch')) return 'Erro de conexão.'
  if (msg.includes('exclusão definitiva restrita')) return 'Exclusão definitiva restrita a administradores.'
  return error.message || 'Não foi possível concluir a operação.'
}

// ── MOVER PARA LIXEIRA ───────────────────────────────────────────────────────────────

/**
 * Insere um snapshot do registro na lixeira.
 * Deve ser chamado ANTES de executar o DELETE na tabela original.
 *
 * @param {string} tabelaOrigem  - nome da tabela (ex: 'motoristas')
 * @param {string} registroId    - UUID do registro sendo excluído
 * @param {string} descricao     - texto legível (ex: 'Motorista: João Silva')
 * @param {object} dadosJson     - snapshot completo do registro
 * @param {string} nomeUsuario   - nome do usuário que está excluindo
 * @returns {{ id: string|null, erro: string|null }}
 */
export async function moverParaLixeira(tabelaOrigem, registroId, descricao, dadosJson, nomeUsuario) {
  const { data, error } = await supabase.rpc('fn_mover_para_lixeira', {
    p_tabela_origem:    tabelaOrigem,
    p_registro_id:      registroId,
    p_descricao:        descricao,
    p_dados_json:       dadosJson,
    p_usuario_exclusao: nomeUsuario || 'Sistema',
  })
  if (error) return { id: null, erro: mensagem(error) }
  return { id: data, erro: null }
}

// ── LISTAR ─────────────────────────────────────────────────────────────────────────────

/**
 * Lista itens da lixeira com filtros e paginação.
 */
export async function listarLixeira({
  modulo    = '',
  busca     = '',
  usuario   = '',
  dataInicio = '',
  dataFim   = '',
  pagina    = 1,
  porPagina = 20,
} = {}) {
  let query = supabase
    .from(TABELA)
    .select('*', { count: 'exact' })
    .eq('excluido_definitivamente', false)
    .order('data_exclusao', { ascending: false })

  if (modulo)     query = query.eq('tabela_origem', modulo)
  if (usuario)    query = query.ilike('usuario_exclusao', `%${usuario}%`)
  if (busca)      query = query.ilike('descricao', `%${busca}%`)
  if (dataInicio) query = query.gte('data_exclusao', dataInicio)
  if (dataFim)    query = query.lte('data_exclusao', dataFim + 'T23:59:59')

  const from = (pagina - 1) * porPagina
  const to   = from + porPagina - 1
  query = query.range(from, to)

  const { data, error, count } = await query
  if (error) return { dados: [], total: 0, erro: mensagem(error) }
  return { dados: data ?? [], total: count ?? 0, erro: null }
}

// ── RESTAURAR ─────────────────────────────────────────────────────────────────────────────

/**
 * Restaura um registro da lixeira para sua tabela original.
 * Usa os dados_json salvos para fazer um INSERT com o mesmo ID.
 */
export async function restaurarDaLixeira(itemLixeira) {
  const { tabela_origem, registro_id, dados_json, id: lixeiraId } = itemLixeira

  // Remover campos de controle que não devem ser reinseridos
  const dados = { ...dados_json }
  delete dados.__lixeira_id

  let erroRestauracao = null

  switch (tabela_origem) {
    case 'motoristas': {
      const { error } = await supabase.from('motoristas').insert({ ...dados, id: registro_id })
      erroRestauracao = error
      break
    }
    case 'operacoes': {
      const { error } = await supabase.from('operacoes').insert({ ...dados, id: registro_id })
      erroRestauracao = error
      break
    }
    case 'comunicados_operacionais': {
      const { error } = await supabase.from('comunicados_operacionais').insert({ ...dados, id: registro_id })
      erroRestauracao = error
      break
    }
    case 'alertas_operacionais': {
      const { error } = await supabase.from('alertas_operacionais').insert({ ...dados, id: registro_id })
      erroRestauracao = error
      break
    }
    case 'alteracoes_operacionais': {
      const { error } = await supabase.from('alteracoes_operacionais').insert({ ...dados, id: registro_id })
      erroRestauracao = error
      break
    }
    case 'prazo_rotas': {
      const { error } = await supabase.from('prazo_rotas').insert({ ...dados, id: registro_id })
      erroRestauracao = error
      break
    }
    case 'usuarios': {
      // Restauração de usuário só é possível se o auth.users ainda existir
      // Caso contrário, instrui o admin a recriar o usuário
      const { error } = await supabase.from('usuarios').insert({ ...dados, id: registro_id })
      erroRestauracao = error
      break
    }
    default:
      return { erro: `Restauração não suportada para o módulo "${tabela_origem}".` }
  }

  if (erroRestauracao) {
    return { erro: `Não foi possível restaurar: ${mensagem(erroRestauracao)}` }
  }

  // Remover da lixeira após restauração bem-sucedida
  const { error: erroDel } = await supabase.from(TABELA).delete().eq('id', lixeiraId)
  if (erroDel) {
    return { erro: null, aviso: 'Registro restaurado, mas houve um erro ao removê-lo da lixeira.' }
  }

  return { erro: null }
}

// ── EXCLUIR DEFINITIVAMENTE ─────────────────────────────────────────────────────────────

/**
 * Remove definitivamente um item da lixeira (somente administrador).
 * Usa fn_excluir_definitivamente_lixeira (SECURITY DEFINER) para garantir
 * que apenas admins conseguem executar.
 */
export async function excluirDefinitivamente(lixeiraId) {
  const { error } = await supabase.rpc('fn_excluir_definitivamente_lixeira', {
    p_id: lixeiraId,
  })
  if (error) return { erro: mensagem(error) }
  return { erro: null }
}

// ── BUSCAR ITEM ───────────────────────────────────────────────────────────────────

export async function buscarItemLixeira(lixeiraId) {
  const { data, error } = await supabase
    .from(TABELA)
    .select('*')
    .eq('id', lixeiraId)
    .single()
  if (error) return { dados: null, erro: mensagem(error) }
  return { dados: data, erro: null }
}
