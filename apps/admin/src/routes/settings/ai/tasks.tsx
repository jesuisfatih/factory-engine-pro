import { createFileRoute } from '@tanstack/react-router';

function TasksView() {
  return (
    <div className="stub">
      <h3>Resolver tasks</h3>
      <p>Pending resolver-proposed tasks awaiting operator approval. Same table shape as /tasks/generated-tasks; lives here as a quick Resolver Hub side-view.</p>
    </div>
  );
}

export const Route = createFileRoute('/settings/ai/tasks')({ component: TasksView });
