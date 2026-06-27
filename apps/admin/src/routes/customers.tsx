import { createFileRoute } from '@tanstack/react-router';
import { CustomersPage } from '@/features/commerce/CustomersPage';

export const Route = createFileRoute('/customers')({ component: CustomersPage });
