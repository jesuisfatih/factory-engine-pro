import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { ArrowLeft, ArrowRight, Mail, ShieldCheck, KeyRound } from 'lucide-react';
import { adminApi, adminTokenStore, apiErrorMessage } from '@/lib/api';
import { AuthAlert, AuthForm, AuthSubmit, PasswordInput, SuccessPanel, isEmail } from '@/components/auth/AuthShell';
import { useWorkspaceBrand, workspaceBadge, workspaceName } from '@/lib/workspace-brand';

export function AdminLoginPanel() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const login = useMutation({
    mutationFn: () => adminApi.memberLogin({ email, password }),
    onSuccess: (session) => {
      adminTokenStore.setSession(session);
      window.location.assign('/dashboard');
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!isEmail(email)) return setError('Enter a valid email address.');
    if (!password) return setError('Password is required.');
    login.mutate();
  };

  return (
    <div className="auth-card">
      <Brand muted="Back panel · owner / admin" />
      <h2>Sign in to your workspace</h2>
      <p className="muted">Owners and admins manage tenants, team roles, customers and integrations here.</p>
      <AuthForm onSubmit={submit}>
        {error && <AuthAlert onDismiss={() => setError(null)}>{error}</AuthAlert>}
        <EmailField id="login-email" value={email} onChange={setEmail} />
        <PasswordInput id="login-password" label="Password" value={password} onChange={setPassword} autoComplete="current-password" required />
        <div className="auth-row">
          <span />
          <a href="/forgot-password" className="auth-text-link">Forgot password?</a>
        </div>
        <AuthSubmit pending={login.isPending}>Sign in <ArrowRight size={14} /></AuthSubmit>
      </AuthForm>
    </div>
  );
}

export function AdminForgotPasswordPanel() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [devToken, setDevToken] = useState<string | null>(null);
  const forgot = useMutation({
    mutationFn: () => adminApi.forgotPassword({ email, surface: 'admin' }),
    onSuccess: (response: { devToken?: string }) => setDevToken(response.devToken ?? null),
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!isEmail(email)) return setError('Enter a valid email address.');
    forgot.mutate();
  };

  return (
    <div className="auth-card">
      <Brand muted="Back panel" />
      {forgot.isSuccess ? (
        <SuccessPanel
          title="Check your inbox"
          body={devToken ? `Local reset token: ${devToken}` : `If ${email} exists, a reset link was queued.`}
          footer={<a className="auth-submit" href="/login" style={{ marginTop: 18, textDecoration: 'none' }}><ArrowLeft size={14} /> Back to sign in</a>}
        />
      ) : (
        <>
          <div className="auth-icon-circle"><KeyRound size={28} /></div>
          <h2>Forgot your password?</h2>
          <p className="muted">Enter the email tied to your workspace. The link expires in 30 minutes.</p>
          <AuthForm onSubmit={submit}>
            {error && <AuthAlert onDismiss={() => setError(null)}>{error}</AuthAlert>}
            <EmailField id="forgot-email" value={email} onChange={setEmail} />
            <AuthSubmit pending={forgot.isPending}>Send reset link</AuthSubmit>
          </AuthForm>
          <a href="/login" className="auth-link"><ArrowLeft size={12} /> Back to sign in</a>
        </>
      )}
    </div>
  );
}

export function AdminResetPasswordPanel() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const token = new URLSearchParams(window.location.search).get('token') ?? '';
  const reset = useMutation({
    mutationFn: () => adminApi.resetPassword({ token, password }),
    onError: (err) => setError(apiErrorMessage(err)),
  });
  const passwordsMatch = password.length > 0 && password === confirm;
  const strongEnough = password.length >= 8 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!token) return setError('Reset token is missing.');
    if (!strongEnough) return setError('Password must be 8+ characters with upper, lower and a number.');
    if (!passwordsMatch) return setError('Passwords do not match.');
    reset.mutate();
  };

  return (
    <div className="auth-card">
      <Brand muted="Back panel" />
      {reset.isSuccess ? (
        <SuccessPanel title="Password updated" body="Your new password is active." footer={<a className="auth-submit" href="/login" style={{ marginTop: 18, textDecoration: 'none' }}>Sign in</a>} />
      ) : (
        <>
          <div className="auth-icon-circle"><ShieldCheck size={28} /></div>
          <h2>Set a new password</h2>
          <AuthForm onSubmit={submit}>
            {error && <AuthAlert onDismiss={() => setError(null)}>{error}</AuthAlert>}
            <PasswordInput id="reset-new" label="New password" value={password} onChange={setPassword} showStrength autoComplete="new-password" required />
            <PasswordInput id="reset-confirm" label="Confirm password" value={confirm} onChange={setConfirm} autoComplete="new-password" required />
            <AuthSubmit pending={reset.isPending} disabled={!strongEnough || !passwordsMatch}>Update password</AuthSubmit>
          </AuthForm>
          <a href="/login" className="auth-link"><ArrowLeft size={12} /> Back to sign in</a>
        </>
      )}
    </div>
  );
}

function Brand({ muted }: { muted: string }) {
  const brandQuery = useWorkspaceBrand();
  const name = workspaceName(brandQuery.data?.workspaceName);
  const badge = workspaceBadge(brandQuery.data?.brandBadge, name);
  return (
    <div className="auth-brand">
      {brandQuery.data?.brandLogo ? <img className="ws-logo" src={brandQuery.data.brandLogo} alt="" style={{ width: 40, height: 40 }} /> : <div className="ws-badge" style={{ width: 40, height: 40, fontSize: 14 }}>{badge}</div>}
      <div>
        <div className="name">{name}</div>
        <div className="muted">{muted}</div>
      </div>
    </div>
  );
}

function EmailField({ id, value, onChange }: { id: string; value: string; onChange: (next: string) => void }) {
  return (
    <div className="field">
      <label htmlFor={id}>Email</label>
      <div className="auth-password-wrap">
        <Mail className="auth-input-icon" size={14} />
        <input id={id} type="email" value={value} onChange={(event) => onChange(event.target.value)} autoComplete="username" placeholder="you@company.com" required />
      </div>
    </div>
  );
}
