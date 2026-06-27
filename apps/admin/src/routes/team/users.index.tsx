import { createFileRoute } from '@tanstack/react-router';
import { TeamUsersPage } from '@/features/team/TeamPages';

export const Route = createFileRoute('/team/users/')({ component: TeamUsersPage });
