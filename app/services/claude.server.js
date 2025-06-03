/**
 * Claude Service
 * Manages interactions with the Claude API
 */
import { Anthropic } from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import AppConfig from "./config.server";
import systemPrompts from "../prompts/prompts.json";

// Load B Fresh Gear knowledge base JSON
const knowledgeBasePath = path.resolve("../knowledge-base/breshgear_knowledge_base.json");
const knowledgeBaseRaw = fs.readFileSync(knowledgeBasePath, "utf-8");
const breshgearKnowledgeBase = JSON.parse(knowledgeBaseRaw);

// Load and parse products_export_1.csv
const productsCSVPath = path.resolve("../knowledge-base/products_export_1.csv");
const productsCSVRaw = fs.readFileSync(productsCSVPath, "utf-8");
const productsData = parse(productsCSVRaw, {
  columns: true,
  skip_empty_lines: true
});

// Load and parse customers_export_segmented.csv
const customersCSVPath = path.resolve("../knowledge-base/customers_export_segmented.csv");
const customersCSVRaw = fs.readFileSync(customersCSVPath, "utf-8");
const customersData = parse(customersCSVRaw, {
  columns: true,
  skip_empty_lines: true
});

/**
 * Creates a Claude service instance
 * @param {string} apiKey - Claude API key
 * @returns {Object} Claude service with methods for interacting with Claude API
 */
export function createClaudeService(apiKey = process.env.CLAUDE_API_KEY) {
  // Initialize Claude client
  const anthropic = new Anthropic({ apiKey });

  /**
   * Streams a conversation with Claude
   * @param {Object} params - Stream parameters
   * @param {Array} params.messages - Conversation history
   * @param {string} params.promptType - The type of system prompt to use
   * @param {Array} params.tools - Available tools for Claude
   * @param {Object} streamHandlers - Stream event handlers
   * @param {Function} streamHandlers.onText - Handles text chunks
   * @param {Function} streamHandlers.onMessage - Handles complete messages
   * @param {Function} streamHandlers.onToolUse - Handles tool use requests
   * @returns {Promise<Object>} The final message
   */
  const streamConversation = async ({
    messages,
    promptType = AppConfig.api.defaultPromptType,
    tools = []
  }, streamHandlers) => {
    // Get system prompt from configuration or use default
    const systemInstruction = getSystemPrompt(promptType);

    // Inject B Fresh Gear knowledge base and CSV data as extra context or tools
    // You can customize this embedding depending on your system needs
    const enhancedTools = [
      ...tools,
      {
        name: "breshgear_knowledge_base",
        description: "Knowledge base for B Fresh Gear brand, products, and policies.",
        content: JSON.stringify(breshgearKnowledgeBase)
      },
      {
        name: "products_data",
        description: "CSV data for products export from B Fresh Gear store.",
        content: JSON.stringify(productsData)
      },
      {
        name: "customers_segmented_data",
        description: "CSV data for segmented customers from B Fresh Gear store.",
        content: JSON.stringify(customersData)
      }
    ];

    // Create stream
    const stream = await anthropic.messages.stream({
      model: AppConfig.api.defaultModel,
      max_tokens: AppConfig.api.maxTokens,
      system: systemInstruction,
      messages,
      tools: enhancedTools.length > 0 ? enhancedTools : undefined
    });

    // Set up event handlers
    if (streamHandlers.onText) {
      stream.on("text", streamHandlers.onText);
    }

    if (streamHandlers.onMessage) {
      stream.on("message", streamHandlers.onMessage);
    }

    // Wait for final message
    const finalMessage = await stream.finalMessage();

    // Process tool use requests
    if (streamHandlers.onToolUse && finalMessage.content) {
      for (const content of finalMessage.content) {
        if (content.type === "tool_use") {
          await streamHandlers.onToolUse(content);
        }
      }
    }

    return finalMessage;
  };

  /**
   * Gets the system prompt content for a given prompt type
   * @param {string} promptType - The prompt type to retrieve
   * @returns {string} The system prompt content
   */
  const getSystemPrompt = (promptType) => {
    return (
      systemPrompts.systemPrompts[promptType]?.content ||
      systemPrompts.systemPrompts[AppConfig.api.defaultPromptType].content
    );
  };

  return {
    streamConversation,
    getSystemPrompt
  };
}

export default {
  createClaudeService
};
