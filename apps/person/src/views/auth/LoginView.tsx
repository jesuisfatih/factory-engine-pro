import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Mail, ArrowRight } from 'lucide-react';
import { AuthAlert, AuthForm, AuthSubmit, PasswordInput, isEmail } from '../../components/auth/AuthShell';
import { WorkspaceBrand } from '../../components/WorkspaceBrand';
import { apiErrorMessage, personApi, personTokenStore } from '../../lib/api';

interface Props {
  onSuccess: () => void;
  onForgot: () => void;
}

export function LoginView({ onSuccess, onForgot }: Props) {
  const rememberedEmail = readRememberedEmail();
  const [email, setEmail] = useState(rememberedEmail);
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(Boolean(rememberedEmail));
  const [error, setError] = useState<string | null>(null);
  const login = useMutation({
    mutationFn: () => personApi.personLogin({ email, password }),
    onSuccess: (session) => {
      persistRememberedEmail(rememberMe, email);
      personTokenStore.setSession(session);
      onSuccess();
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!isEmail(email)) return setError('Enter a valid email address.');
    if (!password) return setError('Password is required.');
    login.mutate();
  };

  return (
    <div className="auth-card">
      <WorkspaceBrand />
      <h2>Welcome back</h2>
      <p className="muted">Sign in with your member account to pick up your shift.</p>
      <AuthForm onSubmit={onSubmit}>
        {error && <AuthAlert kind="danger" onDismiss={() => setError(null)}>{error}</AuthAlert>}
        <div className="field">
          <label htmlFor="login-email">Work email</label>
          <div className="auth-password-wrap">
            <Mail className="auth-input-icon" size={14} />
            <input id="login-email" type="email" value={email} onChange={(event) => { setEmail(event.target.value); if (error) setError(null); }} autoComplete="username" placeholder="you@workspace.com" required />
          </div>
        </div>
        <PasswordInput id="login-password" label="Password" value={password} onChange={(next) => { setPassword(next); if (error) setError(null); }} required />
        <div className="auth-row">
          <label className="auth-check" htmlFor="person-remember-me">
            <input id="person-remember-me" type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} />
            <span>Remember me</span>
          </label>
          <button type="button" className="auth-text-link" onClick={onForgot} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>Forgot password?</button>
        </div>
        <AuthSubmit pending={login.isPending}>Sign in <ArrowRight size={14} /></AuthSubmit>
      </AuthForm>
    </div>
  );
}

const REMEMBERED_EMAIL_KEY = 'factory-engine-pro.person.remembered-email';

function readRememberedEmail() {
  try {
    return window.localStorage.getItem(REMEMBERED_EMAIL_KEY) ?? '';
  } catch {
    return '';
  }
}

function persistRememberedEmail(remember: boolean, email: string) {
  try {
    if (remember) {
      window.localStorage.setItem(REMEMBERED_EMAIL_KEY, email.trim().toLowerCase());
    } else {
      window.localStorage.removeItem(REMEMBERED_EMAIL_KEY);
    }
  } catch {
    /* ignore blocked storage */
  }
}
