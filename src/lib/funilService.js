/**
 * Serviço do Funil Operacional (Etapa 9).
 *
 * Chave de relacionamento: NUMPED (registros_rotina) ↔ Pedido (registros_comprovei)
 * Fonte das colunas: análise real de ROTINA8072.xls e documentSAC CSV.
 *
 * Decisões aprovadas:
 *   A) POSICAO='M' e 'F' ambos importados
 *   B) Campo DATA da ROTINA = data_pedido (início do funil — não COMPROVEI)
 *   C) DATAGERACAOOS persistida para análises futuras
 *   D) Upsert por NUMPED global (sobrescreve dados operacionais)
 */

import { supabase } from './supabaseClient'
import { moverParaLixeira } from './lixeiraService'

// ─────────────────────────────────────────────────────────────────────────────
// MAPEAMENTO REAL DE COLUNAS
// Baseado na análise dos arquivos reais (ROTINA8072.xls e documentSAC CSV)
// ─────────────────────────────────────────────────────────────────────────────

// Colunas reais do ROTINA8072.xls (21 colunas identificadas)
// Campos descartados: CODFILIAL (constante=41), CLIENTE (redundante),
//   DESTINO (coberto por NUMCAR), NUMTRANSWMS (ID de lote interno),
//   DATAGERACAOWMS (redundante com DTWMS), DATAFIMOS (~13s após DATAFIMCONFERENCIA)
const MAPA_ROTINA = {
  numped:                ['NUMPED'],
  numnota:               ['NUMNOTA'],
  numcar:                ['NUMCAR'],
  codfilial:             ['CODFILIAL'],
  codcli:                ['CODCLI'],
  cliente:               ['CLIENTE'],
  destino:               ['DESTINO'],
  cgcent:                ['CGCENT'],
  numtranswms:           ['NUMTRANSWMS'],
  // 'POSICAO' é o nome quando exportado via sistema legado (sem acento, maiúsculo).
  // 'POSIÇÃO' e variantes cobrem exportações mais recentes com encoding correto.
  posicao:               ['POSICAO', 'POSIÇÃO', 'Posicao', 'Posição', 'posicao', 'posição'],
  data_pedido:           ['DATA'],           // Decisão B: DATA da ROTINA = início do funil
  dt_entrega:            ['DTENTREGA'],
  dtwms:                 ['DTWMS'],
  datageracaoos:         ['DATAGERACAOOS'],  // Decisão C: persistir para análise futura
  datainicioos:          ['DATAINICIOOS'],
  datafimseparacao:      ['DATAFIMSEPARACAO'],
  datainicioconferencia: ['DATAINICIOCONFERENCIA'],
  datafimconferencia:    ['DATAFIMCONFERENCIA'],
  datafimos:             ['DATAFIMOS'],
  datafaturamento:       ['DATAFATURAMENTO'],
  datageracaowms:        ['DATAGERACAOWMS'],
}

// Colunas reais do documentSAC CSV (27 colunas; 13 persistidas)
// Campo 'Região' e 'Qtd Paradas' agora persistidos conforme requisito.
// 'Rota/Roteiro' adicionado como alias de cidade_destino — é a coluna que
// a operação usa para identificar a rota em exportações que omitem 'Cidade Destino'.
const MAPA_COMPROVEI = {
  numped:            ['Pedido'],
  numnot_comprovei:  ['Documento'],
  cnpj_cliente:      ['CNPJ Cliente'],
  nome_cliente:      ['Cliente'],
  cidade_destino:    ['Cidade Destino', 'Rota/Roteiro', 'Rota', 'Roteiro'],
  uf_destino:        ['UF Destino'],
  status_entrega:    ['Status'],
  ultima_ocorrencia: ['Ultima Ocorrência', 'Ultima Ocorrencia'],
  regiao:            ['Região', 'Regiao', 'REGIÃO', 'REGIAO'],
  qtd_paradas:       ['Qtd Paradas', 'QTD PARADAS', 'Qtd. Paradas'],
  qtd_reentregas:    ['Qtd Reentregas'],
  motorista:         ['Motorista'],
  codigo_motorista:  ['Cód. Motorista', 'Cod. Motorista', 'Código Motorista', 'Codigo Motorista'],
  cpf_motorista:     ['CPF Motorista', 'CPF'],
  placa:             ['Placa'],
  data_rota:         ['Data da rota'],
  data_finalizacao:  ['Data Finalização', 'Data Finalizacao'],
  data_ult_ocorr:    ['Data Últ. Ocorr.', 'Data Ult. Ocorr.'],
  data_atualizacao:  ['Data Atualização', 'Data Atualizacao'],
  base_origem:       ['Base Origem'],
  base_destino:      ['Base Destino'],
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS DE PARSING
// ─────────────────────────────────────────────────────────────────────────────

/** Resolve o valor de uma linha pelo mapa de aliases (case-sensitive conforme colunas reais) */
function resolveColuna(row, aliases) {
  for (const alias of aliases) {
    const v = row[alias]
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      return String(v).trim()
    }
  }
  return null
}

/**
 * Parseia datas nos três formatos encontrados nos arquivos reais:
 *   - ISO: 2026-06-02 09:12:46 (ROTINA após conversão de XLS)
 *   - BR com hora: 03/06/2026 19:51:36 (COMPROVEI Data Finalização)
 *   - BR sem hora: 01/06/2026 (COMPROVEI Data da rota)
 */
function parseData(raw) {
  if (!raw || ['None', 'NaT', 'nan', '', '-', 'null', 'undefined'].includes(String(raw).trim())) {
    return null
  }
  const s = String(raw).trim()

  // ISO: 2026-06-02 ou 2026-06-02T09:12:46
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s.replace(' ', 'T'))
    return isNaN(d.getTime()) ? null : d.toISOString()
  }

  // BR com hora: DD/MM/YYYY HH:MM:SS
  const brLong = s.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/)
  if (brLong) {
    const [, d, m, y, hh, mm, ss = '00'] = brLong
    const dt = new Date(`${y}-${m}-${d}T${hh}:${mm}:${ss}`)
    return isNaN(dt.getTime()) ? null : dt.toISOString()
  }

  // BR sem hora: DD/MM/YYYY
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (br) {
    const [, d, m, y] = br
    const dt = new Date(`${y}-${m}-${d}T00:00:00`)
    return isNaN(dt.getTime()) ? null : dt.toISOString()
  }

  return null
}

function parseInteiro(raw) {
  if (!raw) return 0
  const n = parseInt(String(raw).replace(/[^0-9]/g, ''), 10)
  return isNaN(n) ? 0 : n
}

/**
 * Parseia CPF que vem como float no CSV do COMPROVEI (ex: 92823068104.0).
 * Identificado na análise real: campo "Cód. Motorista" = 92823068104.0
 */
function parseCPF(raw) {
  if (!raw) return null
  const s = String(raw).replace(/\.0+$/, '').replace(/\D/g, '')
  return s.length >= 9 ? s.padStart(11, '0') : null
}

// ─────────────────────────────────────────────────────────────────────────────
// MAPEADORES DE LINHA
// ─────────────────────────────────────────────────────────────────────────────

