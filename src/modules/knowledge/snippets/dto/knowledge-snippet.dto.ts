import { Transform } from 'class-transformer'
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  registerDecorator,
  ValidationArguments,
  ValidatorConstraintInterface,
} from 'class-validator'
import { checkSnippetMetadata } from '../snippet-metadata.util'

/** 标题 / 描述语义闸门：复用 snippet-metadata.util 的同一套规则，脏数据在写库前就 400。 */
class IsSnippetMetadataConstraint implements ValidatorConstraintInterface {
  constructor(private readonly options: { partial?: boolean } = {}) {}

  // 注意：class-validator 传给约束的第一个参数是「当前属性的值」，不是整个 DTO。
  // 标题/描述是跨字段规则，必须从 ValidationArguments.object 取整个对象，
  // 否则所有校验都会因为「取不到 name/description」而恒不通过（闸门形同虚设）。
  validate(_value: unknown, args?: ValidationArguments): boolean {
    const payload = (args?.object ?? {}) as { name?: string | null; description?: string | null }
    return checkSnippetMetadata(payload, this.options).length === 0
  }

  defaultMessage(): string {
    return '标题、描述不符合语义规范：标题需非空且 ≤30 字、不得由语言标识开头；描述需非空且 ≥20 字、不能与标题相同'
  }
}

/**
 * 挂在 name 字段上，但校验的是整个 DTO（拿得到 description）。
 * partial 用于 PATCH：只校验调用方实际传入的字段，避免「改个标题顺带被要求补描述」。
 */
export function IsSnippetMetadata(options: { partial?: boolean } = {}) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      validator: new IsSnippetMetadataConstraint(options),
    })
  }
}

export class CreateKnowledgeSnippetDto {
 @IsString()
 @MaxLength(160)
 @IsSnippetMetadata()
 name!: string

 @IsOptional()
 @IsString()
 @MaxLength(400)
 description?: string

 @IsOptional()
 @IsString()
 collectionId?: string | null

 @IsOptional()
 @IsString()
 @MaxLength(64)
 language?: string

 @IsString()
 content!: string

 @IsOptional()
 @IsObject()
 displayAttrs?: Record<string, unknown>

 @IsOptional()
 @IsArray()
 @IsString({ each: true })
 @MaxLength(40, { each: true })
 tags?: string[]

 @IsOptional()
 @IsBoolean()
 favorite?: boolean

 /** 可选：创建片段时对应的初始版本说明 */
 @IsOptional()
 @IsString()
 @MaxLength(200)
 versionMessage?: string
}

export class UpdateKnowledgeSnippetDto {
 @IsOptional()
 @IsString()
 @MaxLength(160)
 @IsSnippetMetadata({ partial: true })
 name?: string

 @IsOptional()
 @IsString()
 @MaxLength(400)
 description?: string | null

 @IsOptional()
 @IsString()
 collectionId?: string | null

 @IsOptional()
 @IsString()
 @MaxLength(64)
 language?: string

 @IsOptional()
 @IsString()
 content?: string

 @IsOptional()
 @IsObject()
 displayAttrs?: Record<string, unknown>

 @IsOptional()
 @IsArray()
 @IsString({ each: true })
 @MaxLength(40, { each: true })
 tags?: string[]

 @IsOptional()
 @Transform(({ value }) => (value === 'false' ? false : Boolean(value)))
 @IsBoolean()
 favorite?: boolean

 /** 可选：本次更新对应的版本说明（用于版本历史记录） */
 @IsOptional()
 @IsString()
 @MaxLength(200)
 versionMessage?: string
}

export class CreateSnippetCollectionDto {
 @IsString()
 @MaxLength(120)
 name!: string

 @IsOptional()
 @IsString()
 parentId?: string | null
}

/** 复制公共片段到个人片段库的请求体。collectionId 为空时复制到未分组。 */
export class CopySnippetDto {
 @IsOptional()
 @IsString()
 collectionId?: string | null
}

export class UpdateSnippetCollectionDto {
 @IsOptional()
 @IsString()
 @MaxLength(120)
 name?: string
}

export class ReorderCollectionItemDto {
 @IsString()
 id!: string

 @IsOptional()
 @IsString()
 parentId?: string | null

 @IsInt()
 @Min(0)
 order!: number
}

export class ReorderSnippetCollectionsDto {
 @IsArray()
 items!: ReorderCollectionItemDto[]
}

export class ListKnowledgeSnippetsDto {
 @IsOptional()
 @IsString()
 q?: string

 @IsOptional()
 @IsString()
 collectionId?: string

 @IsOptional()
 @IsString()
 tag?: string

 @IsOptional()
 @IsString()
 language?: string

 /**
  * 按 id 批量查询（逗号分隔的字符串，如 `?ids=a,b,c`）。
  *
  * 用于「最近浏览」这类**先有 id 列表、再取详情**的场景，把 N 次回查压成 1 次。
  * 必须声明在 DTO 里 —— controller 用的是 class DTO + 全局
  * `forbidNonWhitelisted`，未声明的查询参数会直接被 400 拒绝。
  */
 @IsOptional()
 @Transform(({ value }) =>
   typeof value === 'string' ? value.split(',').map((s) => s.trim()).filter(Boolean) : value
 )
 @IsArray()
 @IsString({ each: true })
 ids?: string[]

 @IsOptional()
 @Transform(({ value }) => (value === 'false' ? false : Boolean(value)))
 @IsBoolean()
 favorite?: boolean

 @IsOptional()
 @IsString()
 sort?: string

 @IsOptional()
 page?: number

 @IsOptional()
 pageSize?: number
}

/** 批量打标签：ids 为目标片段 id 列表，tag 为要追加的标签名。 */
export class BatchAddTagDto {
 @IsArray()
 @ArrayNotEmpty()
 @IsString({ each: true })
 ids!: string[]

 @IsString()
 @IsNotEmpty()
 @MaxLength(40)
 tag!: string
}

/** 批量删除片段。 */
export class BatchDeleteDto {
 @IsArray()
 @ArrayNotEmpty()
 @IsString({ each: true })
 ids!: string[]
}
