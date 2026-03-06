const express = require('express');
const path = require('path');
const sofascore = require('./src/sofascore');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// JSON responses
app.use('/api', (req, res, next) => {
  res.setHeader('Content-Type', 'application/json');
  next();
});

// ── API ROUTES ──

app.get('/api/player', async (req, res) => {
  try {
    const data = await sofascore.getPlayer();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'No se pudo obtener datos del jugador', detail: err.message });
  }
});

app.get('/api/next-matches', async (req, res) => {
  try {
    const data = await sofascore.getNextMatches();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'No se pudieron obtener próximos partidos', detail: err.message });
  }
});

app.get('/api/recent-matches', async (req, res) => {
  try {
    const data = await sofascore.getRecentMatches();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'No se pudieron obtener partidos recientes', detail: err.message });
  }
});

app.get('/api/event/:id', async (req, res) => {
  try {
    const data = await sofascore.getEvent(req.params.id);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'No se pudo obtener el evento', detail: err.message });
  }
});

app.get('/api/event/:id/stats', async (req, res) => {
  try {
    const data = await sofascore.getEventStats(req.params.id);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'No se pudieron obtener estadísticas', detail: err.message });
  }
});

app.get('/api/rankings', async (req, res) => {
  try {
    const data = await sofascore.getRankings();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'No se pudieron obtener rankings', detail: err.message });
  }
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🎾 Alcaraz Fan Hub corriendo en http://localhost:${PORT}\n`);
});
