const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const jwt = require('jsonwebtoken');

const app = express();

app.use(
  cors({
    origin: '*',
  })
);
app.use(express.json());

const NEON_API_URL = process.env.NEON_API_URL || 'https://ep-cold-band-agz72hp9.apirest.c-2.eu-central-1.aws.neon.tech/neondb/rest/v1';
const SECRET = process.env.JWT_SECRET || 'xtrade_secret_key';

// -------- Sağlık kontrolü --------
app.get('/health', (req, res) => {
  res.json({ status: 'OK' });
});

// -------- Root --------
app.get('/', (req, res) => {
  res.send('X-Trade Elite API (Neon) is running');
});

// -------- Register (örnek) --------
app.post('/auth/register', async (req, res) => {
  try {
    const { fullName, email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ message: 'Email ve şifre zorunludur.' });
    }
    // Neon REST API ile kullanıcı ekleme (şifre hash yok, demo!)
    const url = `${NEON_API_URL}/users`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, full_name: fullName })
    });
    if (!response.ok) {
      const err = await response.json();
      return res.status(400).json({ message: err.message || 'Kayıt başarısız.' });
    }
    const user = await response.json();
    const token = jwt.sign({ id: user.id, email: user.email }, SECRET, { expiresIn: '1d' });
    return res.status(201).json({ message: 'Kayıt başarılı.', user, token });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ message: 'Sunucu hatası. Lütfen daha sonra tekrar deneyin.' });
  }
});

// -------- Login (örnek) --------
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ message: 'Email ve şifre zorunludur.' });
    }
    // Neon REST API ile kullanıcı sorgula (şifre hash yok, demo!)
    const url = `${NEON_API_URL}/users?email=eq.${email}&password=eq.${password}`;
    const response = await fetch(url);
    const users = await response.json();
    if (!users.length) {
      return res.status(401).json({ message: 'Email veya şifre hatalı.' });
    }
    const user = users[0];
    const token = jwt.sign({ id: user.id, email: user.email }, SECRET, { expiresIn: '1d' });
    return res.json({ message: 'Giriş başarılı.', user, token });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ message: 'Sunucu hatası. Lütfen daha sonra tekrar deneyin.' });
  }
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
