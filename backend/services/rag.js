/**
 * RAG (Retrieval-Augmented Generation) Service
 * Simple file-based vector store using OpenAI embeddings
 * No external database needed — works immediately
 */

const fs = require('fs');
const path = require('path');

const KNOWLEDGE_PATH = path.join(__dirname, '..', 'data', 'knowledge-base.json');
const VECTOR_STORE_PATH = path.join(__dirname, '..', 'data', 'vector-store.json');

let documents = [];
let vectors = [];
let isReady = false;

/**
 * Load and index all knowledge documents
 */
async function initRAG() {
  try {
    // Load knowledge base
    if (fs.existsSync(KNOWLEDGE_PATH)) {
      const raw = fs.readFileSync(KNOWLEDGE_PATH, 'utf8');
      documents = JSON.parse(raw);
      console.log(`[RAG] Loaded ${documents.length} documents`);
    } else {
      console.log('[RAG] No knowledge base found — using default prompts');
      documents = getDefaultKnowledge();
      saveKnowledgeBase();
    }

    // Load or generate embeddings
    if (fs.existsSync(VECTOR_STORE_PATH)) {
      const raw = fs.readFileSync(VECTOR_STORE_PATH, 'utf8');
      vectors = JSON.parse(raw);
      console.log(`[RAG] Loaded ${vectors.length} vectors from cache`);
      isReady = true;
    } else if (process.env.OPENAI_API_KEY) {
      console.log('[RAG] Generating embeddings...');
      await generateEmbeddings();
      isReady = true;
    } else {
      console.log('[RAG] No OpenAI key — using keyword matching instead');
      isReady = true;
    }
  } catch (err) {
    console.error('[RAG] Init error:', err.message);
    documents = getDefaultKnowledge();
    isReady = true;
  }
}

/**
 * Retrieve relevant context for a query
 */
async function retrieveContext(query, topK = 3) {
  if (!isReady || documents.length === 0) {
    return { context: '', sources: [] };
  }

  try {
    let topDocs = [];

    if (process.env.OPENAI_API_KEY && vectors.length > 0) {
      // Semantic search with embeddings
      const queryEmbedding = await getEmbedding(query);
      const similarities = vectors.map((v, i) => ({
        index: i,
        similarity: cosineSimilarity(queryEmbedding, v.embedding),
      }));
      similarities.sort((a, b) => b.similarity - a.similarity);
      topDocs = similarities.slice(0, topK).map(s => documents[s.index]);
    } else {
      // Fallback: keyword matching
      const queryWords = query.toLowerCase().split(/\s+/);
      const scored = documents.map((doc, i) => {
        const text = (doc.title + ' ' + doc.content).toLowerCase();
        const score = queryWords.filter(w => text.includes(w)).length;
        return { index: i, score };
      });
      scored.sort((a, b) => b.score - a.score);
      topDocs = scored.slice(0, topK).map(s => documents[s.index]);
    }

    const context = topDocs.map(d => `--- ${d.title} ---\n${d.content}`).join('\n\n');
    const sources = topDocs.map(d => d.title);

    return { context, sources };
  } catch (err) {
    console.error('[RAG] Retrieve error:', err.message);
    return { context: '', sources: [] };
  }
}

/**
 * Generate embeddings via OpenAI
 */
async function generateEmbeddings() {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) return;

  vectors = [];
  for (const doc of documents) {
    const text = `${doc.title}. ${doc.content}`;
    const embedding = await getEmbedding(text);
    vectors.push({ embedding, title: doc.title });
  }

  fs.writeFileSync(VECTOR_STORE_PATH, JSON.stringify(vectors));
  console.log(`[RAG] Saved ${vectors.length} embeddings`);
}

/**
 * Get embedding for a single text
 */
async function getEmbedding(text) {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text.substring(0, 8000),
    }),
  });
  const data = await res.json();
  if (!data.data || !data.data[0]) throw new Error('Embedding failed');
  return data.data[0].embedding;
}

/**
 * Cosine similarity between two vectors
 */
function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Default knowledge base (replace with your real content)
 */
