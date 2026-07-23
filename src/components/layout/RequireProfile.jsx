import { useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { podeAcessar } from '../../lib/permissions'

export default function RequireProfile({ children }) {
  const { perfil } = useAuth()
  const location = useLocation()

  if (!podeAcessar(location.pathname, perfil)) {
    return (
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'60vh', gap:12, textAlign:'center', padding:24 }}>
        <div style={{ fontSize:40 }}>🔒</div>
        <h2 style={{ fontSize:20, fontWeight:700, color:'var(--text)', margin:0 }}>Acesso não autorizado.</h2>
        <p style={{ fontSize:14, color:'var(--text3)', maxWidth:380, margin:0, lineHeight:1.6 }}>
          Seu perfil (<strong>{perfil}</strong>) não tem permissão para acessar esta página.
        </p>
      </div>
    )
  }
  return children
}
