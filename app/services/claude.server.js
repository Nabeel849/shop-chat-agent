import { Anthropic } from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import AppConfig from "./config.server";
import systemPrompts from "../prompts/prompts.json";

// Static knowledge base
const knowledgeBasePath = path.resolve("app/prompts/bfreshgear_knowledge_base.json");
const knowledgeBaseRaw = fs.readFileSync(knowledgeBasePath, "utf-8");
const bFreshKnowledge = JSON.parse(knowledgeBaseRaw);

// Utility: Check if the message content mentions product or customer-related keywords
function shouldLoadCSVData(messages) {
  const userMessage = messages?.[messages.length - 1]?.content?.toLowerCase() || "";
  const productKeywords = ["product", "item", "price", "inventory", "stock", "catalog"];
  const customerKeywords = ["customer", "segment", "demographic", "buyer", "user"];

  const mentionsProduct = productKeywords.some(keyword => userMessage.includes(keyword));
  const mentionsCustomer = customerKeywords.some(keyword => userMessage.includes(keyword));

  return { mentionsProduct, mentionsCustomer };
}

// Conditional CSV loading and formatting
function formatDynamicCSVContext({ mentionsProduct, mentionsCustomer }, maxItems = 5) {
  const formatObject = (obj) =>
    Object.entries(obj)
      .map(([key, val]) => `${key}: ${val}`)
      .join("\n");

  let sampleProducts = "";
  let sampleCustomers = "";

  if (mentionsProduct) {
    const productsCSVPath = path.resolve("app/prompts/products_export_1.csv");
    const productsCSVRaw = fs.readFileSync(productsCSVPath, "utf-8");
    const productsData = parse(productsCSVRaw, { columns: true, skip_empty_lines: true });
    sampleProducts = productsData.slice(0, maxItems).map(formatObject).join("\n\n");
  }

  if (mentionsCustomer) {
    const customersCSVPath = path.resolve("app/prompts/customers_export_segmented.csv");
    const customersCSVRaw = fs.readFileSync(customersCSVPath, "utf-8");
    const customersData = parse(customersCSVRaw, { columns: true, skip_empty_lines: true });
    sampleCustomers = customersData.slice(0, maxItems).map(formatObject).join("\n\n");
  }

  return `
-- B Fresh Gear Knowledge Base --
${JSON.stringify(bFreshKnowledge, null, 2)}

${sampleProducts ? `-- Sample Products (from CSV) --\n${sampleProducts}` : ""}
${sampleCustomers ? `-- Sample Customers (from CSV) --\n${sampleCustomers}` : ""}
`;
}

export function createClaudeService(apiKey = process.env.CLAUDE_API_KEY) {
  const anthropic = new Anthropic({ apiKey });

  const streamConversation = async (
    { messages, promptType = AppConfig.api.defaultPromptType },
    streamHandlers
  ) => {
    const baseSystemPrompt = getSystemPrompt(promptType);

    // Determine CSV data needs from the latest user message
    const queryType = shouldLoadCSVData(messages);
    const embeddedContext = formatDynamicCSVContext(queryType);

    const finalSystemPrompt = `${baseSystemPrompt}\n\nAdditional Brand Context:\n${embeddedContext}`;

    const stream = await anthropic.messages.stream({
      model: AppConfig.api.defaultModel,
      max_tokens: AppConfig.api.maxTokens,
      system: finalSystemPrompt,
      messages
    });

    if (streamHandlers?.onText) stream.on("text", streamHandlers.onText);
    if (streamHandlers?.onMessage) stream.on("message", streamHandlers.onMessage);

    return await stream.finalMessage();
  };

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
