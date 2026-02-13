const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");

// Optional: initialize Sentry if DSN provided
try {
  const SENTRY_DSN = process.env.SENTRY_DSN || process.env.VERCEL_SENTRY_DSN;
  if (SENTRY_DSN) {
    const Sentry = require("@sentry/node");
    Sentry.init({
      dsn: SENTRY_DSN,
      tracesSampleRate: parseFloat(
        process.env.SENTRY_TRACES_SAMPLE_RATE || "0.1",
      ),
    });
    console.log("Sentry initialized for backend");
  }
} catch (e) {
  console.warn("Sentry init failed:", e.message || e);
}

// Optional: Supabase server client (service role) for server-side operations
let supabase = null;
try {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    const { createClient } = require("@supabase/supabase-js");
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    console.log("Supabase server client initialized");
  }
} catch (e) {
  console.warn("Supabase client init failed:", e.message || e);
}

const app = express();

// -------- Middleware --------
const { auditMiddleware } = require("./middleware/audit");
const { rateLimit } = require("./middleware/rateLimit");
const { errorHandler } = require("./middleware/errorHandler");
const { simpleAuth, requireRole } = require("./middleware/auth");
const cookieParser = require("cookie-parser");

// SECURITY: CORS configuration
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((o) => o.trim())
  : process.env.NODE_ENV === "production"
    ? [] // Must be explicitly set in production
    : ["http://localhost:3000", "http://localhost:5173"]; // Dev defaults

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) return callback(null, true);

      if (
        allowedOrigins.indexOf(origin) !== -1 ||
        allowedOrigins.length === 0
      ) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    optionsSuccessStatus: 200,
  }),
);
app.use(express.json());
app.use(cookieParser()); // parse cookies
// attach simple auth (decodes token if present) and audit logging
app.use(simpleAuth);
app.use(auditMiddleware);

// -------- Neon REST API URL --------
const NEON_API_URL =
  process.env.NEON_API_URL ||
  "https://ep-lively-union-agdwix5p.apirest.c-2.eu-central-1.aws.neon.tech/neondb/rest/v1";

// -------- Sağlık kontrolü --------
app.get("/health", (req, res) => {
  res.json({ status: "OK" });
});

// -------- Root --------
app.get("/", (req, res) => {
  res.send("X-Trade Elite API (Neon) is running");
});

// -------- Funding History --------
app.get("/funding/history", async (req, res) => {
  try {
    const userId = req.query.userId;
    if (!userId) {
      return res.status(400).json({ message: "userId zorunludur." });
    }
    const url = `${NEON_API_URL}/funding_transactions?user_id=eq.${userId}&order=created_at.desc`;
    const response = await fetch(url);
    const data = await response.json();
    return res.json({ items: data });
  } catch (err) {
    console.error("Funding history error:", err);
    return res
      .status(500)
      .json({ message: "Funding verileri alınırken hata oluştu." });
  }
});

// -------- Open Positions --------
app.get("/positions/open", async (req, res) => {
  try {
    const userId = req.query.userId;
    if (!userId) {
      return res.status(400).json({ message: "userId zorunludur." });
    }
    const url = `${NEON_API_URL}/open_positions?user_id=eq.${userId}&order=open_time.desc`;
    const response = await fetch(url);
    const data = await response.json();
    return res.json({ items: data });
  } catch (err) {
    console.error("Open positions error:", err);
    return res
      .status(500)
      .json({ message: "Pozisyon verileri alınırken hata oluştu." });
  }
});

// -------- Create Open Position --------
app.post("/positions/open", async (req, res) => {
  try {
    const {
      user_id: userId,
      symbol,
      side,
      volume,
      open_price: openPrice,
      sl,
      tp,
    } = req.body || {};

    if (!userId || !symbol || !side || !volume || !openPrice) {
      return res.status(400).json({
        message:
          "user_id, symbol, side, volume ve open_price alanları zorunludur.",
      });
    }

    const position = {
      user_id: userId,
      symbol,
      side,
      volume,
      open_price: openPrice,
      sl: sl ?? null,
      tp: tp ?? null,
      status: "open",
      open_time: new Date().toISOString(),
    };

    const url = `${NEON_API_URL}/open_positions`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(position),
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      console.error("Create position error:", errBody);
      return res.status(400).json({
        message: errBody.message || "Pozisyon oluşturulurken bir hata oluştu.",
      });
    }

    const created = await response.json().catch(() => null);
    const item = Array.isArray(created) ? created[0] : created;

    return res.status(201).json({ item });
  } catch (err) {
    console.error("Create open position error:", err);
    return res
      .status(500)
      .json({ message: "Pozisyon oluşturulurken sunucu hatası oluştu." });
  }
});

