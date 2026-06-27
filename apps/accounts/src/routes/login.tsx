import { createFileRoute } from '@tanstack/react-router';
import { AccountsLoginPanel } from '@/features/auth/AuthPanels';

export const Route = createFileRoute('/login')({ component: AccountsLoginPanel });
