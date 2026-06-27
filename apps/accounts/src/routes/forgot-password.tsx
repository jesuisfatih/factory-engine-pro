import { createFileRoute } from '@tanstack/react-router';
import { AccountsForgotPasswordPanel } from '@/features/auth/AuthPanels';

export const Route = createFileRoute('/forgot-password')({ component: AccountsForgotPasswordPanel });
