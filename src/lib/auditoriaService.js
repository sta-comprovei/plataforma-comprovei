import { supabase } from './supabaseClient'

/**
 * Camada de acesso a dados para o módulo de Histórico de Alterações
 * (auditoria). Assim como motoristasService.js, nenhum componente de UI
 * deve chamar `supabase` diretamente para esta entidade.
 *
 * Importante: esta camada é exclusivamente de LEITURA. Os registros de
 * auditoria são gravados automaticamente por triggers no banco (ver
 * supabase/migrations/0003_historico_auditoria.sql) — nunca pelo
 * frontend. Não existe (nem deve existir) uma função "registrarAuditoria"
 * aqui: tentar logar auditoria a partir do cliente seria inseguro (um
 * usuário poderia forjar registros) e redundante (o trigger já cobre
 * 100% das alterações, mesmo as feitas fora desta aplicação).
 */

const TABELA = 'historico_auditoria'

const COLUNAS =
  'id, tabela_afetada, registro_id, tipo_acao, usuario_id, nome_usuario, data_hora, dados_anteriores, dados_novos, observacao'

/**
 * Rótulos amigáveis em português para os valores do enum tipo_acao_auditoria.
 */
export const ROTULOS_TIPO_ACAO = {
  criacao: 'Criação',
  edicao: 'Edição',
  inativacao: 'Inativação',
  reativacao: 'Reativação',
  exclusao_logica: 'Exclusão lógica',
  exclusao_permanente: 'Exclusão permanente',
}

/**
 * Rótulos amigáveis em português para as tabelas auditáveis conhecidas.
 * Tabelas futuras que ainda não estiverem aqui simplesmente exibem o
 * nome técnico (fallback seguro, nunca quebra).
 */
export const ROTULOS_TABELA = {
  motoristas: 'Motoristas',
  usuarios: 'Usuários',
  operacoes: 'Operação do Dia',
  metas_lead_time: 'Metas de Lead Time',
}

function mensagemAmigavel(error) {
  const msg = (error?.message || '').toLowerCase()
  if (msg.includes('network')) {
    return 'Não foi possível conectar ao servidor. Verifique sua internet.'
  }
  if (msg.includes('permission denied') || msg.includes('rls')) {
    return 'Você não tem permissão para visualizar o histórico de auditoria.'
  }
  return 'Não foi possível carregar o histórico de auditoria. Tente novamente em instantes.'
}

/**
 * Lista registros de auditoria com filtros, pesquisa e paginação.
 *
 * @param {Object} params
 * @param {string} [params.busca] - pesquisa rápida (nome do usuário, tabela, observação)
 * @param {string} [params.dataInicio] - YYYY-MM-DD
 * @param {string} [params.dataFim] - YYYY-MM-DD
 * @param {string} [params.usuarioId] - filtra por usuário específico
 * @param {string} [params.tipoAcao] - filtra por tipo de ação
 * @param {string} [params.tabelaAfetada] - filtra por tabela
 * @param {string} [params.registroId] - filtra por um registro específico (ex.: histórico de um motorista)
 * @param {number} [params.pagina] - 1-indexed
 * @param {number} [params.porPagina]
 */
export async function listarAuditoria({
  busca = '',
  dataInicio = '',
  dataFim = '',
  usuarioId = '',
  tipoAcao = '',
  tabelaAfetada = '',
  registroId = '',
  pagina = 1,
  porPagina = 20,
} = {}) {
  const inicio = (pagina - 1) * porPagina
  const fim = inicio + porPagina - 1

  let query = supabase.from(TABELA).select(COLUNAS, { count: 'exact' })

  const termo = busca.trim()
  if (termo) {
    const termoEscapado = termo.replace(/[%_]/g, (c) => `\\${c}`).replace(/[,()]/g, (c) => `\\${c}`)
    query = query.or(
      `nome_usuario.ilike.%${termoEscapado}%,tabela_afetada.ilike.%${termoEscapado}%,observacao.ilike.%${termoEscapado}%`
    )
  }

  if (dataInicio) {
    query = query.gte('data_hora', `${dataInicio}T00:00:00`)
  }
  if (dataFim) {
    query = query.lte('data_hora', `${dataFim}T23:59:59`)
  }
  if (usuarioId) {
    query = query.eq('usuario_id', usuarioId)
  }
  if (tipoAcao) {
    query = query.eq('tipo_acao', tipoAcao)
  }
  if (tabelaAfetada) {
    query = query.eq('tabela_afetada', tabelaAfetada)
  }
  if (registroId) {
    query = query.eq('registro_id', registroId)
  }

  query = query.order('data_hora', { ascending: false }).range(inicio, fim)

  const { data, error, count } = await query

  if (error) {
    return { dados: [], total: 0, erro: mensagemAmigavel(error) }
  }

  return { dados: data ?? [], total: count ?? 0, erro: null }
}

/**
 * Histórico completo de um registro específico (ex.: todas as alterações
 * já feitas em um motorista), independente de paginação — usado para a
 * linha do tempo dentro do perfil de uma entidade.
 */
export async function listarAuditoriaDoRegistro(tabelaAfetada, registroId) {
  const { data, error } = await supabase
    .from(TABELA)
    .select(COLUNAS)
    .eq('tabela_afetada', tabelaAfetada)
    .eq('registro_id', registroId)
    .order('data_hora', { ascending: false })

  if (error) {
    return { dados: [], erro: mensagemAmigavel(error) }
  }
  return { dados: data ?? [], erro: null }
}

/**
 * Lista usuários distintos que já geraram algum registro de auditoria —
 * usado para popular o filtro "Usuário" sem precisar de uma query separada
 * em `usuarios` nem do risco de listar usuários que nunca alteraram nada.
 */
export async function listarUsuariosComAuditoria() {
  const { data, error } = await supabase
    .from(TABELA)
    .select('usuario_id, nome_usuario')
    .not('usuario_id', 'is', null)

  if (error) {
    return { dados: [], erro: mensagemAmigavel(error) }
  }

  const vistos = new Map()
  for (const row of data ?? []) {
    if (!vistos.has(row.usuario_id)) {
      vistos.set(row.usuario_id, row.nome_usuario)
    }
  }
  const lista = Array.from(vistos, ([id, nome]) => ({ id, nome })).sort((a, b) =>
    a.nome.localeCompare(b.nome, 'pt-BR')
  )
  return { dados: lista, erro: null }
}

/**
 * Calcula a diferença campo a campo entre dados_anteriores e dados_novos,
 * para destacar visualmente o que mudou. Ignora colunas técnicas que
 * sempre mudam (updated_at) e não representam uma alteração de negócio.
 */
const CAMPOS_IGNORADOS = new Set(['updated_at'])

export function calcularDiferencas(dadosAnteriores, dadosNovos) {
  const anteriores = dadosAnteriores || {}
  const novos = dadosNovos || {}
  const todasChaves = new Set([...Object.keys(anteriores), ...Object.keys(novos)])

  const diferencas = []
  for (const chave of todasChaves) {
    if (CAMPOS_IGNORADOS.has(chave)) continue
    const valorAntes = anteriores[chave] ?? null
    const valorDepois = novos[chave] ?? null
    const mudou = JSON.stringify(valorAntes) !== JSON.stringify(valorDepois)
    diferencas.push({ campo: chave, valorAntes, valorDepois, mudou })
  }

  // Campos alterados primeiro, depois ordem alfabética
  diferencas.sort((a, b) => {
    if (a.mudou !== b.mudou) return a.mudou ? -1 : 1
    return a.campo.localeCompare(b.campo, 'pt-BR')
  })

  return diferencas
}
