import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { decryptPassword, encryptPassword, getSession, hashPassword } from '@/lib/auth';
import { db } from '@/lib/firebaseAdmin';
import type { Center } from '@/lib/types';

const centers:Center[]=['Buwelo','WNS','Concentrix','Telus'];

type EnvUser={
  id:string;
  name:string;
  email:string;
  password:string;
  role:'admin'|'center';
  center:Center|'';
};

function envUsers():EnvUser[]{
  const rows:EnvUser[]=[
    {id:'env:valdemir',name:'Valdemir Gonçalves',email:process.env.ADMIN_VALDEMIR_EMAIL||'',password:process.env.ADMIN_VALDEMIR_PASSWORD||'',role:'admin',center:''},
    {id:'env:barbara',name:'Barbara Kalchik',email:process.env.ADMIN_BARBARA_EMAIL||'',password:process.env.ADMIN_BARBARA_PASSWORD||'',role:'admin',center:''},
    {id:'env:april',name:'April Grantham',email:process.env.ADMIN_APRIL_EMAIL||'',password:process.env.ADMIN_APRIL_PASSWORD||'',role:'admin',center:''},
    {id:'env:buwelo',name:'Buwelo',email:process.env.BUWELO_EMAIL||'',password:process.env.BUWELO_PASSWORD||'',role:'center',center:'Buwelo'},
    {id:'env:wns',name:'WNS',email:process.env.WNS_EMAIL||'',password:process.env.WNS_PASSWORD||'',role:'center',center:'WNS'},
    {id:'env:concentrix',name:'Concentrix',email:process.env.CONCENTRIX_EMAIL||'',password:process.env.CONCENTRIX_PASSWORD||'',role:'center',center:'Concentrix'},
    {id:'env:telus',name:'Telus',email:process.env.TELUS_EMAIL||'',password:process.env.TELUS_PASSWORD||'',role:'center',center:'Telus'},
  ];
  return rows.filter(r=>r.email&&r.password);
}

function envById(id:string){return envUsers().find(r=>r.id===id)}
function envByEmail(email:string){const n=email.trim().toLowerCase();return envUsers().find(r=>r.email.trim().toLowerCase()===n)}

function publicUser(id:string,d:FirebaseFirestore.DocumentData,source:'managed'|'env'='managed'){
  return {
    id,
    name:String(d.name||''),
    email:String(d.email||''),
    role:d.role==='admin'?'admin':'center',
    center:d.center||'',
    active:d.active!==false,
    source,
    passwordCanReveal:source==='env'||typeof d.passwordEncrypted==='string',
    createdAt:d.createdAt?.toDate?.()?.toISOString?.()||'',
    updatedAt:d.updatedAt?.toDate?.()?.toISOString?.()||'',
  };
}

