import { createFileRoute } from '@tanstack/react-router';
import { SystemMailPage } from '@/features/system/SystemMailPage';

export const Route = createFileRoute('/system-mail')({ component: SystemMailPage });
