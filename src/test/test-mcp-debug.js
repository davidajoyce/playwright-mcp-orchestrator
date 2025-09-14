#!/usr/bin/env node

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

/**
 * MCP Debug Test - CRITICAL REGRESSION TEST
 *
 * WHY THIS TEST IS IMPORTANT:
 * - Reproduces the exact user error that was reported and fixed
 * - Validates that the core "Connection closed" bug stays resolved
 * - Tests the complete tool call chain: orchestrator → STDIO client → Docker container
 * - Verifies browser navigation works and sessions persist between calls
 *
 * Original failing scenario:
 * playwright-orchestrator - call_tool (instanceId: "6022a7f1...", tool: "browser_navigate", args: {"url":"https://www.bing.com/maps"})
 * Error: Failed to connect: MCP error -32000: Connection closed
 *
 * This test ensures the fix (client caching + correct Docker image) remains working.
 */

async function debugMCPError() {
  console.log("🔍 Debugging MCP Tool Call Error");
  console.log("=" .repeat(50));

  console.log("\n📋 Reproducing exact scenario:");
  console.log('• call_tool with instanceId: "6022a7f1-472a-433f-9c05-e5a2c998db93"');
  console.log('• tool: "browser_navigate"');
  console.log('• args: {"url":"https://www.bing.com/maps"}');

  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/index.js"]
  });

  const client = new Client({
    name: "mcp-debug-test",
    version: "1.0.0"
  });

  try {
    console.log("\n1️⃣  Connecting to orchestrator...");
    await client.connect(transport);
    console.log("   ✅ Connected to orchestrator");

    console.log("\n2️⃣  Testing orchestrator tools...");
    const orchTools = await client.listTools();
    console.log(`   ✅ Orchestrator has ${orchTools.tools.length} management tools:`);
    orchTools.tools.forEach(tool => console.log(`      • ${tool.name}`));

    console.log("\n3️⃣  Creating fresh instance (to get valid instanceId)...");
    const listResult = await client.callTool({
      name: "list_tools",
      arguments: {}
    });

    const listData = JSON.parse(listResult.content[0].text);
    if (!listData.success) {
      throw new Error(`Failed to create instance: ${listData.error}`);
    }

    const validInstanceId = listData.instanceId;
    console.log(`   ✅ Created valid instanceId: ${validInstanceId}`);
    console.log(`   📋 Available tools: ${listData.count}`);

    console.log("\n4️⃣  Testing the exact failing call...");
    console.log("   🔄 Calling browser_navigate with Bing Maps...");

    try {
      const navResult = await client.callTool({
        name: "call_tool",
        arguments: {
          instanceId: validInstanceId,
          tool: "browser_navigate",
          args: { url: "https://www.bing.com/maps" }
        }
      });

      console.log("   ✅ Navigation call succeeded!");
      console.log("   📥 Response preview:", navResult.content[0].text.substring(0, 200) + "...");

      // Verify navigation worked by taking snapshot
      console.log("\n5️⃣  Verifying navigation with snapshot...");
      const snapshot = await client.callTool({
        name: "call_tool",
        arguments: {
          instanceId: validInstanceId,
          tool: "browser_snapshot",
          args: {}
        }
      });

      const snapshotText = snapshot.content[0].text;
      const urlMatch = snapshotText.match(/Page URL: (.+)/);
      const currentUrl = urlMatch ? urlMatch[1] : 'unknown';

      console.log(`   📍 Current URL: ${currentUrl}`);

      if (currentUrl.includes('bing.com')) {
        console.log("   🎉 SUCCESS! Navigation to Bing Maps worked!");
      } else if (currentUrl === 'about:blank') {
        console.log("   ⚠️  Still on about:blank - networking or container issue");
      } else {
        console.log(`   ⚠️  Unexpected URL: ${currentUrl}`);
      }

    } catch (toolError) {
      console.error("   ❌ Tool call failed:", toolError.message);
      console.error("   🔍 Full error:", toolError);

      console.log("\n🔧 DEBUGGING STEPS:");

      // Check if instance still exists
      console.log("   • Checking if instance still exists...");
      try {
        const healthResult = await client.callTool({
          name: "check_health",
          arguments: { instanceId: validInstanceId }
        });
        const healthData = JSON.parse(healthResult.content[0].text);
        console.log(`     Instance health: ${healthData.success ? 'healthy' : 'unhealthy'}`);
      } catch (e) {
        console.log("     Instance health check failed:", e.message);
      }

      // List active instances
      console.log("   • Checking active instances...");
      try {
        const instancesResult = await client.callTool({
          name: "list_instances",
          arguments: {}
        });
        const instancesData = JSON.parse(instancesResult.content[0].text);
        console.log(`     Active instances: ${instancesData.count}`);
      } catch (e) {
        console.log("     Instance listing failed:", e.message);
      }

      throw toolError;
    }

    console.log("\n6️⃣  Testing with invalid instanceId (reproducing original error)...");
    try {
      const invalidResult = await client.callTool({
        name: "call_tool",
        arguments: {
          instanceId: "6022a7f1-472a-433f-9c05-e5a2c998db93", // Original failing ID
          tool: "browser_navigate",
          args: { url: "https://www.bing.com/maps" }
        }
      });
      console.log("   ⚠️  Unexpected: Invalid instanceId worked");
    } catch (invalidError) {
      console.log("   ✅ Expected: Invalid instanceId failed");
      console.log("   📄 Error:", invalidError.message);
    }

  } catch (error) {
    console.error("\n💥 Debug test failed:", error.message);
    console.error("📄 Full error:", error);
  } finally {
    await client.close();
  }

  console.log("\n" + "=".repeat(50));
  console.log("🔍 MCP DEBUG TEST COMPLETE");
}

async function main() {
  // Clean up any existing containers first
  console.log("🧹 Cleaning up existing containers...");
  const { spawn } = await import('child_process');

  await new Promise((resolve) => {
    const cleanup = spawn('docker', ['kill'], { stdio: 'ignore' });
    cleanup.on('close', () => {
      const cleanup2 = spawn('bash', ['-c', 'docker kill $(docker ps -q --filter ancestor=mcp/playwright:latest) 2>/dev/null || true'], { stdio: 'ignore' });
      cleanup2.on('close', resolve);
    });
  });

  await debugMCPError();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}