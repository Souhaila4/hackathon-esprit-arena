import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class SendPreselectedEmailDto {
  @IsString()
  @MaxLength(300)
  subject: string;

  /** HTML. Placeholders: {{firstName}}, {{competitionTitle}} */
  @IsString()
  @MaxLength(50000)
  htmlBody: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
