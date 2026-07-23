import { NavLink } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { paginasPermitidas } from '../../lib/permissions'
import comproveiLogo from '../../assets/comprovei-logo.jpg'
import {
  IconDashboard,
  IconClipboard,
  IconTruck,
  IconArchive,
  IconClock,
  IconAlert,
  IconFileText,
  IconUpload,
  IconSettings,
  IconLogout,
  IconFunnel,
  IconRoute,
  IconMegaphone,
  IconBell,
  IconEdit,
  IconTrendingUp,
  IconTrash2,
  IconTarget,
  IconShield,
} from '../ui/Icons'

const ICONS = {
  dashboard:      IconDashboard,
  operacao:       IconClipboard,
  motoristas:     IconTruck,
  historico:      IconArchive,
  leadtime:       IconClock,
  pendencias:     IconAlert,
  relatorios:     IconFileText,
  importacoes:    IconUpload,
  funil:          IconFunnel,
  gargalos:       IconClock,
  prazorotas:     IconRoute,
  comunicados:    IconMegaphone,
  alertas:        IconBell,
  alteracoes:     IconEdit,
  evolucao:       IconTrendingUp,
  evolucaomensal: IconTrendingUp,
  configuracoes:  IconSettings,
  lixeira:        IconTrash2,
  inteligencia:   IconTarget,
  pendencias_op:  IconAlert,
  governanca:     IconShield,
  rotas:          IconRoute,
  auditoria:      IconArchive,
  usuarios:       IconShield,
}

export default function Sidebar({ open, onClose }) {
  const { usuario, perfil, logout } = useAuth()
  const paginas = paginasPermitidas(perfil)

  async function handleLogout() {
    await logout()
  }

  const iniciais = (usuario?.nome || usuario?.email || '?')
    .trim()
    .charAt(0)
    .toUpperCase()

  return (
    <>
      <aside className={`sidebar${open ? ' open' : ''}`}>
        <div className="sidebar-logo">
          <img src={comproveiLogo} alt="COMPROVEI by nstech" />
          <div className="sidebar-brand">TNS Gestão de Entregas</div>
        </div>

        <nav className="sidebar-nav">
          {paginas.map((pagina) => {
            const Icon = ICONS[pagina.icon]
            return (
              <NavLink
                key={pagina.path}
                to={pagina.path}
                onClick={onClose}
                className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
              >
                {Icon && <Icon />}
                {pagina.label}
              </NavLink>
            )
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-user-avatar">{iniciais}</div>
            <div className="sidebar-user-info">
              <span className="sidebar-user-name">{usuario?.nome || usuario?.email}</span>
              <span className="sidebar-user-perfil" style={{
            textTransform:'capitalize', fontSize:11, padding:'1px 6px', borderRadius:10,
            background: perfil==='administrador'?'var(--orange)': perfil==='gestor'?'#2563eb':'var(--green)',
            color:'#fff', fontWeight:700,
          }}>{perfil}</span>
            </div>
          </div>
          <button type="button" className="sidebar-logout-btn" onClick={handleLogout}>
            <IconLogout width={15} height={15} />
            Sair
          </button>
        </div>
      </aside>

      <div className={`sidebar-backdrop${open ? ' open' : ''}`} onClick={onClose} />
    </>
  )
}
