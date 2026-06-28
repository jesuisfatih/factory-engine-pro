import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export function getJwtAccessSecret(config: ConfigService): string {
  const secret = config.get<string>('JWT_ACCESS_SECRET') ?? config.get<string>('JWT_SECRET');
  if (!secret) {
    throw new InternalServerErrorException('JWT access secret is not configured');
  }
  return secret;
}
