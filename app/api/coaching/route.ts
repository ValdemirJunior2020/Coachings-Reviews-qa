import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { updateCoaching } from '@/lib/reviews';
import { canEditCenter } from '@/lib/permissions';
import type { Center } from '@/lib/types';

const centers:Center[]=['Buwelo','WNS','Concentrix','Telus'];
export async function PATCH(req:Request){
  const s=await getSession();
  if(!s) return NextResponse.json({error:'Session expired.'},{status:401});
  try{
    const b=await req.json();
    const center=b.center as Center;
    if(!centers.includes(center)) return NextResponse.json({error:'Invalid call center.'},{status:400});
    if(!canEditCenter(s,center)) return NextResponse.json({error:'You cannot modify another center.'},{status:403});
    const coached=Boolean(b.coached);
    if(coached&&(!b.coachedBy||!b.dateCoached)) return NextResponse.json({error:'Coached By and Date Coached are required.'},{status:400});
    const review=await updateCoaching({center,callId:String(b.callId||''),coached,dateCoached:b.dateCoached,coachedBy:b.coachedBy,notes:b.notes,actor:s.email,role:s.role});
    return NextResponse.json({review,message:coached?'Coaching saved successfully.':'Coaching reopened.'});
  }catch(e){
    console.error('coaching',e);
    return NextResponse.json({error:e instanceof Error?e.message:'Firebase update failed.'},{status:500});
  }
}
