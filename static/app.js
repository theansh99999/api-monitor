/**
 * API Monitoring Dashboard - JavaScript
 * Handles dashboard interactions, data fetching, and Chart.js visualization
 * Supports dark/light themes, API comparison, and monitoring control
 */

// Global variables
let responseTimeChart = null;
let selectedApis = new Set();
let allApis = []; // Store all APIs for search/filtering
let currentPage = 1;
let itemsPerPage = 5;
const REFRESH_INTERVAL = 10000; // 10 seconds
const API_STATS_URL = '/api/stats';
const API_APIS_URL = '/api/apis';
const API_LOGS_URL = '/api/logs';
const ADD_API_URL = '/add_api';

// Theme management
const THEME_KEY = 'api-monitor-theme';

/**
 * Initialize dashboard on page load
 */
document.addEventListener('DOMContentLoaded', function() {
    console.log('Dashboard initializing...');
    
    // Initialize theme
    initializeTheme();
    
    // Set up theme toggle
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }
    
    // Initialize chart
    initializeChart();
    
    // Load initial data
    loadDashboardStats();
    loadAPIs();
    loadProjects();
    
    // Set up auto-refresh
    setInterval(refreshDashboard, REFRESH_INTERVAL);
    
    // Set up form submission - only add listener if not already present
    const form = document.getElementById('add-api-form');
    if (form && !form.hasAttribute('data-listener-attached')) {
        form.addEventListener('submit', handleAddAPI);
        form.setAttribute('data-listener-attached', 'true');
    }
    
    // Set up search functionality
    const searchInput = document.getElementById('api-search');
    if (searchInput) {
        searchInput.addEventListener('input', handleSearch);
    }
    
    // Set up pagination
    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');
    if (prevBtn) prevBtn.addEventListener('click', () => changePage(-1));
    if (nextBtn) nextBtn.addEventListener('click', () => changePage(1));
    
    // Set up select all checkbox
    const selectAllCheckbox = document.getElementById('select-all-apis');
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', function() {
            const checkboxes = document.querySelectorAll('input[name="api-checkbox"]');
            checkboxes.forEach(cb => {
                cb.checked = this.checked;
                if (this.checked) {
                    selectedApis.add(parseInt(cb.value));
                } else {
                    selectedApis.delete(parseInt(cb.value));
                }
            });
            updateBulkActions();
        });
    }
    
    console.log('Dashboard initialized');
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
 * Refresh all dashboard data
 */
function refreshDashboard() {
    console.log('Refreshing dashboard...');
    loadDashboardStats();
    loadAPIs();
    loadFailureAlerts();
    updateResponseTimeChart();
}

/**
 * Load dashboard statistics
 */
function loadDashboardStats() {
    fetch(API_STATS_URL)
        .then(response => {
            if (!response.ok) throw new Error('Failed to fetch stats');
            return response.json();
        })
        .then(data => {
            // Update stats cards
            document.getElementById('total-apis').textContent = data.total_apis;
            const activeApisEl = document.getElementById('active-apis');
            if (activeApisEl) activeApisEl.textContent = data.active_apis;
            const pausedApisEl = document.getElementById('paused-apis');
            if (pausedApisEl) pausedApisEl.textContent = data.paused_apis;
            const slowApisEl = document.getElementById('slow-apis-count');
            if (slowApisEl) slowApisEl.textContent = data.slow_apis;
            document.getElementById('avg-response-val').textContent = data.avg_response_time;
            document.getElementById('error-count').textContent = data.error_count;
            const totalErrorsEl = document.getElementById('total-errors');
            if (totalErrorsEl) totalErrorsEl.textContent = data.total_errors;
            const uptimeValEl = document.getElementById('uptime-val');
            if (uptimeValEl) uptimeValEl.textContent = data.uptime_percentage;
            
            // Update slowest API
            const slowestApiNameEl = document.getElementById('slowest-api-name');
            const slowestApiTimeEl = document.getElementById('slowest-api-time');
            if (slowestApiNameEl && slowestApiTimeEl) {
                if (data.slowest_api) {
                    slowestApiNameEl.textContent = data.slowest_api.name;
                    slowestApiTimeEl.textContent = data.slowest_api.avg_response_time + ' ms';
                } else {
                    slowestApiNameEl.textContent = 'N/A';
                    slowestApiTimeEl.textContent = '0 ms';
                }
            }
            
            console.log('Stats updated:', data);
        })
        .catch(error => {
            console.error('Error loading stats:', error);
        });
}

