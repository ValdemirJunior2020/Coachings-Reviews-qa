import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getLeaderboardRows } from '@/lib/sheetsDb';
import type { Center } from '@/lib/types';

const centers:Center[]=['Buwelo','Concentrix','WNS','Telus'];
type ScoreBucket={sum:number;count:number;pass:number;fail:number};
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

  const {reviews:sourceRows}=await getLeaderboardRows();

  const now=new Date();
  now.setHours(12,0,0,0);
  const cutoff=new Date(now);
  cutoff.setDate(cutoff.getDate()-30);

  const agentBuckets=new Map<string,ScoreBucket&{name:string;center:Center}>();
  const centerBuckets=new Map<Center,CenterCoachingBucket>();

  for(const center of centers){
    centerBuckets.set(center,{total:0,coached:0,onTime:0,speedDays:0,speedCount:0});
  }

  for(const d of sourceRows){
    const center=d.center as Center;
    if(!centers.includes(center))continue;

    // Agent QA ranking uses every scored QA currently available in the Scores data.
    const score=typeof d.finalScore==='number'?d.finalScore:null;
    const agent=String(d.agent||'').trim();
    if(score!==null&&Number.isFinite(score)&&agent){
      const key=`${center}::${agent.toLowerCase()}`;
      const ab=agentBuckets.get(key)||{sum:0,count:0,pass:0,fail:0,name:agent,center};
      ab.sum+=score;ab.count++;
      const outcome=String(d.scorePassFail||'').trim().toUpperCase();
      if(outcome==='PASS'||(!outcome&&score>=90))ab.pass++;
      else if(outcome==='FAIL'||(!outcome&&score<90))ab.fail++;
      agentBuckets.set(key,ab);
    }

    // Center coaching activity remains a rolling 30-day metric.
    const qaDate=parseDate(d.qaDate);
    if(!qaDate||qaDate<cutoff||qaDate>now)continue;

    const cb=centerBuckets.get(center)!;
    cb.total++;

    if(Boolean(d.coached)){
      cb.coached++;
      const coachedDate=parseDate(d.dateCoached);
      if(coachedDate){
        const speed=businessDaysBetween(qaDate,coachedDate);
        cb.speedDays+=speed;
        cb.speedCount++;
        if(speed<=2)cb.onTime++;
      }
    }
  }

  const rawStats=centers.map(center=>{
    const b=centerBuckets.get(center)!;
    const completionPct=b.total?b.coached/b.total*100:0;
    const speedPct=b.coached?b.onTime/b.coached*100:0;
    const avgSpeedDays=b.speedCount?b.speedDays/b.speedCount:null;
    const rawScore=completionPct*0.7+speedPct*0.3;
    return {
      name:center,
      center,
      rawScore,
      completionPct,
      speedPct,
      avgSpeedDays,
      total:b.total,
      coached:b.coached,
      pending:b.total-b.coached,
    };
  });

  const totalReviews=rawStats.reduce((sum,r)=>sum+r.total,0);
  const globalRawScore=totalReviews
    ? rawStats.reduce((sum,r)=>sum+r.rawScore*r.total,0)/totalReviews
    : 0;
  const PRIOR_REVIEWS=20;

  const rawCenterRanks=rawStats.map(r=>{
    const adjustedScore=r.total
      ? (r.rawScore*r.total+globalRawScore*PRIOR_REVIEWS)/(r.total+PRIOR_REVIEWS)
      : 0;
    return {
      ...r,
      avg:adjustedScore,
      provisional:r.total<30,
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
      provisional:r.provisional,
    };
  });

  const visibleAgents=[...agentBuckets.values()]
    .filter(a=>session.role==='admin'||a.center===session.center)
    .map(a=>({name:a.name,center:a.center,avg:a.sum/a.count,count:a.count,pass:a.pass,fail:a.fail,passRate:a.count?a.pass/a.count*100:0}));

  const agentRanks=ranked(visibleAgents).map(r=>({...r,avg:Math.round(r.avg*10)/10,passRate:Math.round(r.passRate*10)/10}));

  return NextResponse.json({
    kpi:90,
    centerRankingFormula:'Last 30 days: 70% coaching completion + 30% coached within 2 business days, lightly adjusted for small sample sizes',
    centerRanks,
    agentRanks
  });
}