// -------- Close Position --------
app.post("/positions/close", async (req, res) => {
  try {
    const { id, user_id: userId } = req.body || {};

    if (!id || !userId) {
      return res
        .status(400)
        .json({ message: "id ve user_id alanları zorunludur." });
    }

    // İlgili pozisyonu getir
    const fetchUrl = `${NEON_API_URL}/open_positions?id=eq.${encodeURIComponent(
      id,
    )}&user_id=eq.${encodeURIComponent(userId)}`;
    const fetchResp = await fetch(fetchUrl);
    if (!fetchResp.ok) {
      return res
        .status(404)
        .json({ message: "Pozisyon bulunamadı veya erişim yetkisiz." });
    }
    const rows = await fetchResp.json().catch(() => []);
    if (!Array.isArray(rows) || rows.length === 0) {
      return res
        .status(404)
        .json({ message: "Pozisyon bulunamadı veya erişim yetkisiz." });
    }

    const existing = rows[0];
    if (existing.status && String(existing.status).toLowerCase() === "closed") {
      return res
        .status(409)
        .json({ message: "Pozisyon zaten kapatılmış durumda." });
    }

    // Şimdilik realized_profit hesabını backend'de yapmıyoruz,
    // sadece pozisyonu kapalıya çekiyoruz. İleride fiyat datası ve
    // risk motoru entegre edildiğinde bu alan doldurulabilir.
    const patchBody = {
      status: "closed",
      close_time: new Date().toISOString(),
    };

    const patchUrl = `${NEON_API_URL}/open_positions?id=eq.${encodeURIComponent(
      id,
    )}`;
    const patchResp = await fetch(patchUrl, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(patchBody),
    });

    if (!patchResp.ok) {
      const errBody = await patchResp.json().catch(() => ({}));
      console.error("Close position error:", errBody);
      return res.status(400).json({
        message: errBody.message || "Pozisyon kapatılırken bir hata oluştu.",
      });
    }

    const updated = await patchResp.json().catch(() => null);
    const item = Array.isArray(updated) ? updated[0] : updated;

    return res.json({ item });
  } catch (err) {
    console.error("Close position server error:", err);
    return res
      .status(500)
      .json({ message: "Pozisyon kapatılırken sunucu hatası oluştu." });
  }
});

// -------- Admin: list users (example) --------
app.get("/admin/users", requireRole("admin"), async (req, res) => {
  try {
    const url = `${NEON_API_URL}/users?order=created_at.desc`;
    const response = await fetch(url);
    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      console.error("Admin users fetch error:", errBody);
      return res
        .status(400)
        .json({ message: "Kullanıcı listesi alınırken hata oluştu." });
    }
    const users = await response.json().catch(() => []);
    return res.json({ items: users });
  } catch (err) {
    console.error("Admin users server error:", err);
    return res
      .status(500)
      .json({ message: "Kullanıcı listesi alınırken sunucu hatası oluştu." });
  }
});

// -------- Admin: list positions (example) --------
app.get("/admin/positions", requireRole("admin"), async (req, res) => {
  try {
    const url = `${NEON_API_URL}/open_positions?order=open_time.desc`;
    const response = await fetch(url);
    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      console.error("Admin positions fetch error:", errBody);
      return res
        .status(400)
        .json({ message: "Pozisyon listesi alınırken hata oluştu." });
    }
    const positions = await response.json().catch(() => []);
    return res.json({ items: positions });
  } catch (err) {
    console.error("Admin positions server error:", err);
    return res.status(500).json({
      message: "Pozisyon listesi alınırken sunucu hatası oluştu.",
    });
  }
});

// -------- Public Instruments (WebTrader) --------
app.get("/instruments", async (req, res) => {
  try {
    const { group, enabled } = req.query;
    let url = `${NEON_API_URL}/instruments?order=sort_order.asc`;
    if (group) url += `&group_code=eq.${group}`;
    if (enabled === "1" || enabled === "true") url += `&is_enabled=eq.true`;
    const response = await fetch(url);
    const data = await response.json();
    return res.json({ items: data });
  } catch (err) {
    console.error("Instruments fetch error:", err);
    return res
      .status(500)
      .json({ message: "Enstrüman listesi alınırken hata oluştu." });
  }
});

