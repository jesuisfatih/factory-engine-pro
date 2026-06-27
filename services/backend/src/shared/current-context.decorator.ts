import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { RequestContext } from './tenant-context.js';

export const CurrentContext = createParamDecorator((key: keyof RequestContext | undefined, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<{ context?: RequestContext }>();
  return key ? request.context?.[key] : request.context;
});
