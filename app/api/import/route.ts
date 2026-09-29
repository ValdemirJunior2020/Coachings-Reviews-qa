import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { FieldValue } from 'firebase-admin/firestore';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/firebaseAdmin';
import type { Center } from '@/lib/types';

const centers:Center[]=['Buwelo','Concentrix','WNS','Telus'];
const s=(v:unknown)=>String(v??'').trim();
const date=(v:unknown)=>{if(!v)return '';if(v instanceof Date)return v.toISOString().slice(0,10);if(typeof v==='number'){const d=new Date(Date.UTC(1899,11,30)+v*86400000);return d.toISOString().slice(0,10)}const d=new Date(String(v));return Number.isNaN(d.getTime())?s(v):d.toISOString().slice(0,10)};
const bool=(v:unknown)=>typeof v==='boolean'?v:['true','yes','1','coached','completed'].includes(s(v).toLowerCase());

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req:Request){
 const session=await getSession();
 if(!session||session.role!=='admin')return NextResponse.json({error:'Admin access required.'},{status:403});
 try{
  const form=await req.formData(); const file=form.get('file');
  if(!(file instanceof File))return NextResponse.json({error:'Choose an Excel file.'},{status:400});
  if(!/\.xlsx?$/i.test(file.name))return NextResponse.json({error:'Only .xlsx or .xls files are accepted.'},{status:400});
  const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true});
  let added=0,updated=0,skipped=0;
  for(const center of centers){
   const ws=wb.Sheets[center]; if(!ws)continue;
   const raw=XLSX.utils.sheet_to_json<unknown[]>(ws,{header:1,defval:''});
   const hi=raw.findIndex(r=>r.some(v=>s(v).toLowerCase()==='call id')); if(hi<0)continue;
   const headers=raw[hi].map(s);
   const rows=raw.slice(hi+1).map(row=>Object.fromEntries(headers.map((h,i)=>[h,row[i]??''])) as Record<string,unknown>);
   for(const r of rows){
    const callId=s(r['Call ID']); if(!callId)continue;
    const itinerary=s(r['Booking Itinerary number']);
    if(!itinerary||['not identified','n/a','na','none'].includes(itinerary.toLowerCase())){skipped++;continue}
    const ref=db().collection('reviews').doc(callId);
    const qa={center,qaDate:date(r['Date']),itinerary,agent:s(r["Agent's name"]),callId,guestNeeded:s(r['What guest needed?']),happened:s(r['What happened?']),matrixProcess:s(r['The Correct Matrix Process']),businessImpact:s(r['Business impact']),quickCoaching:s(r['Quick Coaching']),callLength:s(r['Call Lenght']),callDate:date(r['Date-of-the-call']),callMonth:s(r['Call Month']),importedAt:FieldValue.serverTimestamp()};
    const result=await db().runTransaction(async tx=>{
      const old=await tx.get(ref);
      if(old.exists){tx.set(ref,qa,{merge:true});return 'updated' as const}
      tx.set(ref,{...qa,coached:bool(r['Coached?']),dateCoached:date(r['Date Coached']),coachedBy:s(r['Coached By']),coachingNotes:s(r['Coaching Response / Notes']),confirmationLink:s(r['Confirmation Link'])});
      return 'added' as const;
    });
    if(result==='added')added++;else updated++
   }
  }
  return NextResponse.json({added,updated,skipped});
 }catch(e){console.error('import',e);return NextResponse.json({error:e instanceof Error?e.message:'Import failed.'},{status:500})}
}
