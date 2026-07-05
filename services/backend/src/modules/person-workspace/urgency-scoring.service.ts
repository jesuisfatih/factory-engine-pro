import { Injectable } from '@nestjs/common';
import {
  urgencyScoringConfigSchema,
  type PersonUrgencyBreakdown,
  type UrgencyScoringConfig,
} from '@factory-engine-pro/contracts';

export interface UrgencyScoreInput {
  priority: string;
  source: string;
  axis?: string | null;
  createdAt: Date;
  updatedAt: Date;
  metadata: unknown;
  taskStateSnapshot: unknown;
  segmentPriority?: number | null;
  repeatCount: number;
  now?: Date;
}

@Injectable()
export class UrgencyScoringService {
  configFrom(value: unknown): UrgencyScoringConfig {
    const parsed = urgencyScoringConfigSchema.safeParse(asRecord(value));
    return parsed.success ? parsed.data : urgencyScoringConfigSchema.parse({});
  }

  score(input: UrgencyScoreInput, config: UrgencyScoringConfig): PersonUrgencyBreakdown {
    const metadata = asRecord(input.metadata);
    const snapshot = asRecord(input.taskStateSnapshot);
    const workflow = asRecord(metadata.workflow);
    const params = asRecord(workflow.params);
    const resolverOutput = asRecord(snapshot.resolverOutput ?? snapshot.resolver_output);
    const intent = normalizeKey(
      stringValue(params.intent)
        ?? stringValue(params.callIntent)
        ?? stringValue(params.taskIntent)
        ?? stringValue(resolverOutput.call_intent)
        ?? stringValue(resolverOutput.intent)
        ?? input.axis
        ?? input.source,
    );
    const signalUrgency = normalizeKey(
      stringValue(params.signalUrgency)
        ?? stringValue(params.aiUrgency)
        ?? stringValue(params.urgency)
        ?? stringValue(params.urgencyLevel)
        ?? stringValue(resolverOutput.urgency)
        ?? stringValue(resolverOutput.ai_urgency)
        ?? stringValue(resolverOutput.urgency_level),
    );
    const segmentScore = Math.max(0, numberValue(input.segmentPriority) ?? segmentPriorityFromSnapshot(snapshot));
    const repeatCount = Math.max(0, input.repeatCount);
    const intentScore = intent ? scoreFromRecord(config.intentScores, intent) : 0;
    const signalUrgencyScore = signalUrgency ? scoreFromRecord(config.signalUrgencyScores, signalUrgency) : 0;
    const waitHours = waitingHours(input.createdAt, input.now ?? new Date());
    const score = round1(
      segmentScore * config.segmentWeight
        + repeatCount * config.repeatCountWeight
        + intentScore * config.intentWeight
        + signalUrgencyScore * config.signalUrgencyWeight
        + waitHours * config.waitingHoursWeight,
    );

    return {
      score,
      segmentScore,
      repeatCount,
      intent,
      intentScore,
      signalUrgency,
      signalUrgencyScore,
      waitingHours: waitHours,
      weights: config,
    };
  }
}

export function priorityRankFromUrgency(score: number) {
  if (score >= 80) return 9;
  if (score >= 50) return 7;
  if (score >= 25) return 5;
  return 3;
}

function segmentPriorityFromSnapshot(snapshot: Record<string, unknown>) {
  const segment = asRecord(snapshot.segment);
  const segments = Array.isArray(snapshot.segments) ? snapshot.segments.map(asRecord) : [];
  const candidates = [segment, ...segments].flatMap((entry) => [
    numberValue(entry.priorityGlobal),
    numberValue(entry.priority_global),
    numberValue(entry.priority),
  ]);
  return Math.max(0, ...candidates.filter((value): value is number => value !== null));
}

function scoreFromRecord(record: Record<string, number>, key: string) {
  if (record[key] !== undefined) return Number(record[key]);
  const loose = Object.entries(record).find(([entry]) => normalizeKey(entry) === key);
  return loose ? Number(loose[1]) : 0;
}

function waitingHours(createdAt: Date, now: Date) {
  return round1(Math.max(0, now.getTime() - createdAt.getTime()) / 3_600_000);
}

function normalizeKey(value: unknown) {
  const raw = stringValue(value);
  return raw ? raw.trim().toLowerCase().replace(/[\s.-]+/g, '_') : null;
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown) {
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(number) ? number : null;
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}
