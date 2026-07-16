export type DeleteApplicationDataResult = { deleted: true };

export interface AccountRepository {
  deleteMyApplicationData(): Promise<DeleteApplicationDataResult>;
}

export class AccountRepositoryError extends Error {
  readonly code = 'account/unavailable';

  constructor() {
    super('Account data operation is unavailable');
    this.name = 'AccountRepositoryError';
  }
}
