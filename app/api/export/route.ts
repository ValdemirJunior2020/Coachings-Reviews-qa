import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { getSession } from '@/lib/auth';
import { getReviews } from '@/lib/reviews';
import type { Center } from '@/lib/types';

const valid:Center[]=['Buwelo','Concentrix','WNS','Telus'];
export async function GET(req:Request){
 const s=await getSession(); if(!s)return NextResponse.json({error:'Session expired.'},{status:401});
 const requested=new URL(req.url).searchParams.get('center') as Center|null;
 let center:Center|undefined;
 if(s.role==='center')center=s.center;
 else if(requested&&valid.includes(requested))center=requested;
 const reviews=await getReviews(center);
 const rows=reviews.map(r=>({'Date':r.qaDate,'Booking Itinerary number':r.itinerary,'Call center':r.center,"Agent's name":r.agent,'Call ID':r.callId,'What guest needed?':r.guestNeeded,'What happened?':r.happened,'The Correct Matrix Process':r.matrixProcess,'Business impact':r.businessImpact,'Quick Coaching':r.quickCoaching,'Call Lenght':r.callLength,'Date-of-the-call':r.callDate,'Call Month':r.callMonth,'Coached?':r.coached?'TRUE':'FALSE','Date Coached':r.dateCoached,'Coached By':r.coachedBy,'Coaching Response / Notes':r.coachingNotes,'Confirmation Link':r.confirmationLink}));
 const wb=XLSX.utils.book_new();
 if(center){XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),center)}
 else{for(const c of valid)XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows.filter(r=>r['Call center']===c)),c)}
 const out=XLSX.write(wb,{type:'buffer',bookType:'xlsx'});
 const name=center?`QA-Coaching-${center}.xlsx`:'QA-Coaching-All-Centers.xlsx';
 return new NextResponse(out,{headers:{'content-type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','content-disposition':`attachment; filename="${name}"`,'cache-control':'no-store'}});
}
