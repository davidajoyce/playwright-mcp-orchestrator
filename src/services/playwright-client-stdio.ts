import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InstanceInfo, PlaywrightTool } from "../types/index.js";
import { logger } from "../utils/logger.js";

/**
 * WORKING Playwright MCP Client using STDIO communication
 * This replaces the HTTP-based approach that was failing
 */
export class PlaywrightClientStdio {
  private mcpClient: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private isConnected = false;

  constructor(private instance: InstanceInfo) {}

  private async ensureConnection(): Promise<void> {
    if (this.isConnected && this.mcpClient) {
      return;
    }

    try {
      logger.debug("Connecting to Playwright MCP via stdio", {
        instanceId: this.instance.id
      });

      // Use the exact same configuration that works in Claude Code
      this.transport = new StdioClientTransport({
        command: "docker",
        args: [
          "run",
          "-i",
          "--rm",
          "--init",
          "mcr.microsoft.com/playwright/mcp"
        ]
      });

      this.mcpClient = new Client({
        name: "mcp-playwright-orchestrator",
        version: "1.0.0"
      });

      await this.mcpClient.connect(this.transport);
      this.isConnected = true;

      logger.info("Successfully connected to Playwright MCP via stdio", {
        instanceId: this.instance.id
      });

    } catch (error) {
      logger.error("Failed to connect to Playwright MCP via stdio", {
        instanceId: this.instance.id,
        error: error instanceof Error ? error.message : String(error)
      });
      throw new Error(`Failed to connect: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async listTools(): Promise<PlaywrightTool[]> {
    await this.ensureConnection();

    if (!this.mcpClient) {
      throw new Error("MCP client not initialized");
    }

    try {
      logger.debug("Listing tools via stdio MCP client", {
        instanceId: this.instance.id
      });

      const result = await this.mcpClient.listTools();

      // Transform MCP tools to our format
      const transformedTools: PlaywrightTool[] = result.tools.map((tool: any) => ({
        name: tool.name,
        description: tool.description || "",
        inputSchema: tool.inputSchema || {
          type: "object",
          properties: {},
        },
      }));

      logger.info("Successfully retrieved tools via stdio", {
        instanceId: this.instance.id,
        toolCount: transformedTools.length,
        tools: transformedTools.map(t => t.name)
      });

      return transformedTools;
    } catch (error) {
      logger.error("Failed to list tools via stdio", {
        instanceId: this.instance.id,
        error: error instanceof Error ? error.message : String(error)
      });
      throw new Error(`Failed to list tools: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async callTool(toolName: string, args: Record<string, any> = {}): Promise<any> {
    await this.ensureConnection();

    if (!this.mcpClient) {
      throw new Error("MCP client not initialized");
    }

    try {
      logger.debug("Calling tool via stdio MCP client", {
        instanceId: this.instance.id,
        toolName,
        args
      });

      const result = await this.mcpClient.callTool({
        name: toolName,
        arguments: args
      });

      logger.debug("Tool call completed successfully via stdio", {
        instanceId: this.instance.id,
        toolName,
        hasResult: !!result
      });

      return result;
    } catch (error) {
      logger.error("Failed to call tool via stdio", {
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
      // For stdio approach, we check if we can establish connection
      await this.ensureConnection();
      return this.isConnected && !!this.mcpClient;
    } catch {
      return false;
    }
  }

  async disconnect(): Promise<void> {
    if (this.mcpClient) {
      try {
        await this.mcpClient.close();
        logger.debug("Disconnected from Playwright MCP via stdio", {
          instanceId: this.instance.id
        });
      } catch (error) {
        logger.warn("Error during disconnect", {
          instanceId: this.instance.id,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    this.mcpClient = null;
    this.transport = null;
    this.isConnected = false;
  }

  getInstanceInfo(): InstanceInfo {
    return { ...this.instance };
  }
}