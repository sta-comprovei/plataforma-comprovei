import { supabase } from './supabaseClient'
import { TIPOS_OPERACAO, STATUS_OPERACAO } from './operacoesService'

/**
 * Camada de acesso a dados e agregação para o Dashboard Executivo
 * (Etapa 6). Consolida informações de Operação do Dia (Etapa 3),
 * Histórico Operacional (Etapa 5) e Lead Time (Etapa 4) — sem nenhuma
 * tabela nova: tudo é lido de `operacoes` e `metas_lead_time`,
 * já existentes.
 *
 * Esta tela é exclusivamente de LEITURA. Nenhuma função de escrita é
 * exposta aqui — o Dashboard nunca altera dado operacional algum,
 * conforme o requisito da Etapa 6 ("Dashboard é apenas leitura").
 */

const TABELA_OPERACOES = 'operacoes'

const COLUNAS_DASHBOARD =
  'id, data_operacao, motorista_id, codigo_motorista, nome_motorista, tipo_operacao, ' +
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
  return 'Não foi possível carregar os indicadores. Tente novamente em instantes.'
}

/**
 * Busca TODAS as operações (ativas + finalizadas, sem filtro de `ativa`)
 * dentro de um período/filtro, para consolidação no Dashboard. Diferente
 * de `operacoesService.listarOperacoes` (só ativas) e
 * `historicoService.listarHistorico` (só finalizadas), esta função
 * propositalmente NÃO filtra por `ativa` — o Dashboard precisa enxergar
 * o conjunto completo para indicadores como "Total de operações".
 *
 * @param {Object} params
 * @param {string} [params.dataInicio] - YYYY-MM-DD, filtra por data_operacao
 * @param {string} [params.dataFim]
 * @param {string} [params.motoristaId]
 * @param {string} [params.tipoOperacao]
 */
export async function buscarOperacoesDashboard({
  dataInicio = '',
  dataFim = '',
  motoristaId = '',
  tipoOperacao = '',
} = {}) {
  let query = supabase.from(TABELA_OPERACOES).select(COLUNAS_DASHBOARD)

  if (dataInicio) query = query.gte('data_operacao', dataInicio)
  if (dataFim) query = query.lte('data_operacao', dataFim)
  if (motoristaId) query = query.eq('motorista_id', motoristaId)
  if (tipoOperacao) query = query.eq('tipo_operacao', tipoOperacao)

  // Mesmo raciocínio de buscarOperacoesComLeadTime (Etapa 4): o Dashboard
  // precisa do conjunto completo para indicadores e gráficos corretos,
  // não de uma página — usamos um limite alto em vez de paginação.
  query = query.order('data_operacao', { ascending: true }).limit(10000)

  const { data, error } = await query
  if (error) {
    return { dados: [], erro: mensagemAmigavel(error) }
  }
  return { dados: data ?? [], erro: null }
}

// ----------------------------------------------------------------------------
// Indicadores principais (cards)
// ----------------------------------------------------------------------------

/**
 * Calcula os indicadores principais pedidos para os cards do topo do
 * Dashboard, a partir de um conjunto de operações já carregado
 * (ver buscarOperacoesDashboard) e das metas por categoria.
 */
export function calcularIndicadoresPrincipais(operacoes, metasPorTipoMinutos, prazosPorRota = {}) {
  const emAndamento = operacoes.filter((o) => o.ativa).length
  const finalizadas = operacoes.filter((o) => !o.ativa).length
  const total = operacoes.length

  const comLeadTime = operacoes.filter((o) => o.lead_time_min !== null && o.lead_time_min !== undefined)
  const leadTimeMedioGeral =
    comLeadTime.length > 0
      ? Math.round(comLeadTime.reduce((s, o) => s + o.lead_time_min, 0) / comLeadTime.length)
      : null

  const leadTimeMedioPorTipo = {}
  for (const tipo of TIPOS_OPERACAO) {
    const doTipo = comLeadTime.filter((o) => o.tipo_operacao === tipo)
    leadTimeMedioPorTipo[tipo] =
      doTipo.length > 0 ? Math.round(doTipo.reduce((s, o) => s + o.lead_time_min, 0) / doTipo.length) : null
  }

  const percentualMedioConclusao =
    operacoes.length > 0
      ? Math.round(operacoes.reduce((s, o) => s + (o.percentual_conclusao || 0), 0) / operacoes.length)
      : 0

  const comDivergencia = operacoes.filter((o) => o.divergencia && o.divergencia.trim() !== '').length

  const foraDaMeta = comLeadTime.filter((o) => {
    const rotaKey = (o.rota || '').toUpperCase().trim()
    const meta = prazosPorRota[rotaKey] ?? metasPorTipoMinutos[o.tipo_operacao]
    return meta && o.lead_time_min > meta
  }).length

  return {
    emAndamento,
    finalizadas,
    total,
    leadTimeMedioGeral,
    leadTimeMedioDF: leadTimeMedioPorTipo.DF,
    leadTimeMedioAdega: leadTimeMedioPorTipo.Adega,
    leadTimeMedioFilial: leadTimeMedioPorTipo.Filial,
    percentualMedioConclusao,
    comDivergencia,
    foraDaMeta,
  }
}

