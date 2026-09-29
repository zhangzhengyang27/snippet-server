import { Controller, Get, Post, Patch, Param, Body, Query } from '@nestjs/common'
import { Public } from '../auth/decorators/public.decorator'
import { CanvasExamplesService } from './canvas-examples.service'
import { CanvasExample } from './entities/canvas-example.entity'

@Controller('api/canvas-examples')
export class CanvasExamplesController {
  constructor(private readonly service: CanvasExamplesService) {}

  @Get('libraries')
  @Public()
  findLibraries() {
    return this.service.findLibraries()
  }

  @Get('categories')
  @Public()
  findCategories(@Query('library') library?: string) {
    return this.service.findCategories(library)
  }

  @Get()
  @Public()
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('library') library?: string,
    @Query('category') category?: string,
    @Query('group') group?: string,
    @Query('search') search?: string,
  ) {
    return this.service.findAll({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      library,
      category,
      group,
      search,
    })
  }

  @Get(':id')
  @Public()
  findOne(@Param('id') id: string) {
    return this.service.findOne(id)
  }

  @Post()
  create(@Body() data: Partial<CanvasExample>) {
    return this.service.create(data)
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() data: Partial<CanvasExample>) {
    return this.service.update(id, data)
  }
}
