/**
 * app.js
 * Main Application Controller & State Coordinator.
 * Connects storage.js (REST API), transactions.js, dashboard.js, analytics.js, and budget.js.
 */

import {
  seedInitialDataIfEmpty,
  getTransactions,
  getCachedTransactions,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  getBudgetConfig,
  saveBudgetConfig,
  resetToDemoData,
  clearAllData,
  getTodayISO,
  getMonthKeyOffset,
} from './storage.js';

import {
  escapeHtml,
  formatMonthLabel,
  extractAvailableMonths,
  populateCategoryFilterOptions,
  populateModalCategoryOptions,
  validateTransactionInput,
  renderTransactionsView,
} from './transactions.js';

import { renderDashboardView } from './dashboard.js';
import { renderAnalyticsView } from './analytics.js';
import { renderBudgetView } from './budget.js';

const VIEW_META = {
  dashboard: { title: 'Dashboard', subtitle: 'Financial Overview' },
  transactions: { title: 'The Confluence', subtitle: 'Real-Time Inflow & Outflow Registry' },
  analytics: { title: 'Analytics', subtitle: 'Spending & Savings Trends' },
  budget: { title: 'Budget', subtitle: 'Monthly Target & Alerts' },
};

const state = {
  activeView: 'dashboard',
  activeMonth: getMonthKeyOffset(0),
  analyticsRange: '6',
  txFilters: {
    search: '',
    type: 'all',
    category: 'all',
    month: 'all',
    sort: 'date-desc',
  },
  pendingConfirmAction: null,
  isLoading: false,
};

/**
 * Initializes the application on DOM ready.
 */
async function initApp() {
  bindGlobalEvents();
  setLoadingState(true);

  try {
    const migrationResult = await seedInitialDataIfEmpty();
    if (migrationResult && migrationResult.migrated && (migrationResult.txImportCount > 0 || migrationResult.budgetImportCount > 0)) {
      showToast(`Imported ${migrationResult.txImportCount} transactions from LocalStorage to database.`, 'success');
    }
  } catch (err) {
    console.warn('[App Init] Migration warning:', err);
  }

  await refreshApplication();
  switchView('dashboard');
}

/**
 * Sets visual loading state without altering layout.
 */
function setLoadingState(isLoading) {
  state.isLoading = isLoading;
  const loaderEl = document.getElementById('global-loading-indicator');
  const activeSection = document.querySelector(`.view-section.active`);

  if (loaderEl) {
    loaderEl.style.display = isLoading ? 'flex' : 'none';
  }

  if (activeSection) {
    activeSection.style.opacity = isLoading ? '0.4' : '1';
    activeSection.style.pointerEvents = isLoading ? 'none' : 'auto';
  }

  refreshIcons();
}

/**
 * Displays a visible error banner when backend cannot be reached.
 */
function setGlobalBackendError(errorMessage = null) {
  const errorEl = document.getElementById('global-backend-error');
  if (!errorEl) return;

  if (errorMessage) {
    errorEl.style.display = 'flex';
    errorEl.innerHTML = `
      <div class="alert-banner-left">
        <i data-lucide="wifi-off"></i>
        <div>
          <span class="alert-banner-title">Backend Connection Error:</span>
          <span>${escapeHtml(errorMessage)} — Please check that your Node.js backend server is running on port 3000.</span>
        </div>
      </div>
      <button type="button" class="btn btn-secondary" id="retry-backend-btn">Retry Connection</button>
    `;
    document.getElementById('retry-backend-btn')?.addEventListener('click', () => {
      refreshApplication();
    });
    refreshIcons();
  } else {
    errorEl.style.display = 'none';
    errorEl.innerHTML = '';
  }
}

/**
 * Reads latest data from API and re-renders active UI sections.
 */
