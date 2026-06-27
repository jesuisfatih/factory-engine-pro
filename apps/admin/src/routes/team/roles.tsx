import { createFileRoute } from '@tanstack/react-router';
import { TeamRolesPage } from '@/features/team/TeamPages';

export const Route = createFileRoute('/team/roles')({ component: TeamRolesPage });
