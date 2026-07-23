import { useState } from 'react'
import Button from './Button'
import { IconFileText, IconFileSpreadsheet, IconFilePdf } from './Icons'
import { exportarCSV, exportarExcel, exportarPDF } from '../../lib/exportUtils'

/**
 * Conjunto de 3 botões de exportação (CSV, Excel, PDF), reutilizado em
 * cada um dos 4 relatórios da Etapa 7. Cada exportação acontece
 * inteiramente no navegador, a partir dos dados já carregados — nenhuma
 * nova chamada ao Supabase é feita ao exportar.
 *
 * @param {Array<{chave: string, rotulo: string}>} colunas
 * @param {Array<Object>} linhas
 * @param {string} nomeArquivo - sem extensão
 * @param {string} titulo - usado no PDF e na planilha Excel
 * @param {string} [subtitulo] - usado no PDF (ex.: filtros aplicados)
 */
export default function ExportButtons({ colunas, linhas, nomeArquivo, titulo, subtitulo }) {
  const [erro, setErro] = useState('')
  const semDados = !linhas || linhas.length === 0

  function handleExportarPDF() {
    setErro('')
    try {
      exportarPDF(colunas, linhas, titulo, subtitulo)
    } catch (e) {
      setErro(e.message || 'Não foi possível gerar o PDF.')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button
          variant="ghost"
          size="sm"
          icon={IconFileText}
          disabled={semDados}
          onClick={() => exportarCSV(colunas, linhas, nomeArquivo)}
          title="Exportar como CSV"
        >
          CSV
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon={IconFileSpreadsheet}
          disabled={semDados}
          onClick={() => exportarExcel(colunas, linhas, nomeArquivo, titulo)}
          title="Exportar como Excel"
        >
          Excel
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon={IconFilePdf}
          disabled={semDados}
          onClick={handleExportarPDF}
          title="Exportar como PDF"
        >
          PDF
        </Button>
      </div>
      {erro && <span style={{ fontSize: 11.5, color: 'var(--red)' }}>{erro}</span>}
    </div>
  )
}
