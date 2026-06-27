import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Save } from 'lucide-react';
import { fetchNotes, friendlyError, saveNote, type NoteRow } from '../api/live';
import { QueryState } from '../components/QueryState';

type Tab = 'all' | 'scratch' | 'queue';

export function NotesView() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  const { data: notes = [], isLoading, error } = useQuery({ queryKey: ['person', 'notes'], queryFn: fetchNotes });

  const save = useMutation({
    mutationFn: saveNote,
    onSuccess: (note) => {
      qc.invalidateQueries({ queryKey: ['person', 'notes'] });
      setSelectedId(note.id);
    },
  });

  const filtered = notes.filter((note) => tab === 'all' ? true : note.kind === tab);

  useEffect(() => {
    if (!selectedId && filtered.length > 0) setSelectedId(filtered[0].id);
  }, [filtered, selectedId]);

  const selected = notes.find((note) => note.id === selectedId) ?? null;

  useEffect(() => {
    if (selected) {
      setTitle(selected.title);
      setBody(selected.body);
    } else {
      setTitle('');
      setBody('');
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
                  Linked to <strong>{selected.linkedCustomer}</strong> · queue item <strong>{selected.linkedQueueId}</strong>
                </div>
              )}
              <textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Note body…" />
              <div className="actions">
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {selected.kind === 'queue' ? 'Team-visible · syncs to customer history' : 'Personal · only you can see this'}
                </span>
                <button type="button" className="save" onClick={onSave} disabled={save.isPending}>
                  <Save size={12} style={{ verticalAlign: 'text-top', marginRight: 4 }} />
                  {save.isPending ? 'Saving…' : 'Save'}
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
