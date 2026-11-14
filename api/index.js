/**
 * Vercel Serverless Function Entry Point
 * Routes all /api/* requests through the Express application.
 */
const { app } = require('../backend/src/server');

module.exports = (req, res) => {
  return app(req, res);
};
