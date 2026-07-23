/**
 * RelatoriosGargalos.jsx
 * Relatório 1: Ranking de Gargalos
 * Relatório 2: Evolução Mensal
 *
 * Exporta dois componentes puros para serem integrados em GargalosOperacionais.jsx.
 * Não duplicam lógica existente — consomem funções do funilService.
 */

import { formatarTempo } from '../../lib/funilService'

// ───────────────────────────────────────────────────────────
// Helpers de formatação
// ───────────────────────────────────────────────────────────
function fmtCompetencia(c) {
  if (!c) return '—'
  const [ano, mes] = c.split('-')
  const nomes = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
                      'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  return `${nomes[parseInt(mes)] ?? mes}/${ano}`
}

const COR_CLS = {
  vermelho: { bg: '#FEF2F2', cor: '#DC2626', label: '🔴 Gargalo' },
  amarelo:  { bg: '#FFFBEB', cor: '#D97706', label: '🟡 Atenção'  },
  verde:    { bg: '#F0FDF4', cor: '#16A34A', label: '🟢 OK'       },
}

// ───────────────────────────────────────────────────────────
// RELATÓRIO 1: Ranking de Gargalos
// ───────────────────────────────────────────────────────────
export function RankingGargalos({ dados, carregando, competencia }) {
  if (carregando) {
    return <div className="garg-carregando">Calculando ranking…</div>
  }

  if (!dados || dados.length === 0) {
    return (
      <div className="garg-vazio">
        {competencia
          ? `Nenhum dado de snapshot disponível para ${fmtCompetencia(competencia)}.
             Importe um arquivo ROTINA e os snapshots serão gravados automaticamente.`
          : 'Nenhum dado de lead time disponível. Importe arquivos ROTINA e COMPROVEI.'}
      </div>
    )
  }

  return (
    <div>
      {competencia && (
        <div className="rg-filtro-ativo">
          Filtrando por competência: <strong>{fmtCompetencia(competencia)}</strong>
        </div>
      )}
      <div className="garg-tabela-wrap">
        <table className="garg-tabela rg-tabela">
          <thead>
            <tr>
              <th className="rg-th-rank">Rank</th>
              <th>Etapa</th>
              <th className="rg-th-fonte">Campos fonte</th>
              <th className="text-right">Pedidos</th>
              <th className="text-right">Tempo Médio</th>
              <th className="text-right">Tempo Máximo</th>
              <th className="text-right">Mediana</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {dados.map((row) => {
              const cls = COR_CLS[row.classificacao] ?? COR_CLS.verde
              return (
                <tr
                  key={row.etapa}
                  style={{ background: row.classificacao === 'vermelho' ? '#FEF2F208' : 'transparent' }}
                >
                  <td className="rg-td-rank" style={{ color: cls.cor, fontWeight: 800 }}>
                    #{row.rank_gargalo}
                  </td>
                  <td style={{ fontWeight: 600 }}>
                    {row.rank_gargalo === 1 && (
                      <span title="Principal gargalo" style={{ marginRight: 6 }}>⚠️</span>
                    )}
                    {row.etapa}
                  </td>
                  <td className="rg-td-fonte garg-td-cinza">{row.campos_fonte}</td>
                  <td className="text-right garg-td-num">
                    {(row.qtd_pedidos ?? 0).toLocaleString('pt-BR')}
                  </td>
                  <td
                    className="text-right garg-td-tempo"
                    style={{ color: cls.cor, fontWeight: row.rank_gargalo <= 2 ? 700 : 500 }}
                  >
                    {formatarTempo(row.media_horas)}
                  </td>
                  <td className="text-right garg-td-tempo" style={{ color: 'var(--red)', fontSize: 12 }}>
                    {formatarTempo(row.maximo_horas)}
                  </td>
                  <td className="text-right garg-td-tempo garg-td-cinza" style={{ fontSize: 12 }}>
                    {formatarTempo(row.mediana_horas)}
                  </td>
                  <td>
                    <span
                      className="garg-badge-cls"
                      style={{ background: cls.bg, color: cls.cor }}
                    >
                      {cls.label}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="garg-nota">
        Ordenação: maior tempo médio → menor. Classificação automática: 🔴 Gargalo principal
        · 🟡 Top 3 · 🟢 Demais etapas. Coluna &quot;Campos fonte&quot; mostra os campos
        da ROTINA/COMPROVEI usados em cada cálculo.
        {!competencia && ' Fonte: todos os dados importados (state atual em registros_rotina).'}
        {competencia && ` Fonte: snapshots da competência ${fmtCompetencia(competencia)}.`}
      </div>
    </div>
  )
}

// ───────────────────────────────────────────────────────────
// RELATÓRIO 2: Evolução Mensal
// ───────────────────────────────────────────────────────────

const ETAPAS_EVOL = [
  { campo: 'media_h_venda_fat',    label: 'Venda → Fat.',     n: 'n_venda_fat'   },
  { campo: 'media_h_fat_wms',      label: 'Fat. → WMS',       n: null            },
  { campo: 'media_h_espera_sep',   label: 'Esp. Separação',   n: null            },
  { campo: 'media_h_separacao',    label: 'Separação',        n: null            },
  { campo: 'media_h_espera_conf',  label: 'Esp. Conferência', n: null            },
  { campo: 'media_h_conferencia',  label: 'Conferência',      n: null            },
  { campo: 'media_h_espera_transp',label: 'Esp. Transp.',     n: null            },
  { campo: 'media_h_transporte',   label: 'Transporte',       n: 'n_transporte'  },
  { campo: 'media_h_lead_total',   label: 'Lead Total',       n: 'n_lead_total'  },
]

export function EvolucaoMensal({ dados, carregando, competenciasSelecionadas, todasCompetencias, onToggleCompetencia }) {
  if (carregando) {
    return <div className="garg-carregando">Calculando evolução mensal…</div>
  }

  if (!dados || dados.length === 0) {
    return (
      <div className="garg-vazio">
        Nenhum snapshot mensal disponível ainda.
        <br />
        Os snapshots são gravados automaticamente na próxima importação de arquivo ROTINA.
        <br />
        Após importar ao menos dois meses, este relatório mostrará a evolução.
      </div>
    )
  }

  // Encontrar máximo de cada coluna para barra de proporção
  const maxPorCampo = {}
  ETAPAS_EVOL.forEach(({ campo }) => {
    maxPorCampo[campo] = Math.max(...dados.map(r => r[campo] ?? 0))
  })

  return (
    <div>
      {/* Seletor de competências */}
      {todasCompetencias && todasCompetencias.length > 1 && (
        <div className="evol-seletor">
          <span className="evol-seletor-label">Filtrar competências:</span>
          {todasCompetencias.map(c => (
            <button
              key={c}
              type="button"
              className={`evol-comp-btn${competenciasSelecionadas?.includes(c) ? ' ativa' : ''}`}
              onClick={() => onToggleCompetencia?.(c)}
            >
              {fmtCompetencia(c)}
            </button>
          ))}
        </div>
      )}

      <div className="garg-tabela-wrap">
        <table className="garg-tabela evol-tabela">
          <thead>
            <tr>
              <th>Competência</th>
              <th className="text-right">Pedidos</th>
              {ETAPAS_EVOL.map(e => (
                <th key={e.campo} className="text-right evol-th">{e.label}</th>
              ))}
              <th className="text-right">% Entregues</th>
            </tr>
          </thead>
          <tbody>
            {dados.map((row) => (
              <tr key={row.competencia}>
                <td style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                  {fmtCompetencia(row.competencia)}
                </td>
                <td className="text-right garg-td-num">
                  {(row.total_pedidos ?? 0).toLocaleString('pt-BR')}
                </td>
                {ETAPAS_EVOL.map(({ campo }) => {
                  const val = row[campo]
                  const max = maxPorCampo[campo]
                  // Colorir relativo ao máximo entre todas as competências
                  const pct = max > 0 ? (val ?? 0) / max : 0
                  const cor = pct > 0.85 ? '#DC2626'
                            : pct > 0.60 ? '#D97706'
                            : '#16A34A'
                  return (
                    <td key={campo} className="text-right evol-td-tempo" style={{ color: cor }}>
                      {val != null ? formatarTempo(val) : '—'}
                    </td>
                  )
                })}
                <td className="text-right" style={{
                  fontWeight: 600,
                  color: (row.pct_entregues ?? 0) >= 90 ? '#16A34A'
                        : (row.pct_entregues ?? 0) >= 70 ? '#D97706'
                        : '#DC2626',
                }}>
                  {row.pct_entregues != null ? `${row.pct_entregues}%` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="garg-nota">
        Cores: 🔴 pior mês para esta etapa · 🟡 intermediário · 🟢 melhor mês.
        Comparação relativa entre as competências exibidas.
        &quot;% Entregues&quot; = pedidos com status Entregue / total do snapshot.
        Fonte: snapshots_rotina — cada linha é o estado do pedido no mês de importação.
      </div>
    </div>
  )
}
