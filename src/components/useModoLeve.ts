// components/useModoLeve.ts — Animação das linhas e interruptores de diagnóstico.
//
// A opção "Animar links" desligada deixa as linhas paradas (antes ela não
// estava ligada a nada). Entre a teste.18 e a 21 o celular também ficava sem
// animação: era a suspeita de o iPhone recarregar a página ao dar zoom. O
// diagnóstico no aparelho mostrou que a causa eram as linhas em camadas
// separadas (ver IOS em TopologyPanel), não a animação — ela voltou.
//
// Para investigar no próprio aparelho, pela URL (?diag=a,b):
//   parado     — linhas sem animação
//   sem-sombra — tira as sombras dos equipamentos e dos cards
//   sem-cards  — esconde os cards de tráfego

import { useState } from 'react';

/** iPhone/iPad — qualquer navegador lá é o motor do Safari. O iPad novo se
 *  diz Mac: o que o entrega são os pontos de toque. */
export function ehIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iP(hone|ad|od)/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}

function chavesDeDiagnostico(): Set<string> {
  try {
    const v = new URLSearchParams(window.location.search).get('diag') ?? '';
    return new Set(v.split(',').map((s) => s.trim()).filter(Boolean));
  } catch {
    return new Set();
  }
}

export interface ModoLeve {
  /** Linhas sem animação ("Animar links" desligado, ou ?diag=parado) */
  semAnimacao: boolean;
  semSombra: boolean;
  semCards: boolean;
}

export function useModoLeve(animarLinks: boolean | undefined): ModoLeve {
  // Lida uma vez: a URL de diagnóstico não muda com o mapa aberto
  const [diag] = useState(chavesDeDiagnostico);
  return {
    semAnimacao: animarLinks === false || diag.has('parado'),
    semSombra: diag.has('sem-sombra'),
    semCards: diag.has('sem-cards'),
  };
}
