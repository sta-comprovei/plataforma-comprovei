/**
 * usuariosService.js
 * Camada de acesso a dados para o módulo de Gestão de Usuários.
 *
 * ARQUITETURA:
 *   Leitura  → supabase.rpc() com funções SECURITY DEFINER (migration 0021)
 *   Escrita em auth.users → supabase.functions.invoke() (Admin API via Edge Functions)
 *   Escrita em public.usuarios → supabase.rpc() com funções SECURITY DEFINER
 *
 * Edge Functions deployadas:
 *   admin-criar-usuario      → cria auth.users + public.usuarios
 *   admin-atualizar-email    → atualiza email em auth.users + public.usuarios
 *   admin-redefinir-senha    → redefine senha em auth.users
 *   admin-excluir-usuario    → remove de auth.users + public.usuarios
 *
 * Funções RPC (migration 0021) — nunca escrevem em auth.users:
 *   fn_listar_usuarios_admin    → leitura com JOIN auth.users (last_sign_in_at)
 *   fn_atualizar_dados_usuario  → UPDATE public.usuarios (nome, perfil, ativo)
 *   fn_validar_exclusao_usuario → valida regras sem escrever
 *   fn_contar_admins_ativos     → COUNT para proteção do último admin
 */
import { supabase } from './supabaseClient'

// ── Constantes ──────────────────────────────────────────────────────────────────

export const PERFIS_USUARIO = [
  { valor: 'administrador', label: 'Administrador' },
  { valor: 'gestor',        label: 'Gestor'        },
  { valor: 'operador',      label: 'Operador'      },
]

export const LABEL_PERFIL = {
  administrador: 'Administrador',
  gestor:        'Gestor',
  operador:      'Operador',
}

// ── Tratamento de erro ──────────────────────────────────────────────────────────────────

function mensagem(error) {
  if (!error) return 'Erro desconhecido.'
  const msg = (error.message || '').toLowerCase()
  if (msg.includes('único administrador') ||
      msg.includes('e-mail já está cadastrado') ||
      msg.includes('própria conta') ||
      msg.includes('acesso restrito') ||
      msg.includes('não encontrado')) {
    return error.message
  }
  if (msg.includes('network') || msg.includes('fetch')) return 'Erro de conexão.'
  return error.message || 'Não foi possível concluir a operação.'
}

async function invocarEdgeFunction(nome, corpo) {
  const { data, error } = await supabase.functions.invoke(nome, { body: corpo })
  if (error) return { dados: null, erro: error.message || 'Erro na Edge Function.' }
  if (data?.erro) return { dados: null, erro: data.erro }
  return { dados: data, erro: null }
}

// ── LISTAGEM ─────────────────────────────────────────────────────────────────────────────

export async function listarUsuarios({
  busca     = '',
  perfil    = '',
  ativo     = null,
  pagina    = 1,
  porPagina = 20,
} = {}) {
  const offset = (pagina - 1) * porPagina
  const { data, error } = await supabase.rpc('fn_listar_usuarios_admin', {
    p_busca:   busca  || null,
    p_perfil:  perfil || null,
    p_ativo:   ativo,
    p_limite:  porPagina,
    p_offset:  offset,
  })
  if (error) return { dados: [], total: 0, erro: mensagem(error) }
  const total = data?.[0]?.total ?? 0
  return { dados: data ?? [], total: Number(total), erro: null }
}

// ── CRIAR ─────────────────────────────────────────────────────────────────────────────

export async function criarUsuario({ nome, email, senha, perfil }) {
  if (!nome?.trim())    return { dados: null, erro: 'Nome é obrigatório.' }
  if (!email?.trim())   return { dados: null, erro: 'E-mail é obrigatório.' }
  if (!senha)           return { dados: null, erro: 'Senha é obrigatória.' }
  if (senha.length < 8) return { dados: null, erro: 'A senha deve ter ao menos 8 caracteres.' }
  if (!perfil)          return { dados: null, erro: 'Perfil é obrigatório.' }

  return invocarEdgeFunction('admin-criar-usuario', {
    nome:   nome.trim(),
    email:  email.trim().toLowerCase(),
    senha,
    perfil,
  })
}

// ── ATUALIZAR DADOS (nome, perfil, ativo) ──────────────────────────────────────────────────

export async function atualizarDadosUsuario(id, { nome, perfil, ativo }) {
  if (!id) return { erro: 'ID do usuário é obrigatório.' }
  const { error } = await supabase.rpc('fn_atualizar_dados_usuario', {
    p_id:     id,
    p_nome:   nome?.trim()  ?? null,
    p_perfil: perfil        ?? null,
    p_ativo:  ativo         ?? null,
  })
  if (error) return { erro: mensagem(error) }
  return { erro: null }
}

// ── ATUALIZAR E-MAIL (via Edge Function) ─────────────────────────────────────────────────

export async function atualizarEmailUsuario(id, novoEmail) {
  if (!id || !novoEmail) return { erro: 'ID e e-mail são obrigatórios.' }
  return invocarEdgeFunction('admin-atualizar-email', {
    usuario_id: id,
    novo_email: novoEmail.trim().toLowerCase(),
  })
}

// ── REDEFINIR SENHA (via Edge Function) ──────────────────────────────────────────────────

export async function redefinirSenha(usuarioId, novaSenha) {
  if (!novaSenha)           return { erro: 'Nova senha é obrigatória.' }
  if (novaSenha.length < 8) return { erro: 'A senha deve ter ao menos 8 caracteres.' }
  return invocarEdgeFunction('admin-redefinir-senha', {
    usuario_id: usuarioId,
    nova_senha: novaSenha,
  })
}

// ── EXCLUIR (via Edge Function) ───────────────────────────────────────────────────────────

export async function excluirUsuario(usuarioId) {
  if (!usuarioId) return { erro: 'ID do usuário é obrigatório.' }
  return invocarEdgeFunction('admin-excluir-usuario', { usuario_id: usuarioId })
}

// ── CONTAGEM DE ADMINS ────────────────────────────────────────────────────────────────

export async function contarAdminsAtivos(excluirId = null) {
  const { data, error } = await supabase.rpc('fn_contar_admins_ativos', {
    excluir_id: excluirId,
  })
  if (error) return 0
  return data ?? 0
}
