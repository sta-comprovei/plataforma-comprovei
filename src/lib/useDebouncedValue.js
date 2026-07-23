import { useEffect, useState } from 'react'

/**
 * Retorna uma versão "atrasada" do valor informado, atualizada somente
 * após `delay` ms sem novas alterações. Usado para pesquisa em tempo real
 * sem disparar uma query a cada tecla digitada.
 */
export function useDebouncedValue(valor, delay = 350) {
  const [valorAtrasado, setValorAtrasado] = useState(valor)

  useEffect(() => {
    const timer = setTimeout(() => setValorAtrasado(valor), delay)
    return () => clearTimeout(timer)
  }, [valor, delay])

  return valorAtrasado
}
