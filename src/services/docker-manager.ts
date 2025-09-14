import Docker from "dockerode";
import { randomUUID } from "node:crypto";
// import { setTimeout as sleep } from "node:timers/promises"; // Not used with STDIO approach
import { InstanceInfo, ContainerConfig, InstanceSchema } from "../types/index.js";
import { logger } from "../utils/logger.js";
import { config } from "../utils/config.js";

export class DockerManager {
  private docker: Docker;
  private instances = new Map<string, InstanceInfo>();

  constructor() {
    this.docker = this.initializeDockerEnhanced();

    // Test Docker connection on initialization
    this.testDockerConnection();
  }

  private initializeDockerEnhanced(): Docker {
    try {
      // Enhanced Docker initialization with explicit configuration
      const dockerConfig = {
        socketPath: '/var/run/docker.sock',
        version: 'v1.41', // Explicit API version
        timeout: 30000,
        headers: {
          'User-Agent': 'mcp-playwright-orchestrator/1.0.0'
        }
      };

      logger.info("Initializing Docker with enhanced configuration", dockerConfig);
      const dockerInstance = new Docker(dockerConfig);
      logger.info("Enhanced Docker instance created successfully");
      return dockerInstance;
    } catch (error) {
      logger.warn("Enhanced Docker initialization failed, using basic", { error: error instanceof Error ? error.message : String(error) });
      return new Docker();
    }
  }

