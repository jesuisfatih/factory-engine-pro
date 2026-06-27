import { createFileRoute } from '@tanstack/react-router';
import { SegmentsPage } from '@/features/operations/SegmentsPage';

export const Route = createFileRoute('/segments/')({ component: SegmentsPage });
