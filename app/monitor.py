"""
API Monitoring Worker
Background service that monitors APIs and logs their status
Runs every 30 seconds using APScheduler
Includes email alerting with priority-based intervals
"""

import requests
import time
import urllib3
from datetime import datetime, timedelta
from apscheduler.schedulers.background import BackgroundScheduler

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

from models import db, API, APILog, Project, NotificationLog
from email_utils import EmailSender, EmailTemplateProcessor, calculate_down_duration


# Error classification mappings
ERROR_CODE_MESSAGES = {
    200: "API working normally",
    201: "Created successfully",
    204: "No content",
    301: "Moved permanently",
    302: "Temporary redirect",
    304: "Not modified",
    400: "Client request error - Bad request",
    401: "Authentication required",
    403: "Permission denied",
    404: "API endpoint not found",
    408: "Request timeout",
    429: "Too many requests (rate limit)",
    500: "Internal server error",
    502: "Bad gateway",
    503: "Service unavailable",
    504: "Gateway timeout"
}

def classify_error(status_code, error_type):
    """
    Classify error by status code and type
    Returns: (category, severity, message, error_type)
    """
    if error_type == "TIMEOUT":
        return ("NETWORK_ERROR", "CRITICAL", "Connection timed out", "TIMEOUT")
    elif error_type == "CONNECTION":
        return ("NETWORK_ERROR", "CRITICAL", "Connection failed or unreachable", "CONNECTION")
    
    if status_code is None:
        return ("NETWORK_ERROR", "CRITICAL", "Network error - no response", "CONNECTION")
    
    # Client errors (4xx)
    if 400 <= status_code < 500:
        severity = "LOW" if status_code == 404 else "MEDIUM"
        message = ERROR_CODE_MESSAGES.get(status_code, f"Client error {status_code}")
        return ("CLIENT_ERROR", severity, message, "CLIENT_ERROR")
    
    # Server errors (5xx)
    if 500 <= status_code < 600:
        severity = "MEDIUM" if status_code == 503 else "HIGH"
        message = ERROR_CODE_MESSAGES.get(status_code, f"Server error {status_code}")
        return ("SERVER_ERROR", severity, message, "SERVER_ERROR")
    
    # Success codes
    if 200 <= status_code < 300:
        return (None, None, ERROR_CODE_MESSAGES.get(status_code, "Success"), "SUCCESS")
    
    # Redirect codes
    if 300 <= status_code < 400:
        return (None, None, ERROR_CODE_MESSAGES.get(status_code, f"Redirect {status_code}"), "REDIRECT")
    
    return (None, None, f"Unknown status {status_code}", "UNKNOWN")


