/**
 * pendenciasService.js
 *
 * Monitoramento cruzado entre:
 *   - comprovei_status_motorista (último status por motorista — migration 0017)
 *   - operacoes (Operação do Dia)
 *
 * Cada importação de arquivo COMPROVEI atualiza comprovei_status_motorista
 * automaticamente via atualizarStatusMotoristasComprovei() no funilService.
 * Este service lê esse estado consolidado e detecta 6 tipos de pendência.
 *
 * Sem localStorage. Sem console.log. Sem dados fictícios.
 */

import { supabase } from './supabaseClient'

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────

/** Motoristas sem atualização há mais de X horas são sinalizados */
export const LIMIAR_HORAS_SEM_ATUALIZACAO = 4

/** Últimas importações listadas no painel */
const MAX_ULTIMAS_IMPORTACOES = 10

function mensagemAmigavel(error) {
  const msg = (error?.message || '').toLowerCase()
  if (msg.includes('network')) return 'Erro de conexão. Verifique sua internet.'
  if (msg.includes('permission')) return 'Sem permissão para acessar estes dados.'
  return error?.message || 'Erro inesperado.'
}

function hoje() {
  return new Date().toISOString().slice(0, 10)
}

function normalizar(str) {
  return (str || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .trim()
}

// ─────────────────────────────────────────────────────────────────────────────
// BUSCA BASE
// ─────────────────────────────────────────────────────────────────────────────

async function buscarStatusComprovei() {
  const { data, error } = await supabase
    .from('comprovei_status_motorista')
    .select('*')
    .order('importado_em', { ascending: false })
  if (error) return { dados: null, erro: mensagemAmigavel(error) }
  return { dados: data ?? [], erro: null }
}

async function buscarOperacoesHoje(data = hoje()) {
  const { data: rows, error } = await supabase
    .from('operacoes')
    .select('id, nome_motorista, codigo_motorista, rota, tipo_operacao, status, updated_at')
    .eq('data_operacao', data)
    .eq('ativa', true)
  if (error) return { dados: null, erro: mensagemAmigavel(error) }
  return { dados: rows ?? [], erro: null }
}

// ─────────────────────────────────────────────────────────────────────────────
// ÚLTIMA IMPORTAÇÃO
// ─────────────────────────────────────────────────────────────────────────────

export async function buscarUltimaImportacaoComprovei() {
  const { data, error } = await supabase
    .from('comprovei_status_motorista')
    .select('importado_em, importacao_id')
    .order('importado_em', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) return { dados: null, erro: mensagemAmigavel(error) }
  return { dados: data, erro: null }
}

export async function buscarHistoricoImportacoesComprovei() {
  const { data, error } = await supabase
    .from('historico_importacoes')
    .select('id, nome_arquivo, created_at, total_registros, registros_validos, status')
    .eq('origem', 'comprovei')
    .order('created_at', { ascending: false })
    .limit(MAX_ULTIMAS_IMPORTACOES)
  if (error) return { dados: [], erro: mensagemAmigavel(error) }
  return { dados: data ?? [], erro: null }
}

// ─────────────────────────────────────────────────────────────────────────────
// STATUS POR MOTORISTA (para a tabela principal)
// ─────────────────────────────────────────────────────────────────────────────

export async function buscarStatusPorMotorista() {
  const { data, error } = await supabase
    .from('comprovei_status_motorista')
    .select('*')
    .order('nome_motorista', { ascending: true })
  if (error) return { dados: [], erro: mensagemAmigavel(error) }
  return { dados: data ?? [], erro: null }
}

// ─────────────────────────────────────────────────────────────────────────────
// DETECÇÃO DE PENDÊNCIAS — 6 regras
// ─────────────────────────────────────────────────────────────────────────────

export async function detectarPendencias(data) {
  const dataRef = data || hoje()

  const [resComp, resOps] = await Promise.all([
    buscarStatusComprovei(),
    buscarOperacoesHoje(dataRef),
  ])

  if (resComp.erro) return { dados: null, erro: resComp.erro }
  if (resOps.erro)  return { dados: null, erro: resOps.erro }

  const statusComp = resComp.dados   // comprovei_status_motorista
  const ops        = resOps.dados    // operacoes hoje

  const agora = Date.now()

  // Normalizar para cruzamento por nome
  const nomeParaComp = new Map()
  for (const c of statusComp) {
    nomeParaComp.set(normalizar(c.nome_motorista), c)
  }
  const nomeParaOp = new Map()
  for (const o of ops) {
    nomeParaOp.set(normalizar(o.nome_motorista), o)
  }

  const pendencias = []

  // ── Regra 1: Sem atualização há X horas ─────────────────────────────────────────
  for (const c of statusComp) {
    if (!c.ultima_atualizacao && !c.importado_em) continue
    const ref = c.ultima_atualizacao || c.importado_em
    const horas = (agora - new Date(ref).getTime()) / 3_600_000
    if (horas > LIMIAR_HORAS_SEM_ATUALIZACAO) {
      pendencias.push({
        tipo:       'SEM_ATUALIZACAO',
        severidade: horas > 8 ? 'ALTA' : 'MEDIA',
        motorista:  c.nome_motorista,
        cpf:        c.cpf_motorista,
        rota:       c.rota_atual,
        descricao:  `${c.nome_motorista} sem atualização há ${Math.floor(horas)}h ${Math.floor((horas % 1) * 60)}min.`,
        horas:      Math.round(horas * 10) / 10,
        detalhe:    c,
      })
    }
  }

  // ── Regra 2: COMPROVEI sem Operação do Dia ───────────────────────────────────────────────
  for (const c of statusComp) {
    const n = normalizar(c.nome_motorista)
    if (!nomeParaOp.has(n)) {
      pendencias.push({
        tipo:       'COMPROVEI_SEM_OPERACAO',
        severidade: 'MEDIA',
        motorista:  c.nome_motorista,
        cpf:        c.cpf_motorista,
        rota:       c.rota_atual,
        descricao:  `${c.nome_motorista} aparece no COMPROVEI (${c.qtd_pedidos_hoje} pedidos) mas sem operação registrada hoje.`,
        detalhe:    c,
      })
    }
  }

  // ── Regra 3: Operação do Dia sem COMPROVEI ────────────────────────────────────────────
  for (const o of ops) {
    const n = normalizar(o.nome_motorista)
    if (!nomeParaComp.has(n) && !['Pendente', 'Concluído', 'Entrega finalizada'].includes(o.status)) {
      pendencias.push({
        tipo:       'OPERACAO_SEM_COMPROVEI',
        severidade: 'ALTA',
        motorista:  o.nome_motorista,
        cpf:        null,
        rota:       o.rota,
        descricao:  `${o.nome_motorista} tem operação ativa (${o.status}) mas não consta no COMPROVEI.`,
        detalhe:    o,
      })
    }
  }

  // ── Regra 4: Divergência de rota ─────────────────────────────────────────────────
  for (const o of ops) {
    const n = normalizar(o.nome_motorista)
    const c = nomeParaComp.get(n)
    if (!c || !o.rota || !c.rota_atual) continue
    const rotaOp   = normalizar(o.rota)
    const rotaComp = normalizar(c.rota_atual)
    // Divergência real: nenhuma contém a outra
    if (rotaOp && rotaComp && !rotaOp.includes(rotaComp) && !rotaComp.includes(rotaOp)) {
      pendencias.push({
        tipo:       'DIVERGENCIA_ROTA',
        severidade: 'ALTA',
        motorista:  o.nome_motorista,
        cpf:        c.cpf_motorista,
        rota:       o.rota,
        descricao:  `${o.nome_motorista}: Op.Dia="${o.rota}" · COMPROVEI="${c.rota_atual}".`,
        detalhe:    { op: o, comp: c },
      })
    }
  }

  // ── Regra 5: Divergência de status (Op concluída ≠ COMPROVEI) ──────────────────────────
  for (const o of ops) {
    const n = normalizar(o.nome_motorista)
    const c = nomeParaComp.get(n)
    if (!c) continue
    const opFinalizado   = ['Concluído', 'Entrega finalizada'].includes(o.status)
    const compPendente   = (c.qtd_em_rota ?? 0) > 0
    if (opFinalizado && compPendente) {
      pendencias.push({
        tipo:       'STATUS_INCOERENTE',
        severidade: 'MEDIA',
        motorista:  o.nome_motorista,
        cpf:        c.cpf_motorista,
        rota:       o.rota,
        descricao:  `Operação "${o.status}" mas ${c.qtd_em_rota} pedido(s) ainda em rota no COMPROVEI.`,
        detalhe:    { op: o, comp: c },
      })
    }
  }

  // ── Regra 6: COMPROVEI tem pedidos mas status desconhecido ────────────────────────────────
  for (const c of statusComp) {
    if (!c.status_entrega || c.status_entrega.trim() === '') {
      pendencias.push({
        tipo:       'STATUS_DESCONHECIDO',
        severidade: 'BAIXA',
        motorista:  c.nome_motorista,
        cpf:        c.cpf_motorista,
        rota:       c.rota_atual,
        descricao:  `${c.nome_motorista} com ${c.qtd_em_rota ?? 0} pedido(s) sem status definido no COMPROVEI.`,
        detalhe:    c,
      })
    }
  }

  // Ordenar: ALTA → MEDIA → BAIXA, depois por motorista
  const ORD = { ALTA: 0, MEDIA: 1, BAIXA: 2 }
  pendencias.sort((a, b) => (ORD[a.severidade] ?? 9) - (ORD[b.severidade] ?? 9))

  return {
    dados: {
      pendencias,
      kpis: {
        total:            pendencias.length,
        criticas:         pendencias.filter(p => p.severidade === 'ALTA').length,
        semAtualizacao:   pendencias.filter(p => p.tipo === 'SEM_ATUALIZACAO').length,
        comproveiSemOp:   pendencias.filter(p => p.tipo === 'COMPROVEI_SEM_OPERACAO').length,
        opSemComprovei:   pendencias.filter(p => p.tipo === 'OPERACAO_SEM_COMPROVEI').length,
        divRota:          pendencias.filter(p => p.tipo === 'DIVERGENCIA_ROTA').length,
        statusIncoerente: pendencias.filter(p => p.tipo === 'STATUS_INCOERENTE').length,
        statusDesconhecido: pendencias.filter(p => p.tipo === 'STATUS_DESCONHECIDO').length,
      },
      totalMotoristasComp: statusComp.length,
      totalOpsHoje:        ops.length,
    },
    erro: null,
  }
}

export async function buscarPendenciasParaAlertas() {
  const { dados, erro } = await detectarPendencias()
  if (erro || !dados) return { dados: [], erro }
  return {
    dados: dados.pendencias.filter(p => p.severidade === 'ALTA'),
    erro: null,
  }
}
