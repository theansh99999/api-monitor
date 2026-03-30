"""
Email Utility Functions
Handles email template processing and SMTP delivery
"""

import smtplib
import os
import re
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timedelta
from dotenv import load_dotenv

load_dotenv()

class EmailTemplateProcessor:
    """
    Process email templates with dynamic variable replacement
    """
    
    AVAILABLE_VARIABLES = {
        '$project_name': 'Project name',
        '$api_name': 'API name',
        '$api_url': 'API endpoint URL',
        '$api_status': 'API status (UP/DOWN/ERROR)',
        '$status_code': 'HTTP status code',
        '$error_code': 'Error code (same as status_code)',
        '$error_reason': 'Error description',
        '$response_time': 'Response time in ms',
        '$down_duration': 'How long API has been down',
        '$timestamp': 'Current timestamp',
        '$priority': 'Project priority',
        '$responsible_name': 'Responsible person name'
    }
    
    @staticmethod
    def get_available_variables():
        """Return list of available variables for template"""
        return list(EmailTemplateProcessor.AVAILABLE_VARIABLES.keys())
    
    @staticmethod
    def process_template(template, context):
        """
        Replace variables in template with actual values
        
        Args:
            template: Email template string
            context: Dictionary with variable values
        
        Returns:
            Processed template string
        """
        if not template:
            template = EmailTemplateProcessor.get_default_template()
        
        result = template
        
        # Replace each variable
        replacements = {
            '$project_name': str(context.get('project_name', 'Unknown')),
            '$api_name': str(context.get('api_name', 'Unknown')),
            '$api_url': str(context.get('api_url', 'Unknown')),
            '$api_status': str(context.get('api_status', 'UNKNOWN')),
            '$status_code': str(context.get('status_code', 'N/A')),
            '$error_code': str(context.get('status_code', 'N/A')),  # Same as status_code
            '$error_reason': str(context.get('error_reason', 'No error details')),
            '$response_time': str(context.get('response_time', '0')),
            '$down_duration': str(context.get('down_duration', 'Unknown')),
            '$timestamp': str(context.get('timestamp', datetime.utcnow().isoformat())),
            '$priority': str(context.get('priority', 'Unknown')),
            '$responsible_name': str(context.get('responsible_name', 'Unknown'))
        }
        
        for var, value in replacements.items():
            result = result.replace(var, value)
        
        return result
    
    @staticmethod
    def get_default_template():
        """
        Get default email template if none exists
        """
        return """API Alert Notification

Project: $project_name
Priority: $priority
Responsible: $responsible_name

---

API: $api_name
Status: $api_status
Status Code: $status_code
Error Reason: $error_reason
Response Time: $response_time ms
Down Since: $down_duration
Timestamp: $timestamp"""


class EmailSender:
    """
    Send emails via SMTP
    """
    
    def __init__(self):
        self.smtp_server = os.getenv('SMTP_SERVER', 'smtp.gmail.com')
        self.smtp_port = int(os.getenv('SMTP_PORT', 587))
        self.smtp_user = os.getenv('SMTP_USER', '')
        self.smtp_password = os.getenv('SMTP_PASSWORD', '')
        self.from_email = os.getenv('FROM_EMAIL', self.smtp_user or 'noreply@api-monitor.local')
    
    def send_email(self, recipient_email, subject, body):
        """
        Send email via SMTP
        
        Returns:
            (success: bool, error_message: str or None)
        """
        try:
            # Validate email address
            if not self._is_valid_email(recipient_email):
                error = f"Invalid email address: {recipient_email}"
                print(f"[Email] ✗ {error}")
                return (False, error)
            
            # If no SMTP configured, log warning but don't fail
            if not self.smtp_user or not self.smtp_password:
                print(f"[Email] ℹ SMTP not configured. Would send to: {recipient_email}")
                print(f"[Email] ℹ Subject: {subject}")
                return (True, None)  # Pretend success for testing
            
            # Log connection attempt
            print(f"[Email] Connecting to SMTP server: {self.smtp_server}:{self.smtp_port}")
            
            # Create message
            message = MIMEMultipart('alternative')
            message['Subject'] = subject
            message['From'] = self.from_email
            message['To'] = recipient_email
            
            # Add body
            mime_body = MIMEText(body, 'plain')
            message.attach(mime_body)
            
            # Send email
            print(f"[Email] Sending alert to {recipient_email}")
            with smtplib.SMTP(self.smtp_server, self.smtp_port) as server:
                print(f"[Email] Connected to SMTP server")
                server.starttls()
                print(f"[Email] TLS connection established")
                server.login(self.smtp_user, self.smtp_password)
                print(f"[Email] Authentication successful")
                server.send_message(message)
            
            print(f"[Email] ✓ Email sent successfully to {recipient_email}")
            print(f"[Email] ✓ Subject: {subject}")
            return (True, None)
        
        except smtplib.SMTPAuthenticationError as e:
            error = f"SMTP authentication failed - check SMTP_USER and SMTP_PASSWORD credentials"
            print(f"[Email] ✗ SMTP authentication failed")
            print(f"[Email] ✗ Error: {str(e)}")
            return (False, error)
        
        except smtplib.SMTPException as e:
            error = f"SMTP error: {str(e)}"
            print(f"[Email] ✗ SMTP error: {error}")
            return (False, error)
        
        except Exception as e:
            error = f"Email sending failed: {str(e)}"
            print(f"[Email] ✗ Error: {error}")
            return (False, error)
    
    @staticmethod
    def _is_valid_email(email):
        """Basic email validation"""
        pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        return re.match(pattern, email) is not None


def calculate_down_duration(failure_time):
    """
    Calculate how long an API has been down
    
    Args:
        failure_time: datetime when failures started
    
    Returns:
        Human readable duration string
    """
    if not failure_time:
        return "Unknown"
    
    now = datetime.utcnow()
    duration = now - failure_time
    
    total_seconds = int(duration.total_seconds())
    
    if total_seconds < 60:
        return f"{total_seconds} seconds"
    elif total_seconds < 3600:
        minutes = total_seconds // 60
        return f"{minutes} minute{'s' if minutes != 1 else ''}"
    elif total_seconds < 86400:
        hours = total_seconds // 3600
        return f"{hours} hour{'s' if hours != 1 else ''}"
    else:
        days = total_seconds // 86400
        return f"{days} day{'s' if days != 1 else ''}"
