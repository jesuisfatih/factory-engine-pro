import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/tasks/email')({
  beforeLoad: () => {
    throw redirect({ to: '/call-center' });
  },
});
