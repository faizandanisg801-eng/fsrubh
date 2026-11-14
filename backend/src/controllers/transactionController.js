const { db } = require('../config/database');

// Prepared statements for transactions
const statements = {
  getAll: db.prepare('SELECT id, title, amount, category, type, date, description, location, created_at FROM transactions ORDER BY date DESC, id DESC'),
  getById: db.prepare('SELECT id, title, amount, category, type, date, description, location, created_at FROM transactions WHERE id = ?'),
  insert: db.prepare(`
    INSERT INTO transactions (title, amount, category, type, date, description, location)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  update: db.prepare(`
    UPDATE transactions
    SET title = ?, amount = ?, category = ?, type = ?, date = ?, description = ?, location = ?
    WHERE id = ?
  `),
  delete: db.prepare('DELETE FROM transactions WHERE id = ?'),
};

/**
 * Validate transaction payload
 */
function validateTransactionPayload(body) {
  const { title, amount, category, type, date, description } = body;

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return 'Title is required and must not be empty.';
  }

  const numAmount = Number(amount);
  if (!Number.isFinite(numAmount) || numAmount <= 0) {
    return 'Amount must be a valid number greater than 0.';
  }

  if (!category || typeof category !== 'string' || category.trim().length === 0) {
    return 'Category is required and must not be empty.';
  }

  if (type !== 'income' && type !== 'expense') {
    return 'Type must be either "income" or "expense".';
  }

  if (!date || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return 'Date must be a valid date in YYYY-MM-DD format.';
  }

  const [y, m, d] = date.split('-').map(Number);
  const parsedDate = new Date(y, m - 1, d);
  if (
    parsedDate.getFullYear() !== y ||
    parsedDate.getMonth() !== m - 1 ||
    parsedDate.getDate() !== d
  ) {
    return 'Date is not a valid calendar date.';
  }

  return null; // Valid
}

/**
 * Parse and validate ID parameter
 */
function parseId(param) {
  const num = Number(param);
  if (!Number.isInteger(num) || num <= 0) {
    return null;
  }
  return num;
}

// GET /api/transactions
function getAllTransactions(req, res, next) {
  try {
    const transactions = statements.getAll.all();
    res.status(200).json({
      success: true,
      data: transactions,
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/transactions/:id
function getTransactionById(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (id === null) {
      return res.status(400).json({
        success: false,
        error: { message: 'Invalid transaction ID. Must be a positive integer.' },
      });
    }

    const transaction = statements.getById.get(id);
    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: { message: `Transaction with ID ${id} not found.` },
      });
    }

    res.status(200).json({
      success: true,
      data: transaction,
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/transactions
function createTransaction(req, res, next) {
  try {
    const validationError = validateTransactionPayload(req.body);
    if (validationError) {
      return res.status(400).json({
        success: false,
        error: { message: validationError },
      });
    }

    const title = req.body.title.trim();
    const amount = Math.round(Number(req.body.amount) * 100) / 100;
    const category = req.body.category.trim();
    const type = req.body.type;
    const date = req.body.date;
    const description = typeof req.body.description === 'string' ? req.body.description.trim() : '';
    const location = typeof req.body.location === 'string' ? req.body.location.trim() : '';

    const result = statements.insert.run(title, amount, category, type, date, description, location);
    const created = statements.getById.get(result.lastInsertRowid);

    res.status(201).json({
      success: true,
      data: created,
    });
  } catch (err) {
    next(err);
  }
}

// PUT /api/transactions/:id
function updateTransaction(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (id === null) {
      return res.status(400).json({
        success: false,
        error: { message: 'Invalid transaction ID. Must be a positive integer.' },
      });
    }

    const existing = statements.getById.get(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { message: `Transaction with ID ${id} not found.` },
      });
    }

    const validationError = validateTransactionPayload(req.body);
    if (validationError) {
      return res.status(400).json({
        success: false,
        error: { message: validationError },
      });
    }

    const title = req.body.title.trim();
    const amount = Math.round(Number(req.body.amount) * 100) / 100;
    const category = req.body.category.trim();
    const type = req.body.type;
    const date = req.body.date;
    const description = typeof req.body.description === 'string' ? req.body.description.trim() : '';
    const location = typeof req.body.location === 'string' ? req.body.location.trim() : '';

    statements.update.run(title, amount, category, type, date, description, location, id);
    const updated = statements.getById.get(id);

    res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/transactions/:id
function deleteTransaction(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (id === null) {
      return res.status(400).json({
        success: false,
        error: { message: 'Invalid transaction ID. Must be a positive integer.' },
      });
    }

    const existing = statements.getById.get(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { message: `Transaction with ID ${id} not found.` },
      });
    }

    statements.delete.run(id);

    res.status(200).json({
      success: true,
      data: { id },
      message: `Transaction ${id} deleted successfully.`,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getAllTransactions,
  getTransactionById,
  createTransaction,
  updateTransaction,
  deleteTransaction,
};
