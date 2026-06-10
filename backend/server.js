require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

// ─── PROJECT STRUCTURE ────────────────────────────────────
const PROJECT_ROOT = fs.existsSync(path.join(__dirname, '..', 'index.html'))
  ? path.join(__dirname, '..')
  : __dirname;
const INDEX_HTML = path.join(PROJECT_ROOT, 'index.html');

// ─── LOGGER ───────────────────────────────────────────────
let loggerModule;
try {
  loggerModule = require('./middleware/logger');
} catch (e1) {
  try {
    loggerModule = require('./logger');
  } catch (e2) {
    loggerModule = {
      logger: (req, res, next) => {
        const start = Date.now();
        res.on('finish', () => {
          console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} ${res.statusCode} ${Date.now() - start}ms`);
        });
        next();
      }
    };
  }
}

const callRoutes    = require('./routes/calls');
const contactRoutes = require('./routes/contact');
const webhookRoutes = require('./routes/webhooks');
const chatRoutes    = require('./routes/chat');
const { initRAG }        = require('./services/rag');
const { startScheduler } = require('./services/scheduler');

const app = express();
app.set('trust proxy', 1);

const PORT = process.env.PORT || 3001;

// ─── SECURITY ─────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ─── RATE LIMITING ────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please try again later.' },
  validate: { xForwardedForHeader: false },
});

const callLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many call requests. Please try again in an hour.' },
  validate: { xForwardedForHeader: false },
});

// ─── BODY PARSING ─────────────────────────────────────────
app.use('/api/webhooks', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ─── LOGGING ──────────────────────────────────────────────
app.use(loggerModule.logger);

// ─── STATIC FILES ─────────────────────────────────────────
app.use(express.static(PROJECT_ROOT, { index: false, dotfiles: 'ignore' }));
console.log(`[STATIC] Serving from: ${PROJECT_ROOT}`);

// ─── ROOT ─────────────────────────────────────────────────
app.get('/', (req, res) => {
  if (fs.existsSync(INDEX_HTML)) {
    res.sendFile(INDEX_HTML);
  } else {
    res.status(404).json({ success: false, message: 'index.html not found', lookedAt: INDEX_HTML });
  }
});

// ─── HEALTH ───────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    indexHtmlFound: fs.existsSync(INDEX_HTML),
    agents: {
      webCall: {
        configured: !!(process.env.RETELL_API_KEY && (process.env.RETELL_WEB_AGENT_ID || process.env.RETELL_INBOUND_AGENT_ID)),
        agentId: process.env.RETELL_WEB_AGENT_ID || process.env.RETELL_INBOUND_AGENT_ID || null,
      },
      outbound: {
        configured: !!(process.env.RETELL_OUTBOUND_NUMBER && process.env.RETELL_OUTBOUND_AGENT_ID && process.env.RETELL_API_KEY),
        number: process.env.RETELL_OUTBOUND_NUMBER || null,
      },
      inbound: {
        configured: !!(process.env.RETELL_INBOUND_NUMBER && process.env.RETELL_INBOUND_AGENT_ID),
        number: process.env.RETELL_INBOUND_NUMBER || null,
      },
      chat: {
        configured: !!process.env.RETELL_CHAT_AGENT_ID,
        agentId: process.env.RETELL_CHAT_AGENT_ID || null,
      },
    },
  });
});

// ─── ROUTES ───────────────────────────────────────────────
app.use('/api/calls',    apiLimiter, callLimiter, callRoutes);
app.use('/api/contact',  apiLimiter, contactRoutes);
app.use('/api/chat',     apiLimiter, chatRoutes);
app.use('/api/webhooks', webhookRoutes);

// ─── 404 ──────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found: ' + req.url });
});

// ─── ERROR HANDLER ────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

// ─── START ────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`\n🚀 EnlightLab backend running on port ${PORT}`);
  console.log(`   index.html   : ${fs.existsSync(INDEX_HTML) ? '✅ ' + INDEX_HTML : '❌ NOT FOUND'}`);
  console.log(`   Web call     : ${process.env.RETELL_WEB_AGENT_ID || process.env.RETELL_INBOUND_AGENT_ID ? '✅ Agent configured' : '⚠️  RETELL_WEB_AGENT_ID not set'}`);
  console.log(`   Outbound     : ${process.env.RETELL_OUTBOUND_NUMBER ? '✅ ' + process.env.RETELL_OUTBOUND_NUMBER : '⚠️  RETELL_OUTBOUND_NUMBER not set'}`);
  console.log(`   Chat agent   : ${process.env.RETELL_CHAT_AGENT_ID ? '✅ ' + process.env.RETELL_CHAT_AGENT_ID : '⚠️  RETELL_CHAT_AGENT_ID not set'}`);
  console.log(`   Health check : http://localhost:${PORT}/health\n`);

  await initRAG();
  startScheduler();
});

module.exports = app;
