import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { decryptPassword, encryptPassword, getSession, hashPassword } from '@/lib/auth';
import { db } from '@/lib/firebaseAdmin';
import type { Center } from '@/lib/types';

const centers:Center[]=['Buwelo','WNS','Concentrix','Telus'];

type SystemAccount={
  id:string;
  name:string;
  role:'admin'|'center';
  center?:Center;
  emailKey:string;
  passwordKey:string;
};

const systemAccounts:SystemAccount[]=[
  {id:'system:valdemir',name:'Valdemir Gonçalves',role:'admin',emailKey:'ADMIN_VALDEMIR_EMAIL',passwordKey:'ADMIN_VALDEMIR_PASSWORD'},
  {id:'system:barbara',name:'Barbara Kalchik',role:'admin',emailKey:'ADMIN_BARBARA_EMAIL',passwordKey:'ADMIN_BARBARA_PASSWORD'},
  {id:'system:april',name:'April Grantham',role:'admin',emailKey:'ADMIN_APRIL_EMAIL',passwordKey:'ADMIN_APRIL_PASSWORD'},
  {id:'system:buwelo',name:'Buwelo',role:'center',center:'Buwelo',emailKey:'BUWELO_EMAIL',passwordKey:'BUWELO_PASSWORD'},
  {id:'system:wns',name:'WNS',role:'center',center:'WNS',emailKey:'WNS_EMAIL',passwordKey:'WNS_PASSWORD'},
  {id:'system:concentrix',name:'Concentrix',role:'center',center:'Concentrix',emailKey:'CONCENTRIX_EMAIL',passwordKey:'CONCENTRIX_PASSWORD'},
  {id:'system:telus',name:'Telus',role:'center',center:'Telus',emailKey:'TELUS_EMAIL',passwordKey:'TELUS_PASSWORD'},
];

function systemAccountData(a:SystemAccount){
  const email=String(process.env[a.emailKey]||'').trim();
  const password=String(process.env[a.passwordKey]||'');
  return email?{...a,email,password}:null;
}

function allSystemAccounts(){
  return systemAccounts.map(systemAccountData).filter((a):a is NonNullable<ReturnType<typeof systemAccountData>>=>Boolean(a));
}

function systemById(id:string){return allSystemAccounts().find(a=>a.id===id)}
function systemByEmail(email:string){return allSystemAccounts().find(a=>a.email.toLowerCase()===email.trim().toLowerCase())}

function publicUser(id:string,d:FirebaseFirestore.DocumentData,source:'managed'|'system'='managed'){
  return {
    id,
    name:String(d.name||''),
    email:String(d.email||''),
    role:d.role==='admin'?'admin':'center',
    center:d.center||'',
    active:d.active!==false,
    source,
    canReveal:source==='system'||typeof d.passwordCipher==='string',
    createdAt:d.createdAt?.toDate?.()?.toISOString?.()||'',
    updatedAt:d.updatedAt?.toDate?.()?.toISOString?.()||'',
  };
}

async function managedByEmail(email:string){
  const snap=await db().collection('loginUsers').where('emailLower','==',email.trim().toLowerCase()).limit(1).get();
  return snap.empty?null:snap.docs[0];
}

export async function GET(){
  const s=await getSession();
  if(!s||s.role!=='admin') return NextResponse.json({error:'Admin access required.'},{status:403});

  const snap=await db().collection('loginUsers').orderBy('emailLower').get();
  const managed=snap.docs.filter(d=>d.data().deleted!==true);
  const hiddenEmails=new Set(snap.docs.filter(d=>d.data().deleted===true).map(d=>String(d.data().emailLower||'')));

  const managedByLower=new Map(managed.map(d=>[String(d.data().emailLower||''),d]));
  const users=managed.map(d=>publicUser(d.id,d.data(),'managed'));

  for(const sys of allSystemAccounts()){
    const lower=sys.email.toLowerCase();
    if(managedByLower.has(lower)||hiddenEmails.has(lower))continue;
    users.push(publicUser(sys.id,{
      name:sys.name,email:sys.email,role:sys.role,center:sys.center||'',active:true
    },'system'));
  }

  users.sort((a,b)=>a.role===b.role?a.name.localeCompare(b.name):(a.role==='admin'?-1:1));
  return NextResponse.json({users});
}