// ----------------------------------------------------------------------------
// Gráfico: Evolução de Operações (diário/semanal/mensal)
// ----------------------------------------------------------------------------

/**
 * Agrupa a contagem de operações por dia, semana ou mês, conforme
 * `granularidade`. Retorna os últimos `quantidade` períodos, incluindo
 * períodos sem nenhuma operação (contagem 0) para o gráfico não "pular"
 * pontos no eixo do tempo.
 */
export function calcularEvolucaoOperacoes(operacoes, granularidade = 'diario', quantidade = 14) {
  const hoje = new Date()
  const chaves = []
  const labels = []

  function chaveDia(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  // Chave de semana = data (YYYY-MM-DD) da segunda-feira daquela semana
  // civil. Usar a segunda-feira como âncora garante que QUALQUER data
  // dentro da mesma semana (de segunda a domingo) produza exatamente a
  // mesma chave — uma fórmula anterior baseada em deslocamento fixo a
  // partir do dia da semana de 1º de janeiro fazia domingo "vazar" para
  // a chave da semana seguinte, separando incorretamente datas da mesma
  // semana civil no gráfico.
  function inicioDaSemana(d) {
    const dataLocal = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    const diaSemana = dataLocal.getDay() // 0=domingo, 1=segunda, ..., 6=sábado
    const deslocamento = diaSemana === 0 ? 6 : diaSemana - 1
    dataLocal.setDate(dataLocal.getDate() - deslocamento)
    return dataLocal
  }
  function chaveSemana(d) {
    return chaveDia(inicioDaSemana(d))
  }
  function chaveMes(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }

  if (granularidade === 'diario') {
    for (let i = quantidade - 1; i >= 0; i--) {
      const d = new Date(hoje)
      d.setDate(hoje.getDate() - i)
      chaves.push(chaveDia(d))
      labels.push(d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }))
    }
  } else if (granularidade === 'semanal') {
    // Gera as últimas `quantidade` semanas civis, cada uma identificada
    // pela data de sua segunda-feira — evita duplicar a lógica de
    // cálculo de semana em dois lugares diferentes (geração do eixo X
    // vs. agrupamento das operações).
    const segundaAtual = inicioDaSemana(hoje)
    for (let i = quantidade - 1; i >= 0; i--) {
      const d = new Date(segundaAtual)
      d.setDate(segundaAtual.getDate() - i * 7)
      chaves.push(chaveDia(d))
      labels.push(d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }))
    }
  } else {
    const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
    for (let i = quantidade - 1; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
      chaves.push(chaveMes(d))
      labels.push(MESES[d.getMonth()])
    }
  }

  const contagem = {}
  for (const op of operacoes) {
    const d = new Date(`${op.data_operacao}T00:00:00`)
    const chave = granularidade === 'diario' ? chaveDia(d) : granularidade === 'semanal' ? chaveSemana(d) : chaveMes(d)
    contagem[chave] = (contagem[chave] || 0) + 1
  }

  return chaves.map((chave, i) => ({ label: labels[i], chave, quantidade: contagem[chave] || 0 }))
}

// ----------------------------------------------------------------------------
// Gráfico: Tipos de Operação (quantidade + percentual)
// ----------------------------------------------------------------------------

