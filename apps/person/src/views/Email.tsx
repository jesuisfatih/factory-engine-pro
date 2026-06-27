import { useQuery } from '@tanstack/react-query';
import { Mail } from 'lucide-react';
import { fetchEmails } from '../api/mock';

export function EmailView() {
  const { data: emails = [] } = useQuery({ queryKey: ['emails'], queryFn: fetchEmails });
  const unread = emails.filter((email) => email.unread).length;

  return (
    <>
      <div className="page-head">
        <h2>E-mail threads</h2>
        <div className="sub">
          <Mail size={11} style={{ verticalAlign: 'text-top', marginRight: 4 }} />
          {emails.length} threads · {unread} unread · syncs from connected mailbox
        </div>
      </div>

      <div className="email-list">
        {emails.map((email) => (
          <div key={email.id} className={`email-row${email.unread ? ' unread' : ''}`}>
            <div>
              <div className="from">{email.from}</div>
              <div className="from-email">{email.fromEmail}</div>
            </div>
            <div>
              <div className="subject">{email.subject}</div>
              <div className="preview">{email.preview}</div>
            </div>
            <div className="when">{email.at}</div>
          </div>
        ))}
      </div>
    </>
  );
}
