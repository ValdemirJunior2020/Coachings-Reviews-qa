import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { getSession } from '@/lib/auth';
import { importCenterRows, replaceScores } from '@/lib/sheetsDb';
import type { Center } from '@/lib/types';

const centers:Center[]=['Buwelo','Concentrix','WNS','Telus'];
const s=(v:unknown)=>String(v??'').trim();
const date=(v:unknown)=>{
  if(!v)return '';
  if(v instanceof Date)return v.toISOString().slice(0,10);
  if(typeof v==='number'){const d=new Date(Date.UTC(1899,11,30)+v*86400000);return d.toISOString().slice(0,10)}
  const d=new Date(String(v));return Number.isNaN(d.getTime())?s(v):d.toISOString().slice(0,10);
};

function normalizeRows(headers:string[],rows:unknown[][]){
  const callIx=headers.findIndex(h=>h.toLowerCase()==='call id');
  const itineraryIx=headers.findIndex(h=>h.toLowerCase()==='booking itinerary number');
  const dateCols=new Set(['date','date-of-the-call','date coached']);
  let skipped=0;
  const out:unknown[][]=[];
  const seen=new Set<string>();
  for(const row of rows){
    const callId=s(row[callIx]);
    const itinerary=s(row[itineraryIx]);
    const badId=!callId||['not identified','n/a','na','none'].includes(callId.toLowerCase())||callId.includes('/');
    const badItinerary=!itinerary||['not identified','n/a','na','none'].includes(itinerary.toLowerCase());
    if(badId||badItinerary||seen.has(callId)){skipped++;continue}
    seen.add(callId);
    out.push(headers.map((h,i)=>dateCols.has(h.toLowerCase())?date(row[i]):row[i]??''));
  }
  return {rows:out,skipped};
}

export async function POST(req:Request){
  const session=await getSession();
  if(!session||session.role!=='admin')return NextResponse.json({error:'Admin access required.'},{status:403});
  try{
    const form=await req.formData();
    const file=form.get('file');
    if(!(file instanceof File))return NextResponse.json({error:'Choose an Excel file.'},{status:400});
    if(!/\.xlsx?$/i.test(file.name))return NextResponse.json({error:'Only .xlsx or .xls files are accepted.'},{status:400});

    const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true});
    let added=0,updated=0,skipped=0;

    for(const center of centers){
      const ws=wb.Sheets[center];
      if(!ws)continue;
      const raw=XLSX.utils.sheet_to_json<unknown[]>(ws,{header:1,defval:''});
      const hi=raw.findIndex(r=>r.some(v=>s(v).toLowerCase()==='call id'));
      if(hi<0)continue;
      const headers=raw[hi].map(s);
      const normalized=normalizeRows(headers,raw.slice(hi+1));
      skipped+=normalized.skipped;
      const BATCH=150;
      for(let i=0;i<normalized.rows.length;i+=BATCH){
        const result=await importCenterRows(center,headers,normalized.rows.slice(i,i+BATCH));
        added+=Number(result.added||0);
        updated+=Number(result.updated||0);
        skipped+=Number(result.skipped||0);
      }
    }

    let scored=0;
    const scoreWs=wb.Sheets['Scores'];
    if(scoreWs){
      const scoreRaw=XLSX.utils.sheet_to_json<unknown[]>(scoreWs,{header:1,defval:''});
      const result=await replaceScores(scoreRaw);
      scored=Number(result.written||0);
    }

    return NextResponse.json({added,updated,skipped,scored,source:'google-sheet'});
  }catch(e){
    console.error('import',e);
    return NextResponse.json({error:e instanceof Error?e.message:'Import failed.'},{status:500});
  }
}
