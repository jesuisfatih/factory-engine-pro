import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { ArrowLeft, ArrowRight, Mail, ShieldCheck, KeyRound } from 'lucide-react';
import { accountsApi, accountsTokenStore, apiErrorMessage } from '@/lib/api';
import { AuthAlert, AuthForm, AuthSubmit, PasswordInput, SuccessPanel, isEmail } from '@/components/AuthShell';

export function AccountsLoginPanel() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const login = useMutation({
    mutationFn: () => accountsApi.customerLogin({ email, password }),
    onSuccess: (session) => {
      accountsTokenStore.setSession(session);
      window.location.assign('/');
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
    <div className="invite-shell">
      <aside className="invite-hero">
        <div className="invite-brand"><div className="ws-badge" style={{ width: 44, height: 44, fontSize: 14 }}>DB</div><div><div className="name">DTF BANK</div><div className="muted">Buyer portal</div></div></div>
        <div className="invite-hero-body"><div className="eyebrow">B2B portal</div><h1>Welcome back to your buying workspace.</h1><p>Orders, sub-users, spending caps and B2B pricing live behind this sign-in.</p></div>
      </aside>
      <main className="invite-form" style={{ maxWidth: 560, margin: '0 auto', alignSelf: 'center' }}>
        <h2>Sign in to your account</h2>
        <p className="muted">Buyer and sub-buyer accounts use the same login.</p>
        <AuthForm onSubmit={submit}>
          {error && <AuthAlert onDismiss={() => setError(null)}>{error}</AuthAlert>}
          <EmailField id="accounts-login-email" value={email} onChange={setEmail} />
          <PasswordInput id="accounts-login-password" label="Password" value={password} onChange={setPassword} required />
          <div className="auth-row"><span /><a href="/forgot-password" className="auth-text-link">Forgot password?</a></div>
          <AuthSubmit pending={login.isPending}>Sign in <ArrowRight size={14} /></AuthSubmit>
        </AuthForm>
        <div className="auth-divider"><span>or</span></div>
        <a href="/register" className="btn" style={{ justifyContent: 'center', textDecoration: 'none' }}>Create a new account</a>
      </main>
    </div>
  );
}

export function AccountsRegisterPanel() {
  const [form, setForm] = useState({ email: '', password: '', firstName: '', lastName: '', phone: '', companyName: '', taxId: '' });
  const [error, setError] = useState<string | null>(null);
  const register = useMutation({
    mutationFn: () => accountsApi.customerRegister(form),
    onSuccess: (session) => {
      accountsTokenStore.setSession(session);
      window.location.assign('/');
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!isEmail(form.email)) return setError('Enter a valid email address.');
    register.mutate();
  };

  return (
    <div className="auth-card" style={{ maxWidth: 560 }}>
      <Brand />
      <h2>Create your B2B account</h2>
      <p className="muted">This creates a Customer and the first B2B admin user for the tenant.</p>
      <AuthForm onSubmit={submit}>
        {error && <AuthAlert onDismiss={() => setError(null)}>{error}</AuthAlert>}
        <div className="field-row">
          <Field label="First name" value={form.firstName} onChange={(firstName) => setForm({ ...form, firstName })} />
          <Field label="Last name" value={form.lastName} onChange={(lastName) => setForm({ ...form, lastName })} />
        </div>
        <EmailField id="register-email" value={form.email} onChange={(email) => setForm({ ...form, email })} />
        <div className="field-row">
          <Field label="Phone" value={form.phone} onChange={(phone) => setForm({ ...form, phone })} />
          <Field label="Company" value={form.companyName} onChange={(companyName) => setForm({ ...form, companyName })} />
        </div>
        <Field label="Tax ID" value={form.taxId} onChange={(taxId) => setForm({ ...form, taxId })} />
        <PasswordInput id="register-password" label="Password" value={form.password} onChange={(password) => setForm({ ...form, password })} showStrength autoComplete="new-password" required />
        <AuthSubmit pending={register.isPending}>Create account <ArrowRight size={14} /></AuthSubmit>
      </AuthForm>
      <a href="/login" className="auth-link"><ArrowLeft size={12} /> Back to sign in</a>
    </div>
  );
}

export function AccountsForgotPasswordPanel() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [devToken, setDevToken] = useState<string | null>(null);
  const forgot = useMutation({
    mutationFn: () => accountsApi.forgotPassword({ email, surface: 'accounts' }),
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
      <Brand />
      {forgot.isSuccess ? (
        <SuccessPanel title="Check your inbox" body={devToken ? `Local reset token: ${devToken}` : `If ${email} exists, a reset link was queued.`} footer={<a className="auth-submit" href="/login" style={{ marginTop: 18, textDecoration: 'none' }}>Back to sign in</a>} />
      ) : (
        <>
          <div className="auth-icon-circle"><KeyRound size={28} /></div>
          <h2>Forgot your password?</h2>
          <AuthForm onSubmit={submit}>
            {error && <AuthAlert onDismiss={() => setError(null)}>{error}</AuthAlert>}
            <EmailField id="accounts-forgot-email" value={email} onChange={setEmail} />
            <AuthSubmit pending={forgot.isPending}>Send reset link</AuthSubmit>
          </AuthForm>
          <a href="/login" className="auth-link"><ArrowLeft size={12} /> Back to sign in</a>
        </>
      )}
    </div>
  );
}

export function AccountsResetPasswordPanel() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const token = new URLSearchParams(window.location.search).get('token') ?? '';
  const reset = useMutation({
    mutationFn: () => accountsApi.resetPassword({ token, password }),
    onError: (err) => setError(apiErrorMessage(err)),
  });
  const match = password.length > 0 && password === confirm;
  const strong = password.length >= 8 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password);
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!token) return setError('Reset token is missing.');
    if (!strong) return setError('Password must be 8+ characters with upper, lower and a number.');
    if (!match) return setError('Passwords do not match.');
    reset.mutate();
  };
  return (
    <div className="auth-card">
      <Brand />
      {reset.isSuccess ? (
        <SuccessPanel title="Password updated" body="Your new password is active." footer={<a className="auth-submit" href="/login" style={{ marginTop: 18, textDecoration: 'none' }}>Sign in now</a>} />
      ) : (
        <>
          <div className="auth-icon-circle"><ShieldCheck size={28} /></div>
          <h2>Set a new password</h2>
          <AuthForm onSubmit={submit}>
            {error && <AuthAlert onDismiss={() => setError(null)}>{error}</AuthAlert>}
            <PasswordInput id="accounts-reset-new" label="New password" value={password} onChange={setPassword} showStrength autoComplete="new-password" required />
            <PasswordInput id="accounts-reset-confirm" label="Confirm password" value={confirm} onChange={setConfirm} autoComplete="new-password" required />
            <AuthSubmit pending={reset.isPending} disabled={!strong || !match}>Update password</AuthSubmit>
          </AuthForm>
        </>
      )}
    </div>
  );
}

function Brand() {
  return <div className="auth-brand"><div className="ws-badge" style={{ width: 40, height: 40, fontSize: 14 }}>DB</div><div><div className="name">DTF BANK</div><div className="muted">Buyer portal</div></div></div>;
}

function EmailField({ id, value, onChange }: { id: string; value: string; onChange: (next: string) => void }) {
  return <div className="field"><label htmlFor={id}>Email</label><div className="auth-password-wrap"><Mail className="auth-input-icon" size={14} /><input id={id} type="email" value={value} onChange={(event) => onChange(event.target.value)} placeholder="you@company.com" required /></div></div>;
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (next: string) => void }) {
  return <div className="field"><label>{label}</label><input value={value} onChange={(event) => onChange(event.target.value)} required /></div>;
}
