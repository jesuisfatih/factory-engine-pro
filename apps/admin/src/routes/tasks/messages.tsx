import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from '@tanstack/react-form';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useTranslation } from 'react-i18next';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, SendHorizonal } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { PageHeader } from '@/components/PageHeader';
import { apiErrorMessage } from '@/lib/api';
import { fetchPersonnelPresence, fetchThread, sendMessage, type PresenceStatus } from '@/lib/live-data';
import { useCan } from '@/lib/permissions';

function presenceLabelKey(status: PresenceStatus) {
  switch (status) {
    case 'online': return 'messages.presence_online';
    case 'busy': return 'messages.presence_busy';
    case 'away': return 'messages.presence_away';
    default: return 'messages.presence_offline';
  }
}

function MessagesView() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const canSend = useCan('messages.send');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const peopleQuery = useQuery({ queryKey: ['messages', 'directory'], queryFn: fetchPersonnelPresence });
  const people = peopleQuery.data ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return people.filter((p) => !q || `${p.name} ${p.email}`.toLowerCase().includes(q));
  }, [people, search]);

  // Auto-pick first online person on first load
  useEffect(() => {
    if (selectedId || people.length === 0) return;
    const firstOnline = people.find((p) => p.status === 'online') ?? people[0];
    setSelectedId(firstOnline.id);
  }, [people, selectedId]);

  const messagesQuery = useQuery({
    queryKey: ['messages', 'thread', selectedId],
    queryFn: () => fetchThread(selectedId!),
    enabled: !!selectedId,
  });
  const messages = messagesQuery.data ?? [];

  const send = useMutation({
    mutationFn: sendMessage,
    onSuccess: () => {
      if (selectedId) void qc.invalidateQueries({ queryKey: ['messages', 'thread', selectedId] });
    },
    onError: (error) => toast.error('Send failed', { description: (error as Error).message }),
  });

  const MsgSchema = z.object({
    text: z.string().min(1, 'Message is empty').max(2000, 'Message too long'),
  });
  const form = useForm({
    defaultValues: { text: '' },
    validators: {
      onChange: ({ value }) => {
        const result = MsgSchema.safeParse(value);
        if (result.success) return undefined;
        return result.error.flatten().fieldErrors;
      },
    },
    onSubmit: async ({ value, formApi }) => {
      if (!selectedId) return;
      await send.mutateAsync({ threadId: selectedId, text: value.text });
      formApi.reset();
    },
  });

  // Virtualized message thread
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 56,
    overscan: 6,
  });

  useEffect(() => {
    if (!scrollRef.current || messages.length === 0) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length]);

  const selectedPerson = people.find((p) => p.id === selectedId) ?? null;
  const onlineCount = people.filter((p) => p.status === 'online').length;

  return (
    <>
      <PageHeader titleI18nKey="messages.title" subtitleI18nKey="messages.subtitle" />

      <div className="msg-shell" id="messages-shell">
        {/* Directory (left) */}
        <aside className="msg-list">
          <div className="msg-list-head">
            <h3 data-i18n-key="messages.directory">{t('messages.directory')}</h3>
            <span className="count">{t('messages.online_now', { count: onlineCount, total: people.length })}</span>
          </div>
          <div className="msg-search">
            <Search size={13} className="icon" />
            <input id="msg-search" value={search} onChange={(event) => setSearch(event.target.value)}
              placeholder={t('messages.search_placeholder')} />
          </div>
          <div className="msg-people" id="msg-people-list">
            {peopleQuery.isLoading && <div className="msg-empty">{t('common.loading')}</div>}
            {peopleQuery.isError && <div className="msg-empty">{apiErrorMessage(peopleQuery.error)}</div>}
            {peopleQuery.isSuccess && filtered.length === 0 && (
              <div className="msg-empty">{t('messages.empty_directory', { defaultValue: 'No live teammates found.' })}</div>
            )}
            {filtered.map((person) => (
              <button key={person.id} id={`msg-person-${person.id}`} type="button"
                className={`msg-person${selectedId === person.id ? ' active' : ''}`}
                onClick={() => setSelectedId(person.id)}>
                <div className="presence-avatar">
                  {person.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}
                  <span className={`presence-dot ${person.status}`} title={t(presenceLabelKey(person.status))} />
                </div>
                <div className="body">
                  <div className="row1">
                    <span className="name">{person.name}</span>
                    <span className="time">{person.lastMessageAt}</span>
                  </div>
                  <div className="preview">{person.lastMessagePreview}</div>
                </div>
                {person.unread > 0 && <span className="unread-badge">{person.unread}</span>}
              </button>
            ))}
          </div>
        </aside>

        {/* Thread (right) */}
        <section className="msg-thread" id="msg-thread">
          {!selectedPerson ? (
            <div className="msg-empty" data-i18n-key="messages.empty_thread">{t('messages.empty_thread')}</div>
          ) : (
            <>
              <header className="msg-thread-head">
                <div className="presence-avatar">
                  {selectedPerson.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}
                  <span className={`presence-dot ${selectedPerson.status}`} />
                </div>
                <div>
                  <div className="name">{selectedPerson.name}</div>
                  <div className="meta">
                    {t(presenceLabelKey(selectedPerson.status))} · {selectedPerson.lastSeen}
                  </div>
                </div>
              </header>

              {/* Compose AT TOP — prominent, easy to reach */}
              <form className="msg-compose top" id="msg-compose"
                onSubmit={(event) => { event.preventDefault(); void form.handleSubmit(); }}>
                <form.Field name="text">
                  {(field) => (
                    <textarea
                      id="msg-compose-input"
                      data-i18n-key="messages.compose_placeholder"
                      placeholder={t('messages.compose_placeholder')}
                      value={field.state.value}
                      onChange={(event) => field.handleChange(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault();
                          void form.handleSubmit();
                        }
                      }}
                      disabled={!canSend}
                      rows={3}
                    />
                  )}
                </form.Field>
                <form.Subscribe selector={(state) => [state.values.text.trim().length > 0, state.isSubmitting] as const}>
                  {([hasText, isSubmitting]) => (
                    <button id="btn-msg-send" type="submit" className="save-btn msg-send-btn"
                      disabled={!canSend || !hasText || isSubmitting}>
                      <SendHorizonal size={15} /> {t('messages.send')}
                    </button>
                  )}
                </form.Subscribe>
              </form>

              <div className="msg-thread-body" id="msg-thread-body" ref={scrollRef}>
                {messagesQuery.isLoading && <div className="msg-empty">{t('common.loading')}</div>}
                {messagesQuery.isError && <div className="msg-empty">{apiErrorMessage(messagesQuery.error)}</div>}
                {messagesQuery.isSuccess && messages.length === 0 && (
                  <div className="msg-empty">{t('messages.empty_messages', { defaultValue: 'No messages in this live thread yet.' })}</div>
                )}
                <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
                  {rowVirtualizer.getVirtualItems().map((virt) => {
                    const message = messages[virt.index];
                    return (
                      <div key={message.id} id={`msg-${message.id}`}
                        style={{ position: 'absolute', top: virt.start, left: 0, right: 0, padding: '4px 0', display: 'flex', flexDirection: 'column', alignItems: message.fromMe ? 'flex-end' : 'flex-start' }}>
                        <div className={`bubble ${message.fromMe ? 'me' : 'other'}`}>{message.text}</div>
                        <div className="bubble-meta">{message.at}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </>
  );
}

export const Route = createFileRoute('/tasks/messages')({ component: MessagesView });
