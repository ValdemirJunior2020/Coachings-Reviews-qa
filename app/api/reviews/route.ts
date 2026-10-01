import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/firebaseAdmin';
import { getReviews as getFirebaseReviews } from '@/lib/reviews';
import { getReviews as getSheetReviews } from '@/lib/googleSheets';
import type { Center } from '@/lib/types';

const map:Record<string,Center>={buwelo:'Buwelo',wns:'WNS',concentrix:'Concentrix',telus:'Telus'};
const centers:Center[]=['Buwelo','WNS','Concentrix','Telus'];

function clean(v:unknown){return String(v??'').trim()}
function score(v:unknown){
  if(v===''||v===null||v===undefined)return null;
  const n=Number(String(v).replace('%','').trim());
  return Number.isFinite(n)?n:null;
}
function reviewPayload(b:Record<string,unknown>){
  const center=clean(b.center) as Center;
  if(!centers.includes(center)) throw new Error('Select a valid call center.');
  const callId=clean(b.callId);
  if(!callId) throw new Error('Call ID is required.');
  return {
    center,
    qaDate:clean(b.qaDate),
    itinerary:clean(b.itinerary),
    agent:clean(b.agent),
    callId,
    guestNeeded:clean(b.guestNeeded),
    happened:clean(b.happened),
    matrixProcess:clean(b.matrixProcess),
    businessImpact:clean(b.businessImpact),
    quickCoaching:clean(b.quickCoaching),
    callLength:clean(b.callLength),
    callDate:clean(b.callDate),
    callMonth:clean(b.callMonth),
    finalScore:score(b.finalScore),
    scorePassFail:clean(b.scorePassFail),
    scoreMarkdowns:clean(b.scoreMarkdowns),
    updatedAt:FieldValue.serverTimestamp(),
  };
}

export async function GET(req:Request){
  const s=await getSession();
  if(!s) return NextResponse.json({error:'Session expired.'},{status:401});
  try{
    const q=new URL(req.url).searchParams.get('center');
    let center:Center|undefined;
    if(s.role==='center') center=s.center;
    else if(q) center=map[q.toLowerCase()];
    try{
      const firebaseReviews=await getFirebaseReviews(center);
      if(firebaseReviews.length>0){
        return NextResponse.json({reviews:firebaseReviews,source:'firebase'});
      }
      console.warn('Firebase returned zero reviews; using Daily Findings recovery source.');
      const reviews=await getSheetReviews(center);
      return NextResponse.json({reviews,source:'google-sheets-recovery',warning:'Firebase returned no reviews; coaching history was recovered from the Daily Findings sheet and its saved coaching row highlights.'});
    }catch(firebaseError){
      console.error('reviews firebase failed; using Google Sheet recovery',firebaseError);
      const reviews=await getSheetReviews(center);
      return NextResponse.json({reviews,source:'google-sheets-recovery',warning:'Firebase unavailable; coaching history was recovered from the Daily Findings sheet and its saved coaching row highlights.'});
    }
  }catch(e){console.error('reviews',e);return NextResponse.json({error:'Unable to load coaching reviews from Firebase or Google Sheets.'},{status:503})}
}

export async function POST(req:Request){
  const s=await getSession();
  if(!s||s.role!=='admin') return NextResponse.json({error:'Admin access required.'},{status:403});
  try{
    const b=await req.json();
    const payload=reviewPayload(b);
    const ref=db().collection('reviews').doc(payload.callId);
    if((await ref.get()).exists) return NextResponse.json({error:'A review with that Call ID already exists.'},{status:409});
    await ref.set({
      ...payload,
      coached:false,dateCoached:'',coachedBy:'',coachingNotes:'',confirmationLink:'',
      tlDisputed:false,disputeBy:'',disputeDate:'',disputeReason:'',
      createdAt:FieldValue.serverTimestamp(),createdBy:s.email,
    });
    return NextResponse.json({ok:true});
  }catch(e){
    return NextResponse.json({error:e instanceof Error?e.message:'Unable to add review.'},{status:400});
  }
}

export async function PATCH(req:Request){
  const s=await getSession();
  if(!s||s.role!=='admin') return NextResponse.json({error:'Admin access required.'},{status:403});
  try{
    const b=await req.json();
    const originalCallId=clean(b.originalCallId||b.callId);
    if(!originalCallId) return NextResponse.json({error:'Original Call ID is required.'},{status:400});
    const oldRef=db().collection('reviews').doc(originalCallId);
    const snap=await oldRef.get();
    if(!snap.exists) return NextResponse.json({error:'Review not found.'},{status:404});
    const payload=reviewPayload(b);
    const data={...payload,updatedBy:s.email};

    if(payload.callId===originalCallId){
      await oldRef.set(data,{merge:true});
    }else{
      const newRef=db().collection('reviews').doc(payload.callId);
      if((await newRef.get()).exists) return NextResponse.json({error:'Another review already uses that Call ID.'},{status:409});
      const batch=db().batch();
      batch.set(newRef,{...snap.data(),...data});
      batch.delete(oldRef);
      batch.set(db().collection('reviewAudit').doc(),{
        action:'REVIEW_CALL_ID_CHANGED',from:originalCallId,to:payload.callId,actor:s.email,timestamp:FieldValue.serverTimestamp()
      });
      await batch.commit();
    }
    return NextResponse.json({ok:true});
  }catch(e){
    return NextResponse.json({error:e instanceof Error?e.message:'Unable to edit review.'},{status:400});
  }
}

export async function DELETE(req:Request){
  const s=await getSession();
  if(!s||s.role!=='admin') return NextResponse.json({error:'Admin access required.'},{status:403});
  try{
    const b=await req.json();
    const callId=clean(b.callId);
    if(!callId) return NextResponse.json({error:'Call ID is required.'},{status:400});
    const ref=db().collection('reviews').doc(callId);
    const snap=await ref.get();
    if(!snap.exists) return NextResponse.json({error:'Review not found.'},{status:404});

    const batch=db().batch();
    batch.delete(ref);
    batch.set(db().collection('reviewAudit').doc(),{
      action:'REVIEW_PERMANENTLY_DELETED',
      callId,
      center:snap.data()?.center||'',
      itinerary:snap.data()?.itinerary||'',
      agent:snap.data()?.agent||'',
      actor:s.email,
      timestamp:FieldValue.serverTimestamp(),
    });
    await batch.commit();
    return NextResponse.json({ok:true});
  }catch(e){
    return NextResponse.json({error:e instanceof Error?e.message:'Unable to delete review.'},{status:500});
  }
}
