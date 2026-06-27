import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Mail, ArrowLeft, KeyRound } from 'lucide-react';
import { AuthAlert, AuthForm, AuthSubmit, SuccessPanel, isEmail } from '../../components/auth/AuthShell';
import { apiErrorMessage, personApi } from '../../lib/api';

interface Props { onBackToLogin: () => void; }

export function ForgotPasswordView({ onBackToLogin }: Props) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [devToken, setDevToken] = useState<string | null>(null);
  const forgot = useMutation({
    mutationFn: () => personApi.forgotPassword({ email, surface: 'person' }),
    onSuccess: (response: { devToken?: string }) => setDevToken(response.devToken ?? null),
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!isEmail(email)) return setError('Enter a valid email address.');
    forgot.mutate();
  };

  return (
    <div className="auth-card">
      <div className="auth-brand">
        <div className="ws-badge" style={{ width: 40, height: 40, fontSize: 14, background: '#DC2626' }}>DB</div>
        <div><div className="name">DTF BANK</div><div className="muted">Customer service workspace</div></div>
      </div>
      {forgot.isSuccess ? (
        <SuccessPanel
          title="Check your inbox"
          body={devToken ? `Local reset token: ${devToken}` : `If a workspace account exists for ${email}, a reset link was queued.`}
          footer={<button type="button" className="auth-submit" style={{ marginTop: 18 }} onClick={onBackToLogin}><ArrowLeft size={14} /> Back to sign in</button>}
        />
      ) : (
        <>
          <div className="auth-icon-circle"><KeyRound size={28} /></div>
          <h2>Forgot your password?</h2>
          <p className="muted">Enter your work email. The reset link is valid for 30 minutes.</p>
          <AuthForm onSubmit={onSubmit}>
            {error && <AuthAlert kind="danger" onDismiss={() => setError(null)}>{error}</AuthAlert>}
            <div className="field">
              <label htmlFor="forgot-email">Work email</label>
              <div className="auth-password-wrap">
                <Mail className="auth-input-icon" size={14} />
                <input id="forgot-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@workspace.com" autoComplete="username" required />
              </div>
            </div>
            <AuthSubmit pending={forgot.isPending}>Send reset link</AuthSubmit>
          </AuthForm>
          <button type="button" onClick={onBackToLogin} className="auth-link" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <ArrowLeft size={12} /> Back to sign in
          </button>
        </>
      )}
    </div>
  );
}