export function calcularDistribuicaoPorTipo(operacoes) {
  const total = operacoes.length
  return TIPOS_OPERACAO.map((tipo) => {
    const quantidade = operacoes.filter((o) => o.tipo_operacao === tipo).length
    return {
      tipo,
      quantidade,
      percentual: total > 0 ? Math.round((quantidade / total) * 100) : 0,
    }
  })
}

// ----------------------------------------------------------------------------
// Gráfico: Status Operacionais
// ----------------------------------------------------------------------------

export function calcularDistribuicaoPorStatus(operacoes) {
  const total = operacoes.length
  return STATUS_OPERACAO.map((status) => {
    const quantidade = operacoes.filter((o) => o.status === status).length
    return {
      status,
      quantidade,
      percentual: total > 0 ? Math.round((quantidade / total) * 100) : 0,
    }
  })
}

// ----------------------------------------------------------------------------
// Alertas gerenciais
// ----------------------------------------------------------------------------

/**
 * Calcula os 4 alertas gerenciais pedidos: fora da meta, com
 * divergência, lead time elevado (>150% da meta) e abertas há vários
 * dias (operação ativa cuja data_operacao é anterior a hoje).
 */
export function calcularAlertasGerenciais(operacoes, metasPorTipoMinutos, prazosPorRota = {}) {
  const hojeISO = new Date().toISOString().slice(0, 10)

  // Prioridade 1: prazo da rota. Prioridade 2: meta da categoria.
  function prazoEfetivo(op) {
    const rotaKey = (op.rota || '').toUpperCase().trim()
    if (prazosPorRota[rotaKey] != null) return prazosPorRota[rotaKey]
    return metasPorTipoMinutos[op.tipo_operacao] ?? null
  }

  const foraDaMeta = operacoes.filter((o) => {
    const prazo = prazoEfetivo(o)
    return prazo && o.lead_time_min !== null && o.lead_time_min > prazo
  })

  const comDivergencia = operacoes.filter((o) => o.divergencia && o.divergencia.trim() !== '')

  const leadTimeElevado = operacoes.filter((o) => {
    const prazo = prazoEfetivo(o)
    return prazo && o.lead_time_min !== null && o.lead_time_min > prazo * 1.5
  })

  const abertasHaVariosDias = operacoes.filter((o) => o.ativa && o.data_operacao < hojeISO)

  return { foraDaMeta, comDivergencia, leadTimeElevado, abertasHaVariosDias }
}

// ----------------------------------------------------------------------------
// Insights automáticos
// ----------------------------------------------------------------------------

/**
 * Gera textos de insight automáticos comparando o período atual com o
 * período imediatamente anterior de mesma duração (ex.: "este mês" vs.
 * "mês anterior"). Inteiramente baseado em cálculos sobre os dados —
 * nenhuma IA externa é usada, conforme o requisito.
 *
 * @param {Array} operacoesAtual - operações do período filtrado atualmente
 * @param {Array} operacoesAnterior - operações do período imediatamente anterior, mesma duração
 */
