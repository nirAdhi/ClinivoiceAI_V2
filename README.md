# Clinvoice AI

AI-Powered Clinical Voice Dictation and Documentation Platform

## Features

- 🎤 **Live Voice Dictation** - Real-time speech-to-text transcription
- 🤖 **AI Clinical Notes** - Generate SOAP notes using Google Gemini AI
- 👥 **Patient Management** - Organize patients by domain (Dental, Medical, Veterinary)
- 📊 **Dashboard Analytics** - Track encounters, notes generated, and time saved
- 🔐 **User Authentication** - Secure login with JWT tokens
- 💳 **Subscription Plans** - Stripe integration for payments
- 👑 **Admin Portal** - User management, pricing control, and analytics

## Tech Stack

- **Backend:** Node.js, Express.js
- **Frontend:** React, Vite
- **Database:** MySQL
- **AI:** Google Gemini API
- **Payments:** Stripe

## Prerequisites

- Node.js >= 18.0.0
- MySQL 5.7+
- Google Gemini API Key

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/yourusername/clinivoice-ai.git
cd clinivoice-ai
```

### 2. Install dependencies

```bash
# Install backend dependencies
npm install

# Install frontend dependencies
cd desktop && npm install && cd ..
```

### 3. Configure environment variables

```bash
# Copy example env file
cp .env.example .env

# Edit .env with your values
```

Required environment variables:
```
PORT=3000
NODE_ENV=production
DB_HOST=localhost
DB_PORT=3306
DB_USER=your_db_user
DB_PASSWORD=your_db_password
GEMINI_API_KEY=your_gemini_api_key
JWT_SECRET=your_random_secret_key
```

### 4. Setup database

```bash
# Run the setup script to create tables and default admin user
npm run setup
```

### 5. Build frontend

```bash
npm run build
```

## Running the Application

### Development

```bash
# Start backend server
npm run dev

# In another terminal, start frontend dev server
npm run dev:desktop
```

### Production

```bash
# Build frontend
npm run build

# Start production server
npm start
```

The application will be available at `http://localhost:3000/desktop`

## Default Admin Credentials

- **Username:** `admin`
- **Password:** `Admin@123`

> ⚠️ **Important:** Change the default admin password immediately after first login!

## Project Structure

```
clinivoice-ai/
├── server.js           # Express server entry point
├── database.js         # MySQL database module
├── ai-service.js       # AI/ML service integration
├── middleware/         # Express middleware
│   ├── auth.js        # Authentication middleware
│   ├── stripe.js      # Stripe payment integration
│   └── logger.js      # Logging utility
├── desktop/           # React frontend
│   ├── src/
│   │   ├── components/   # React components
│   │   ├── utils/        # Utility functions
│   │   └── main.jsx      # App entry point
│   ├── public/        # Static assets
│   └── index.html     # HTML template
├── schema.sql         # Database schema
├── .env.example       # Environment template
└── package.json       # Backend dependencies
```

## API Endpoints

### Authentication
- `POST /api/login` - User login
- `POST /api/register` - User registration
- `POST /api/request-password-reset` - Request password reset
- `POST /api/reset-password` - Reset password

### Core Features
- `GET /api/stats/:userId` - Get user statistics
- `GET /api/patients` - Get all patients
- `POST /api/patients` - Create patient
- `GET /api/sessions` - Get all sessions
- `POST /api/generate-note` - Generate AI clinical note

### Admin
- `GET /api/admin/users` - Get all users
- `PUT /api/admin/users/:userId` - Update user
- `DELETE /api/admin/users/:userId` - Delete user
- `GET /api/admin/plans` - Get all plans
- `PUT /api/admin/plans/:planId` - Update plan

### Subscriptions
- `GET /api/plans` - Get active plans
- `GET /api/subscription-status` - Get user subscription
- `POST /api/create-checkout-session` - Create Stripe checkout

## Deployment

### Railway / Heroku

1. Set environment variables in dashboard
2. Set `NODE_ENV=production`
3. Deploy from GitHub

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN cd desktop && npm ci && npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

### PM2 (Recommended for VPS)

```bash
# Install PM2
npm install -g pm2

# Start application
pm2 start server.js --name clinivoice

# Save PM2 config
pm2 save

# Setup startup script
pm2 startup
```

## Security Checklist

- [ ] Change default admin password
- [ ] Set strong JWT_SECRET
- [ ] Enable HTTPS in production
- [ ] Configure CORS properly
- [ ] Set up rate limiting
- [ ] Enable MySQL SSL connections
- [ ] Regular database backups

## License

MIT License

## Support

For issues and feature requests, please create an issue on GitHub.
