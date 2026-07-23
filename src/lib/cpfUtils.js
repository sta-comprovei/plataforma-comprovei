/**
 * Utilitários de formatação e validação de CPF no frontend.
 * A validação definitiva (fonte da verdade) acontece no banco via trigger
 * `fn_validar_cpf` — esta camada existe apenas para dar feedback imediato
 * ao usuário antes de submeter o formulário.
 */

export function apenasDigitos(valor) {
  return (valor || '').replace(/\D/g, '')
}

export function formatarCPF(valor) {
  const digitos = apenasDigitos(valor).slice(0, 11)
  if (digitos.length <= 3) return digitos
  if (digitos.length <= 6) return `${digitos.slice(0, 3)}.${digitos.slice(3)}`
  if (digitos.length <= 9) return `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6)}`
  return `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-${digitos.slice(9)}`
}

export function cpfValido(valor) {
  const cpf = apenasDigitos(valor)
  if (cpf.length !== 11) return false
  if (/^(\d)\1{10}$/.test(cpf)) return false

  let soma = 0
  for (let i = 0; i < 9; i++) soma += Number(cpf[i]) * (10 - i)
  let resto = (soma * 10) % 11
  if (resto === 10) resto = 0
  if (resto !== Number(cpf[9])) return false

  soma = 0
  for (let i = 0; i < 10; i++) soma += Number(cpf[i]) * (11 - i)
  resto = (soma * 10) % 11
  if (resto === 10) resto = 0
  if (resto !== Number(cpf[10])) return false

  return true
}
