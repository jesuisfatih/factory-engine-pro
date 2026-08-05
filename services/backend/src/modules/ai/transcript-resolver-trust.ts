import {
  TRANSCRIPT_RESOLVER_SCHEMA_VERSION,
  parseStoredTranscriptResolverOutput,
  type TranscriptResolverOutput,
} from '@factory-engine-pro/contracts';

export interface ResolverResultRecord {
  resolverOutput: unknown;
  resolverModel: string | null | undefined;
  resolvedAt: Date | null | undefined;
  resolvedWithVersion: number | null | undefined;
}

export function currentModelResolverOutput(
  row: ResolverResultRecord,
  targetVersion = TRANSCRIPT_RESOLVER_SCHEMA_VERSION,
): TranscriptResolverOutput | null {
  if (!row.resolvedAt
    || !row.resolverModel
    || row.resolverModel === 'local-rule-fallback'
    || (row.resolvedWithVersion ?? 0) < targetVersion) {
    return null;
  }

  const parsed = parseStoredTranscriptResolverOutput(row.resolverOutput);
  if (!parsed.success
    || parsed.migratedFromVersion !== null
    || parsed.data.resolved_with_version < targetVersion) {
    return null;
  }
  return parsed.data;
}
