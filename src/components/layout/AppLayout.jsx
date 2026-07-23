import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import { PAGINAS } from '../../lib/permissions'
import { IconMenu } from '../ui/Icons'
import './AppLayout.css'

export default function AppLayout() {
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  // Reflete o toggle de "Modo Manutenção" da tela de Governança (window
  // CustomEvent 'manutencao'). Ainda não há indicador visual no shell —
  // rastreado aqui para quando essa UI for definida.
  // eslint-disable-next-line no-unused-vars
  const [modoManutencao, setModoManutencao] = useState(() => sessionStorage.getItem('tns_modo_manutencao') === '1')

  useEffect(() => {
    function onM(e) { setModoManutencao(e.detail.ativo) }
    window.addEventListener('manutencao', onM)
    return () => window.removeEventListener('manutencao', onM)
  }, [])

  // Encontra a página mais ESPECÍFICA cujo path é prefixo da rota atual —
  // não a primeira do array. Sem isso, '/configuracoes/auditoria' faria
  // match com '/configuracoes' (que vem antes no array PAGINAS) e o
  // topbar mostraria o título errado para a sub-página.
  const paginaAtual = PAGINAS.filter((p) => location.pathname.startsWith(p.path)).sort(
    (a, b) => b.path.length - a.path.length
  )[0]
  const titulo = paginaAtual?.label || 'TNS Gestão de Entregas'

  return (
    <div className="app-shell">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="app-main">
        <header className="app-topbar">
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <button
              type="button"
              className="topbar-menu-btn"
              onClick={() => setSidebarOpen((v) => !v)}
              aria-label="Abrir menu"
            >
              <IconMenu width={20} height={20} />
            </button>
            <h2>{titulo}</h2>
          </div>
        </header>

        <main className="app-page">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
