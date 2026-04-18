import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /** Sonde liveness (déploiement, monitoring) — ne nécessite pas de JWT. */
  @Get('health')
  health(): { ok: boolean; uptimeSec: number; ts: string } {
    return {
      ok: true,
      uptimeSec: Math.round(process.uptime()),
      ts: new Date().toISOString(),
    };
  }
}
