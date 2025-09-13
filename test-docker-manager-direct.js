#!/usr/bin/env node

/**
 * Direct test of Docker manager to verify CLI fallback works
 */

import { DockerManager } from './src/services/docker-manager.js';

async function testDockerManagerDirect() {
  console.log('🧪 Testing Docker Manager Directly\n');

  try {
    console.log('1. Creating Docker Manager...');
    const dockerManager = new DockerManager();

    console.log('2. Creating Playwright instance...');
    const instance = await dockerManager.createPlaywrightInstance(
      'mcr.microsoft.com/playwright/mcp:latest',
      'direct-test'
    );

    console.log('✅ Instance created successfully!');
    console.log('Instance details:', {
      id: instance.id,
      name: instance.name,
      image: instance.image,
      containerId: instance.containerId,
      port: instance.port,
      status: instance.status,
      healthUrl: instance.healthUrl
    });

    // Wait a bit
    console.log('\n3. Waiting for container to be ready...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Check health
    console.log('4. Checking container health...');
    const health = await dockerManager.getContainerHealth(instance.id);
    console.log('Container health:', health);

    // Clean up
    console.log('\n5. Cleaning up...');
    await dockerManager.stopInstance(instance.id);
    console.log('✅ Instance stopped successfully');

    console.log('\n🎉 Direct Docker Manager test SUCCESSFUL!');

  } catch (error) {
    console.error('❌ Direct test failed:', error.message);
    console.error('Full error:', error);
  }
}

testDockerManagerDirect().catch(console.error);