import {
  profileSettingsSchema,
  type ProfileSettingsDraft,
  type ProfileSettingsPayload,
} from '@daily-record/contracts';

import type { ProfileSettingsRepository } from '../settings/ProfileSettingsRepository';

export interface CloudBaseRdbClient {
  rpc(
    name: 'save_my_profile_settings' | 'load_my_profile_settings',
    parameters?: { payload: unknown },
  ): Promise<{ data: unknown; error?: unknown }>;
}

export class ProfileSettingsError extends Error {
  readonly code = 'settings/unavailable';

  constructor() {
    super('Profile settings are unavailable');
    this.name = 'ProfileSettingsError';
  }
}

function toDraft(value: ProfileSettingsPayload): ProfileSettingsDraft {
  return {
    inputs: value.inputs,
    trainingDaysPerWeek: value.trainingDaysPerWeek,
    trainingExperience: value.trainingExperience,
    targets: value.targets,
  };
}

export class CloudBaseProfileSettingsRepository implements ProfileSettingsRepository {
  constructor(private readonly rdb: CloudBaseRdbClient) {}

  async load(): Promise<ProfileSettingsDraft | null> {
    try {
      const response = await this.rdb.rpc('load_my_profile_settings');
      if (response.error != null) throw new ProfileSettingsError();
      if (response.data === null) return null;

      const parsed = profileSettingsSchema.safeParse(response.data);
      if (!parsed.success) throw new ProfileSettingsError();
      return toDraft(parsed.data);
    } catch {
      throw new ProfileSettingsError();
    }
  }

  async save(value: ProfileSettingsDraft): Promise<void> {
    try {
      const payload = profileSettingsSchema.parse({ schemaVersion: 1, ...value });
      const response = await this.rdb.rpc('save_my_profile_settings', { payload });
      if (response.error != null) throw new ProfileSettingsError();
    } catch {
      throw new ProfileSettingsError();
    }
  }
}
