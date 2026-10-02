import {getSession} from '@/lib/auth';
import {redirect} from 'next/navigation';
import AgentRankingPage from '@/components/AgentRankingPage';
import {canAccessCenter} from '@/lib/permissions';
import type {Center} from '@/lib/types';

const map:Record<string,Center>={
  buwelo:'Buwelo',
  wns:'WNS',
  concentrix:'Concentrix',
  telus:'Telus',
};

export default async function RankingPage({params}:{params:Promise<{center:string}>}){
  const {center:slug}=await params;
  const center=map[slug.toLowerCase()];
  const session=await getSession();

  if(!session)redirect('/');
  if(!center)redirect('/');
  if(!canAccessCenter(session,center))redirect(`/center/${session.center?.toLowerCase()}`);

  return <AgentRankingPage center={center} admin={session.role==='admin'} userName={session.name}/>;
}
