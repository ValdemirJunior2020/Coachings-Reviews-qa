import type { Center, Review, SessionUser } from './types';

type DbResponse<T> = T & { ok?: boolean; error?: string };

const REVIEW_CACHE_TTL_MS=60000;
const reviewCache=new Map<string,{at:number;reviews:Review[]}>();
const reviewInflight=new Map<string,Promise<Review[]>>();

function clearReviewCache(){
  reviewCache.clear();
  reviewInflight.clear();
}

function config(){
  const url=process.env.DATABASE_URL_V2?.trim()||process.env.DATABASE_URL?.trim();
  if(!url) throw new Error('DATABASE_URL is not configured');
  return {url,token:process.env.DATABASE_TOKEN?.trim()||''};
}

export async function databaseRequest<T>(action:string,payload:Record<string,unknown>={}):Promise<T>{
  const {url,token}=config();
  const controller=new AbortController();
  const timer=globalThis.setTimeout(()=>controller.abort(),22000);
  let res:Response;
  try{
    res=await fetch(url,{
      method:'POST',
      headers:{'content-type':'text/plain;charset=utf-8'},
      body:JSON.stringify({action,token,...payload}),
      cache:'no-store',
      signal:controller.signal,
    });
  }catch(e){
    if(e instanceof Error&&e.name==='AbortError'){
      throw new Error('Daily-Findings database timed out before responding. Please try again.');
    }
    throw e;
  }finally{
    globalThis.clearTimeout(timer);
  }

  const text=await res.text();
  if(res.status===404){
    throw new Error('Daily-Findings database endpoint returned HTTP 404.');
  }

  let data:DbResponse<T>;
  try{data=JSON.parse(text||'{}') as DbResponse<T>}
  catch{throw new Error(`Daily-Findings database returned a non-JSON response (HTTP ${res.status}).`)}
  if(!res.ok||data.ok===false||data.error) throw new Error(data.error||`Database request failed (HTTP ${res.status}).`);
  return data as T;
}

export async function getSheetReviews(center?:Center){
  const key=center||'__all__';
  const cached=reviewCache.get(key);
  if(cached&&Date.now()-cached.at<REVIEW_CACHE_TTL_MS)return cached.reviews;

  const existing=reviewInflight.get(key);
  if(existing)return existing;

  const request=databaseRequest<{reviews:Review[]}>('getReviews',{center:center||''})
    .then(data=>{
      const reviews=data.reviews||[];
      reviewCache.set(key,{at:Date.now(),reviews});
      return reviews;
    })
    .finally(()=>reviewInflight.delete(key));

  reviewInflight.set(key,request);
  return request;
}

export async function updateSheetCoaching(args:{
  center:Center;callId:string;coached:boolean;dateCoached?:string;coachedBy?:string;notes?:string;actor:string;role:string;
}){
  const out=await databaseRequest<{review:Review}>('updateCoaching',args);
  clearReviewCache();
  return out;
}

export async function submitSheetDispute(args:{
  center:Center;callId:string;disputeBy:string;reason:string;actor:string;
}){
  const out=await databaseRequest<{review:Review}>('submitDispute',args);
  clearReviewCache();
  return out;
}

export async function authenticateManagedUser(email:string,password:string){
  return databaseRequest<{
    found:boolean;valid:boolean;active:boolean;deleted:boolean;
    user?:SessionUser;
  }>('authenticateUser',{email,password});
}

export type ManagedLogin={
  id:string;name:string;email:string;role:'admin'|'center';center:Center|'';active:boolean;deleted?:boolean;
};

export async function getManagedUsers(){
  const data=await databaseRequest<{users:ManagedLogin[]}>('getUsers');
  return data.users||[];
}

export async function createManagedUser(payload:Record<string,unknown>){
  return databaseRequest<{user:ManagedLogin}>('createUser',payload);
}
export async function updateManagedUser(payload:Record<string,unknown>){
  return databaseRequest<{user:ManagedLogin}>('updateUser',payload);
}
export async function deleteManagedUser(payload:Record<string,unknown>){
  return databaseRequest<{ok:boolean}>('deleteUser',payload);
}

export async function getLeaderboardRows(){
  const reviews=await getSheetReviews();
  return {
    reviews:reviews.map(r=>({
      center:r.center,
      agent:r.agent,
      finalScore:r.finalScore,
      scorePassFail:r.scorePassFail,
      coached:r.coached,
      qaDate:r.qaDate,
      dateCoached:r.dateCoached,
    }))
  };
}


export async function importCenterRows(center:Center,headers:string[],rows:unknown[][]){
  const out=await databaseRequest<{added:number;updated:number;skipped:number}>('importCenterRows',{center,headers,rows});
  clearReviewCache();
  return out;
}

export async function replaceScores(rows:unknown[][]){
  const out=await databaseRequest<{written:number}>('replaceScores',{rows});
  clearReviewCache();
  return out;
}


export async function presencePing(payload:Record<string,unknown>){
  return databaseRequest<{ok:boolean}>('presencePing',payload);
}
export async function presenceList(){
  return databaseRequest<{users:Array<Record<string,unknown>>}>('presenceList');
}
export async function presenceDelete(email:string){
  return databaseRequest<{ok:boolean}>('presenceDelete',{email});
}
