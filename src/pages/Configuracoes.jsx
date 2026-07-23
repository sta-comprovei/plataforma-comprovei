import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { IconSettings, IconHistory, IconShield } from '../components/ui/Icons'

export default function Configuracoes() {
  const { isAdmin } = useAuth()

  const cardStyle = {
    background: '#fff',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '18px 18px',
    boxShadow: 'var(--shadow)',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    transition: 'border-color 0.15s, transform 0.1s',
  }
  const iconBoxStyle = {
    width: 38,
    height: 38,
    borderRadius: 10,
    background: 'var(--orange-light)',
    color: 'var(--orange)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%',
          background: 'var(--orange-light)', color: 'var(--orange)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <IconSettings width={22} height={22} />
        </div>
        <div>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>Configurações</h2>
          <p style={{ fontSize: 12.5, color: 'var(--text3)' }}>
            Área administrativa da plataforma TNS Gestão de Entregas.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
        {isAdmin && (
          <Link to="/configuracoes/auditoria" style={cardStyle} className="config-card">
            <div style={iconBoxStyle}><IconHistory width={19} height={19} /></div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 3 }}>
                Histórico de Alterações
              </div>
              <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.5 }}>
                Auditoria completa: quem alterou, quando e o que mudou em cada cadastro do sistema.
              </div>
            </div>
          </Link>
        )}

        {isAdmin && (
          <Link to="/configuracoes/usuarios" style={cardStyle} className="config-card">
            <div style={iconBoxStyle}><IconShield width={19} height={19} /></div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 3 }}>
                Usuários e Permissões
              </div>
              <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.5 }}>
                Cadastre, edite, ative ou desative usuários e gerencie perfis de acesso.
              </div>
            </div>
          </Link>
        )}
      </div>

      <style>{`.config-card:hover { border-color: var(--orange) !important; }`}</style>
    </div>
  )
}
