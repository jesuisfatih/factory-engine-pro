import { Outlet, createFileRoute } from '@tanstack/react-router';

function SupportLayout() {
  return <Outlet />;
}

export const Route = createFileRoute('/support')({ component: SupportLayout });
