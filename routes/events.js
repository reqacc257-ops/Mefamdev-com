/**
 * routes/events.js
 */
const router = require('express').Router();
const db = require('../db');
const { requireRole } = require('../middleware/auth');

// List events with attendance counts
router.get('/', (req, res) => {
  const events = db.prepare('SELECT * FROM events ORDER BY date DESC').all();
  const attData = {};
  db.prepare('SELECT event_id, app_id FROM event_attendance').all().forEach(r => {
    if (!attData[r.event_id]) attData[r.event_id] = [];
    attData[r.event_id].push(r.app_id);
  });
  res.json(events.map(e => ({ ...e, attendees: attData[e.id] || [] })));
});

// Create event
router.post('/', (req, res) => {
  const b = req.body;
  if (!b.name) return res.status(400).json({ error: 'Event name required' });
  const info = db.prepare(
    'INSERT INTO events (name, date, venue, max_att) VALUES (?, ?, ?, ?)'
  ).run(b.name, b.date || '', b.venue || '', b.max || 75);
  res.json({ ok: true, id: info.lastInsertRowid });
});

// Delete event
router.delete('/:id', requireRole('director','program'), (req, res) => {
  db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Save attendance for an event
router.put('/:id/attendance', (req, res) => {
  const eventId = parseInt(req.params.id);
  const appIds  = req.body.appIds || [];  // array of application IDs

  // Replace attendance for this event
  const del = db.prepare('DELETE FROM event_attendance WHERE event_id = ?');
  const ins = db.prepare('INSERT OR IGNORE INTO event_attendance (event_id, app_id) VALUES (?, ?)');
  db.transaction(() => {
    del.run(eventId);
    appIds.forEach(id => ins.run(eventId, id));
  })();
  res.json({ ok: true });
});

// Get absence log
router.get('/absences', (req, res) => {
  res.json(db.prepare('SELECT * FROM absences').all());
});
router.post('/absences', (req, res) => {
  const { appId, days, reason } = req.body;
  db.prepare(`
    INSERT INTO absences (app_id, days, reason) VALUES (?, ?, ?)
    ON CONFLICT(app_id) DO UPDATE SET
      days = days + excluded.days,
      reason = COALESCE(excluded.reason, absences.reason)
  `).run(appId, days || 1, reason || '');
  res.json({ ok: true });
});
router.delete('/absences/:appId', (req, res) => {
  db.prepare('DELETE FROM absences WHERE app_id = ?').run(req.params.appId);
  res.json({ ok: true });
});

// Grades
router.get('/grades', (req, res) => {
  res.json(db.prepare('SELECT * FROM grades').all());
});
router.put('/grades/:appId', (req, res) => {
  const { grade, semester } = req.body;
  db.prepare(`
    INSERT INTO grades (app_id, grade_val, semester, updated_at) VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(app_id) DO UPDATE SET grade_val = excluded.grade_val, semester = excluded.semester, updated_at = excluded.updated_at
  `).run(req.params.appId, grade, semester || '');
  res.json({ ok: true });
});

module.exports = router;
