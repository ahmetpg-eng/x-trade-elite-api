const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// -------- Middleware --------
app.use(
  cors({
    origin: '*',
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
        metadata: data.user.user_metadata || {},
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

// -------- Public Instruments (WebTrader için) --------
app.get('/instruments', async (req, res) => {
  try {
    const { group, enabled } = req.query;

    let query = supabase.from('instruments').select(`
      id,
      code,
      symbol,
      display_name,
      group_code,
      provider_code,
      provider_symbol,
      instrument_type,
      tick_size,
      digits,
      is_enabled,
      sort_order
    `);

    if (group) {
      query = query.eq('group_code', group);
    }

    if (enabled === '1' || enabled === 'true') {
      query = query.eq('is_enabled', true);
    }

    const { data, error } = await query.order('sort_order', {
      ascending: true,
    });

    if (error) {
      console.error('Instruments fetch error:', error);
      return res.status(400).json({ message: error.message });
    }

    return res.json({ items: data || [] });
  } catch (err) {
    console.error('Instruments fetch error:', err);
    return res
      .status(500)
      .json({ message: 'Enstrüman listesi alınırken hata oluştu.' });
  }
});

// -------- Admin Login --------
app.post('/admin/login', async (req, res) => {
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

    const role =
      (data.user.user_metadata && data.user.user_metadata.role) || null;

    if (role !== 'admin') {
      return res.status(403).json({
        message:
          'Bu hesaba admin yetkisi atanmamış. Lütfen sistem yöneticisine başvurun.',
      });
    }

    const session = data.session || null;

    return res.json({
      message: 'Admin girişi başarılı.',
      admin: {
        id: data.user.id,
        email: data.user.email,
        role: role,
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
    console.error('Admin login error:', err);
    return res
      .status(500)
      .json({ message: 'Sunucu hatası. Lütfen daha sonra tekrar deneyin.' });
  }
});

// -------- Admin: Instruments List --------
app.get('/admin/instruments', async (req, res) => {
  try {
    const { group } = req.query;

    let query = supabase.from('instruments').select(`
      id,
      code,
      symbol,
      display_name,
      group_code,
      provider_code,
      provider_symbol,
      instrument_type,
      tick_size,
      digits,
      is_enabled,
      sort_order,
      created_at
    `);

    if (group) {
      query = query.eq('group_code', group);
    }

    const { data, error } = await query.order('sort_order', {
      ascending: true,
    });

    if (error) {
      console.error('Admin instruments fetch error:', error);
      return res.status(400).json({ message: error.message });
    }

    return res.json({ items: data || [] });
  } catch (err) {
    console.error('Admin instruments fetch error:', err);
    return res
      .status(500)
      .json({ message: 'Enstrüman listesi alınırken hata oluştu.' });
  }
});

// -------- Admin: Create Instrument --------
app.post('/admin/instruments', async (req, res) => {
  try {
    const {
      code,
      symbol,
      display_name,
      group_code,
      provider_code,
      provider_symbol,
      instrument_type,
      tick_size,
      digits,
      sort_order,
      is_enabled,
    } = req.body || {};

    if (
      !code ||
      !symbol ||
      !display_name ||
      !group_code ||
      !provider_code ||
      !provider_symbol ||
      !instrument_type
    ) {
      return res.status(400).json({
        message:
          'code, symbol, display_name, group_code, provider_code, provider_symbol ve instrument_type zorunludur.',
      });
    }

    const { data, error } = await supabase
      .from('instruments')
      .insert([
        {
          code,
          symbol,
          display_name,
          group_code,
          provider_code,
          provider_symbol,
          instrument_type,
          tick_size: tick_size ?? 0.01,
          digits: digits ?? 2,
          sort_order: sort_order ?? 0,
          is_enabled: typeof is_enabled === 'boolean' ? is_enabled : true,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error('Admin create instrument error:', error);
      return res.status(400).json({ message: error.message });
    }

    return res.status(201).json({ item: data });
  } catch (err) {
    console.error('Admin create instrument error:', err);
    return res
      .status(500)
      .json({ message: 'Enstrüman oluşturulurken hata oluştu.' });
  }
});

// -------- Admin: Update Instrument --------
app.patch('/admin/instruments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const payload = req.body || {};

    if (!id) {
      return res.status(400).json({ message: 'id zorunludur.' });
    }

    const allowedFields = [
      'display_name',
      'group_code',
      'provider_code',
      'provider_symbol',
      'instrument_type',
      'tick_size',
      'digits',
      'is_enabled',
      'sort_order',
    ];

    const updateData = {};
    for (const key of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(payload, key)) {
        // @ts-ignore
        updateData[key] = payload[key];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: 'Güncellenecek alan yok.' });
    }

    const { data, error } = await supabase
      .from('instruments')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Admin update instrument error:', error);
      return res.status(400).json({ message: error.message });
    }

    return res.json({ item: data });
  } catch (err) {
    console.error('Admin update instrument error:', err);
    return res
      .status(500)
      .json({ message: 'Enstrüman güncellenirken hata oluştu.' });
  }
});

// -------- Sunucuyu başlat --------
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`API listening on port ${PORT}`);
});
