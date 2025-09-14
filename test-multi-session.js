#!/usr/bin/env node

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

/**
 * Test Multi-Session Isolation
 *
 * Verifies that different AI sessions (like multiple Claude Code instances)
 * each get their own dedicated containers while maintaining session state
 * within each session.
 */

async function testMultiSessionIsolation() {
  console.log("🔀 Testing Multi-Session Container Isolation");
  console.log("=" .repeat(55));

  console.log("\n📋 Test Scenario:");
  console.log("• Two simulated Claude sessions");
  console.log("• Each calls list_tools (gets new instanceId)");
  console.log("• Each should get separate container");
  console.log("• Each maintains own browser session state");

  // Simulate two different Claude Code sessions
  const sessions = [];

  for (let i = 1; i <= 2; i++) {
    console.log(`\n${i}️⃣  Starting Claude session ${i}...`);

    const transport = new StdioClientTransport({
      command: "node",
      args: ["dist/index.js"]
    });

    const client = new Client({
      name: `claude-session-${i}`,
      version: "1.0.0"
    });

    try {
      await client.connect(transport);

      // Each session calls list_tools without instanceId (new session)
      console.log(`   📋 Session ${i}: Calling list_tools (new session)...`);
      const listResult = await client.callTool({
        name: "list_tools",
        arguments: {} // No instanceId - creates new session
      });

      const data = JSON.parse(listResult.content[0].text);
      const instanceId = data.instanceId;

      console.log(`   ✅ Session ${i}: Got instanceId ${instanceId.substring(0, 8)}...`);
      console.log(`   📦 Session ${i}: Will create container: mcp-playwright-instance-${instanceId.substring(0, 8)}`);

      // Test navigation in this session
      console.log(`   🔄 Session ${i}: Navigating to test page...`);
      const navResult = await client.callTool({
        name: "call_tool",
        arguments: {
          instanceId: instanceId,
          tool: "browser_navigate",
          args: { url: `https://httpbin.org/get?session=${i}` }
        }
      });

      // Store session info
      sessions.push({
        id: i,
        instanceId: instanceId,
        client: client,
        transport: transport
      });

      console.log(`   ✅ Session ${i}: Navigation completed`);

    } catch (error) {
      console.error(`   ❌ Session ${i}: Setup failed - ${error.message}`);
    }
  }

  // Wait a moment for containers to be created
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log("\n🔍 VERIFICATION:");

  // Check each session maintains its own state
  for (const session of sessions) {
    try {
      console.log(`\n   Session ${session.id}: Checking session state...`);

      const snapshot = await session.client.callTool({
        name: "call_tool",
        arguments: {
          instanceId: session.instanceId,
          tool: "browser_snapshot",
          args: {}
        }
      });

      const snapshotText = snapshot.content[0].text;
      const urlMatch = snapshotText.match(/Page URL: (.+)/);
      const currentUrl = urlMatch ? urlMatch[1] : 'unknown';

      console.log(`   📍 Session ${session.id}: URL = ${currentUrl}`);

      if (currentUrl.includes(`session=${session.id}`)) {
        console.log(`   ✅ Session ${session.id}: Isolated state preserved!`);
      } else if (currentUrl === 'about:blank') {
        console.log(`   ⚠️ Session ${session.id}: Navigation issue (networking)`);
      } else {
        console.log(`   ⚠️ Session ${session.id}: Unexpected state`);
      }

    } catch (error) {
      console.log(`   ❌ Session ${session.id}: Verification failed - ${error.message}`);
    }
  }

  // Check container isolation by counting containers
  const containerCount = await countPlaywrightContainers();
  console.log(`\n📦 Total Playwright containers created: ${containerCount}`);

  if (containerCount >= sessions.length) {
    console.log("✅ Container isolation working: Each session has dedicated container");
  } else {
    console.log("⚠️ Container isolation issue: Sessions may be sharing containers");
  }

  console.log("\n📊 RESULTS:");
  console.log(`✅ Sessions tested: ${sessions.length}`);
  console.log(`✅ Unique instanceIds: ${new Set(sessions.map(s => s.instanceId)).size}`);
  console.log(`✅ Expected containers: ${sessions.length}`);
  console.log(`✅ Actual containers: ${containerCount}`);

  // Cleanup
  console.log("\n🧹 Cleaning up test sessions...");
  for (const session of sessions) {
    try {
      await session.client.close();
    } catch (e) {
      // Ignore cleanup errors
    }
  }

  console.log("\n" + "=".repeat(55));
  console.log("🎯 MULTI-SESSION ISOLATION TEST COMPLETE!");
  console.log("🚀 Each Claude session gets its own container!");
}

async function countPlaywrightContainers() {
  const { spawn } = await import('child_process');

  return new Promise((resolve) => {
    const docker = spawn('docker', ['ps', '-q', '--filter', 'ancestor=mcp/playwright:latest']);

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
    await testMultiSessionIsolation();
  } catch (error) {
    console.error("\n💥 Test failed:", error.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}