import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

@Injectable()
export class CryptoService {
  constructor(private readonly config: ConfigService) {}

  encrypt(value: string | null | undefined): string | null {
    if (!value) return null;
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
  }

  decrypt(value: string | null | undefined): string | null {
    if (!value) return null;
    const [version, ivRaw, tagRaw, encryptedRaw] = value.split(':');
    if (version !== 'v1' || !ivRaw || !tagRaw || !encryptedRaw) {
      throw new InternalServerErrorException('Encrypted tenant config value is malformed');
    }
    const decipher = createDecipheriv('aes-256-gcm', this.key(), Buffer.from(ivRaw, 'base64'));
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedRaw, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }

  private key() {
    const raw = this.firstConfig(
      'CONFIG_ENCRYPTION_KEY',
      'SETTINGS_ENCRYPTION_KEY',
      'TOKEN_ENCRYPTION_KEY',
      'JWT_SECRET',
    );
    if (!raw) {
      throw new InternalServerErrorException('CONFIG_ENCRYPTION_KEY, SETTINGS_ENCRYPTION_KEY, TOKEN_ENCRYPTION_KEY, or JWT_SECRET is required before storing tenant secrets');
    }
    if (/^[a-f0-9]{64}$/i.test(raw)) return Buffer.from(raw, 'hex');
    const decoded = Buffer.from(raw, 'base64');
    if (decoded.length === 32) return decoded;
    return createHash('sha256').update(raw).digest();
  }

  private firstConfig(...keys: string[]) {
    for (const key of keys) {
      const value = this.config.get<string>(key)?.trim();
      if (value) return value;
    }
    return null;
  }
}
