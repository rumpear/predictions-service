export interface PostgresError {
  code: string;
}

export function isPostgresError(err: unknown): err is PostgresError {
  return typeof err === 'object' && err !== null && 'code' in err && typeof err.code === 'string';
}
