import { supabase } from './supabaseClient'

/**
 * Camada de acesso a dados para o módulo Histórico Operacional (Etapa 5).
 *
 * O Histórico NÃO é uma tabela separada — é a mesma tabela `operacoes`
 * (Etapa 3), filtrada por `ativa = false`. Uma operação passa a aparecer
 * aqui automaticamente assim que o trigger do banco
 * (`fn_operacoes_before_write`, ver migration 0006) a classifica como
 * finalizada: status IN ('Entrega finalizada', 'Concluído') E
 * data_finalizacao E hora_finalizacao preenchidas. Nenhuma ação manual
 * de "mover para o histórico" existe ou é necessária no frontend.
 *
 * Como o Histórico é só leitura (nenhuma operação finalizada é editada
 * a partir desta tela), esta camada não expõe nenhuma função de
 * escrita — edições continuam acontecendo via operacoesService.js
 * enquanto a operação ainda está ativa.
 */

const TABELA = 'operacoes'

const COLUNAS =
  'id, data_operacao, motorista_id, codigo_motorista, nome_motorista, tipo_operacao, rota, placa, ' +
  'entregas_previstas, entregas_realizadas, percentual_conclusao, ' +
  'data_inicio, hora_inicio, data_finalizacao, hora_finalizacao, ' +
  'status, divergencia, observacoes, lead_time_min, ' +
  'usuario_criacao, usuario_ultima_alteracao, created_at, updated_at'

function escaparCuringasILike(valor) {
  return valor.replace(/[%_]/g, (c) => `\\${c}`)
}

function mensagemAmigavel(error) {
  const msg = (error?.message || '').toLowerCase()
  if (msg.includes('network')) {
    return 'Não foi possível conectar ao servidor. Verifique sua internet.'
  }
  if (msg.includes('permission denied') || msg.includes('rls')) {
    return 'Você não tem permissão para visualizar este registro.'
  }
  return 'Não foi possível concluir a operação. Tente novamente em instantes.'
}

/**
 * Lista operações finalizadas (ativa = false) com pesquisa, filtros,
 * ordenação e paginação.
 *
 * @param {Object} params
 * @param {string} [params.busca] - código/nome do motorista, rota ou placa
 * @param {string} [params.dataInicio] - YYYY-MM-DD, início do período (por data_operacao)
 * @param {string} [params.dataFim] - YYYY-MM-DD, fim do período
 * @param {string} [params.motoristaId]
 * @param {string} [params.tipoOperacao]
 * @param {string} [params.status]
 * @param {string} [params.rota]
 * @param {string} [params.placa]
 * @param {{coluna: string, direcao: 'asc'|'desc'}} [params.ordenacao]
 * @param {number} [params.pagina] - 1-indexed
 * @param {number} [params.porPagina]
 */
export async function listarHistorico({
  busca = '',
  dataInicio = '',
  dataFim = '',
  motoristaId = '',
  tipoOperacao = '',
  status = '',
  rota = '',
  placa = '',
  ordenacao = { coluna: 'data_finalizacao', direcao: 'desc' },
  pagina = 1,
  porPagina = 10,
} = {}) {
  const inicio = (pagina - 1) * porPagina
  const fim = inicio + porPagina - 1

  let query = supabase.from(TABELA).select(COLUNAS, { count: 'exact' }).eq('ativa', false)

  const termo = busca.trim()
  if (termo) {
    const termoEscapado = escaparCuringasILike(termo).replace(/[,()]/g, (c) => `\\${c}`)
    query = query.or(
      `codigo_motorista.ilike.%${termoEscapado}%,nome_motorista.ilike.%${termoEscapado}%,rota.ilike.%${termoEscapado}%,placa.ilike.%${termoEscapado}%`
    )
  }

  if (dataInicio) query = query.gte('data_operacao', dataInicio)
  if (dataFim) query = query.lte('data_operacao', dataFim)
  if (motoristaId) query = query.eq('motorista_id', motoristaId)
  if (tipoOperacao) query = query.eq('tipo_operacao', tipoOperacao)
  if (status) query = query.eq('status', status)
  if (rota.trim()) query = query.ilike('rota', `%${escaparCuringasILike(rota.trim())}%`)
  if (placa.trim()) query = query.ilike('placa', `%${escaparCuringasILike(placa.trim())}%`)

  query = query
    .order(ordenacao.coluna, { ascending: ordenacao.direcao === 'asc' })
    .range(inicio, fim)

  const { data, error, count } = await query

  if (error) {
    return { dados: [], total: 0, erro: mensagemAmigavel(error) }
  }
  return { dados: data ?? [], total: count ?? 0, erro: null }
}

