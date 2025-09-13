import { OrchestratorConfig } from "../types/index.js";

export const config: OrchestratorConfig = {
  defaultImage: process.env.PLAYWRIGHT_MCP_IMAGE ?? "ghcr.io/modelcontextprotocol/servers/playwright:latest",
  exposedPortInContainer: parseInt(process.env.EXPOSED_PORT_IN_CONTAINER || "3001", 10),
  orchestratorHost: process.env.ORCHESTRATOR_HOST ?? "127.0.0.1",
  containerNetwork: process.env.CONTAINER_NETWORK || undefined,
  maxInstances: parseInt(process.env.MAX_INSTANCES || "10", 10),
  healthCheckTimeoutMs: parseInt(process.env.HEALTH_CHECK_TIMEOUT_MS || "2500", 10),
  containerStartupTimeoutMs: parseInt(process.env.CONTAINER_STARTUP_TIMEOUT_MS || "30000", 10),
  enableDnsRebindingProtection: process.env.ENABLE_DNS_REBINDING_PROTECTION === "true",
  allowedHosts: process.env.ALLOWED_HOSTS?.split(",") || ["127.0.0.1", "localhost"],
  logLevel: (process.env.LOG_LEVEL as any) || "info",
  rateLimiting: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "60000", 10), // 1 minute
    max: parseInt(process.env.RATE_LIMIT_MAX || "100", 10), // 100 requests per window
  },
};