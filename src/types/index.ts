import { z } from "zod";

export const InstanceSchema = z.object({
  id: z.string().uuid(),
  name: z.string().optional(),
  image: z.string(),
  containerId: z.string(),
  port: z.number().int().min(1024).max(65535),
  createdAt: z.string().datetime(),
  status: z.enum(["starting", "running", "stopping", "stopped", "error"]).default("starting"),
  healthUrl: z.string().url(),
});

export type InstanceInfo = z.infer<typeof InstanceSchema>;

export const ContainerConfigSchema = z.object({
  image: z.string(),
  name: z.string().optional(),
  env: z.record(z.string()).optional(),
  exposedPort: z.number().int().default(3001),
  networkMode: z.string().optional(),
  labels: z.record(z.string()).optional(),
  resourceLimits: z.object({
    memory: z.string().optional(),
    cpus: z.string().optional(),
  }).optional(),
});

export type ContainerConfig = z.infer<typeof ContainerConfigSchema>;

export const ToolCallSchema = z.object({
  instanceId: z.string().uuid(),
  tool: z.string(),
  args: z.record(z.any()).optional(),
});

export type ToolCall = z.infer<typeof ToolCallSchema>;

export const PlaywrightToolSchema = z.object({
  name: z.string(),
  description: z.string(),
  inputSchema: z.object({
    type: z.literal("object"),
    properties: z.record(z.any()),
    required: z.array(z.string()).optional(),
  }),
});

export type PlaywrightTool = z.infer<typeof PlaywrightToolSchema>;

export interface OrchestratorConfig {
  defaultImage: string;
  exposedPortInContainer: number;
  orchestratorHost: string;
  containerNetwork?: string | undefined;
  maxInstances: number;
  healthCheckTimeoutMs: number;
  containerStartupTimeoutMs: number;
  enableDnsRebindingProtection: boolean;
  allowedHosts: string[];
  logLevel: "error" | "warn" | "info" | "debug";
  rateLimiting: {
    windowMs: number;
    max: number;
  };
}