async function refreshApplication() {
  setLoadingState(true);

  try {
    const transactions = await getTransactions();
    const budgetConfig = await getBudgetConfig(state.activeMonth);

    // Clear backend error if call succeeded
    setGlobalBackendError(null);

    syncMonthSelectors(transactions);
    populateCategoryFilterOptions(
      document.getElementById('tx-category-filter'),
      transactions,
      state.txFilters.category
    );

    const sharedHandlers = {
      onEdit: openEditTransactionModal,
      onDelete: requestDeleteTransaction,
      onOpenAdd: () => openAddTransactionModal(),
      onNavigate: switchView,
      onResetFilters: resetTransactionFilters,
    };

    if (state.activeView === 'dashboard') {
      renderDashboardView(transactions, budgetConfig, state.activeMonth, sharedHandlers);
    } else if (state.activeView === 'transactions') {
      renderTransactionsView(transactions, state.txFilters, sharedHandlers);
    } else if (state.activeView === 'analytics') {
      renderAnalyticsView(transactions, state.analyticsRange, sharedHandlers);
    } else if (state.activeView === 'budget') {
      renderBudgetView(transactions, budgetConfig, state.activeMonth, sharedHandlers);
    }
  } catch (err) {
    console.error('[Refresh Application Error]', err);
    setGlobalBackendError(err.message || 'Cannot communicate with the backend server.');
    showToast(`Error: ${err.message || 'Server communication failed.'}`, 'error');
  } finally {
    setLoadingState(false);
    refreshIcons();
  }
}

/**
 * Refreshes Lucide SVG icons in the DOM.
 */
function refreshIcons() {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

/**
 * Switches between Dashboard, Transactions, Analytics, and Budget views.
 */
function switchView(viewName) {
  if (!VIEW_META[viewName]) return;
  state.activeView = viewName;

  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });

  document.querySelectorAll('.view-section').forEach((section) => {
    const isMatch = section.id === `view-${viewName}`;
    section.hidden = !isMatch;
    section.classList.toggle('active', isMatch);
  });

  const titleEl = document.getElementById('page-title');
  const subtitleEl = document.getElementById('page-subtitle');
  if (titleEl) titleEl.textContent = VIEW_META[viewName].title;
  if (subtitleEl) subtitleEl.textContent = VIEW_META[viewName].subtitle;

  closeMobileSidebar();
  refreshApplication();
}

/**
 * Populates the topbar month selector and the transaction history month filter.
 */
function syncMonthSelectors(transactions = getCachedTransactions()) {
  const currentMonth = getMonthKeyOffset(0);
  const months = extractAvailableMonths(transactions, currentMonth);

  const globalSelect = document.getElementById('global-month-select');
  if (globalSelect) {
    globalSelect.innerHTML =
      months
        .map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(formatMonthLabel(m))}</option>`)
        .join('') + '<option value="all">All Time</option>';

    if (state.activeMonth === 'all' || months.includes(state.activeMonth)) {
      globalSelect.value = state.activeMonth;
    } else {
      state.activeMonth = currentMonth;
      globalSelect.value = currentMonth;
    }
  }

  const txMonthFilter = document.getElementById('tx-month-filter');
  if (txMonthFilter) {
    txMonthFilter.innerHTML =
      '<option value="all">All Months</option>' +
      months
        .map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(formatMonthLabel(m))}</option>`)
        .join('');

    txMonthFilter.value =
      state.txFilters.month === 'all' || months.includes(state.txFilters.month)
        ? state.txFilters.month
        : 'all';
  }
}

/**
 * Binds all UI event listeners once.
 */
