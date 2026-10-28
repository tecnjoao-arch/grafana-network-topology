// components/useLargura.ts — largura real de um elemento, em pixels.
//
// Os graficos sao desenhados no tamanho real em vez de num viewBox esticado:
// esticar deforma o texto dos eixos. Pra isso eles precisam saber a largura,
// e ela muda quando o modal redimensiona.

import { useEffect, useRef, useState } from 'react';

export function useLargura<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [largura, setLargura] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setLargura(el.clientWidth);
    const ro = new ResizeObserver((es) => setLargura(es[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return [ref, largura] as const;
}
