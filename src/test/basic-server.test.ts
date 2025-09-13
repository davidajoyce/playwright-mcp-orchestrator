import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setTimeout as sleep } from 'node:timers/promises';

describe('MCP Orchestrator Basic Server Test', () => {
  const serverPort = 3002;
  const baseUrl = `http://localhost:${serverPort}`;
  let serverProcess: any;

  beforeAll(async () => {
    // Test without starting the actual server - just test if we can import and build
    const { DockerManager } = await import('../services/docker-manager.js');
    const { PlaywrightClient } = await import('../services/playwright-client.js');
    const { config } = await import('../utils/config.js');
    const { logger } = await import('../utils/logger.js');

    expect(DockerManager).toBeDefined();
    expect(PlaywrightClient).toBeDefined();
    expect(config).toBeDefined();
    expect(logger).toBeDefined();
  });

  describe('Module Imports and Structure', () => {
    it('should import all required modules without errors', async () => {
      const { DockerManager } = await import('../services/docker-manager.js');
      const { PlaywrightClient } = await import('../services/playwright-client.js');

      expect(typeof DockerManager).toBe('function'); // Constructor
      expect(typeof PlaywrightClient).toBe('function'); // Constructor
    });

    it('should have proper configuration structure', async () => {
      const { config } = await import('../utils/config.js');

      expect(config).toHaveProperty('defaultImage');
      expect(config).toHaveProperty('exposedPortInContainer');
      expect(config).toHaveProperty('orchestratorHost');
      expect(config).toHaveProperty('maxInstances');
      expect(config).toHaveProperty('healthCheckTimeoutMs');
      expect(config).toHaveProperty('containerStartupTimeoutMs');
      expect(config).toHaveProperty('enableDnsRebindingProtection');
      expect(config).toHaveProperty('allowedHosts');
      expect(config).toHaveProperty('logLevel');
      expect(config).toHaveProperty('rateLimiting');

      expect(typeof config.defaultImage).toBe('string');
      expect(typeof config.exposedPortInContainer).toBe('number');
      expect(typeof config.maxInstances).toBe('number');
      expect(Array.isArray(config.allowedHosts)).toBe(true);
    });

    it('should have proper type definitions', async () => {
      const types = await import('../types/index.js');

      expect(types.InstanceSchema).toBeDefined();
      expect(types.ContainerConfigSchema).toBeDefined();
      expect(types.ToolCallSchema).toBeDefined();
      expect(types.PlaywrightToolSchema).toBeDefined();
    });
  });

  describe('Docker Manager Unit Tests (No Docker Required)', () => {
    it('should create DockerManager instance', async () => {
      const { DockerManager } = await import('../services/docker-manager.js');

      const manager = new DockerManager();
      expect(manager).toBeDefined();

      // Test methods that don't require Docker
      const instances = manager.getAllInstances();
      expect(Array.isArray(instances)).toBe(true);
      expect(instances.length).toBe(0);

      const nonExistentInstance = manager.getInstance('fake-id');
      expect(nonExistentInstance).toBeUndefined();
    });

    it('should validate configuration parsing methods', async () => {
      const { DockerManager } = await import('../services/docker-manager.js');
      const manager = new DockerManager();

      // Access private methods for testing
      const parseMemory = (manager as any).parseMemory.bind(manager);
      const parseCpus = (manager as any).parseCpus.bind(manager);

      // Test memory parsing
      expect(parseMemory('512m')).toBe(512 * 1024 * 1024);
      expect(parseMemory('1g')).toBe(1 * 1024 * 1024 * 1024);
      expect(parseMemory('1024k')).toBe(1024 * 1024);
      expect(() => parseMemory('invalid')).toThrow();

      // Test CPU parsing
      expect(parseCpus('1')).toBe(100000);
      expect(parseCpus('0.5')).toBe(50000);
      expect(() => parseCpus('invalid')).toThrow();
      expect(() => parseCpus('0')).toThrow();
    });

    it('should generate random ports in correct range', async () => {
      const { DockerManager } = await import('../services/docker-manager.js');
      const manager = new DockerManager();

      const generateRandomPort = (manager as any).generateRandomPort.bind(manager);

      for (let i = 0; i < 10; i++) {
        const port = generateRandomPort();
        expect(port).toBeGreaterThanOrEqual(30000);
        expect(port).toBeLessThanOrEqual(50000);
        expect(Number.isInteger(port)).toBe(true);
      }
    });
  });

  describe('Playwright Client Unit Tests (No Network Required)', () => {
    it('should create PlaywrightClient instance', async () => {
      const { PlaywrightClient } = await import('../services/playwright-client.js');

      const mockInstance = {
        id: 'test-id',
        name: 'test',
        image: 'test-image',
        containerId: 'test-container',
        port: 3001,
        createdAt: new Date().toISOString(),
        status: 'running' as const,
        healthUrl: 'http://localhost:3001/health',
      };

      const client = new PlaywrightClient(mockInstance);
      expect(client).toBeDefined();

      const instanceInfo = client.getInstanceInfo();
      expect(instanceInfo).toEqual(mockInstance);
    });
  });

  describe('Logger Configuration', () => {
    it('should have proper logger setup', async () => {
      const { logger } = await import('../utils/logger.js');

      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.debug).toBe('function');
    });
  });

  describe('Zod Schema Validation', () => {
    it('should validate instance schema correctly', async () => {
      const { InstanceSchema } = await import('../types/index.js');

      const validInstance = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'test',
        image: 'test-image',
        containerId: 'test-container',
        port: 3001,
        createdAt: new Date().toISOString(),
        status: 'running',
        healthUrl: 'http://localhost:3001/health',
      };

      const result = InstanceSchema.safeParse(validInstance);
      expect(result.success).toBe(true);

      // Test invalid instance
      const invalidInstance = {
        id: 'invalid-uuid',
        port: 'not-a-number',
      };

      const invalidResult = InstanceSchema.safeParse(invalidInstance);
      expect(invalidResult.success).toBe(false);
    });

    it('should validate tool call schema correctly', async () => {
      const { ToolCallSchema } = await import('../types/index.js');

      const validToolCall = {
        instanceId: '123e4567-e89b-12d3-a456-426614174000',
        tool: 'test-tool',
        args: { key: 'value' },
      };

      const result = ToolCallSchema.safeParse(validToolCall);
      expect(result.success).toBe(true);

      // Test invalid tool call
      const invalidToolCall = {
        instanceId: 'invalid-uuid',
        tool: 123, // should be string
      };

      const invalidResult = ToolCallSchema.safeParse(invalidToolCall);
      expect(invalidResult.success).toBe(false);
    });
  });

  describe('Environment Configuration', () => {
    it('should handle environment variables properly', async () => {
      const { config } = await import('../utils/config.js');

      // Test default values are reasonable
      expect(config.defaultImage).toContain('playwright');
      expect(config.exposedPortInContainer).toBeGreaterThan(0);
      expect(config.maxInstances).toBeGreaterThan(0);
      expect(config.healthCheckTimeoutMs).toBeGreaterThan(0);
      expect(config.containerStartupTimeoutMs).toBeGreaterThan(0);
    });
  });
});