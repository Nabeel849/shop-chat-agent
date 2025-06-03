import { Anthropic } from "@anthropic-ai/sdk";
import fs from "fs";
import { parse } from "csv-parse/sync";
import AppConfig from "../config.server.js";
import systemPrompts from "../prompts/prompts.json" assert { type: "json" };
import { fileURLToPath } from "url";
import path from "path";

// Get current filename and directory in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths relative to app/services/ --> go up one, then into prompts/
const knowledgeBasePath = path.resolve(__dirname, "../prompts/bfreshgear_knowledge_base.json");
const productsCSVPath = path.resolve(__dirname, "../prompts/products_export_1.csv");
const customersCSVPath = path.resolve(__dirname, "../prompts/customers_export_segmented.csv");

// Read and parse files
const knowledgeBaseRaw = fs.readFileSync(knowledgeBasePath, "utf-8");
const breshgearKnowledgeBase = JSON.parse(knowledgeBaseRaw);

const productsCSVRaw = fs.readFileSync(productsCSVPath, "utf-8");
const productsData = parse(productsCSVRaw, {
  columns: true,
  skip_empty_lines: true,
});

const customersCSVRaw = fs.readFileSync(customersCSVPath, "utf-8");
const customersData = parse(customersCSVRaw, {
  columns: true,
  skip_empty_lines: true,
});

// Claude service factory
export function createClaudeService(apiKey = process.env.CLAUDE_API_KEY) {
  const anthropic = new Anthropic({ apiKey });

  const streamConversation = async (
    {
      messages,
      promptType = AppConfig.api.defaultPromptType,
      tools = [],
    },
    streamHandlers
  ) => {
    const systemInstruction = getSystemPrompt(promptType);

    const enhancedTools = [
      ...tools,
      {
        name: "bfreshgear_knowledge_base",
        description: "Knowledge base for B Fresh Gear brand, products, and policies.",
        content: JSON.stringify(breshgearKnowledgeBase),
      },
      {
        name: "products_data",
        description: "CSV data for products export from B Fresh Gear store.",
        content: JSON.stringify(productsData),
      },
      {
        name: "customers_segmented_data",
        description: "CSV data for segmented customers from B Fresh Gear store.",
        content: JSON.stringify(customersData),
      },
    ];

    const stream = await anthropic.messages.stream({
      model: AppConfig.api.defaultModel,
      max_tokens: AppConfig.api.maxTokens,
      system: systemInstruction,
      messages,
      tools: enhancedTools.length > 0 ? enhancedTools : undefined,
    });

    if (streamHandlers.onText) {
      stream.on("text", streamHandlers.onText);
    }

    if (streamHandlers.onMessage) {
      stream.on("message", streamHandlers.onMessage);
    }

    const finalMessage = await stream.finalMessage();

    if (streamHandlers.onToolUse && finalMessage.content) {
      for (const content of finalMessage.content) {
        if (content.type === "tool_use") {
          await streamHandlers.onToolUse(content);
        }
      }
    }

    return finalMessage;
  };

  const getSystemPrompt = (promptType) => {
    return (
      systemPrompts.systemPrompts[promptType]?.content ||
      systemPrompts.systemPrompts[AppConfig.api.defaultPromptType].content
    );
  };

  return {
    streamConversation,
    getSystemPrompt,
  };
}

export default {
  createClaudeService,
};
