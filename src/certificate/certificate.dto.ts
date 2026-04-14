import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GenerateCertificateDto {
  @ApiProperty({
    example: 'ArenaHack 2026',
    description: 'Name of the hackathon',
  })
  @IsString()
  @IsNotEmpty()
  hackathonName: string;
}
