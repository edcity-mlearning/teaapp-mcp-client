import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import readline from "readline/promises";
import { ModelInteractor } from "./ModelInteractor.js";
import { MCPConnector } from "./MCPConnector.js";

export class MCPClient {
    private mcpConnector: MCPConnector;
    private modelInteractor: ModelInteractor;

    constructor() {
        this.modelInteractor = new ModelInteractor({
            model: "gpt-4o"
        });
        this.mcpConnector = new MCPConnector();
    }

    async connectToServer(serverScriptPath: string) {
        try {
            await this.mcpConnector.connectToServer(serverScriptPath);
            const tools = await this.mcpConnector.getTools();
            console.log(
                "已连接到MCP服务器，可用工具：",
                tools.map(({ function: { name } }) => name)
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

        const tools = await this.mcpConnector.getTools();

        const responseMessage = await this.modelInteractor.chat(messages, {
            tools: tools,
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
                const result = await this.mcpConnector.callTool(toolName, toolArgs);

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
        await this.mcpConnector.close();
    }
}