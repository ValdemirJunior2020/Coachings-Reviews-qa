import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getSheetReviews } from '@/lib/sheetsDb';
import type { Center } from '@/lib/types';

const map:Record<string,Center>={buwelo:'Buwelo',wns:'WNS',concentrix:'Concentrix',telus:'Telus'};

export async function GET(req:Request){
  const s=await getSession();
  if(!s)return NextResponse.json({error:'Session expired.'},{status:401});
  try{
    const q=new URL(req.url).searchParams.get('center');
    let center:Center|undefined;
    if(s.role==='center')center=s.center;
    else if(q)center=map[q.toLowerCase()];
    return NextResponse.json({reviews:await getSheetReviews(center),source:'google-sheet'});
  }catch(e){
    console.error('reviews',e);
    return NextResponse.json({error:e instanceof Error?e.message:'Unable to load coaching reviews from Daily-Findings.'},{status:503});
  }
}
