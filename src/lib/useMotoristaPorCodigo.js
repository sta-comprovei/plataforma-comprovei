import { useEffect, useState } from 'react'
import { buscarMotoristaPorCodigo } from './motoristasService'
import { useDebouncedValue } from './useDebouncedValue'

/**
 * Hook usado pela Operação do Dia (Etapa 3): dado um código digitado
 * pelo usuário, busca o motorista correspondente no Supabase e expõe o
 * resultado para auto-preenchimento do nome.
 *
 * Usado em src/pages/OperacaoForm.jsx.
 *
 * Uso:
 *   const { motorista, carregando, naoEncontrado } = useMotoristaPorCodigo(codigoDigitado)
 *   // motorista?.nome -> preenche o campo Nome
 *   // naoEncontrado -> exibe "Motorista não cadastrado."
 *   // motorista === null && !naoEncontrado && !carregando -> campo ainda vazio
 */
export function useMotoristaPorCodigo(codigo, { delay = 300 } = {}) {
  const codigoDebounced = useDebouncedValue((codigo || '').trim(), delay)

  const [motorista, setMotorista] = useState(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState(null)

  useEffect(() => {
    let ativo = true

    if (!codigoDebounced) {
      setMotorista(null)
      setErro(null)
      setCarregando(false)
      return undefined
    }

    setCarregando(true)
    buscarMotoristaPorCodigo(codigoDebounced).then((resultado) => {
      if (!ativo) return
      setCarregando(false)
      if (resultado.erro) {
        setErro(resultado.erro)
        setMotorista(null)
        return
      }
      setErro(null)
      setMotorista(resultado.dados)
    })

    return () => {
      ativo = false
    }
  }, [codigoDebounced])

  return {
    motorista,
    carregando,
    erro,
    // true somente quando a busca terminou e nada foi encontrado
    naoEncontrado: !carregando && !erro && !!codigoDebounced && motorista === null,
  }
}
