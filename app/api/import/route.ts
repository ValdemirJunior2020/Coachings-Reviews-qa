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

type ImportRow={
  callId:string;
  qa:Record<string,unknown>;
  initialCoaching:Record<string,unknown>;
};

export async function POST(req:Request){
 const session=await getSession();
 if(!session||session.role!=='admin')return NextResponse.json({error:'Admin access required.'},{status:403});
 try{
  const form=await req.formData(); const file=form.get('file');
  if(!(file instanceof File))return NextResponse.json({error:'Choose an Excel file.'},{status:400});
  if(!/\.xlsx?$/i.test(file.name))return NextResponse.json({error:'Only .xlsx or .xls files are accepted.'},{status:400});

  const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true});
  const scoreByCallId=new Map<string,{finalScore:number;scorePassFail:string;scoreMarkdowns:string}>();
  const scoreWs=wb.Sheets['Scores'];
  if(scoreWs){
   const scoreRaw=XLSX.utils.sheet_to_json<unknown[]>(scoreWs,{header:1,defval:''});
   const scoreHeaderIndex=scoreRaw.findIndex(r=>r.some(v=>s(v).toLowerCase()==='final score')&&r.some(v=>s(v).toLowerCase()==='call id'));
   if(scoreHeaderIndex>=0){
    const scoreHeaders=scoreRaw[scoreHeaderIndex].map(v=>s(v).toLowerCase());
    const idx=(name:string)=>scoreHeaders.findIndex(h=>h===name.toLowerCase());
    const callIdIx=idx('Call ID');
    const finalScoreIx=idx('Final Score');
    const passFailIx=idx('Pass/Fail');
    const markdownsIx=idx('Markdowns');
    for(const row of scoreRaw.slice(scoreHeaderIndex+1)){
      const callId=s(row[callIdIx]);
      if(!callId)continue;
      const rawScore=row[finalScoreIx];
      const n=typeof rawScore==='number'?rawScore:Number(String(rawScore??'').replace('%','').trim());
      if(!Number.isFinite(n))continue;
      scoreByCallId.set(callId,{finalScore:n,scorePassFail:s(row[passFailIx]),scoreMarkdowns:s(row[markdownsIx])});
    }
   }
  }
  const imports:ImportRow[]=[];
  const seen=new Set<string>();
  let skipped=0;

  for(const center of centers){
   const ws=wb.Sheets[center]; if(!ws)continue;
   const raw=XLSX.utils.sheet_to_json<unknown[]>(ws,{header:1,defval:''});
   const hi=raw.findIndex(r=>r.some(v=>s(v).toLowerCase()==='call id')); if(hi<0)continue;
   const headers=raw[hi].map(s);
   const rows=raw.slice(hi+1).map(row=>Object.fromEntries(headers.map((h,i)=>[h,row[i]??''])) as Record<string,unknown>);

   for(const r of rows){
    const callId=s(r['Call ID']);
    const invalidCallId=!callId||['not identified','n/a','na','none'].includes(callId.toLowerCase())||callId.includes('/');
    if(invalidCallId){skipped++;continue}
    const itinerary=s(r['Booking Itinerary number']);
    if(!itinerary||['not identified','n/a','na','none'].includes(itinerary.toLowerCase())){skipped++;continue}
    if(seen.has(callId)){skipped++;continue}
    seen.add(callId);

    imports.push({
     callId,
     qa:{
      center,qaDate:date(r['Date']),itinerary,agent:s(r["Agent's name"]),callId,
      guestNeeded:s(r['What guest needed?']),happened:s(r['What happened?']),
      matrixProcess:s(r['The Correct Matrix Process']),businessImpact:s(r['Business impact']),
      quickCoaching:s(r['Quick Coaching']),callLength:s(r['Call Lenght']),
      callDate:date(r['Date-of-the-call']),callMonth:s(r['Call Month']),
      ...(scoreByCallId.get(callId)??{}),
      importedAt:FieldValue.serverTimestamp()
     },
     initialCoaching:{
      coached:bool(r['Coached?']),dateCoached:date(r['Date Coached']),
      coachedBy:s(r['Coached By']),coachingNotes:s(r['Coaching Response / Notes']),
      confirmationLink:s(r['Confirmation Link'])
     }
    });
   }
  }

  // One lightweight read replaces hundreds of sequential document reads.
  // This keeps Netlify's server function well below its execution timeout.
  const database=db();
  const existingSnap=await database.collection('reviews').select().get();
  const existingIds=new Set(existingSnap.docs.map(d=>d.id));

  let added=0,updated=0;
  const commits:Promise<FirebaseFirestore.WriteResult[]>[]=[];
  const BATCH_SIZE=400;

  for(let i=0;i<imports.length;i+=BATCH_SIZE){
   const batch=database.batch();
   for(const item of imports.slice(i,i+BATCH_SIZE)){
    const ref=database.collection('reviews').doc(item.callId);
    if(existingIds.has(item.callId)){
     batch.set(ref,item.qa,{merge:true});
     updated++;
    }else{
     batch.set(ref,{...item.qa,...item.initialCoaching},{merge:true});
     added++;
    }
   }
   commits.push(batch.commit());
  }
  await Promise.all(commits);

  return NextResponse.json({added,updated,skipped,scored:scoreByCallId.size});
 }catch(e){
  console.error('import',e);
  return NextResponse.json({error:e instanceof Error?e.message:'Import failed.'},{status:500});
 }
}
