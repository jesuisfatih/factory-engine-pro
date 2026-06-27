import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SendHorizonal } from 'lucide-react';
import { createStaffRequest, fetchRequests, friendlyError } from '../api/live';
import { QueryState } from '../components/QueryState';

export function RequestsView() {
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<'pto' | 'equipment' | 'exception' | 'access' | 'other'>('other');
  const [priority, setPriority] = useState<'critical' | 'urgent' | 'high' | 'medium' | 'low'>('medium');
  const { data: rows = [], isLoading, error } = useQuery({ queryKey: ['person', 'requests'], queryFn: fetchRequests });
  const create = useMutation({
    mutationFn: createStaffRequest,
    onSuccess: () => {
      setTitle('');
      setDescription('');
      setCategory('other');
      setPriority('medium');
      qc.invalidateQueries({ queryKey: ['person', 'requests'] });
    },
  });

  return (
    <>
      <div className="page-head">
        <h2>Submit Request</h2>
        <div className="sub">PTO, equipment, access and exception requests create internal service requests.</div>
      </div>

      <div className="request-grid">
        <form
          className="data-card request-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!title.trim() || !description.trim()) return;
            create.mutate({ title, description, category, priority });
          }}
        >
          <label>
            <span>Title</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What do you need?" />
          </label>
          <label>
            <span>Category</span>
            <select value={category} onChange={(event) => setCategory(event.target.value as typeof category)}>
              <option value="other">Other</option>
              <option value="pto">PTO</option>
              <option value="equipment">Equipment</option>
              <option value="exception">Exception</option>
              <option value="access">Access</option>
            </select>
          </label>
          <label>
            <span>Priority</span>
            <select value={priority} onChange={(event) => setPriority(event.target.value as typeof priority)}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
              <option value="critical">Critical</option>
            </select>
          </label>
          <label className="wide">
            <span>Description</span>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={7} placeholder="Add the details needed for approval." />
          </label>
          {create.error ? <div className="state-panel error">{friendlyError(create.error)}</div> : null}
          <button type="submit" className="save" disabled={!title.trim() || !description.trim() || create.isPending}>
            <SendHorizonal size={13} /> {create.isPending ? 'Submitting...' : 'Submit request'}
          </button>
        </form>

        <QueryState
          isLoading={isLoading}
          error={error ? new Error(friendlyError(error)) : null}
          empty={rows.length === 0}
          emptyTitle="No submitted requests"
          emptyBody="Use the form to create your first live internal request."
        >
          <div className="email-list">
            {rows.map((row) => (
              <div key={row.id} className="email-row">
                <div>
                  <div className="from">{row.category}</div>
                  <div className="from-email">{row.priority}</div>
                </div>
                <div>
                  <div className="subject">{row.title}</div>
                  <div className="preview">{row.description}</div>
                </div>
                <div className="when">{row.status}<br />{row.updatedAt}</div>
              </div>
            ))}
          </div>
        </QueryState>
      </div>
    </>
  );
}
