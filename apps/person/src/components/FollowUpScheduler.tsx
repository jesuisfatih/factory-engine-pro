import { CalendarClock } from 'lucide-react';

interface FollowUpSchedulerProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  compact?: boolean;
}

export function FollowUpScheduler({ value, onChange, disabled = false, compact = false }: FollowUpSchedulerProps) {
  const [date, time = '09:00'] = value.split('T');
  const selected = value ? new Date(value) : null;
  const summary = selected && !Number.isNaN(selected.getTime())
    ? selected.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : 'Choose the next contact time';

  const setPart = (nextDate: string, nextTime: string) => {
    onChange(nextDate && nextTime ? `${nextDate}T${nextTime}` : '');
  };

  return (
    <div className={`follow-up-scheduler${compact ? ' compact' : ''}`}>
      <div className="follow-up-scheduler-summary"><CalendarClock size={14} /><span>{summary}</span></div>
      <div className="follow-up-scheduler-fields">
        <label>
          <span>Date</span>
          <input type="date" value={date ?? ''} min={todayLocal()} disabled={disabled} onChange={(event) => setPart(event.target.value, time)} />
        </label>
        <label>
          <span>Time</span>
          <input type="time" value={time} disabled={disabled} onChange={(event) => setPart(date ?? todayLocal(), event.target.value)} />
        </label>
      </div>
      <div className="follow-up-scheduler-presets" aria-label="Quick follow-up times">
        <button type="button" disabled={disabled} onClick={() => onChange(presetValue(1, false))}>Tomorrow 9:00</button>
        <button type="button" disabled={disabled} onClick={() => onChange(presetValue(1, true))}>Next business day</button>
        <button type="button" disabled={disabled} onClick={() => onChange(presetValue(3, false))}>In 3 days</button>
      </div>
    </div>
  );
}

export function initialFollowUpValue() {
  return presetValue(1, false);
}

function presetValue(days: number, businessDay: boolean) {
  const value = new Date();
  value.setDate(value.getDate() + days);
  if (businessDay) {
    while (value.getDay() === 0 || value.getDay() === 6) value.setDate(value.getDate() + 1);
  }
  value.setHours(9, 0, 0, 0);
  return dateTimeLocal(value);
}

function todayLocal() {
  return dateTimeLocal(new Date()).slice(0, 10);
}

function dateTimeLocal(value: Date) {
  const pad = (num: number) => String(num).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}
