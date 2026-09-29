import { Transform, Type } from 'class-transformer'
import {
 IsArray,
 IsBoolean,
 IsInt,
 IsObject,
 IsOptional,
 IsString,
 MaxLength,
 Min,
} from 'class-validator'

const normalizeTagValue = ({ value }: { value: unknown }) => {
 if (!Array.isArray(value)) {
   return []
 }
 return value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)
}

export class CreateKnowledgeSnippetDto {
 @IsString()
 @MaxLength(160)
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
