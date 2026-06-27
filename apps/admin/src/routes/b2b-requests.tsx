import { createFileRoute } from '@tanstack/react-router';
import { B2BRequestsPage } from '@/features/operations/B2BRequestsPage';

export const Route = createFileRoute('/b2b-requests')({ component: B2BRequestsPage });
