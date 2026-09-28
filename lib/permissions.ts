import type { Center, SessionUser } from './types';

export function canAccessCenter(user: SessionUser, center: Center) {
  return user.role === 'admin' || user.center === center;
}

export function canEditCenter(user: SessionUser, center: Center) {
  return canAccessCenter(user, center);
}
