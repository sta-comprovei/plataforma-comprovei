const CLASSES_POR_STATUS = {
  Pendente: 'op-status-pendente',
  'Em trânsito': 'op-status-transito',
  'Chegada ao cliente': 'op-status-chegada',
  'Entrega finalizada': 'op-status-finalizada',
  Concluído: 'op-status-concluido',
}

export default function OperacaoStatusBadge({ status }) {
  const classe = CLASSES_POR_STATUS[status] || 'op-status-pendente'
  return (
    <span className={`op-status-badge ${classe}`}>
      <span className="op-status-dot" />
      {status}
    </span>
  )
}
