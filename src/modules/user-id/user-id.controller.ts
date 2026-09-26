import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
} from '@nestjs/swagger';
import { ResolveUserIdDto } from './dto/resolve-user-id.dto.js';
import { UserIdResponseDto } from './dto/user-id-response.dto.js';
import { UserIdService } from './user-id.service.js';

@Controller('user-id')
export class UserIdController {
  constructor(private readonly userIdService: UserIdService) {}

  @Post('resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Resolve the userID of an id1 + id2 pair',
    description:
      'Returns the userID already stored for this pair, generating and storing one the first time the pair is seen. Repeating the call never changes the result.',
  })
  @ApiOkResponse({
    type: UserIdResponseDto,
    description: 'The userID belonging to the pair.',
  })
  @ApiBadRequestResponse({
    description: 'id1 or id2 is missing, empty, too long, or not a string.',
  })
  async resolve(@Body() dto: ResolveUserIdDto): Promise<UserIdResponseDto> {
    const userID = await this.userIdService.resolve(dto);
    return { userID };
  }
}
