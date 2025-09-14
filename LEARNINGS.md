# MCP Playwright Orchestrator - Key Learnings

## Docker Container Creation from MCP Server - Critical Fix

### Problem
When attempting to create Docker containers from within an MCP server context using dockerode, we encountered persistent "registry denied" errors:

```
❌ Failed to create container: (HTTP code 500) server error - error from registry: denied
```

**Root Cause**: The issue was environmental/process context specific. Dockerode worked perfectly in isolation but failed when used within MCP server processes due to missing Docker daemon configuration.

### Solution: Enhanced Docker Configuration

The **key fix** was implementing enhanced Docker initialization with explicit configuration parameters:

```typescript
private initializeDockerEnhanced(): Docker {
  const dockerConfig = {
    socketPath: '/var/run/docker.sock',
    version: 'v1.41', // Explicit API version
    timeout: 30000,
    headers: {
      'User-Agent': 'mcp-playwright-orchestrator/1.0.0'
    }
  };
  return new Docker(dockerConfig);
}
```

### Critical Elements of the Fix

1. **Explicit API Version**: `version: 'v1.41'` - Forces dockerode to use a specific Docker API version
2. **User-Agent Header**: Provides proper identification to the Docker daemon
3. **Socket Path**: Explicitly specifies the Docker daemon socket
4. **Timeout Configuration**: Ensures adequate time for operations

### Impact

- ✅ **Registry denied errors**: Completely eliminated
- ✅ **Container creation**: Now works reliably from MCP server context
- ✅ **Microsoft Playwright MCP image**: Successfully pulls and runs
- ✅ **Port mapping**: Proper container networking established
- ✅ **Lifecycle management**: Full container start/stop/cleanup working

### Before vs After

**Before (Failed)**:
```typescript
// Basic dockerode initialization - failed in MCP context
this.docker = new Docker();
```

**After (Working)**:
```typescript
// Enhanced configuration - works in MCP context
this.docker = new Docker({
  socketPath: '/var/run/docker.sock',
  version: 'v1.41',
  timeout: 30000,
  headers: {
    'User-Agent': 'mcp-playwright-orchestrator/1.0.0'
  }
});
```

### Lesson Learned

When using dockerode within MCP servers or similar process contexts, explicit Docker daemon configuration is essential. The default dockerode initialization may not have sufficient context to properly authenticate and communicate with the Docker daemon.

### Verification

Test with: `node test-complete-workflow.js`

Expected output showing successful container creation:
```
✅ Container created successfully via dockerode
✅ Browser container created successfully!
   Instance ID: [uuid]
   Container Port: [port]
   Image: mcr.microsoft.com/playwright/mcp:latest
   Status: running
```