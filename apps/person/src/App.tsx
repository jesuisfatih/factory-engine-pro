import { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { CallQueueView } from './views/CallQueue';
import { CustomersView } from './views/Customers';
import { MessagesView } from './views/Messages';
import { CalendarView } from './views/Calendar';
import { NotesView } from './views/Notes';
import { EmailView } from './views/Email';
import { AnnouncementsView } from './views/Announcements';
import { NotificationsView } from './views/Notifications';
import { StubView } from './views/Stub';
import { LoginView } from './views/auth/LoginView';
import { ForgotPasswordView } from './views/auth/ForgotPasswordView';
import { ResetPasswordView } from './views/auth/ResetPasswordView';
import { readSession } from './lib/api';
import { NAV, type NavId } from './types';

const TITLES: Record<NavId, string> = {
  queue: 'Call Queue',
  customers: 'Customers',
  email: 'E-mail',
  training: 'Training',
  calendar: 'Calendar',
  notes: 'Notes',
  announcements: 'Announcements',
  messaging: 'Messaging',
  requests: 'Submit Request',
  notifications: 'Notifications',
};

const STUB_COPY: Record<string, { title: string; description: string }> = {
  email: { title: 'E-mail threads', description: 'Live IMAP sync ile gelen iş kutusu burada görünecek. Yanıt drafting + signature templates + linked customer card.' },
  training: { title: 'Training & playbooks', description: 'Senior reps tarafından assign edilen training cards + call scripts. Tamamlanma oranı leaderboard\'a yansır.' },
  calendar: { title: 'Calendar', description: 'Tüm reminder\'lar + scheduled callbacks + meet links tek görünüm. Drag-resize ile süre değişir.' },
  notes: { title: 'Notes', description: 'Scratch notes (personal, kimseyle paylaşılmaz) + Queue notes (team-visible) ayrı tabs.' },
  announcements: { title: 'Announcements', description: 'Yönetimden gelen broadcast mesajlar. Okundu bildirimi + linked playbook.' },
  messaging: { title: 'Internal messaging', description: 'Rep ↔ admin chat, customer card mention\'ları (@Cynthia), reaction\'lar.' },
  requests: { title: 'Submit a request', description: 'PTO, equipment, exception ticket\'ları. Statü + onay zinciri görünür.' },
  notifications: { title: 'Notifications', description: 'Pin\'lendi, atandı, mention\'landı, SR breach. Filter + okundu işaretle.' },
};

type AuthScreen = 'login' | 'forgot' | 'reset';

export default function App() {
  const [authed, setAuthed] = useState(() => Boolean(readSession()?.accessToken));
  const [authScreen, setAuthScreen] = useState<AuthScreen>(initialAuthScreen);
  const [current, setCurrent] = useState<NavId>('queue');
  const [collapsed, setCollapsed] = useState(false);
  const title = TITLES[current];

  void NAV;

  if (!authed) {
    return (
      <div className="auth-shell">
        {authScreen === 'login' && (
          <LoginView
            onSuccess={() => setAuthed(true)}
            onForgot={() => showAuthScreen('forgot', setAuthScreen)}
          />
        )}
        {authScreen === 'forgot' && <ForgotPasswordView onBackToLogin={() => showAuthScreen('login', setAuthScreen)} />}
        {authScreen === 'reset' && <ResetPasswordView onBackToLogin={() => showAuthScreen('login', setAuthScreen)} />}
      </div>
    );
  }

  const renderView = () => {
    switch (current) {
      case 'queue': return <CallQueueView />;
      case 'customers': return <CustomersView />;
      case 'messaging': return <MessagesView />;
      case 'calendar': return <CalendarView />;
      case 'notes': return <NotesView />;
      case 'email': return <EmailView />;
      case 'announcements': return <AnnouncementsView />;
      case 'notifications': return <NotificationsView />;
      default: {
        const copy = STUB_COPY[current] ?? { title, description: 'Yakında.' };
        return <StubView title={copy.title} description={copy.description} />;
      }
    }
  };

  return (
    <div className={`layout${collapsed ? ' collapsed' : ''}`}>
      <Sidebar current={current} onSelect={setCurrent} collapsed={collapsed} />
      <div className="main">
        <Topbar title={title} onToggleSidebar={() => setCollapsed((v) => !v)} />
        <div className="content">{renderView()}</div>
      </div>
    </div>
  );
}

function initialAuthScreen(): AuthScreen {
  if (window.location.pathname.endsWith('/forgot-password')) return 'forgot';
  if (window.location.pathname.endsWith('/reset-password')) return 'reset';
  return 'login';
}

function showAuthScreen(screen: AuthScreen, setAuthScreen: (screen: AuthScreen) => void) {
  const basePath = '/staff';
  const path = screen === 'login' ? `${basePath}/login` : `${basePath}/${screen === 'forgot' ? 'forgot-password' : 'reset-password'}`;
  window.history.pushState(null, '', path);
  setAuthScreen(screen);
}
