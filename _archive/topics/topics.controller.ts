import { Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common';
import { TopicsService } from './topics.service';
import { Public } from '../auth/decorators/public.decorator';
import { CreateTopicDto, UpdateTopicDto } from '../../common/dtos';

@Controller('api/topics')
export class TopicsController {
  constructor(private readonly topicsService: TopicsService) {}

  @Get()
  @Public()
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = parseInt(page || '1', 10);
    const limitNum = parseInt(limit || '10', 10);
    return this.topicsService.findAll(pageNum, limitNum);
  }

  @Get(':slug')
  @Public()
  async findOne(@Param('slug') slug: string) {
    return this.topicsService.findOne(slug);
  }

  @Post()
  async create(@Body() topicData: CreateTopicDto) {
    return this.topicsService.create(topicData as any);
  }

  @Patch(':slug')
  async update(@Param('slug') slug: string, @Body() topicData: UpdateTopicDto) {
    return this.topicsService.update(slug, topicData as any);
  }

  @Delete(':slug')
  async remove(@Param('slug') slug: string) {
    return this.topicsService.remove(slug);
  }
}
