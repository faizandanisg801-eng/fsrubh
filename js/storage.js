/**
 * storage.js
 * Centralized Data Access Layer connecting to the Node.js + Express REST API.
 *
 * Replaces LocalStorage direct persistence with REST API calls:
 * - GET/POST/PUT/DELETE /api/transactions
 * - GET/POST/PUT /api/budgets
 *
 * Includes automatic one-time migration from LocalStorage if previous user data exists.
 */

const API_BASE = '/api';

const STORAGE_KEYS = {
  TRANSACTIONS: 'ledgerflow_transactions_v1',
  BUDGET: 'ledgerflow_budget_v1',
  META: 'ledgerflow_meta_v1',
  MIGRATED: 'ledgerflow_migrated_v1',
};

export const EXPENSE_CATEGORIES = [
  'Food',
  'Housing',
  'Transportation',
  'Utilities',
  'Healthcare',
  'Entertainment',
  'Shopping',
  'Education',
  'Other',
];

export const INCOME_CATEGORIES = [
  'Salary',
  'Freelance',
  'Investments',
  'Gift',
  'Refund',
  'Other',
];

// In-memory cache of last fetched records for synchronous lookups
let cachedTransactions = [];
let cachedBudgetMap = new Map();

/**
 * Returns today's date in YYYY-MM-DD using local calendar time.
 */
export function getTodayISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Returns YYYY-MM shifted by `offsetMonths` relative to current month.
 */
export function getMonthKeyOffset(offsetMonths = 0) {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + offsetMonths, 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Normalizes a raw transaction object.
 */
export function normalizeTransaction(raw) {
  return {
    id: raw.id,
    title: String(raw.title || '').trim(),
    amount: Math.round((Number(raw.amount) || 0) * 100) / 100,
    category: String(raw.category || 'Other').trim(),
    type: raw.type === 'income' ? 'income' : 'expense',
    date: String(raw.date || getTodayISO()).slice(0, 10),
    description: String(raw.description || '').trim(),
    location: String(raw.location || '').trim(),
    created_at: raw.created_at || null,
  };
}

/**
 * Returns cached transactions synchronously (for quick UI lookups).
 */
export function getCachedTransactions() {
  return cachedTransactions;
}

/**
 * Helper to make API requests with JSON parsing and error handling.
 */
async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  let data = null;
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    data = await response.json();
  }

  if (!response.ok) {
    const errorMsg = data?.error?.message || `HTTP ${response.status}: ${response.statusText}`;
    const err = new Error(errorMsg);
    err.status = response.status;
    err.data = data;
    throw err;
  }

  return data;
}

/**
 * Builds multi-month sample transactions.
 */
