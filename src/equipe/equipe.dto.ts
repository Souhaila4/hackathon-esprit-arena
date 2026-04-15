import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsOptional,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateEquipeDto {
  @ApiProperty({
    description: 'Team name',
    example: 'Les Hackers',
    minLength: 2,
    maxLength: 60,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(60)
  name: string;

  @ApiProperty({
    description: 'Competition ID to create the team for',
    example: '507f1f77bcf86cd799439011',
  })
  @IsString()
  @IsNotEmpty()
  competitionId: string;
}

export class InviteToEquipeDto {
  @ApiProperty({
    description: 'Email of the user to invite',
    example: 'teammate@example.com',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}

export class SearchUsersDto {
  @ApiProperty({
    description: 'Search query (name or email)',
    example: 'john',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  query: string;

  @ApiPropertyOptional({
    description: 'Competition ID to exclude already-teamed users',
  })
  @IsOptional()
  @IsString()
  competitionId?: string;
}
