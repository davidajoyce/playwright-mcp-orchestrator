# MCP Playwright Orchestrator

A production-ready Model Context Protocol (MCP) server that enables **multiple concurrent Claude Code sessions** to use Playwright browser automation simultaneously. Each session gets its own isolated browser environment in a dedicated Docker container.

## 🎯 Why This Orchestrator?

**The Problem**: The standard Playwright MCP server can only handle **one browser session at a time**. When multiple Claude Code users try to use Playwright simultaneously, they share the same Chromium instance, leading to:
- Browser state conflicts between users
- Navigation interference (User A's actions affect User B's browser)
- Session data leakage and security concerns
- "No open pages available" errors when contexts collide

**The Solution**: This orchestrator creates **dedicated Playwright containers** for each Claude Code session:
- ✅ **True isolation** - Each user gets their own browser instance
- ✅ **Concurrent usage** - Multiple Claude sessions can run Playwright simultaneously
- ✅ **Session persistence** - Browser state maintained across multiple tool calls
- ✅ **Scalable** - Spin up as many instances as needed
- ✅ **Secure** - No data leakage between different users

## 🚀 Quick Setup for Claude Code

### 1. Install and Build
```bash
git clone <repository>
cd playwright-mcp-orchestrator
npm install
npm run build
```

### 2. Add to Claude Code
```bash
# Recommended: Using npx for automatic updates
claude mcp add playwright-orchestrator --scope user -- npx mcp-playwright-orchestrator

# Alternative: Direct path
claude mcp add playwright-orchestrator --scope user -- node /path/to/playwright-mcp-orchestrator/dist/index.js
```

### 3. Test Integration
Start using Playwright tools in Claude Code - each session will automatically get its own isolated browser container!

## 🏗️ High-Level Architecture

```
┌─────────────────┐    STDIO     ┌─────────────────────┐    STDIO     ┌─────────────────────┐
│  Claude Code    │◄────────────►│                     │◄────────────►│ Docker Container    │
│   Session A     │              │  MCP Orchestrator   │              │ Playwright Instance │
└─────────────────┘              │                     │              │       A             │
                                 │  • Client Cache     │              └─────────────────────┘
┌─────────────────┐    STDIO     │  • Session Manager  │    STDIO     ┌─────────────────────┐
│  Claude Code    │◄────────────►│  • Resource Pool    │◄────────────►│ Docker Container    │
│   Session B     │              │  • Instance Tracker │              │ Playwright Instance │
└─────────────────┘              └─────────────────────┘              │       B             │
                                                                      └─────────────────────┘
```

### Key Components:

#### **MCP Orchestrator (This Project)**
- Receives MCP requests from Claude Code sessions
- Creates and manages dedicated Playwright containers
- Caches client connections for session persistence
- Provides transparent tool proxying to containers

#### **Session Isolation**
- Each Claude Code session gets a unique `instanceId`
- One persistent Docker container per instanceId
- Browser state isolated between different users
- Automatic cleanup when sessions end

#### **Docker Container Management**
- Uses official `mcr.microsoft.com/playwright/mcp:latest` image
- STDIO-based communication (not HTTP)
- Networking configured for external website access
- Auto-removal with `--rm` flag for cleanup

## 🛠️ Core Features

- **MCP 2025 Compliance**: Built with official `@modelcontextprotocol/sdk`
- **Session Persistence**: Browser state maintained across multiple tool calls
- **Concurrent Sessions**: Multiple Claude Code users can use Playwright simultaneously
- **Docker Integration**: Automated container lifecycle management
- **Transparent Proxying**: All Playwright MCP tools work exactly the same
- **Resource Management**: Configurable limits, health monitoring, graceful shutdown
- **Production Ready**: Full TypeScript, structured logging, error handling

## 🛠️ Installation & Setup

```bash
# Clone and install dependencies
git clone <repository>
cd playwright-mcp-orchestrator
npm install

# Build the project
npm run build

# Run in development
npm run dev

# Run tests
npm test
```

## 🚦 Quick Start

### Via stdio (recommended for Claude)

```bash
npm run dev
```

### Via HTTP server

```bash
npm run dev -- --http
# or
PORT=3000 npm run dev -- --http
```

## 🔧 MCP Tools Available

The orchestrator provides 4 management tools that work transparently with Claude Code:

### `list_tools` (Auto-creates instance)
Lists all available Playwright tools. If no instanceId provided, automatically creates a new dedicated browser instance for your session.

**Claude Code Usage**: Automatically called when you first use Playwright
**Returns**: 21+ browser automation tools (navigate, click, type, screenshot, etc.)

### `call_tool` (Core browser automation)
Executes any Playwright tool on your dedicated browser instance.

**Examples in Claude Code**:
- "Navigate to https://example.com" → `browser_navigate`
- "Click the login button" → `browser_click`
- "Type my email in the form" → `browser_type`
- "Take a screenshot" → `browser_take_screenshot`
- "Get page content" → `browser_snapshot`

### `list_instances` (Management)
Shows all running browser instances across all Claude Code sessions.

### `check_health` (Diagnostics)
Checks if a specific browser instance is healthy and responsive.

## 💡 User Experience

**From Claude Code perspective**, you just use Playwright tools normally:

