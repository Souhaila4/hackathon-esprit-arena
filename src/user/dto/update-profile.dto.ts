import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  MinLength,
  MaxLength,
  IsEnum,
  IsArray,
  IsUrl,
  ArrayMaxSize,
} from 'class-validator';
import { Specialty } from '@prisma/client';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Jane', description: 'First name' })
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'First name must not be empty' })
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Doe', description: 'Last name' })
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Last name must not be empty' })
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional({
    example: 'https://example.com/avatar.png',
    description: 'Profile picture URL',
  })
  @IsOptional()
  @IsUrl()
  @MaxLength(2048)
  avatarUrl?: string;

  @ApiPropertyOptional({
    enum: Specialty,
    description: 'Primary specialty (e.g. FRONTEND, BACKEND)',
  })
  @IsOptional()
  @IsEnum(Specialty)
  mainSpecialty?: Specialty;

  @ApiPropertyOptional({
    example: ['nestjs', 'react', 'typescript'],
    description: 'Skill tags',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  @ArrayMaxSize(30)
  skillTags?: string[];

  @ApiPropertyOptional({
    example: 'https://github.com/username',
    description: 'Lien profil GitHub',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @IsUrl()
  githubUrl?: string;

  @ApiPropertyOptional({
    example: 'https://www.linkedin.com/in/username/',
    description: 'Lien profil LinkedIn',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @IsUrl()
  linkedinUrl?: string;

  @ApiPropertyOptional({
    description: '3 derniers posts LinkedIn (scraped via Apify)',
  })
  @IsOptional()
  linkedinPosts?: any;

  @ApiPropertyOptional({
    description: '3 derniers repos GitHub avec README (scraped via Apify)',
  })
  @IsOptional()
  githubRepos?: any;

  @ApiPropertyOptional({
    description: 'Dernière mise à jour des données sociales',
  })
  @IsOptional()
  socialDataLastUpdate?: Date;
}