class APIMonitor:
    """
    Background monitor for APIs
    Sends HTTP requests to configured APIs and logs results
    Sends alert emails based on project priority
    """
    
    def __init__(self, app):
        """
        Initialize the monitor with Flask app context
        """
        self.app = app
        self.scheduler = BackgroundScheduler()
        self.is_running = False
        self.email_sender = EmailSender()
        self.FAILURE_ALERT_THRESHOLD = 3  # Number of consecutive failures to trigger alert
        
        # Alert intervals by priority (in seconds)
        self.ALERT_INTERVALS = {
            'Critical': 120,      # 2 minutes
            'Moderate': 300,      # 5 minutes
            'Low': 600            # 10 minutes
        }
    
    def start(self):
        """
        Start the background scheduler to monitor APIs every 30 seconds
        """
        if not self.is_running:
            # Schedule the monitoring task
            self.scheduler.add_job(
                func=self.monitor_apis,
                trigger="interval",
                seconds=30,
                id='api_monitor_job',
                name='Monitor all APIs',
                replace_existing=True
            )
            self.scheduler.start()
            self.is_running = True
            print("[Monitor] API monitoring started - running every 30 seconds")
    
    def stop(self):
        """
        Stop the background scheduler
        """
        if self.is_running:
            self.scheduler.shutdown()
            self.is_running = False
            print("[Monitor] API monitoring stopped")
    
    def monitor_apis(self):
        """
        Monitor all APIs in the database
        Sends HTTP requests and logs results
        Skips APIs that are paused
        Checks and sends alerts as needed
        """
        with self.app.app_context():
            try:
                # Fetch all active (non-paused) APIs from database
                apis = API.query.filter_by(is_paused=False).all()
                
                if not apis:
                    print("[Monitor] ℹ No active APIs to monitor")
                    return
                
                print(f"[Monitor] 🔄 Starting monitoring cycle - Monitoring {len(apis)} API(s)")
                
                for api in apis:
                    self._check_api(api)
                
                # Check for alerts that need to be sent
                self._check_and_send_alerts()
                
                print("[Monitor] ✓ Monitoring cycle completed")
            
            except Exception as e:
                print(f"[Monitor] ✗ Error during monitoring: {str(e)}")
    
    def _check_api(self, api):
        """
        Check a single API and log the result
        Handles UP, ERROR, DOWN, and UNKNOWN statuses
        Tracks consecutive failures for alerts
        """

        start_time = time.time()
        status = "DOWN"
        status_code = None
        error_type = None
        error_category = None
        error_severity = None
        error_message = None

        try:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
            response = requests.get(api.url, headers=headers, timeout=7, allow_redirects=True, verify=False)

            response_time = (time.time() - start_time) * 1000
            status_code = response.status_code

            if 200 <= status_code < 300:
                if response_time >= 3000:
                    status = "SLOW"
                else:
                    status = "UP"
                error_category, error_severity, error_message, error_type = classify_error(status_code, None)
                print(f"[Monitor] ✓ {api.name}: {status} ({status_code}) {response_time:.2f}ms")
            elif 400 <= status_code < 600:
                status = "ERROR"
                error_category, error_severity, error_message, error_type = classify_error(status_code, None)
                print(f"[Monitor] ⚠ {api.name}: {status} ({status_code}) {response_time:.2f}ms")
            else:
                status = "UNKNOWN"
                error_category, error_severity, error_message, error_type = classify_error(status_code, None)
                print(f"[Monitor] ? {api.name}: {status} ({status_code}) {response_time:.2f}ms")

        except requests.exceptions.Timeout:
            status = "DOWN"
            status_code = None
            response_time = (time.time() - start_time) * 1000
            error_category, error_severity, error_message, error_type = classify_error(None, "TIMEOUT")
            print(f"[Monitor] ✗ {api.name}: DOWN (Request Timeout {response_time:.2f}ms)")

        except requests.exceptions.RequestException as e:
            status = "DOWN"
            status_code = None
            response_time = (time.time() - start_time) * 1000
            error_category, error_severity, error_message, error_type = classify_error(None, "CONNECTION")
            print(f"[Monitor] ✗ {api.name}: DOWN ({type(e).__name__})")

        # Update consecutive failure tracking
        if status == "DOWN" or status == "ERROR":
            api.consecutive_failures += 1
            if api.consecutive_failures == 1:
                api.consecutive_failure_time = datetime.utcnow()
            # Log consecutive failures
            if api.consecutive_failures > 1 and api.consecutive_failures % 5 == 0:
                print(f"[Alert] ⚠️ {api.name} has failed {api.consecutive_failures} consecutive times")
        else:
            if api.consecutive_failures > 0:
                print(f"[Monitor] ✓ {api.name} is back UP (recovered after {api.consecutive_failures} failures)")
            api.consecutive_failures = 0
            api.consecutive_failure_time = None

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

            # Update API with failure count
            api.consecutive_failures = api.consecutive_failures if (status == "DOWN" or status == "ERROR") else 0
            if status == "DOWN" or status == "ERROR":
                if api.consecutive_failures == 1:
                    api.consecutive_failure_time = datetime.utcnow()
            else:
                api.consecutive_failure_time = None
            db.session.commit()

            # Log alert if critical threshold reached
            if api.consecutive_failures >= self.FAILURE_ALERT_THRESHOLD:
                print(f"[Alert] {api.name} has failed {api.consecutive_failures} times consecutively!")

        except Exception as e:
            db.session.rollback()
            print(f"[Monitor] DB error: {str(e)}")
    
    def _check_and_send_alerts(self):
        """
        Check which APIs need alerts and send them based on priority intervals
        """
        try:
            # Get all APIs with consecutive failures that should trigger alerts
            failed_apis = API.query.filter(
                API.consecutive_failures >= self.FAILURE_ALERT_THRESHOLD,
                API.is_paused == False,
                API.project_id.isnot(None)
            ).all()
            
            now = datetime.utcnow()
            
            for api in failed_apis:
                project = api.project
                if not project:
                    continue
                
                # Determine if alert should be sent based on priority interval
                alert_interval = self.ALERT_INTERVALS.get(project.priority, 600)
                
                # Check if enough time has passed since last alert
                if api.last_alert_sent:
                    time_since_last = (now - api.last_alert_sent).total_seconds()
                    if time_since_last < alert_interval:
                        continue  # Not yet time for next alert
                
                # Send the alert
                self._send_alert_email(api, project)
        
        except Exception as e:
            print(f"[Monitor] Error checking alerts: {str(e)}")
    
    def _send_alert_email(self, api, project):
        """
        Send alert email for a failed API
        """
        try:
            # Get latest log for error details
            latest_log = APILog.query.filter_by(api_id=api.id).order_by(
                APILog.timestamp.desc()
            ).first()
            
            # Prepare template context
            context = {
                'project_name': project.name,
                'api_name': api.name,
                'api_url': api.url,
                'api_status': latest_log.status if latest_log else 'UNKNOWN',
                'status_code': latest_log.status_code or 'N/A' if latest_log else 'N/A',
                'error_code': latest_log.status_code or 'N/A' if latest_log else 'N/A',
                'error_reason': latest_log.error_message or 'No details' if latest_log else 'Unknown',
                'response_time': f"{latest_log.response_time:.2f}" if latest_log else '0',
                'down_duration': calculate_down_duration(api.consecutive_failure_time),
                'timestamp': datetime.utcnow().isoformat(),
                'priority': project.priority,
                'responsible_name': project.responsible_name
            }
            
            # Process email subject and body templates
            email_subject_template = project.email_subject or "🚨 $api_name is $api_status - $priority Priority"
            email_body_template = project.email_template
            
            processed_subject = EmailTemplateProcessor.process_template(
                email_subject_template,
                context
            )
            processed_body = EmailTemplateProcessor.process_template(
                email_body_template,
                context
            )
            
            # Send email
            success, error_msg = self.email_sender.send_email(
                project.responsible_email,
                processed_subject,
                processed_body
            )
            
            # Log notification
            notification_log = NotificationLog(
                project_id=project.id,
                api_id=api.id,
                recipient_email=project.responsible_email,
                email_subject=processed_subject,
                email_body=processed_body,
                status='Sent' if success else 'Failed',
                error_message=error_msg,
                sent_at=datetime.utcnow()
            )
            
            db.session.add(notification_log)
            
            # Update last alert sent time
            if success:
                api.last_alert_sent = datetime.utcnow()
            
            db.session.commit()
            
            status_str = "✓ Sent successfully" if success else f"✗ Failed: {error_msg}"
            print(f"[Alert] 📧 Email to {project.responsible_email} for {api.name}: {status_str}")
            
        except Exception as e:
            db.session.rollback()
            print(f"[Monitor] Error sending alert for {api.name}: {str(e)}")