function bindGlobalEvents() {
  // Sidebar navigation
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  document.querySelectorAll('[data-jump-view]').forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.dataset.jumpView));
  });

  document.querySelector('[data-nav-link="dashboard"]')?.addEventListener('click', (e) => {
    e.preventDefault();
    switchView('dashboard');
  });

  // Mobile sidebar drawer
  document.getElementById('open-sidebar-btn')?.addEventListener('click', openMobileSidebar);
  document.getElementById('close-sidebar-btn')?.addEventListener('click', closeMobileSidebar);
  document.getElementById('sidebar-backdrop')?.addEventListener('click', closeMobileSidebar);

  // Global active month selector
  document.getElementById('global-month-select')?.addEventListener('change', (e) => {
    state.activeMonth = e.target.value;
    refreshApplication();
  });

  // Add Transaction CTA
  document.getElementById('open-add-modal-btn')?.addEventListener('click', () => {
    openAddTransactionModal();
  });

  // Transaction Modal controls
  document.getElementById('close-tx-modal-btn')?.addEventListener('click', closeTransactionModal);
  document.getElementById('cancel-tx-modal-btn')?.addEventListener('click', closeTransactionModal);
  document.getElementById('transaction-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'transaction-modal') closeTransactionModal();
  });

  document.querySelectorAll('.type-toggle-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      setModalTransactionType(btn.dataset.txType);
    });
  });

  document.getElementById('transaction-form')?.addEventListener('submit', handleTransactionSubmit);

  // Transaction History Filters
  document.querySelectorAll('[data-filter-type]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.txFilters.type = btn.dataset.filterType;
      document.querySelectorAll('[data-filter-type]').forEach((b) => {
        b.classList.toggle('active', b === btn);
      });
      refreshApplication();
    });
  });

  document.getElementById('tx-search-input')?.addEventListener('input', (e) => {
    state.txFilters.search = e.target.value;
    refreshApplication();
  });

  document.getElementById('tx-category-filter')?.addEventListener('change', (e) => {
    state.txFilters.category = e.target.value;
    refreshApplication();
  });

  document.getElementById('tx-month-filter')?.addEventListener('change', (e) => {
    state.txFilters.month = e.target.value;
    refreshApplication();
  });

  document.getElementById('tx-sort-select')?.addEventListener('change', (e) => {
    state.txFilters.sort = e.target.value;
    refreshApplication();
  });

  document.getElementById('tx-clear-filters-btn')?.addEventListener('click', resetTransactionFilters);

  // Analytics Range Selector
  document.querySelectorAll('[data-analytics-range]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.analyticsRange = btn.dataset.analyticsRange;
      document.querySelectorAll('[data-analytics-range]').forEach((b) => {
        b.classList.toggle('active', b === btn);
      });
      refreshApplication();
    });
  });

  // Budget Form
  document.getElementById('budget-form')?.addEventListener('submit', handleBudgetSubmit);

  // Confirm Modal
  document.getElementById('close-confirm-modal-btn')?.addEventListener('click', closeConfirmModal);
  document.getElementById('cancel-confirm-btn')?.addEventListener('click', closeConfirmModal);
  document.getElementById('confirm-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'confirm-modal') closeConfirmModal();
  });
  document.getElementById('accept-confirm-btn')?.addEventListener('click', () => {
    if (typeof state.pendingConfirmAction === 'function') {
      state.pendingConfirmAction();
    }
    closeConfirmModal();
  });

  // Sidebar Data Utilities
  document.getElementById('export-csv-btn')?.addEventListener('click', exportTransactionsCSV);
  document.getElementById('reset-demo-btn')?.addEventListener('click', () => {
    openConfirmModal(
      'Reset Sample Data',
      'Restore the default multi-month sample transactions and $3,500 monthly budget in the database? Any custom entries will be replaced.',
      'Reset Data',
      async () => {
        try {
          await resetToDemoData();
          state.activeMonth = getMonthKeyOffset(0);
          resetTransactionFilters();
          await refreshApplication();
          showToast('Sample data restored in database.', 'success');
        } catch (err) {
          showToast(`Error resetting data: ${err.message}`, 'error');
        }
      }
    );
  });

  document.getElementById('clear-data-btn')?.addEventListener('click', () => {
    openConfirmModal(
      'Clear All Data',
      'Permanently remove all transactions and reset your monthly budget to $0 in the database? This action cannot be undone.',
      'Clear Everything',
      async () => {
        try {
          await clearAllData();
          resetTransactionFilters();
          await refreshApplication();
          showToast('All database records cleared.', 'success');
        } catch (err) {
          showToast(`Error clearing data: ${err.message}`, 'error');
        }
      }
    );
  });

  // Escape key closes open modals/drawers
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeTransactionModal();
      closeConfirmModal();
      closeMobileSidebar();
    }
  });
}

