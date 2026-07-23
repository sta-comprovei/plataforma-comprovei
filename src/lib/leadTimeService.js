import { supabase } from './supabaseClient'
import { TIPOS_OPERACAO } from './operacoesService'

/**
 * Camada de acesso a dados e agregação para o módulo de Lead Time.
 * Reaproveita `operacoes.lead_time_min` (calculado automaticamente no
 * banco desde a Etapa 3) e a tabela `metas_lead_time` (Etapa 4).
 *
 * Nenhuma escrita de operação acontece aqui — apenas leitura de
 * `operacoes` e leitura/atualização de `metas_lead_time`. Toda alteração
 * de meta é auditada automaticamente pelo trigger genérico no banco (ver
 * supabase/migrations/0005_lead_time.sql).
 */

const TABELA_OPERACOES = 'operacoes'
const TABELA_METAS = 'metas_lead_time'

const COLUNAS_OPERACAO_LEADTIME =
  'id, data_operacao, motorista_id, codigo_motorista, nome_motorista, tipo_operacao, rota, lead_time_min, status'

function mensagemAmigavel(error) {
  const msg = (error?.message || '').toLowerCase()
  if (msg.includes('network')) {
    return 'Não foi possível conectar ao servidor. Verifique sua internet.'
  }
  if (msg.includes('permission denied') || msg.includes('rls')) {
    return 'Você não tem permissão para realizar esta ação.'
  }
  return 'Não foi possível concluir a operação. Tente novamente em instantes.'
}

/**
 * Calcula o intervalo de datas [inicio, fim] (strings YYYY-MM-DD) para um
 * período nomeado. 'personalizado' não é tratado aqui — o chamador deve
 * fornecer dataInicio/dataFim diretamente nesse caso.
 */
export function calcularIntervaloPeriodo(periodo) {
  const hoje = new Date()
  const fim = new Date(hoje)
  let inicio = new Date(hoje)

  switch (periodo) {
    case 'dia':
      inicio = new Date(hoje)
      break
    case 'semana':
      inicio.setDate(hoje.getDate() - 6)
      break
    case 'mes':
      inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
      break
    case 'ano':
      inicio = new Date(hoje.getFullYear(), 0, 1)
      break
    default:
      inicio = new Date(hoje)
  }

  const toISO = (d) => {
    const ano = d.getFullYear()
    const mes = String(d.getMonth() + 1).padStart(2, '0')
    const dia = String(d.getDate()).padStart(2, '0')
    return `${ano}-${mes}-${dia}`
  }

  return { dataInicio: toISO(inicio), dataFim: toISO(fim) }
}

/**
 * Busca todas as operações com lead_time_min preenchido (já finalizadas)
 * dentro dos filtros informados. Usada como base para todos os
 * indicadores e gráficos — a agregação acontece no frontend a partir
 * deste conjunto, já reduzido pelo banco via filtros e pelo índice
 * parcial `lead_time_min is not null`.
 *
 * @param {Object} params
 * @param {string} [params.dataInicio] - YYYY-MM-DD
 * @param {string} [params.dataFim] - YYYY-MM-DD
 * @param {string} [params.motoristaId]
 * @param {string} [params.tipoOperacao] - '' busca todas as categorias
 */
export async function buscarOperacoesComLeadTime({
  dataInicio = '',
  dataFim = '',
  motoristaId = '',
  tipoOperacao = '',
  rota = '',
} = {}) {
  let query = supabase
    .from(TABELA_OPERACOES)
    .select(COLUNAS_OPERACAO_LEADTIME)
    .not('lead_time_min', 'is', null)

  if (dataInicio) query = query.gte('data_operacao', dataInicio)
  if (dataFim) query = query.lte('data_operacao', dataFim)
  if (motoristaId) query = query.eq('motorista_id', motoristaId)
  if (tipoOperacao) query = query.eq('tipo_operacao', tipoOperacao)
  if (rota)         query = query.ilike('rota', `%${rota}%`)

  // Lead Time não tem paginação na UI (os indicadores precisam do
  // conjunto completo para média/min/max corretos) — usamos um limite
  // alto e seguro em vez de paginação, suficiente para o volume desta
  // fase do projeto.
  query = query.order('data_operacao', { ascending: true }).limit(10000)

  const { data, error } = await query

  if (error) {
    return { dados: [], erro: mensagemAmigavel(error) }
  }
  return { dados: data ?? [], erro: null }
}

