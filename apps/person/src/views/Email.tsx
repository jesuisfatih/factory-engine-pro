import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit3, Mail, Save, Send, X } from 'lucide-react';
import { fetchEmails, friendlyError, saveEmailDraft } from '../api/live';
import { QueryState } from '../components/QueryState';

export function EmailView() {
  const queryClient = useQueryClient();
  const { data: emails = [], isLoading, error } = useQuery({ queryKey: ['person', 'emails'], queryFn: fetchEmails });
  const unread = emails.filter((email) => email.unread).length;
  const drafts = emails.filter((email) => email.status === 'draft').length;
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState(() => emptyDraft());
  const [draftError, setDraftError] = useState<string | null>(null);
  const canSave = draft.to.trim().length > 0 && draft.subject.trim().length > 0 && draft.body.trim().length > 0;
  const draftMutation = useMutation({
    mutationFn: saveEmailDraft,
    onSuccess: async () => {
      setDraft(emptyDraft());
      setDraftError(null);
      setComposing(false);
      await queryClient.invalidateQueries({ queryKey: ['person', 'emails'] });
    },
    onError: (mutationError) => setDraftError(friendlyError(mutationError)),
  });

  function submitDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave || draftMutation.isPending) return;
    setDraftError(null);
    draftMutation.mutate({
      to: draft.to,
      subject: draft.subject,
      body: draft.body,
    });
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2>E-mail threads</h2>
          <div className="sub">
            <Mail size={11} style={{ verticalAlign: 'text-top', marginRight: 4 }} />
            {emails.length} threads - {drafts} drafts - {unread} unread
          </div>
        </div>
        <button type="button" className="email-compose-toggle" onClick={() => setComposing((value) => !value)}>
          {composing ? <X size={14} /> : <Edit3 size={14} />}
          <span>{composing ? 'Close' : 'Compose'}</span>
        </button>
      </div>

      {composing ? (
        <form className="email-compose-panel" onSubmit={submitDraft}>
          <div className="email-compose-grid">
            <label>
              <span>To</span>
              <input
                type="email"
                value={draft.to}
                onChange={(event) => setDraft((current) => ({ ...current, to: event.target.value }))}
                autoComplete="email"
                required
              />
            </label>
            <label>
              <span>Subject</span>
              <input
                value={draft.subject}
                onChange={(event) => setDraft((current) => ({ ...current, subject: event.target.value }))}
                maxLength={240}
                required
              />
            </label>
            <label className="wide">
              <span>Body</span>
              <textarea
                value={draft.body}
                onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))}
                maxLength={12000}
                required
              />
            </label>
          </div>
          {draftError ? <div className="email-compose-error">{draftError}</div> : null}
          <div className="email-compose-actions">
            <button type="button" className="email-send-disabled" disabled title="Send disabled">
              <Send size={14} />
              <span>Send</span>
            </button>
            <button type="submit" className="email-save-draft" disabled={!canSave || draftMutation.isPending}>
              <Save size={14} />
              <span>{draftMutation.isPending ? 'Saving' : 'Save draft'}</span>
            </button>
          </div>
        </form>
      ) : null}

      <QueryState
        isLoading={isLoading}
        error={error ? new Error(friendlyError(error)) : null}
        empty={emails.length === 0}
        emptyTitle="No mail delivery records"
        emptyBody="No staff email drafts or delivery rows are available for this workspace."
      >
      <div className="email-list">
        {emails.map((email) => (
          <div key={email.id} className={`email-row${email.unread ? ' unread' : ''}${email.status === 'draft' ? ' draft' : ''}`}>
            <div>
              <div className="from">{email.from}</div>
              <div className="from-email">{email.fromEmail}</div>
            </div>
            <div>
              <div className="subject">
                {email.subject}
                {email.status === 'draft' ? <span className="email-status">Draft</span> : null}
              </div>
              <div className="preview">{email.preview}</div>
            </div>
            <div className="when">{email.at}</div>
          </div>
        ))}
      </div>
      </QueryState>
    </>
  );
}

function emptyDraft() {
  return { to: '', subject: '', body: '' };
}
