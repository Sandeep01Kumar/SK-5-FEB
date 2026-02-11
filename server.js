const express = require('express');

const hostname = '127.0.0.1';
const port = 3000;

const app = express();

// GET / — preserves the original "Hello, World!" response with plain-text content type
app.get('/', (req, res) => {
  res.type('text').send('Hello, World!\n');
});

// GET /evening — new endpoint returning "Good evening" as plain text
app.get('/evening', (req, res) => {
  res.type('text').send('Good evening');
});

app.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});
