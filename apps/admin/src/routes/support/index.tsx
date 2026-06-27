import { createFileRoute } from '@tanstack/react-router';
import { SupportPage } from '@/features/operations/SupportPage';

export const Route = createFileRoute('/support/')({ component: SupportPage });
