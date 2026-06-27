import { createFileRoute } from '@tanstack/react-router';
import { WorkspaceSettingsPage } from '@/features/settings/WorkspaceSettingsPage';

export const Route = createFileRoute('/settings/workspace')({ component: WorkspaceSettingsPage });
