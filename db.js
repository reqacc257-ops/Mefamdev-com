/**
 * db.js — SQLite database setup
 * Uses better-sqlite3 (synchronous, no callback hell)
 *
 * Install: npm install better-sqlite3
 * The database file mefamdev.db is created automatically.
 */

const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'mefamdev.db');
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Schema ────────────────────────────────────────────────────────────────────
db.exec(`
  /* ── Staff accounts ── */
  CREATE TABLE IF NOT EXISTS staff (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    username  TEXT NOT NULL UNIQUE,
    password  TEXT NOT NULL,          -- SHA-256 hash (upgrade to bcrypt in prod)
    role      TEXT NOT NULL,          -- director | edu | finance | program
    name      TEXT NOT NULL,
    title     TEXT NOT NULL,
    initials  TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  /* ── Applications ── */
  CREATE TABLE IF NOT EXISTS applications (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    sy            TEXT,
    name          TEXT NOT NULL,
    address       TEXT,
    barangay      TEXT,
    dob           TEXT,
    age           INTEGER,
    gender        TEXT,
    contact       TEXT,
    religion      TEXT,
    birthplace    TEXT,
    talents       TEXT,
    clubs         TEXT,
    ambition      TEXT,
    living_with   TEXT,
    edu_level     TEXT,
    prev_grade    TEXT,
    prev_school   TEXT,
    school        TEXT,
    grade         TEXT,
    degree        TEXT,
    why_scholar   TEXT,
    total_income  TEXT,
    total_expense TEXT,
    status        TEXT DEFAULT 'Pending Review',
    family_members TEXT DEFAULT '[]',   -- JSON array
    properties    TEXT DEFAULT '[]',   -- JSON array
    can_provide   TEXT DEFAULT '[]',   -- JSON array
    submitted_at  TEXT DEFAULT (datetime('now')),
    date_label    TEXT                 -- human readable date shown in UI
  );

  /* ── Beneficiary families ── */
  CREATE TABLE IF NOT EXISTS families (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    surname   TEXT NOT NULL,
    guardian  TEXT,
    barangay  TEXT,
    contact   TEXT,
    income    TEXT,
    bracket   TEXT,
    benefits  TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  /* ── Spiritual formation events ── */
  CREATE TABLE IF NOT EXISTS events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    date       TEXT,
    venue      TEXT,
    max_att    INTEGER DEFAULT 75,
    created_at TEXT DEFAULT (datetime('now'))
  );

  /* ── Event attendance (which scholars attended which event) ── */
  CREATE TABLE IF NOT EXISTS event_attendance (
    event_id INTEGER NOT NULL,
    app_id   INTEGER NOT NULL,
    PRIMARY KEY (event_id, app_id),
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    FOREIGN KEY (app_id)   REFERENCES applications(id) ON DELETE CASCADE
  );

  /* ── School absences ── */
  CREATE TABLE IF NOT EXISTS absences (
    app_id  INTEGER PRIMARY KEY,
    days    INTEGER DEFAULT 0,
    reason  TEXT,
    FOREIGN KEY (app_id) REFERENCES applications(id) ON DELETE CASCADE
  );

  /* ── Grade records ── */
  CREATE TABLE IF NOT EXISTS grades (
    app_id    INTEGER PRIMARY KEY,
    grade_val INTEGER,
    semester  TEXT,
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (app_id) REFERENCES applications(id) ON DELETE CASCADE
  );

  /* ── Fund contributions log ── */
  CREATE TABLE IF NOT EXISTS fund_log (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    source   TEXT NOT NULL,
    amount   REAL NOT NULL,
    date     TEXT NOT NULL,
    notes    TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  /* ── Stipend disbursements ── */
  CREATE TABLE IF NOT EXISTS disbursements (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    app_id      INTEGER,
    scholar_name TEXT,
    amount      REAL NOT NULL,
    period      TEXT,
    date        TEXT NOT NULL,
    created_at  TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (app_id) REFERENCES applications(id) ON DELETE SET NULL
  );

  /* ── Intake sheets ── */
  CREATE TABLE IF NOT EXISTS intake_sheets (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    linked_app_id INTEGER,
    case_no       TEXT,
    case_date     TEXT,
    case_category TEXT,
    case_referral TEXT,
    data          TEXT NOT NULL,   -- full JSON blob of all fields
    saved_at      TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (linked_app_id) REFERENCES applications(id) ON DELETE SET NULL
  );

  /* ── Staff assessments ── */
  CREATE TABLE IF NOT EXISTS assessments (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    linked_app_id   INTEGER,
    family_surname  TEXT,
    student         TEXT,
    final_result    TEXT,         -- 'above' | 'below'
    data            TEXT NOT NULL,
    saved_at        TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (linked_app_id) REFERENCES applications(id) ON DELETE SET NULL
  );

  /* ── Announcements ── */
  CREATE TABLE IF NOT EXISTS announcements (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    subject   TEXT NOT NULL,
    message   TEXT NOT NULL,
    target    TEXT,
    tag       TEXT,
    posted_by TEXT,
    date      TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// ── Seed default staff accounts ───────────────────────────────────────────────
function hashPassword(pw) {
  return crypto.createHash('sha256').update(pw).digest('hex');
}

const seedStaff = [
  { username: 'director', password: 'director123', role: 'director', name: 'Director',      title: 'Primary Social Worker',   initials: 'DR' },
  { username: 'edu',      password: 'edu123',      role: 'edu',      name: 'Edu Staff',     title: 'Education Social Worker', initials: 'ED' },
  { username: 'finance',  password: 'finance123',  role: 'finance',  name: 'Finance Staff', title: 'Finance Officer',         initials: 'FN' },
  { username: 'program',  password: 'program123',  role: 'program',  name: 'Coordinator',   title: 'Program Coordinator',     initials: 'PC' },
];

const insertStaff = db.prepare(`
  INSERT OR IGNORE INTO staff (username, password, role, name, title, initials)
  VALUES (@username, @password, @role, @name, @title, @initials)
`);

for (const s of seedStaff) {
  insertStaff.run({ ...s, password: hashPassword(s.password) });
}

// ── Seed dummy applications if empty ─────────────────────────────────────────
const appCount = db.prepare('SELECT COUNT(*) as c FROM applications').get();
if (appCount.c === 0) {
  const ins = db.prepare(`
    INSERT INTO applications (id, sy, name, barangay, school, grade, ambition, status,
      contact, date_label, gender, age, dob, religion, birthplace, address,
      living_with, edu_level, total_income, total_expense, family_members, properties)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  ins.run(1001,'2025-2026','Juan dela Cruz','Poblacion','Baliwag NHS','Grade 10','Engineer','Accepted','09171234567','Jan 10, 2026','Male',16,'2008-05-12','Catholic','Angat, Bulacan','22 Narra St.','Both parents','JuniorHigh','8000','7200',JSON.stringify([{name:'Pedro dela Cruz',age:44,sex:'Male',relation:'Father',civil:'Married',educ:'High School',occup:'Carpenter',income:'8000'},{name:'Luz dela Cruz',age:42,sex:'Female',relation:'Mother',civil:'Married',educ:'Elem',occup:'Housewife',income:'0'}]),JSON.stringify(['Sariling Bahay','PHILHEALTH']));
  ins.run(1002,'2025-2026','Maria Santos','Marungko','BulSU Main','1st Year','Teacher','Accepted','09182345678','Jan 12, 2026','Female',18,'2006-03-20','Catholic','Angat, Bulacan','5 Sampaguita Ave.','Single parent','College','6500','6200',JSON.stringify([{name:'Rosa Santos',age:40,sex:'Female',relation:'Mother',civil:'Single',educ:'High School',occup:'Labandera',income:'6500'}]),JSON.stringify(['4Ps Beneficiary','PHILHEALTH']));
  ins.run(1003,'2026-2027','Jaycee Meneses','Santa Lucia','Baliwag Polytechnic College (BTECH)','3rd Year','To live good','Pending Review','09191234567','Mar 22, 2026','Male',20,'2005-10-23','Catholic','Angat, Bulacan','123 Main St.','Both parents','College','10000','9500',JSON.stringify([{name:'Juan Meneses',age:45,sex:'Male',relation:'Father',civil:'Married',educ:'High School',occup:'Driver',income:'10000'},{name:'Maria Meneses',age:43,sex:'Female',relation:'Mother',civil:'Married',educ:'College Level',occup:'Housewife',income:'0'}]),JSON.stringify(['Sariling Bahay','4Ps Beneficiary']));
  // Reset autoincrement past seeds
  db.prepare("UPDATE sqlite_sequence SET seq=1003 WHERE name='applications'").run();
}

