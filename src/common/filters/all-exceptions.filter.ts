import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/** 统一错误响应体。`message` 的形态刻意与 Nest 默认保持一致（string | string[]），前端据此取文案。 */
export interface ErrorResponseBody {
  statusCode: number;
  message: string | string[];
  error?: string;
  /** 429 时存在：建议的等待秒数 */
  retryAfter?: number;
  /** 请求路径，便于前端/日志关联 */
  path: string;
  /** ISO 时间戳 */
  timestamp: string;
}

interface NormalizedError {
  status: number;
  message: string | string[];
  error?: string;
  retryAfter?: number;
}

/**
 * HttpException 的响应体可能是 string、string[]，或带 message/error 的对象；
 * 这里统一收敛成我们自己的结构。
 */
function normalizeHttpException(exception: HttpException): NormalizedError {
  const status = exception.getStatus();
  const payload = exception.getResponse();

  if (typeof payload === 'string') {
    return { status, message: payload };
  }

  const record = payload as Record<string, unknown>;
  const rawMessage = record['message'];
  const rawError = record['error'];
  const rawRetryAfter = record['retryAfter'];

  const message: string | string[] = Array.isArray(rawMessage)
    ? rawMessage.map((item) => String(item))
    : typeof rawMessage === 'string'
      ? rawMessage
      : exception.message;

  return {
    status,
    message,
    ...(typeof rawError === 'string' ? { error: rawError } : {}),
    ...(typeof rawRetryAfter === 'number' ? { retryAfter: rawRetryAfter } : {}),
  };
}

/**
 * 取出错误对象自带的数字状态码（body-parser 的 JSON 解析错误等
 * 并非 HttpException，但会挂一个 400 的 status）。
 */
function readEmbeddedStatus(exception: unknown): number | null {
  if (typeof exception !== 'object' || exception === null) return null;
  const raw = (exception as { status?: unknown; statusCode?: unknown }).status ??
    (exception as { statusCode?: unknown }).statusCode;
  return typeof raw === 'number' && raw >= 400 && raw < 600 ? raw : null;
}

function normalize(exception: unknown): NormalizedError {
  if (exception instanceof HttpException) {
    return normalizeHttpException(exception);
  }

  const embedded = readEmbeddedStatus(exception);
  if (embedded !== null) {
    // 客户端错误（如请求体不是合法 JSON）：给出状态码但不回显内部细节
    return { status: embedded, message: '请求无法处理，请检查请求内容' };
  }

  // 未知异常：一律 500，且**不回显 exception.message**，避免泄露实现细节
  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    message: '服务器内部错误，请稍后重试',
    error: 'Internal Server Error',
  };
}

/**
 * 全局异常过滤器：把任何抛出物收敛成统一的 JSON 错误结构。
 *
 * 两点约定：
 * 1. `message` 必须保持 string | string[] —— 前端 `getApiErrorMessage` 依赖它
 *    提取可展示文案（含 class-validator 的多条校验错误数组）。
 * 2. 5xx 记完整堆栈、4xx 只记一行。否则客户端每次参数写错都会刷满错误日志，
 *    真正的服务端故障反而被淹没。
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const normalized = normalize(exception);

    if (normalized.status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      const detail =
        exception instanceof Error ? exception.stack : String(exception);
      this.logger.error(
        `${request.method} ${request.url} → ${normalized.status}`,
        detail,
      );
    }

    if (normalized.retryAfter !== undefined) {
      response.setHeader('Retry-After', String(normalized.retryAfter));
    }

    const body: ErrorResponseBody = {
      statusCode: normalized.status,
      message: normalized.message,
      ...(normalized.error !== undefined ? { error: normalized.error } : {}),
      ...(normalized.retryAfter !== undefined
        ? { retryAfter: normalized.retryAfter }
        : {}),
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    response.status(normalized.status).json(body);
  }
}
