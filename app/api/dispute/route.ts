import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { submitSheetDispute } from '@/lib/sheetsDb';
import type { Center } from '@/lib/types';

const centers:Center[]=['Buwelo','WNS','Concentrix','Telus'];

export async function POST(req:Request){
  const session=await getSession();
  if(!session)return NextResponse.json({error:'Session expired.'},{status:401});
  if(session.role!=='center'||!session.center)return NextResponse.json({error:'Only a center TL can submit a dispute.'},{status:403});
  try{
    const b=await req.json();
    const center=b.center as Center;
    const callId=String(b.callId||'').trim();
    const disputeBy=String(b.disputeBy||'').trim();
    const reason=String(b.reason||'').trim();
    if(!centers.includes(center)||center!==session.center)return NextResponse.json({error:'You cannot dispute another center review.'},{status:403});
    if(!callId)return NextResponse.json({error:'Call ID is required.'},{status:400});
    if(!disputeBy)return NextResponse.json({error:'TL name is required.'},{status:400});
    if(reason.length<10)return NextResponse.json({error:'Please explain why you disagree with the QA review.'},{status:400});
    const out=await submitSheetDispute({center,callId,disputeBy,reason,actor:session.email});
    return NextResponse.json({review:out.review,sheetSynced:true,message:'TL dispute submitted for QA review.'});
  }catch(e){
    console.error('dispute',e);
    return NextResponse.json({error:e instanceof Error?e.message:'Unable to submit dispute.'},{status:500});
  }
}
