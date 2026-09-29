import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function privateKey() {
  return process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
}

export function db() {
  if (!getApps().length) {
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const key = privateKey();
    if (!projectId || !clientEmail || !key) {
      throw new Error('Firebase server credentials are not configured');
    }
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey: key }) });
  }
  return getFirestore();
}