// -------- Create User Profile --------
// Neon Auth sonrası kullanıcı profili oluşturma
app.post("/auth/create-profile", async (req, res) => {
  try {
    const { authUserId, email, firstName, lastName } = req.body || {};
    if (!authUserId || !email) {
      return res
        .status(400)
        .json({ message: "authUserId ve email zorunludur." });
    }

    // Önce kullanıcı profili var mı kontrol et
    const checkUrl = `${NEON_API_URL}/users?auth_user_id=eq.${authUserId}`;
    const checkResponse = await fetch(checkUrl);
    const existingUsers = await checkResponse.json();

    if (existingUsers.length > 0) {
      return res.json({
        message: "Kullanıcı profili zaten mevcut.",
        user: existingUsers[0],
      });
    }

    // Kullanıcı profili oluştur
    const userData = {
      auth_user_id: authUserId,
      email: email,
      first_name: firstName || "",
      last_name: lastName || "",
      balance: 10000, // Demo başlangıç bakiyesi
      available_balance: 10000,
      is_active: true,
    };

    const createUrl = `${NEON_API_URL}/users`;
    const createResponse = await fetch(createUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(userData),
    });

    if (!createResponse.ok) {
      const err = await createResponse.json();
      return res
        .status(400)
        .json({ message: err.message || "Profil oluşturma başarısız." });
    }

    const newUser = await createResponse.json();
    return res
      .status(201)
      .json({ message: "Profil başarıyla oluşturuldu.", user: newUser });
  } catch (err) {
    console.error("Create profile error:", err);
    return res.status(500).json({ message: "Sunucu hatası." });
  }
});

