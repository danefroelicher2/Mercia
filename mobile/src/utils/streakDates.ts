// "Sep 23" — with the year only when it isn't this year ("Dec 28, 2025").
export function dayLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('en-US', opts);
}

// "Sep 23 at 9:58 PM" — same year rule.
export function dayTimeLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${dayLabel(iso, now)} at ${time}`;
}
