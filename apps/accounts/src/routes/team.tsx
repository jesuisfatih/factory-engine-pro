import { createFileRoute } from '@tanstack/react-router';
import { AccountsTeamPage } from '@/features/team/AccountsTeamPage';

export const Route = createFileRoute('/team')({ component: AccountsTeamPage });
