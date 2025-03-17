import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import dotenv from "dotenv";

// 加载环境变量
dotenv.config();

export interface ModelConfig {
    apiKey?: string; // 现在是可选的
    model: string;
}

export class ModelInteractor {
    private openai: OpenAI;
    private model: string;

    constructor(config: ModelConfig) {
        // 使用提供的API密钥或从环境变量中获取
        const apiKey = config.apiKey || process.env.OPENAI_API_KEY;

        if (!apiKey) {
            throw new Error("OPENAI_API_KEY未在环境变量或构造函数中设置");
        }

        this.openai = new OpenAI({
            apiKey: apiKey,
        });
        this.model = config.model;
    }

    /**
     * 发送消息到模型并获取回复
     * @param messages 发送给模型的消息
     * @param options 其他选项，如工具等
     * @returns 模型的回复
     */
    async chat(
        messages: ChatCompletionMessageParam[],
        options: {
            tools?: any[];
            tool_choice?: "none" | "auto" | { type: "function"; function: { name: string } };
            temperature?: number;
            max_tokens?: number;
        } = {}
    ) {
        const response = await this.openai.chat.completions.create({
            model: this.model,
            messages,
            ...options
        });

        return response.choices[0].message;
    }
}