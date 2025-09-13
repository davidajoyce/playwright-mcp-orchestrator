import { beforeAll, afterAll } from 'vitest';

beforeAll(async () => {
  // Global test setup
  process.env.LOG_LEVEL = 'error'; // Reduce noise during tests
  process.env.MAX_INSTANCES = '3'; // Lower limit for tests
  process.env.CONTAINER_STARTUP_TIMEOUT_MS = '15000'; // Shorter timeout for tests
});

afterAll(async () => {
  // Global test cleanup
});