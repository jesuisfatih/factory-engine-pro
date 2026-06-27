import { createFileRoute } from '@tanstack/react-router';
import { AdminForgotPasswordPanel } from '@/features/auth/AuthPanels';

export const Route = createFileRoute('/forgot-password')({ component: AdminForgotPasswordPanel });
