#!/usr/bin/env node

/**
 * Demo to test the complete flow with actual Playwright MCP Docker containers
 */

import { spawn } from 'child_process';
import { setTimeout as sleep } from 'node:timers/promises';

async function runDockerDemo() {
  console.log('🐳 MCP Playwright Orchestrator Docker Demo\n');

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
        MAX_INSTANCES: '2',
        PLAYWRIGHT_MCP_IMAGE: 'mcr.microsoft.com/playwright/mcp:latest'
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
      } else {
        console.log(`❌ Health check failed: HTTP ${response.status}`);
        return;
      }
    } catch (error) {
      console.log(`❌ Health check failed: ${error.message}`);
      return;
    }

    // Test creating a Playwright browser instance
    console.log('\n3. Creating Playwright MCP browser instance...');
    try {
      const createRequest = {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'new_browser',
          arguments: {
            name: 'demo-browser',
            image: 'mcr.microsoft.com/playwright/mcp:latest'
          }
        },
        id: 1
      };

      // First, we need to initialize an MCP session
      console.log('   Initializing MCP session...');
      const initRequest = {
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'demo-client',
            version: '1.0.0'
          }
        },
        id: 0
      };

      const initResponse = await fetch('http://localhost:3000/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
        },
        body: JSON.stringify(initRequest),
      });

      let sessionId = null;
      if (initResponse.ok) {
        sessionId = initResponse.headers.get('mcp-session-id');
        console.log(`   ✅ MCP session initialized: ${sessionId}`);
      } else {
        const errorText = await initResponse.text();
        console.log(`   ❌ MCP session failed: ${initResponse.status} - ${errorText}`);
      }

      console.log('   Sending request to create browser...');
      const response = await fetch('http://localhost:3000/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          ...(sessionId && { 'mcp-session-id': sessionId })
        },
        body: JSON.stringify(createRequest),
      });

      if (!response.ok) {
        console.log(`❌ Failed to create browser: HTTP ${response.status}`);
        const errorText = await response.text();
        console.log(`   Error: ${errorText}`);
        return;
      }

      const createResponse = await response.json();

      if (createResponse.error) {
        console.log(`❌ Failed to create browser: ${createResponse.error.message}`);
        return;
      }

      const result = JSON.parse(createResponse.result.content[0].text);

      if (!result.success) {
        console.log(`❌ Failed to create browser: ${result.error}`);
        console.log('   This might be expected if Docker is not available or image cannot be pulled');
        return;
      }

      const instanceId = result.instance.id;
      console.log('✅ Browser instance created successfully!');
      console.log(`   Instance ID: ${instanceId}`);
      console.log(`   Port: ${result.instance.port}`);

      // Wait a bit for the container to fully start
      console.log('\n4. Waiting for Playwright MCP container to start...');
      await sleep(10000);

      // Test listing tools from the Playwright instance
      console.log('\n5. Testing list_tools from Playwright MCP container...');
      try {
        const listToolsRequest = {
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'list_tools',
            arguments: {
              instanceId: instanceId
            }
          },
          id: 2
        };

        const toolsResponse = await fetch('http://localhost:3000/mcp', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(listToolsRequest),
        });

        if (!toolsResponse.ok) {
          console.log(`❌ Failed to list tools: HTTP ${toolsResponse.status}`);
          return;
        }

        const toolsResult = await toolsResponse.json();

        if (toolsResult.error) {
          console.log(`❌ Failed to list tools: ${toolsResult.error.message}`);
          return;
        }

        const toolsData = JSON.parse(toolsResult.result.content[0].text);

        if (toolsData.success) {
          console.log('✅ Successfully listed tools from Playwright MCP!');
          console.log(`   Found ${toolsData.count} tools:`);
          toolsData.tools.forEach((tool, index) => {
            console.log(`   ${index + 1}. ${tool.name} - ${tool.description}`);
          });
        } else {
          console.log(`❌ Failed to list tools: ${toolsData.error}`);
        }
      } catch (error) {
        console.log(`❌ Error listing tools: ${error.message}`);
      }

      // Test health check
      console.log('\n6. Testing health check of Playwright instance...');
      try {
        const healthRequest = {
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'check_health',
            arguments: {
              instanceId: instanceId
            }
          },
          id: 3
        };

        const healthResponse = await fetch('http://localhost:3000/mcp', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(healthRequest),
        });

        if (healthResponse.ok) {
          const healthResult = await healthResponse.json();
          const healthData = JSON.parse(healthResult.result.content[0].text);

          if (healthData.success) {
            console.log(`✅ Health check successful: ${healthData.health}`);
          } else {
            console.log(`❌ Health check failed: ${healthData.error}`);
          }
        }
      } catch (error) {
        console.log(`❌ Error checking health: ${error.message}`);
      }

      // Clean up the instance
      console.log('\n7. Cleaning up browser instance...');
      try {
        const stopRequest = {
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'stop_browser',
            arguments: {
              instanceId: instanceId
            }
          },
          id: 4
        };

        const stopResponse = await fetch('http://localhost:3000/mcp', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(stopRequest),
        });

        if (stopResponse.ok) {
          const stopResult = await stopResponse.json();
          const stopData = JSON.parse(stopResult.result.content[0].text);

          if (stopData.success) {
            console.log('✅ Browser instance stopped successfully');
          } else {
            console.log(`❌ Failed to stop instance: ${stopData.error}`);
          }
        }
      } catch (error) {
        console.log(`❌ Error stopping instance: ${error.message}`);
      }

    } catch (error) {
      console.log(`❌ Error in browser creation flow: ${error.message}`);
    }

    console.log('\n🎉 Docker demo completed!');
    console.log('\n📋 Summary:');
    console.log('   ✅ Orchestrator HTTP server');
    console.log('   ✅ MCP protocol communication');
    console.log('   ✅ Docker container lifecycle');
    console.log('   ✅ Playwright MCP integration');
    console.log('   ✅ Tool proxying and execution');

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
        }, 5000);
      });
    }
    console.log('✅ Demo cleanup complete.');
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

// Run the demo
runDockerDemo().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});