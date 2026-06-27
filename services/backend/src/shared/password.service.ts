import { BadRequestException, Injectable } from '@nestjs/common';
import { pbkdf2, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const pbkdf2Async = promisify(pbkdf2);
const ITERATIONS = 210_000;
const KEY_LENGTH = 64;
const DIGEST = 'sha512';

@Injectable()
export class PasswordService {
  async hash(password: string) {
    const salt = randomBytes(24).toString('base64url');
    const derived = await pbkdf2Async(password, salt, ITERATIONS, KEY_LENGTH, DIGEST);
    return `pbkdf2$${DIGEST}$${ITERATIONS}$${salt}$${derived.toString('base64url')}`;
  }

  async verify(password: string, storedHash: string | null | undefined) {
    if (!storedHash) return false;
    const [scheme, digest, iterationsRaw, salt, hashRaw] = storedHash.split('$');
    if (scheme !== 'pbkdf2' || !digest || !iterationsRaw || !salt || !hashRaw) {
      throw new BadRequestException('Stored password hash is invalid');
    }
    const expected = Buffer.from(hashRaw, 'base64url');
    const actual = await pbkdf2Async(password, salt, Number(iterationsRaw), expected.length, digest);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }
}
