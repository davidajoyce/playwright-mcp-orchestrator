import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { DockerManager } from "./services/docker-manager.js";
import { PlaywrightClientStdio } from "./services/playwright-client-stdio.js";
import { logger } from "./utils/logger.js";

class PlaywrightOrchestrator {
  private server: McpServer;
  private dockerManager: DockerManager;
  private isShuttingDown = false;
  private clientCache = new Map<string, PlaywrightClientStdio>(); // Cache clients by instanceId

  constructor() {
    this.dockerManager = new DockerManager();
    this.server = new McpServer({
      name: "playwright-orchestrator",
      version: "0.2.0",
    });

    this.setupTools();
    this.setupGracefulShutdown();
  }

  private setupTools(): void {
    // Orchestrator provides minimal management tools
    // Browser instances are created automatically when needed

    // Tool: List all active instances
    this.server.tool(
      "list_instances",
      {},
      async () => {
        const instances = this.dockerManager.getAllInstances();
        logger.debug("Listed instances", { count: instances.length });

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              instances: instances.map(instance => ({
                id: instance.id,
                name: instance.name,
                image: instance.image,
                port: instance.port,
                status: instance.status,
                createdAt: instance.createdAt,
              })),
              count: instances.length,
            }, null, 2)
          }]
        };
      }
    );


    // Tool: List available tools (creates instance automatically if needed)
    this.server.tool(
      "list_tools",
      {
        instanceId: z.string().uuid().optional().describe("Optional ID of existing Playwright instance"),
      },
      async ({ instanceId }) => {
        try {
          let instance;

          if (instanceId) {
            // Use existing instance if provided
            instance = this.dockerManager.getInstance(instanceId);
            if (!instance) {
              throw new Error(`Instance not found: ${instanceId}`);
            }
          } else {
            // Auto-create a new instance
            instance = await this.dockerManager.createPlaywrightInstance();
            logger.info("Auto-created browser instance for list_tools", { instanceId: instance.id });
          }

          const client = new PlaywrightClientStdio(instance);
          const tools = await client.listTools();

          logger.debug("Listed tools for instance", { instanceId: instance.id, toolCount: tools.length });

          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                success: true,
                instanceId: instance.id,
                tools,
                count: tools.length,
              }, null, 2)
            }]
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error("Failed to list tools", { instanceId, error: errorMessage });

          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                success: false,
                error: errorMessage,
              }, null, 2)
            }],
            isError: true,
          };
        }
      }
    );

    // Tool: Call a tool on a specific instance
    this.server.tool(
      "call_tool",
      {
        instanceId: z.string().uuid().describe("ID of the Playwright instance"),
        tool: z.string().describe("Name of the tool to call"),
        args: z.record(z.any()).optional().describe("Arguments to pass to the tool"),
      },
      async ({ instanceId, tool, args = {} }) => {
        try {
          const instance = this.dockerManager.getInstance(instanceId);
          if (!instance) {
            throw new Error(`Instance not found: ${instanceId}`);
          }

          // Get or create cached client for this instance
          let client = this.clientCache.get(instanceId);
          if (!client) {
            client = new PlaywrightClientStdio(instance);
            this.clientCache.set(instanceId, client);
            logger.debug("Created new PlaywrightClientStdio for instance", { instanceId });
          } else {
            logger.debug("Reusing cached PlaywrightClientStdio for instance", { instanceId });
          }

          const result = await client.callTool(tool, args);

          logger.debug("Proxying tool result transparently", {
            instanceId,
            tool,
            hasResult: !!result,
            resultKeys: result ? Object.keys(result) : [],
            isError: result?.isError
          });

          // TRANSPARENT PROXY: Return the exact same structure as Playwright MCP
          // No wrapping in success/error objects - just pass through the raw result
          return result;

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error("Failed to call tool", { instanceId, tool, args, error: errorMessage });

          // Return error in the same format as Playwright MCP would
          return {
            content: [{
              type: "text" as const,
              text: `Error calling tool '${tool}': ${errorMessage}`
            }],
            isError: true,
          };
        }
      }
    );

    // Tool: Check health of a specific instance
    this.server.tool(
      "check_health",
      {
        instanceId: z.string().uuid().describe("ID of the Playwright instance"),
      },
      async ({ instanceId }) => {
        try {
          const instance = this.dockerManager.getInstance(instanceId);
          if (!instance) {
            throw new Error(`Instance not found: ${instanceId}`);
          }

          const health = await this.dockerManager.getContainerHealth(instanceId);

          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                success: true,
                instanceId,
                health,
                status: instance.status,
              }, null, 2)
            }]
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error("Failed to check health", { instanceId, error: errorMessage });

          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                success: false,
                error: errorMessage,
              }, null, 2)
            }],
            isError: true,
          };
        }
      }
    );
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      if (this.isShuttingDown) return;
      this.isShuttingDown = true;

      logger.info(`Received ${signal}, shutting down gracefully...`);

      try {
        // Clean up cached clients
        logger.info("Cleaning up cached MCP clients", { count: this.clientCache.size });
        for (const [instanceId, client] of this.clientCache.entries()) {
          try {
            await client.disconnect();
          } catch (error) {
            logger.warn("Error disconnecting client", { instanceId, error });
          }
        }
        this.clientCache.clear();

        // Clean up Docker instances
        await this.dockerManager.cleanup();

        // Close MCP server
        await this.server.close();

        logger.info("Shutdown complete");
        process.exit(0);
      } catch (error) {
        logger.error("Error during shutdown", { error });
        process.exit(1);
      }
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("uncaughtException", (error) => {
      logger.error("Uncaught exception", { error });
      shutdown("uncaughtException");
    });
    process.on("unhandledRejection", (reason) => {
      logger.error("Unhandled rejection", { reason });
      shutdown("unhandledRejection");
    });
  }

  async start(): Promise<void> {
    logger.info("Starting MCP orchestrator with stdio transport");

    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    logger.info("MCP orchestrator started successfully with stdio transport");
  }
}

// Main execution
async function main(): Promise<void> {
  const orchestrator = new PlaywrightOrchestrator();
  await orchestrator.start();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    logger.error("Failed to start orchestrator", { error });
    process.exit(1);
  });
}