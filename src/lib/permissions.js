// Definição central de perfis e permissões.
export const PERFIS = {
  ADMINISTRADOR: 'administrador',
  GESTOR:        'gestor',
  OPERADOR:      'operador',
}

const A = PERFIS.ADMINISTRADOR
const G = PERFIS.GESTOR
const O = PERFIS.OPERADOR

export const PAGINAS = [
  { path: '/dashboard',               label: 'Dashboard',               icon: 'dashboard',      perfis: [A, G, O] },
  { path: '/inteligencia',            label: 'Centro de Inteligência',  icon: 'inteligencia',   perfis: [A, G] },
  { path: '/operacao',                label: 'Operação do Dia',         icon: 'operacao',       perfis: [A, G, O] },
  { path: '/pendencias-operacionais', label: 'Pendências Op.',          icon: 'pendencias_op',  perfis: [A, G, O] },
  { path: '/motoristas',              label: 'Motoristas',              icon: 'motoristas',     perfis: [A, G, O] },
  { path: '/historico',               label: 'Histórico',               icon: 'historico',      perfis: [A, G, O] },
  { path: '/leadtime',                label: 'Lead Time',               icon: 'leadtime',       perfis: [A, G, O] },
  { path: '/pendencias',              label: 'Pendências',              icon: 'pendencias',     perfis: [A, G, O] },
  { path: '/relatorios',              label: 'Relatórios',              icon: 'relatorios',     perfis: [A, G] },
  { path: '/importacoes',             label: 'Importações',             icon: 'importacoes',    perfis: [A, G] },
  { path: '/funil',                   label: 'Funil Operacional',       icon: 'funil',          perfis: [A, G] },
  { path: '/gargalos',                label: 'Gargalos / SLA',          icon: 'gargalos',       perfis: [A, G] },
  { path: '/prazo-rotas',             label: 'Prazo de Rotas',          icon: 'prazorotas',     perfis: [A] },
  { path: '/comunicados',             label: 'Comunicados',             icon: 'comunicados',    perfis: [A, G, O] },
  { path: '/alertas',                 label: 'Alertas',                 icon: 'alertas',        perfis: [A, G, O] },
  { path: '/alteracoes',              label: 'Alterações do Dia',       icon: 'alteracoes',     perfis: [A, G, O] },
  { path: '/evolucao-motoristas',     label: 'Evolução dos Motoristas', icon: 'evolucao',       perfis: [A, G] },
  { path: '/evolucao-mensal',         label: 'Evolução Mensal',         icon: 'evolucaomensal', perfis: [A, G] },
  { path: '/governanca',              label: 'Governança',              icon: 'governanca',     perfis: [A] },
  { path: '/configuracoes',           label: 'Configurações',           icon: 'configuracoes',  perfis: [A] },
  { path: '/lixeira',                 label: 'Lixeira',                 icon: 'lixeira',        perfis: [A] },
  { path: '/configuracoes/auditoria',       label: 'Histórico de Alterações', icon: 'auditoria', perfis: [A], ocultoNoMenu: true },
  { path: '/configuracoes/usuarios',        label: 'Usuários e Permissões',   icon: 'usuarios',  perfis: [A], ocultoNoMenu: true },
  { path: '/configuracoes/gerenciar-rotas', label: 'Gerenciar Rotas',         icon: 'rotas',     perfis: [A], ocultoNoMenu: true },
]

export function paginasPermitidas(perfil) {
  return PAGINAS.filter(p => p.perfis.includes(perfil) && !p.ocultoNoMenu)
}

export function podeAcessar(path, perfil) {
  const pagina = PAGINAS.find(p => p.path === path)
  if (!pagina) return false
  return pagina.perfis.includes(perfil)
}

export const PODE = {
  criar:           [A, O],
  editar:          [A, O],
  excluir:         [A],
  importar:        [A],
  exportar:        [A, G],
  configurar:      [A],
  gerenciarUsers:  [A],
  marcarPendente:  [A, O],
  finalizar:       [A, O],
}

export function podeFazer(acao, perfil) {
  return (PODE[acao] ?? []).includes(perfil)
}
