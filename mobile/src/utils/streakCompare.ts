// One plain sentence comparing a running streak with the best earlier run
// under the same name — the quiet context next to the number.

const DAY = 86400;

function span(seconds: number) {
  const d = Math.floor(seconds / DAY);
  const h = Math.floor((seconds % DAY) / 3600);
  const m = Math.max(1, Math.floor((seconds % 3600) / 60));
  if (d > 0) return `${d} ${d === 1 ? 'day' : 'days'}${h ? ` ${h}h` : ''}`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// currentSeconds: the running run; previousBest: longest earlier run (0 if none).
export function compareToBest(currentSeconds: number, previousBest: number): string {
  if (previousBest <= 0) return 'First run';
  if (currentSeconds >= previousBest) return `Longest run yet · ${span(currentSeconds - previousBest)} past your best`;
  return `${span(previousBest - currentSeconds)} to pass your best`;
}
