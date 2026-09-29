import * as XLSX from 'xlsx';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const file=process.argv[2];
if(!file) throw new Error('Usage: npm run import:firebase -- "C:\\path\\Daily-Findings.xlsx"');

const projectId=process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const clientEmail=process.env.FIREBASE_CLIENT_EMAIL;
const privateKey=process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g,'\n');
if(!projectId||!clientEmail||!privateKey) throw new Error('Set NEXT_PUBLIC_FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY first.');

initializeApp({credential:cert({projectId,clientEmail,privateKey})});
const db=getFirestore();
const wb=XLSX.readFile(file,{cellDates:true});
const centers=['Buwelo','Concentrix','WNS','Telus'] as const;

const s=(v:unknown)=>String(v??'').trim();
const d=(v:unknown)=>{
  if(!v) return '';
  if(v instanceof Date) return v.toISOString().slice(0,10);
  const x=new Date(String(v));
  return Number.isNaN(x.getTime())?s(v):x.toISOString().slice(0,10);
};
const b=(v:unknown)=>typeof v==='boolean'?v:['true','yes','1','coached','completed'].includes(s(v).toLowerCase());

let imported=0, skipped=0;
for(const center of centers){
  const ws=wb.Sheets[center];
  if(!ws) continue;
  const raw=XLSX.utils.sheet_to_json<unknown[]>(ws,{header:1,defval:''});
  const headerIndex=raw.findIndex(row=>row.some(v=>s(v).toLowerCase()==='call id'));
  if(headerIndex<0){console.warn(center+': Call ID header not found');continue;}
  const headers=raw[headerIndex].map(s);
  const rows=raw.slice(headerIndex+1).map(row=>Object.fromEntries(headers.map((h,i)=>[h,row[i]??''])) as Record<string,unknown>);
  const normalized=rows.filter(r=>s(r['Call ID']));
  for(let i=0;i<normalized.length;i+=400){
    const batch=db.batch();
    for(const r of normalized.slice(i,i+400)){
      const callId=s(r['Call ID']);
      const itinerary=s(r['Booking Itinerary number']);
      if(!itinerary||['not identified','n/a','na','none'].includes(itinerary.toLowerCase())){skipped++;continue;}
      const doc={
        center, qaDate:d(r['Date']), itinerary, agent:s(r["Agent's name"]), callId,
        guestNeeded:s(r['What guest needed?']), happened:s(r['What happened?']),
        matrixProcess:s(r['The Correct Matrix Process']), businessImpact:s(r['Business impact']),
        quickCoaching:s(r['Quick Coaching']), callLength:s(r['Call Lenght']),
        callDate:d(r['Date-of-the-call']), callMonth:s(r['Call Month']),
        coached:b(r['Coached?']), dateCoached:d(r['Date Coached']), coachedBy:s(r['Coached By']),
        coachingNotes:s(r['Coaching Response / Notes']), confirmationLink:s(r['Confirmation Link']),
        importedAt:FieldValue.serverTimestamp(),
      };
      batch.set(db.collection('reviews').doc(callId),doc,{merge:true}); imported++;
    }
    await batch.commit();
  }
}
console.log(`Firebase import complete: ${imported} reviews imported, ${skipped} rows skipped because itinerary was not identified.`);
