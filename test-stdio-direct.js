#!/usr/bin/env node

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { spawn } from "child_process";

/**
 * Test Direct STDIO Communication
 *
 * Tests direct STDIO communication to Docker containers to identify
 * exactly where the connection is failing in our STDIO client setup.
 */

async function testDirectStdioDocker() {
  console.log("🔍 Testing Direct STDIO Communication to Docker");
  console.log("=" .repeat(50));

  console.log("\n1️⃣  Testing direct Docker container with STDIO...");

  // Test 1: Direct Docker STDIO communication (mimicking our STDIO client)
  try {
    console.log("   🐳 Creating Docker container with STDIO transport...");

    const transport = new StdioClientTransport({
      command: "docker",
      args: [
        "run",
        "-i",
        "--rm",
        "--init",
        "--cap-add=SYS_ADMIN",
        "--add-host=host.docker.internal:host-gateway",
        "--security-opt", "seccomp=unconfined",
        "mcr.microsoft.com/playwright/mcp:latest"
      ]
    });

    const client = new Client({
      name: "direct-stdio-test",
      version: "1.0.0"
    });

    console.log("   🔄 Connecting to container...");
    await client.connect(transport);
    console.log("   ✅ STDIO connection successful!");

    console.log("   📋 Testing list_tools...");
    const tools = await client.listTools();
    console.log(`   ✅ Retrieved ${tools.tools.length} tools successfully`);

    console.log("   🔄 Testing browser_navigate...");
    const navResult = await client.callTool({
      name: "browser_navigate",
      arguments: { url: "https://www.bing.com/maps" }
    });

    console.log("   ✅ browser_navigate call successful!");
    console.log("   📝 Response preview:", navResult.content[0].text.substring(0, 200) + "...");

    await client.close();
    console.log("   ✅ Direct STDIO test PASSED");

    return true;

  } catch (error) {
    console.error("   ❌ Direct STDIO test FAILED:", error.message);
    console.error("   🔍 Full error:", error);
    return false;
  }
}

async function testContainerCreationOnly() {
  console.log("\n2️⃣  Testing container creation without STDIO...");

  try {
    console.log("   🐳 Creating container with docker spawn...");

    const containerName = `stdio-test-${Date.now()}`;

    // Create container with same args as STDIO client
    const createProcess = spawn("docker", [
      "run",
      "-d",
      "--init",
      "--name", containerName,
      "--cap-add=SYS_ADMIN",
      "--add-host=host.docker.internal:host-gateway",
      "--security-opt", "seccomp=unconfined",
      "mcr.microsoft.com/playwright/mcp:latest"
    ]);

    await new Promise((resolve, reject) => {
      createProcess.on('close', (code) => {
        if (code === 0) {
          console.log("   ✅ Container created successfully");
          resolve();
        } else {
          reject(new Error(`Container creation failed with code ${code}`));
        }
      });
    });

    // Check if container is running
    const psProcess = spawn("docker", ["ps", "--filter", `name=${containerName}`, "--format", "{{.Names}}"]);

    let psOutput = "";
    psProcess.stdout.on('data', (data) => {
      psOutput += data.toString();
    });

    await new Promise((resolve) => {
      psProcess.on('close', () => {
        if (psOutput.trim().includes(containerName)) {
          console.log("   ✅ Container is running");
        } else {
          console.log("   ⚠️ Container not found in running processes");
        }
        resolve();
      });
    });

    // Cleanup
    spawn("docker", ["kill", containerName]);

    return true;

  } catch (error) {
    console.error("   ❌ Container creation test FAILED:", error.message);
    return false;
  }
}

async function testOrchestratorLogic() {
  console.log("\n3️⃣  Testing orchestrator logic path...");

  try {
    const transport = new StdioClientTransport({
      command: "node",
      args: ["dist/index.js"]
    });

    const client = new Client({
      name: "orchestrator-test",
      version: "1.0.0"
    });

    console.log("   🔄 Connecting to orchestrator...");
    await client.connect(transport);
    console.log("   ✅ Connected to orchestrator");

    console.log("   📋 Creating instance...");
    const listResult = await client.callTool({
      name: "list_tools",
      arguments: {}
    });

    const data = JSON.parse(listResult.content[0].text);
    const instanceId = data.instanceId;
    console.log(`   ✅ Created instanceId: ${instanceId.substring(0, 8)}...`);

    console.log("   🔄 Testing call_tool with simple browser_snapshot...");
    try {
      const snapshotResult = await client.callTool({
        name: "call_tool",
        arguments: {
          instanceId: instanceId,
          tool: "browser_snapshot",
          args: {}
        }
      });
      console.log("   ✅ browser_snapshot succeeded");

    } catch (toolError) {
      console.error("   ❌ browser_snapshot failed:", toolError.message);

      // Check instance health
      console.log("   🏥 Checking instance health...");
      const healthResult = await client.callTool({
        name: "check_health",
        arguments: { instanceId: instanceId }
      });
      const healthData = JSON.parse(healthResult.content[0].text);
      console.log(`   🏥 Instance health: ${healthData.success ? 'healthy' : 'unhealthy'}`);
    }

    await client.close();
    return true;

  } catch (error) {
    console.error("   ❌ Orchestrator test FAILED:", error.message);
    console.error("   🔍 Full error:", error);
    return false;
  }
}

async function main() {
  console.log("🎯 STDIO CONNECTION DIAGNOSIS");
  console.log("Testing different communication paths to isolate the issue");

  const results = {
    directStdio: await testDirectStdioDocker(),
    containerCreation: await testContainerCreationOnly(),
    orchestratorLogic: await testOrchestratorLogic()
  };

  console.log("\n" + "=" .repeat(50));
  console.log("📊 TEST RESULTS SUMMARY:");
  console.log(`✅ Direct STDIO to Docker: ${results.directStdio ? 'PASS' : 'FAIL'}`);
  console.log(`✅ Container Creation: ${results.containerCreation ? 'PASS' : 'FAIL'}`);
  console.log(`✅ Orchestrator Logic: ${results.orchestratorLogic ? 'PASS' : 'FAIL'}`);

  console.log("\n🔍 DIAGNOSIS:");
  if (results.directStdio) {
    console.log("• Direct STDIO communication works - containers are functional");
    if (!results.orchestratorLogic) {
      console.log("• Issue is in orchestrator's STDIO client implementation");
      console.log("• Problem likely in PlaywrightClientStdio class");
    }
  } else {
    console.log("• Direct STDIO communication fails - container configuration issue");
    console.log("• Need to investigate Docker networking or container setup");
  }

  if (!results.containerCreation) {
    console.log("• Basic container creation fails - Docker environment issue");
  }

  console.log("\n🚀 Next steps based on results:");
  if (results.directStdio && !results.orchestratorLogic) {
    console.log("1. Debug PlaywrightClientStdio connection handling");
    console.log("2. Check container name conflicts or reuse issues");
    console.log("3. Verify instance lifecycle management");
  } else if (!results.directStdio) {
    console.log("1. Check Docker daemon connectivity");
    console.log("2. Verify container image availability");
    console.log("3. Test different container networking configurations");
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}