// Optional: create profile via Supabase server client
app.post("/supabase/create-profile", async (req, res) => {
  try {
    if (!supabase)
      return res
        .status(500)
        .json({ message: "Supabase not configured on server" });

    const { authUserId, email, firstName, lastName } = req.body || {};
    if (!authUserId || !email)
      return res
        .status(400)
        .json({ message: "authUserId and email are required" });

    const payload = {
      auth_user_id: authUserId,
      email,
      first_name: firstName || "",
      last_name: lastName || "",
      balance: 10000,
      available_balance: 10000,
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    // Use upsert with onConflict to make this operation idempotent.
    // It will insert a new row or update the existing one matching auth_user_id.
    const { data, error } = await supabase
      .from("users")
      .upsert(payload, { onConflict: "auth_user_id" })
      .select()
      .single();

    if (error) {
      // If it's a unique violation or similar, surface a clear message
      console.error("Supabase create-profile upsert error:", error);
      return res.status(400).json({
        message: error.message || "Supabase upsert failed",
        details: error,
      });
    }

    return res
      .status(200)
      .json({ message: "Profile created or updated", user: data });
  } catch (err) {
    console.error("/supabase/create-profile error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// -------- Auth: register & login (simple JWT example)
const jwt = require("jsonwebtoken");

// SECURITY: JWT Secret must be set in production
if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) {
  console.error(
    "FATAL: JWT_SECRET environment variable is required in production!",
  );
  process.exit(1);
}

const SECRET = process.env.JWT_SECRET || "dev_secret_change_in_production";
if (
  SECRET === "dev_secret_change_in_production" &&
  process.env.NODE_ENV === "production"
) {
  console.error("FATAL: Default JWT secret detected in production!");
  process.exit(1);
}
const crypto = require("crypto");
const argon2 = require("argon2");

// Use local refresh token service (DB + Redis blacklist)
const refreshService =
  process.env.USE_MOCK_REFRESH === "true"
    ? require("./services/refreshService.mock")
    : require("./services/refreshService");

// Simple role-based guard
function requireRole(role) {
  return function (req, res, next) {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : null;
    if (!token) {
      return res.status(401).json({ message: "Yetkilendirme gerekli." });
    }
    try {
      const decoded = jwt.verify(token, SECRET);
      if (!decoded.role || decoded.role !== role) {
        return res
          .status(403)
          .json({ message: "Bu işlemi yapmak için yetkiniz yok." });
      }
      req.user = decoded;
      next();
    } catch (e) {
      return res
        .status(401)
        .json({ message: "Geçersiz veya süresi dolmuş token." });
    }
  };
}

// Register
app.post("/auth/register", async (req, res) => {
  try {
    const { fullName, full_name, email, password, name, role } = req.body || {};

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required.",
        error: "MISSING_FIELDS",
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        message: "Invalid email format.",
        error: "INVALID_EMAIL",
      });
    }

    // Validate password strength
    if (password.length < 6) {
      return res.status(400).json({
        message: "Password must be at least 6 characters long.",
        error: "WEAK_PASSWORD",
      });
    }

    // Input sanitization: email
    const sanitizedEmail = String(email).trim().toLowerCase();

    // Check if user already exists
    const checkUrl = `${NEON_API_URL}/users?email=eq.${encodeURIComponent(sanitizedEmail)}`;
    const checkResponse = await fetch(checkUrl);
    const existingUsers = await checkResponse.json();

    if (Array.isArray(existingUsers) && existingUsers.length > 0) {
      return res.status(409).json({
        message: "An account with this email already exists.",
        error: "EMAIL_EXISTS",
      });
    }

    // Hash password before persisting
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

    // Prepare user data
    const displayName = fullName || full_name || name || email.split("@")[0];
    const userData = {
      email: sanitizedEmail,
      password_hash: passwordHash,
      full_name: displayName,
      role: role || "client",
      is_active: true,
      balance: 10000, // Demo starting balance
      available_balance: 10000,
      created_at: new Date().toISOString(),
    };

    // Create user in database
    const url = `${NEON_API_URL}/users`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(userData),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error("Database error creating user:", err);
      return res.status(400).json({
        message: err.message || "Registration failed. Please try again.",
        error: "DATABASE_ERROR",
      });
    }

    const created = await response.json();
    const user = Array.isArray(created) ? created[0] : created;

    if (!user || !user.id) {
      return res.status(500).json({
        message: "Failed to create user account.",
        error: "USER_CREATION_FAILED",
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role || "client",
      },
      SECRET,
      { expiresIn: "1d" },
    );

    // Generate refresh token
    const refreshToken = crypto.randomBytes(32).toString("hex");
    await refreshService.storeRefreshToken(refreshToken, user.id).catch((e) => {
      console.warn("Failed to store refresh token:", e);
    });

    // Set HttpOnly cookie for refresh token
    res.cookie("refresh_token", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
      maxAge: 30 * 24 * 3600 * 1000, // 30 days
    });

    // Return success response
    return res.status(201).json({
      message: "Registration successful.",
      user: {
        id: user.id,
        email: user.email,
        name: user.full_name,
        role: user.role,
      },
      token,
      access_token: token,
      refresh_token: refreshToken,
    });
  } catch (err) {
    console.error("Register error:", err);
    return res.status(500).json({
      message: "Server error. Please try again later.",
      error: "INTERNAL_ERROR",
    });
  }
});

// Login
app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required.",
        error: "MISSING_FIELDS",
      });
    }

    // Input sanitization: email
    const sanitizedEmail = String(email).trim().toLowerCase();

    // Lookup user by email
    const url = `${NEON_API_URL}/users?email=eq.${encodeURIComponent(sanitizedEmail)}`;
    const response = await fetch(url);
    const users = await response.json();

    if (!Array.isArray(users) || users.length === 0) {
      return res.status(401).json({
        message: "Invalid email or password.",
        error: "INVALID_CREDENTIALS",
      });
    }

    const user = users[0];

    // Check if user is active
    if (user.is_active === false) {
      return res.status(403).json({
        message: "Account is disabled. Please contact support.",
        error: "ACCOUNT_DISABLED",
      });
    }

    // Verify password: prefer password_hash, fall back to legacy plaintext
    let passwordOk = false;
    if (user.password_hash) {
      try {
        passwordOk = await argon2.verify(user.password_hash, password);
      } catch (e) {
        console.error("Password verification error:", e);
        passwordOk = false;
      }
    } else if (user.password) {
      // DEPRECATED: Legacy plaintext storage - verify and migrate to hashed value
      // This should be removed after all accounts are migrated
      if (user.password === password) {
        passwordOk = true;
        console.warn(
          `SECURITY WARNING: User ${user.id} still using plaintext password. Migrating...`,
        );
        try {
          const newHash = await argon2.hash(password, {
            type: argon2.argon2id,
          });
          const patchUrl = `${NEON_API_URL}/users?id=eq.${encodeURIComponent(user.id)}`;
          await fetch(patchUrl, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password_hash: newHash, password: null }),
          }).catch((e) => {
            console.error(`Failed to migrate user ${user.id} password:`, e);
          });
        } catch (e) {
          console.error(`Failed to hash password for user ${user.id}:`, e);
        }
      }
    }

    if (!passwordOk) {
      return res.status(401).json({
        message: "Invalid email or password.",
        error: "INVALID_CREDENTIALS",
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role || "client",
      },
      SECRET,
      { expiresIn: "1d" },
    );

    // Generate refresh token
    const refreshToken = crypto.randomBytes(32).toString("hex");
    await refreshService.storeRefreshToken(refreshToken, user.id).catch((e) => {
      console.warn("Failed to store refresh token:", e);
    });

    // Set HttpOnly cookie for refresh token
    res.cookie("refresh_token", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
      maxAge: 30 * 24 * 3600 * 1000,
    });

    // Return success response
    return res.json({
      message: "Login successful.",
      user: {
        id: user.id,
        email: user.email,
        name: user.full_name,
        role: user.role,
        balance: user.balance,
        available_balance: user.available_balance,
      },
      token,
      access_token: token,
      refresh_token: refreshToken,
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({
      message: "Server error. Please try again later.",
      error: "INTERNAL_ERROR",
    });
  }
});

