"""
Database Configuration
Sets up MySQL connection using SQLAlchemy and environment variables
"""

import os
from flask_sqlalchemy import SQLAlchemy

# Read environment variables with defaults
MYSQL_HOST = os.getenv('MYSQL_HOST', 'db')
MYSQL_USER = os.getenv('MYSQL_USER', 'monitor_user')
MYSQL_PASSWORD = os.getenv('MYSQL_PASSWORD', 'monitor_pass')
MYSQL_DATABASE = os.getenv('MYSQL_DATABASE', 'api_monitor')

# Construct database URL
DATABASE_URL = f'mysql+pymysql://{MYSQL_USER}:{MYSQL_PASSWORD}@{MYSQL_HOST}:3306/{MYSQL_DATABASE}'

def get_database_config():
    """
    Returns database configuration for Flask and SQLAlchemy
    """
    return {
        'SQLALCHEMY_DATABASE_URI': DATABASE_URL,
        'SQLALCHEMY_TRACK_MODIFICATIONS': False,
        'SQLALCHEMY_ENGINE_OPTIONS': {
            'pool_recycle': 3600,
            'pool_pre_ping': True,
            'connect_args': {
                'connect_timeout': 10
            }
        }
    }


def init_db(app):
    """
    Initialize database tables
    """
    from models import db
    with app.app_context():
        db.create_all()
