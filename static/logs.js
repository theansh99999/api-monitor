/**
 * API Monitoring Logs Page - JavaScript
 * Handles log filtering, pagination, and display
 */

// Global variables
let currentPage = 1;
let totalPages = 1;
const LOGS_PER_PAGE = 10;
const THEME_KEY = 'api-monitor-theme';

/**
 * Initialize logs page on page load
 */
document.addEventListener('DOMContentLoaded', function() {
    console.log('Logs page initializing...');
    
    // Initialize theme
    initializeTheme();
    
    // Set up theme toggle
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }
    
    // Load APIs for filter dropdown
    loadAPIsForFilter();
    
    // Load initial logs
    loadLogs();
    
    // Set up filter form submission
    const filterForm = document.getElementById('filter-form');
    if (filterForm) {
        filterForm.addEventListener('submit', function(e) {
            e.preventDefault();
            currentPage = 1;
            loadLogs();
        });
    }
    
    console.log('Logs page initialized');
});

/**
 * Initialize theme from localStorage
 */
function initializeTheme() {
    const savedTheme = localStorage.getItem(THEME_KEY) || 'light';
    applyTheme(savedTheme);
}

/**
 * Apply theme to document
 */
function applyTheme(theme) {
    if (theme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.innerHTML = '☀️';
            themeToggle.title = 'Switch to Light Mode';
        }
    } else {
        document.documentElement.setAttribute('data-theme', 'light');
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.innerHTML = '🌙';
            themeToggle.title = 'Switch to Dark Mode';
        }
    }
}

/**
 * Toggle between dark and light theme
 */
function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    localStorage.setItem(THEME_KEY, newTheme);
    applyTheme(newTheme);
}

/**
 * Load APIs for filter dropdown
 */
function loadAPIsForFilter() {
    fetch('/api/apis')
        .then(response => response.json())
        .then(apis => {
            const filterSelect = document.getElementById('filter-api');
            filterSelect.innerHTML = '<option value="">All APIs</option>';
            apis.forEach(api => {
                const option = document.createElement('option');
                option.value = api.id;
                option.textContent = api.name;
                filterSelect.appendChild(option);
            });
        })
        .catch(error => console.error('Error loading APIs:', error));
}

/**
 * Load logs with current filters
 */
function loadLogs() {
    const apiId = document.getElementById('filter-api').value;
    const status = document.getElementById('filter-status').value;
    const startDate = document.getElementById('filter-start-date').value;
    const endDate = document.getElementById('filter-end-date').value;
    
    // Build query parameters
    const params = new URLSearchParams();
    if (apiId) params.append('api_id', apiId);
    if (status) params.append('status', status);
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    params.append('page', currentPage);
    params.append('per_page', LOGS_PER_PAGE);
    
    fetch(`/api/logs?${params}`)
        .then(response => {
            if (!response.ok) throw new Error('Failed to fetch logs');
            return response.json();
        })
        .then(data => {
            displayLogs(data.logs);
            updatePagination(data);
        })
        .catch(error => {
            console.error('Error loading logs:', error);
            document.getElementById('logs-tbody').innerHTML = '<tr><td colspan="5" class="text-center text-danger">Error loading logs</td></tr>';
        });
}

/**
 * Display logs in table
 */
