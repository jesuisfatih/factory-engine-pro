import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/tasks/messages')({
  beforeLoad: () => {
    throw redirect({ to: '/call-center' });
  },
});
