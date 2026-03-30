"""
Database Models
Defines SQLAlchemy ORM models for APIs, Projects, and Logs
"""

from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

# Initialize SQLAlchemy
db = SQLAlchemy()


class Project(db.Model):
    """
    Project Model - Groups multiple APIs together
    """
    __tablename__ = 'projects'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False, unique=True)
    priority = db.Column(db.String(20), nullable=False)  # Critical, Moderate, Low
    responsible_name = db.Column(db.String(255), nullable=False)
    responsible_email = db.Column(db.String(255), nullable=False)
    email_subject = db.Column(db.String(255), nullable=True)  # Email subject template
    email_template = db.Column(db.Text, nullable=True)  # Dynamic email template
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    
    # Relationships
    apis = db.relationship('API', backref='project', lazy=True, cascade='all, delete-orphan')
    notification_logs = db.relationship('NotificationLog', backref='project', lazy=True, cascade='all, delete-orphan')
    
    def __repr__(self):
        return f'<Project {self.name}>'
    
    def to_dict(self):
        """Convert model to dictionary"""
        return {
            'id': self.id,
            'name': self.name,
            'priority': self.priority,
            'responsible_name': self.responsible_name,
            'responsible_email': self.responsible_email,
            'email_subject': self.email_subject,
            'email_template': self.email_template,
            'created_at': self.created_at.isoformat()
        }


class API(db.Model):
    """
    API Model - stores information about APIs to monitor
    """
    __tablename__ = 'apis'
    
    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey('projects.id'), nullable=False)
    name = db.Column(db.String(255), nullable=False)
    url = db.Column(db.String(500), nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    is_paused = db.Column(db.Boolean, nullable=False, default=False)
    consecutive_failures = db.Column(db.Integer, nullable=False, default=0)
    consecutive_failure_time = db.Column(db.DateTime, nullable=True)
    last_alert_sent = db.Column(db.DateTime, nullable=True)  # Track last alert time
    
    # Relationships
    logs = db.relationship('APILog', backref='api', lazy=True, cascade='all, delete-orphan')
    notification_logs = db.relationship('NotificationLog', backref='api', lazy=True, cascade='all, delete-orphan')
    
    def __repr__(self):
        return f'<API {self.name}>'
    
    def to_dict(self):
        """Convert model to dictionary"""
        return {
            'id': self.id,
            'project_id': self.project_id,
            'name': self.name,
            'url': self.url,
            'created_at': self.created_at.isoformat(),
            'is_paused': self.is_paused,
            'consecutive_failures': self.consecutive_failures,
            'last_alert_sent': self.last_alert_sent.isoformat() if self.last_alert_sent else None
        }


class APILog(db.Model):
    """
    API Log Model - stores monitoring results for each API
    """
    __tablename__ = 'api_logs'
    
    id = db.Column(db.Integer, primary_key=True)
    api_id = db.Column(db.Integer, db.ForeignKey('apis.id'), nullable=False)
    status_code = db.Column(db.Integer, nullable=True)
    response_time = db.Column(db.Float, nullable=False)  # in milliseconds
    status = db.Column(db.String(10), nullable=False)  # 'UP' or 'DOWN'
    timestamp = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    
    # Error classification & insights
    error_type = db.Column(db.String(50), nullable=True)  # CONNECTION, CLIENT, SERVER, TIMEOUT
    error_severity = db.Column(db.String(20), nullable=True)  # LOW, MEDIUM, HIGH, CRITICAL
    error_message = db.Column(db.String(255), nullable=True)  # Human readable error
    error_category = db.Column(db.String(50), nullable=True)  # NETWORK_ERROR, CLIENT_ERROR, SERVER_ERROR
    
    def __repr__(self):
        return f'<APILog api_id={self.api_id}, status={self.status}>'
    
    def to_dict(self):
        """Convert model to dictionary"""
        return {
            'id': self.id,
            'api_id': self.api_id,
            'status_code': self.status_code,
            'response_time': self.response_time,
            'status': self.status,
            'timestamp': self.timestamp.isoformat(),
            'error_type': self.error_type,
            'error_severity': self.error_severity,
            'error_message': self.error_message,
            'error_category': self.error_category
        }


class NotificationLog(db.Model):
    """
    Notification Log Model - tracks all email notifications sent
    """
    __tablename__ = 'notification_logs'
    
    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey('projects.id'), nullable=False)
    api_id = db.Column(db.Integer, db.ForeignKey('apis.id'), nullable=False)
    recipient_email = db.Column(db.String(255), nullable=False)
    email_subject = db.Column(db.String(500), nullable=False)
    email_body = db.Column(db.Text, nullable=False)
    status = db.Column(db.String(20), nullable=False)  # 'Sent' or 'Failed'
    error_message = db.Column(db.Text, nullable=True)  # Error reason if failed
    sent_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    
    def __repr__(self):
        return f'<NotificationLog project_id={self.project_id}, status={self.status}>'
    
    def to_dict(self):
        """Convert model to dictionary"""
        return {
            'id': self.id,
            'project_id': self.project_id,
            'api_id': self.api_id,
            'recipient_email': self.recipient_email,
            'email_subject': self.email_subject,
            'email_body': self.email_body,
            'status': self.status,
            'error_message': self.error_message,
            'sent_at': self.sent_at.isoformat()
        }

