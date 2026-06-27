import type { ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api';

export function LoadingState({ title = 'Loading', body = 'Fetching live data from the API.' }: { title?: string; body?: string }) {
  return <div className="preview-empty"><div className="title">{title}</div><div className="note">{body}</div></div>;
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return <div className="preview-empty"><div className="title">{title}</div><div className="note">{body}</div>{action ? <div style={{ marginTop: 14 }}>{action}</div> : null}</div>;
}

export function ErrorState({ title = 'Could not load data', error, retry }: { title?: string; error: unknown; retry: () => void }) {
  return (
    <div className="preview-empty">
      <AlertTriangle className="ico" size={24} />
      <div className="title">{title}</div>
      <div className="note">{apiErrorMessage(error)}</div>
      <button className="btn" type="button" onClick={retry} style={{ marginTop: 14 }}><RefreshCw size={14} /> Retry</button>
    </div>
  );
}
