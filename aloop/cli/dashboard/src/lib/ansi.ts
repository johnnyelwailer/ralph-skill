import { marked } from 'marked';

// ── ANSI + Markdown rendering ──
// Strip ANSI escape codes from text (for compact log entries)
export const STRIP_ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]/g;

export function stripAnsi(text: string): string {
  return text.replace(STRIP_ANSI_RE, '');
}

// 256-color palette — indices 0-15: standard, 16-231: 6x6x6 RGB, 232-255: grayscale
export const PALETTE_256: [number, number, number][] = (() => {
  const p: [number, number, number][] = [];
  // Standard colors (0-7 normal, 8-15 bright)
  const std: [number, number, number][] = [
    [0, 0, 0], [187, 0, 0], [0, 187, 0], [187, 187, 0],
    [0, 0, 187], [187, 0, 187], [0, 187, 187], [187, 187, 187],
    [85, 85, 85], [255, 85, 85], [0, 255, 0], [255, 255, 85],
    [85, 85, 255], [255, 85, 255], [85, 255, 255], [255, 255, 255],
  ];
  for (const c of std) p.push(c);
  // 6x6x6 RGB cube (16-231)
  for (const r of [0, 95, 135, 175, 215, 255])
    for (const g of [0, 95, 135, 175, 215, 255])
      for (const b of [0, 95, 135, 175, 215, 255])
        p.push([r, g, b]);
  // Grayscale ramp (232-255)
  for (let i = 0; i < 24; i++) {
    const v = 8 + i * 10;
    p.push([v, v, v]);
  }
  return p;
})();

export function rgbStr(r: number, g: number, b: number): string {
  return `${r},${g},${b}`;
}

export interface AnsiStyle {
  fg?: string;      // "r,g,b"
  bg?: string;      // "r,g,b"
  bold?: boolean;
  faint?: boolean;
  italic?: boolean;
  underline?: boolean;
}

export function parseAnsiSegments(text: string): { text: string; style: AnsiStyle }[] {
  const segments: { text: string; style: AnsiStyle }[] = [];
  let style: AnsiStyle = {};
  let last = 0;
  const re = /\x1b\[([0-9;]*)m/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) segments.push({ text: text.slice(last, m.index), style: { ...style } });
    const cmds = m[1] ? m[1].split(';') : ['0'];
    let i = 0;
    while (i < cmds.length) {
      const num = parseInt(cmds[i], 10);
      if (isNaN(num) || num === 0) {
        style = {};
      } else if (num === 1) { style.bold = true; }
      else if (num === 2) { style.faint = true; }
      else if (num === 3) { style.italic = true; }
      else if (num === 4) { style.underline = true; }
      else if (num === 21) { style.bold = false; }
      else if (num === 22) { style.bold = false; style.faint = false; }
      else if (num === 23) { style.italic = false; }
      else if (num === 24) { style.underline = false; }
      else if (num === 39) { style.fg = undefined; }
      else if (num === 49) { style.bg = undefined; }
      else if (num >= 30 && num < 38) { style.fg = rgbStr(...PALETTE_256[num - 30]); }
      else if (num >= 40 && num < 48) { style.bg = rgbStr(...PALETTE_256[num - 40]); }
      else if (num >= 90 && num < 98) { style.fg = rgbStr(...PALETTE_256[num - 90 + 8]); }
      else if (num >= 100 && num < 108) { style.bg = rgbStr(...PALETTE_256[num - 100 + 8]); }
      else if (num === 38 || num === 48) {
        const isFg = num === 38;
        const mode = cmds[i + 1];
        if (mode === '5' && i + 2 < cmds.length) {
          // 256-color palette: 38;5;N or 48;5;N
          const idx = parseInt(cmds[i + 2], 10);
          if (idx >= 0 && idx <= 255) {
            const c = rgbStr(...PALETTE_256[idx]);
            if (isFg) style.fg = c; else style.bg = c;
          }
          i += 2;
        } else if (mode === '2' && i + 4 < cmds.length) {
          // True color: 38;2;R;G;B or 48;2;R;G;B
          const r = parseInt(cmds[i + 2], 10);
          const g = parseInt(cmds[i + 3], 10);
          const b = parseInt(cmds[i + 4], 10);
          if ([r, g, b].every(v => v >= 0 && v <= 255)) {
            const c = rgbStr(r, g, b);
            if (isFg) style.fg = c; else style.bg = c;
          }
          i += 4;
        }
      }
      i++;
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last), style: { ...style } });
  return segments;
}

export function renderAnsiToHtml(text: string, opts: { gfm?: boolean; breaks?: boolean } = {}): string {
  const segments = parseAnsiSegments(text);
  const { gfm = true, breaks = true } = opts;
  return segments.map(({ text: segText, style }) => {
    const html = marked.parse(segText, { gfm, breaks }) as string;
    if (!style.fg && !style.bg && !style.bold && !style.faint && !style.italic && !style.underline) {
      return html;
    }
    const styles: string[] = [];
    if (style.fg) styles.push(`color:rgb(${style.fg})`);
    if (style.bg) styles.push(`background-color:rgb(${style.bg})`);
    if (style.bold) styles.push('font-weight:bold');
    if (style.faint) styles.push('opacity:0.7');
    if (style.italic) styles.push('font-style:italic');
    if (style.underline) styles.push('text-decoration:underline');
    return `<span class="ansi" style="${styles.join(';')}">${html}</span>`;
  }).join('');
}
