import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getSession, hashPassword } from '@/lib/auth';
import { db } from '@/lib/firebaseAdmin';
import type { Center } from '@/lib/types';

const centers:Center[]=['Buwelo','WNS','Concentrix','Telus'];

function publicUser(id:string,d:FirebaseFirestore.DocumentData){
  return {
    id,
    name:String(d.name||''),
    email:String(d.email||''),
    role:d.role==='admin'?'admin':'center',
    center:d.center||'',
    active:d.active!==false,
    createdAt:d.createdAt?.toDate?.()?.toISOString?.()||'',
    updatedAt:d.updatedAt?.toDate?.()?.toISOString?.()||'',
  };
}

export async function GET(){
  const s=await getSession();
  if(!s||s.role!=='admin') return NextResponse.json({error:'Admin access required.'},{status:403});
  const snap=await db().collection('loginUsers').orderBy('emailLower').get();
  return NextResponse.json({users:snap.docs.map(d=>publicUser(d.id,d.data()))});
}

export async function POST(req:Request){
  const s=await getSession();
  if(!s||s.role!=='admin') return NextResponse.json({error:'Admin access required.'},{status:403});
  try{
    const b=await req.json();
    const name=String(b.name||'').trim();
    const email=String(b.email||'').trim();
    const emailLower=email.toLowerCase();
    const role=b.role==='admin'?'admin':'center';
    const centerRaw=String(b.center||'');
    const center=centers.includes(centerRaw as Center)?centerRaw as Center:undefined;
    const password=String(b.password||'');
    if(!name||!email||!email.includes('@')) return NextResponse.json({error:'Name and a valid email are required.'},{status:400});
    if(password.length<8) return NextResponse.json({error:'Password must be at least 8 characters.'},{status:400});
    if(role==='center'&&!centers.includes(center)) return NextResponse.json({error:'Select a valid call center.'},{status:400});
    const existing=await db().collection('loginUsers').where('emailLower','==',emailLower).limit(1).get();
    if(!existing.empty) return NextResponse.json({error:'That email already exists.'},{status:409});
    const ref=db().collection('loginUsers').doc();
    await ref.set({
      name,email,emailLower,role,center:role==='center'?center:null,
      active:true,passwordHash:hashPassword(password),
      createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),
      createdBy:s.email,updatedBy:s.email,
    });
    const saved=await ref.get();
    return NextResponse.json({user:publicUser(ref.id,saved.data()||{})});
  }catch(e){
    return NextResponse.json({error:e instanceof Error?e.message:'Unable to create login.'},{status:500});
  }
}

export async function PATCH(req:Request){
  const s=await getSession();
  if(!s||s.role!=='admin') return NextResponse.json({error:'Admin access required.'},{status:403});
  try{
    const b=await req.json();
    const id=String(b.id||'');
    const ref=db().collection('loginUsers').doc(id);
    const snap=await ref.get();
    if(!snap.exists) return NextResponse.json({error:'Login not found.'},{status:404});
    const old=snap.data()||{};
    const name=String(b.name??old.name??'').trim();
    const email=String(b.email??old.email??'').trim();
    const emailLower=email.toLowerCase();
    const role=b.role==='admin'?'admin':'center';
    const centerRaw=String(b.center||'');
    const center=centers.includes(centerRaw as Center)?centerRaw as Center:undefined;
    if(!name||!email||!email.includes('@')) return NextResponse.json({error:'Name and a valid email are required.'},{status:400});
    if(role==='center'&&!centers.includes(center)) return NextResponse.json({error:'Select a valid call center.'},{status:400});
    const duplicate=await db().collection('loginUsers').where('emailLower','==',emailLower).get();
    if(duplicate.docs.some(d=>d.id!==id)) return NextResponse.json({error:'That email already exists.'},{status:409});
    const update:Record<string,unknown>={
      name,email,emailLower,role,center:role==='center'?center:null,
      active:b.active!==false,updatedAt:FieldValue.serverTimestamp(),updatedBy:s.email,
    };
    const password=String(b.password||'');
    if(password){
      if(password.length<8) return NextResponse.json({error:'Password must be at least 8 characters.'},{status:400});
      update.passwordHash=hashPassword(password);
    }
    await ref.update(update);
    const saved=await ref.get();
    return NextResponse.json({user:publicUser(id,saved.data()||{})});
  }catch(e){
    return NextResponse.json({error:e instanceof Error?e.message:'Unable to update login.'},{status:500});
  }
}
