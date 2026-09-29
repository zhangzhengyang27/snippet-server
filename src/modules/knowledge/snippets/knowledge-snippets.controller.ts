import {
 Body,
 Controller,
 Delete,
 Get,
 Param,
 Patch,
 Post,
 Query,
 Req,
 UseGuards,
} from '@nestjs/common'
import type { Request } from 'express'
import { RequireAuthGuard } from '../../auth/guards/require-auth.guard'
import {
 CreateKnowledgeSnippetDto,
 CreateSnippetCollectionDto,
 CopySnippetDto,
 ListKnowledgeSnippetsDto,
 ReorderSnippetCollectionsDto,
 UpdateKnowledgeSnippetDto,
 UpdateSnippetCollectionDto,
} from './dto/knowledge-snippet.dto'
import { KnowledgeSnippetsService } from './knowledge-snippets.service'

type AuthedRequest = Request & { user?: { userId: string } }

/**
* 代码片段接口。
*
* 读接口（集合树/标签/列表/详情）对未登录用户开放：
* 全局 JwtAuthGuard 采用宽容模式（无凭证放行），故读接口不叠加 RequireAuthGuard，
* 并以 `request.user?.userId ?? null` 区分登录/匿名，由服务层返回「个人 + 公共」或「仅公共」数据。
* 写接口（创建/更新/删除/重排/复制）均叠加 RequireAuthGuard 强制登录。
*/
@Controller('api/knowledge/snippets')
export class KnowledgeSnippetsController {
 constructor(private readonly knowledgeSnippetsService: KnowledgeSnippetsService) {}

 @Get('collections/tree')
 listCollections(@Req() request: AuthedRequest) {
   return this.knowledgeSnippetsService.listCollectionsTree(request.user?.userId ?? null)
 }

 @Post('collections')
 @UseGuards(RequireAuthGuard)
 createCollection(@Req() request: AuthedRequest, @Body() payload: CreateSnippetCollectionDto) {
   return this.knowledgeSnippetsService.createCollection(request.user!.userId, payload)
 }

 @Post('collections/reorder')
 @UseGuards(RequireAuthGuard)
 reorderCollections(@Req() request: AuthedRequest, @Body() payload: ReorderSnippetCollectionsDto) {
   return this.knowledgeSnippetsService.reorderCollections(
     request.user!.userId,
     Array.isArray(payload.items) ? payload.items : []
   )
 }

 @Patch('collections/:id')
 @UseGuards(RequireAuthGuard)
 updateCollection(
   @Req() request: AuthedRequest,
   @Param('id') id: string,
   @Body() payload: UpdateSnippetCollectionDto
 ) {
   return this.knowledgeSnippetsService.updateCollection(request.user!.userId, id, payload)
 }

 @Delete('collections/:id')
 @UseGuards(RequireAuthGuard)
 removeCollection(@Req() request: AuthedRequest, @Param('id') id: string) {
   return this.knowledgeSnippetsService.deleteCollection(request.user!.userId, id)
 }

 @Get('tags')
 listTags(@Req() request: AuthedRequest) {
   return this.knowledgeSnippetsService.listTags(request.user?.userId ?? null)
 }

 @Get()
 list(@Req() request: AuthedRequest, @Query() query: ListKnowledgeSnippetsDto) {
   return this.knowledgeSnippetsService.listSnippets(request.user?.userId ?? null, query)
 }

 @Get(':id')
 get(@Req() request: AuthedRequest, @Param('id') id: string) {
   return this.knowledgeSnippetsService.getSnippet(request.user?.userId ?? null, id)
 }

 @Post()
 @UseGuards(RequireAuthGuard)
 create(@Req() request: AuthedRequest, @Body() payload: CreateKnowledgeSnippetDto) {
   return this.knowledgeSnippetsService.createSnippet(request.user!.userId, payload)
 }

 @Patch(':id')
 @UseGuards(RequireAuthGuard)
 update(
   @Req() request: AuthedRequest,
   @Param('id') id: string,
   @Body() payload: UpdateKnowledgeSnippetDto
 ) {
   return this.knowledgeSnippetsService.updateSnippet(request.user!.userId, id, payload)
 }

 @Delete(':id')
 @UseGuards(RequireAuthGuard)
 remove(@Req() request: AuthedRequest, @Param('id') id: string) {
   return this.knowledgeSnippetsService.deleteSnippet(request.user!.userId, id)
 }

 @Get(':id/versions')
 @UseGuards(RequireAuthGuard)
 listVersions(
   @Req() request: AuthedRequest,
   @Param('id') id: string,
   @Query('page') page?: string,
   @Query('pageSize') pageSize?: string
 ) {
   return this.knowledgeSnippetsService.listSnippetVersions(
     request.user!.userId,
     id,
     page ? parseInt(page, 10) : 1,
     pageSize ? parseInt(pageSize, 10) : 30
   )
 }

 @Get(':id/versions/:versionId')
 @UseGuards(RequireAuthGuard)
 getVersion(
   @Req() request: AuthedRequest,
   @Param('id') id: string,
   @Param('versionId') versionId: string
 ) {
   return this.knowledgeSnippetsService.getSnippetVersion(request.user!.userId, id, versionId)
 }

 @Delete(':id/versions/:versionId')
 @UseGuards(RequireAuthGuard)
 deleteVersion(
   @Req() request: AuthedRequest,
   @Param('id') id: string,
   @Param('versionId') versionId: string
 ) {
   return this.knowledgeSnippetsService.deleteSnippetVersion(request.user!.userId, id, versionId)
 }

 @Post(':id/versions/:versionId/rollback')
 @UseGuards(RequireAuthGuard)
 rollbackVersion(
   @Req() request: AuthedRequest,
   @Param('id') id: string,
   @Param('versionId') versionId: string
 ) {
   return this.knowledgeSnippetsService.rollbackSnippetVersion(request.user!.userId, id, versionId)
 }

 @Post(':id/use')
 @UseGuards(RequireAuthGuard)
 recordUse(@Req() request: AuthedRequest, @Param('id') id: string) {
   return this.knowledgeSnippetsService.recordUse(request.user!.userId, id)
 }

 @Post(':id/copy')
 @UseGuards(RequireAuthGuard)
 copy(@Req() request: AuthedRequest, @Param('id') id: string, @Body() payload: CopySnippetDto) {
   return this.knowledgeSnippetsService.copySnippet(
     request.user!.userId,
     id,
     payload.collectionId ?? null
   )
 }
}
175

  @Post('batch/tag')
  async batchAddTag(@Body() body: { ids: string[]; tag: string }) {
    return this.examplesService.batchAddTag(body.ids, body.tag);
  }

  @Post('batch/delete')
  async batchDelete(@Body() body: { ids: string[] }) {
    return this.examplesService.batchDelete(body.ids);
  }
	