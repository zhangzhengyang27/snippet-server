import { Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common';
import { StaticSiteNavService } from './static-site-nav.service';
import { StaticSiteNav } from './entities/static-site-nav.entity';
import { Public } from '../auth/decorators/public.decorator';

@Controller('api/static-sites')
export class StaticSiteNavController {
  constructor(private readonly staticSiteNavService: StaticSiteNavService) {}

  @Get()
  @Public()
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = parseInt(page || '1', 10);
    const limitNum = parseInt(limit || '1000', 10);
    return this.staticSiteNavService.findAll(pageNum, limitNum);
  }

  @Get(':id')
  @Public()
  async findOne(@Param('id') id: string) {
    return this.staticSiteNavService.findOne(parseInt(id, 10));
  }

  @Post()
  async create(@Body() data: Partial<StaticSiteNav>) {
    return this.staticSiteNavService.create(data);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() data: Partial<StaticSiteNav>) {
    return this.staticSiteNavService.update(parseInt(id, 10), data);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.staticSiteNavService.remove(parseInt(id, 10));
  }
}
