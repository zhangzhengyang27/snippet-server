import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsIn,
  MinLength,
  MaxLength,
} from 'class-validator';

// ========== Auth DTOs ==========

export class LoginDto {
  @IsString()
  @IsNotEmpty({ message: '用户名不能为空' })
  @MinLength(2, { message: '用户名至少2个字符' })
  @MaxLength(50, { message: '用户名最多50个字符' })
  username!: string;

  @IsString()
  @IsNotEmpty({ message: '密码不能为空' })
  @MinLength(6, { message: '密码至少6个字符' })
  password!: string;
}

// ========== Topic DTOs ==========

export class CreateTopicDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  slug!: string;

  @IsString()
  @IsNotEmpty()
  icon!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  color?: string;

  @IsOptional()
  order?: number;
}

export class UpdateTopicDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  icon?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  color?: string;

  @IsOptional()
  order?: number;
}

// ========== Category DTOs ==========

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  slug!: string;

  @IsString()
  @IsNotEmpty()
  icon!: string;

  @IsString()
  @IsNotEmpty()
  topicSlug!: string;

  @IsString()
  @IsOptional()
  description?: string;
}

export class UpdateCategoryDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  icon?: string;

  @IsString()
  @IsOptional()
  description?: string;
}

// ========== Example DTOs ==========

export class CreateExampleDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsNotEmpty()
  categorySlug!: string;

  @IsString()
  @IsNotEmpty()
  topicSlug!: string;

  @IsString()
  @IsOptional()
  sourceGroup?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @IsString()
  @IsIn(['html', 'css', 'js', 'mixed'], { message: 'language 必须是 html/css/js/mixed' })
  language!: string;

  @IsString()
  @IsNotEmpty()
  html!: string;

  @IsString()
  @IsOptional()
  css?: string;

  @IsString()
  @IsOptional()
  js?: string;

  @IsString()
  @IsNotEmpty()
  sourceFile!: string;

  @IsOptional()
  sourceLine?: number;

  @IsString()
  @IsIn(['beginner', 'intermediate', 'advanced'])
  @IsOptional()
  difficulty?: string;

  @IsOptional()
  isInteractive?: boolean;
}

export class UpdateExampleDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  categorySlug?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @IsString()
  @IsIn(['html', 'css', 'js', 'mixed'])
  @IsOptional()
  language?: string;

  @IsString()
  @IsOptional()
  html?: string;

  @IsString()
  @IsOptional()
  css?: string;

  @IsString()
  @IsOptional()
  js?: string;

  @IsString()
  @IsIn(['beginner', 'intermediate', 'advanced'])
  @IsOptional()
  difficulty?: string;

  @IsOptional()
  isInteractive?: boolean;
}

// ========== Static Site DTOs ==========

export class CreateStaticSiteDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  slug!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  thumbnail?: string;

  @IsString()
  @IsOptional()
  group?: string;
}

export class UpdateStaticSiteDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  thumbnail?: string;

  @IsString()
  @IsOptional()
  group?: string;
}

// ========== UI Element DTOs ==========

export class UpdateUiElementDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  html?: string;

  @IsString()
  @IsOptional()
  css?: string;

  @IsString()
  @IsOptional()
  js?: string;

  @IsString()
  @IsOptional()
  categoryId?: string;
}

// ========== Canvas Example DTOs ==========

export class CreateCanvasExampleDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsNotEmpty()
  library!: string;

  @IsString()
  @IsOptional()
  group?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  @IsNotEmpty()
  html!: string;

  @IsString()
  @IsOptional()
  css?: string;

  @IsString()
  @IsOptional()
  js?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];
}

export class UpdateCanvasExampleDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  html?: string;

  @IsString()
  @IsOptional()
  css?: string;

  @IsString()
  @IsOptional()
  js?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];
}
