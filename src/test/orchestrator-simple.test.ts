import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('MCP Orchestrator Basic Functionality', () => {
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
        MAX_INSTANCES: '1',
        CONTAINER_STARTUP_TIMEOUT_MS: '5000',
      },
    });

    // Wait a moment for the process to start
    await sleep(2000);

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
    const timeoutPromise = sleep(8000).then(() => {
      throw new Error('Connection timeout');
    });

    await Promise.race([connectPromise, timeoutPromise]);
  }, 15000);

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

      await new Promise<void>((resolve) => {
        orchestratorProcess.on('exit', () => resolve());
        setTimeout(() => {
          if (!orchestratorProcess.killed) {
            orchestratorProcess.kill('SIGKILL');
          }
          resolve();
        }, 3000);
      });
    }
  }, 10000);

  describe('MCP Protocol Compliance', () => {
    it('should list available tools', async () => {
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

      for (const tool of result.tools) {
        expect(tool.name).toBeTruthy();
        expect(typeof tool.name).toBe('string');
        expect(tool.description).toBeTruthy();
        expect(typeof tool.description).toBe('string');
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
      }
    });
  });

  describe('Instance Management (No Docker)', () => {
    it('should start with no instances', async () => {
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

    it('should handle queries for non-existent instances gracefully', async () => {
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

    it('should handle stop_browser for non-existent instance', async () => {
      const fakeInstanceId = '00000000-0000-4000-8000-000000000000';

      const result = await client.callTool('stop_browser', {
        instanceId: fakeInstanceId,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error).toContain('Instance not found');
    });

    it('should handle call_tool for non-existent instance', async () => {
      const fakeInstanceId = '00000000-0000-4000-8000-000000000000';

      const result = await client.callTool('call_tool', {
        instanceId: fakeInstanceId,
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
  });
});