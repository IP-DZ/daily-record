import {
  authUserSchema,
  profileSettingsSchema,
  type AuthUser,
  type ProfileSettingsDraft,
  type ProfileSettingsPayload,
} from '@daily-record/contracts';

import type { AuthPort } from '../auth';
import type { ProfileSettingsRepository } from '../settings/ProfileSettingsRepository';

const ENDPOINT = '/__daily-record-test-platform';
const CLIENT_KEY = 'daily-record:test-platform-client';

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function toDraft(value: ProfileSettingsPayload): ProfileSettingsDraft {
  return {
    inputs: value.inputs,
    trainingDaysPerWeek: value.trainingDaysPerWeek,
    trainingExperience: value.trainingExperience,
    targets: value.targets,
  };
}

function clientId(): string {
  const existing = window.localStorage.getItem(CLIENT_KEY);
  if (existing !== null) return existing;
  const created = crypto.randomUUID();
  window.localStorage.setItem(CLIENT_KEY, created);
  return created;
}

async function call(
  fetcher: Fetcher,
  operation: string,
  input: Record<string, unknown> = {},
): Promise<unknown> {
  const response = await fetcher(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ operation, clientId: clientId(), ...input }),
  });
  if (!response.ok) throw new Error('Test platform unavailable');
  return response.json();
}

export function createTestPlatform(fetcher: Fetcher = fetch): {
  auth: AuthPort;
  profileSettings: ProfileSettingsRepository;
} {
  const auth: AuthPort = {
    async requestEmailCode(email) {
      try {
        await call(fetcher, 'request-code', { email });
      } catch {
        throw { code: 'auth/network' };
      }
    },
    async verifyEmailCode(email, code): Promise<AuthUser> {
      try {
        const response = await call(fetcher, 'verify-code', { email, code });
        return authUserSchema.parse((response as { user?: unknown }).user);
      } catch {
        throw { code: 'auth/code-invalid' };
      }
    },
    async currentUser(): Promise<AuthUser | null> {
      try {
        const response = await call(fetcher, 'current-user') as { user?: unknown };
        return response.user === null ? null : authUserSchema.parse(response.user);
      } catch {
        throw { code: 'auth/network' };
      }
    },
    async signOut() {
      try {
        await call(fetcher, 'sign-out');
      } catch {
        throw { code: 'auth/network' };
      }
    },
  };

  const profileSettings: ProfileSettingsRepository = {
    async load(): Promise<ProfileSettingsDraft | null> {
      const response = await call(fetcher, 'load-profile') as { value?: unknown };
      if (response.value === null) return null;
      const parsed = profileSettingsSchema.parse({ schemaVersion: 1, ...(response.value as object) });
      return toDraft(parsed);
    },
    async save(value) {
      const parsed = profileSettingsSchema.parse({ schemaVersion: 1, ...value });
      await call(fetcher, 'save-profile', { value: toDraft(parsed) });
    },
  };

  return { auth, profileSettings };
}
