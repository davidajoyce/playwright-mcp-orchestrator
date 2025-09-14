#!/usr/bin/env node

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

/**
 * MCP STDIO Client - Tests Docker-based Playwright MCP server
 * This mimics how Claude Code successfully communicates with MCP servers
 */
class PlaywrightMCPClient {
  constructor() {
    this.client = null;
    this.transport = null;
  }

  async connectToDockerServer() {
    console.log("🚀 Connecting to Docker-based Playwright MCP server...");

    // Use the exact same Docker configuration that works in Claude Code
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

    this.client = new Client({
      name: "test-client",
      version: "1.0.0"
    });

    try {
      await this.client.connect(this.transport);
      console.log("✅ Connected successfully!");
      return true;
    } catch (error) {
      console.error("❌ Connection failed:", error.message);
      return false;
    }
  }

  async listTools() {
    if (!this.client) {
      throw new Error("Client not connected");
    }

    console.log("🛠️  Listing available tools...");

    try {
      const result = await this.client.listTools();
      console.log(`✅ Found ${result.tools.length} tools:`);

      result.tools.forEach((tool, index) => {
        console.log(`  ${index + 1}. ${tool.name} - ${tool.description}`);
      });

      return result.tools;
    } catch (error) {
      console.error("❌ Failed to list tools:", error.message);
      throw error;
    }
  }

  async callTool(name, args = {}) {
    if (!this.client) {
      throw new Error("Client not connected");
    }

    console.log(`🔧 Calling tool: ${name} with args:`, args);

    try {
      const result = await this.client.callTool({ name, arguments: args });
      console.log("✅ Tool call successful:");
      console.log(JSON.stringify(result, null, 2));
      return result;
    } catch (error) {
      console.error("❌ Tool call failed:", error.message);
      throw error;
    }
  }

  async testBrowserNavigation() {
    console.log("\n🌐 Testing browser navigation...");

    try {
      // Navigate to a page
      await this.callTool("browser_navigate", {
        url: "https://example.com"
      });

      // Take a snapshot
      await this.callTool("browser_snapshot");

      console.log("✅ Browser navigation test completed!");
    } catch (error) {
      console.error("❌ Browser navigation test failed:", error.message);
    }
  }

  async disconnect() {
    if (this.client) {
      console.log("🔌 Disconnecting...");
      await this.client.close();
      this.client = null;
      this.transport = null;
      console.log("✅ Disconnected");
    }
  }
}

async function main() {
  const client = new PlaywrightMCPClient();

  try {
    // Connect to Docker server
    const connected = await client.connectToDockerServer();
    if (!connected) {
      process.exit(1);
    }

    // List tools (this was failing with HTTP but should work with stdio)
    await client.listTools();

    // Test basic browser functionality
    await client.testBrowserNavigation();

  } catch (error) {
    console.error("❌ Test failed:", error.message);
    process.exit(1);
  } finally {
    await client.disconnect();
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}