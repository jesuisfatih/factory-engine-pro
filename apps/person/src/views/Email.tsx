import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit3, Mail, Save, Send, X } from 'lucide-react';
import { fetchEmailContacts, fetchEmails, friendlyError, saveEmailDraft, sendEmail } from '../api/live';
import { QueryState } from '../components/QueryState';
import { personSafeText } from '../lib/personTerminology';

export function EmailView() {
  const queryClient = useQueryClient();
  const { data: emails = [], isLoading, error } = useQuery({ queryKey: ['person', 'emails'], queryFn: fetchEmails });
  const { data: contacts = [] } = useQuery({ queryKey: ['person', 'emails', 'contacts'], queryFn: fetchEmailContacts });
  const unread = emails.filter((email) => email.unread).length;
  const drafts = emails.filter((email) => email.status === 'draft').length;
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState(() => emptyDraft());
  const [draftError, setDraftError] = useState<string | null>(null);
  const [contactPickerOpen, setContactPickerOpen] = useState(false);
  const filteredContacts = useMemo(() => {
    const query = draft.to.trim().toLowerCase();
    const source = query ? contacts.filter((contact) => contactMatches(contact, query)) : contacts;
    return source.slice(0, 8);
  }, [contacts, draft.to]);
  const canSubmit = draft.to.trim().length > 0 && draft.subject.trim().length > 0 && draft.body.trim().length > 0;
  const resetComposer = async () => {
    setDraft(emptyDraft());
    setDraftError(null);
    setComposing(false);
    await queryClient.invalidateQueries({ queryKey: ['person', 'emails'] });
  };
  const draftMutation = useMutation({
    mutationFn: saveEmailDraft,
    onSuccess: resetComposer,
    onError: (mutationError) => setDraftError(friendlyError(mutationError)),
  });
  const sendMutation = useMutation({
    mutationFn: sendEmail,
    onSuccess: resetComposer,
    onError: (mutationError) => setDraftError(friendlyError(mutationError)),
  });
  const isSubmitting = draftMutation.isPending || sendMutation.isPending;

  function submitDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || isSubmitting) return;
    setDraftError(null);
    draftMutation.mutate({
      to: draft.to,
      subject: draft.subject,
      body: draft.body,
    });
  }

  function sendNow() {
    if (!canSubmit || isSubmitting) return;
    setDraftError(null);
    sendMutation.mutate({
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
              <div className="email-contact-picker">
                <input
                  type="email"
                  value={draft.to}
                  onChange={(event) => {
                    setDraft((current) => ({ ...current, to: event.target.value }));
                    setContactPickerOpen(true);
                  }}
                  onFocus={() => setContactPickerOpen(true)}
                  onBlur={() => window.setTimeout(() => setContactPickerOpen(false), 120)}
                  autoComplete="off"
                  required
                />
                {contactPickerOpen && filteredContacts.length > 0 ? (
                  <div className="email-contact-menu" role="listbox" aria-label="Customer email suggestions">
                    {filteredContacts.map((contact) => (
                      <button
                        key={`${contact.source}-${contact.id}`}
                        type="button"
                        role="option"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          setDraft((current) => ({ ...current, to: contact.email }));
                          setContactPickerOpen(false);
                        }}
                      >
                        <strong>{personSafeText(contact.name)}</strong>
                        <span>{contact.email}</span>
                        <em>{contactLabel(contact)}</em>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              {contacts.length > 0 ? (
                <div className="email-contact-quick">
                  {contacts.slice(0, 8).map((contact) => (
                    <button
                      key={`${contact.source}-quick-${contact.id}`}
                      type="button"
                      onClick={() => setDraft((current) => ({ ...current, to: contact.email }))}
                    >
                      {personSafeText(contact.name)}
                    </button>
                  ))}
                </div>
              ) : null}
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
            <button type="button" className="email-send-now" disabled={!canSubmit || isSubmitting} onClick={sendNow}>
              <Send size={14} />
              <span>{sendMutation.isPending ? 'Sending' : 'Send'}</span>
            </button>
            <button type="submit" className="email-save-draft" disabled={!canSubmit || isSubmitting}>
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
              <div className="from">{personSafeText(email.from)}</div>
              <div className="from-email">{email.fromEmail}</div>
            </div>
            <div>
              <div className="subject">
                {personSafeText(email.subject)}
                {email.status === 'draft' ? <span className="email-status">Draft</span> : null}
              </div>
              <div className="preview">{personSafeText(email.preview)}</div>
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

function contactLabel(contact: { name: string; phone: string | null; source: string }) {
  return [personSafeText(contact.name), contact.phone, contact.source === 'customer' ? 'customer' : 'recent mail'].filter(Boolean).join(' - ');
}

function contactMatches(contact: { name: string; email: string; phone: string | null; source: string }, query: string) {
  return contact.name.toLowerCase().includes(query)
    || contact.email.toLowerCase().includes(query)
    || String(contact.phone ?? '').toLowerCase().includes(query)
    || contact.source.toLowerCase().includes(query);
}
