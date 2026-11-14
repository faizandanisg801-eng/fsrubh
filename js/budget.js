/**
 * budget.js
 * Pure budget calculations, threshold alerts (80% warning & >100% exceeded),
 * and Budget Management UI rendering.
 */

import { getMonthKeyOffset } from './storage.js';
import {
  escapeHtml,
  formatCurrency,
  formatMonthLabel,
  formatShortMonth,
} from './transactions.js';

let budgetHistoryChartInstance = null;

/**
 * Pure calculation of monthly budget status for a target YYYY-MM month.
 */
export function calculateBudgetStatus(transactions, budgetConfig, targetMonth) {
  const monthlyLimit = Math.max(0, Number(budgetConfig?.monthlyLimit) || 0);
  const monthKey = targetMonth && targetMonth !== 'all' ? targetMonth : getMonthKeyOffset(0);

  let monthlySpent = 0;
  let monthlyIncome = 0;
  const categoryTotals = new Map();

  for (const tx of transactions) {
    if (!tx.date.startsWith(monthKey)) continue;
    if (tx.type === 'income') {
      monthlyIncome += tx.amount;
    } else {
      monthlySpent += tx.amount;
      const prev = categoryTotals.get(tx.category) || { amount: 0, count: 0 };
      categoryTotals.set(tx.category, {
        amount: prev.amount + tx.amount,
        count: prev.count + 1,
      });
    }
  }

  const remainingBudget = monthlyLimit - monthlySpent;
  const utilizationPercent = monthlyLimit > 0 ? (monthlySpent / monthlyLimit) * 100 : 0;

  let status = 'healthy';
  if (monthlyLimit <= 0) {
    status = 'unset';
  } else if (utilizationPercent > 100) {
    status = 'exceeded';
  } else if (utilizationPercent >= 80) {
    status = 'warning';
  }

  // Projected end-of-month spend based on calendar progress
  const [yr, mo] = monthKey.split('-').map(Number);
  const daysInMonth = yr && mo ? new Date(yr, mo, 0).getDate() : 30;
  const now = new Date();
  const currentKey = getMonthKeyOffset(0);

  let elapsedDays = daysInMonth;
  if (monthKey === currentKey) {
    elapsedDays = Math.max(1, now.getDate());
  } else if (monthKey > currentKey) {
    elapsedDays = 1;
  }

  const dailyPace = monthlySpent / elapsedDays;
  const projectedSpend = monthKey === currentKey ? dailyPace * daysInMonth : monthlySpent;

  const categories = Array.from(categoryTotals.entries())
    .map(([category, info]) => ({
      category,
      amount: info.amount,
      count: info.count,
      shareOfBudget: monthlyLimit > 0 ? (info.amount / monthlyLimit) * 100 : 0,
      shareOfSpend: monthlySpent > 0 ? (info.amount / monthlySpent) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  return {
    monthKey,
    monthlyLimit,
    monthlySpent,
    monthlyIncome,
    remainingBudget,
    utilizationPercent,
    projectedSpend,
    status,
    categories,
  };
}

/**
 * Renders the Budget Management view.
 */
export function renderBudgetView(transactions, budgetConfig, targetMonth, handlers) {
  const effectiveMonth = targetMonth === 'all' ? getMonthKeyOffset(0) : targetMonth;
  const budget = calculateBudgetStatus(transactions, budgetConfig, effectiveMonth);

  const monthLabelEl = document.getElementById('budget-month-label');
  const limitInput = document.getElementById('budget-limit-input');
  const utilPctEl = document.getElementById('budget-utilization-pct');
  const progressBarEl = document.getElementById('budget-progressbar');
  const progressFillEl = document.getElementById('budget-progress-fill');
  const limitTickEl = document.getElementById('budget-limit-tick');

  const statLimitEl = document.getElementById('budget-stat-limit');
  const statSpentEl = document.getElementById('budget-stat-spent');
  const statRemainingEl = document.getElementById('budget-stat-remaining');
  const statProjectedEl = document.getElementById('budget-stat-projected');

  const bannerEl = document.getElementById('budget-status-banner');

  if (monthLabelEl) {
    monthLabelEl.textContent = `Tracking expenses for ${formatMonthLabel(effectiveMonth)}`;
  }

  if (limitInput && document.activeElement !== limitInput) {
    limitInput.value = budget.monthlyLimit > 0 ? String(budget.monthlyLimit) : '';
  }

  const clampedPct = Math.min(100, Math.max(0, budget.utilizationPercent));

  if (utilPctEl) {
    utilPctEl.textContent = budget.monthlyLimit > 0 ? `${budget.utilizationPercent.toFixed(1)}%` : 'Not set';
    utilPctEl.className = `budget-utilization-pct tabular-nums ${
      budget.status === 'exceeded'
        ? 'expense-text'
        : budget.status === 'warning'
        ? 'warning-text'
        : ''
    }`;
  }

  if (progressBarEl) {
    progressBarEl.setAttribute('aria-valuenow', String(Math.round(clampedPct)));
  }

  if (progressFillEl) {
    progressFillEl.style.width = `${clampedPct.toFixed(1)}%`;
    const fillState =
      budget.status === 'exceeded' ? 'danger' : budget.status === 'warning' ? 'warning' : 'healthy';
    progressFillEl.className = `progress-fill ${fillState}`;
  }

  if (limitTickEl) limitTickEl.textContent = formatCurrency(budget.monthlyLimit);
  if (statLimitEl) statLimitEl.textContent = formatCurrency(budget.monthlyLimit);
  if (statSpentEl) statSpentEl.textContent = formatCurrency(budget.monthlySpent);

  if (statRemainingEl) {
    if (budget.monthlyLimit <= 0) {
      statRemainingEl.textContent = '—';
      statRemainingEl.className = 'budget-stat-value tabular-nums';
    } else if (budget.remainingBudget < 0) {
      statRemainingEl.textContent = `-${formatCurrency(Math.abs(budget.remainingBudget))} over`;
      statRemainingEl.className = 'budget-stat-value tabular-nums expense-text';
    } else {
      statRemainingEl.textContent = formatCurrency(budget.remainingBudget);
      statRemainingEl.className = 'budget-stat-value tabular-nums income-text';
    }
  }

  if (statProjectedEl) {
    statProjectedEl.textContent = formatCurrency(budget.projectedSpend);
  }

  // Render Alert Banner (80% warning & >100% exceeded)
  if (bannerEl) {
    if (budget.status === 'exceeded') {
      bannerEl.className = 'alert-banner danger';
      bannerEl.innerHTML = `
        <div class="alert-banner-left">
          <i data-lucide="alert-octagon"></i>
          <div>
            <span class="alert-banner-title">Budget Exceeded:</span>
            <span>You have spent ${escapeHtml(formatCurrency(budget.monthlySpent))} against a ${escapeHtml(formatCurrency(budget.monthlyLimit))} budget (${budget.utilizationPercent.toFixed(1)}%). Over limit by ${escapeHtml(formatCurrency(Math.abs(budget.remainingBudget)))}.</span>
          </div>
        </div>
      `;
    } else if (budget.status === 'warning') {
      bannerEl.className = 'alert-banner warning';
      bannerEl.innerHTML = `
        <div class="alert-banner-left">
          <i data-lucide="alert-triangle"></i>
          <div>
            <span class="alert-banner-title">80% Threshold Reached:</span>
            <span>You have used ${budget.utilizationPercent.toFixed(1)}% of your monthly budget. ${escapeHtml(formatCurrency(budget.remainingBudget))} remaining for ${escapeHtml(formatMonthLabel(effectiveMonth))}.</span>
          </div>
        </div>
      `;
    } else if (budget.status === 'healthy') {
      bannerEl.className = 'alert-banner healthy';
      bannerEl.innerHTML = `
        <div class="alert-banner-left">
          <i data-lucide="check-circle-2"></i>
          <div>
            <span class="alert-banner-title">On Track:</span>
            <span>Monthly spending is at ${budget.utilizationPercent.toFixed(1)}% of your ${escapeHtml(formatCurrency(budget.monthlyLimit))} limit with ${escapeHtml(formatCurrency(budget.remainingBudget))} remaining.</span>
          </div>
        </div>
      `;
    } else {
      bannerEl.className = 'alert-banner warning';
      bannerEl.innerHTML = `
        <div class="alert-banner-left">
          <i data-lucide="info"></i>
          <div>
            <span class="alert-banner-title">No Monthly Budget Set:</span>
            <span>Enter a monthly spending limit below to activate budget tracking and threshold alerts.</span>
          </div>
        </div>
      `;
    }
  }

  renderBudgetHistoryChart(transactions, budget.monthlyLimit);
  renderBudgetCategoryTable(budget, handlers);
}

function renderBudgetHistoryChart(transactions, monthlyLimit) {
  const canvas = document.getElementById('budget-history-chart');
  if (!canvas || typeof window.Chart === 'undefined') return;

  if (budgetHistoryChartInstance) {
    budgetHistoryChartInstance.destroy();
    budgetHistoryChartInstance = null;
  }

  const months = [];
  for (let offset = -5; offset <= 0; offset += 1) {
    months.push(getMonthKeyOffset(offset));
  }

  const spentValues = months.map((key) => {
    let total = 0;
    for (const tx of transactions) {
      if (tx.type === 'expense' && tx.date.startsWith(key)) {
        total += tx.amount;
      }
    }
    return total;
  });

  const barColors = spentValues.map((val) => {
    if (monthlyLimit <= 0) return '#2563EB';
    const pct = (val / monthlyLimit) * 100;
    if (pct > 100) return '#DC2626';
    if (pct >= 80) return '#D97706';
    return '#16A34A';
  });

  const datasets = [
    {
      type: 'bar',
      label: 'Monthly Spending',
      data: spentValues,
      backgroundColor: barColors,
      borderRadius: 4,
      barPercentage: 0.6,
    },
  ];

  if (monthlyLimit > 0) {
    datasets.push({
      type: 'line',
      label: 'Budget Limit',
      data: months.map(() => monthlyLimit),
      borderColor: '#0F172A',
      borderWidth: 2,
      borderDash: [5, 5],
      pointRadius: 0,
      fill: false,
    });
  }

  budgetHistoryChartInstance = new window.Chart(canvas, {
    data: {
      labels: months.map(formatShortMonth),
      datasets,
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

function renderBudgetCategoryTable(budget, handlers) {
  const container = document.getElementById('budget-categories-container');
  if (!container) return;

  if (budget.categories.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon"><i data-lucide="wallet"></i></div>
        <h3 class="empty-state-title">No expenses recorded for ${escapeHtml(formatMonthLabel(budget.monthKey))}</h3>
        <p class="empty-state-desc">Add an expense for this month to see how it impacts your monthly budget.</p>
        <button type="button" class="btn btn-primary" id="budget-empty-add-btn">Add Expense</button>
      </div>
    `;
    document.getElementById('budget-empty-add-btn')?.addEventListener('click', handlers.onOpenAdd);
    return;
  }

  const rowsHtml = budget.categories
    .map((cat) => {
      const pctDisplay =
        budget.monthlyLimit > 0
          ? `${cat.shareOfBudget.toFixed(1)}% of budget`
          : `${cat.shareOfSpend.toFixed(1)}% of spend`;
      const barWidth =
        budget.monthlyLimit > 0 ? Math.min(100, cat.shareOfBudget) : Math.min(100, cat.shareOfSpend);

      return `
        <tr>
          <td class="tx-title-cell">${escapeHtml(cat.category)}</td>
          <td class="num tabular-nums">${cat.count}</td>
          <td>
            <div class="inline-bar-wrap">
              <div class="inline-bar-track">
                <div class="inline-bar-fill" style="width: ${barWidth.toFixed(1)}%"></div>
              </div>
              <span class="tabular-nums" style="min-width: 105px; text-align: right; font-size: 12px; color: var(--text-muted);">${escapeHtml(pctDisplay)}</span>
            </div>
          </td>
          <td class="num tx-amount tabular-nums">${escapeHtml(formatCurrency(cat.amount))}</td>
        </tr>
      `;
    })
    .join('');

  container.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Category</th>
          <th class="num">Entries</th>
          <th>Budget Impact</th>
          <th class="num">Spent</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
  `;
}
