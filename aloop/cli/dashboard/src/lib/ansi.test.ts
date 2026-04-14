import { describe, it, expect, vi, beforeEach } from 'vitest';
import { stripAnsi, rgbStr, PALETTE_256, parseAnsiSegments, renderAnsiToHtml } from './ansi';

// Mock marked to avoid heavy dependency in unit tests
vi.mock('marked', () => ({
  marked: {
    parse: (text: string) => `<p>${text}</p>\n`,
  },
}));

describe('stripAnsi', () => {
  it('strips color codes', () => {
    expect(stripAnsi('\x1b[31mred\x1b[0m')).toBe('red');
  });

  it('strips multiple codes', () => {
    expect(stripAnsi('\x1b[1m\x1b[32mbold green\x1b[0m text')).toBe('bold green text');
  });

  it('returns plain text unchanged', () => {
    expect(stripAnsi('plain text')).toBe('plain text');
  });

  it('strips cursor movement codes', () => {
    expect(stripAnsi('\x1b[2J\x1b[H')).toBe('');
  });
});

describe('rgbStr', () => {
  it('formats RGB components as comma-separated string', () => {
    expect(rgbStr(255, 128, 0)).toBe('255,128,0');
    expect(rgbStr(0, 0, 0)).toBe('0,0,0');
    expect(rgbStr(255, 255, 255)).toBe('255,255,255');
  });
});

describe('PALETTE_256', () => {
  it('has exactly 256 entries', () => {
    expect(PALETTE_256.length).toBe(256);
  });

  it('standard colors start with black', () => {
    expect(PALETTE_256[0]).toEqual([0, 0, 0]);
  });

  it('bright white is entry 15', () => {
    expect(PALETTE_256[15]).toEqual([255, 255, 255]);
  });

  it('all entries are valid RGB tuples', () => {
    for (const [r, g, b] of PALETTE_256) {
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(255);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(255);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(255);
    }
  });
});

describe('parseAnsiSegments', () => {
  it('returns single segment for plain text', () => {
    const segs = parseAnsiSegments('hello');
    expect(segs).toHaveLength(1);
    expect(segs[0].text).toBe('hello');
    expect(segs[0].style).toEqual({});
  });

  it('applies bold from code 1', () => {
    const segs = parseAnsiSegments('\x1b[1mbold\x1b[0m');
    expect(segs[0].style.bold).toBe(true);
  });

  it('applies italic from code 3', () => {
    const segs = parseAnsiSegments('\x1b[3mitalic\x1b[0m');
    expect(segs[0].style.italic).toBe(true);
  });

  it('applies underline from code 4', () => {
    const segs = parseAnsiSegments('\x1b[4munderline\x1b[0m');
    expect(segs[0].style.underline).toBe(true);
  });

  it('applies faint from code 2', () => {
    const segs = parseAnsiSegments('\x1b[2mfaint\x1b[0m');
    expect(segs[0].style.faint).toBe(true);
  });

  it('applies standard foreground color', () => {
    // code 31 = red (PALETTE_256[1] = [187,0,0])
    const segs = parseAnsiSegments('\x1b[31mred\x1b[0m');
    expect(segs[0].style.fg).toBe('187,0,0');
  });

  it('applies standard background color', () => {
    // code 41 = red background (PALETTE_256[1])
    const segs = parseAnsiSegments('\x1b[41mbg\x1b[0m');
    expect(segs[0].style.bg).toBe('187,0,0');
  });

  it('applies 256-color fg via 38;5;N', () => {
    // Index 196 is a bright red in the 6x6x6 cube
    const segs = parseAnsiSegments('\x1b[38;5;196mcolor\x1b[0m');
    expect(segs[0].style.fg).toBeDefined();
  });

  it('applies truecolor fg via 38;2;R;G;B', () => {
    const segs = parseAnsiSegments('\x1b[38;2;100;150;200mcolor\x1b[0m');
    expect(segs[0].style.fg).toBe('100,150,200');
  });

  it('resets style on code 0', () => {
    const segs = parseAnsiSegments('\x1b[1mbold\x1b[0mnormal');
    const boldSeg = segs.find(s => s.text === 'bold');
    const normalSeg = segs.find(s => s.text === 'normal');
    expect(boldSeg?.style.bold).toBe(true);
    expect(normalSeg?.style.bold).toBeUndefined();
  });

  it('handles text before and after escape codes', () => {
    const segs = parseAnsiSegments('before\x1b[1mbold\x1b[0mafter');
    expect(segs).toHaveLength(3);
    expect(segs[0].text).toBe('before');
    expect(segs[1].text).toBe('bold');
    expect(segs[2].text).toBe('after');
  });
});

describe('renderAnsiToHtml', () => {
  it('passes plain text through marked', () => {
    const result = renderAnsiToHtml('hello');
    expect(result).toContain('hello');
  });

  it('wraps styled segment in span with inline styles', () => {
    const result = renderAnsiToHtml('\x1b[1mbold\x1b[0m');
    expect(result).toContain('font-weight:bold');
    expect(result).toContain('class="ansi"');
  });

  it('adds color style for fg color', () => {
    const result = renderAnsiToHtml('\x1b[31mred\x1b[0m');
    expect(result).toContain('color:rgb(');
  });
});