export async function buscarHistoricoPorId(id) {
  const { data, error } = await supabase
    .from(TABELA)
    .select(COLUNAS)
    .eq('id', id)
    .eq('ativa', false)
    .maybeSingle()

  if (error) {
    return { dados: null, erro: mensagemAmigavel(error) }
  }
  return { dados: data, erro: null }
}

/**
 * Busca TODAS as operações finalizadas que casam com os filtros (sem
 * paginação) — usada para calcular os cards de indicadores, que
 * precisam do conjunto completo (não apenas a página atual) para
 * totais e médias corretos.
 */
export async function buscarTodoHistoricoFiltrado({
  busca = '',
  dataInicio = '',
  dataFim = '',
  motoristaId = '',
  tipoOperacao = '',
  status = '',
  rota = '',
  placa = '',
} = {}) {
  let query = supabase
    .from(TABELA)
    .select(
      'id, tipo_operacao, lead_time_min, divergencia, motorista_id, codigo_motorista, nome_motorista'
    )
    .eq('ativa', false)

  const termo = busca.trim()
  if (termo) {
    const termoEscapado = escaparCuringasILike(termo).replace(/[,()]/g, (c) => `\\${c}`)
    query = query.or(
      `codigo_motorista.ilike.%${termoEscapado}%,nome_motorista.ilike.%${termoEscapado}%,rota.ilike.%${termoEscapado}%,placa.ilike.%${termoEscapado}%`
    )
  }
  if (dataInicio) query = query.gte('data_operacao', dataInicio)
  if (dataFim) query = query.lte('data_operacao', dataFim)
  if (motoristaId) query = query.eq('motorista_id', motoristaId)
  if (tipoOperacao) query = query.eq('tipo_operacao', tipoOperacao)
  if (status) query = query.eq('status', status)
  if (rota.trim()) query = query.ilike('rota', `%${escaparCuringasILike(rota.trim())}%`)
  if (placa.trim()) query = query.ilike('placa', `%${escaparCuringasILike(placa.trim())}%`)

  query = query.limit(10000)

  const { data, error } = await query
  if (error) {
    return { dados: [], erro: mensagemAmigavel(error) }
  }
  return { dados: data ?? [], erro: null }
}

/**
 * Calcula os cards de indicadores do Histórico a partir de um conjunto
 * já carregado de operações finalizadas (ver buscarTodoHistoricoFiltrado).
 */
export function calcularIndicadoresHistorico(operacoes) {
  const total = operacoes.length
  const totalDF = operacoes.filter((o) => o.tipo_operacao === 'DF').length
  const totalAdega = operacoes.filter((o) => o.tipo_operacao === 'Adega').length
  const totalFilial = operacoes.filter((o) => o.tipo_operacao === 'Filial').length
  const comDivergencia = operacoes.filter((o) => o.divergencia && o.divergencia.trim() !== '').length

  const valoresLeadTime = operacoes.map((o) => o.lead_time_min).filter((v) => v !== null && v !== undefined)
  const leadTimeMedio =
    valoresLeadTime.length > 0
      ? Math.round(valoresLeadTime.reduce((s, v) => s + v, 0) / valoresLeadTime.length)
      : null

  return { total, totalDF, totalAdega, totalFilial, leadTimeMedio, comDivergencia }
}
