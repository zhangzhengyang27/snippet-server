import { Controller, Get, Param, Query, Patch, Delete, Body } from '@nestjs/common'
import { UiElementsService } from './ui-elements.service'
import { Public } from '../auth/decorators/public.decorator'
import { UiElementTemplate } from './entities/ui-element-template.entity'

@Controller('api/ui-elements')
export class UiElementsController {
  constructor(private readonly uiElementsService: UiElementsService) {}

  @Get('categories')
  @Public()
  findCategories() {
    return this.uiElementsService.findCategories()
  }

  @Get()
  @Public()
  findTemplates(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('category') category?: string,
    @Query('framework') framework?: string,
    @Query('search') search?: string,
    @Query('sort') sort?: string
  ) {
    return this.uiElementsService.findTemplates({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      category,
      framework,
      search,
      sort,
    })
  }

  @Get(':id')
  @Public()
  findOne(@Param('id') id: string) {
    return this.uiElementsService.findOne(id)
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() data: Partial<UiElementTemplate>
  ) {
    return this.uiElementsService.update(id, data)
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.uiElementsService.remove(id)
  }
}
