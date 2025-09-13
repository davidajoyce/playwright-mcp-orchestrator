import { InstanceInfo, PlaywrightTool } from "../types/index.js";
import { logger } from "../utils/logger.js";
import { config } from "../utils/config.js";

// Helper function to parse SSE response from MCP server
function parseSSEResponse(responseText: string): any {
  const lines = responseText.split('\n');
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = line.substring(6);
      try {
        return JSON.parse(data);
      } catch (e) {
        return null;
      }
    }
  }
  return null;
}

export class PlaywrightClient {
  private sessionId: string | null = null;

  constructor(private instance: InstanceInfo) {}

  private async ensureSession(): Promise<void> {
    if (this.sessionId) {
      return; // Already have a session
    }

    const baseUrl = `http://${config.orchestratorHost}:${this.instance.port}`;

    try {
      logger.debug("Initializing MCP session with Playwright container", {
        instanceId: this.instance.id,
        url: `${baseUrl}/mcp`
      });

      const initRequest = {
        jsonrpc: "2.0",
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: {
            name: "mcp-playwright-orchestrator",
            version: "1.0.0"
          }
        },
        id: Math.floor(Math.random() * 100000)
      };

      const response = await fetch(`${baseUrl}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json, text/event-stream",
        },
        body: JSON.stringify(initRequest),
        signal: AbortSignal.timeout(config.healthCheckTimeoutMs),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Get session ID from response headers
      this.sessionId = response.headers.get('mcp-session-id') || 'default-session';

      const responseText = await response.text();
      const mcpResponse = parseSSEResponse(responseText);

      if (!mcpResponse) {
        throw new Error(`Failed to parse SSE response during session initialization`);
      }

      if (mcpResponse.error) {
        throw new Error(`MCP initialization error: ${mcpResponse.error.message || JSON.stringify(mcpResponse.error)}`);
      }

      logger.debug("MCP session initialized successfully", {
        instanceId: this.instance.id,
        sessionId: this.sessionId,
        serverInfo: mcpResponse.result?.serverInfo
      });

    } catch (error) {
      logger.error("Failed to initialize MCP session", {
        instanceId: this.instance.id,
        error: error instanceof Error ? error.message : String(error)
      });
      throw new Error(`Failed to initialize session: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async listTools(): Promise<PlaywrightTool[]> {
    // Ensure we have a valid MCP session
    await this.ensureSession();

    const baseUrl = `http://${config.orchestratorHost}:${this.instance.port}`;

    try {
      logger.debug("Sending MCP listTools request to Playwright instance", {
        instanceId: this.instance.id,
        url: `${baseUrl}/mcp`
      });

      // Send proper MCP JSON-RPC request to list tools
      const mcpRequest = {
        jsonrpc: "2.0",
        method: "tools/list",
        params: {},
        id: Math.floor(Math.random() * 100000)
      };

      const response = await fetch(`${baseUrl}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json, text/event-stream",
          ...(this.sessionId && { "mcp-session-id": this.sessionId }),
        },
        body: JSON.stringify(mcpRequest),
        signal: AbortSignal.timeout(10000), // Increased timeout for debugging
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const responseText = await response.text();
      const mcpResponse = parseSSEResponse(responseText);

      if (!mcpResponse) {
        throw new Error(`Failed to parse SSE response from MCP server`);
      }

      if (mcpResponse.error) {
        throw new Error(`MCP Error: ${mcpResponse.error.message || JSON.stringify(mcpResponse.error)}`);
      }

      const tools = mcpResponse.result?.tools || [];

      if (!Array.isArray(tools)) {
        throw new Error("Invalid MCP response format: expected tools array in result");
      }

      // Transform MCP tools to our format
      const transformedTools: PlaywrightTool[] = tools.map((tool: any) => ({
        name: tool.name,
        description: tool.description || "",
        inputSchema: tool.inputSchema || {
          type: "object",
          properties: {},
        },
      }));

      logger.debug("Successfully retrieved tools from Playwright MCP", {
        instanceId: this.instance.id,
        toolCount: transformedTools.length
      });

      return transformedTools;
    } catch (error) {
      logger.error("Failed to list tools from Playwright MCP instance", {
        instanceId: this.instance.id,
        error: error instanceof Error ? error.message : String(error)
      });
      throw new Error(`Failed to list tools: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async callTool(toolName: string, args: Record<string, any> = {}): Promise<any> {
    const baseUrl = `http://${config.orchestratorHost}:${this.instance.port}`;

    try {
      logger.debug("Sending MCP tool call request to Playwright instance", {
        instanceId: this.instance.id,
        toolName,
        args,
        url: `${baseUrl}/mcp`
      });

      // Send proper MCP JSON-RPC request to call tool
      const mcpRequest = {
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          name: toolName,
          arguments: args
        },
        id: Math.floor(Math.random() * 100000)
      };

      const response = await fetch(`${baseUrl}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json, text/event-stream",
        },
        body: JSON.stringify(mcpRequest),
        signal: AbortSignal.timeout(30000), // 30s timeout for tool calls
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const responseText = await response.text();
      const mcpResponse = parseSSEResponse(responseText);

      if (!mcpResponse) {
        throw new Error(`Failed to parse SSE response from MCP server`);
      }

      if (mcpResponse.error) {
        throw new Error(`MCP Error: ${mcpResponse.error.message || JSON.stringify(mcpResponse.error)}`);
      }

      const result = mcpResponse.result;

      logger.debug("MCP tool call completed successfully", {
        instanceId: this.instance.id,
        toolName,
        hasResult: !!result
      });

      return result;
    } catch (error) {
      logger.error("Failed to call tool on Playwright MCP instance", {
        instanceId: this.instance.id,
        toolName,
        args,
        error: error instanceof Error ? error.message : String(error)
      });
      throw new Error(`Failed to call tool '${toolName}': ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async checkHealth(): Promise<boolean> {
    try {
      // Check if the MCP server is responding by sending a simple request
      const baseUrl = `http://${config.orchestratorHost}:${this.instance.port}`;

      // Try to send an MCP initialize request to check if server is responding
      const mcpRequest = {
        jsonrpc: "2.0",
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: {
            name: "orchestrator-health-check",
            version: "1.0.0"
          }
        },
        id: 1
      };

      const response = await fetch(`${baseUrl}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json, text/event-stream",
        },
        body: JSON.stringify(mcpRequest),
        signal: AbortSignal.timeout(config.healthCheckTimeoutMs),
      });

      if (response.ok) {
        const responseText = await response.text();
      const mcpResponse = parseSSEResponse(responseText);

      if (!mcpResponse) {
        throw new Error(`Failed to parse SSE response from MCP server`);
      }
        // If we get a valid MCP response (success or error), the server is running
        return mcpResponse.jsonrpc === "2.0" && (mcpResponse.result || mcpResponse.error);
      }
      return false;
    } catch {
      return false;
    }
  }

  getInstanceInfo(): InstanceInfo {
    return { ...this.instance };
  }
}