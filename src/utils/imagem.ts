// utils/imagem.ts — Prepara a imagem enviada como ícone de nó.
// Ela vai em base64 DENTRO do JSON do dashboard, que todo visitante baixa
// inteiro a cada abertura (e que o nginx limita a 20 MB por save): uma foto de
// celular de 5 MB virava ~7 MB de texto no painel. Então: só formatos de
// imagem comuns, e foto grande é reduzida pro tamanho de ícone.

/** Formatos aceitos. O `accept` do input é só sugestão — "Todos os arquivos"
 *  passa qualquer coisa. SVG entra porque é desenhado num <img>, onde script
 *  de SVG não roda. */
export const TIPOS_DE_IMAGEM = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'];

const KB = 1024;
/** Até aqui guarda como veio: mantém o desenho exato e o GIF animado (acima
 *  disso o GIF é reduzido e vira imagem parada, o primeiro quadro). */
const SEM_MEXER = 64 * KB;
/** SVG não dá pra reduzir (é vetor): grande demais é recusado. */
const SVG_MAX = 100 * KB;
/** Acima disso nem abre: decodificar a imagem custa memória no navegador. */
const ENTRADA_MAX = 20 * KB * KB;
/** O ícone vai até 150 px na tela; 256 cobre tela de alta densidade. */
export const LADO_MAX = 256;

const fmtKB = (b: number) => `${Math.round(b / KB)} KB`;

export type Avaliacao = { acao: 'manter' | 'reduzir' } | { erro: string };

/** O que fazer com o arquivo, só pelo tipo e tamanho (sem abrir). */
export function avaliarImagem(tipo: string, bytes: number): Avaliacao {
  if (!TIPOS_DE_IMAGEM.includes(tipo)) {
    return { erro: 'Formato não aceito — use PNG, JPG, GIF, WebP ou SVG.' };
  }
  if (tipo === 'image/svg+xml') {
    return bytes <= SVG_MAX ? { acao: 'manter' } : { erro: `SVG grande demais (${fmtKB(bytes)}; máximo ${fmtKB(SVG_MAX)}).` };
  }
  if (bytes > ENTRADA_MAX) {
    return { erro: `Arquivo grande demais (${(bytes / KB / KB).toFixed(1)} MB; máximo 20 MB).` };
  }
  return bytes <= SEM_MEXER ? { acao: 'manter' } : { acao: 'reduzir' };
}

/** Data URL pronto pro ícone, ou o motivo da recusa. */
export async function prepararIcone(file: File): Promise<{ url: string } | { erro: string }> {
  const a = avaliarImagem(file.type, file.size);
  if ('erro' in a) {
    return a;
  }
  try {
    const original = await lerComoDataUrl(file);
    return { url: a.acao === 'manter' ? original : await reduzir(original) };
  } catch {
    return { erro: 'Não consegui abrir essa imagem.' };
  }
}

function lerComoDataUrl(file: File): Promise<string> {
  return new Promise((ok, falha) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => falha(r.error);
    r.readAsDataURL(file);
  });
}

/** Redesenha com o lado maior em LADO_MAX e fica com o menor entre WebP e
 *  PNG (os dois mantêm transparência; navegador sem WebP devolve PNG). */
async function reduzir(dataUrl: string): Promise<string> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const escala = Math.min(1, LADO_MAX / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.naturalWidth * escala));
  c.height = Math.max(1, Math.round(img.naturalHeight * escala));
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  const webp = c.toDataURL('image/webp', 0.9);
  const png = c.toDataURL('image/png');
  return webp.length < png.length ? webp : png;
}