/**
 * Load all APIs and display in table
 */
function loadAPIs() {
    fetch(API_APIS_URL)
        .then(response => {
            if (!response.ok) throw new Error('Failed to fetch APIs');
            return response.json();
        })
        .then(apis => {
            allApis = apis; // Store all APIs for search/filtering
            displayFilteredAPIs(); // Display filtered and paginated results
            console.log('APIs loaded:', apis.length);
        })
        .catch(error => {
            console.error('Error loading APIs:', error);
        });
}

/**
 * Load projects and populate dropdown
 */
function loadProjects() {
    fetch('/api/projects')
        .then(response => {
            if (!response.ok) throw new Error('Failed to fetch projects');
            return response.json();
        })
        .then(projects => {
            populateProjectDropdown(projects);
            console.log('Projects loaded:', projects.length);
        })
        .catch(error => {
            console.error('Error loading projects:', error);
            // Fallback: show default option only
            populateProjectDropdown([]);
        });
}

/**
 * Populate project dropdown with fetched projects
 */
function populateProjectDropdown(projects) {
    const select = document.getElementById('project-id');
    if (!select) return;
    
    // Clear existing options except the first one
    select.innerHTML = '<option value="">No Project</option>';
    
    // Add projects
    projects.forEach(project => {
        const option = document.createElement('option');
        option.value = project.id;
        option.textContent = project.name;
        select.appendChild(option);
    });
}

/**
 * Display APIs in table
 */
function displayAPIs(apis) {
    const tbody = document.getElementById('apis-tbody');
    const noAPIs = document.getElementById('no-apis');
    
    if (apis.length === 0) {
        tbody.innerHTML = '';
        // Check if this is due to search filtering
        const searchTerm = document.getElementById('api-search').value.trim();
        if (searchTerm && allApis.length > 0) {
            noAPIs.innerHTML = `
                <div class="text-center py-5">
                    <i class="bi bi-search text-muted" style="font-size: 3rem;"></i>
                    <h5 class="text-muted mt-3">No APIs match your search</h5>
                    <p class="text-muted">Try adjusting your search terms</p>
                </div>
            `;
        } else {
            noAPIs.innerHTML = `
                <div class="text-center py-5">
                    <i class="bi bi-diagram-3 text-muted" style="font-size: 3rem;"></i>
                    <h5 class="text-muted mt-3">No APIs configured</h5>
                    <p class="text-muted">Add your first API to start monitoring</p>
                </div>
            `;
        }
        noAPIs.style.display = 'block';
        return;
    }
    
    noAPIs.style.display = 'none';
    tbody.innerHTML = '';
    
    apis.forEach(api => {
        const row = document.createElement('tr');
        
        // Determine status styling
        let statusClass = 'status-unknown';
        let dotClass = 'unknown';
        
        if (api.status === 'UP') {
            statusClass = 'status-up';
            dotClass = 'up';
        } else if (api.status === 'DOWN') {
            statusClass = 'status-down';
            dotClass = 'down';
        } else if (api.status === 'SLOW') {
            statusClass = 'status-slow';
            dotClass = 'slow';
        } else if (api.status === 'ERROR') {
            statusClass = 'status-error';
            dotClass = 'error';
        }
        
        // Format last checked time
        const lastChecked = api.last_checked ? 
            new Date(api.last_checked).toLocaleString() : 'N/A';
        
        // Pause/Resume button
        const pauseResumeBtn = api.is_paused ?
            `<button class="btn btn-warning btn-sm" onclick="resumeAPI(${api.id}, '${escapeHTML(api.name)}')">
                <i class="bi bi-play"></i> Resume
            </button>` :
            `<button class="btn btn-warning btn-sm" onclick="pauseAPI(${api.id}, '${escapeHTML(api.name)}')">
                <i class="bi bi-pause"></i> Pause
            </button>`;
        
        const pausedBadge = api.is_paused ? '<span class="badge bg-warning ms-2">PAUSED</span>' : '';
        
        // Uptime badge styling
        const uptimeBadgeClass = api.uptime_percentage >= 95 ? '' : ' critical';
        
        row.innerHTML = `
            <td>
                <input type="checkbox" name="api-checkbox" value="${api.id}" class="api-checkbox" 
                       onchange="handleApiCheckbox(${api.id}, this.checked)">
            </td>
            <td><strong>${escapeHTML(api.name)}</strong>${pausedBadge}</td>
            <td>
                <code style="word-break: break-all; font-size: 0.85rem;">${escapeHTML(api.url)}</code>
            </td>
            <td>
                <span class="status-badge ${statusClass}">
                    <span class="status-dot ${dotClass}"></span>
                    ${api.status}
                </span>
            </td>
            <td>
                <span class="uptime-badge${uptimeBadgeClass}">${api.uptime_percentage}%</span>
            </td>
            <td>
                <span class="response-time">${api.response_time.toFixed(2)}</span>
            </td>
            <td>
                <small class="text-muted">${lastChecked}</small>
            </td>
            <td>
                <div class="btn-group btn-group-sm" role="group">
                    ${pauseResumeBtn}
                    <button class="btn btn-danger btn-sm" onclick="deleteAPI(${api.id}, '${escapeHTML(api.name)}')">
                        <i class="bi bi-trash"></i> Delete
                    </button>
                </div>
            </td>
        `;
        
        tbody.appendChild(row);
    });
    
    // Populate filter API select in logs page
    const filterApiSelect = document.getElementById('filter-api');
    if (filterApiSelect) {
        filterApiSelect.innerHTML = '<option value="">All APIs</option>';
        apis.forEach(api => {
            const option = document.createElement('option');
            option.value = api.id;
            option.textContent = api.name;
            filterApiSelect.appendChild(option);
        });
    }
}

