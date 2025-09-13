# MCP Playwright Orchestrator

A production-ready Model Context Protocol (MCP) server that orchestrates multiple Playwright MCP instances in Docker containers. This orchestrator allows you to spin up, manage, and interact with multiple isolated browser automation environments.

## 🚀 Features

- **MCP 2025 Compliance**: Built with official `@modelcontextprotocol/sdk`
- **Multi-Transport Support**: Works with both stdio and HTTP transports
- **Security First**: DNS rebinding protection, rate limiting, CORS support
- **Resource Management**: Container limits, health monitoring, graceful shutdown
- **Type Safety**: Full TypeScript with Zod validation
- **Production Ready**: Structured logging, error handling, monitoring

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌──────────────────┐
│   Claude/Client │────│  Orchestrator   │────│ Playwright MCP   │
│                 │    │     (This)      │    │   Container 1    │
└─────────────────┘    │                 │    └──────────────────┘
                       │                 │    ┌──────────────────┐
                       │                 │────│ Playwright MCP   │
                       │                 │    │   Container 2    │
                       └─────────────────┘    └──────────────────┘
```

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

## 🔧 Available Tools

### `new_browser`
Create a new Playwright MCP instance in Docker.

```json
{
  "name": "test-browser",
  "image": "ghcr.io/modelcontextprotocol/servers/playwright:latest"
}
```

### `list_instances`
List all running Playwright instances.

### `list_tools`
List available tools from a specific Playwright instance.

```json
{
  "instanceId": "uuid-of-instance"
}
```

### `call_tool`
Execute a tool on a specific Playwright instance.

```json
{
  "instanceId": "uuid-of-instance",
  "tool": "navigate_to",
  "args": {
    "url": "https://example.com"
  }
}
```

### `stop_browser`
Stop and remove a Playwright instance.

```json
{
  "instanceId": "uuid-of-instance"
}
```

### `check_health`
Check the health status of a Playwright instance.

## ⚙️ Configuration

Configure via environment variables:

```bash
# Docker settings
PLAYWRIGHT_MCP_IMAGE=ghcr.io/modelcontextprotocol/servers/playwright:latest
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

The test suite includes:
- **Integration tests**: Full MCP protocol compliance
- **HTTP server tests**: Security headers, CORS, rate limiting
- **Unit tests**: Docker management, error handling
- **Load tests**: Concurrent requests, resource limits

```bash
# Run all tests
npm test

# Run specific test file
npm test orchestrator.test.ts

# Run tests in watch mode
npm run test:watch
```

### Test Structure

```bash
src/test/
├── orchestrator.test.ts      # MCP integration tests
├── http-server.test.ts       # HTTP transport tests
├── docker-manager.test.ts    # Docker service tests
└── setup.ts                  # Test configuration
```

## 🐳 Docker Usage

The orchestrator manages Playwright MCP containers with:

- **Security**: Non-root users, no new privileges, resource limits
- **Isolation**: Custom networks, port randomization
- **Monitoring**: Health checks, graceful shutdown
- **Auto-cleanup**: Containers removed on exit

### Container Requirements

Your Playwright MCP image should:
1. Expose an HTTP server on port 3001
2. Provide `/health` endpoint returning `{"status": "ok"}`
3. Provide `/tools` endpoint listing available MCP tools
4. Provide `/tool/{name}` POST endpoint for tool execution

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

**Container startup timeout**
```bash
# Increase timeout
CONTAINER_STARTUP_TIMEOUT_MS=60000 npm run dev
```

**Port conflicts**
```bash
# Use different port
PORT=3001 npm run dev -- --http
```

**Permission errors**
```bash
# Ensure Docker socket access
sudo usermod -aG docker $USER
```

### Debug Mode

```bash
LOG_LEVEL=debug npm run dev
```

## 🔗 Related Projects

- [Model Context Protocol](https://modelcontextprotocol.io/)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Playwright MCP Server](https://github.com/modelcontextprotocol/servers/tree/main/src/playwright)