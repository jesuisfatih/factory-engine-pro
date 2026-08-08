export function boundedPositiveInt(
  value: string | undefined,
  fallback: number,
  bounds: { min: number; max: number },
) {
  const boundedFallback = clamp(fallback, bounds);
  const normalized = value?.trim();
  if (!normalized) return boundedFallback;

  const parsed = Number(normalized);
  if (!Number.isInteger(parsed)) return boundedFallback;
  return clamp(parsed, bounds);
}

function clamp(value: number, bounds: { min: number; max: number }) {
  return Math.min(bounds.max, Math.max(bounds.min, value));
}
