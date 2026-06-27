import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Eye, EyeOff, AlertTriangle, Lock, X, Loader2, CheckCircle2 } from 'lucide-react';

/* ─── PasswordInput: visibility toggle + caps lock detect + strength ─── */
interface PasswordInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  showStrength?: boolean;
  autoComplete?: 'current-password' | 'new-password';
  required?: boolean;
}

export function PasswordInput({ id, label, value, onChange, placeholder, showStrength = false, autoComplete = 'current-password', required }: PasswordInputProps) {
  const [revealed, setRevealed] = useState(false);
  const [capsOn, setCapsOn] = useState(false);

  const strength = computeStrength(value);

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="auth-password-wrap">
        <Lock className="auth-input-icon" size={14} />
        <input
          id={id}
          type={revealed ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => setCapsOn(event.getModifierState('CapsLock'))}
          onKeyUp={(event) => setCapsOn(event.getModifierState('CapsLock'))}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
        />
        <button
          type="button"
          className="auth-input-reveal"
          onClick={() => setRevealed((current) => !current)}
          title={revealed ? 'Hide password' : 'Show password'}
          tabIndex={-1}
        >
          {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
      {capsOn && (
        <div className="auth-hint warn">
          <AlertTriangle size={11} /> Caps Lock is on
        </div>
      )}
      {showStrength && value.length > 0 && (
        <div className="auth-strength">
          <div className="auth-strength-bar">
            <div className={`auth-strength-fill tier-${strength.tier}`} style={{ width: `${strength.score * 25}%` }} />
          </div>
          <span className={`auth-strength-label tier-${strength.tier}`}>{strength.label}</span>
        </div>
      )}
    </div>
  );
}

function computeStrength(value: string): { score: number; tier: 'weak' | 'fair' | 'good' | 'strong'; label: string } {
  if (!value) return { score: 0, tier: 'weak', label: 'Empty' };
  let score = 0;
  if (value.length >= 8) score += 1;
  if (value.length >= 12) score += 1;
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score += 1;
  if (/\d/.test(value)) score += 1;
  if (/[^A-Za-z0-9]/.test(value)) score += 1;
  score = Math.min(4, score);
  if (score <= 1) return { score, tier: 'weak', label: 'Weak - needs 8+ chars + mix' };
  if (score === 2) return { score, tier: 'fair', label: 'Fair - add a number or symbol' };
  if (score === 3) return { score, tier: 'good', label: 'Good' };
  return { score, tier: 'strong', label: 'Strong' };
}

/* ─── AuthAlert (dismissible) ─── */
export function AuthAlert({ kind = 'danger', children, onDismiss }: { kind?: 'danger' | 'success' | 'info'; children: ReactNode; onDismiss?: () => void }) {
  return (
    <div className={`auth-alert ${kind}`} role="alert">
      <AlertTriangle size={14} />
      <span>{children}</span>
      {onDismiss && (
        <button type="button" className="auth-alert-x" onClick={onDismiss} aria-label="Dismiss">
          <X size={12} />
        </button>
      )}
    </div>
  );
}

/* ─── AuthSubmit (primary button with loading state) ─── */
export function AuthSubmit({ pending, children, disabled }: { pending: boolean; children: ReactNode; disabled?: boolean }) {
  return (
    <button type="submit" className="auth-submit" disabled={pending || disabled}>
      {pending ? <Loader2 size={14} className="auth-spin" /> : null}
      {children}
    </button>
  );
}

/* ─── SuccessPanel (used after submit) ─── */
export function SuccessPanel({ title, body, footer }: { title: string; body: ReactNode; footer?: ReactNode }) {
  return (
    <>
      <div className="auth-icon-circle success">
        <CheckCircle2 size={28} />
      </div>
      <h2>{title}</h2>
      <p className="muted">{body}</p>
      {footer}
    </>
  );
}

/* ─── AuthForm wrapper with Enter-to-submit + auto-focus ─── */
export function AuthForm({ onSubmit, children }: { onSubmit: (event: FormEvent) => void; children: ReactNode }) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const first = ref.current?.querySelector<HTMLInputElement>('input:not([type="hidden"]):not([disabled])');
    first?.focus();
  }, []);
  return <form ref={ref} onSubmit={onSubmit}>{children}</form>;
}

/* ─── Email helpers ─── */
const EMAIL_RE = /^\S+@\S+\.\S+$/;
export function isEmail(value: string): boolean { return EMAIL_RE.test(value.trim()); }
