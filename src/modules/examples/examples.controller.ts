import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ExamplesService } from './examples.service';
import { Example } from './entities/example.entity';
import { Public } from '../auth/decorators/public.decorator';
import { RequireAuthGuard } from '../auth/guards/require-auth.guard';

@Controller('api/examples')
export class ExamplesController {
 constructor(private readonly examplesService: ExamplesService) {}

 @Get()
 @Public()
 async findAll(
   @Query('topicSlug') topicSlug?: string,
   @Query('categorySlug') categorySlug?: string,
   @Query('search') search?: string,
   @Query('isInteractive') isInteractive?: string,
   @Query('sourceFilePrefix') sourceFilePrefix?: string,
   @Query('sourceGroup') sourceGroup?: string,
   @Query('ids') ids?: string,
   @Query('page') page?: string,
   @Query('limit') limit?: string,
 ) {
   const pageNum = parseInt(page || '1', 10);
   const limitNum = parseInt(limit || '20', 10);
   const isInteractiveBool = isInteractive !== undefined ? isInteractive === 'true' : undefined;
   const idList = ids ? ids.split(',').filter((id) => id.trim() !== '') : undefined;
   return this.examplesService.findAll(
     { topicSlug, categorySlug, search, isInteractive: isInteractiveBool, sourceFilePrefix, sourceGroup, ids: idList },
     { page: pageNum, limit: limitNum },
   );
 }

 @Get(':id')
 @Public()
 async findOne(@Param('id') id: string) {
   return this.examplesService.findOne(id);
 }

 @Post()
 @UseGuards(RequireAuthGuard)
 async create(@Body() exampleData: Partial<Example>) {
   return this.examplesService.create(exampleData);
 }

 @Patch(':id')
 @UseGuards(RequireAuthGuard)
 async update(@Param('id') id: string, @Body() exampleData: Partial<Example>) {
   return this.examplesService.update(id, exampleData);
 }

 @Delete(':id')
 @UseGuards(RequireAuthGuard)
 async remove(@Param('id') id: string) {   return this.examplesService.remove(id);
 }
}
