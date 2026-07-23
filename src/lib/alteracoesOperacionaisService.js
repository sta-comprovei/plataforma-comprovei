/**
 * alteracoesOperacionaisService.js — Etapa 9.5
 *
 * Painel "Alterações do Dia" — substitui avisos por WhatsApp.
 * Padrão idêntico a comunicadosService.js e alertasService.js.
 * Sem localStorage. Sem console.log. Sem dados fictícios.
 */

import { supabase } from './supabaseClient'
import { moverParaLixeira } from './lixeiraService'

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────────────────────────────────────

export const TIPOS_ALTERACAO = [
  { value: 'ALTERACAO_ROTA',      label: 'Alteração de Rota'    },
  { value: 'TROCA_MOTORISTA',     label: 'Troca de Motorista'   },
  { value: 'INVERSAO_CARGA',      label: 'Inversão de Carga'    },
  { value: 'ATRASO_OPERACIONAL',  label: 'Atraso Operacional'   },
  { value: 'VEICULO',             label: 'Veículo'              },
  { value: 'ENTREGA',             label: 'Entrega'              },
  { value: 'OBSERVACAO',          label: 'Observação'           },
  { value: 'OUTRO',               label: 'Outro'                },
]

export const PRIORIDADES = [
  { value: 'BAIXA',   label: 'Baixa',   cor: '#16A34A' },
  { value: 'MEDIA',   label: 'Média',   cor: '#D97706' },
  { value: 'ALTA',    label: 'Alta',    cor: '#EA580C' },
  { value: 'CRITICA', label: 'Crítica', cor: '#DC2626' },
]

export function labelTipo(tipo) {
  return TIPOS_ALTERACAO.find(t => t.value === tipo)?.label ?? tipo ?? '—'
}

export function labelPrioridade(p) {
  return PRIORIDADES.find(x => x.value === p)?.label ?? p ?? '—'
}

export function corPrioridade(p) {
  return PRIORIDADES.find(x => x.value === p)?.cor ?? '#888888'
}

export function hoje() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function mensagemAmigavel(error) {
  const msg = (error?.message || '').toLowerCase()
  if (msg.includes('network'))   return 'Erro de conexão. Verifique sua internet.'
  if (msg.includes('permission') || msg.includes('rls')) return 'Sem permissão para esta operação.'
  return error?.message || 'Erro inesperado.'
}

// ─────────────────────────────────────────────────────────────────────────────
// KPIs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Indicadores para o topo da página e para o Dashboard.
 * @returns {{ alteracoes_hoje, abertas, criticas, resolvidas }}
 */
