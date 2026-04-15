import { IsString, IsNotEmpty, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateWalletDto {
  @ApiProperty({
    example: '0.0.123456',
    description:
      'Your Hedera account ID (e.g. from HashPack or portal.hedera.com)',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^0\.0\.\d+$/, {
    message:
      'hederaAccountId must be a valid Hedera account ID, e.g. 0.0.123456',
  })
  hederaAccountId: string;
}