function mapearLinhaRotina(row, importacaoId) {
  const numped = resolveColuna(row, MAPA_ROTINA.numped)
  if (!numped) return null

  // Decisão A: aceitar POSICAO M e F — normalizar para maiúscula
  const posicao = (resolveColuna(row, MAPA_ROTINA.posicao) || '').toUpperCase()
  if (!['F', 'M'].includes(posicao)) return null

  return {
    numped,
    numnota:               resolveColuna(row, MAPA_ROTINA.numnota),
    numcar:                resolveColuna(row, MAPA_ROTINA.numcar),
    codfilial:             resolveColuna(row, MAPA_ROTINA.codfilial),
    codcli:                resolveColuna(row, MAPA_ROTINA.codcli),
    cliente:               resolveColuna(row, MAPA_ROTINA.cliente),
    destino:               resolveColuna(row, MAPA_ROTINA.destino),
    cgcent:                resolveColuna(row, MAPA_ROTINA.cgcent),
    numtranswms:           resolveColuna(row, MAPA_ROTINA.numtranswms),
    posicao,
    data_pedido:           parseData(resolveColuna(row, MAPA_ROTINA.data_pedido)),
    dt_entrega:            parseData(resolveColuna(row, MAPA_ROTINA.dt_entrega)),
    dtwms:                 parseData(resolveColuna(row, MAPA_ROTINA.dtwms)),
    datageracaowms:        parseData(resolveColuna(row, MAPA_ROTINA.datageracaowms)),
    datageracaoos:         parseData(resolveColuna(row, MAPA_ROTINA.datageracaoos)),
    datainicioos:          parseData(resolveColuna(row, MAPA_ROTINA.datainicioos)),
    datafimseparacao:      parseData(resolveColuna(row, MAPA_ROTINA.datafimseparacao)),
    datainicioconferencia: parseData(resolveColuna(row, MAPA_ROTINA.datainicioconferencia)),
    datafimconferencia:    parseData(resolveColuna(row, MAPA_ROTINA.datafimconferencia)),
    datafimos:             parseData(resolveColuna(row, MAPA_ROTINA.datafimos)),
    datafaturamento:       parseData(resolveColuna(row, MAPA_ROTINA.datafaturamento)),
    // competência derivada de data_pedido
    competencia:           derivarCompetencia(parseData(resolveColuna(row, MAPA_ROTINA.data_pedido))),
    importacao_id:         importacaoId,
  }
}

