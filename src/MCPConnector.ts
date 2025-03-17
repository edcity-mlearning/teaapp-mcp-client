import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

export interface MCPTool {
    type: "function";
    function: {
        name: string;
        description?: string;
        parameters: any;
    };
}

export enum ConnectionType {
    LOCAL_PROCESS = "local_process",
    REMOTE_SSE = "remote_sse"
}

export interface ConnectionConfig {
    type: ConnectionType;
    // 本地连接配置
    scriptPath?: string;
    // 远程SSE连接配置
    endpoint?: string;
    apiKey?: string;
}

export class MCPConnector {
    private mcp: Client;
    private transport: any = null;
    private tools: MCPTool[] = [];

    constructor() {
        this.mcp = new Client({ name: "mcp-client-cli", version: "1.0.0" });
    }

    /**
     * 连接到MCP服务器，支持本地和远程连接
     */
    async connectToServer(config: ConnectionConfig | string): Promise<void> {
        try {
            // 处理向后兼容：如果传入的是字符串，视为本地脚本路径
            if (typeof config === 'string') {
                config = {
                    type: ConnectionType.LOCAL_PROCESS,
                    scriptPath: config
                };
            }

            switch (config.type) {
                case ConnectionType.LOCAL_PROCESS:
                    await this.connectToLocalServer(config.scriptPath!);
                    break;

                case ConnectionType.REMOTE_SSE:
                    await this.connectToRemoteServer(config.endpoint!, config.apiKey);
                    break;

                default:
                    throw new Error(`不支持的连接类型: ${config.type}`);
            }

            await this.refreshTools();
        } catch (e) {
            console.log("连接到MCP服务器失败: ", e);
            throw e;
        }
    }

    /**
     * 连接到本地MCP服务器
     */
    private async connectToLocalServer(scriptPath: string): Promise<void> {
        const isJs = scriptPath.endsWith(".js");
        const isPy = scriptPath.endsWith(".py");
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
            args: [scriptPath],
        });
        await this.mcp.connect(this.transport);
    }

    /**
     * 连接到远程MCP服务器 (通过SSE)
     */
    private async connectToRemoteServer(endpoint: string, apiKey?: string): Promise<void> {
        // 创建URL对象
        const url = new URL(endpoint);

        // 如果有API密钥，将其添加为URL查询参数
        // 注意：真实环境中应尽量避免在URL中传递敏感信息
        if (apiKey) {
            url.searchParams.append('api_key', apiKey);
        }

        // 只使用URL参数初始化SSE传输
        this.transport = new SSEClientTransport(url);
        await this.mcp.connect(this.transport);
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
                    description: tool.description,
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
        } else if (result.content && typeof result.content === 'object') {
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