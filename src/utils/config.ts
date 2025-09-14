import { OrchestratorConfig } from "../types/index.js";

export const config: OrchestratorConfig = {
  defaultImage: process.env.PLAYWRIGHT_MCP_IMAGE ?? "mcr.microsoft.com/playwright/mcp:latest",
  containerNetwork: process.env.CONTAINER_NETWORK || undefined,
  maxInstances: parseInt(process.env.MAX_INSTANCES || "10", 10),
  healthCheckTimeoutMs: parseInt(process.env.HEALTH_CHECK_TIMEOUT_MS || "2500", 10),
  containerStartupTimeoutMs: parseInt(process.env.CONTAINER_STARTUP_TIMEOUT_MS || "30000", 10),
  logLevel: (process.env.LOG_LEVEL as any) || "info",
};