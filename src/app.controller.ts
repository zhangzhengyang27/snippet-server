import { Controller, Get } from '@nestjs/common'
import { Public } from './modules/auth/decorators/public.decorator'

@Controller()
export class AppController {
  @Public()
  @Get()
  getHello(): string {
    return 'Welcome to DevCanvas API Server'
  }

  @Public()
  @Get('health')
  getHealth(): { status: string; timestamp: string } {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    }
  }
}
