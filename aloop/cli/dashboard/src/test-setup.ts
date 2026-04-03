import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// jsdom does not implement window.matchMedia — provide a stub so hooks like
// useBreakpoint that call window.matchMedia don't throw in unit tests.
// The stub evaluates simple min-width / max-width queries against window.innerWidth
// so breakpoint detection behaves correctly when tests set a specific innerWidth.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => {
    const width = window.innerWidth;
    const maxMatch = query.match(/\(max-width:\s*(\d+)px\)/);
    const minMatch = query.match(/\(min-width:\s*(\d+)px\)/);
    let matches = false;
    if (maxMatch && minMatch) {
      matches = width >= parseInt(minMatch[1]) && width <= parseInt(maxMatch[1]);
    } else if (maxMatch) {
      matches = width <= parseInt(maxMatch[1]);
    } else if (minMatch) {
      matches = width >= parseInt(minMatch[1]);
    }
    return {
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    };
  }),
});
