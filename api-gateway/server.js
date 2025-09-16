const express = require('express');

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware básico para JSON (opcional, mas comum)
app.use(express.json());

// Health check simples
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'api-gateway' });
});

// (Opcional) Rota raiz
app.get('/', (_req, res) => {
  res.send('API Gateway ativo');
});

// 404 básico
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`API Gateway ouvindo na porta ${PORT}`);
});