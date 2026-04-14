import './bootstrap-env';
import * as path from 'path';

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  if (process.env.TRUST_PROXY === '1') {
    app.set('trust proxy', 1);
  }
  app.enableCors();

  // Serve files from the 'uploads' directory
  app.useStaticAssets(path.join(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('Arena of Coders API')
    .setDescription('API for Arena of Coders – auth, profile, and more')
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', in: 'header' },
      'access-token',
    )
    .addTag(
      'auth',
      'Sign up, sign in, email verification, and profile (me, update profile)',
    )
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  // Afficher le statut de la clé Apify pour débogage
  console.log(
    '[STARTUP] APIFY_API_TOKEN présent:',
    !!process.env.APIFY_API_TOKEN,
  );
  if (process.env.APIFY_API_TOKEN) {
    console.log(
      '[STARTUP] APIFY_API_TOKEN (premiers 20 chars):',
      process.env.APIFY_API_TOKEN.substring(0, 20) + '...',
    );
  }

  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
bootstrap();
