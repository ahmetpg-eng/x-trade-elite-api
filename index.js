const express = require('express');
const cors = require('cors');

const app = express();

// Orijin fark etmeksizin CORS aç (şimdilik basit)
app.use(cors());
app.use(express.json());

// Basit sağlık kontrolü
app.get('/health', (req, res) => {
  res.json({ status: 'OK' });
});

// Örnek bir endpoint: ileride buraya /auth, /accounts, /trading gelecek
app.get('/', (req, res) => {
  res.send('X-Trade Elite API is running');
});

// Render, PORT değişkenini kendi ayarlıyor, yoksa 4000 kullan
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`API listening on port ${PORT}`);
});
