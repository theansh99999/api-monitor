/**
 * Projects Page - JavaScript
 * Handles project management, API grouping, email template editing, search, and logs download
 */

const THEME_KEY = 'api-monitor-theme';
let allVariables = [];
let allProjects = [];
let currentPage = 1;
const itemsPerPage = 10; // Changed from 5 to 10
let searchTimeout = null;
let allApis = []; // Store all available APIs for adding to projects
let lastFocusedInput = null;

/**
 * Initialize projects page on load
 */
document.addEventListener('DOMContentLoaded', function() {
    console.log('Projects page initializing...');
    
    // Initialize theme
    initializeTheme();
    
    // Set up theme toggle
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }
    
    // Load template variables for autocomplete
    loadTemplateVariables();
    
    // Load projects
    loadProjects();
    
    // Set up form submission
    const form = document.getElementById('create-project-form');
    if (form) {
        form.addEventListener('submit', handleCreateProject);
    }
    
    // Set up project API form submission
    const projectApiForm = document.getElementById('add-project-api-form');
    if (projectApiForm) {
        projectApiForm.addEventListener('submit', handleAddProjectApi);
    }
    
    // Set up pagination
    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');
    if (prevBtn) prevBtn.addEventListener('click', () => changePage(-1));
    if (nextBtn) nextBtn.addEventListener('click', () => changePage(1));
    
    const subjectInput = document.getElementById('edit-email-subject');
    const templateInput = document.getElementById('edit-email-template');
    
    if (subjectInput) {
        subjectInput.addEventListener('focus', () => lastFocusedInput = subjectInput);
    }
    
    // Add autocomplete to email template
    if (templateInput) {
        templateInput.addEventListener('focus', () => lastFocusedInput = templateInput);
        templateInput.addEventListener('input', handleTemplateAutocomplete);
    }
    
    console.log('Projects page initialized');
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
        if (themeToggle) themeToggle.innerHTML = '☀️';
    } else {
        document.documentElement.setAttribute('data-theme', 'light');
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) themeToggle.innerHTML = '🌙';
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
 * Open create project modal
 */
function openCreateProjectModal() {
    const modal = new bootstrap.Modal(document.getElementById('createProjectModal'));
    modal.show();
}

/**
 * Load template variables for email
 */
function loadTemplateVariables() {
    fetch('/api/template-variables')
        .then(response => response.json())
        .then(data => {
            allVariables = data.variables;
            console.log('Template variables loaded:', allVariables);
            
            // Populate variable buttons container
            const container = document.getElementById('variable-buttons-container');
            if (container) {
                container.innerHTML = allVariables.map(v => 
                    `<button type="button" class="btn btn-sm btn-outline-secondary me-1 mb-1" 
                        onclick="insertVariable('${v.name}')" title="${v.description}">
                        ${v.name.replace('$', '')}
                    </button>`
                ).join('');
            }
        })
        .catch(error => console.error('Error loading variables:', error));
}

/**
 * Show variables suggestions
 */
function showVariablesSuggestions() {
    const helpDiv = document.getElementById('template-variables-help');
    const variablesList = document.getElementById('variables-list');
    
    if (helpDiv.style.display === 'none') {
        helpDiv.style.display = 'block';
        variablesList.innerHTML = allVariables.map(v => 
            `<div class="mb-2">
                <code>${v.name}</code> - ${v.description}
                <button type="button" class="btn btn-xs btn-light ms-2" onclick="insertVariable('${v.name}')">
                    Insert
                </button>
            </div>`
        ).join('');
    } else {
        helpDiv.style.display = 'none';
    }
}

/**
 * Update subject preview with sample values
 */
