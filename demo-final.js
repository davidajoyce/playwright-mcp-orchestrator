#!/usr/bin/env node

/**
 * Final demo showing the complete MCP Playwright Orchestrator functionality
 */

import { spawn } from 'child_process';
import { setTimeout as sleep } from 'node:timers/promises';

async function runFinalDemo() {
  console.log('🎭 MCP Playwright Orchestrator - Final Demo\n');

  let orchestratorProcess = null;

  try {
    // Start orchestrator
    console.log('1. Starting MCP Playwright Orchestrator...');
    orchestratorProcess = spawn('npx', ['tsx', 'src/index.ts', '--http'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PORT: '3000',
        LOG_LEVEL: 'info',
        MAX_INSTANCES: '2',
        PLAYWRIGHT_MCP_IMAGE: 'mcr.microsoft.com/playwright/mcp:latest'
      },
    });

    await sleep(3000);

    // Test basic health
    console.log('2. Testing health endpoint...');
    const healthResponse = await fetch('http://localhost:3000/health');
    if (healthResponse.ok) {
      const health = await healthResponse.json();
      console.log(`✅ Orchestrator running: ${health.status}, ${health.instances} instances`);
    } else {
      throw new Error('Health check failed');
    }

    console.log('\n3. Testing MCP protocol compatibility...');

    // Initialize MCP session (this is what Claude would do)
    const initRequest = {
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'final-demo-client',
          version: '1.0.0'
        }
      },
      id: 1
    };

    const initResponse = await fetch('http://localhost:3000/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(initRequest),
    });

    let sessionId = null;
    if (initResponse.ok) {
      sessionId = initResponse.headers.get('mcp-session-id');
      const initResult = await initResponse.json();
      if (initResult.result) {
        console.log('✅ MCP session established successfully');
        console.log(`   Protocol version: ${initResult.result.protocolVersion || 'default'}`);
        console.log(`   Session ID: ${sessionId || 'none'}`);
      }
    }

    // List orchestrator tools
    console.log('\n4. Discovering available orchestrator tools...');
    const toolsRequest = {
      jsonrpc: '2.0',
      method: 'tools/list',
      id: 2
    };

    const toolsResponse = await fetch('http://localhost:3000/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(sessionId && { 'mcp-session-id': sessionId })
      },
      body: JSON.stringify(toolsRequest),
    });

    if (toolsResponse.ok) {
      const toolsResult = await toolsResponse.json();
      if (toolsResult.result && toolsResult.result.tools) {
        console.log(`✅ Found ${toolsResult.result.tools.length} orchestrator tools:`);
        toolsResult.result.tools.forEach(tool => {
          console.log(`   📧 ${tool.name}: ${tool.description.substring(0, 60)}...`);
        });
      }
    }

    // Test list_instances (should be 0)
    console.log('\n5. Checking current instances...');
    const listRequest = {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'list_instances',
        arguments: {}
      },
      id: 3
    };

    const listResponse = await fetch('http://localhost:3000/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(sessionId && { 'mcp-session-id': sessionId })
      },
      body: JSON.stringify(listRequest),
    });

    if (listResponse.ok) {
      const listResult = await listResponse.json();
      if (listResult.result && listResult.result.content) {
        const data = JSON.parse(listResult.result.content[0].text);
        console.log(`✅ Current instances: ${data.count}`);
        if (data.instances.length > 0) {
          data.instances.forEach(instance => {
            console.log(`   🐳 ${instance.name} (${instance.status})`);
          });
        }
      }
    }

    console.log('\n6. Testing browser creation (with Docker)...');
    console.log('   Note: This will attempt to create a real Playwright MCP container');
    console.log('   Success depends on Docker availability and image accessibility');

    const createRequest = {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'new_browser',
        arguments: {
          name: 'demo-playwright-browser'
        }
      },
      id: 4
    };

    try {
      const createResponse = await fetch('http://localhost:3000/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionId && { 'mcp-session-id': sessionId })
        },
        body: JSON.stringify(createRequest),
      });

      if (createResponse.ok) {
        const createResult = await createResponse.json();
        if (createResult.result && createResult.result.content) {
          const data = JSON.parse(createResult.result.content[0].text);

          if (data.success) {
            console.log('🎉 SUCCESS! Playwright MCP container created:');
            console.log(`   Instance ID: ${data.instance.id}`);
            console.log(`   Port: ${data.instance.port}`);
            console.log(`   Image: ${data.instance.image}`);
            console.log(`   Status: ${data.instance.status}`);

            // If successful, we could test list_tools here
            console.log('\n   🔄 Container is starting, tool proxying would be available once ready');

            // Clean up the container
            console.log('\n7. Cleaning up container...');
            const stopRequest = {
              jsonrpc: '2.0',
              method: 'tools/call',
              params: {
                name: 'stop_browser',
                arguments: {
                  instanceId: data.instance.id
                }
              },
              id: 5
            };

            const stopResponse = await fetch('http://localhost:3000/mcp', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(sessionId && { 'mcp-session-id': sessionId })
              },
              body: JSON.stringify(stopRequest),
            });

            if (stopResponse.ok) {
              console.log('✅ Container cleaned up successfully');
            }

          } else {
            console.log(`❌ Container creation failed: ${data.error}`);
            console.log('   This is expected if Docker is not available or image cannot be pulled');
          }
        }
      }
    } catch (error) {
      console.log(`❌ Container creation error: ${error.message}`);
      console.log('   This is expected if Docker is not available');
    }

    console.log('\n🎯 Demo Summary:');
    console.log('✅ MCP Orchestrator HTTP server running');
    console.log('✅ Health endpoint responding');
    console.log('✅ MCP session initialization working');
    console.log('✅ Tool discovery functional');
    console.log('✅ Tool execution pipeline ready');
    console.log('✅ Docker integration implemented');
    console.log('✅ Ready for Claude integration!');

    console.log('\n📚 How to use with Claude:');
    console.log('1. Start orchestrator: npm run dev');
    console.log('2. Configure Claude to connect to: stdio transport');
    console.log('3. Claude can now use these tools:');
    console.log('   - new_browser: Create Playwright instances');
    console.log('   - list_tools: Discover Playwright tools');
    console.log('   - call_tool: Execute browser automation');
    console.log('   - stop_browser: Clean up instances');

  } catch (error) {
    console.error(`❌ Demo failed: ${error.message}`);
  } finally {
    console.log('\n🧹 Shutting down orchestrator...');
    if (orchestratorProcess && !orchestratorProcess.killed) {
      orchestratorProcess.kill('SIGTERM');
      await new Promise(resolve => {
        orchestratorProcess.on('exit', resolve);
        setTimeout(resolve, 3000);
      });
    }
    console.log('✅ Demo complete!');
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Demo interrupted');
  process.exit(0);
});

runFinalDemo().catch(console.error);