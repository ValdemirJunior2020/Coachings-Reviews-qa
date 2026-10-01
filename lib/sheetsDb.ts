import type { Center, Review, SessionUser } from './types';

type DbResponse<T> = T & { ok?: boolean; error?: string };

function config(){
  const url=process.env.DATABASE_URL?.trim();
  if(!url) throw new Error('DATABASE_URL is not configured');
  return {url,token:process.env.DATABASE_TOKEN?.trim()||''};
}

export async function databaseRequest<T>(action:string,payload:Record<string,unknown>={}):Promise<T>{
  const {url,token}=config();
  const res=await fetch(url,{
    method:'POST',
    headers:{'content-type':'text/plain;charset=utf-8'},
    body:JSON.stringify({action,token,...payload}),
    cache:'no-store',
  });
  const text=await res.text();
  let data:DbResponse<T>;
  try{data=JSON.parse(text||'{}') as DbResponse<T>}
  catch{throw new Error(`Database returned invalid response (HTTP ${res.status}).`)}
  if(!res.ok||data.ok===false||data.error) throw new Error(data.error||`Database request failed (HTTP ${res.status}).`);
  return data as T;
}

export async function getSheetReviews(center?:Center){
  const data=await databaseRequest<{reviews:Review[]}>('getReviews',{center:center||''});
  return data.reviews||[];
}

export async function updateSheetCoaching(args:{
  center:Center;callId:string;coached:boolean;dateCoached?:string;coachedBy?:string;notes?:string;actor:string;role:string;
}){
  return databaseRequest<{review:Review}>('updateCoaching',args);
}

export async function submitSheetDispute(args:{
  center:Center;callId:string;disputeBy:string;reason:string;actor:string;
}){
  return databaseRequest<{review:Review}>('submitDispute',args);
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
  return databaseRequest<{
    reviews:Array<Pick<Review,'center'|'agent'|'finalScore'|'coached'|'qaDate'|'dateCoached'>>;
  }>('getLeaderboardData');
}
