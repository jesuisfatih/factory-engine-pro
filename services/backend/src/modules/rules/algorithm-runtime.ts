import type { AlgorithmStrategyDefinition } from '@factory-engine-pro/contracts';

export function algorithmScore(strategy: AlgorithmStrategyDefinition, signals: Record<string, unknown>) {
  let score = numericSignal(signals.urgencyScore);
  for (const [key, weight] of Object.entries(strategy.weights)) {
    score += numericSignal(signals[key]) * weight;
  }
  for (const condition of strategy.conditions) {
    if (algorithmConditionMatches(condition, signals)) score += condition.weight ?? 1;
  }
  return Math.round(score * 10) / 10;
}

export function algorithmVisible(strategy: AlgorithmStrategyDefinition, signals: Record<string, unknown>) {
  if (strategy.visibility.hideWhen.some((condition) => algorithmConditionMatches(condition, signals))) return false;
  if (strategy.visibility.mode === 'hide_by_default') {
    if (!strategy.visibility.showWhen.some((condition) => algorithmConditionMatches(condition, signals))) return false;
  }
  const waitingHours = numericSignal(signals.waitingHours);
  if (strategy.cooldown.reappearAfterHours !== undefined && waitingHours < strategy.cooldown.reappearAfterHours) return false;
  if (strategy.cooldown.archiveAfterDays !== undefined && waitingHours > strategy.cooldown.archiveAfterDays * 24) return false;
  return true;
}

export function algorithmScoreBand(strategy: AlgorithmStrategyDefinition, score: number) {
  return strategy.scoreBands.find((band) => score >= band.min && score <= band.max) ?? null;
}

export function algorithmCompare(
  strategy: AlgorithmStrategyDefinition,
  left: Record<string, unknown>,
  right: Record<string, unknown>,
) {
  const leftScore = algorithmScore(strategy, left);
  const rightScore = algorithmScore(strategy, right);
  const sortRules = strategy.sort.length ? strategy.sort : [{ field: 'urgencyScore', direction: 'desc' as const, nulls: 'last' as const }];
  for (const rule of sortRules) {
    const leftValue = rule.field === 'urgencyScore' ? leftScore : comparableSignal(left[rule.field]);
    const rightValue = rule.field === 'urgencyScore' ? rightScore : comparableSignal(right[rule.field]);
    const compared = compareNullableSignals(leftValue, rightValue, rule.nulls);
    if (compared !== 0) return rule.direction === 'desc' ? -compared : compared;
  }
  return 0;
}

export function algorithmConditionMatches(
  condition: AlgorithmStrategyDefinition['conditions'][number],
  signals: Record<string, unknown>,
) {
  const actual = signals[condition.field];
  const expected = condition.value;
  switch (condition.operator) {
    case 'exists':
      return actual !== undefined && actual !== null && actual !== '';
    case 'not_exists':
      return actual === undefined || actual === null || actual === '';
    case '=':
      return normalizedValues(actual).some((value) => value === normalizeValue(expected));
    case '!=':
      return !normalizedValues(actual).some((value) => value === normalizeValue(expected));
    case '>':
      return numericSignal(actual) > numericSignal(expected);
    case '>=':
      return numericSignal(actual) >= numericSignal(expected);
    case '<':
      return numericSignal(actual) < numericSignal(expected);
    case '<=':
      return numericSignal(actual) <= numericSignal(expected);
    case 'contains':
      return normalizedValues(actual).some((value) => value.includes(normalizeValue(expected)));
    case 'in':
      return Array.isArray(expected) && normalizedValues(actual).some((value) => expected.map(normalizeValue).includes(value));
    case 'not_in':
      return Array.isArray(expected) && normalizedValues(actual).every((value) => !expected.map(normalizeValue).includes(value));
    default:
      return false;
  }
}

function comparableSignal(value: unknown) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const asDate = Date.parse(trimmed);
    if (Number.isFinite(asDate) && /[-:TZ]/.test(trimmed)) return asDate;
    const numeric = Number(trimmed);
    return Number.isFinite(numeric) ? numeric : trimmed.toLowerCase();
  }
  return null;
}

function compareNullableSignals(left: string | number | null, right: string | number | null, nulls: 'first' | 'last') {
  if (left === null && right === null) return 0;
  if (left === null) return nulls === 'first' ? -1 : 1;
  if (right === null) return nulls === 'first' ? 1 : -1;
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return String(left).localeCompare(String(right));
}

function numericSignal(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
    return 1;
  }
  return 0;
}

function normalizedValues(value: unknown) {
  if (Array.isArray(value)) return value.map(normalizeValue);
  return [normalizeValue(value)];
}

function normalizeValue(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}
