import { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { AnnouncementsView } from './views/Announcements';
import { CalendarView } from './views/Calendar';
import { CallQueueView } from './views/CallQueue';
import { CustomersView } from './views/Customers';
import { EmailView } from './views/Email';
import { MessagesView } from './views/Messages';
import { NotesView } from './views/Notes';
import { NotificationsView } from './views/Notifications';
import { RequestsView } from './views/Requests';
import { TrainingView } from './views/Training';
import { ForgotPasswordView } from './views/auth/ForgotPasswordView';
import { LoginView } from './views/auth/LoginView';
import { ResetPasswordView } from './views/auth/ResetPasswordView';
import { readSession } from './lib/api';
import { type NavId } from './types';

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

type AuthScreen = 'login' | 'forgot' | 'reset';

export default function App() {
  const [authed, setAuthed] = useState(() => Boolean(readSession()?.accessToken));
  const [authScreen, setAuthScreen] = useState<AuthScreen>(initialAuthScreen);
  const [current, setCurrent] = useState<NavId>('queue');
  const [collapsed, setCollapsed] = useState(false);
  const title = TITLES[current];

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
      case 'training': return <TrainingView />;
      case 'requests': return <RequestsView />;
      default: return <CallQueueView />;
    }
  };

  return (
    <div className={`layout${collapsed ? ' collapsed' : ''}`}>
      <Sidebar current={current} onSelect={setCurrent} collapsed={collapsed} />
      <div className="main">
        <Topbar title={title} onToggleSidebar={() => setCollapsed((value) => !value)} />
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
