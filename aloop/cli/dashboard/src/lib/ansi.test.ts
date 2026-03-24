import { describe, it, expect } from 'vitest';
import { stripAnsi, rgbStr, PALETTE_256, parseAnsiSegments, renderAnsiToHtml } from './ansi';

describe('stripAnsi', () => {
  it('strips ANSI color codes', () => {
    expect(stripAnsi('\x1b[31mred text\x1b[0m')).toBe('red text');
  });

  it('returns plain text unchanged', () => {
    expect(stripAnsi('hello world')).toBe('hello world');
  });

  it('strips complex escape sequences', () => {
    expect(stripAnsi('\x1b[1;31;40mbold red on black\x1b[0m')).toBe('bold red on black');
  });

  it('handles empty string', () => {
    expect(stripAnsi('')).toBe('');
  });

  it('strips multiple escape codes', () => {
    expect(stripAnsi('\x1b[31mA\x1b[32mB\x1b[0m')).toBe('AB');
  });
});

describe('rgbStr', () => {
  it('formats RGB triplets', () => {
    expect(rgbStr(1, 2, 3)).toBe('1,2,3');
    expect(rgbStr(255, 0, 128)).toBe('255,0,128');
  });
});

describe('PALETTE_256', () => {
  it('has 256 entries', () => {
    expect(PALETTE_256).toHaveLength(256);
  });

  it('standard colors (0-7) are correct', () => {
    expect(PALETTE_256[0]).toEqual([0, 0, 0]);
    expect(PALETTE_256[1]).toEqual([187, 0, 0]);
    expect(PALETTE_256[7]).toEqual([187, 187, 187]);
  });

  it('bright colors (8-15) are correct', () => {
    expect(PALETTE_256[8]).toEqual([85, 85, 85]);
    expect(PALETTE_256[15]).toEqual([255, 255, 255]);
  });

  it('6x6x6 cube (16-231) has correct boundaries', () => {
    expect(PALETTE_256[16]).toEqual([0, 0, 0]);
    expect(PALETTE_256[231]).toEqual([255, 255, 255]);
  });

  it('grayscale ramp (232-255) is monotonically increasing', () => {
    expect(PALETTE_256[232]).toEqual([8, 8, 8]);
    // Last entry: 8 + 23*10 = 238
    expect(PALETTE_256[255]).toEqual([238, 238, 238]);
    for (let i = 233; i <= 255; i++) {
      expect(PALETTE_256[i][0]).toBeGreaterThan(PALETTE_256[i - 1][0]);
    }
  });
});

