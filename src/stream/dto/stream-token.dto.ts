import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class StreamTokenDto {
  @ApiPropertyOptional({
    description: 'User ID for the token (defaults to JWT user if omitted)',
  })
  @IsOptional()
  @IsString()
  userId?: string;
}
