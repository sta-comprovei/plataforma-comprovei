export default function FullScreenLoader({ texto = 'Carregando...' }) {
  return (
    <div
      style={{
        height: '100vh',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        background: 'var(--bg)',
      }}
    >
      <div
        style={{
          width: 34,
          height: 34,
          border: '3px solid var(--orange-mid)',
          borderTopColor: 'var(--orange)',
          borderRadius: '50%',
          animation: 'tns-spin 0.7s linear infinite',
        }}
      />
      <span style={{ color: 'var(--text3)', fontSize: 13, fontWeight: 500 }}>{texto}</span>
      <style>{`@keyframes tns-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
