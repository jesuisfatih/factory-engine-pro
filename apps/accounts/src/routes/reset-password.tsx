import { createFileRoute } from '@tanstack/react-router';
import { AccountsResetPasswordPanel } from '@/features/auth/AuthPanels';

export const Route = createFileRoute('/reset-password')({ component: AccountsResetPasswordPanel });
