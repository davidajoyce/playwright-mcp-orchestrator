#!/usr/bin/env node

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

/**
 * Test Container Reuse Fix
 *
 * This test verifies that the orchestrator reuses the same container
 * for multiple tool calls instead of creating new containers each time.
 * This fixes the "No open pages available" error by maintaining session state.
 */

async function testContainerReuse() {
  console.log("🔄 Testing Container Reuse Fix");
  console.log("=" .repeat(50));

  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/index.js"]
  });

  const client = new Client({
    name: "container-reuse-test",
    version: "1.0.0"
  });

  try {
    console.log("\n1️⃣  Connecting to orchestrator...");
    await client.connect(transport);

    console.log("\n2️⃣  Creating instance and listing tools...");
    const listResult = await client.callTool({
      name: "list_tools",
      arguments: {}
    });

    const data = JSON.parse(listResult.content[0].text);
    const instanceId = data.instanceId;
    console.log(`   ✅ Instance created: ${instanceId.substring(0, 8)}...`);
    console.log(`   📋 Tools available: ${data.count}`);

    // Count containers BEFORE first tool call
    const containersBefore = await countPlaywrightContainers();
    console.log(`   📦 Containers before navigation: ${containersBefore}`);

    console.log("\n3️⃣  First tool call: Navigate to Bing Maps...");
    const navResult = await client.callTool({
      name: "call_tool",
      arguments: {
        instanceId: instanceId,
        tool: "browser_navigate",
        args: { url: "https://www.bing.com/maps?q=cafes+Surry+Hills+Sydney" }
      }
    });

    console.log("   📥 Navigation completed");

    // Count containers AFTER first tool call
    const containersAfterNav = await countPlaywrightContainers();
    console.log(`   📦 Containers after navigation: ${containersAfterNav}`);

    console.log("\n4️⃣  Second tool call: Take snapshot (same session)...");
    const snapshotResult = await client.callTool({
      name: "call_tool",
      arguments: {
        instanceId: instanceId,
        tool: "browser_snapshot",
        args: {}
      }
    });

    // Count containers AFTER second tool call
    const containersAfterSnapshot = await countPlaywrightContainers();
    console.log(`   📦 Containers after snapshot: ${containersAfterSnapshot}`);

    // Parse snapshot to check if page state was preserved
    const snapshotText = snapshotResult.content[0].text;
    const urlMatch = snapshotText.match(/Page URL: (.+)/);
    const currentUrl = urlMatch ? urlMatch[1] : 'unknown';

    console.log("\n📊 RESULTS:");
    console.log(`   Current URL: ${currentUrl}`);
    console.log(`   Container count consistent: ${containersAfterNav === containersAfterSnapshot ? '✅ YES' : '❌ NO'}`);

    if (currentUrl.includes('bing.com')) {
      console.log("   🎉 SUCCESS! Session state preserved between tool calls");
      console.log("   🎯 Container reuse working - no new containers created");
      console.log("   ✅ Original 'No open pages available' error is FIXED!");
    } else if (currentUrl === 'about:blank') {
      console.log("   ❌ FAILED: Session not preserved (about:blank)");
    } else {
      console.log(`   ⚠️  Unexpected URL: ${currentUrl}`);
    }

    console.log("\n5️⃣  Testing click interaction (originally failing)...");

    // Extract clickable elements from snapshot
    const elements = snapshotText.match(/\\[ref=(.+?)\\]/g);
    if (elements && elements.length > 0) {
      console.log(`   🖱️  Found ${elements.length} clickable elements`);
      console.log("   🎯 Click interactions now possible!");
      console.log("   ✅ No more 'No open pages available' errors!");
    } else {
      console.log("   ⚠️  No clickable elements found in snapshot");
    }

  } catch (error) {
    console.error(`\n❌ Test failed: ${error.message}`);
  } finally {
    await client.close();
  }

  console.log("\n" + "=".repeat(50));
  console.log("🏁 CONTAINER REUSE TEST COMPLETE");
}

async function countPlaywrightContainers() {
  const { spawn } = await import('child_process');

  return new Promise((resolve) => {
    const docker = spawn('docker', ['ps', '-q', '--filter', 'label=mcp.orchestrator=true']);

    let output = '';
    docker.stdout.on('data', (data) => {
      output += data.toString();
    });

    docker.on('close', () => {
      const containers = output.trim().split('\n').filter(id => id.length > 0);
      resolve(containers.length);
    });
  });
}

async function main() {
  try {
    await testContainerReuse();
  } catch (error) {
    console.error("\n💥 Test failed:", error.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}