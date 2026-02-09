const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();

// -------- Middleware --------
app.use(
  cors({
    origin: '*',
  })
);
app.use(express.json());

// -------- Neon REST API URL --------
const NEON_API_URL = process.env.NEON_API_URL || 'https://ep-cold-band-agz72hp9.apirest.c-2.eu-central-1.aws.neon.tech/neondb/rest/v1';

// -------- Sağlık kontrolü --------
app.get('/health', (req, res) => {
  res.json({ status: 'OK' });
});

// -------- Root --------
app.get('/', (req, res) => {
  res.send('X-Trade Elite API (Neon) is running');
});

// -------- Funding History --------
app.get('/funding/history', async (req, res) => {
  try {
    const userId = req.query.userId;
    if (!userId) {
      return res.status(400).json({ message: 'userId zorunludur.' });
    }
    const url = `${NEON_API_URL}/funding_transactions?user_id=eq.${userId}&order=created_at.desc`;
    const response = await fetch(url);
    const data = await response.json();
    return res.json({ items: data });
  } catch (err) {
    console.error('Funding history error:', err);
    return res.status(500).json({ message: 'Funding verileri alınırken hata oluştu.' });
  }
});

// -------- Open Positions --------
app.get('/positions/open', async (req, res) => {
  try {
    const userId = req.query.userId;
    if (!userId) {
      return res.status(400).json({ message: 'userId zorunludur.' });
    }
    const url = `${NEON_API_URL}/open_positions?user_id=eq.${userId}&order=open_time.desc`;
    const response = await fetch(url);
    const data = await response.json();
    return res.json({ items: data });
  } catch (err) {
    console.error('Open positions error:', err);
    return res.status(500).json({ message: 'Pozisyon verileri alınırken hata oluştu.' });
  }
});

// -------- Public Instruments (WebTrader) --------
app.get('/instruments', async (req, res) => {
  try {
    const { group, enabled } = req.query;
    let url = `${NEON_API_URL}/instruments?order=sort_order.asc`;
    if (group) url += `&group_code=eq.${group}`;
    if (enabled === '1' || enabled === 'true') url += `&is_enabled=eq.true`;
    const response = await fetch(url);
    const data = await response.json();
    return res.json({ items: data });
  } catch (err) {
    console.error('Instruments fetch error:', err);
    return res.status(500).json({ message: 'Enstrüman listesi alınırken hata oluştu.' });
  }
});

// -------- Start server --------
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`API listening on port ${PORT}`);
});
