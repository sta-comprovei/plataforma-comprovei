import { supabase } from './supabaseClient'
import { TIPOS_OPERACAO, STATUS_OPERACAO } from './operacoesService'

/**
 * Camada de acesso a dados e agregação para o módulo de Relatórios
 * Gerenciais (Etapa 7). Tela exclusivamente de LEITURA — nenhuma função
 * de escrita é exposta aqui, e nenhuma chamada de
 * insert/update/delete/upsert existe neste arquivo.
 *
 * Reaproveita a mesma tabela `operacoes` (Etapa 3) já usada por
 * Operação do Dia, Histórico, Lead Time e Dashboard — sem nenhuma
 * tabela nova. A busca aqui é dedicada (não reaproveita
 * `dashboardService.buscarOperacoesDashboard`) porque os Relatórios
 * precisam de um filtro de Status que o Dashboard não usa, e de
 * algumas colunas adicionais (rota, placa) para as tabelas detalhadas
 * exportáveis.
 */

const TABELA_OPERACOES = 'operacoes'

const COLUNAS_RELATORIO =
  'id, data_operacao, motorista_id, codigo_motorista, nome_motorista, tipo_operacao, rota, placa, ' +
  'entregas_previstas, entregas_realizadas, percentual_conclusao, ' +
  'data_inicio, hora_inicio, data_finalizacao, hora_finalizacao, ' +
  'status, divergencia, lead_time_min, ativa, updated_at'

function mensagemAmigavel(error) {
  const msg = (error?.message || '').toLowerCase()
  if (msg.includes('network')) {
    return 'Não foi possível conectar ao servidor. Verifique sua internet.'
  }
  if (msg.includes('permission denied') || msg.includes('rls')) {
    return 'Você não tem permissão para visualizar estes dados.'
  }
  return 'Não foi possível carregar os relatórios. Tente novamente em instantes.'
}

/**
 * Busca operações para os relatórios, com todos os filtros pedidos na
 * Etapa 7 (incluindo Status, que os módulos anteriores não combinavam
 * com os demais filtros desta forma). Sem filtro de `ativa` — os
 * relatórios consolidam operações em andamento e finalizadas
 * juntas, igual ao Dashboard.
 *
 * @param {Object} params
 * @param {string} [params.dataInicio] - YYYY-MM-DD
 * @param {string} [params.dataFim]
 * @param {string} [params.motoristaId]
 * @param {string} [params.tipoOperacao]
 * @param {string} [params.status]
 */
export async function buscarOperacoesRelatorio({
  dataInicio = '',
  dataFim = '',
  motoristaId = '',
  tipoOperacao = '',
  status = '',
} = {}) {
  let query = supabase.from(TABELA_OPERACOES).select(COLUNAS_RELATORIO)

  if (dataInicio) query = query.gte('data_operacao', dataInicio)
  if (dataFim) query = query.lte('data_operacao', dataFim)
  if (motoristaId) query = query.eq('motorista_id', motoristaId)
  if (tipoOperacao) query = query.eq('tipo_operacao', tipoOperacao)
  if (status) query = query.eq('status', status)

  // Mesmo raciocínio das Etapas 4-6: relatórios precisam do conjunto
  // completo para totais/médias corretos, não de uma página — usamos
  // um limite alto em vez de paginação.
  query = query.order('data_operacao', { ascending: true }).limit(10000)

  const { data, error } = await query
  if (error) {
    return { dados: [], erro: mensagemAmigavel(error) }
  }
  return { dados: data ?? [], erro: null }
}

// ----------------------------------------------------------------------------
// Relatório Operacional
// ----------------------------------------------------------------------------

export function calcularRelatorioOperacional(operacoes) {
  const total = operacoes.length
  // 'Concluídas' agrupa 'Entrega finalizada' e 'Concluído' — mesma
  // equivalência já estabelecida na Etapa 5 (Histórico Operacional),
  // onde ambos os status são tratados como "operação finalizada"
  // (saem de Operação do Dia, vão para o Histórico). Manter essa
  // mesma classificação aqui evita que o total das 3 categorias
  // (Concluídas + Em andamento + Pendentes) não bata com o Total geral.
  const concluidas = operacoes.filter((o) => ['Entrega finalizada', 'Concluído'].includes(o.status)).length
  const emAndamento = operacoes.filter((o) =>
    ['Em trânsito', 'Chegada ao cliente'].includes(o.status)
  ).length
  const pendentes = operacoes.filter((o) => o.status === 'Pendente').length
  const comDivergencia = operacoes.filter((o) => o.divergencia && o.divergencia.trim() !== '').length

  return { total, concluidas, emAndamento, pendentes, comDivergencia }
}

// ----------------------------------------------------------------------------
// Relatório de Lead Time
// ----------------------------------------------------------------------------