function displayLogs(logs) {
    const tbody = document.getElementById('logs-tbody');
    const noLogs = document.getElementById('no-logs');
    
    if (logs.length === 0) {
        tbody.innerHTML = '';
        noLogs.style.display = 'block';
        return;
    }
    
    noLogs.style.display = 'none';
    tbody.innerHTML = '';
    
    logs.forEach(log => {
        const row = document.createElement('tr');
        
        // Determine status styling
        let statusClass = 'status-unknown';
        let statusIcon = '?';
        
        if (log.status === 'UP') {
            statusClass = 'status-up';
            statusIcon = '✓';
        } else if (log.status === 'DOWN') {
            statusClass = 'status-down';
            statusIcon = '✗';
        } else if (log.status === 'SLOW') {
            statusClass = 'status-slow';
            statusIcon = '⏱';
        } else if (log.status === 'ERROR') {
            statusClass = 'status-error';
            statusIcon = '!';
        }
        
        // Get severity badge class
        let severityClass = '';
        let severityText = '';
        if (log.error_severity) {
            severityClass = `severity-${log.error_severity.toLowerCase()}`;
            severityText = log.error_severity;
        }
        
        const timestamp = new Date(log.timestamp).toLocaleString();
        const errorMessage = log.error_message || '—';
        const severityBadge = severityText ? 
            `<span class="severity-${log.error_severity.toLowerCase()}">${severityText}</span>` : '—';
        
        row.innerHTML = `
            <td><strong>${escapeHTML(log.api_name)}</strong></td>
            <td>
                <span class="status-badge ${statusClass}">
                    ${statusIcon} ${log.status}
                </span>
            </td>
            <td>
                ${log.status_code || '—'}
            </td>
            <td>
                <span>${log.response_time.toFixed(2)} ms</span>
            </td>
            <td>
                <small class="error-message">${escapeHTML(errorMessage)}</small>
            </td>
            <td>
                ${severityBadge}
            </td>
            <td>
                <small class="text-muted">${timestamp}</small>
            </td>
        `;
        
        tbody.appendChild(row);
    });
    
    // Update log count
    const logCount = document.getElementById('log-count');
    if (logCount) {
        logCount.textContent = `${logs.length} logs`;
    }
}

/**
 * Escape HTML special characters
 */
function escapeHTML(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Update pagination controls
 */
function updatePagination(data) {
    totalPages = data.pages;
    currentPage = data.current_page;
    
    const paginationNav = document.getElementById('pagination-nav');
    const currentPageEl = document.getElementById('current-page');
    const totalPagesEl = document.getElementById('total-pages');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    
    if (totalPages <= 1) {
        paginationNav.style.display = 'none';
        return;
    }
    
    paginationNav.style.display = 'block';
    currentPageEl.textContent = currentPage;
    totalPagesEl.textContent = totalPages;
    
    // Update button states
    if (currentPage <= 1) {
        prevBtn.classList.add('disabled');
    } else {
        prevBtn.classList.remove('disabled');
    }
    
    if (currentPage >= totalPages) {
        nextBtn.classList.add('disabled');
    } else {
        nextBtn.classList.remove('disabled');
    }
}

/**
 * Go to previous page
 */
function previousPage() {
    if (currentPage > 1) {
        currentPage--;
        loadLogs();
    }
}

/**
 * Go to next page
 */
function nextPage() {
    if (currentPage < totalPages) {
        currentPage++;
        loadLogs();
    }
}

/**
 * Apply filters and reset to page 1
 */
function applyFilters() {
    currentPage = 1;
    loadLogs();
}

/**
 * Reset all filters
 */
function resetFilters() {
    document.getElementById('filter-api').value = '';
    document.getElementById('filter-status').value = '';
    document.getElementById('filter-start-date').value = '';
    document.getElementById('filter-end-date').value = '';
    currentPage = 1;
    loadLogs();
}

/**
 * Download logs as CSV
 */
function downloadLogs() {
    const apiId = document.getElementById('filter-api').value;
    const status = document.getElementById('filter-status').value;
    const startDate = document.getElementById('filter-start-date').value;
    const endDate = document.getElementById('filter-end-date').value;
    
    // Build query parameters
    const params = new URLSearchParams();
    if (apiId) params.append('api_id', apiId);
    if (status) params.append('status', status);
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    
    const queryString = params.toString();
    const url = queryString ? `/download/logs/all?${queryString}` : '/download/logs/all';
    
    // Trigger download navigating to the URL
    window.location.href = url;
}
