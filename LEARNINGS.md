# Key Learnings - Playwright MCP Orchestrator

## 🎯 CRITICAL DISCOVERY: STDIO vs HTTP Communication

### ❌ What DOESN'T Work
- **HTTP endpoint communication** with MCP servers
- Calling `/mcp` or `/sse` endpoints directly with curl/fetch
- The `tools/list` method **hangs indefinitely** via HTTP
- Session management via HTTP headers is unreliable

### ✅ What WORKS Perfectly
- **STDIO-based MCP communication** using `StdioClientTransport`
- Direct Docker container spawning with stdio pipes
- Standard MCP protocol over stdin/stdout

## 🔑 Root Cause Analysis

**The Problem**: We initially tried to communicate with Playwright MCP containers via HTTP endpoints, which caused tools/list calls to hang indefinitely.

**The Solution**: MCP protocol is designed for **stdio communication**, not HTTP. When Claude Code successfully uses Playwright MCP, it uses:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "mcr.microsoft.com/playwright/mcp"]
    }
  }
}
```

This spawns containers with stdio pipes, not HTTP servers.

## 🏗️ Architecture Insights

### Container Lifecycle
- **Each MCP session = New Docker container**
- Containers auto-remove with `--rm` flag
- Communication via stdin/stdout, not ports
- No HTTP servers needed inside containers

### Working Implementation Pattern
```typescript
const transport = new StdioClientTransport({
  command: "docker",
  args: ["run", "-i", "--rm", "--init", "mcr.microsoft.com/playwright/mcp"]
});

const client = new Client({ name: "client", version: "1.0.0" });
await client.connect(transport);

// This works instantly:
const tools = await client.listTools();
```

## 🧪 Testing Results

### Before (HTTP Approach)
- ❌ tools/list hangs after 15+ seconds
- ❌ Required complex session management
- ❌ Needed fallback tool definitions
- ❌ HTTP 406/500 errors

### After (STDIO Approach)
- ✅ tools/list returns in <1 second
- ✅ 21 real tools from container
- ✅ No session management needed
- ✅ No fallback definitions required
- ✅ Clean container lifecycle

## 📚 Technical Lessons

1. **MCP Protocol Design**: MCP is fundamentally built for stdio, not HTTP
2. **Docker Integration**: Use `-i` (interactive) for stdio communication
3. **Container Patterns**: `--rm --init` for clean lifecycle management
4. **Tool Discovery**: Real tools > static fallback definitions
5. **Client Libraries**: `@modelcontextprotocol/sdk` handles stdio perfectly

## 🎯 Final Architecture

**Orchestrator Responsibilities**:
- Manage multiple Playwright instances via stdio
- Provide MCP server interface to clients
- Handle instance lifecycle and resource management

**Communication Flow**:
```
Claude Code → Orchestrator (stdio) → Playwright Container (stdio)
```

**Key Components**:
- `PlaywrightClientStdio`: STDIO-based communication
- `DockerManager`: Container lifecycle management
- `McpServer`: Orchestrator MCP interface

## 💡 Production Readiness

The orchestrator is now production-ready because:
- ✅ Uses proven communication patterns
- ✅ Eliminates all hanging/timeout issues
- ✅ Provides clean instance management
- ✅ Follows MCP best practices
- ✅ Tested end-to-end successfully

## 🔧 Docker Container Creation Fix

### Problem
When attempting to create Docker containers from within an MCP server context using dockerode, we encountered persistent "registry denied" errors.

### Solution: Enhanced Docker Configuration
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

### Critical Elements
1. **Explicit API Version**: Forces dockerode to use specific Docker API version
2. **User-Agent Header**: Provides proper identification to Docker daemon
3. **Socket Path**: Explicitly specifies Docker daemon socket
4. **Timeout Configuration**: Ensures adequate time for operations