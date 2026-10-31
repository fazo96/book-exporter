import "server-only";
import { bookTools } from "./book";
import { type Tool, type ToolContext, ToolError, type ToolOutput } from "./core";
import { previewTools } from "./preview";

// Everything Construct can do, and nothing more. The agent's own file, shell
// and web tools are switched off; these are served to it over MCP (see
// ../mcp.ts). The manuscript is read-only by construction: no tool here
// writes it. What they write is the book's settings, matter, custom files and
// Notes, through lib/store.ts, and its exports. Each tool's schema is also
// what its arguments are checked against (core.ts).

export type { ToolContext } from "./core";

const TOOLS: Tool[] = [...bookTools, ...previewTools];

/** As the agent sees them. */
export function listTools() {
  return TOOLS.map(({ name, description, inputSchema, readOnly }) => ({
    name,
    description,
    inputSchema,
    annotations: { readOnlyHint: readOnly, destructiveHint: false },
  }));
}

export type ToolResult = ToolOutput & { isError: boolean };

export async function callTool(name: string, args: unknown, ctx: ToolContext): Promise<ToolResult> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { text: `Unknown tool "${name}".`, isError: true };
  const input = args && typeof args === "object" && !Array.isArray(args) ? (args as Record<string, unknown>) : {};
  try {
    const out = await tool.run(input, ctx);
    return { ...(typeof out === "string" ? { text: out } : out), isError: false };
  } catch (err) {
    if (err instanceof ToolError) return { text: err.message, isError: true };
    console.error(`construct tool ${name} failed`, err);
    return { text: "Something went wrong on book-exporter's side.", isError: true };
  }
}
