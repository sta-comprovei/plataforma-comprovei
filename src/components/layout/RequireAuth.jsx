import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import FullScreenLoader from '../ui/FullScreenLoader'

/**
 * Garante que existe uma sessão Supabase válida E um perfil ativo em
 * public.usuarios antes de renderizar qualquer rota protegida.
 */
export default function RequireAuth({ children }) {
  const { autenticado, carregandoSessao, carregandoUsuario, usuario, erroPerfil, logout } = useAuth()
  const location = useLocation()

  if (carregandoSessao) {
    return <FullScreenLoader texto="Verificando sessão..." />
  }

  if (!autenticado) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (carregandoUsuario) {
    return <FullScreenLoader texto="Carregando seu perfil..." />
  }

  if (erroPerfil || !usuario) {
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          padding: 24,
          textAlign: 'center',
        }}
      >
        <p style={{ color: 'var(--red)', fontWeight: 600, maxWidth: 360 }}>
          {erroPerfil || 'Não foi possível carregar seu perfil de acesso.'}
        </p>
        <button
          type="button"
          onClick={() => logout()}
          style={{
            padding: '9px 18px',
            borderRadius: 8,
            border: 'none',
            background: 'var(--orange)',
            color: '#fff',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Voltar ao login
        </button>
      </div>
    )
  }

  if (!usuario.ativo) {
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          padding: 24,
          textAlign: 'center',
        }}
      >
        <p style={{ color: 'var(--red)', fontWeight: 600, maxWidth: 360 }}>
          Seu usuário está inativo. Entre em contato com o administrador para reativação.
        </p>
        <button
          type="button"
          onClick={() => logout()}
          style={{
            padding: '9px 18px',
            borderRadius: 8,
            border: 'none',
            background: 'var(--orange)',
            color: '#fff',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Voltar ao login
        </button>
      </div>
    )
  }

  return children
}
