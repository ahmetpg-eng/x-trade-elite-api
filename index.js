const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// -------- Middleware --------
app.use(cors());
app.use(express.json());

// -------- Supabase Client --------
// DİKKAT: Bu değerleri KODUN İÇİNE YAZMIYORUZ.
// Render ortam değişkenlerinden okunacak:
// SUPABASE_URL  = https://nqyjweqciptwhjptkcxw.supabase.co
// SUPABASE_ANON_KEY = (anon public key)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    '[WARN] SUPABASE_URL veya SUPABASE_ANON_KEY env değişkenleri tanımlı değil. ' +
      'Register/Login çağrıları çalışmayacaktır.'
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// -------- Sağlık kontrolü --------
app.get('/health', (req, res) => {
  res.json({ status: 'OK' });
});

// -------- Basit ana endpoint --------
app.get('/', (req, res) => {
  res.send('X-Trade Elite API is running');
});

// -------- Kayıt ol (Register) --------
// POST /auth/register
// Body: { fullName: "Test User", email: "a@b.com", password: "123456" }
app.post('/auth/register', async (req, res) => {
  try {
    const { fullName, email, password } = req.body || {};

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: 'Email ve şifre zorunludur.' });
    }

    // Supabase Auth ile kullanıcı oluştur
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          fullName: fullName || null
        }
      }
    });

    if (error) {
      // Örneğin "User already registered" gibi hata gelebilir
      return res.status(400).json({ message: error.message });
    }

    return res
      .status(201)
      .json({ message: 'Kayıt başarılı.', userId: data.user.id });
  } catch (err) {
    console.error('Register error:', err);
    return res
      .status(500)
      .json({ message: 'Sunucu hatası. Lütfen daha sonra tekrar deneyin.' });
  }
});

// -------- Giriş yap (Login) --------
// POST /auth/login
// Body: { email, password }
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: 'Email ve şifre zorunludur.' });
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      return res.status(401).json({ message: error.message });
    }

    return res.json({
      message: 'Giriş başarılı.',
      userId: data.user.id,
      email: data.user.email
    });
  } catch (err) {
    console.error('Login error:', err);
    return res
      .status(500)
      .json({ message: 'Sunucu hatası. Lütfen daha sonra tekrar deneyin.' });
  }
});

// -------- Sunucuyu başlat --------
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`API listening on port ${PORT}`);
});
