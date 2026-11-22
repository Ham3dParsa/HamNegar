import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';

app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/docs', express.static(path.join(__dirname, 'docs')));

const rootFiles = new Set([
  '/index.html',
  '/pill.html',
  '/pill.css',
  '/prototype-fallback.html',
]);

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get(Array.from(rootFiles), (req, res) => {
  res.sendFile(path.join(__dirname, req.path.slice(1)));
});

app.listen(PORT, HOST, () => {
  console.log(`HamNegar server listening at http://${HOST}:${PORT}`);
});
