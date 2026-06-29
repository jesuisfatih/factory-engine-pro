import { useEffect, useState } from 'react';
import { memberSurfaceFromPermissions } from '@factory-engine-pro/contracts';
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
import { PERSON_SESSION_CHANGED_EVENT, handOffToAdmin, readAdminSession, readSession } from './lib/api';
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
  const initialPersonSession = readSession();
  const initialAdminSession = readAdminSession();
  const personSurface = initialPersonSession ? memberSurfaceFromPermissions(initialPersonSession.principal.permissions) : null;
  const adminSurface = initialAdminSession ? memberSurfaceFromPermissions(initialAdminSession.principal.permissions) : null;
  const shouldHandOffToAdmin = personSurface === 'admin' || (!initialPersonSession && adminSurface === 'admin');
  const [authed, setAuthed] = useState(() => Boolean(initialPersonSession?.accessToken) && personSurface === 'person');
  const [authScreen, setAuthScreen] = useState<AuthScreen>(initialAuthScreen);
  const [current, setCurrent] = useState<NavId>(initialNav);
  const [collapsed, setCollapsed] = useState(false);
  const title = TITLES[current];

  useEffect(() => {
    if (personSurface === 'admin' && initialPersonSession) {
      handOffToAdmin(initialPersonSession);
      return;
    }
    if (!initialPersonSession && adminSurface === 'admin' && initialAdminSession) {
      window.location.assign('/dashboard');
    }
  }, [adminSurface, initialAdminSession, initialPersonSession, personSurface]);

  useEffect(() => {
    const onPopState = () => setCurrent(initialNav());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    const onSessionChanged = () => setAuthed(Boolean(readSession()?.accessToken));
    window.addEventListener(PERSON_SESSION_CHANGED_EVENT, onSessionChanged);
    return () => window.removeEventListener(PERSON_SESSION_CHANGED_EVENT, onSessionChanged);
  }, []);

  useEffect(() => {
    if (authed && isStaffAuthPath(window.location.pathname)) {
      window.history.replaceState(null, '', '/staff/queue');
    }
    if (!authed && !isStaffAuthPath(window.location.pathname)) {
      window.history.replaceState(null, '', '/staff/login');
      setAuthScreen('login');
    }
  }, [authed]);

  if (shouldHandOffToAdmin) return null;

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
      <Sidebar current={current} onSelect={(id) => selectNav(id, setCurrent)} collapsed={collapsed} />
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

function isStaffAuthPath(pathname: string) {
  return pathname.endsWith('/login') || pathname.endsWith('/forgot-password') || pathname.endsWith('/reset-password');
}

function initialNav(): NavId {
  const segment = window.location.pathname.replace(/^\/staff\/?/, '').split('/')[0];
  const allowed: NavId[] = ['queue', 'customers', 'email', 'training', 'calendar', 'notes', 'announcements', 'messaging', 'requests', 'notifications'];
  return allowed.includes(segment as NavId) ? segment as NavId : 'queue';
}

function selectNav(id: NavId, setCurrent: (id: NavId) => void) {
  const path = `/staff/${id}`;
  window.history.pushState(null, '', path);
  setCurrent(id);
}

function showAuthScreen(screen: AuthScreen, setAuthScreen: (screen: AuthScreen) => void) {
  const basePath = '/staff';
  const path = screen === 'login' ? `${basePath}/login` : `${basePath}/${screen === 'forgot' ? 'forgot-password' : 'reset-password'}`;
  window.history.pushState(null, '', path);
  setAuthScreen(screen);
}
