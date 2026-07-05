import { useState } from 'react';

interface Props {
  followUpTitle: string;
  busy?: boolean;
  errorText?: string | null;
  onCancel: () => void;
  onConfirm: (note: string) => void;
}

export function CompleteTaskDialog({ followUpTitle, busy, errorText, onCancel, onConfirm }: Props) {
  const [note, setNote] = useState('');
  return (
    <div className="confirm-overlay" onClick={onCancel} role="dialog" aria-modal="true" aria-label="Complete follow-up confirmation">
      <div className="confirm-box" onClick={(event) => event.stopPropagation()}>
        <h3>Did you complete this follow-up?</h3>
        <p className="confirm-task-title">{followUpTitle}</p>
        <textarea
          rows={3}
          placeholder="Add a note (optional). It will be saved on this customer follow-up."
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
        {errorText ? <div className="ops-inline-error">{errorText}</div> : null}
        <div className="confirm-actions">
          <button type="button" className="btn" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className="btn primary" onClick={() => onConfirm(note.trim())} disabled={busy}>
            {busy ? 'Saving...' : 'Yes, completed'}
          </button>
        </div>
      </div>
    </div>
  );
}
