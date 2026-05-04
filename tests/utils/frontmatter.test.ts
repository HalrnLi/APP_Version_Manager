import { describe, it, expect } from 'vitest';
import {
  parseFrontmatter,
  createFrontmatter,
  parseProgressHistory,
  parseNumericField,
} from '../../src/utils/frontmatter';

describe('parseFrontmatter', () => {
  it('returns empty object for no frontmatter', () => {
    expect(parseFrontmatter('just some text')).toEqual({});
  });

  it('parses simple key-value pairs', () => {
    const content = `---
name: hello
version: 42
---
content`;
    const result = parseFrontmatter(content);
    expect(result).toEqual({ name: 'hello', version: '42' });
  });

  it('parses booleans', () => {
    const content = `---
completed: true
isArchived: false
---
`;
    const result = parseFrontmatter(content);
    expect(result?.completed).toBe(true);
    expect(result?.isArchived).toBe(false);
  });

  it('parses null values', () => {
    const content = `---
field1: null
field2: ~
---
`;
    const result = parseFrontmatter(content);
    expect(result?.field1).toBeNull();
    expect(result?.field2).toBeNull();
  });

  it('parses empty array', () => {
    const content = `---
items: []
---
`;
    const result = parseFrontmatter(content);
    expect(result?.items).toEqual([]);
  });

  it('parses array of simple values', () => {
    const content = `---
tags: [a, b, c]
---
`;
    const result = parseFrontmatter(content);
    expect(result?.tags).toEqual(['a', 'b', 'c']);
  });

  it('parses multiline string with pipe', () => {
    const content = `---
desc: |
  line one
  line two
---
`;
    const result = parseFrontmatter(content);
    expect(result?.desc).toBe('line one\nline two');
  });

  it('handles empty multiline string', () => {
    const content = `---
desc: |
---
`;
    const result = parseFrontmatter(content);
    expect(result?.desc).toBe('');
  });

  it('skips comments starting with #', () => {
    const content = `---
# this is a comment
name: hello
---
`;
    const result = parseFrontmatter(content);
    expect(result).toEqual({ name: 'hello' });
  });

  it('skips empty lines', () => {
    const content = `---

name: hello

---
`;
    const result = parseFrontmatter(content);
    expect(result).toEqual({ name: 'hello' });
  });

  it('skips invalid key names', () => {
    const content = `---
123invalid: value
valid: hello
---
`;
    const result = parseFrontmatter(content);
    expect(result).toEqual({ valid: 'hello' });
  });

  it('handles todo array (JSON objects)', () => {
    const content = `---
todos: [{"id":"1","content":"test","completed":false}, {"id":"2","content":"test2","completed":true}]
---
`;
    const result = parseFrontmatter(content);
    expect(Array.isArray(result?.todos)).toBe(true);
    expect(result?.todos).toHaveLength(2);
    expect((result?.todos as any[])[0].content).toBe('test');
  });
});

describe('createFrontmatter', () => {
  it('creates frontmatter for simple object', () => {
    const result = createFrontmatter({ name: 'hello', version: 1 });
    expect(result).toContain('---');
    expect(result).toContain('name: hello');
    expect(result).toContain('version: 1');
  });

  it('creates array values', () => {
    const result = createFrontmatter({ tags: ['a', 'b'] });
    expect(result).toContain('tags: [a, b]');
  });

  it('creates multiline for strings with newlines', () => {
    const result = createFrontmatter({ desc: 'line1\nline2' });
    expect(result).toContain('desc: |');
    expect(result).toContain('line1');
    expect(result).toContain('line2');
  });

  it('handles array of objects', () => {
    const result = createFrontmatter({
      todos: [{ id: '1', content: 'test' }],
    });
    expect(result).toContain('todos: [');
    expect(result).toContain('{"id":"1","content":"test"}');
  });

  it('ends with ---', () => {
    const result = createFrontmatter({ name: 'test' });
    expect(result.trimEnd()).toMatch(/^---\n/);
    expect(result.trimEnd()).toMatch(/\n---$/m);
  });
});

describe('parseProgressHistory', () => {
  it('returns empty array for non-array input', () => {
    expect(parseProgressHistory(null)).toEqual([]);
    expect(parseProgressHistory('string')).toEqual([]);
    expect(parseProgressHistory(undefined)).toEqual([]);
  });

  it('parses string format "progress@timestamp"', () => {
    const result = parseProgressHistory(['需求分解@1234567890']);
    expect(result).toEqual([{ progress: '需求分解', changedAt: '1234567890' }]);
  });

  it('parses object format', () => {
    const result = parseProgressHistory([
      { progress: '已发布', changedAt: '9999999999' },
    ]);
    expect(result).toEqual([{ progress: '已发布', changedAt: '9999999999' }]);
  });

  it('skips invalid items', () => {
    const result = parseProgressHistory([
      'no-at-sign',
      { notProgress: 'x' },
      'valid@123',
    ]);
    expect(result).toEqual([{ progress: 'valid', changedAt: '123' }]);
  });
});

describe('parseNumericField', () => {
  it('returns number value directly', () => {
    expect(parseNumericField(5, 1)).toBe(5);
  });

  it('parses numeric string', () => {
    expect(parseNumericField('10', 1)).toBe(10);
  });

  it('returns fallback for non-numeric string', () => {
    expect(parseNumericField('abc', 1)).toBe(1);
  });

  it('returns fallback for empty string', () => {
    expect(parseNumericField('', 1)).toBe(1);
  });

  it('returns fallback for NaN', () => {
    expect(parseNumericField(NaN, 1)).toBe(1);
  });

  it('returns fallback for Infinity', () => {
    expect(parseNumericField(Infinity, 1)).toBe(1);
  });

  it('returns fallback for null/undefined', () => {
    expect(parseNumericField(null, 99)).toBe(99);
    expect(parseNumericField(undefined, 99)).toBe(99);
  });
});
