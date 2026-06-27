import { createFileRoute } from '@tanstack/react-router';
import { TeamUserCreatePage } from '@/features/team/TeamPages';

export const Route = createFileRoute('/team/users/add')({ component: TeamUserCreatePage });