function updateSubjectPreview() {
    const subjectInput = document.getElementById('edit-email-subject');
    const previewElement = document.getElementById('subject-preview');
    
    if (subjectInput && previewElement) {
        let preview = subjectInput.value;
        // Replace variables with sample values dynamically based on allVariables array
        if (allVariables && allVariables.length > 0) {
            allVariables.forEach(v => {
                const regex = new RegExp(v.name.replace('$', '\\\\$'), 'g');
                preview = preview.replace(regex, v.name.replace('$', '').toUpperCase());
            });
        } else {
            // Fallback before variables load
            preview = preview.replace(/\$api_name/g, 'API_NAME');
            preview = preview.replace(/\$api_status/g, 'API_STATUS');
            preview = preview.replace(/\$priority/g, 'PRIORITY');
        }
        
        previewElement.textContent = preview || '🚨 API_NAME is API_STATUS';
    }
}

/**
 * Insert variable into template (updated for edit modal)
 */
function insertVariable(variable) {
    const targetInput = lastFocusedInput || document.getElementById('edit-email-template');
    if (targetInput) {
        const start = targetInput.selectionStart;
        const end = targetInput.selectionEnd;
        const before = targetInput.value.substring(0, start);
        const after = targetInput.value.substring(end);
        targetInput.value = before + variable + after;
        targetInput.focus();
        targetInput.setSelectionRange(start + variable.length, start + variable.length);
        
        // Trigger input event to update preview if it's the subject
        targetInput.dispatchEvent(new Event('input'));
    }
}

/**
 * Handle template autocomplete
 */
function handleTemplateAutocomplete(e) {
    const textarea = e.target;
    const text = textarea.value;
    const cursorPos = textarea.selectionStart;
    
    // Check if user is typing a variable (after $)
    const lastDollarPos = text.lastIndexOf('$', cursorPos - 1);
    if (lastDollarPos === -1 || lastDollarPos < cursorPos - 20) {
        return; // No recent $
    }
    
    const typed = text.substring(lastDollarPos, cursorPos);
    
    // Show suggestions if typing $ or $ followed by letters
    if (typed.length > 1) {
        const suggestions = allVariables.filter(v => 
            v.name.toLowerCase().startsWith(typed.toLowerCase())
        );
        
        if (suggestions.length > 0) {
            showAutocompleteSuggestions(suggestions, textarea, lastDollarPos, cursorPos);
        }
    }
}

/**
 * Search projects and APIs with debounce
 */
function searchProjects() {
    // Clear existing timeout
    if (searchTimeout) {
        clearTimeout(searchTimeout);
    }
    
    // Set new timeout for debounced search
    searchTimeout = setTimeout(() => {
        const searchInput = document.getElementById('project-search');
        const searchTerm = searchInput.value.toLowerCase().trim();
        
        currentPage = 1; // Reset to first page when searching
        
        if (searchTerm === '') {
            // Display all projects with pagination
            displayFilteredProjects(allProjects);
            return;
        }
        
        // Filter projects by search term (case-insensitive)
        const filtered = allProjects.filter(project => {
            const projectMatch = project.name.toLowerCase().includes(searchTerm) ||
                                project.responsible_name.toLowerCase().includes(searchTerm) ||
                                project.responsible_email.toLowerCase().includes(searchTerm);
            
            return projectMatch;
        });
        
        displayFilteredProjects(filtered);
    }, 300); // 300ms debounce
}

/**
 * Load all projects and APIs
 */
function loadProjects() {
    // Load projects
    fetch('/api/projects')
        .then(response => response.json())
        .then(projects => {
            allProjects = projects;
            currentPage = 1; // Reset to first page
            displayFilteredProjects(projects);
        })
        .catch(error => {
            console.error('Error loading projects:', error);
        });

    // Load all APIs for adding to projects
    fetch('/api/apis')
        .then(response => response.json())
        .then(apis => {
            allApis = apis;
            console.log('APIs loaded for project management:', apis.length);
        })
        .catch(error => {
            console.error('Error loading APIs:', error);
        });
}

/**
 * Get CSS class for status badge
 */
function getStatusClass(status) {
    const statusLower = (status || 'UNKNOWN').toLowerCase();
    return `status-${statusLower}`;
}