/**
 * Agrega uma lista de operações (já filtradas) em indicadores por
 * categoria: quantidade, média, maior, menor, total acumulado, % dentro
 * e % fora da meta. Nunca mistura categorias — cada uma recebe seu
 * próprio objeto de indicadores, calculado isoladamente a partir do
 * subconjunto de operações daquele tipo_operacao.
 *
 * @param {Array} operacoes - resultado de buscarOperacoesComLeadTime
 * @param {Object} metasPorTipo - { DF: minutos, Adega: minutos, Filial: minutos }
 */
export function calcularIndicadoresPorCategoria(operacoes, metasPorTipo) {
  const resultado = {}

  for (const tipo of TIPOS_OPERACAO) {
    const doTipo = operacoes.filter((op) => op.tipo_operacao === tipo)
    const meta = metasPorTipo[tipo]

    if (doTipo.length === 0) {
      resultado[tipo] = {
        quantidade: 0,
        media: null,
        maior: null,
        menor: null,
        totalAcumulado: 0,
        dentroMeta: 0,
        foraMeta: 0,
        percentualDentroMeta: null,
        percentualForaMeta: null,
        meta,
      }
      continue
    }

    const valores = doTipo.map((op) => op.lead_time_min)
    const totalAcumulado = valores.reduce((s, v) => s + v, 0)
    const media = Math.round(totalAcumulado / valores.length)
    const maior = Math.max(...valores)
    const menor = Math.min(...valores)
    const dentroMeta = meta ? doTipo.filter((op) => op.lead_time_min <= meta).length : 0
    const foraMeta = doTipo.length - dentroMeta

    resultado[tipo] = {
      quantidade: doTipo.length,
      media,
      maior,
      menor,
      totalAcumulado,
      dentroMeta,
      foraMeta,
      percentualDentroMeta: meta ? Math.round((dentroMeta / doTipo.length) * 100) : null,
      percentualForaMeta: meta ? Math.round((foraMeta / doTipo.length) * 100) : null,
      meta,
    }
  }

  return resultado
}

/**
 * Agrega indicadores de Lead Time para um único motorista (todas as
 * categorias combinadas, já que o perfil do motorista mostra a visão
 * consolidada dele) — usado na Etapa de perfil do motorista.
 */
export function calcularIndicadoresMotorista(operacoesDoMotorista) {
  if (operacoesDoMotorista.length === 0) {
    return { quantidade: 0, media: null, maior: null, menor: null }
  }
  const valores = operacoesDoMotorista.map((op) => op.lead_time_min)
  return {
    quantidade: operacoesDoMotorista.length,
    media: Math.round(valores.reduce((s, v) => s + v, 0) / valores.length),
    maior: Math.max(...valores),
    menor: Math.min(...valores),
  }
}

/**
 * Agrupa operações por mês (YYYY-MM) e por categoria, retornando a média
 * de lead time de cada combinação mês×categoria — base para o gráfico de
 * evolução mensal. Meses sem nenhuma operação de uma categoria retornam
 * null para essa categoria (não zero, para não distorcer o gráfico).
 */
