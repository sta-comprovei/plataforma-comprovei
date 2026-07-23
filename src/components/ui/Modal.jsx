import { useEffect } from 'react'
import { IconX } from './Icons'
import './Modal.css'

/**
 * Modal genérico e reutilizável. Fecha ao clicar no overlay, ao pressionar
 * Esc, ou pelo botão de fechar — sem acoplamento a nenhuma regra de negócio.
 */
export default function Modal({ aberto, titulo, onFechar, children, tamanho = 'md' }) {
  useEffect(() => {
    if (!aberto) return undefined
    function handleKeyDown(e) {
      if (e.key === 'Escape') onFechar?.()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [aberto, onFechar])

  if (!aberto) return null

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onFechar?.()
      }}
    >
      <div className={`modal-box${tamanho === 'sm' ? ' modal-sm' : ''}`} role="dialog" aria-modal="true">
        <div className="modal-header">
          <h2>{titulo}</h2>
          <button type="button" className="modal-close-btn" onClick={onFechar} aria-label="Fechar">
            <IconX width={18} height={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