/**
 * Display filtered and paginated projects in table format
 */
function displayFilteredProjects(projects) {
    const tbody = document.getElementById('projects-tbody');
    const noProjects = document.getElementById('no-projects');

    if (projects.length === 0) {
        tbody.innerHTML = '';
        noProjects.style.display = 'block';
        return;
    }

    noProjects.style.display = 'none';

    // Calculate pagination
    const totalItems = projects.length;
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedProjects = projects.slice(startIndex, endIndex);

    // Update pagination info
    const paginationInfo = document.getElementById('pagination-info');
    if (paginationInfo) {
        paginationInfo.textContent = `Showing ${Math.min(endIndex, totalItems)} of ${totalItems} projects`;
    }

    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
    const pageNumDisplay = document.getElementById('page-num-display');
    if (pageNumDisplay) {
        pageNumDisplay.textContent = `Page ${currentPage} of ${totalPages}`;
    }

    // Update pagination buttons
    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');

    if (prevBtn) {
        prevBtn.disabled = currentPage <= 1;
    }
    if (nextBtn) {
        nextBtn.disabled = currentPage >= totalPages;
    }

    // Clear table body and render project rows
    tbody.innerHTML = '';

    paginatedProjects.forEach(project => {
        const priorityBadgeClass = project.priority === 'Critical' ? 'bg-danger' :
                                  project.priority === 'Moderate' ? 'bg-warning' : 'bg-success';

        const row = document.createElement('tr');
        row.innerHTML = `
            <td><strong>${escapeHTML(project.name)}</strong></td>
            <td><span class="badge ${priorityBadgeClass}">${project.priority}</span></td>
            <td><span class="badge bg-secondary">${project.api_count || 0}</span></td>
            <td>
                <div class="d-flex gap-2 flex-nowrap">
                    <button class="btn btn-sm btn-primary" onclick="viewProjectApis(${project.id}, '${escapeHTML(project.name)}')" title="View">
                        <i class="bi bi-eye"></i> View
                    </button>
                    <button class="btn btn-sm btn-secondary" onclick="openEditModal(${project.id})" title="Edit">
                        <i class="bi bi-pencil"></i> Edit
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteProject(${project.id}, '${escapeHTML(project.name)}')" title="Delete">
                        <i class="bi bi-trash"></i> Delete
                    </button>
                </div>
            </td>
        `;

        tbody.appendChild(row);
    });
}

/**
 * Change page
 */
function changePage(direction) {
    const filteredProjects = getFilteredProjects();
    const totalPages = Math.ceil(filteredProjects.length / itemsPerPage);
    const newPage = currentPage + direction;

    if (newPage >= 1 && newPage <= totalPages) {
        currentPage = newPage;
        displayFilteredProjects(filteredProjects);
    }
}

/**
 * Get filtered projects based on search
 */
function getFilteredProjects() {
    const searchTerm = document.getElementById('project-search').value.toLowerCase().trim();

    if (!searchTerm) {
        return allProjects;
    }

    return allProjects.filter(project =>
        project.name.toLowerCase().includes(searchTerm) ||
        project.responsible_name.toLowerCase().includes(searchTerm) ||
        project.responsible_email.toLowerCase().includes(searchTerm)
    );
}

/**
 * Handle create project form submission with loading states
 */
