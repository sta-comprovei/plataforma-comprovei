import './Button.css'

/**
 * Botão padronizado da plataforma. `variant`: primary | secondary | ghost | danger.
 * Quando `carregando` é true, exibe spinner e desabilita o clique automaticamente.
 * Quando há `icon` e nenhum `children` (texto visível), o botão fica
 * compacto e quadrado (classe `btn-icon`) — comum nas ações de tabela.
 */
export default function Button({
  children,
  variant = 'primary',
  size,
  carregando = false,
  disabled = false,
  icon: Icon,
  className = '',
  type = 'button',
  ...rest
}) {
  const somenteIcone = !!Icon && children === undefined

  const classes = [
    'btn',
    `btn-${variant}`,
    size === 'sm' ? 'btn-sm' : '',
    somenteIcone ? 'btn-icon' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button type={type} className={classes} disabled={disabled || carregando} {...rest}>
      {carregando ? (
        <span className="btn-spinner" />
      ) : (
        Icon && <Icon width={15} height={15} />
      )}
      {children}
    </button>
  )
}
