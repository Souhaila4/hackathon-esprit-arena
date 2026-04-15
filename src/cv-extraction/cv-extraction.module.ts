import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CvExtractionService } from './cv-extraction.service';

@Module({
  imports: [ConfigModule],
  providers: [CvExtractionService],
  exports: [CvExtractionService],
})
export class CvExtractionModule {}
