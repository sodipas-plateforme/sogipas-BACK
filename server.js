import express from 'express';
import cors from 'cors';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Helper to read/write db
const getDb = () => JSON.parse(readFileSync(join(__dirname, 'db.json'), 'utf-8'));
const saveDb = (db) => writeFileSync(join(__dirname, 'db.json'), JSON.stringify(db, null, 2));

// Generate random 6-digit OTP
const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

// Generate simple token
const generateToken = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 64; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
};

// Custom logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// ============================================
// AUTH ROUTES
// ============================================

// POST /auth/login - Step 1: Email verification
app.post('/auth/login', (req, res) => {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({
      success: false,
      message: "L'adresse email est requise"
    });
  }

  const db = getDb();
  const user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());

  if (!user) {
    return res.status(401).json({
      success: false,
      message: "Cette adresse email n'est pas enregistrée. Contactez votre administrateur."
    });
  }

  // Generate OTP
  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

  // Remove any existing OTP for this user
  db.otpCodes = db.otpCodes.filter(o => o.email !== email);

  // Store new OTP
  db.otpCodes.push({
    email: user.email,
    otp,
    expiresAt,
    createdAt: new Date().toISOString()
  });

  saveDb(db);

  // In production, send email here
  console.log(`\n📧 OTP for ${email}: ${otp}\n`);

  return res.json({
    success: true,
    requiresOtp: true,
    user: {
      id: user.id,
      email: user.email,
      role: user.role
    },
    // For demo purposes only - remove in production!
    _debug_otp: otp
  });
});

// POST /auth/verify-otp - Step 2: OTP verification
app.post('/auth/verify-otp', (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({
      success: false,
      message: "Email et code OTP requis"
    });
  }

  const db = getDb();
  const storedOtp = db.otpCodes.find(o => o.email.toLowerCase() === email.toLowerCase());

  if (!storedOtp) {
    return res.status(401).json({
      success: false,
      message: "Aucun code en attente pour cet email. Veuillez recommencer."
    });
  }

  // Check expiration
  if (new Date(storedOtp.expiresAt) < new Date()) {
    // Remove expired OTP
    db.otpCodes = db.otpCodes.filter(o => o.email !== email);
    saveDb(db);

    return res.status(401).json({
      success: false,
      message: "Le code a expiré. Veuillez en demander un nouveau."
    });
  }

  // Verify OTP
  if (storedOtp.otp !== otp) {
    return res.status(401).json({
      success: false,
      message: "Code incorrect. Veuillez réessayer."
    });
  }

  // OTP is valid - create session
  const user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  const token = generateToken();

  // Remove used OTP
  db.otpCodes = db.otpCodes.filter(o => o.email !== email);

  // Create session
  db.sessions.push({
    token,
    userId: user.id,
    email: user.email,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
  });

  saveDb(db);

  return res.json({
    success: true,
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role
    }
  });
});

// POST /auth/resend-otp - Resend OTP code
app.post('/auth/resend-otp', (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      success: false,
      message: "L'adresse email est requise"
    });
  }

  const db = getDb();
  const user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());

  if (!user) {
    return res.status(401).json({
      success: false,
      message: "Email non reconnu"
    });
  }

  // Generate new OTP
  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  // Remove any existing OTP for this user
  db.otpCodes = db.otpCodes.filter(o => o.email !== email);

  // Store new OTP
  db.otpCodes.push({
    email: user.email,
    otp,
    expiresAt,
    createdAt: new Date().toISOString()
  });

  saveDb(db);

  console.log(`\n📧 New OTP for ${email}: ${otp}\n`);

  return res.json({
    success: true,
    message: "Un nouveau code a été envoyé",
    _debug_otp: otp
  });
});

// POST /auth/logout - Logout
app.post('/auth/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const db = getDb();
    db.sessions = db.sessions.filter(s => s.token !== token);
    saveDb(db);
  }

  return res.json({
    success: true,
    message: "Déconnexion réussie"
  });
});

