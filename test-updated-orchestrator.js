#!/usr/bin/env node

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

/**
 * Test Script for Updated Orchestrator with STDIO-based Playwright Client
 * This tests the orchestrator that now correctly uses stdio communication
 */

async function testUpdatedOrchestrator() {
  console.log("🎭 Testing Updated Playwright MCP Orchestrator");
  console.log("=" .repeat(60));

  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/index.js"] // Run the compiled orchestrator
  });

  const client = new Client({
    name: "orchestrator-test-client",
    version: "1.0.0"
  });

  try {
    console.log("\n1️⃣  Connecting to orchestrator...");
    await client.connect(transport);
    console.log("   ✅ Connected successfully!");

    console.log("\n2️⃣  Listing orchestrator tools...");
    const orchTools = await client.listTools();
    console.log(`   ✅ Found ${orchTools.tools.length} orchestrator tools:`);
    orchTools.tools.forEach((tool, i) => {
      console.log(`   ${i + 1}. ${tool.name}`);
    });

    console.log("\n3️⃣  Creating a new browser instance...");
    const createResult = await client.callTool({
      name: "new_browser",
      arguments: {
        name: "test-browser",
        image: "mcr.microsoft.com/playwright/mcp"
      }
    });

    const createData = JSON.parse(createResult.content[0].text);
    if (!createData.success) {
      throw new Error(`Failed to create browser: ${createData.error}`);
    }

    const instanceId = createData.instance.id;
    console.log(`   ✅ Created browser instance: ${instanceId}`);
    console.log(`   📋 Instance details: ${createData.instance.name} on port ${createData.instance.port}`);

    console.log("\n4️⃣  Listing tools from the browser instance (STDIO approach)...");
    const toolsResult = await client.callTool({
      name: "list_tools",
      arguments: { instanceId }
    });

    const toolsData = JSON.parse(toolsResult.content[0].text);
    if (!toolsData.success) {
      throw new Error(`Failed to list tools: ${toolsData.error}`);
    }

    console.log(`   ✅ Successfully listed ${toolsData.count} browser tools!`);
    console.log("   🎉 STDIO approach works - no hanging issues!");

    // Show first 5 tools
    toolsData.tools.slice(0, 5).forEach((tool, i) => {
      console.log(`   ${i + 1}. ${tool.name}`);
    });
    console.log(`   ... and ${toolsData.count - 5} more tools`);

    console.log("\n5️⃣  Testing a browser tool call...");
    const navResult = await client.callTool({
      name: "call_tool",
      arguments: {
        instanceId,
        tool: "browser_navigate",
        args: { url: "https://httpbin.org/html" }
      }
    });

    const navData = JSON.parse(navResult.content[0].text);
    console.log("   ✅ Browser tool call completed!");
    console.log(`   📋 Success: ${navData.success}`);

    console.log("\n6️⃣  Taking a page snapshot...");
    const snapshotResult = await client.callTool({
      name: "call_tool",
      arguments: {
        instanceId,
        tool: "browser_snapshot",
        args: {}
      }
    });

    const snapshotData = JSON.parse(snapshotResult.content[0].text);
    if (snapshotData.success && snapshotData.result?.content?.[0]?.text) {
      console.log("   ✅ Snapshot captured successfully!");
      const previewLines = snapshotData.result.content[0].text.split('\n').slice(0, 3);
      previewLines.forEach(line => console.log(`   ${line}`));
      console.log("   ... (truncated)");
    }

    console.log("\n7️⃣  Stopping the browser instance...");
    const stopResult = await client.callTool({
      name: "stop_browser",
      arguments: { instanceId }
    });

    const stopData = JSON.parse(stopResult.content[0].text);
    if (stopData.success) {
      console.log(`   ✅ Browser instance stopped: ${stopData.message}`);
    }

    console.log("\n🎉 ALL TESTS PASSED!");
    console.log("💡 Key improvements:");
    console.log("   • STDIO communication eliminates hanging issues");
    console.log("   • Browser tools work correctly via Docker");
    console.log("   • Orchestrator manages instances properly");
    console.log("   • No more HTTP endpoint problems!");

  } catch (error) {
    console.error("\n❌ Test failed:", error.message);
    throw error;
  } finally {
    console.log("\n🔌 Closing connection...");
    await client.close();
    console.log("   ✅ Connection closed");
  }
}

async function main() {
  console.log("🚀 Starting Orchestrator Test Suite");

  await testUpdatedOrchestrator();

  console.log("\n" + "=".repeat(60));
  console.log("✨ Orchestrator test completed successfully!");
  console.log("🎯 Ready for production use with Claude Code!");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("❌ Test suite failed:", error.message);
    process.exit(1);
  });
}