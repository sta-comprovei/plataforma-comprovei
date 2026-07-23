/**
 * comunicadosService.js — Etapa 9.3
 *
 * Service dedicado à tabela comunicados_operacionais.
 * Separado do funilService para facilitar a integração futura com IA:
 * o Assistente poderá importar diretamente este módulo.
 *
 * Sem localStorage. Sem console.log. Sem dados fictícios.
 */

import { supabase } from './supabaseClient'
import { moverParaLixeira } from './lixeiraService'

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS DISPONÍVEIS (espelha os valores do banco)
// ─────────────────────────────────────────────────────────────────────────────
export const TIPOS_COMUNICADO = [
  { value: 'ALTERACAO_MOTORISTA', label: 'Alteração de Motorista' },
  { value: 'TROCA_ROTA',          label: 'Troca de Rota'          },
  { value: 'PENDENCIA',           label: 'Pendência'              },
  { value: 'OBSERVACAO',          label: 'Observação'             },
  { value: 'CARGA_INVERTIDA',     label: 'Carga Invertida'        },
  { value: 'OUTRO',               label: 'Outro'                  },
]

export function labelTipo(tipo) {
  return TIPOS_COMUNICADO.find(t => t.value === tipo)?.label ?? tipo ?? '—'
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function mensagemAmigavel(error) {
  const msg = (error?.message || '').toLowerCase()
  if (msg.includes('network'))    return 'Erro de conexão. Verifique sua internet.'
  if (msg.includes('permission') || msg.includes('rls'))
    return 'Sem permissão para esta operação.'
  return error?.message || 'Erro inesperado.'
}

// Data de hoje no formato YYYY-MM-DD (local, sem fuso horário)
export function hoje() {
  const d = new Date()
  const ano = d.getFullYear()
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

// ─────────────────────────────────────────────────────────────────────────────
// INDICADORES DO TOPO DA PÁGINA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * KPIs rápidos para o painel de indicadores.
 * Não usa RPC — agrega no cliente para evitar dependência de função SQL nova.
 *
 * @returns {{ comunicados_hoje, pendencias_abertas, alteracoes_motorista, trocas_rota }}
 */
export async function buscarKpisComunicados() {
  const dataHoje = hoje()

  // Buscar comunicados de hoje E pendências abertas (podem ser de outros dias)
  const { data, error } = await supabase
    .from('comunicados_operacionais')
    .select('tipo, resolvido, data_operacao')

  if (error) return { dados: null, erro: mensagemAmigavel(error) }

  const todos = data ?? []
  const dados = {
    comunicados_hoje:       todos.filter(c => c.data_operacao === dataHoje).length,
    pendencias_abertas:     todos.filter(c => !c.resolvido).length,
    alteracoes_motorista:   todos.filter(c => c.tipo === 'ALTERACAO_MOTORISTA' && c.data_operacao === dataHoje).length,
    trocas_rota:            todos.filter(c => c.tipo === 'TROCA_ROTA'          && c.data_operacao === dataHoje).length,
  }

  return { dados, erro: null }
}

// ─────────────────────────────────────────────────────────────────────────────
// LISTAGEM COM FILTROS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lista comunicados com filtros combinados e paginação.
 *
 * @param {object} filtros
 * @param {string} filtros.data_inicio     - YYYY-MM-DD
 * @param {string} filtros.data_fim        - YYYY-MM-DD
 * @param {string} filtros.motorista       - parcial, case-insensitive
 * @param {string} filtros.rota            - parcial, case-insensitive
 * @param {string} filtros.tipo            - valor exato
 * @param {boolean|null} filtros.resolvido - true | false | null (todos)
 * @param {number} pagina
 * @param {number} porPagina
 */
export async function buscarComunicados({
  data_inicio,
  data_fim,
  motorista,
  rota,
  tipo,
  resolvido,
  pagina    = 1,
  porPagina = 50,
} = {}) {
  let query = supabase
    .from('comunicados_operacionais')
    .select('*', { count: 'exact' })

  if (data_inicio) query = query.gte('data_operacao', data_inicio)
  if (data_fim)    query = query.lte('data_operacao', data_fim)
  if (motorista)   query = query.ilike('motorista', `%${motorista}%`)
  if (rota)        query = query.ilike('rota', `%${rota}%`)
  if (tipo)        query = query.eq('tipo', tipo)
  if (resolvido !== null && resolvido !== undefined)
                   query = query.eq('resolvido', resolvido)

  const inicio = (pagina - 1) * porPagina
  const { data, error, count } = await query
    .order('data_operacao', { ascending: false })
    .order('criado_em',     { ascending: false })
    .range(inicio, inicio + porPagina - 1)

  if (error) return { dados: [], total: 0, erro: mensagemAmigavel(error) }
  return { dados: data ?? [], total: count ?? 0, erro: null }
}

// ─────────────────────────────────────────────────────────────────────────────
// CRIAR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Registra um novo comunicado operacional.
 *
 * @param {object} comunicado
 * @param {string} nomeUsuario - nome do usuário logado (para criado_por)
 */
export async function criarComunicado(comunicado, nomeUsuario) {
  const payload = {
    data_operacao:    comunicado.data_operacao || hoje(),
    motorista:        comunicado.motorista        || null,
    codigo_motorista: comunicado.codigo_motorista || null,
    rota:             comunicado.rota             || null,
    tipo:             comunicado.tipo,
    descricao:        comunicado.descricao.trim(),
    resolvido:        false,
    criado_por:       nomeUsuario || null,
  }

  const { data, error } = await supabase
    .from('comunicados_operacionais')
    .insert([payload])
    .select()
    .single()

  if (error) return { dados: null, erro: mensagemAmigavel(error) }
  return { dados: data, erro: null }
}

// ─────────────────────────────────────────────────────────────────────────────
// MARCAR COMO RESOLVIDO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Marca um comunicado como resolvido (sem DELETE).
 *
 * @param {string} id           - UUID do comunicado
 * @param {string} nomeUsuario  - quem está resolvendo
 */
export async function resolverComunicado(id, nomeUsuario) {
  const { error } = await supabase
    .from('comunicados_operacionais')
    .update({
      resolvido:    true,
      resolvido_em: new Date().toISOString(),
      resolvido_por: nomeUsuario || null,
    })
    .eq('id', id)

  if (error) return { erro: mensagemAmigavel(error) }
  return { erro: null }
}

/**
 * Move comunicado para lixeira e o exclui fisicamente.
 */
export async function excluirComunicado(id, nomeUsuario) {
  const { data: snap, error: errSnap } = await supabase
    .from('comunicados_operacionais').select('*').eq('id', id).single()
  if (errSnap) return { sucesso: false, erro: errSnap.message }

  const descricao = `Comunicado: ${snap.descricao?.slice(0, 80) ?? ''}${(snap.descricao?.length > 80) ? '…' : ''}`
  const { erro: errLix } = await moverParaLixeira('comunicados_operacionais', id, descricao, snap, nomeUsuario)
  if (errLix) return { sucesso: false, erro: errLix }

  const { error } = await supabase.from('comunicados_operacionais').delete().eq('id', id)
  if (error) return { sucesso: false, erro: error.message }
  return { sucesso: true, erro: null }
}
