import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { DockerManager } from "./services/docker-manager.js";
import { PlaywrightClientStdio } from "./services/playwright-client-stdio.js";
import { logger } from "./utils/logger.js";
import { config } from "./utils/config.js";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { randomUUID } from "node:crypto";

class PlaywrightOrchestrator {
  private server: McpServer;
  private dockerManager: DockerManager;
  private app?: express.Application;
  private isShuttingDown = false;

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
    // Tool: Create new Playwright browser instance
    this.server.tool(
      "new_browser",
      {
        name: z.string().optional().describe("Human-readable name for the instance"),
        image: z.string().optional().describe("Docker image to use for Playwright MCP"),
      },
      async ({ name, image }) => {
        try {
          const instance = await this.dockerManager.createPlaywrightInstance(image, name);
          logger.info("Created new browser instance", { instanceId: instance.id });

          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                success: true,
                instance: {
                  id: instance.id,
                  name: instance.name,
                  image: instance.image,
                  port: instance.port,
                  status: instance.status,
                  createdAt: instance.createdAt,
                },
              }, null, 2)
            }]
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error("Failed to create browser instance", { error: errorMessage });

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

    // Tool: Stop a browser instance
    this.server.tool(
      "stop_browser",
      {
        instanceId: z.string().uuid().describe("ID of the instance to stop"),
      },
      async ({ instanceId }) => {
        try {
          await this.dockerManager.stopInstance(instanceId);
          logger.info("Stopped browser instance", { instanceId });

          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                success: true,
                message: `Stopped instance ${instanceId}`,
              }, null, 2)
            }]
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error("Failed to stop browser instance", { instanceId, error: errorMessage });

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

    // Tool: List available tools from a specific instance
    this.server.tool(
      "list_tools",
      {
        instanceId: z.string().uuid().describe("ID of the Playwright instance"),
      },
      async ({ instanceId }) => {
        try {
          const instance = this.dockerManager.getInstance(instanceId);
          if (!instance) {
            throw new Error(`Instance not found: ${instanceId}`);
          }

          const client = new PlaywrightClientStdio(instance);
          const tools = await client.listTools();

          logger.debug("Listed tools for instance", { instanceId, toolCount: tools.length });

          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                success: true,
                instanceId,
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

          const client = new PlaywrightClientStdio(instance);
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

  async startStdio(): Promise<void> {
    logger.info("Starting MCP orchestrator with stdio transport");

    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    logger.info("MCP orchestrator started successfully with stdio transport");
  }

  async startHttp(port: number = 3000): Promise<void> {
    logger.info("Starting MCP orchestrator with HTTP transport", { port });

    this.app = express();

    // Security middleware
    this.app.use(helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }));

    this.app.use(cors({
      origin: "*", // Configure for production
      exposedHeaders: ["Mcp-Session-Id"],
      allowedHeaders: ["Content-Type", "mcp-session-id"],
    }));

    // Rate limiting
    this.app.use(rateLimit({
      windowMs: config.rateLimiting.windowMs,
      max: config.rateLimiting.max,
      message: { error: "Too many requests" },
    }));

    this.app.use(express.json({ limit: "10mb" }));

    // Health endpoint
    this.app.get("/health", (_req, res) => {
      res.json({
        status: "ok",
        version: "0.2.0",
        instances: this.dockerManager.getAllInstances().length,
        uptime: process.uptime(),
      });
    });

    // Map to store transports by session ID
    const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

    // MCP endpoint
    this.app.all("/mcp", async (req, res) => {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      let transport: StreamableHTTPServerTransport;

      if (sessionId && transports[sessionId]) {
        transport = transports[sessionId];
      } else if (!sessionId && req.method === "POST") {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (id) => {
            transports[id] = transport;
          },
          enableDnsRebindingProtection: config.enableDnsRebindingProtection,
          allowedHosts: config.allowedHosts,
        });

        transport.onclose = () => {
          if (transport.sessionId) {
            delete transports[transport.sessionId];
          }
        };

        await this.server.connect(transport);
      } else {
        res.status(400).json({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Bad Request: No valid session ID provided",
          },
          id: null,
        });
        return;
      }

      await transport.handleRequest(req, res, req.body);
    });

    this.app.listen(port, () => {
      logger.info(`MCP orchestrator started successfully on port ${port}`);
    });
  }
}

// Main execution
async function main(): Promise<void> {
  const orchestrator = new PlaywrightOrchestrator();

  // Check if running in HTTP mode
  const httpMode = process.argv.includes("--http");
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  if (httpMode) {
    await orchestrator.startHttp(port);
  } else {
    await orchestrator.startStdio();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    logger.error("Failed to start orchestrator", { error });
    process.exit(1);
  });
}