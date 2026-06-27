import { createFileRoute } from '@tanstack/react-router';
import { TaskList } from '@/components/TaskList';

export const Route = createFileRoute('/tasks/sales')({ component: () => <TaskList surface="sales" /> });
