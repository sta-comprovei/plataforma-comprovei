import { supabase } from './supabaseClient'
import {
  validarArquivoBasico,
  calcularHashArquivo,
  lerEValidarCSV,
  lerEValidarXLSX,
  COLUNAS_OBRIGATORIAS_COMPROVEI,
  COLUNAS_OBRIGATORIAS_ROTINA,
  COLUNAS_OBRIGATORIAS_DESEMPENHO,
} from './fileParsingUtils'
import { importarRegistrosRotina, importarRegistrosComprovei } from './funilService'
import { importarDesempenhoMotoristas } from './evolucaoMotoristasService'

/**
 * Camada de acesso a dados para o módulo de Importações (Etapa 8).
 *
 * Escopo desta etapa, conforme requisito explícito ("apenas criar a
 * infraestrutura de importação... não implementar o Funil Operacional"):
 * registra METADADOS de cada tentativa de importação (arquivo, usuário,
 * data, resultado da validação) e mantém um índice de deduplicação por
 * hash de conteúdo — não processa nem persiste o conteúdo de negócio
 * das linhas do arquivo (isso é trabalho de uma etapa futura, quando o
 * Funil Operacional for implementado).
 *
 * O arquivo binário original também NÃO é armazenado nesta etapa (nem
 * em Supabase Storage): persistir um bucket exigiria configuração de
 * infraestrutura fora do alcance de uma migration SQL pura (criação de
 * bucket + policies de storage.objects normalmente feitas via painel/
 * API, não SQL simples) — mesma categoria de risco já identificada e
 * evitada na Etapa 6 com Supabase Realtime. Documentado como extensão
 * natural para quando a integração real for implementada.
 */

const TABELA_HISTORICO = 'historico_importacoes'
const TABELA_CONTROLE = 'arquivos_importados_controle'

export const ORIGENS_IMPORTACAO = {
  COMPROVEI: 'comprovei',
  ROTINA: 'rotina',
  FUNIL_OPERACIONAL: 'funil_operacional',
  DESEMPENHO_MOTORISTAS: 'desempenho_motoristas',
  OUTRO: 'outro',
}

export const ROTULOS_ORIGEM_IMPORTACAO = {
  comprovei: 'Comprovei',
  rotina: 'Rotina/Vendas',
  funil_operacional: 'Funil Operacional',
  desempenho_motoristas: 'Desempenho de Motoristas',
  outro: 'Outro',
}

export const ROTULOS_STATUS_IMPORTACAO = {
  processando: 'Processando',
  concluido: 'Concluído',
  concluido_com_avisos: 'Concluído com avisos',
  erro: 'Erro',
  duplicado_bloqueado: 'Duplicado (bloqueado)',
}

export const COLUNAS_POR_ORIGEM = {
  [ORIGENS_IMPORTACAO.COMPROVEI]: COLUNAS_OBRIGATORIAS_COMPROVEI,
  [ORIGENS_IMPORTACAO.ROTINA]: COLUNAS_OBRIGATORIAS_ROTINA,
  [ORIGENS_IMPORTACAO.DESEMPENHO_MOTORISTAS]: COLUNAS_OBRIGATORIAS_DESEMPENHO,
  [ORIGENS_IMPORTACAO.OUTRO]: [],
}

function mensagemAmigavel(error) {
  const msg = (error?.message || '').toLowerCase()
  if (msg.includes('network') || msg.includes('failed to fetch')) {
    return 'Não foi possível conectar ao servidor. Verifique sua internet.'
  }
  if (msg.includes('permission denied') || msg.includes('rls')) {
    return 'Você não tem permissão para realizar esta ação.'
  }
  // Retorna a mensagem real do Supabase/PostgreSQL para facilitar diagnóstico.
  // Erros comuns: violação de FK, coluna inexistente, tipo incompatível.
  if (error?.message) {
    return error.message
  }
  return 'Não foi possível concluir a operação. Tente novamente em instantes.'
}

const COLUNAS_HISTORICO =
  'id, nome_arquivo, tamanho_bytes, tipo_arquivo, hash_conteudo, origem, status, ' +
  'total_registros, registros_validos, registros_invalidos, registros_duplicados_no_arquivo, ' +
  'mensagem_resultado, detalhes_erros, arquivo_controle_id, usuario_id, nome_usuario, created_at'

/**
 * Lista o histórico de importações, mais recente primeiro. Disponível
 * para qualquer usuário ativo (administrador e operador) — RLS já
 * garante isso no banco; aqui não há filtro de perfil porque "Operador:
 * apenas visualização do histórico" significa que ele PODE ver, só não
 * pode disparar uma nova importação (ver `podeImportar` no componente,
 * que usa `isAdmin` do AuthContext).
 */
