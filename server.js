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
// HELPER FUNCTIONS
// ============================================

// Notify all admin users
const notifyAdmin = (db, type, title, message) => {
  const notification = {
    id: Date.now().toString(),
    type,
    title,
    message,
    read: false,
    createdAt: new Date().toISOString()
  };
  db.notifications.push(notification);
  console.log(`🔔 [ADMIN NOTIFICATION] ${title}: ${message}`);
};

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
      name: user.name,
      role: user.role,
      hangar: user.hangar || null
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
      role: user.role,
      hangar: user.hangar || null
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

// ============================================
// MANAGER ROUTES
// ============================================

// GET /managers - List all managers
app.get('/managers', (req, res) => {
  const db = getDb();
  // Return managers without passwords
  const managers = db.managers.map(m => {
    const { password, ...manager } = m;
    return manager;
  });
  res.json(managers);
});

// GET /managers/:id - Get manager by ID
app.get('/managers/:id', (req, res) => {
  const db = getDb();
  const manager = db.managers.find(m => m.id === req.params.id);
  if (!manager) {
    return res.status(404).json({ error: 'Gestionnaire non trouvé' });
  }
  const { password, ...managerData } = manager;
  res.json(managerData);
});

// POST /managers - Create new manager
app.post('/managers', (req, res) => {
  const { firstName, lastName, phone, email, hangar } = req.body;
  
  if (!firstName || !lastName || !phone || !email || !hangar) {
    return res.status(400).json({ 
      success: false,
      error: 'Tous les champs sont requis: prénom, nom, téléphone, email, hangar'
    });
  }

  const db = getDb();
  
  // Check if email already exists
  const existingManager = db.managers.find(m => m.email.toLowerCase() === email.toLowerCase());
  if (existingManager) {
    return res.status(400).json({ 
      success: false,
      error: 'Un gestionnaire avec cet email existe déjà'
    });
  }
  
  // Generate temporary password (8 characters)
  const tempPassword = Math.random().toString(36).slice(-8);
  
  // Create new manager
  const newManager = {
    id: Date.now().toString(),
    firstName,
    lastName,
    name: `${firstName} ${lastName}`,
    phone,
    email,
    hangar,
    password: tempPassword,
    isActive: true,
    createdAt: new Date().toISOString()
  };
  
  db.managers.push(newManager);
  
  // Add notification for admin
  const notification = {
    id: Date.now().toString(),
    type: 'manager_created',
    title: 'Nouveau gestionnaire créé',
    message: `${firstName} ${lastName} a été affecté au ${hangar}`,
    read: false,
    createdAt: new Date().toISOString()
  };
  db.notifications.push(notification);
  
  // Add audit log
  const auditLog = {
    id: Date.now().toString(),
    userId: 1,
    userName: 'Administrateur SODIPAS',
    action: 'CREATE_MANAGER',
    details: `Création du gestionnaire ${firstName} ${lastName} pour ${hangar}`,
    timestamp: new Date().toISOString()
  };
  db.auditLogs.push(auditLog);
  
  saveDb(db);
  
  // Simulate email sending
  console.log(`\n📧 === EMAIL DE CRÉATION DE COMPTE ===\n`);
  console.log(`À: ${email}`);
  console.log(`Sujet: Votre compte SODIPAS - Gestionnaire`);
  console.log(`\nBonjour ${firstName} ${lastName},\n`);
  console.log(`Votre compte gestionnaire a été créé.\n`);
  console.log(`Hangar affecté: ${hangar}`);
  console.log(`Email: ${email}`);
  console.log(`Mot de passe temporaire: ${tempPassword}`);
  console.log(`\nVeuillez vous connecter et changer votre mot de passe.\n`);
  console.log(`=========================================\n`);
  
  // Return manager without password
  const { password, ...managerData } = newManager;
  res.status(201).json({
    success: true,
    manager: managerData,
    message: `Email de création envoyé à ${email}`
  });
});

