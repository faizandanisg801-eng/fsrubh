const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const dotenv = require('dotenv');

// Load .env relative to backend root
const backendRoot = path.resolve(__dirname, '..', '..');
dotenv.config({ path: path.join(backendRoot, '.env') });

const dbPathSetting = process.env.DATABASE_PATH || process.env.DB_PATH || 'database/expense-tracker.db';
const dbFilePath = path.resolve(backendRoot, dbPathSetting);

// Ensure the directory for the database exists
const dbDir = path.dirname(dbFilePath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Open or create SQLite database
const db = new Database(dbFilePath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Execute schema to create tables and indexes if they do not exist
const schemaPath = path.join(backendRoot, 'database', 'schema.sql');
if (fs.existsSync(schemaPath)) {
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schemaSql);
}

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
