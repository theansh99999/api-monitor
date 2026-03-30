"""
API Monitoring Dashboard
Flask application with routes for dashboard and API management
"""

from flask import Flask, render_template, request, jsonify, send_file
from datetime import datetime, timedelta
from sqlalchemy import func
import sys
import os
import csv
import io
import requests
import time
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Add app directory to path
sys.path.insert(0, os.path.dirname(__file__))

from database import get_database_config
from models import db, API, APILog, Project, NotificationLog
from monitor import APIMonitor, classify_error
from email_utils import EmailTemplateProcessor
from sqlalchemy import inspect, text


def ensure_schema():
    """
    Ensure database schema is up to date
    Adds missing columns and tables from model definitions
    """
    try:
        # Get database connection and inspector
        inspector = inspect(db.engine)
        tables = inspector.get_table_names()
        
        # Ensure projects table has all columns
        if 'projects' in tables:
            existing_cols = [col['name'] for col in inspector.get_columns('projects')]
            columns_to_add = [
                ('last_alert_sent', 'DATETIME NULL'),
                ('email_subject', 'VARCHAR(255) NULL')
            ]
            for col_name, col_type in columns_to_add:
                if col_name not in existing_cols:
                    try:
                        db.session.execute(text(f'ALTER TABLE projects ADD COLUMN {col_name} {col_type}'))
                        db.session.commit()
                        print(f"[Database] Added '{col_name}' column to 'projects' table")
                    except Exception as e:
                        db.session.rollback()
                        print(f"[Database] Note: {col_name} column may already exist")
        
        # Check if apis table exists
        if 'apis' in tables:
            # Get existing columns in apis table
            existing_columns = [col['name'] for col in inspector.get_columns('apis')]
            
            # Add missing columns to apis table
            columns_to_add = [
                ('project_id', 'INTEGER'),
                ('is_paused', 'BOOLEAN DEFAULT FALSE'),
                ('consecutive_failures', 'INTEGER DEFAULT 0'),
                ('consecutive_failure_time', 'DATETIME NULL'),
                ('last_alert_sent', 'DATETIME NULL')
            ]
            
            for col_name, col_type in columns_to_add:
                if col_name not in existing_columns:
                    print(f"[Database] Adding missing '{col_name}' column to 'apis' table...")
                    try:
                        db.session.execute(text(f'ALTER TABLE apis ADD COLUMN {col_name} {col_type}'))
                        db.session.commit()
                        print(f"[Database] Successfully added '{col_name}' column")
                    except Exception as e:
                        db.session.rollback()
                        print(f"[Database] Error adding '{col_name}': {str(e)}")
        
        # Check if api_logs table exists and add missing columns
        if 'api_logs' in tables:
            existing_log_columns = [col['name'] for col in inspector.get_columns('api_logs')]
            
            new_columns = [
                ('error_type', 'VARCHAR(50) NULL'),
                ('error_severity', 'VARCHAR(20) NULL'),
                ('error_message', 'VARCHAR(255) NULL'),
                ('error_category', 'VARCHAR(50) NULL')
            ]
            
            for col_name, col_type in new_columns:
                if col_name not in existing_log_columns:
                    print(f"[Database] Adding missing '{col_name}' column to 'api_logs' table...")
                    try:
                        db.session.execute(text(f'ALTER TABLE api_logs ADD COLUMN {col_name} {col_type}'))
                        db.session.commit()
                        print(f"[Database] Successfully added '{col_name}' column")
                    except Exception as e:
                        db.session.rollback()
                        print(f"[Database] Error adding '{col_name}': {str(e)}")
    
    except Exception as e:
        print(f"[Database] Schema check error: {str(e)}")


