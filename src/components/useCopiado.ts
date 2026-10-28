// components/useCopiado.ts — copia um texto e mostra "Copiado!" por um instante.

import { useCallback, useEffect, useRef, useState } from 'react';

/** [o que acabou de ser copiado (ou null), copiar(texto, marca)].
 *  O timer é limpo ao desmontar — o card some no refresh ou ao sair do modo
 *  edição, e o setState atrasado caía num componente que já não existe — e ao
 *  copiar de novo, senão o primeiro timer apagava o "Copiado!" do segundo. */
export function useCopiado<T>(ms = 1500): [T | null, (texto: string, marca: T) => void] {
  const [copiado, setCopiado] = useState<T | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);

  const copiar = useCallback((texto: string, marca: T) => {
    // Fora de HTTPS o navigator.clipboard nem existe; e a escrita pode ser
    // negada. Só diz "Copiado!" quando copiou de fato.
    navigator.clipboard?.writeText(texto).then(() => {
      setCopiado(marca);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopiado(null), ms);
    }, () => {});
  }, [ms]);

  return [copiado, copiar];
}
