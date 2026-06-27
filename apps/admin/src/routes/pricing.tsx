import { createFileRoute } from '@tanstack/react-router';
import { PricingPage } from '@/features/commerce/PricingPage';

export const Route = createFileRoute('/pricing')({ component: PricingPage });
