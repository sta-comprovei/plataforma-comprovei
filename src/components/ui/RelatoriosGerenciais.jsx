/**
 * RelatoriosGerenciais.jsx
 * Componentes para a aba "Gerencial" em GargalosOperacionais.jsx
 *
 * 1. EvolucaoGargalos  — evolução mensal dos 7 intervalos com variação %
 * 2. PerformanceRotas  — ranking rota pior→melhor com SLA e tolerância
 * 3. SLATolerancia     — painel de KPIs verde/amarelo/vermelho
 *
 * Todos os dados históricos vêm de snapshots_rotina + snapshots_comprovei.
 */

import { formatarTempo } from '../../lib/funilService'

// ───────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────
function fmtComp(c) {
  if (!c) return '—'
  const [ano, mes] = c.split('-')
  const nomes = ['','Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${nomes[parseInt(mes)] ?? mes}/${ano}`
}

function Variacao({ pct }) {
  if (pct == null) return <span style={{ color: 'var(--text4)', fontSize: 11 }}>—</span>
  const positivo = pct > 0  // positivo = piorou
  const cor = positivo ? '#DC2626' : '#16A34A'
  const seta = positivo ? '▲' : '▼'
  const abs  = Math.abs(pct)
  return (
    <span style={{ color: cor, fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap' }}>
      {seta} {abs}%
    </span>
  )
}

const COR_ROTA = {
  critica: { bg: '#FEF2F2', cor: '#DC2626', label: '🔴 Crítica' },
  atencao: { bg: '#FFFBEB', cor: '#D97706', label: '🟡 Atenção' },
  ok:      { bg: '#F0FDF4', cor: '#16A34A', label: '🟢 OK'      },
  sem_dados:{ bg: '#F8FAFC', cor: '#94A3B8', label: '⚪ Sem dados' },
}

const COR_SLA = {
  verde:     { bg: '#F0FDF4', cor: '#16A34A' },
  amarelo:   { bg: '#FFFBEB', cor: '#D97706' },
  vermelho:  { bg: '#FEF2F2', cor: '#DC2626' },
  sem_dados: { bg: '#F8FAFC', cor: '#94A3B8' },
}

// ───────────────────────────────────────────────────────────
// 1. Evolução de Gargalos por Competência
// ───────────────────────────────────────────────────────────
const ETAPAS_EVOLV = [
  { campo_h: 'media_h1', campo_max: 'max_h1', campo_n: 'n1', campo_var: 'var_pct_h1', label: 'Venda → Fat.' },
  { campo_h: 'media_h2', campo_max: 'max_h2', campo_n: 'n2', campo_var: 'var_pct_h2', label: 'Fat. → WMS'   },
  { campo_h: 'media_h3', campo_max: 'max_h3', campo_n: 'n3', campo_var: 'var_pct_h3', label: 'WMS → Sep.'   },
  { campo_h: 'media_h4', campo_max: 'max_h4', campo_n: 'n4', campo_var: 'var_pct_h4', label: 'Sep. → Conf.' },
  { campo_h: 'media_h5', campo_max: 'max_h5', campo_n: 'n5', campo_var: 'var_pct_h5', label: 'Conf. → Exp.' },
  { campo_h: 'media_h6', campo_max: 'max_h6', campo_n: 'n6', campo_var: 'var_pct_h6', label: 'Transporte'   },
  { campo_h: 'media_h7', campo_max: 'max_h7', campo_n: 'n7', campo_var: 'var_pct_h7', label: 'Lead Total'   },
]

export function EvolucaoGargalos({ dados, carregando }) {
  if (carregando) return <div className="garg-carregando">Calculando evolução…</div>

  if (!dados || dados.length === 0) {
    return (
      <div className="garg-vazio">
        Nenhum snapshot mensal disponível ainda.
        <br />
        Os snapshots são gerados automaticamente na próxima importação de ROTINA.
        <br />
        Com ao menos dois meses importados, este relatório mostrará a evolução.
      </div>
    )
  }

  // Calcular máximos por etapa para coloração relativa
  const maxPorEtapa = {}
  ETAPAS_EVOLV.forEach(({ campo_h }) => {
    maxPorEtapa[campo_h] = Math.max(...dados.map(r => r[campo_h] ?? 0))
  })

  return (
    <div>
      <div className="garg-tabela-wrap">
        <table className="garg-tabela ger-tabela-evolv">
          <thead>
            <tr>
              <th>Competência</th>
              <th className="text-right">Pedidos</th>
              {ETAPAS_EVOLV.map(e => (
                <th key={e.campo_h} className="text-center ger-th-etapa" colSpan={2}>
                  {e.label}
                </th>
              ))}
            </tr>
            <tr className="ger-subheader">
              <th colSpan={2} />
              {ETAPAS_EVOLV.map(e => (
                <>
                  <th key={`${e.campo_h}_m`} className="text-right" style={{ fontSize: 10 }}>Média</th>
                  <th key={`${e.campo_h}_v`} className="text-right" style={{ fontSize: 10 }}>Var.</th>
                </>
              ))}
            </tr>
          </thead>
          <tbody>
            {dados.map((row) => (
              <tr key={row.competencia}>
                <td style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                  {fmtComp(row.competencia)}
                </td>
                <td className="text-right garg-td-num" style={{ fontSize: 12 }}>
                  {(row.total_pedidos ?? 0).toLocaleString('pt-BR')}
                </td>
                {ETAPAS_EVOLV.map(({ campo_h, campo_var }) => {
                  const val = row[campo_h]
                  const var_ = row[campo_var]
                  const max  = maxPorEtapa[campo_h]
                  const pct  = max > 0 ? (val ?? 0) / max : 0
                  const corMedia = pct > 0.85 ? '#DC2626' : pct > 0.60 ? '#D97706' : '#16A34A'
                  return (
                    <>
                      <td key={`${campo_h}_m`} className="text-right ger-td-media" style={{ color: corMedia }}>
                        {val != null ? formatarTempo(val) : '—'}
                      </td>
                      <td key={`${campo_h}_v`} className="text-right ger-td-var">
                        <Variacao pct={var_} />
                      </td>
                    </>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="garg-nota">
        Fonte: <strong>snapshots_rotina + snapshots_comprovei</strong> — dados históricos reais por mês de importação.
        Variação: ▲ vermelho = piorou (tempo aumentou) · ▼ verde = melhorou (tempo diminuiu).
        — = primeiro mês, sem mês anterior para comparar.
        Cores das médias: 🔴 pior mês desta etapa · 🟡 intermediário · 🟢 melhor mês.
      </div>
    </div>
  )
}

// ───────────────────────────────────────────────────────────
// 2. Performance de Rotas (ranking pior→melhor)
// ───────────────────────────────────────────────────────────
export function PerformanceRotas({ dados, carregando }) {
  if (carregando) return <div className="garg-carregando">Carregando rotas…</div>

  if (!dados || dados.length === 0) {
    return <div className="garg-vazio">Nenhuma rota com dados de transporte disponíveis.</div>
  }

  return (
    <div>
      <div className="garg-tabela-wrap">
        <table className="garg-tabela ger-tabela-rotas">
          <thead>
            <tr>
              <th>#</th>
              <th>Rota</th>
              <th>UF</th>
              <th className="text-right">Entregas</th>
              <th className="text-right">SLA (h)</th>
              <th className="text-right">Média Transp.</th>
              <th className="text-right">Máx. Transp.</th>
              <th className="text-right">🟢 Dentro</th>
              <th className="text-right">🟡 Tolerância</th>
              <th className="text-right">🔴 Acima</th>
              <th>Classificação</th>
            </tr>
          </thead>
          <tbody>
            {dados.map((r, i) => {
              const cls = COR_ROTA[r.classificacao_rota] ?? COR_ROTA.ok
              const prazoH = r.prazo_horas_efetivo
              const tol    = r.tolerancia_percentual ?? 20
              const limite = prazoH ? (prazoH * (1 + tol / 100)).toFixed(1) : null
              return (
                <tr key={`${r.cidade_destino}|${r.uf_destino}`}
                  style={{ background: r.classificacao_rota === 'critica' ? '#FEF2F205' : 'transparent' }}>
                  <td className="ger-td-rank" style={{ color: cls.cor, fontWeight: 700 }}>
                    #{i + 1}
                  </td>
                  <td style={{ fontWeight: 600 }}>{r.cidade_destino ?? '—'}</td>
                  <td className="garg-td-cinza">{r.uf_destino ?? '—'}</td>
                  <td className="text-right garg-td-num">{(r.total_entregas ?? 0).toLocaleString('pt-BR')}</td>
                  <td className="text-right garg-td-cinza" style={{ fontSize: 12 }}>
                    {prazoH ? `${prazoH}h±${tol}%` : '—'}
                    {limite && <div style={{ fontSize: 10, color: 'var(--text4)' }}>lim: {limite}h</div>}
                  </td>
                  <td className="text-right garg-td-tempo"
                    style={{ color: r.classificacao_rota === 'critica' ? '#DC2626' : 'inherit' }}>
                    {r.media_h_transporte ? formatarTempo(r.media_h_transporte) : '—'}
                  </td>
                  <td className="text-right garg-td-cinza" style={{ fontSize: 12 }}>
                    {r.maximo_h_transporte ? formatarTempo(r.maximo_h_transporte) : '—'}
                  </td>
                  <td className="text-right" style={{ color: '#16A34A', fontWeight: 600 }}>
                    {r.pct_verde != null ? `${r.pct_verde}%` : '—'}
                  </td>
                  <td className="text-right" style={{ color: '#D97706', fontWeight: 600 }}>
                    {r.pct_amarelo != null ? `${r.pct_amarelo}%` : '—'}
                  </td>
                  <td className="text-right" style={{ color: '#DC2626', fontWeight: 600 }}>
                    {r.pct_vermelho != null ? `${r.pct_vermelho}%` : '—'}
                  </td>
                  <td>
                    <span className="garg-badge-cls" style={{ background: cls.bg, color: cls.cor }}>
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
        Ordenação: pior rota (maior % 🔴) para melhor. Classificação: 🔴 Crítica (&gt;30% vermelho)
        · 🟡 Atenção (&gt;40% amarelo+vermelho) · 🟢 OK.
        Tolerância por rota configurada em <a href="/prazo-rotas" style={{ color: 'var(--orange)' }}>Prazo de Rotas</a>.
      </div>
    </div>
  )
}

// ───────────────────────────────────────────────────────────
// 3. SLA com Tolerância — cards verde/amarelo/vermelho
// ───────────────────────────────────────────────────────────
export function SLAComTolerancia({ kpis, carregando }) {
  if (carregando) return <div className="garg-carregando">Calculando SLA…</div>

  if (!kpis || kpis.total_com_sla === 0) {
    return (
      <div className="garg-vazio">
        Nenhum dado de SLA com tolerância disponível.
        Configure prazos em <a href="/prazo-rotas" style={{ color: 'var(--orange)' }}>Prazo de Rotas</a>.
      </div>
    )
  }

  const cards = [
    { label: 'Dentro do prazo',   val: `${kpis.total_verde ?? 0} (${kpis.pct_verde ?? 0}%)`,   status: 'verde',    sub: null },
    { label: 'Na tolerância',     val: `${kpis.total_amarelo ?? 0} (${kpis.pct_amarelo ?? 0}%)`, status: 'amarelo',  sub: 'Entre prazo e limite' },
    { label: 'Acima do limite',   val: `${kpis.total_vermelho ?? 0} (${kpis.pct_vermelho ?? 0}%)`, status: 'vermelho', sub: kpis.atraso_medio_dias_vermelho != null ? `Atraso médio: ${kpis.atraso_medio_dias_vermelho}d` : null },
    { label: 'Sem rota cadastrada', val: (kpis.total_sem_rota ?? 0).toLocaleString('pt-BR'), status: 'sem_dados', sub: 'Cadastrar em Prazo de Rotas' },
  ]

  return (
    <div>
      <div className="garg-sla-cards">
        {cards.map(({ label, val, status, sub }) => {
          const c = COR_SLA[status] ?? COR_SLA.sem_dados
          return (
            <div key={status} className="garg-card-sla">
              <span className="garg-card-sla-valor" style={{ color: c.cor }}>{val}</span>
              <span className="garg-card-sla-label">{label}</span>
              {sub && <span className="garg-card-sla-sub">{sub}</span>}
            </div>
          )
        })}
      </div>
      {kpis.atraso_maximo_dias_vermelho != null && (
        <div style={{ padding: '0 18px 14px', fontSize: 12.5, color: '#DC2626' }}>
          Maior atraso registrado: <strong>{kpis.atraso_maximo_dias_vermelho}d</strong> acima do limite
        </div>
      )}
      <div className="garg-nota">
        Classificação por tolerância configurada em cada rota (padrão 20%).
        🟡 Amarelo = entre 90% e 100% do limite. 🔴 Vermelho = acima do limite.
        Configure em <a href="/prazo-rotas" style={{ color: 'var(--orange)' }}>Prazo de Rotas → campo Prazo em horas + Tolerância</a>.
      </div>
    </div>
  )
}
