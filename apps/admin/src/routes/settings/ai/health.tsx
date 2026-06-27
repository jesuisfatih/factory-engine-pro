import { createFileRoute } from '@tanstack/react-router';

function HealthView() {
  return (
    <div className="stub">
      <h3>AI Health</h3>
      <p>Provider availability, rate limits, recent error spikes, circuit-breaker status. p50/p95 latency, last 5 alerts.</p>
    </div>
  );
}

export const Route = createFileRoute('/settings/ai/health')({ component: HealthView });
