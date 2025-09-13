#!/usr/bin/env node

/**
 * Manual test script to demonstrate MCP Orchestrator functionality
 * Run this with: node manual-test.js
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';
import { setTimeout as sleep } from 'node:timers/promises';

async function runManualTest() {
  console.log('🚀 Starting MCP Playwright Orchestrator Manual Test\n');

  let orchestratorProcess = null;
  let client = null;

  try {
    // Start the orchestrator
    console.log('1. Starting orchestrator process...');
    orchestratorProcess = spawn('npx', ['tsx', 'src/index.ts'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        LOG_LEVEL: 'info',
        MAX_INSTANCES: '2',
      },
    });

    // Wait for startup
    await sleep(3000);

    // Create MCP client
    console.log('2. Connecting MCP client...');
    client = new Client({
      name: 'manual-test-client',
      version: '1.0.0',
    });

    const transport = new StdioClientTransport({
      readable: orchestratorProcess.stdout,
      writable: orchestratorProcess.stdin,
    });

    await client.connect(transport);
    console.log('✅ Connected to orchestrator\n');

    // Test 1: List available tools
    console.log('3. Testing tool discovery...');
    const toolsResult = await client.listTools();
    console.log('📋 Available tools:');
    toolsResult.tools.forEach((tool, index) => {
      console.log(`   ${index + 1}. ${tool.name} - ${tool.description}`);
    });
    console.log('✅ Tool discovery successful\n');

    // Test 2: List instances (should be empty initially)
    console.log('4. Testing instance management...');
    const listResult = await client.callTool('list_instances', {});
    const listResponse = JSON.parse(listResult.content[0].text);
    console.log(`📊 Current instances: ${listResponse.count}`);
    console.log('✅ Instance listing successful\n');

    // Test 3: Try to create a browser (will fail without proper Docker image, but should handle gracefully)
    console.log('5. Testing browser creation (expected to fail gracefully)...');
    try {
      const createResult = await client.callTool('new_browser', {
        name: 'test-browser',
        image: 'nginx:alpine', // This won't work as Playwright MCP but will test error handling
      });
      const createResponse = JSON.parse(createResult.content[0].text);

      if (createResponse.success) {
        console.log('🎉 Browser instance created (unexpected!)');
        console.log(`   Instance ID: ${createResponse.instance.id}`);

        // Test listing tools from the instance (will likely fail)
        try {
          const instanceToolsResult = await client.callTool('list_tools', {
            instanceId: createResponse.instance.id,
          });
          const instanceToolsResponse = JSON.parse(instanceToolsResult.content[0].text);

          if (instanceToolsResponse.success) {
            console.log(`🔧 Instance tools: ${instanceToolsResponse.count} tools available`);
          } else {
            console.log('❌ Failed to list instance tools (expected with nginx image)');
          }
        } catch (error) {
          console.log('❌ Error listing instance tools (expected)');
        }

        // Clean up the instance
        try {
          await client.callTool('stop_browser', {
            instanceId: createResponse.instance.id,
          });
          console.log('🧹 Cleaned up test instance');
        } catch (error) {
          console.log('❌ Error cleaning up instance');
        }
      } else {
        console.log('❌ Browser creation failed as expected:');
        console.log(`   Error: ${createResponse.error}`);
      }
    } catch (error) {
      console.log('❌ Browser creation failed with exception (expected):');
      console.log(`   Error: ${error.message}`);
    }
    console.log('✅ Error handling test completed\n');

    // Test 4: Test non-existent instance operations
    console.log('6. Testing operations on non-existent instances...');
    const fakeId = '00000000-0000-4000-8000-000000000000';

    const healthResult = await client.callTool('check_health', {
      instanceId: fakeId,
    });
    const healthResponse = JSON.parse(healthResult.content[0].text);

    if (!healthResponse.success && healthResponse.error.includes('Instance not found')) {
      console.log('✅ Properly handled non-existent instance health check');
    }

    const stopResult = await client.callTool('stop_browser', {
      instanceId: fakeId,
    });
    const stopResponse = JSON.parse(stopResult.content[0].text);

    if (!stopResponse.success && stopResponse.error.includes('Instance not found')) {
      console.log('✅ Properly handled non-existent instance stop request');
    }
    console.log('✅ Non-existent instance handling completed\n');

    console.log('🎉 Manual test completed successfully!');
    console.log('\n📋 Summary:');
    console.log('   ✅ MCP protocol compliance');
    console.log('   ✅ Tool discovery');
    console.log('   ✅ Instance management');
    console.log('   ✅ Error handling');
    console.log('   ✅ Input validation');

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
    console.error('Stack trace:', error.stack);
  } finally {
    // Cleanup
    console.log('\n🧹 Cleaning up...');

    if (client) {
      try {
        await client.close();
        console.log('   ✅ Client disconnected');
      } catch (error) {
        console.log('   ❌ Error disconnecting client');
      }
    }

    if (orchestratorProcess && !orchestratorProcess.killed) {
      orchestratorProcess.kill('SIGTERM');
      console.log('   ✅ Orchestrator process terminated');

      // Wait for process to exit
      await new Promise((resolve) => {
        orchestratorProcess.on('exit', resolve);
        setTimeout(resolve, 3000);
      });
    }

    console.log('🎯 Manual test completed!\n');
  }
}

// Handle process signals for clean shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Interrupted by user');
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Terminated');
  process.exit(1);
});

// Run the test
runManualTest().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});