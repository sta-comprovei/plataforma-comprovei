import { IconChevronLeft, IconChevronRight } from './Icons'
import './Pagination.css'

/**
 * Paginação genérica orientada a servidor (recebe total de registros e
 * página atual; o componente pai é responsável por refazer a query).
 */
export default function Pagination({ pagina, porPagina, total, onMudarPagina }) {
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina))
  const inicio = total === 0 ? 0 : (pagina - 1) * porPagina + 1
  const fim = Math.min(pagina * porPagina, total)

  return (
    <div className="pagination">
      <span className="pagination-info">
        {total === 0
          ? 'Nenhum registro encontrado'
          : `Exibindo ${inicio}–${fim} de ${total}`}
      </span>
      <div className="pagination-controls">
        <button
          type="button"
          className="pagination-btn"
          onClick={() => onMudarPagina(pagina - 1)}
          disabled={pagina <= 1}
          aria-label="Página anterior"
        >
          <IconChevronLeft width={15} height={15} />
        </button>
        <span className="pagination-current">
          {pagina} de {totalPaginas}
        </span>
        <button
          type="button"
          className="pagination-btn"
          onClick={() => onMudarPagina(pagina + 1)}
          disabled={pagina >= totalPaginas}
          aria-label="Próxima página"
        >
          <IconChevronRight width={15} height={15} />
        </button>
      </div>
    </div>
  )
}
