import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/tasks/customer')({
  beforeLoad: () => {
    throw redirect({ to: '/call-center' });
  },
});
