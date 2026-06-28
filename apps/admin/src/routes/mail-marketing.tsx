import { createFileRoute } from '@tanstack/react-router';
import { MailMarketingPage } from '@/features/system/MailMarketingPage';

export const Route = createFileRoute('/mail-marketing')({ component: MailMarketingPage });
