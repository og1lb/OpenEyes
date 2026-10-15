import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { env } from './env.js'

mkdirSync(dirname(env.databaseFile), { recursive: true })

export const db = new DatabaseSync(env.databaseFile)

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;
  PRAGMA synchronous = FULL;
  PRAGMA trusted_schema = OFF;
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE,
    email         TEXT UNIQUE,
    password_hash TEXT,
    role          TEXT NOT NULL DEFAULT 'user',
    global_name   TEXT,
    avatar        TEXT,
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL,
    last_login_at INTEGER,
    last_ip       TEXT,
    blocked_at    INTEGER
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id                   TEXT PRIMARY KEY,
    user_id              TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash           BLOB NOT NULL UNIQUE,
    created_at           INTEGER NOT NULL,
    last_seen_at         INTEGER NOT NULL,
    idle_expires_at      INTEGER NOT NULL,
    absolute_expires_at  INTEGER NOT NULL,
    revoked_at           INTEGER,
    ip_address          TEXT,
    ip_hash              BLOB,
    ua_hash              BLOB
  );
  CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(absolute_expires_at);

  CREATE TABLE IF NOT EXISTS oauth_states (
    state_hash    BLOB PRIMARY KEY,
    code_verifier TEXT NOT NULL,
    return_to     TEXT NOT NULL,
    created_at    INTEGER NOT NULL,
    expires_at    INTEGER NOT NULL,
    consumed_at   INTEGER
  );

  CREATE TABLE IF NOT EXISTS derivation_counters (
    asset      TEXT PRIMARY KEY,
    next_index INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS invoices (
    id                 TEXT PRIMARY KEY,
    user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id            TEXT NOT NULL,
    asset              TEXT NOT NULL,
    address            TEXT NOT NULL UNIQUE,
    derivation_index   INTEGER NOT NULL,
    amount_usd_cents   INTEGER NOT NULL,
    amount_units       INTEGER NOT NULL,
    min_units          INTEGER NOT NULL,
    received_units     INTEGER NOT NULL DEFAULT 0,
    rate_usd           TEXT NOT NULL,
    confirmations_req  INTEGER NOT NULL,
    status             TEXT NOT NULL,
    created_at         INTEGER NOT NULL,
    expires_at         INTEGER NOT NULL,
    seen_at            INTEGER,
    settled_at         INTEGER,
    credited_at        INTEGER,
    UNIQUE (asset, derivation_index)
  );
  CREATE INDEX IF NOT EXISTS invoices_open ON invoices(status, expires_at);
  CREATE INDEX IF NOT EXISTS invoices_user ON invoices(user_id, created_at);

  CREATE TABLE IF NOT EXISTS invoice_txs (
    asset      TEXT NOT NULL,
    txid       TEXT NOT NULL,
    vout       INTEGER NOT NULL,
    invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    units      INTEGER NOT NULL,
    confirmed  INTEGER NOT NULL DEFAULT 0,
    first_seen INTEGER NOT NULL,
    PRIMARY KEY (asset, txid, vout)
  );
  CREATE INDEX IF NOT EXISTS invoice_txs_invoice ON invoice_txs(invoice_id);

  CREATE TABLE IF NOT EXISTS entitlements (
    user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    plan_id     TEXT NOT NULL,
    lifetime    INTEGER NOT NULL DEFAULT 0,
    expires_at  INTEGER,
    updated_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS role_state (
    user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    in_guild   INTEGER NOT NULL DEFAULT 0,
    has_role   INTEGER NOT NULL DEFAULT 0,
    checked_at INTEGER NOT NULL,
    stale      INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    at      INTEGER NOT NULL,
    event   TEXT NOT NULL,
    actor   TEXT,
    subject TEXT,
    detail  TEXT,
    ip_hash BLOB
  );
  CREATE INDEX IF NOT EXISTS audit_log_at ON audit_log(at);

  CREATE TABLE IF NOT EXISTS early_access (
    id         TEXT PRIMARY KEY,
    email      TEXT NOT NULL,
    email_hash BLOB NOT NULL UNIQUE,
    created_at INTEGER NOT NULL,
    ip_hash    BLOB
  );
  CREATE INDEX IF NOT EXISTS early_access_at ON early_access(created_at);

  CREATE TABLE IF NOT EXISTS admin_totp_used (
    counter INTEGER PRIMARY KEY,
    used_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS admin_attempts (
    key        TEXT PRIMARY KEY,
    failures   INTEGER NOT NULL DEFAULT 0,
    locked_until INTEGER
  );

  CREATE TABLE IF NOT EXISTS plans (
    id            TEXT PRIMARY KEY CHECK (id NOT GLOB '*[^a-z0-9-]*' AND length(id) BETWEEN 2 AND 32),
    name          TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 48),
    usd_cents     INTEGER NOT NULL CHECK (usd_cents BETWEEN 100 AND 100000000),
    duration_days INTEGER CHECK (duration_days IS NULL OR duration_days BETWEEN 1 AND 3650),
    lifetime      INTEGER NOT NULL DEFAULT 0 CHECK (lifetime IN (0, 1)),
    daily_limit   INTEGER CHECK (daily_limit IS NULL OR daily_limit BETWEEN 1 AND 100000),
    role_id       TEXT CHECK (role_id IS NULL OR (role_id NOT GLOB '*[^0-9]*' AND length(role_id) BETWEEN 5 AND 25)),
    active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    sort          INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL,
    CHECK ((lifetime = 1 AND duration_days IS NULL) OR (lifetime = 0 AND duration_days IS NOT NULL))
  );

  CREATE TABLE IF NOT EXISTS usage_daily (
    user_id TEXT NOT NULL,
    day     TEXT NOT NULL,
    count   INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, day)
  );
`)

const userColumns = new Set(db.prepare('PRAGMA table_info(users)').all().map((c) => c.name))
if (!userColumns.has('email')) db.exec('ALTER TABLE users ADD COLUMN email TEXT')
if (!userColumns.has('password_hash')) db.exec('ALTER TABLE users ADD COLUMN password_hash TEXT')
if (!userColumns.has('role')) db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'")
if (!userColumns.has('last_ip')) db.exec('ALTER TABLE users ADD COLUMN last_ip TEXT')
if (!userColumns.has('occupation')) db.exec('ALTER TABLE users ADD COLUMN occupation TEXT')
if (!userColumns.has('gender')) db.exec('ALTER TABLE users ADD COLUMN gender TEXT')

// OpenEyes-specific persistence tables.
db.exec(`
  CREATE TABLE IF NOT EXISTS search_history (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tool TEXT NOT NULL, target TEXT, started_at INTEGER NOT NULL, finished_at INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL, result_state TEXT NOT NULL, metadata TEXT
  );
  CREATE INDEX IF NOT EXISTS search_history_user ON search_history(user_id, finished_at DESC);
  CREATE TABLE IF NOT EXISTS osint_maps (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL, data TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS osint_maps_user ON osint_maps(user_id, updated_at DESC);
  CREATE TABLE IF NOT EXISTS owner_keys (
    id TEXT PRIMARY KEY, key_value TEXT NOT NULL UNIQUE, plan_id TEXT NOT NULL, note TEXT,
    created_at INTEGER NOT NULL, redeemed_at INTEGER, redeemed_user TEXT, disabled_at INTEGER, deleted_at INTEGER
  );
`)

const ownerKeyColumns = new Set(db.prepare('PRAGMA table_info(owner_keys)').all().map((c) => c.name))
if (!ownerKeyColumns.has('disabled_at')) db.exec('ALTER TABLE owner_keys ADD COLUMN disabled_at INTEGER')
if (!ownerKeyColumns.has('deleted_at')) db.exec('ALTER TABLE owner_keys ADD COLUMN deleted_at INTEGER')

const sessionColumns = new Set(db.prepare('PRAGMA table_info(sessions)').all().map((c) => c.name))
if (!sessionColumns.has('ip_address')) db.exec('ALTER TABLE sessions ADD COLUMN ip_address TEXT')
if (!sessionColumns.has('admin_until')) {
  db.exec('ALTER TABLE sessions ADD COLUMN admin_until INTEGER')
}

const roleColumns = new Set(db.prepare('PRAGMA table_info(role_state)').all().map((c) => c.name))
if (!roleColumns.has('roles')) {
  db.exec("ALTER TABLE role_state ADD COLUMN roles TEXT NOT NULL DEFAULT '[]'")
}

for (const asset of ['btc', 'ltc']) {
  db.prepare('INSERT OR IGNORE INTO derivation_counters (asset, next_index) VALUES (?, 0)').run(asset)
}

import { randomBytes, scryptSync } from 'node:crypto'
function bootstrapPassword(value) {
  if (!value) return null
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(value, salt, 64).toString('hex')
  return `scrypt:${salt}:${hash}`
}
const ownerUsername = (process.env.OWNER_USERNAME || '').trim()
const ownerPassword = process.env.OWNER_PASSWORD || ''
if (ownerUsername && ownerPassword) {
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(ownerUsername)
  const id = existing?.id || `owner_${ownerUsername.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0,24)}`
  const now = Date.now()
  const hash = bootstrapPassword(ownerPassword)
  db.prepare(`INSERT INTO users (id,username,email,password_hash,role,global_name,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(username) DO UPDATE SET password_hash=excluded.password_hash, role='owner', updated_at=excluded.updated_at`).run(id, ownerUsername, process.env.OWNER_EMAIL || null, hash, 'owner', ownerUsername, now, now)
}

const insertAudit = db.prepare(
  'INSERT INTO audit_log (at, event, actor, subject, detail, ip_hash) VALUES (?, ?, ?, ?, ?, ?)',
)

export function audit(event, { actor = null, subject = null, detail = null, ipHash = null } = {}) {
  insertAudit.run(
    Date.now(),
    event,
    actor,
    subject,
    detail === null ? null : JSON.stringify(detail),
    ipHash,
  )
}

export function transaction(fn) {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (err) {
    try {
      db.exec('ROLLBACK')
    } catch {}
    throw err
  }
}

export function closeDb() {
  try {
    db.close()
  } catch {}
}
