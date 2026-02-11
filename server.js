const express = require('express');
const app = express();

const hostname = '127.0.0.1';
const port = 3000;

// GET / — returns "Hello, World!\n" as plain text (preserves original response)
app.get('/', (req, res) => {
  res.type('text').send('Hello, World!\n');
});

// GET /evening — returns "Good evening" as plain text (new endpoint)
app.get('/evening', (req, res) => {
  res.type('text').send('Good evening');
});

app.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});
