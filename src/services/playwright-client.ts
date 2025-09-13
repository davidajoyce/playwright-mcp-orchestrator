import { InstanceInfo, PlaywrightTool } from "../types/index.js";
import { logger } from "../utils/logger.js";
import { config } from "../utils/config.js";

export class PlaywrightClient {
  constructor(private instance: InstanceInfo) {}

  async listTools(): Promise<PlaywrightTool[]> {
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
        id: Math.floor(Math.random() * 100000)
      };

      const response = await fetch(`${baseUrl}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(mcpRequest),
        signal: AbortSignal.timeout(config.healthCheckTimeoutMs),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const mcpResponse = await response.json();

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
        },
        body: JSON.stringify(mcpRequest),
        signal: AbortSignal.timeout(30000), // 30s timeout for tool calls
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const mcpResponse = await response.json();

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
        },
        body: JSON.stringify(mcpRequest),
        signal: AbortSignal.timeout(config.healthCheckTimeoutMs),
      });

      if (response.ok) {
        const mcpResponse = await response.json();
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