// PUT /managers/:id - Update manager
app.put('/managers/:id', (req, res) => {
  const db = getDb();
  const index = db.managers.findIndex(m => m.id === req.params.id);
  
  if (index === -1) {
    return res.status(404).json({ error: 'Gestionnaire non trouvé' });
  }
  
  const { firstName, lastName, phone, email, hangar, isActive } = req.body;
  
  // Update manager
  db.managers[index] = {
    ...db.managers[index],
    firstName: firstName || db.managers[index].firstName,
    lastName: lastName || db.managers[index].lastName,
    name: `${firstName || db.managers[index].firstName} ${lastName || db.managers[index].lastName}`,
    phone: phone || db.managers[index].phone,
    email: email || db.managers[index].email,
    hangar: hangar || db.managers[index].hangar,
    isActive: isActive !== undefined ? isActive : db.managers[index].isActive,
    updatedAt: new Date().toISOString()
  };
  
  // Add audit log
  const auditLog = {
    id: Date.now().toString(),
    userId: 1,
    userName: 'Administrateur SODIPAS',
    action: 'UPDATE_MANAGER',
    details: `Mise à jour du gestionnaire ${db.managers[index].name}`,
    timestamp: new Date().toISOString()
  };
  db.auditLogs.push(auditLog);
  
  saveDb(db);
  
  const { password, ...managerData } = db.managers[index];
  res.json(managerData);
});

// DELETE /managers/:id - Delete manager
app.delete('/managers/:id', (req, res) => {
  const db = getDb();
  const index = db.managers.findIndex(m => m.id === req.params.id);
  
  if (index === -1) {
    return res.status(404).json({ error: 'Gestionnaire non trouvé' });
  }
  
  const deleted = db.managers.splice(index, 1)[0];
  
  // Add audit log
  const auditLog = {
    id: Date.now().toString(),
    userId: 1,
    userName: 'Administrateur SODIPAS',
    action: 'DELETE_MANAGER',
    details: `Suppression du gestionnaire ${deleted.name}`,
    timestamp: new Date().toISOString()
  };
  db.auditLogs.push(auditLog);
  
  saveDb(db);
  
  res.json({ success: true, message: 'Gestionnaire supprimé' });
});

// ============================================
// USER MANAGEMENT ROUTES (Admin only)
// ============================================

// GET /users - List all users (without passwords)
app.get('/users', (req, res) => {
  const db = getDb();
  // Return users without sensitive data
  const users = db.users.map(u => {
    const { password, ...user } = u;
    return user;
  });
  res.json(users);
});

// GET /users/:id - Get user by ID
app.get('/users/:id', (req, res) => {
  const db = getDb();
  const user = db.users.find(u => u.id === parseInt(req.params.id));
  if (!user) {
    return res.status(404).json({ error: 'Utilisateur non trouvé' });
  }
  const { password, ...userData } = user;
  res.json(userData);
});

// POST /users/by-manager - Create cashier by manager (auto-assign hangar)
app.post('/users/by-manager', (req, res) => {
  const { managerId, firstName, lastName, phone, email } = req.body;
  
  if (!managerId || !firstName || !lastName || !phone || !email) {
    return res.status(400).json({ 
      success: false,
      error: 'Tous les champs sont requis: ID gestionnaire, prénom, nom, téléphone, email'
    });
  }

  const db = getDb();
  
  // Find the manager
  const manager = db.users.find(u => u.id === managerId && u.role === 'manager');
  if (!manager) {
    return res.status(404).json({ 
      success: false,
      error: 'Gestionnaire non trouvé'
    });
  }
  
  // Check if email already exists
  const existingUser = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (existingUser) {
    return res.status(400).json({ 
      success: false,
      error: 'Un utilisateur avec cet email existe déjà'
    });
  }
  
  // Generate temporary password (8 characters)
  const tempPassword = Math.random().toString(36).slice(-8);
  
  // Create new cashier with manager's hangar
  const newUser = {
    id: Date.now(),
    firstName,
    lastName,
    name: `${firstName} ${lastName}`,
    phone,
    email,
    hangar: manager.hangar || 'Non attribué',
    role: 'cashier',
    createdBy: managerId,
    isActive: true,
    createdAt: new Date().toISOString()
  };
  
  db.users.push(newUser);
  
  // Add notification for manager
  const notification = {
    id: Date.now().toString(),
    userId: managerId,
    type: 'cashier_created',
    title: 'Caissier créé',
    message: `${firstName} ${lastName} a été créé comme caissier (Hangar: ${manager.hangar || 'Non attribué'})`,
    read: false,
    createdAt: new Date().toISOString()
  };
  db.notifications.push(notification);
  
  // Add audit log
  const auditLog = {
    id: Date.now().toString(),
    userId: managerId,
    userName: manager.name,
    action: 'CREATE_CASHIER',
    details: `Création du caissier ${firstName} ${lastName} (Hangar: ${manager.hangar || 'Non attribué'})`,
    timestamp: new Date().toISOString()
  };
  db.auditLogs.push(auditLog);
  
  // Also notify admin
  notifyAdmin(db, 'cashier_created', 'Nouveau caissier créé', `${firstName} ${lastName} est devenu caissier du ${manager.hangar || 'Hangar non attribué'}`);
  
  saveDb(db);
  
  // Simulate email sending
  console.log(`\n📧 === CRÉATION DE CAISSIER ===\n`);
  console.log(`Gestionnaire: ${manager.name}`);
  console.log(`Nouveau caissier: ${firstName} ${lastName}`);
  console.log(`Email: ${email}`);
  console.log(`Hangar affecté: ${manager.hangar || 'Non attribué'}`);
  console.log(`Mot de passe temporaire: ${tempPassword}`);
  console.log(`=========================================\n`);
  
  // Return user without password
  const { password, ...userData } = newUser;
  res.status(201).json({
    success: true,
    user: userData,
    message: `Caissier ${firstName} ${lastName} créé avec succès au hangar ${manager.hangar || 'Non attribué'}`
  });
});

