import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  MAX_BUSINESS_ID_LENGTH,
  UUID_CHARACTER_LENGTH,
} from '../user-id.constants.js';

/**
 * One row per (id1, id2) pair. The composite unique index is what makes the pair identify a
 * single record, and it is also the tie-breaker when concurrent requests race to insert it.
 *
 * `utf8mb4_0900_bin` keeps the two identifiers byte-comparable: these are opaque business keys,
 * and a collation that folds case or accents would silently merge two different pairs.
 */
@Entity('user_id_mappings')
@Index('uk_id1_id2', ['id1', 'id2'], { unique: true })
@Index('uk_user_id', ['userId'], { unique: true })
export class UserIdMapping {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({
    type: 'varchar',
    length: MAX_BUSINESS_ID_LENGTH,
    collation: 'utf8mb4_0900_bin',
  })
  id1: string;

  @Column({
    type: 'varchar',
    length: MAX_BUSINESS_ID_LENGTH,
    collation: 'utf8mb4_0900_bin',
  })
  id2: string;

  /**
   * Stored in the API contract as `userID`; this property keeps the codebase's own camelCase
   * convention, and the response DTO is where the contract spelling is applied.
   */
  @Column({ name: 'user_id', type: 'char', length: UUID_CHARACTER_LENGTH })
  userId: string;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 3 })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 3 })
  updatedAt: Date;
}
