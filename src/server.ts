import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import type { AnySchema } from '@modelcontextprotocol/sdk/server/zod-compat.js'

export interface ToolDefinition<TInput> {
  name: string
  description: string
  inputSchema: AnySchema
  handler(input: TInput): Promise<unknown>
}

export function createServer(): McpServer {
  return new McpServer({
    name: 'deadweight',
    version: '0.1.0',
  })
}

export function registerTool<TInput>(
  server: McpServer,
  tool: ToolDefinition<TInput>,
): void {
  server.registerTool(
    tool.name,
    {
      description: tool.description,
      inputSchema: tool.inputSchema,
    },
    async (args) => {
      const result = await tool.handler(args as TInput)
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      }
    },
  )
}

export async function startServer(server: McpServer): Promise<void> {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}
