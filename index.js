const express = require('express');
const cors = require('cors');

const app = express();

// CORS ve JSON body parser
app.use(cors());
app.use(express.json());

// ---- Geçici kullanıcı listesi (hafızada) ----
// Gerçek projede bunu SUPABASE'e taşıyacağız.
// Şimdilik sadece sistemin akışını görmek için:
const users = []; // { email, password }

// ---- Sağlık kontrolü ----
app.get('/health', (req, res) => {
  res.json({ status: 'OK' });
});

// ---- Basit ana endpoint ----
app.get('/', (req, res) => {
  res.send('X-Trade Elite API is running');
});

// ---- Kayıt ol (Register) ----
// POST /auth/register
// Body: { email: "a@b.com", password: "123456" }
app.post('/auth/register', (req, res) => {
  const { email, password } = req.body || {};

  // Basit kontroller
  if (!email || !password) {
    return res.status(400).json({ message: 'Email ve şifre zorunludur.' });
  }

  // Aynı email var mı?
  const existing = users.find(u => u.email === email);
  if (existing) {
    return res.status(400).json({ message: 'Bu email ile zaten kullanıcı var.' });
  }

  // Kullanıcıyı ekle (şimdilik şifreyi açık tutuyoruz, ileride hash'leyeceğiz)
  users.push({ email, password });

  return res.status(201).json({ message: 'Kayıt başarılı.', email });
});

// ---- Giriş yap (Login) ----
// POST /auth/login
// Body: { email, password }
app.post('/auth/login', (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ message: 'Email ve şifre zorunludur.' });
  }

  const user = users.find(u => u.email === email && u.password === password);
  if (!user) {
    return res.status(401).json({ message: 'Email veya şifre hatalı.' });
  }

  // Şimdilik sadece "giriş başarılı" döndürüyoruz.
  // İleride burada token vs. vereceğiz.
  return res.json({ message: 'Giriş başarılı.', email: user.email });
});

// ---- Sunucuyu başlat ----
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`API listening on port ${PORT}`);
});