// POST /users - Create new user
app.post('/users', (req, res) => {
  const { firstName, lastName, phone, email, hangar, role } = req.body;
  
  if (!firstName || !lastName || !phone || !email || !role) {
    return res.status(400).json({ 
      success: false,
      error: 'Tous les champs sont requis: prénom, nom, téléphone, email, rôle'
    });
  }

  const db = getDb();
  
  // Check if email already exists
  const existingUser = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (existingUser) {
    return res.status(400).json({ 
      success: false,
      error: 'Un utilisateur avec cet email existe déjà'
    });
  }
  
  // Generate temporary password (8 characters)
  const tempPassword = Math.random().toString(36).slice(-8);
  
  // Create new user
  const newUser = {
    id: Date.now(),
    firstName,
    lastName,
    name: `${firstName} ${lastName}`,
    phone,
    email,
    hangar: hangar || null,
    role,
    isActive: true,
    createdAt: new Date().toISOString()
  };
  
  db.users.push(newUser);
  
  // Add notification for admin
  const notification = {
    id: Date.now().toString(),
    type: 'user_created',
    title: 'Nouvel utilisateur créé',
    message: `${firstName} ${lastName} (${role}) a été créé`,
    read: false,
    createdAt: new Date().toISOString()
  };
  db.notifications.push(notification);
  
  // Add audit log
  const auditLog = {
    id: Date.now().toString(),
    userId: 1,
    userName: 'Administrateur SODIPAS',
    action: 'CREATE_USER',
    details: `Création de l'utilisateur ${firstName} ${lastName} (${role})`,
    timestamp: new Date().toISOString()
  };
  db.auditLogs.push(auditLog);
  
  saveDb(db);
  
  // Simulate email sending
  console.log(`\n📧 === EMAIL DE CRÉATION DE COMPTE ===\n`);
  console.log(`À: ${email}`);
  console.log(`Sujet: Votre compte SODIPAS - ${role}`);
  console.log(`\nBonjour ${firstName} ${lastName},\n`);
  console.log(`Votre compte ${role} a été créé.\n`);
  if (hangar) console.log(`Hangar affecté: ${hangar}`);
  console.log(`Email: ${email}`);
  console.log(`Mot de passe temporaire: ${tempPassword}`);
  console.log(`\nVeuillez vous connecter et changer votre mot de passe.\n`);
  console.log(`=========================================\n`);
  
  // Return user without password
  const { password, ...userData } = newUser;
  res.status(201).json({
    success: true,
    user: userData,
    message: `Email de création envoyé à ${email}`
  });
});

// PUT /users/:id - Update user
app.put('/users/:id', (req, res) => {
  const db = getDb();
  const index = db.users.findIndex(u => u.id === parseInt(req.params.id));
  
  if (index === -1) {
    return res.status(404).json({ error: 'Utilisateur non trouvé' });
  }
  
  const { firstName, lastName, phone, email, hangar, role, isActive } = req.body;
  
  // Update user
  db.users[index] = {
    ...db.users[index],
    firstName: firstName || db.users[index].firstName,
    lastName: lastName || db.users[index].lastName,
    name: `${firstName || db.users[index].firstName} ${lastName || db.users[index].lastName}`,
    phone: phone || db.users[index].phone,
    email: email || db.users[index].email,
    hangar: hangar !== undefined ? hangar : db.users[index].hangar,
    role: role || db.users[index].role,
    isActive: isActive !== undefined ? isActive : db.users[index].isActive,
    updatedAt: new Date().toISOString()
  };
  
  // Add audit log
  const auditLog = {
    id: Date.now().toString(),
    userId: 1,
    userName: 'Administrateur SODIPAS',
    action: 'UPDATE_USER',
    details: `Mise à jour de l'utilisateur ${db.users[index].name}`,
    timestamp: new Date().toISOString()
  };
  db.auditLogs.push(auditLog);
  
  saveDb(db);
  
  const { password, ...userData } = db.users[index];
  res.json(userData);
});

