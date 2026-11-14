/**
 * analytics.js
 * Pure expense analytics aggregations and dynamic Chart.js visualizations.
 */

import { getMonthKeyOffset } from './storage.js';
import { escapeHtml, formatCurrency, formatShortMonth } from './transactions.js';
import { CATEGORY_PALETTE } from './dashboard.js';

let incomeExpenseChartInstance = null;
let distributionChartInstance = null;

/**
 * Pure analytics calculation across a selected timeframe (`3`, `6`, `12`, or `'all'`).
 */
export function calculateAnalytics(transactions, range = '6') {
  let scopedTransactions = transactions;
  let monthKeys = [];

  if (range !== 'all') {
    const numMonths = Number(range) || 6;
    for (let offset = -(numMonths - 1); offset <= 0; offset += 1) {
      monthKeys.push(getMonthKeyOffset(offset));
    }
    const keySet = new Set(monthKeys);
    scopedTransactions = transactions.filter((tx) => keySet.has(tx.date.slice(0, 7)));
  } else {
    const discovered = new Set();
    for (const tx of transactions) {
      if (tx.date && tx.date.length >= 7) {
        discovered.add(tx.date.slice(0, 7));
      }
    }
    monthKeys = Array.from(discovered).sort();
  }

  let totalIncome = 0;
  let totalExpenses = 0;
  let expenseCount = 0;
  const categoryMap = new Map();
  const monthlyMap = new Map();

  for (const key of monthKeys) {
    monthlyMap.set(key, { monthKey: key, label: formatShortMonth(key), income: 0, expense: 0 });
  }

  for (const tx of scopedTransactions) {
    const mKey = tx.date.slice(0, 7);
    if (!monthlyMap.has(mKey)) {
      monthlyMap.set(mKey, { monthKey: mKey, label: formatShortMonth(mKey), income: 0, expense: 0 });
    }
    const bucket = monthlyMap.get(mKey);

    if (tx.type === 'income') {
      totalIncome += tx.amount;
      bucket.income += tx.amount;
    } else {
      totalExpenses += tx.amount;
      expenseCount += 1;
      bucket.expense += tx.amount;

      const prev = categoryMap.get(tx.category) || { amount: 0, count: 0 };
      categoryMap.set(tx.category, {
        amount: prev.amount + tx.amount,
        count: prev.count + 1,
      });
    }
  }

  const totalSavings = totalIncome - totalExpenses;
  const savingsRate = totalIncome > 0 ? (totalSavings / totalIncome) * 100 : 0;

  const monthlySeries = Array.from(monthlyMap.values()).sort((a, b) =>
    a.monthKey.localeCompare(b.monthKey)
  );

  const activeMonths = Math.max(monthlySeries.length, 1);
  const avgMonthlyExpense = totalExpenses / activeMonths;

  const categoryBreakdown = Array.from(categoryMap.entries())
    .map(([category, info]) => ({
      category,
      amount: info.amount,
      count: info.count,
      average: info.count > 0 ? info.amount / info.count : 0,
      percentage: totalExpenses > 0 ? (info.amount / totalExpenses) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  const highestCategory = categoryBreakdown[0] || null;

  return {
    totalIncome,
    totalExpenses,
    totalSavings,
    savingsRate,
    expenseCount,
    monthCount: monthlySeries.length,
    avgMonthlyExpense,
    highestCategory,
    monthlySeries,
    categoryBreakdown,
  };
}

/**
 * Renders Expense Analytics KPIs, Charts, and Category Breakdown Table.
 */
export function renderAnalyticsView(transactions, range, handlers) {
  const analytics = calculateAnalytics(transactions, range);

  const savingsEl = document.getElementById('analytics-savings');
  const savingsRateEl = document.getElementById('analytics-savings-rate');
  const topCatEl = document.getElementById('analytics-top-category');
  const topCatMetaEl = document.getElementById('analytics-top-category-meta');
  const avgMonthlyEl = document.getElementById('analytics-avg-monthly');
  const monthsCountEl = document.getElementById('analytics-months-count');
  const totalSpendEl = document.getElementById('analytics-total-spend');
  const txCountEl = document.getElementById('analytics-tx-count');

  if (savingsEl) {
    savingsEl.textContent = formatCurrency(analytics.totalSavings, analytics.totalSavings < 0);
    savingsEl.className = `kpi-value tabular-nums ${analytics.totalSavings < 0 ? 'expense-text' : 'income-text'}`;
  }
  if (savingsRateEl) {
    savingsRateEl.textContent =
      analytics.totalIncome > 0
        ? `${analytics.savingsRate.toFixed(1)}% savings rate`
        : 'No income recorded in period';
  }

  if (topCatEl && topCatMetaEl) {
    if (analytics.highestCategory) {
      topCatEl.textContent = analytics.highestCategory.category;
      topCatMetaEl.textContent = `${formatCurrency(analytics.highestCategory.amount)} (${analytics.highestCategory.percentage.toFixed(1)}% of spend)`;
    } else {
      topCatEl.textContent = '—';
      topCatMetaEl.textContent = 'No expense data';
    }
  }

  if (avgMonthlyEl) avgMonthlyEl.textContent = formatCurrency(analytics.avgMonthlyExpense);
  if (monthsCountEl) {
    monthsCountEl.textContent = `Across ${analytics.monthCount} ${analytics.monthCount === 1 ? 'month' : 'months'}`;
  }

  if (totalSpendEl) totalSpendEl.textContent = formatCurrency(analytics.totalExpenses);
  if (txCountEl) {
    txCountEl.textContent = `${analytics.expenseCount} expense ${analytics.expenseCount === 1 ? 'transaction' : 'transactions'}`;
  }

  renderIncomeExpenseChart(analytics.monthlySeries);
  renderDistributionChart(analytics.categoryBreakdown);
  renderCategoryTable(analytics.categoryBreakdown, handlers);
}

function renderIncomeExpenseChart(monthlySeries) {
  const canvas = document.getElementById('analytics-income-expense-chart');
  if (!canvas || typeof window.Chart === 'undefined') return;

  if (incomeExpenseChartInstance) {
    incomeExpenseChartInstance.destroy();
    incomeExpenseChartInstance = null;
  }

  incomeExpenseChartInstance = new window.Chart(canvas, {
    type: 'bar',
    data: {
      labels: monthlySeries.map((m) => m.label),
      datasets: [
        {
          label: 'Income',
          data: monthlySeries.map((m) => m.income),
          backgroundColor: '#16A34A',
          borderRadius: 4,
          barPercentage: 0.72,
          categoryPercentage: 0.65,
        },
        {
          label: 'Expenses',
          data: monthlySeries.map((m) => m.expense),
          backgroundColor: '#DC2626',
          borderRadius: 4,
          barPercentage: 0.72,
          categoryPercentage: 0.65,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          align: 'end',
          labels: {
            boxWidth: 10,
            boxHeight: 10,
            usePointStyle: true,
            pointStyle: 'rectRounded',
            color: '#475569',
            font: { family: "'Plus Jakarta Sans', sans-serif", size: 12 },
          },
        },
        tooltip: {
          backgroundColor: '#0F172A',
          padding: 10,
          callbacks: {
            label: (ctx) => ` ${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: '#64748B',
            font: { family: "'Plus Jakarta Sans', sans-serif", size: 11.5 },
          },
        },
        y: {
          beginAtZero: true,
          border: { display: false },
          grid: { color: '#F1F5F9' },
          ticks: {
            color: '#64748B',
            font: { family: "'JetBrains Mono', monospace", size: 11 },
            callback: (val) => `$${Number(val).toLocaleString('en-US')}`,
          },
        },
      },
    },
  });
}

function renderDistributionChart(categoryBreakdown) {
  const canvas = document.getElementById('analytics-distribution-chart');
  if (!canvas || typeof window.Chart === 'undefined') return;

  if (distributionChartInstance) {
    distributionChartInstance.destroy();
    distributionChartInstance = null;
  }

  if (categoryBreakdown.length === 0) {
    const ctx = canvas.getContext('2d');
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  const colors = categoryBreakdown.map((_, idx) => CATEGORY_PALETTE[idx % CATEGORY_PALETTE.length]);

  distributionChartInstance = new window.Chart(canvas, {
    type: 'bar',
    data: {
      labels: categoryBreakdown.map((c) => c.category),
      datasets: [
        {
          label: 'Total Spent',
          data: categoryBreakdown.map((c) => c.amount),
          backgroundColor: colors,
          borderRadius: 4,
          barThickness: 18,
        },
      ],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0F172A',
          padding: 10,
          callbacks: {
            label: (ctx) => {
              const item = categoryBreakdown[ctx.dataIndex];
              return ` ${formatCurrency(item.amount)} (${item.percentage.toFixed(1)}%)`;
            },
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          border: { display: false },
          grid: { color: '#F1F5F9' },
          ticks: {
            color: '#64748B',
            font: { family: "'JetBrains Mono', monospace", size: 11 },
            callback: (val) => `$${Number(val).toLocaleString('en-US')}`,
          },
        },
        y: {
          grid: { display: false },
          ticks: {
            color: '#0F172A',
            font: { family: "'Plus Jakarta Sans', sans-serif", size: 12 },
          },
        },
      },
    },
  });
}

function renderCategoryTable(categoryBreakdown, handlers) {
  const container = document.getElementById('analytics-category-table-container');
  if (!container) return;

  if (categoryBreakdown.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon"><i data-lucide="bar-chart-3"></i></div>
        <h3 class="empty-state-title">No expense analytics available</h3>
        <p class="empty-state-desc">Add expense transactions to visualize spending distribution and category rankings.</p>
        <button type="button" class="btn btn-primary" id="analytics-empty-add-btn">Add Expense</button>
      </div>
    `;
    document.getElementById('analytics-empty-add-btn')?.addEventListener('click', handlers.onOpenAdd);
    return;
  }

  const rowsHtml = categoryBreakdown
    .map(
      (item, idx) => `
      <tr>
        <td class="tx-title-cell">${escapeHtml(item.category)}</td>
        <td class="num tabular-nums">${item.count}</td>
        <td class="num tabular-nums">${escapeHtml(formatCurrency(item.average))}</td>
        <td>
          <div class="inline-bar-wrap">
            <div class="inline-bar-track">
              <div class="inline-bar-fill" style="width: ${Math.min(100, item.percentage).toFixed(1)}%; background-color: ${CATEGORY_PALETTE[idx % CATEGORY_PALETTE.length]}"></div>
            </div>
            <span class="tabular-nums" style="width: 46px; text-align: right;">${item.percentage.toFixed(1)}%</span>
          </div>
        </td>
        <td class="num tx-amount tabular-nums">${escapeHtml(formatCurrency(item.amount))}</td>
      </tr>
    `
    )
    .join('');

  container.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Category</th>
          <th class="num">Transactions</th>
          <th class="num">Avg. Ticket</th>
          <th>Share of Expenses</th>
          <th class="num">Total Spent</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
  `;
}
