require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

// ─── PROJECT STRUCTURE ────────────────────────────────────
// Works both locally (backend/ subfolder) and production (root level)
const PROJECT_ROOT = fs.existsSync(path.join(__dirname, '..', 'index.html')) 
  ? path.join(__dirname, '..') 
  : __dirname;
const INDEX_HTML = path.join(PROJECT_ROOT, 'index.html');

// ─── FIND LOGGER ──────────────────────────────────────────
let loggerModule;
try {
  loggerModule = require('./middleware/logger');
} catch (e1) {
  try {
    loggerModule = require('./logger');
  } catch (e2) {
    console.warn('[WARN] No logger module found — using basic console logger');
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

const callRoutes = require('./routes/calls');
const contactRoutes = require('./routes/contact');
const webhookRoutes = require('./routes/webhooks');
const chatRoutes = require('./routes/chat');
const { initRAG } = require('./services/rag');
const { startScheduler } = require('./services/scheduler');

const app = express();

// Required for Vercel + express-rate-limit
app.set('trust proxy', 1);

const PORT = process.env.PORT || 3001;
// ─── SECURITY MIDDLEWARE ───────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));

// Prevent browser caching during development
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
  message: {
    success: false,
    message: 'Too many requests. Please try again later.'
  },
  validate: {
    xForwardedForHeader: false
  }
});

const callLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many call requests. Please try again in an hour.' },
});

// ─── BODY PARSING ─────────────────────────────────────────
app.use('/api/webhooks', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ─── LOGGING ──────────────────────────────────────────────
app.use(loggerModule.logger);

// ─── STATIC FILES ─────────────────────────────────────────
// Serve from project root (where index.html lives)
app.use(express.static(PROJECT_ROOT, {
  index: false,
  dotfiles: 'ignore',
}));
console.log(`[STATIC] Serving files from: ${PROJECT_ROOT}`);

// ─── ROOT ROUTE ───────────────────────────────────────────
app.get('/', (req, res) => {
  if (fs.existsSync(INDEX_HTML)) {
    res.sendFile(INDEX_HTML);
  } else {
    res.status(404).json({
      success: false,
      message: 'index.html not found',
      lookedAt: INDEX_HTML,
      hint: 'Make sure index.html is in the project root folder (one level above backend/)',
    });
  }
});

// ─── HEALTH CHECK ─────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    indexHtmlFound: fs.existsSync(INDEX_HTML),
    indexHtmlPath: INDEX_HTML,
    projectRoot: PROJECT_ROOT,
    serverDir: __dirname,
    agents: {
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
app.use('/api/calls', apiLimiter, callLimiter, callRoutes);
app.use('/api/contact', apiLimiter, contactRoutes);
app.use('/api/chat', apiLimiter, chatRoutes);
app.use('/api/webhooks', webhookRoutes);

// ─── 404 ──────────────────────────────────────────────────
app.use((req, res) => {
  console.log(`[404] ${req.method} ${req.url}`);
  res.status(404).json({ success: false, message: 'Route not found: ' + req.url });
});

// ─── ERROR HANDLER ────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message,
  });
});

// ─── START ────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 EnlightLab backend running on port ${PORT}`);
  console.log(`   Server dir   : ${__dirname}`);
  console.log(`   Project root : ${PROJECT_ROOT}`);
  console.log(`   index.html   : ${fs.existsSync(INDEX_HTML) ? '✅ ' + INDEX_HTML : '❌ NOT FOUND'}`);
  console.log(`   Outbound     : ${process.env.RETELL_OUTBOUND_NUMBER ? process.env.RETELL_OUTBOUND_NUMBER : '⚠️  No phone number (bookings saved, calls manual)'}`);
  console.log(`   Inbound      : ${process.env.RETELL_INBOUND_NUMBER ? process.env.RETELL_INBOUND_NUMBER : '⚠️  No phone number yet'}`);
  console.log(`   Chat agent   : ${process.env.RETELL_CHAT_AGENT_ID ? '✅ ' + process.env.RETELL_CHAT_AGENT_ID : '⚠️  Not configured'}`);
  console.log(`   Health check : http://localhost:${PORT}/health\n`);
});

startScheduler();

module.exports = app;
