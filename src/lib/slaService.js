/**
 * slaService.js — Service centralizado de SLA.
 * Prioridade 1: prazo da rota (prazo_rotas)
 * Prioridade 2: meta da categoria (metas_lead_time) como fallback
 */
import { supabase } from './supabaseClient'

export const SLA_SITUACAO = { VERDE:'verde', AMARELO:'amarelo', VERMELHO:'vermelho', SEM_PRAZO:'sem_prazo' }
export const SLA_FONTE    = { ROTA:'rota', CATEGORIA:'categoria', SEM_PRAZO:'sem_prazo' }

export const SLA_COR = {
  verde:'var(--green)', amarelo:'var(--amber,#b45309)',
  vermelho:'var(--red)', sem_prazo:'var(--text3)',
}
export const SLA_BG = {
  verde:'var(--green-bg)', amarelo:'var(--amber-bg,#fff7e6)',
  vermelho:'var(--red-bg)', sem_prazo:'var(--bg3)',
}
export const SLA_LABEL = {
  verde:'Dentro do prazo', amarelo:'Na tolerância',
  vermelho:'Fora do prazo', sem_prazo:'Sem prazo',
}

function msg(e) {
  if (!e) return 'Erro desconhecido.'
  if ((e.message||'').toLowerCase().includes('network')) return 'Erro de conexão.'
  return e.message || 'Consulta falhou.'
}

export async function buscarMapaPrazosPorRota() {
  const { data, error } = await supabase
    .from('prazo_rotas')
    .select('rota, prazo_horas, prazo_dias')
    .eq('ativo', true)
    .is('vigente_ate', null)
  if (error) return { dados: {}, erro: msg(error) }
  const mapa = {}
  for (const p of data ?? []) {
    const chave = (p.rota||'').toUpperCase().trim()
    const horas = p.prazo_horas ?? (p.prazo_dias ? p.prazo_dias * 24 : null)
    if (chave && horas != null) mapa[chave] = horas * 60
  }
  return { dados: mapa, erro: null }
}

export function calcularSituacaoSLA(operacao, prazosPorRota = {}, metasPorTipo = {}) {
  const leadTimeMin = operacao.lead_time_min
  const rota        = (operacao.rota||'').toUpperCase().trim()
  const tipo        = operacao.tipo_operacao

  let prazoMin   = prazosPorRota[rota] ?? null
  let fontePrazo = prazoMin != null ? SLA_FONTE.ROTA : null

  if (prazoMin == null) {
    prazoMin   = metasPorTipo[tipo] ?? null
    fontePrazo = prazoMin != null ? SLA_FONTE.CATEGORIA : SLA_FONTE.SEM_PRAZO
  }

  if (leadTimeMin == null || prazoMin == null) {
    return { situacao: SLA_SITUACAO.SEM_PRAZO, prazoMin, fontePrazo: fontePrazo??SLA_FONTE.SEM_PRAZO, leadTimeMin, diferencaMin: null, eficienciaPct: null }
  }

  const diferencaMin  = leadTimeMin - prazoMin
  const eficienciaPct = Math.round((leadTimeMin/prazoMin)*100*10)/10
  const situacao = leadTimeMin <= prazoMin ? SLA_SITUACAO.VERDE
                 : leadTimeMin <= prazoMin*1.1 ? SLA_SITUACAO.AMARELO
                 : SLA_SITUACAO.VERMELHO
  return { situacao, prazoMin, fontePrazo, leadTimeMin, diferencaMin, eficienciaPct }
}

export async function buscarEficienciaRotas({ rota='', limite=200 } = {}) {
  let q = supabase.from('vw_lead_time_por_rota').select('*').limit(limite)
  if (rota) q = q.ilike('rota', `%${rota}%`)
  const { data, error } = await q
  if (error) return { dados: [], erro: msg(error) }
  return { dados: data??[], erro: null }
}

export function calcularKpisEficienciaRotas(dados) {
  if (!dados.length) return { totalRotas:0, comPrazo:0, verde:0, amarelo:0, vermelho:0, semPrazo:0, melhorEficiencia:null, piorEficiencia:null }
  const comPrazo = dados.filter(r => r.prazo_efetivo_min != null)
  const verde    = dados.filter(r => r.situacao==='verde').length
  const amarelo  = dados.filter(r => r.situacao==='amarelo').length
  const vermelho = dados.filter(r => r.situacao==='vermelho').length
  const semPrazo = dados.filter(r => r.situacao==='sem_prazo').length
  const efics    = comPrazo.map(r => r.eficiencia_pct).filter(e => e!=null)
  return { totalRotas:dados.length, comPrazo:comPrazo.length, verde, amarelo, vermelho, semPrazo,
           melhorEficiencia:efics.length?Math.min(...efics):null, piorEficiencia:efics.length?Math.max(...efics):null }
}
