const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');

const app = express();
const PORT = 3000;

// Servir le fichier HTML
app.use(express.static('.'));

// Endpoint pour obtenir la configuration
app.get('/config', (req, res) => {
  res.json({
    ctfdUrl: process.env.CTFD_URL || 'https://demo.ctfd.io'
  });
});

// Proxy vers CTFd
app.use('/api', createProxyMiddleware({
  target: process.env.CTFD_URL || 'https://demo.ctfd.io',
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