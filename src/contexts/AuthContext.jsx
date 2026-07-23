/**
 * AuthContext.jsx — TNS Gestão de Entregas
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * CAUSA RAIZ DO 403 — CONFIRMADA VIA DEVTOOLS (Authorization: Bearer = anon key)
 *
 * O login() chamava signInWithPassword() e imediatamente consultava
 * public.usuarios para validar o perfil. Quando essa query retornava 403
 * (porque a policy RLS de usuarios usava fn_meu_perfil() recursiva),
 * o login() chamava signOut() — destruindo a sessão que havia acabado de
 * ser criada. Todas as queries subsequentes enviavam o anon key como Bearer.
 *
 * CORREÇÕES APLICADAS:
 *
 * 1. login() faz APENAS signInWithPassword(). Nenhuma query ao banco.
 *    Nenhum signOut(). Nunca.
 *
 * 2. O perfil é carregado exclusivamente pelo onAuthStateChange (evento
 *    SIGNED_IN), momento em que o access_token já está propagado e as
 *    queries REST usam role: authenticated.
 *
 * 3. TOKEN_REFRESHED é ignorado — não chama carregarPerfil() nem causa
 *    re-renders desnecessários em cascata.
 *
 * 4. useEffect com deps:[] — o listener nunca é recriado, eliminando
 *    a janela de tempo entre unsubscribe e nova subscrição.
 *
 * 5. carregarPerfil via useRef — identidade estável sem entrar nas deps
 *    do useEffect.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { supabase } from '../lib/supabaseClient'

const AuthContext = createContext(undefined)

// ─── helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function mensagemAmigavel(error) {
  const msg = (error?.message ?? '').toLowerCase()
  if (msg.includes('invalid login credentials') || msg.includes('invalid email or password')) {
    return 'E-mail ou senha incorretos. Verifique seus dados e tente novamente.'
  }
  if (msg.includes('email not confirmed')) {
    return 'Seu e-mail ainda não foi confirmado. Verifique sua caixa de entrada.'
  }
  if (msg.includes('too many requests') || msg.includes('rate limit')) {
    return 'Muitas tentativas em sequência. Aguarde alguns instantes e tente novamente.'
  }
  if (msg.includes('network') || msg.includes('fetch')) {
    return 'Não foi possível conectar ao servidor. Verifique sua internet.'
  }
  return 'Não foi possível concluir a operação. Tente novamente em instantes.'
}

// ─── provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }) {
  const [session, setSession]                     = useState(undefined)
  const [usuario, setUsuario]                     = useState(null)
  const [carregandoUsuario, setCarregandoUsuario] = useState(false)
  const [erroPerfil, setErroPerfil]               = useState(null)

  // ── carregarPerfil ─────────────────────────────────────────────────────────
  // Mantido como ref para não entrar nas deps do useEffect de inicialização.
  // Isso garante que o listener do onAuthStateChange é criado UMA VEZ e nunca
  // é recriado, eliminando a janela de tempo entre unsubscribe e nova subscrição.
  const carregarPerfilRef = useRef(null)
  carregarPerfilRef.current = async function carregarPerfil(userId) {
    if (!userId) {
      setUsuario(null)
      setErroPerfil(null)
      return
    }

    setCarregandoUsuario(true)
    setErroPerfil(null)

    // Retry com backoff: cobre latência entre SIGNED_IN e propagação do JWT
    // no contexto de cada conexão Supabase individual.
    const delays = [0, 300, 700]
    let ultimoErro = null

    for (let i = 0; i < delays.length; i++) {
      if (delays[i] > 0) await sleep(delays[i])

      const { data, error } = await supabase
        .from('usuarios')
        .select('id, nome, email, perfil, ativo, created_at')
        .eq('id', userId)
        .single()

      if (!error && data) {
        setUsuario(data)
        setErroPerfil(null)
        setCarregandoUsuario(false)
        return
      }

      ultimoErro = error
    }

    // Todas as tentativas falharam
    console.error('[AuthContext] carregarPerfil falhou:', ultimoErro)
    setUsuario(null)
    setCarregandoUsuario(false)

    if (ultimoErro?.code === 'PGRST116') {
      setErroPerfil(
        'Perfil não encontrado em public.usuarios. Certifique-se de que existe um registro com o mesmo ID do auth.users.'
      )
    } else {
      setErroPerfil(
        'Não foi possível carregar seu perfil de acesso. Contate o administrador de sistemas.'
      )
    }
  }

  // ── inicialização — listener único, deps:[] ────────────────────────────────
  useEffect(() => {
    let montado = true

    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!montado) return

      // TOKEN_REFRESHED: o cliente já renovou o token internamente via autoRefreshToken.
      // Não alterar nenhum estado — evita re-render em cascata e loops de queries.
      if (event === 'TOKEN_REFRESHED') return

      setSession(newSession ?? null)

      if (event === 'SIGNED_OUT' || !newSession?.user?.id) {
        setUsuario(null)
        setErroPerfil(null)
        setCarregandoUsuario(false)
        return
      }

      // INITIAL_SESSION, SIGNED_IN, USER_UPDATED:
      // O access_token já está propagado neste ponto — seguro fazer queries REST.
      if (
        event === 'INITIAL_SESSION' ||
        event === 'SIGNED_IN' ||
        event === 'USER_UPDATED'
      ) {
        carregarPerfilRef.current(newSession.user.id)
      }
    })

    return () => {
      montado = false
      listener.subscription.unsubscribe()
    }
  }, []) // deps:[] — listener criado UMA vez, nunca recriado

  // ── login ──────────────────────────────────────────────────────────────────
  // FAZ APENAS signInWithPassword(). Nenhuma query ao banco. Nenhum signOut().
  //
  // Motivo: logo após signInWithPassword() o access_token existe no cliente,
  // mas o onAuthStateChange(SIGNED_IN) ainda não disparou. Qualquer query REST
  // neste intervalo pode usar role incorreto dependendo da versão do SDK.
  // O carregamento do perfil e validação de ativo/perfil ocorrem exclusivamente
  // em carregarPerfilRef.current(), chamado pelo onAuthStateChange(SIGNED_IN).
  const login = useCallback(async (email, senha) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password: senha,
    })

    if (error) return { sucesso: false, mensagem: mensagemAmigavel(error) }

    return { sucesso: true }
  }, [])

  // ── logout ─────────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    await supabase.auth.signOut()
    // onAuthStateChange(SIGNED_OUT) vai limpar session, usuario e erroPerfil
  }, [])

  // ── senha ──────────────────────────────────────────────────────────────────
  const solicitarRedefinicaoSenha = useCallback(async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    })
    if (error) return { sucesso: false, mensagem: mensagemAmigavel(error) }
    return {
      sucesso: true,
      mensagem: 'Se este e-mail estiver cadastrado, você receberá um link para redefinir sua senha.',
    }
  }, [])

  const atualizarSenha = useCallback(async (novaSenha) => {
    const { error } = await supabase.auth.updateUser({ password: novaSenha })
    if (error) return { sucesso: false, mensagem: mensagemAmigavel(error) }
    return { sucesso: true }
  }, [])

  // ── contexto ───────────────────────────────────────────────────────────────
  const value = useMemo(
    () => ({
      session,
      usuario,
      autenticado: !!session,
      carregandoSessao: session === undefined,
      carregandoUsuario,
      erroPerfil,
      perfil: usuario?.perfil ?? null,
      isAdmin:    usuario?.perfil === 'administrador',
      isGestor:   usuario?.perfil === 'gestor',
      isOperador: usuario?.perfil === 'operador',
      login,
      logout,
      solicitarRedefinicaoSenha,
      atualizarSenha,
      recarregarPerfil: () => carregarPerfilRef.current(session?.user?.id),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session, usuario, carregandoUsuario, erroPerfil]
    // login/logout/senha omitidos das deps: useCallback([]) — nunca mudam de identidade
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components -- hook precisa viver junto do Provider/Context
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (ctx === undefined) {
    throw new Error('useAuth deve ser usado dentro de um <AuthProvider>')
  }
  return ctx
}
