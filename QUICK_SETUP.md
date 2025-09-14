# 🚀 Quick Setup for Claude Code

## One-Command Setup

```bash
# Get the full path to this project
PWD_PATH=$(pwd)

# Add to Claude Code (replace with your actual path)
claude mcp add playwright-orchestrator --scope user -- node ${PWD_PATH}/dist/index.js
```

## Alternative: Copy-Paste Command

**MacOS/Linux:**
```bash
claude mcp add playwright-orchestrator --scope user -- node /Users/davidjoyce/dev/playwright-mcp-orchestrator/dist/index.js
```

**Windows:**
```bash
claude mcp add playwright-orchestrator --scope user -- cmd /c node C:\path\to\mcp-playwright-orchestrator\dist\index.js
```

## Verify Setup

```bash
# List MCP servers
claude mcp list

# Test the connection
claude mcp get playwright-orchestrator
```

## After Setup

1. **Restart Claude Code**
2. **Test in chat:**
   ```
   Create a new browser instance and navigate to google.com
   ```

## What You'll Get

- ✅ **6 orchestrator management tools**
- ✅ **21 browser automation tools** per instance
- ✅ **Transparent proxy** - same responses as direct Playwright MCP
- ✅ **Multiple concurrent browser sessions**
- ✅ **Automatic Docker container management**

## Example Usage

```
Hey Claude, use the Playwright orchestrator to:
1. Create a new browser instance
2. Navigate to github.com
3. Search for "playwright"
4. Take a screenshot of the results
5. Clean up the browser instance when done
```

Claude Code will orchestrate all these steps automatically using the MCP tools! 🎭