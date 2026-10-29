// components/useModoLeve.ts — Animação das linhas e interruptores de diagnóstico.
//
// A opção "Animar links" desligada deixa as linhas paradas (antes ela não
// estava ligada a nada). No iPhone/iPad as linhas ficam sempre paradas: com a
// correção das linhas numa camada só (ver IOS em TopologyPanel) o zoom aguenta
// até 4× sem animação (teste.21, ?diag=confirma), mas a teste.22 religou a
// animação lá e a página voltou a recarregar, até sem zoom.
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
  /** Linhas sem animação ("Animar links" desligado, iPhone/iPad, ou ?diag=parado) */
  semAnimacao: boolean;
  semSombra: boolean;
  semCards: boolean;
}

export function useModoLeve(animarLinks: boolean | undefined): ModoLeve {
  // Lidos uma vez: a URL de diagnóstico e o aparelho não mudam com o mapa aberto
  const [diag] = useState(chavesDeDiagnostico);
  const [paradoNoIOS] = useState(ehIOS);
  return {
    semAnimacao: animarLinks === false || paradoNoIOS || diag.has('parado'),
    semSombra: diag.has('sem-sombra'),
    semCards: diag.has('sem-cards'),
  };
}
