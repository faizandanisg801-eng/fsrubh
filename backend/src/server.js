const path = require('path');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables relative to backend root
const backendRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(backendRoot, '.env') });

// Initialize database & tables
require('./config/database');

const transactionRoutes = require('./routes/transactionRoutes');
const budgetRoutes = require('./routes/budgetRoutes');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3000;

// Enable CORS for external callers or local dev servers
app.use(cors());

// Parse JSON request bodies
app.use(express.json());

// GET /api/health and /health
app.get(['/api/health', '/health'], (req, res) => {
  res.status(200).json({
    success: true,
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

// REST API routes
app.use(['/api/transactions', '/transactions'], transactionRoutes);
app.use(['/api/budgets', '/budgets'], budgetRoutes);

// Catch unknown /api routes and return 404 JSON
app.use('/api', notFoundHandler);

// Serve the existing frontend files from the project root
const frontendRoot = path.resolve(backendRoot, '..');
app.use(express.static(frontendRoot));

// Central error handler
app.use(errorHandler);

let server = null;
if (require.main === module) {
  server = app.listen(PORT, () => {
    console.log(`[LedgerFlow Backend] Server running on http://localhost:${PORT}`);
    console.log(`[LedgerFlow Backend] Health check: http://localhost:${PORT}/api/health`);
    console.log(`[LedgerFlow Backend] Frontend served from: ${frontendRoot}`);
  });
}

module.exports = { app, server };