export async function POST(req:Request){
  const s=await getSession();
  if(!s||s.role!=='admin') return NextResponse.json({error:'Admin access required.'},{status:403});
  try{
    const b=await req.json();

    if(b.action==='revealPassword'){
      const id=String(b.id||'');
      if(id.startsWith('system:')){
        const sys=systemById(id);
        if(!sys) return NextResponse.json({error:'Login not found.'},{status:404});
        return NextResponse.json({password:sys.password});
      }
      const ref=db().collection('loginUsers').doc(id);
      const snap=await ref.get();
      if(!snap.exists||snap.data()?.deleted===true) return NextResponse.json({error:'Login not found.'},{status:404});
      const cipher=String(snap.data()?.passwordCipher||'');
      const password=cipher?decryptPassword(cipher):null;
      if(!password) return NextResponse.json({error:'This older managed password was stored as a one-way hash and cannot be shown. Use Edit to set a new password once; after that the Show button will work.'},{status:409});
      return NextResponse.json({password});
    }

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

    const existing=await managedByEmail(email);
    if(existing&&existing.data().deleted!==true) return NextResponse.json({error:'That email already exists.'},{status:409});

    const ref=existing?.ref||db().collection('loginUsers').doc();
    await ref.set({
      name,email,emailLower,role,center:role==='center'?center:null,
      active:true,deleted:false,passwordHash:hashPassword(password),passwordCipher:encryptPassword(password),
      createdAt:existing?existing.data().createdAt||FieldValue.serverTimestamp():FieldValue.serverTimestamp(),
      updatedAt:FieldValue.serverTimestamp(),
      createdBy:existing?existing.data().createdBy||s.email:s.email,updatedBy:s.email,
    },{merge:true});
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

    let ref:FirebaseFirestore.DocumentReference;
    let old:FirebaseFirestore.DocumentData={};
    let systemPassword='';

    if(id.startsWith('system:')){
      const sys=systemById(id);
      if(!sys) return NextResponse.json({error:'Login not found.'},{status:404});
      systemPassword=sys.password;
      const existing=await managedByEmail(sys.email);
      ref=existing?.ref||db().collection('loginUsers').doc();
      old=existing?.data()||{name:sys.name,email:sys.email,role:sys.role,center:sys.center||'',active:true};
    }else{
      ref=db().collection('loginUsers').doc(id);
      const snap=await ref.get();
      if(!snap.exists) return NextResponse.json({error:'Login not found.'},{status:404});
      old=snap.data()||{};
    }

    const name=String(b.name??old.name??'').trim();
    const email=String(b.email??old.email??'').trim();
    const emailLower=email.toLowerCase();
    const role=b.role==='admin'?'admin':'center';
    const centerRaw=String(b.center||'');
    const center=centers.includes(centerRaw as Center)?centerRaw as Center:undefined;
    if(!name||!email||!email.includes('@')) return NextResponse.json({error:'Name and a valid email are required.'},{status:400});
    if(role==='center'&&(!center||!centers.includes(center))) return NextResponse.json({error:'Select a valid call center.'},{status:400});

    const duplicate=await db().collection('loginUsers').where('emailLower','==',emailLower).get();
    if(duplicate.docs.some(d=>d.id!==ref.id&&d.data().deleted!==true)) return NextResponse.json({error:'That email already exists.'},{status:409});

    const update:Record<string,unknown>={
      name,email,emailLower,role,center:role==='center'?center:null,
      active:b.active!==false,deleted:false,updatedAt:FieldValue.serverTimestamp(),updatedBy:s.email,
    };

    let password=String(b.password||'');
    if(!password&&id.startsWith('system:')&&!old.passwordHash)password=systemPassword;
    if(password){
      if(password.length<8) return NextResponse.json({error:'Password must be at least 8 characters.'},{status:400});
      update.passwordHash=hashPassword(password);
      update.passwordCipher=encryptPassword(password);
    }

    if(id.startsWith('system:')&&!old.createdAt){
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

    if(id.startsWith('system:')){
      const sys=systemById(id);
      if(!sys) return NextResponse.json({error:'Login not found.'},{status:404});
      const existing=await managedByEmail(sys.email);
      const ref=existing?.ref||db().collection('loginUsers').doc();
      await ref.set({
        name:sys.name,email:sys.email,emailLower:sys.email.toLowerCase(),role:sys.role,center:sys.center||null,
        active:false,deleted:true,passwordHash:hashPassword(sys.password),passwordCipher:encryptPassword(sys.password),
        updatedAt:FieldValue.serverTimestamp(),updatedBy:s.email,
        createdAt:existing?existing.data().createdAt||FieldValue.serverTimestamp():FieldValue.serverTimestamp(),
        createdBy:existing?existing.data().createdBy||s.email:s.email,
      },{merge:true});
      return NextResponse.json({ok:true});
    }

    const ref=db().collection('loginUsers').doc(id);
    const snap=await ref.get();
    if(!snap.exists) return NextResponse.json({error:'Login not found.'},{status:404});
    const email=String(snap.data()?.email||'');
    const sys=systemByEmail(email);
    if(sys){
      await ref.set({active:false,deleted:true,updatedAt:FieldValue.serverTimestamp(),updatedBy:s.email},{merge:true});
    }else{
      await ref.delete();
    }
    return NextResponse.json({ok:true});
  }catch(e){
    return NextResponse.json({error:e instanceof Error?e.message:'Unable to delete login.'},{status:500});
  }
}
