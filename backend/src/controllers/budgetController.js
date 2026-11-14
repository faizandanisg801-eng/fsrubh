const { db } = require('../config/database');

const statements = {
  getByMonthYear: db.prepare('SELECT id, month, year, amount, created_at FROM monthly_budgets WHERE year = ? AND month = ?'),
  getById: db.prepare('SELECT id, month, year, amount, created_at FROM monthly_budgets WHERE id = ?'),
  insert: db.prepare(`
    INSERT INTO monthly_budgets (month, year, amount)
    VALUES (?, ?, ?)
  `),
  update: db.prepare(`
    UPDATE monthly_budgets
    SET amount = ?
    WHERE id = ?
  `),
  updateFull: db.prepare(`
    UPDATE monthly_budgets
    SET month = ?, year = ?, amount = ?
    WHERE id = ?
  `),
};

function parseId(param) {
  const num = Number(param);
  if (!Number.isInteger(num) || num <= 0) {
    return null;
  }
  return num;
}

// GET /api/budgets/:year/:month
function getBudgetByMonth(req, res, next) {
  try {
    const year = Number(req.params.year);
    const month = Number(req.params.month);

    if (!Number.isInteger(year) || year < 1900 || year > 2200) {
      return res.status(400).json({
        success: false,
        error: { message: 'Invalid year. Must be a 4-digit year.' },
      });
    }

    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return res.status(400).json({
        success: false,
        error: { message: 'Invalid month. Must be an integer between 1 and 12.' },
      });
    }

    const budget = statements.getByMonthYear.get(year, month);
    if (!budget) {
      return res.status(404).json({
        success: false,
        error: { message: `No budget found for ${year}-${String(month).padStart(2, '0')}.` },
      });
    }

    res.status(200).json({
      success: true,
      data: budget,
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/budgets
function createBudget(req, res, next) {
  try {
    const { year, month, amount } = req.body;

    const numYear = Number(year);
    const numMonth = Number(month);
    const numAmount = Number(amount);

    if (!Number.isInteger(numYear) || numYear < 1900 || numYear > 2200) {
      return res.status(400).json({
        success: false,
        error: { message: 'Valid year is required.' },
      });
    }

    if (!Number.isInteger(numMonth) || numMonth < 1 || numMonth > 12) {
      return res.status(400).json({
        success: false,
        error: { message: 'Month must be an integer between 1 and 12.' },
      });
    }

    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: { message: 'Amount must be a number greater than 0.' },
      });
    }

    // Check if budget for this year and month already exists
    const existing = statements.getByMonthYear.get(numYear, numMonth);
    if (existing) {
      return res.status(409).json({
        success: false,
        error: { message: `A budget for ${numYear}-${String(numMonth).padStart(2, '0')} already exists.` },
        data: existing,
      });
    }

    const sanitizedAmount = Math.round(numAmount * 100) / 100;
    const result = statements.insert.run(numMonth, numYear, sanitizedAmount);
    const created = statements.getById.get(result.lastInsertRowid);

    res.status(201).json({
      success: true,
      data: created,
    });
  } catch (err) {
    next(err);
  }
}

// PUT /api/budgets/:id
function updateBudget(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (id === null) {
      return res.status(400).json({
        success: false,
        error: { message: 'Invalid budget ID. Must be a positive integer.' },
      });
    }

    const existing = statements.getById.get(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { message: `Budget with ID ${id} not found.` },
      });
    }

    const { amount, year, month } = req.body;
    const numAmount = Number(amount);

    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: { message: 'Amount must be a number greater than 0.' },
      });
    }

    const sanitizedAmount = Math.round(numAmount * 100) / 100;

    if (year !== undefined && month !== undefined) {
      const numYear = Number(year);
      const numMonth = Number(month);

      if (!Number.isInteger(numYear) || numYear < 1900 || numYear > 2200) {
        return res.status(400).json({
          success: false,
          error: { message: 'Valid year is required.' },
        });
      }

      if (!Number.isInteger(numMonth) || numMonth < 1 || numMonth > 12) {
        return res.status(400).json({
          success: false,
          error: { message: 'Month must be an integer between 1 and 12.' },
        });
      }

      const duplicate = statements.getByMonthYear.get(numYear, numMonth);
      if (duplicate && duplicate.id !== id) {
        return res.status(409).json({
          success: false,
          error: { message: `A budget for ${numYear}-${String(numMonth).padStart(2, '0')} already exists.` },
        });
      }

      statements.updateFull.run(numMonth, numYear, sanitizedAmount, id);
    } else {
      statements.update.run(sanitizedAmount, id);
    }

    const updated = statements.getById.get(id);
    res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getBudgetByMonth,
  createBudget,
  updateBudget,
};
