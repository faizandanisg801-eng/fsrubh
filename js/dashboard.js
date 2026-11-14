/**
 * dashboard.js
 * Pure dashboard calculations and Chart.js + recent transactions rendering.
 */

import { getMonthKeyOffset } from './storage.js';
import {
  escapeHtml,
  formatCurrency,
  formatDate,
  formatMonthLabel,
  formatShortMonth,
} from './transactions.js';
import { calculateBudgetStatus } from './budget.js';

export const CATEGORY_PALETTE = [
  '#2563EB',
  '#0F172A',
  '#0EA5E9',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#6366F1',
  '#64748B',
  '#14B8A6',
];

let overviewChartInstance = null;
let categoryChartInstance = null;

/**
 * Pure dashboard metrics computation.
 * Total Balance = Total Income - Total Expenses.
 */
export function calculateSummaryMetrics(transactions, targetMonth) {
  let totalIncome = 0;
  let totalExpenses = 0;
  let incomeCount = 0;
  let expenseCount = 0;

  let monthlySpending = 0;
  let monthlyIncome = 0;
  let monthlyExpenseCount = 0;

  const categoryTotals = new Map();

  for (const tx of transactions) {
    if (tx.type === 'income') {
      totalIncome += tx.amount;
      incomeCount += 1;
      if (targetMonth === 'all' || tx.date.startsWith(targetMonth)) {
        monthlyIncome += tx.amount;
      }
    } else {
      totalExpenses += tx.amount;
      expenseCount += 1;
      if (targetMonth === 'all' || tx.date.startsWith(targetMonth)) {
        monthlySpending += tx.amount;
        monthlyExpenseCount += 1;
        categoryTotals.set(tx.category, (categoryTotals.get(tx.category) || 0) + tx.amount);
      }
    }
  }

  const totalBalance = totalIncome - totalExpenses;

  // Build 6-month trend anchored around current month (or targetMonth if selected)
  const monthKeys = [];
  for (let offset = -5; offset <= 0; offset += 1) {
    monthKeys.push(getMonthKeyOffset(offset));
  }

  const monthlyOverview = monthKeys.map((key) => {
    let income = 0;
    let expense = 0;
    for (const tx of transactions) {
      if (tx.date.startsWith(key)) {
        if (tx.type === 'income') income += tx.amount;
        else expense += tx.amount;
      }
    }
    return {
      monthKey: key,
      label: formatShortMonth(key),
      income,
      expense,
    };
  });

  const expenseBreakdown = Array.from(categoryTotals.entries())
    .map(([category, amount]) => ({
      category,
      amount,
      percentage: monthlySpending > 0 ? (amount / monthlySpending) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  const recentTransactions = [...transactions]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6);

  return {
    totalBalance,
    totalIncome,
    totalExpenses,
    incomeCount,
    expenseCount,
    monthlySpending,
    monthlyIncome,
    monthlyExpenseCount,
    monthlyOverview,
    expenseBreakdown,
    recentTransactions,
  };
}

/**
 * Renders Dashboard KPIs, Budget Alert Strip, Charts, and Recent Transactions.
 */
export function renderDashboardView(transactions, budgetConfig, targetMonth, handlers) {
  const metrics = calculateSummaryMetrics(transactions, targetMonth);

  // 1. Update KPI Cards
  const balanceEl = document.getElementById('kpi-balance');
  const balanceMetaEl = document.getElementById('kpi-balance-meta');
  const incomeEl = document.getElementById('kpi-income');
  const incomeMetaEl = document.getElementById('kpi-income-meta');
  const expensesEl = document.getElementById('kpi-expenses');
  const expensesMetaEl = document.getElementById('kpi-expenses-meta');
  const monthlyEl = document.getElementById('kpi-monthly');
  const monthlyMetaEl = document.getElementById('kpi-monthly-meta');

  if (balanceEl) {
    balanceEl.textContent = formatCurrency(metrics.totalBalance);
    balanceEl.className = `kpi-value tabular-nums ${metrics.totalBalance < 0 ? 'expense-text' : ''}`;
  }
  if (balanceMetaEl) {
    balanceMetaEl.textContent = `${transactions.length} total recorded entries`;
  }
  if (incomeEl) incomeEl.textContent = formatCurrency(metrics.totalIncome);
  if (incomeMetaEl) {
    incomeMetaEl.textContent = `${metrics.incomeCount} income ${metrics.incomeCount === 1 ? 'entry' : 'entries'}`;
  }
  if (expensesEl) expensesEl.textContent = formatCurrency(metrics.totalExpenses);
  if (expensesMetaEl) {
    expensesMetaEl.textContent = `${metrics.expenseCount} expense ${metrics.expenseCount === 1 ? 'entry' : 'entries'}`;
  }
  if (monthlyEl) monthlyEl.textContent = formatCurrency(metrics.monthlySpending);
  if (monthlyMetaEl) {
    const label = targetMonth === 'all' ? 'All months' : formatMonthLabel(targetMonth);
    monthlyMetaEl.textContent = `${label} · ${metrics.monthlyExpenseCount} expenses`;
  }

  // 2. Budget Alert Banner on Dashboard
  const effectiveMonth = targetMonth === 'all' ? getMonthKeyOffset(0) : targetMonth;
  const budgetStatus = calculateBudgetStatus(transactions, budgetConfig, effectiveMonth);
  const alertEl = document.getElementById('dashboard-budget-alert');
  if (alertEl) {
    if (budgetStatus.status === 'exceeded') {
      alertEl.className = 'alert-banner danger';
      alertEl.innerHTML = `
        <div class="alert-banner-left">
          <i data-lucide="alert-octagon"></i>
          <div>
            <span class="alert-banner-title">Monthly Budget Exceeded:</span>
            <span>Spending in ${escapeHtml(formatMonthLabel(effectiveMonth))} is ${escapeHtml(formatCurrency(Math.abs(budgetStatus.remainingBudget)))} over your ${escapeHtml(formatCurrency(budgetStatus.monthlyLimit))} budget (${budgetStatus.utilizationPercent.toFixed(1)}%).</span>
          </div>
        </div>
        <button type="button" class="btn btn-secondary" data-jump-budget="true">Manage Budget</button>
      `;
      alertEl.querySelector('[data-jump-budget]')?.addEventListener('click', () => handlers.onNavigate('budget'));
    } else if (budgetStatus.status === 'warning') {
      alertEl.className = 'alert-banner warning';
      alertEl.innerHTML = `
        <div class="alert-banner-left">
          <i data-lucide="alert-triangle"></i>
          <div>
            <span class="alert-banner-title">Budget Warning (${budgetStatus.utilizationPercent.toFixed(1)}%):</span>
            <span>You have used ${escapeHtml(formatCurrency(budgetStatus.monthlySpent))} of your ${escapeHtml(formatCurrency(budgetStatus.monthlyLimit))} limit for ${escapeHtml(formatMonthLabel(effectiveMonth))}.</span>
          </div>
        </div>
        <button type="button" class="btn btn-secondary" data-jump-budget="true">Review Budget</button>
      `;
      alertEl.querySelector('[data-jump-budget]')?.addEventListener('click', () => handlers.onNavigate('budget'));
    } else {
      alertEl.className = 'alert-banner hidden';
      alertEl.innerHTML = '';
    }
  }

  // 3. Category Subtitle
  const catSubEl = document.getElementById('dashboard-category-subtitle');
  if (catSubEl) {
    catSubEl.textContent =
      targetMonth === 'all'
        ? 'Distribution across all recorded expenses'
        : `Distribution for ${formatMonthLabel(targetMonth)}`;
  }

  // 4. Render Charts
  renderOverviewChart(metrics.monthlyOverview);
  renderCategoryChart(metrics.expenseBreakdown);

  // 5. Render Recent Transactions
  renderRecentTransactionsTable(metrics.recentTransactions, handlers);
}

function renderOverviewChart(monthlyOverview) {
  const canvas = document.getElementById('dashboard-overview-chart');
  if (!canvas || typeof window.Chart === 'undefined') return;

  if (overviewChartInstance) {
    overviewChartInstance.destroy();
  }

  overviewChartInstance = new window.Chart(canvas, {
    type: 'bar',
    data: {
      labels: monthlyOverview.map((m) => m.label),
      datasets: [
        {
          label: 'Income',
          data: monthlyOverview.map((m) => m.income),
          backgroundColor: '#16A34A',
          borderRadius: 4,
          barPercentage: 0.72,
          categoryPercentage: 0.65,
        },
        {
          label: 'Expenses',
          data: monthlyOverview.map((m) => m.expense),
          backgroundColor: '#0F172A',
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

function renderCategoryChart(expenseBreakdown) {
  const canvas = document.getElementById('dashboard-category-chart');
  const legendEl = document.getElementById('dashboard-category-list');

  if (categoryChartInstance) {
    categoryChartInstance.destroy();
    categoryChartInstance = null;
  }

  if (!legendEl) return;

  if (expenseBreakdown.length === 0) {
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
    legendEl.innerHTML = `
      <div class="empty-state" style="padding: 20px 10px;">
        <p class="empty-state-desc">No expenses recorded for this period yet.</p>
      </div>
    `;
    return;
  }

  const topItems = expenseBreakdown.slice(0, 6);
  const colors = topItems.map((_, idx) => CATEGORY_PALETTE[idx % CATEGORY_PALETTE.length]);

  if (canvas && typeof window.Chart !== 'undefined') {
    categoryChartInstance = new window.Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: topItems.map((c) => c.category),
        datasets: [
          {
            data: topItems.map((c) => c.amount),
            backgroundColor: colors,
            borderColor: '#FFFFFF',
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '66%',
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#0F172A',
            padding: 10,
            callbacks: {
              label: (ctx) => {
                const item = topItems[ctx.dataIndex];
                return ` ${item.category}: ${formatCurrency(item.amount)} (${item.percentage.toFixed(1)}%)`;
              },
            },
          },
        },
      },
    });
  }

  legendEl.innerHTML = topItems
    .map(
      (item, idx) => `
      <div class="legend-row">
        <div class="legend-left">
          <span class="legend-swatch" style="background-color: ${colors[idx]}"></span>
          <span class="legend-name">${escapeHtml(item.category)}</span>
        </div>
        <div class="legend-right">
          <span class="legend-amount tabular-nums">${escapeHtml(formatCurrency(item.amount))}</span>
          <span class="legend-pct tabular-nums">${item.percentage.toFixed(0)}%</span>
        </div>
      </div>
    `
    )
    .join('');
}

function renderRecentTransactionsTable(recent, handlers) {
  const container = document.getElementById('dashboard-recent-container');
  if (!container) return;

  if (recent.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon"><i data-lucide="receipt"></i></div>
        <h3 class="empty-state-title">No recent transactions</h3>
        <p class="empty-state-desc">Add an income or expense entry to populate your activity feed.</p>
        <button type="button" class="btn btn-primary" id="dash-empty-add-btn">Add Transaction</button>
      </div>
    `;
    document.getElementById('dash-empty-add-btn')?.addEventListener('click', handlers.onOpenAdd);
    return;
  }

  const rowsHtml = recent
    .map((tx) => {
      const isIncome = tx.type === 'income';
      const signedAmount = isIncome ? tx.amount : -tx.amount;
      const amountClass = isIncome ? 'income-text' : 'expense-text';

      return `
        <tr>
          <td>
            <div class="tx-title-cell">${escapeHtml(tx.title)}</div>
            ${tx.description ? `<span class="tx-desc-sub">${escapeHtml(tx.description)}</span>` : ''}
          </td>
          <td class="tx-meta-inline">${escapeHtml(tx.category)}</td>
          <td class="tx-meta-inline tabular-nums">${escapeHtml(formatDate(tx.date))}</td>
          <td class="num tx-amount ${amountClass} tabular-nums">${escapeHtml(formatCurrency(signedAmount, true))}</td>
          <td class="num">
            <div class="row-actions">
              <button type="button" class="icon-btn" data-dash-edit="${escapeHtml(tx.id)}" aria-label="Edit ${escapeHtml(tx.title)}" title="Edit">
                <i data-lucide="pencil"></i>
              </button>
              <button type="button" class="icon-btn danger" data-dash-delete="${escapeHtml(tx.id)}" aria-label="Delete ${escapeHtml(tx.title)}" title="Delete">
                <i data-lucide="trash-2"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');

  container.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Transaction</th>
          <th>Category</th>
          <th>Date</th>
          <th class="num">Amount</th>
          <th class="num">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
  `;

  container.querySelectorAll('[data-dash-edit]').forEach((btn) => {
    btn.addEventListener('click', () => handlers.onEdit(btn.dataset.dashEdit));
  });
  container.querySelectorAll('[data-dash-delete]').forEach((btn) => {
    btn.addEventListener('click', () => handlers.onDelete(btn.dataset.dashDelete));
  });
}
