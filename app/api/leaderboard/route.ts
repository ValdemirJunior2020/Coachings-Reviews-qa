import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/firebaseAdmin';
import type { Center } from '@/lib/types';

const centers:Center[]=['Buwelo','Concentrix','WNS','Telus'];
type ScoreBucket={sum:number;count:number};

function ranked<T extends {avg:number;name:string}>(rows:T[]){
  return rows.sort((a,b)=>b.avg-a.avg||a.name.localeCompare(b.name)).map((r,i)=>({...r,rank:i+1}));
}

export async function GET(){
  const session=await getSession();
  if(!session)return NextResponse.json({error:'Session expired.'},{status:401});

  const snap=await db().collection('reviews').select('center','agent','finalScore').get();
  const centerBuckets=new Map<Center,ScoreBucket>();
  const agentBuckets=new Map<string,ScoreBucket&{name:string;center:Center}>();

  for(const doc of snap.docs){
    const d=doc.data();
    const center=d.center as Center;
    const score=typeof d.finalScore==='number'?d.finalScore:null;
    const agent=String(d.agent||'').trim();
    if(!centers.includes(center)||score===null||!Number.isFinite(score))continue;

    const cb=centerBuckets.get(center)||{sum:0,count:0};
    cb.sum+=score;cb.count++;
    centerBuckets.set(center,cb);

    if(agent){
      const key=`${center}::${agent.toLowerCase()}`;
      const ab=agentBuckets.get(key)||{sum:0,count:0,name:agent,center};
      ab.sum+=score;ab.count++;
      agentBuckets.set(key,ab);
    }
  }

  const centerRanks=ranked(centers.map(center=>{
    const b=centerBuckets.get(center)||{sum:0,count:0};
    return {name:center,center,avg:b.count?b.sum/b.count:0,count:b.count};
  })).map(r=>({
    ...r,
    avg:session.role==='admin'||session.center===r.center?Math.round(r.avg*10)/10:null,
  }));

  const visibleAgents=[...agentBuckets.values()]
    .filter(a=>session.role==='admin'||a.center===session.center)
    .map(a=>({name:a.name,center:a.center,avg:a.sum/a.count,count:a.count}));

  const agentRanks=ranked(visibleAgents).map(r=>({...r,avg:Math.round(r.avg*10)/10}));

  return NextResponse.json({kpi:90,centerRanks,agentRanks});
}
