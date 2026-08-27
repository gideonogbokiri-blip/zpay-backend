const fs = require('fs');
const path = require('path');

const adminHtml = fs.readFileSync(path.join(__dirname, '..', 'admin', 'index.html'), 'utf8');

module.exports = function adminMiddleware(req, res) {
  res.setHeader('Content-Type', 'text/html');
  res.send(adminHtml);
};