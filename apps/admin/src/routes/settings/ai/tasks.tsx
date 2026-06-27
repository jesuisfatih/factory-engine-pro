import { createFileRoute } from '@tanstack/react-router';

function TasksView() {
  return (
    <div className="stub">
      <h3>AI Tasks</h3>
      <p>Pending AI-proposed tasks awaiting operator approval. Same table shape as /tasks/ai-tasks; lives here as a quick AI Hub side-view.</p>
    </div>
  );
}

export const Route = createFileRoute('/settings/ai/tasks')({ component: TasksView });