```
You: "Navigate to GitHub and take a screenshot"

Claude Code automatically:
1. Calls list_tools → Creates your dedicated browser instance
2. Calls browser_navigate → Opens GitHub in YOUR browser
3. Calls browser_take_screenshot → Captures YOUR browser state
```

**Multiple users can do this simultaneously** without interfering with each other!

## ⚙️ Configuration

Configure via environment variables:

```bash
# Docker settings
PLAYWRIGHT_MCP_IMAGE=mcr.microsoft.com/playwright/mcp:latest
EXPOSED_PORT_IN_CONTAINER=3001
CONTAINER_NETWORK=mcp-network

# Orchestrator settings
ORCHESTRATOR_HOST=127.0.0.1
MAX_INSTANCES=10
LOG_LEVEL=info

# Security
ENABLE_DNS_REBINDING_PROTECTION=true
ALLOWED_HOSTS=127.0.0.1,localhost

# Timeouts
HEALTH_CHECK_TIMEOUT_MS=2500
CONTAINER_STARTUP_TIMEOUT_MS=30000

# Rate limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=100
```

## 🧪 Testing

The project includes comprehensive test files for validation:

### Critical Regression Tests
```bash
# Test the exact user scenario that was originally failing
node test-mcp-debug.js

# Complete end-to-end system test
node test-final-verification.js

# Multi-session isolation (security test)
node test-multi-session.js

# Docker networking validation
node test-networking-fix.js
```

### Test Coverage
- **Session Persistence**: Ensures browser state persists across tool calls
- **Container Isolation**: Validates multiple Claude sessions don't interfere
- **Docker Integration**: Tests container creation, networking, and cleanup
- **MCP Protocol**: Verifies transparent tool proxying and error handling

### Development Testing
```bash
# Build and run unit tests
npm run build
npm test

# Run tests in watch mode
npm run test:watch
```

## 🐳 Docker Usage

The orchestrator manages Playwright MCP containers with:

- **Security**: Non-root users, no new privileges, resource limits
- **Isolation**: Custom networks, port randomization
- **Monitoring**: Health checks, graceful shutdown
- **Auto-cleanup**: Containers removed on exit

### Container Requirements

The orchestrator uses the official Microsoft Playwright MCP Docker image:
- **Image**: `mcr.microsoft.com/playwright/mcp:latest`
- **Protocol**: Model Context Protocol (MCP) over HTTP
- **Endpoint**: `/mcp` for MCP JSON-RPC requests
- **Tools**: Browser automation via Playwright (navigate, click, fill, etc.)
- **Capabilities**: Headless browser automation with structured accessibility data

## 🔒 Security Features

- **DNS Rebinding Protection**: Validates Host headers
- **Rate Limiting**: Configurable request limits
- **CORS**: Secure cross-origin resource sharing
- **Helmet**: Security headers (CSP, HSTS, etc.)
- **Container Security**: Non-root execution, read-only filesystem where possible

## 📊 Monitoring & Observability

- **Structured Logging**: JSON logs with Winston
- **Health Endpoints**: `/health` for load balancers
- **Metrics**: Instance counts, uptime tracking
- **Error Tracking**: Detailed error context

## 🚀 Production Deployment

### Environment Setup

```bash
# Production settings
NODE_ENV=production
LOG_LEVEL=info
ENABLE_DNS_REBINDING_PROTECTION=true
ALLOWED_HOSTS=your-domain.com

# Resource limits
MAX_INSTANCES=50
RATE_LIMIT_MAX=1000
```

### Docker Compose Example

```yaml
version: '3.8'
services:
  orchestrator:
    build: .
    environment:
      - NODE_ENV=production
      - MAX_INSTANCES=20
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    ports:
      - "3000:3000"
    restart: unless-stopped
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details.

## 🆘 Troubleshooting

### Common Issues

**"No open pages available" after navigation**
- Issue: Browser can't access external websites due to Docker networking
- Solution: The orchestrator includes networking fixes automatically
- Test: Run `node test-networking-fix.js` to verify

**"Connection closed" errors**
- Issue: Client caching not working properly
- Solution: Restart orchestrator, check logs for container conflicts
- Test: Run `node test-mcp-debug.js` to verify the fix

**Multiple users interfering with each other**
- Issue: Sessions not properly isolated
- Solution: Each Claude Code session should get unique instanceId
- Test: Run `node test-multi-session.js` to verify isolation

**Docker permission errors**
```bash
# Ensure Docker socket access
sudo usermod -aG docker $USER
# Then logout/login or restart terminal
```

**Container cleanup issues**
```bash
# Clean up any stuck containers
docker kill $(docker ps -q --filter "ancestor=mcr.microsoft.com/playwright/mcp:latest") 2>/dev/null || true
```

### Debug Mode

```bash
LOG_LEVEL=debug npm run dev
# Watch orchestrator logs for detailed container and session info
```

### Monitoring Containers

```bash
# Watch containers being created/destroyed
watch -n 2 "docker ps --filter 'ancestor=mcr.microsoft.com/playwright/mcp:latest'"
```

## 🔗 Related Projects

- [Model Context Protocol](https://modelcontextprotocol.io/)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Playwright MCP Server](https://github.com/modelcontextprotocol/servers/tree/main/src/playwright)