// GET /auth/me - Get current user
app.get('/auth/me', (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: "Non authentifié"
    });
  }

  const token = authHeader.substring(7);
  const db = getDb();
  const session = db.sessions.find(s => s.token === token);

  if (!session) {
    return res.status(401).json({
      success: false,
      message: "Session invalide"
    });
  }

  // Check session expiration
  if (new Date(session.expiresAt) < new Date()) {
    db.sessions = db.sessions.filter(s => s.token !== token);
    saveDb(db);

    return res.status(401).json({
      success: false,
      message: "Session expirée"
    });
  }

  const user = db.users.find(u => u.id === session.userId);

  if (!user) {
    return res.status(401).json({
      success: false,
      message: "Utilisateur non trouvé"
    });
  }

  return res.json({
    success: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      phone: user.phone
    }
  });
});

// ============================================
// REST API ROUTES
// ============================================

// Generic CRUD for resources
const createCrudRoutes = (resourceName) => {
  // GET all
  app.get(`/${resourceName}`, (req, res) => {
    const db = getDb();
    res.json(db[resourceName] || []);
  });

  // GET by id
  app.get(`/${resourceName}/:id`, (req, res) => {
    const db = getDb();
    const item = (db[resourceName] || []).find(i => i.id === req.params.id || i.id === parseInt(req.params.id));
    if (!item) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.json(item);
  });

  // POST create
  app.post(`/${resourceName}`, (req, res) => {
    const db = getDb();
    if (!db[resourceName]) db[resourceName] = [];
    
    const newItem = {
      id: Date.now().toString(),
      ...req.body,
      createdAt: new Date().toISOString()
    };
    
    db[resourceName].push(newItem);
    saveDb(db);
    res.status(201).json(newItem);
  });

  // PUT update
  app.put(`/${resourceName}/:id`, (req, res) => {
    const db = getDb();
    const index = (db[resourceName] || []).findIndex(i => i.id === req.params.id || i.id === parseInt(req.params.id));
    
    if (index === -1) {
      return res.status(404).json({ error: 'Not found' });
    }
    
    db[resourceName][index] = {
      ...db[resourceName][index],
      ...req.body,
      updatedAt: new Date().toISOString()
    };
    
    saveDb(db);
    res.json(db[resourceName][index]);
  });

  // DELETE
  app.delete(`/${resourceName}/:id`, (req, res) => {
    const db = getDb();
    const index = (db[resourceName] || []).findIndex(i => i.id === req.params.id || i.id === parseInt(req.params.id));
    
    if (index === -1) {
      return res.status(404).json({ error: 'Not found' });
    }
    
    const deleted = db[resourceName].splice(index, 1)[0];
    saveDb(db);
    res.json(deleted);
  });
};

// Create CRUD routes for all resources
createCrudRoutes('users');
createCrudRoutes('clients');
createCrudRoutes('trucks');
createCrudRoutes('stocks');

// ============================================
// START SERVER
// ============================================

const PORT = process.env.PORT || 3002;

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🚀 SODIPAS Backend API Server                          ║
║                                                           ║
║   Server running at: http://localhost:${PORT}              ║
║                                                           ║
║   Available endpoints:                                    ║
║   ────────────────────────────────────────────────────   ║
║   POST /auth/login        - Login with email             ║
║   POST /auth/verify-otp   - Verify OTP code              ║
║   POST /auth/resend-otp   - Resend OTP code              ║
║   POST /auth/logout       - Logout                       ║
║   GET  /auth/me           - Get current user             ║
║   ────────────────────────────────────────────────────   ║
║   GET  /users             - List users                   ║
║   GET  /clients           - List clients                 ║
║   GET  /trucks            - List trucks                  ║
║   GET  /stocks            - List stocks                  ║
║                                                           ║
║   Demo accounts:                                          ║
║   • admin@sodipas.sn                                     ║
║   • gestionnaire@sodipas.sn                              ║
║   • demo@sodipas.sn                                      ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
});