/**
 * Delete an API
 */
function deleteAPI(apiId, apiName) {
    if (!confirm(`Are you sure you want to delete "${apiName}"?`)) {
        return;
    }
    
    fetch(`/api/${apiId}`, {
        method: 'DELETE'
    })
    .then(response => {
        if (!response.ok) throw new Error('Failed to delete API');
        return response.json();
    })
    .then(data => {
        console.log('API deleted:', data);
        loadAPIs();
        loadDashboardStats();
    })
    .catch(error => {
        alert('Failed to delete API: ' + error.message);
        console.error('Error deleting API:', error);
    });
}

/**
 * Handle search input
 */
function handleSearch() {
    currentPage = 1; // Reset to first page when searching
    displayFilteredAPIs();
}

/**
 * Change page
 */
function changePage(direction) {
    const totalPages = Math.ceil(getFilteredAPIs().length / itemsPerPage);
    const newPage = currentPage + direction;
    
    if (newPage >= 1 && newPage <= totalPages) {
        currentPage = newPage;
        displayFilteredAPIs();
    }
}

/**
 * Get filtered APIs based on search term
 */
function getFilteredAPIs() {
    const searchTerm = document.getElementById('api-search').value.toLowerCase().trim();
    
    if (!searchTerm) {
        return allApis;
    }
    
    return allApis.filter(api => 
        api.name.toLowerCase().includes(searchTerm) || 
        api.url.toLowerCase().includes(searchTerm)
    );
}

/**
 * Display filtered and paginated APIs
 */
function displayFilteredAPIs() {
    const filteredAPIs = getFilteredAPIs();
    const totalItems = filteredAPIs.length;
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedAPIs = filteredAPIs.slice(startIndex, endIndex);
    
    // Update pagination info
    const paginationInfo = document.getElementById('pagination-info');
    if (paginationInfo) {
        paginationInfo.textContent = `Showing ${Math.min(endIndex, totalItems)} of ${totalItems} APIs`;
    }
    
    // Update pagination buttons
    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    
    if (prevBtn) {
        prevBtn.disabled = currentPage <= 1;
    }
    if (nextBtn) {
        nextBtn.disabled = currentPage >= totalPages;
    }
    
    // Display the paginated APIs
    displayAPIs(paginatedAPIs);
}

/**
 * Initialize Chart.js for response time visualization
 */
function initializeChart() {
    const ctx = document.getElementById('responseTimeChart').getContext('2d');
    
    responseTimeChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: []
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        usePointStyle: true,
                        padding: 15,
                        font: {
                            size: 12,
                            weight: '600'
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Response Time (ms)'
                    },
                    grid: {
                        drawBorder: true,
                        color: 'rgba(0, 0, 0, 0.1)'
                    }
                },
                x: {
                    grid: {
                        display: false
                    }
                }
            },
            interaction: {
                intersect: false,
                mode: 'index'
            }
        }
    });
}

/**
 * Update response time chart with latest data
 */
