import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";

const configPath = path.join(os.homedir(), ".gemini", "config", "mcp_config.json");

console.error("Reading Antigravity MCP configuration...");

try {
  let configData = { mcpServers: {} };
  
  if (fs.existsSync(configPath)) {
    const rawData = fs.readFileSync(configPath, "utf-8");
    configData = JSON.parse(rawData);
  } else {
    console.error("No existing configuration found. Creating a new one...");
  }

  if (!configData.mcpServers) {
    configData.mcpServers = {};
  }

  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

  const serverConfig = {
    command: "node",
    args: [
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), "index.js")
    ],
    env: {
      NODE_ENV: "production",
      MYTHICFRAME_ROOT: projectRoot
    },
    type: "stdio",
    disabled: false
  };

  configData.mcpServers["mythic-image-gen"] = serverConfig;

  fs.writeFileSync(configPath, JSON.stringify(configData, null, 2));

  console.error("Successfully added 'mythic-image-gen' to Antigravity MCP servers!");
  console.error(`Config path: ${configPath}`);
} catch (error) {
  console.error("Failed to configure Antigravity MCP servers:", error.message);
}