export function calcularRelatorioLeadTime(operacoes, metasPorTipoMinutos) {
  const comLeadTime = operacoes.filter((o) => o.lead_time_min !== null && o.lead_time_min !== undefined)

  const media =
    comLeadTime.length > 0
      ? Math.round(comLeadTime.reduce((s, o) => s + o.lead_time_min, 0) / comLeadTime.length)
      : null
  const maior = comLeadTime.length > 0 ? Math.max(...comLeadTime.map((o) => o.lead_time_min)) : null
  const menor = comLeadTime.length > 0 ? Math.min(...comLeadTime.map((o) => o.lead_time_min)) : null

  // Média por motorista
  const porMotoristaMap = new Map()
  for (const op of comLeadTime) {
    if (!porMotoristaMap.has(op.motorista_id)) {
      porMotoristaMap.set(op.motorista_id, { nome: op.nome_motorista, codigo: op.codigo_motorista, valores: [] })
    }
    porMotoristaMap.get(op.motorista_id).valores.push(op.lead_time_min)
  }
  const mediaPorMotorista = Array.from(porMotoristaMap.values())
    .map((m) => ({
      nome: m.nome,
      codigo: m.codigo,
      media: Math.round(m.valores.reduce((s, v) => s + v, 0) / m.valores.length),
      quantidade: m.valores.length,
    }))
    .sort((a, b) => b.media - a.media)

  // Média por tipo de operação — nunca mistura categorias
  const mediaPorTipo = TIPOS_OPERACAO.map((tipo) => {
    const doTipo = comLeadTime.filter((o) => o.tipo_operacao === tipo)
    return {
      tipo,
      media: doTipo.length > 0 ? Math.round(doTipo.reduce((s, o) => s + o.lead_time_min, 0) / doTipo.length) : null,
      quantidade: doTipo.length,
    }
  })

  // Cumprimento de metas por tipo
  const cumprimentoMetas = TIPOS_OPERACAO.map((tipo) => {
    const doTipo = comLeadTime.filter((o) => o.tipo_operacao === tipo)
    const meta = metasPorTipoMinutos[tipo]
    if (doTipo.length === 0 || !meta) {
      return { tipo, percentualDentroMeta: null, quantidade: doTipo.length }
    }
    const dentro = doTipo.filter((o) => o.lead_time_min <= meta).length
    return { tipo, percentualDentroMeta: Math.round((dentro / doTipo.length) * 100), quantidade: doTipo.length }
  })

  return { media, maior, menor, mediaPorMotorista, mediaPorTipo, cumprimentoMetas }
}

// ----------------------------------------------------------------------------
// Relatório de Motoristas
// ----------------------------------------------------------------------------

export function calcularRelatorioMotoristas(operacoes) {
  const porMotoristaMap = new Map()
  for (const op of operacoes) {
    if (!porMotoristaMap.has(op.motorista_id)) {
      porMotoristaMap.set(op.motorista_id, {
        nome: op.nome_motorista,
        codigo: op.codigo_motorista,
        operacoes: [],
      })
    }
    porMotoristaMap.get(op.motorista_id).operacoes.push(op)
  }

  return Array.from(porMotoristaMap.values()).map((m) => {
    const quantidade = m.operacoes.length
    const concluidas = m.operacoes.filter((o) => o.status === 'Concluído').length
    const pendentes = m.operacoes.filter((o) => o.status === 'Pendente').length
    const percentualConclusao = quantidade > 0 ? Math.round((concluidas / quantidade) * 100) : 0
    const comLeadTime = m.operacoes.filter((o) => o.lead_time_min !== null && o.lead_time_min !== undefined)
    const leadTimeMedio =
      comLeadTime.length > 0
        ? Math.round(comLeadTime.reduce((s, o) => s + o.lead_time_min, 0) / comLeadTime.length)
        : null

    return {
      motoristaId: m.operacoes[0].motorista_id,
      nome: m.nome,
      codigo: m.codigo,
      quantidade,
      concluidas,
      pendentes,
      percentualConclusao,
      leadTimeMedio,
    }
  })
}

// ----------------------------------------------------------------------------
// Relatório de Divergências
// ----------------------------------------------------------------------------

export function calcularRelatorioDivergencias(operacoes) {
  const comDivergencia = operacoes.filter((o) => o.divergencia && o.divergencia.trim() !== '')
  const total = operacoes.length
  const quantidade = comDivergencia.length
  const percentual = total > 0 ? Math.round((quantidade / total) * 100) : 0

  // Motoristas envolvidos (distintos, ordenados por quantidade de divergências)
  const porMotoristaMap = new Map()
  for (const op of comDivergencia) {
    if (!porMotoristaMap.has(op.motorista_id)) {
      porMotoristaMap.set(op.motorista_id, { nome: op.nome_motorista, codigo: op.codigo_motorista, quantidade: 0 })
    }
    porMotoristaMap.get(op.motorista_id).quantidade += 1
  }
  const motoristasEnvolvidos = Array.from(porMotoristaMap.values()).sort((a, b) => b.quantidade - a.quantidade)

  // Evolução por período (mês) — agrupamento simples por YYYY-MM
  const porMes = new Map()
  for (const op of comDivergencia) {
    const mesChave = op.data_operacao.slice(0, 7)
    porMes.set(mesChave, (porMes.get(mesChave) || 0) + 1)
  }
  const evolucaoPorPeriodo = Array.from(porMes.entries())
    .map(([mes, qtd]) => ({ mes, quantidade: qtd }))
    .sort((a, b) => a.mes.localeCompare(b.mes))

  return { quantidade, percentual, motoristasEnvolvidos, evolucaoPorPeriodo, registros: comDivergencia }
}

export { TIPOS_OPERACAO, STATUS_OPERACAO }
