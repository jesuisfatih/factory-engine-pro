import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { TenantContextService } from './tenant-context.js';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly tenantContext: TenantContextService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const context = this.tenantContext.get();
    const requestId = context?.requestId ?? response.getHeader('x-request-id')?.toString() ?? 'missing-request-id';

    const status = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const raw = exception instanceof HttpException ? exception.getResponse() : undefined;
    const objectResponse = typeof raw === 'object' && raw !== null ? raw as Record<string, unknown> : {};
    const message = typeof raw === 'string'
      ? raw
      : typeof objectResponse.message === 'string'
        ? objectResponse.message
        : status === 500
          ? 'Unexpected server error. Share the request_id with support.'
          : 'Request failed.';

    response.status(status).json({
      message,
      code: typeof objectResponse.code === 'string' ? objectResponse.code : this.codeForStatus(status),
      request_id: requestId,
      details: objectResponse.issues ?? objectResponse.details,
    });
  }

  private codeForStatus(status: number) {
    if (status === 400) return 'bad_request';
    if (status === 401) return 'unauthorized';
    if (status === 403) return 'forbidden';
    if (status === 404) return 'not_found';
    if (status === 409) return 'conflict';
    return 'server_error';
  }
}
