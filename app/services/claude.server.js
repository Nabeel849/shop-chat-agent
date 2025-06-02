import { Anthropic } from "@anthropic-ai/sdk";
import AppConfig from "./config.server";
import systemPrompts from "../prompts/prompts.json";
import fs from "fs/promises";
import path from "path";
import { parse as csvParse } from "csv-parse/sync";

/**
 * Reads the knowledge base markdown content from file.
 * @returns {Promise<string>}
 */
async function loadKnowledgeBaseMarkdown() {
  const kbPath = path.resolve(process.cwd(), "../../data/knowedge-base/B_Fresh_Gear_Claude_AI_Prompt.md");
  try {
    const mdContent = await fs.readFile(kbPath, "utf-8");
    return mdContent;
  } catch (err) {
    console.error("Error loading knowledge base markdown:", err);
    return "";
  }
}

/**
 * Reads and parses CSV files to create context text.
 * @param {string[]} csvFilePaths 
 * @returns {Promise<string>}
 */
async function loadAndFormatCSVContext(csvFilePaths = []) {
  let combinedContext = "";

  for (const filePath of csvFilePaths) {
    try {
      const absPath = path.resolve(process.cwd(), filePath);
      const csvRaw = await fs.readFile(absPath, "utf-8");
      const records = csvParse(csvRaw, { columns: true });

      combinedContext += `\n\nData from ${path.basename(filePath)}:\n`;

      records.forEach((row, i) => {
        combinedContext += `\n- Entry ${i + 1}:\n`;
        for (const [key, value] of Object.entries(row)) {
          combinedContext += `  - ${key}: ${value}\n`;
        }
      });
    } catch (err) {
      console.error(`Error reading/parsing CSV file ${filePath}:`, err);
    }
  }

  return combinedContext;
}

/**
 * Creates Claude service instance.
 * @param {string} apiKey 
 * @returns {Object}
 */
export function createClaudeService(apiKey = process.env.CLAUDE_API_KEY) {
  const anthropic = new Anthropic({ apiKey });

  /**
   * Get the system prompt content for a given prompt type
   * Inject knowledge base markdown and CSV context if needed
   * @param {string} promptType 
   * @param {string[]} csvFiles 
   * @returns {Promise<string>}
   */
  const getSystemPrompt = async (promptType, csvFiles = []) => {
    let basePrompt = systemPrompts.systemPrompts[promptType]?.content || 
      systemPrompts.systemPrompts[AppConfig.api.defaultPromptType].content;

    if (promptType === "knowledgeBaseAssistant") {
      const kbMd = await loadKnowledgeBaseMarkdown();
      basePrompt = kbMd || basePrompt;

      if (csvFiles.length === 0) {
        // Default CSV files if none specified
        csvFiles = [
          "../../data/knowedge-base/customers_export_segmented.csv",
          "../../data/knowedge-base/products_export_1.csv"
        ];
      }

      const csvContext = await loadAndFormatCSVContext(csvFiles);
      basePrompt += `\n\n---\n\nAdditional context from CSV data:${csvContext}`;
    }

    return basePrompt;
  };

  /**
   * Stream conversation with Claude
   * @param {Object} params 
   * @param {Array} params.messages
   * @param {string} params.promptType
   * @param {Array} params.tools
   * @param {string[]} params.csvFiles
   * @param {Object} streamHandlers
   * @returns {Promise<Object>}
   */
  const streamConversation = async ({
    messages,
    promptType = AppConfig.api.defaultPromptType,
    tools,
    csvFiles = []
  }, streamHandlers) => {
    const systemInstruction = await getSystemPrompt(promptType, csvFiles);

    const stream = await anthropic.messages.stream({
      model: AppConfig.api.defaultModel,
      max_tokens: AppConfig.api.maxTokens,
      system: systemInstruction,
      messages,
      tools: tools && tools.length > 0 ? tools : undefined,
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

  return {
    streamConversation,
    getSystemPrompt,
  };
}

export default {
  createClaudeService,
};