function resetTransactionFilters() {
  state.txFilters = {
    search: '',
    type: 'all',
    category: 'all',
    month: 'all',
    sort: 'date-desc',
  };

  const searchInput = document.getElementById('tx-search-input');
  const catSelect = document.getElementById('tx-category-filter');
  const monthSelect = document.getElementById('tx-month-filter');
  const sortSelect = document.getElementById('tx-sort-select');

  if (searchInput) searchInput.value = '';
  if (catSelect) catSelect.value = 'all';
  if (monthSelect) monthSelect.value = 'all';
  if (sortSelect) sortSelect.value = 'date-desc';

  document.querySelectorAll('[data-filter-type]').forEach((b) => {
    b.classList.toggle('active', b.dataset.filterType === 'all');
  });

  refreshApplication();
}

/* ==========================================================================
   Add / Edit Transaction Modal Logic
   ========================================================================== */

function clearTransactionFormErrors() {
  ['err-tx-title', 'err-tx-amount', 'err-tx-category', 'err-tx-date', 'err-tx-description'].forEach(
    (id) => {
      const el = document.getElementById(id);
      if (el) {
        el.hidden = true;
        el.textContent = '';
      }
    }
  );
}

function setModalTransactionType(type, selectedCategory = '') {
  const safeType = type === 'income' ? 'income' : 'expense';
  document.getElementById('tx-type-input').value = safeType;

  document.querySelectorAll('.type-toggle-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.txType === safeType);
  });

  populateModalCategoryOptions(
    document.getElementById('tx-category-input'),
    safeType,
    selectedCategory
  );
}

function openAddTransactionModal(defaultType = 'expense') {
  clearTransactionFormErrors();
  document.getElementById('tx-modal-title').textContent = 'Log to The Confluence';
  document.getElementById('submit-tx-btn').textContent = 'Save Entry';
  document.getElementById('tx-id-input').value = '';
  document.getElementById('tx-title-input').value = '';
  document.getElementById('tx-amount-input').value = '';
  document.getElementById('tx-date-input').value = getTodayISO();
  document.getElementById('tx-description-input').value = '';
  const locationInput = document.getElementById('tx-location-input');
  if (locationInput) locationInput.value = '';

  setModalTransactionType(defaultType);

  const modal = document.getElementById('transaction-modal');
  modal.hidden = false;
  refreshIcons();
  document.getElementById('tx-title-input')?.focus();
}

function openEditTransactionModal(id) {
  const tx = getCachedTransactions().find((item) => String(item.id) === String(id));
  if (!tx) return;

  clearTransactionFormErrors();
  document.getElementById('tx-modal-title').textContent = 'Edit Confluence Entry';
  document.getElementById('submit-tx-btn').textContent = 'Update Entry';
  document.getElementById('tx-id-input').value = String(tx.id);
  document.getElementById('tx-title-input').value = tx.title;
  document.getElementById('tx-amount-input').value = String(tx.amount);
  document.getElementById('tx-date-input').value = tx.date;
  document.getElementById('tx-description-input').value = tx.description || '';
  const locationInput = document.getElementById('tx-location-input');
  if (locationInput) locationInput.value = tx.location || '';

  setModalTransactionType(tx.type, tx.category);

  const modal = document.getElementById('transaction-modal');
  modal.hidden = false;
  refreshIcons();
  document.getElementById('tx-title-input')?.focus();
}

function closeTransactionModal() {
  const modal = document.getElementById('transaction-modal');
  if (modal) modal.hidden = true;
}

