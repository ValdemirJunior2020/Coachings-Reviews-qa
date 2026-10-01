import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { presenceDelete, presenceList, presencePing } from '@/lib/sheetsDb';

export async function POST(req:Request){
  const s=await getSession();
  if(!s)return NextResponse.json({error:'Session expired.'},{status:401});
  try{
    const body=await req.json().catch(()=>({}));
    await presencePing({
      email:s.email,name:s.name,role:s.role,center:s.center||'',
      page:String(body.page||'').slice(0,160),
      activity:body.activity==='idle'?'idle':'active'
    });
    return NextResponse.json({ok:true});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Presence update failed.'},{status:500})}
}

export async function GET(){
  const s=await getSession();
  if(!s||s.role!=='admin')return NextResponse.json({error:'Admin access required.'},{status:403});
  try{
    const data=await presenceList();
    return NextResponse.json({users:data.users||[]});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Unable to read presence.'},{status:500})}
}

export async function DELETE(){
  const s=await getSession();
  if(!s)return NextResponse.json({ok:true});
  try{await presenceDelete(s.email)}catch{}
  return NextResponse.json({ok:true});
}
