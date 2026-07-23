/**
 * alertasService.js — Etapa 9.4
 *
 * Central de Alertas Operacionais.
 * Geração automática por regras (sem IA).
 * Sem localStorage. Sem console.log. Sem dados fictícios.
 *
 * REGRAS AUTOMÁTICAS IMPLEMENTADAS:
 *   1. SLA_ATRASADO         → vw_sla_entregas_com_tolerancia WHERE sla_status='vermelho'
 *   2. TRANSPORTE_ACIMA_PRAZO → vw_tempos_etapas WHERE h_transporte > limiar_horas
 *   3. SEPARACAO_ACIMA_PRAZO  → vw_tempos_etapas WHERE h_separacao > limiar_horas
 *   4. CONFERENCIA_ACIMA_PRAZO → vw_tempos_etapas WHERE h_conferencia > limiar_horas
 *   5. DIVERGENCIA           → vw_pedidos_consolidados WHERE divergencia_nf = true
 *   6. COMUNICADO_PENDENTE   → comunicados_operacionais WHERE resolvido = false
 */

import { supabase } from './supabaseClient'
import { moverParaLixeira } from './lixeiraService'
import { buscarPendenciasParaAlertas } from './pendenciasService'

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────────────────────────────────────
export const TIPOS_ALERTA = [
  { value: 'SLA_ATRASADO',             label: 'SLA Atrasado'              },
  { value: 'TRANSPORTE_ACIMA_PRAZO',   label: 'Transporte Acima do Prazo' },
  { value: 'SEPARACAO_ACIMA_PRAZO',    label: 'Separação Acima do Prazo'  },
  { value: 'CONFERENCIA_ACIMA_PRAZO',  label: 'Conferência Acima do Prazo'},
  { value: 'DIVERGENCIA',              label: 'Divergência de NF'         },
  { value: 'COMUNICADO_PENDENTE',      label: 'Comunicado Pendente'       },
  { value: 'OUTRO',                    label: 'Outro'                     },
]

export const SEVERIDADES = [
  { value: 'BAIXA',   label: 'Baixa',    cor: '#16A34A' },
  { value: 'MEDIA',   label: 'Média',    cor: '#D97706' },
  { value: 'ALTA',    label: 'Alta',     cor: '#EA580C' },
  { value: 'CRITICA', label: 'Crítica',  cor: '#DC2626' },
]

// Limiares de alerta por etapa (em horas)
// Baseados nos dados reais analisados (ROTINA8072.xls):
//   Separação: média 4h 35min → alertar acima de 8h
//   Conferência: média 3h 41min → alertar acima de 6h
//   Transporte: média 2d 2h → alertar acima de 72h
const LIMIAR_SEPARACAO_H   = 8    // acima de 8h → ALTA
const LIMIAR_CONFERENCIA_H = 6    // acima de 6h → ALTA
const LIMIAR_TRANSPORTE_H  = 72   // acima de 72h → ALTA (3 dias)

export function labelTipo(tipo) {
  return TIPOS_ALERTA.find(t => t.value === tipo)?.label ?? tipo ?? '—'
}

export function corSeveridade(sev) {
  return SEVERIDADES.find(s => s.value === sev)?.cor ?? '#888888'
}

function mensagemAmigavel(error) {
  const msg = (error?.message || '').toLowerCase()
  if (msg.includes('network'))  return 'Erro de conexão.'
  if (msg.includes('permission') || msg.includes('rls')) return 'Sem permissão.'
  return error?.message || 'Erro inesperado.'
}

// ─────────────────────────────────────────────────────────────────────────────
// KPIs DO TOPO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Indicadores consolidados para o painel de KPIs.
 * Consulta diretamente a tabela alertas_operacionais.
 */
