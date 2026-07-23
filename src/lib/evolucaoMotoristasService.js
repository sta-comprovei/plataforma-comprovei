/**
 * evolucaoMotoristasService.js
 *
 * Parser e service para o relatório "Gerencial motoristas" do Comprovei.
 *
 * Colunas reais confirmadas por análise do arquivo driversSynthetic*.xls:
 *   MOTORISTA                  → texto
 *   ROTAS                      → "N(P%)"
 *   DOCUMENTOS                 → "N(P%)"
 *   QUALIDADE                  → "P%" (percentual puro)
 *   INÍCIO DENTRO DA CERCA     → "N(P%)"
 *   CHEGADA DENTRO DA CERCA    → "N(P%)"
 *   OCORRÊNCIA APONTADA        → "N(P%)"
 *   INTERVALO COMPATÍVEL       → "N(P%)"
 *   APONTAMENTO NA CERCA       → "N(P%)"
 *
 * ── DUAS FASES DE IMPORTAÇÃO ──────────────────────────────────────────────────
 *
 * Fase 1 — Motoristas individuais:
 *   Varre todas as linhas. Linhas de motoristas válidos são inseridas em
 *   `historico_desempenho_motoristas`. A linha "Evolução Mensal" e
 *   subtotais de empresas são ignorados nesta fase.
 *
 * Fase 2 — Linha consolidada:
 *   Varre novamente as mesmas linhas procurando exclusivamente pela linha
 *   "Evolução Mensal". Quando encontrada, seus valores são extraídos
 *   diretamente — sem nenhum recálculo — e gravados em `evolucao_mensal`.
 *
 * As duas fases são independentes: um erro na Fase 2 não desfaz a Fase 1
 * e vice-versa.
 *
 * ── PERCENTUAIS ───────────────────────────────────────────────────────────────
 *
 * Os percentuais individuais de motoristas (qualidade_pct, inicio_cerca_pct,
 * chegada_cerca_pct, intervalo_pct, apontamento_pct) são lidos diretamente
 * do formato "N(P%)" da planilha — não são calculados pela plataforma.
 *
 * Os percentuais consolidados em `evolucao_mensal` são os valores oficiais
 * produzidos pelo Comprovei para o mês — também gravados sem nenhum recálculo.
 *
 * A view `vw_evolucao_mensal_empresa` lê de `evolucao_mensal` diretamente,
 * sem AVG(), sem filtros de correção.
 */

import { supabase } from './supabaseClient'

const TABELA        = 'historico_desempenho_motoristas'
const TABELA_MENSAL = 'evolucao_mensal'

// ── Aliases de colunas ────────────────────────────────────────────────────────
const MAPA = {
  motorista:     ['MOTORISTA', 'Motorista'],
  rotas:         ['ROTAS', 'Rotas'],
  documentos:    ['DOCUMENTOS', 'Documentos'],
  qualidade:     ['QUALIDADE', 'Qualidade'],
  inicio_cerca:  ['INÍCIO DENTRO DA CERCA', 'INICIO DENTRO DA CERCA', 'Início Dentro da Cerca'],
  chegada_cerca: ['CHEGADA DENTRO DA CERCA', 'Chegada Dentro da Cerca'],
  ocorrencia:    ['OCORRÊNCIA APONTADA', 'OCORRENCIA APONTADA', 'Ocorrência Apontada'],
  intervalo:     ['INTERVALO COMPATÍVEL', 'INTERVALO COMPATIVEL', 'Intervalo Compatível'],
  apontamento:   ['APONTAMENTO NA CERCA', 'Apontamento na Cerca'],
}

// ── Identificação de linhas ───────────────────────────────────────────────────

/**
 * Linhas de subtotais/empresas parceiras — descartadas da Fase 1.
 * Apenas para motoristas: essas empresas têm suas próprias linhas de
 * subtotal no arquivo.
 */
const PREFIXOS_EMPRESA = [
  'STO', 'FATURAMENTO', 'COOTRAMA', 'RG LOG', 'QUICK DELIVERY',
  'JEOLOG', 'COOP.', 'CM OLIVEIRA', 'TRANS MELO',
]

