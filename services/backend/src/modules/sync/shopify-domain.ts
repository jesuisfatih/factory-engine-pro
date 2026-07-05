export function normalizeShopDomain(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .toLowerCase();
}
