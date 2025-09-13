#!/usr/bin/env node

/**
 * Simple demo to show the MCP Orchestrator can start and HTTP endpoints work
 */

import { spawn } from 'child_process';
import { setTimeout as sleep } from 'node:timers/promises';

async function runDemo() {
  console.log('🚀 MCP Playwright Orchestrator Demo\n');

  let orchestratorProcess = null;

  try {
    // Start orchestrator in HTTP mode
    console.log('1. Starting orchestrator in HTTP mode on port 3000...');
    orchestratorProcess = spawn('npx', ['tsx', 'src/index.ts', '--http'], {
      stdio: 'pipe',
      env: {
        ...process.env,
        PORT: '3000',
        LOG_LEVEL: 'info',
        MAX_INSTANCES: '3',
      },
    });

    // Wait for startup
    await sleep(4000);

    // Test health endpoint
    console.log('2. Testing health endpoint...');
    try {
      const response = await fetch('http://localhost:3000/health');
      if (response.ok) {
        const data = await response.json();
        console.log('✅ Health check successful:');
        console.log(`   Status: ${data.status}`);
        console.log(`   Version: ${data.version}`);
        console.log(`   Instances: ${data.instances}`);
        console.log(`   Uptime: ${Math.round(data.uptime)}s`);
      } else {
        console.log(`❌ Health check failed: HTTP ${response.status}`);
      }
    } catch (error) {
      console.log(`❌ Health check failed: ${error.message}`);
    }

    console.log('\n3. Server is running! You can now:');
    console.log('   • Access health endpoint: http://localhost:3000/health');
    console.log('   • Connect MCP clients to: http://localhost:3000/mcp');
    console.log('   • Use the following tools:');
    console.log('     - new_browser: Create new Playwright instance');
    console.log('     - list_instances: List active instances');
    console.log('     - list_tools: List tools from an instance');
    console.log('     - call_tool: Execute tool on an instance');
    console.log('     - stop_browser: Stop an instance');
    console.log('     - check_health: Check instance health');

    console.log('\n4. Example usage with Claude or MCP client:');
    console.log('   Connect to: http://localhost:3000/mcp');
    console.log('   Call tool: new_browser with {"name": "my-browser"}');

    console.log('\n🎯 Demo complete! Orchestrator is ready for use.');
    console.log('   Press Ctrl+C to stop the server.\n');

    // Keep running until interrupted
    await new Promise((resolve) => {
      process.on('SIGINT', resolve);
      process.on('SIGTERM', resolve);
    });

  } catch (error) {
    console.error('❌ Demo failed:', error.message);
  } finally {
    console.log('\n🧹 Shutting down orchestrator...');
    if (orchestratorProcess && !orchestratorProcess.killed) {
      orchestratorProcess.kill('SIGTERM');

      await new Promise((resolve) => {
        orchestratorProcess.on('exit', resolve);
        setTimeout(() => {
          if (!orchestratorProcess.killed) {
            orchestratorProcess.kill('SIGKILL');
          }
          resolve();
        }, 3000);
      });
    }
    console.log('✅ Orchestrator stopped.');
  }
}

runDemo().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});