// ── Seed dummy families if empty ─────────────────────────────────────────────
const famCount = db.prepare('SELECT COUNT(*) as c FROM families').get();
if (famCount.c === 0) {
  const insF = db.prepare(`INSERT INTO families (surname,guardian,barangay,contact,income,bracket,benefits) VALUES (?,?,?,?,?,?,?)`);
  [
    ['Dela Cruz','Roberto Dela Cruz','Poblacion','09171112233','8000','Below Min.','PHILHEALTH, 4Ps'],
    ['Santos','Rosa Santos','Marungko','09182223344','6500','Below Min.','4Ps, Solo Parent'],
    ['Reyes','Antonio Reyes','Pulong Sampalok','09193334455','11000','Near Min.','PHILHEALTH'],
    ['Garcia','Ligaya Garcia','Banco','09174445566','9500','Near Min.','4Ps, PHILHEALTH'],
    ['Mendoza','Eduardo Mendoza','Panasahan','09185556677','5800','Below Min.','4Ps, Solo Parent, PHILHEALTH'],
    ['Torres','Carmen Torres','Sta. Lucia','09196667788','13500','At Min.','PHILHEALTH'],
    ['Flores','Domingo Flores','Dulong Malabon','09177778899','7200','Below Min.','4Ps'],
    ['Castillo','Marites Castillo','Locloc','09188889900','15000','At Min.','PHILHEALTH, DSWD Beneficiary'],
    ['Ramos','Felix Ramos','Tabang','09199990011','10200','Near Min.','4Ps, PHILHEALTH'],
    ['Villanueva','Natividad Villanueva','Poblacion','09170001122','6000','Below Min.','4Ps, Solo Parent'],
  ].forEach(r => insF.run(...r));
}

module.exports = db;
