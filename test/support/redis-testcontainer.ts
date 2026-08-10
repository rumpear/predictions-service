import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';

export async function startRedis(): Promise<{ container: StartedRedisContainer; connectionString: string }> {
  const container = await new RedisContainer('redis:7').start();
  return { container, connectionString: container.getConnectionUrl() };
}
