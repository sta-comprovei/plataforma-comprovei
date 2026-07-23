import { supabase } from './supabaseClient'
import { moverParaLixeira } from './lixeiraService'

/**
 * Camada de acesso a dados para o módulo de Motoristas.
 * Nenhum componente de UI deve chamar `supabase` diretamente para esta
 * entidade — toda query passa por aqui, o que facilita manutenção e troca
 * de fonte de dados no futuro, se necessário.
 */

const TABELA = 'motoristas'

const COLUNAS = 'id, codigo, nome, cpf, ativo, created_at, updated_at'

/**
 * Escapa os curingas do ILIKE (% e _) para que um termo de pesquisa não
 * seja acidentalmente interpretado como padrão quando contém esses
 * caracteres literalmente (ex.: um código de motorista com underscore).
 * Única fonte de verdade para esse escape — usada tanto pela pesquisa
 * (listarMotoristas) quanto pelas comparações exatas (codigoJaExiste,
 * buscarMotoristaPorCodigo).
 */
function escaparCuringasILike(valor) {
  return valor.replace(/[%_]/g, (c) => `\\${c}`)
}

/**
 * Traduz erros do Postgres/Supabase para mensagens amigáveis em português.
 */
function mensagemAmigavel(error) {
  const code = error?.code
  const msg = (error?.message || '').toLowerCase()

  // unique_violation
  if (code === '23505') {
    if (msg.includes('codigo')) {
      return 'Já existe um motorista cadastrado com este código.'
    }
    if (msg.includes('cpf')) {
      return 'Já existe um motorista cadastrado com este CPF.'
    }
    return 'Já existe um registro com estes dados.'
  }

  // foreign_key_violation (ex.: excluir motorista com operações vinculadas)
  if (code === '23503') {
    return 'Não é possível excluir: este motorista possui operações vinculadas. Inative-o em vez de excluir.'
  }

  // exceções customizadas levantadas pelo trigger (raise exception)
  if (msg.includes('código do motorista é obrigatório')) {
    return 'O código do motorista é obrigatório.'
  }
  if (msg.includes('nome do motorista é obrigatório')) {
    return 'O nome do motorista é obrigatório.'
  }
  if (msg.includes('cpf inválido')) {
    return 'CPF inválido. Verifique os números digitados.'
  }

  if (msg.includes('network')) {
    return 'Não foi possível conectar ao servidor. Verifique sua internet.'
  }

  return 'Não foi possível concluir a operação. Tente novamente em instantes.'
}

/**
 * Lista motoristas com pesquisa, filtro de situação, ordenação e paginação.
 *
 * @param {Object} params
 * @param {string} [params.busca] - termo de busca (código OU nome)
 * @param {'todos'|'ativo'|'inativo'} [params.situacao]
 * @param {{coluna: string, direcao: 'asc'|'desc'}} [params.ordenacao]
 * @param {number} [params.pagina] - 1-indexed
 * @param {number} [params.porPagina]
 */
export async function listarMotoristas({
  busca = '',
  situacao = 'todos',
  ordenacao = { coluna: 'nome', direcao: 'asc' },
  pagina = 1,
  porPagina = 10,
} = {}) {
  const inicio = (pagina - 1) * porPagina
  const fim = inicio + porPagina - 1

  let query = supabase.from(TABELA).select(COLUNAS, { count: 'exact' })

  const termo = busca.trim()
  if (termo) {
    // pesquisa simultânea por código OU nome (case-insensitive).
    // Escapa os curingas do ILIKE (% e _) e, adicionalmente, os
    // delimitadores , ( ) da sintaxe .or() do PostgREST — sem isso, um
    // termo de busca contendo esses caracteres quebraria o filtro ou
    // seria interpretado como múltiplas condições.
    const termoEscapado = escaparCuringasILike(termo).replace(/[,()]/g, (c) => `\\${c}`)
    query = query.or(`codigo.ilike.%${termoEscapado}%,nome.ilike.%${termoEscapado}%`)
  }

  if (situacao === 'ativo') {
    query = query.eq('ativo', true)
  } else if (situacao === 'inativo') {
    query = query.eq('ativo', false)
  }

  query = query
    .order(ordenacao.coluna, { ascending: ordenacao.direcao === 'asc' })
    .range(inicio, fim)

  const { data, error, count } = await query

  if (error) {
    return { dados: [], total: 0, erro: mensagemAmigavel(error) }
  }

  return { dados: data ?? [], total: count ?? 0, erro: null }
}

