import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/firebaseAdmin';
import type { Center } from '@/lib/types';

const centers:Center[]=['Buwelo','Concentrix','WNS','Telus'];
type ScoreBucket={sum:number;count:number};
type CenterCoachingBucket={total:number;coached:number;onTime:number;speedDays:number;speedCount:number};

function ranked<T extends {avg:number;name:string}>(rows:T[]){
  return rows.sort((a,b)=>b.avg-a.avg||a.name.localeCompare(b.name)).map((r,i)=>({...r,rank:i+1}));
}

function parseDate(value:unknown){
  const text=String(value??'').trim();
  if(!text)return null;
  const d=new Date(text.includes('T')?text:`${text}T12:00:00`);
  return Number.isNaN(d.getTime())?null:d;
}

function businessDaysBetween(start:Date,end:Date){
  const a=new Date(start); a.setHours(12,0,0,0);
  const b=new Date(end); b.setHours(12,0,0,0);
  if(b<a)return 0;
  let days=0;
  const cur=new Date(a);
  while(cur<b){
    cur.setDate(cur.getDate()+1);
    const day=cur.getDay();
    if(day!==0&&day!==6)days++;
  }
  return days;
}

export async function GET(){
  const session=await getSession();
  if(!session)return NextResponse.json({error:'Session expired.'},{status:401});

  const snap=await db().collection('reviews')
    .select('center','agent','finalScore','coached','qaDate','dateCoached')
    .get();

  const agentBuckets=new Map<string,ScoreBucket&{name:string;center:Center}>();
  const centerBuckets=new Map<Center,CenterCoachingBucket>();

  for(const center of centers){
    centerBuckets.set(center,{total:0,coached:0,onTime:0,speedDays:0,speedCount:0});
  }

  for(const doc of snap.docs){
    const d=doc.data();
    const center=d.center as Center;
    if(!centers.includes(center))continue;

    const cb=centerBuckets.get(center)!;
    cb.total++;

    if(Boolean(d.coached)){
      cb.coached++;
      const qaDate=parseDate(d.qaDate);
      const coachedDate=parseDate(d.dateCoached);
      if(qaDate&&coachedDate){
        const speed=businessDaysBetween(qaDate,coachedDate);
        cb.speedDays+=speed;
        cb.speedCount++;
        if(speed<=2)cb.onTime++;
      }
    }

    const score=typeof d.finalScore==='number'?d.finalScore:null;
    const agent=String(d.agent||'').trim();
    if(score!==null&&Number.isFinite(score)&&agent){
      const key=`${center}::${agent.toLowerCase()}`;
      const ab=agentBuckets.get(key)||{sum:0,count:0,name:agent,center};
      ab.sum+=score;ab.count++;
      agentBuckets.set(key,ab);
    }
  }

  const rawCenterRanks=centers.map(center=>{
    const b=centerBuckets.get(center)!;
    const completionPct=b.total?b.coached/b.total*100:0;
    const speedPct=b.coached?b.onTime/b.coached*100:0;
    const avgSpeedDays=b.speedCount?b.speedDays/b.speedCount:null;
    const coachingScore=completionPct*0.7+speedPct*0.3;
    return {
      name:center,
      center,
      avg:coachingScore,
      completionPct,
      speedPct,
      avgSpeedDays,
      total:b.total,
      coached:b.coached,
      pending:b.total-b.coached,
    };
  }).sort((a,b)=>b.avg-a.avg||b.completionPct-a.completionPct||b.speedPct-a.speedPct||a.name.localeCompare(b.name))
    .map((r,i)=>({...r,rank:i+1}));

  const centerRanks=rawCenterRanks.map(r=>{
    const canSeeDetails=session.role==='admin'||session.center===r.center;
    return {
      rank:r.rank,
      center:session.role==='admin'||session.center===r.center?r.center:null,
      name:session.role==='admin'||session.center===r.center?r.center:'Other Center',
      isOwn:session.center===r.center,
      coachingScore:canSeeDetails?Math.round(r.avg*10)/10:null,
      completionPct:canSeeDetails?Math.round(r.completionPct*10)/10:null,
      speedPct:canSeeDetails?Math.round(r.speedPct*10)/10:null,
      avgSpeedDays:canSeeDetails&&r.avgSpeedDays!==null?Math.round(r.avgSpeedDays*10)/10:null,
      total:canSeeDetails?r.total:null,
      coached:canSeeDetails?r.coached:null,
      pending:canSeeDetails?r.pending:null,
    };
  });

  const visibleAgents=[...agentBuckets.values()]
    .filter(a=>session.role==='admin'||a.center===session.center)
    .map(a=>({name:a.name,center:a.center,avg:a.sum/a.count,count:a.count}));

  const agentRanks=ranked(visibleAgents).map(r=>({...r,avg:Math.round(r.avg*10)/10}));

  return NextResponse.json({
    kpi:90,
    centerRankingFormula:'70% coaching completion + 30% coached within 2 business days',
    centerRanks,
    agentRanks
  });
}