def perform_health_check(api):
    """
    Perform an immediate health check on a newly added API.
    This function checks the API status and creates a log entry.
    
    Args:
        api: API object to check
    
    Returns:
        dict with keys: status, status_code, response_time, error_details
    """
    start_time = time.time()
    status = "DOWN"
    status_code = None
    error_type = None
    error_category = None
    error_severity = None
    error_message = None
    response_time = 0

    try:
        # Make HTTP request to the API
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
        response = requests.get(api.url, headers=headers, timeout=7, allow_redirects=True, verify=False)
        
        response_time = (time.time() - start_time) * 1000
        status_code = response.status_code
        
        # Classify the response
        if 200 <= status_code < 300:
            if response_time >= 3000:
                status = "SLOW"
            else:
                status = "UP"
            error_category, error_severity, error_message, error_type = classify_error(status_code, None)
            print(f"[HealthCheck] ✓ {api.name}: {status} ({status_code}) {response_time:.2f}ms")
        elif 400 <= status_code < 600:
            status = "ERROR"
            error_category, error_severity, error_message, error_type = classify_error(status_code, None)
            print(f"[HealthCheck] ⚠ {api.name}: {status} ({status_code}) {response_time:.2f}ms")
        else:
            status = "UNKNOWN"
            error_category, error_severity, error_message, error_type = classify_error(status_code, None)
            print(f"[HealthCheck] ? {api.name}: {status} ({status_code}) {response_time:.2f}ms")

    except requests.exceptions.Timeout:
        status = "DOWN"
        status_code = None
        response_time = (time.time() - start_time) * 1000
        error_category, error_severity, error_message, error_type = classify_error(None, "TIMEOUT")
        print(f"[HealthCheck] ✗ {api.name}: DOWN (Request Timeout {response_time:.2f}ms)")

    except requests.exceptions.RequestException as e:
        status = "DOWN"
        status_code = None
        response_time = (time.time() - start_time) * 1000
        error_category, error_severity, error_message, error_type = classify_error(None, "CONNECTION")
        print(f"[HealthCheck] ✗ {api.name}: DOWN ({type(e).__name__})")

    # Create log entry for this check
    try:
        log_entry = APILog(
            api_id=api.id,
            status_code=status_code,
            response_time=response_time,
            status=status,
            timestamp=datetime.utcnow(),
            error_type=error_type,
            error_severity=error_severity,
            error_message=error_message,
            error_category=error_category
        )
        db.session.add(log_entry)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        print(f"[HealthCheck] Error logging health check result: {str(e)}")
    
    return {
        'status': status,
        'status_code': status_code,
        'response_time': response_time,
        'error_message': error_message,
        'error_category': error_category,
        'error_severity': error_severity
    }


