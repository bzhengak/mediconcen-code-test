import { QueryFailedError } from 'typeorm';

const MYSQL_DUPLICATE_ENTRY = 1062;

interface MysqlDriverError extends Error {
  code?: string;
  errno?: number;
}

/**
 * TypeORM wraps whatever mysql2 rejected in `driverError`. Only the MySQL error code tells a
 * duplicate-key rejection apart from a genuine database failure, and the rejection code is what
 * the unique-index race handler keys on.
 */
export function isDuplicateKeyError(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }

  const driverError = (error as QueryFailedError<MysqlDriverError>).driverError;
  return (
    driverError?.errno === MYSQL_DUPLICATE_ENTRY ||
    driverError?.code === 'ER_DUP_ENTRY'
  );
}
