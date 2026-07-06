import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { ArrowLeft, ArrowRight, Mail, ShieldCheck, KeyRound, PackageCheck, Truck, Users2, BadgeCheck } from 'lucide-react';
import { accountsApi, accountsTokenStore, apiErrorMessage } from '@/lib/api';
import { AuthAlert, AuthForm, AuthSubmit, PasswordInput, SuccessPanel, isEmail } from '@/components/AuthShell';
import { useWorkspaceBrand, workspaceBadge, workspaceName } from '@/lib/workspace-brand';

const LOGIN_FEATURES = [
  { icon: PackageCheck, title: 'Live order history', body: 'Review synced Shopify orders, invoices and pickup status.' },
  { icon: Users2, title: 'Team controls', body: 'Create sub-users and keep buyer access scoped to your company.' },
  { icon: Truck, title: 'Tracking workspace', body: 'Follow shipping and pickup milestones from one portal.' },
] as const;

const LOGIN_TRUST = ['Wholesale pricing', 'Secure access', 'Priority support'] as const;

export function AccountsLoginPanel() {
  const rememberedEmail = readRememberedEmail();
  const [email, setEmail] = useState(rememberedEmail);
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(Boolean(rememberedEmail));
  const [error, setError] = useState<string | null>(null);
  const login = useMutation({
    mutationFn: () => accountsApi.customerLogin({ email, password }),
    onSuccess: (session) => {
      persistRememberedEmail(rememberMe, email);
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
        <Brand hero />
        <div className="invite-hero-body">
          <div className="eyebrow">B2B portal</div>
          <h1>Welcome back to your buying workspace.</h1>
          <p>Orders, sub-users, spending caps and B2B pricing live behind this sign-in.</p>
        </div>
        <div className="auth-feature-stack">
          {LOGIN_FEATURES.map(({ icon: Icon, title, body }) => (
            <div className="auth-feature-card" key={title}>
              <Icon size={15} />
              <div><strong>{title}</strong><span>{body}</span></div>
            </div>
          ))}
        </div>
        <div className="auth-trust-pills">
          {LOGIN_TRUST.map((item) => <span key={item}><BadgeCheck size={11} />{item}</span>)}
        </div>
      </aside>
      <main className="invite-form" style={{ maxWidth: 560, margin: '0 auto', alignSelf: 'center' }}>
        <Brand />
        <h2>Welcome back</h2>
        <p className="muted">Buyer and sub-buyer accounts use the same login.</p>
        <AuthForm onSubmit={submit}>
          {error && <AuthAlert onDismiss={() => setError(null)}>{error}</AuthAlert>}
          <EmailField id="accounts-login-email" value={email} onChange={(next) => { setEmail(next); if (error) setError(null); }} />
          <PasswordInput id="accounts-login-password" label="Password" value={password} onChange={(next) => { setPassword(next); if (error) setError(null); }} required />
          <div className="auth-row">
            <label className="auth-check" htmlFor="accounts-remember-me">
              <input id="accounts-remember-me" type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} />
              <span>Remember me</span>
            </label>
            <a href="/forgot-password" className="auth-text-link">Forgot password?</a>
          </div>
          <AuthSubmit pending={login.isPending}>Sign in <ArrowRight size={14} /></AuthSubmit>
        </AuthForm>
        <div className="auth-divider"><span>or</span></div>
        <div className="auth-link-grid">
          <a href="/register" className="btn" style={{ justifyContent: 'center', textDecoration: 'none' }}>Create Account</a>
          <a href="/request-invitation" className="btn ghost" style={{ justifyContent: 'center', textDecoration: 'none' }}>Request B2B Access</a>
        </div>
      </main>
    </div>
  );
}

export function AccountsRegisterPanel() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(() => initialRegisterFormFromSearch());
  const [error, setError] = useState<string | null>(null);
  const register = useMutation({
    mutationFn: () => accountsApi.customerRegister({
      email: form.email,
      password: form.password,
      firstName: form.firstName,
      lastName: form.lastName,
      phone: form.phone || undefined,
      companyName: form.companyName,
      taxId: form.taxId || undefined,
      shopifyCustomerId: readSearchParam('shopifyCustomerId') || undefined,
      billingAddress: {
        address1: form.billingAddress1,
        address2: form.billingAddress2,
        city: form.billingCity,
        province: form.billingState,
        zip: form.billingPostalCode,
        country: form.billingCountry,
        phone: form.phone,
        company: form.companyName,
        firstName: form.firstName,
        lastName: form.lastName,
        isDefault: true,
      },
      shippingAddress: form.shippingSameAsBilling ? undefined : {
        address1: form.shippingAddress1,
        address2: form.shippingAddress2,
        city: form.shippingCity,
        province: form.shippingState,
        zip: form.shippingPostalCode,
        country: form.shippingCountry,
        phone: form.phone,
        company: form.companyName,
        firstName: form.firstName,
        lastName: form.lastName,
        isDefault: true,
      },
    }),
    onSuccess: (session) => {
      accountsTokenStore.setSession(session);
      window.location.assign('/');
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (step < 5) {
      const nextError = validateRegisterStep(step, form);
      if (nextError) return setError(nextError);
      setStep((current) => current + 1);
      return;
    }
    const finalError = validateRegisterStep(step, form);
    if (finalError) return setError(finalError);
    register.mutate();
  };

  return (
    <div className="auth-card" style={{ maxWidth: 620 }}>
      <Brand />
      <h2>Create your B2B account</h2>
      <p className="muted">Step {step} of 5. Your company, billing and portal credentials are created through the live API.</p>
      <div className="auth-progress"><div style={{ width: `${(step / 5) * 100}%` }} /></div>
      <AuthForm onSubmit={submit}>
        {error && <AuthAlert onDismiss={() => setError(null)}>{error}</AuthAlert>}
        {step === 1 && (
          <>
            <EmailField id="register-email" value={form.email} onChange={(email) => setForm({ ...form, email })} />
            <div className="auth-choice active">
              <strong>B2B Account</strong>
              <span>Company buying portal with team seats and order visibility.</span>
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <div className="field-row">
              <Field label="First name" value={form.firstName} onChange={(firstName) => setForm({ ...form, firstName })} />
              <Field label="Last name" value={form.lastName} onChange={(lastName) => setForm({ ...form, lastName })} />
            </div>
            <Field label="Phone" value={form.phone} onChange={(phone) => setForm({ ...form, phone })} />
          </>
        )}
        {step === 3 && (
          <>
            <Field label="Company" value={form.companyName} onChange={(companyName) => setForm({ ...form, companyName })} />
            <Field label="Tax ID / VAT" value={form.taxId} onChange={(taxId) => setForm({ ...form, taxId })} />
          </>
        )}
        {step === 4 && (
          <>
            <Field label="Billing address line 1" value={form.billingAddress1} onChange={(billingAddress1) => setForm({ ...form, billingAddress1 })} />
            <Field label="Billing address line 2" value={form.billingAddress2} onChange={(billingAddress2) => setForm({ ...form, billingAddress2 })} required={false} />
            <div className="field-row">
              <Field label="City" value={form.billingCity} onChange={(billingCity) => setForm({ ...form, billingCity })} />
              <Field label="State / Province" value={form.billingState} onChange={(billingState) => setForm({ ...form, billingState })} required={false} />
            </div>
            <div className="field-row">
              <Field label="Postal code" value={form.billingPostalCode} onChange={(billingPostalCode) => setForm({ ...form, billingPostalCode })} />
              <Field label="Country" value={form.billingCountry} onChange={(billingCountry) => setForm({ ...form, billingCountry })} />
            </div>
            <label className="auth-check" htmlFor="register-ship-same">
              <input id="register-ship-same" type="checkbox" checked={form.shippingSameAsBilling} onChange={(event) => setForm({ ...form, shippingSameAsBilling: event.target.checked })} />
              <span>Shipping address is the same as billing</span>
            </label>
            {!form.shippingSameAsBilling && (
              <>
                <Field label="Shipping address line 1" value={form.shippingAddress1} onChange={(shippingAddress1) => setForm({ ...form, shippingAddress1 })} />
                <div className="field-row">
                  <Field label="Shipping city" value={form.shippingCity} onChange={(shippingCity) => setForm({ ...form, shippingCity })} />
                  <Field label="Shipping postal code" value={form.shippingPostalCode} onChange={(shippingPostalCode) => setForm({ ...form, shippingPostalCode })} />
                </div>
              </>
            )}
          </>
        )}
        {step === 5 && (
          <>
            <PasswordInput id="register-password" label="Password" value={form.password} onChange={(password) => setForm({ ...form, password })} showStrength autoComplete="new-password" required />
            <PasswordInput id="register-confirm-password" label="Confirm password" value={form.confirmPassword} onChange={(confirmPassword) => setForm({ ...form, confirmPassword })} autoComplete="new-password" required />
          </>
        )}
        <div className="auth-register-actions">
          {step > 1 && <button className="btn" type="button" onClick={() => { setError(null); setStep((current) => current - 1); }}><ArrowLeft size={13} /> Back</button>}
          <AuthSubmit pending={register.isPending}>{step === 5 ? 'Create account' : 'Next step'} <ArrowRight size={14} /></AuthSubmit>
        </div>
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

export function AccountsResetPasswordPanel({ tokenOverride, invitation = false }: { tokenOverride?: string; invitation?: boolean } = {}) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const params = new URLSearchParams(window.location.search);
  const token = tokenOverride ?? params.get('token') ?? '';
  const isInvitation = invitation || params.get('flow') === 'invitation';
  const reset = useMutation({
    mutationFn: () => isInvitation
      ? accountsApi.acceptInvitation({ token, password })
      : accountsApi.resetPassword({ token, password }),
    onSuccess: (response: unknown) => {
      if (isInvitation && response && typeof response === 'object' && 'accessToken' in response) {
        accountsTokenStore.setSession(response as Parameters<typeof accountsTokenStore.setSession>[0]);
        window.location.assign('/');
      }
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });
  const match = password.length > 0 && password === confirm;
  const strong = password.length >= 8 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password);
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!token) return setError(isInvitation ? 'Invitation token is missing.' : 'Reset token is missing.');
    if (!strong) return setError('Password must be 8+ characters with upper, lower and a number.');
    if (!match) return setError('Passwords do not match.');
    reset.mutate();
  };
  return (
    <div className="auth-card">
      <Brand />
      {reset.isSuccess && !isInvitation ? (
        <SuccessPanel title="Password updated" body="Your new password is active." footer={<a className="auth-submit" href="/login" style={{ marginTop: 18, textDecoration: 'none' }}>Sign in now</a>} />
      ) : (
        <>
          <div className="auth-icon-circle"><ShieldCheck size={28} /></div>
          <h2>{isInvitation ? 'Accept invitation' : 'Set a new password'}</h2>
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

function Brand({ hero = false }: { hero?: boolean }) {
  const brandQuery = useWorkspaceBrand();
  const name = workspaceName(brandQuery.data?.workspaceName);
  const badge = workspaceBadge(brandQuery.data?.brandBadge, name);
  const className = hero ? 'invite-brand' : 'auth-brand';
  const size = hero ? 44 : 40;
  return (
    <div className={className}>
      {brandQuery.data?.brandLogo
        ? <img className="ws-logo" src={brandQuery.data.brandLogo} alt="" style={{ width: size, height: size }} />
        : <div className="ws-badge" style={{ width: size, height: size, fontSize: 14 }}>{badge}</div>}
      <div>
        <div className="name">{name}</div>
        <div className="muted">Buyer portal</div>
      </div>
    </div>
  );
}

const REMEMBERED_EMAIL_KEY = 'factory-engine-pro.accounts.remembered-email';

function initialRegisterFormFromSearch() {
  return {
    email: readSearchParam('email'),
    password: '',
    confirmPassword: '',
    firstName: readSearchParam('firstName'),
    lastName: readSearchParam('lastName'),
    phone: readSearchParam('phone'),
    companyName: readSearchParam('companyName'),
    taxId: '',
    billingAddress1: '',
    billingAddress2: '',
    billingCity: '',
    billingState: '',
    billingPostalCode: '',
    billingCountry: 'US',
    shippingSameAsBilling: true,
    shippingAddress1: '',
    shippingAddress2: '',
    shippingCity: '',
    shippingState: '',
    shippingPostalCode: '',
    shippingCountry: 'US',
  };
}

function readSearchParam(name: string) {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get(name)?.trim() ?? '';
}

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

function validateRegisterStep(step: number, form: {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  companyName: string;
  billingAddress1: string;
  billingCity: string;
  billingPostalCode: string;
  shippingSameAsBilling: boolean;
  shippingAddress1: string;
  shippingCity: string;
  shippingPostalCode: string;
  password: string;
  confirmPassword: string;
}) {
  if (step === 1 && !isEmail(form.email)) return 'Enter a valid email address.';
  if (step === 2 && (!form.firstName.trim() || !form.lastName.trim() || !form.phone.trim())) return 'Personal information is required.';
  if (step === 3 && !form.companyName.trim()) return 'Company name is required.';
  if (step === 4) {
    if (!form.billingAddress1.trim() || !form.billingCity.trim() || !form.billingPostalCode.trim()) return 'Billing address is required.';
    if (!form.shippingSameAsBilling && (!form.shippingAddress1.trim() || !form.shippingCity.trim() || !form.shippingPostalCode.trim())) return 'Shipping address is required.';
  }
  if (step === 5) {
    const strong = form.password.length >= 8 && /[A-Z]/.test(form.password) && /[a-z]/.test(form.password) && /\d/.test(form.password);
    if (!strong) return 'Password must be 8+ characters with upper, lower and a number.';
    if (form.password !== form.confirmPassword) return 'Passwords do not match.';
  }
  return null;
}

function EmailField({ id, value, onChange }: { id: string; value: string; onChange: (next: string) => void }) {
  return <div className="field"><label htmlFor={id}>Email</label><div className="auth-password-wrap"><Mail className="auth-input-icon" size={14} /><input id={id} type="email" value={value} onChange={(event) => onChange(event.target.value)} placeholder="you@company.com" required /></div></div>;
}

function Field({ label, value, onChange, required = true }: { label: string; value: string; onChange: (next: string) => void; required?: boolean }) {
  return <div className="field"><label>{label}</label><input value={value} onChange={(event) => onChange(event.target.value)} required={required} /></div>;
}
