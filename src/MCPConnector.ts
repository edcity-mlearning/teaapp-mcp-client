import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export interface MCPTool {
    type: "function";
    function: {
        name: string;
        description?: string; // 可选
        parameters: any;
    };
}

export class MCPConnector {
    private mcp: Client;
    private transport: StdioClientTransport | null = null;
    private tools: MCPTool[] = [];

    constructor() {
        this.mcp = new Client({ name: "mcp-client-cli", version: "1.0.0" });
    }

    async connectToServer(serverScriptPath: string): Promise<void> {
        try {
            const isJs = serverScriptPath.endsWith(".js");
            const isPy = serverScriptPath.endsWith(".py");
            if (!isJs && !isPy) {
                throw new Error("Server script must be a .js or .py file");
            }
            const command = isPy
                ? process.platform === "win32"
                    ? "python"
                    : "python3"
                : process.execPath;

            this.transport = new StdioClientTransport({
                command,
                args: [serverScriptPath],
            });
            this.mcp.connect(this.transport);

            await this.refreshTools();
        } catch (e) {
            console.log("连接到MCP服务器失败: ", e);
            throw e;
        }
    }

    async getTools(): Promise<MCPTool[]> {
        return this.tools;
    }

    async refreshTools(): Promise<void> {
        const toolsResult = await this.mcp.listTools();
        this.tools = toolsResult.tools.map((tool) => {
            return {
                type: "function",
                function: {
                    name: tool.name,
                    description: tool.description, // 可能为undefined
                    parameters: tool.inputSchema,
                }
            };
        });
    }

    async callTool(toolName: string, toolArgs: any): Promise<{ content: string }> {
        const result = await this.mcp.callTool({
            name: toolName,
            arguments: toolArgs,
        });

        // 处理复杂返回类型，确保返回 { content: string }
        if (typeof result.content === 'string') {
            return result as { content: string };
        } else if (Array.isArray(result.content)) {
            // 简化处理: 如果是数组，转为字符串
            return { content: JSON.stringify(result.content) };
        } else {
            // 返回空字符串作为默认值
            return { content: '' };
        }
    }

    async close(): Promise<void> {
        await this.mcp.close();
    }
}