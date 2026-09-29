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
import { Public } from '../../auth/decorators/public.decorator'
import { OssService } from '../../oss/oss.service'
import { DriveService } from './drive.service'
import { DriveUploadService } from './drive-upload.service'
import { DriveVersionService } from './drive-version.service'
import { DriveShareService } from './drive-share.service'
import { DriveArchiveService } from './drive-archive.service'
import type { DriveFolderTreeNode } from './drive-tree.service'
import {
  AccessDriveFileShareDto,
  CompleteUploadSessionDto,
  CreateDriveFileShareDto,
  CreateFolderDto,
  CreateUploadSessionDto,
  DownloadBatchDto,
  DownloadFileQueryDto,
  DriveTreeQueryDto,
  FileIdsDto,
  FinishUploadDto,
  ListDriveFilesDto,
  ListDriveSharesDto,
  ListDriveTrashDto,
  MoveFilesDto,
  PreflightUploadDto,
  RenameFileDto,
  SearchDriveFilesDto,
  UpdateCurrentVersionNoteDto,
  UpdateDriveFileDto,
  UpdateDriveFileShareDto,
  UpdateDriveFileSharesDto,
  UpdateDriveFileVersionNoteDto,
  UpdateUploadSessionCheckpointDto,
  VerifyDriveFileShareDto,
} from './dto/drive.dto'

type AuthedRequest = Request & { user?: { userId: string } }

@Controller('api/drive')
@UseGuards(RequireAuthGuard)
export class DriveController {
  constructor(
    private readonly driveService: DriveService,
    private readonly ossService: OssService,
    private readonly uploadService: DriveUploadService,
    private readonly versionService: DriveVersionService,
    private readonly shareService: DriveShareService,
    private readonly archiveService: DriveArchiveService,
  ) {}

  // ==================== 基础 CRUD ====================

  @Get('path/:folderId')
  getPath(@Req() request: AuthedRequest, @Param('folderId') folderId: string) {
    return this.driveService.getFolderPath(request.user!.userId, folderId)
  }

  @Get('trash/list')
  listTrash(@Req() request: AuthedRequest, @Query() query: ListDriveTrashDto) {
    return this.driveService.listTrash(request.user!.userId, query)
  }

  @Post('trash/restore')
  restoreTrash(@Req() request: AuthedRequest, @Body() payload: FileIdsDto) {
    return this.driveService.restoreFiles(request.user!.userId, payload.ids)
  }

  @Post('trash/delete')
  deleteTrash(@Req() request: AuthedRequest, @Body() payload: FileIdsDto) {
    return this.driveService.permanentDeleteFiles(request.user!.userId, payload.ids)
  }

  @Get('list')
  findAll(@Req() request: AuthedRequest, @Query() query: ListDriveFilesDto) {
    return this.driveService.listFiles(request.user!.userId, query)
  }

  @Post('folder')
  createFolder(@Req() request: AuthedRequest, @Body() payload: CreateFolderDto) {
    return this.driveService.createFolder(request.user!.userId, payload.name, payload.parentId)
  }

  @Post('file/finish')
  finishUpload(@Req() request: AuthedRequest, @Body() payload: FinishUploadDto) {
    return this.driveService.finishUpload(request.user!.userId, payload)
  }

  @Delete()
  delete(@Req() request: AuthedRequest, @Query() query: FileIdsDto) {
    return this.driveService.deleteFiles(request.user!.userId, query.ids)
  }

  @Post('rename')
  rename(@Req() request: AuthedRequest, @Body() payload: RenameFileDto) {
    return this.driveService.renameFile(request.user!.userId, payload.id, payload.name)
  }

  @Post('move')
  move(@Req() request: AuthedRequest, @Body() payload: MoveFilesDto) {
    return this.driveService.moveFiles(
      request.user!.userId,
      payload.ids,
      payload.targetFolderId || null,
    )
  }

