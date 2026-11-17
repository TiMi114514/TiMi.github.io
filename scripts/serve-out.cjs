'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', 'out');
const port = Number(process.env.PORT || 4173);

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

http
  .createServer((request, response) => {
    const urlPath = decodeURIComponent((request.url || '/').split('?')[0]);
    let filePath = path.join(root, urlPath);

    if (!filePath.startsWith(root)) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }

    fs.stat(filePath, (statError, stat) => {
      if (!statError && stat.isDirectory()) {
        filePath = path.join(filePath, 'index.html');
      }

      fs.readFile(filePath, (readError, data) => {
        if (readError && !path.extname(filePath)) {
          fs.readFile(`${filePath}.html`, (fallbackError, fallbackData) => {
            if (fallbackError) {
              response.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
              response.end('<h1>404</h1>');
              return;
            }
            response.writeHead(200, { 'Content-Type': types['.html'] });
            response.end(fallbackData);
          });
          return;
        }

        if (readError) {
          response.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
          response.end('<h1>404</h1>');
          return;
        }

        const type = types[path.extname(filePath)] || 'application/octet-stream';
        response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
        response.end(data);
      });
    });
  })
  .listen(port, () => {
    console.log(`Paperwise static preview on http://127.0.0.1:${port}`);
  });