function updateResponseTimeChart() {
    fetch(API_APIS_URL)
        .then(response => response.json())
        .then(apis => {
            if (apis.length === 0) {
                responseTimeChart.data.labels = [];
                responseTimeChart.data.datasets = [];
                responseTimeChart.update();
                return;
            }
            
            // Fetch logs for each API
            const logPromises = apis.map(api => 
                fetch(`${API_LOGS_URL}/${api.id}`).then(r => r.json())
            );
            
            return Promise.all(logPromises).then(allLogs => {
                buildChartData(apis, allLogs);
            });
        })
        .catch(error => {
            console.error('Error updating chart:', error);
        });
}

/**
 * Build and update chart data
 */
function buildChartData(apis, allLogs) {
    const labels = [];
    const datasets = [];
    const colors = generateColors(apis.length);
    
    // Get all timestamps from all logs
    const allTimestamps = new Set();
    allLogs.forEach(logs => {
        logs.forEach(log => {
            allTimestamps.add(new Date(log.timestamp).getTime());
        });
    });
    
    const sortedTimestamps = Array.from(allTimestamps).sort((a, b) => a - b);
    
    // Create labels from timestamps (last 20 data points)
    const recentTimestamps = sortedTimestamps.slice(-20);
    recentTimestamps.forEach(ts => {
        const date = new Date(ts);
        labels.push(date.toLocaleTimeString());
    });
    
    // Create dataset for each API
    apis.forEach((api, index) => {
        const logs = allLogs[index] || [];
        const data = [];
        
        recentTimestamps.forEach(ts => {
            const log = logs.find(l => new Date(l.timestamp).getTime() === ts);
            data.push(log ? log.response_time : null);
        });
        
        datasets.push({
            label: api.name,
            data: data,
            borderColor: colors[index].border,
            backgroundColor: colors[index].bg,
            tension: 0.4,
            fill: false,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointBackgroundColor: colors[index].border,
            pointBorderColor: '#fff',
            pointBorderWidth: 2
        });
    });
    
    // Update chart
    responseTimeChart.data.labels = labels;
    responseTimeChart.data.datasets = datasets;
    responseTimeChart.update();
}

/**
 * Generate colors for chart datasets
 */
function generateColors(count) {
    const baseColors = [
        { border: '#007bff', bg: 'rgba(0, 123, 255, 0.1)' },
        { border: '#28a745', bg: 'rgba(40, 167, 69, 0.1)' },
        { border: '#dc3545', bg: 'rgba(220, 53, 69, 0.1)' },
        { border: '#ffc107', bg: 'rgba(255, 193, 7, 0.1)' },
        { border: '#17a2b8', bg: 'rgba(23, 162, 184, 0.1)' },
        { border: '#6f42c1', bg: 'rgba(111, 66, 193, 0.1)' }
    ];
    
    const colors = [];
    for (let i = 0; i < count; i++) {
        colors.push(baseColors[i % baseColors.length]);
    }
    
    return colors;
}

/**
 * Load and display failure alerts
 */
function loadFailureAlerts() {
    fetch('/api/alerts')
        .then(response => {
            if (!response.ok) throw new Error('Failed to fetch alerts');
            return response.json();
        })
        .then(alerts => {
            displayFailureAlerts(alerts);
        })
        .catch(error => {
            console.error('Error loading alerts:', error);
        });
}

/**
 * Display failure alerts on dashboard
 */
function displayFailureAlerts(alerts) {
    const alertsRow = document.getElementById('alerts-row');
    const alertsContainer = document.getElementById('alerts-container');
    
    if (!alertsRow || !alertsContainer) return;
    
    if (alerts.length === 0) {
        alertsRow.style.display = 'none';
        return;
    }
    
    alertsRow.style.display = 'block';
    alertsContainer.innerHTML = '';
    
    alerts.forEach(alert => {
        const alertDiv = document.createElement('div');
        alertDiv.className = 'mb-2 pb-2 border-bottom';
        alertDiv.innerHTML = `
            <strong>${escapeHTML(alert.name)}</strong> - 
            <span class="badge badge-danger">
                ${alert.consecutive_failures} consecutive failures
            </span>
            <br>
            <small class="text-muted">
                Latest: ${alert.latest_error_message || 'Network error'}
            </small>
        `;
        alertsContainer.appendChild(alertDiv);
    });
}
function showMessage(message, type, element) {
    element.innerHTML = `<div class="alert alert-${type}" role="alert">${message}</div>`;
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        if (element.children.length > 0) {
            element.innerHTML = '';
        }
    }, 5000);
}

/**
 * Escape HTML special characters
 */