  @Post('copy')
  copy(@Req() request: AuthedRequest, @Body() payload: MoveFilesDto) {
    return this.driveService.copyFiles(
      request.user!.userId,
      payload.ids,
      payload.targetFolderId || null,
    )
  }

  @Get('search')
  search(@Req() request: AuthedRequest, @Query() query: SearchDriveFilesDto) {
    return this.driveService.searchFiles(request.user!.userId, query)
  }

  @Get('tree')
  getTree(
    @Req() request: AuthedRequest,
    @Query() query: DriveTreeQueryDto,
  ): Promise<DriveFolderTreeNode[]> {
    return this.driveService.getFolderTree(request.user!.userId, query)
  }

  @Get('stats')
  getStats(@Req() request: AuthedRequest) {
    return this.driveService.getStats(request.user!.userId)
  }

  // ==================== STS ====================

  @Get('sts')
  getSts(@Req() request: AuthedRequest) {
    return this.ossService.getStsToken(request.user!.userId)
  }

  // ==================== 下载 ====================

  @Get('file/download')
  getDownloadUrl(@Req() request: AuthedRequest, @Query() query: DownloadFileQueryDto) {
    return this.driveService.getDownloadUrl(
      request.user!.userId,
      query.fileId,
      query.preview === 'true',
      query.expiresIn,
    )
  }

  @Post('file/download/batch')
  getBatchDownloadUrls(@Req() request: AuthedRequest, @Body() payload: DownloadBatchDto) {
    return this.archiveService.createArchiveTask(request.user!.userId, payload.fileIds)
  }

  @Get('file/:fileId')
  getFileDetail(@Req() request: AuthedRequest, @Param('fileId') fileId: string) {
    return this.driveService.getFileDetail(request.user!.userId, fileId)
  }

  @Patch('file/:fileId')
  updateFile(
    @Req() request: AuthedRequest,
    @Param('fileId') fileId: string,
    @Body() payload: UpdateDriveFileDto,
  ) {
    return this.driveService.updateFile(request.user!.userId, fileId, payload)
  }

  // ==================== 分片上传 ====================

  @Post('upload/preflight')
  preflightUpload(@Req() request: AuthedRequest, @Body() payload: PreflightUploadDto) {
    return this.uploadService.preflightUpload(request.user!.userId, payload)
  }

  @Post('upload/session')
  createUploadSession(@Req() request: AuthedRequest, @Body() payload: CreateUploadSessionDto) {
    return this.uploadService.createUploadSession(request.user!.userId, payload)
  }

  @Get('upload/sessions')
  listUploadSessions(@Req() request: AuthedRequest) {
    return this.uploadService.listUploadSessions(request.user!.userId)
  }

  @Patch('upload/session/:sessionId/checkpoint')
  updateCheckpoint(
    @Req() request: AuthedRequest,
    @Param('sessionId') sessionId: string,
    @Body() payload: UpdateUploadSessionCheckpointDto,
  ) {
    return this.uploadService.updateCheckpoint(request.user!.userId, sessionId, payload)
  }

  @Post('upload/session/:sessionId/complete')
  completeSession(
    @Req() request: AuthedRequest,
    @Param('sessionId') sessionId: string,
    @Body() payload?: CompleteUploadSessionDto,
  ) {
    return this.uploadService.completeSession(request.user!.userId, sessionId, payload || {})
  }

  @Delete('upload/session/:sessionId')
  abortSession(@Req() request: AuthedRequest, @Param('sessionId') sessionId: string) {
    return this.uploadService.abortSession(request.user!.userId, sessionId)
  }

  // ==================== 版本管理 ====================

  @Get('file/:fileId/versions')
  listVersions(@Req() request: AuthedRequest, @Param('fileId') fileId: string) {
    return this.versionService.listFileVersions(request.user!.userId, fileId)
  }