// DELETE /users/:id - Delete user
app.delete('/users/:id', (req, res) => {
  const db = getDb();
  const index = db.users.findIndex(u => u.id === parseInt(req.params.id));
  
  if (index === -1) {
    return res.status(404).json({ error: 'Utilisateur non trouvé' });
  }
  
  const deleted = db.users.splice(index, 1)[0];
  
  // Add audit log
  const auditLog = {
    id: Date.now().toString(),
    userId: 1,
    userName: 'Administrateur SODIPAS',
    action: 'DELETE_USER',
    details: `Suppression de l'utilisateur ${deleted.name}`,
    timestamp: new Date().toISOString()
  };
  db.auditLogs.push(auditLog);
  
  saveDb(db);
  
  res.json({ success: true, message: 'Utilisateur supprimé' });
});

// ============================================
// NOTIFICATIONS & AUDIT LOG ROUTES
// ============================================

// GET /notifications - Get all notifications
app.get('/notifications', (req, res) => {
  const db = getDb();
  const notifications = db.notifications || [];
  res.json(notifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

// PUT /notifications/:id/read - Mark notification as read
app.put('/notifications/:id/read', (req, res) => {
  const db = getDb();
  const index = db.notifications.findIndex(n => n.id === req.params.id);
  
  if (index !== -1) {
    db.notifications[index].read = true;
    saveDb(db);
  }
  
  res.json({ success: true });
});

// PUT /notifications/read-all - Mark all notifications as read
app.put('/notifications/read-all', (req, res) => {
  const db = getDb();
  db.notifications.forEach(n => n.read = true);
  saveDb(db);
  res.json({ success: true });
});

// GET /audit-logs - Get audit logs
app.get('/audit-logs', (req, res) => {
  const db = getDb();
  const logs = db.auditLogs || [];
  res.json(logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)));
});

// POST /audit-logs - Add audit log entry
app.post('/audit-logs', (req, res) => {
  const { userId, userName, action, details } = req.body;
  
  const db = getDb();
  const log = {
    id: Date.now().toString(),
    userId,
    userName,
    action,
    details,
    timestamp: new Date().toISOString()
  };
  
  db.auditLogs.push(log);
  saveDb(db);
  
  // Also add to notifications if it's an important action
  const importantActions = ['CREATE_CLIENT', 'CREATE_INVOICE', 'CREATE_PAYMENT', 'DELETE_CLIENT'];
  if (importantActions.includes(action)) {
    const notification = {
      id: Date.now().toString(),
      type: action.toLowerCase(),
      title: action.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase()),
      message: details,
      read: false,
      createdAt: new Date().toISOString()
    };
    db.notifications.push(notification);
    saveDb(db);
  }
  
  res.status(201).json(log);
});

// GET /hangars - Get list of hangars
app.get('/hangars', (req, res) => {
  res.json(['Hangar 1', 'Hangar 2', 'Hangar 3']);
});

// GET /stocks - Get all stocks (filtered by user role)
app.get('/stocks', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: "Non authentifié" });
  }
  
  const token = authHeader.substring(7);
  const db = getDb();
  const session = db.sessions.find(s => s.token === token);
  
  if (!session) {
    return res.status(401).json({ success: false, message: "Session invalide" });
  }
  
  const user = db.users.find(u => u.id === session.userId);
  if (!user) {
    return res.status(401).json({ success: false, message: "Utilisateur non trouvé" });
  }
  
  const stocks = db.stocks || [];
  
  // Filter by hangar for non-admin users
  let filteredStocks = stocks;
  if (user.role !== 'admin' && user.hangar) {
    filteredStocks = stocks.filter(s => s.hangar === user.hangar);
  }
  
  res.json({ success: true, stocks: filteredStocks });
});

// ============================================
// TRUCK REGISTRATION ROUTES
// ============================================