export function calcularEvolucaoMensal(operacoes, mesesRecentes = 6) {
  const hoje = new Date()
  const chaves = []
  for (let i = mesesRecentes - 1; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
    chaves.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const porMesTipo = {}
  for (const op of operacoes) {
    const mesChave = op.data_operacao.slice(0, 7)
    if (!porMesTipo[mesChave]) porMesTipo[mesChave] = {}
    if (!porMesTipo[mesChave][op.tipo_operacao]) porMesTipo[mesChave][op.tipo_operacao] = []
    porMesTipo[mesChave][op.tipo_operacao].push(op.lead_time_min)
  }

  return chaves.map((chave) => {
    const porTipo = {}
    for (const tipo of TIPOS_OPERACAO) {
      const valores = porMesTipo[chave]?.[tipo]
      porTipo[tipo] = valores && valores.length > 0
        ? Math.round(valores.reduce((s, v) => s + v, 0) / valores.length)
        : null
    }
    return { mes: chave, ...porTipo }
  })
}

// ----------------------------------------------------------------------------
// Metas
// ----------------------------------------------------------------------------

const COLUNAS_META = 'id, tipo_operacao, meta_minutos, created_at, updated_at, usuario_ultima_alteracao'

/**
 * Busca todas as metas configuradas, indexadas por tipo_operacao para
 * acesso direto: { DF: { id, meta_minutos, ... }, Adega: {...}, Filial: {...} }
 */
export async function buscarMetas() {
  const { data, error } = await supabase.from(TABELA_METAS).select(COLUNAS_META)

  if (error) {
    return { dados: {}, erro: mensagemAmigavel(error) }
  }

  const porTipo = {}
  for (const m of data ?? []) {
    porTipo[m.tipo_operacao] = m
  }
  return { dados: porTipo, erro: null }
}

/**
 * Atualiza a meta (em minutos) de uma categoria. A auditoria (usuário,
 * data/hora, valor anterior/novo) é registrada automaticamente pelo
 * trigger genérico no banco — nada a fazer aqui além do UPDATE.
 */
export async function atualizarMeta(tipoOperacao, metaMinutos) {
  const { data, error } = await supabase
    .from(TABELA_METAS)
    .update({ meta_minutos: metaMinutos })
    .eq('tipo_operacao', tipoOperacao)
    .select(COLUNAS_META)
    .single()

  if (error) {
    return { dados: null, erro: mensagemAmigavel(error) }
  }
  return { dados: data, erro: null }
}

// ----------------------------------------------------------------------------
// Pendências de Lead Time
// ----------------------------------------------------------------------------

/**
 * Filtra, de um conjunto de operações já carregado, aquelas que
 * ultrapassaram a meta da sua categoria — a "pendência" de Lead Time
 * pedida pela Etapa 4.
 *
 * Decisão de escopo: esta etapa NÃO cria uma tabela `pendencias`
 * separada. A condição "operação fora da meta" já está totalmente
 * identificável a partir de `operacoes.lead_time_min` +
 * `metas_lead_time.meta_minutos` — duplicar isso em outra tabela
 * introduziria risco de dessincronia sem necessidade. O módulo
 * Pendências (página dedicada, com triagem/baixa de pendências) é
 * trabalho de uma etapa futura; esta função é o ponto de extensão que
 * ele deverá consumir.
 */
export function filtrarOperacoesPendentes(operacoes, metasPorTipo) {
  return operacoes.filter((op) => {
    const meta = metasPorTipo[op.tipo_operacao]
    return meta && op.lead_time_min > meta
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// LEAD TIME POR ROTA
// ─────────────────────────────────────────────────────────────────────────────

export function calcularIndicadoresPorRota(operacoes) {
  const porRota = {}
  for (const op of operacoes) {
    const rota = op.rota || '(sem rota)'
    if (!porRota[rota]) porRota[rota] = { rota, operacoes:[], total:0, qtd:0, max:0, min:Infinity }
    const r = porRota[rota]
    r.operacoes.push(op)
    if (op.lead_time_min != null) {
      r.total += op.lead_time_min; r.qtd++
      if (op.lead_time_min > r.max) r.max = op.lead_time_min
      if (op.lead_time_min < r.min) r.min = op.lead_time_min
    }
  }
  return Object.values(porRota)
    .map(r => ({ rota:r.rota, media:r.qtd>0?Math.round(r.total/r.qtd):null, maximo:r.qtd>0?r.max:null, minimo:r.qtd>0?r.min:null, viagens:r.qtd, operacoes:r.operacoes }))
    .filter(r => r.viagens > 0)
    .sort((a,b) => (a.media??Infinity)-(b.media??Infinity))
}

export function calcularKpisRotas(dadosPorRota) {
  if (!dadosPorRota.length) return { maior:null, menor:null, media:null, totalRotas:0 }
  const medias = dadosPorRota.map(r => r.media).filter(Boolean)
  const total  = medias.reduce((s,v) => s+v, 0)
  return { maior:Math.max(...medias), menor:Math.min(...medias), media:medias.length?Math.round(total/medias.length):null, totalRotas:dadosPorRota.length }
}

export function calcularEvolucaoMensalRota(operacoesRota, mesesRecentes = 6) {
  const porMes = {}
  for (const op of operacoesRota) {
    if (!op.data_operacao || op.lead_time_min == null) continue
    const mes = op.data_operacao.slice(0,7)
    if (!porMes[mes]) porMes[mes] = { total:0, qtd:0 }
    porMes[mes].total += op.lead_time_min; porMes[mes].qtd++
  }
  return Object.entries(porMes)
    .map(([mes,d]) => ({ mes, media:Math.round(d.total/d.qtd), viagens:d.qtd }))
    .sort((a,b) => a.mes.localeCompare(b.mes))
    .slice(-mesesRecentes)
}
