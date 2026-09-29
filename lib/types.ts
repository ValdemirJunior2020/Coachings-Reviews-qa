export type Center = 'Buwelo' | 'WNS' | 'Concentrix' | 'Telus';
export type Role = 'admin' | 'center';
export type ReviewStatus = 'Pending' | 'Completed' | 'Overdue';

export interface SessionUser {
  email: string;
  name: string;
  role: Role;
  center?: Center;
}

export interface Review {
  center: Center;
  rowNumber: number;
  qaDate: string;
  itinerary: string;
  agent: string;
  callId: string;
  guestNeeded: string;
  happened: string;
  matrixProcess: string;
  businessImpact: string;
  quickCoaching: string;
  callLength: string;
  callDate: string;
  callMonth: string;
  coached: boolean;
  dateCoached: string;
  coachedBy: string;
  coachingNotes: string;
  confirmationLink: string;
  status: ReviewStatus;
  ageBusinessDays: number;
  positive: boolean;
  tlDisputed: boolean;
  disputeBy: string;
  disputeDate: string;
  disputeReason: string;
}
