import {getSession} from '@/lib/auth';
import {redirect} from 'next/navigation';
import AgentKudosPage from '@/components/AgentKudosPage';

export default async function AdminKudosPage(){
  const session=await getSession();
  if(!session)redirect('/');
  if(session.role!=='admin')redirect(`/center/${session.center?.toLowerCase()}/kudos`);
  return <AgentKudosPage admin userName={session.name}/>;
}
