import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QueryFailedError } from 'typeorm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserIdMapping } from './entities/user-id-mapping.entity.js';
import { UserIdCache } from './user-id.cache.js';
import { UserIdService } from './user-id.service.js';

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function duplicateKeyError(): QueryFailedError {
  const driverError = Object.assign(
    new Error("Duplicate entry for key 'uk_id1_id2'"),
    {
      code: 'ER_DUP_ENTRY',
      errno: 1062,
    },
  );
  return new QueryFailedError('INSERT INTO user_id_mappings', [], driverError);
}

function databaseError(): QueryFailedError {
  return new QueryFailedError(
    'INSERT INTO user_id_mappings',
    [],
    Object.assign(new Error('Deadlock found when trying to get lock'), {
      code: 'ER_LOCK_DEADLOCK',
      errno: 1213,
    }),
  );
}

describe('UserIdService', () => {
  const findOne = vi.fn();
  const insert = vi.fn();
  const cacheGet = vi.fn();
  const cacheRemember = vi.fn();

  let service: UserIdService;

  beforeEach(async () => {
    vi.clearAllMocks();

    const module = await Test.createTestingModule({
      providers: [
        UserIdService,
        {
          provide: getRepositoryToken(UserIdMapping),
          useValue: { findOne, insert },
        },
        {
          provide: UserIdCache,
          useValue: { get: cacheGet, remember: cacheRemember },
        },
      ],
    }).compile();

    service = module.get(UserIdService);
  });

  it('answers from the cache without reading MySQL', async () => {
    cacheGet.mockResolvedValue('cached-user-id');

    await expect(
      service.resolve({ id1: 'ABC123', id2: 'XYZ456' }),
    ).resolves.toBe('cached-user-id');

    expect(findOne).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('returns the stored userID and re-caches it when the pair already exists', async () => {
    cacheGet.mockResolvedValue(null);
    findOne.mockResolvedValue({ userId: 'stored-user-id' });

    await expect(
      service.resolve({ id1: 'ABC123', id2: 'XYZ456' }),
    ).resolves.toBe('stored-user-id');

    expect(insert).not.toHaveBeenCalled();
    expect(cacheRemember).toHaveBeenCalledWith(
      'ABC123',
      'XYZ456',
      'stored-user-id',
    );
  });

  it('generates a UUID v4 and stores it for an unseen pair', async () => {
    cacheGet.mockResolvedValue(null);
    findOne.mockResolvedValue(null);
    insert.mockResolvedValue({ identifiers: [{ id: 1n }] });

    const userID = await service.resolve({ id1: 'ABC123', id2: 'XYZ456' });

    expect(userID).toMatch(UUID_V4);
    expect(insert).toHaveBeenCalledWith({
      id1: 'ABC123',
      id2: 'XYZ456',
      userId: userID,
    });
    expect(cacheRemember).toHaveBeenCalledWith('ABC123', 'XYZ456', userID);
  });

  it('reports the winner of an insert race instead of the id it failed to store', async () => {
    cacheGet.mockResolvedValue(null);
    findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ userId: 'winner-user-id' });
    insert.mockRejectedValue(duplicateKeyError());

    await expect(
      service.resolve({ id1: 'ABC123', id2: 'XYZ456' }),
    ).resolves.toBe('winner-user-id');

    expect(cacheRemember).toHaveBeenCalledWith(
      'ABC123',
      'XYZ456',
      'winner-user-id',
    );
  });

  it('rethrows a duplicate rejection it cannot resolve', async () => {
    cacheGet.mockResolvedValue(null);
    findOne.mockResolvedValue(null);
    insert.mockRejectedValue(duplicateKeyError());

    await expect(
      service.resolve({ id1: 'ABC123', id2: 'XYZ456' }),
    ).rejects.toBeInstanceOf(QueryFailedError);
  });

  it('propagates a genuine database failure', async () => {
    cacheGet.mockResolvedValue(null);
    findOne.mockResolvedValue(null);
    insert.mockRejectedValue(databaseError());

    await expect(
      service.resolve({ id1: 'ABC123', id2: 'XYZ456' }),
    ).rejects.toBeInstanceOf(QueryFailedError);
  });

  it('looks the pair up by both identifiers', async () => {
    cacheGet.mockResolvedValue(null);
    findOne.mockResolvedValue({ userId: 'stored-user-id' });

    await service.resolve({ id1: 'ABC123', id2: 'XYZ456' });

    expect(findOne).toHaveBeenCalledWith({
      where: { id1: 'ABC123', id2: 'XYZ456' },
      select: { userId: true },
    });
  });
});
