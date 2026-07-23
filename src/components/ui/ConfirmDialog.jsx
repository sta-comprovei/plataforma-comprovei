import Modal from './Modal'
import Button from './Button'

/**
 * Diálogo de confirmação genérico — usado sempre que uma ação precisa de
 * confirmação explícita do usuário (excluir, inativar, reativar, etc.).
 */
export default function ConfirmDialog({
  aberto,
  titulo,
  mensagem,
  textoConfirmar = 'Confirmar',
  textoCancelar = 'Cancelar',
  variantConfirmar = 'danger',
  carregando = false,
  onConfirmar,
  onCancelar,
}) {
  return (
    <Modal aberto={aberto} titulo={titulo} onFechar={onCancelar} tamanho="sm">
      <p style={{ color: 'var(--text2)', fontSize: 13.5, lineHeight: 1.6 }}>{mensagem}</p>
      <div className="modal-actions">
        <Button variant="ghost" onClick={onCancelar} disabled={carregando} style={{ flex: 1 }}>
          {textoCancelar}
        </Button>
        <Button
          variant={variantConfirmar}
          onClick={onConfirmar}
          carregando={carregando}
          style={{ flex: 1 }}
        >
          {textoConfirmar}
        </Button>
      </div>
    </Modal>
  )
}
