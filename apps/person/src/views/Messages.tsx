import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, SendHorizonal } from 'lucide-react';
import { fetchTeammates, fetchThread, friendlyError, sendChatMessage, type PresenceStatus } from '../api/live';
import { QueryState } from '../components/QueryState';

function presenceLabel(status: PresenceStatus) {
  return status === 'online' ? 'Online'
    : status === 'busy' ? 'Busy'
      : status === 'away' ? 'Away'
        : 'Offline';
}

export function MessagesView() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: people = [], isLoading, error } = useQuery({ queryKey: ['person', 'msg', 'people'], queryFn: fetchTeammates });
  const { data: thread = [], error: threadError } = useQuery({
    queryKey: ['msg', 'thread', selectedId],
    queryFn: () => fetchThread(selectedId!),
    enabled: !!selectedId,
  });

  const send = useMutation({
    mutationFn: sendChatMessage,
    onSuccess: () => {
      if (selectedId) qc.invalidateQueries({ queryKey: ['msg', 'thread', selectedId] });
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return people.filter((p) => !q || `${p.name} ${p.email}`.toLowerCase().includes(q));
  }, [people, search]);

  useEffect(() => {
    if (!selectedId && people.length > 0) {
      const first = people.find((p) => p.status === 'online') ?? people[0];
      setSelectedId(first.id);
    }
  }, [people, selectedId]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [thread.length]);

  const selected = people.find((p) => p.id === selectedId) ?? null;
  const onlineCount = people.filter((p) => p.status === 'online').length;

  const onSend = () => {
    if (!selectedId || !text.trim()) return;
    send.mutate({ threadId: selectedId, text });
    setText('');
  };

  return (
    <>
      <div className="page-head">
        <h2>Messages</h2>
        <div className="sub">Internal chat with teammates - see who is online right now</div>
      </div>

      <QueryState
        isLoading={isLoading}
        error={(error || threadError) ? new Error(friendlyError(error || threadError)) : null}
        empty={people.length === 0}
        emptyTitle="No active teammates"
        emptyBody="Active members appear here after they are invited and accept access."
      >
      <div className="msg-shell">
        <aside className="msg-list">
          <div className="msg-list-head">
            <h3>Directory</h3>
            <span className="count">{onlineCount} online - {people.length} total</span>
          </div>
          <div className="msg-search">
            <Search size={13} className="icon" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search teammates..." />
          </div>
          <div className="msg-people">
            {filtered.map((person) => (
              <button key={person.id} type="button"
                className={`msg-person${selectedId === person.id ? ' active' : ''}`}
                onClick={() => setSelectedId(person.id)}>
                <div className="presence-avatar">
                  {person.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}
                  <span className={`presence-dot ${person.status}`} title={presenceLabel(person.status)} />
                </div>
                <div className="body">
                  <div className="row1">
                    <span className="name">{person.name}</span>
                    <span className="time">{person.lastAt}</span>
                  </div>
                  <div className="preview">{person.preview}</div>
                </div>
                {person.unread > 0 && <span className="unread-badge">{person.unread}</span>}
              </button>
            ))}
          </div>
        </aside>

        <section className="msg-thread">
          {!selected ? (
            <div className="msg-empty">Select a teammate to start chatting.</div>
          ) : (
            <>
              <header className="msg-thread-head">
                <div className="presence-avatar">
                  {selected.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}
                  <span className={`presence-dot ${selected.status}`} />
                </div>
                <div>
                  <div className="name">{selected.name}</div>
                  <div className="meta">{presenceLabel(selected.status)} - {selected.lastSeen}</div>
                </div>
              </header>

              <form className="msg-compose-top"
                onSubmit={(event) => { event.preventDefault(); onSend(); }}>
                <textarea
                  value={text} onChange={(event) => setText(event.target.value)}
                  placeholder="Type a message... (Enter to send, Shift+Enter newline)"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      onSend();
                    }
                  }}
                  rows={3} />
                <button type="submit" className="msg-send-btn" disabled={!text.trim() || send.isPending}>
                  <SendHorizonal size={14} /> Send
                </button>
              </form>

              <div className="msg-thread-body" ref={scrollRef}>
                {thread.length === 0 ? (
                  <div className="msg-thread-empty">
                    <strong>No messages in this thread yet</strong>
                    <span>Send the first internal note to create a live conversation record.</span>
                  </div>
                ) : (
                  thread.map((message) => (
                    <div key={message.id} style={{ display: 'flex', flexDirection: 'column', alignItems: message.fromMe ? 'flex-end' : 'flex-start' }}>
                      <div className={`bubble ${message.fromMe ? 'me' : 'other'}`}>{message.text}</div>
                      <div className="bubble-meta">{message.at}</div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </section>
      </div>
      </QueryState>
    </>
  );
}
