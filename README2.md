# HopeTurtles.org Platform

A full-stack Node.js + Express + MySQL platform for tracking autonomous Hope Turtles delivering regenerative aid across global ocean currents.

## Features

- 🌊 Multilingual landing experience (English, Malay, Indonesian, Hebrew, Arabic, German, Chinese) with RTL support
- 🌗 Automatic light/dark theme with manual toggle persisted to `localStorage`
- 🗺️ Mission explorer with status filters and interactive Leaflet map (Mapbox-ready)
- 🐢 Real-time turtle telemetry view with drift route polyline refreshed every 10 seconds
- 🏝️ Success log with photo uploads stored under `public/uploads`
- 🔐 Buwana SSO integration using JWT verification and session storage in MySQL
- 📊 Authenticated dashboard with live stats (Chart.js) and admin CRUD tools for missions, turtles, hubs, boats, and alerts
- ♻️ Optional WebsiteCarbon badge, ASCII turtle animations, and smooth page transitions

## Getting Started

### Prerequisites

- Node.js v22+
- MySQL Server 8+
- Yarn or npm

### Installation

```bash
npm install
```

Create a MySQL database using the schema in `hopeturtle_schema_v1.1.sql`.

### Environment Variables

Copy `.env.example` to `.env` (if present) or create a new `.env` file with the following keys:

```
PORT=3000
HOST=0.0.0.0
DB_HOST=localhost
DB_PORT=3306
DB_USER=your_mysql_user
DB_PASS=your_mysql_password
DB_NAME=hopeturtles
BUWANA_API_URL=https://buwana.ecobricks.org
BUWANA_CLIENT_ID=your_client_id
BUWANA_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
DEFAULT_LANG=en
SUPPORTED_LANGS=en,ms,id,he,ar,de,zh
DEFAULT_THEME=light
SUPPORTED_THEMES=light,dark
MAPBOX_TOKEN=your_mapbox_token
INCLUDE_WEBSITE_CARBON=true
JWT_SECRET=change-me
SESSION_SECRET=change-me
SESSION_COOKIE_NAME=ht.sid
SESSION_COOKIE_DOMAIN=.hopeturtles.org
SESSION_COOKIE_SAMESITE=lax
```

Set `SESSION_COOKIE_DOMAIN` to `.hopeturtles.org` (or your chosen apex domain) so login sessions survive redirects between `www` and root domains. Use `SESSION_COOKIE_SAMESITE=none` if your identity provider posts back to the callback URL and you need the cookie on cross-site requests.

> **Font assets**: add `AlanSans-Variable.woff2` and `Mulish-Variable.woff2` to `public/fonts/` to avoid fallback fonts in production.

### Development

```bash
npm run dev
```

### Production

```bash
npm start
```

## API Overview

| Method | Endpoint               | Description                         |
| ------ | ---------------------- | ----------------------------------- |
| GET    | `/api/missions`        | List missions (status filter)       |
| POST   | `/api/missions`        | Create mission (admin)              |
| PUT    | `/api/missions/:id`    | Update mission (admin)              |
| DELETE | `/api/missions/:id`    | Remove mission (admin)              |
| GET    | `/api/turtles`         | List turtles                        |
| GET    | `/api/telemetry/:id`   | Telemetry readings for a turtle     |
| GET    | `/api/success`         | Recent success entries              |
| POST   | `/api/success`         | Upload new success entry            |
| GET    | `/api/summary`         | Platform totals summary             |
| GET    | `/api/stats`           | Dashboard statistics                |
| GET    | `/auth/login`          | Buwana SSO redirect                 |
| GET    | `/auth/callback`       | Buwana callback + session creation  |
| GET    | `/auth/logout`         | Destroy session                     |

Additional CRUD routes exist for hubs, boats, and alerts (all admin protected).

## Deployment Notes

1. **Build & Install**
   ```bash
   npm install --production
   ```
2. **Systemd/PM2** (example with PM2)
   ```bash
   pm2 start server.js --name hopeturtles --env production
   pm2 save
   ```
3. **NGINX Reverse Proxy**
   ```nginx
   server {
       listen 80;
       server_name hopeturtles.org;

       location / {
           proxy_pass http://127.0.0.1:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```
4. **SSL**: configure Let’s Encrypt (Certbot) with NGINX for HTTPS.

## Verification Checklist

1. Install dependencies: `npm install`
2. Start server: `npm start`
3. Confirm console output: `HopeTurtles.org landing page ready at http://127.0.0.1:3000`

## Project Structure

```
server.js
config/
  env.js
  db.js
controllers/
models/
routes/
views/
public/
README2.md
```

Welcome aboard the Hope Turtle flotilla! 🌍🐢
