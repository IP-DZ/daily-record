import { z } from 'zod';

import {
  AccountRepositoryError,
  type AccountRepository,
  type DeleteApplicationDataResult,
} from '../account';

const deleteApplicationDataResultSchema = z.object({
  deleted: z.literal(true),
}).strict();

export interface CloudBaseAccountRdbClient {
  rpc(
    name: 'delete_my_application_data',
  ): Promise<{ data: unknown; error?: unknown }>;
}

export { AccountRepositoryError };

export class CloudBaseAccountRepository implements AccountRepository {
  constructor(private readonly rdb: CloudBaseAccountRdbClient) {}

  async deleteMyApplicationData(): Promise<DeleteApplicationDataResult> {
    try {
      const response = await this.rdb.rpc('delete_my_application_data');
      if (response.error != null) throw new AccountRepositoryError();
      return deleteApplicationDataResultSchema.parse(response.data);
    } catch {
      throw new AccountRepositoryError();
    }
  }
}
