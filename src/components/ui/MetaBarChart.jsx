/**
 * Gráfico de barras horizontais simples em SVG puro, sem dependência
 * externa. Usado para cumprimento de meta (% dentro / % fora) por
 * categoria — cada barra é dividida em dois segmentos coloridos.
 *
 * @param {Array<{label: string, dentro: number, fora: number}>} props.dados
 *   `dentro`/`fora` em percentual (0-100), somando 100 por linha.
 */
export default function MetaBarChart({ dados, altura = 160 }) {
  const largura = 600
  const margemEsquerda = 70
  const margemDireita = 50
  const alturaBarra = 28
  const espacamento = 16

  if (!dados || dados.length === 0 || dados.every((d) => d.dentro === 0 && d.fora === 0)) {
    return (
      <div style={{ height: altura, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: 13 }}>
        Sem dados suficientes para exibir o gráfico.
      </div>
    )
  }

  const areaW = largura - margemEsquerda - margemDireita
  const alturaTotal = dados.length * (alturaBarra + espacamento) + espacamento

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg
        viewBox={`0 0 ${largura} ${alturaTotal}`}
        style={{ width: '100%', height: Math.min(altura, alturaTotal), minWidth: 320 }}
        role="img"
        aria-label="Gráfico de cumprimento de metas"
      >
        {dados.map((d, i) => {
          const y = espacamento + i * (alturaBarra + espacamento)
          const wDentro = (d.dentro / 100) * areaW
          const wFora = (d.fora / 100) * areaW
          return (
            <g key={d.label}>
              <text x={margemEsquerda - 10} y={y + alturaBarra / 2 + 4} fontSize="12" fontWeight="700" fill="var(--text2)" textAnchor="end">
                {d.label}
              </text>
              <rect x={margemEsquerda} y={y} width={areaW} height={alturaBarra} rx="4" fill="var(--bg3)" />
              {wDentro > 0 && (
                <rect x={margemEsquerda} y={y} width={wDentro} height={alturaBarra} rx="4" fill="var(--green)">
                  <title>{`Dentro da meta: ${d.dentro}%`}</title>
                </rect>
              )}
              {wFora > 0 && (
                <rect x={margemEsquerda + wDentro} y={y} width={wFora} height={alturaBarra} fill="var(--red)">
                  <title>{`Fora da meta: ${d.fora}%`}</title>
                </rect>
              )}
              <text x={margemEsquerda + areaW + 8} y={y + alturaBarra / 2 + 4} fontSize="11" fontWeight="700" fill="var(--text2)">
                {d.dentro}%
              </text>
            </g>
          )
        })}
      </svg>
      <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text2)', paddingLeft: margemEsquerda }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--green)', display: 'inline-block' }} />
          Dentro da meta
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--red)', display: 'inline-block' }} />
          Fora da meta
        </div>
      </div>
    </div>
  )
}