// Get current authenticated user
app.get("/auth/me", async (req, res) => {
  try {
    const authHeader = req.headers.authorization || "";
    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") {
      return res
        .status(401)
        .json({ message: "Missing or invalid Authorization header" });
    }
    const token = parts[1];
    let payload;
    try {
      payload = jwt.verify(token, SECRET);
    } catch (e) {
      return res.status(401).json({ message: "Invalid token" });
    }

    const userId = payload?.id;
    if (!userId)
      return res.status(400).json({ message: "Invalid token payload" });

    const url = `${NEON_API_URL}/users?id=eq.${encodeURIComponent(userId)}`;
    const response = await fetch(url);
    const users = await response.json();
    if (!Array.isArray(users) || users.length === 0)
      return res.status(404).json({ message: "User not found" });
    return res.json({ user: users[0] });
  } catch (err) {
    console.error("/auth/me error:", err);
    return res.status(500).json({ message: "Sunucu hatası." });
  }
});

// Refresh access token
app.post("/auth/refresh", async (req, res) => {
  try {
    const bodyToken = (req.body && req.body.refresh_token) || null;
    const cookieToken = req.cookies && req.cookies.refresh_token;
    const incoming = bodyToken || cookieToken || null;
    if (!incoming)
      return res.status(400).json({ message: "refresh_token is required" });

    // Look up refresh token in DB
    const row = await refreshService.findRefreshToken(incoming);
    if (!row || !row.user_id) {
      // clear cookie to remove bad token
      res.clearCookie("refresh_token");
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    const userId = row.user_id;
    // Issue new access token
    const accessToken = jwt.sign({ id: userId }, SECRET, { expiresIn: "1d" });
    // Rotate refresh token: store new then revoke old
    const newRefresh = crypto.randomBytes(32).toString("hex");
    await refreshService
      .storeRefreshToken(newRefresh, userId)
      .catch((e) => console.warn(e));
    await refreshService
      .deleteRefreshToken(incoming)
      .catch((e) => console.warn(e));

    // set HttpOnly cookie with new refresh token and clear any returned token in body
    res.cookie("refresh_token", newRefresh, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
      maxAge: 30 * 24 * 3600 * 1000,
    });

    return res.json({ access_token: accessToken, token: accessToken });
  } catch (err) {
    console.error("/auth/refresh error:", err);
    return res.status(500).json({ message: "Sunucu hatası." });
  }
});

// Logout - invalidate refresh token(s)
app.post("/auth/logout", async (req, res) => {
  try {
    const { refresh_token } = req.body || {};
    const cookieToken = req.cookies && req.cookies.refresh_token;
    if (refresh_token) {
      await refreshService
        .deleteRefreshToken(refresh_token)
        .catch((e) => console.warn(e));
      res.clearCookie("refresh_token");
      return res.json({ message: "Logged out" });
    }
    if (cookieToken) {
      await refreshService
        .deleteRefreshToken(cookieToken)
        .catch((e) => console.warn(e));
      res.clearCookie("refresh_token");
      return res.json({ message: "Logged out" });
    }

    // If no refresh_token provided, try to infer from Authorization header and remove all tokens for that user
    const authHeader = req.headers.authorization || "";
    const parts = authHeader.split(" ");
    if (parts.length === 2 && parts[0] === "Bearer") {
      try {
        const payload = jwt.verify(parts[1], SECRET);
        const userId = payload?.id;
        if (userId) {
          await refreshService
            .deleteRefreshTokensByUser(userId)
            .catch((e) => console.warn(e));
          return res.json({ message: "Logged out" });
        }
      } catch (e) {
        // ignore verify errors
      }
    }

    return res
      .status(400)
      .json({ message: "refresh_token or Authorization required" });
  } catch (err) {
    console.error("/auth/logout error:", err);
    return res.status(500).json({ message: "Sunucu hatası." });
  }
});
// Apply rate limit to auth-sensitive endpoints
app.post("/auth/register", rateLimit);
app.post("/auth/login", rateLimit);
app.post("/auth/refresh", rateLimit);

