/**
 * Estrutura compartilhada para as páginas nesta etapa do projeto.
 * Nenhuma regra de negócio é implementada aqui — apenas o esqueleto visual
 * e o ponto de entrada onde cada módulo será construído nas próximas etapas.
 */
export default function PageScaffold({ titulo, descricao, icone: Icone }) {
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '48px 32px',
        boxShadow: 'var(--shadow)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: 14,
        maxWidth: 560,
        margin: '40px auto',
      }}
    >
      {Icone && (
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: 'var(--orange-light)',
            color: 'var(--orange)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icone width={26} height={26} />
        </div>
      )}
      <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{titulo}</h2>
      <p style={{ color: 'var(--text3)', fontSize: 13.5, lineHeight: 1.6, maxWidth: 420 }}>
        {descricao || 'Esta página está estruturada e pronta para receber suas funcionalidades nas próximas etapas.'}
      </p>
    </div>
  )
}
