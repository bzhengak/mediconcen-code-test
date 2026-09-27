import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { MAX_BUSINESS_ID_LENGTH } from '../user-id.constants.js';
import { ResolveUserIdDto } from './resolve-user-id.dto.js';

function messagesFor(payload: unknown): string[] {
  const instance = plainToInstance(ResolveUserIdDto, payload);
  // Same options as the global ValidationPipe, so this suite asserts what the API returns.
  return validateSync(instance, {
    whitelist: false,
    stopAtFirstError: true,
  }).flatMap((error) => Object.values(error.constraints ?? {}));
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
    expect(messagesFor({ id1: '   ', id2: 'XYZ456' })).toEqual([
      'id1 is required',
    ]);
  });

  it('reports both identifiers once when neither is supplied', () => {
    expect(messagesFor({})).toEqual(['id1 is required', 'id2 is required']);
  });

  it('reports one message per identifier, not one per broken constraint', () => {
    expect(messagesFor({ id1: '', id2: 123 })).toEqual([
      'id1 is required',
      'id2 must be a string',
    ]);
  });

  it('treats null as a missing identifier', () => {
    expect(messagesFor({ id1: null, id2: 'XYZ456' })).toEqual([
      'id1 is required',
    ]);
  });

  it.each([
    ['a number', 123],
    ['an object', { nested: true }],
    ['an array', ['ABC123']],
    ['a boolean', true],
  ])('rejects %s where a string is required', (_label, value) => {
    expect(messagesFor({ id1: value, id2: 'XYZ456' })).toEqual([
      'id1 must be a string',
    ]);
  });

  it('rejects an identifier at the column limit plus one', () => {
    const tooLong = 'a'.repeat(MAX_BUSINESS_ID_LENGTH + 1);

    expect(messagesFor({ id1: tooLong, id2: 'XYZ456' })).toEqual([
      `id1 must be at most ${MAX_BUSINESS_ID_LENGTH} characters`,
    ]);
  });

  it('accepts an identifier exactly at the column limit', () => {
    expect(
      messagesFor({ id1: 'a'.repeat(MAX_BUSINESS_ID_LENGTH), id2: 'XYZ456' }),
    ).toEqual([]);
  });

  const CONTROL_CHARACTER = 'ABC' + String.fromCharCode(0) + '123';

  it.each([
    ['a nul byte', CONTROL_CHARACTER],
    ['a newline', 'ABC\n123'],
    ['a tab', 'ABC\t123'],
  ])('rejects %s inside an identifier', (_label, value) => {
    expect(messagesFor({ id1: value, id2: 'XYZ456' })).toEqual([
      'id1 must not contain control characters',
    ]);
  });

  // Identifiers arrive from other insurers' systems, so anything that is printable is stored
  // as-is rather than guessed at with a character whitelist.
  it.each([
    ['Chinese characters', '保單-A1'],
    ['an embedded space', 'POLICY 2026'],
    ['an accent', 'café-01'],
    ['a high code point', '\u{1D400}-01'],
    ['a leading digit', '00123'],
  ])('accepts %s', (_label, value) => {
    expect(messagesFor({ id1: value, id2: 'XYZ456' })).toEqual([]);
  });
});
