/**
 * transactions.js
 * Pure transaction business logic (validation, filtering, sorting, formatting)
 * plus Transaction History table & Add/Edit modal rendering.
 */

import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from './storage.js';

/**
 * Escapes HTML special characters to prevent XSS in template strings.
 */
export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Formats a numeric value as USD currency.
 */
export function formatCurrency(value, showSign = false) {
  const num = Number(value) || 0;
  const absFormatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(num));

  if (num < 0) return `-${absFormatted}`;
  if (showSign && num > 0) return `+${absFormatted}`;
  return absFormatted;
}

/**
 * Formats YYYY-MM-DD as human-readable short date (e.g. Nov 13, 2026).
 */
export function formatDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return '—';
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return dateStr;
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(d);
}

/**
 * Formats YYYY-MM as Month Year (e.g. November 2026).
 */
export function formatMonthLabel(monthKey) {
  if (!monthKey || monthKey === 'all') return 'All Months';
  const [y, m] = monthKey.split('-').map(Number);
  if (!y || !m) return monthKey;
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(y, m - 1, 1));
}

/**
 * Formats YYYY-MM as compact label for charts (e.g. Nov '26).
 */
export function formatShortMonth(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  if (!y || !m) return monthKey;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: '2-digit',
  }).format(new Date(y, m - 1, 1));
}

/**
 * Validates transaction form input. Pure function.
 */
