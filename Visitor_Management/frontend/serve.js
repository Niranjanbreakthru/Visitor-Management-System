// serve.js — static file server that injects api-bridge.js into vms_fixed.html
// No existing files are modified.
const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = 3000;
const DIR  = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff2':'font/woff2',
  '.woff': 'font/woff',
};

http.createServer(function (req, res) {
  // Serve vms_fixed.html for root
  const url      = req.url.split('?')[0];
  const filePath = path.join(DIR, url === '/' ? 'vms_fixed.html' : url);
  const ext      = path.extname(filePath).toLowerCase();
  const mime     = MIME[ext] || 'application/octet-stream';

  fs.readFile(filePath, function (err, data) {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    // Inject api-bridge.js before </body> so window.apiCreateVisit is always defined
    if (filePath.endsWith('vms_fixed.html')) {
      data = Buffer.from(
        data.toString('utf8').replace(
          '</body>',
          '<script src="/api-bridge.js"></script>\n</body>'
        )
      );
    }

    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
}).listen(PORT, function () {
  console.log('[VMS Frontend] http://localhost:' + PORT);
});
