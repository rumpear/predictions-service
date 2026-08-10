export default async function globalTeardown(): Promise<void> {
  await Promise.all([
    globalThis.__INTEGRATION_PG_CONTAINER__?.stop(),
    globalThis.__INTEGRATION_REDIS_CONTAINER__?.stop(),
  ]);
}
