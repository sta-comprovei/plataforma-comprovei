import { useEffect, useState } from 'react'
import {
  buscarEvolucaoMensalDesempenho,
  buscarRankingDesempenho,
} from '../lib/evolucaoMotoristasService'
import LineChart from '../components/ui/LineChart'
import { IconAlertCircle, IconTrendingUp } from '../components/ui/Icons'
import './EvolucaoMensal.css'

function fmtComp(c) {
  if (!c) return '—'
  const [a, m] = c.split('-')
  const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${meses[+m - 1]}/${a.slice(2)}`
}

function KpiCard({ label, valor, sub, cor }) {
  return (
    <div className="eml-kpi-card" style={cor ? { borderTopColor: cor } : {}}>
      <div className="eml-kpi-label">{label}</div>
      <div className="eml-kpi-valor">{valor ?? '—'}</div>
      {sub && <div className="eml-kpi-sub">{sub}</div>}
    </div>
  )
}

function RankingCard({ titulo, lista, campo, unidade = '' }) {
  if (!lista?.length) return null
  return (
    <div className="eml-ranking-card">
      <h3 className="eml-ranking-titulo">{titulo}</h3>
      <table className="eml-ranking-tabela">
        <tbody>
          {lista.map((m, i) => {
            const v = m[campo]
            const sinal = campo.includes('variacao') && v > 0 ? '+' : ''
            return (
              <tr key={i}>
                <td className="eml-rank-pos">#{i + 1}</td>
                <td className="eml-rank-nome" title={m.nome_motorista}>{m.nome_motorista}</td>
                <td className="eml-rank-val">{v != null ? `${sinal}${v}${unidade}` : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function EvolucaoMensal() {
  const [meses, setMeses]         = useState([])
  const [ranking, setRanking]     = useState([])
  const [carregando, setCarreg]   = useState(true)
  const [erro, setErro]           = useState('')

  useEffect(() => {
    Promise.all([buscarEvolucaoMensalDesempenho(), buscarRankingDesempenho()]).then(([rM, rR]) => {
      setCarreg(false)
      if (rM.erro) { setErro(rM.erro); return }
      setMeses(rM.dados)
      if (!rR.erro) setRanking(rR.dados)
    })
  }, [])

  if (carregando) return <div style={{ padding: 32, textAlign: 'center', color: 'var(--text3)' }}>Carregando...</div>

  if (erro) return (
    <div className="eml-erro">
      <IconAlertCircle width={14} /> {erro}
    </div>
  )

  if (!meses.length) return (
    <div style={{ padding: 48, textAlign: 'center', color: 'var(--text3)', lineHeight: 1.6 }}>
      <IconTrendingUp style={{ width: 36, height: 36, opacity: 0.3, display: 'block', margin: '0 auto 12px' }} />
      <strong>Nenhum histórico disponível.</strong><br />
      Importe o relatório em Importações → &quot;Desempenho de Motoristas&quot;.
    </div>
  )

  // KPIs gerais
  const comQ = meses.filter(m => m.media_qualidade != null)
  const melhor = comQ.reduce((a, b) => a.media_qualidade > b.media_qualidade ? a : b, comQ[0])
  const pior   = comQ.reduce((a, b) => a.media_qualidade < b.media_qualidade ? a : b, comQ[0])
  const media  = comQ.length ? Math.round(comQ.reduce((a, b) => a + b.media_qualidade, 0) / comQ.length * 100) / 100 : null
  const ult    = comQ[comQ.length - 1]
  const pen    = comQ[comQ.length - 2]
  const cresc  = comQ.length >= 2 ? Math.round((ult.media_qualidade - comQ[0].media_qualidade) * 100) / 100 : null
  const vsAnt  = pen != null ? Math.round((ult.media_qualidade - pen.media_qualidade) * 100) / 100 : null

  // Rankings
  const semVar     = ranking.filter(m => m.variacao_qualidade != null)
  const melhorRank = [...ranking].filter(m => m.qualidade_pct != null).sort((a, b) => b.qualidade_pct - a.qualidade_pct).slice(0, 10)
  const piorRank   = [...ranking].filter(m => m.qualidade_pct != null).sort((a, b) => a.qualidade_pct - b.qualidade_pct).slice(0, 10)
  const evoluiram  = [...semVar].filter(m => m.variacao_qualidade > 0).sort((a, b) => b.variacao_qualidade - a.variacao_qualidade).slice(0, 10)
  const pioraram   = [...semVar].filter(m => m.variacao_qualidade < 0).sort((a, b) => a.variacao_qualidade - b.variacao_qualidade).slice(0, 10)

  // Dados do gráfico de qualidade
  const grafLabels = meses.map(m => fmtComp(m.competencia))
  const grafSeries = [
    { nome: 'Qualidade Média (%)', cor: '#F59E0B', valores: meses.map(m => m.media_qualidade) },
  ]

  return (
    <div className="eml-container">
      <div className="eml-header">
        <h2 className="eml-titulo">Evolução Mensal da Empresa</h2>
        <p className="eml-sub">Médias de desempenho mês a mês — todos os motoristas · relatório Gerencial Comprovei.</p>
      </div>

      {/* KPIs */}
      <div className="eml-kpis">
        <KpiCard label="Média geral" valor={media != null ? `${media}%` : null} sub={`${comQ.length} meses`} cor="#F59E0B" />
        <KpiCard label="Melhor mês"  valor={melhor ? `${melhor.media_qualidade}%` : null} sub={fmtComp(melhor?.competencia)} />
        <KpiCard label="Pior mês"    valor={pior   ? `${pior.media_qualidade}%`   : null} sub={fmtComp(pior?.competencia)} />
        {cresc != null && <KpiCard label="Crescimento" valor={`${cresc > 0 ? '+' : ''}${cresc}%`} sub="1º → último mês" />}
        {vsAnt != null && (
          <KpiCard
            label="vs. mês anterior"
            valor={`${vsAnt > 0 ? '+' : ''}${vsAnt}%`}
            sub={`Atual: ${ult?.media_qualidade}%`}
            cor={vsAnt >= 0 ? '#10B981' : '#EF4444'}
          />
        )}
      </div>

      {/* Gráfico de qualidade mensal */}
      <div className="eml-card">
        <h3 className="eml-card-titulo">Qualidade Média Mensal</h3>
        <p style={{ fontSize: 12.5, color: 'var(--text3)', margin: '0 0 14px' }}>
          Média da qualidade de todos os motoristas em cada mês importado.
        </p>
        <LineChart labels={grafLabels} series={grafSeries} formatarValor={v => `${v}%`} altura={200} />
      </div>

      {/* Tabela de meses */}
      <div className="eml-card">
        <h3 className="eml-card-titulo">Histórico Mensal</h3>
        <div style={{ overflowX: 'auto' }}>
          <table className="eml-tabela">
            <thead>
              <tr>
                <th>Período</th>
                <th>Qualidade</th>
                <th>Rotas</th>
                <th>Documentos</th>
                <th>Início Cerca</th>
                <th>Chegada Cerca</th>
                <th>Ocorrência</th>
                <th>Intervalo</th>
                <th>Motoristas</th>
              </tr>
            </thead>
            <tbody>
              {[...meses].reverse().map((m, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{fmtComp(m.competencia)}</td>
                  <td className={
                    m.media_qualidade == null ? '' :
                    m.media_qualidade >= 95 ? 'eml-verde' :
                    m.media_qualidade >= 80 ? 'eml-amarelo' : 'eml-vermelho'
                  }>
                    {m.media_qualidade != null ? `${m.media_qualidade}%` : '—'}
                  </td>
                  <td>{m.media_rotas != null ? m.media_rotas.toFixed(0) : '—'}</td>
                  <td>{m.media_documentos != null ? m.media_documentos.toFixed(0) : '—'}</td>
                  <td>{m.media_inicio_cerca_pct != null ? `${m.media_inicio_cerca_pct}%` : '—'}</td>
                  <td>{m.media_chegada_cerca_pct != null ? `${m.media_chegada_cerca_pct}%` : '—'}</td>
                  <td>{m.media_ocorrencia_pct != null ? `${m.media_ocorrencia_pct}%` : '—'}</td>
                  <td>{m.media_intervalo_pct != null ? `${m.media_intervalo_pct}%` : '—'}</td>
                  <td>{m.total_motoristas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Rankings */}
      {ranking.length > 0 && (
        <div className="eml-rankings-section">
          <h3 className="eml-card-titulo" style={{ marginBottom: 12 }}>Rankings — mês mais recente</h3>
          <div className="eml-rankings-grid">
            <RankingCard titulo="🏆 Melhor desempenho"  lista={melhorRank} campo="qualidade_pct" unidade="%" />
            <RankingCard titulo="📉 Pior desempenho"    lista={piorRank}   campo="qualidade_pct" unidade="%" />
            <RankingCard titulo="📈 Mais evoluíram"     lista={evoluiram}  campo="variacao_qualidade" unidade="%" />
            <RankingCard titulo="📉 Mais pioraram"      lista={pioraram}   campo="variacao_qualidade" unidade="%" />
          </div>
        </div>
      )}
    </div>
  )
}