function mapearLinhaComprovei(row, importacaoId) {
  const numped = resolveColuna(row, MAPA_COMPROVEI.numped)
  if (!numped) return null

  return {
    numped,
    numnot_comprovei:  resolveColuna(row, MAPA_COMPROVEI.numnot_comprovei),
    cnpj_cliente:      resolveColuna(row, MAPA_COMPROVEI.cnpj_cliente),
    nome_cliente:      resolveColuna(row, MAPA_COMPROVEI.nome_cliente),
    cidade_destino:    resolveColuna(row, MAPA_COMPROVEI.cidade_destino),
    uf_destino:        resolveColuna(row, MAPA_COMPROVEI.uf_destino),
    status_entrega:    resolveColuna(row, MAPA_COMPROVEI.status_entrega),
    ultima_ocorrencia: resolveColuna(row, MAPA_COMPROVEI.ultima_ocorrencia),
    regiao:            resolveColuna(row, MAPA_COMPROVEI.regiao),
    qtd_paradas:       parseInteiro(resolveColuna(row, MAPA_COMPROVEI.qtd_paradas)),
    qtd_reentregas:    parseInteiro(resolveColuna(row, MAPA_COMPROVEI.qtd_reentregas)),
    motorista:         resolveColuna(row, MAPA_COMPROVEI.motorista),
    codigo_motorista:  resolveColuna(row, MAPA_COMPROVEI.codigo_motorista),
    cpf_motorista:     parseCPF(resolveColuna(row, MAPA_COMPROVEI.cpf_motorista)),
    placa:             resolveColuna(row, MAPA_COMPROVEI.placa),
    data_rota:         parseData(resolveColuna(row, MAPA_COMPROVEI.data_rota)),
    data_finalizacao:  parseData(resolveColuna(row, MAPA_COMPROVEI.data_finalizacao)),
    data_ult_ocorr:    parseData(resolveColuna(row, MAPA_COMPROVEI.data_ult_ocorr)),
    data_atualizacao:  parseData(resolveColuna(row, MAPA_COMPROVEI.data_atualizacao)),
    base_origem:       resolveColuna(row, MAPA_COMPROVEI.base_origem),
    base_destino:      resolveColuna(row, MAPA_COMPROVEI.base_destino),
    competencia:       derivarCompetencia(parseData(resolveColuna(row, MAPA_COMPROVEI.data_rota))),
    importacao_id:     importacaoId,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// IMPORTAÇÃO
// Decisão D: upsert por numped global (sobrescreve com dados mais recentes)
// ─────────────────────────────────────────────────────────────────────────────

const LOTE = 500

function mensagemAmigavel(error) {
  const msg = (error?.message || '').toLowerCase()
  if (msg.includes('network')) return 'Erro de conexão. Verifique sua internet.'
  if (msg.includes('permission') || msg.includes('rls')) return 'Sem permissão para esta operação.'
  return error?.message || 'Erro inesperado ao salvar registros.'
}

export async function importarRegistrosRotina(linhas, importacaoId) {
  const erros = []
  const registros = []
  let ignorados = 0

  for (const linha of linhas) {
    const reg = mapearLinhaRotina(linha, importacaoId)
    if (!reg) { ignorados++; continue }
    registros.push(reg)
  }

  if (registros.length === 0) {
    return { inseridos: 0, ignorados, erros: ['Nenhum registro com NUMPED e POSICAO válidos encontrado.'] }
  }

  let inseridos = 0
  for (let i = 0; i < registros.length; i += LOTE) {
    const lote = registros.slice(i, i + LOTE)
    const { error, count } = await supabase
      .from('registros_rotina')
      .upsert(lote, { onConflict: 'numped', count: 'exact' })
    if (error) erros.push(mensagemAmigavel(error))
    else inseridos += count ?? lote.length
  }

  // Gravar snapshot mensal (migration 0010)
  // A competência é derivada do primeiro registro com data_pedido preenchida.
  // Se todos os registros forem do mesmo mês (caso normal), a competência é única.
  const competenciaImport = registros.find(r => r.competencia)?.competencia ?? null
  if (competenciaImport && erros.length === 0) {
    // Executar em background — não bloqueia o retorno da importação
    gravarSnapshotsRotina(registros, competenciaImport, importacaoId)
      .catch(() => {}) // falha silenciosa: snapshot é complementar, não crítico
  }

  return { inseridos, ignorados, erros }
}

export async function importarRegistrosComprovei(linhas, importacaoId) {
  const erros = []
  const registros = []
  let ignorados = 0

  for (const linha of linhas) {
    const reg = mapearLinhaComprovei(linha, importacaoId)
    if (!reg) { ignorados++; continue }
    registros.push(reg)
  }

  if (registros.length === 0) {
    return { inseridos: 0, ignorados, erros: ['Nenhum registro com Pedido válido encontrado.'] }
  }

  let inseridos = 0
  for (let i = 0; i < registros.length; i += LOTE) {
    const lote = registros.slice(i, i + LOTE)
    const { error, count } = await supabase
      .from('registros_comprovei')
      .upsert(lote, { onConflict: 'numped', count: 'exact' })
    if (error) erros.push(mensagemAmigavel(error))
    else inseridos += count ?? lote.length
  }

  // Gravar snapshot mensal COMPROVEI (migration 0011)
  const competenciaImport = registros.find(r => r.competencia)?.competencia ?? null
  if (competenciaImport && erros.length === 0) {
    gravarSnapshotsComprovei(registros, competenciaImport, importacaoId)
      .catch(() => {}) // falha silenciosa: snapshot é complementar, não crítico
  }

  // Atualizar tabela de status por motorista (migration 0017) — em background
  atualizarStatusMotoristasComprovei(registros, importacaoId)
    .catch(() => {}) // falha silenciosa: complementar ao fluxo principal

  return { inseridos, ignorados, erros }
}

/**
 * Agrega os registros COMPROVEI por CPF de motorista e faz upsert
 * na tabela comprovei_status_motorista (migration 0017).
 * Chamado automaticamente após cada importação de arquivo COMPROVEI.
 */
export async function atualizarStatusMotoristasComprovei(registros, importacaoId) {
  if (!registros || registros.length === 0) return { gravados: 0, erro: null }

  const hoje = new Date().toISOString().slice(0, 10)

  // Agregar por cpf_motorista
  const porCpf = new Map()
  for (const r of registros) {
    const cpf = r.cpf_motorista
    if (!cpf || !r.motorista) continue

    if (!porCpf.has(cpf)) {
      porCpf.set(cpf, {
        cpf_motorista:    cpf,
        nome_motorista:   r.motorista,
        placa:            r.placa || null,
        rota_atual:       r.cidade_destino || null,
        status_entrega:   r.status_entrega || null,
        ultima_atualizacao: r.data_atualizacao || null,
        pedidos:          [],
      })
    }

    const m = porCpf.get(cpf)
    m.pedidos.push(r)

    // Manter a data de atualização mais recente
    if (r.data_atualizacao && (!m.ultima_atualizacao || r.data_atualizacao > m.ultima_atualizacao)) {
      m.ultima_atualizacao = r.data_atualizacao
      m.status_entrega     = r.status_entrega || m.status_entrega
      m.rota_atual         = r.cidade_destino || m.rota_atual
      m.placa              = r.placa          || m.placa
    }
  }

  const STATUS_FINALIZADO = new Set(['Entregue', 'Entregue (Auto)', 'Finalizado', 'Devolvido'])
  const hojeISO = hoje

  const payload = Array.from(porCpf.values()).map(m => {
    const pedidosHoje = m.pedidos.filter(p =>
      p.data_rota && String(p.data_rota).slice(0, 10) === hojeISO
    )
    const emRota    = m.pedidos.filter(p => !STATUS_FINALIZADO.has(p.status_entrega))
    const entregues = m.pedidos.filter(p =>  STATUS_FINALIZADO.has(p.status_entrega))

    return {
      cpf_motorista:      m.cpf_motorista,
      nome_motorista:     m.nome_motorista,
      placa:              m.placa,
      rota_atual:         m.rota_atual,
      status_entrega:     m.status_entrega,
      qtd_pedidos_hoje:   pedidosHoje.length,
      qtd_em_rota:        emRota.length,
      qtd_entregues:      entregues.length,
      ultima_atualizacao: m.ultima_atualizacao,
      importado_em:       new Date().toISOString(),
      importacao_id:      importacaoId || null,
    }
  })

  if (payload.length === 0) return { gravados: 0, erro: null }

  const LOTE_CSM = 100
  let gravados = 0
  const erros = []

  for (let i = 0; i < payload.length; i += LOTE_CSM) {
    const { error, count } = await supabase
      .from('comprovei_status_motorista')
      .upsert(payload.slice(i, i + LOTE_CSM), { onConflict: 'cpf_motorista', count: 'exact' })
    if (error) erros.push(mensagemAmigavel(error))
    else gravados += count ?? payload.slice(i, i + LOTE_CSM).length
  }

  return { gravados, erro: erros.length > 0 ? erros[0] : null }
}

/**
 * Grava snapshot mensal na tabela snapshots_comprovei.
 * Chave composta (numped, competencia_import) — idempotente.
 * Preserva o estado de entrega (status, data_finalizacao) do mês em que foi importado.
 */
export async function gravarSnapshotsComprovei(registros, competenciaImport, importacaoId) {
  if (!competenciaImport || registros.length === 0) return { gravados: 0, erro: null }

  const snapshots = registros
    .filter(r => r && r.numped)
    .map(r => ({
      numped:              r.numped,
      competencia_import:  competenciaImport,
      numnot_comprovei:    r.numnot_comprovei,
      cnpj_cliente:        r.cnpj_cliente,
      nome_cliente:        r.nome_cliente,
      cidade_destino:      r.cidade_destino,
      uf_destino:          r.uf_destino,
      status_entrega:      r.status_entrega,
      ultima_ocorrencia:   r.ultima_ocorrencia,
      qtd_reentregas:      r.qtd_reentregas ?? 0,
      motorista:           r.motorista,
      cpf_motorista:       r.cpf_motorista,
      placa:               r.placa,
      data_rota:           r.data_rota,
      data_finalizacao:    r.data_finalizacao,  // NULL se ainda em rota — preservado!
      data_ult_ocorr:      r.data_ult_ocorr,
      data_atualizacao:    r.data_atualizacao,
      base_origem:         r.base_origem,
      base_destino:        r.base_destino,
      importacao_id:       importacaoId,
    }))

  let gravados = 0
  const erros = []

  for (let i = 0; i < snapshots.length; i += LOTE) {
    const lote = snapshots.slice(i, i + LOTE)
    const { error, count } = await supabase
      .from('snapshots_comprovei')
      .upsert(lote, {
        onConflict: 'numped,competencia_import',
        count: 'exact',
      })
    if (error) erros.push(mensagemAmigavel(error))
    else gravados += count ?? lote.length
  }

  return { gravados, erro: erros.length > 0 ? erros.join('; ') : null }
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSULTAS DO FUNIL
// ─────────────────────────────────────────────────────────────────────────────

export async function buscarKpisFunil() {
  const { data, error } = await supabase
    .from('vw_funil_kpis')
    .select('*')
    .maybeSingle()

  if (error) return { dados: null, erro: mensagemAmigavel(error) }
  return { dados: data ?? {}, erro: null }
}

export async function buscarPedidosConsolidados({
  etapa_atual,
  origem,
  status_entrega,
  motorista,
  data_inicio,
  data_fim,
  divergencia_nf,
  pagina = 1,
  porPagina = 50,
} = {}) {
  let query = supabase
    .from('vw_pedidos_consolidados')
    .select('*', { count: 'exact' })

  if (etapa_atual)    query = query.eq('etapa_atual', etapa_atual)
  if (origem)         query = query.eq('origem', origem)
  if (status_entrega) query = query.eq('status_entrega', status_entrega)
  if (motorista)      query = query.ilike('motorista', `%${motorista}%`)
  if (data_inicio)    query = query.gte('data_pedido', data_inicio)
  if (data_fim)       query = query.lte('data_pedido', data_fim + 'T23:59:59')
  if (divergencia_nf) query = query.eq('divergencia_nf', true)

  const inicio = (pagina - 1) * porPagina
  const { data, error, count } = await query
    .range(inicio, inicio + porPagina - 1)
    .order('numped', { ascending: true })

  if (error) return { dados: [], total: 0, erro: mensagemAmigavel(error) }
  return { dados: data ?? [], total: count ?? 0, erro: null }
}

export async function buscarTotaisImportados() {
  const [r, c] = await Promise.all([
    supabase.from('registros_rotina').select('*', { count: 'exact', head: true }),
    supabase.from('registros_comprovei').select('*', { count: 'exact', head: true }),
  ])
  return {
    total_rotina:    r.count ?? 0,
    total_comprovei: c.count ?? 0,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ETAPA 9.1 — TEMPOS, GARGALOS, HISTÓRICO E SLA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Formata horas em string legível: "2d 3h 45min".
 * Nunca retorna apenas minutos — sempre inclui a unidade maior se > 0.
 *
 * @param {number|null} horas - horas decimais (pode ser null/undefined)
 * @returns {string}
 */
export function formatarTempo(horas) {
  if (horas == null || isNaN(horas) || horas <= 0) return '—'
  const dias    = Math.floor(horas / 24)
  const h       = Math.floor(horas % 24)
  const minutos = Math.round((horas * 60) % 60)
  const partes  = []
  if (dias > 0)    partes.push(`${dias}d`)
  if (h > 0)       partes.push(`${h}h`)
  if (minutos > 0) partes.push(`${minutos}min`)
  return partes.length > 0 ? partes.join(' ') : '< 1min'
}

/**
 * Deriva a competência (YYYY-MM) de uma string de data ISO.
 * Usada no momento da importação para preencher a coluna `competencia`.
 *
 * @param {string|null} dataISO - data no formato ISO (ex: '2026-06-15T00:00:00')
 * @returns {string|null} - ex: '2026-06'
 */
export function derivarCompetencia(dataISO) {
  if (!dataISO) return null
  const d = new Date(dataISO)
  if (isNaN(d.getTime())) return null
  const ano = d.getFullYear()
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  return `${ano}-${mes}`
}

// ── Gargalos ─────────────────────────────────────────────────────────────────────────────

/**
 * Busca os tempos médios/máximos por etapa do funil.
 * Fonte: vw_gargalos_etapas (migration 0009)
 *
 * @param {object} filtros
 * @param {string} filtros.competencia  - ex: '2026-06'
 * @param {string} filtros.motorista    - parcial, case-insensitive
 * @param {string} filtros.cidade       - parcial, case-insensitive
 * @returns {{ dados: object[]|null, erro: string|null }}
 */
export async function buscarGargalos(filtros = {}) {
  // A view já agrega; filtros de competência/motorista/cidade
  // são aplicados na vw_tempos_etapas (base da view de gargalos).
  // Para filtros avançados usamos a view de detalhes diretamente.
  if (filtros.competencia || filtros.motorista || filtros.cidade) {
    return buscarGargalosFiltrados(filtros)
  }

  const { data, error } = await supabase
    .from('vw_gargalos_etapas')
    .select('*')
    .order('ordem', { ascending: true })

  if (error) return { dados: null, erro: mensagemAmigavel(error) }
  return { dados: data ?? [], erro: null }
}

async function buscarGargalosFiltrados(filtros) {
  // Agrega manualmente a partir dos detalhes filtrados
  let query = supabase
    .from('vw_tempos_etapas')
    .select(
      'h_venda_faturamento, h_faturamento_wms, h_espera_separacao, h_separacao, ' +
      'h_espera_conferencia, h_conferencia, h_espera_transporte, h_transporte, ' +
      'competencia_rotina, motorista, cidade_destino'
    )

  if (filtros.competencia) query = query.eq('competencia_rotina', filtros.competencia)
  if (filtros.motorista)   query = query.ilike('motorista', `%${filtros.motorista}%`)
  if (filtros.cidade)      query = query.ilike('cidade_destino', `%${filtros.cidade}%`)

  const { data, error } = await query
  if (error) return { dados: null, erro: mensagemAmigavel(error) }

  // Agregar no cliente (as views do Postgres não aceitam WHERE dinâmico)
  const ETAPAS_DEF = [
    { etapa: 'Venda → Faturamento', ordem: 1, campo: 'h_venda_faturamento' },
    { etapa: 'Faturamento → WMS',   ordem: 2, campo: 'h_faturamento_wms'   },
    { etapa: 'Espera Separação',    ordem: 3, campo: 'h_espera_separacao'   },
    { etapa: 'Separação',           ordem: 4, campo: 'h_separacao'          },
    { etapa: 'Espera Conferência',  ordem: 5, campo: 'h_espera_conferencia' },
    { etapa: 'Conferência',         ordem: 6, campo: 'h_conferencia'        },
    { etapa: 'Espera Transporte',   ordem: 7, campo: 'h_espera_transporte'  },
    { etapa: 'Transporte',          ordem: 8, campo: 'h_transporte'         },
  ]

  const linhas = data ?? []
  const resultados = ETAPAS_DEF.map(({ etapa, ordem, campo }) => {
    const valores = linhas.map(r => r[campo]).filter(v => v != null && v > 0)
    if (valores.length === 0) return null
    const media   = valores.reduce((a, b) => a + b, 0) / valores.length
    const maximo  = Math.max(...valores)
    return { etapa, ordem, qtd_pedidos: valores.length, media_horas: media, maximo_horas: maximo }
  }).filter(Boolean)

  // Classificar por lentidão
  const sorted = [...resultados].sort((a, b) => b.media_horas - a.media_horas)
  resultados.forEach(r => {
    const rank = sorted.findIndex(s => s.etapa === r.etapa) + 1
    r.rank_lentidao = rank
    r.classificacao = rank === 1 ? 'vermelho' : rank <= 3 ? 'amarelo' : 'verde'
  })

  return { dados: resultados.sort((a, b) => a.ordem - b.ordem), erro: null }
}

// ── Competências disponíveis ────────────────────────────────────────────────────

/**
 * Lista as competências disponíveis nos registros importados,
 * em ordem decrescente (mais recente primeiro).
 *
 * @returns {{ dados: string[]|null, erro: string|null }}
 */
export async function buscarCompetencias() {
  const [resR, resC] = await Promise.all([
    supabase
      .from('registros_rotina')
      .select('competencia')
      .not('competencia', 'is', null)
      .order('competencia', { ascending: false }),
    supabase
      .from('registros_comprovei')
      .select('competencia')
      .not('competencia', 'is', null)
      .order('competencia', { ascending: false }),
  ])

  if (resR.error) return { dados: null, erro: mensagemAmigavel(resR.error) }

  const todas = [
    ...(resR.data ?? []).map(r => r.competencia),
    ...(resC.data ?? []).map(r => r.competencia),
  ]
  const unicas = [...new Set(todas)].sort().reverse()
  return { dados: unicas, erro: null }
}

// ── Pedidos com filtro de competência ────────────────────────────────────────

/**
 * Extensão de buscarPedidosConsolidados com filtro por competência e rota.
 * Reutiliza a mesma view vw_pedidos_consolidados da Etapa 9.
 */
export async function buscarPedidosComHistorico({
  competencia,
  etapa_atual,
  origem,
  status_entrega,
  motorista,
  cidade,
  data_inicio,
  data_fim,
  divergencia_nf,
  pagina = 1,
  porPagina = 50,
} = {}) {
  let query = supabase
    .from('vw_pedidos_consolidados')
    .select('*', { count: 'exact' })

  // Filtro por competência: usa data_pedido como proxy (ROTINA)
  if (competencia) {
    const [ano, mes] = competencia.split('-')
    const inicio = `${ano}-${mes}-01`
    const fim    = new Date(parseInt(ano), parseInt(mes), 0)
      .toISOString().slice(0, 10)
    query = query.gte('data_pedido', inicio).lte('data_pedido', fim + 'T23:59:59')
  }

  if (etapa_atual)    query = query.eq('etapa_atual', etapa_atual)
  if (origem)         query = query.eq('origem', origem)
  if (status_entrega) query = query.eq('status_entrega', status_entrega)
  if (motorista)      query = query.ilike('motorista', `%${motorista}%`)
  if (cidade)         query = query.ilike('cidade_destino', `%${cidade}%`)
  if (data_inicio)    query = query.gte('data_pedido', data_inicio)
  if (data_fim)       query = query.lte('data_pedido', data_fim + 'T23:59:59')
  if (divergencia_nf) query = query.eq('divergencia_nf', true)

  const inicio = (pagina - 1) * porPagina
  const { data, error, count } = await query
    .range(inicio, inicio + porPagina - 1)
    .order('numped', { ascending: true })

  if (error) return { dados: [], total: 0, erro: mensagemAmigavel(error) }
  return { dados: data ?? [], total: count ?? 0, erro: null }
}

// ── SLA ─────────────────────────────────────────────────────────────────────────────

/**
 * KPIs de SLA consolidados.
 * Fonte: vw_sla_kpis (migration 0009)
 */
export async function buscarKpisSLA(filtros = {}) {
  if (filtros.competencia || filtros.motorista || filtros.cidade) {
    return buscarKpisSLAFiltrado(filtros)
  }

  const { data, error } = await supabase
    .from('vw_sla_kpis')
    .select('*')
    .maybeSingle()

  if (error) return { dados: null, erro: mensagemAmigavel(error) }
  return { dados: data ?? {}, erro: null }
}

async function buscarKpisSLAFiltrado(filtros) {
  let query = supabase
    .from('vw_sla_entregas')
    .select('sla_status, diferenca_dias, competencia_rotina, motorista, cidade_destino')

  if (filtros.competencia) query = query.eq('competencia_rotina', filtros.competencia)
  if (filtros.motorista)   query = query.ilike('motorista', `%${filtros.motorista}%`)
  if (filtros.cidade)      query = query.ilike('cidade_destino', `%${filtros.cidade}%`)

  const { data, error } = await query
  if (error) return { dados: null, erro: mensagemAmigavel(error) }

  const linhas = data ?? []
  const comSLA = linhas.filter(l => l.sla_status !== 'sem_dados')
  const atrasados = comSLA.filter(l => l.sla_status === 'atrasado')
  const dentroP   = comSLA.filter(l => l.sla_status === 'dentro_prazo')

  const atrasoMedio = atrasados.length > 0
    ? atrasados.reduce((acc, l) => acc + (l.diferenca_dias ?? 0), 0) / atrasados.length
    : null
  const atrasoMax = atrasados.length > 0
    ? Math.max(...atrasados.map(l => l.diferenca_dias ?? 0))
    : null

  return {
    dados: {
      total_com_sla:          comSLA.length,
      total_sem_rota_cadastrada: linhas.filter(l => l.sla_status === 'sem_dados').length,
      total_dentro_prazo:     dentroP.length,
      pct_dentro_prazo:       comSLA.length > 0 ? Math.round(dentroP.length / comSLA.length * 1000) / 10 : null,
      total_atrasado:         atrasados.length,
      pct_atrasado:           comSLA.length > 0 ? Math.round(atrasados.length / comSLA.length * 1000) / 10 : null,
      atraso_medio_dias:      atrasoMedio != null ? Math.round(atrasoMedio * 100) / 100 : null,
      atraso_maximo_dias:     atrasoMax != null ? Math.round(atrasoMax * 100) / 100 : null,
    },
    erro: null,
  }
}

// ── Alertas ─────────────────────────────────────────────────────────────────────────────

/**
 * Rotas com maior atraso médio.
 * Fonte: vw_alertas_operacionais (migration 0009)
 */
export async function buscarAlertasRotas() {
  const { data, error } = await supabase
    .from('vw_alertas_operacionais')
    .select('*')

  if (error) return { dados: null, erro: mensagemAmigavel(error) }
  return { dados: data ?? [], erro: null }
}

/**
 * Motoristas com maior atraso — calculado na vw_sla_entregas.
 */
export async function buscarAlertasMotoristas(limite = 10) {
  const { data, error } = await supabase
    .from('vw_sla_entregas')
    .select('motorista, diferenca_dias, cidade_destino')
    .eq('sla_status', 'atrasado')
    .not('motorista', 'is', null)
    .order('diferenca_dias', { ascending: false })
    .limit(limite * 5) // buscar mais para agregar

  if (error) return { dados: null, erro: mensagemAmigavel(error) }

  // Agregar por motorista
  const agrup = {}
  for (const r of (data ?? [])) {
    if (!r.motorista) continue
    if (!agrup[r.motorista]) agrup[r.motorista] = { motorista: r.motorista, qtd: 0, soma: 0 }
    agrup[r.motorista].qtd++
    agrup[r.motorista].soma += r.diferenca_dias ?? 0
  }

  const resultado = Object.values(agrup)
    .map(a => ({ motorista: a.motorista, qtd_atrasos: a.qtd, atraso_medio_dias: Math.round(a.soma / a.qtd * 100) / 100 }))
    .sort((a, b) => b.atraso_medio_dias - a.atraso_medio_dias)
    .slice(0, limite)

  return { dados: resultado, erro: null }
}

/**
 * Pedidos com maior tempo em transporte (top N).
 */
export async function buscarPedidosMaisLentosTransporte(limite = 10) {
  const { data, error } = await supabase
    .from('vw_tempos_etapas')
    .select('numped, motorista, cidade_destino, h_transporte, status_entrega')
    .not('h_transporte', 'is', null)
    .gt('h_transporte', 0)
    .order('h_transporte', { ascending: false })
    .limit(limite)

  if (error) return { dados: null, erro: mensagemAmigavel(error) }
  return { dados: data ?? [], erro: null }
}

/**
 * Pedidos com maior tempo em separação (top N).
 */
export async function buscarPedidosMaisLentosSeparacao(limite = 10) {
  const { data, error } = await supabase
    .from('vw_tempos_etapas')
    .select('numped, motorista, cidade_destino, h_separacao, status_entrega')
    .not('h_separacao', 'is', null)
    .gt('h_separacao', 0)
    .order('h_separacao', { ascending: false })
    .limit(limite)

  if (error) return { dados: null, erro: mensagemAmigavel(error) }
  return { dados: data ?? [], erro: null }
}

// ── Prazo de Rotas ────────────────────────────────────────────────────────────────────────

/**
 * Lista todos os prazos de rota cadastrados.
 * @param {boolean} apenasAtivos
 */
export async function buscarPrazosRotas(apenasVigentes = true) {
  // Após migration 0013: filtra por vigente_ate IS NULL para retornar
  // apenas os prazos vigentes (1 por rota+uf). Ao passar false, retorna
  // todo o histórico de versões.
  let query = supabase
    .from('prazo_rotas')
    .select('*')
    .order('rota', { ascending: true })
    .order('vigente_desde', { ascending: false })

  if (apenasVigentes) query = query.is('vigente_ate', null)

  const { data, error } = await query
  if (error) return { dados: null, erro: mensagemAmigavel(error) }
  return { dados: data ?? [], erro: null }
}

/**
 * Cria ou edita um prazo de rota usando SCD Tipo 2 (migration 0013).
 *
 * CRIAÇÃO (sem id): INSERT direto.
 * EDIÇÃO (com id): encerra o registro atual (vigente_ate = agora)
 *                  e cria novo registro com os novos valores.
 *
 * Esse padrão garante que alterações de prazo NÃO reescrevem histórico:
 * o JOIN temporal em vw_sla_entregas_com_tolerancia usa vigente_desde/vigente_ate
 * para localizar o prazo correto na data de cada entrega.
 */
export async function salvarPrazoRota(prazo) {
  const { id, ...campos } = prazo

  // ── CRIAÇÃO: novo registro sem id ──────────────────────────────────────
  if (!id) {
    const { data, error } = await supabase
      .from('prazo_rotas')
      .insert([campos])
      .select()
      .single()
    if (error) return { dados: null, erro: mensagemAmigavel(error) }
    return { dados: data, erro: null }
  }

  // ── EDIÇÃO: SCD Tipo 2 ───────────────────────────────────────────
  // Passo 1: encerrar o registro atual (vigente_ate = agora)
  const agora = new Date().toISOString()
  const { error: errEnc } = await supabase
    .from('prazo_rotas')
    .update({ vigente_ate: agora })
    .eq('id', id)
    .is('vigente_ate', null) // só encerra se ainda estiver vigente

  if (errEnc) return { dados: null, erro: mensagemAmigavel(errEnc) }

  // Passo 2: criar novo registro com os novos valores
  // Preservar rota e uf do registro original; novos valores sobrescrevem demais
  const { data: atual, error: errLer } = await supabase
    .from('prazo_rotas')
    .select('rota, uf, codigo_rota, distancia_km')
    .eq('id', id)
    .single()

  if (errLer) return { dados: null, erro: mensagemAmigavel(errLer) }

  const novoRegistro = {
    rota:                  atual.rota,
    uf:                    atual.uf,
    codigo_rota:           campos.codigo_rota   ?? atual.codigo_rota,
    distancia_km:          campos.distancia_km  ?? atual.distancia_km,
    prazo_dias:            campos.prazo_dias,
    prazo_horas:           campos.prazo_horas,
    tolerancia_percentual: campos.tolerancia_percentual,
    ativo:                 campos.ativo         ?? true,
    vigente_desde:         agora,
    vigente_ate:           null,
  }

  const { data, error } = await supabase
    .from('prazo_rotas')
    .insert([novoRegistro])
    .select()
    .single()

  if (error) return { dados: null, erro: mensagemAmigavel(error) }
  return { dados: data, erro: null }
}

/**
 * Inativa uma rota (encerra vigência e marca ativo=false).
 * Sem DELETE — histórico preservado.
 */
export async function inativarPrazoRota(id) {
  const { error } = await supabase
    .from('prazo_rotas')
    .update({ ativo: false, vigente_ate: new Date().toISOString() })
    .eq('id', id)
  if (error) return { erro: mensagemAmigavel(error) }
  return { erro: null }
}

// ─────────────────────────────────────────────────────────────────────────────
IMPORTAÇÃO EM MASSA — PRAZO DE ROTAS
// ─────────────────────────────────────────────────────────────────────────────
function normalizarParaComparacao(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Importa prazos de rota em massa a partir de linhas parseadas de planilha.
 * Cada linha deve ter: rota, prazo_dias. Opcionais: uf, codigo_rota, distancia_km, prazo_horas, tolerancia_percentual.
 * Detecta rotas existentes por nome normalizado, atualiza via SCD Tipo 2, insere novas.
 * Retorna: { inseridos, atualizados, iguais, erros, total }
 */
export async function importarPrazosEmMassa(linhas) {
  const { dados: vigentes, erro: errV } = await buscarPrazosRotas(true)
  if (errV) return { inseridos: 0, atualizados: 0, iguais: 0, erros: [errV], total: 0 }

  const mapVigentes = {}
  for (const v of vigentes) {
    const chave = normalizarParaComparacao(v.rota) + '|' + (v.uf || '').toUpperCase().trim()
    mapVigentes[chave] = v
  }

  let inseridos = 0, atualizados = 0, iguais = 0
  const erros = []

  for (const linha of linhas) {
    const rota = String(linha.rota || linha.Rota || '').trim()
    if (!rota) continue

    const uf           = String(linha.uf || linha.UF || '').toUpperCase().trim()
    const prazo_dias   = parseInt(linha.prazo_dias || linha['Prazo (dias)'] || linha.prazo || linha.Prazo || 0)
    const prazo_horas  = linha.prazo_horas != null ? parseFloat(linha.prazo_horas) : null
    const codigo_rota  = String(linha.codigo_rota || linha.codigo || '').trim() || null
    const distancia_km = linha.distancia_km != null ? parseFloat(linha.distancia_km) : null
    const tolerancia   = linha.tolerancia_percentual != null ? parseFloat(linha.tolerancia_percentual) : 20

    if (!prazo_dias || prazo_dias <= 0) {
      erros.push(`Prazo inválido para "${rota}"`)
      continue
    }

    const chave     = normalizarParaComparacao(rota) + '|' + uf
    const existente = mapVigentes[chave]

    const campos = { rota, uf: uf || null, codigo_rota, distancia_km, prazo_dias, prazo_horas, tolerancia_percentual: tolerancia, ativo: true }

    if (!existente) {
      const { erro } = await salvarPrazoRota(campos)
      if (erro) erros.push(`Erro ao inserir "${rota}": ${erro}`)
      else inseridos++
    } else {
      const semMudanca =
        existente.prazo_dias === prazo_dias &&
        (existente.prazo_horas ?? null) === prazo_horas &&
        (existente.codigo_rota ?? null) === codigo_rota &&
        (existente.distancia_km ?? null) === distancia_km &&
        (existente.tolerancia_percentual ?? 20) === tolerancia
      if (semMudanca) {
        iguais++
      } else {
        const { erro } = await salvarPrazoRota({ ...campos, id: existente.id })
        if (erro) erros.push(`Erro ao atualizar "${rota}": ${erro}`)
        else atualizados++
      }
    }
  }

  return { inseridos, atualizados, iguais, erros, total: linhas.length }
}

// ─────────────────────────────────────────────────────────────────────────────
// MIGRATION 0010 — SNAPSHOTS E RELATÓRIOS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Grava um snapshot mensal na tabela snapshots_rotina.
 * Chamada pela importação logo após o upsert em registros_rotina.
 *
 * Usa INSERT … ON CONFLICT DO UPDATE para idempotência:
 * reimportar o mesmo mês atualiza o snapshot (não duplica).
 *
 * @param {object[]} linhas         - linhas já mapeadas (mesmo formato de mapearLinhaRotina)
 * @param {string}   competenciaImport - YYYY-MM do arquivo importado
 * @param {string}   importacaoId   - UUID da importação
 */
export async function gravarSnapshotsRotina(linhas, competenciaImport, importacaoId) {
  if (!competenciaImport || linhas.length === 0) return { gravados: 0, erro: null }

  const registros = linhas
    .filter(r => r && r.numped)
    .map(r => ({
      numped:                r.numped,
      competencia_import:    competenciaImport,
      numnota:               r.numnota,
      numcar:                r.numcar,
      codcli:                r.codcli,
      cgcent:                r.cgcent,
      posicao:               r.posicao,
      data_pedido:           r.data_pedido,
      dt_entrega:            r.dt_entrega,
      datafaturamento:       r.datafaturamento,
      datageracaoos:         r.datageracaoos,
      datainicioos:          r.datainicioos,
      datafimseparacao:      r.datafimseparacao,
      datainicioconferencia: r.datainicioconferencia,
      datafimconferencia:    r.datafimconferencia,
      dtwms:                 r.dtwms,
      importacao_id:         importacaoId,
    }))

  let gravados = 0
  const LOTE = 500
  const erros = []

  for (let i = 0; i < registros.length; i += LOTE) {
    const lote = registros.slice(i, i + LOTE)
    const { error, count } = await supabase
      .from('snapshots_rotina')
      .upsert(lote, {
        onConflict: 'numped,competencia_import',  // chave composta
        count: 'exact',
      })
    if (error) erros.push(mensagemAmigavel(error))
    else gravados += count ?? lote.length
  }

  return { gravados, erro: erros.length > 0 ? erros.join('; ') : null }
}

// ── Relatório 1: Ranking de Gargalos ─────────────────────────────────────────

/**
 * Ranking de todas as etapas ordenado do maior gargalo para o menor.
 * Fonte: vw_ranking_gargalos (migration 0010)
 *
 * @param {object} filtros
 * @param {string} filtros.competencia - YYYY-MM (filtra por competência nos snapshots)
 */
export async function buscarRankingGargalos(filtros = {}) {
  // A view agrega sobre todos os dados; filtro de competência
  // requer query nos snapshots — delegar para agregação no cliente se necessário
  if (filtros.competencia) {
    return buscarRankingGargalosPorCompetencia(filtros.competencia)
  }

  const { data, error } = await supabase
    .from('vw_ranking_gargalos')
    .select('*')
    .order('rank_gargalo', { ascending: true })

  if (error) return { dados: null, erro: mensagemAmigavel(error) }
  return { dados: data ?? [], erro: null }
}

async function buscarRankingGargalosPorCompetencia(competencia) {
  // Buscar snapshots da competência e calcular no cliente
  const { data, error } = await supabase
    .from('snapshots_rotina')
    .select(`
      numped, data_pedido, datafaturamento, dtwms,
      datainicioos, datafimseparacao, datainicioconferencia, datafimconferencia
    `)
    .eq('competencia_import', competencia)

  if (error) return { dados: null, erro: mensagemAmigavel(error) }

  // Buscar dados de entrega do COMPROVEI para os NUMPEDs deste snapshot
  const numpeds = (data ?? []).map(r => r.numped)
  let dataRota = {}, dataFin = {}

  if (numpeds.length > 0) {
    const { data: comp } = await supabase
      .from('registros_comprovei')
      .select('numped, data_rota, data_finalizacao')
      .in('numped', numpeds.slice(0, 1000)) // limite seguro
    ;(comp ?? []).forEach(r => {
      dataRota[r.numped] = r.data_rota
      dataFin[r.numped]  = r.data_finalizacao
    })
  }

  // Calcular intervalos
  const ETAPAS_DEF = [
    { ordem: 1, etapa: 'Venda → Faturamento',  campos_fonte: 'DATA → DATAFATURAMENTO',
      fn: r => diff(r.data_pedido, r.datafaturamento) },
    { ordem: 2, etapa: 'Faturamento → WMS',    campos_fonte: 'DATAFATURAMENTO → DTWMS',
      fn: r => diff(r.datafaturamento, r.dtwms) },
    { ordem: 3, etapa: 'Espera Separação',      campos_fonte: 'DTWMS → DATAINICIOOS',
      fn: r => diff(r.dtwms, r.datainicioos) },
    { ordem: 4, etapa: 'Separação',             campos_fonte: 'DATAINICIOOS → DATAFIMSEPARACAO',
      fn: r => diff(r.datainicioos, r.datafimseparacao) },
    { ordem: 5, etapa: 'Espera Conferência',    campos_fonte: 'DATAFIMSEPARACAO → DATAINICIOCONFERENCIA',
      fn: r => diff(r.datafimseparacao, r.datainicioconferencia) },
    { ordem: 6, etapa: 'Conferência',           campos_fonte: 'DATAINICIOCONFERENCIA → DATAFIMCONFERENCIA',
      fn: r => diff(r.datainicioconferencia, r.datafimconferencia) },
    { ordem: 7, etapa: 'Espera Transporte',     campos_fonte: 'DATAFIMCONFERENCIA → Data da rota',
      fn: r => diff(r.datafimconferencia, dataRota[r.numped]) },
    { ordem: 8, etapa: 'Transporte',            campos_fonte: 'Data da rota → Data Finalização',
      fn: r => diff(dataRota[r.numped], dataFin[r.numped]) },
  ]

  const linhas = data ?? []
  const resultado = ETAPAS_DEF.map(({ ordem, etapa, campos_fonte, fn }) => {
    const vals = linhas.map(fn).filter(v => v != null && v > 0)
    if (vals.length === 0) return null
    const media  = vals.reduce((a, b) => a + b, 0) / vals.length
    const maximo = Math.max(...vals)
    const minimo = Math.min(...vals)
    vals.sort((a, b) => a - b)
    const mediana = vals[Math.floor(vals.length / 2)]
    return { ordem, etapa, campos_fonte, qtd_pedidos: vals.length,
             media_horas: Math.round(media * 100) / 100,
             maximo_horas: Math.round(maximo * 100) / 100,
             minimo_horas: Math.round(minimo * 100) / 100,
             mediana_horas: Math.round(mediana * 100) / 100 }
  }).filter(Boolean)

  // Ranking por média decrescente
  const sorted = [...resultado].sort((a, b) => b.media_horas - a.media_horas)
  resultado.forEach(r => {
    const rank = sorted.findIndex(s => s.etapa === r.etapa) + 1
    r.rank_gargalo  = rank
    r.classificacao = rank === 1 ? 'vermelho' : rank <= 3 ? 'amarelo' : 'verde'
  })

  return { dados: resultado.sort((a, b) => b.media_horas - a.media_horas), erro: null }
}

function diff(ini, fim) {
  if (!ini || !fim) return null
  const ms = new Date(fim) - new Date(ini)
  const h  = ms / 3_600_000
  return h > 0 ? h : null
}

// ── Relatório 2: Evolução Mensal ──────────────────────────────────────────

/**
 * Evolução mensal dos lead times comparando competências.
 * Fonte: vw_evolucao_mensal (migration 0010 — usa snapshots_rotina).
 *
 * @param {object} filtros
 * @param {string[]} filtros.competencias - lista de YYYY-MM a comparar (opcional)
 */
export async function buscarEvolucaoMensal(filtros = {}) {
  let query = supabase
    .from('vw_evolucao_mensal')
    .select('*')
    .order('competencia', { ascending: false })

  if (filtros.competencias && filtros.competencias.length > 0) {
    query = query.in('competencia', filtros.competencias)
  }

  const { data, error } = await query
  if (error) return { dados: null, erro: mensagemAmigavel(error) }
  return { dados: data ?? [], erro: null }
}

/**
 * Lista competências disponíveis nos snapshots (para o seletor do Relatório 2).
 */
export async function buscarCompetenciasSnapshots() {
  const { data, error } = await supabase
    .from('snapshots_rotina')
    .select('competencia_import')
    .order('competencia_import', { ascending: false })

  if (error) return { dados: [], erro: mensagemAmigavel(error) }
  const unicas = [...new Set((data ?? []).map(r => r.competencia_import))].filter(Boolean)
  return { dados: unicas, erro: null }
}

// ─────────────────────────────────────────────────────────────────────────────
// MIGRATION 0012 — GERENCIAL: SLA COM TOLERÂNCIA, PERFORMANCE DE ROTAS,
//                              EVOLUÇÃO DE GARGALOS
// ─────────────────────────────────────────────────────────────────────────────

// ── Evolução de Gargalos por Competência ────────────────────────────────────

/**
 * Evolução mensal dos 7 intervalos com variação % em relação ao mês anterior.
 * Usa EXCLUSIVAMENTE snapshots_rotina + snapshots_comprovei (Ponto 4).
 * Fonte: vw_evolucao_gargalos (migration 0012)
 *
 * @param {object} filtros
 * @param {string[]} filtros.competencias - lista de YYYY-MM a comparar (opcional)
 */
export async function buscarEvolucaoGargalos(filtros = {}) {
  let query = supabase
    .from('vw_evolucao_gargalos')
    .select('*')
    .order('competencia', { ascending: false })

  if (filtros.competencias && filtros.competencias.length > 0) {
    query = query.in('competencia', filtros.competencias)
  }

  const { data, error } = await query
  if (error) return { dados: null, erro: mensagemAmigavel(error) }
  return { dados: data ?? [], erro: null }
}

// ── SLA com Tolerância ──────────────────────────────────────────────────────────────────

/**
 * KPIs de SLA usando a classificação verde/amarelo/vermelho com tolerância real.
 * Fonte: vw_sla_kpis_com_tolerancia (migration 0012)
 *
 * @param {object} filtros
 * @param {string} filtros.competencia  - YYYY-MM (filtra por snapshots)
 * @param {string} filtros.cidade       - parcial, case-insensitive
 */
export async function buscarKpisSLAComTolerancia(filtros = {}) {
  if (filtros.competencia || filtros.cidade) {
    return buscarKpisSLAFiltradoComTolerancia(filtros)
  }

  const { data, error } = await supabase
    .from('vw_sla_kpis_com_tolerancia')
    .select('*')
    .maybeSingle()

  if (error) return { dados: null, erro: mensagemAmigavel(error) }
  return { dados: data ?? {}, erro: null }
}

async function buscarKpisSLAFiltradoComTolerancia({ competencia, cidade }) {
  let query = supabase
    .from('vw_sla_entregas_com_tolerancia')
    .select('sla_status, diferenca_horas, competencia_import, cidade_destino')

  if (competencia) query = query.eq('competencia_import', competencia)
  if (cidade)      query = query.ilike('cidade_destino', `%${cidade}%`)

  const { data, error } = await query
  if (error) return { dados: null, erro: mensagemAmigavel(error) }

  const linhas = data ?? []
  const comSLA = linhas.filter(l => l.sla_status !== 'sem_dados')

  const conta = (status) => comSLA.filter(l => l.sla_status === status).length
  const pct   = (n) => comSLA.length > 0 ? Math.round(n / comSLA.length * 1000) / 10 : null

  const vermelhos   = comSLA.filter(l => l.sla_status === 'vermelho')
  const atrasoMedio = vermelhos.length > 0
    ? vermelhos.reduce((acc, l) => acc + (l.diferenca_horas ?? 0), 0) / vermelhos.length / 24
    : null
  const atrasoMax = vermelhos.length > 0
    ? Math.max(...vermelhos.map(l => l.diferenca_horas ?? 0)) / 24
    : null

  return {
    dados: {
      total_com_sla:                 comSLA.length,
      total_sem_rota:                linhas.filter(l => l.sla_status === 'sem_dados').length,
      total_verde:                   conta('verde'),
      pct_verde:                     pct(conta('verde')),
      total_amarelo:                 conta('amarelo'),
      pct_amarelo:                   pct(conta('amarelo')),
      total_vermelho:                conta('vermelho'),
      pct_vermelho:                  pct(conta('vermelho')),
      atraso_medio_dias_vermelho:    atrasoMedio != null ? Math.round(atrasoMedio * 100) / 100 : null,
      atraso_maximo_dias_vermelho:   atrasoMax   != null ? Math.round(atrasoMax   * 100) / 100 : null,
    },
    erro: null,
  }
}

// ── Performance de Rotas ────────────────────────────────────────────────────────────────

/**
 * Ranking de rotas da pior para a melhor.
 * Fonte: vw_performance_rotas (migration 0012)
 *
 * @param {object} filtros
 * @param {string} filtros.competencia - YYYY-MM
 * @param {string} filtros.uf          - filtro por UF
 */
export async function buscarPerformanceRotas(filtros = {}) {
  if (filtros.competencia) {
    // Calcula via snapshots diretamente no cliente para filtro de competência
    return buscarPerformanceRotasPorCompetencia(filtros.competencia, filtros.uf)
  }

  let query = supabase
    .from('vw_performance_rotas')
    .select('*')

  if (filtros.uf) query = query.eq('uf_destino', filtros.uf)

  const { data, error } = await query
  if (error) return { dados: null, erro: mensagemAmigavel(error) }
  return { dados: data ?? [], erro: null }
}

async function buscarPerformanceRotasPorCompetencia(competencia, uf) {
  const { data, error } = await supabase
    .from('vw_sla_entregas_com_tolerancia')
    .select('cidade_destino, uf_destino, h_transporte, sla_status, diferenca_horas, prazo_horas_efetivo, tolerancia_percentual')
    .eq('competencia_import', competencia)

  if (error) return { dados: null, erro: mensagemAmigavel(error) }

  // Agregar por rota no cliente
  const agrup = {}
  for (const r of (data ?? [])) {
    if (!r.cidade_destino) continue
    if (uf && r.uf_destino !== uf) continue
    const chave = `${r.cidade_destino}|${r.uf_destino}`
    if (!agrup[chave]) {
      agrup[chave] = { cidade_destino: r.cidade_destino, uf_destino: r.uf_destino,
        prazo_horas_efetivo: r.prazo_horas_efetivo, tolerancia_percentual: r.tolerancia_percentual,
        total: 0, verde: 0, amarelo: 0, vermelho: 0, sem_dados: 0,
        soma_h: 0, max_h: 0, min_h: Infinity, soma_atraso: 0, n_atraso: 0 }
    }
    const g = agrup[chave]
    g.total++
    g[r.sla_status === 'sem_dados' ? 'sem_dados' : r.sla_status]++
    if (r.h_transporte > 0) {
      g.soma_h += r.h_transporte
      g.max_h   = Math.max(g.max_h, r.h_transporte)
      g.min_h   = Math.min(g.min_h, r.h_transporte)
    }
    if (r.sla_status === 'vermelho' && r.diferenca_horas) {
      g.soma_atraso += r.diferenca_horas
      g.n_atraso++
    }
  }

  const pct = (n, d) => d > 0 ? Math.round(n / d * 1000) / 10 : null
  const resultado = Object.values(agrup).map(g => {
    const comSLA = g.total - g.sem_dados
    return {
      cidade_destino:      g.cidade_destino,
      uf_destino:          g.uf_destino,
      prazo_horas_efetivo: g.prazo_horas_efetivo,
      tolerancia_percentual: g.tolerancia_percentual,
      total_entregas:      g.total,
      media_h_transporte:  g.total > 0 ? Math.round(g.soma_h / g.total * 100) / 100 : null,
      maximo_h_transporte: g.max_h || null,
      minimo_h_transporte: g.min_h === Infinity ? null : g.min_h,
      qtd_verde:           g.verde,
      qtd_amarelo:         g.amarelo,
      qtd_vermelho:        g.vermelho,
      qtd_sem_dados:       g.sem_dados,
      pct_verde:           pct(g.verde,    comSLA),
      pct_amarelo:         pct(g.amarelo,  comSLA),
      pct_vermelho:        pct(g.vermelho, comSLA),
      atraso_medio_dias:   g.n_atraso > 0 ? Math.round(g.soma_atraso / g.n_atraso / 24 * 100) / 100 : null,
      classificacao_rota:  pct(g.vermelho, comSLA) > 30 ? 'critica'
                          : pct(g.amarelo + g.vermelho, comSLA) > 40 ? 'atencao'
                          : 'ok',
    }
  })

  resultado.sort((a, b) => (b.pct_vermelho ?? 0) - (a.pct_vermelho ?? 0)
    || (b.media_h_transporte ?? 0) - (a.media_h_transporte ?? 0))

  return { dados: resultado, erro: null }
}

/**
 * Atualiza prazo_rotas com prazo_horas e tolerancia_percentual.
 * Estende salvarPrazoRota existente para os novos campos.
 * (salvarPrazoRota já aceita qualquer campo via spread — esta função
 * é apenas uma conveniência tipada para os novos campos.)
 */
export async function atualizarSLARota(id, { prazoHoras, toleranciaPercentual }) {
  const campos = {}
  if (prazoHoras          != null) campos.prazo_horas            = prazoHoras
  if (toleranciaPercentual != null) campos.tolerancia_percentual  = toleranciaPercentual

  if (Object.keys(campos).length === 0) return { erro: null }

  const { error } = await supabase
    .from('prazo_rotas')
    .update(campos)
    .eq('id', id)

  if (error) return { erro: mensagemAmigavel(error) }
  return { erro: null }
}

/**
 * Move prazo de rota para lixeira e o exclui fisicamente.
 */
export async function excluirPrazoRota(id, nomeUsuario) {
  const { data: snap, error: errSnap } = await supabase
    .from('prazo_rotas').select('*').eq('id', id).single()
  if (errSnap) return { sucesso: false, erro: mensagemAmigavel(errSnap) }

  const descricao = `Prazo de Rota: ${snap.rota ?? ''} — ${snap.uf ?? ''} (${snap.prazo_dias ?? '?'}d)`
  const { erro: errLix } = await moverParaLixeira('prazo_rotas', id, descricao, snap, nomeUsuario)
  if (errLix) return { sucesso: false, erro: errLix }

  const { error } = await supabase.from('prazo_rotas').delete().eq('id', id)
  if (error) return { sucesso: false, erro: mensagemAmigavel(error) }
  return { sucesso: true, erro: null }
}

// ─────────────────────────────────────────────────────────────────────────────
// IMPORTAÇÃO EM MASSA — PRAZO DE ROTAS
// ─────────────────────────────────────────────────────────────────────────────
function normalizarParaComparacao(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Importa prazos de rota em massa a partir de linhas parseadas de planilha.
 * Cada linha deve ter: rota, prazo_dias. Opcionais: uf, codigo_rota, distancia_km, prazo_horas, tolerancia_percentual.
 * Detecta rotas existentes por nome normalizado, atualiza via SCD Tipo 2, insere novas.
 * Retorna: { inseridos, atualizados, iguais, erros, total }
 */
export async function importarPrazosEmMassa(linhas) {
  const { dados: vigentes, erro: errV } = await buscarPrazosRotas(true)
  if (errV) return { inseridos: 0, atualizados: 0, iguais: 0, erros: [errV], total: 0 }

  const mapVigentes = {}
  for (const v of vigentes) {
    const chave = normalizarParaComparacao(v.rota) + '|' + (v.uf || '').toUpperCase().trim()
    mapVigentes[chave] = v
  }

  let inseridos = 0, atualizados = 0, iguais = 0
  const erros = []

  for (const linha of linhas) {
    const rota = String(linha.rota || linha.Rota || '').trim()
    if (!rota) continue

    const uf           = String(linha.uf || linha.UF || '').toUpperCase().trim()
    const prazo_dias   = parseInt(linha.prazo_dias || linha['Prazo (dias)'] || linha.prazo || linha.Prazo || 0)
    const prazo_horas  = linha.prazo_horas != null ? parseFloat(linha.prazo_horas) : null
    const codigo_rota  = String(linha.codigo_rota || linha.codigo || '').trim() || null
    const distancia_km = linha.distancia_km != null ? parseFloat(linha.distancia_km) : null
    const tolerancia   = linha.tolerancia_percentual != null ? parseFloat(linha.tolerancia_percentual) : 20

    if (!prazo_dias || prazo_dias <= 0) {
      erros.push(`Prazo inválido para "${rota}"`)
      continue
    }

    const chave     = normalizarParaComparacao(rota) + '|' + uf
    const existente = mapVigentes[chave]

    const campos = { rota, uf: uf || null, codigo_rota, distancia_km, prazo_dias, prazo_horas, tolerancia_percentual: tolerancia, ativo: true }

    if (!existente) {
      const { erro } = await salvarPrazoRota(campos)
      if (erro) erros.push(`Erro ao inserir "${rota}": ${erro}`)
      else inseridos++
    } else {
      const semMudanca =
        existente.prazo_dias === prazo_dias &&
        (existente.prazo_horas ?? null) === prazo_horas &&
        (existente.codigo_rota ?? null) === codigo_rota &&
        (existente.distancia_km ?? null) === distancia_km &&
        (existente.tolerancia_percentual ?? 20) === tolerancia
      if (semMudanca) {
        iguais++
      } else {
        const { erro } = await salvarPrazoRota({ ...campos, id: existente.id })
        if (erro) erros.push(`Erro ao atualizar "${rota}": ${erro}`)
        else atualizados++
      }
    }
  }

  return { inseridos, atualizados, iguais, erros, total: linhas.length }
}
