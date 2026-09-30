import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

const INSECURE_JWT_SECRETS = [
  'your-jwt-secret-key-change-in-production',
  'default-secret',
  'changeme',
  'secret',
];

/**
 * 解析 TRUST_PROXY 配置。
 *
 * 刻意**默认关闭**：一旦在「未经过反向代理」的部署上开启，客户端就能伪造
 * `X-Forwarded-For` 冒充任意 IP，反而让基于 IP 的限流形同虚设。
 * 取值支持：'true' | 'false' | 数字（信任的跳数）| 字符串（如 'loopback'、CIDR）。
 */
function resolveTrustProxy(): boolean | number | string {
  const raw = (process.env.TRUST_PROXY || '').trim();
  if (!raw || raw === 'false' || raw === '0') return false;
  if (raw === 'true') return true;
  if (/^\d+$/.test(raw)) return Number(raw);
  return raw;
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // 统一错误响应结构（保留 message 的 string | string[] 语义，前端据此取文案）
  app.useGlobalFilters(new AllExceptionsFilter());

  // 反向代理后取真实客户端 IP —— 限流按 IP 计数依赖它
  const trustProxy = resolveTrustProxy();
  app.set('trust proxy', trustProxy);

  app.enableCors({
    origin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',')
      : ['http://localhost:5556'],
    credentials: true,
  });

  // 安全检查：JWT Secret
  const jwtSecret = process.env.JWT_SECRET || '';
  if (!jwtSecret || INSECURE_JWT_SECRETS.includes(jwtSecret)) {
    console.warn(
      '\n⚠️  [安全警告] JWT_SECRET 使用了不安全的默认值。',
      '\n   请在 .env 文件中设置一个随机的强密钥（建议 32 字符以上）。\n',
    );
  }

  // 安全检查：生产环境数据库密码
  if (process.env.NODE_ENV === 'production' && !process.env.DB_PASSWORD) {
    throw new Error('生产环境必须设置 DB_PASSWORD 环境变量');
  }

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
  console.log(
    `trust proxy: ${String(trustProxy)}${trustProxy === false ? '（直连模式，反向代理后请设 TRUST_PROXY）' : ''}`,
  );
}
bootstrap();