function handleCreateProject(e) {
    e.preventDefault();

    const name = document.getElementById('project-name').value.trim();
    const priority = document.getElementById('project-priority').value;
    const responsible_name = document.getElementById('responsible-name').value.trim();
    const responsible_email = document.getElementById('responsible-email').value.trim();
    const messageDiv = document.getElementById('form-message');

    if (!name || !priority || !responsible_name || !responsible_email) {
        showMessage('Please fill in all fields', 'danger', messageDiv);
        return;
    }

    // Disable form during submission
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="bi bi-hourglass-split me-1"></i> Creating...';

    fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name,
            priority,
            responsible_name,
            responsible_email
        })
    })
    .then(response => {
        if (!response.ok) return response.json().then(err => Promise.reject(err));
        return response.json();
    })
    .then(data => {
        showMessage('✓ Project created successfully', 'success', messageDiv);
        document.getElementById('create-project-form').reset();
        setTimeout(() => {
            bootstrap.Modal.getInstance(document.getElementById('createProjectModal')).hide();
            loadProjects();
        }, 1000);
    })
    .catch(error => {
        showMessage(`✗ ${error.error || 'Failed to create project'}`, 'danger', messageDiv);
        console.error('Error:', error);
    })
    .finally(() => {
        // Re-enable form
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
    });
}

/**
 * Open edit project modal
 */
function openEditModal(projectId) {
    fetch(`/api/projects/${projectId}`)
        .then(response => response.json())
        .then(project => {
            document.getElementById('edit-project-id').value = project.id;
            document.getElementById('edit-project-name').value = project.name;
            document.getElementById('edit-project-priority').value = project.priority;
            document.getElementById('edit-responsible-name').value = project.responsible_name;
            document.getElementById('edit-responsible-email').value = project.responsible_email;
            document.getElementById('edit-email-subject').value = project.email_subject || '';
            document.getElementById('edit-email-template').value = project.email_template || '';
            
            // Update subject preview
            updateSubjectPreview();
            
            // Add event listener for subject input changes
            const subjectInput = document.getElementById('edit-email-subject');
            subjectInput.addEventListener('input', updateSubjectPreview);
            
            const modal = new bootstrap.Modal(document.getElementById('editProjectModal'));
            modal.show();
        })
        .catch(error => {
            alert('Error loading project: ' + error.message);
        });
}

/**
 * Save project changes
 */
function saveProjectChanges() {
    const projectId = document.getElementById('edit-project-id').value;
    const data = {
        name: document.getElementById('edit-project-name').value.trim(),
        priority: document.getElementById('edit-project-priority').value,
        responsible_name: document.getElementById('edit-responsible-name').value.trim(),
        responsible_email: document.getElementById('edit-responsible-email').value.trim(),
        email_subject: document.getElementById('edit-email-subject').value.trim(),
        email_template: document.getElementById('edit-email-template').value
    };
    
    if (!data.name || !data.priority || !data.responsible_name || !data.responsible_email) {
        alert('Please fill in all required fields');
        return;
    }
    
    fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
    .then(response => {
        if (!response.ok) return response.json().then(err => Promise.reject(err));
        return response.json();
    })
    .then(() => {
        alert('Project updated successfully');
        bootstrap.Modal.getInstance(document.getElementById('editProjectModal')).hide();
        loadProjects();
    })
    .catch(error => {
        alert('Error updating project: ' + (error.error || error.message));
    });
}

/**
 * Delete project
 */
function deleteProject(projectId, projectName) {
    if (!confirm(`Are you sure you want to delete "${projectName}"? All its APIs will also be deleted.`)) {
        return;
    }
    
    fetch(`/api/projects/${projectId}`, {
        method: 'DELETE'
    })
    .then(response => {
        if (!response.ok) return response.json().then(err => Promise.reject(err));
        return response.json();
    })
    .then(() => {
        alert('Project deleted successfully');
        loadProjects();
    })
    .catch(error => {
        alert('Error deleting project: ' + (error.error || error.message));
    });
}

/**
 * View APIs in a project (modal)
 */
function viewProjectApis(projectId, projectName) {
    // Set modal title
    document.getElementById('project-name-title').textContent = projectName;

    // Store current project ID for API management
    window.currentProjectId = projectId;

    // Load project APIs
    fetch(`/api/projects/${projectId}`)
        .then(response => {
            if (!response.ok) throw new Error('Failed to load project details');
            return response.json();
        })
        .then(project => {
            displayProjectApis(project.apis || []);
        })
        .catch(error => {
            console.error('Error loading project APIs:', error);
            document.getElementById('project-apis-tbody').innerHTML = 
                '<tr><td colspan="4" class="text-center text-danger">Failed to load APIs</td></tr>';
        });

    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('viewApisModal'));
    modal.show();
}

