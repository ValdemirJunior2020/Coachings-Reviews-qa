import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/firebaseAdmin';

function presenceId(email:string){
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

export async function POST(req:Request){
  const s=await getSession();
  if(!s) return NextResponse.json({error:'Session expired.'},{status:401});
  try{
    const body=await req.json().catch(()=>({}));
    const page=String(body.page||'').slice(0,160);
    const activity=body.activity==='idle'?'idle':'active';
    await db().collection('presence').doc(presenceId(s.email)).set({
      email:s.email,
      name:s.name,
      role:s.role,
      center:s.center||null,
      page,
      activity,
      lastSeen:FieldValue.serverTimestamp(),
    },{merge:true});
    return NextResponse.json({ok:true});
  }catch(e){
    return NextResponse.json({error:e instanceof Error?e.message:'Presence update failed.'},{status:500});
  }
}

export async function GET(){
  const s=await getSession();
  if(!s||s.role!=='admin') return NextResponse.json({error:'Admin access required.'},{status:403});
  try{
    const snap=await db().collection('presence').get();
    const now=Date.now();
    const users=snap.docs.map(doc=>{
      const d=doc.data();
      const ts=d.lastSeen as Timestamp|undefined;
      const lastSeen=ts?.toDate?.()||null;
      const ageMs=lastSeen?now-lastSeen.getTime():Number.POSITIVE_INFINITY;
      let status:'online'|'idle'|'offline'='offline';
      if(ageMs<=90_000 && d.activity!=='idle') status='online';
      else if(ageMs<=5*60_000) status='idle';
      return {
        id:doc.id,
        email:String(d.email||''),
        name:String(d.name||d.email||''),
        role:d.role==='admin'?'admin':'center',
        center:d.center||'',
        page:String(d.page||''),
        status,
        lastSeen:lastSeen?.toISOString()||'',
      };
    }).sort((a,b)=>{
      const rank={online:0,idle:1,offline:2};
      return rank[a.status]-rank[b.status] || a.name.localeCompare(b.name);
    });
    return NextResponse.json({users});
  }catch(e){
    return NextResponse.json({error:e instanceof Error?e.message:'Unable to read presence.'},{status:500});
  }
}

export async function DELETE(){
  const s=await getSession();
  if(!s) return NextResponse.json({ok:true});
  try{
    await db().collection('presence').doc(presenceId(s.email)).delete();
    return NextResponse.json({ok:true});
  }catch{
    return NextResponse.json({ok:true});
  }
}