  @Patch('file/:fileId/version/current-note')
  updateCurrentVersionNote(
    @Req() request: AuthedRequest,
    @Param('fileId') fileId: string,
    @Body() payload: UpdateCurrentVersionNoteDto,
  ) {
    return this.versionService.updateCurrentVersionNote(request.user!.userId, fileId, payload.versionNote)
  }

  @Patch('file/:fileId/version/:versionId/note')
  updateFileVersionNote(
    @Req() request: AuthedRequest,
    @Param('fileId') fileId: string,
    @Param('versionId') versionId: string,
    @Body() payload: UpdateDriveFileVersionNoteDto,
  ) {
    return this.versionService.updateFileVersionNote(request.user!.userId, fileId, versionId, payload.note)
  }

  @Delete('file/:fileId/version/:versionId')
  deleteFileVersion(
    @Req() request: AuthedRequest,
    @Param('fileId') fileId: string,
    @Param('versionId') versionId: string,
  ) {
    return this.versionService.deleteFileVersion(request.user!.userId, fileId, versionId)
  }

  // ==================== 分享链接 ====================

  @Post('file/:fileId/shares')
  createShare(
    @Req() request: AuthedRequest,
    @Param('fileId') fileId: string,
    @Body() payload: CreateDriveFileShareDto,
  ) {
    return this.shareService.createShare(request.user!.userId, fileId, payload)
  }

  @Get('file/:fileId/shares')
  listFileShares(@Req() request: AuthedRequest, @Param('fileId') fileId: string) {
    return this.shareService.listFileShares(request.user!.userId, fileId)
  }

  @Get('shares')
  listOwnedShares(@Req() request: AuthedRequest, @Query() query: ListDriveSharesDto) {
    return this.shareService.listOwnedShares(request.user!.userId, query)
  }

  @Get('shares/:shareId')
  getShareDetail(@Req() request: AuthedRequest, @Param('shareId') shareId: string) {
    return this.shareService.getShareDetail(request.user!.userId, shareId)
  }

  @Patch('shares/:shareId')
  updateShare(
    @Req() request: AuthedRequest,
    @Param('shareId') shareId: string,
    @Body() payload: UpdateDriveFileShareDto,
  ) {
    return this.shareService.updateShare(request.user!.userId, shareId, payload)
  }

  @Patch('shares')
  updateShares(@Req() request: AuthedRequest, @Body() payload: UpdateDriveFileSharesDto) {
    return this.shareService.updateShares(request.user!.userId, payload)
  }

  @Delete('shares/:shareId')
  deleteShare(@Req() request: AuthedRequest, @Param('shareId') shareId: string) {
    return this.shareService.deleteShare(request.user!.userId, shareId)
  }

  @Post('shares/delete')
  deleteShares(@Req() request: AuthedRequest, @Body() payload: FileIdsDto) {
    return this.shareService.deleteShares(request.user!.userId, payload.ids)
  }

  // ==================== 归档下载 ====================

  @Get('archive/tasks')
  listArchiveTasks(@Req() request: AuthedRequest) {
    return this.archiveService.listArchiveTasks(request.user!.userId)
  }

  @Get('archive/task/:taskId')
  getArchiveTask(@Req() request: AuthedRequest, @Param('taskId') taskId: string) {
    return this.archiveService.getArchiveTask(request.user!.userId, taskId)
  }

}

@Controller('api/public/drive-shares')
export class PublicDriveShareController {
  constructor(private readonly shareService: DriveShareService) {}

  @Public()
  @Post(':shareKey/verify')
  verifyShare(@Param('shareKey') shareKey: string, @Body() payload?: VerifyDriveFileShareDto) {
    return this.shareService.verifyShare(shareKey, payload?.password)
  }

  @Public()
  @Post(':shareKey/access')
  accessShare(@Param('shareKey') shareKey: string, @Body() payload: AccessDriveFileShareDto) {
    return this.shareService.accessShare(shareKey, payload)
  }
}
