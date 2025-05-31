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

// Endpoint pour obtenir la configuration
app.get('/config', (req, res) => {
  res.json({
    ctfdUrl: currentCtfdUrl
  });
});

// Endpoint pour changer l'URL CTFd dynamiquement
app.post('/config', express.json(), (req, res) => {
  const { ctfdUrl } = req.body;
  if (ctfdUrl && typeof ctfdUrl === 'string') {
    currentCtfdUrl = ctfdUrl;
    console.log(`URL CTFd mise à jour: ${currentCtfdUrl}`);
    res.json({ success: true, ctfdUrl: currentCtfdUrl });
  } else {
    res.status(400).json({ error: 'URL CTFd invalide' });
  }
});

// Proxy vers CTFd avec target dynamique
app.use('/api', createProxyMiddleware({
  target: function(req) {
    return currentCtfdUrl;
  },
  changeOrigin: true,
  headers: {
    'Origin': null
  },
  onProxyReq: (proxyReq, req, res) => {
    // Ajouter le token si présent
    if (req.headers.authorization) {
      proxyReq.setHeader('Authorization', req.headers.authorization);
    }
  }
}));

app.listen(PORT, () => {
  console.log(`Proxy serveur démarré sur http://localhost:${PORT}`);
  console.log(`CTFd URL: ${process.env.CTFD_URL || 'https://demo.ctfd.io'}`);
});