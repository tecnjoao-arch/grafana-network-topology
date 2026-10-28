// components/usePanelEditorOpen.ts — acompanha se o painel está no editor do Grafana.

import { useEffect, useState } from 'react';
import { locationService } from '@grafana/runtime';
import { isPanelEditorOpen } from '../utils/panelEditor';

export function usePanelEditorOpen(panelId?: number): boolean {
  const ler = () => isPanelEditorOpen(locationService.getSearchObject(), panelId);
  const [aberto, setAberto] = useState(ler);

  useEffect(() => {
    setAberto(ler());
    // No Grafana 12 o editor reaproveita a MESMA instância do painel: entrar
    // e sair do Edit não remonta o componente, só muda a URL. Ler uma vez na
    // montagem deixaria o modo edição preso no estado da entrada.
    const pare = locationService.getHistory().listen(() => setAberto(ler()));
    return () => pare();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelId]);

  return aberto;
}
