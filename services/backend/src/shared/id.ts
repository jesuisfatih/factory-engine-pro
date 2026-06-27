import { createId } from '@paralleldrive/cuid2';

export type IdPrefix = 'ten' | 'tmbr' | 'cust' | 'cusr' | 'csub' | 'mrol' | 'crol' | 'tok' | 'cfg' | 'alog' | 'asgn';

export function prefixedId(prefix: IdPrefix) {
  return `${prefix}_${createId()}`;
}
