import { createFileRoute } from '@tanstack/react-router';
import { CustomerPortalSettingsPage } from '@/features/settings/CustomerPortalSettingsPage';

export const Route = createFileRoute('/settings/customer-portal')({ component: CustomerPortalSettingsPage });
