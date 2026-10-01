import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { db } from './firebaseAdmin';
import type { Center, SessionUser } from './types';

const COOKIE = 'qa_session';
const MAX_AGE = 60 * 60 * 8;

const centerMap: Array<[Center, string, string]> = [
  ['Buwelo', 'BUWELO_EMAIL', 'BUWELO_PASSWORD'],
  ['WNS', 'WNS_EMAIL', 'WNS_PASSWORD'],
  ['Concentrix', 'CONCENTRIX_EMAIL', 'CONCENTRIX_PASSWORD'],
  ['Telus', 'TELUS_EMAIL', 'TELUS_PASSWORD'],
];

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error('AUTH_SECRET is not configured');
  return new TextEncoder().encode(value);
}

function safeEqual(a: string, b: string) {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

export function hashPassword(password:string){
  const salt=randomBytes(16).toString('hex');
  const hash=scryptSync(password,salt,64).toString('hex');
  return `${salt}:${hash}`;
}

function passwordKey(){
  const value=process.env.AUTH_SECRET;
  if(!value) throw new Error('AUTH_SECRET is not configured');
  return createHash('sha256').update(value).digest();
}

export function encryptPassword(password:string){
  const iv=randomBytes(12);
  const cipher=createCipheriv('aes-256-gcm',passwordKey(),iv);
  const encrypted=Buffer.concat([cipher.update(password,'utf8'),cipher.final()]);
  const tag=cipher.getAuthTag();
  return [iv.toString('base64'),tag.toString('base64'),encrypted.toString('base64')].join('.');
}

export function decryptPassword(stored:string){
  try{
    const [ivB64,tagB64,dataB64]=stored.split('.');
    if(!ivB64||!tagB64||!dataB64)return null;
    const decipher=createDecipheriv('aes-256-gcm',passwordKey(),Buffer.from(ivB64,'base64'));
    decipher.setAuthTag(Buffer.from(tagB64,'base64'));
    return Buffer.concat([decipher.update(Buffer.from(dataB64,'base64')),decipher.final()]).toString('utf8');
  }catch{return null}
}

export function verifyPassword(password:string, stored:string){
  try{
    const [salt,hash]=stored.split(':');
    if(!salt||!hash) return false;
    const actual=scryptSync(password,salt,64);
    const expected=Buffer.from(hash,'hex');
    return actual.length===expected.length&&timingSafeEqual(actual,expected);
  }catch{return false}
}

function passwordEncryptionKey(){
  const raw=process.env.AUTH_SECRET;
  if(!raw) throw new Error('AUTH_SECRET is not configured');
  return createHash('sha256').update(raw).digest();
}

export function encryptPassword(password:string){
  const iv=randomBytes(12);
  const cipher=createCipheriv('aes-256-gcm',passwordEncryptionKey(),iv);
  const encrypted=Buffer.concat([cipher.update(password,'utf8'),cipher.final()]);
  const tag=cipher.getAuthTag();
  return [iv.toString('base64'),tag.toString('base64'),encrypted.toString('base64')].join('.');
}

export function decryptPassword(value:string){
  try{
    const [iv64,tag64,data64]=value.split('.');
    if(!iv64||!tag64||!data64)return null;
    const decipher=createDecipheriv('aes-256-gcm',passwordEncryptionKey(),Buffer.from(iv64,'base64'));
    decipher.setAuthTag(Buffer.from(tag64,'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data64,'base64')),decipher.final()]).toString('utf8');
  }catch{return null}
}

export async function authenticate(email: string, password: string): Promise<SessionUser | null> {
  const normalized = email.trim().toLowerCase();

  // Admin-managed accounts in Firestore take priority.
  const snap=await db().collection('loginUsers').where('emailLower','==',normalized).limit(1).get();
  if(!snap.empty){
    const d=snap.docs[0].data();
    if(d.active!==false && typeof d.passwordHash==='string' && verifyPassword(password,d.passwordHash)){
      if(d.role==='admin') return {email:String(d.email),name:String(d.name||d.email),role:'admin'};
      if(d.role==='center'&&d.center) return {email:String(d.email),name:String(d.name||d.center),role:'center',center:d.center as Center};
    }
    return null;
  }

  // Existing environment accounts remain available as a safe bootstrap/fallback.
  const admins = [
    { name: 'Valdemir Gonçalves', email: process.env.ADMIN_VALDEMIR_EMAIL, password: process.env.ADMIN_VALDEMIR_PASSWORD },
    { name: 'Barbara Kalchik', email: process.env.ADMIN_BARBARA_EMAIL, password: process.env.ADMIN_BARBARA_PASSWORD },
    { name: 'April Grantham', email: process.env.ADMIN_APRIL_EMAIL, password: process.env.ADMIN_APRIL_PASSWORD },
  ];
  for (const a of admins) {
    if (a.email && a.password && normalized === a.email.trim().toLowerCase() && safeEqual(password, a.password)) {
      return { email: a.email.trim(), name: a.name, role: 'admin' };
    }
  }

  for (const [center, emailKey, passKey] of centerMap) {
    const e = process.env[emailKey]?.trim();
    const p = process.env[passKey];
    if (e && p && normalized === e.toLowerCase() && safeEqual(password, p)) {
      return { email: e, name: center, role: 'center', center };
    }
  }
  return null;
}

export async function createSession(user: SessionUser) {
  const token = await new SignJWT(user as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
  const store = await cookies();
  store.set(COOKIE, token, { httpOnly:true, secure:process.env.NODE_ENV==='production', sameSite:'lax', path:'/', maxAge:MAX_AGE });
}

export async function clearSession() {
  (await cookies()).set(COOKIE, '', { httpOnly:true, path:'/', maxAge:0, sameSite:'lax', secure:process.env.NODE_ENV==='production' });
}

export async function getSession(): Promise<SessionUser | null> {
  try {
    const token = (await cookies()).get(COOKIE)?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as SessionUser;
  } catch {
    return null;
  }
}