/**
 * Display APIs in the project modal
 */
function displayProjectApis(apis) {
    const tbody = document.getElementById('project-apis-tbody');
    const noApis = document.getElementById('no-project-apis');

    if (apis.length === 0) {
        tbody.innerHTML = '';
        noApis.style.display = 'block';
        return;
    }

    noApis.style.display = 'none';
    tbody.innerHTML = '';

    apis.forEach(api => {
        const statusBadgeClass = api.status === 'UP' ? 'bg-success' :
                                api.status === 'DOWN' ? 'bg-danger' :
                                api.status === 'SLOW' ? 'bg-warning text-dark' :
                                api.status === 'ERROR' ? 'bg-warning' : 'bg-secondary';

        const row = document.createElement('tr');
        row.innerHTML = `
            <td><strong>${escapeHTML(api.name)}</strong></td>
            <td><code style="word-break: break-all; font-size: 0.85rem;">${escapeHTML(api.url)}</code></td>
            <td><span class="badge ${statusBadgeClass}">${api.status || 'UNKNOWN'}</span></td>
            <td class="d-flex gap-2 text-nowrap">
                <button class="btn btn-outline-warning btn-sm" onclick="removeApiFromProject(${api.id}, '${escapeHTML(api.name)}')" title="Remove from project">
                    <i class="bi bi-dash-circle"></i> Remove
                </button>
                <button class="btn btn-outline-danger btn-sm" onclick="deleteModalAPI(${api.id}, '${escapeHTML(api.name)}')" title="Delete API completely">
                    <i class="bi bi-trash"></i> Delete
                </button>
            </td>
        `;

        tbody.appendChild(row);
    });
}

/**
 * Handle adding a new API to current project
 */
function handleAddProjectApi(event) {
    event.preventDefault();

    const name = document.getElementById('project-api-name').value.trim();
    const url = document.getElementById('project-api-url').value.trim();
    const projectId = window.currentProjectId;
    const messageDiv = document.getElementById('project-api-message');

    // Validate inputs
    if (!name || !url) {
        showMessage('Please fill in all required fields.', 'danger', messageDiv);
        return;
    }

    // Validate URL format
    try {
        new URL(url);
    } catch {
        showMessage('Please enter a valid URL.', 'danger', messageDiv);
        return;
    }

    // Disable form during submission
    const submitBtn = event.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="bi bi-hourglass-split me-1"></i> Adding...';

    // Prepare request data - same as dashboard but with project_id
    const requestData = {
        name: name,
        url: url,
        project_id: projectId
    };

    // Send request to backend (same endpoint as dashboard)
    fetch('/add_api', {
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
        showMessage('API added successfully!', 'success', messageDiv);

        // Reset form
        document.getElementById('add-project-api-form').reset();

        // Refresh project APIs in modal
        fetch(`/api/projects/${projectId}`)
            .then(response => response.json())
            .then(project => {
                displayProjectApis(project.apis || []);
            })
            .catch(error => {
                console.error('Error refreshing project APIs:', error);
            });

        // Refresh main projects list to update API count
        loadProjects();

        console.log('API added to project:', data);
    })
    .catch(error => {
        console.error('Error adding API:', error);
        showMessage(`Failed to add API: ${error.message}`, 'danger', messageDiv);
    })
    .finally(() => {
        // Re-enable form
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
    });
}

/**
 * Remove API from project (set project_id to null)
 */
