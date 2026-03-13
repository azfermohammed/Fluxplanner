const https = require('https');
const url = require('url');

module.exports = async (req, res) => {
  // Handle CORS preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'x-canvas-token, content-type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const token = req.headers['x-canvas-token'];
  const targetUrl = req.query.url;

  if (!token || !targetUrl) {
    res.status(400).json({ error: 'Missing token or url' });
    return;
  }

  // Only allow Canvas API paths for security
  if (!targetUrl.includes('/api/v1/')) {
    res.status(403).json({ error: 'Only Canvas API requests allowed' });
    return;
  }

  try {
    const data = await new Promise((resolve, reject) => {
      const options = url.parse(targetUrl);
      options.headers = {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'User-Agent': 'AzferPlanner/1.0'
      };

      const proxyReq = https.request(options, (proxyRes) => {
        let body = '';
        proxyRes.on('data', chunk => body += chunk);
        proxyRes.on('end', () => {
          resolve({ status: proxyRes.statusCode, body });
        });
      });

      proxyReq.on('error', reject);
      proxyReq.end();
    });

    res.status(data.status).setHeader('Content-Type', 'application/json');
    res.end(data.body);

  } catch (err) {
    res.status(502).json({ error: 'Proxy error: ' + err.message });
  }
};
