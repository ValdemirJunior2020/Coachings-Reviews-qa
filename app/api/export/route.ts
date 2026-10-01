import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx-js-style';
import { getSession } from '@/lib/auth';
import { getSheetReviews } from '@/lib/sheetsDb';
import type { Center, Review } from '@/lib/types';

const valid:Center[]=['Buwelo','Concentrix','WNS','Telus'];
const headers=[
  'Date','Booking Itinerary number','Call center',"Agent's name",'Call ID',
  'What guest needed?','What happened?','The Correct Matrix Process','Business impact',
  'Quick Coaching','Call Lenght','Date-of-the-call','Call Month','Coached?',
  'Date Coached','Coached By','Coaching Response / Notes','Confirmation Link'
];

const titleStyle={
  fill:{fgColor:{rgb:'17365D'}},
  font:{name:'Carlito',sz:16,bold:true,color:{rgb:'FFFFFF'}},
  alignment:{horizontal:'center',vertical:'center'}
};

const headerStyle={
  fill:{fgColor:{rgb:'2F75B5'}},
  font:{name:'Carlito',sz:10,bold:true,color:{rgb:'FFFFFF'}},
  alignment:{horizontal:'center',vertical:'center',wrapText:true},
  border:{
    top:{style:'thin',color:{rgb:'2F75B5'}},
    bottom:{style:'thin',color:{rgb:'2F75B5'}},
    left:{style:'thin',color:{rgb:'2F75B5'}},
    right:{style:'thin',color:{rgb:'2F75B5'}}
  }
};

const introStyle={
  font:{name:'Carlito',sz:12,color:{rgb:'000000'}},
  alignment:{horizontal:'center',vertical:'center',wrapText:true}
};

const bodyBorder={
  top:{style:'thin',color:{rgb:'9CC2E5'}},
  bottom:{style:'thin',color:{rgb:'9CC2E5'}},
  left:{style:'thin',color:{rgb:'D9EAF7'}},
  right:{style:'thin',color:{rgb:'D9EAF7'}}
};

function bodyStyle(fill:string){
  return {
    fill:{fgColor:{rgb:fill}},
    font:{name:'Carlito',sz:9,color:{rgb:'000000'}},
    alignment:{horizontal:'center',vertical:'center',wrapText:true},
    border:bodyBorder
  };
}

function asDate(value:string){
  if(!value)return '';
  const d=new Date(value+'T12:00:00');
  return Number.isNaN(d.getTime())?value:d;
}

function rowHeight(r:Review){
  const text=[r.guestNeeded,r.happened,r.matrixProcess,r.businessImpact,r.quickCoaching].join(' ');
  if(text.length>1150)return 105.75;
  if(text.length>850)return 93;
  if(text.length>600)return 79.5;
  if(text.length>420)return 66.75;
  return 54;
}

function makeSheet(center:Center,reviews:Review[]){
  const hasIntro=center!=='Concentrix';
  const headerRow=hasIntro?3:2;
  const dataStart=headerRow+1;
  const intro='Hi Team, you’ll be receiving the Today’s Call Coaching Findings on a daily basis. Please coach the agents as soon as possible while the call is still fresh, as this will help with better understanding and retention of the feedback.';

  const aoa:(string|boolean|Date)[][]=[];
  aoa.push(["Today's Findings",...Array(17).fill('')]);
  if(hasIntro)aoa.push(['','','',intro,...Array(14).fill('')]);
  aoa.push(headers);

  for(const r of reviews){
    aoa.push([
      asDate(r.qaDate),r.itinerary,r.center,r.agent,r.callId,r.guestNeeded,r.happened,
      r.matrixProcess,r.businessImpact,r.quickCoaching,r.callLength,asDate(r.callDate),
      r.callMonth,r.coached?'TRUE':'FALSE',asDate(r.dateCoached),r.coachedBy,
      r.coachingNotes,r.confirmationLink
    ]);
  }

  const ws=XLSX.utils.aoa_to_sheet(aoa,{cellDates:true});

  ws['!cols']=[
    {wch:14},{wch:23},{wch:14},{wch:21},{wch:39},{wch:40},{wch:53},{wch:66},{wch:46},
    {wch:50},{wch:13.5},{wch:12.63},{wch:9.13},{wch:8.13},{wch:7.38},{wch:7.75},{wch:8.5},{wch:8.25}
  ];
  ws['!rows']=[];
  ws['!rows'][0]={hpt:30};
  if(hasIntro)ws['!rows'][1]={hpt:30};
  ws['!rows'][headerRow-1]={hpt:42};

  ws['!merges']=[XLSX.utils.decode_range('A1:J1')];
  if(hasIntro){
    ws['!merges'].push(XLSX.utils.decode_range(center==='Telus'?'C2:J2':'D2:K2'));
  }

  for(let c=0;c<18;c++){
    const titleCell=ws[XLSX.utils.encode_cell({r:0,c})];
    if(titleCell)titleCell.s=titleStyle;
  }
  if(hasIntro){
    const start=center==='Telus'?2:3;
    const end=center==='Telus'?9:10;
    for(let c=start;c<=end;c++){
      const cell=ws[XLSX.utils.encode_cell({r:1,c})];
      if(cell)cell.s=introStyle;
    }
  }

  for(let c=0;c<18;c++){
    const cell=ws[XLSX.utils.encode_cell({r:headerRow-1,c})];
    if(cell)cell.s=headerStyle;
  }

  reviews.forEach((r,i)=>{
    const excelRow=dataStart+i;
    const alternating=i%2===0?'F7FAFC':'FFFFFF';
    const rowFill=r.tlDisputed?'FFE7C2':r.coached?'E2F0D9':alternating;
    ws['!rows']![excelRow-1]={hpt:rowHeight(r)};

    for(let c=0;c<18;c++){
      const addr=XLSX.utils.encode_cell({r:excelRow-1,c});
      const cell=ws[addr];
      if(!cell)continue;
      cell.s=bodyStyle(rowFill);
      if(c===0||c===11||c===14)cell.z='mm/dd/yyyy';
    }

    // Keep the same coaching visual language from the reference workbook:
    // positive = pastel green, correction = pastel beige.
    if(!r.tlDisputed&&!r.coached){
      const qc=ws[XLSX.utils.encode_cell({r:excelRow-1,c:9})];
      if(qc)qc.s=bodyStyle(r.positive?'E2F0D9':'FFF2CC');
    }
  });

  ws['!autofilter']={ref:`A${headerRow}:R${Math.max(headerRow,dataStart+reviews.length-1)}`};
  return ws;
}

export async function GET(req:Request){
  const s=await getSession();
  if(!s)return NextResponse.json({error:'Session expired.'},{status:401});

  const requested=new URL(req.url).searchParams.get('center') as Center|null;
  let center:Center|undefined;
  if(s.role==='center')center=s.center;
  else if(requested&&valid.includes(requested))center=requested;

  const reviews=await getSheetReviews(center);
  const wb=XLSX.utils.book_new();

  if(center){
    XLSX.utils.book_append_sheet(wb,makeSheet(center,reviews),center);
  }else{
    for(const c of valid){
      XLSX.utils.book_append_sheet(wb,makeSheet(c,reviews.filter(r=>r.center===c)),c);
    }
  }

  const out=XLSX.write(wb,{type:'buffer',bookType:'xlsx',cellStyles:true});
  const name=center?`QA-Coaching-${center}.xlsx`:'QA-Coaching-All-Centers.xlsx';

  return new NextResponse(out,{headers:{
    'content-type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'content-disposition':`attachment; filename="${name}"`,
    'cache-control':'no-store'
  }});
}
