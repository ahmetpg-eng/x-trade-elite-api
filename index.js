const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// -------- Middleware --------
app.use(
  cors({
    origin: '*', // İstersen buraya sadece frontend domainini yazabilirsin
  })
);
app.use(express.json());

// -------- Supabase Client --------
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    '[WARN] SUPABASE_URL veya SUPABASE_ANON_KEY env değişkenleri tanımlı değil.'
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
app.post('/auth/register', async (req, res) => {
  try {
    const { fullName, email, password } = req.body || {};

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: 'Email ve şifre zorunludur.' });
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          fullName: fullName || null,
        },
      },
    });

    if (error) {
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
      password,
    });

    if (error) {
      return res.status(401).json({ message: error.message });
    }

    const session = data.session || null;

    return res.json({
      message: 'Giriş başarılı.',
      user: {
        id: data.user.id,
        email: data.user.email,
      },
      session: session
        ? {
            access_token: session.access_token,
            expires_at: session.expires_at,
            refresh_token: session.refresh_token,
          }
        : null,
    });
  } catch (err) {
    console.error('Login error:', err);
    return res
      .status(500)
      .json({ message: 'Sunucu hatası. Lütfen daha sonra tekrar deneyin.' });
  }
});

// -------- Çıkış yap (Logout) --------
app.post('/auth/logout', async (req, res) => {
  try {
    // Şimdilik sadece frontende "token'ı sil" demek için kullanıyoruz.
    return res.json({ message: 'Oturum sonlandırıldı.' });
  } catch (err) {
    console.error('Logout error:', err);
    return res
      .status(500)
      .json({ message: 'Sunucu hatası. Lütfen daha sonra tekrar deneyin.' });
  }
});

// -------- Funding History (Wallet) --------
app.get('/funding/history', async (req, res) => {
  try {
    const userId = req.query.userId;

    if (!userId) {
      return res.status(400).json({ message: 'userId zorunludur.' });
    }

    const { data, error } = await supabase
      .from('funding_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Funding history error:', error);
      return res.status(400).json({ message: error.message });
    }

    return res.json({ items: data || [] });
  } catch (err) {
    console.error('Funding history error:', err);
    return res
      .status(500)
      .json({ message: 'Funding verileri alınırken hata oluştu.' });
  }
});

// -------- Open Positions (Trading) --------
app.get('/positions/open', async (req, res) => {
  try {
    const userId = req.query.userId;

    if (!userId) {
      return res.status(400).json({ message: 'userId zorunludur.' });
    }

    const { data, error } = await supabase
      .from('open_positions')
      .select('*')
      .eq('user_id', userId)
      .order('open_time', { ascending: false });

    if (error) {
      console.error('Open positions error:', error);
      return res.status(400).json({ message: error.message });
    }

    return res.json({ items: data || [] });
  } catch (err) {
    console.error('Open positions error:', err);
    return res
      .status(500)
      .json({ message: 'Pozisyon verileri alınırken hata oluştu.' });
  }
});

// -------- Sunucuyu başlat --------
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`API listening on port ${PORT}`);
});
