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

// Load static knowledge base
const knowledgeBasePath = path.resolve("app/prompts/bfreshgear_knowledge_base.json");
const knowledgeBaseRaw = fs.readFileSync(knowledgeBasePath, "utf-8");
const bFreshKnowledge = JSON.parse(knowledgeBaseRaw);

// Load and parse products CSV
const productsCSVPath = path.resolve("app/prompts/products_export_1.csv");
const productsCSVRaw = fs.readFileSync(productsCSVPath, "utf-8");
const productsData = parse(productsCSVRaw, {
  columns: true,
  skip_empty_lines: true
});

// Load and parse customers CSV
const customersCSVPath = path.resolve("app/prompts/customers_export_segmented.csv");
const customersCSVRaw = fs.readFileSync(customersCSVPath, "utf-8");
const customersData = parse(customersCSVRaw, {
  columns: true,
  skip_empty_lines: true
});

// Utility: Format sample product & customer info into readable strings
function formatCSVContext(maxItems = 5) {
  const formatObject = (obj) =>
    Object.entries(obj)
      .map(([key, val]) => `${key}: ${val}`)
      .join("\n");

  const sampleProducts = productsData.slice(0, maxItems).map(formatObject).join("\n\n");
  const sampleCustomers = customersData.slice(0, maxItems).map(formatObject).join("\n\n");

  return `
-- B Fresh Gear Knowledge Base --
${JSON.stringify(bFreshKnowledge, null, 2)}

-- Sample Products (from CSV) --
${sampleProducts}

-- Sample Customers (from CSV) --
${sampleCustomers}
`;
}

/**
 * Creates a Claude service instance
 * @param {string} apiKey - Claude API key
 * @returns {Object} Claude service with methods for interacting with Claude API
 */
export function createClaudeService(apiKey = process.env.CLAUDE_API_KEY) {
  const anthropic = new Anthropic({ apiKey });

  /**
   * Streams a conversation with Claude
   * @param {Object} params - Stream parameters
   * @param {Array} params.messages - User/assistant messages
   * @param {string} params.promptType - Prompt type to select system message
   * @param {Object} streamHandlers - Stream event handlers
   * @returns {Promise<Object>} Final Claude message
   */
  const streamConversation = async (
    { messages, promptType = AppConfig.api.defaultPromptType },
    streamHandlers
  ) => {
    const baseSystemPrompt = getSystemPrompt(promptType);
    const embeddedContext = formatCSVContext();
    const finalSystemPrompt = `${baseSystemPrompt}\n\nAdditional Brand Context:\n${embeddedContext}`;

    const stream = await anthropic.messages.stream({
      model: AppConfig.api.defaultModel,
      max_tokens: AppConfig.api.maxTokens,
      system: finalSystemPrompt,
      messages
    });

    if (streamHandlers?.onText) {
      stream.on("text", streamHandlers.onText);
    }

    if (streamHandlers?.onMessage) {
      stream.on("message", streamHandlers.onMessage);
    }

    return await stream.finalMessage();
  };

  /**
   * Retrieves the base system prompt
   * @param {string} promptType
   * @returns {string}
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
