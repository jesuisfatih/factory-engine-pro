export function dtfBankRoutineCallCenterDeactivated() {
  if (typeof window === 'undefined') return false;
  return window.location.hostname.toLowerCase() === 'app.dtfbank.com';
}
