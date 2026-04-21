# API Monitoring Dashboard
![Flask](https://img.shields.io/badge/Flask-2.3-green)
![MySQL](https://img.shields.io/badge/MySQL-8.0-blue)
![Docker](https://img.shields.io/badge/Docker-Enabled-blue)

## 🚀 Live API Monitoring Dashboard

A production-ready system to monitor API uptime, performance, and failures in real-time with alerts, analytics, and visualization.


📊 **Tracks:** Uptime • Response Time • Errors • Alerts  
⚡ **Built for:** Developers, DevOps, Backend Engineers

## Features

✅ **API Monitoring**
- Multi-API monitoring with real-time status
- Real-time status tracking (UP/DOWN)
- Response time measurement
- Automatic monitoring every 30 seconds
- Error classification (Connection, Client, Server, Timeout)

✅ **Project Management**
- Group APIs into projects with priorities (Critical, Moderate, Low)
- Assign responsible persons and email contacts
- Custom email templates for notifications

✅ **Dashboard Metrics**
- Total APIs being monitored
- Average response time (last 24 hours)
- Error count tracking
- Uptime percentage calculation

✅ **Data Visualization**
- Response time trend chart using Chart.js
- Real-time status indicators
- Responsive dashboard design with Bootstrap
- API logs and comparison views

✅ **Email Notifications**
- Automated alerts for API failures
- Customizable email templates
- Notification logs tracking

✅ **Database**
- MySQL backend for data persistence
- SQLAlchemy ORM for database operations
- Comprehensive API logs with timestamps

✅ **Production Ready**
- Docker containerization
- Docker Compose orchestration
- Clean modular architecture
- Background task scheduling with APScheduler

## Tech Stack

- **Backend**: Flask 2.3.3
- **Database**: MySQL 8.0
- **ORM**: SQLAlchemy 2.0
- **Task Scheduling**: APScheduler 3.10
- **Frontend**: Bootstrap 5, Chart.js
- **Containerization**: Docker, Docker Compose

## Project Structure

```
api-monitor-dashboard/
│
├── docker-compose.yml          # Docker Compose configuration
├── Dockerfile                  # Flask app Docker image
├── requirements.txt            # Python dependencies
├── README.md                   # Project documentation
│
├── app/
│   ├── __init__.py            # Flask app package
│   ├── app.py                 # Flask application & routes
│   ├── models.py              # SQLAlchemy models
│   ├── database.py            # Database configuration
│   ├── monitor.py             # Background monitoring worker
│   └── email_utils.py         # Email notification utilities
│
├── templates/
│   ├── index.html             # Main dashboard HTML template
│   ├── projects.html          # Projects management page
│   ├── logs.html              # API logs viewer
│   └── compare.html           # API comparison tool
│
└── static/
    ├── style.css              # Dashboard styling
    ├── app.js                 # Main dashboard JavaScript
    ├── projects.js            # Projects page JavaScript
    ├── logs.js                # Logs page JavaScript
    └── compare.js             # Comparison tool JavaScript
```

## Quick Start

### Prerequisites
- Docker
- Docker Compose
- Create .env file and paste code
   SMTP_SERVER=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your_gmail_address
   SMTP_PASSWORD=Your_app_password
   FROM_EMAIL=API Monitor <your_mail_address>

### Running the Application

1. **Clone or navigate to the project directory:**
   ```bash
   cd api-monitor-dashboard
   ```

2. **Start the application with Docker Compose:**
   ```bash
   docker-compose up --build
   ```

3. **Access the dashboard:**
   - Open your browser and navigate to: `http://localhost:5000`

4. **Wait for initialization:**
   - The MySQL database will take 10-15 seconds to initialize
   - The Flask application will start the background monitoring service

## Usage

### Managing Projects

1. Navigate to the Projects page (`/projects`)
2. Click "Add New Project"
3. Enter project details:
   - Project name
   - Priority level (Critical/Moderate/Low)
   - Responsible person name and email
   - Custom email subject and template (optional)
4. Click "Add Project"

### Adding APIs to Monitor

1. Go to the main dashboard or Projects page
2. Select a project to add the API to
3. Enter the API name (e.g., "GitHub API")
4. Enter the API URL (e.g., `https://api.github.com`)
5. Click "Add API"
6. The system will start monitoring the API automatically every 30 seconds

### Viewing Logs

1. Go to the Logs page (`/logs`)
2. Select an API from the dropdown
3. Choose time range (1h, 6h, 24h, 7d)
4. View detailed logs with status, response time, and error types

### Comparing APIs

1. Go to the Compare page (`/compare`)
2. Select two APIs to compare
3. Choose time range
4. View side-by-side performance metrics and trends

### Dashboard Metrics

- **Total APIs**: Number of APIs currently being monitored
- **Avg Response Time**: Average response time in milliseconds (last 24 hours)
- **Errors**: Total errors detected (status != 200)
- **Uptime**: Percentage of successful checks (last 24 hours)

### API Status Table

Shows all monitored APIs with:
- API name and URL
- Current status (UP/DOWN)
- Latest response time
- Last check timestamp
- Project association
- Pause/Resume controls
- Delete option

### Response Time Chart

Visualizes response time trends for all APIs over the last 24 hours.

## API Endpoints

### Dashboard
- `GET /` - Main dashboard page
- `GET /projects` - Projects management page
- `GET /logs` - API logs viewer
- `GET /compare` - API comparison tool

### Project Operations
- `POST /add_project` - Add new project
- `GET /api/projects` - Get all projects
- `GET /api/project/<project_id>/apis` - Get APIs for a project
- `DELETE /api/project/<project_id>` - Delete project

### API Operations
- `POST /add_api` - Add new API to monitor
- `GET /api/apis` - Get all APIs with latest status
- `GET /api/stats` - Get dashboard statistics
- `GET /api/logs/<api_id>` - Get logs for specific API
- `DELETE /api/<api_id>` - Delete API from monitoring
- `POST /api/<api_id>/pause` - Pause/resume API monitoring

### Logs and Comparison
- `GET /api/logs/<api_id>/<hours>` - Get logs for API in last N hours
- `GET /api/compare/<api1_id>/<api2_id>/<hours>` - Compare two APIs over time

## Database Schema

### `projects` Table
```sql
- id (INT, Primary Key)
- name (VARCHAR(255), Unique)
- priority (VARCHAR(20)) - 'Critical', 'Moderate', 'Low'
- responsible_name (VARCHAR(255))
- responsible_email (VARCHAR(255))
- email_subject (VARCHAR(255))
- email_template (TEXT)
- created_at (DATETIME)
```

### `apis` Table
```sql
- id (INT, Primary Key)
- project_id (INT, Foreign Key)
- name (VARCHAR(255))
- url (VARCHAR(500))
- created_at (DATETIME)
- is_paused (BOOLEAN, default FALSE)
- consecutive_failures (INT, default 0)
- last_alert_sent (DATETIME)
```

### `api_logs` Table
```sql
- id (INT, Primary Key)
- api_id (INT, Foreign Key)
- status_code (INT)
- response_time (FLOAT)
- status (VARCHAR(10)) - 'UP' or 'DOWN'
- timestamp (DATETIME)
- error_type (VARCHAR(50)) - 'CONNECTION', 'CLIENT', 'SERVER', 'TIMEOUT'
```

### `notification_logs` Table
```sql
- id (INT, Primary Key)
- project_id (INT, Foreign Key)
- api_id (INT, Foreign Key)
- notification_type (VARCHAR(50))
- recipient_email (VARCHAR(255))
- subject (VARCHAR(255))
- message (TEXT)
- sent_at (DATETIME)
```

## Configuration

### Environment Variables

- `MYSQL_HOST` - MySQL server hostname (default: db)
- `MYSQL_USER` - MySQL username (default: monitor_user)
- `MYSQL_PASSWORD` - MySQL password (default: monitor_pass)
- `MYSQL_DATABASE` - Database name (default: api_monitor)
- `SMTP_SERVER` - SMTP server for email notifications (optional)
- `SMTP_PORT` - SMTP port (default: 587)
- `SMTP_USERNAME` - SMTP username for email sending
- `SMTP_PASSWORD` - SMTP password
- `FROM_EMAIL` - Sender email address for notifications

### Monitoring Settings

- **Monitoring Interval**: 30 seconds (configurable in `app/monitor.py`)
- **Request Timeout**: 10 seconds
- **Successful Status**: HTTP 200
- **Alert Threshold**: 3 consecutive failures trigger email alert
- **Email Cooldown**: 1 hour between alerts for the same API

## Docker Compose Services

### `db` Service
- **Image**: mysql:8.0
- **Port**: 3306
- **Volume**: `mysql_data` (persistent storage)
- **Health Check**: Enabled

### `web` Service
- **Build**: Dockerfile (Flask app)
- **Port**: 5000
- **Depends On**: `db` (with health check)
- **Volumes**: Current directory (development mode)

## Stopping the Application

```bash
# Stop running containers
docker-compose down

# Stop and remove volumes (resets database)
docker-compose down -v
```

## Troubleshooting

### "Connection refused" error
- Wait 15-20 seconds for MySQL to fully initialize
- Check container logs: `docker-compose logs db`

### Email notifications not working
- Ensure SMTP environment variables are set in `docker-compose.yml`
- Check SMTP server credentials and connectivity
- Verify recipient email addresses are valid

### APIs showing as DOWN incorrectly
- Check if the API requires authentication or specific headers
- Verify the URL is accessible from the container
- Review API logs for detailed error information

### Database migration issues
- The app includes automatic schema updates
- If issues persist, manually drop and recreate the database volume
- Check logs for SQLAlchemy errors

### High memory usage
- Monitor background tasks in `app/monitor.py`
- Adjust monitoring intervals if necessary
- Consider increasing container memory limits

### Database connection errors
- Verify MySQL container is running: `docker-compose ps`
- Check environment variables match docker-compose.yml

### No data in logs
- Ensure APIs are correctly added
- Check if monitoring service is running (check Flask logs)
- Verify internet connection to reach target APIs

### Rebuild and restart
```bash
docker-compose down -v
docker-compose up --build
```

## Performance Considerations

- **Database**: MySQL 8.0 with connection pooling
- **Caching**: Flask configured with pool recycling (3600s)
- **Monitoring**: Background scheduler prevents blocking requests
- **Frontend**: Auto-refresh every 10 seconds

## Production Deployment

For production use:

1. Update MySQL credentials in `docker-compose.yml`
2. Set `FLASK_ENV` to `production`
3. Use a reverse proxy (Nginx)
4. Enable SSL/TLS certificates
5. Configure persistent volumes for data
6. Set up proper logging and monitoring
7. Implement backup strategy for MySQL data

## Development

### Local Setup (without Docker)

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Set environment variables
export MYSQL_HOST=localhost
export MYSQL_USER=monitor_user
export MYSQL_PASSWORD=monitor_pass
export MYSQL_DATABASE=api_monitor

# Run Flask app
python app/app.py
```
## Demo link 
Youtube link: https://youtu.be/8NFYV6rOgQU?si=2qY1p4Bn_eDq4klz
## License

This project is provided as-is for educational and commercial use.

## Support

For issues or questions, please check the logs:

```bash
# View Flask app logs
docker-compose logs web

# View MySQL logs
docker-compose logs db

# View all logs
docker-compose logs
```
## 👤 Author

**Ansh Kumar**

- GitHub: https://github.com/theansh99999
- LinkedIn: https://www.linkedin.com/in/anshkumarrai/
- Gmail: work.anshkumarrai.gamil.com
