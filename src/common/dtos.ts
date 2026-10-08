import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsIn,
  IsEmail,
  Matches,
  MinLength,
  MaxLength,
} from 'class-validator';

// ========== Auth DTOs ==========

/**
 * 登录 DTO。
 * `username` 字段实际是**登录标识**，用户名与邮箱均可（见 AuthService.validateUser）。
 * 因此长度上限放宽到 255 以容纳邮箱；下限仍为 2（历史值，保持不变）。
 */
export class LoginDto {
  @IsString()
  @IsNotEmpty({ message: '用户名或邮箱不能为空' })
  @MinLength(2, { message: '用户名或邮箱至少2个字符' })
  @MaxLength(255, { message: '用户名或邮箱最多255个字符' })
  username!: string;

  @IsString()
  @IsNotEmpty({ message: '密码不能为空' })
  @MinLength(6, { message: '密码至少6个字符' })
  password!: string;
}

/**
 * 注册 DTO。
 *
 * - 密码下限 8（**高于**登录的 6）：新注册强制更强口令，同时不阻断历史短口令用户登录。
 * - 上限 72 对应 bcrypt 的字节截断边界，避免「超长密码静默只认前 72 字节」。
 * - `email` 必填：作为唯一身份与后续账号找回的联系方式（本段暂未实现邮件找回）。
 */
export class RegisterDto {
  @IsString()
  @IsNotEmpty({ message: '用户名不能为空' })
  @MinLength(3, { message: '用户名至少3个字符' })
  @MaxLength(30, { message: '用户名最多30个字符' })
  @Matches(/^[a-zA-Z0-9_\u4e00-\u9fa5-]+$/, {
    message: '用户名只能包含中文、字母、数字、下划线或连字符',
  })
  username!: string;

  @IsString()
  @IsNotEmpty({ message: '邮箱不能为空' })
  @IsEmail({}, { message: '邮箱格式不正确' })
  @MaxLength(255, { message: '邮箱最多255个字符' })
  email!: string;

  @IsString()
  @IsNotEmpty({ message: '密码不能为空' })
  @MinLength(8, { message: '密码至少8个字符' })
  @MaxLength(72, { message: '密码最多72个字符' })
  password!: string;

  @IsString()
  @IsOptional()
  @MaxLength(30, { message: '展示名最多30个字符' })
  displayName?: string;
}

/** 修改密码 DTO（需登录）。 */
export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty({ message: '当前密码不能为空' })
  oldPassword!: string;

  @IsString()
  @IsNotEmpty({ message: '新密码不能为空' })
  @MinLength(8, { message: '新密码至少8个字符' })
  @MaxLength(72, { message: '新密码最多72个字符' })
  newPassword!: string;
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