// Centralized error handler (last middleware)
app.use(errorHandler);
// -------- Neon proxy endpoints --------
// Provide /neon/* routes so the frontend can call neonService via backend.

// Register
app.post("/neon/register", async (req, res) => {
  try {
    const userData = req.body || {};
    const url = `${NEON_API_URL}/users`;
    const createResponse = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(userData),
    });
    if (!createResponse.ok) {
      const err = await createResponse.json().catch(() => ({}));
      return res
        .status(400)
        .json({ message: err.message || "Kayıt başarısız." });
    }
    const newUser = await createResponse.json();
    return res.status(201).json(newUser);
  } catch (err) {
    console.error("/neon/register error:", err);
    return res.status(500).json({ message: "Sunucu hatası." });
  }
});

// Login
app.post("/neon/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password)
      return res.status(400).json({ message: "email ve password zorunludur." });
    const url = `${NEON_API_URL}/users?email=eq.${encodeURIComponent(email)}&password=eq.${encodeURIComponent(password)}`;
    const response = await fetch(url);
    const users = await response.json();
    if (!Array.isArray(users) || users.length === 0)
      return res.status(401).json({ message: "Email veya şifre hatalı." });
    return res.json(users[0]);
  } catch (err) {
    console.error("/neon/login error:", err);
    return res.status(500).json({ message: "Sunucu hatası." });
  }
});

// Get user by id
app.get("/neon/user/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const url = `${NEON_API_URL}/users?id=eq.${encodeURIComponent(id)}`;
    const response = await fetch(url);
    const users = await response.json();
    if (!Array.isArray(users) || users.length === 0)
      return res.status(404).json({ message: "Kullanıcı bulunamadı." });
    return res.json(users[0]);
  } catch (err) {
    console.error("/neon/user error:", err);
    return res.status(500).json({ message: "Sunucu hatası." });
  }
});

// Instruments
app.get("/neon/instruments", async (req, res) => {
  try {
    const { group, enabled } = req.query;
    let url = `${NEON_API_URL}/instruments?order=sort_order.asc`;
    if (group) url += `&group_code=eq.${group}`;
    if (enabled === "1" || enabled === "true") url += `&is_enabled=eq.true`;
    const response = await fetch(url);
    const data = await response.json();
    return res.json({ items: data });
  } catch (err) {
    console.error("/neon/instruments error:", err);
    return res
      .status(500)
      .json({ message: "Enstrüman listesi alınırken hata oluştu." });
  }
});

// User positions
app.get("/neon/positions/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    const url = `${NEON_API_URL}/positions?user_id=eq.${encodeURIComponent(userId)}&order=open_time.desc`;
    const response = await fetch(url);
    const data = await response.json();
    return res.json({ items: data });
  } catch (err) {
    console.error("/neon/positions error:", err);
    return res
      .status(500)
      .json({ message: "Pozisyon verileri alınırken hata oluştu." });
  }
});

// User transactions
app.get("/neon/transactions/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    const url = `${NEON_API_URL}/transactions?user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc`;
    const response = await fetch(url);
    const data = await response.json();
    return res.json({ items: data });
  } catch (err) {
    console.error("/neon/transactions error:", err);
    return res
      .status(500)
      .json({ message: "İşlem verileri alınırken hata oluştu." });
  }
});

// White-label endpoints removed — this API no longer exposes white-label provisioning.
// Any previous calls to /white-labels should be migrated to platform-specific
// provisioning tooling or removed from the frontend.

// -------- Start server --------
const PORT = process.env.PORT || 4000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`API listening on port ${PORT}`);
  });
}

module.exports = app;
