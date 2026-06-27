type IconName =
  | 'queue' | 'customers' | 'ai' | 'mail' | 'training' | 'calendar' | 'notes'
  | 'megaphone' | 'chat' | 'inbox' | 'bell' | 'search' | 'sun' | 'moon'
  | 'logout' | 'sidebar' | 'phone' | 'mail-action' | 'note-action' | 'more';

const PATHS: Record<IconName, JSX.Element> = {
  queue: <><rect x="3" y="4" width="6" height="6" rx="1" /><rect x="3" y="14" width="6" height="6" rx="1" /><rect x="13" y="4" width="8" height="2" rx="1" /><rect x="13" y="9" width="6" height="2" rx="1" /><rect x="13" y="14" width="8" height="2" rx="1" /><rect x="13" y="19" width="6" height="2" rx="1" /></>,
  customers: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 19c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5" /><circle cx="17" cy="9" r="2.5" /><path d="M14 19c0-2.2 1.3-4 3-4s3 1.8 3 4" /></>,
  ai: <><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" /><circle cx="12" cy="12" r="3.5" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  training: <><path d="M4 19V6.5a2.5 2.5 0 0 1 2.5-2.5H20v15.5H6.5A2.5 2.5 0 0 1 4 19Zm0 0a2.5 2.5 0 0 1 2.5-2.5H20" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  notes: <><path d="M4 4h12l4 4v12H4z" /><path d="M16 4v4h4" /><path d="M8 13h8M8 17h5" /></>,
  megaphone: <><path d="m3 11 11-5v12L3 13z" /><path d="M14 8a4 4 0 0 1 0 8" /><path d="M5 14v5h3" /></>,
  chat: <><path d="M21 12a8 8 0 0 1-11.5 7.2L4 21l1.8-5.5A8 8 0 1 1 21 12z" /></>,
  inbox: <><path d="M3 13h5l1.5 3h5L16 13h5" /><path d="M3 13 6 4h12l3 9v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></>,
  bell: <><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z" /><path d="M10 21h4" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.3-4.3" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4l1.4-1.4M17 7l1.4-1.4" /></>,
  moon: <><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></>,
  logout: <><path d="M15 3h5v18h-5" /><path d="M3 12h12" /><path d="m10 7-5 5 5 5" /></>,
  sidebar: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></>,
  phone: <><path d="M5 4h4l2 5-3 2a12 12 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 6a2 2 0 0 1 2-2Z" /></>,
  'mail-action': <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  'note-action': <><path d="M4 4h12l4 4v12H4z" /><path d="M16 4v4h4" /></>,
  more: <><circle cx="6" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="18" cy="12" r="1.5" /></>,
};

interface Props { name: IconName; size?: number; className?: string; }

export function Icon({ name, size = 16, className }: Props) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[name]}
    </svg>
  );
}