// GET /trucks - Get all trucks (filtered by user role)
app.get('/trucks', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: "Non authentifié" });
  }
  
  const token = authHeader.substring(7);
  const db = getDb();
  const session = db.sessions.find(s => s.token === token);
  
  if (!session) {
    return res.status(401).json({ success: false, message: "Session invalide" });
  }
  
  const user = db.users.find(u => u.id === session.userId);
  if (!user) {
    return res.status(401).json({ success: false, message: "Utilisateur non trouvé" });
  }
  
  const trucks = db.trucks || [];
  
  // Filter by hangar for non-admin users
  let filteredTrucks = trucks;
  if (user.role !== 'admin' && user.hangar) {
    filteredTrucks = trucks.filter(t => t.hangar === user.hangar);
  }
  
  res.json(filteredTrucks);
});

// GET /trucks/:id - Get single truck
app.get('/trucks/:id', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: "Non authentifié" });
  }
  
  const token = authHeader.substring(7);
  const db = getDb();
  const session = db.sessions.find(s => s.token === token);
  
  if (!session) {
    return res.status(401).json({ success: false, message: "Session invalide" });
  }
  
  const user = db.users.find(u => u.id === session.userId);
  const trucks = db.trucks || [];
  const truck = trucks.find(t => t.id === req.params.id);
  
  if (!truck) {
    return res.status(404).json({ success: false, message: "Camion non trouvé" });
  }
  
  res.json(truck);
});

