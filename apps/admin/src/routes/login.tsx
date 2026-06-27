import { createFileRoute } from '@tanstack/react-router';
import { AdminLoginPanel } from '@/features/auth/AuthPanels';

export const Route = createFileRoute('/login')({ component: AdminLoginPanel });
