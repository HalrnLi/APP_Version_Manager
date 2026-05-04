// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseFrontmatter(content: string): Record<string, any> | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const frontmatter: Record<string, any> = {};
  const lines = match[1].split('\n');

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    if (line.startsWith('#') || line.trim() === '') {
      continue;
    }

    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.substring(0, colonIndex).trim();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let value: any = line.substring(colonIndex + 1).trim();

      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
        continue;
      }

      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      } else if (value.startsWith("'") && value.endsWith("'")) {
        value = value.slice(1, -1);
      } else if (value.startsWith('[') && value.endsWith(']')) {
        const inner = value.slice(1, -1).trim();
        if (inner === '') {
          value = [];
        } else {
          // JSON object array: split by comma at depth 0
          if (inner.startsWith('{') && inner.endsWith('}')) {
            // JSON object array: each element is a JSON string
            const items: string[] = [];
            let depth = 0;
            let start = 0;
            for (let i = 0; i < inner.length; i++) {
              if (inner[i] === '{') depth++;
              else if (inner[i] === '}') depth--;
              else if (inner[i] === ',' && depth === 0) {
                items.push(inner.substring(start, i).trim());
                start = i + 1;
              }
            }
            items.push(inner.substring(start).trim());
            value = items.map(v => {
              try { return JSON.parse(v); } catch { return v; }
            }).filter((v: any) => v);
          } else {
            value = inner.split(',').map((v: string) => v.trim()).filter((v: string) => v);
          }
        }
      } else if (value === 'true') {
        value = true;
      } else if (value === 'false') {
        value = false;
      } else if (value === 'null' || value === '~') {
        value = null;
      } else if (value === '|') {
        // 多行字符串，收集后续缩进的行
        let multiline = '';
        for (let i = li + 1; i < lines.length; i++) {
          const nextLine = lines[i];
          if (nextLine.startsWith('  ') || nextLine.startsWith('\t')) {
            multiline += nextLine.trim() + '\n';
          } else if (nextLine.trim() === '') {
            multiline += '\n';
          } else {
            break;
          }
        }
        frontmatter[key] = multiline.trimEnd();
        continue;
      } else {
        frontmatter[key] = value;
        continue;
      }

      frontmatter[key] = value;
    }
  }

  return frontmatter;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createFrontmatter(data: Record<string, any>): string {
  let fm = '---\n';
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) {
      if (value.length > 0 && typeof value[0] === 'object') {
        // Array of objects: JSON-encode each element
        const items = value.map((v: any) => JSON.stringify(v));
        fm += `${key}: [${items.join(', ')}]\n`;
      } else {
        fm += `${key}: [${value.join(', ')}]\n`;
      }
    } else if (typeof value === 'string' && value.includes('\n')) {
      fm += `${key}: |\n  ${value.replace(/\n/g, '\n  ')}\n`;
    } else {
      fm += `${key}: ${value}\n`;
    }
  }
  fm += '---\n\n';
  return fm;
}

export interface ProgressHistoryItem {
  progress: string;
  changedAt: string;
}

export function parseProgressHistory(raw: unknown): ProgressHistoryItem[] {
  if (!Array.isArray(raw)) return [];
  const history: ProgressHistoryItem[] = [];
  for (const item of raw) {
    if (typeof item === 'string') {
      const at = item.lastIndexOf('@');
      if (at > 0) {
        const progress = item.slice(0, at);
        const changedAt = item.slice(at + 1);
        history.push({ progress, changedAt });
      }
    } else if (item && typeof item === 'object') {
      const progress = (item as any).progress;  // eslint-disable-line @typescript-eslint/no-explicit-any
      const changedAt = (item as any).changedAt;  // eslint-disable-line @typescript-eslint/no-explicit-any
      if (typeof progress === 'string' && typeof changedAt === 'string') {
        history.push({ progress, changedAt });
      }
    }
  }
  return history;
}

export function parseNumericField(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}
