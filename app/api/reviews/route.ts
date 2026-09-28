import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getReviews } from '@/lib/googleSheets';
import type { Center } from '@/lib/types';

const map: Record<string, Center> = {
  buwelo: 'Buwelo',
  wns: 'WNS',
  concentrix: 'Concentrix',
  telus: 'Telus',
};

export async function GET(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: 'Session expired.' }, { status: 401 });

  try {
    const q = new URL(req.url).searchParams.get('center');
    let center: Center | undefined;

    if (s.role === 'center') center = s.center;
    else if (q) center = map[q.toLowerCase()];

    return NextResponse.json({ reviews: await getReviews(center) });
  } catch (e) {
    console.error('reviews', e);
    return NextResponse.json(
      { error: 'Unable to load coaching reviews from Google Sheets.' },
      { status: 503 }
    );
  }
}
