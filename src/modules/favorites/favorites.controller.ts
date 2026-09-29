import {
  Controller,
  Get,
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

/**
 * 收藏示例的请求体。
 *
 * 必须是 class：全局 ValidationPipe 依赖 emitDecoratorMetadata 推断类型，
 * interface 不产生运行时元数据，metatype 会退化为 Object 从而静默跳过校验。
 */
class AddFavoriteDto {
  @IsString()
  @IsNotEmpty({ message: 'exampleId 不能为空' })
  exampleId!: string;
}

interface AuthenticatedRequest extends Request {
  user: { userId: string; username: string; role: string };
}

@Controller('api/favorites')
@UseGuards(RequireAuthGuard)
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  @Get()
  async findAll(@Req() req: AuthenticatedRequest) {
    const userId = req.user.userId;
    return this.favoritesService.findAll(userId);
  }

  @Post()
  async add(@Body() dto: AddFavoriteDto, @Req() req: AuthenticatedRequest) {
    // 空值校验由全局 ValidationPipe 依 AddFavoriteDto 完成
    return this.favoritesService.add(req.user.userId, dto.exampleId);
  }

  @Delete(':exampleId')
  async remove(
    @Param('exampleId') exampleId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.favoritesService.remove(req.user.userId, exampleId);
  }
}
