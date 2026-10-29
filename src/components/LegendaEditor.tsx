// components/LegendaEditor.tsx — Editor da legenda, nas opções do painel.
// Do jeito das regras de cor: cada linha é um texto e uma cor (as prontas ou
// "outra cor"), e dá pra pôr quantas quiser. Sem nada salvo a legenda é a
// padrão — e ela já aparece aqui preenchida, pra editar em vez de começar do
// zero. Qualquer mudança salva a lista inteira; "Voltar ao padrão" apaga.

import React from 'react';
import { StandardEditorProps } from '@grafana/data';
import { Button, IconButton, Input, useTheme2 } from '@grafana/ui';
import { CorDaRegra } from './CorDaRegra';
import { DEFAULT_OPTIONS, LegendItem, PanelOptions } from '../types';

/** A legenda padrão nas cores prontas: o ponto de partida do editor. No mapa,
 *  sem nada salvo, ela sai nas cores do tema (Legend, em TopologyPanel). */
export const legendaPadrao = (downColor: string): LegendItem[] => [
  { color: '#22c55e', label: 'link OK' },
  { color: '#f59e0b', label: 'alto uso / warning' },
  { color: downColor, label: 'down' },
  { color: '#64748b', label: 'sem status' },
];

export const LegendaEditor: React.FC<StandardEditorProps<LegendItem[] | undefined, unknown, PanelOptions>> = ({
  value,
  onChange,
  context,
}) => {
  const theme = useTheme2();
  const itens = value ?? legendaPadrao(context.options?.downColor ?? DEFAULT_OPTIONS.downColor);
  const patch = (idx: number, p: Partial<LegendItem>) => onChange(itens.map((it, i) => (i === idx ? { ...it, ...p } : it)));

  return (
    <div>
      {itens.map((it, idx) => (
        <div
          key={idx}
          style={{
            display: 'flex', flexDirection: 'column', gap: 6, padding: 6, marginBottom: 6,
            borderRadius: 4, background: theme.colors.background.secondary,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 18, height: 3, flex: 'none', borderRadius: 1, background: it.color }} />
            <Input
              value={it.label}
              placeholder="o que essa cor quer dizer"
              onChange={(e) => patch(idx, { label: e.currentTarget.value })}
            />
            <IconButton name="trash-alt" tooltip="Remover da legenda" onClick={() => onChange(itens.filter((_, i) => i !== idx))} />
          </div>
          <CorDaRegra color={it.color} onChange={(color) => patch(idx, { color })} marcada={theme.colors.text.primary} />
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {/* Item novo nasce cinza, como a regra nova: a cor fica por escolher */}
        <Button size="sm" variant="secondary" icon="plus" onClick={() => onChange([...itens, { color: '#64748b', label: '' }])}>
          Adicionar cor
        </Button>
        {value && (
          <Button size="sm" variant="secondary" fill="text" onClick={() => onChange(undefined)}>
            Voltar ao padrão
          </Button>
        )}
      </div>
    </div>
  );
};
