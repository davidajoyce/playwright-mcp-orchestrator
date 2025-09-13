import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('MCP Orchestrator HTTP Server', () => {
  let orchestratorProcess: ChildProcessWithoutNullStreams;
  const serverPort = 3001; // Different port to avoid conflicts
  const baseUrl = `http://localhost:${serverPort}`;

  beforeAll(async () => {
    // Start the orchestrator in HTTP mode
    const scriptPath = path.join(__dirname, '../index.ts');

    orchestratorProcess = spawn('npx', ['tsx', scriptPath, '--http'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PORT: serverPort.toString(),
        LOG_LEVEL: 'error',
        MAX_INSTANCES: '2',
        CONTAINER_STARTUP_TIMEOUT_MS: '15000',
      },
    });

    // Wait for server to start
    await sleep(3000);

    // Check if server is responding
    let serverReady = false;
    for (let i = 0; i < 10; i++) {
      try {
        const response = await fetch(`${baseUrl}/health`);
        if (response.ok) {
          serverReady = true;
          break;
        }
      } catch (error) {
        // Server not ready yet
      }
      await sleep(1000);
    }

    if (!serverReady) {
      throw new Error('Server failed to start within timeout');
    }
  }, 20000);

  afterAll(async () => {
    if (orchestratorProcess && !orchestratorProcess.killed) {
      orchestratorProcess.kill('SIGTERM');

      await new Promise<void>((resolve) => {
        orchestratorProcess.on('exit', () => resolve());
        setTimeout(() => {
          if (!orchestratorProcess.killed) {
            orchestratorProcess.kill('SIGKILL');
          }
          resolve();
        }, 5000);
      });
    }
  }, 10000);

  describe('Health Endpoint', () => {
    it('should return healthy status', async () => {
      const response = await fetch(`${baseUrl}/health`);
      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data).toHaveProperty('status', 'ok');
      expect(data).toHaveProperty('version');
      expect(data).toHaveProperty('instances');
      expect(data).toHaveProperty('uptime');
    });
  });

  describe('CORS and Security Headers', () => {
    it('should include CORS headers', async () => {
      const response = await fetch(`${baseUrl}/health`, {
        method: 'OPTIONS',
      });

      expect(response.headers.get('access-control-allow-origin')).toBeTruthy();
    });

    it('should include security headers', async () => {
      const response = await fetch(`${baseUrl}/health`);

      // Helmet should add security headers
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    });
  });

  describe('Rate Limiting', () => {
    it('should handle normal request load', async () => {
      // Make several requests quickly
      const promises = Array.from({ length: 10 }, () =>
        fetch(`${baseUrl}/health`)
      );

      const responses = await Promise.all(promises);

      // Most requests should succeed
      const successfulResponses = responses.filter(r => r.ok);
      expect(successfulResponses.length).toBeGreaterThan(5);
    });
  });

  describe('MCP Endpoint Basic Functionality', () => {
    it('should reject requests without proper session handling', async () => {
      const response = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'notifications/initialized',
          params: {},
          id: 1,
        }),
      });

      // This should fail because it's not a proper initialize request
      expect(response.status).toBe(400);
    });

    it('should handle malformed JSON', async () => {
      const response = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: 'invalid json',
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 requests gracefully', async () => {
      const response = await fetch(`${baseUrl}/nonexistent`);
      expect(response.status).toBe(404);
    });

    it('should handle large payloads within limits', async () => {
      const largeButValidPayload = {
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          data: 'x'.repeat(1000), // 1KB of data, should be fine
        },
        id: 1,
      };

      const response = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(largeButValidPayload),
      });

      // Should handle this, though it may not be a valid MCP request
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('Server Robustness', () => {
    it('should handle concurrent requests', async () => {
      const promises = Array.from({ length: 5 }, (_, i) =>
        fetch(`${baseUrl}/health`).then(r => ({ index: i, ok: r.ok }))
      );

      const results = await Promise.all(promises);
      const allSuccessful = results.every(r => r.ok);

      expect(allSuccessful).toBe(true);
    });

    it('should maintain health under load', async () => {
      // Make multiple health checks
      for (let i = 0; i < 5; i++) {
        const response = await fetch(`${baseUrl}/health`);
        expect(response.ok).toBe(true);
        await sleep(100);
      }
    });
  });
});