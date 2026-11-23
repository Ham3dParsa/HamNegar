import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CURATED_MODELS,
  isGeminiConfigured,
  transcribeAudio,
  generateText,
  listAvailableModels,
  testConnection,
  extractHttpStatus,
  safeErrorMessage,
} from './server/gemini.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';

app.disable('x-powered-by');

app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/docs', express.static(path.join(__dirname, 'docs')));

const geminiRouter = express.Router();
geminiRouter.use(express.json({ limit: '35mb' }));

function sendApiError(res, err, forcedStatus) {
  const logicalStatus = forcedStatus || extractHttpStatus(err);
  const message = typeof err === 'string' ? err : safeErrorMessage(err, logicalStatus);
  const wireStatus = (logicalStatus === 502 || logicalStatus === 503 || logicalStatus === 504)
    ? (logicalStatus === 503 && isGeminiConfigured() ? 429 : 500)
    : logicalStatus;
  res.status(wireStatus).json({ error: { message, status: logicalStatus } });
}

geminiRouter.get('/status', (_req, res) => {
  res.json({
    configured: isGeminiConfigured(),
    models: CURATED_MODELS,
  });
});

geminiRouter.get('/models', async (_req, res) => {
  try {
    const models = await listAvailableModels();
    res.json({ models });
  } catch (err) {
    sendApiError(res, err);
  }
});

geminiRouter.post('/test', async (req, res) => {
  try {
    const result = await testConnection({ model: req.body?.model });
    res.json(result);
  } catch (err) {
    sendApiError(res, err);
  }
});

geminiRouter.post('/transcribe', async (req, res) => {
  try {
    const { model, mimeType, data } = req.body || {};
    const result = await transcribeAudio({ model, mimeType, data });
    res.json(result);
  } catch (err) {
    sendApiError(res, err);
  }
});

geminiRouter.post('/text', async (req, res) => {
  try {
    const { model, text, system, maxOutputTokens, temperature } = req.body || {};
    const result = await generateText({ model, text, system, maxOutputTokens, temperature });
    res.json(result);
  } catch (err) {
    sendApiError(res, err);
  }
});

geminiRouter.use((err, _req, res, next) => {
  if (!err) return next();
  const status = err.type === 'entity.too.large' ? 413 : extractHttpStatus(err);
  const message = status === 413 ? 'حجم درخواست بیشتر از حد مجاز است' : safeErrorMessage(err, status);
  sendApiError(res, message, status);
});

app.use('/api/gemini', geminiRouter);
app.use('/api', (_req, res) => {
  res.status(404).json({ error: { message: 'مسیر API پیدا نشد', status: 404 } });
});

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
