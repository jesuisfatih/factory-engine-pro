import type React from 'react';

interface QueryStateProps {
  isLoading?: boolean;
  error?: unknown;
  empty?: boolean;
  emptyTitle?: string;
  emptyBody?: string;
  children: React.ReactNode;
}

export function QueryState({ isLoading, error, empty, emptyTitle = 'Nothing here yet', emptyBody, children }: QueryStateProps) {
  if (isLoading) {
    return <div className="state-panel">Loading live workspace data...</div>;
  }
  if (error) {
    const message = error instanceof Error ? error.message : 'Request failed';
    return <div className="state-panel error">{message}</div>;
  }
  if (empty) {
    return (
      <div className="state-panel empty">
        <strong>{emptyTitle}</strong>
        {emptyBody ? <span>{emptyBody}</span> : null}
      </div>
    );
  }
  return <>{children}</>;
}
