import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

function unquote(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    const quote = trimmed[0];
    const body = trimmed.slice(1, -1);
    if (quote === "'") {
      return body.replace(/''/g, "'");
    }
    return body;
  }
  return trimmed;
}

function parseScalar(rawValue) {
  const value = unquote(rawValue);
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (/^-?\d+$/.test(value)) return Number.parseInt(value, 10);
  return value;
}

export function parseSimpleYaml(content) {
  const lines = content.split(/\r?\n/);
  const data = {};

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i];
    if (!rawLine || /^\s*#/.test(rawLine)) {
      continue;
    }

    const line = rawLine.replace(/\t/g, '  ');
    if (/^\s/.test(line)) {
      continue;
    }

    const keyMatch = line.match(/^([^:#]+):\s*(.*)$/);
    if (!keyMatch) {
      continue;
    }

    const key = keyMatch[1].trim();
    const rest = keyMatch[2] ?? '';

    if (rest === '') {
      const list = [];
      let j = i + 1;
      while (j < lines.length) {
        const nextRaw = lines[j];
        if (!nextRaw || /^\s*#/.test(nextRaw)) {
          j += 1;
          continue;
        }

        if (!/^\s{2,}-\s+/.test(nextRaw)) {
          break;
        }

        list.push(parseScalar(nextRaw.replace(/^\s*-\s+/, '')));
        j += 1;
      }

      if (list.length > 0) {
        data[key] = list;
        i = j - 1;
      } else {
        data[key] = '';
      }
      continue;
    }

    if (rest === '|') {
      const block = [];
      let j = i + 1;
      while (j < lines.length) {
        const nextRaw = lines[j];
        if (!/^\s{2,}/.test(nextRaw)) {
          break;
        }
        block.push(nextRaw.replace(/^\s{2}/, ''));
        j += 1;
      }
      data[key] = block.join('\n');
      i = j - 1;
      continue;
    }

    data[key] = parseScalar(rest);
  }

  return data;
}

export async function readYamlFile(filePath) {
  if (!existsSync(filePath)) {
    return null;
  }

  const content = await readFile(filePath, 'utf8');
  return parseSimpleYaml(content);
}