  private async testDockerConnection(): Promise<void> {
    try {
      logger.debug("Testing Docker connection...");
      const info = await this.docker.info();
      logger.debug("Docker connection successful", {
        version: info.ServerVersion,
        containers: info.Containers,
        images: info.Images
      });
    } catch (error) {
      logger.error("Docker connection failed", {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  async createPlaywrightInstance(
    image?: string,
    name?: string,
    customConfig?: Partial<ContainerConfig>
  ): Promise<InstanceInfo> {
    if (this.instances.size >= config.maxInstances) {
      throw new Error(`Maximum instances limit reached: ${config.maxInstances}`);
    }

    const containerConfig: ContainerConfig = {
      image: image || config.defaultImage,
      name,
      exposedPort: config.exposedPortInContainer,
      networkMode: config.containerNetwork,
      ...customConfig,
    };

    logger.info("Creating Playwright container", { config: containerConfig });

    try {
      logger.debug("Creating logical instance (STDIO client will handle actual container)", {
        image: containerConfig.image
      });

      // Create instance metadata - STDIO client handles actual container creation
      const instanceInfo: InstanceInfo = {
        id: randomUUID(),
        name: containerConfig.name,
        image: containerConfig.image,
        containerId: "stdio-managed", // Not used - STDIO client handles containers
        port: this.generateRandomPort(), // Not used with STDIO, but kept for compatibility
        createdAt: new Date().toISOString(),
        status: "running", // Immediately available
      };

      // Validate instance data
      const validatedInstance = InstanceSchema.parse(instanceInfo);
      this.instances.set(validatedInstance.id, validatedInstance);

      logger.info("Logical Playwright instance created successfully", {
        instanceId: validatedInstance.id,
        image: containerConfig.image
      });

      return validatedInstance;
    } catch (error) {
      logger.error("Failed to create Playwright instance", { error, config: containerConfig });
      throw new Error(`Failed to create instance: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async stopInstance(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Instance not found: ${instanceId}`);
    }

    logger.info("Stopping Playwright container", { instanceId, containerId: instance.containerId });

    try {
      instance.status = "stopping";
      const container = this.docker.getContainer(instance.containerId);

      // Graceful shutdown with timeout
      await container.stop({ t: 10 });

      instance.status = "stopped";
      this.instances.delete(instanceId);

      logger.info("Playwright container stopped successfully", { instanceId });
    } catch (error) {
      instance.status = "error";
      logger.error("Failed to stop container", { instanceId, error });
      throw new Error(`Failed to stop container: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  getInstance(instanceId: string): InstanceInfo | undefined {
    return this.instances.get(instanceId);
  }

  getAllInstances(): InstanceInfo[] {
    return Array.from(this.instances.values());
  }

  async getContainerHealth(instanceId: string): Promise<"healthy" | "unhealthy" | "unknown"> {
    const instance = this.instances.get(instanceId);
    if (!instance) return "unknown";

    try {
      // For STDIO-managed instances, health is based on instance existence
      // The STDIO client will handle actual container health
      return instance.status === "running" ? "healthy" : "unhealthy";
    } catch {
      return "unhealthy";
    }
  }

  async cleanup(): Promise<void> {
    logger.info("Cleaning up Docker instances", { count: this.instances.size });

    const cleanupPromises = Array.from(this.instances.keys()).map(instanceId =>
      this.stopInstance(instanceId).catch(error =>
        logger.error("Error during cleanup", { instanceId, error })
      )
    );

    await Promise.allSettled(cleanupPromises);
    this.instances.clear();
  }


  private generateRandomPort(): number {
    return Math.floor(Math.random() * 20000) + 30000;
  }

  /*
  // Legacy methods - no longer used with STDIO approach
  private async createContainer(containerConfig: ContainerConfig): Promise<string> {
    const labels = {
      "mcp.role": "playwright",
      "mcp.orchestrator": "true",
      "mcp.created-by": "mcp-playwright-orchestrator",
      ...containerConfig.labels,
    };

    const createOptions = {
      Image: containerConfig.image,
      name: containerConfig.name
        ? `mcp-playwright-${containerConfig.name}-${Math.floor(Math.random() * 9999)}`
        : undefined,
      // Keep container alive without starting MCP server automatically
      // STDIO client will exec into container to start MCP server on demand
      Cmd: ["tail", "-f", "/dev/null"],
      Env: [
        "NODE_ENV=production",
        ...(containerConfig.env ? Object.entries(containerConfig.env).map(([k, v]) => `${k}=${v}`) : []),
      ],
      // No port exposure needed - using STDIO communication only
      HostConfig: {
        AutoRemove: true,
        NetworkMode: containerConfig.networkMode || undefined,
        Memory: containerConfig.resourceLimits?.memory ? this.parseMemory(containerConfig.resourceLimits.memory) : undefined,
        CpuQuota: containerConfig.resourceLimits?.cpus ? this.parseCpus(containerConfig.resourceLimits.cpus) : undefined,
        CpuPeriod: containerConfig.resourceLimits?.cpus ? 100000 : undefined,
        // Network and security fixes for Playwright in Docker
        CapAdd: ["SYS_ADMIN"],  // Required for Chromium sandboxing
        ExtraHosts: ["host.docker.internal:host-gateway"],  // Host network access
        SecurityOpt: ["seccomp=unconfined"],  // Browser process sandboxing
        ReadonlyRootfs: false, // Playwright may need to write temp files
      },
      Labels: labels,
      User: "1001:1001", // Non-root user for security
    };

    logger.info("About to call docker.createContainer", {
      image: createOptions.Image,
      name: createOptions.name
    });

    try {
      const container = await this.docker.createContainer(createOptions);
      logger.info("Container created successfully via dockerode", { containerId: container.id });
      return container.id;
    } catch (createError) {
      logger.warn("Dockerode createContainer failed, attempting Docker CLI fallback", {
        error: createError instanceof Error ? createError.message : String(createError)
      });

      // Fallback to Docker CLI since dockerode has registry auth issues in this context
      try {
        const { spawn } = await import("child_process");

        // Build Docker CLI command with network capabilities for Playwright
        const dockerArgs = [
          "run", "-d",
          "--rm",
          "--name", createOptions.name || `mcp-playwright-${Date.now()}`,
          "--label", "mcp.role=playwright",
          "--label", "mcp.orchestrator=true",
          "--label", "mcp.created-by=mcp-playwright-orchestrator",
          // Network and security fixes for Playwright in Docker
          "--cap-add=SYS_ADMIN",  // Required for Chromium sandboxing
          "--add-host=host.docker.internal:host-gateway",  // Host network access
          "--security-opt", "seccomp=unconfined",  // Browser process sandboxing
          containerConfig.image,
          // Keep container alive for STDIO exec
          "tail", "-f", "/dev/null"
        ];

        logger.debug("Executing Docker CLI fallback", { command: "docker", args: dockerArgs });

        const containerId = await new Promise<string>((resolve, reject) => {
          const dockerProcess = spawn("docker", dockerArgs, { stdio: "pipe" });
          let output = "";
          let errorOutput = "";

          dockerProcess.stdout.on("data", (data) => {
            output += data.toString();
          });

          dockerProcess.stderr.on("data", (data) => {
            errorOutput += data.toString();
          });

          dockerProcess.on("close", (code) => {
            if (code === 0) {
              const containerId = output.trim();
              logger.info("Container created successfully via Docker CLI", { containerId });
              resolve(containerId);
            } else {
              reject(new Error(`Docker CLI failed with exit code ${code}: ${errorOutput}`));
            }
          });

          dockerProcess.on("error", (err) => {
            reject(new Error(`Failed to start Docker CLI: ${err.message}`));
          });
        });

        return containerId;

      } catch (cliError) {
        logger.error("Both dockerode and Docker CLI failed", {
          dockerodeError: createError instanceof Error ? createError.message : String(createError),
          cliError: cliError instanceof Error ? cliError.message : String(cliError)
        });
        throw createError; // Throw original dockerode error
      }
    }
  }

  private async waitForContainerReady(instance: InstanceInfo): Promise<void> {
    const startTime = Date.now();
    const deadline = startTime + config.containerStartupTimeoutMs;

    while (Date.now() < deadline) {
      const health = await this.getContainerHealth(instance.id);
      if (health === "healthy") {
        return;
      }

      await sleep(1000);
    }

    throw new Error(`Container failed to become healthy within ${config.containerStartupTimeoutMs}ms`);
  }
  */

  /*
  // Legacy utility methods - no longer used with STDIO approach
  private parseMemory(memory: string): number {
    const match = memory.match(/^(\d+)(m|g|k)?$/i);
    if (!match) throw new Error(`Invalid memory format: ${memory}`);

    const value = parseInt(match[1], 10);
    const unit = (match[2] || "").toLowerCase();

    switch (unit) {
      case "k": return value * 1024;
      case "m": return value * 1024 * 1024;
      case "g": return value * 1024 * 1024 * 1024;
      default: return value;
    }
  }

  private parseCpus(cpus: string): number {
    const value = parseFloat(cpus);
    if (isNaN(value) || value <= 0) {
      throw new Error(`Invalid CPU value: ${cpus}`);
    }
    // Convert to microseconds (CpuQuota is in microseconds per CpuPeriod)
    return Math.floor(value * 100000);
  }
  */
}