describe('parseAnsiSegments', () => {
  it('returns plain text as single segment', () => {
    const segments = parseAnsiSegments('hello');
    expect(segments).toEqual([{ text: 'hello', style: {} }]);
  });

  it('parses bold red text', () => {
    const segments = parseAnsiSegments('a\x1b[1;31mB\x1b[0mC');
    expect(segments).toHaveLength(3);
    expect(segments[0]).toEqual({ text: 'a', style: {} });
    expect(segments[1].text).toBe('B');
    expect(segments[1].style.bold).toBe(true);
    expect(segments[1].style.fg).toBeTruthy();
    expect(segments[2]).toEqual({ text: 'C', style: {} });
  });

  it('handles faint, italic, underline styles', () => {
    const segments = parseAnsiSegments('\x1b[2;3;4mstyled\x1b[0m');
    expect(segments[0].style.faint).toBe(true);
    expect(segments[0].style.italic).toBe(true);
    expect(segments[0].style.underline).toBe(true);
  });

  it('resets style with code 0', () => {
    const segments = parseAnsiSegments('\x1b[1mB\x1b[0mP');
    expect(segments[0].style.bold).toBe(true);
    expect(segments[1].style).toEqual({});
  });

  it('handles standard foreground colors (30-37)', () => {
    const segments = parseAnsiSegments('\x1b[31mred\x1b[0m');
    expect(segments[0].style.fg).toBe('187,0,0');
  });

  it('handles standard background colors (40-47)', () => {
    const segments = parseAnsiSegments('\x1b[41mredbg\x1b[0m');
    expect(segments[0].style.bg).toBe('187,0,0');
  });

  it('handles bright foreground colors (90-97)', () => {
    const segments = parseAnsiSegments('\x1b[90mbright\x1b[0m');
    expect(segments[0].style.fg).toBe('85,85,85');
  });

  it('handles bright background colors (100-107)', () => {
    const segments = parseAnsiSegments('\x1b[100mbrightbg\x1b[0m');
    expect(segments[0].style.bg).toBe('85,85,85');
  });

  it('handles 256-color foreground (38;5;N)', () => {
    const segments = parseAnsiSegments('\x1b[38;5;200mX\x1b[0m');
    expect(segments[0].style.fg).toBeTruthy();
  });

  it('handles 256-color background (48;5;N)', () => {
    const segments = parseAnsiSegments('\x1b[48;5;100mX\x1b[0m');
    expect(segments[0].style.bg).toBeTruthy();
  });

  it('ignores out-of-range 256-color index', () => {
    const segments = parseAnsiSegments('\x1b[38;5;300mX\x1b[0m');
    expect(segments[0].style.fg).toBeUndefined();
  });

  it('handles truecolor foreground (38;2;R;G;B)', () => {
    const segments = parseAnsiSegments('\x1b[38;2;100;150;200mX\x1b[0m');
    expect(segments[0].style.fg).toBe('100,150,200');
  });

  it('handles truecolor background (48;2;R;G;B)', () => {
    const segments = parseAnsiSegments('\x1b[48;2;1;2;3mX\x1b[0m');
    expect(segments[0].style.bg).toBe('1,2,3');
  });

  it('ignores invalid truecolor values', () => {
    const segments = parseAnsiSegments('\x1b[38;2;300;2;3mX\x1b[0m');
    expect(segments[0].style.fg).toBeUndefined();
  });

  it('handles unset fg (39) and bg (49)', () => {
    const segments = parseAnsiSegments('A\x1b[31;41mB\x1b[39;49mC\x1b[0m');
    expect(segments[1].style.fg).toBeTruthy();
    expect(segments[1].style.bg).toBeTruthy();
    expect(segments[2].style.fg).toBeUndefined();
    expect(segments[2].style.bg).toBeUndefined();
  });

  it('handles bold/faint/italic/underline reset codes', () => {
    const segments = parseAnsiSegments('A\x1b[1;2;3;4mB\x1b[21;22;23;24mC\x1b[0m');
    expect(segments[1].style.bold).toBe(true);
    expect(segments[1].style.faint).toBe(true);
    expect(segments[2].style.bold).toBe(false);
    expect(segments[2].style.faint).toBe(false);
    expect(segments[2].style.italic).toBe(false);
    expect(segments[2].style.underline).toBe(false);
  });

  it('handles empty escape sequence as reset', () => {
    const segments = parseAnsiSegments('A\x1b[1mB\x1b[mC');
    expect(segments[1].style.bold).toBe(true);
    expect(segments[2].style).toEqual({});
  });

  it('handles combined foreground and background codes', () => {
    const segments = parseAnsiSegments('A\x1b[2;3;4;90;100mB\x1b[0mC');
    expect(segments[1].style.faint).toBe(true);
    expect(segments[1].style.italic).toBe(true);
    expect(segments[1].style.underline).toBe(true);
    expect(segments[1].style.fg).toBeTruthy();
    expect(segments[1].style.bg).toBeTruthy();
  });
});

describe('renderAnsiToHtml', () => {
  it('renders markdown with GFM by default', () => {
    const html = renderAnsiToHtml('**bold**');
    expect(html).toContain('<strong>bold</strong>');
  });

  it('wraps styled text in span with inline styles', () => {
    const html = renderAnsiToHtml('\x1b[31mred\x1b[0m');
    expect(html).toContain('color:rgb(187,0,0)');
    expect(html).toContain('<span class="ansi"');
  });

  it('renders unstyled text without wrapping span', () => {
    const html = renderAnsiToHtml('plain');
    expect(html).not.toContain('<span class="ansi"');
  });

  it('supports bold style', () => {
    const html = renderAnsiToHtml('\x1b[1mbold\x1b[0m');
    expect(html).toContain('font-weight:bold');
  });

  it('supports italic style', () => {
    const html = renderAnsiToHtml('\x1b[3mitalic\x1b[0m');
    expect(html).toContain('font-style:italic');
  });

  it('supports underline style', () => {
    const html = renderAnsiToHtml('\x1b[4munderline\x1b[0m');
    expect(html).toContain('text-decoration:underline');
  });

  it('supports faint style', () => {
    const html = renderAnsiToHtml('\x1b[2mfaint\x1b[0m');
    expect(html).toContain('opacity:0.7');
  });

  it('supports background color', () => {
    const html = renderAnsiToHtml('\x1b[41mredbg\x1b[0m');
    expect(html).toContain('background-color:rgb(187,0,0)');
  });

  it('respects breaks option', () => {
    const html = renderAnsiToHtml('a\nb', { breaks: false });
    expect(html).not.toContain('<br');
  });
});
