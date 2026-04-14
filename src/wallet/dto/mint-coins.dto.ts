import { IsNotEmpty, IsNumber, IsPositive, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class MintCoinsDto {
  @ApiProperty({
    example: 'user_id_here',
    description:
      'ID (MongoDB ObjectId) of the company user to receive the coins',
  })
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({
    example: 500,
    description:
      'Number of Arena Coins to mint into the company wallet. The company must have a hederaAccountId registered.',
  })
  @IsNumber()
  @IsPositive()
  amount: number;
}
