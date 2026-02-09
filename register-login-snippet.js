// Register ve Login endpointleri için örnek kod:
const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'xtrade_secret_key';

// Register
app.post('/auth/register', async (req, res) => {
  try {
    const { fullName, email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ message: 'Email ve şifre zorunludur.' });
    }
    // Neon REST API ile kullanıcı ekleme (örnek, şifre hash yok!)
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
    // JWT token üret
    const token = jwt.sign({ id: user.id, email: user.email }, SECRET, { expiresIn: '1d' });
    return res.status(201).json({ message: 'Kayıt başarılı.', user, token });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ message: 'Sunucu hatası. Lütfen daha sonra tekrar deneyin.' });
  }
});

// Login
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ message: 'Email ve şifre zorunludur.' });
    }
    // Neon REST API ile kullanıcı sorgula (şifre hash yok!)
    const url = `${NEON_API_URL}/users?email=eq.${email}&password=eq.${password}`;
    const response = await fetch(url);
    const users = await response.json();
    if (!users.length) {
      return res.status(401).json({ message: 'Email veya şifre hatalı.' });
    }
    const user = users[0];
    // JWT token üret
    const token = jwt.sign({ id: user.id, email: user.email }, SECRET, { expiresIn: '1d' });
    return res.json({ message: 'Giriş başarılı.', user, token });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ message: 'Sunucu hatası. Lütfen daha sonra tekrar deneyin.' });
  }
});
