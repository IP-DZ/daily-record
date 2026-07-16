import type { AuthUser } from '@daily-record/contracts';

export interface AuthPort {
  requestEmailCode(email: string): Promise<void>;
  verifyEmailCode(email: string, code: string): Promise<AuthUser>;
  currentUser(): Promise<AuthUser | null>;
  signOut(): Promise<void>;
}
