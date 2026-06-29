import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquareReply, Plus, Save } from 'lucide-react';
import { fetchNotes, friendlyError, replyNote, saveNote, type NoteRow } from '../api/live';
import { QueryState } from '../components/QueryState';

type Tab = 'all' | 'scratch' | 'queue';

export function NotesView() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [replyBody, setReplyBody] = useState('');

  const { data: notes = [], isLoading, error } = useQuery({ queryKey: ['person', 'notes'], queryFn: fetchNotes });

  const save = useMutation({
    mutationFn: saveNote,
    onSuccess: (note) => {
      qc.invalidateQueries({ queryKey: ['person', 'notes'] });
      setSelectedId(note.id);
    },
  });

  const reply = useMutation({
    mutationFn: (input: { id: string; body: string }) => replyNote(input.id, { body: input.body }),
    onSuccess: (note) => {
      qc.invalidateQueries({ queryKey: ['person', 'notes'] });
      setSelectedId(note.id);
      setReplyBody('');
    },
  });

  const filtered = notes.filter((note) => {
    if (tab !== 'all' && note.kind !== tab) return false;
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return [
      note.title,
      note.body,
      note.linkedCustomer,
      note.linkedQueueId,
      ...(note.replies ?? []).flatMap((item) => [item.body, item.authorName]),
    ].some((value) => String(value ?? '').toLowerCase().includes(query));
  });

  useEffect(() => {
    if (!selectedId && filtered.length > 0) setSelectedId(filtered[0].id);
  }, [filtered, selectedId]);

  const selected = notes.find((note) => note.id === selectedId) ?? null;

  useEffect(() => {
    if (selected) {
      setTitle(selected.title);
      setBody(selected.body);
      setReplyBody('');
    } else {
      setTitle('');
      setBody('');
      setReplyBody('');
    }
  }, [selected?.id]);

  const onSave = () => {
    if (!title.trim()) return;
    save.mutate({
      id: selected?.id,
      kind: selected?.kind ?? 'scratch',
      title: title.trim(),
      body: body.trim(),
      linkedCustomer: selected?.linkedCustomer,
    });
  };

  const onNew = (kind: 'scratch' | 'queue') => {
    save.mutate({ kind, title: 'New note', body: '' });
  };

  return (
    <>
      <div className="page-head">
        <h2>Notes</h2>
        <div className="sub">Scratch (personal) + Queue notes (team-visible, linked to customer/queue item)</div>
      </div>

      <QueryState
        isLoading={isLoading}
        error={error ? new Error(friendlyError(error)) : null}
        empty={false}
      >
      <div className="notes-shell">
        <aside className="notes-list">
          <div className="notes-tabs">
            <button type="button" className={tab === 'all' ? 'active' : ''} onClick={() => setTab('all')}>All</button>
            <button type="button" className={tab === 'scratch' ? 'active' : ''} onClick={() => setTab('scratch')}>Scratch</button>
            <button type="button" className={tab === 'queue' ? 'active' : ''} onClick={() => setTab('queue')}>Queue</button>
          </div>

          <label className="notes-search">
            <span>Search notes</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Customer, body, reply"
            />
          </label>

          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <button type="button"
              style={{ flex: 1, padding: '6px 10px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', color: 'var(--text)', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}
              onClick={() => onNew('scratch')}>
              <Plus size={11} /> Scratch
            </button>
            <button type="button"
              style={{ flex: 1, padding: '6px 10px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', color: 'var(--text)', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}
              onClick={() => onNew('queue')}>
              <Plus size={11} /> Queue
            </button>
          </div>

          {filtered.length === 0 && (
            <div className="state-panel empty">
              <strong>No notes yet</strong>
              <span>Create a scratch or queue note to start a persisted workspace record.</span>
            </div>
          )}

          {filtered.map((note) => (
            <button key={note.id} type="button"
              className={`note-row${selectedId === note.id ? ' active' : ''}`}
              onClick={() => setSelectedId(note.id)}>
              <div className="title">{note.title}</div>
              <div className="meta">
                <span className={`kind-pill ${note.kind}`}>{note.kind}</span>
                <span>{note.updatedAt}</span>
              </div>
            </button>
          ))}
        </aside>

        <section className="note-editor">
          {!selected ? (
            <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--text-faint)', fontSize: 12 }}>
              Select a note or create a new one.
            </div>
          ) : (
            <>
              <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Note title" />
              {selected.linkedCustomer && (
                <div className="linked">
                  Linked to <strong>{selected.linkedCustomer}</strong> - queue item <strong>{selected.linkedQueueId}</strong>
                </div>
              )}
              <textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Note body..." />
              <div className="note-replies">
                <div className="note-replies-head">
                  <strong>Replies</strong>
                  <span>{selected.replies?.length ?? 0}</span>
                </div>
                {(selected.replies ?? []).length === 0 ? (
                  <div className="note-reply-empty">No replies yet.</div>
                ) : (
                  <div className="note-reply-list">
                    {(selected.replies ?? []).map((item) => (
                      <article key={item.id} className="note-reply">
                        <strong>{item.authorName} - {item.authorRole}</strong>
                        <p>{item.body}</p>
                        <span>{item.createdAt}</span>
                      </article>
                    ))}
                  </div>
                )}
                <div className="note-reply-form">
                  <textarea
                    value={replyBody}
                    onChange={(event) => setReplyBody(event.target.value)}
                    placeholder="Write a reply..."
                  />
                  <button
                    type="button"
                    className="save"
                    disabled={!replyBody.trim() || reply.isPending}
                    onClick={() => reply.mutate({ id: selected.id, body: replyBody.trim() })}
                  >
                    <MessageSquareReply size={12} style={{ verticalAlign: 'text-top', marginRight: 4 }} />
                    {reply.isPending ? 'Saving...' : 'Reply'}
                  </button>
                </div>
              </div>
              {reply.isError ? <div className="email-compose-error">{friendlyError(reply.error)}</div> : null}
              <div className="actions">
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {selected.kind === 'queue' ? 'Team-visible - syncs to customer history' : 'Personal - only you can see this'}
                </span>
                <button type="button" className="save" onClick={onSave} disabled={save.isPending}>
                  <Save size={12} style={{ verticalAlign: 'text-top', marginRight: 4 }} />
                  {save.isPending ? 'Saving...' : 'Save'}
                </button>
              </div>
            </>
          )}
        </section>
      </div>
      </QueryState>
    </>
  );
}