export async function listarHistoricoImportacoes({ pagina = 1, porPagina = 15 } = {}) {
  const inicio = (pagina - 1) * porPagina
  const fim = inicio + porPagina - 1

  const { data, error, count } = await supabase
    .from(TABELA_HISTORICO)
    .select(COLUNAS_HISTORICO, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(inicio, fim)

  if (error) {
    return { dados: [], total: 0, erro: mensagemAmigavel(error) }
  }
  return { dados: data ?? [], total: count ?? 0, erro: null }
}

/**
 * Verifica se um hash de conteúdo já foi importado com sucesso antes.
 * Usado para avisar o usuário ANTES de tentar enviar — "nenhum arquivo
 * poderá sobrescrever dados existentes sem validação" — não impede a
 * checagem em si, só a importação silenciosa do mesmo conteúdo.
 */
export async function verificarArquivoJaImportado(hashConteudo) {
  const { data, error } = await supabase
    .from(TABELA_CONTROLE)
    .select('id, nome_arquivo, total_registros, created_at')
    .eq('hash_conteudo', hashConteudo)
    .maybeSingle()

  if (error) {
    return { jaImportado: false, dados: null, erro: mensagemAmigavel(error) }
  }
  return { jaImportado: !!data, dados: data, erro: null }
}

/**
 * Registra uma tentativa de importação no histórico. `status` já deve
 * vir resolvido pelo chamador (concluido / concluido_com_avisos / erro
 * / duplicado_bloqueado) — esta função só persiste, não decide.
 */
async function registrarHistorico(payload) {
  const { data, error } = await supabase.from(TABELA_HISTORICO).insert(payload).select(COLUNAS_HISTORICO).single()

  if (error) {
    return { dados: null, erro: mensagemAmigavel(error) }
  }
  return { dados: data, erro: null }
}

async function registrarNoControle({ hashConteudo, nomeArquivo, tamanhoBytes, origem, totalRegistros, primeiraImportacaoId }) {
  // Evita violar a constraint UNIQUE em hash_conteudo: isso acontece
  // legitimamente quando o usuário confirma reimportar um conteúdo já
  // conhecido (fluxo "duplicado, mas importar mesmo assim") — nesse
  // caso o hash já está no índice de controle, e não há nada novo a
  // registrar aqui (a nova tentativa já está em historico_importacoes,
  // só não se torna a "primeira_importacao_id" referenciada).
  const existente = await verificarArquivoJaImportado(hashConteudo)
  if (existente.jaImportado) {
    return { erro: null }
  }

  const { error } = await supabase.from(TABELA_CONTROLE).insert({
    hash_conteudo: hashConteudo,
    nome_arquivo: nomeArquivo,
    tamanho_bytes: tamanhoBytes,
    origem,
    total_registros: totalRegistros,
    primeira_importacao_id: primeiraImportacaoId,
  })
  // Falha ao registrar no índice de controle não deve derrubar a
  // importação em si (que já foi registrada no histórico) — só
  // significa que a deduplicação por hash não vai pegar esta entrada
  // especificamente. Retorna o erro para o chamador decidir se avisa o
  // usuário, mas não interrompe o fluxo principal.
  return { erro: error ? mensagemAmigavel(error) : null }
}

/**
 * Orquestra uma tentativa completa de importação: validação estrutural
 * → cálculo de hash → checagem de duplicata → parsing/validação de
 * conteúdo → registro no histórico (+ índice de controle, se bem
 * sucedida). Retorna o registro de histórico criado, sempre — mesmo em
 * caso de erro de validação, para que o usuário veja o motivo na tela.
 *
 * @param {File} file
 * @param {string} origem - uma das chaves de ORIGENS_IMPORTACAO
 * @param {boolean} [confirmarDuplicata] - true quando o usuário já viu o aviso de duplicata e decidiu prosseguir mesmo assim
 */
export async function processarImportacao(file, origem, confirmarDuplicata = false, competencia = null) {
  const validacaoBasica = validarArquivoBasico(file)
  if (!validacaoBasica.valido) {
    const resultado = await registrarHistorico({
      nome_arquivo: file?.name || 'desconhecido',
      tamanho_bytes: file?.size || 0,
      tipo_arquivo: file?.name?.split('.').pop()?.toLowerCase() || 'desconhecido',
      hash_conteudo: null,
      origem,
      status: 'erro',
      total_registros: 0,
      registros_validos: 0,
      registros_invalidos: 0,
      registros_duplicados_no_arquivo: 0,
      mensagem_resultado: validacaoBasica.erro,
      detalhes_erros: [],
    })
    return { sucesso: false, erro: validacaoBasica.erro, registro: resultado.dados, duplicata: null }
  }

  const buffer = await file.arrayBuffer()
  const hash = await calcularHashArquivo(buffer)

  if (!confirmarDuplicata) {
    const checagem = await verificarArquivoJaImportado(hash)
    if (checagem.jaImportado) {
      const resultado = await registrarHistorico({
        nome_arquivo: file.name,
        tamanho_bytes: file.size,
        tipo_arquivo: validacaoBasica.extensao,
        hash_conteudo: hash,
        origem,
        status: 'duplicado_bloqueado',
        total_registros: 0,
        registros_validos: 0,
        registros_invalidos: 0,
        registros_duplicados_no_arquivo: 0,
        mensagem_resultado: `Este arquivo já foi importado em ${new Date(checagem.dados.created_at).toLocaleDateString('pt-BR')} (${checagem.dados.nome_arquivo}).`,
        detalhes_erros: [],
      })
      return {
        sucesso: false,
        erro: null,
        registro: resultado.dados,
        duplicata: checagem.dados,
      }
    }
  }

  const colunasObrigatorias = COLUNAS_POR_ORIGEM[origem] || []
  const resultadoValidacao =
    validacaoBasica.extensao === 'csv'
      ? await lerEValidarCSV(file, colunasObrigatorias)
      : await lerEValidarXLSX(file, colunasObrigatorias)

  if (!resultadoValidacao.valido) {
    const resultado = await registrarHistorico({
      nome_arquivo: file.name,
      tamanho_bytes: file.size,
      tipo_arquivo: validacaoBasica.extensao,
      hash_conteudo: hash,
      origem,
      status: 'erro',
      total_registros: resultadoValidacao.totalLinhas || 0,
      registros_validos: 0,
      registros_invalidos: resultadoValidacao.registrosInvalidos || 0,
      registros_duplicados_no_arquivo: 0,
      mensagem_resultado: resultadoValidacao.erro,
      detalhes_erros: resultadoValidacao.detalhesErros || [],
    })
    return { sucesso: false, erro: resultadoValidacao.erro, registro: resultado.dados, duplicata: null }
  }

  const temAvisos =
    (resultadoValidacao.registrosInvalidos || 0) > 0 || (resultadoValidacao.duplicados || 0) > 0
  const status = temAvisos ? 'concluido_com_avisos' : 'concluido'

  const mensagemResultado = temAvisos
    ? `Importação concluída com avisos: ${resultadoValidacao.registrosValidos} registro(s) válido(s), ${resultadoValidacao.registrosInvalidos} inválido(s), ${resultadoValidacao.duplicados} duplicado(s) no arquivo.`
    : `Importação concluída com sucesso: ${resultadoValidacao.registrosValidos} registro(s) válido(s).`

  const resultadoHistorico = await registrarHistorico({
    nome_arquivo: file.name,
    tamanho_bytes: file.size,
    tipo_arquivo: validacaoBasica.extensao,
    hash_conteudo: hash,
    origem,
    status,
    total_registros: resultadoValidacao.totalLinhas ?? 0,
    registros_validos: resultadoValidacao.registrosValidos ?? 0,
    registros_invalidos: resultadoValidacao.registrosInvalidos ?? 0,
    registros_duplicados_no_arquivo: resultadoValidacao.duplicados ?? 0,
    mensagem_resultado: mensagemResultado,
    detalhes_erros: resultadoValidacao.detalhesErros || [],
  })

  if (resultadoHistorico.erro) {
    return { sucesso: false, erro: resultadoHistorico.erro, registro: null, duplicata: null }
  }

  // Registra no índice de deduplicação só após o histórico ter sido
  // gravado com sucesso — primeira_importacao_id aponta para o
  // registro que acabou de ser criado.
  await registrarNoControle({
    hashConteudo: hash,
    nomeArquivo: file.name,
    tamanhoBytes: file.size,
    origem,
    totalRegistros: resultadoValidacao.totalLinhas ?? 0,
    primeiraImportacaoId: resultadoHistorico.dados.id,
  })

  // Despacho para Funil Operacional ou Histórico de Desempenho.
  let resultadoFunil = null
  if (resultadoValidacao.linhas && resultadoValidacao.linhas.length > 0) {
    if (origem === ORIGENS_IMPORTACAO.ROTINA) {
      resultadoFunil = await importarRegistrosRotina(resultadoValidacao.linhas, resultadoHistorico.dados.id)
    } else if (origem === ORIGENS_IMPORTACAO.COMPROVEI) {
      resultadoFunil = await importarRegistrosComprovei(resultadoValidacao.linhas, resultadoHistorico.dados.id)
    } else if (origem === ORIGENS_IMPORTACAO.DESEMPENHO_MOTORISTAS) {
      resultadoFunil = await importarDesempenhoMotoristas(resultadoValidacao.linhas, competencia, resultadoHistorico.dados.id)
    }
  }

  // Se o funil retornou erros, propagar como aviso mas manter sucesso=true
  // (o histórico de importação já foi registrado com sucesso)
  if (resultadoFunil?.erros?.length > 0) {
    return {
      sucesso: true,
      erro: null,
      registro: resultadoHistorico.dados,
      duplicata: null,
      funil: resultadoFunil,
      avisoFunil: resultadoFunil.erros.join(' | '),
    }
  }

  return { sucesso: true, erro: null, registro: resultadoHistorico.dados, duplicata: null, funil: resultadoFunil }
}

export async function excluirImportacao(id) {
  if (!id) return { erro: 'ID obrigatório.' }
  const { data, error } = await supabase.rpc('fn_excluir_importacao', { p_id: id })
  if (error) return { erro: error.message || 'Não foi possível excluir o arquivo.' }
  if (!data?.ok) return { erro: data?.erro || 'Não foi possível excluir o arquivo.' }
  return { erro: null, tabelasAfetadas: data.tabelas_afetadas }
}
