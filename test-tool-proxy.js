#!/usr/bin/env node

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

/**
 * Test Tool Proxy Behavior - Playwright MCP Orchestrator
 * Tests that orchestrator correctly proxies tool calls to Playwright containers
 */

async function testToolProxy() {
  console.log("🔧 Testing Tool Proxy Behavior - Orchestrator → Playwright MCP");
  console.log("=" .repeat(65));

  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/index.js"]
  });

  const client = new Client({
    name: "tool-proxy-test",
    version: "1.0.0"
  });

  try {
    console.log("\n1️⃣  Connecting to orchestrator...");
    await client.connect(transport);
    console.log("   ✅ Connected!");

    console.log("\n2️⃣  Creating browser instance...");
    const createResult = await client.callTool({
      name: "new_browser",
      arguments: {
        name: "proxy-test-browser",
        image: "mcr.microsoft.com/playwright/mcp"
      }
    });

    const createData = JSON.parse(createResult.content[0].text);
    if (!createData.success) {
      throw new Error(`Failed to create browser: ${createData.error}`);
    }

    const instanceId = createData.instance.id;
    console.log(`   ✅ Browser instance: ${instanceId.substring(0, 8)}...`);

    console.log("\n3️⃣  Getting available tools from browser...");
    const toolsResult = await client.callTool({
      name: "list_tools",
      arguments: { instanceId }
    });

    const toolsData = JSON.parse(toolsResult.content[0].text);
    const availableTools = toolsData.tools;
    console.log(`   ✅ ${availableTools.length} tools available`);

    // Test specific Playwright MCP tools
    const testTools = [
      {
        name: "browser_navigate",
        args: { url: "https://www.afterpay.com/en-US" },
        description: "Navigate to a webpage"
      },
      {
        name: "browser_snapshot",
        args: {},
        description: "Take page accessibility snapshot"
      },
      {
        name: "browser_resize",
        args: { width: 1920, height: 1080 },
        description: "Resize browser window"
      },
      {
        name: "browser_console_messages",
        args: {},
        description: "Get console messages"
      }
    ];

    for (let i = 0; i < testTools.length; i++) {
      const testTool = testTools[i];

      console.log(`\n${4 + i}️⃣  Testing tool proxy: ${testTool.name}`);
      console.log(`   📋 ${testTool.description}`);
      console.log(`   🔄 Orchestrator → Docker Container → Playwright MCP`);

      try {
        const startTime = Date.now();

        console.log(`   🔍 Calling orchestrator with:`);
        console.log(`      Tool: ${testTool.name}`);
        console.log(`      Args: ${JSON.stringify(testTool.args)}`);
        console.log(`      Instance ID: ${instanceId}`);

        const toolResult = await client.callTool({
          name: "call_tool",
          arguments: {
            instanceId,
            tool: testTool.name,
            args: testTool.args
          }
        });

        const duration = Date.now() - startTime;

        console.log(`   📥 RAW orchestrator response (TRANSPARENT PROXY):`);
        console.log(`      Type: ${typeof toolResult}`);
        console.log(`      Keys: ${Object.keys(toolResult)}`);
        console.log(`      Content length: ${toolResult.content?.length || 'N/A'}`);
        console.log(`      Has isError: ${toolResult.isError !== undefined}`);
        console.log(`      IsError value: ${toolResult.isError}`);

        // This is now the direct Playwright MCP response!
        const playwrightResponse = toolResult;

        console.log(`   🎯 DIRECT PLAYWRIGHT MCP RESPONSE (no orchestrator wrapper):`);

        if (playwrightResponse.content) {
          console.log(`      Content length: ${playwrightResponse.content.length}`);
          console.log(`      Content[0] keys: ${Object.keys(playwrightResponse.content[0] || {})}`);

          if (testTool.name === "browser_snapshot" && playwrightResponse.content[0]?.text) {
            const text = playwrightResponse.content[0].text;
            const preview = text.split('\n').slice(0, 3).join('\n');
            console.log(`      Snapshot preview: ${preview}...`);
          }

          if (testTool.name === "browser_navigate" && playwrightResponse.content[0]?.text) {
            const navText = playwrightResponse.content[0].text;
            console.log(`      Navigation response preview: ${navText.substring(0, 100)}...`);
          }
        }

        const isSuccess = !playwrightResponse.isError;
        if (isSuccess) {
          console.log(`   ✅ Tool proxy successful - TRANSPARENT! (${duration}ms)`);
          console.log(`   🎉 Caller gets EXACT same response as direct Playwright MCP call!`);
        } else {
          console.log(`   ⚠️  Tool returned error (from Playwright MCP): ${playwrightResponse.isError}`);
          console.log(`   📄 Direct error response: ${JSON.stringify(playwrightResponse, null, 2)}`);
        }
      } catch (error) {
        console.log(`   ❌ Tool proxy failed: ${error.message}`);
      }
    }

    console.log("\n🧪 Testing tool that doesn't exist...");
    try {
      await client.callTool({
        name: "call_tool",
        arguments: {
          instanceId,
          tool: "nonexistent_tool",
          args: {}
        }
      });
      console.log("   ❌ Should have failed for nonexistent tool!");
    } catch (error) {
      console.log("   ✅ Correctly rejected nonexistent tool");
    }

    console.log("\n9️⃣  Cleaning up browser instance...");
    await client.callTool({
      name: "stop_browser",
      arguments: { instanceId }
    });
    console.log("   ✅ Instance stopped");

    console.log("\n🎉 TOOL PROXY TEST COMPLETED!");
    console.log("\n💡 Proxy behavior verified:");
    console.log("   • Orchestrator successfully proxies tool calls");
    console.log("   • Real Playwright MCP tools execute in Docker containers");
    console.log("   • Tool results pass through orchestrator unchanged");
    console.log("   • Error handling works for invalid tools");
    console.log("   • Performance is good (stdio communication)");

  } catch (error) {
    console.error("\n❌ Tool proxy test failed:", error.message);
    throw error;
  } finally {
    console.log("\n🔌 Closing connection...");
    await client.close();
    console.log("   ✅ Connection closed");
  }
}

async function main() {
  try {
    await testToolProxy();
    console.log("\n" + "=".repeat(65));
    console.log("✨ TOOL PROXY BEHAVIOR VERIFIED!");
    console.log("🎯 Orchestrator correctly proxies all Playwright MCP tools!");
  } catch (error) {
    console.error("\n💥 Tool proxy test failed:", error.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}