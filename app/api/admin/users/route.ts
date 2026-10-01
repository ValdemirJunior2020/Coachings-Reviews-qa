import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createManagedUser, deleteManagedUser, getManagedUsers, updateManagedUser } from '@/lib/sheetsDb';
import type { Center } from '@/lib/types';

const centers:Center[]=['Buwelo','WNS','Concentrix','Telus'];

type EnvUser={id:string;name:string;email:string;password:string;role:'admin'|'center';center:Center|''};
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
  return rows.filter(x=>Boolean(x.email&&x.password));
}
function envById(id:string){return envUsers().find(x=>x.id===id)}
function envByEmail(email:string){const n=email.trim().toLowerCase();return envUsers().find(x=>x.email.toLowerCase()===n)}
function cleanUser(u:any,source:'managed'|'env'){
  return {id:String(u.id),name:String(u.name||''),email:String(u.email||''),role:u.role==='admin'?'admin':'center',center:u.center||'',active:u.active!==false,source};
}

export async function GET(){
  const s=await getSession();
  if(!s||s.role!=='admin')return NextResponse.json({error:'Admin access required.'},{status:403});
  try{
    const managed=await getManagedUsers();
    const managedEmails=new Set(managed.map(u=>u.email.toLowerCase()));
    const deletedEmails=new Set(managed.filter(u=>u.deleted).map(u=>u.email.toLowerCase()));
    const users=[
      ...managed.filter(u=>!u.deleted).map(u=>cleanUser(u,'managed')),
      ...envUsers().filter(u=>!managedEmails.has(u.email.toLowerCase())&&!deletedEmails.has(u.email.toLowerCase())).map(u=>cleanUser(u,'env')),
    ].sort((a,b)=>a.email.localeCompare(b.email));
    return NextResponse.json({users});
  }catch(e){
    // Keep the original system logins visible even before DATABASE_URL is configured.
    return NextResponse.json({users:envUsers().map(u=>cleanUser(u,'env')),warning:e instanceof Error?e.message:'Database unavailable.'});
  }
}

export async function POST(req:Request){
  const s=await getSession();
  if(!s||s.role!=='admin')return NextResponse.json({error:'Admin access required.'},{status:403});
  try{
    const b=await req.json();
    const name=String(b.name||'').trim(),email=String(b.email||'').trim(),password=String(b.password||'');
    const role=b.role==='admin'?'admin':'center';
    const center=centers.includes(String(b.center||'') as Center)?String(b.center) as Center:'';
    if(!name||!email.includes('@'))return NextResponse.json({error:'Name and a valid email are required.'},{status:400});
    if(password.length<8)return NextResponse.json({error:'Password must be at least 8 characters.'},{status:400});
    if(role==='center'&&!center)return NextResponse.json({error:'Select a valid call center.'},{status:400});
    if(envByEmail(email))return NextResponse.json({error:'That email already exists.'},{status:409});
    const out=await createManagedUser({name,email,password,role,center,active:b.active!==false,actor:s.email});
    return NextResponse.json(out);
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Unable to create login.'},{status:500})}
}

export async function PATCH(req:Request){
  const s=await getSession();
  if(!s||s.role!=='admin')return NextResponse.json({error:'Admin access required.'},{status:403});
  try{
    const b=await req.json();
    const id=String(b.id||'');
    const env=envById(id);
    const name=String(b.name||env?.name||'').trim();
    const email=env?.email||String(b.email||'').trim();
    const role=b.role==='admin'?'admin':'center';
    const center=centers.includes(String(b.center||'') as Center)?String(b.center) as Center:'';
    let password=String(b.password||'');
    if(env&&!password)password=env.password;
    if(!name||!email.includes('@'))return NextResponse.json({error:'Name and a valid email are required.'},{status:400});
    if(role==='center'&&!center)return NextResponse.json({error:'Select a valid call center.'},{status:400});
    const out=await updateManagedUser({id:env?'':id,name,email,password,role,center,active:b.active!==false,actor:s.email});
    return NextResponse.json(out);
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Unable to update login.'},{status:500})}
}

export async function DELETE(req:Request){
  const s=await getSession();
  if(!s||s.role!=='admin')return NextResponse.json({error:'Admin access required.'},{status:403});
  try{
    const b=await req.json();
    const id=String(b.id||'');
    const env=envById(id);
    if(env){
      await deleteManagedUser({id:'',email:env.email,name:env.name,role:env.role,center:env.center,system:true,actor:s.email});
    }else{
      await deleteManagedUser({id,system:false,actor:s.email});
    }
    return NextResponse.json({ok:true});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Unable to delete login.'},{status:500})}
}
