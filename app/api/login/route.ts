import { NextResponse } from 'next/server';
import { authenticate, createSession } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();
    const u = authenticate(String(email || ''), String(password || ''));
    if (!u) {
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
    }
    await createSession(u);
    return NextResponse.json({
      redirect: u.role === 'admin' ? '/admin' : `/center/${u.center?.toLowerCase()}`,
    });
  } catch {
    return NextResponse.json({ error: 'Login service is not configured.' }, { status: 500 });
  }
}