/**
 * Forma normalizada do nome da linha consolidada após normalizarParaComparacao().
 * normalizarParaComparacao() remove acentos via NFD + strip de combining marks,
 * converte para maiúsculas e colapsa espaços — portanto qualquer variante de
 * "Evolução Mensal" ("EVOLUÇÃO MENSAL", "Evolucao Mensal", "evolucao mensal" etc.)
 * sempre resulta em 'EVOLUCAO MENSAL' após a normalização.
 * Um único valor cobre todas as variantes de codificação e capitalização.
 */
const NOME_EVOLUCAO_MENSAL_NORMALIZADO = 'EVOLUCAO MENSAL'

function normalizarParaComparacao(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Retorna true quando a linha é a consolidada "Evolução Mensal" — não um motorista.
 * Usa match EXATO após normalizarParaComparacao() para evitar falsos positivos.
 * Exemplos que retornam true: "Evolução Mensal", "EVOLUCAO MENSAL", "evolucao mensal",
 *   "Evoluçao Mensal", " Evolução  Mensal " (espaços extras são colapsados).
 * Exemplos que retornam false: "TOTAL EMPRESA", "EMPRESA", "PEDRO JOSE", "EVOLUÇÃO".
 */
function ehLinhaEvolucaoMensal(nomeRaw) {
  if (!nomeRaw) return false
  return normalizarParaComparacao(nomeRaw) === NOME_EVOLUCAO_MENSAL_NORMALIZADO
}

/**
 * Retorna true quando a linha é um subtotal de empresa parceira —
 * descartada tanto da Fase 1 quanto da Fase 2.
 */
function ehLinhaEmparceira(nomeRaw) {
  if (!nomeRaw) return false
  const upper = String(nomeRaw).toUpperCase().trim()
  return PREFIXOS_EMPRESA.some(p => upper.startsWith(p))
}

// ── Parsers de valor ──────────────────────────────────────────────────────────

function resolveColuna(row, aliases) {
  for (const a of aliases) {
    const v = row[a]
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim()
  }
  return null
}

/**
 * Parseia "N(P%)" → { qtd: N, pct: P }.
 *
 * Aceita as duas variantes do Comprovei:
 *   "60(100%)"    → {qtd: 60,   pct: 100}   ← motoristas individuais
 *   "4019 (16%)"  → {qtd: 4019, pct: 16}    ← linha Evolução Mensal (espaço antes do "(")
 *   "4019 (16.5%)"→ {qtd: 4019, pct: 16.5}  ← percentual decimal
 *
 * O \s* na regex aceita zero ou mais espaços entre a quantidade e o "(".
 * O (?:\.\d+)? aceita a parte decimal do percentual quando presente.
 * Descarta sufixos especiais ($, #, !, ") no final do valor.
 * Nunca recalcula — lê os valores exatamente como estão na planilha.
 */
function parseQtdPct(raw) {
  if (!raw || raw === '-' || raw === '') return { qtd: null, pct: null }
  const s = String(raw).replace(/[$#!"'`<>]+$/, '').trim()
  const m = s.match(/^(\d+)\s*\((\d+(?:\.\d+)?)%\)/)
  if (m) return { qtd: parseInt(m[1], 10), pct: parseFloat(m[2]) }
  const n = parseInt(s.replace(/\D/g, ''), 10)
  return { qtd: isNaN(n) ? null : n, pct: null }
}

/**
 * Parseia percentual puro: "97%" → 97.0, "97.5%" → 97.5
 * Nunca recalcula — lê o valor exatamente como está na planilha.
 */
function parsePct(raw) {
  if (!raw) return null
  const s = String(raw).replace(/[%$#!"'`<>]+/g, '').trim()
  const n = parseFloat(s)
  return isNaN(n) ? null : n
}

/**
 * Normaliza nome para chave de agrupamento histórico:
 * lowercase, sem acentos, espaços normalizados, telefone removido.
 */
function normalizarNome(nome) {
  return String(nome || '')
    .replace(/\s*-\s*\d{8,}.*$/, '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Tenta extrair YYYY-MM do nome do arquivo.
 * Ex: "driversSynthetic_2026-07-03_17_07_31.xls" → "2026-07"
 */
export function detectarCompetencia(nomeArquivo) {
  const m = String(nomeArquivo || '').match(/(\d{4})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}`
  const hoje = new Date()
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`
}

function mensagem(error) {
  const msg = (error?.message || '').toLowerCase()
  if (msg.includes('network') || msg.includes('failed to fetch')) return 'Erro de conexão.'
  if (msg.includes('permission denied') || msg.includes('rls'))
    return 'Sem permissão. Verifique se as migrations 0019 e 0027 foram executadas no Supabase.'
  return error?.message || 'Erro inesperado.'
}

// ── Mapeamento de linhas ──────────────────────────────────────────────────────

/**
 * Mapeia uma linha de motorista individual para o schema de
 * historico_desempenho_motoristas.
 * Retorna null se a linha não tem dados válidos ou é um subtotal.
 */
function mapearLinhaMotorista(row, competencia, dataReferencia, importacaoId) {
  const nomeRaw = resolveColuna(row, MAPA.motorista)
  if (!nomeRaw) return null
  if (ehLinhaEmparceira(nomeRaw)) return null

  const qualidadePct = parsePct(resolveColuna(row, MAPA.qualidade))
  const rotasP       = parseQtdPct(resolveColuna(row, MAPA.rotas))
  const docsP        = parseQtdPct(resolveColuna(row, MAPA.documentos))

  if (qualidadePct === null && rotasP.qtd === null && docsP.qtd === null) return null

  const inicioP     = parseQtdPct(resolveColuna(row, MAPA.inicio_cerca))
  const chegadaP    = parseQtdPct(resolveColuna(row, MAPA.chegada_cerca))
  const ocorrenciaP = parseQtdPct(resolveColuna(row, MAPA.ocorrencia))
  const intervaloP  = parseQtdPct(resolveColuna(row, MAPA.intervalo))
  const apontP      = parseQtdPct(resolveColuna(row, MAPA.apontamento))

  return {
    nome_motorista:    nomeRaw.trim(),
    nome_normalizado:  normalizarNome(nomeRaw),
    competencia,
    data_referencia:   dataReferencia,
    qualidade_pct:     qualidadePct,
    rotas_qtd:         rotasP.qtd,      rotas_pct:         rotasP.pct,
    documentos_qtd:    docsP.qtd,       documentos_pct:    docsP.pct,
    inicio_cerca_qtd:  inicioP.qtd,     inicio_cerca_pct:  inicioP.pct,
    chegada_cerca_qtd: chegadaP.qtd,    chegada_cerca_pct: chegadaP.pct,
    ocorrencia_qtd:    ocorrenciaP.qtd, ocorrencia_pct:    ocorrenciaP.pct,
    intervalo_qtd:     intervaloP.qtd,  intervalo_pct:     intervaloP.pct,
    apontamento_qtd:   apontP.qtd,      apontamento_pct:   apontP.pct,
    importacao_id:     importacaoId || null,
  }
}

/**
 * Mapeia a linha "Evolução Mensal" para o schema de evolucao_mensal.
 * Os valores são extraídos diretamente da planilha — sem nenhum recálculo.
 * Retorna null se a linha não contém dados.
 */
function mapearLinhaEvolucaoMensal(row, competencia, dataReferencia, importacaoId) {
  const qualidadePct = parsePct(resolveColuna(row, MAPA.qualidade))
  const rotasP       = parseQtdPct(resolveColuna(row, MAPA.rotas))
  const docsP        = parseQtdPct(resolveColuna(row, MAPA.documentos))

  if (qualidadePct === null && rotasP.qtd === null && docsP.qtd === null) return null

  const inicioP     = parseQtdPct(resolveColuna(row, MAPA.inicio_cerca))
  const chegadaP    = parseQtdPct(resolveColuna(row, MAPA.chegada_cerca))
  const ocorrenciaP = parseQtdPct(resolveColuna(row, MAPA.ocorrencia))
  const intervaloP  = parseQtdPct(resolveColuna(row, MAPA.intervalo))
  const apontP      = parseQtdPct(resolveColuna(row, MAPA.apontamento))

  return {
    competencia,
    data_referencia:   dataReferencia,
    qualidade_pct:     qualidadePct,
    rotas_qtd:         rotasP.qtd,      rotas_pct:         rotasP.pct,
    documentos_qtd:    docsP.qtd,       documentos_pct:    docsP.pct,
    inicio_cerca_qtd:  inicioP.qtd,     inicio_cerca_pct:  inicioP.pct,
    chegada_cerca_qtd: chegadaP.qtd,    chegada_cerca_pct: chegadaP.pct,
    ocorrencia_qtd:    ocorrenciaP.qtd, ocorrencia_pct:    ocorrenciaP.pct,
    intervalo_qtd:     intervaloP.qtd,  intervalo_pct:     intervaloP.pct,
    apontamento_qtd:   apontP.qtd,      apontamento_pct:   apontP.pct,
    importacao_id:     importacaoId || null,
  }
}

// ── IMPORTAÇÃO ────────────────────────────────────────────────────────────────

/**
 * Importa o relatório Gerencial Motoristas em duas fases independentes.
 *
 * FASE 1 — Motoristas individuais:
 *   Varre `linhas` e coleta apenas registros de motoristas válidos
 *   (ignora linha "Evolução Mensal" e subtotais de empresa parceira).
 *   Insere em `historico_desempenho_motoristas`.
 *
 * FASE 2 — Linha consolidada:
 *   Varre `linhas` novamente procurando exclusivamente pela linha
 *   "Evolução Mensal". Extrai os valores diretamente — sem recálculo.
 *   Insere em `evolucao_mensal`.
 *
 * As fases são independentes. Um erro em uma não aborta a outra.
 * O resultado informa separadamente o que foi inserido em cada tabela.
 */
export async function importarDesempenhoMotoristas(linhas, competencia, importacaoId) {
  if (!linhas?.length) return { inseridos: 0, ignorados: 0, evolucaoMensal: false, erros: ['Arquivo sem linhas.'] }
  if (!/^\d{4}-\d{2}$/.test(competencia))
    return { inseridos: 0, ignorados: 0, evolucaoMensal: false, erros: [`Competência inválida: "${competencia}".`] }

  const dataReferencia = `${competencia}-01`
  const erros = []

  // ── FASE 1: Motoristas individuais ────────────────────────────────────────
  const registrosMotoristas = []
  let ignorados = 0

  for (const linha of linhas) {
    const nomeRaw = resolveColuna(linha, MAPA.motorista)

    // Linha "Evolução Mensal" — ignorada na Fase 1 (será processada na Fase 2)
    if (ehLinhaEvolucaoMensal(nomeRaw)) continue

    const reg = mapearLinhaMotorista(linha, competencia, dataReferencia, importacaoId)
    if (!reg) { ignorados++; continue }
    registrosMotoristas.push(reg)
  }

  let inseridos = 0
  if (registrosMotoristas.length > 0) {
    for (let i = 0; i < registrosMotoristas.length; i += 200) {
      const lote = registrosMotoristas.slice(i, i + 200)
      const { error, count } = await supabase.from(TABELA).insert(lote, { count: 'exact' })
      if (error) erros.push(`Fase 1 (motoristas): ${mensagem(error)}`)
      else inseridos += count ?? lote.length
    }
  }

  // ── FASE 2: Linha "Evolução Mensal" ───────────────────────────────────────
  // Segunda varredura nas mesmas linhas, procurando exclusivamente a linha consolidada.
  let evolucaoMensalGrava = false
  let linhaEvolucao = null

  for (const linha of linhas) {
    const nomeRaw = resolveColuna(linha, MAPA.motorista)
    if (!ehLinhaEvolucaoMensal(nomeRaw)) continue

    const reg = mapearLinhaEvolucaoMensal(linha, competencia, dataReferencia, importacaoId)
    if (reg) {
      linhaEvolucao = reg
      break  // há apenas uma linha "Evolução Mensal" por arquivo
    }
  }

  if (linhaEvolucao) {
    const { error: errM } = await supabase.from(TABELA_MENSAL).insert(linhaEvolucao)
    if (errM) {
      erros.push(`Fase 2 (Evolução Mensal): ${mensagem(errM)}`)
    } else {
      evolucaoMensalGrava = true
    }
  }

  return { inseridos, ignorados, evolucaoMensal: evolucaoMensalGrava, erros }
}

// ── LEITURA — Evolução individual ─────────────────────────────────────────────

export async function listarMotoristasComHistorico() {
  // Paginação explícita em loop para superar o limite padrão de 1000 linhas do Supabase.
  // Acumula todas as páginas antes da deduplicação — sem esse loop, frotas com mais
  // de 1000 registros de motoristas retornariam uma lista truncada.
  const POR_PAGINA = 1000
  let pagina = 0
  const todos = []

  for (;;) {
    const inicio = pagina * POR_PAGINA
    const fim    = inicio + POR_PAGINA - 1

    const { data, error } = await supabase
      .from(TABELA)
      .select('nome_motorista, nome_normalizado')
      .order('nome_motorista')
      .range(inicio, fim)

    if (error) return { dados: [], erro: mensagem(error) }
    if (!data || data.length === 0) break

    todos.push(...data)

    // Se retornou menos de POR_PAGINA, chegamos ao fim
    if (data.length < POR_PAGINA) break
    pagina++
  }

  // Deduplicação por nome_normalizado — mantém o primeiro nome_motorista encontrado
  const map = new Map()
  for (const r of todos) {
    if (!map.has(r.nome_normalizado)) map.set(r.nome_normalizado, r.nome_motorista)
  }

  return {
    dados: [...map.entries()].map(([norm, nome]) => ({ nome_normalizado: norm, nome_motorista: nome })),
    erro: null,
  }
}

export async function buscarEvolucaoMotorista(nomeNormalizado, compIni, compFim) {
  if (!nomeNormalizado) return { dados: [], erro: 'Nome obrigatório.' }
  let q = supabase.from(TABELA).select('*')
    .eq('nome_normalizado', nomeNormalizado)
    .order('competencia', { ascending: true })
    .order('importado_em', { ascending: false })
  if (compIni) q = q.gte('competencia', compIni)
  if (compFim) q = q.lte('competencia', compFim)
  const { data, error } = await q
  if (error) return { dados: [], erro: mensagem(error) }
  const map = new Map()
  for (const r of (data ?? [])) if (!map.has(r.competencia)) map.set(r.competencia, r)
  return { dados: [...map.values()], erro: null }
}

export async function listarCompetencias() {
  // Fonte primária: vw_evolucao_mensal_empresa (lê de evolucao_mensal — valores oficiais).
  // Fonte de fallback: historico_desempenho_motoristas — usada quando evolucao_mensal
  // ainda está vazia (ex: banco que executou a migration 0027 mas ainda não reimportou
  // nenhum arquivo de desempenho após a migração).
  const { data, error } = await supabase.from('vw_evolucao_mensal_empresa')
    .select('competencia, data_referencia').order('competencia', { ascending: false })

  if (!error && data && data.length > 0) {
    return { dados: data, erro: null }
  }

  // Fallback: derivar competências distintas de historico_desempenho_motoristas.
  // Isso garante que o seletor de meses continue funcionando enquanto evolucao_mensal
  // não for populada (banco que já tinha dados antes da migration 0027).
  const { data: dataFallback, error: errFallback } = await supabase
    .from(TABELA)
    .select('competencia')
    .not('competencia', 'is', null)
    .order('competencia', { ascending: false })

  if (errFallback) return { dados: [], erro: mensagem(errFallback) }

  // Deduplica e reconstrói no mesmo formato esperado pelo componente
  const unicas = [...new Set((dataFallback ?? []).map(r => r.competencia).filter(Boolean))]
  const dados = unicas.map(c => ({
    competencia:    c,
    data_referencia: c + '-01',
  }))

  return { dados, erro: null }
}

// ── LEITURA — Evolução mensal da empresa ──────────────────────────────────────

/**
 * Lê a evolução mensal da empresa diretamente de `vw_evolucao_mensal_empresa`,
 * que por sua vez lê de `evolucao_mensal` — valores oficiais da planilha,
 * sem recálculo de médias.
 */
export async function buscarEvolucaoMensalDesempenho() {
  const { data, error } = await supabase.from('vw_evolucao_mensal_empresa')
    .select('*').order('competencia', { ascending: true })
  if (error) return { dados: [], erro: mensagem(error) }
  return { dados: data ?? [], erro: null }
}

export async function buscarRankingDesempenho() {
  const { data, error } = await supabase.from('vw_ranking_desempenho').select('*')
  if (error) return { dados: [], erro: mensagem(error) }
  return { dados: data ?? [], erro: null }
}
