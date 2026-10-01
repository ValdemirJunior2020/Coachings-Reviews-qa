import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { updateSheetCoaching } from '@/lib/sheetsDb';
import { canEditCenter } from '@/lib/permissions';
import type { Center } from '@/lib/types';

const centers:Center[]=['Buwelo','WNS','Concentrix','Telus'];

export async function PATCH(req:Request){
  const s=await getSession();
  if(!s)return NextResponse.json({error:'Session expired.'},{status:401});
  try{
    const b=await req.json();
    const center=b.center as Center;
    if(!centers.includes(center))return NextResponse.json({error:'Invalid call center.'},{status:400});
    if(!canEditCenter(s,center))return NextResponse.json({error:'You cannot modify another center.'},{status:403});
    const coached=Boolean(b.coached);
    if(coached&&(!b.coachedBy||!b.dateCoached))return NextResponse.json({error:'Coached By and Date Coached are required.'},{status:400});
    const callId=String(b.callId||'').trim();
    if(!callId)return NextResponse.json({error:'Call ID is required.'},{status:400});
    const out=await updateSheetCoaching({
      center,callId,coached,dateCoached:String(b.dateCoached||''),coachedBy:String(b.coachedBy||''),
      notes:String(b.notes||''),actor:s.email,role:s.role
    });
    return NextResponse.json({review:out.review,sheetSynced:true,message:coached?'Coaching saved successfully.':'Coaching reopened.'});
  }catch(e){
    console.error('coaching',e);
    return NextResponse.json({error:e instanceof Error?e.message:'Unable to update coaching in Daily-Findings.'},{status:500});
  }
}
