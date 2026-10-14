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
import { RolesGuard } from '../../auth/guards/roles.guard'
import { Roles } from '../../auth/guards/roles.decorator'
import { RateLimitGuard } from '../../auth/guards/rate-limit.guard'
import { RateLimit } from '../../../common/rate-limit/rate-limit.decorator'
import {
 BatchAddTagDto,
 BatchDeleteDto,
 CreateKnowledgeSnippetDto,
 CreateSnippetCollectionDto,
 CopySnippetDto,
 ListKnowledgeSnippetsDto,
 ListModerationQueueDto,
 ListSnippetCollectionsQueryDto,
 ModerateSnippetDto,
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
 listCollections(
   @Req() request: AuthedRequest,
   @Query() query: ListSnippetCollectionsQueryDto,
 ) {
   return this.knowledgeSnippetsService.listCollectionsTree(
     request.user?.userId ?? null,
     query.scope ?? 'all',
   )
 }

 @Post('collections')
 @RateLimit({ max: 20, windowMs: 60_000 })
 @UseGuards(RequireAuthGuard, RateLimitGuard)
 createCollection(@Req() request: AuthedRequest, @Body() payload: CreateSnippetCollectionDto) {
   return this.knowledgeSnippetsService.createCollection(request.user!.userId, payload)
 }

 @Post('collections/reorder')
 @RateLimit({ max: 20, windowMs: 60_000 })
 @UseGuards(RequireAuthGuard, RateLimitGuard)
 reorderCollections(@Req() request: AuthedRequest, @Body() payload: ReorderSnippetCollectionsDto) {
   return this.knowledgeSnippetsService.reorderCollections(
     request.user!.userId,
     Array.isArray(payload.items) ? payload.items : [],
     payload.scope ?? 'all',
   )
 }

 @Patch('collections/:id')
 @RateLimit({ max: 20, windowMs: 60_000 })
 @UseGuards(RequireAuthGuard, RateLimitGuard)
 updateCollection(
   @Req() request: AuthedRequest,
   @Param('id') id: string,
   @Body() payload: UpdateSnippetCollectionDto
 ) {
   return this.knowledgeSnippetsService.updateCollection(request.user!.userId, id, payload)
 }

 @Delete('collections/:id')
 @RateLimit({ max: 20, windowMs: 60_000 })
 @UseGuards(RequireAuthGuard, RateLimitGuard)
 removeCollection(@Req() request: AuthedRequest, @Param('id') id: string) {
   return this.knowledgeSnippetsService.deleteCollection(request.user!.userId, id)
 }

 @Get('tags')
 listTags(@Req() request: AuthedRequest) {
   return this.knowledgeSnippetsService.listTags(request.user?.userId ?? null)
 }

 /**
  * 审核队列（管理员）。
  *
  * 必须声明在 `@Get(':id')` **之前** —— 否则 `moderation` 会被当成片段 id 匹配走详情接口。
  * 控制器里 `collections/tree`、`tags` 同理，都是刻意前置的固定路径。
  */
 @Get('moderation/queue')
 @UseGuards(RequireAuthGuard, RolesGuard)
 @Roles('admin')
 listModerationQueue(@Query() query: ListModerationQueueDto) {
   return this.knowledgeSnippetsService.listModerationQueue(query)
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
 @RateLimit({ max: 20, windowMs: 60_000 })
 @UseGuards(RequireAuthGuard, RateLimitGuard)
 create(@Req() request: AuthedRequest, @Body() payload: CreateKnowledgeSnippetDto) {
   return this.knowledgeSnippetsService.createSnippet(request.user!.userId, payload)
 }

 @Patch(':id')
 @RateLimit({ max: 20, windowMs: 60_000 })
 @UseGuards(RequireAuthGuard, RateLimitGuard)
 update(
   @Req() request: AuthedRequest,
   @Param('id') id: string,
   @Body() payload: UpdateKnowledgeSnippetDto
 ) {
   return this.knowledgeSnippetsService.updateSnippet(request.user!.userId, id, payload)
 }

 @Delete(':id')
 @RateLimit({ max: 20, windowMs: 60_000 })
 @UseGuards(RequireAuthGuard, RateLimitGuard)
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
 @RateLimit({ max: 20, windowMs: 60_000 })
 @UseGuards(RequireAuthGuard, RateLimitGuard)
 deleteVersion(
   @Req() request: AuthedRequest,
   @Param('id') id: string,
   @Param('versionId') versionId: string
 ) {
   return this.knowledgeSnippetsService.deleteSnippetVersion(request.user!.userId, id, versionId)
 }

 @Post(':id/versions/:versionId/rollback')
 @RateLimit({ max: 20, windowMs: 60_000 })
 @UseGuards(RequireAuthGuard, RateLimitGuard)
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
 @RateLimit({ max: 20, windowMs: 60_000 })
 @UseGuards(RequireAuthGuard, RateLimitGuard)
 copy(@Req() request: AuthedRequest, @Param('id') id: string, @Body() payload: CopySnippetDto) {
   return this.knowledgeSnippetsService.copySnippet(
     request.user!.userId,
     id,
     payload.collectionId ?? null
   )
 }

 // ── 发布到公共代码块库（作者侧） ──

 /**
  * 提交发布：把自有片段送审，管理员通过后进入公共库。
  * 提交后 isPublic 仍为 false（未上架），前端据 moderationStatus 显示「审核中」。
  */
 @Post(':id/publication')
 @RateLimit({ max: 20, windowMs: 60_000 })
 @UseGuards(RequireAuthGuard, RateLimitGuard)
 submitPublication(@Req() request: AuthedRequest, @Param('id') id: string) {
   return this.knowledgeSnippetsService.submitSnippetForPublication(request.user!.userId, id)
 }

 /**
  * 取消发布：撤回待审（pending）或下架已发布（approved），一律回到私有。
  */
 @Delete(':id/publication')
 @RateLimit({ max: 20, windowMs: 60_000 })
 @UseGuards(RequireAuthGuard, RateLimitGuard)
 withdrawPublication(@Req() request: AuthedRequest, @Param('id') id: string) {
   return this.knowledgeSnippetsService.withdrawSnippetPublication(request.user!.userId, id)
 }

 // ── 审核（管理员） ──

 /**
  * 裁决一条待审片段：approve → 进公共库；reject → 保持私有并记录原因。
  * 用 `@Roles('admin')` 限定角色，非管理员一律 403。
  */
 @Post(':id/moderation')
 @RateLimit({ max: 20, windowMs: 60_000 })
 @UseGuards(RequireAuthGuard, RolesGuard, RateLimitGuard)
 @Roles('admin')
 moderate(
   @Req() request: AuthedRequest,
   @Param('id') id: string,
   @Body() payload: ModerateSnippetDto
 ) {
   return this.knowledgeSnippetsService.moderateSnippet(request.user!.userId, id, payload)
 }

  // ── 批量操作（8/30 页面契约） ──

  @Post('batch/tag')
  @RateLimit({ max: 10, windowMs: 60_000 })
  @UseGuards(RequireAuthGuard, RateLimitGuard)
  async batchAddTag(@Req() request: AuthedRequest, @Body() body: BatchAddTagDto) {
    return this.knowledgeSnippetsService.batchAddTag(request.user!.userId, body.ids, body.tag)
  }

  @Post('batch/delete')
  @RateLimit({ max: 10, windowMs: 60_000 })
  @UseGuards(RequireAuthGuard, RateLimitGuard)
  async batchDelete(@Req() request: AuthedRequest, @Body() body: BatchDeleteDto) {
    return this.knowledgeSnippetsService.batchDelete(request.user!.userId, body.ids)
  }
}
