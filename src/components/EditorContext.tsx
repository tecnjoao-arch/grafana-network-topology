// components/EditorContext.tsx — Compartilha estado de edição entre painel e arestas/nós.

import React, { createContext, useContext } from 'react';
import { LinkEdgeData } from '../types';

type Anchor = { x: number; y: number };

interface EditorCtx {
  editMode: boolean;
  /** Substitui os waypoints de uma aresta e persiste nas options */
  setEdgeWaypoints: (edgeId: string, waypoints: Anchor[]) => void;
  /** Define a âncora de origem/destino de uma aresta (fração 0..1 do nó) */
  setEdgeAnchor: (edgeId: string, which: 'source' | 'target', anchor: Anchor) => void;
  /** Patch genérico de campos da aresta (cor, estilo, animação, etc) */
  setEdgeData: (edgeId: string, patch: Partial<LinkEdgeData>) => void;
  /** Exclui uma aresta */
  deleteEdge: (edgeId: string) => void;
  /** Patch genérico de campos de um nó */
  setNodeData: (nodeId: string, patch: Partial<any>) => void;
  /** Exclui um nó */
  deleteNode: (nodeId: string) => void;
  /** Duplica um nó */
  duplicateNode?: (nodeId: string) => void;
  /** Fora do modo edição: abre o modal de detalhes do link, opcionalmente
   *  focado num lado (interface) específico. */
  openLinkDetails?: (edgeId: string, side?: 'source' | 'target') => void;
  /** Hover num card de interface → tooltip daquele lado específico. */
  hoverLink?: (edgeId: string, side: 'source' | 'target', x: number, y: number) => void;
  unhoverLink?: () => void;
}

const Ctx = createContext<EditorCtx>({
  editMode: false,
  setEdgeWaypoints: () => {},
  setEdgeAnchor: () => {},
  setEdgeData: () => {},
  deleteEdge: () => {},
  setNodeData: () => {},
  deleteNode: () => {},
  duplicateNode: () => {},
  openLinkDetails: () => {},
  hoverLink: () => {},
  unhoverLink: () => {},
});

export const EditorProvider: React.FC<{ value: EditorCtx; children: React.ReactNode }> = ({ value, children }) => (
  <Ctx.Provider value={value}>{children}</Ctx.Provider>
);

export const useEditor = () => useContext(Ctx);
