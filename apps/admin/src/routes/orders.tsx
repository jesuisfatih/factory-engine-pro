import { createFileRoute } from '@tanstack/react-router';
import { OrdersPage } from '@/features/commerce/OrdersPage';

export const Route = createFileRoute('/orders')({ component: OrdersPage });
