/**
 * Utilitários de exportação para o módulo de Relatórios Gerenciais
 * (Etapa 7). Todas as três técnicas são 100% nativas do navegador —
 * nenhuma dependência externa (biblioteca de terceiros) foi
 * adicionada ao projeto.
 *
 * Decisão técnica sobre o formato "Excel": o pacote npm `xlsx` mais
 * popular (SheetJS) está desatualizado e com vulnerabilidades
 * conhecidas no registro npm padrão — a instalação oficialmente
 * recomendada é via CDN externo, o que introduziria uma dependência de
 * rede em tempo de build não verificável neste ambiente de
 * desenvolvimento. Em vez disso, usamos a técnica nativa "tabela HTML
 * como planilha": um arquivo `.xls` contendo uma <table> HTML válida,
 * que o Excel, o LibreOffice Calc e o Google Sheets abrem nativamente
 * há décadas (é o mesmo mecanismo usado por "Salvar como página da
 * Web" no Excel). Isso garante 100% de confiabilidade sem nenhuma nova
 * superfície de risco, ao custo de não ser um .xlsx binário (ZIP/XML)
 * moderno — mas abre e funciona corretamente em qualquer ferramenta de
 * planilha.
 */

function dispararDownload(blob, nomeArquivo) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomeArquivo
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function escaparCampoCSV(valor) {
  const texto = valor === null || valor === undefined ? '' : String(valor)
  // Campo precisa de aspas se contiver o delimitador, aspas, ou quebra de linha
  if (texto.includes(';') || texto.includes('"') || texto.includes('\n')) {
    return `"${texto.replace(/"/g, '""')}"`
  }
  return texto
}

/**
 * Exporta um conjunto de linhas para CSV. `colunas` define a ordem e
 * os rótulos das colunas; `linhas` é um array de objetos cujas chaves
 * batem com `colunas[].chave`.
 *
 * @param {Array<{chave: string, rotulo: string}>} colunas
 * @param {Array<Object>} linhas
 * @param {string} nomeArquivo - sem extensão
 */
export function exportarCSV(colunas, linhas, nomeArquivo) {
  const cabecalho = colunas.map((c) => escaparCampoCSV(c.rotulo)).join(';')
  const corpo = linhas
    .map((linha) => colunas.map((c) => escaparCampoCSV(linha[c.chave])).join(';'))
    .join('\r\n')
  const conteudo = `${cabecalho}\r\n${corpo}`

  // BOM UTF-8 (﻿) é necessário para o Excel reconhecer corretamente
  // acentuação em português ao abrir o arquivo — sem ele, caracteres
  // como "ã", "ç", "é" aparecem corrompidos no Excel/Windows.
  const blob = new Blob(['﻿' + conteudo], { type: 'text/csv;charset=utf-8;' })
  dispararDownload(blob, `${nomeArquivo}.csv`)
}

function escaparHTML(valor) {
  const texto = valor === null || valor === undefined ? '' : String(valor)
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Exporta um conjunto de linhas para um arquivo que o Excel abre
 * nativamente (tabela HTML com extensão .xls — ver nota técnica no
 * topo do arquivo).
 *
 * @param {Array<{chave: string, rotulo: string}>} colunas
 * @param {Array<Object>} linhas
 * @param {string} nomeArquivo - sem extensão
 * @param {string} [titulo] - título exibido no topo da planilha
 */
export function exportarExcel(colunas, linhas, nomeArquivo, titulo) {
  const linhasHTML = linhas
    .map(
      (linha) =>
        `<tr>${colunas.map((c) => `<td>${escaparHTML(linha[c.chave])}</td>`).join('')}</tr>`
    )
    .join('')

  const cabecalhoHTML = colunas.map((c) => `<th>${escaparHTML(c.rotulo)}</th>`).join('')

  const html = `<!doctype html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="UTF-8">
<!--[if gte mso 9]>
<xml>
  <x:ExcelWorkbook>
    <x:ExcelWorksheets>
      <x:ExcelWorksheet>
        <x:Name>Relatório</x:Name>
        <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
      </x:ExcelWorksheet>
    </x:ExcelWorksheets>
  </x:ExcelWorkbook>
</xml>
<![endif]-->
<style>
  table { border-collapse: collapse; font-family: Calibri, Arial, sans-serif; font-size: 12px; }
  th { background: #F97316; color: #ffffff; font-weight: bold; padding: 6px 10px; border: 1px solid #cccccc; text-align: left; }
  td { padding: 5px 10px; border: 1px solid #cccccc; }
  caption { font-size: 16px; font-weight: bold; text-align: left; padding: 8px 0; }
</style>
</head>
<body>
<table>
${titulo ? `<caption>${escaparHTML(titulo)}</caption>` : ''}
<thead><tr>${cabecalhoHTML}</tr></thead>
<tbody>${linhasHTML}</tbody>
</table>
</body>
</html>`

  const blob = new Blob(['﻿' + html], { type: 'application/vnd.ms-excel;charset=utf-8;' })
  dispararDownload(blob, `${nomeArquivo}.xls`)
}

/**
 * Exporta para PDF usando o diálogo de impressão nativo do navegador
 * ("Salvar como PDF"). Abre uma nova janela só com o conteúdo do
 * relatório (título + tabela), formatado com uma folha de estilo
 * dedicada a impressão, e dispara `window.print()` automaticamente.
 *
 * @param {Array<{chave: string, rotulo: string}>} colunas
 * @param {Array<Object>} linhas
 * @param {string} titulo
 * @param {string} [subtitulo] - ex.: descrição dos filtros aplicados
 */
export function exportarPDF(colunas, linhas, titulo, subtitulo) {
  const linhasHTML = linhas
    .map(
      (linha) =>
        `<tr>${colunas.map((c) => `<td>${escaparHTML(linha[c.chave])}</td>`).join('')}</tr>`
    )
    .join('')

  const cabecalhoHTML = colunas.map((c) => `<th>${escaparHTML(c.rotulo)}</th>`).join('')

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>${escaparHTML(titulo)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; margin: 24px; }
  h1 { font-size: 18px; margin-bottom: 2px; }
  .subtitulo { font-size: 11px; color: #666666; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
  th { background: #F97316; color: #ffffff; font-weight: bold; padding: 6px 8px; text-align: left; border: 1px solid #e0792a; }
  td { padding: 5px 8px; border: 1px solid #dddddd; }
  tr:nth-child(even) td { background: #f7f7f7; }
  .rodape { margin-top: 16px; font-size: 9.5px; color: #999999; }
  @media print {
    body { margin: 10mm; }
    @page { size: A4 landscape; margin: 10mm; }
  }
</style>
</head>
<body>
<h1>${escaparHTML(titulo)}</h1>
${subtitulo ? `<div class="subtitulo">${escaparHTML(subtitulo)}</div>` : ''}
<table>
<thead><tr>${cabecalhoHTML}</tr></thead>
<tbody>${linhasHTML}</tbody>
</table>
<div class="rodape">TNS Gestão de Entregas — gerado em ${new Date().toLocaleString('pt-BR')}</div>
<script>
  window.onload = function () { window.print(); };
</script>
</body>
</html>`

  const janela = window.open('', '_blank')
  if (!janela) {
    // Pop-up bloqueado pelo navegador — sem fallback silencioso, o
    // chamador deve avisar o usuário (ver tratamento no componente).
    throw new Error(
      'Não foi possível abrir a janela de exportação. Verifique se o bloqueador de pop-ups está desativado para este site.'
    )
  }
  janela.document.write(html)
  janela.document.close()
}
