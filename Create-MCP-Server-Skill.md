---
name: mcp-typescript-server
description: >
  Build production-grade MCP (Model Context Protocol) servers using the TypeScript low-level API.
  Use this skill whenever the user wants to create, scaffold, extend, or refactor an MCP server in TypeScript.
  Trigger on phrases like "MCP server", "model context protocol", "build a tool for Claude", "create an MCP",
  "add MCP tools", "MCP resource", "MCP prompt", or any request to expose APIs/data to Claude via a server.
  Always apply SOLID principles, loose coupling, and strategy/registry patterns. Avoid more than 2 if/else branches.
  ALWAYS begin by asking the user which transport they want: Stdio or HTTPS — then build only for that choice.
compatibility:
  - Node.js >= 18
  - TypeScript >= 5.0
  - "@modelcontextprotocol/sdk"
---

# MCP TypeScript Server Skill

Build MCP servers using the **low-level** TypeScript SDK (`Server` class directly), following SOLID principles, loose coupling, and clean architecture. Avoid more than 2 `if/else` branches — use maps, registries, and strategy patterns instead.

---

## Workflow — Follow These Steps in Order

```
Step 1 → Install latest MCP SDK dependencies + MCP Inspector
Step 2 → Ask user: Stdio or HTTPS?
Step 3 → Scaffold shared core (interfaces, registry, base classes, example handlers)
Step 4 → Build transport layer based ONLY on user's choice
Step 5 → Wire server entry point for chosen transport
Step 6 → Final validation — launch MCP Inspector and guide user through testing
```

### Step 1 — Install Dependencies (REQUIRED FIRST STEP)

Before asking anything or writing any code, install the latest MCP SDK and MCP Inspector:

```bash
mkdir mcp-server && cd mcp-server
npm init -y

# Install latest MCP SDK and runtime deps
npm install @modelcontextprotocol/sdk@latest zod

# Install dev tooling
npm install -D typescript @types/node tsx

# Install MCP Inspector globally for validation later
npm install -g @modelcontextprotocol/inspector@latest

# Confirm versions installed
npm list @modelcontextprotocol/sdk
npx @modelcontextprotocol/inspector --version
```

Confirm both the SDK and Inspector installed successfully before continuing. If either fails, surface the error to the user and resolve it before proceeding.

---

### Step 2 — Ask the User (REQUIRED BEFORE WRITING CODE)

**After dependencies are installed**, ask the user which transport they want:

> "Which transport would you like for your MCP server?"
> - **Stdio** — local process communication, ideal for Claude Desktop and CLI tools
> - **HTTPS** — HTTP server with SSE, ideal for remote/web-accessible MCP servers

Wait for the answer. Then proceed to Step 3 using **only** the chosen transport. Do not scaffold both.

---

## Architecture Principles

### SOLID Mapping to MCP
| Principle | Application |
|-----------|-------------|
| **S** – Single Responsibility | Each tool/resource/prompt is its own class |
| **O** – Open/Closed | Registry pattern: add handlers without modifying core |
| **L** – Liskov Substitution | All handlers implement the same interface |
| **I** – Interface Segregation | Separate interfaces for Tool, Resource, Prompt handlers |
| **D** – Dependency Inversion | Server depends on abstractions, not concrete handlers |

### Branch Reduction Strategy
- Replace `if/else` chains with **Map lookups** or **registry dispatch**
- Replace type guards with **polymorphism**
- Use **optional chaining + nullish coalescing** for fallbacks
- Max 2 `if/else` per function — use early returns or ternaries for simple guards

---

## Step 3 — Shared Core (Same for Both Transports)

### Project Structure

```
mcp-server/
├── src/
│   ├── server.ts              # Entry point — transport-specific
│   ├── registry.ts            # Central handler registry
│   ├── interfaces.ts          # Shared abstractions
│   ├── handlers.ts            # Attaches registry to MCP Server instance
│   ├── tools/
│   │   ├── base.tool.ts
│   │   └── echo.tool.ts
│   ├── resources/
│   │   ├── base.resource.ts
│   │   └── status.resource.ts
│   └── prompts/
│       ├── base.prompt.ts
│       └── summarize.prompt.ts
├── package.json
└── tsconfig.json
```

Run the TypeScript init after the npm install from Step 1:

```bash
npx tsc --init --target ES2022 --module Node16 --moduleResolution Node16 \
  --strict --outDir dist --rootDir src
```

`package.json`:
```json
{
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js"
  }
}
```

---

### `src/interfaces.ts`

