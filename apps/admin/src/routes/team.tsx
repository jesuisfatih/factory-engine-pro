import { Outlet, createFileRoute, redirect } from '@tanstack/react-router';

function TeamLayout() {
  return <Outlet />;
}

export const Route = createFileRoute('/team')({
  component: TeamLayout,
  beforeLoad: ({ location }) => {
    if (location.pathname === '/team') throw redirect({ to: '/team/users' });
  },
});
