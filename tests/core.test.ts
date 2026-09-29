import test from 'node:test';
import assert from 'node:assert/strict';
import { businessDaysOld, isOverdue } from '../lib/date';
import { canAccessCenter } from '../lib/permissions';
import { filterReviews, type ReviewFilters } from '../lib/filter';
import type { Review } from '../lib/types';

const base: Review = {
  center:'WNS',rowNumber:4,qaDate:'2026-09-21',itinerary:'H1',agent:'Agent A',callId:'CA1',guestNeeded:'refund',happened:'x',matrixProcess:'y',businessImpact:'z',quickCoaching:'Good Job',callLength:'5:00',callDate:'2026-09-20',callMonth:'September',coached:false,dateCoached:'',coachedBy:'',coachingNotes:'',confirmationLink:'',status:'Overdue',ageBusinessDays:5,positive:true,tlDisputed:false,disputeBy:'',disputeDate:'',disputeReason:''
};

test('overdue uses business days', () => {
  assert.equal(businessDaysOld('2026-09-25', new Date('2026-09-28T12:00:00')), 1);
  assert.equal(isOverdue('2026-09-01', true), false);
});

test('center role cannot access another center', () => {
  assert.equal(canAccessCenter({email:'wns@hp.com',name:'WNS',role:'center',center:'WNS'}, 'Buwelo'), false);
  assert.equal(canAccessCenter({email:'admin@hp.com',name:'Admin',role:'admin'}, 'Buwelo'), true);
});

test('filters combine search, center and status', () => {
  const reviews: Review[] = [base, {...base, center:'Buwelo', agent:'Agent B', callId:'CA2', itinerary:'H2', status:'Completed', coached:true}];
  const f: ReviewFilters = {search:'Agent A',center:'WNS',agent:'All',status:'Overdue',itinerary:'',callId:'',qaDate:'',callDate:'',coachedDate:'',range:'All',from:'',to:''};
  assert.equal(filterReviews(reviews,f,new Date('2026-09-28')).length,1);
});
