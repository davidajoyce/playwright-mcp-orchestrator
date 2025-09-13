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
      // Completely skip image availability check - we confirmed image exists
      logger.debug("Skipping all image checks, proceeding to container creation", { image: containerConfig.image });

      // Generate random host port
      const hostPort = this.generateRandomPort();
      logger.debug("Generated host port for container", { hostPort, image: containerConfig.image });

      const containerId = await this.createContainer(containerConfig, hostPort);
      logger.debug("Container created successfully", { containerId, image: containerConfig.image });

      // Start container (if created via dockerode, otherwise CLI already started it)
      try {
        const container = this.docker.getContainer(containerId);
        await container.start();
      } catch (startError) {
        // If CLI fallback was used, container is already running
        logger.debug("Container start via dockerode failed, assuming CLI container already running", {
          containerId,
          error: startError instanceof Error ? startError.message : String(startError)
        });
      }
      logger.debug("Container started successfully", { containerId });

      const instanceInfo: InstanceInfo = {
        id: randomUUID(),
        name: containerConfig.name,
        image: containerConfig.image,
        containerId,
        port: hostPort,
        createdAt: new Date().toISOString(),
        status: "starting",
        healthUrl: `http://${config.orchestratorHost}:${hostPort}/mcp`,
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
      // MCP containers expect proper MCP initialization request
      const response = await fetch(instance.healthUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "health-check", version: "1.0.0" }
          },
          id: 1
        }),
        signal: AbortSignal.timeout(config.healthCheckTimeoutMs),
      });

      if (response.ok) {
        const responseText = await response.text();
        // Check if response contains MCP server info (either JSON or SSE format)
        return responseText.includes('"serverInfo"') ? "healthy" : "unhealthy";
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
      logger.debug("Image already exists locally", { image });
    } catch (inspectError) {
      logger.info("Pulling Docker image", { image });

      try {
        // Try without authconfig first for public registries
        const stream = await this.docker.pull(image);

        await new Promise((resolve, reject) => {
          this.docker.modem.followProgress(stream, (err, res) => {
            if (err) {
              logger.error("Error during image pull", { image, error: err });
              reject(err);
            } else {
              logger.info("Successfully pulled Docker image", { image });
              resolve(res);
            }
          });
        });
      } catch (pullError) {
        // If that fails, try to use Docker CLI as fallback
        logger.warn("Dockerode pull failed, attempting Docker CLI fallback", {
          image,
          error: pullError instanceof Error ? pullError.message : String(pullError)
        });

        try {
          const { spawn } = await import("child_process");
          await new Promise((resolve, reject) => {
            const dockerProcess = spawn("docker", ["pull", image], { stdio: "pipe" });

            dockerProcess.on("close", (code) => {
              if (code === 0) {
                logger.info("Successfully pulled Docker image via CLI", { image });
                resolve(undefined);
              } else {
                reject(new Error(`Docker CLI pull failed with exit code ${code}`));
              }
            });

            dockerProcess.on("error", (err) => {
              reject(new Error(`Failed to start Docker CLI: ${err.message}`));
            });
          });
        } catch (cliError) {
          logger.error("Both dockerode and CLI pull failed", {
            image,
            dockerodeError: pullError instanceof Error ? pullError.message : String(pullError),
            cliError: cliError instanceof Error ? cliError.message : String(cliError),
            inspectError: inspectError instanceof Error ? inspectError.message : String(inspectError)
          });
          throw pullError;
        }
      }
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
      Cmd: [
        "--port", containerConfig.exposedPort.toString(),
        "--host", "0.0.0.0"
      ],
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

        // Build Docker CLI command
        const dockerArgs = [
          "run", "-d",
          "--rm",
          "-p", `${hostPort}:${containerConfig.exposedPort}`,
          "--name", createOptions.name || `mcp-playwright-${Date.now()}`,
          "--label", "mcp.role=playwright",
          "--label", "mcp.orchestrator=true",
          "--label", "mcp.created-by=mcp-playwright-orchestrator",
          containerConfig.image,
          ...createOptions.Cmd
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