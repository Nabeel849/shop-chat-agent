
module.exports = {
  name: "DJ Jazzy Jeff",
  brand: "B Fresh Gear",
  promptPath: "./knowledge-base/B_Fresh_Gear_Claude_AI_Prompt.md",
  customerCSV: "./knowledge-base/customers_export_segmented.csv",
  productCSV: "./knowledge-base/products_export_1.csv",
  defaultTone: "Chill, witty, short",
  fallbackResponse: "Yo, I’ll need your name or email to pull this off 👀",
  useVectorDB: true,
  vectorDB: {
    provider: "pinecone",
    apiKey: process.env.PINECONE_API_KEY,
    environment: process.env.PINECONE_ENVIRONMENT,
    index: process.env.PINECONE_INDEX_NAME
  }
}
