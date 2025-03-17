import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import readline from "readline/promises";
import { ModelInteractor } from "./ModelInteractor.js";

export class MCPClient {
    private mcp: Client;
    private modelInteractor: ModelInteractor;
    private transport: StdioClientTransport | null = null;
    private tools: any[] = [];

    constructor() {
        this.modelInteractor = new ModelInteractor({
            model: "gpt-4o"
        });
        this.mcp = new Client({ name: "mcp-client-cli", version: "1.0.0" });
    }

    async connectToServer(serverScriptPath: string) {
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
            console.log(
                "已连接到MCP服务器，可用工具：",
                this.tools.map(({ function: { name } }) => name)
            );
        } catch (e) {
            console.log("连接到MCP服务器失败: ", e);
            throw e;
        }
    }

    async processQuery(query: string) {
        const messages: ChatCompletionMessageParam[] = [
            {
                role: "user",
                content: query,
            },
        ];

        const responseMessage = await this.modelInteractor.chat(messages, {
            tools: this.tools,
            tool_choice: "auto"
        });

        const finalText = [];

        if (responseMessage.content) {
            finalText.push(responseMessage.content);
        }

        // 处理工具调用
        if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
            for (const toolCall of responseMessage.tool_calls) {
                const toolName = toolCall.function.name;
                const toolArgs = JSON.parse(toolCall.function.arguments);

                finalText.push(
                    `[调用工具 ${toolName}，参数: ${JSON.stringify(toolArgs)}]`
                );

                // 调用MCP工具
                const result = await this.mcp.callTool({
                    name: toolName,
                    arguments: toolArgs,
                });

                // 将工具结果发送回模型
                messages.push(responseMessage as ChatCompletionMessageParam);
                messages.push({
                    role: "tool",
                    tool_call_id: toolCall.id,
                    name: toolName,
                    content: result.content as string,
                } as ChatCompletionMessageParam);

                // 获取最终响应
                const finalResponse = await this.modelInteractor.chat(messages);

                if (finalResponse.content) {
                    finalText.push(finalResponse.content);
                }
            }
        }

        return finalText.join("\n");
    }

    async chatLoop() {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        try {
            console.log("\nMCP 客户端已启动！");
            console.log("输入您的问题，或者输入 'quit' 退出。");

            while (true) {
                const message = await rl.question("\n问题: ");
                if (message.toLowerCase() === "quit") {
                    break;
                }
                const response = await this.processQuery(message);
                console.log("\n" + response);
            }
        } finally {
            rl.close();
        }
    }

    async cleanup() {
        await this.mcp.close();
    }
}