export async function buscarKpisAlteracoes() {
  const dataHoje = hoje()

  const { data, error } = await supabase
    .from('alteracoes_operacionais')
    .select('prioridade, resolvido, data_alteracao')

  if (error) return { dados: null, erro: mensagemAmigavel(error) }

  const todos = data ?? []
  return {
    dados: {
      alteracoes_hoje: todos.filter(a => a.data_alteracao === dataHoje).length,
      abertas:         todos.filter(a => !a.resolvido).length,
      criticas:        todos.filter(a => a.prioridade === 'CRITICA' && !a.resolvido).length,
      resolvidas:      todos.filter(a => a.resolvido).length,
    },
    erro: null,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LISTAGEM COM FILTROS E PAGINAÇÃO
// ─────────────────────────────────────────────────────────────────────────────

export async function buscarAlteracoes({
  data_inicio,
  data_fim,
  tipo,
  prioridade,
  motorista,
  rota,
  resolvido,
  pagina    = 1,
  porPagina = 50,
} = {}) {
  let query = supabase
    .from('alteracoes_operacionais')
    .select('*', { count: 'exact' })

  if (data_inicio) query = query.gte('data_alteracao', data_inicio)
  if (data_fim)    query = query.lte('data_alteracao', data_fim)
  if (tipo)        query = query.eq('tipo', tipo)
  if (prioridade)  query = query.eq('prioridade', prioridade)
  if (motorista)   query = query.ilike('motorista', `%${motorista}%`)
  if (rota)        query = query.ilike('rota', `%${rota}%`)
  if (resolvido !== null && resolvido !== undefined)
    query = query.eq('resolvido', resolvido)

  const inicio = (pagina - 1) * porPagina
  const { data, error, count } = await query
    .order('resolvido',       { ascending: true  })   // abertas primeiro
    .order('prioridade',      { ascending: false })   // CRITICA antes de BAIXA
    .order('data_alteracao',  { ascending: false })
    .order('criado_em',       { ascending: false })
    .range(inicio, inicio + porPagina - 1)

  if (error) return { dados: [], total: 0, erro: mensagemAmigavel(error) }
  return { dados: data ?? [], total: count ?? 0, erro: null }
}

// ─────────────────────────────────────────────────────────────────────────────
// CRIAR
// ─────────────────────────────────────────────────────────────────────────────

export async function criarAlteracao(alteracao, nomeUsuario) {
  const payload = {
    data_alteracao: alteracao.data_alteracao || hoje(),
    tipo:           alteracao.tipo,
    prioridade:     alteracao.prioridade || 'MEDIA',
    motorista:      alteracao.motorista       || null,
    rota:           alteracao.rota            || null,
    descricao:      alteracao.descricao.trim(),
    observacao:     alteracao.observacao?.trim() || null,
    resolvido:      false,
    criado_por:     nomeUsuario || null,
    atualizado_por: nomeUsuario || null,
  }

  const { data, error } = await supabase
    .from('alteracoes_operacionais')
    .insert([payload])
    .select()
    .single()

  if (error) return { dados: null, erro: mensagemAmigavel(error) }
  return { dados: data, erro: null }
}

// ─────────────────────────────────────────────────────────────────────────────
// EDITAR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Edita campos de uma alteração existente (exceto resolvido — use resolverAlteracao).
 * Permite atualizar descrição, observação, motorista, rota, tipo, prioridade.
 */
export async function editarAlteracao(id, campos, nomeUsuario) {
  const payload = {
    data_alteracao: campos.data_alteracao,
    tipo:           campos.tipo,
    prioridade:     campos.prioridade,
    motorista:      campos.motorista?.trim()   || null,
    rota:           campos.rota?.trim()        || null,
    descricao:      campos.descricao.trim(),
    observacao:     campos.observacao?.trim()  || null,
    atualizado_por: nomeUsuario || null,
    // atualizado_em é atualizado automaticamente pelo trigger
  }

  const { data, error } = await supabase
    .from('alteracoes_operacionais')
    .update(payload)
    .eq('id', id)
    .select()
    .single()

  if (error) return { dados: null, erro: mensagemAmigavel(error) }
  return { dados: data, erro: null }
}

// ─────────────────────────────────────────────────────────────────────────────
// RESOLVER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Marca como resolvida (sem DELETE).
 */
export async function resolverAlteracao(id, nomeUsuario) {
  const { error } = await supabase
    .from('alteracoes_operacionais')
    .update({
      resolvido:      true,
      resolvido_em:   new Date().toISOString(),
      resolvido_por:  nomeUsuario || null,
      atualizado_por: nomeUsuario || null,
    })
    .eq('id', id)

  if (error) return { erro: mensagemAmigavel(error) }
  return { erro: null }
}

// ─────────────────────────────────────────────────────────────────────────────
// ALTERAÇÕES DO DIA (para o Dashboard)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retorna as alterações abertas de hoje, ordenadas por prioridade.
 * Usado pelo bloco de resumo no Dashboard.
 * @param {number} limite
 */
export async function buscarAlteracoesHoje(limite = 5) {
  const dataHoje = hoje()

  const { data, error } = await supabase
    .from('alteracoes_operacionais')
    .select('id, tipo, prioridade, motorista, rota, descricao, resolvido')
    .eq('data_alteracao', dataHoje)
    .eq('resolvido', false)
    .order('prioridade', { ascending: false })
    .limit(limite)

  if (error) return { dados: null, erro: mensagemAmigavel(error) }
  return { dados: data ?? [], erro: null }
}

/**
 * Move alteração operacional para lixeira e a exclui fisicamente.
 */
export async function excluirAlteracao(id, nomeUsuario) {
  const { data: snap, error: errSnap } = await supabase
    .from('alteracoes_operacionais').select('*').eq('id', id).single()
  if (errSnap) return { sucesso: false, erro: errSnap.message }

  const descricao = `Alteração: ${snap.tipo ?? ''} — ${snap.descricao?.slice(0, 60) ?? ''}`
  const { erro: errLix } = await moverParaLixeira('alteracoes_operacionais', id, descricao, snap, nomeUsuario)
  if (errLix) return { sucesso: false, erro: errLix }

  const { error } = await supabase.from('alteracoes_operacionais').delete().eq('id', id)
  if (error) return { sucesso: false, erro: error.message }
  return { sucesso: true, erro: null }
}
