import { Outlet, createFileRoute, redirect } from '@tanstack/react-router';
import { PageHeader } from '@/components/PageHeader';
import { Tabs } from '@/components/Tabs';

function TasksLayout() {
  return (
    <>
      <PageHeader titleI18nKey="tasks.title" subtitleI18nKey="tasks.subtitle" />
      <Tabs
        tabs={[
          { to: '/tasks/customer', i18nKey: 'tasks.tabs.customer', id: 'tab-tasks-customer' },
          { to: '/tasks/sales', i18nKey: 'tasks.tabs.sales', id: 'tab-tasks-sales' },
          { to: '/tasks/messages', i18nKey: 'tasks.tabs.messages', id: 'tab-tasks-messages' },
          { to: '/tasks/calendar', i18nKey: 'tasks.tabs.calendar', id: 'tab-tasks-calendar' },
          { to: '/tasks/email', i18nKey: 'tasks.tabs.email', id: 'tab-tasks-email' },
        ]}
      />
      <Outlet />
    </>
  );
}

export const Route = createFileRoute('/tasks')({
  component: TasksLayout,
  beforeLoad: ({ location }) => {
    if (location.pathname === '/tasks') throw redirect({ to: '/tasks/customer' });
  },
});