```typescript
import type {
  CallToolResult,
  ReadResourceResult,
  GetPromptResult,
  Tool,
  Resource,
  Prompt,
} from "@modelcontextprotocol/sdk/types.js";

export interface ToolHandler {
  readonly definition: Tool;
  execute(args: Record<string, unknown>): Promise<CallToolResult>;
}

export interface ResourceHandler {
  readonly definition: Resource;
  read(uri: string): Promise<ReadResourceResult>;
}

export interface PromptHandler {
  readonly definition: Prompt;
  get(args: Record<string, string>): Promise<GetPromptResult>;
}
```

---

### `src/registry.ts`

```typescript
import type { ToolHandler, ResourceHandler, PromptHandler } from "./interfaces.js";

export class HandlerRegistry {
  private readonly tools = new Map<string, ToolHandler>();
  private readonly resources = new Map<string, ResourceHandler>();
  private readonly prompts = new Map<string, PromptHandler>();

  registerTool(handler: ToolHandler): this {
    this.tools.set(handler.definition.name, handler);
    return this;
  }

  registerResource(handler: ResourceHandler): this {
    this.resources.set(handler.definition.uri, handler);
    return this;
  }

  registerPrompt(handler: PromptHandler): this {
    this.prompts.set(handler.definition.name, handler);
    return this;
  }

  getTool(name: string): ToolHandler {
    const handler = this.tools.get(name);
    if (!handler) throw new Error(`Unknown tool: ${name}`);
    return handler;
  }

  getResource(uri: string): ResourceHandler {
    const handler = this.resources.get(uri);
    if (!handler) throw new Error(`Unknown resource: ${uri}`);
    return handler;
  }

  getPrompt(name: string): PromptHandler {
    const handler = this.prompts.get(name);
    if (!handler) throw new Error(`Unknown prompt: ${name}`);
    return handler;
  }

  listTools()     { return [...this.tools.values()].map(h => h.definition); }
  listResources() { return [...this.resources.values()].map(h => h.definition); }
  listPrompts()   { return [...this.prompts.values()].map(h => h.definition); }
}
```

---

### `src/handlers.ts` — Attaches Registry to MCP Server

Shared across both transports. Transport-specific code never lives here.

```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  ListResourcesRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { HandlerRegistry } from "./registry.js";

function safeHandler<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((err) => {
    throw new Error(err instanceof Error ? err.message : String(err));
  });
}

export function attachHandlers(server: Server, registry: HandlerRegistry): void {
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: registry.listTools(),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) =>
    safeHandler(() =>
      registry.getTool(req.params.name).execute(req.params.arguments ?? {})
    )
  );

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: registry.listResources(),
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (req) =>
    safeHandler(() =>
      registry.getResource(req.params.uri).read(req.params.uri)
    )
  );

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: registry.listPrompts(),
  }));

  server.setRequestHandler(GetPromptRequestSchema, async (req) =>
    safeHandler(() =>
      registry.getPrompt(req.params.name).get(req.params.arguments ?? {})
    )
  );
}
```

---

### Base Classes

#### `src/tools/base.tool.ts`
```typescript
import { z, ZodSchema } from "zod";
import type { ToolHandler } from "../interfaces.js";
import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";

export abstract class BaseTool<TArgs extends z.ZodRawShape> implements ToolHandler {
  abstract readonly definition: Tool;
  protected abstract readonly schema: ZodSchema<z.infer<z.ZodObject<TArgs>>>;
  protected abstract handle(args: z.infer<z.ZodObject<TArgs>>): Promise<CallToolResult>;

  async execute(raw: Record<string, unknown>): Promise<CallToolResult> {
    const args = this.schema.parse(raw);
    return this.handle(args);
  }

  protected text(content: string): CallToolResult {
    return { content: [{ type: "text", text: content }] };
  }

  protected error(message: string): CallToolResult {
    return { content: [{ type: "text", text: message }], isError: true };
  }
}
```

#### `src/resources/base.resource.ts`
```typescript
import type { ResourceHandler } from "../interfaces.js";
import type { ReadResourceResult, Resource } from "@modelcontextprotocol/sdk/types.js";

export abstract class BaseResource implements ResourceHandler {
  abstract readonly definition: Resource;
  abstract read(uri: string): Promise<ReadResourceResult>;

  protected textResult(uri: string, text: string): ReadResourceResult {
    return { contents: [{ uri, mimeType: "text/plain", text }] };
  }
}
```

#### `src/prompts/base.prompt.ts`
```typescript
import type { PromptHandler } from "../interfaces.js";
import type { GetPromptResult, Prompt } from "@modelcontextprotocol/sdk/types.js";

export abstract class BasePrompt implements PromptHandler {
  abstract readonly definition: Prompt;
  abstract get(args: Record<string, string>): Promise<GetPromptResult>;

  protected result(description: string, text: string): GetPromptResult {
    return {
      description,
      messages: [{ role: "user", content: { type: "text", text } }],
    };
  }
}
```