function getDefaultKnowledge() {
  return [
    {
      title: 'About Enlight Lab',
      content: 'Enlight Lab is a top-tier, remote-first IT consulting and software outsourcing company founded in 2007. We have 18+ years of expertise, 2500+ happy clients, and 100% business operations alignment. We specialize in AI agent development, web and mobile development, MVP development, DevOps consulting, and staff augmentation.',
    },
    {
      title: 'AI Agent Development',
      content: 'We design and deploy task-specific AI agents that automate operations, enhance support, and boost productivity. Our AI agents work like your best teammates alongside existing systems. Typical delivery: 4-6 weeks. Pricing starts at $15,000-$30,000 depending on scope. We use Retell AI for voice agents and custom LLM integrations for chat.',
    },
    {
      title: 'AI Consulting Services',
      content: 'From use-case discovery to workflow automation and model selection, we help you integrate AI safely that accelerates efficiency, drives growth, and delivers measurable business impact. We offer fixed-price and T&M (Time & Material) engagement models.',
    },
    {
      title: 'Web Development',
      content: 'We build modern, high-performance web applications using ReactJS, NextJS, Angular, NodeJS, and Python. Our web apps are built for scale, SEO, and performance. We also offer Claude AI development services for enterprise-grade AI solutions.',
    },
    {
      title: 'Mobile App Development',
      content: 'Native or cross-platform mobile apps built for performance, usability, and scale. We develop for iOS and Android using the latest frameworks and technologies.',
    },
    {
      title: 'MVP Development',
      content: 'Build fast, validate smarter. Launch your minimum viable product with speed and confidence in 8 weeks. We help startups go from concept to fully working MVP rapidly.',
    },
    {
      title: 'DevOps & Infrastructure',
      content: 'Automate CI/CD pipelines, optimize cloud infrastructure, and ensure reliable deployments at scale. We support AWS, Azure, and GCP. We also offer CTO as a Service for fractional CTO leadership.',
    },
    {
      title: 'Staff Augmentation',
      content: 'Plug in top-tier engineers on-demand. Scale your team with vetted developers who integrate seamlessly. We provide ReactJS, Angular, NextJS, NodeJS, PHP, Python, WordPress, and GenAI engineers.',
    },
    {
      title: 'Pricing Models',
      content: 'We follow a transparent pricing model based on project scope, team composition, and engagement type — whether fixed-price, T&M (Time & Material), or retainer. Most AI agent projects start at $15,000-$30,000. We offer a free 30-minute discovery call with no commitment.',
    },
    {
      title: 'Case Studies',
      content: 'Our notable clients include Mozilla Foundation, qPress, Emblazer, Go2ANDAMAN, Homeloft, MAERSK, HUMA, Pasqal, AccessTruth, and United Healthcare. We helped Huma build a remote patient monitoring platform and Emblazer.ai create an AI agent development platform from scratch.',
    },
    {
      title: 'Industries We Serve',
      content: 'We serve Healthcare, FinTech, Technology & Startups, Education, Real Estate, E-commerce, Insurance, and Travel & Hospitality. Each industry receives tailored AI and software solutions.',
    },
    {
      title: 'Contact & Location',
      content: 'We are a remote-first company operating globally. Contact us at contact@enlightlab.com. We typically respond within 24 hours. You can also schedule an AI demo call or use our chat assistant for immediate questions.',
    },
    {
      title: 'Technology Stack',
      content: 'We work with ReactJS, NextJS, Angular, NodeJS, Python, GenAI, AWS, Azure, GCP, iOS, Android, and Docker. We hire specialists in each technology for staff augmentation projects.',
    },
    {
      title: 'Engagement Process',
      content: 'Our process: 1) Assessment — align goals and constraints. 2) Solution Design — architecture and roadmap. 3) Build Execution — iterative delivery. 4) Scaling & Optimization — performance tuning. 5) Transition & Handover — documentation and training. 6) Collaboration — modern tools for friction-free communication.',
    },
    {
      title: 'AI Demo Call',
      content: 'Our outbound AI calling agent calls you at your scheduled time for a fully conversational demo. The AI is pre-briefed on your industry and notes. Average call duration: 5-10 minutes. You can interrupt, ask, or redirect anytime. If you miss the call, we send a follow-up email automatically.',
    },
  ];
}

function saveKnowledgeBase() {
  const dir = path.dirname(KNOWLEDGE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(KNOWLEDGE_PATH, JSON.stringify(documents, null, 2));
}

module.exports = {
  initRAG,
  retrieveContext,
  generateEmbeddings,
  isReady: () => isReady,
};