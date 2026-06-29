import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/tasks/calendar')({
  beforeLoad: () => {
    throw redirect({ to: '/call-center' });
  },
});
