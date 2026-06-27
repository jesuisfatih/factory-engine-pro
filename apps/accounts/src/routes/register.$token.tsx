import { createFileRoute } from '@tanstack/react-router';
import { AccountsResetPasswordPanel } from '@/features/auth/AuthPanels';

function RegisterTokenPage() {
  const { token } = Route.useParams();
  return <AccountsResetPasswordPanel tokenOverride={token} invitation />;
}

export const Route = createFileRoute('/register/$token')({ component: RegisterTokenPage });