---

### Example Handlers (Same for Both Transports)

#### `src/tools/echo.tool.ts`
```typescript
import { z } from "zod";
import { BaseTool } from "./base.tool.js";

const schema = z.object({ message: z.string() });

export class EchoTool extends BaseTool<typeof schema.shape> {
  readonly definition = {
    name: "echo",
    description: "Echoes the input message back",
    inputSchema: {
      type: "object" as const,
      properties: { message: { type: "string", description: "Message to echo" } },
      required: ["message"],
    },
  };
  protected readonly schema = schema;
  protected async handle(args: z.infer<typeof schema>) {
    return this.text(`Echo: ${args.message}`);
  }
}
```

#### `src/resources/status.resource.ts`
```typescript
import { BaseResource } from "./base.resource.js";

export class StatusResource extends BaseResource {
  readonly definition = {
    uri: "status://server",
    name: "Server Status",
    description: "Returns current server health",
    mimeType: "text/plain",
  };
  async read(uri: string) {
    return this.textResult(uri, `OK — ${new Date().toISOString()}`);
  }
}
```

#### `src/prompts/summarize.prompt.ts`
```typescript
import { BasePrompt } from "./base.prompt.js";

export class SummarizePrompt extends BasePrompt {
  readonly definition = {
    name: "summarize",
    description: "Summarize a given topic",
    arguments: [{ name: "topic", description: "Topic to summarize", required: true }],
  };
  async get(args: Record<string, string>) {
    return this.result(
      "Summarization prompt",
      `Please provide a concise summary of: ${args.topic ?? "the given topic"}`
    );
  }
}
```

---

## Step 4 — Transport Layer

Build **only** the section matching the user's answer from Step 2.

---

### Option A — Stdio Transport

Best for: Claude Desktop integration, local CLI tools, subprocess communication.

No extra packages needed beyond the base install.

#### `src/server.ts` — Stdio
```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { HandlerRegistry } from "./registry.js";
import { attachHandlers } from "./handlers.js";
import { EchoTool } from "./tools/echo.tool.js";
import { StatusResource } from "./resources/status.resource.js";
import { SummarizePrompt } from "./prompts/summarize.prompt.js";

function buildRegistry(): HandlerRegistry {
  return new HandlerRegistry()
    .registerTool(new EchoTool())
    .registerResource(new StatusResource())
    .registerPrompt(new SummarizePrompt());
}

async function main(): Promise<void> {
  const registry = buildRegistry();

  const server = new Server(
    { name: "my-mcp-server", version: "1.0.0" },
    { capabilities: { tools: {}, resources: {}, prompts: {} } }
  );

  attachHandlers(server, registry);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
```

#### Step 5 — Quick Start (Stdio)
```bash
# Run in dev mode
npm run dev

# Test with MCP inspector
npx @modelcontextprotocol/inspector tsx src/server.ts
```

#### Claude Desktop Config
Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "my-mcp-server": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/dist/server.js"]
    }
  }
}
```

---

### Option B — HTTPS Transport (HTTP + SSE)

Best for: Remote servers, web-accessible MCP endpoints, multi-client scenarios.

#### Additional deps
```bash
npm install express cors
npm install -D @types/express @types/cors
```

#### `src/transport/https.transport.ts`

Isolates all Express/HTTP concerns away from `server.ts`.

```typescript
import express, { Express, Request, Response } from "express";
import cors from "cors";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";

export interface HttpsTransportConfig {
  port: number;
  corsOrigin?: string;
}

export class HttpsTransportManager {
  private readonly app: Express;
  private readonly sessions = new Map<string, SSEServerTransport>();

  constructor(private readonly config: HttpsTransportConfig) {
    this.app = express();
    this.app.use(cors({ origin: config.corsOrigin ?? "*" }));
    this.app.use(express.json());
  }

  mount(server: Server): void {
    this.app.get("/sse", async (_req: Request, res: Response) => {
      const transport = new SSEServerTransport("/messages", res);
      this.sessions.set(transport.sessionId, transport);
      res.on("close", () => this.sessions.delete(transport.sessionId));
      await server.connect(transport);
    });

    this.app.post("/messages", async (req: Request, res: Response) => {
      const sessionId = req.query.sessionId as string;
      const transport = this.sessions.get(sessionId);
      transport
        ? await transport.handlePostMessage(req, res)
        : res.status(404).json({ error: "Session not found" });
    });
  }