export function gerarInsightsAutomaticos(operacoesAtual, operacoesAnterior) {
  const insights = []

  function mediaLeadTime(ops, tipo) {
    const filtradas = tipo ? ops.filter((o) => o.tipo_operacao === tipo) : ops
    const comLT = filtradas.filter((o) => o.lead_time_min !== null && o.lead_time_min !== undefined)
    if (comLT.length === 0) return null
    return comLT.reduce((s, o) => s + o.lead_time_min, 0) / comLT.length
  }

  function variacaoPercentual(atual, anterior) {
    if (atual === null || anterior === null || anterior === 0) return null
    return Math.round(((atual - anterior) / anterior) * 100)
  }

  // 1. Lead Time médio geral: reduziu/aumentou X%
  const ltAtual = mediaLeadTime(operacoesAtual)
  const ltAnterior = mediaLeadTime(operacoesAnterior)
  const variacaoLT = variacaoPercentual(ltAtual, ltAnterior)
  if (variacaoLT !== null && variacaoLT !== 0) {
    insights.push({
      tipo: variacaoLT < 0 ? 'positivo' : 'negativo',
      texto: `Lead Time médio geral ${variacaoLT < 0 ? 'reduziu' : 'aumentou'} ${Math.abs(variacaoLT)}% em relação ao período anterior.`,
    })
  }

  // 2. Operações fora da meta: aumentaram/reduziram X% (usa contagem, não %)
  // (calculado externamente e passado via parâmetro seria mais correto,
  // mas para manter a função autocontida, repetimos a lógica de meta
  // aqui só para os dois conjuntos de operações recebidos)

  // 3 e 4. Melhor/pior desempenho por categoria no período atual
  const mediasPorTipo = TIPOS_OPERACAO.map((tipo) => ({ tipo, media: mediaLeadTime(operacoesAtual, tipo) })).filter(
    (m) => m.media !== null
  )
  if (mediasPorTipo.length >= 2) {
    const melhor = mediasPorTipo.reduce((a, b) => (a.media < b.media ? a : b))
    const pior = mediasPorTipo.reduce((a, b) => (a.media > b.media ? a : b))
    if (melhor.tipo !== pior.tipo) {
      insights.push({
        tipo: 'positivo',
        texto: `${melhor.tipo} apresentou o melhor desempenho de Lead Time no período.`,
      })
      insights.push({
        tipo: 'atencao',
        texto: `${pior.tipo} apresentou o maior tempo médio em rota no período.`,
      })
    }
  }

  // 5. Percentual médio de conclusão: comparação
  function mediaPercentual(ops) {
    if (ops.length === 0) return null
    return ops.reduce((s, o) => s + (o.percentual_conclusao || 0), 0) / ops.length
  }
  const pctAtual = mediaPercentual(operacoesAtual)
  const pctAnterior = mediaPercentual(operacoesAnterior)
  const variacaoPct = variacaoPercentual(pctAtual, pctAnterior)
  if (variacaoPct !== null && variacaoPct !== 0) {
    insights.push({
      tipo: variacaoPct > 0 ? 'positivo' : 'negativo',
      texto: `Percentual médio de conclusão ${variacaoPct > 0 ? 'melhorou' : 'piorou'} ${Math.abs(variacaoPct)}% em relação ao período anterior.`,
    })
  }

  // 6. Divergências: comparação
  const divAtual = operacoesAtual.filter((o) => o.divergencia && o.divergencia.trim() !== '').length
  const divAnterior = operacoesAnterior.filter((o) => o.divergencia && o.divergencia.trim() !== '').length
  if (divAnterior > 0) {
    const variacaoDiv = Math.round(((divAtual - divAnterior) / divAnterior) * 100)
    if (variacaoDiv !== 0) {
      insights.push({
        tipo: variacaoDiv < 0 ? 'positivo' : 'negativo',
        texto: `Operações com divergência ${variacaoDiv < 0 ? 'reduziram' : 'aumentaram'} ${Math.abs(variacaoDiv)}% em relação ao período anterior.`,
      })
    }
  } else if (divAtual > 0) {
    insights.push({
      tipo: 'atencao',
      texto: `${divAtual} operação(ões) com divergência registrada(s) no período (nenhuma no período anterior).`,
    })
  }

  if (insights.length === 0) {
    insights.push({
      tipo: 'neutro',
      texto: 'Sem variações relevantes em relação ao período anterior.',
    })
  }

  return insights
}

// ----------------------------------------------------------------------------
// Gráfico: Comparação de Lead Time entre períodos
// ----------------------------------------------------------------------------

/**
 * Calcula o Lead Time médio por categoria para o período atual e o
 * período imediatamente anterior, lado a lado — usado pelo gráfico
 * "Comparação entre períodos" pedido explicitamente na seção de Lead
 * Time do Dashboard (distinto da "Evolução mensal", que é uma série
 * temporal contínua).
 */
export function calcularComparacaoPeriodos(operacoesAtual, operacoesAnterior) {
  function mediaPorTipo(ops, tipo) {
    const doTipo = ops.filter((o) => o.tipo_operacao === tipo && o.lead_time_min !== null && o.lead_time_min !== undefined)
    if (doTipo.length === 0) return null
    return Math.round(doTipo.reduce((s, o) => s + o.lead_time_min, 0) / doTipo.length)
  }

  return TIPOS_OPERACAO.map((tipo) => ({
    tipo,
    atual: mediaPorTipo(operacoesAtual, tipo),
    anterior: mediaPorTipo(operacoesAnterior, tipo),
  }))
}
