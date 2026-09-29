import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Req,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { FavoritesService } from './favorites.service';
import { RequireAuthGuard } from '../auth/guards/require-auth.guard';

interface AddFavoriteDto {
  exampleId: string;
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
    if (!dto.exampleId) {
      throw new BadRequestException('exampleId 不能为空');
    }
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
