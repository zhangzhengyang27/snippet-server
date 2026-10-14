import {
  Controller,
  Post,
  Delete,
  Param,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsNotEmpty, IsString } from 'class-validator';
import { Request } from 'express';
import { FavoritesService } from './favorites.service';
import { RequireAuthGuard } from '../auth/guards/require-auth.guard';
import { RateLimitGuard } from '../auth/guards/rate-limit.guard';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';

/**
 * 收藏代码块的请求体。
 *
 * 必须是 class：全局 ValidationPipe 依赖 emitDecoratorMetadata 推断类型，
 * interface 不产生运行时元数据，metatype 会退化为 Object 从而静默跳过校验。
 */
class AddFavoriteDto {
  @IsString()
  @IsNotEmpty({ message: 'snippetId 不能为空' })
  snippetId!: string;
}

interface AuthenticatedRequest extends Request {
  user: { userId: string; username: string; role: string };
}

/**
 * 收藏接口：只有「增 / 删」两个动作。
 *
 * 收藏列表不走这里 —— 它是 `GET /api/knowledge/snippets?favorite=true`，
 * 复用片段列表的分页、可见性与排序，避免维护两套等价的查询逻辑。
 */
@Controller('api/favorites')
@UseGuards(RequireAuthGuard)
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  @Post()
  @RateLimit({ max: 20, windowMs: 60_000 })
  @UseGuards(RequireAuthGuard, RateLimitGuard)
  async add(@Body() dto: AddFavoriteDto, @Req() req: AuthenticatedRequest) {
    // 空值校验由全局 ValidationPipe 依 AddFavoriteDto 完成
    return this.favoritesService.add(req.user.userId, dto.snippetId);
  }

  @Delete(':snippetId')
  @RateLimit({ max: 20, windowMs: 60_000 })
  @UseGuards(RequireAuthGuard, RateLimitGuard)
  async remove(
    @Param('snippetId') snippetId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.favoritesService.remove(req.user.userId, snippetId);
  }
}