// POST /trucks - Register a new truck
app.post('/trucks', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: "Non authentifié" });
  }
  
  const token = authHeader.substring(7);
  const db = getDb();
  const session = db.sessions.find(s => s.token === token);
  
  if (!session) {
    return res.status(401).json({ success: false, message: "Session invalide" });
  }
  
  const user = db.users.find(u => u.id === session.userId);
  if (!user || (user.role !== 'admin' && user.role !== 'manager')) {
    return res.status(403).json({ success: false, message: "Accès refusé" });
  }
  
  const { origin, driver, phone, articles, value, hangar, observations } = req.body;
  
  if (!origin || !driver || !phone || !articles || !hangar) {
    return res.status(400).json({ 
      success: false, 
      message: "Les champs requis: origine, chauffeur, téléphone, articles, hangar" 
    });
  }
  
  const newTruck = {
    id: `TRK-${Date.now()}`,
    origin,
    driver,
    phone,
    articles: Array.isArray(articles) ? articles : [articles],
    value: value || 0,
    hangar,
    status: 'registered',
    observations: observations || '',
    registeredBy: user.name,
    registeredAt: new Date().toISOString(),
    arrivedAt: null,
    unloadedAt: null
  };
  
  if (!db.trucks) db.trucks = [];
  db.trucks.push(newTruck);
  
  // Add articles to stock
  if (articles && Array.isArray(articles) && articles.length > 0) {
    if (!db.stocks) db.stocks = [];
    
    articles.forEach(article => {
      if (article.name && article.quantity > 0) {
        // Check if article already exists in stock for this hangar
        const existingStock = db.stocks.find(
          s => s.name === article.name && s.hangar === hangar
        );
        
        if (existingStock) {
          // Update existing stock
          existingStock.quantity += article.quantity;
          existingStock.totalValue += (article.unitPrice * article.quantity);
          existingStock.updatedAt = new Date().toISOString();
          existingStock.lastTruckId = newTruck.id;
        } else {
          // Create new stock entry
          const newStock = {
            id: `STK-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: article.name,
            quantity: article.quantity,
            unit: article.unit || 'cageots',
            unitPrice: article.unitPrice || 0,
            totalValue: (article.unitPrice || 0) * article.quantity,
            hangar,
            origin: newTruck.origin,
            truckId: newTruck.id,
            driver: newTruck.driver,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            lastTruckId: newTruck.id
          };
          db.stocks.push(newStock);
        }
      }
    });
    
    console.log(`\n📦 === ARTICLES AJOUTÉS AU STOCK ===\n`);
    console.log(`Camion: ${driver} (${origin})`);
    console.log(`Hangar: ${hangar}`);
    console.log(`Articles: ${articles.length}`);
    articles.forEach(a => {
      console.log(`  - ${a.name}: ${a.quantity} ${a.unit} @ ${a.unitPrice} F = ${(a.unitPrice * a.quantity).toLocaleString()} F`);
    });
    console.log(`================================\n`);
  }
  
  // Notify admin
  notifyAdmin(db, 'truck_registered', 'Nouveau camion enregistré', `${driver} (${origin}) - Affecté au ${hangar}`);
  
  // Add audit log
  const auditLog = {
    id: Date.now().toString(),
    userId: user.id,
    userName: user.name,
    action: 'TRUCK_REGISTERED',
    details: `Enregistrement du camion ${driver} (${origin}) au ${hangar}`,
    timestamp: new Date().toISOString()
  };
  db.auditLogs.push(auditLog);
  
  saveDb(db);
  
  res.status(201).json({ success: true, truck: newTruck });
});

// PUT /trucks/:id/status - Update truck status (arrived, unloading, unloaded)
app.put('/trucks/:id/status', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: "Non authentifié" });
  }
  
  const token = authHeader.substring(7);
  const db = getDb();
  const session = db.sessions.find(s => s.token === token);
  
  if (!session) {
    return res.status(401).json({ success: false, message: "Session invalide" });
  }
  
  const user = db.users.find(u => u.id === session.userId);
  if (!user || (user.role !== 'admin' && user.role !== 'manager')) {
    return res.status(403).json({ success: false, message: "Accès refusé" });
  }
  
  const trucks = db.trucks || [];
  const truckIndex = trucks.findIndex(t => t.id === req.params.id);
  
  if (truckIndex === -1) {
    return res.status(404).json({ success: false, message: "Camion non trouvé" });
  }
  
  const { status } = req.body;
  const validStatuses = ['registered', 'arrived', 'unloading', 'unloaded'];
  
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ success: false, message: "Statut invalide" });
  }
  
  trucks[truckIndex].status = status;
  
  if (status === 'arrived') {
    trucks[truckIndex].arrivedAt = new Date().toISOString();
  } else if (status === 'unloaded') {
    trucks[truckIndex].unloadedAt = new Date().toISOString();
  }
  
  db.trucks = trucks;
  
  // Notify admin
  notifyAdmin(db, 'truck_status', 'Statut camion mis à jour', `${trucks[truckIndex].driver} - Statut: ${status}`);
  
  saveDb(db);
  
  res.json({ success: true, truck: trucks[truckIndex] });
});

// POST /trucks/:id/unload - Unload truck and update stock
app.post('/trucks/:id/unload', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: "Non authentifié" });
  }
  
  const token = authHeader.substring(7);
  const db = getDb();
  const session = db.sessions.find(s => s.token === token);
  
  if (!session) {
    return res.status(401).json({ success: false, message: "Session invalide" });
  }
  
  const user = db.users.find(u => u.id === session.userId);
  if (!user || (user.role !== 'admin' && user.role !== 'manager')) {
    return res.status(403).json({ success: false, message: "Accès refusé" });
  }
  
  const trucks = db.trucks || [];
  const stocks = db.stocks || [];
  const truckIndex = trucks.findIndex(t => t.id === req.params.id);
  
  if (truckIndex === -1) {
    return res.status(404).json({ success: false, message: "Camion non trouvé" });
  }
  
  const truck = trucks[truckIndex];
  const { items } = req.body; // Array of { name, quantity, unit }
  
  if (!items || !Array.isArray(items)) {
    return res.status(400).json({ success: false, message: "Articles requis" });
  }
  
  // Update truck status
  trucks[truckIndex].status = 'unloaded';
  trucks[truckIndex].unloadedAt = new Date().toISOString();
  trucks[truckIndex].unloadedBy = user.name;
  
  // Update or create stock items
  const stockUpdates = [];
  items.forEach(item => {
    const existingStock = stocks.find(s => s.name === item.name && s.hangar === truck.hangar);
    
    if (existingStock) {
      existingStock.quantity += item.quantity;
      existingStock.value = existingStock.quantity * (existingStock.value / (existingStock.quantity - item.quantity));
      stockUpdates.push({ ...existingStock, action: 'updated' });
    } else {
      const newStockItem = {
        id: `STK-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: item.name,
        hangar: truck.hangar,
        quantity: item.quantity,
        unit: item.unit || 'cageots',
        threshold: 50,
        value: item.value || (item.quantity * 5000)
      };
      stocks.push(newStockItem);
      stockUpdates.push({ ...newStockItem, action: 'created' });
    }
  });
  
  db.trucks = trucks;
  db.stocks = stocks;
  
  // Notify admin
  notifyAdmin(db, 'truck_unloaded', 'Camion déchargé', `${truck.driver} déchargé au ${truck.hangar} - ${items.length} article(s)`);
  
  // Add audit log
  const auditLog = {
    id: Date.now().toString(),
    userId: user.id,
    userName: user.name,
    action: 'TRUCK_UNLOADED',
    details: `Déchargement du camion ${truck.driver} (${truck.origin}) au ${truck.hangar}`,
    timestamp: new Date().toISOString()
  };
  db.auditLogs.push(auditLog);
  
  saveDb(db);
  
  res.json({ 
    success: true, 
    truck: trucks[truckIndex], 
    stockUpdates 
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
      phone: user.phone,
      hangar: user.hangar || null
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
// CASHIER SPECIFIC ROUTES
// ============================================

// GET /cashier/transactions - Get transactions for a cashier's hangar
app.get('/cashier/transactions', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: "Non authentifié" });
  }
  
  const token = authHeader.substring(7);
  const db = getDb();
  const session = db.sessions.find(s => s.token === token);
  
  if (!session) {
    return res.status(401).json({ success: false, message: "Session invalide" });
  }
  
  const user = db.users.find(u => u.id === session.userId);
  if (!user || user.role !== 'cashier') {
    return res.status(403).json({ success: false, message: "Accès refusé" });
  }
  
  // Get transactions filtered by hangar
  const transactions = db.transactions || [];
  const cashierTransactions = transactions.filter(t => t.hangar === user.hangar);
  
  res.json(cashierTransactions);
});

