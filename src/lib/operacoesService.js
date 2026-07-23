import { supabase } from './supabaseClient'
import { moverParaLixeira } from './lixeiraService'

/**
 * Camada de acesso a dados para o módulo de Operação do Dia.
 * Nenhum componente de UI deve chamar `supabase` diretamente para esta
 * entidade — toda query passa por aqui, seguindo o mesmo padrão de
 * motoristasService.js.
 *
 * Auditoria: toda criação/edição é registrada automaticamente pelo
 * trigger trg_auditoria_operacoes no banco (ver
 * supabase/migrations/0004_operacao_do_dia.sql) — esta camada não
 * precisa (e não deve) chamar nada relacionado a auditoria manualmente.
 */

const TABELA = 'operacoes'

const COLUNAS =
  'id, data_operacao, motorista_id, codigo_motorista, nome_motorista, tipo_operacao, rota, placa, ' +
  'entregas_previstas, entregas_realizadas, percentual_conclusao, ' +
  'data_inicio, hora_inicio, data_finalizacao, hora_finalizacao, ' +
  'status, status_operacional, divergencia, observacoes, lead_time_min, ' +
  'motivo_pendencia, descricao_pendencia, observacao_pendencia, data_pendencia, usuario_pendencia, ' +
  'usuario_criacao, usuario_ultima_alteracao, created_at, updated_at'

export const TIPOS_OPERACAO = ['DF', 'Adega', 'Filial']

export const STATUS_OPERACAO = [
  'Pendente',
  'Em trânsito',
  'Chegada ao cliente',
  'Entrega finalizada',
  'Concluído',
]

function escaparCuringasILike(valor) {
  return valor.replace(/[%_]/g, (c) => `\\${c}`)
}

function mensagemAmigavel(error) {
  const code = error?.code
  const msg = (error?.message || '').toLowerCase()

  // exceções customizadas levantadas pelo trigger (raise exception)
  if (msg.includes('motorista não cadastrado')) {
    return 'Motorista não cadastrado.'
  }
  if (msg.includes('motorista inativo')) {
    return 'Não é possível criar uma operação para um motorista inativo.'
  }

  // foreign_key_violation
  if (code === '23503') {
    return 'Motorista não cadastrado.'
  }

  // check_violation (ex.: entregas negativas)
  if (code === '23514') {
    return 'Valores inválidos: entregas previstas e realizadas devem ser maiores ou iguais a zero.'
  }

  if (msg.includes('network')) {
    return 'Não foi possível conectar ao servidor. Verifique sua internet.'
  }

  return 'Não foi possível concluir a operação. Tente novamente em instantes.'
}

/**
 * Lista operações com pesquisa, filtros, ordenação e paginação.
 *
 * A partir da Etapa 5, esta função é exclusiva da tela "Operação do
 * Dia": filtra implicitamente por `ativa = true` (Pendente, Em trânsito,
 * Chegada ao cliente, ou um status de conclusão que ainda não tenha
 * data/hora de finalização preenchidas). Operações finalizadas
 * (`ativa = false`) saem daqui automaticamente e passam a aparecer em
 * `historicoService.js` — sem necessidade de nenhuma ação manual, a
 * classificação é feita pelo trigger do banco a cada escrita.
 *
 * @param {Object} params
 * @param {string} [params.busca] - pesquisa rápida (código/nome do motorista, rota, placa)
 * @param {string} [params.dataOperacao] - YYYY-MM-DD, filtro exato por data
 * @param {string} [params.motoristaId] - filtra por um motorista específico
 * @param {string} [params.tipoOperacao]
 * @param {string} [params.status]
 * @param {string} [params.rota]
 * @param {string} [params.placa]
 * @param {{coluna: string, direcao: 'asc'|'desc'}} [params.ordenacao]
 * @param {number} [params.pagina] - 1-indexed
 * @param {number} [params.porPagina]
 */
export async function listarOperacoes({
  busca = '',
  dataOperacao = '',
  motoristaId = '',
  tipoOperacao = '',
  status = '',
  rota = '',
  placa = '',
  ordenacao = { coluna: 'data_operacao', direcao: 'desc' },
  pagina = 1,
  porPagina = 10,
} = {}) {
  const inicio = (pagina - 1) * porPagina
  const fim = inicio + porPagina - 1

  let query = supabase.from(TABELA).select(COLUNAS, { count: 'exact' }).eq('ativa', true).eq('status_operacional', 'ATIVA')

  const termo = busca.trim()
  if (termo) {
    const termoEscapado = escaparCuringasILike(termo).replace(/[,()]/g, (c) => `\\${c}`)
    query = query.or(
      `codigo_motorista.ilike.%${termoEscapado}%,nome_motorista.ilike.%${termoEscapado}%,rota.ilike.%${termoEscapado}%,placa.ilike.%${termoEscapado}%`
    )
  }

  if (dataOperacao) {
    query = query.eq('data_operacao', dataOperacao)
  }
  if (motoristaId) {
    query = query.eq('motorista_id', motoristaId)
  }
  if (tipoOperacao) {
    query = query.eq('tipo_operacao', tipoOperacao)
  }
  if (status) {
    query = query.eq('status', status)
  }
  if (rota.trim()) {
    query = query.ilike('rota', `%${escaparCuringasILike(rota.trim())}%`)
  }
  if (placa.trim()) {
    query = query.ilike('placa', `%${escaparCuringasILike(placa.trim())}%`)
  }

  query = query
    .order(ordenacao.coluna, { ascending: ordenacao.direcao === 'asc' })
    .order('hora_inicio', { ascending: false, nullsFirst: false })
    .range(inicio, fim)

  const { data, error, count } = await query

  if (error) {
    return { dados: [], total: 0, erro: mensagemAmigavel(error) }
  }

  return { dados: data ?? [], total: count ?? 0, erro: null }
}

