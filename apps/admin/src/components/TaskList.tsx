import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { Kpi } from '@/components/Kpi';
import { apiErrorMessage } from '@/lib/api';
import { fetchTasks, type TaskSurface } from '@/lib/live-data';

interface Props { surface: TaskSurface; }

type FilterId = 'all' | 'mine' | 'team' | 'unassigned';
const FILTERS: FilterId[] = ['all', 'mine', 'team', 'unassigned'];

export function TaskList({ surface }: Props) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<FilterId>('all');
  const tasksQuery = useQuery({ queryKey: ['tasks', surface], queryFn: () => fetchTasks(surface) });
  const tasks = tasksQuery.data ?? [];

  const open = tasks.filter((task) => task.status === 'open' || task.status === 'in_progress').length;
  const overdue = tasks.filter((task) => task.status === 'overdue').length;
  const dueToday = tasks.filter((task) => task.dueAt.toLowerCase().includes('today')).length;
  const completed = tasks.filter((task) => task.status === 'completed').length;

  const priorityPill = (p: string) =>
    p === 'critical' ? 'pill danger' : p === 'high' ? 'pill warn' : p === 'normal' ? 'pill info' : 'pill';
  const sourcePill = (src: string) =>
    src === 'ai' || src === 'transcript' || src === 'ai_workflow'
      ? 'pill accent'
      : src === 'segment' || src === 'ai_segment'
        ? 'pill info'
        : 'pill';
  const sourceLabel = (src: string) => {
    if (src === 'ai' || src === 'transcript') return 'Transcript';
    if (src === 'ai_workflow' || src === 'workflow') return 'Rule engine';
    if (src === 'ai_segment' || src === 'segment') return 'Segment';
    return src;
  };

  return (
    <>
      <div className="kpis four">
        <Kpi id={`kpi-${surface}-open`} labelI18nKey="tasks.kpi.open" value={open} />
        <Kpi id={`kpi-${surface}-due-today`} labelI18nKey="tasks.kpi.due_today" value={dueToday} />
        <Kpi id={`kpi-${surface}-overdue`} labelI18nKey="tasks.kpi.overdue" value={overdue} />
        <Kpi id={`kpi-${surface}-completed`} labelI18nKey="tasks.kpi.completed" value={completed} />
      </div>

      <div className="tabs" style={{ marginBottom: 12, borderBottom: 'none' }}>
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            id={`tasks-${surface}-filter-${f}`}
            data-i18n-key={`tasks.filter.${f}`}
            className={`tab${filter === f ? ' active' : ''}`}
            onClick={() => setFilter(f)}
            style={{ borderBottomWidth: 1 }}
          >
            {t(`tasks.filter.${f}`)}
          </button>
        ))}
      </div>

      <div className="data-card">
        {tasksQuery.isLoading && <div className="pricing-list-empty">{t('common.loading')}</div>}
        {tasksQuery.isError && <div className="error-state">{apiErrorMessage(tasksQuery.error)}</div>}
        {tasksQuery.isSuccess && tasks.length === 0 && (
          <div className="pricing-list-empty">{t('tasks.empty_state', { defaultValue: 'No live tasks found for this queue.' })}</div>
        )}
        <table className="data-table" id={`table-tasks-${surface}`}>
          <thead>
            <tr>
              <th>Task</th>
              <th>Customer</th>
              <th>Assignee</th>
              <th>Priority</th>
              <th>Source</th>
              <th>Due</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr key={task.id} id={`row-task-${task.id}`}>
                <td className="name">{task.title}</td>
                <td><span className="muted">{task.customer}</span></td>
                <td>{task.assignee}</td>
                <td><span className={priorityPill(task.priority)}>{task.priority}</span></td>
                <td><span className={sourcePill(task.source)}>{sourceLabel(task.source)}</span></td>
                <td><span className="muted">{task.dueAt}</span></td>
                <td>
                  <span className={`pill ${task.status === 'completed' ? 'success' : task.status === 'overdue' ? 'danger' : 'info'} dot`}>
                    {task.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
