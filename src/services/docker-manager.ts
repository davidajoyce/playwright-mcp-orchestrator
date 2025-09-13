import Docker from "dockerode";
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { InstanceInfo, ContainerConfig, InstanceSchema } from "../types/index.js";
import { logger } from "../utils/logger.js";
import { config } from "../utils/config.js";

export class DockerManager {
  private docker: Docker;
  private instances = new Map<string, InstanceInfo>();

  constructor() {
    this.docker = new Docker();
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
      // Pull image if needed
      await this.pullImageIfNeeded(containerConfig.image);

      // Generate random host port
      const hostPort = this.generateRandomPort();
      const containerId = await this.createContainer(containerConfig, hostPort);

      // Start container
      const container = this.docker.getContainer(containerId);
      await container.start();

      const instanceInfo: InstanceInfo = {
        id: randomUUID(),
        name: containerConfig.name,
        image: containerConfig.image,
        containerId,
        port: hostPort,
        createdAt: new Date().toISOString(),
        status: "starting",
        healthUrl: `http://${config.orchestratorHost}:${hostPort}/health`,
      };

      // Validate instance data
      const validatedInstance = InstanceSchema.parse(instanceInfo);
      this.instances.set(validatedInstance.id, validatedInstance);

      // Wait for container to be ready
      await this.waitForContainerReady(validatedInstance);

      validatedInstance.status = "running";
      logger.info("Playwright container started successfully", {
        instanceId: validatedInstance.id,
        port: hostPort
      });

      return validatedInstance;
    } catch (error) {
      logger.error("Failed to create Playwright container", { error, config: containerConfig });
      throw new Error(`Failed to create container: ${error instanceof Error ? error.message : String(error)}`);
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
      const response = await fetch(instance.healthUrl, {
        method: "GET",
        signal: AbortSignal.timeout(config.healthCheckTimeoutMs),
      });

      if (response.ok) {
        const health = await response.json();
        return health?.status === "ok" || health?.healthy === true ? "healthy" : "unhealthy";
      }
      return "unhealthy";
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

  private async pullImageIfNeeded(image: string): Promise<void> {
    try {
      logger.debug("Checking if image needs to be pulled", { image });
      await this.docker.getImage(image).inspect();
    } catch {
      logger.info("Pulling Docker image", { image });
      const stream = await this.docker.pull(image);
      await new Promise((resolve, reject) => {
        this.docker.modem.followProgress(stream, (err, res) =>
          err ? reject(err) : resolve(res)
        );
      });
    }
  }

  private generateRandomPort(): number {
    return Math.floor(Math.random() * 20000) + 30000;
  }

  private async createContainer(containerConfig: ContainerConfig, hostPort: number): Promise<string> {
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
      Env: [
        "NODE_ENV=production",
        ...(containerConfig.env ? Object.entries(containerConfig.env).map(([k, v]) => `${k}=${v}`) : []),
      ],
      ExposedPorts: {
        [`${containerConfig.exposedPort}/tcp`]: {},
      },
      HostConfig: {
        PortBindings: {
          [`${containerConfig.exposedPort}/tcp`]: [{ HostPort: hostPort.toString() }],
        },
        AutoRemove: true,
        NetworkMode: containerConfig.networkMode || undefined,
        Memory: containerConfig.resourceLimits?.memory ? this.parseMemory(containerConfig.resourceLimits.memory) : undefined,
        CpuQuota: containerConfig.resourceLimits?.cpus ? this.parseCpus(containerConfig.resourceLimits.cpus) : undefined,
        CpuPeriod: containerConfig.resourceLimits?.cpus ? 100000 : undefined,
        SecurityOpt: ["no-new-privileges:true"],
        ReadonlyRootfs: false, // Playwright may need to write temp files
      },
      Labels: labels,
      User: "1001:1001", // Non-root user for security
    };

    const container = await this.docker.createContainer(createOptions);
    return container.id;
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
}