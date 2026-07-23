import { formatarLeadTime } from '../../lib/dataHoraUtils'

/**
 * Gráfico de barras agrupadas (atual vs. anterior) por categoria, em
 * SVG puro — usado para a "Comparação entre períodos" de Lead Time no
 * Dashboard Executivo.
 *
 * @param {Array<{tipo: string, atual: number|null, anterior: number|null}>} props.dados
 *   Valores em minutos. null = sem dado suficiente naquele período.
 * @param {Record<string,string>} props.cores - cor por categoria (tipo -> hex)
 */
export default function ComparacaoPeriodosChart({ dados, cores, altura = 200 }) {
  const largura = 600
  const margemEsquerda = 50
  const margemDireita = 20
  const margemTopo = 16
  const margemBaixo = 56
  const areaW = largura - margemEsquerda - margemDireita
  const areaH = altura - margemTopo - margemBaixo

  const valoresValidos = dados.flatMap((d) => [d.atual, d.anterior]).filter((v) => v !== null && v !== undefined)

  if (valoresValidos.length === 0) {
    return (
      <div style={{ height: altura, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: 13 }}>
        Sem dados suficientes para comparar períodos.
      </div>
    )
  }

  const maxValor = Math.max(...valoresValidos)
  const grupoW = areaW / dados.length
  const barraW = grupoW * 0.28
  const espacoEntreBarras = grupoW * 0.08

  function escalaY(v) {
    return margemTopo + areaH - (v / maxValor) * areaH
  }
  function alturaBarra(v) {
    return (v / maxValor) * areaH
  }

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${largura} ${altura}`} style={{ width: '100%', height: altura, minWidth: 320 }} role="img" aria-label="Comparação entre períodos">
        {dados.map((d, i) => {
          const centroX = margemEsquerda + grupoW * i + grupoW / 2
          const xAnterior = centroX - barraW - espacoEntreBarras / 2
          const xAtual = centroX + espacoEntreBarras / 2
          const cor = cores[d.tipo] || '#999'

          return (
            <g key={d.tipo}>
              {d.anterior !== null && d.anterior !== undefined && (
                <rect
                  x={xAnterior}
                  y={escalaY(d.anterior)}
                  width={barraW}
                  height={alturaBarra(d.anterior)}
                  rx="3"
                  fill={cor}
                  opacity="0.4"
                >
                  <title>{`${d.tipo} (período anterior): ${formatarLeadTime(d.anterior)}`}</title>
                </rect>
              )}
              {d.atual !== null && d.atual !== undefined && (
                <rect x={xAtual} y={escalaY(d.atual)} width={barraW} height={alturaBarra(d.atual)} rx="3" fill={cor}>
                  <title>{`${d.tipo} (período atual): ${formatarLeadTime(d.atual)}`}</title>
                </rect>
              )}
              <text x={centroX} y={altura - margemBaixo + 18} fontSize="12" fontWeight="700" fill="var(--text2)" textAnchor="middle">
                {d.tipo}
              </text>
              <text x={centroX} y={altura - margemBaixo + 34} fontSize="10" fill="var(--text3)" textAnchor="middle">
                {d.atual !== null ? formatarLeadTime(d.atual) : '—'}
              </text>
            </g>
          )
        })}
      </svg>
      <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text2)', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--text3)', display: 'inline-block' }} />
          Período anterior
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--orange)', display: 'inline-block' }} />
          Período atual
        </div>
      </div>
    </div>
  )
}
