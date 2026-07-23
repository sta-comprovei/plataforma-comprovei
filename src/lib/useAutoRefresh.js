import { useEffect, useRef } from 'react'

/**
 * Atualização automática de dados sem exigir refresh manual da página.
 *
 * Estratégia: polling em intervalo fixo + refetch imediato quando a aba
 * volta a ficar visível (cobre o caso mais comum: usuário deixou o
 * Dashboard aberto em outra aba, fez uma alteração operacional em outro
 * lugar, voltou — sem precisar esperar o intervalo completo).
 *
 * Decisão de arquitetura: o Supabase oferece Realtime (Postgres Changes
 * via WebSocket), que seria "instantâneo", mas exige uma configuração de
 * infraestrutura no projeto (`ALTER PUBLICATION supabase_realtime ADD
 * TABLE ...` + autorização de canal) que varia por projeto e não pode
 * ser validada neste ambiente de desenvolvimento. Polling garante o
 * comportamento pedido ("não exigir atualização manual") de forma
 * previsível em qualquer projeto Supabase, sem dependência externa.
 *
 * @param {() => void} callback - função a chamar a cada atualização (deve ser estável ou memoizada pelo chamador)
 * @param {number} intervaloMs - intervalo entre atualizações automáticas (padrão: 60s)
 */
export function useAutoRefresh(callback, intervaloMs = 60000) {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    const intervalo = setInterval(() => {
      callbackRef.current()
    }, intervaloMs)

    function aoFocarAba() {
      if (document.visibilityState === 'visible') {
        callbackRef.current()
      }
    }
    document.addEventListener('visibilitychange', aoFocarAba)

    return () => {
      clearInterval(intervalo)
      document.removeEventListener('visibilitychange', aoFocarAba)
    }
  }, [intervaloMs])
}