function escapeHTML(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Pause API monitoring
 */
function pauseAPI(apiId, apiName) {
    fetch(`/api/${apiId}/pause`, {
        method: 'POST'
    })
    .then(response => {
        if (!response.ok) throw new Error('Failed to pause API');
        return response.json();
    })
    .then(data => {
        console.log('API paused:', data);
        loadAPIs();
        loadDashboardStats();
    })
    .catch(error => {
        alert('Failed to pause API: ' + error.message);
        console.error('Error pausing API:', error);
    });
}

/**
 * Resume API monitoring
 */
function resumeAPI(apiId, apiName) {
    fetch(`/api/${apiId}/resume`, {
        method: 'POST'
    })
    .then(response => {
        if (!response.ok) throw new Error('Failed to resume API');
        return response.json();
    })
    .then(data => {
        console.log('API resumed:', data);
        loadAPIs();
        loadDashboardStats();
    })
    .catch(error => {
        alert('Failed to resume API: ' + error.message);
        console.error('Error resuming API:', error);
    });
}

/**
 * Handle API checkbox selection
 */
function handleApiCheckbox(apiId, isChecked) {
    if (isChecked) {
        selectedApis.add(apiId);
    } else {
        selectedApis.delete(apiId);
    }
    updateBulkActions();
}

/**
 * Update bulk action buttons visibility
 */
function updateBulkActions() {
    const bulkActionsDiv = document.getElementById('bulk-actions');
    if (bulkActionsDiv) {
        if (selectedApis.size > 0) {
            bulkActionsDiv.style.display = 'flex';
        } else {
            bulkActionsDiv.style.display = 'none';
        }
    }
}

/**
 * Compare selected APIs
 */
function compareSelected() {
    if (selectedApis.size === 0) {
        alert('Please select at least one API to compare.');
        return;
    }
    
    const apiIds = Array.from(selectedApis).join(',');
    window.location.href = `/compare?ids=${apiIds}`;
}

/**
 * Download logs for selected APIs
 */
function downloadSelected() {
    if (selectedApis.size === 0) {
        alert('Please select at least one API to download logs.');
        return;
    }
    
    const apiIds = Array.from(selectedApis).join(',');
    window.open(`/logs/download?ids=${apiIds}`, '_blank');
}

/**
 * Handle adding a new API
 */
function handleAddAPI(event) {
    event.preventDefault();
    
    const name = document.getElementById('api-name').value.trim();
    const url = document.getElementById('api-url').value.trim();
    const projectId = document.getElementById('project-id').value;
    const formMessage = document.getElementById('form-message');
    
    // Validate inputs
    if (!name || !url) {
        showMessage('Please fill in all required fields.', 'danger', formMessage);
        return;
    }
    
    // Validate URL format
    try {
        new URL(url);
    } catch {
        showMessage('Please enter a valid URL.', 'danger', formMessage);
        return;
    }
    
    // Validate project selection
    if (!projectId) {
        showMessage('Please select a project', 'danger', formMessage);
        return;
    }
    
    // Disable form during submission
    const submitBtn = event.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="bi bi-hourglass-split me-1"></i> Adding...';
    
    // Prepare request data
    const requestData = {
        name: name,
        url: url,
        project_id: parseInt(projectId)
    };
    
    // Send request to backend
    fetch(ADD_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData)
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response.json();
    })
    .then(data => {
        showMessage('API added successfully!', 'success', formMessage);
        
        // Reset form
        document.getElementById('add-api-form').reset();
        
        // Refresh dashboard data
        loadAPIs();
        loadDashboardStats();
        
        console.log('API added:', data);
    })
    .catch(error => {
        console.error('Error adding API:', error);
        showMessage(`Failed to add API: ${error.message}`, 'danger', formMessage);
    })
    .finally(() => {
        // Re-enable form
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
    });
}
function compareSelected() {
    if (selectedApis.size === 0) {
        alert('Please select at least one API to compare');
        return;
    }
    
    // Store selected APIs in sessionStorage for comparison page
    sessionStorage.setItem('selectedApis', JSON.stringify(Array.from(selectedApis)));
    
    // Redirect to comparison page
    window.location.href = '/compare';
}

/**
 * Download logs for selected APIs
 */
function downloadSelected() {
    if (selectedApis.size === 0) {
        alert('Please select at least one API');
        return;
    }
    
    const apiIds = Array.from(selectedApis).join(',');
    window.location.href = `/download/logs?api_ids=${apiIds}`;
}
