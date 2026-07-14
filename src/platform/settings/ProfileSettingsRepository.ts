import type { ProfileSettingsDraft } from '@daily-record/contracts';

export interface ProfileSettingsRepository {
  load(): Promise<ProfileSettingsDraft | null>;
  save(value: ProfileSettingsDraft): Promise<void>;
}
