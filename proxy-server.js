const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');
const { URL } = require('url');

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3000;
const HOST = process.env.HOST || '127.0.0.1';

// Configuration de debug
const DEBUG_ENABLED = process.env.CTFDMAP_DEBUG === 'true';
const debugLog = (...args) => DEBUG_ENABLED && console.log(...args);

// En-têtes de sécurité appliqués à toutes les réponses.
// CSP: 'unsafe-inline' reste nécessaire tant que index.html contient des handlers/styles inline.
// On bloque object-src, on cadre frame-ancestors et base-uri.
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "connect-src 'self'",
      "font-src 'self' data:",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'"
    ].join('; ')
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
});

// Fichiers statiques : on liste explicitement ce qui est public au lieu d'exposer tout le repo.
const STATIC_FILES = new Set([
  'index.html',
  'index.prod.html',
  'app.js',
  'app.min.js',
  'app-d3.js',
  'app-d3.min.js',
  'd3.v7.min.js',
  'build-info.json',
  'favicon.ico'
]);

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/:file', (req, res, next) => {
  if (!STATIC_FILES.has(req.params.file)) return next();
  res.sendFile(path.join(__dirname, req.params.file));
});

// URL CTFd courante + middleware proxy associé
let currentCtfdUrl = process.env.CTFD_URL || 'https://demo.ctfd.io';
let currentProxyMiddleware;

function validateCtfdUrl(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (!parsed.host) return null;
  return parsed.origin + parsed.pathname.replace(/\/$/, '');
}

function createCurrentProxyMiddleware() {
  currentProxyMiddleware = createProxyMiddleware({
    target: currentCtfdUrl,
    changeOrigin: true,
    onProxyReq: (proxyReq, req, res) => {
      debugLog('Proxying to:', currentCtfdUrl + req.url);
      // Supprimer l'Origin (le mettre à "null" en string ne le supprime pas réellement)
      proxyReq.removeHeader('origin');
      if (req.headers.authorization) {
        proxyReq.setHeader('Authorization', req.headers.authorization);
      }
    },
    onError: (err, req, res) => {
      console.error('Proxy error:', err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Proxy error: ' + err.message });
      }
    }
  });
}

createCurrentProxyMiddleware();

app.get('/config', (req, res) => {
  res.json({ ctfdUrl: currentCtfdUrl });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    proxy: 'running',
    target: currentCtfdUrl,
    timestamp: new Date().toISOString()
  });
});

app.post('/config', express.json(), (req, res) => {
  const validated = validateCtfdUrl(req.body && req.body.ctfdUrl);
  if (!validated) {
    return res.status(400).json({ error: 'URL CTFd invalide (http(s) attendu)' });
  }
  currentCtfdUrl = validated;
  createCurrentProxyMiddleware();
  console.log(`URL CTFd mise à jour: ${currentCtfdUrl}`);
  res.json({ success: true, ctfdUrl: currentCtfdUrl });
});

app.use('/api', (req, res, next) => {
  debugLog('Using proxy for request to:', currentCtfdUrl + req.url);
  currentProxyMiddleware(req, res, next);
});

app.listen(PORT, HOST, () => {
  console.log(`Proxy serveur démarré sur http://${HOST}:${PORT}`);
  console.log(`CTFd URL: ${currentCtfdUrl}`);
  if (HOST !== '127.0.0.1' && HOST !== 'localhost') {
    console.warn('⚠️  Le proxy écoute sur une interface non-locale. /config POST permet de repointer la cible — protégez l\'accès.');
  }
});