  listen(): void {
    this.app.listen(this.config.port, () => {
      console.log(`MCP server listening on http://localhost:${this.config.port}`);
      console.log(`SSE endpoint: http://localhost:${this.config.port}/sse`);
    });
  }
}
```

#### `src/server.ts` — HTTPS
```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { HandlerRegistry } from "./registry.js";
import { attachHandlers } from "./handlers.js";
import { HttpsTransportManager } from "./transport/https.transport.js";
import { EchoTool } from "./tools/echo.tool.js";
import { StatusResource } from "./resources/status.resource.js";
import { SummarizePrompt } from "./prompts/summarize.prompt.js";

function buildRegistry(): HandlerRegistry {
  return new HandlerRegistry()
    .registerTool(new EchoTool())
    .registerResource(new StatusResource())
    .registerPrompt(new SummarizePrompt());
}

async function main(): Promise<void> {
  const registry = buildRegistry();

  const server = new Server(
    { name: "my-mcp-server", version: "1.0.0" },
    { capabilities: { tools: {}, resources: {}, prompts: {} } }
  );

  attachHandlers(server, registry);

  const transport = new HttpsTransportManager({
    port: Number(process.env.PORT ?? 3000),
    corsOrigin: process.env.CORS_ORIGIN,
  });

  transport.mount(server);
  transport.listen();
}

main().catch(console.error);
```

#### Step 5 — Quick Start (HTTPS)
```bash
# Run in dev mode
npm run dev

# Test SSE connection
curl -N http://localhost:3000/sse

# Test with MCP inspector
npx @modelcontextprotocol/inspector --url http://localhost:3000/sse
```

#### Environment Variables
```bash
PORT=3000           # HTTP port (default: 3000)
CORS_ORIGIN=*       # Allowed CORS origin (default: *)
```

---

## Step 5 — Adding New Handlers (Open/Closed in Practice)

Regardless of transport, to add a new capability:

1. Create a file in `src/tools/`, `src/resources/`, or `src/prompts/`
2. Extend the appropriate base class
3. Register it in `buildRegistry()` in `server.ts`

**Zero changes** to registry, handlers, or transport layer.

---

## Step 6 — Final Validation with MCP Inspector (REQUIRED LAST STEP)

Once the server is built and running, guide the user through a full test using the MCP Inspector that was installed in Step 1.

### Stdio — Launch Inspector

In one terminal, build the server:
```bash
npm run build
```

In a second terminal, launch the Inspector connected to the server process:
```bash
npx @modelcontextprotocol/inspector node dist/server.js
```

The Inspector will open in the browser at `http://localhost:5173`.

### HTTPS — Launch Inspector

Start the server:
```bash
npm run dev
```

In a second terminal, point the Inspector at the SSE endpoint:
```bash
npx @modelcontextprotocol/inspector --url http://localhost:3000/sse
```

### Validation Checklist

Walk the user through each check in the Inspector UI:

```
☐ 1. Tools tab     → all registered tools appear in the list
☐ 2. Tool call     → invoke a tool (e.g. "echo") and confirm a valid response
☐ 3. Resources tab → all registered resources appear
☐ 4. Resource read → fetch a resource URI and confirm content returns
☐ 5. Prompts tab   → all registered prompts appear
☐ 6. Prompt get    → retrieve a prompt and confirm messages render correctly
☐ 7. Error case    → call a tool with invalid args and confirm a clean error response
```

Only mark the server complete when all 7 checks pass. If any check fails, diagnose and fix before proceeding.

### Troubleshooting Common Issues

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Inspector can't connect (Stdio) | Build not run | Run `npm run build` first |
| Inspector can't connect (HTTPS) | Server not started | Run `npm run dev` first |
| Tool not appearing | Not registered in `buildRegistry()` | Add `.registerTool(new YourTool())` |
| Zod parse error on tool call | Schema mismatch | Check `inputSchema` matches Zod shape |
| SSE session 404 on POST | `sessionId` not passed | Confirm Inspector sends `?sessionId=` param |

---

## Anti-Patterns to Avoid

| ❌ Avoid | ✅ Prefer |
|---------|---------|
| `if (name === 'echo') { ... } else if ...` | Map/registry lookup |
| Transport logic mixed into handlers | Isolated transport class |
| Giant switch in one file | One class per handler |
| Inline validation with manual checks | Zod schema in `BaseTool` |
| Shared mutable state across handlers | Each handler is self-contained |
| More than 2 `if/else` per function | Early return + Map dispatch |
| Scaffolding both transports speculatively | Ask first, build only what's needed |

---

## Quick Reference

| Task | Where |
|------|-------|
| Add a tool | `src/tools/` → extend `BaseTool` → register |
| Add a resource | `src/resources/` → extend `BaseResource` → register |
| Add a prompt | `src/prompts/` → extend `BasePrompt` → register |
| Change dispatch logic | `HandlerRegistry` only |
| Swap transport | Replace `server.ts` only — core untouched |
| Handle multiple SSE clients | `HttpsTransportManager.sessions` Map |
