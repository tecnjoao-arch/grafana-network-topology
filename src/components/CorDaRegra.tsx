// components/CorDaRegra.tsx — Cores prontas de uma regra (valor → cor) + "outra cor".
// O mesmo seletor nas regras de nó e de link: o quadradinho que o usuário clica
// é a mesma decisão que o mapa toma (CORES_DE_REGRA em utils/status.ts).

import React from 'react';
import { CORES_DE_REGRA } from '../utils/status';

export const CorDaRegra: React.FC<{
  color?: string;
  onChange: (color: string) => void;
  /** Borda da cor escolhida. Branca nos editores do mapa (fundo escuro); nas
   *  opções do painel vem do tema do Grafana, que pode ser claro. */
  marcada?: string;
}> = ({ color, onChange, marcada = '#fff' }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1, flexWrap: 'wrap' }}>
    {CORES_DE_REGRA.map((c) => (
      <button
        key={c.color}
        title={c.nome}
        onClick={() => onChange(c.color)}
        style={{
          width: 16, height: 16, padding: 0, borderRadius: 3, cursor: 'pointer', background: c.color,
          border: (color ?? '').toLowerCase() === c.color ? `2px solid ${marcada}` : '1px solid #334155',
        }}
      />
    ))}
    <input
      type="color"
      value={/^#[0-9a-f]{6}$/i.test(color ?? '') ? color : '#64748b'}
      onChange={(e) => onChange(e.target.value)}
      title="Outra cor (vermelho conta como queda, âmbar como alerta, cinza como sem status; as demais, no ar)"
      style={{ width: 18, height: 18, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}
    />
  </div>
);
