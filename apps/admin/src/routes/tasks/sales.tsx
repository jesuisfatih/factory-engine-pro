import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/tasks/sales')({
  beforeLoad: () => {
    throw redirect({ to: '/call-center' });
  },
});
