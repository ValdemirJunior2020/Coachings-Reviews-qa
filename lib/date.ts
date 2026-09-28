export const OVERDUE_BUSINESS_DAYS = 2;

function parseDate(value: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function businessDaysOld(value: string, now = new Date()) {
  const start = parseDate(value);
  if (!start) return 0;
  let count = 0;
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(0, 0, 0, 0);
  while (cursor < end) {
    cursor.setDate(cursor.getDate() + 1);
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

export function isOverdue(qaDate: string, coached: boolean) {
  return !coached && businessDaysOld(qaDate) > OVERDUE_BUSINESS_DAYS;
}
