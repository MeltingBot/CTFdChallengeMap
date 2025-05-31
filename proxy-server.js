const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');

const app = express();
const PORT = 3000;

// Configuration de debug
const DEBUG_ENABLED = process.env.CTFDMAP_DEBUG === 'true';
const debugLog = (...args) => DEBUG_ENABLED && console.log(...args);

// Servir le fichier HTML
app.use(express.static('.'));

// Variable pour stocker l'URL CTFd dynamique
let currentCtfdUrl = process.env.CTFD_URL || 'https://demo.ctfd.io';

// Variable pour stocker le middleware proxy actuel
let currentProxyMiddleware;

// Fonction pour créer/mettre à jour le proxy middleware
function createCurrentProxyMiddleware() {
  currentProxyMiddleware = createProxyMiddleware({
    target: currentCtfdUrl,
    changeOrigin: true,
    headers: {
      'Origin': null
    },
    onProxyReq: (proxyReq, req, res) => {
      debugLog('Proxying to:', currentCtfdUrl + req.url);
      // Ajouter le token si présent
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

// Initialiser le proxy au démarrage
createCurrentProxyMiddleware();

// Endpoint pour obtenir la configuration
app.get('/config', (req, res) => {
  res.json({
    ctfdUrl: currentCtfdUrl
  });
});

// Endpoint de health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    proxy: 'running',
    target: currentCtfdUrl,
    timestamp: new Date().toISOString()
  });
});

// Endpoint pour changer l'URL CTFd dynamiquement
app.post('/config', express.json(), (req, res) => {
  const { ctfdUrl } = req.body;
  if (ctfdUrl && typeof ctfdUrl === 'string') {
    currentCtfdUrl = ctfdUrl;
    createCurrentProxyMiddleware(); // Recréer le middleware avec la nouvelle URL
    console.log(`URL CTFd mise à jour: ${currentCtfdUrl}`);
    res.json({ success: true, ctfdUrl: currentCtfdUrl });
  } else {
    res.status(400).json({ error: 'URL CTFd invalide' });
  }
});

// Handler dynamique pour le proxy
app.use('/api', (req, res, next) => {
  debugLog('Using proxy for request to:', currentCtfdUrl + req.url);
  currentProxyMiddleware(req, res, next);
});

app.listen(PORT, () => {
  console.log(`Proxy serveur démarré sur http://localhost:${PORT}`);
  console.log(`CTFd URL: ${process.env.CTFD_URL || 'https://demo.ctfd.io'}`);
});