export async function GET(){
  const s=await getSession();
  if(!s||s.role!=='admin') return NextResponse.json({error:'Admin access required.'},{status:403});

  const snap=await db().collection('loginUsers').orderBy('emailLower').get();
  const allManaged=snap.docs.map(d=>({id:d.id,data:d.data()}));
  const managedEmails=new Set(allManaged.map(x=>String(x.data.emailLower||'').toLowerCase()));
  const deletedEmails=new Set(allManaged.filter(x=>x.data.deleted===true).map(x=>String(x.data.emailLower||'').toLowerCase()));

  const users=[
    ...allManaged.filter(x=>x.data.deleted!==true).map(x=>publicUser(x.id,x.data,'managed')),
    ...envUsers()
      .filter(e=>!managedEmails.has(e.email.toLowerCase())&&!deletedEmails.has(e.email.toLowerCase()))
      .map(e=>publicUser(e.id,e,'env')),
  ].sort((a,b)=>a.email.localeCompare(b.email));

  return NextResponse.json({users});
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
    if(role==='center'&&(!center||!centers.includes(center))) return NextResponse.json({error:'Select a valid call center.'},{status:400});
    const existing=await db().collection('loginUsers').where('emailLower','==',emailLower).limit(1).get();
    if(!existing.empty||envByEmail(email)) return NextResponse.json({error:'That email already exists.'},{status:409});

    const ref=db().collection('loginUsers').doc();
    await ref.set({
      name,email,emailLower,role,center:role==='center'?center:null,
      active:true,deleted:false,
      passwordHash:hashPassword(password),
      passwordEncrypted:encryptPassword(password),
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
    const env=envById(id);

    let ref:FirebaseFirestore.DocumentReference;
    let old:FirebaseFirestore.DocumentData={};

    if(env){
      const existing=await db().collection('loginUsers').where('emailLower','==',env.email.toLowerCase()).limit(1).get();
      ref=existing.empty?db().collection('loginUsers').doc():existing.docs[0].ref;
      old=existing.empty?{}:existing.docs[0].data();
    }else{
      ref=db().collection('loginUsers').doc(id);
      const snap=await ref.get();
      if(!snap.exists) return NextResponse.json({error:'Login not found.'},{status:404});
      old=snap.data()||{};
    }

    const name=String(b.name??old.name??env?.name??'').trim();
    const email=env?.email||String(b.email??old.email??'').trim();
    const emailLower=email.toLowerCase();
    const role=b.role==='admin'?'admin':'center';
    const centerRaw=String(b.center||'');
    const center=centers.includes(centerRaw as Center)?centerRaw as Center:undefined;
    if(!name||!email||!email.includes('@')) return NextResponse.json({error:'Name and a valid email are required.'},{status:400});
    if(role==='center'&&(!center||!centers.includes(center))) return NextResponse.json({error:'Select a valid call center.'},{status:400});

    if(!env){
      const duplicate=await db().collection('loginUsers').where('emailLower','==',emailLower).get();
      if(duplicate.docs.some(d=>d.id!==id)) return NextResponse.json({error:'That email already exists.'},{status:409});
      const system=envByEmail(email);
      if(system&&String(old.emailLower||'')!==emailLower) return NextResponse.json({error:'That email belongs to an existing system login.'},{status:409});
    }

    const update:Record<string,unknown>={
      name,email,emailLower,role,center:role==='center'?center:null,
      active:b.active!==false,deleted:false,
      updatedAt:FieldValue.serverTimestamp(),updatedBy:s.email,
    };

    const password=String(b.password||'');
    if(password){
      if(password.length<8) return NextResponse.json({error:'Password must be at least 8 characters.'},{status:400});
      update.passwordHash=hashPassword(password);
      update.passwordEncrypted=encryptPassword(password);
    }else if(env&&typeof old.passwordHash!=='string'){
      update.passwordHash=hashPassword(env.password);
      update.passwordEncrypted=encryptPassword(env.password);
    }

    if(env&&typeof old.createdAt==='undefined'){
      update.createdAt=FieldValue.serverTimestamp();
      update.createdBy=s.email;
    }

    await ref.set(update,{merge:true});
    const saved=await ref.get();
    return NextResponse.json({user:publicUser(ref.id,saved.data()||{})});
  }catch(e){
    return NextResponse.json({error:e instanceof Error?e.message:'Unable to update login.'},{status:500});
  }
}

export async function DELETE(req:Request){
  const s=await getSession();
  if(!s||s.role!=='admin') return NextResponse.json({error:'Admin access required.'},{status:403});
  try{
    const b=await req.json();
    const id=String(b.id||'');
    if(!id) return NextResponse.json({error:'Login id is required.'},{status:400});

    const env=envById(id);
    if(env){
      const existing=await db().collection('loginUsers').where('emailLower','==',env.email.toLowerCase()).limit(1).get();
      const ref=existing.empty?db().collection('loginUsers').doc():existing.docs[0].ref;
      await ref.set({
        name:env.name,email:env.email,emailLower:env.email.toLowerCase(),role:env.role,center:env.center||null,
        active:false,deleted:true,passwordHash:hashPassword(env.password),
        updatedAt:FieldValue.serverTimestamp(),updatedBy:s.email,
      },{merge:true});
      return NextResponse.json({ok:true});
    }

    const ref=db().collection('loginUsers').doc(id);
    const snap=await ref.get();
    if(!snap.exists) return NextResponse.json({error:'Login not found.'},{status:404});
    const d=snap.data()||{};
    const system=envByEmail(String(d.email||''));
    if(system){
      await ref.set({active:false,deleted:true,updatedAt:FieldValue.serverTimestamp(),updatedBy:s.email},{merge:true});
    }else{
      await ref.delete();
    }
    return NextResponse.json({ok:true});
  }catch(e){
    return NextResponse.json({error:e instanceof Error?e.message:'Unable to delete login.'},{status:500});
  }
}

export async function PUT(req:Request){
  const s=await getSession();
  if(!s||s.role!=='admin') return NextResponse.json({error:'Admin access required.'},{status:403});
  try{
    const b=await req.json();
    const id=String(b.id||'');
    const env=envById(id);
    if(env) return NextResponse.json({password:env.password});

    const snap=await db().collection('loginUsers').doc(id).get();
    if(!snap.exists) return NextResponse.json({error:'Login not found.'},{status:404});
    const encrypted=String(snap.data()?.passwordEncrypted||'');
    const password=encrypted?decryptPassword(encrypted):null;
    if(!password) return NextResponse.json({error:'This older managed password was stored as a one-way hash. Set a new password once, then Show will work.'},{status:409});
    return NextResponse.json({password});
  }catch(e){
    return NextResponse.json({error:e instanceof Error?e.message:'Unable to reveal password.'},{status:500});
  }
}
