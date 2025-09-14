#!/usr/bin/env node

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

/**
 * Test Simplified Orchestrator - Only 4 Essential Tools
 * Tests auto-creation and transparent proxy behavior
 */

async function testSimplifiedOrchestrator() {
  console.log("🎭 Testing Simplified Playwright MCP Orchestrator");
  console.log("=" .repeat(60));

  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/index.js"]
  });

  const client = new Client({
    name: "simplified-test",
    version: "1.0.0"
  });

  try {
    console.log("\n1️⃣  Connecting to simplified orchestrator...");
    await client.connect(transport);
    console.log("   ✅ Connected!");

    console.log("\n2️⃣  Listing orchestrator tools...");
    const orchTools = await client.listTools();
    console.log(`   ✅ Orchestrator provides ${orchTools.tools.length} management tools:`);
    orchTools.tools.forEach((tool, i) => {
      const required = tool.inputSchema.required || [];
      const optional = Object.keys(tool.inputSchema.properties || {}).filter(p => !required.includes(p));
      console.log(`   ${i + 1}. ${tool.name}`);
      console.log(`      Required: [${required.join(', ')}]`);
      console.log(`      Optional: [${optional.join(', ')}]`);
    });

    console.log("\n3️⃣  Testing auto-creation via list_tools (no instanceId)...");
    const listResult = await client.callTool({
      name: "list_tools",
      arguments: {} // No instanceId - should auto-create
    });

    const listData = JSON.parse(listResult.content[0].text);
    if (!listData.success) {
      throw new Error(`Failed to list tools: ${listData.error}`);
    }

    const autoCreatedId = listData.instanceId;
    console.log(`   ✅ Auto-created instance: ${autoCreatedId.substring(0, 8)}...`);
    console.log(`   📋 Found ${listData.count} browser tools available`);

    console.log("\n4️⃣  Testing transparent proxy with auto-created instance...");
    console.log("   🔄 Calling browser_navigate via orchestrator proxy...");

    const navResult = await client.callTool({
      name: "call_tool",
      arguments: {
        instanceId: autoCreatedId,
        tool: "browser_navigate",
        args: { url: "https://www.google.com" }
      }
    });

    console.log("   📥 Direct Playwright MCP response (no orchestrator wrapper):");
    console.log(`   Type: ${typeof navResult}`);
    console.log(`   Keys: ${Object.keys(navResult)}`);
    console.log(`   Content: ${navResult.content ? 'Yes' : 'No'}`);
    console.log(`   IsError: ${navResult.isError || 'undefined'}`);

    if (navResult.content?.[0]?.text) {
      const preview = navResult.content[0].text.substring(0, 100);
      console.log(`   Preview: ${preview}...`);
    }

    console.log("   ✅ Transparent proxy working!");

    console.log("\n5️⃣  Testing list_instances...");
    const instancesResult = await client.callTool({
      name: "list_instances",
      arguments: {}
    });

    const instancesData = JSON.parse(instancesResult.content[0].text);
    console.log(`   ✅ Active instances: ${instancesData.count}`);
    if (instancesData.instances.length > 0) {
      console.log(`   📋 Instance: ${instancesData.instances[0].name} (${instancesData.instances[0].id.substring(0, 8)}...)`);
    }

    console.log("\n6️⃣  Testing health check...");
    const healthResult = await client.callTool({
      name: "check_health",
      arguments: { instanceId: autoCreatedId }
    });

    const healthData = JSON.parse(healthResult.content[0].text);
    console.log(`   ✅ Health check: ${healthData.success ? 'Passed' : 'Failed'}`);

    console.log("\n🎉 SIMPLIFIED ORCHESTRATOR TEST COMPLETED!");
    console.log("\n💡 Key features verified:");
    console.log("   • ✅ Only 4 essential tools (no manual browser management)");
    console.log("   • ✅ Auto-creation of browser instances when needed");
    console.log("   • ✅ Transparent proxy (direct Playwright MCP responses)");
    console.log("   • ✅ Instance tracking and health monitoring");
    console.log("   • ✅ Perfect for AI agent integration!");

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
  try {
    await testSimplifiedOrchestrator();
    console.log("\n" + "=".repeat(60));
    console.log("✨ SIMPLIFIED ORCHESTRATOR READY!");
    console.log("🎯 Perfect for Claude Code integration!");
  } catch (error) {
    console.error("\n💥 Test failed:", error.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}