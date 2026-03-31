import { describe, expect, it } from 'vitest';
import {
  formatDateKey,
  formatDuration,
  formatSecs,
  formatTime,
  formatTimeShort,
  isRecord,
  numStr,
  parseAnsiSegments,
  relativeTime,
  renderAnsiToHtml,
  rgbStr,
  str,
  stripAnsi,
  toSession,
} from './App';

describe('App.tsx helper coverage - ansi and string helpers', () => {
  it('covers ansi helpers', () => {
    expect(stripAnsi('\u001b[31merror\u001b[0m ok')).toBe('error ok');
    expect(rgbStr(1, 2, 3)).toBe('1,2,3');

    const segments = parseAnsiSegments('a\u001b[1;31mB\u001b[22;39mC');
    expect(segments.length).toBe(3);
    expect(segments[1].style.bold).toBe(true);
    expect(segments[1].style.fg).toBeTruthy();

    const html = renderAnsiToHtml('**x**');
    expect(html).toContain('<strong>x</strong>');

    const styledHtml = renderAnsiToHtml('\u001b[3;4mmd\u001b[0m');
    expect(styledHtml).toContain('font-style:italic');
    expect(styledHtml).toContain('text-decoration:underline');
  });

  it('covers additional ansi and parser edge branches', () => {
    const segments = parseAnsiSegments(
      'A\u001b[2;3;4;90;100mB\u001b[21;22;23;24;39;49mC\u001b[38;5;300mD\u001b[48;2;999;2;3mE\u001b[0mF',
    );
    expect(segments.length).toBeGreaterThan(2);
    expect(segments[1].style.faint).toBe(true);
    expect(segments[1].style.italic).toBe(true);
    expect(segments[1].style.underline).toBe(true);
    expect(segments[1].style.fg).toBeTruthy();
    expect(segments[1].style.bg).toBeTruthy();

    const resetSeg = segments.find((s) => s.text.includes('C'));
    expect(resetSeg).toBeDefined();
    expect(resetSeg!.style.fg).toBeUndefined();
    expect(resetSeg!.style.bg).toBeUndefined();
    // ANSI reset codes clear italic/underline — value depends on jsdom regex support
    expect(resetSeg!.style.italic !== true).toBe(true);
    expect(resetSeg!.style.underline !== true).toBe(true);

    const noStyled = renderAnsiToHtml('\u001b[0mplain', { gfm: false, breaks: false });
    expect(noStyled).toContain('plain');
  });

  it('covers truecolor and 256-color ansi branches', () => {
    const out = parseAnsiSegments('\u001b[38;5;200mX\u001b[48;2;1;2;3mY\u001b[0m');
    expect(out[1].style.fg).toBeTruthy();
    expect(out[1].style.bg).toBe('1,2,3');
  });

  it('covers record/string/number extraction helpers', () => {
    expect(isRecord({ a: 1 })).toBe(true);
    expect(isRecord(null)).toBe(false);
    expect(isRecord([])).toBe(false);

    expect(str({ a: ' ', b: 'x' }, ['a', 'b'])).toBe('x');
    expect(str({}, ['a'], 'fb')).toBe('fb');

    expect(numStr({ a: Number.POSITIVE_INFINITY, b: ' 42 ' }, ['a', 'b'])).toBe('42');
    expect(numStr({ a: 5 }, ['a'])).toBe('5');
    expect(numStr({}, ['a'], 'n/a')).toBe('n/a');
  });

  it('covers toSession fallbacks', () => {
    const s = toSession({ status: 'running', iteration: 2, stuck_count: 3 }, 'proj-12', true);
    expect(s.id).toBe('proj-12');
    expect(s.projectName).toBe('proj');
    expect(s.status).toBe('running');
    expect(s.iterations).toBe('2');
    expect(s.stuckCount).toBe(3);
    expect(s.isActive).toBe(true);
  });

  it('covers date/time formatting', () => {
    expect(formatTime('')).toBe('');
    expect(formatTimeShort('')).toBe('');

    expect(formatSecs(10)).toBe('10s');
    expect(formatSecs(65)).toBe('1m 5s');
    expect(formatSecs(120)).toBe('2m');

    expect(formatDuration('61s')).toBe('1m 1s');
    expect(formatDuration('n/a')).toBe('n/a');

    expect(formatDateKey('')).toBe('Unknown');
  });

  it('covers relativeTime branches', () => {
    const now = Date.now();
    expect(relativeTime(new Date(now - 20_000).toISOString())).toBe('just now');
    expect(relativeTime(new Date(now - 8 * 60_000).toISOString())).toBe('8m ago');
    expect(relativeTime(new Date(now - 2 * 60 * 60_000).toISOString())).toBe('2h ago');
    expect(relativeTime(new Date(now - 3 * 24 * 60 * 60_000).toISOString())).toBe('3d ago');
    expect(relativeTime('')).toBe('');
  });
});
