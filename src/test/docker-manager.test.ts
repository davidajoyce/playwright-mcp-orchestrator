import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DockerManager } from '../services/docker-manager.js';

describe('DockerManager Unit Tests', () => {
  let dockerManager: DockerManager;

  beforeEach(() => {
    dockerManager = new DockerManager();
  });

  afterEach(async () => {
    // Clean up any created instances
    try {
      await dockerManager.cleanup();
    } catch (error) {
      // Ignore cleanup errors in tests
    }
  });

  describe('Instance Management', () => {
    it('should start with no instances', () => {
      const instances = dockerManager.getAllInstances();
      expect(instances).toEqual([]);
      expect(instances.length).toBe(0);
    });

    it('should handle instance queries for non-existent instances', () => {
      const fakeId = '00000000-0000-4000-8000-000000000000';
      const instance = dockerManager.getInstance(fakeId);
      expect(instance).toBeUndefined();
    });

    it('should enforce maximum instance limits', async () => {
      // Mock the config to have a low limit
      vi.doMock('../utils/config.js', () => ({
        config: {
          ...vi.importActual('../utils/config.js').config,
          maxInstances: 0, // Set to 0 to test limit
        },
      }));

      // This should throw because we're at the limit
      await expect(
        dockerManager.createPlaywrightInstance('nginx:alpine', 'test')
      ).rejects.toThrow('Maximum instances limit reached');
    });
  });

  describe('Configuration Validation', () => {
    it('should handle invalid memory configuration', () => {
      const parseMemory = (dockerManager as any).parseMemory.bind(dockerManager);

      expect(() => parseMemory('invalid')).toThrow('Invalid memory format');
      expect(() => parseMemory('')).toThrow('Invalid memory format');

      // Valid formats should work
      expect(parseMemory('512m')).toBe(512 * 1024 * 1024);
      expect(parseMemory('1g')).toBe(1 * 1024 * 1024 * 1024);
      expect(parseMemory('1024k')).toBe(1024 * 1024);
    });

    it('should handle invalid CPU configuration', () => {
      const parseCpus = (dockerManager as any).parseCpus.bind(dockerManager);

      expect(() => parseCpus('invalid')).toThrow('Invalid CPU value');
      expect(() => parseCpus('0')).toThrow('Invalid CPU value');
      expect(() => parseCpus('-1')).toThrow('Invalid CPU value');

      // Valid formats should work
      expect(parseCpus('1')).toBe(100000);
      expect(parseCpus('0.5')).toBe(50000);
      expect(parseCpus('2')).toBe(200000);
    });
  });

  describe('Health Checking', () => {
    it('should return unknown for non-existent instances', async () => {
      const fakeId = '00000000-0000-4000-8000-000000000000';
      const health = await dockerManager.getContainerHealth(fakeId);
      expect(health).toBe('unknown');
    });
  });

  describe('Container Creation Parameters', () => {
    it('should generate unique ports', () => {
      const generateRandomPort = (dockerManager as any).generateRandomPort.bind(dockerManager);

      const port1 = generateRandomPort();
      const port2 = generateRandomPort();

      expect(port1).toBeGreaterThanOrEqual(30000);
      expect(port1).toBeLessThanOrEqual(50000);
      expect(port2).toBeGreaterThanOrEqual(30000);
      expect(port2).toBeLessThanOrEqual(50000);

      // They should be different (with high probability)
      // Run this multiple times to be more confident
      const ports = new Set();
      for (let i = 0; i < 100; i++) {
        ports.add(generateRandomPort());
      }
      expect(ports.size).toBeGreaterThan(50); // Should have many unique ports
    });
  });

  describe('Error Handling', () => {
    it('should handle cleanup gracefully when no instances exist', async () => {
      await expect(dockerManager.cleanup()).resolves.not.toThrow();
    });

    it('should handle stopping non-existent instances', async () => {
      const fakeId = '00000000-0000-4000-8000-000000000000';
      await expect(dockerManager.stopInstance(fakeId)).rejects.toThrow('Instance not found');
    });
  });
});