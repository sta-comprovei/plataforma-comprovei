import { useId } from 'react'

/**
 * Gráfico de linha simples em SVG puro, sem dependência externa.
 *
 * @param {Object} props
 * @param {string[]} props.labels - rótulos do eixo X (ex.: meses)
 * @param {Array<{nome: string, cor: string, valores: (number|null)[]}>} props.series
 *   Cada série é uma linha do gráfico. `valores[i] === null` quebra a
 *   linha naquele ponto (sem dado) em vez de interpolar/zerar.
 * @param {(v: number) => string} [props.formatarValor] - formata o valor no tooltip/eixo Y
 * @param {number} [props.altura]
 */
export default function LineChart({ labels, series, formatarValor = (v) => String(v), altura = 220 }) {
  const idBase = useId()
  const largura = 600
  const margemEsquerda = 44
  const margemDireita = 16
  const margemTopo = 16
  const margemBaixo = 32
  const areaW = largura - margemEsquerda - margemDireita
  const areaH = altura - margemTopo - margemBaixo

  const todosValores = series.flatMap((s) => s.valores.filter((v) => v !== null && v !== undefined))
  const maxValor = todosValores.length > 0 ? Math.max(...todosValores) : 1
  const minValor = 0 // lead time nunca é negativo; eixo sempre começa em 0

  const escalaY = (v) => margemTopo + areaH - ((v - minValor) / (maxValor - minValor || 1)) * areaH
  const escalaX = (i) => margemEsquerda + (labels.length > 1 ? (i / (labels.length - 1)) * areaW : areaW / 2)

  const linhasGrade = 4
  const valoresGrade = Array.from({ length: linhasGrade + 1 }, (_, i) => Math.round((maxValor / linhasGrade) * i))

  if (todosValores.length === 0) {
    return (
      <div style={{ height: altura, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: 13 }}>
        Sem dados suficientes para exibir o gráfico.
      </div>
    )
  }

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${largura} ${altura}`} style={{ width: '100%', height: altura, minWidth: 320 }} role="img" aria-label="Gráfico de evolução">
        {/* Linhas de grade horizontais */}
        {valoresGrade.map((v, i) => (
          <g key={i}>
            <line
              x1={margemEsquerda}
              x2={largura - margemDireita}
              y1={escalaY(v)}
              y2={escalaY(v)}
              stroke="var(--border)"
              strokeWidth="1"
            />
            <text x={margemEsquerda - 8} y={escalaY(v) + 4} fontSize="10" fill="var(--text3)" textAnchor="end">
              {formatarValor(v)}
            </text>
          </g>
        ))}

        {/* Rótulos do eixo X */}
        {labels.map((label, i) => (
          <text key={i} x={escalaX(i)} y={altura - 8} fontSize="10" fill="var(--text3)" textAnchor="middle">
            {label}
          </text>
        ))}

        {/* Séries */}
        {series.map((serie, si) => {
          const pontosValidos = serie.valores
            .map((v, i) => (v !== null && v !== undefined ? { x: escalaX(i), y: escalaY(v), v, i } : null))

          // Quebra a linha em segmentos contínuos (sem interpolar sobre nulls)
          const segmentos = []
          let atual = []
          for (const p of pontosValidos) {
            if (p === null) {
              if (atual.length > 0) segmentos.push(atual)
              atual = []
            } else {
              atual.push(p)
            }
          }
          if (atual.length > 0) segmentos.push(atual)

          return (
            <g key={si}>
              {segmentos.map((seg, segIdx) => (
                <polyline
                  key={segIdx}
                  points={seg.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke={serie.cor}
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ))}
              {pontosValidos
                .filter(Boolean)
                .map((p) => (
                  <circle key={`${idBase}-${si}-${p.i}`} cx={p.x} cy={p.y} r="3.5" fill={serie.cor} stroke="#fff" strokeWidth="1.5">
                    <title>{`${serie.nome}: ${formatarValor(p.v)}`}</title>
                  </circle>
                ))}
            </g>
          )
        })}
      </svg>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 8, paddingLeft: margemEsquerda }}>
        {series.map((s) => (
          <div key={s.nome} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text2)' }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: s.cor, display: 'inline-block' }} />
            {s.nome}
          </div>
        ))}
      </div>
    </div>
  )
}
