/**
 * API Monitoring Comparison Page - JavaScript
 * Handles API comparison with charts and statistics
 */

// Global variables
let responseTimeComparisonChart = null;
let uptimeComparisonChart = null;
const THEME_KEY = 'api-monitor-theme';

/**
 * Initialize comparison page on page load
 */
document.addEventListener('DOMContentLoaded', function() {
    console.log('Comparison page initializing...');
    
    // Initialize theme
    initializeTheme();
    
    // Set up theme toggle
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }
    
    // Check if APIs are selected
    const selectedApis = JSON.parse(sessionStorage.getItem('selectedApis') || '[]');
    
    if (selectedApis.length > 0) {
        loadComparisonData(selectedApis);
    }
    
    console.log('Comparison page initialized');
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
 * Load comparison data for selected APIs
 */
function loadComparisonData(apiIds) {
    if (apiIds.length === 0) {
        return;
    }
    
    fetch('/api/compare', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ api_ids: apiIds })
    })
    .then(response => {
        if (!response.ok) throw new Error('Failed to load comparison data');
        return response.json();
    })
    .then(data => {
        // Hide no selection message
        document.getElementById('no-selection').style.display = 'none';
        
        // Show comparison sections
        document.getElementById('comparison-metrics').style.display = 'block';
        document.getElementById('response-time-section').style.display = 'block';
        document.getElementById('uptime-section').style.display = 'block';
        document.getElementById('comparison-table-section').style.display = 'block';
        
        // Display metrics
        displayMetrics(data);
        
        // Display charts
        displayResponseTimeChart(data);
        displayUptimeChart(data);
        
        // Display table
        displayComparisonTable(data);
    })
    .catch(error => {
        console.error('Error loading comparison data:', error);
        document.getElementById('no-selection').innerHTML = `
            <div class="alert alert-danger" role="alert">
                Error loading comparison data: ${error.message}
            </div>
        `;
    });
}

/**
 * Display comparison metrics cards
 */
function displayMetrics(apiData) {
    const metricsRow = document.getElementById('metrics-row');
    metricsRow.innerHTML = '';
    
    apiData.forEach(api => {
        const card = document.createElement('div');
        card.className = 'col-md-4 mb-3';
        card.innerHTML = `
            <div class="card stat-card">
                <div class="card-body">
                    <h6 class="card-title text-muted">${escapeHTML(api.name)}</h6>
                    <div class="row mt-3">
                        <div class="col-6">
                            <small class="text-muted d-block">Avg Response</small>
                            <h5 class="mb-0">${api.avg_response_time.toFixed(2)} ms</h5>
                        </div>
                        <div class="col-6">
                            <small class="text-muted d-block">Uptime</small>
                            <h5 class="mb-0 text-success">${api.uptime.toFixed(1)}%</h5>
                        </div>
                    </div>
                    <small class="text-muted mt-2 d-block">Checks: ${api.total_checks}</small>
                </div>
            </div>
        `;
        metricsRow.appendChild(card);
    });
}

/**
 * Display response time comparison chart
 */
function displayResponseTimeChart(apiData) {
    const ctx = document.getElementById('responseTimeComparison').getContext('2d');
    
    // Get maximum timestamps across all APIs
    const allTimestamps = new Set();
    apiData.forEach(api => {
        api.timestamps.forEach(ts => allTimestamps.add(ts));
    });
    
    const sortedTimestamps = Array.from(allTimestamps).sort();
    const recentTimestamps = sortedTimestamps.slice(-50); // Last 50 data points
    
    const labels = recentTimestamps.map(ts => {
        const date = new Date(ts);
        return date.toLocaleTimeString();
    });
    
    const datasets = apiData.map((api, index) => {
        const colors = generateColors(apiData.length);
        const data = recentTimestamps.map(ts => {
            const idx = api.timestamps.indexOf(ts);
            return idx !== -1 ? api.response_times[idx] : null;
        });
        
        return {
            label: api.name,
            data: data,
            borderColor: colors[index].border,
            backgroundColor: colors[index].bg,
            tension: 0.4,
            fill: false,
            pointRadius: 3,
            pointHoverRadius: 5,
            pointBackgroundColor: colors[index].border,
            pointBorderColor: '#fff',
            pointBorderWidth: 2
        };
    });
    
    if (responseTimeComparisonChart) {
        responseTimeComparisonChart.destroy();
    }
    
    responseTimeComparisonChart = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        usePointStyle: true,
                        padding: 15,
                        font: { size: 12, weight: '600' }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        drawBorder: true,
                        color: 'rgba(0, 0, 0, 0.1)'
                    }
                }
            }
        }
    });
}

/**
 * Display uptime comparison chart
 */
function displayUptimeChart(apiData) {
    const ctx = document.getElementById('uptimeComparison').getContext('2d');
    
    const labels = apiData.map(api => api.name);
    const data = apiData.map(api => api.uptime);
    const colors = generateColors(apiData.length);
    
    if (uptimeComparisonChart) {
        uptimeComparisonChart.destroy();
    }
    
    uptimeComparisonChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Uptime %',
                data,
                backgroundColor: data.map(uptime => {
                    if (uptime >= 99) return 'rgba(40, 167, 69, 0.8)';
                    if (uptime >= 95) return 'rgba(255, 193, 7, 0.8)';
                    return 'rgba(220, 53, 69, 0.8)';
                }),
                borderColor: data.map(uptime => {
                    if (uptime >= 99) return '#28a745';
                    if (uptime >= 95) return '#ffc107';
                    return '#dc3545';
                }),
                borderWidth: 2,
                borderRadius: 6
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: true,
                    labels: {
                        font: { size: 12, weight: '600' }
                    }
                }
            },
            scales: {
                x: {
                    min: 0,
                    max: 100,
                    ticks: { callback: value => value + '%' }
                }
            }
        }
    });
}

/**
 * Display comparison table
 */
function displayComparisonTable(apiData) {
    const tbody = document.getElementById('comparison-tbody');
    tbody.innerHTML = '';
    
    apiData.forEach(api => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><strong>${escapeHTML(api.name)}</strong></td>
            <td>
                <code style="word-break: break-word; font-size: 0.85rem;">${escapeHTML(api.url)}</code>
            </td>
            <td>${api.avg_response_time.toFixed(2)}</td>
            <td>
                <span class="badge" style="background-color: ${api.uptime >= 99 ? '#28a745' : api.uptime >= 95 ? '#ffc107' : '#dc3545'};">
                    ${api.uptime.toFixed(1)}%
                </span>
            </td>
            <td>${api.total_checks}</td>
        `;
        tbody.appendChild(row);
    });
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
 * Escape HTML special characters
 */
function escapeHTML(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