/**
 * Busca um único motorista pelo código exato (case-insensitive).
 * Usado pela Operação do Dia (Etapa 3) para auto-preenchimento.
 */
export async function buscarMotoristaPorCodigo(codigo) {
  const termo = (codigo || '').trim()
  if (!termo) return { dados: null, erro: null }

  const { data, error } = await supabase
    .from(TABELA)
    .select(COLUNAS)
    .ilike('codigo', escaparCuringasILike(termo))
    .maybeSingle()

  if (error) {
    return { dados: null, erro: mensagemAmigavel(error) }
  }

  return { dados: data, erro: null }
}

/**
 * Verifica rapidamente se um código já está em uso (para validação client-side
 * antes de submeter o formulário). `ignorarId` permite excluir o próprio
 * registro da checagem durante uma edição.
 */
export async function codigoJaExiste(codigo, ignorarId = null) {
  const termo = (codigo || '').trim()
  if (!termo) return false

  let query = supabase
    .from(TABELA)
    .select('id')
    .ilike('codigo', escaparCuringasILike(termo))
    .limit(1)
  if (ignorarId) {
    query = query.neq('id', ignorarId)
  }

  const { data, error } = await query
  if (error) return false
  return (data?.length ?? 0) > 0
}

export async function criarMotorista({ codigo, nome, cpf }) {
  const { data, error } = await supabase
    .from(TABELA)
    .insert({
      codigo: codigo?.trim(),
      nome: nome?.trim(),
      cpf: cpf?.trim() || null,
    })
    .select(COLUNAS)
    .single()

  if (error) {
    return { dados: null, erro: mensagemAmigavel(error) }
  }
  return { dados: data, erro: null }
}

export async function atualizarMotorista(id, { codigo, nome, cpf }) {
  const { data, error } = await supabase
    .from(TABELA)
    .update({
      codigo: codigo?.trim(),
      nome: nome?.trim(),
      cpf: cpf?.trim() || null,
    })
    .eq('id', id)
    .select(COLUNAS)
    .single()

  if (error) {
    return { dados: null, erro: mensagemAmigavel(error) }
  }
  return { dados: data, erro: null }
}

export async function definirSituacaoMotorista(id, ativo) {
  const { data, error } = await supabase
    .from(TABELA)
    .update({ ativo })
    .eq('id', id)
    .select(COLUNAS)
    .single()

  if (error) {
    return { dados: null, erro: mensagemAmigavel(error) }
  }
  return { dados: data, erro: null }
}

export async function excluirMotorista(id, nomeUsuario) {
  // 1. Buscar snapshot completo antes de deletar
  const { data: snapshot, error: errSnap } = await supabase
    .from(TABELA).select('*').eq('id', id).single()
  if (errSnap) return { sucesso: false, erro: mensagemAmigavel(errSnap) }

  // 2. Mover para a lixeira
  const descricao = `Motorista: ${snapshot.nome}${snapshot.codigo ? ` (Cód. ${snapshot.codigo})` : ''}`
  const { erro: errLix } = await moverParaLixeira('motoristas', id, descricao, snapshot, nomeUsuario)
  if (errLix) return { sucesso: false, erro: errLix }

  // 3. Excluir fisicamente
  const { error } = await supabase.from(TABELA).delete().eq('id', id)
  if (error) return { sucesso: false, erro: mensagemAmigavel(error) }
  return { sucesso: true, erro: null }
}
