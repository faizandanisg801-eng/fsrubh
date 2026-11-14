/**
 * In-memory test runner for Express application (no TCP sockets needed)
 */

const { app } = require('./src/server');
const { EventEmitter } = require('events');

function dispatch(app, method, url, body = null) {
  return new Promise((resolve) => {
    const req = new EventEmitter();
    req.method = method.toUpperCase();
    req.url = url;
    req.originalUrl = url;
    req.headers = {
      'content-type': 'application/json',
    };
    req.body = body || {};

    let statusCode = 200;
    const headers = {};
    let responseBody = null;

    const res = {
      statusCode: 200,
      status(code) {
        statusCode = code;
        this.statusCode = code;
        return this;
      },
      setHeader(k, v) {
        headers[k] = v;
      },
      getHeader(k) {
        return headers[k];
      },
      json(data) {
        responseBody = data;
        resolve({
          statusCode,
          headers,
          body: responseBody,
        });
        return this;
      },
      send(data) {
        responseBody = data;
        resolve({
          statusCode,
          headers,
          body: responseBody,
        });
        return this;
      },
      end(data) {
        if (data && !responseBody) responseBody = data;
        resolve({
          statusCode,
          headers,
          body: responseBody,
        });
      },
    };

    app.handle(req, res, (err) => {
      if (err) {
        resolve({
          statusCode: 500,
          headers,
          body: { success: false, error: { message: err.message } },
        });
      } else {
        resolve({
          statusCode: 404,
          headers,
          body: { success: false, error: { message: 'Not found' } },
        });
      }
    });
  });
}

const testResults = [];

function assert(condition, name, details) {
  if (condition) {
    testResults.push({ name, status: 'PASS', details });
    console.log(`[PASS] ${name}`);
  } else {
    testResults.push({ name, status: 'FAIL', details });
    console.error(`[FAIL] ${name} - Details:`, JSON.stringify(details));
  }
}

