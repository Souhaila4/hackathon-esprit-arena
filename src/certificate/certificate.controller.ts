import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CertificateService } from './certificate.service';
import { GenerateCertificateDto } from './certificate.dto';

@ApiTags('certificate')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('certificate')
export class CertificateController {
  constructor(private readonly certificateService: CertificateService) {}

  @Post('generate')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Generate a certificate NFT',
    description:
      'Generates a personalized certificate image, uploads it to IPFS via Pinata, and mints an NFT on Hedera.',
  })
  @ApiResponse({
    status: 201,
    description: 'NFT minted successfully',
    schema: {
      example: {
        certificateId: '6612abc...',
        user: { firstName: 'Alice', lastName: 'Martin' },
        imageIpfsUrl: 'ipfs://QmXxx...',
        metadataIpfsUrl: 'ipfs://QmYyy...',
        tokenId: '0.0.123456',
        serial: 1,
        transferredToWallet: true,
        recipientAccountId: '0.0.789012',
      },
    },
  })
  async generate(
    @Body() dto: GenerateCertificateDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.certificateService.generateCertificateNFT(
      userId,
      dto.hackathonName,
    );
  }
}