export function buildSampleTransactions() {
  const m0 = getMonthKeyOffset(0);
  const m1 = getMonthKeyOffset(-1);
  const m2 = getMonthKeyOffset(-2);
  const m3 = getMonthKeyOffset(-3);
  const m4 = getMonthKeyOffset(-4);
  const m5 = getMonthKeyOffset(-5);

  const day = (monthKey, d) => `${monthKey}-${String(d).padStart(2, '0')}`;
  const todayDay = Math.min(new Date().getDate(), 28);

  return [
    // Current Month (m0)
    { title: 'Monthly Salary', amount: 5200, category: 'Salary', type: 'income', date: day(m0, 1), description: 'Primary employer payroll deposit' },
    { title: 'Apartment Rent', amount: 1450, category: 'Housing', type: 'expense', date: day(m0, 2), description: 'Monthly lease payment' },
    { title: 'Grocery Shopping', amount: 285.40, category: 'Food', type: 'expense', date: day(m0, Math.min(todayDay, 5)), description: 'Weekly groceries and produce' },
    { title: 'Electric & Internet', amount: 164.80, category: 'Utilities', type: 'expense', date: day(m0, Math.min(todayDay, 7)), description: 'Home utility and fiber internet bill' },
    { title: 'UI Design Consulting', amount: 850, category: 'Freelance', type: 'income', date: day(m0, Math.min(todayDay, 8)), description: 'Design system audit milestone' },
    { title: 'Transit Pass & Fuel', amount: 132.50, category: 'Transportation', type: 'expense', date: day(m0, Math.min(todayDay, 9)), description: 'Monthly commuter pass and rideshare' },
    { title: 'Pharmacy & Dental Checkup', amount: 148.00, category: 'Healthcare', type: 'expense', date: day(m0, Math.min(todayDay, 10)), description: 'Routine checkup copay' },
    { title: 'Trader Joe’s & Coffee', amount: 194.25, category: 'Food', type: 'expense', date: day(m0, Math.min(todayDay, 12)), description: 'Household snacks and coffee beans' },
    { title: 'Running Shoes', amount: 145.00, category: 'Shopping', type: 'expense', date: getTodayISO(), description: 'Replacement daily trainers' },
    { title: 'Streaming & Cinema', amount: 54.00, category: 'Entertainment', type: 'expense', date: getTodayISO(), description: 'Monthly subscriptions and movie tickets' },

    // Month -1
    { title: 'Monthly Salary', amount: 5200, category: 'Salary', type: 'income', date: day(m1, 1), description: 'Primary employer payroll deposit' },
    { title: 'Apartment Rent', amount: 1450, category: 'Housing', type: 'expense', date: day(m1, 2), description: 'Monthly lease payment' },
    { title: 'Groceries & Dining', amount: 590.20, category: 'Food', type: 'expense', date: day(m1, 11), description: 'Supermarket runs and weekend dinners' },
    { title: 'Utilities Bundle', amount: 172.00, category: 'Utilities', type: 'expense', date: day(m1, 14), description: 'Electricity, water, and internet' },
    { title: 'Online Course Subscription', amount: 220.00, category: 'Education', type: 'expense', date: day(m1, 18), description: 'Annual technical workshop pass' },
    { title: 'Commute & Car Maintenance', amount: 240.00, category: 'Transportation', type: 'expense', date: day(m1, 22), description: 'Oil change and transit' },
    { title: 'Dividend Payout', amount: 310.00, category: 'Investments', type: 'income', date: day(m1, 25), description: 'Quarterly index fund dividend' },

    // Month -2
    { title: 'Monthly Salary', amount: 5200, category: 'Salary', type: 'income', date: day(m2, 1), description: 'Primary employer payroll deposit' },
    { title: 'Apartment Rent', amount: 1450, category: 'Housing', type: 'expense', date: day(m2, 2), description: 'Monthly lease payment' },
    { title: 'Groceries & Household', amount: 645.00, category: 'Food', type: 'expense', date: day(m2, 9), description: 'Weekly market and pantry restock' },
    { title: 'Winter Jacket & Apparel', amount: 320.00, category: 'Shopping', type: 'expense', date: day(m2, 15), description: 'Seasonal wardrobe update' },
    { title: 'Utilities & Gas', amount: 158.00, category: 'Utilities', type: 'expense', date: day(m2, 19), description: 'Monthly utility statement' },
    { title: 'Concert & Dining Out', amount: 185.00, category: 'Entertainment', type: 'expense', date: day(m2, 24), description: 'Live show tickets' },

    // Month -3
    { title: 'Monthly Salary', amount: 5000, category: 'Salary', type: 'income', date: day(m3, 1), description: 'Primary employer payroll deposit' },
    { title: 'Freelance Web Audit', amount: 650, category: 'Freelance', type: 'income', date: day(m3, 12), description: 'Client accessibility audit' },
    { title: 'Apartment Rent', amount: 1450, category: 'Housing', type: 'expense', date: day(m3, 2), description: 'Monthly lease payment' },
    { title: 'Food & Groceries', amount: 510.00, category: 'Food', type: 'expense', date: day(m3, 14), description: 'Monthly food expenses' },
    { title: 'Utilities & Phone', amount: 168.00, category: 'Utilities', type: 'expense', date: day(m3, 16), description: 'Mobile and home internet' },
    { title: 'Train & Flight Booking', amount: 420.00, category: 'Transportation', type: 'expense', date: day(m3, 20), description: 'Regional travel tickets' },

    // Month -4
    { title: 'Monthly Salary', amount: 5000, category: 'Salary', type: 'income', date: day(m4, 1), description: 'Primary employer payroll deposit' },
    { title: 'Apartment Rent', amount: 1450, category: 'Housing', type: 'expense', date: day(m4, 2), description: 'Monthly lease payment' },
    { title: 'Groceries & Produce', amount: 480.00, category: 'Food', type: 'expense', date: day(m4, 11), description: 'Supermarket shopping' },
    { title: 'Medical Lab Test', amount: 195.00, category: 'Healthcare', type: 'expense', date: day(m4, 17), description: 'Annual wellness screening' },
    { title: 'Utilities', amount: 152.00, category: 'Utilities', type: 'expense', date: day(m4, 21), description: 'Power and water' },

    // Month -5
    { title: 'Monthly Salary', amount: 5000, category: 'Salary', type: 'income', date: day(m5, 1), description: 'Primary employer payroll deposit' },
    { title: 'Apartment Rent', amount: 1450, category: 'Housing', type: 'expense', date: day(m5, 2), description: 'Monthly lease payment' },
    { title: 'Groceries & Dining', amount: 535.00, category: 'Food', type: 'expense', date: day(m5, 13), description: 'Monthly groceries' },
    { title: 'Home Office Desk Chair', amount: 340.00, category: 'Shopping', type: 'expense', date: day(m5, 18), description: 'Ergonomic workspace upgrade' },
    { title: 'Utilities', amount: 149.00, category: 'Utilities', type: 'expense', date: day(m5, 22), description: 'Electric and fiber internet' },
  ];
}

