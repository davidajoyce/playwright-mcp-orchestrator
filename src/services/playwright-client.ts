import { InstanceInfo, PlaywrightTool } from "../types/index.js";
import { logger } from "../utils/logger.js";
import { config } from "../utils/config.js";

export class PlaywrightClient {
  constructor(private instance: InstanceInfo) {}

  async listTools(): Promise<PlaywrightTool[]> {
    const baseUrl = `http://${config.orchestratorHost}:${this.instance.port}`;

    try {
      logger.debug("Fetching tools from Playwright instance", {
        instanceId: this.instance.id,
        url: `${baseUrl}/tools`
      });

      const response = await fetch(`${baseUrl}/tools`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(config.healthCheckTimeoutMs),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      // Handle different response formats
      const tools = data.tools || data.result?.tools || data;

      if (!Array.isArray(tools)) {
        throw new Error("Invalid response format: expected array of tools");
      }

      logger.debug("Successfully retrieved tools", {
        instanceId: this.instance.id,
        toolCount: tools.length
      });

      return tools;
    } catch (error) {
      logger.error("Failed to list tools from Playwright instance", {
        instanceId: this.instance.id,
        error: error instanceof Error ? error.message : String(error)
      });
      throw new Error(`Failed to list tools: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async callTool(toolName: string, args: Record<string, any> = {}): Promise<any> {
    const baseUrl = `http://${config.orchestratorHost}:${this.instance.port}`;

    try {
      logger.debug("Calling tool on Playwright instance", {
        instanceId: this.instance.id,
        toolName,
        args,
        url: `${baseUrl}/tool/${encodeURIComponent(toolName)}`
      });

      const response = await fetch(`${baseUrl}/tool/${encodeURIComponent(toolName)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ arguments: args }),
        signal: AbortSignal.timeout(30000), // 30s timeout for tool calls
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const result = await response.json();

      logger.debug("Tool call completed successfully", {
        instanceId: this.instance.id,
        toolName,
        hasResult: !!result
      });

      return result;
    } catch (error) {
      logger.error("Failed to call tool on Playwright instance", {
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
      const response = await fetch(this.instance.healthUrl, {
        method: "GET",
        signal: AbortSignal.timeout(config.healthCheckTimeoutMs),
      });

      if (response.ok) {
        const health = await response.json();
        return health?.status === "ok" || health?.healthy === true;
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