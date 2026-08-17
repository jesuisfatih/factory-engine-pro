import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export interface StorefrontCartItem {
  id: string;
  quantity: number;
  properties: Record<string, string>;
}

export function hashStorefrontReorderToken(token: string) {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function verifyShopifyAppProxySignature(query: Record<string, unknown>, secret: string) {
  const signature = text(query.signature);
  if (!signature || !secret) return false;
  const message = Object.keys(query)
    .filter((key) => key !== 'signature')
    .sort()
    .map((key) => `${key}=${queryValue(query[key])}`)
    .join('');
  const expected = createHmac('sha256', secret).update(message, 'utf8').digest('hex');
  const actualBuffer = Buffer.from(signature, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function shopifyVariantNumericId(value: string | null | undefined) {
  const raw = text(value);
  if (/^\d+$/.test(raw)) return raw;
  return raw.match(/\/ProductVariant\/(\d+)$/i)?.[1] ?? null;
}

export function storefrontLineProperties(properties: unknown, designFiles: unknown) {
  const result: Record<string, string> = {};
  if (Array.isArray(properties)) {
    for (const entry of properties) {
      const record = asRecord(entry);
      const name = text(record?.name ?? record?.key);
      const value = text(record?.value);
      if (name && value) result[name] = value;
    }
  }
  if (Array.isArray(designFiles)) {
    let fallbackIndex = 0;
    for (const entry of designFiles) {
      const record = asRecord(entry);
      const url = text(record?.url ?? record?.previewUrl ?? record?.downloadUrl);
      if (!url || Object.values(result).includes(url)) continue;
      fallbackIndex += 1;
      const name = text(record?.name) || `Design file ${fallbackIndex}`;
      result[name] = url;
    }
  }
  return result;
}

export function renderStorefrontCartTransfer(items: StorefrontCartItem[]) {
  const safeItems = JSON.stringify(items).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>Preparing your cart</title>
  <style>
    :root{color-scheme:light;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    *{box-sizing:border-box}body{min-height:100vh;margin:0;display:grid;place-items:center;padding:24px;background:linear-gradient(145deg,#f4f7fb,#fff);color:#172033}
    main{width:min(440px,100%);padding:34px;border:1px solid #dfe6ef;border-radius:18px;background:rgba(255,255,255,.96);box-shadow:0 24px 70px rgba(15,23,42,.12);text-align:center}
    .ring{width:44px;height:44px;margin:0 auto 18px;border:4px solid #dce6fb;border-top-color:#2c63e8;border-radius:50%;animation:spin .75s linear infinite}h1{margin:0;font-size:21px}p{margin:9px 0 0;color:#667085;font-size:14px;line-height:1.55}
    .error{display:none}.error a{display:inline-flex;margin-top:18px;padding:10px 16px;border-radius:9px;background:#172033;color:#fff;text-decoration:none;font-weight:700}@keyframes spin{to{transform:rotate(360deg)}}
  </style>
</head>
<body>
  <main>
    <div id="loading"><div class="ring" aria-hidden="true"></div><h1>Preparing your Shopify cart</h1><p>Your selected items and order options are being carried over securely.</p></div>
    <div id="error" class="error"><h1>We couldn't prepare the cart</h1><p id="message">Please return to your account and try the reorder again.</p><a href="/cart">Open cart</a></div>
  </main>
  <script>
    const items=${safeItems};
    fetch('/cart/add.js',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},credentials:'same-origin',body:JSON.stringify({items})})
      .then(async(response)=>{if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(body.description||body.message||'One or more items are unavailable.')}window.location.replace('/cart');})
      .catch((error)=>{document.getElementById('loading').style.display='none';document.getElementById('error').style.display='block';document.getElementById('message').textContent=error instanceof Error?error.message:'Please return to your account and try the reorder again.';});
  </script>
</body>
</html>`;
}

function queryValue(value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => text(item)).join(',');
  return text(value);
}

function text(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function asRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