/**
 * Migration helper: Imports LocalStorage records into SQLite backend once.
 * Preserves original LocalStorage data as backup.
 */
export async function seedInitialDataIfEmpty() {
  const isMigrated = window.localStorage.getItem(STORAGE_KEYS.MIGRATED) === 'true';
  if (isMigrated) {
    return { migrated: false, count: 0 };
  }

  let txImportCount = 0;
  let budgetImportCount = 0;

  try {
    // 1. Check existing transactions in LocalStorage
    let rawTx = null;
    try {
      const storedTx = window.localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
      if (storedTx) rawTx = JSON.parse(storedTx);
    } catch (e) {
      console.warn('[Migration] Could not parse LocalStorage transactions:', e);
    }

    // 2. Check if database already has transactions
    const dbTransactionsRes = await apiRequest('/transactions').catch(() => null);
    const dbHasTransactions = dbTransactionsRes && Array.isArray(dbTransactionsRes.data) && dbTransactionsRes.data.length > 0;

    if (!dbHasTransactions && Array.isArray(rawTx) && rawTx.length > 0) {
      console.log(`[Migration] Importing ${rawTx.length} transactions from LocalStorage to database...`);
      for (const item of rawTx) {
        try {
          await apiRequest('/transactions', {
            method: 'POST',
            body: JSON.stringify({
              title: item.title,
              amount: item.amount,
              category: item.category,
              type: item.type,
              date: item.date,
              description: item.description || '',
            }),
          });
          txImportCount += 1;
        } catch (postErr) {
          console.warn('[Migration] Error migrating transaction:', item, postErr);
        }
      }
    }

    // 3. Check existing budget in LocalStorage
    let rawBudget = null;
    try {
      const storedBudget = window.localStorage.getItem(STORAGE_KEYS.BUDGET);
      if (storedBudget) rawBudget = JSON.parse(storedBudget);
    } catch (e) {
      console.warn('[Migration] Could not parse LocalStorage budget:', e);
    }

    if (rawBudget && Number(rawBudget.monthlyLimit) > 0) {
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;

      try {
        await apiRequest('/budgets', {
          method: 'POST',
          body: JSON.stringify({
            year: currentYear,
            month: currentMonth,
            amount: Number(rawBudget.monthlyLimit),
          }),
        });
        budgetImportCount += 1;
      } catch (budgetErr) {
        // If 409 conflict, budget was already present
        if (budgetErr.status !== 409) {
          console.warn('[Migration] Error migrating budget:', budgetErr);
        }
      }
    }

    // Mark migration complete so it never runs twice
    window.localStorage.setItem(STORAGE_KEYS.MIGRATED, 'true');
    console.log(`[Migration Complete] Imported ${txImportCount} transactions and ${budgetImportCount} budget records.`);
    return { migrated: true, txImportCount, budgetImportCount };
  } catch (err) {
    console.error('[Migration Error]', err);
    return { migrated: false, error: err.message };
  }
}

/**
 * Retrieve all transactions from the REST API.
 * GET /api/transactions
 */
export async function getTransactions() {
  const response = await apiRequest('/transactions');
  const list = Array.isArray(response.data) ? response.data : [];
  cachedTransactions = list.map(normalizeTransaction);
  return cachedTransactions;
}

/**
 * Create and persist a new transaction via the REST API.
 * POST /api/transactions
 */
