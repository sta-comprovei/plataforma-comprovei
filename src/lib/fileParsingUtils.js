/**
 * Parsing e validação de arquivos para o módulo de Importações.
 * Roda inteiramente no navegador, sem servidor intermediário.
 *
 * Suporta CSV e XLSX com o mesmo fluxo completo:
 *   - CSV:  parseado diretamente como texto (UTF-8, delimitador auto-detectado)
 *   - XLSX: lido via SheetJS (xlsx-0.20.3, instalado como tarball local —
 *           ver instruções no bloco XLSX abaixo)
 *
 * Ambos os formatos retornam o mesmo shape de objeto, garantindo que
 * validação de colunas, contagem de registros e despacho para o Funil
 * Operacional funcionem identicamente para CSV e XLSX.
 *
 * Hash SHA-256 calculado via Web Crypto API (nativa do navegador) para
 * deduplicação de arquivos importados.
 *
 * ANTES DO DEPLOY — instale o SheetJS via tarball (versão sem CVEs):
 *   curl -o xlsx-0.20.3.tgz https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
 *   npm install --save ./xlsx-0.20.3.tgz
 * Por que não `npm install xlsx`? O pacote no registro npm (v0.18.5, 4 anos
 * sem atualização) tem CVEs ativos: CVE-2023-30533 e CVE-2024-22363 (ambos
 * alta severidade). A versão corrigida 0.20.3 só está em cdn.sheetjs.com.
 */
import * as XLSX from 'xlsx'

// Colunas obrigatórias do arquivo Comprovei (documentSAC CSV/XLS).
// Derivadas dos aliases primários de MAPA_COMPROVEI em funilService.js:
//   'Pedido'       → MAPA_COMPROVEI.numped
//   'Status'       → MAPA_COMPROVEI.status_entrega
//   'Motorista'    → MAPA_COMPROVEI.motorista
//   'Data da rota' → MAPA_COMPROVEI.data_rota
// A verificação em lerEValidarCSV/lerEValidarXLSX é case-insensitive (col.toLowerCase()),
// portanto 'Data da rota' casa com o cabeçalho real independente de capitalização.
export const COLUNAS_OBRIGATORIAS_COMPROVEI = ['Pedido', 'Status', 'Motorista', 'Data Finalização']
export const COLUNAS_OBRIGATORIAS_ROTINA = ['NUMPED']
// Colunas mínimas do relatório Gerencial motoristas do Comprovei (.xls)
// Nomes reais confirmados por análise do arquivo: MOTORISTA, QUALIDADE, ROTAS
export const COLUNAS_OBRIGATORIAS_DESEMPENHO = ['MOTORISTA', 'QUALIDADE', 'ROTAS']

const TAMANHO_MAXIMO_BYTES = 20 * 1024 * 1024 // 20 MB — limite razoável para evitar travar o navegador

function normalizarExtensao(nomeArquivo) {
  const partes = nomeArquivo.toLowerCase().split('.')
  return partes.length > 1 ? partes[partes.length - 1] : ''
}

/**
 * Calcula o hash SHA-256 do conteúdo do arquivo via Web Crypto API
 * (nativa do navegador, sem dependência). Usado para deduplicação —
 * identifica o MESMO conteúdo mesmo que o usuário renomeie o arquivo.
 */
