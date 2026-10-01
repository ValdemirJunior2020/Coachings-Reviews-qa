import { FieldValue } from 'firebase-admin/firestore';
import { db } from './firebaseAdmin';
import type { Center, Review } from './types';
import { businessDaysOld, isOverdue } from './date';

const CENTERS: Center[] = ['Buwelo','WNS','Concentrix','Telus'];

function toReview(data: Record<string, unknown>): Review {
  const coached = Boolean(data.coached);
  const qaDate = String(data.qaDate ?? '');
  return {
    center: data.center as Center,
    rowNumber: Number(data.rowNumber ?? 0),
    qaDate,
    itinerary: String(data.itinerary ?? ''),
    agent: String(data.agent ?? ''),
    callId: String(data.callId ?? ''),
    guestNeeded: String(data.guestNeeded ?? ''),
    happened: String(data.happened ?? ''),
    matrixProcess: String(data.matrixProcess ?? ''),
    businessImpact: String(data.businessImpact ?? ''),
    quickCoaching: String(data.quickCoaching ?? ''),
    callLength: String(data.callLength ?? ''),
    callDate: String(data.callDate ?? ''),
    callMonth: String(data.callMonth ?? ''),
    coached,
    dateCoached: String(data.dateCoached ?? ''),
    coachedBy: String(data.coachedBy ?? ''),
    coachingNotes: String(data.coachingNotes ?? ''),
    confirmationLink: String(data.confirmationLink ?? ''),
    status: coached ? 'Completed' : isOverdue(qaDate, false) ? 'Overdue' : 'Pending',
    ageBusinessDays: businessDaysOld(qaDate),
    positive: /good job|positive/i.test(String(data.quickCoaching ?? '')+' '+String(data.businessImpact ?? '')),
    tlDisputed: Boolean(data.tlDisputed),
    disputeBy: String(data.disputeBy ?? ''),
    disputeDate: String(data.disputeDate ?? ''),
    disputeReason: String(data.disputeReason ?? ''),
    finalScore: typeof data.finalScore==='number' ? data.finalScore : null,
    scorePassFail: String(data.scorePassFail ?? ''),
    scoreMarkdowns: String(data.scoreMarkdowns ?? ''),
    scoreIssues: Array.isArray(data.scoreIssues) ? data.scoreIssues.map(String) : [],
  };
}

export async function getReviews(center?: Center) {
  let q: FirebaseFirestore.Query = db().collection('reviews');
  if (center) q = q.where('center','==',center);
  const snap = await q.get();
  return snap.docs.map(d=>toReview(d.data())).filter(r=>r.callId);
}

export async function updateCoaching(args:{
  center:Center; callId:string; coached:boolean; dateCoached?:string;
  coachedBy?:string; notes?:string; actor:string; role:string;
}) {
  const ref=db().collection('reviews').doc(args.callId);
  const snap=await ref.get();
  if(!snap.exists) throw new Error('Review no longer exists');
  const old=snap.data() as Record<string,unknown>;
  if(old.center!==args.center) throw new Error('Wrong center for this review');

  const next={
    coached:args.coached,
    dateCoached:args.coached ? (args.dateCoached||new Date().toISOString().slice(0,10)) : '',
    coachedBy:args.coached ? (args.coachedBy||'') : '',
    coachingNotes:args.coached ? (args.notes||'') : '',
    updatedAt:FieldValue.serverTimestamp(),
  };
  await ref.update(next);
  await db().collection('coachingAudit').add({
    timestamp:FieldValue.serverTimestamp(), user:args.actor, role:args.role,
    center:args.center, callId:args.callId,
    action:args.coached ? (Boolean(old.coached)?'COACHING_EDITED':'COACHING_COMPLETED') : 'COACHING_REOPENED',
    oldValue:{coached:Boolean(old.coached),dateCoached:old.dateCoached||'',coachedBy:old.coachedBy||'',notes:old.coachingNotes||''},
    newValue:next,
  });
  const updated=await ref.get();
  return toReview(updated.data() as Record<string,unknown>);
}


export async function disputeReview(args:{
  center:Center; callId:string; disputeBy:string; reason:string; actor:string;
}) {
  const ref=db().collection('reviews').doc(args.callId);
  const snap=await ref.get();
  if(!snap.exists) throw new Error('Review no longer exists');
  const old=snap.data() as Record<string,unknown>;
  if(old.center!==args.center) throw new Error('Wrong center for this review');
  if(Boolean(old.tlDisputed)) throw new Error('This review is already disputed.');

  const next={
    tlDisputed:true,
    disputeBy:args.disputeBy.trim(),
    disputeDate:new Date().toISOString().slice(0,10),
    disputeReason:args.reason.trim(),
    disputeSubmittedAt:FieldValue.serverTimestamp(),
    updatedAt:FieldValue.serverTimestamp(),
  };
  await ref.update(next);
  await db().collection('coachingAudit').add({
    timestamp:FieldValue.serverTimestamp(),user:args.actor,role:'center',
    center:args.center,callId:args.callId,action:'TL_DISPUTED',
    oldValue:{tlDisputed:Boolean(old.tlDisputed)},
    newValue:next,
  });
  const updated=await ref.get();
  return toReview(updated.data() as Record<string,unknown>);
}

export { CENTERS };
