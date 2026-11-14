const path = require('path');
const fs = require('fs');
const os = require('os');
const Database = require('better-sqlite3');
const dotenv = require('dotenv');

// Load .env relative to backend root
const backendRoot = path.resolve(__dirname, '..', '..');
dotenv.config({ path: path.join(backendRoot, '.env') });

const isVercel = process.env.VERCEL === '1' || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
const tempDir = os.tmpdir();
const defaultDbPath = isVercel ? path.join(tempDir, 'expense-tracker.db') : 'database/expense-tracker.db';
const dbPathSetting = process.env.DATABASE_PATH || process.env.DB_PATH || defaultDbPath;
const dbFilePath = isVercel ? path.join(tempDir, 'expense-tracker.db') : path.resolve(backendRoot, dbPathSetting);

// In Vercel serverless environment, copy seed database to tempDir if it exists and tempDir is clean
if (isVercel && !fs.existsSync(dbFilePath)) {
  const localSeedDb = path.resolve(backendRoot, 'database', 'expense-tracker.db');
  if (fs.existsSync(localSeedDb)) {
    try {
      fs.copyFileSync(localSeedDb, dbFilePath);
      console.log('[Vercel DB] Successfully initialized database from seed file.');
    } catch (e) {
      console.warn('[Vercel DB] Could not copy seed database to temp:', e);
    }
  }
}

// Ensure the directory for the database exists
const dbDir = path.dirname(dbFilePath);
if (!fs.existsSync(dbDir)) {
  try {
    fs.mkdirSync(dbDir, { recursive: true });
  } catch (e) {
    // Ignore if already exists or system directory
  }
}

// Open or create SQLite database
const db = new Database(dbFilePath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Fallback embedded schema if schema.sql file is not included in serverless bundle
const DEFAULT_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  amount REAL NOT NULL CHECK (amount > 0),
  category TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  date TEXT NOT NULL,
  description TEXT,
  location TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS monthly_budgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year INTEGER NOT NULL,
  amount REAL NOT NULL CHECK (amount > 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (year, month)
);

CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);
`;

// Execute schema to create tables and indexes if they do not exist
const schemaPath = path.join(backendRoot, 'database', 'schema.sql');
let schemaSql = DEFAULT_SCHEMA_SQL;
if (fs.existsSync(schemaPath)) {
  try {
    schemaSql = fs.readFileSync(schemaPath, 'utf8');
  } catch (e) {
    schemaSql = DEFAULT_SCHEMA_SQL;
  }
}
db.exec(schemaSql);

// Safe migration: Add location column to transactions if it does not exist yet
const tableInfo = db.prepare('PRAGMA table_info(transactions)').all();
const hasLocationColumn = tableInfo.some((col) => col.name === 'location');
if (!hasLocationColumn) {
  db.exec('ALTER TABLE transactions ADD COLUMN location TEXT;');
}

module.exports = {
  db,
  dbFilePath,
};
