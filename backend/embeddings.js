require('dotenv').config();
const { generateEmbeddings } = require('./services/rag');

async function main() {
  console.log('Regenerating RAG embeddings...');
  await generateEmbeddings();
  console.log('Done! Restart the server to use new embeddings.');
}

main().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});