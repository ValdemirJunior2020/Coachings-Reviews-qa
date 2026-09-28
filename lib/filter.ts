import type { Center, Review, ReviewStatus } from './types';

export interface ReviewFilters {
  search: string;
  center: 'All' | Center;
  agent: string;
  status: 'All' | ReviewStatus;
  itinerary: string;
  callId: string;
  qaDate: string;
  callDate: string;
  coachedDate: string;
  range: 'All' | 'Today' | 'This Week' | 'This Month' | 'Custom';
  from: string;
  to: string;
}

function inRange(dateValue: string, filters: ReviewFilters, now: Date) {
  if (filters.qaDate && dateValue !== filters.qaDate) return false;
  if (filters.range === 'All') return true;
  const d = new Date(`${dateValue}T12:00:00`);
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date(now);
  today.setHours(12, 0, 0, 0);

  if (filters.range === 'Today') return d.toDateString() === today.toDateString();
  if (filters.range === 'This Week') {
    const start = new Date(today);
    start.setDate(today.getDate() - today.getDay());
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return d >= start && d <= end;
  }
  if (filters.range === 'This Month') {
    return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
  }
  if (filters.range === 'Custom') {
    if (filters.from && dateValue < filters.from) return false;
    if (filters.to && dateValue > filters.to) return false;
  }
  return true;
}

export function filterReviews(reviews: Review[], filters: ReviewFilters, now = new Date()) {
  const q = filters.search.trim().toLowerCase();
  return reviews
    .filter((r) => {
      if (filters.center !== 'All' && r.center !== filters.center) return false;
      if (filters.agent !== 'All' && r.agent !== filters.agent) return false;
      if (filters.status !== 'All' && r.status !== filters.status) return false;
      if (filters.itinerary && !r.itinerary.toLowerCase().includes(filters.itinerary.toLowerCase())) return false;
      if (filters.callId && !r.callId.toLowerCase().includes(filters.callId.toLowerCase())) return false;
      if (filters.callDate && r.callDate !== filters.callDate) return false;
      if (filters.coachedDate && r.dateCoached !== filters.coachedDate) return false;
      if (q && ![
        r.center, r.agent, r.itinerary, r.callId, r.guestNeeded, r.happened,
        r.matrixProcess, r.businessImpact, r.quickCoaching, r.coachedBy, r.coachingNotes
      ].join(' ').toLowerCase().includes(q)) return false;
      return inRange(r.qaDate, filters, now);
    })
    .sort((a,b) =>
      ({Overdue:0, Pending:1, Completed:2}[a.status] -
       ({Overdue:0, Pending:1, Completed:2}[b.status])) ||
      b.qaDate.localeCompare(a.qaDate)
    );
}
