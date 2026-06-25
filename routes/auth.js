/**
 * routes/auth.js
 * POST /api/auth/login   — staff login (username + password)
 * POST /api/auth/applicant — applicant portal login (ref no + name)
 */

const router = require('express').Router();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../db');

const JWT_SECRET  = process.env.JWT_SECRET  || 'mefamdev-secret-change-in-production';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '8h';

function hashPassword(pw) {
  return crypto.createHash('sha256').update(pw).digest('hex');
}

// ── Staff login ───────────────────────────────────────────────────────────────
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const staff = db.prepare('SELECT * FROM staff WHERE username = ?').get(username.toLowerCase().trim());
  if (!staff || staff.password !== hashPassword(password)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const payload = {
    type: 'staff',
    id: staff.id,
    username: staff.username,
    role: staff.role,
    name: staff.name,
    title: staff.title,
    initials: staff.initials,
  };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
  res.json({ token, user: payload });
});

// ── Applicant portal login ────────────────────────────────────────────────────
router.post('/applicant', (req, res) => {
  const { refNo, name } = req.body;
  if (!refNo) return res.status(400).json({ error: 'Reference number required' });

  // Accept "APP-1001" or just "1001"
  const cleanId = String(refNo).replace(/^app-/i, '').trim();
  const app = db.prepare('SELECT id, name, status, school, grade, sy FROM applications WHERE id = ?').get(cleanId);

  if (!app) return res.status(404).json({ error: 'Application not found' });

  // Lenient name check (if provided)
  if (name && name.trim().length > 2) {
    const fn = app.name.toLowerCase();
    const parts = fn.split(/[\s,]+/);
    const input = name.trim().toLowerCase();
    const match = parts.some(p => p && input.includes(p)) || fn.includes(input);
    if (!match) return res.status(401).json({ error: 'Name does not match application on file' });
  }

  const payload = { type: 'applicant', appId: app.id, name: app.name };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
  res.json({ token, user: payload });
});

// ── Change staff password ─────────────────────────────────────────────────────
router.post('/change-password', require('../middleware/auth').requireAuth, (req, res) => {
  if (req.user.type !== 'staff') return res.status(403).json({ error: 'Staff only' });
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) return res.status(400).json({ error: 'Both passwords required' });

  const staff = db.prepare('SELECT * FROM staff WHERE id = ?').get(req.user.id);
  if (staff.password !== hashPassword(oldPassword)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  db.prepare('UPDATE staff SET password = ? WHERE id = ?').run(hashPassword(newPassword), req.user.id);
  res.json({ ok: true });
});

module.exports = router;
