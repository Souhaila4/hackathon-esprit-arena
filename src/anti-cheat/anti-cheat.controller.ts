import {
  Controller,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
} from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import axios from 'axios';
import FormData = require('form-data');

/**
 * AntiCheatController — Proxy sécurisé vers les Hugging Face Spaces.
 *
 * Le token HuggingFace reste exclusivement côté serveur (.env).
 * Le frontend envoie ses fichiers ici avec son JWT Arena,
 * et le backend les transfère vers HF avec le vrai token.
 */
@ApiTags('anti-cheat')
@Controller('anti-cheat')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class AntiCheatController {
  private readonly hfToken: string;
  private readonly imageSpaceUrl =
    'https://negzaoui-antiimagesenvirement.hf.space/scan';
  private readonly audioSpaceUrl =
    'https://negzaoui-modelevocal.hf.space/scan-audio';

  constructor(private readonly config: ConfigService) {
    this.hfToken = this.config.get<string>('HUGGINGFACE_TOKEN') ?? '';
  }

  // ─────────────────────────────────────────────────────────────────
  //  POST /anti-cheat/validate-image
  // ─────────────────────────────────────────────────────────────────

  @Post('validate-image')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'image', maxCount: 1 },
        { name: 'avatar', maxCount: 1 },
      ],
      { limits: { fileSize: 10 * 1024 * 1024 } },
    ),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Proxy — Workspace image anti-cheat validation via HuggingFace Space',
  })
  async validateImage(
    @UploadedFiles()
    files: {
      image?: Express.Multer.File[];
      avatar?: Express.Multer.File[];
    },
  ) {
    const imageFile = files?.image?.[0];
    if (!imageFile?.buffer) {
      throw new BadRequestException('Image file is required');
    }

    const form = new FormData();
    form.append('image', imageFile.buffer, {
      filename: imageFile.originalname,
      contentType: imageFile.mimetype,
    });

    const avatarFile = files?.avatar?.[0];
    if (avatarFile?.buffer) {
      form.append('avatar', avatarFile.buffer, {
        filename: avatarFile.originalname,
        contentType: avatarFile.mimetype,
      });
    }

    const response = await axios.post(this.imageSpaceUrl, form, {
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${this.hfToken}`,
      },
      timeout: 30_000,
    });

    return response.data;
  }

  // ─────────────────────────────────────────────────────────────────
  //  POST /anti-cheat/validate-audio
  // ─────────────────────────────────────────────────────────────────

  @Post('validate-audio')
  @UseInterceptors(
    FileFieldsInterceptor([{ name: 'audio', maxCount: 1 }], {
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Proxy — Vocal audio anti-cheat validation via HuggingFace Space',
  })
  async validateAudio(
    @UploadedFiles() files: { audio?: Express.Multer.File[] },
  ) {
    const audioFile = files?.audio?.[0];
    if (!audioFile?.buffer) {
      throw new BadRequestException('Audio file is required');
    }

    const form = new FormData();
    form.append('audio', audioFile.buffer, {
      filename: audioFile.originalname,
      contentType: audioFile.mimetype,
    });

    const response = await axios.post(this.audioSpaceUrl, form, {
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${this.hfToken}`,
      },
      timeout: 30_000,
    });

    return response.data;
  }
}
