import { Routes, Route, Navigate } from 'react-router-dom'
import Login from '../pages/Login'
import RedefinirSenha from '../pages/RedefinirSenha'
import Dashboard from '../pages/Dashboard'
import OperacaoDoDia from '../pages/OperacaoDoDia'
import OperacoesPendentes from '../pages/OperacoesPendentes'
import Motoristas from '../pages/Motoristas'
import Historico from '../pages/Historico'
import LeadTime from '../pages/LeadTime'
import Pendencias from '../pages/Pendencias'
import Relatorios from '../pages/Relatorios'
import Importacoes from '../pages/Importacoes'
import FunilOperacional from '../pages/FunilOperacional'
import GargalosOperacionais from '../pages/GargalosOperacionais'
import PrazoRotas from '../pages/PrazoRotas'
import ComunicadosOperacionais from '../pages/ComunicadosOperacionais'
import AlertasOperacionais from '../pages/AlertasOperacionais'
import AlteracoesOperacionais from '../pages/AlteracoesOperacionais'
import EvolucaoMotoristas from '../pages/EvolucaoMotoristas'
import EvolucaoMensal from '../pages/EvolucaoMensal'
import Configuracoes from '../pages/Configuracoes'
import Auditoria from '../pages/Auditoria'
import GestaoUsuarios from '../pages/GestaoUsuarios'
import GerenciarRotas from '../pages/GerenciarRotas'
import Lixeira from '../pages/Lixeira'
import CentroInteligencia from '../pages/CentroInteligencia'
import Governanca from '../pages/Governanca'
import NotFound from '../pages/NotFound'
import AppLayout from '../components/layout/AppLayout'
import RequireAuth from '../components/layout/RequireAuth'
import RequireProfile from '../components/layout/RequireProfile'

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/redefinir-senha" element={<RedefinirSenha />} />
      <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
        <Route path="/dashboard"               element={<RequireProfile><Dashboard /></RequireProfile>} />
        <Route path="/inteligencia"            element={<RequireProfile><CentroInteligencia /></RequireProfile>} />
        <Route path="/operacao"                element={<RequireProfile><OperacaoDoDia /></RequireProfile>} />
        <Route path="/pendencias-operacionais" element={<RequireProfile><OperacoesPendentes /></RequireProfile>} />
        <Route path="/motoristas"              element={<RequireProfile><Motoristas /></RequireProfile>} />
        <Route path="/historico"               element={<RequireProfile><Historico /></RequireProfile>} />
        <Route path="/leadtime"                element={<RequireProfile><LeadTime /></RequireProfile>} />
        <Route path="/pendencias"              element={<RequireProfile><Pendencias /></RequireProfile>} />
        <Route path="/relatorios"              element={<RequireProfile><Relatorios /></RequireProfile>} />
        <Route path="/importacoes"             element={<RequireProfile><Importacoes /></RequireProfile>} />
        <Route path="/funil"                   element={<RequireProfile><FunilOperacional /></RequireProfile>} />
        <Route path="/gargalos"                element={<RequireProfile><GargalosOperacionais /></RequireProfile>} />
        <Route path="/prazo-rotas"             element={<RequireProfile><PrazoRotas /></RequireProfile>} />
        <Route path="/comunicados"             element={<RequireProfile><ComunicadosOperacionais /></RequireProfile>} />
        <Route path="/alertas"                 element={<RequireProfile><AlertasOperacionais /></RequireProfile>} />
        <Route path="/alteracoes"              element={<RequireProfile><AlteracoesOperacionais /></RequireProfile>} />
        <Route path="/evolucao-motoristas"     element={<RequireProfile><EvolucaoMotoristas /></RequireProfile>} />
        <Route path="/evolucao-mensal"         element={<RequireProfile><EvolucaoMensal /></RequireProfile>} />
        <Route path="/governanca"              element={<RequireProfile><Governanca /></RequireProfile>} />
        <Route path="/lixeira"                 element={<RequireProfile><Lixeira /></RequireProfile>} />
        <Route path="/configuracoes"           element={<RequireProfile><Configuracoes /></RequireProfile>} />
        <Route path="/configuracoes/auditoria" element={<RequireProfile><Auditoria /></RequireProfile>} />
        <Route path="/configuracoes/usuarios"  element={<RequireProfile><GestaoUsuarios /></RequireProfile>} />
        <Route path="/configuracoes/gerenciar-rotas" element={<RequireProfile><GerenciarRotas /></RequireProfile>} />
      </Route>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
