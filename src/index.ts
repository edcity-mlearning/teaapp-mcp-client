import { MCPClient } from "./MCPClient.js";

async function main() {
    if (process.argv.length < 3) {
        console.log("用法: node index.ts <服务器脚本路径>");
        return;
    }
    const mcpClient = new MCPClient();
    try {
        await mcpClient.connectToServer(process.argv[2]);
        await mcpClient.chatLoop();
    } finally {
        await mcpClient.cleanup();
        process.exit(0);
    }
}

main();