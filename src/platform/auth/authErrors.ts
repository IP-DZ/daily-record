export type AuthErrorCode =
  | 'auth/configuration'
  | 'auth/invalid-email'
  | 'auth/code-required'
  | 'auth/code-expired'
  | 'auth/code-invalid'
  | 'auth/captcha-required'
  | 'auth/rate-limited'
  | 'auth/network'
  | 'auth/session'
  | 'auth/unknown';
