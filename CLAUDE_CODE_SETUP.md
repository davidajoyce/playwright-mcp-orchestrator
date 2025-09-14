# Claude Code Setup Guide - Playwright MCP Orchestrator

## 🚀 Quick Setup (Recommended)

Add the orchestrator to Claude Code with a single command:

```bash
claude mcp add playwright-orchestrator --scope user -- node /path/to/your/mcp-playwright-orchestrator/dist/index.js
```

**Replace `/path/to/your/` with the actual path to this project directory.**

## 📋 Step-by-Step Setup

### 1. **Prepare the Orchestrator**

```bash
# Build the orchestrator
npm run build

# Verify it's executable
./dist/index.js --help
```

### 2. **Add to Claude Code**

**Option A: Using Claude Code CLI (Recommended)**
```bash
claude mcp add playwright-orchestrator \
  --scope user \
  -- node /Users/your-username/path/to/mcp-playwright-orchestrator/dist/index.js
```

**Option B: Manual Configuration**
Edit your Claude Code config file (`~/.claude.json`):

```json
{
  "mcpServers": {
    "playwright-orchestrator": {
      "command": "node",
      "args": ["/path/to/mcp-playwright-orchestrator/dist/index.js"]
    }
  }
}
```

### 3. **Verify Setup**

```bash
# List configured MCP servers
claude mcp list

# Test the orchestrator
claude mcp get playwright-orchestrator
```

### 4. **Restart Claude Code**

After adding the server, restart Claude Code for changes to take effect.

## 🎯 What You Get

Once set up, Claude Code will have access to these orchestrator tools:

### 🔧 **Core Tools**

1. **`new_browser`** - Create new Playwright Docker instances
   ```json
   {
     "name": "test-browser",
     "image": "mcr.microsoft.com/playwright/mcp"
   }
   ```

2. **`list_tools`** - Get available browser tools from an instance
   ```json
   {
     "instanceId": "uuid-here"
   }
   ```

3. **`call_tool`** - Execute browser tools (TRANSPARENT PROXY)
   ```json
   {
     "instanceId": "uuid-here",
     "tool": "browser_navigate",
     "args": {"url": "https://example.com"}
   }
   ```

4. **`stop_browser`** - Clean up instances
   ```json
   {
     "instanceId": "uuid-here"
   }
   ```

### 🎭 **Browser Tools Available** (via call_tool)

Once you create a browser instance, you get access to **21 Playwright tools**:

- `browser_navigate` - Navigate to URLs
- `browser_snapshot` - Take accessibility snapshots
- `browser_click` - Click elements
- `browser_type` - Type text
- `browser_fill_form` - Fill forms
- `browser_resize` - Resize browser
- `browser_screenshot` - Take screenshots
- `browser_evaluate` - Run JavaScript
- `browser_console_messages` - Get console logs
- ...and 12 more browser automation tools

## 💬 Usage Examples in Claude Code

### **Create a Browser Instance**
```
Create a new browser instance for testing
```

Claude Code will call:
```json
{
  "tool": "new_browser",
  "args": {"name": "test-session"}
}
```

### **Navigate and Take Screenshot**
```
Navigate to google.com and take a screenshot
```

Claude Code will:
1. Call `list_tools` to get available tools
2. Call `call_tool` with `browser_navigate`
3. Call `call_tool` with `browser_screenshot`

### **Advanced Automation**
```
Go to github.com, search for "playwright", and click the first result
```

Claude Code will orchestrate multiple tool calls automatically.

## 🔧 Advanced Configuration

### **Environment Variables**
```bash
# Set Docker configuration
export DOCKER_HOST=unix:///var/run/docker.sock

# Add to Claude Code with env vars
claude mcp add playwright-orchestrator \
  --env DOCKER_HOST=unix:///var/run/docker.sock \
  --scope user \
  -- node /path/to/dist/index.js
```

### **Custom Docker Images**
The orchestrator supports different Playwright Docker images:
- `mcr.microsoft.com/playwright/mcp` (default)
- `mcp/playwright`
- Custom images with Playwright MCP

### **Multiple Instances**
The orchestrator can manage multiple browser instances simultaneously:
```json
{
  "name": "session-1",
  "image": "mcr.microsoft.com/playwright/mcp"
}
```

## 🐛 Troubleshooting

### **Common Issues**

1. **"Command not found"**
   ```bash
   # Verify path is correct
   ls -la /path/to/mcp-playwright-orchestrator/dist/index.js

   # Check permissions
   chmod +x dist/index.js
   ```

2. **Docker connection errors**
   ```bash
   # Verify Docker is running
   docker ps

   # Check Docker permissions
   docker run hello-world
   ```

3. **Port conflicts**
   - The orchestrator auto-assigns ports (30000-50000 range)
   - No manual port configuration needed

### **Debug Mode**
```bash
# Run orchestrator directly to see logs
node dist/index.js
```

### **Verify MCP Communication**
```bash
# Test the orchestrator independently
node test-orchestrator.js
```

## 🎯 What Makes This Special

### **Transparent Proxy Architecture**
- ✅ **Direct responses** - No wrapper objects
- ✅ **Real Playwright tools** - All 21 tools from containers
- ✅ **Fast communication** - STDIO-based, no HTTP hanging
- ✅ **Container management** - Automatic lifecycle handling

### **Production Ready**
- ✅ **Error handling** - Graceful failures and cleanup
- ✅ **Resource management** - Automatic container cleanup
- ✅ **Performance** - Tool calls in 200-1000ms
- ✅ **Scalability** - Multiple concurrent instances

Now Claude Code can orchestrate multiple Playwright browser instances seamlessly! 🎭✨