def create_app():
    """
    Create and configure Flask application
    """
    app = Flask(__name__, template_folder='../templates', static_folder='../static')
    
    # Configure SQLAlchemy
    app.config.update(get_database_config())
    
    # Initialize database
    db.init_app(app)
    
    # Initialize API Monitor
    monitor = APIMonitor(app)
    
    with app.app_context():
        # Create all database tables
        db.create_all()
        
        # Ensure schema is up to date
        ensure_schema()
        
        # Start background monitoring
        monitor.start()
    
    # Register routes
    @app.route('/')
    def dashboard():
        """
        Render the main dashboard
        """
        return render_template('index.html')
    
    @app.route('/projects')
    def projects_page():
        """
        Render the projects management page
        """
        return render_template('projects.html')
    
    # ==================== PROJECT MANAGEMENT ROUTES ====================
    
    def enrich_api_with_latest_status(api):
        """
        Enrich API object with the latest status from APILog
        Returns API dict with status, status_code, response_time
        Defaults to UNKNOWN status if no logs exist
        """
        api_dict = api.to_dict()
        
        # Fetch latest APILog entry for this API
        latest_log = APILog.query.filter_by(api_id=api.id).order_by(APILog.timestamp.desc()).first()
        
        if latest_log:
            # Add status info from latest log
            api_dict['status'] = latest_log.status
            api_dict['status_code'] = latest_log.status_code
            api_dict['response_time'] = latest_log.response_time
            api_dict['error_message'] = latest_log.error_message
            api_dict['error_category'] = latest_log.error_category
        else:
            # Default to UNKNOWN if no logs exist
            api_dict['status'] = 'UNKNOWN'
            api_dict['status_code'] = None
            api_dict['response_time'] = 0
            api_dict['error_message'] = None
            api_dict['error_category'] = None
        
        return api_dict
    
    @app.route('/api/projects', methods=['GET'])
    def get_projects():
        """
        Get all projects with their APIs
        Includes latest status from APILog for each API
        """
        try:
            projects = Project.query.all()
            projects_data = []
            
            for project in projects:
                apis = API.query.filter_by(project_id=project.id).all()
                project_info = project.to_dict()
                # Enrich each API with latest status from APILog
                project_info['apis'] = [enrich_api_with_latest_status(api) for api in apis]
                project_info['api_count'] = len(apis)
                projects_data.append(project_info)
            
            return jsonify(projects_data)
        
        except Exception as e:
            print(f"Error getting projects: {str(e)}")
            return jsonify({'error': str(e)}), 500
    
    @app.route('/api/projects', methods=['POST'])
    def create_project():
        """
        Create a new project
        """
        try:
            data = request.get_json()
            
            # Validate input
            required_fields = ['name', 'priority', 'responsible_name', 'responsible_email']
            if not data or not all(field in data for field in required_fields):
                return jsonify({'error': 'Missing required fields'}), 400
            
            # Check if project already exists
            existing = Project.query.filter_by(name=data['name']).first()
            if existing:
                return jsonify({'error': 'Project with this name already exists'}), 400
            
            # Create project with default template
            default_subject = "🚨 $api_name is $api_status - $priority Priority"
            default_template = """$api_name Alert

API: $api_name
Project: $project_name
Status: $api_status
Priority: $priority
Down Since: $down_duration
Error: $error_reason
Timestamp: $timestamp"""
            
            project = Project(
                name=data['name'],
                priority=data['priority'],
                responsible_name=data['responsible_name'],
                responsible_email=data['responsible_email'],
                email_subject=data.get('email_subject', default_subject),
                email_template=data.get('email_template', default_template)
            )
            
            db.session.add(project)
            db.session.commit()
            
            print(f"[App] Project created: {project.name}")
            
            return jsonify({
                'success': True,
                'message': f'Project "{project.name}" created successfully',
                'project': project.to_dict()
            }), 201
        
        except Exception as e:
            db.session.rollback()
            print(f"Error creating project: {str(e)}")
            return jsonify({'error': str(e)}), 500
    
    @app.route('/api/projects/<int:project_id>', methods=['GET'])
    def get_project(project_id):
        """
        Get a specific project with its APIs
        Includes latest status from APILog for each API
        """
        try:
            project = Project.query.get(project_id)
            if not project:
                return jsonify({'error': 'Project not found'}), 404
            
            project_data = project.to_dict()
            apis = API.query.filter_by(project_id=project_id).all()
            # Enrich each API with latest status from APILog
            project_data['apis'] = [enrich_api_with_latest_status(api) for api in apis]
            
            return jsonify(project_data)
        
        except Exception as e:
            print(f"Error getting project: {str(e)}")
            return jsonify({'error': str(e)}), 500
    
    @app.route('/api/projects/<int:project_id>', methods=['PUT'])
    def update_project(project_id):
        """
        Update a project
        """
        try:
            project = Project.query.get(project_id)
            if not project:
                return jsonify({'error': 'Project not found'}), 404
            
            data = request.get_json()
            
            # Update fields
            if 'name' in data:
                # Check if new name conflicts with other projects
                existing = Project.query.filter_by(name=data['name']).first()
                if existing and existing.id != project_id:
                    return jsonify({'error': 'Project with this name already exists'}), 400
                project.name = data['name']
            
            if 'priority' in data:
                project.priority = data['priority']
            if 'responsible_name' in data:
                project.responsible_name = data['responsible_name']
            if 'responsible_email' in data:
                project.responsible_email = data['responsible_email']
            if 'email_subject' in data:
                project.email_subject = data['email_subject']
            if 'email_template' in data:
                project.email_template = data['email_template']
            
            db.session.commit()
            
            print(f"[App] Project updated: {project.name}")
            
            return jsonify({
                'success': True,
                'message': 'Project updated successfully',
                'project': project.to_dict()
            })
        
        except Exception as e:
            db.session.rollback()
            print(f"Error updating project: {str(e)}")
            return jsonify({'error': str(e)}), 500
    
    @app.route('/api/projects/<int:project_id>', methods=['DELETE'])
    def delete_project(project_id):
        """
        Delete a project (and all its APIs)
        """
        try:
            project = Project.query.get(project_id)
            if not project:
                return jsonify({'error': 'Project not found'}), 404
            
            project_name = project.name
            db.session.delete(project)
            db.session.commit()
            
            print(f"[App] Project deleted: {project_name}")
            
            return jsonify({
                'success': True,
                'message': f'Project "{project_name}" deleted successfully'
            })
        
        except Exception as e:
            db.session.rollback()
            print(f"Error deleting project: {str(e)}")
            return jsonify({'error': str(e)}), 500
    
    @app.route('/api/projects/<int:project_id>/logs', methods=['GET'])
    def download_project_logs(project_id):
        """
        Download logs for all APIs in a project as CSV
        """
        try:
            project = Project.query.get(project_id)
            if not project:
                return jsonify({'error': 'Project not found'}), 404
            
            # Get all APIs in the project
            apis = API.query.filter_by(project_id=project_id).all()
            api_ids = [api.id for api in apis]
            
            if not api_ids:
                # Return empty CSV if no APIs
                output = io.StringIO()
                writer = csv.writer(output)
                writer.writerow(['timestamp', 'project_name', 'api_name', 'status', 'status_code', 'response_time', 'error_message'])
                
                return send_file(
                    io.BytesIO(output.getvalue().encode('utf-8')),
                    mimetype='text/csv',
                    as_attachment=True,
                    download_name=f"{project.name}_logs.csv"
                )
            
            # Get all logs for the APIs in this project
            logs = APILog.query.filter(APILog.api_id.in_(api_ids)).all()
            
            # Create CSV
            output = io.StringIO()
            writer = csv.writer(output)
            writer.writerow(['timestamp', 'project_name', 'api_name', 'status', 'status_code', 'response_time', 'error_message'])
            
            for log in logs:
                api = API.query.get(log.api_id)
                writer.writerow([
                    log.timestamp.isoformat() if log.timestamp else '',
                    project.name,
                    api.name if api else 'Unknown',
                    log.status or '',
                    log.status_code or '',
                    f"{log.response_time}ms" if log.response_time else '',
                    log.error_message or ''
                ])
            
            print(f"[App] Downloaded logs for project: {project.name}")
            
            return send_file(
                io.BytesIO(output.getvalue().encode('utf-8')),
                mimetype='text/csv',
                as_attachment=True,
                download_name=f"{project.name}_logs.csv"
            )
        
        except Exception as e:
            print(f"Error downloading project logs: {str(e)}")
            return jsonify({'error': str(e)}), 500
    
    @app.route('/api/template-variables', methods=['GET'])
    def get_template_variables():
        """
        Get list of available variables for email template
        """
        try:
            variables = EmailTemplateProcessor.get_available_variables()
            descriptions = EmailTemplateProcessor.AVAILABLE_VARIABLES
            
            return jsonify({
                'variables': [
                    {
                        'name': var,
                        'description': descriptions.get(var, '')
                    }
                    for var in variables
                ]
            })
        
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    
    @app.route('/api/notification-logs', methods=['GET'])
    def get_notification_logs():
        """
        Get notification logs with optional filtering
        """
        try:
            project_id = request.args.get('project_id', type=int)
            api_id = request.args.get('api_id', type=int)
            status = request.args.get('status', type=str)
            page = request.args.get('page', 1, type=int)
            per_page = request.args.get('per_page', 50, type=int)
            
            query = NotificationLog.query
            
            if project_id:
                query = query.filter_by(project_id=project_id)
            if api_id:
                query = query.filter_by(api_id=api_id)
            if status:
                query = query.filter_by(status=status)
            
            paginated = query.order_by(NotificationLog.sent_at.desc()).paginate(
                page=page, per_page=per_page, error_out=False
            )
            
            logs_data = []
            for log in paginated.items:
                log_info = log.to_dict()
                api = API.query.get(log.api_id)
                project = Project.query.get(log.project_id)
                log_info['api_name'] = api.name if api else 'Unknown'
                log_info['project_name'] = project.name if project else 'Unknown'
                logs_data.append(log_info)
            
            return jsonify({
                'logs': logs_data,
                'total': paginated.total,
                'pages': paginated.pages,
                'current_page': page
            })
        
        except Exception as e:
            print(f"Error getting notifications: {str(e)}")
            return jsonify({'error': str(e)}), 500
    
    # ==================== API MANAGEMENT ROUTES (Updated for Projects) ====================
    
    @app.route('/api/stats', methods=['GET'])
    def get_stats():
        """
        Get dashboard statistics:
        - Total APIs
        - Active APIs
        - Paused APIs
        - Average response time
        - Error count
        - Uptime percentage
        - Slowest API
        """
        try:
            # Total APIs
            total_apis = API.query.count()
            
            # Active, Paused, and Slow APIs
            active_apis = API.query.filter_by(is_paused=False).count()
            paused_apis = API.query.filter_by(is_paused=True).count()
            
            # Count slow APIs based on their latest log status
            slow_apis = 0
            if total_apis > 0:
                slow_apis_count_query = db.session.execute(text('''
                    SELECT count(*) FROM (
                        SELECT api_id, status FROM (
                            SELECT api_id, status, 
                            ROW_NUMBER() OVER(PARTITION BY api_id ORDER BY timestamp DESC) as rn
                            FROM api_logs
                        ) sub1 where rn = 1
                    ) sub2 WHERE status = 'SLOW'
                ''')).scalar()
                slow_apis = slow_apis_count_query or 0
            
            if total_apis == 0:
                return jsonify({
                    'total_apis': 0,
                    'active_apis': 0,
                    'paused_apis': 0,
                    'slow_apis': 0,
                    'avg_response_time': 0,
                    'error_count': 0,
                    'total_errors': 0,
                    'uptime_percentage': 0,
                    'slowest_api': None
                })
            
            # Average response time (last 24 hours)
            twenty_four_hours_ago = datetime.utcnow() - timedelta(hours=24)
            avg_response = db.session.query(
                func.avg(APILog.response_time)
            ).filter(APILog.timestamp >= twenty_four_hours_ago).scalar()
            
            avg_response_time = round(avg_response or 0, 2)
            
            # Error count (last 24 hours) - DOWN and ERROR statuses
            error_count = APILog.query.filter(
                APILog.status.in_(['DOWN', 'ERROR']),
                APILog.timestamp >= twenty_four_hours_ago
            ).count()
            
            # Total errors (all time)
            total_errors = APILog.query.filter(
                APILog.status.in_(['DOWN', 'ERROR'])
            ).count()
            
            # Uptime percentage (last 24 hours)
            total_checks = APILog.query.filter(
                APILog.timestamp >= twenty_four_hours_ago
            ).count()
            
            if total_checks > 0:
                up_checks = APILog.query.filter(
                    APILog.status.in_(['UP', 'SLOW']),
                    APILog.timestamp >= twenty_four_hours_ago
                ).count()
                uptime_percentage = round((up_checks / total_checks) * 100, 2)
            else:
                uptime_percentage = 0
            
            # Get slowest API (last 24 hours)
            slowest_api = None
            slowest_query = db.session.query(
                APILog.api_id,
                func.avg(APILog.response_time).label('avg_response')
            ).filter(
                APILog.timestamp >= twenty_four_hours_ago
            ).group_by(APILog.api_id).order_by(
                func.avg(APILog.response_time).desc()
            ).first()
            
            if slowest_query:
                api = API.query.get(slowest_query[0])
                if api:
                    slowest_api = {
                        'name': api.name,
                        'avg_response_time': round(slowest_query[1], 2)
                    }
            
            return jsonify({
                'total_apis': total_apis,
                'active_apis': active_apis,
                'paused_apis': paused_apis,
                'slow_apis': slow_apis,
                'avg_response_time': avg_response_time,
                'error_count': error_count,
                'total_errors': total_errors,
                'uptime_percentage': uptime_percentage,
                'slowest_api': slowest_api
            })
        
        except Exception as e:
            print(f"Error getting stats: {str(e)}")
            return jsonify({'error': str(e)}), 500
    
    @app.route('/api/apis', methods=['GET'])
    def get_apis():
        """
        Get all APIs with their latest status, uptime percentage, and alert info
        """
        try:
            apis = API.query.all()
            api_list = []
            twenty_four_hours_ago = datetime.utcnow() - timedelta(hours=24)
            
            for api in apis:
                # Get latest log for this API
                latest_log = APILog.query.filter_by(api_id=api.id).order_by(
                    APILog.timestamp.desc()
                ).first()
                
                # Calculate uptime percentage (24 hours)
                total_checks = APILog.query.filter(
                    APILog.api_id == api.id,
                    APILog.timestamp >= twenty_four_hours_ago
                ).count()
                
                uptime_percentage = 0
                if total_checks > 0:
                    up_checks = APILog.query.filter(
                        APILog.api_id == api.id,
                        APILog.status.in_(['UP', 'SLOW']),
                        APILog.timestamp >= twenty_four_hours_ago
                    ).count()
                    uptime_percentage = round((up_checks / total_checks) * 100, 2)
                
                # Get latest notification status
                latest_notification = NotificationLog.query.filter_by(api_id=api.id).order_by(
                    NotificationLog.sent_at.desc()
                ).first()
                
                api_info = {
                    'id': api.id,
                    'project_id': api.project_id,
                    'name': api.name,
                    'url': api.url,
                    'created_at': api.created_at.isoformat(),
                    'is_paused': api.is_paused,
                    'status': latest_log.status if latest_log else 'UNKNOWN',
                    'response_time': latest_log.response_time if latest_log else 0,
                    'last_checked': latest_log.timestamp.isoformat() if latest_log else None,
                    'uptime_percentage': uptime_percentage,
                    'consecutive_failures': api.consecutive_failures,
                    'last_alert_sent': api.last_alert_sent.isoformat() if api.last_alert_sent else None,
                    'last_notification_status': latest_notification.status if latest_notification else None,
                    'last_notification_error': latest_notification.error_message if latest_notification else None
                }
                api_list.append(api_info)
            
            return jsonify(api_list)
        
        except Exception as e:
            print(f"Error getting APIs: {str(e)}")
            return jsonify({'error': str(e)}), 500
    
    @app.route('/api/logs/<int:api_id>', methods=['GET'])
    def get_api_logs(api_id):
        """
        Get logs for a specific API (last 24 hours)
        """
        try:
            twenty_four_hours_ago = datetime.utcnow() - timedelta(hours=24)
            logs = APILog.query.filter(
                APILog.api_id == api_id,
                APILog.timestamp >= twenty_four_hours_ago
            ).order_by(APILog.timestamp.desc()).limit(50).all()
            
            return jsonify([log.to_dict() for log in logs])
        
        except Exception as e:
            print(f"Error getting logs: {str(e)}")
            return jsonify({'error': str(e)}), 500
    
    @app.route('/api/alerts', methods=['GET'])
    def get_failure_alerts():
        """
        Get APIs with consecutive failures >= 3 (critical alert)
        """
        try:
            alert_apis = API.query.filter(
                API.consecutive_failures >= 3
            ).all()
            
            alerts = []
            for api in alert_apis:
                latest_log = APILog.query.filter_by(api_id=api.id).order_by(
                    APILog.timestamp.desc()
                ).first()
                
                alerts.append({
                    'id': api.id,
                    'name': api.name,
                    'consecutive_failures': api.consecutive_failures,
                    'failure_time': api.consecutive_failure_time.isoformat() if api.consecutive_failure_time else None,
                    'latest_status': latest_log.status if latest_log else None,
                    'latest_error_message': latest_log.error_message if latest_log else None
                })
            
            return jsonify(alerts)
        
        except Exception as e:
            print(f"Error getting alerts: {str(e)}")
            return jsonify({'error': str(e)}), 500
    
    @app.route('/api/timeline/<int:api_id>', methods=['GET'])
    def get_error_timeline(api_id):
        """
        Get error timeline for a specific API (last 24 hours)
        Shows historical events with status changes
        """
        try:
            api = API.query.get(api_id)
            if not api:
                return jsonify({'error': 'API not found'}), 404
            
            twenty_four_hours_ago = datetime.utcnow() - timedelta(hours=24)
            logs = APILog.query.filter(
                APILog.api_id == api_id,
                APILog.timestamp >= twenty_four_hours_ago
            ).order_by(APILog.timestamp.asc()).all()
            
            timeline = []
            prev_status = None
            
            for log in logs:
                # Only include status changes in timeline
                if log.status != prev_status:
                    timeline_entry = {
                        'timestamp': log.timestamp.isoformat(),
                        'status': log.status,
                        'response_time': log.response_time,
                        'status_code': log.status_code,
                        'error_message': log.error_message,
                        'error_severity': log.error_severity,
                        'error_category': log.error_category
                    }
                    timeline.append(timeline_entry)
                    prev_status = log.status
            
            return jsonify({
                'api_id': api_id,
                'api_name': api.name,
                'timeline': timeline,
                'total_changes': len(timeline)
            })
        
        except Exception as e:
            print(f"Error getting timeline: {str(e)}")
            return jsonify({'error': str(e)}), 500
    
    @app.route('/api/response-times/<int:api_id>', methods=['GET'])
    def get_response_times(api_id):
        """
        Get response times for a specific API (last 24 hours)
        Used for response time chart
        """
        try:
            api = API.query.get(api_id)
            if not api:
                return jsonify({'error': 'API not found'}), 404
            
            twenty_four_hours_ago = datetime.utcnow() - timedelta(hours=24)
            logs = APILog.query.filter(
                APILog.api_id == api_id,
                APILog.timestamp >= twenty_four_hours_ago
            ).order_by(APILog.timestamp.asc()).all()
            
            response_times = [log.response_time for log in logs]
            timestamps = [log.timestamp.isoformat() for log in logs]
            
            return jsonify({
                'api_id': api_id,
                'api_name': api.name,
                'response_times': response_times,
                'timestamps': timestamps
            })
        
        except Exception as e:
            print(f"Error getting response times: {str(e)}")
            return jsonify({'error': str(e)}), 500
    
    @app.route('/add_api', methods=['POST'])
    def add_api():
        """
        Add a new API to monitor
        Performs an immediate health check to determine initial status
        Expects JSON: {
            "project_id": 1,
            "name": "API Name",
            "url": "https://api.example.com"
        }
        """
        try:
            data = request.get_json()
            
            # Validate input
            if not data or 'name' not in data or 'url' not in data or 'project_id' not in data:
                return jsonify({'error': 'Missing name, url, or project_id'}), 400
            
            project_id = data['project_id']
            name = data['name'].strip()
            url = data['url'].strip()
            
            if not name or not url:
                return jsonify({'error': 'Name and URL cannot be empty'}), 400
            
            # Check if project exists
            project = Project.query.get(project_id)
            if not project:
                return jsonify({'error': 'Project not found'}), 404
            
            # Check if API with same name already exists in this project
            existing = API.query.filter_by(project_id=project_id, name=name).first()
            if existing:
                return jsonify({'error': 'API with this name already exists in this project'}), 400
            
            # Create new API
            api = API(project_id=project_id, name=name, url=url)
            db.session.add(api)
            db.session.commit()
            
            print(f"[App] New API added: {name} to project {project.name}")
            
            # Perform immediate health check
            print(f"[App] Starting health check for newly added API: {name}")
            health_result = perform_health_check(api)
            
            # Return success with initial health check status
            return jsonify({
                'success': True,
                'message': f'API "{name}" added successfully',
                'api': api.to_dict(),
                'initial_health_check': health_result
            }), 201
        
        except Exception as e:
            db.session.rollback()
            print(f"Error adding API: {str(e)}")
            return jsonify({'error': str(e)}), 500
    
    @app.route('/api/<int:api_id>', methods=['DELETE'])
    def delete_api(api_id):
        """
        Delete an API from monitoring
        """
        try:
            api = API.query.get(api_id)
            
            if not api:
                return jsonify({'error': 'API not found'}), 404
            
            db.session.delete(api)
            db.session.commit()
            
            print(f"[App] API deleted: {api.name}")
            
            return jsonify({
                'success': True,
                'message': f'API "{api.name}" deleted successfully'
            })
        
        except Exception as e:
            db.session.rollback()
            print(f"Error deleting API: {str(e)}")
            return jsonify({'error': str(e)}), 500
    
    @app.route('/api/<int:api_id>/pause', methods=['POST'])
    def pause_api(api_id):
        """
        Pause monitoring for a specific API
        """
        try:
            api = API.query.get(api_id)
            
            if not api:
                return jsonify({'error': 'API not found'}), 404
            
            api.is_paused = True
            db.session.commit()
            
            print(f"[App] API paused: {api.name}")
            
            return jsonify({
                'success': True,
                'message': f'API "{api.name}" monitoring paused'
            })
        
        except Exception as e:
            db.session.rollback()
            print(f"Error pausing API: {str(e)}")
            return jsonify({'error': str(e)}), 500
    
    @app.route('/api/<int:api_id>/resume', methods=['POST'])
    def resume_api(api_id):
        """
        Resume monitoring for a specific API
        """
        try:
            api = API.query.get(api_id)
            
            if not api:
                return jsonify({'error': 'API not found'}), 404
            
            api.is_paused = False
            db.session.commit()
            
            print(f"[App] API resumed: {api.name}")
            
            return jsonify({
                'success': True,
                'message': f'API "{api.name}" monitoring resumed'
            })
        
        except Exception as e:
            db.session.rollback()
            print(f"Error resuming API: {str(e)}")
            return jsonify({'error': str(e)}), 500
    
    @app.route('/logs')
    def logs_page():
        """
        Render the logs page
        """
        return render_template('logs.html')
    
    @app.route('/api/logs', methods=['GET'])
    def get_logs_filtered():
        """
        Get logs with filters
        Query parameters:
        - api_id: filter by API
        - status: filter by status (UP, DOWN, ERROR)
        - start_date: filter by start date (YYYY-MM-DD)
        - end_date: filter by end date (YYYY-MM-DD)
        - page: pagination page (default 1)
        - per_page: items per page (default 50)
        """
        try:
            page = request.args.get('page', 1, type=int)
            per_page = request.args.get('per_page', 50, type=int)
            api_id = request.args.get('api_id', type=int)
            status = request.args.get('status', type=str)
            start_date = request.args.get('start_date', type=str)
            end_date = request.args.get('end_date', type=str)
            
            # Build query
            query = APILog.query
            
            if api_id:
                query = query.filter_by(api_id=api_id)
            
            if status:
                query = query.filter_by(status=status)
            
            if start_date:
                start_dt = datetime.strptime(start_date, '%Y-%m-%d')
                query = query.filter(APILog.timestamp >= start_dt)
            
            if end_date:
                end_dt = datetime.strptime(end_date, '%Y-%m-%d') + timedelta(days=1)
                query = query.filter(APILog.timestamp < end_dt)
            
            # Paginate
            paginated = query.order_by(APILog.timestamp.desc()).paginate(
                page=page, per_page=per_page, error_out=False
            )
            
            logs_data = []
            for log in paginated.items:
                api = API.query.get(log.api_id)
                logs_data.append({
                    'id': log.id,
                    'api_id': log.api_id,
                    'api_name': api.name if api else 'Unknown',
                    'status': log.status,
                    'status_code': log.status_code,
                    'response_time': log.response_time,
                    'timestamp': log.timestamp.isoformat(),
                    'error_type': log.error_type,
                    'error_severity': log.error_severity,
                    'error_message': log.error_message,
                    'error_category': log.error_category
                })
            
            return jsonify({
                'logs': logs_data,
                'total': paginated.total,
                'pages': paginated.pages,
                'current_page': page
            })
        
        except Exception as e:
            print(f"Error getting logs: {str(e)}")
            return jsonify({'error': str(e)}), 500
    
    @app.route('/compare')
    def compare_page():
        """
        Render the API comparison page
        """
        return render_template('compare.html')
    
    @app.route('/api/compare', methods=['POST'])
    def get_comparison_data():
        """
        Get comparison data for multiple APIs
        Request body: {"api_ids": [1, 2, 3]}
        """
        try:
            data = request.get_json()
            api_ids = data.get('api_ids', []) if data else []
            
            if not api_ids:
                return jsonify({'error': 'No APIs selected'}), 400
            
            # Get comparison data
            apis = API.query.filter(API.id.in_(api_ids)).all()
            
            if not apis:
                return jsonify({'error': 'No APIs found'}), 404
            
            comparison_data = []
            twenty_four_hours_ago = datetime.utcnow() - timedelta(hours=24)
            
            for api in apis:
                logs = APILog.query.filter(
                    APILog.api_id == api.id,
                    APILog.timestamp >= twenty_four_hours_ago
                ).order_by(APILog.timestamp.asc()).all()
                
                response_times = [log.response_time for log in logs]
                up_count = sum(1 for log in logs if log.status == 'UP')
                total_count = len(logs)
                uptime = (up_count / total_count * 100) if total_count > 0 else 0
                
                comparison_data.append({
                    'id': api.id,
                    'name': api.name,
                    'url': api.url,
                    'response_times': response_times,
                    'timestamps': [log.timestamp.isoformat() for log in logs],
                    'uptime': round(uptime, 2),
                    'avg_response_time': round(sum(response_times) / len(response_times), 2) if response_times else 0,
                    'total_checks': total_count,
                    'status_counts': {
                        'up': sum(1 for log in logs if log.status == 'UP'),
                        'down': sum(1 for log in logs if log.status == 'DOWN'),
                        'error': sum(1 for log in logs if log.status == 'ERROR')
                    }
                })
            
            return jsonify(comparison_data)
        
        except Exception as e:
            print(f"Error getting comparison data: {str(e)}")
            return jsonify({'error': str(e)}), 500
    
    @app.route('/download/logs/all')
    def download_all_logs():
        """
        Download logs as CSV, applying any active filters.
        """
        try:
            api_id = request.args.get('api_id', type=int)
            status = request.args.get('status', type=str)
            start_date = request.args.get('start_date', type=str)
            end_date = request.args.get('end_date', type=str)
            
            query = APILog.query
            
            if api_id:
                query = query.filter_by(api_id=api_id)
            if status:
                query = query.filter_by(status=status)
            if start_date:
                start_dt = datetime.strptime(start_date, '%Y-%m-%d')
                query = query.filter(APILog.timestamp >= start_dt)
            if end_date:
                end_dt = datetime.strptime(end_date, '%Y-%m-%d') + timedelta(days=1)
                query = query.filter(APILog.timestamp < end_dt)
                
            logs = query.order_by(APILog.timestamp.desc()).all()
            
            # Create CSV
            output = io.StringIO()
            writer = csv.writer(output)
            writer.writerow(['API ID', 'API Name', 'Status', 'Status Code', 'Response Time (ms)', 'Timestamp'])
            
            for log in logs:
                api = API.query.get(log.api_id)
                writer.writerow([
                    log.api_id,
                    api.name if api else 'Unknown',
                    log.status,
                    log.status_code or '',
                    f"{log.response_time:.2f}",
                    log.timestamp.isoformat()
                ])
            
            # Convert to bytes
            output.seek(0)
            csv_bytes = io.BytesIO(output.getvalue().encode('utf-8'))
            csv_bytes.seek(0)
            
            return send_file(
                csv_bytes,
                mimetype='text/csv',
                as_attachment=True,
                download_name='api_monitor_logs_all.csv'
            )
        
        except Exception as e:
            print(f"Error downloading logs: {str(e)}")
            return jsonify({'error': str(e)}), 500
    
    @app.route('/download/logs')
    def download_selected_logs():
        """
        Download logs for selected APIs as CSV
        Query parameter: api_ids=1,2,3
        """
        try:
            api_ids_str = request.args.get('api_ids', '')
            
            if not api_ids_str:
                return jsonify({'error': 'No APIs selected'}), 400
            
            api_ids = [int(x) for x in api_ids_str.split(',')]
            logs = APILog.query.filter(APILog.api_id.in_(api_ids)).order_by(APILog.timestamp.desc()).all()
            
            # Create CSV
            output = io.StringIO()
            writer = csv.writer(output)
            writer.writerow(['API ID', 'API Name', 'Status', 'Status Code', 'Response Time (ms)', 'Timestamp'])
            
            for log in logs:
                api = API.query.get(log.api_id)
                writer.writerow([
                    log.api_id,
                    api.name if api else 'Unknown',
                    log.status,
                    log.status_code or '',
                    f"{log.response_time:.2f}",
                    log.timestamp.isoformat()
                ])
            
            # Convert to bytes
            output.seek(0)
            csv_bytes = io.BytesIO(output.getvalue().encode('utf-8'))
            csv_bytes.seek(0)
            
            return send_file(
                csv_bytes,
                mimetype='text/csv',
                as_attachment=True,
                download_name='api_monitor_logs_selected.csv'
            )
        
        except Exception as e:
            print(f"Error downloading logs: {str(e)}")
            return jsonify({'error': str(e)}), 500
    
    @app.errorhandler(404)
    def not_found(error):
        """Handle 404 errors"""
        return jsonify({'error': 'Not found'}), 404
    
    @app.errorhandler(500)
    def internal_error(error):
        """Handle 500 errors"""
        return jsonify({'error': 'Internal server error'}), 500
    
    return app


if __name__ == '__main__':
    app = create_app()
    app.run(host='0.0.0.0', port=5000, debug=False)
