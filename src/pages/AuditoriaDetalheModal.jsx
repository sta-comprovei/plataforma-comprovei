import Modal from '../components/ui/Modal'
import { ROTULOS_TIPO_ACAO, ROTULOS_TABELA, calcularDiferencas } from '../lib/auditoriaService'
import './Auditoria.css'

function formatarValor(valor) {
  if (valor === null || valor === undefined) return '—'
  if (typeof valor === 'boolean') return valor ? 'Sim' : 'Não'
  if (typeof valor === 'object') return JSON.stringify(valor)
  return String(valor)
}

function formatarDataHora(dataHora) {
  return new Date(dataHora).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export default function AuditoriaDetalheModal({ registro, onFechar }) {
  if (!registro) return null

  const diferencas = calcularDiferencas(registro.dados_anteriores, registro.dados_novos)
  const tabelaLabel = ROTULOS_TABELA[registro.tabela_afetada] || registro.tabela_afetada
  const acaoLabel = ROTULOS_TIPO_ACAO[registro.tipo_acao] || registro.tipo_acao

  return (
    <Modal aberto={!!registro} titulo="Detalhes da Alteração" onFechar={onFechar}>
      <div className="aud-detail-meta">
        <div className="aud-detail-meta-item">
          <label>Usuário responsável</label>
          <span>{registro.nome_usuario}</span>
        </div>
        <div className="aud-detail-meta-item">
          <label>Data e hora</label>
          <span>{formatarDataHora(registro.data_hora)}</span>
        </div>
        <div className="aud-detail-meta-item">
          <label>Tipo de ação</label>
          <span>{acaoLabel}</span>
        </div>
        <div className="aud-detail-meta-item">
          <label>Tabela afetada</label>
          <span>{tabelaLabel}</span>
        </div>
      </div>

      {diferencas.length > 0 ? (
        <table className="aud-diff-table">
          <thead>
            <tr>
              <th>Campo</th>
              <th>Valor anterior</th>
              <th>Novo valor</th>
            </tr>
          </thead>
          <tbody>
            {diferencas.map((d) => (
              <tr key={d.campo} className={d.mudou ? 'campo-alterado' : ''}>
                <td className="aud-diff-campo">{d.campo}</td>
                <td className={d.mudou ? 'aud-diff-antes' : 'aud-diff-igual'}>
                  {formatarValor(d.valorAntes)}
                </td>
                <td className={d.mudou ? 'aud-diff-depois' : 'aud-diff-igual'}>
                  {formatarValor(d.valorDepois)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p style={{ color: 'var(--text3)', fontSize: 13 }}>
          Nenhum dado detalhado disponível para este registro.
        </p>
      )}

      {registro.observacao && (
        <div className="aud-observacao-box">
          <strong>Observação:</strong> {registro.observacao}
        </div>
      )}
    </Modal>
  )
}
