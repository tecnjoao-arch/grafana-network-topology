// components/nodes/DeviceNode.tsx — Nó (ícone + label + IP + badge).
// Sem handles fixos: as âncoras das linhas são livres (definidas na aresta).

import React from 'react';
import { Handle, Position, NodeProps, NodeResizer } from '@xyflow/react';
import { DeviceNodeData } from '../../types';
import { getDeviceIcon } from '../../icons';
import { useEditor } from '../EditorContext';
import { useCopiado } from '../useCopiado';
import { paletteFor, effectiveBg, readableOn, ensureContrast } from '../../utils/theme';

interface Props extends NodeProps {
  data: DeviceNodeData;
}

/** Só abre links http/https (ou relativos ao próprio Grafana). Bloqueia
 *  javascript:, data:, file:… — evita que um linkUrl malicioso vire XSS. */
function isSafeUrl(url: string): boolean {
  const u = url.trim();
  if (u.startsWith('/') || u.startsWith('#')) return true; // relativo ao Grafana
  try {
    const proto = new URL(u, window.location.origin).protocol;
    return proto === 'http:' || proto === 'https:';
  } catch {
    return false;
  }
}

export const DeviceNode: React.FC<Props> = ({ id, data, selected }) => {
  const { label, ip, deviceType, status, customIcon, color, iconSize, searchQuery, nodeWidth, nodeHeight, borderRadius, bgColor, linkUrl, showIp, statusDetail, iconColorMode } = data as any;
  // Escala da fonte do painel (opção "Escala da fonte" p/ TV de NOC):
  // textos escalam via em; ícone e badge usam px e precisam multiplicar.
  const fontScale = (data as any).fontScale ?? 1;
  const { editMode, setNodeData, openTest, theme, publicMode } = useEditor();
  // Modo público fora do editor: nada de IP, causa, link ou teste
  const publico = !!publicMode && !editMode;
  const pal = paletteFor(theme);
  // Rótulo e IP pela cor do fundo REAL do nó. Fixos em branco, sumiam em nó
  // de fundo transparente no tema claro (1,05:1) e em fundo claro escolhido
  // pelo usuário nos dois temas.
  const fundoReal = effectiveBg(bgColor ?? pal.nodeBg, pal.canvas);
  const legivel = readableOn(fundoReal);

  // Hover no nó (modo visualização) → mostra o botão 🌐 de testes de rede
  const [hovered, setHovered] = React.useState(false);

  // Tamanho "ao vivo" durante o resize: atualiza só o estado local (visual).
  // A persistência nas options acontece apenas no fim (handleResizeEnd), evitando
  // um onOptionsChange por tick — o que travava a UI e marcava o dashboard sujo.
  const [liveSize, setLiveSize] = React.useState<{ w?: number; h?: number }>({});

  // Quando as props de tamanho chegam (após persistir), o estado local volta a
  // ser autoritativo das props — sem flash, pois os valores coincidem.
  React.useEffect(() => { setLiveSize({}); }, [data.nodeWidth, data.nodeHeight]);

  const handleResize = (_: any, params: any) => {
    setLiveSize({ w: Math.round(params.width), h: Math.round(params.height) });
  };

  const handleResizeEnd = (_: any, params: any) => {
    setLiveSize({ w: Math.round(params.width), h: Math.round(params.height) });
    if (setNodeData) {
      setNodeData(id, { nodeWidth: Math.round(params.width), nodeHeight: Math.round(params.height) });
    }
  };

  const effWidth = liveSize.w ?? nodeWidth;
  const effHeight = liveSize.h ?? nodeHeight;

  const handleNodeClick = (e: React.MouseEvent) => {
    if (!editMode && !publico && linkUrl && isSafeUrl(linkUrl)) {
      e.stopPropagation();
      // noopener,noreferrer: a página aberta não recebe window.opener nem o Referer
      window.open(linkUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const [copied, copiar] = useCopiado<true>();
  const handleCopy = () => {
    if (!ip) return;
    copiar(ip, true);
  };

  const hasSearch = !!searchQuery;
  const q = searchQuery?.toLowerCase() || '';
  const matchesSearch = hasSearch && (
    (label?.toLowerCase().includes(q)) ||
    (ip?.toLowerCase().includes(q))
  );

  const fade = hasSearch && !matchesSearch;
  const nodeOpacity = fade ? 0.2 : 1;

  const borderColor =
    selected ? '#3b82f6' :
    status === 'down' ? pal.line.down :
    status === 'warning' ? pal.line.warning :
    pal.nodeBorder;

  return (
    <div
      onClick={handleNodeClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      // Por que está nessa cor: "sem coleta há 12 min" e "série não encontrada"
      // exigem reações opostas (técnico vs revisar binding) e sem isso o
      // operador só vê vermelho.
      title={publico ? undefined : statusDetail || undefined}
      style={{
        opacity: nodeOpacity,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '8px 12px',
        borderRadius: borderRadius ?? 8,
        background: bgColor ?? pal.nodeBg,
        border: `2px solid ${borderColor}`,
        boxShadow: status === 'down' ? '0 0 12px rgba(239,68,68,0.6)' : `0 2px 8px ${pal.shadow}`,
        minWidth: effWidth ?? 90,
        width: effWidth ? '100%' : 'auto',
        minHeight: effHeight,
        height: effHeight ? '100%' : 'auto',
        boxSizing: 'border-box',
        transition: 'box-shadow 200ms, border-color 200ms, background 200ms, border-radius 200ms',
        position: 'relative',
        justifyContent: 'center',
        cursor: (!editMode && !publico && linkUrl) ? 'pointer' : undefined,
      }}
    >
      {/* Botão de testes de rede: aparece no hover (modo visualização).
          Convive com o clique esquerdo (linkUrl) e o botão direito. */}
      {!editMode && !publico && hovered && openTest && (
        <button
          onClick={(e) => {
            e.stopPropagation(); // não disparar o linkUrl do nó
            openTest?.((ip as string) ?? '');
          }}
          style={{
            position: 'absolute',
            top: Math.round(-14 * fontScale),
            right: Math.round(-14 * fontScale),
            width: Math.round(38 * fontScale),
            height: Math.round(38 * fontScale),
            borderRadius: '50%',
            background: '#0e7490',
            border: '2px solid #67e8f9',
            color: '#fff',
            fontSize: Math.round(19 * fontScale),
            lineHeight: 1,
            cursor: 'pointer',
            zIndex: 30,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            boxShadow: '0 3px 10px rgba(0,0,0,0.6)',
          }}
        >
          🌐
        </button>
      )}

      {editMode && (
        <>
          <NodeResizer
            color="#3b82f6"
            isVisible={selected}
            minWidth={50}
            minHeight={50}
            onResize={handleResize}
            onResizeEnd={handleResizeEnd}
            handleStyle={{ width: 10, height: 10, borderRadius: 2 }}
          />

          <Handle id="top" type="source" position={Position.Top} style={edgeHStyle} />
          <Handle id="bottom" type="source" position={Position.Bottom} style={edgeHStyle} />
          <Handle id="left" type="source" position={Position.Left} style={edgeHStyle} />
          <Handle id="right" type="source" position={Position.Right} style={edgeHStyle} />
        </>
      )}

      {/* Handles ocultos fallback p/ React Flow não reclamar */}
      {!editMode && (
        <>
          <Handle type="source" position={Position.Top} id="top" style={{ opacity: 0, pointerEvents: 'none' }} />
          <Handle type="source" position={Position.Bottom} id="bottom" style={{ opacity: 0, pointerEvents: 'none' }} />
        </>
      )}

      <div style={{ position: 'relative', lineHeight: 0 }}>
        {getDeviceIcon(deviceType, {
          size: Math.round((iconSize ?? 56) * fontScale),
          status,
          color,
          customIcon,
          colorMode: iconColorMode,
        })}
        {/* O ponto mostra só o status. Ele herdava a cor da regra, que agora
            define o status em vez de pintar o nó diretamente. */}
        {status && status !== 'unknown' && (
          <span
            style={{
              position: 'absolute',
              bottom: 0,
              right: 0,
              width: Math.round(12 * fontScale),
              height: Math.round(12 * fontScale),
              borderRadius: '50%',
              background:
                status === 'up' ? pal.line.up :
                status === 'warning' ? pal.line.warning :
                pal.line.down,
              // Recorte na cor do fundo do nó: separa o ponto do ícone nos dois temas.
              border: `2px solid ${fundoReal}`,
              boxShadow: status === 'down' ? `0 0 6px ${pal.line.down}` : 'none',
            }}
          />
        )}
      </div>

      <div
        style={{
          marginTop: 4,
          color: legivel.text,
          fontSize: '0.9em',
          fontWeight: 600,
          textAlign: 'center',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </div>
      {/* Obedece ao mesmo toggle de IP dos cards de link: antes o botão da
          barra escondia só os cards e o IP do nó continuava exposto — meio
          toggle não serve pra apresentar o mapa em tela pública.
          `visibility` em vez de deixar de renderizar: removendo o elemento o nó
          ENCOLHE, e como as arestas saem do centro do nó, o mapa inteiro se
          desloca ao ligar/desligar o botão. Ocupando o espaço vazio, o layout
          que o usuário posicionou à mão fica idêntico nos dois estados. */}
      {/* Modo público: o IP nem vai pro HTML (aqui o visibility:hidden não
          basta — o texto continuaria lá). No lugar, zeros do MESMO tamanho
          (fonte monoespaçada, espaços nos mesmos pontos): o nó fica com a
          largura e a altura do mapa interno. Só a altura não bastava — o IP
          costuma ser mais largo que o nome, o nó encolhia, as âncoras (fração
          do tamanho do nó) andavam e as rotas manuais entortavam. */}
      {ip && publico && (
        <div aria-hidden style={{ ...linhaIp(ip), visibility: 'hidden' }}>
          {ip.replace(/\S/g, '0')}
        </div>
      )}
      {ip && !publico && (
        <div
          onClick={showIp === false ? undefined : handleCopy}
          title={showIp === false ? undefined : 'Clique para copiar o IP'}
          aria-hidden={showIp === false}
          style={{
            ...linhaIp(ip),
            visibility: showIp === false ? 'hidden' : 'visible',
            color: copied ? ensureContrast(pal.ok, fundoReal, 4.5) : legivel.muted,
            cursor: 'pointer',
            background: copied ? 'rgba(74, 222, 128, 0.1)' : 'transparent',
            borderRadius: 4,
            transition: 'all 0.2s',
          }}
        >
          {copied ? 'Copiado!' : ip}
        </div>
      )}
    </div>
  );
};

/** A linha do IP com LARGURA FIXA por caractere, em vez da largura que a
 *  fonte der. O IP costuma ser o que define a largura do nó, e a fonte
 *  monoespaçada muda de sistema pra sistema: 0,55 em por letra no Windows
 *  (Consolas), 0,6 no Android e no Linux. Nó mais largo → as âncoras (fração
 *  do tamanho do nó) andam → as rotas desenhadas no Windows entortavam no
 *  celular e na TV. 0,55 em é a medida da Consolas, onde os mapas são
 *  montados: lá nada muda, e os outros passam a ver igual. Também segura o
 *  "Copiado!" (mais curto que o IP) sem o nó encolher por um instante. */
function linhaIp(ip: string): React.CSSProperties {
  return {
    width: `${ip.length * 0.55}em`, fontSize: '0.75em', fontFamily: 'monospace',
    padding: '2px 4px', whiteSpace: 'nowrap', textAlign: 'center',
  };
}

const edgeHStyle: React.CSSProperties = {
  width: 14,
  height: 14,
  background: '#3b82f6',
  border: '2px solid #0f172a',
  borderRadius: '50%',
  zIndex: 20,
  cursor: 'crosshair',
};