export async function createTransaction(txData) {
  const payload = {
    title: txData.title,
    amount: Number(txData.amount),
    category: txData.category,
    type: txData.type,
    date: txData.date,
    description: txData.description || '',
    location: txData.location || '',
  };

  const response = await apiRequest('/transactions', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  const created = normalizeTransaction(response.data);
  cachedTransactions.unshift(created);
  return created;
}

/**
 * Update an existing transaction by ID via the REST API.
 * PUT /api/transactions/:id
 */
export async function updateTransaction(id, updates) {
  const payload = {
    title: updates.title,
    amount: Number(updates.amount),
    category: updates.category,
    type: updates.type,
    date: updates.date,
    description: updates.description || '',
    location: updates.location || '',
  };

  const response = await apiRequest(`/transactions/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });

  const updated = normalizeTransaction(response.data);
  const index = cachedTransactions.findIndex((tx) => String(tx.id) === String(id));
  if (index !== -1) {
    cachedTransactions[index] = updated;
  }
  return updated;
}

/**
 * Delete a transaction by ID via the REST API.
 * DELETE /api/transactions/:id
 */
export async function deleteTransaction(id) {
  await apiRequest(`/transactions/${id}`, {
    method: 'DELETE',
  });

  cachedTransactions = cachedTransactions.filter((tx) => String(tx.id) !== String(id));
  return true;
}

/**
 * Retrieve budget configuration for a target YYYY-MM month.
 * GET /api/budgets/:year/:month
 */
export async function getBudgetConfig(targetMonth) {
  const monthKey = targetMonth && targetMonth !== 'all' ? targetMonth : getMonthKeyOffset(0);
  const [y, m] = monthKey.split('-').map(Number);
  const year = y || new Date().getFullYear();
  const month = m || new Date().getMonth() + 1;

  try {
    const response = await apiRequest(`/budgets/${year}/${month}`);
    const record = response.data;
    const config = {
      id: record.id,
      year: record.year,
      month: record.month,
      monthlyLimit: Number(record.amount) || 0,
      currency: 'USD',
      updatedAt: record.created_at || new Date().toISOString(),
    };
    cachedBudgetMap.set(monthKey, config);
    return config;
  } catch (err) {
    // 404 means no budget has been set yet for this specific month
    if (err.status === 404) {
      const fallback = {
        id: null,
        year,
        month,
        monthlyLimit: 0,
        currency: 'USD',
        updatedAt: new Date().toISOString(),
      };
      cachedBudgetMap.set(monthKey, fallback);
      return fallback;
    }
    throw err;
  }
}

/**
 * Save budget configuration via POST or PUT to the REST API.
 */
export async function saveBudgetConfig(config, targetMonth) {
  const monthKey = targetMonth && targetMonth !== 'all' ? targetMonth : getMonthKeyOffset(0);
  const [y, m] = monthKey.split('-').map(Number);
  const year = config.year || y || new Date().getFullYear();
  const month = config.month || m || new Date().getMonth() + 1;
  const limit = Math.max(0, Math.round((Number(config.monthlyLimit) || 0) * 100) / 100);

  // Check if we already have an existing budget record for this month
  let existingId = config.id;
  if (!existingId) {
    const cached = cachedBudgetMap.get(monthKey);
    if (cached && cached.id) {
      existingId = cached.id;
    }
  }

  if (existingId) {
    const response = await apiRequest(`/budgets/${existingId}`, {
      method: 'PUT',
      body: JSON.stringify({ amount: limit, year, month }),
    });
    const updated = {
      id: response.data.id,
      year: response.data.year,
      month: response.data.month,
      monthlyLimit: Number(response.data.amount) || 0,
      currency: 'USD',
      updatedAt: response.data.created_at || new Date().toISOString(),
    };
    cachedBudgetMap.set(monthKey, updated);
    return updated;
  }

  // Otherwise, attempt creation
  try {
    const response = await apiRequest('/budgets', {
      method: 'POST',
      body: JSON.stringify({ year, month, amount: limit }),
    });
    const created = {
      id: response.data.id,
      year: response.data.year,
      month: response.data.month,
      monthlyLimit: Number(response.data.amount) || 0,
      currency: 'USD',
      updatedAt: response.data.created_at || new Date().toISOString(),
    };
    cachedBudgetMap.set(monthKey, created);
    return created;
  } catch (err) {
    if (err.status === 409 && err.data?.data?.id) {
      // Conflict: record already exists, update it instead
      const existingRecordId = err.data.data.id;
      const response = await apiRequest(`/budgets/${existingRecordId}`, {
        method: 'PUT',
        body: JSON.stringify({ amount: limit, year, month }),
      });
      const updated = {
        id: response.data.id,
        year: response.data.year,
        month: response.data.month,
        monthlyLimit: Number(response.data.amount) || 0,
        currency: 'USD',
        updatedAt: response.data.created_at || new Date().toISOString(),
      };
      cachedBudgetMap.set(monthKey, updated);
      return updated;
    }
    throw err;
  }
}

/**
 * Resets database to clean sample demo records via the API.
 */
export async function resetToDemoData() {
  // Delete all existing transactions
  const current = await getTransactions();
  for (const tx of current) {
    await deleteTransaction(tx.id).catch(() => {});
  }

  // Insert sample transactions
  const samples = buildSampleTransactions();
  for (const sample of samples) {
    await createTransaction(sample).catch(() => {});
  }

  // Set default current month budget to $3,500
  await saveBudgetConfig({ monthlyLimit: 3500 }, getMonthKeyOffset(0));
}

/**
 * Clears all transactions and resets monthly budget to 0 via the API.
 */
export async function clearAllData() {
  const current = await getTransactions();
  for (const tx of current) {
    await deleteTransaction(tx.id).catch(() => {});
  }

  await saveBudgetConfig({ monthlyLimit: 0 }, getMonthKeyOffset(0)).catch(() => {});
}
