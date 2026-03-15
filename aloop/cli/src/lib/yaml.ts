
function stripInlineComment(raw: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < raw.length; i += 1) {
    const char = raw[i];
    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (char === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (char === '#' && !inSingle && !inDouble) {
      const prev = i > 0 ? raw[i - 1] : ' ';
      if (prev === ' ' || prev === '\t') {
        return raw.slice(0, i).trimEnd();
      }
    }
  }
  return raw.trimEnd();
}

export function parseYamlScalar(raw: string): string | number | boolean | null {
  const cleaned = stripInlineComment(raw).trim();
  if (cleaned === '') return '';
  if (/^null$/i.test(cleaned)) return null;
  if (/^true$/i.test(cleaned)) return true;
  if (/^false$/i.test(cleaned)) return false;
  if (/^-?\d+$/.test(cleaned)) return Number.parseInt(cleaned, 10);
  if (cleaned.startsWith("'") && cleaned.endsWith("'") && cleaned.length >= 2) {
    return cleaned.slice(1, -1).replace(/''/g, "'");
  }
  if (cleaned.startsWith('"') && cleaned.endsWith('"') && cleaned.length >= 2) {
    return cleaned.slice(1, -1).replace(/\\"/g, '"');
  }
  return cleaned;
}

/**
 * Very basic YAML parser for simple lists of objects and key-value maps.
 * Not a full YAML spec implementation.
 */
export function parseYaml(content: string): any {
  const lines = content.split(/\r?\n/);
  const result: any = {};
  let currentKey: string | null = null;
  let currentList: any[] | null = null;
  let currentObject: any | null = null;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    const indent = rawLine.length - rawLine.trimStart().length;

    if (indent === 0) {
      const match = trimmed.match(/^([A-Za-z0-9_]+):(?:\s*(.*))?$/);
      if (match) {
        currentKey = match[1];
        const rawValue = (match[2] ?? '').trim();
        if (rawValue === '') {
          result[currentKey] = null; // Could be a list or object following
        } else {
          result[currentKey] = parseYamlScalar(rawValue);
          currentKey = null;
        }
        currentList = null;
        currentObject = null;
        continue;
      }
    }

    if (indent >= 2 && currentKey) {
      // Check for list item
      const listMatch = trimmed.match(/^-\s+(.+)$/);
      if (listMatch) {
        if (!Array.isArray(result[currentKey])) {
          result[currentKey] = [];
        }
        currentList = result[currentKey];
        
        // Handle list of scalars
        const scalarValue = parseYamlScalar(listMatch[1]);
        if (currentList) {
          // If it's a key: value in the list item, it's a list of objects
          const objectMatch = listMatch[1].match(/^([A-Za-z0-9_]+):\s*(.*)$/);
          if (objectMatch) {
            currentObject = {};
            currentObject[objectMatch[1]] = parseYamlScalar(objectMatch[2]);
            currentList.push(currentObject);
          } else {
            currentList.push(scalarValue);
            currentObject = null;
          }
        }
        continue;
      }

      // Check for object property (within a list item or a top-level object)
      const propMatch = trimmed.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
      if (propMatch) {
        const propKey = propMatch[1];
        const propValue = parseYamlScalar(propMatch[2]);
        
        if (currentObject && indent >= 4) {
          // Property of current list object
          currentObject[propKey] = propValue;
        } else {
          // Property of top-level object
          if (result[currentKey] === null || typeof result[currentKey] !== 'object') {
            result[currentKey] = {};
          }
          result[currentKey][propKey] = propValue;
        }
        continue;
      }
    }
  }

  return result;
}
