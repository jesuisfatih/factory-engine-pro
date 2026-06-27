import { createFileRoute } from '@tanstack/react-router';
import { AccountsRegisterPanel } from '@/features/auth/AuthPanels';

export const Route = createFileRoute('/register')({ component: AccountsRegisterPanel });