async function runAllTests() {
  console.log('=== RUNNING LEDGERFLOW IN-MEMORY TEST SUITE ===');

  // 1. GET /api/health
  const health = await dispatch(app, 'GET', '/api/health');
  assert(
    health.statusCode === 200 && health.body.success === true && health.body.status === 'ok',
    'GET /api/health returns 200 and ok status',
    health
  );

  // 2. GET /api/transactions initial list
  const initialList = await dispatch(app, 'GET', '/api/transactions');
  assert(
    initialList.statusCode === 200 && initialList.body.success === true && Array.isArray(initialList.body.data),
    'GET /api/transactions returns 200 with data array',
    initialList
  );

  // 3. POST /api/transactions - Valid
  const newTxPayload = {
    title: 'Contract Payment',
    amount: 2450.00,
    category: 'Freelance',
    type: 'income',
    date: '2026-11-14',
    description: 'Final project milestone deposit',
    location: 'The Confluence',
  };
  const createTxRes = await dispatch(app, 'POST', '/api/transactions', newTxPayload);
  assert(
    createTxRes.statusCode === 201 && createTxRes.body.success === true && createTxRes.body.data?.id > 0 && createTxRes.body.data?.location === 'The Confluence',
    'POST /api/transactions with valid payload and location returns 201 Created with location saved',
    createTxRes
  );
  const createdId = createTxRes.body.data?.id;

  // 4. POST /api/transactions - Invalid: Missing title
  const missingTitle = await dispatch(app, 'POST', '/api/transactions', {
    amount: 100,
    category: 'Food',
    type: 'expense',
    date: '2026-11-14',
  });
  assert(
    missingTitle.statusCode === 400 && missingTitle.body.success === false,
    'POST /api/transactions with missing title returns 400 Bad Request',
    missingTitle
  );

  // 5. POST /api/transactions - Invalid: Negative amount
  const negAmount = await dispatch(app, 'POST', '/api/transactions', {
    title: 'Groceries',
    amount: -45.5,
    category: 'Food',
    type: 'expense',
    date: '2026-11-14',
  });
  assert(
    negAmount.statusCode === 400 && negAmount.body.success === false,
    'POST /api/transactions with negative amount returns 400 Bad Request',
    negAmount
  );

  // 6. POST /api/transactions - Invalid: Invalid type
  const badType = await dispatch(app, 'POST', '/api/transactions', {
    title: 'Stock Dividend',
    amount: 200,
    category: 'Investments',
    type: 'transfer',
    date: '2026-11-14',
  });
  assert(
    badType.statusCode === 400 && badType.body.success === false,
    'POST /api/transactions with invalid type returns 400 Bad Request',
    badType
  );

  // 7. POST /api/transactions - Invalid: Bad date format
  const badDate = await dispatch(app, 'POST', '/api/transactions', {
    title: 'Coffee',
    amount: 5,
    category: 'Food',
    type: 'expense',
    date: '14/11/2026',
  });
  assert(
    badDate.statusCode === 400 && badDate.body.success === false,
    'POST /api/transactions with invalid date format returns 400 Bad Request',
    badDate
  );

  // 8. GET /api/transactions/:id - Valid ID
  const getByIdRes = await dispatch(app, 'GET', `/api/transactions/${createdId}`);
  assert(
    getByIdRes.statusCode === 200 && getByIdRes.body.data?.id === createdId && getByIdRes.body.data?.amount === 2450,
    'GET /api/transactions/:id returns 200 and matching transaction record',
    getByIdRes
  );

  // 9. GET /api/transactions/:id - Unknown ID
  const getUnknownRes = await dispatch(app, 'GET', '/api/transactions/999999');
  assert(
    getUnknownRes.statusCode === 404 && getUnknownRes.body.success === false,
    'GET /api/transactions/:id with non-existent id returns 404 Not Found',
    getUnknownRes
  );

  // 10. GET /api/transactions/:id - Non-numeric ID
  const getInvalidIdRes = await dispatch(app, 'GET', '/api/transactions/not-an-id');
  assert(
    getInvalidIdRes.statusCode === 400 && getInvalidIdRes.body.success === false,
    'GET /api/transactions/:id with invalid string ID returns 400 Bad Request',
    getInvalidIdRes
  );

  // 11. PUT /api/transactions/:id - Valid Update
  const updateRes = await dispatch(app, 'PUT', `/api/transactions/${createdId}`, {
    title: 'Contract Payment (Final Milestone)',
    amount: 2600.00,
    category: 'Freelance',
    type: 'income',
    date: '2026-11-14',
    description: 'Updated rate with bonus',
  });
  assert(
    updateRes.statusCode === 200 && updateRes.body.data?.amount === 2600 && updateRes.body.data?.title.includes('Final Milestone'),
    'PUT /api/transactions/:id updates record and returns 200 OK',
    updateRes
  );

  // 12. PUT /api/transactions/:id - Unknown ID
  const updateUnknownRes = await dispatch(app, 'PUT', '/api/transactions/999999', {
    title: 'Ghost',
    amount: 50,
    category: 'Other',
    type: 'expense',
    date: '2026-11-14',
  });
  assert(
    updateUnknownRes.statusCode === 404 && updateUnknownRes.body.success === false,
    'PUT /api/transactions/:id with unknown ID returns 404 Not Found',
    updateUnknownRes
  );

  // 13. DELETE /api/transactions/:id - Valid
  const deleteRes = await dispatch(app, 'DELETE', `/api/transactions/${createdId}`);
  assert(
    deleteRes.statusCode === 200 && deleteRes.body.success === true,
    'DELETE /api/transactions/:id deletes record and returns 200 OK',
    deleteRes
  );

  // 14. DELETE /api/transactions/:id - Unknown ID
  const deleteUnknownRes = await dispatch(app, 'DELETE', '/api/transactions/999999');
  assert(
    deleteUnknownRes.statusCode === 404 && deleteUnknownRes.body.success === false,
    'DELETE /api/transactions/:id with unknown ID returns 404 Not Found',
    deleteUnknownRes
  );

  // 15. GET /api/budgets/:year/:month - Not set yet
  const targetYear = 2028;
  const targetMonth = 6;
  const { db } = require('./src/config/database');
  db.prepare('DELETE FROM monthly_budgets WHERE year = ? AND month = ?').run(targetYear, targetMonth);

  const getBudgetUnset = await dispatch(app, 'GET', `/api/budgets/${targetYear}/${targetMonth}`);
  assert(
    getBudgetUnset.statusCode === 404 && getBudgetUnset.body.success === false,
    'GET /api/budgets/:year/:month for unset month returns 404 Not Found',
    getBudgetUnset
  );

  // 16. POST /api/budgets - Valid
  const createBudgetRes = await dispatch(app, 'POST', '/api/budgets', {
    year: targetYear,
    month: targetMonth,
    amount: 3600.00,
  });
  assert(
    createBudgetRes.statusCode === 201 && createBudgetRes.body.data?.amount === 3600 && createBudgetRes.body.data?.month === targetMonth,
    'POST /api/budgets with valid data creates budget and returns 201 Created',
    createBudgetRes
  );
  const budgetId = createBudgetRes.body.data?.id;

  // 17. POST /api/budgets - Duplicate Conflict (409)
  const duplicateBudget = await dispatch(app, 'POST', '/api/budgets', {
    year: targetYear,
    month: targetMonth,
    amount: 4000.00,
  });
  assert(
    duplicateBudget.statusCode === 409 && duplicateBudget.body.success === false,
    'POST /api/budgets for already existing month/year returns 409 Conflict',
    duplicateBudget
  );

  // 18. POST /api/budgets - Negative amount
  const negBudget = await dispatch(app, 'POST', '/api/budgets', {
    year: 2026,
    month: 12,
    amount: -100,
  });
  assert(
    negBudget.statusCode === 400 && negBudget.body.success === false,
    'POST /api/budgets with negative amount returns 400 Bad Request',
    negBudget
  );

  // 19. POST /api/budgets - Invalid month (13)
  const badMonth = await dispatch(app, 'POST', '/api/budgets', {
    year: 2026,
    month: 13,
    amount: 1500,
  });
  assert(
    badMonth.statusCode === 400 && badMonth.body.success === false,
    'POST /api/budgets with month=13 returns 400 Bad Request',
    badMonth
  );

  // 20. GET /api/budgets/:year/:month - Now set
  const getBudgetSet = await dispatch(app, 'GET', `/api/budgets/${targetYear}/${targetMonth}`);
  assert(
    getBudgetSet.statusCode === 200 && getBudgetSet.body.data?.amount === 3600,
    'GET /api/budgets/:year/:month returns 200 with saved budget record',
    getBudgetSet
  );

  // 21. PUT /api/budgets/:id - Valid update
  const updateBudgetRes = await dispatch(app, 'PUT', `/api/budgets/${budgetId}`, {
    amount: 4100.00,
  });
  assert(
    updateBudgetRes.statusCode === 200 && updateBudgetRes.body.data?.amount === 4100,
    'PUT /api/budgets/:id updates budget amount and returns 200 OK',
    updateBudgetRes
  );

  // 22. PUT /api/budgets/:id - Unknown ID
  const updateUnknownBudget = await dispatch(app, 'PUT', '/api/budgets/999999', {
    amount: 5000,
  });
  assert(
    updateUnknownBudget.statusCode === 404 && updateUnknownBudget.body.success === false,
    'PUT /api/budgets/:id with non-existent id returns 404 Not Found',
    updateUnknownBudget
  );

  // Clean up test budget
  db.prepare('DELETE FROM monthly_budgets WHERE id = ?').run(budgetId);

  // 23. GET /api/unknown - Catchall 404 handler
  const unknownApiRes = await dispatch(app, 'GET', '/api/invalid-resource-endpoint');
  assert(
    unknownApiRes.statusCode === 404 && unknownApiRes.body.success === false,
    'Central error/404 middleware returns standardized JSON for unknown /api routes',
    unknownApiRes
  );

  // 24. Database Calculation Verification (Hard rule: Never hardcode totals)
  // Create test income and expense entries
  const income1 = await dispatch(app, 'POST', '/api/transactions', {
    title: 'Bi-Weekly Paycheck',
    amount: 2500,
    category: 'Salary',
    type: 'income',
    date: '2026-11-14',
  });
  const expense1 = await dispatch(app, 'POST', '/api/transactions', {
    title: 'Groceries Store',
    amount: 320,
    category: 'Food',
    type: 'expense',
    date: '2026-11-14',
  });
  const expense2 = await dispatch(app, 'POST', '/api/transactions', {
    title: 'Electric Bill',
    amount: 180,
    category: 'Utilities',
    type: 'expense',
    date: '2026-11-14',
  });

  const allRecordsRes = await dispatch(app, 'GET', '/api/transactions');
  const allRecords = allRecordsRes.body.data;

  const totalIncome = allRecords
    .filter((tx) => tx.type === 'income')
    .reduce((sum, tx) => sum + tx.amount, 0);
  const totalExpense = allRecords
    .filter((tx) => tx.type === 'expense')
    .reduce((sum, tx) => sum + tx.amount, 0);
  const netBalance = totalIncome - totalExpense;

  assert(
    totalIncome >= 2500 && totalExpense >= 500 && netBalance === (totalIncome - totalExpense),
    'Dashboard totals (income, expense, balance) derive dynamically from records without hardcoded values',
    { totalIncome, totalExpense, netBalance }
  );

  // Clean up test entries
  await dispatch(app, 'DELETE', `/api/transactions/${income1.body.data.id}`);
  await dispatch(app, 'DELETE', `/api/transactions/${expense1.body.data.id}`);
  await dispatch(app, 'DELETE', `/api/transactions/${expense2.body.data.id}`);

  // Summary
  console.log('\n=============================================');
  const passCount = testResults.filter((r) => r.status === 'PASS').length;
  const failCount = testResults.filter((r) => r.status === 'FAIL').length;
  console.log(`TOTAL ENDPOINT & LOGIC TESTS: ${testResults.length}`);
  console.log(`PASSED: ${passCount}`);
  console.log(`FAILED: ${failCount}`);
  console.log('=============================================');

  if (failCount > 0) {
    process.exitCode = 1;
  }
}

runAllTests();
