import type { PrincipalType } from '@factory-engine-pro/contracts';

export interface PrincipalRecord {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  passwordHash: string | null;
  status: string;
  permissions: string[];
  type: PrincipalType;
}

export function permissionsFromRecords(records: unknown[]) {
  const set = new Set<string>();
  for (const record of records) {
    if (!record || typeof record !== 'object') continue;
    for (const [key, value] of Object.entries(record as Record<string, unknown>)) {
      if (value === true) set.add(key);
    }
  }
  return [...set];
}
