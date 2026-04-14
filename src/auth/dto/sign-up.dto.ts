import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  IsUrl,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class SignUpDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'secret1234', minLength: 8, maxLength: 72 })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(72)
  password: string;

  @ApiProperty({ example: 'Jane' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName: string;

  @ApiPropertyOptional({
    example: 'https://github.com/username',
    description: 'Lien profil GitHub',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  )
  @IsString()
  @MaxLength(2048)
  @IsUrl({ require_tld: true }, { message: 'GitHub URL must be a valid URL' })
  githubUrl?: string;

  @ApiPropertyOptional({
    example: 'https://www.linkedin.com/in/username/',
    description:
      'Lien profil LinkedIn (utilisé pour enrichir les compétences via Apify)',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  )
  @IsString()
  @MaxLength(2048)
  @IsUrl({ require_tld: true }, { message: 'LinkedIn URL must be a valid URL' })
  linkedinUrl?: string;
}
