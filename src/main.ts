import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

const INSECURE_JWT_SECRETS = [
  'your-jwt-secret-key-change-in-production',
  'default-secret',
  'changeme',
  'secret',
];

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

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
}
bootstrap();
