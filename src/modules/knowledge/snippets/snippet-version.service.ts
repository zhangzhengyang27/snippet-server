import { Injectable } from '@nestjs/common';

/**
 * 片段版本服务（最小实现）。
 * 原设计中每次保存写入版本快照、支持列表/回滚/删除；当前前端未接入版本 UI
 * （见前端 useSnippetVersions.ts 裁剪注释），controller 的 /versions 路由保留但
 * 返回空集。恢复版本 UI 时在此补齐快照写入与查询。
 */
@Injectable()
export class SnippetVersionService {
  async listVersions(_snippetId: string) {
    return [];
  }

  async getVersion(_snippetId: string, _versionId: string) {
    return null;
  }

  async deleteVersion(_snippetId: string, _versionId: string) {
    return { ok: true };
  }

  async rollback(_snippetId: string, _versionId: string) {
    return { ok: false };
  }
}
