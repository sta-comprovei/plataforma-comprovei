import './Button.css'

export default function StatusBadge({ ativo }) {
  return (
    <span className={`badge ${ativo ? 'badge-ativo' : 'badge-inativo'}`}>
      <span className="badge-dot" />
      {ativo ? 'Ativo' : 'Inativo'}
    </span>
  )
}
