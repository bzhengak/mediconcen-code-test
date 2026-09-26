import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength, Matches } from 'class-validator';
import { MAX_BUSINESS_ID_LENGTH } from '../user-id.constants.js';

/** Any character is allowed except control characters, so values such as "POL-001 2" stay valid. */
const CONTAINS_NO_CONTROL_CHARACTERS = /^\P{Cc}+$/u;

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class ResolveUserIdDto {
  @ApiProperty({ example: 'ABC123', maxLength: MAX_BUSINESS_ID_LENGTH })
  @Transform(trim)
  @IsString({ message: 'id1 must be a string' })
  @IsNotEmpty({ message: 'id1 is required' })
  @MaxLength(MAX_BUSINESS_ID_LENGTH, {
    message: `id1 must be at most ${MAX_BUSINESS_ID_LENGTH} characters`,
  })
  @Matches(CONTAINS_NO_CONTROL_CHARACTERS, {
    message: 'id1 must not contain control characters',
  })
  id1: string;

  @ApiProperty({ example: 'XYZ456', maxLength: MAX_BUSINESS_ID_LENGTH })
  @Transform(trim)
  @IsString({ message: 'id2 must be a string' })
  @IsNotEmpty({ message: 'id2 is required' })
  @MaxLength(MAX_BUSINESS_ID_LENGTH, {
    message: `id2 must be at most ${MAX_BUSINESS_ID_LENGTH} characters`,
  })
  @Matches(CONTAINS_NO_CONTROL_CHARACTERS, {
    message: 'id2 must not contain control characters',
  })
  id2: string;
}
