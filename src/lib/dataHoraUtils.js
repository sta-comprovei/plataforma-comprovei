/**
 * Utilitários de formatação de data/hora e cálculo de percentual no
 * frontend. O cálculo definitivo (fonte da verdade) do percentual
 * acontece no banco via coluna gerada `percentual_conclusao` — esta
 * camada existe apenas para feedback visual imediato ("tempo real")
 * antes de salvar.
 */

export function calcularPercentual(previstas, realizadas) {
  const p = Number(previstas) || 0
  const r = Number(realizadas) || 0
  if (p <= 0) return 0
  return Math.min(100, Math.round((r / p) * 100))
}

export function hojeISO() {
  const d = new Date()
  const ano = d.getFullYear()
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

export function agoraHHMM() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function formatarDataBR(dataISO) {
  if (!dataISO) return '—'
  const [ano, mes, dia] = dataISO.split('-')
  return `${dia}/${mes}/${ano}`
}

export function formatarHora(hora) {
  if (!hora) return '—'
  // hora pode vir como "HH:MM:SS" do Postgres; exibimos só "HH:MM"
  return hora.slice(0, 5)
}

export function formatarDataHoraCurta(data, hora) {
  if (!data && !hora) return '—'
  const dataFmt = data ? formatarDataBR(data) : ''
  const horaFmt = hora ? formatarHora(hora) : ''
  return [dataFmt, horaFmt].filter(Boolean).join(' ')
}

/**
 * Formata a data/hora da última atualização (updated_at, timestamptz)
 * para exibição na listagem.
 */
export function formatarAtualizadoEm(timestamptz) {
  if (!timestamptz) return '—'
  const d = new Date(timestamptz)
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatarLeadTime(minutos) {
  if (minutos === null || minutos === undefined) return '—'
  const horas = Math.floor(minutos / 60)
  const resto = minutos % 60
  if (horas < 24) return `${String(horas).padStart(2, '0')}h${String(resto).padStart(2, '0')}min`
  const dias = Math.floor(horas / 24)
  const horasResto = horas % 24
  const rotuloDias = dias === 1 ? 'dia' : 'dias'
  return `${dias} ${rotuloDias} ${String(horasResto).padStart(2, '0')}h${String(resto).padStart(2, '0')}min`
}

/**
 * Decompõe o lead time (em minutos totais) nos componentes pedidos pela
 * Etapa 4: dias, horas "em rota" (resto após os dias completos) e
 * minutos "em rota" (resto após as horas completas). Útil para exibir
 * cada unidade separadamente em cards/indicadores, além do texto
 * formatado de formatarLeadTime.
 */
export function decomporLeadTime(minutos) {
  if (minutos === null || minutos === undefined) {
    return { dias: null, horas: null, minutos: null, totalHoras: null }
  }
  const dias = Math.floor(minutos / 1440)
  const horas = Math.floor((minutos % 1440) / 60)
  const mins = minutos % 60
  return { dias, horas, minutos: mins, totalHoras: minutos / 60 }
}

/**
 * Formato HH:MM (zero-padded), sem rótulos de texto — ex.: "09:33".
 * Para operações de múltiplos dias, as horas acumulam além de 24
 * (ex.: 4 dias 09h30min → "105:30"), já que HH:MM não tem como
 * representar "dias" separadamente neste formato.
 */
export function formatarLeadTimeHHMM(minutos) {
  if (minutos === null || minutos === undefined) return '—'
  const horas = Math.floor(minutos / 60)
  const resto = minutos % 60
  return `${String(horas).padStart(2, '0')}:${String(resto).padStart(2, '0')}`
}

/**
 * Formato decimal em horas, com 2 casas decimais — ex.: 573min → "9.55h".
 */
export function formatarLeadTimeDecimal(minutos) {
  if (minutos === null || minutos === undefined) return '—'
  return `${(minutos / 60).toFixed(2)}h`
}
