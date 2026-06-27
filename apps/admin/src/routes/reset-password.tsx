import { createFileRoute } from '@tanstack/react-router';
import { AdminResetPasswordPanel } from '@/features/auth/AuthPanels';

export const Route = createFileRoute('/reset-password')({ component: AdminResetPasswordPanel });
