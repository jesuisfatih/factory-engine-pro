import { createFileRoute } from '@tanstack/react-router';
import { BillingSettingsPage } from '@/features/settings/BillingSettingsPage';

export const Route = createFileRoute('/settings/billing')({ component: BillingSettingsPage });
