// components/SeriesCombo.tsx — Campo de binding com dropdown customizado de séries.
// Substitui o <datalist> nativo, que cortava os nomes longos do Zabbix (a parte
// que diferencia os itens fica no final) e não tinha barra de rolagem.

import React, { useMemo, useRef, useState } from 'react';
import { stableMatch } from '../utils/dataBinding';

export const SeriesCombo: React.FC<{
  value: string;
  seriesKeys: string[];
  placeholder?: string;
  onChange: (v: string) => void;
}> = ({ value, seriesKeys, placeholder, onChange }) => {
  const [open, setOpen] = useState(false);
  const [hoverIdx, setHoverIdx] = useState(-1);
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const openList = () => {
    const r = inputRef.current?.getBoundingClientRect();
    if (r) setAnchor({ top: r.bottom + 2, right: r.right });
    setOpen(true);
  };

  // A lista mostra (e grava) o pedaço distintivo, não o identificador inteiro.
  // O identificador completo muda de composição conforme o formato que o
  // datasource devolve; gravar ele inteiro amarra o binding a um formato e ele
  // para de casar quando o outro volta. Duas entradas com o mesmo pedaço são o
  // mesmo item repetido pelo datasource — viram uma linha só, e a lista deixa
  // de ter milhares de nomes gigantes e ilegíveis.
  const options = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ label: string; full: string }> = [];
    for (const k of seriesKeys) {
      const label = stableMatch(k);
      if (!label || seen.has(label)) continue;
      seen.add(label);
      out.push({ label, full: k });
    }
    return out;
  }, [seriesKeys]);

  const q = value.trim().toLowerCase();
  // Busca tolerante: casa pelo que está à mostra ou pelo identificador cru
  // (permite procurar por label, ex: "host=RTR1").
  const filtered = q
    ? options.filter((o) => o.label.toLowerCase().includes(q) || o.full.toLowerCase().includes(q))
    : options;
  const width = Math.min(480, (typeof window !== 'undefined' ? window.innerWidth : 480) - 24);
  const left = anchor ? Math.max(8, anchor.right - width) : 0;

  return (
    <>
      <input
        ref={inputRef}
        type="text"
        value={value}
        placeholder={placeholder ?? 'ex: UERJ.*if.*in'}
        onChange={(e) => { onChange(e.target.value); openList(); }}
        onFocus={openList}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => { if (e.key === 'Escape' || e.key === 'Enter') setOpen(false); }}
        style={inputStyle}
      />
      {open && anchor && filtered.length > 0 && (
        // position:fixed escapa do overflow do painel do editor (que tem scroll próprio)
        <div style={{ ...dropdownStyle, top: anchor.top, left, width }}>
          {filtered.slice(0, 150).map((o, i) => (
            <div
              key={i}
              // mousedown (não click): dispara antes do blur do input fechar a lista
              onMouseDown={(e) => { e.preventDefault(); onChange(o.label); setOpen(false); }}
              onMouseEnter={() => setHoverIdx(i)}
              title={o.full}
              style={{
                ...itemStyle,
                background: hoverIdx === i ? '#1d4ed8' : 'transparent',
                color: hoverIdx === i ? '#fff' : '#cbd5e1',
              }}
            >
              {o.label}
            </div>
          ))}
          {filtered.length > 150 && (
            <div style={{ ...itemStyle, color: '#64748b', cursor: 'default' }}>
              … mais {filtered.length - 150} séries — digite para filtrar
            </div>
          )}
        </div>
      )}
    </>
  );
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: 4,
  color: '#e2e8f0',
  padding: '5px 8px',
  fontSize: 12,
  fontFamily: 'monospace',
};

const dropdownStyle: React.CSSProperties = {
  position: 'fixed',
  zIndex: 10010,
  maxHeight: 260,
  overflowY: 'auto',
  background: '#0b1220',
  border: '1px solid #3b82f6',
  borderRadius: 6,
  boxShadow: '0 12px 32px rgba(0,0,0,0.6)',
};

const itemStyle: React.CSSProperties = {
  padding: '5px 8px',
  fontSize: 10.5,
  fontFamily: 'monospace',
  cursor: 'pointer',
  wordBreak: 'break-all',
  lineHeight: 1.35,
  borderBottom: '1px solid #131c30',
};