// POST /cashier/transactions - Create a new transaction
app.post('/cashier/transactions', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: "Non authentifié" });
  }
  
  const token = authHeader.substring(7);
  const db = getDb();
  const session = db.sessions.find(s => s.token === token);
  
  if (!session) {
    return res.status(401).json({ success: false, message: "Session invalide" });
  }
  
  const user = db.users.find(u => u.id === session.userId);
  if (!user || user.role !== 'cashier') {
    return res.status(403).json({ success: false, message: "Accès refusé" });
  }
  
  const { type, clientId, clientName, amount, description, reference } = req.body;
  
  if (!type || !clientId) {
    return res.status(400).json({ success: false, message: "Données incomplètes" });
  }
  
  const transaction = {
    id: `TX-${Date.now()}`,
    cashierId: user.id,
    cashierName: user.name,
    type,
    clientId,
    clientName: clientName || '',
    amount: amount || 0,
    description: description || '',
    reference: reference || '',
    hangar: user.hangar,
    status: 'completed',
    createdAt: new Date().toISOString()
  };
  
  if (!db.transactions) db.transactions = [];
  db.transactions.push(transaction);
  
  // Add audit log
  const auditLog = {
    id: Date.now().toString(),
    userId: user.id,
    userName: user.name,
    action: 'CREATE_TRANSACTION',
    details: `Transaction ${type}: ${description || ''} pour ${clientName || clientId}`,
    timestamp: new Date().toISOString()
  };
  db.auditLogs.push(auditLog);
  
  // Notify admin about the transaction
  const typeLabels = {
    payment: 'Paiement',
    invoice: 'Facture',
    cageots: 'Retour de cageots'
  };
  notifyAdmin(db, 'transaction', 'Nouvelle transaction', `${user.name} a effectué un(e) ${typeLabels[type] || type}: ${amount || 0} F pour ${clientName || clientId}`);
  
  saveDb(db);
  
  res.status(201).json({ success: true, transaction });
});

// GET /cashier/closure - Get today's closure status
app.get('/cashier/closure', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: "Non authentifié" });
  }
  
  const token = authHeader.substring(7);
  const db = getDb();
  const session = db.sessions.find(s => s.token === token);
  
  if (!session) {
    return res.status(401).json({ success: false, message: "Session invalide" });
  }
  
  const user = db.users.find(u => u.id === session.userId);
  if (!user || user.role !== 'cashier') {
    return res.status(403).json({ success: false, message: "Accès refusé" });
  }
  
  const today = new Date().toISOString().split('T')[0];
  const closures = db.closures || [];
  const todayClosure = closures.find(c => c.cashierId === user.id && c.date === today);
  
  res.json(todayClosure || { status: 'open', date: today, cashierId: user.id, hangar: user.hangar });
});