function removeApiFromProject(apiId, apiName) {
    if (!confirm(`Remove "${apiName}" from this project?`)) {
        return;
    }

    fetch(`/api/${apiId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: null })
    })
    .then(response => {
        if (!response.ok) return response.json().then(err => Promise.reject(err));
        return response.json();
    })
    .then(() => {
        alert('API removed from project successfully');
        // Refresh the modal content
        const projectId = window.currentProjectId;
        viewProjectApis(projectId, document.getElementById('project-name-title').textContent);
        // Refresh main projects list
        loadProjects();
    })
    .catch(error => {
        alert('Error removing API from project: ' + (error.error || error.message));
    });
}

/**
 * Delete API from within the modal
 */
function deleteModalAPI(apiId, apiName) {
    if (!confirm(`Are you sure you want to completely DELETE the API "${apiName}"? This cannot be undone.`)) {
        return;
    }
    
    fetch(`/api/${apiId}`, {
        method: 'DELETE'
    })
    .then(response => {
        if (!response.ok) throw new Error('Failed to delete API');
        return response.json();
    })
    .then(() => {
        // Refresh the modal content
        const projectId = window.currentProjectId;
        viewProjectApis(projectId, document.getElementById('project-name-title').textContent);
        // Refresh main projects list to update count correctly
        loadProjects();
    })
    .catch(error => {
        alert('Error deleting API: ' + error.message);
    });
}

/**
 * Delete API (from global namespace if needed)
 */
function deleteAPI(apiId, apiName) {
    if (!confirm(`Delete API "${apiName}"?`)) {
        return;
    }
    
    fetch(`/api/${apiId}`, {
        method: 'DELETE'
    })
    .then(response => {
        if (!response.ok) throw new Error('Failed to delete API');
        return response.json();
    })
    .then(() => {
        loadProjects();
    })
    .catch(error => {
        alert('Error deleting API: ' + error.message);
    });
}

/**
 * Download project logs as CSV
 */
function downloadProjectLogs(projectId, projectName) {
    fetch(`/api/projects/${projectId}/logs`)
        .then(response => {
            if (!response.ok) throw new Error('Failed to download logs');
            return response.blob();
        })
        .then(blob => {
            // Create download link
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${projectName}-logs-${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(link);
            link.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(link);
        })
        .catch(error => {
            alert('Error downloading logs: ' + error.message);
        });
}

/**
 * Open add API modal
 */
function openAddAPIModal(projectId) {
    // For now, implement this as a simple prompt
    const apiName = prompt('Enter API Name:');
    if (!apiName) return;
    
    const apiUrl = prompt('Enter API URL:');
    if (!apiUrl) return;
    
    fetch('/add_api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            project_id: projectId,
            name: apiName,
            url: apiUrl
        })
    })
    .then(response => {
        if (!response.ok) return response.json().then(err => Promise.reject(err));
        return response.json();
    })
    .then(data => {
        // Display health check result
        const healthCheck = data.initial_health_check;
        let message = `✓ API added successfully\n\nHealth Check Result:\nStatus: ${healthCheck.status}`;
        
        if (healthCheck.status_code) {
            message += `\nStatus Code: ${healthCheck.status_code}`;
        }
        
        message += `\nResponse Time: ${healthCheck.response_time.toFixed(2)}ms`;
        
        if (healthCheck.error_message) {
            message += `\nError: ${healthCheck.error_message}`;
        }
        
        alert(message);
        loadProjects();
    })
    .catch(error => {
        alert('Error adding API: ' + (error.error || error.message));
    });
}

/**
 * Show autocomplete suggestions (stub - can be enhanced)
 */
function showAutocompleteSuggestions(suggestions, textarea, startPos, endPos) {
    // Could show a dropdown with suggestions
    console.log('Suggestions:', suggestions);
}

/**
 * Show message
 */
function showMessage(message, type, element) {
    element.innerHTML = `<div class="alert alert-${type}" role="alert">${message}</div>`;
    setTimeout(() => {
        element.innerHTML = '';
    }, 5000);
}

/**
 * Escape HTML
 */
function escapeHTML(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