export async function calcularHashArquivo(arrayBuffer) {
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', arrayBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Validação inicial do arquivo, antes de qualquer parsing — comum a
 * CSV e XLSX. Retorna { valido, erro }.
 */
export function validarArquivoBasico(file) {
  if (!file) {
    return { valido: false, erro: 'Nenhum arquivo selecionado.' }
  }
  if (file.size === 0) {
    return { valido: false, erro: 'O arquivo está vazio.' }
  }
  if (file.size > TAMANHO_MAXIMO_BYTES) {
    return { valido: false, erro: `Arquivo muito grande (máximo ${TAMANHO_MAXIMO_BYTES / 1024 / 1024} MB).` }
  }
  const extensao = normalizarExtensao(file.name)
  if (!['csv', 'xlsx', 'xls'].includes(extensao)) {
    return { valido: false, erro: 'Formato inválido. Envie um arquivo .csv, .xlsx ou .xls.' }
  }
  return { valido: true, erro: null, extensao }
}

// ----------------------------------------------------------------------------
// Parsing de CSV (completo)
// ----------------------------------------------------------------------------

/**
 * Parser de CSV simples e robusto: lida com aspas, vírgula ou
 * ponto-e-vírgula como delimitador (detecta automaticamente pelo
 * cabeçalho), e quebras de linha dentro de campos com aspas.
 */
function parseCSVTexto(texto) {
  // Remove BOM UTF-8 se presente (mesma técnica usada em exportUtils.js)
  const limpo = texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto

  // [DIAG-8072] Log temporário de diagnóstico — arquivo bruto (remover após investigação)
  const linhasBrutasDiag = limpo.split(/\r\n|\n/)
  console.log('[DIAG-8072] Total de linhas do arquivo:', linhasBrutasDiag.length)
  console.log('[DIAG-8072] Cinco primeiras linhas brutas:', linhasBrutasDiag.slice(0, 5))

  // Detecção simples de delimitador: conta ocorrências na primeira linha
  const primeiraLinha = limpo.split(/\r\n|\n/)[0] || ''
  const delimitador = (primeiraLinha.match(/;/g) || []).length >= (primeiraLinha.match(/,/g) || []).length ? ';' : ','

  // [DIAG-8072] Log temporário de diagnóstico — delimitador detectado (remover após investigação)
  console.log('[DIAG-8072] Delimitador detectado:', delimitador)

  const linhas = []
  let linhaAtual = []
  let campoAtual = ''
  let dentroDeAspas = false

  for (let i = 0; i < limpo.length; i++) {
    const char = limpo[i]
    const proximo = limpo[i + 1]

    if (dentroDeAspas) {
      if (char === '"' && proximo === '"') {
        campoAtual += '"'
        i++
      } else if (char === '"') {
        dentroDeAspas = false
      } else {
        campoAtual += char
      }
    } else if (char === '"') {
      dentroDeAspas = true
    } else if (char === delimitador) {
      linhaAtual.push(campoAtual)
      campoAtual = ''
    } else if (char === '\n' || (char === '\r' && proximo === '\n')) {
      if (char === '\r') i++
      linhaAtual.push(campoAtual)
      linhas.push(linhaAtual)
      linhaAtual = []
      campoAtual = ''
    } else {
      campoAtual += char
    }
  }
  // Última linha (sem quebra final)
  if (campoAtual !== '' || linhaAtual.length > 0) {
    linhaAtual.push(campoAtual)
    linhas.push(linhaAtual)
  }

  // Remove linhas completamente vazias (ex.: linha em branco no final do arquivo)
  const linhasFiltradas = linhas.filter((linha) => linha.some((campo) => campo.trim() !== ''))

  // [DIAG-8072] Logs temporários de diagnóstico — cabeçalho e linhas parseadas (remover após investigação)
  const cabecalhoDiag = linhasFiltradas[0] || []
  console.log('[DIAG-8072] Cabeçalho completo:', cabecalhoDiag)
  console.log('[DIAG-8072] Quantidade de colunas do cabeçalho:', cabecalhoDiag.length)
  cabecalhoDiag.forEach((coluna, indice) => {
    console.log(`[DIAG-8072] Coluna do cabeçalho [${indice}]:`, coluna)
  })
  console.log('[DIAG-8072] Cinco primeiras linhas já parseadas:', linhasFiltradas.slice(0, 5))

  // [DIAG-8072] Log temporário de diagnóstico — linha 2 (primeira linha de dados) e
  // comparação coluna a coluna contra o cabeçalho, para achar exatamente o índice
  // onde a linha 2 diverge do cabeçalho (remover após investigação).
  const linha2Diag = linhasFiltradas[1] || []
  console.log('[DIAG-8072] Linha 2 completa (já parseada):', linha2Diag)
  console.log('[DIAG-8072] Quantidade de colunas da linha 2:', linha2Diag.length)
  linha2Diag.forEach((valor, indice) => {
    console.log(`[DIAG-8072] Coluna da linha 2 [${indice}]:`, valor)
  })

  let primeiraDivergenciaIndice = null
  const maiorTamanhoDiag = Math.max(cabecalhoDiag.length, linha2Diag.length)
  const comparacaoDiag = []
  for (let i = 0; i < maiorTamanhoDiag; i++) {
    const valorCabecalho = cabecalhoDiag[i]
    const valorLinha2 = linha2Diag[i]
    const statusOk = valorCabecalho !== undefined && valorLinha2 !== undefined
    if (!statusOk && primeiraDivergenciaIndice === null) {
      primeiraDivergenciaIndice = i
    }
    comparacaoDiag.push({ indice: i, cabecalho: valorCabecalho, linha2: valorLinha2, status: statusOk ? 'OK' : 'DIVERGENCIA' })
    console.log(
      `[DIAG-8072] Comparação [${i}]: cabecalho=${JSON.stringify(valorCabecalho)} | linha2=${JSON.stringify(valorLinha2)} | status=${statusOk ? 'OK' : 'DIVERGENCIA'}`
    )
  }
  console.log('[DIAG-8072] Primeira divergência encontrada no índice:', primeiraDivergenciaIndice)

  console.log('[DIAG-RESUMO]', {
    delimitador,
    totalLinhas: linhasBrutasDiag.length,
    cabecalho: cabecalhoDiag,
    qtdCabecalho: cabecalhoDiag.length,
    primeirasLinhas: linhasFiltradas.slice(0, 5),
    linha2: linha2Diag,
    qtdColunasLinha2: linha2Diag.length,
    comparacaoCabecalhoXLinha2: comparacaoDiag,
    primeiraDivergenciaIndice,
  })

  // Corrige delimitador final sobrando no cabeçalho (ex.: "...;DATAFATURAMENTO;"):
  // se a última coluna do cabeçalho for vazia e TODAS as linhas de dados tiverem
  // exatamente uma coluna a menos que o cabeçalho, remove essa coluna fantasma
  // do cabeçalho. Não mexe no delimitador, em colunas vazias internas, nem em
  // arquivos que não se encaixem exatamente nesse padrão.
  if (linhasFiltradas.length > 1) {
    const cabecalhoBruto = linhasFiltradas[0]
    const ultimaColunaCabecalho = cabecalhoBruto[cabecalhoBruto.length - 1]
    if (ultimaColunaCabecalho !== undefined && ultimaColunaCabecalho.trim() === '') {
      const linhasDeDados = linhasFiltradas.slice(1)
      const todasComUmaColunaAMenos = linhasDeDados.every(
        (linha) => linha.length === cabecalhoBruto.length - 1
      )
      if (todasComUmaColunaAMenos) {
        linhasFiltradas[0] = cabecalhoBruto.slice(0, -1)
      }
    }
  }

  return linhasFiltradas
}

/**
 * Lê e valida um arquivo CSV por completo: parsing, checagem de colunas
 * obrigatórias, contagem de registros válidos/inválidos, e detecção de
 * duplicatas DENTRO do próprio arquivo (mesma combinação de valores
 * repetida em mais de uma linha).
 *
 * @param {File} file
 * @param {string[]} colunasObrigatorias - nomes de coluna (case-insensitive) que devem existir no cabeçalho
 * @returns {Promise<{
 *   valido: boolean, erro: string|null,
 *   cabecalho: string[], totalLinhas: number,
 *   registrosValidos: number, registrosInvalidos: number, duplicados: number,
 *   detalhesErros: Array<{linha:number, mensagem:string}>
 * }>}
 */
export async function lerEValidarCSV(file, colunasObrigatorias = []) {
  const texto = await file.text()
  const linhas = parseCSVTexto(texto)

  if (linhas.length === 0) {
    return {
      valido: false,
      erro: 'O arquivo está vazio ou não contém nenhuma linha reconhecível.',
      cabecalho: [],
      totalLinhas: 0,
      registrosValidos: 0,
      registrosInvalidos: 0,
      duplicados: 0,
      detalhesErros: [],
    }
  }

  const cabecalhoOriginal = linhas[0].map((c) => c.trim())
  const cabecalhoNormalizado = cabecalhoOriginal.map((c) => c.toLowerCase())
  const linhasDados = linhas.slice(1)

  if (linhasDados.length === 0) {
    return {
      valido: false,
      erro: 'O arquivo contém apenas o cabeçalho, sem nenhum registro de dados.',
      cabecalho: cabecalhoOriginal,
      totalLinhas: 0,
      registrosValidos: 0,
      registrosInvalidos: 0,
      duplicados: 0,
      detalhesErros: [],
    }
  }

  const colunasAusentes = colunasObrigatorias.filter(
    (col) => !cabecalhoNormalizado.includes(col.toLowerCase())
  )
  if (colunasAusentes.length > 0) {
    return {
      valido: false,
      erro: `Colunas obrigatórias ausentes: ${colunasAusentes.join(', ')}.`,
      cabecalho: cabecalhoOriginal,
      totalLinhas: linhasDados.length,
      registrosValidos: 0,
      registrosInvalidos: linhasDados.length,
      duplicados: 0,
      detalhesErros: [{ linha: 1, mensagem: `Colunas obrigatórias ausentes no cabeçalho: ${colunasAusentes.join(', ')}` }],
    }
  }

  const detalhesErros = []
  let registrosValidos = 0
  let registrosInvalidos = 0
  const assinaturasVistas = new Set()
  let duplicados = 0

  linhasDados.forEach((linha, indice) => {
    const numeroLinha = indice + 2 // +1 pelo cabeçalho, +1 porque é 1-indexed
    if (linha.length !== cabecalhoOriginal.length) {
      registrosInvalidos++
      detalhesErros.push({
        linha: numeroLinha,
        mensagem: `Número de colunas (${linha.length}) não corresponde ao cabeçalho (${cabecalhoOriginal.length}).`,
      })
      return
    }

    const todosCamposVazios = linha.every((campo) => campo.trim() === '')
    if (todosCamposVazios) {
      registrosInvalidos++
      detalhesErros.push({ linha: numeroLinha, mensagem: 'Linha completamente vazia.' })
      return
    }

    // Detecção de duplicata: assinatura é a concatenação de todos os campos
    const assinatura = linha.map((c) => c.trim().toLowerCase()).join('|')
    if (assinaturasVistas.has(assinatura)) {
      duplicados++
      detalhesErros.push({ linha: numeroLinha, mensagem: 'Registro duplicado (idêntico a uma linha anterior do mesmo arquivo).' })
      return
    }
    assinaturasVistas.add(assinatura)

    registrosValidos++
  })

  // Limita a quantidade de erros detalhados retornados, para não sobrecarregar
  // a tela/o banco com milhares de entradas em arquivos muito grandes e ruins.
  const detalhesErrosLimitados = detalhesErros.slice(0, 200)

  // Constrói os objetos de linha (cabeçalho + valores) para uso pelo Funil
  // Operacional (importarRegistrosRotina / importarRegistrosComprovei).
  // Inclui apenas linhas válidas (sem erro de coluna e sem estar vazia).
  const linhasObjetos = linhasDados
    .filter((linha) => {
      if (linha.length !== cabecalhoOriginal.length) return false
      if (linha.every((campo) => campo.trim() === '')) return false
      return true
    })
    .map((linha) => {
      const obj = {}
      cabecalhoOriginal.forEach((col, idx) => {
        obj[col] = (linha[idx] ?? '').trim()
      })
      return obj
    })

  return {
    valido: true,
    erro: null,
    cabecalho: cabecalhoOriginal,
    totalLinhas: linhasDados.length,
    registrosValidos,
    registrosInvalidos,
    duplicados,
    detalhesErros: detalhesErrosLimitados,
    linhas: linhasObjetos,
  }
}

// ----------------------------------------------------------------------------
// Leitura de XLSX via SheetJS
// ----------------------------------------------------------------------------

/**
 * Lê e valida um arquivo .xlsx por completo, retornando o MESMO shape que
 * lerEValidarCSV — garantindo que o restante do pipeline (validação de
 * colunas, importação para o Funil) funcione sem bifurcação ou tratamento
 * especial para arquivos Excel.
 *
 * Usa SheetJS (xlsx-0.20.3, versão sem CVEs, instalada via tarball local).
 * XLSX.utils.sheet_to_json converte a planilha para array de arrays, que
 * é então processado pelo mesmo fluxo de validação do CSV — zero duplicação.
 */
export async function lerEValidarXLSX(file, colunasObrigatorias = []) {
  let workbook
  try {
    const buffer = await file.arrayBuffer()
    workbook = XLSX.read(buffer, { type: 'array' })
  } catch {
    return {
      valido: false,
      erro: 'Não foi possível abrir o arquivo .xlsx. O arquivo pode estar corrompido ou em formato inválido.',
      cabecalho: [], totalLinhas: 0, registrosValidos: 0, registrosInvalidos: 0, duplicados: 0, detalhesErros: [],
    }
  }

  const nomePlanilha = workbook.SheetNames[0]
  if (!nomePlanilha) {
    return {
      valido: false,
      erro: 'Não foi encontrada nenhuma planilha dentro do arquivo .xlsx.',
      cabecalho: [], totalLinhas: 0, registrosValidos: 0, registrosInvalidos: 0, duplicados: 0, detalhesErros: [],
    }
  }

  // sheet_to_json com header:1 → array de arrays, mesmo formato que parseCSVTexto retorna.
  // raw:false converte tudo para string, incluindo datas e números — comportamento idêntico ao CSV.
  // defval:'' garante que células vazias virem string vazia, não undefined.
  const planilha = workbook.Sheets[nomePlanilha]
  const linhas = XLSX.utils.sheet_to_json(planilha, { header: 1, defval: '', raw: false })

  // Remove linhas completamente vazias — mesmo filtro do parseCSVTexto
  const linhasFiltradas = linhas.filter((l) => l.some((c) => String(c).trim() !== ''))

  if (linhasFiltradas.length === 0) {
    return {
      valido: false,
      erro: 'A planilha está vazia ou não contém dados reconhecíveis.',
      cabecalho: [], totalLinhas: 0, registrosValidos: 0, registrosInvalidos: 0, duplicados: 0, detalhesErros: [],
    }
  }

  // A partir daqui: exatamente o mesmo fluxo de lerEValidarCSV
  const cabecalhoOriginal    = linhasFiltradas[0].map((c) => String(c).trim())
  const cabecalhoNormalizado = cabecalhoOriginal.map((c) => c.toLowerCase())
  const linhasDados          = linhasFiltradas.slice(1)

  if (linhasDados.length === 0) {
    return {
      valido: false,
      erro: 'A planilha contém apenas o cabeçalho, sem nenhum registro de dados.',
      cabecalho: cabecalhoOriginal, totalLinhas: 0, registrosValidos: 0, registrosInvalidos: 0, duplicados: 0, detalhesErros: [],
    }
  }

  const colunasAusentes = colunasObrigatorias.filter(
    (col) => !cabecalhoNormalizado.includes(col.toLowerCase())
  )
  if (colunasAusentes.length > 0) {
    return {
      valido: false,
      erro: `Colunas obrigatórias ausentes: ${colunasAusentes.join(', ')}.`,
      cabecalho: cabecalhoOriginal,
      totalLinhas: linhasDados.length,
      registrosValidos: 0,
      registrosInvalidos: linhasDados.length,
      duplicados: 0,
      detalhesErros: [{ linha: 1, mensagem: `Colunas obrigatórias ausentes no cabeçalho: ${colunasAusentes.join(', ')}` }],
    }
  }

  const detalhesErros = []
  let registrosValidos = 0, registrosInvalidos = 0, duplicados = 0
  const assinaturasVistas = new Set()

  linhasDados.forEach((linha, indice) => {
    const numeroLinha = indice + 2
    if (linha.length !== cabecalhoOriginal.length) {
      registrosInvalidos++
      detalhesErros.push({ linha: numeroLinha, mensagem: `Número de colunas (${linha.length}) não corresponde ao cabeçalho (${cabecalhoOriginal.length}).` })
      return
    }
    if (linha.every((campo) => String(campo).trim() === '')) {
      registrosInvalidos++
      detalhesErros.push({ linha: numeroLinha, mensagem: 'Linha completamente vazia.' })
      return
    }
    const assinatura = linha.map((c) => String(c).trim().toLowerCase()).join('|')
    if (assinaturasVistas.has(assinatura)) {
      duplicados++
      detalhesErros.push({ linha: numeroLinha, mensagem: 'Registro duplicado (idêntico a uma linha anterior do mesmo arquivo).' })
      return
    }
    assinaturasVistas.add(assinatura)
    registrosValidos++
  })

  const linhasObjetos = linhasDados
    .filter((linha) =>
      linha.length === cabecalhoOriginal.length &&
      !linha.every((campo) => String(campo).trim() === '')
    )
    .map((linha) => {
      const obj = {}
      cabecalhoOriginal.forEach((col, idx) => { obj[col] = String(linha[idx] ?? '').trim() })
      return obj
    })

  return {
    valido: true,
    erro: null,
    cabecalho: cabecalhoOriginal,
    totalLinhas: linhasDados.length,
    registrosValidos,
    registrosInvalidos,
    duplicados,
    detalhesErros: detalhesErros.slice(0, 200),
    linhas: linhasObjetos,
  }
}