async function handleTransactionSubmit(e) {
  e.preventDefault();
  clearTransactionFormErrors();

  const id = document.getElementById('tx-id-input').value.trim();
  const payload = {
    title: document.getElementById('tx-title-input').value.trim(),
    amount: document.getElementById('tx-amount-input').value,
    type: document.getElementById('tx-type-input').value,
    category: document.getElementById('tx-category-input').value,
    date: document.getElementById('tx-date-input').value,
    description: document.getElementById('tx-description-input').value.trim(),
    location: document.getElementById('tx-location-input')?.value.trim() || '',
  };

  const validation = validateTransactionInput(payload);
  if (!validation.valid) {
    Object.entries(validation.errors).forEach(([field, msg]) => {
      const errEl = document.getElementById(`err-tx-${field}`);
      if (errEl) {
        errEl.textContent = msg;
        errEl.hidden = false;
      }
    });
    return;
  }

  const submitBtn = document.getElementById('submit-tx-btn');
  if (submitBtn) submitBtn.disabled = true;

  try {
    if (id) {
      await updateTransaction(Number(id), payload);
      showToast('Transaction updated.', 'success');
    } else {
      await createTransaction(payload);
      showToast('Transaction added.', 'success');
    }

    closeTransactionModal();
    await refreshApplication();
  } catch (err) {
    showToast(`Failed to save: ${err.message}`, 'error');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

/* ==========================================================================
   Delete & Confirmation Modal
   ========================================================================== */

function requestDeleteTransaction(id) {
  const tx = getCachedTransactions().find((item) => String(item.id) === String(id));
  if (!tx) return;

  openConfirmModal(
    'Delete Transaction',
    `Are you sure you want to delete "${tx.title}"? This action cannot be undone.`,
    'Delete',
    async () => {
      try {
        await deleteTransaction(Number(id));
        await refreshApplication();
        showToast('Transaction deleted.', 'success');
      } catch (err) {
        showToast(`Failed to delete: ${err.message}`, 'error');
      }
    }
  );
}

function openConfirmModal(title, message, confirmLabel, onConfirm) {
  document.getElementById('confirm-modal-title').textContent = title;
  document.getElementById('confirm-modal-message').textContent = message;
  document.getElementById('accept-confirm-btn').textContent = confirmLabel;
  state.pendingConfirmAction = onConfirm;
  document.getElementById('confirm-modal').hidden = false;
  refreshIcons();
}

function closeConfirmModal() {
  const modal = document.getElementById('confirm-modal');
  if (modal) modal.hidden = true;
  state.pendingConfirmAction = null;
}

/* ==========================================================================
   Budget Form Submission
   ========================================================================== */

async function handleBudgetSubmit(e) {
  e.preventDefault();
  const input = document.getElementById('budget-limit-input');
  const errEl = document.getElementById('budget-form-error');
  if (!input || !errEl) return;

  errEl.hidden = true;
  errEl.textContent = '';

  const limit = Number(input.value);
  if (!Number.isFinite(limit) || limit <= 0) {
    errEl.textContent = 'Enter a valid monthly budget greater than $0.';
    errEl.hidden = false;
    return;
  }

  if (limit > 100000000) {
    errEl.textContent = 'Budget limit is too large.';
    errEl.hidden = false;
    return;
  }

  const submitBtn = e.target.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.disabled = true;

  try {
    await saveBudgetConfig({ monthlyLimit: limit }, state.activeMonth);
    await refreshApplication();
    showToast('Monthly budget saved.', 'success');
  } catch (err) {
    errEl.textContent = `Error saving budget: ${err.message}`;
    errEl.hidden = false;
    showToast(`Error: ${err.message}`, 'error');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

/* ==========================================================================
   CSV Export, Mobile Sidebar & Toast Notifications
   ========================================================================== */

function exportTransactionsCSV() {
  const transactions = getCachedTransactions();
  if (transactions.length === 0) {
    showToast('No transactions to export.', 'error');
    return;
  }

  const escapeCsv = (val) => {
    const s = String(val ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const header = ['ID', 'Date', 'Title', 'Type', 'Category', 'Amount', 'Location', 'Description'];
  const rows = transactions.map((tx) =>
    [tx.id, tx.date, tx.title, tx.type, tx.category, tx.amount.toFixed(2), tx.location || '', tx.description]
      .map(escapeCsv)
      .join(',')
  );

  const csvContent = [header.join(','), ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `ledgerflow-transactions-${getTodayISO()}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  showToast(`Exported ${transactions.length} transactions to CSV.`, 'success');
}

function openMobileSidebar() {
  document.getElementById('sidebar')?.classList.add('open');
  document.getElementById('sidebar-backdrop')?.classList.add('open');
}

function closeMobileSidebar() {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebar-backdrop')?.classList.remove('open');
}

function showToast(message, variant = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${variant}`;
  const iconName = variant === 'error' ? 'alert-circle' : 'check-circle-2';
  toast.innerHTML = `<i data-lucide="${iconName}"></i><span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);
  refreshIcons();

  setTimeout(() => {
    toast.remove();
  }, 3200);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
