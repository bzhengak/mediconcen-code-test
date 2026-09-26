import { describe, expect, it } from 'vitest';
import { maskIdentifier } from './mask.util.js';

describe('maskIdentifier', () => {
  it('keeps the shape of a long identifier but hides its middle', () => {
    expect(maskIdentifier('POLICY-2026-000123')).toBe('POL************123');
  });

  it('masks a short identifier completely', () => {
    expect(maskIdentifier('ABC123')).toBe('******');
  });

  it('never reveals more than the edges', () => {
    const masked = maskIdentifier('a'.repeat(64));

    expect(masked).toHaveLength(64);
    expect(masked.startsWith('aaa')).toBe(true);
    expect(masked.endsWith('aaa')).toBe(true);
    expect(masked).not.toContain('a'.repeat(4));
  });
});