// POST /cashier/closure - Close the day
app.post('/cashier/closure', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: "Non authentifié" });
  }
  
  const token = authHeader.substring(7);
  const db = getDb();
  const session = db.sessions.find(s => s.token === token);
  
  if (!session) {
    return res.status(401).json({ success: false, message: "Session invalide" });
  }
  
  const user = db.users.find(u => u.id === session.userId);
  if (!user || user.role !== 'cashier') {
    return res.status(403).json({ success: false, message: "Accès refusé" });
  }
  
  const today = new Date().toISOString().split('T')[0];
  const closures = db.closures || [];
  const existingClosure = closures.find(c => c.cashierId === user.id && c.date === today);
  
  if (existingClosure && existingClosure.status === 'closed') {
    return res.status(400).json({ success: false, message: "La journée est déjà clôturée" });
  }
  
  // Calculate totals from transactions
  const transactions = (db.transactions || []).filter(t => 
    t.cashierId === user.id && t.createdAt.startsWith(today)
  );
  
  const totalAmount = transactions
    .filter(t => t.type === 'payment')
    .reduce((sum, t) => sum + t.amount, 0);
  
  const totalTransactions = transactions.length;
  
  const closure = {
    id: `CL-${today}-${user.id}`,
    cashierId: user.id,
    cashierName: user.name,
    hangar: user.hangar,
    date: today,
    openingTime: existingClosure?.openingTime || new Date().toISOString(),
    closingTime: new Date().toISOString(),
    totalTransactions,
    totalAmount,
    status: 'closed',
    notes: req.body.notes || '',
    createdAt: new Date().toISOString()
  };
  
  // Update or create closure
  const closureIndex = closures.findIndex(c => c.cashierId === user.id && c.date === today);
  if (closureIndex >= 0) {
    closures[closureIndex] = closure;
  } else {
    closures.push(closure);
  }
  
  db.closures = closures;
  
  // Add audit log
  const auditLog = {
    id: Date.now().toString(),
    userId: user.id,
    userName: user.name,
    action: 'DAY_CLOSURE',
    details: `Clôture de la journée - ${totalTransactions} transactions, total: ${totalAmount} F`,
    timestamp: new Date().toISOString()
  };
  db.auditLogs.push(auditLog);
  
  // Notify admin about the closure
  notifyAdmin(db, 'closure', 'Clôture de caisse', `${user.name} (${user.hangar}) a clôturé la journée: ${totalTransactions} transactions, total: ${totalAmount} F`);
  
  saveDb(db);
  
  res.json({ success: true, closure });
});

// GET /cashier/dashboard - Get dashboard data for cashier
app.get('/cashier/dashboard', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: "Non authentifié" });
  }
  
  const token = authHeader.substring(7);
  const db = getDb();
  const session = db.sessions.find(s => s.token === token);
  
  if (!session) {
    return res.status(401).json({ success: false, message: "Session invalide" });
  }
  
  const user = db.users.find(u => u.id === session.userId);
  if (!user || user.role !== 'cashier') {
    return res.status(403).json({ success: false, message: "Accès refusé" });
  }
  
  const today = new Date().toISOString().split('T')[0];
  
  // Get clients for this hangar
  const clients = (db.clients || []).filter(c => c.hangar === user.hangar || true); // In production, filter by hangar
  
  // Get today's transactions
  const transactions = (db.transactions || []).filter(t => 
    t.cashierId === user.id && t.createdAt.startsWith(today)
  );
  
  // Calculate stats
  const todayRevenue = transactions
    .filter(t => t.type === 'payment')
    .reduce((sum, t) => sum + t.amount, 0);
  
  const pendingDebt = clients.reduce((sum, c) => sum + (c.debt || 0), 0);
  const totalCageots = clients.reduce((sum, c) => sum + (c.cageots || 0), 0);
  
  // Check closure status
  const closures = db.closures || [];
  const todayClosure = closures.find(c => c.cashierId === user.id && c.date === today);
  
  res.json({
    success: true,
    data: {
      cashier: {
        id: user.id,
        name: user.name,
        hangar: user.hangar
      },
      stats: {
        todayRevenue,
        todayTransactions: transactions.length,
        pendingDebt,
        totalCageots
      },
      closure: todayClosure || { status: 'open', date: today },
      recentTransactions: transactions.slice(-10).reverse(),
      clients: clients.slice(0, 20)
    }
  });
});

// GET /clients/hangar/:hangarName - Get clients by hangar
app.get('/clients/hangar/:hangarName', (req, res) => {
  const db = getDb();
  const clients = db.clients || [];
  const hangarClients = clients.filter(c => c.hangar === req.params.hangarName || c.hangar === `Hangar ${req.params.hangarName}`);
  res.json(hangarClients);
});

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
║   GET  /notifications     - List notifications           ║
║   GET  /audit-logs        - List audit logs              ║
║   GET  /hangars           - List hangars                 ║
║                                                           ║
║   Demo accounts:                                          ║
║   • admin@sodipas.sn                                     ║
║   • gestionnaire@sodipas.sn                              ║
║   • demo@sodipas.sn                                      ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
});