export async function buscarOperacaoPorId(id) {
  const { data, error } = await supabase.from(TABELA).select(COLUNAS).eq('id', id).maybeSingle()
  if (error) {
    return { dados: null, erro: mensagemAmigavel(error) }
  }
  return { dados: data, erro: null }
}

/**
 * Cria uma nova operação. O snapshot codigo_motorista/nome_motorista deve
 * ser passado pelo chamador (vem do motorista já validado via
 * useMotoristaPorCodigo) — esta função não busca o motorista de novo, só
 * persiste o que já foi validado na tela.
 */
export async function criarOperacao({
  dataOperacao,
  motoristaId,
  codigoMotorista,
  nomeMotorista,
  tipoOperacao,
  rota,
  placa,
  entregasPrevistas,
  entregasRealizadas,
  dataInicio,
  horaInicio,
  dataFinalizacao,
  horaFinalizacao,
  status,
  divergencia,
  observacoes,
}) {
  const { data, error } = await supabase
    .from(TABELA)
    .insert({
      data_operacao: dataOperacao,
      motorista_id: motoristaId,
      codigo_motorista: codigoMotorista,
      nome_motorista: nomeMotorista,
      tipo_operacao: tipoOperacao,
      rota: rota?.trim(),
      placa: placa?.trim() || null,
      entregas_previstas: entregasPrevistas,
      entregas_realizadas: entregasRealizadas,
      data_inicio: dataInicio || null,
      hora_inicio: horaInicio || null,
      data_finalizacao: dataFinalizacao || null,
      hora_finalizacao: horaFinalizacao || null,
      status,
      divergencia: divergencia?.trim() || null,
      observacoes: observacoes?.trim() || null,
    })
    .select(COLUNAS)
    .single()

  if (error) {
    return { dados: null, erro: mensagemAmigavel(error) }
  }
  return { dados: data, erro: null }
}

export async function atualizarOperacao(id, {
  dataOperacao,
  tipoOperacao,
  rota,
  placa,
  entregasPrevistas,
  entregasRealizadas,
  dataInicio,
  horaInicio,
  dataFinalizacao,
  horaFinalizacao,
  status,
  divergencia,
  observacoes,
}) {
  const { data, error } = await supabase
    .from(TABELA)
    .update({
      data_operacao: dataOperacao,
      tipo_operacao: tipoOperacao,
      rota: rota?.trim(),
      placa: placa?.trim() || null,
      entregas_previstas: entregasPrevistas,
      entregas_realizadas: entregasRealizadas,
      data_inicio: dataInicio || null,
      hora_inicio: horaInicio || null,
      data_finalizacao: dataFinalizacao || null,
      hora_finalizacao: horaFinalizacao || null,
      status,
      divergencia: divergencia?.trim() || null,
      observacoes: observacoes?.trim() || null,
    })
    .eq('id', id)
    .select(COLUNAS)
    .single()

  if (error) {
    return { dados: null, erro: mensagemAmigavel(error) }
  }
  return { dados: data, erro: null }
}

/**
 * Lista motoristas (código + nome) que já possuem ao menos uma operação
 * registrada — usado para popular o filtro "Motorista" da listagem sem
 * precisar de uma query separada em `motoristas` nem o risco de listar
 * motoristas que nunca tiveram operação.
 */
export async function listarMotoristasComOperacao() {
  const { data, error } = await supabase.from(TABELA).select('motorista_id, codigo_motorista, nome_motorista')

  if (error) {
    return { dados: [], erro: mensagemAmigavel(error) }
  }

  const vistos = new Map()
  for (const row of data ?? []) {
    if (!vistos.has(row.motorista_id)) {
      vistos.set(row.motorista_id, { id: row.motorista_id, codigo: row.codigo_motorista, nome: row.nome_motorista })
    }
  }
  const lista = Array.from(vistos.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  return { dados: lista, erro: null }
}

/**
 * Move operação para a lixeira e depois a exclui fisicamente.
 * A Operação do Dia nunca é deletada diretamente.
 */
export async function excluirOperacao(id, nomeUsuario) {
  const { data: snap, error: errSnap } = await supabase
    .from(TABELA).select('*').eq('id', id).single()
  if (errSnap) return { sucesso: false, erro: mensagemAmigavel(errSnap) }

  const descricao = `Operação: ${snap.nome_motorista ?? 'Motorista'} — ${snap.data_operacao ?? ''}`
  const { erro: errLix } = await moverParaLixeira('operacoes', id, descricao, snap, nomeUsuario)
  if (errLix) return { sucesso: false, erro: errLix }

  const { error } = await supabase.from(TABELA).delete().eq('id', id)
  if (error) return { sucesso: false, erro: mensagemAmigavel(error) }
  return { sucesso: true, erro: null }
}
