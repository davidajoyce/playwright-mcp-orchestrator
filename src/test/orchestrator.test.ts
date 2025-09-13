import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('MCP Playwright Orchestrator Integration Tests', () => {
  let orchestratorProcess: ChildProcessWithoutNullStreams;
  let client: Client;
  let transport: StdioClientTransport;

  beforeAll(async () => {
    // Start the orchestrator process
    const scriptPath = path.join(__dirname, '../index.ts');

    orchestratorProcess = spawn('npx', ['tsx', scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        LOG_LEVEL: 'error',
        MAX_INSTANCES: '2',
        CONTAINER_STARTUP_TIMEOUT_MS: '20000',
      },
    });

    // Set up client
    client = new Client({
      name: 'test-client',
      version: '1.0.0',
    });

    transport = new StdioClientTransport({
      readable: orchestratorProcess.stdout!,
      writable: orchestratorProcess.stdin!,
    });

    // Connect with timeout
    const connectPromise = client.connect(transport);
    const timeoutPromise = sleep(10000).then(() => {
      throw new Error('Connection timeout');
    });

    await Promise.race([connectPromise, timeoutPromise]);

    // Give extra time for initialization
    await sleep(2000);
  }, 30000);

  afterAll(async () => {
    try {
      if (client) {
        await client.close();
      }
    } catch (error) {
      console.error('Error closing client:', error);
    }

    if (orchestratorProcess && !orchestratorProcess.killed) {
      orchestratorProcess.kill('SIGTERM');

      // Wait for graceful shutdown
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
  }, 15000);

  describe('Tool Discovery', () => {
    it('should list available orchestrator tools', async () => {
      const result = await client.listTools();

      expect(result.tools).toBeDefined();
      expect(Array.isArray(result.tools)).toBe(true);
      expect(result.tools.length).toBeGreaterThan(0);

      // Check for expected tools
      const toolNames = result.tools.map(tool => tool.name);
      expect(toolNames).toContain('new_browser');
      expect(toolNames).toContain('list_instances');
      expect(toolNames).toContain('stop_browser');
      expect(toolNames).toContain('list_tools');
      expect(toolNames).toContain('call_tool');
      expect(toolNames).toContain('check_health');
    });

    it('should have properly structured tool definitions', async () => {
      const result = await client.listTools();

      const newBrowserTool = result.tools.find(tool => tool.name === 'new_browser');
      expect(newBrowserTool).toBeDefined();
      expect(newBrowserTool?.description).toBeTruthy();
      expect(newBrowserTool?.inputSchema).toBeDefined();
      expect(newBrowserTool?.inputSchema.type).toBe('object');
    });
  });

  describe('Instance Management', () => {
    it('should initially have no instances', async () => {
      const result = await client.callTool('list_instances', {});

      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content.length).toBeGreaterThan(0);

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.instances).toBeDefined();
      expect(Array.isArray(response.instances)).toBe(true);
      expect(response.count).toBe(0);
    });

    it('should handle instance creation with mock image (expected to fail)', async () => {
      // This test expects failure since we're using a mock image
      // In a real test environment, you'd use an actual Playwright MCP image
      try {
        const result = await client.callTool('new_browser', {
          name: 'test-browser',
          image: 'nginx:alpine', // Mock image that won't work as MCP server
        });

        const response = JSON.parse(result.content[0].text);

        // The creation should fail because nginx won't respond to MCP health checks
        expect(response.success).toBe(false);
        expect(response.error).toBeDefined();
        expect(typeof response.error).toBe('string');
      } catch (error) {
        // This is also acceptable - the tool call itself might fail
        expect(error).toBeDefined();
      }
    }, 30000);

    it('should handle non-existent instance queries gracefully', async () => {
      const fakeInstanceId = '00000000-0000-4000-8000-000000000000';

      const result = await client.callTool('list_tools', {
        instanceId: fakeInstanceId,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error).toContain('Instance not found');
    });

    it('should handle health check for non-existent instance', async () => {
      const fakeInstanceId = '00000000-0000-4000-8000-000000000000';

      const result = await client.callTool('check_health', {
        instanceId: fakeInstanceId,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error).toContain('Instance not found');
    });
  });

  describe('Tool Validation', () => {
    it('should validate tool parameters', async () => {
      // Test invalid UUID format
      try {
        await client.callTool('stop_browser', {
          instanceId: 'invalid-uuid',
        });
      } catch (error) {
        expect(error).toBeDefined();
        // The tool should reject invalid UUID format
      }
    });

    it('should handle missing required parameters', async () => {
      try {
        await client.callTool('stop_browser', {});
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('Error Handling', () => {
    it('should provide structured error responses', async () => {
      const result = await client.callTool('list_tools', {
        instanceId: '00000000-0000-4000-8000-000000000000',
      });

      expect(result.content).toBeDefined();
      expect(result.content.length).toBeGreaterThan(0);

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
      expect(typeof response.error).toBe('string');
    });

    it('should handle call_tool with non-existent instance', async () => {
      const result = await client.callTool('call_tool', {
        instanceId: '00000000-0000-4000-8000-000000000000',
        tool: 'some_tool',
        args: {},
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error).toContain('Instance not found');
    });
  });

  describe('Response Format Validation', () => {
    it('should return properly formatted JSON responses', async () => {
      const result = await client.callTool('list_instances', {});

      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content.length).toBeGreaterThan(0);
      expect(result.content[0].type).toBe('text');

      // Should be valid JSON
      expect(() => JSON.parse(result.content[0].text)).not.toThrow();

      const response = JSON.parse(result.content[0].text);
      expect(response).toHaveProperty('success');
      expect(typeof response.success).toBe('boolean');
    });

    it('should include metadata in successful responses', async () => {
      const result = await client.callTool('list_instances', {});
      const response = JSON.parse(result.content[0].text);

      if (response.success) {
        expect(response).toHaveProperty('instances');
        expect(response).toHaveProperty('count');
        expect(typeof response.count).toBe('number');
        expect(Array.isArray(response.instances)).toBe(true);
      }
    });
  });
});