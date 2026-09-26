import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
// Node's crypto.randomUUID() emits an RFC 4122 version 4 identifier.
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { isDuplicateKeyError } from '../../common/database/typeorm-error.util.js';
import { maskIdentifier } from '../../common/util/mask.util.js';
import { ResolveUserIdDto } from './dto/resolve-user-id.dto.js';
import { UserIdMapping } from './entities/user-id-mapping.entity.js';
import { UserIdCache } from './user-id.cache.js';

@Injectable()
export class UserIdService {
  private readonly logger = new Logger(UserIdService.name);

  constructor(
    @InjectRepository(UserIdMapping)
    private readonly mappings: Repository<UserIdMapping>,
    private readonly cache: UserIdCache,
  ) {}

  /** Returns the userID owned by this (id1, id2) pair, creating it on first sight. */
  async resolve(dto: ResolveUserIdDto): Promise<string> {
    const { id1, id2 } = dto;

    const cached = await this.cache.get(id1, id2);
    if (cached !== null) {
      return cached;
    }

    const stored = await this.findUserId(id1, id2);
    if (stored !== null) {
      this.cache.remember(id1, id2, stored);
      return stored;
    }

    const generated = randomUUID();
    try {
      await this.mappings.insert({ id1, id2, userId: generated });
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
      return this.reuseConcurrentInsert(id1, id2, error);
    }

    this.logger.log(
      `created userID for (${maskIdentifier(id1)}, ${maskIdentifier(id2)})`,
    );
    this.cache.remember(id1, id2, generated);
    return generated;
  }

  /**
   * The unique index decides which racing insert wins; the loser has nothing to add, so it
   * reports the userID that is now actually stored.
   */
  private async reuseConcurrentInsert(
    id1: string,
    id2: string,
    error: unknown,
  ): Promise<string> {
    const winner = await this.findUserId(id1, id2);
    if (winner === null) {
      throw error;
    }

    this.logger.log(
      `duplicate insert for (${maskIdentifier(id1)}, ${maskIdentifier(id2)}), returning the stored userID`,
    );
    this.cache.remember(id1, id2, winner);
    return winner;
  }

  private async findUserId(id1: string, id2: string): Promise<string | null> {
    const mapping = await this.mappings.findOne({
      where: { id1, id2 },
      select: { userId: true },
    });
    return mapping?.userId ?? null;
  }
}
