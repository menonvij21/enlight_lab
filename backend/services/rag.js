/**
 * rag.js
 * Retrieval-Augmented Generation service.
 * Uses file-based vector store with OpenAI embeddings (if key provided),
 * falling back to keyword matching with no external dependencies.
 */

const fs   = require('fs');
const path = require('path');

const KNOWLEDGE_PATH   = path.join(__dirname, '..', 'data', 'knowledge-base.json');
const VECTOR_STORE_PATH = path.join(__dirname, '..', 'data', 'vector-store.json');

let documents = [];
let vectors   = [];
let isReady   = false;

// ─────────────────────────────────────────────────────────────
// Load documents and (optionally) generate embeddings
// ─────────────────────────────────────────────────────────────
async function initRAG() {
  try {
    if (fs.existsSync(KNOWLEDGE_PATH)) {
      documents = JSON.parse(fs.readFileSync(KNOWLEDGE_PATH, 'utf8'));
      console.log(`[RAG] Loaded ${documents.length} documents`);
    } else {
      console.log('[RAG] No knowledge base found — seeding defaults');
      documents = getDefaultKnowledge();
      saveKnowledgeBase();
    }

    if (fs.existsSync(VECTOR_STORE_PATH)) {
      vectors = JSON.parse(fs.readFileSync(VECTOR_STORE_PATH, 'utf8'));
      console.log(`[RAG] Loaded ${vectors.length} cached vectors`);
    } else if (process.env.OPENAI_API_KEY) {
      console.log('[RAG] Generating embeddings via OpenAI…');
      await generateEmbeddings();
    } else {
      console.log('[RAG] No OpenAI key — keyword matching will be used');
    }

    isReady = true;
  } catch (err) {
    console.error('[RAG] Init error:', err.message);
    documents = getDefaultKnowledge();
    isReady   = true;
  }
}

// ─────────────────────────────────────────────────────────────
// Retrieve top-K relevant documents for a query
// ─────────────────────────────────────────────────────────────
async function retrieveContext(query, topK = 3) {
  if (!isReady || documents.length === 0) return { context: '', sources: [] };

  try {
    let topDocs = [];

    if (process.env.OPENAI_API_KEY && vectors.length > 0) {
      const queryEmbedding = await getEmbedding(query);
      const scored = vectors.map((v, i) => ({
        index: i,
        similarity: cosineSimilarity(queryEmbedding, v.embedding),
      }));
      scored.sort((a, b) => b.similarity - a.similarity);
      topDocs = scored.slice(0, topK).map(s => documents[s.index]);
    } else {
      const words = query.toLowerCase().split(/\s+/);
      const scored = documents.map((doc, i) => {
        const text  = `${doc.title} ${doc.content}`.toLowerCase();
        const score = words.filter(w => text.includes(w)).length;
        return { index: i, score };
      });
      scored.sort((a, b) => b.score - a.score);
      topDocs = scored.slice(0, topK).map(s => documents[s.index]);
    }

    return {
      context: topDocs.map(d => `--- ${d.title} ---\n${d.content}`).join('\n\n'),
      sources: topDocs.map(d => d.title),
    };
  } catch (err) {
    console.error('[RAG] Retrieve error:', err.message);
    return { context: '', sources: [] };
  }
}

// ─────────────────────────────────────────────────────────────
// Generate and cache embeddings for all documents
// ─────────────────────────────────────────────────────────────
async function generateEmbeddings() {
  if (!process.env.OPENAI_API_KEY) return;
  vectors = [];
  for (const doc of documents) {
    const embedding = await getEmbedding(`${doc.title}. ${doc.content}`);
    vectors.push({ embedding, title: doc.title });
  }
  fs.writeFileSync(VECTOR_STORE_PATH, JSON.stringify(vectors));
  console.log(`[RAG] Saved ${vectors.length} embeddings`);
}

async function getEmbedding(text) {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: text.substring(0, 8000) }),
  });
  const data = await res.json();
  if (!data.data?.[0]) throw new Error('Embedding API returned no data');
  return data.data[0].embedding;
}

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function saveKnowledgeBase() {
  const dir = path.dirname(KNOWLEDGE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(KNOWLEDGE_PATH, JSON.stringify(documents, null, 2));
}

// ─────────────────────────────────────────────────────────────
// Default knowledge base — edit data/knowledge-base.json instead
// ─────────────────────────────────────────────────────────────
function getDefaultKnowledge() {
  return [
    { title: 'About Enlight Lab', content: 'Enlight Lab is a top-tier, remote-first IT consulting and software outsourcing company founded in 2007. We have 18+ years of expertise, 2500+ happy clients, and 100% business operations alignment. We specialize in AI agent development, web and mobile development, MVP development, DevOps consulting, and staff augmentation.' },
    { title: 'AI Agent Development', content: 'We design and deploy task-specific AI agents that automate operations, enhance support, and boost productivity. Our AI agents work like your best teammates alongside existing systems. Typical delivery: 4-6 weeks. Pricing starts at $15,000-$30,000 depending on scope. We use Retell AI for voice agents and custom LLM integrations for chat.' },
    { title: 'AI Consulting Services', content: 'From use-case discovery to workflow automation and model selection, we help you integrate AI safely that accelerates efficiency, drives growth, and delivers measurable business impact. We offer fixed-price and T&M engagement models.' },
    { title: 'Web Development', content: 'We build modern, high-performance web applications using ReactJS, NextJS, Angular, NodeJS, and Python. We also offer Claude AI development services for enterprise-grade AI solutions.' },
    { title: 'Mobile App Development', content: 'Native or cross-platform mobile apps built for performance, usability, and scale. We develop for iOS and Android.' },
    { title: 'MVP Development', content: 'Build fast, validate smarter. Launch your minimum viable product with speed and confidence in 8 weeks.' },
    { title: 'DevOps & Infrastructure', content: 'Automate CI/CD pipelines, optimize cloud infrastructure on AWS, Azure, and GCP. We also offer CTO as a Service.' },
    { title: 'Staff Augmentation', content: 'Plug in top-tier engineers on-demand. We provide ReactJS, Angular, NextJS, NodeJS, PHP, Python, WordPress, and GenAI engineers.' },
    { title: 'Pricing Models', content: 'Transparent pricing: fixed-price, T&M, or retainer. AI agent projects from $15,000-$30,000. Free 30-minute discovery call available.' },
    { title: 'Case Studies', content: 'Notable clients: Mozilla Foundation, qPress, Emblazer, Go2ANDAMAN, Homeloft, MAERSK, HUMA, Pasqal, AccessTruth, United Healthcare.' },
    { title: 'Industries', content: 'We serve Healthcare, FinTech, Technology & Startups, Education, Real Estate, E-commerce, Insurance, and Travel & Hospitality.' },
    { title: 'Contact', content: 'Remote-first, global company. Email: contact@enlightlab.com. Response within 24 hours.' },
    { title: 'Technology Stack', content: 'ReactJS, NextJS, Angular, NodeJS, Python, GenAI, AWS, Azure, GCP, iOS, Android, Docker.' },
    { title: 'Engagement Process', content: 'Assessment → Solution Design → Build Execution → Scaling & Optimization → Transition & Handover → Collaboration.' },
    { title: 'AI Demo Call', content: 'Outbound AI agent calls you at your scheduled time. Pre-briefed on your industry. Average 5-10 minutes. Interrupt anytime.' },
  ];
}

module.exports = { initRAG, retrieveContext, generateEmbeddings, isReady: () => isReady };