export function validateTransactionInput(data) {
  const errors = {};

  if (!data.title || data.title.trim().length < 2) {
    errors.title = 'Enter a title of at least 2 characters.';
  }

  const parsedAmount = Number(data.amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    errors.amount = 'Enter a valid amount greater than 0.';
  } else if (parsedAmount > 100000000) {
    errors.amount = 'Amount cannot exceed $100,000,000.';
  }

  if (data.type !== 'income' && data.type !== 'expense') {
    errors.type = 'Select either income or expense.';
  }

  if (!data.category || data.category.trim() === '') {
    errors.category = 'Select a category.';
  }

  if (!data.date || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
    errors.date = 'Select a valid date.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Pure filter & sort pipeline for transaction arrays.
 */
export function filterAndSortTransactions(transactions, filters = {}) {
  const {
    search = '',
    type = 'all',
    category = 'all',
    month = 'all',
    sort = 'date-desc',
  } = filters;

  const query = search.trim().toLowerCase();

  const filtered = transactions.filter((tx) => {
    if (type !== 'all' && tx.type !== type) return false;
    if (category !== 'all' && tx.category !== category) return false;
    if (month !== 'all' && !tx.date.startsWith(month)) return false;

    if (query) {
      const hay = `${tx.title} ${tx.description} ${tx.category} ${tx.amount} ${tx.location || ''}`.toLowerCase();
      if (!hay.includes(query)) return false;
    }
    return true;
  });

  const sorted = [...filtered];
  sorted.sort((a, b) => {
    switch (sort) {
      case 'date-asc':
        return a.date.localeCompare(b.date);
      case 'amount-desc':
        return b.amount - a.amount;
      case 'amount-asc':
        return a.amount - b.amount;
      case 'date-desc':
      default:
        return b.date.localeCompare(a.date);
    }
  });

  return sorted;
}

/**
 * Returns sorted list of unique YYYY-MM keys present in transactions + current month.
 */
export function extractAvailableMonths(transactions, currentMonthKey) {
  const set = new Set();
  if (currentMonthKey) set.add(currentMonthKey);
  for (const tx of transactions) {
    if (tx.date && tx.date.length >= 7) {
      set.add(tx.date.slice(0, 7));
    }
  }
  return Array.from(set).sort((a, b) => b.localeCompare(a));
}

/**
 * Populates category dropdown in the Transaction History filter bar.
 */
export function populateCategoryFilterOptions(selectEl, transactions, selectedValue) {
  const categories = new Set([...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES]);
  transactions.forEach((tx) => {
    if (tx.category) categories.add(tx.category);
  });

  const sorted = Array.from(categories).sort();
  selectEl.innerHTML =
    '<option value="all">All Categories</option>' +
    sorted
      .map((cat) => `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`)
      .join('');

  selectEl.value = sorted.includes(selectedValue) ? selectedValue : 'all';
}

/**
 * Populates category dropdown inside the Add/Edit modal based on transaction type.
 */
export function populateModalCategoryOptions(selectEl, type, selectedCategory = '') {
  const list = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  selectEl.innerHTML = list
    .map((cat) => `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`)
    .join('');

  if (selectedCategory && list.includes(selectedCategory)) {
    selectEl.value = selectedCategory;
  } else {
    selectEl.value = list[0];
  }
}

/**
 * Renders the full Transaction History view (table + filtered totals).
 */
export function renderTransactionsView(transactions, filters, handlers) {
  const filtered = filterAndSortTransactions(transactions, filters);

  const summaryEl = document.getElementById('transactions-summary-text');
  const incomeEl = document.getElementById('tx-filtered-income');
  const expenseEl = document.getElementById('tx-filtered-expense');
  const netEl = document.getElementById('tx-filtered-net');
  const container = document.getElementById('transactions-table-container');

  let filteredIncome = 0;
  let filteredExpense = 0;
  for (const tx of filtered) {
    if (tx.type === 'income') filteredIncome += tx.amount;
    else filteredExpense += tx.amount;
  }
  const filteredNet = filteredIncome - filteredExpense;

  if (summaryEl) {
    summaryEl.textContent = `${filtered.length} ${filtered.length === 1 ? 'transaction' : 'transactions'} shown`;
  }
  if (incomeEl) incomeEl.textContent = formatCurrency(filteredIncome);
  if (expenseEl) expenseEl.textContent = formatCurrency(filteredExpense);
  if (netEl) {
    netEl.textContent = formatCurrency(filteredNet, true);
    netEl.className = `filtered-val tabular-nums ${filteredNet >= 0 ? 'income-text' : 'expense-text'}`;
  }

  if (!container) return;

  if (filtered.length === 0) {
    const hasActiveFilters =
      filters.search ||
      filters.type !== 'all' ||
      filters.category !== 'all' ||
      filters.month !== 'all';

    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon"><i data-lucide="inbox"></i></div>
        <h3 class="empty-state-title">${hasActiveFilters ? 'No matching transactions' : 'No transactions recorded yet'}</h3>
        <p class="empty-state-desc">
          ${
            hasActiveFilters
              ? 'Try clearing or adjusting your search query and filters.'
              : 'Record your first income or expense entry to start tracking your ledger.'
          }
        </p>
        ${
          hasActiveFilters
            ? '<button type="button" class="btn btn-secondary" id="empty-reset-filters-btn">Clear Filters</button>'
            : '<button type="button" class="btn btn-primary" id="empty-add-tx-btn">Add Transaction</button>'
        }
      </div>
    `;

    const resetBtn = document.getElementById('empty-reset-filters-btn');
    if (resetBtn && handlers.onResetFilters) {
      resetBtn.addEventListener('click', handlers.onResetFilters);
    }
    const addBtn = document.getElementById('empty-add-tx-btn');
    if (addBtn && handlers.onOpenAdd) {
      addBtn.addEventListener('click', handlers.onOpenAdd);
    }
    return;
  }

  const rowsHtml = filtered
    .map((tx) => {
      const isIncome = tx.type === 'income';
      const signedAmount = isIncome ? tx.amount : -tx.amount;
      const amountClass = isIncome ? 'income-text' : 'expense-text';
      const typeLabel = isIncome ? 'Income' : 'Expense';

      return `
        <tr data-tx-id="${escapeHtml(tx.id)}">
          <td>
            <div class="tx-title-cell">${escapeHtml(tx.title)}</div>
            ${tx.location ? `<span class="tx-desc-sub" style="color: var(--accent-blue); font-weight: 500;">📍 ${escapeHtml(tx.location)}</span>` : ''}
            ${tx.description ? `<span class="tx-desc-sub">${escapeHtml(tx.description)}</span>` : ''}
          </td>
          <td class="tx-meta-inline">${escapeHtml(tx.category)}</td>
          <td class="tx-meta-inline">${typeLabel}</td>
          <td class="tx-meta-inline tabular-nums">${escapeHtml(formatDate(tx.date))}</td>
          <td class="num tx-amount ${amountClass} tabular-nums">${escapeHtml(formatCurrency(signedAmount, true))}</td>
          <td class="num">
            <div class="row-actions">
              <button type="button" class="icon-btn" data-action="edit" data-id="${escapeHtml(tx.id)}" aria-label="Edit ${escapeHtml(tx.title)}" title="Edit">
                <i data-lucide="pencil"></i>
              </button>
              <button type="button" class="icon-btn danger" data-action="delete" data-id="${escapeHtml(tx.id)}" aria-label="Delete ${escapeHtml(tx.title)}" title="Delete">
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
          <th>Type</th>
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

  container.querySelectorAll('[data-action="edit"]').forEach((btn) => {
    btn.addEventListener('click', () => handlers.onEdit(btn.dataset.id));
  });
  container.querySelectorAll('[data-action="delete"]').forEach((btn) => {
    btn.addEventListener('click', () => handlers.onDelete(btn.dataset.id));
  });
}
