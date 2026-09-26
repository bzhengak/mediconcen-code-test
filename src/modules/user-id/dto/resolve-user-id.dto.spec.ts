import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { MAX_BUSINESS_ID_LENGTH } from '../user-id.constants.js';
import { ResolveUserIdDto } from './resolve-user-id.dto.js';

function messagesFor(payload: unknown): string[] {
  const instance = plainToInstance(ResolveUserIdDto, payload);
  return validateSync(instance, { whitelist: false }).flatMap((error) =>
    Object.values(error.constraints ?? {}),
  );
}

function instanceFor(payload: unknown): ResolveUserIdDto {
  return plainToInstance(ResolveUserIdDto, payload);
}

describe('ResolveUserIdDto', () => {
  const valid = { id1: 'ABC123', id2: 'XYZ456' };

  it('accepts a complete pair', () => {
    expect(messagesFor(valid)).toEqual([]);
  });

  it('trims surrounding whitespace before validating', () => {
    expect(instanceFor({ id1: '  ABC123  ', id2: '\tXYZ456\n' })).toMatchObject(
      {
        id1: 'ABC123',
        id2: 'XYZ456',
      },
    );
  });

  it('treats a value that is whitespace only as missing', () => {
    const messages = messagesFor({ id1: '   ', id2: 'XYZ456' });

    expect(messages).toContain('id1 is required');
  });

  it('reports both identifiers when neither is supplied', () => {
    const messages = messagesFor({});

    expect(messages).toContain('id1 must be a string');
    expect(messages).toContain('id2 must be a string');
  });

  it.each([
    ['null', null],
    ['a number', 123],
    ['an object', { nested: true }],
    ['an array', ['ABC123']],
  ])('rejects %s where a string is required', (_label, value) => {
    expect(messagesFor({ id1: value, id2: 'XYZ456' })).toContain(
      'id1 must be a string',
    );
  });

  it('rejects an identifier at the column limit plus one', () => {
    const tooLong = 'a'.repeat(MAX_BUSINESS_ID_LENGTH + 1);

    expect(messagesFor({ id1: tooLong, id2: 'XYZ456' })).toContain(
      `id1 must be at most ${MAX_BUSINESS_ID_LENGTH} characters`,
    );
  });

  it('accepts an identifier exactly at the column limit', () => {
    expect(
      messagesFor({ id1: 'a'.repeat(MAX_BUSINESS_ID_LENGTH), id2: 'XYZ456' }),
    ).toEqual([]);
  });

  it.each([
    ['a nul byte', 'ABC\u0000123'],
    ['a newline', 'ABC\n123'],
    ['a tab', 'ABC\t123'],
  ])('rejects %s inside an identifier', (_label, value) => {
    expect(messagesFor({ id1: value, id2: 'XYZ456' })).toContain(
      'id1 must not contain control characters',
    );
  });

  // Identifiers arrive from other insurers' systems, so anything that is printable is stored
  // as-is rather than guessed at with a character whitelist.
  it.each([
    ['Chinese characters', '保單-A1'],
    ['an embedded space', 'POLICY 2026'],
    ['an accent', 'café-01'],
    ['a high code point', '𝐀-01'],
  ])('accepts %s', (_label, value) => {
    expect(messagesFor({ id1: value, id2: 'XYZ456' })).toEqual([]);
  });
});
