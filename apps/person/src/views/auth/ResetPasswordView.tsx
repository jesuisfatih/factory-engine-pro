import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { AuthAlert, AuthForm, AuthSubmit, PasswordInput, SuccessPanel } from '../../components/auth/AuthShell';
import { WorkspaceBrand } from '../../components/WorkspaceBrand';
import { apiErrorMessage, personApi } from '../../lib/api';

interface Props { onBackToLogin: () => void; }

export function ResetPasswordView({ onBackToLogin }: Props) {
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const reset = useMutation({
    mutationFn: () => personApi.resetPassword({ token, password }),
    onError: (err) => setError(apiErrorMessage(err)),
  });
  const passwordsMatch = password.length > 0 && password === confirm;
  const strongEnough = password.length >= 8 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password);

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!token) return setError('Reset token is required.');
    if (!strongEnough) return setError('Password must be 8+ characters with upper, lower and a number.');
    if (!passwordsMatch) return setError('Passwords do not match.');
    reset.mutate();
  };

  if (reset.isSuccess) {
    return <div className="auth-card"><SuccessPanel title="Password updated" body="Your new password is live." footer={<button type="button" className="auth-submit" style={{ marginTop: 18 }} onClick={onBackToLogin}>Sign in</button>} /></div>;
  }

  return (
    <div className="auth-card">
      <WorkspaceBrand />
      <div className="auth-icon-circle"><ShieldCheck size={28} /></div>
      <h2>Set a new password</h2>
      <AuthForm onSubmit={onSubmit}>
        {error && <AuthAlert kind="danger" onDismiss={() => setError(null)}>{error}</AuthAlert>}
        <div className="field">
          <label htmlFor="reset-token">Reset token</label>
          <input id="reset-token" value={token} onChange={(event) => setToken(event.target.value)} />
        </div>
        <PasswordInput id="reset-new" label="New password" value={password} onChange={setPassword} showStrength autoComplete="new-password" required />
        <PasswordInput id="reset-confirm" label="Confirm password" value={confirm} onChange={setConfirm} autoComplete="new-password" required />
        <AuthSubmit pending={reset.isPending} disabled={!strongEnough || !passwordsMatch}>Update password</AuthSubmit>
      </AuthForm>
    </div>
  );
}
