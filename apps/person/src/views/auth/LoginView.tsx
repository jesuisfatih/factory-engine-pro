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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const login = useMutation({
    mutationFn: () => personApi.personLogin({ email, password }),
    onSuccess: (session) => {
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
            <input id="login-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" placeholder="you@workspace.com" required />
          </div>
        </div>
        <PasswordInput id="login-password" label="Password" value={password} onChange={setPassword} required />
        <div className="auth-row">
          <span />
          <button type="button" className="auth-text-link" onClick={onForgot} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>Forgot password?</button>
        </div>
        <AuthSubmit pending={login.isPending}>Sign in <ArrowRight size={14} /></AuthSubmit>
      </AuthForm>
    </div>
  );
}