export async function buscarKpisAlertas() {
  const { data, error } = await supabase
    .from('alertas_operacionais')
    .select('severidade, resolvido, tipo')

  if (error) return { dados: null, erro: mensagemAmigavel(error) }

  const todos = data ?? []
  return {
    dados: {
      criticos_abertos: todos.filter(a => a.severidade === 'CRITICA' && !a.resolvido).length,
      total_abertos:    todos.filter(a => !a.resolvido).length,
      total_resolvidos: todos.filter(a => a.resolvido).length,
      sla_atrasados:    todos.filter(a => a.tipo === 'SLA_ATRASADO' && !a.resolvido).length,
    },
    erro: null,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LISTAGEM COM FILTROS
// ─────────────────────────────────────────────────────────────────────────────

export async function buscarAlertas({
  tipo,
  severidade,
  motorista,
  rota,
  resolvido,
  pagina    = 1,
  porPagina = 50,
} = {}) {
  let query = supabase
    .from('alertas_operacionais')
    .select('*', { count: 'exact' })

  if (tipo)      query = query.eq('tipo', tipo)
  if (severidade) query = query.eq('severidade', severidade)
  if (motorista) query = query.ilike('motorista', `%${motorista}%`)
  if (rota)      query = query.ilike('rota', `%${rota}%`)
  if (resolvido !== null && resolvido !== undefined)
    query = query.eq('resolvido', resolvido)

  const inicio = (pagina - 1) * porPagina
  const { data, error, count } = await query
    .order('resolvido',  { ascending: true })           // abertos primeiro
    .order('severidade', { ascending: false })           // CRITICA primeiro
    .order('criado_em',  { ascending: false })
    .range(inicio, inicio + porPagina - 1)

  if (error) return { dados: [], total: 0, erro: mensagemAmigavel(error) }
  return { dados: data ?? [], total: count ?? 0, erro: null }
}

// ─────────────────────────────────────────────────────────────────────────────
// RESOLVER ALERTA
// ─────────────────────────────────────────────────────────────────────────────

export async function resolverAlerta(id, nomeUsuario) {
  const { error } = await supabase
    .from('alertas_operacionais')
    .update({
      resolvido:    true,
      resolvido_em: new Date().toISOString(),
      resolvido_por: nomeUsuario || null,
    })
    .eq('id', id)

  if (error) return { erro: mensagemAmigavel(error) }
  return { erro: null }
}

// ─────────────────────────────────────────────────────────────────────────────
// GERAÇÃO AUTOMÁTICA DE ALERTAS
// Regras baseadas em dados reais — sem IA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Insere um lote de alertas na tabela.
 * Usa INSERT sem ON CONFLICT — cada execução gera novos alertas.
 * O volume é controlado pelo caller (não regera para o mesmo numped se já aberto).
 */
async function inserirAlertas(alertas) {
  if (alertas.length === 0) return { inseridos: 0, erro: null }

  const LOTE = 100
  let inseridos = 0
  const erros = []

  for (let i = 0; i < alertas.length; i += LOTE) {
    const { error, count } = await supabase
      .from('alertas_operacionais')
      .insert(alertas.slice(i, i + LOTE), { count: 'exact' })
    if (error) erros.push(mensagemAmigavel(error))
    else inseridos += count ?? alertas.slice(i, i + LOTE).length
  }

  return { inseridos, erro: erros.length > 0 ? erros[0] : null }
}

/**
 * Carrega os NUMPEDs que já têm alerta aberto do tipo informado,
 * para evitar duplicatas a cada execução.
 */
async function numpedComAlertaAberto(tipo) {
  const { data } = await supabase
    .from('alertas_operacionais')
    .select('numped')
    .eq('tipo', tipo)
    .eq('resolvido', false)
    .not('numped', 'is', null)
  return new Set((data ?? []).map(r => r.numped))
}

// ── Regra 1: SLA Atrasado ────────────────────────────────────────────────────
/**
 * Identifica entregas com sla_status='vermelho' em vw_sla_entregas_com_tolerancia.
 * Severidade: CRITICA (acima de 2× o prazo) | ALTA (acima do limite).
 */
export async function gerarAlertasSLA() {
  const jaAbertos = await numpedComAlertaAberto('SLA_ATRASADO')

  const { data, error } = await supabase
    .from('vw_sla_entregas_com_tolerancia')
    .select('numped, motorista, cidade_destino, h_transporte, prazo_horas_efetivo, diferenca_horas, limite_com_tolerancia')
    .eq('sla_status', 'vermelho')
    .not('numped', 'is', null)

  if (error) return { inseridos: 0, erro: mensagemAmigavel(error) }

  const novos = (data ?? [])
    .filter(r => !jaAbertos.has(r.numped))
    .map(r => {
      const diasAtraso = ((r.diferenca_horas ?? 0) / 24).toFixed(1)
      const dobro      = (r.prazo_horas_efetivo ?? 0) * 2
      return {
        tipo:                'SLA_ATRASADO',
        severidade:          (r.h_transporte > dobro) ? 'CRITICA' : 'ALTA',
        numped:              r.numped,
        motorista:           r.motorista || null,
        rota:                r.cidade_destino || null,
        descricao:           `Pedido ${r.numped} com ${diasAtraso}d de atraso no SLA. ` +
                             `Tempo em transporte: ${(r.h_transporte / 24).toFixed(1)}d. ` +
                             `Prazo: ${((r.prazo_horas_efetivo ?? 0) / 24).toFixed(1)}d. ` +
                             `Limite: ${((r.limite_com_tolerancia ?? 0) / 24).toFixed(1)}d.`,
        valor_encontrado:    Math.round((r.h_transporte ?? 0) * 100) / 100,
        limiar_configurado:  Math.round((r.limite_com_tolerancia ?? 0) * 100) / 100,
        criado_por:          'sistema',
      }
    })

  return inserirAlertas(novos)
}

// ── Regra 2: Transporte acima do prazo ────────────────────────────────────────
/**
 * Identifica pedidos com tempo de transporte > LIMIAR_TRANSPORTE_H
 * a partir de vw_tempos_etapas.
 */
export async function gerarAlertasTransporte() {
  const jaAbertos = await numpedComAlertaAberto('TRANSPORTE_ACIMA_PRAZO')

  const { data, error } = await supabase
    .from('vw_tempos_etapas')
    .select('numped, motorista, cidade_destino, h_transporte')
    .gt('h_transporte', LIMIAR_TRANSPORTE_H)
    .not('numped', 'is', null)

  if (error) return { inseridos: 0, erro: mensagemAmigavel(error) }

  const novos = (data ?? [])
    .filter(r => !jaAbertos.has(r.numped))
    .map(r => ({
      tipo:               'TRANSPORTE_ACIMA_PRAZO',
      severidade:         r.h_transporte > LIMIAR_TRANSPORTE_H * 2 ? 'CRITICA' : 'ALTA',
      numped:             r.numped,
      motorista:          r.motorista || null,
      rota:               r.cidade_destino || null,
      descricao:          `Pedido ${r.numped} com ${(r.h_transporte / 24).toFixed(1)}d em transporte ` +
                          `(limiar: ${LIMIAR_TRANSPORTE_H / 24}d).`,
      valor_encontrado:   Math.round(r.h_transporte * 100) / 100,
      limiar_configurado: LIMIAR_TRANSPORTE_H,
      criado_por:         'sistema',
    }))

  return inserirAlertas(novos)
}

// ── Regra 3: Separação acima do limiar ───────────────────────────────────────
export async function gerarAlertasSeparacao() {
  const jaAbertos = await numpedComAlertaAberto('SEPARACAO_ACIMA_PRAZO')

  const { data, error } = await supabase
    .from('vw_tempos_etapas')
    .select('numped, motorista, h_separacao')
    .gt('h_separacao', LIMIAR_SEPARACAO_H)
    .not('numped', 'is', null)

  if (error) return { inseridos: 0, erro: mensagemAmigavel(error) }

  const novos = (data ?? [])
    .filter(r => !jaAbertos.has(r.numped))
    .map(r => ({
      tipo:               'SEPARACAO_ACIMA_PRAZO',
      severidade:         r.h_separacao > LIMIAR_SEPARACAO_H * 3 ? 'ALTA' : 'MEDIA',
      numped:             r.numped,
      motorista:          r.motorista || null,
      rota:               null,
      descricao:          `Pedido ${r.numped} com ${r.h_separacao.toFixed(1)}h em separação ` +
                          `(limiar: ${LIMIAR_SEPARACAO_H}h).`,
      valor_encontrado:   Math.round(r.h_separacao * 100) / 100,
      limiar_configurado: LIMIAR_SEPARACAO_H,
      criado_por:         'sistema',
    }))

  return inserirAlertas(novos)
}

// ── Regra 4: Conferência acima do limiar ─────────────────────────────────────
export async function gerarAlertasConferencia() {
  const jaAbertos = await numpedComAlertaAberto('CONFERENCIA_ACIMA_PRAZO')

  const { data, error } = await supabase
    .from('vw_tempos_etapas')
    .select('numped, motorista, h_conferencia')
    .gt('h_conferencia', LIMIAR_CONFERENCIA_H)
    .not('numped', 'is', null)

  if (error) return { inseridos: 0, erro: mensagemAmigavel(error) }

  const novos = (data ?? [])
    .filter(r => !jaAbertos.has(r.numped))
    .map(r => ({
      tipo:               'CONFERENCIA_ACIMA_PRAZO',
      severidade:         r.h_conferencia > LIMIAR_CONFERENCIA_H * 3 ? 'ALTA' : 'MEDIA',
      numped:             r.numped,
      motorista:          r.motorista || null,
      rota:               null,
      descricao:          `Pedido ${r.numped} com ${r.h_conferencia.toFixed(1)}h em conferência ` +
                          `(limiar: ${LIMIAR_CONFERENCIA_H}h).`,
      valor_encontrado:   Math.round(r.h_conferencia * 100) / 100,
      limiar_configurado: LIMIAR_CONFERENCIA_H,
      criado_por:         'sistema',
    }))

  return inserirAlertas(novos)
}

// ── Regra 5: Divergência de NF ───────────────────────────────────────────────
export async function gerarAlertasDivergencia() {
  const jaAbertos = await numpedComAlertaAberto('DIVERGENCIA')

  const { data, error } = await supabase
    .from('vw_pedidos_consolidados')
    .select('numped, numnota, numnot_comprovei')
    .eq('divergencia_nf', true)
    .not('numped', 'is', null)

  if (error) return { inseridos: 0, erro: mensagemAmigavel(error) }

  const novos = (data ?? [])
    .filter(r => !jaAbertos.has(r.numped))
    .map(r => ({
      tipo:               'DIVERGENCIA',
      severidade:         'ALTA',
      numped:             r.numped,
      motorista:          null,
      rota:               null,
      descricao:          `Divergência de NF no pedido ${r.numped}. ` +
                          `ROTINA: ${r.numnota ?? '?'} · COMPROVEI: ${r.numnot_comprovei ?? '?'}.`,
      valor_encontrado:   null,
      limiar_configurado: null,
      criado_por:         'sistema',
    }))

  return inserirAlertas(novos)
}

// ── Regra 6: Comunicados pendentes ───────────────────────────────────────────
/**
 * Comunicados operacionais com resolvido=false há mais de 24h.
 */
export async function gerarAlertasComunicadosPendentes() {
  const ontemISO = new Date(Date.now() - 24 * 3600 * 1000).toISOString()

  // Verificar quais comunicados_ids já têm alerta aberto
  const { data: jaAbertosData } = await supabase
    .from('alertas_operacionais')
    .select('descricao')
    .eq('tipo', 'COMUNICADO_PENDENTE')
    .eq('resolvido', false)
  const descAbertos = new Set((jaAbertosData ?? []).map(r => r.descricao))

  const { data, error } = await supabase
    .from('comunicados_operacionais')
    .select('id, motorista, rota, tipo, descricao, data_operacao')
    .eq('resolvido', false)
    .lt('criado_em', ontemISO)  // pendente há mais de 24h

  if (error) return { inseridos: 0, erro: mensagemAmigavel(error) }

  const novos = (data ?? [])
    .filter(c => {
      const descAlerta = `Comunicado pendente há mais de 24h: [${c.tipo}] ${c.descricao.slice(0, 80)}`
      return !descAbertos.has(descAlerta)
    })
    .map(c => ({
      tipo:               'COMUNICADO_PENDENTE',
      severidade:         c.tipo === 'PENDENCIA' ? 'ALTA' : 'MEDIA',
      numped:             null,
      motorista:          c.motorista || null,
      rota:               c.rota || null,
      descricao:          `Comunicado pendente há mais de 24h: [${c.tipo}] ${c.descricao.slice(0, 80)}`,
      valor_encontrado:   null,
      limiar_configurado: null,
      criado_por:         'sistema',
    }))

  return inserirAlertas(novos)
}

// ─────────────────────────────────────────────────────────────────────────────
// ORQUESTRADOR: executa todas as regras em paralelo
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Executa todas as regras automáticas de geração de alertas.
 * Chamado pelo botão "Verificar Agora" na página AlertasOperacionais.
 *
 * @returns {{ resultados: object, erros: string[] }}
 */
/**
 * Executa todas as regras automáticas de geração de alertas.
 * Inclui a regra 7: pendências detectadas pelo monitoramento COMPROVEI.
 */
export async function gerarTodosOsAlertas() {
  const [sla, transp, sep, conf, div, com, pendResult] = await Promise.all([
    gerarAlertasSLA(),
    gerarAlertasTransporte(),
    gerarAlertasSeparacao(),
    gerarAlertasConferencia(),
    gerarAlertasDivergencia(),
    gerarAlertasComunicadosPendentes(),
    buscarPendenciasParaAlertas(),
  ])

  // Converter pendências COMPROVEI em alertas operacionais
  let comproveiInseridos = 0
  if (!pendResult.erro && pendResult.dados.length > 0) {
    // Inserção direta via supabase (sem helper interno)
    const alertasComp = pendResult.dados.map(p => ({
      tipo:        p.tipo === 'OPERACAO_SEM_COMPROVEI' ? 'DIVERGENCIA' : 'OUTRO',
      severidade:  p.severidade,
      motorista:   p.motorista || null,
      rota:        p.rota || null,
      descricao:   p.descricao,
      criado_por:  'sistema-comprovei',
    }))
    // Verificar duplicatas antes de inserir
    for (const a of alertasComp) {
      const { data: exist } = await supabase
        .from('alertas_operacionais')
        .select('id')
        .eq('tipo', a.tipo)
        .eq('resolvido', false)
        .ilike('descricao', `%${(a.motorista || '').slice(0, 20)}%`)
        .limit(1)
      if (!exist || exist.length === 0) {
        await supabase.from('alertas_operacionais').insert([a])
        comproveiInseridos++
      }
    }
  }

  const erros = [sla, transp, sep, conf, div, com]
    .map(r => r.erro)
    .filter(Boolean)

  return {
    resultados: {
      sla_atrasado:            sla.inseridos,
      transporte_acima_prazo:  transp.inseridos,
      separacao_acima_prazo:   sep.inseridos,
      conferencia_acima_prazo: conf.inseridos,
      divergencia:             div.inseridos,
      comunicado_pendente:     com.inseridos,
      comprovei_pendencia:     comproveiInseridos,
      total:                   sla.inseridos + transp.inseridos + sep.inseridos +
                               conf.inseridos + div.inseridos + com.inseridos + comproveiInseridos,
    },
    erros,
  }
}

/**
 * Move alerta para lixeira e o exclui fisicamente.
 */
export async function excluirAlerta(id, nomeUsuario) {
  const { data: snap, error: errSnap } = await supabase
    .from('alertas_operacionais').select('*').eq('id', id).single()
  if (errSnap) return { sucesso: false, erro: errSnap.message }

  const descricao = `Alerta: ${snap.tipo ?? ''} — ${snap.descricao?.slice(0, 60) ?? ''}`
  const { erro: errLix } = await moverParaLixeira('alertas_operacionais', id, descricao, snap, nomeUsuario)
  if (errLix) return { sucesso: false, erro: errLix }

  const { error } = await supabase.from('alertas_operacionais').delete().eq('id', id)
  if (error) return { sucesso: false, erro: error.message }
  return { sucesso: true, erro: null }
}
