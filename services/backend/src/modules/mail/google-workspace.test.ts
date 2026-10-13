import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGoogleWorkspaceRawMessage, googleOAuthRefreshBody } from './google-workspace.js';

test('builds a Gmail API compatible base64url MIME message', () => {
  const raw = buildGoogleWorkspaceRawMessage({
    fromName: 'DTF Bank',
    senderEmail: 'support@dtfbank.com',
    to: 'buyer@example.com',
    subject: 'Sipariş güncellendi',
    html: '<p>Merhaba <strong>Uğur</strong></p>',
    replyTo: 'help@dtfbank.com',
  });
  assert.match(raw, /^[A-Za-z0-9_-]+$/);
  const mime = Buffer.from(raw, 'base64url').toString('utf8');
  assert.match(mime, /From: "DTF Bank" <support@dtfbank\.com>/);
  assert.match(mime, /To: buyer@example\.com/);
  assert.match(mime, /Reply-To: help@dtfbank\.com/);
  assert.match(mime, /Subject: =\?UTF-8\?B\?/);
  assert.match(mime, /Content-Type: multipart\/alternative/);
});

test('prevents header injection and builds refresh-token form data', () => {
  const raw = buildGoogleWorkspaceRawMessage({
    fromName: 'DTF Bank\r\nBcc: attacker@example.com',
    senderEmail: 'support@dtfbank.com',
    to: 'buyer@example.com\r\nBcc: attacker@example.com',
    subject: 'Hello\r\nBcc: attacker@example.com',
    html: '<p>Hello</p>',
  });
  const mime = Buffer.from(raw, 'base64url').toString('utf8');
  assert.equal((mime.match(/Bcc:/g) ?? []).length, 3);
  assert.equal(mime.includes('\r\nBcc:'), false);

  const body = googleOAuthRefreshBody({ clientId: 'client', clientSecret: 'secret', refreshToken: 'refresh' });
  assert.equal(body.get('grant_type'), 'refresh_token');
  assert.equal(body.get('client_id'), 'client');
});
