/**
 * Gráfico de barras horizontais genérico em SVG puro, sem dependência
 * externa — uma barra colorida por categoria, com quantidade e
 * percentual exibidos ao lado. Diferente de MetaBarChart (que sempre
 * divide cada barra em "dentro/fora" da meta), este componente aceita
 * um número arbitrário de categorias com cores independentes.
 *
 * @param {Array<{label: string, quantidade: number, percentual: number, cor: string}>} props.dados
 */
export default function DistribuicaoBarChart({ dados, altura }) {
  const largura = 600
  const margemEsquerda = 110
  const margemDireita = 90
  const alturaBarra = 24
  const espacamento = 14

  const semDados = !dados || dados.length === 0 || dados.every((d) => d.quantidade === 0)

  if (semDados) {
    const alturaVazio = altura || 160
    return (
      <div style={{ height: alturaVazio, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: 13 }}>
        Sem dados suficientes para exibir o gráfico.
      </div>
    )
  }

  const maxQuantidade = Math.max(...dados.map((d) => d.quantidade), 1)
  const areaW = largura - margemEsquerda - margemDireita
  const alturaTotal = dados.length * (alturaBarra + espacamento) + espacamento
  const alturaFinal = altura || alturaTotal

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg
        viewBox={`0 0 ${largura} ${alturaTotal}`}
        style={{ width: '100%', height: Math.min(alturaFinal, alturaTotal), minWidth: 320 }}
        role="img"
        aria-label="Gráfico de distribuição"
      >
        {dados.map((d, i) => {
          const y = espacamento + i * (alturaBarra + espacamento)
          const w = (d.quantidade / maxQuantidade) * areaW
          return (
            <g key={d.label}>
              <text x={margemEsquerda - 10} y={y + alturaBarra / 2 + 4} fontSize="12" fontWeight="700" fill="var(--text2)" textAnchor="end">
                {d.label}
              </text>
              <rect x={margemEsquerda} y={y} width={areaW} height={alturaBarra} rx="4" fill="var(--bg3)" />
              {w > 0 && (
                <rect x={margemEsquerda} y={y} width={w} height={alturaBarra} rx="4" fill={d.cor}>
                  <title>{`${d.label}: ${d.quantidade} (${d.percentual}%)`}</title>
                </rect>
              )}
              <text x={margemEsquerda + areaW + 8} y={y + alturaBarra / 2 + 4} fontSize="11.5" fontWeight="700" fill="var(--text2)">
                {d.quantidade} ({d.percentual}%)
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
