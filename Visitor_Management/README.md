# Breakthru.ai Visitor Management System

## Quick Start

```bash
cd backend
npm install
npm run dev
```

Open: http://localhost:3001

## Structure
```
Visitor_Management/
├── backend/
│   ├── config/db.js          — PostgreSQL connection pool
│   ├── middleware/validate.js — Request validation helpers
│   ├── routes/
│   │   ├── visits.js         — Full visit lifecycle (register/activate/checkout/pdf/badge)
│   │   ├── appointments.js   — Appointment scheduling
│   │   ├── hosts.js          — Host management
│   │   ├── rfid.js           — RFID card pool management
│   │   ├── dashboard.js      — Reports & statistics
│   │   └── otp.js            — OTP email verification
│   ├── services/
│   │   ├── emailService.js   — Nodemailer (OTP + host notification)
│   │   └── telegramService.js— Telegram bot notifications
│   ├── server.js             — Express app entry point
│   ├── schema.sql            — PostgreSQL schema (run once)
│   ├── package.json
│   └── .env                  — DB + SMTP + Telegram credentials
└── frontend/
    ├── vms_fixed.html        — Main SPA (single-page app)
    ├── api-bridge.js         — Frontend ↔ Backend API layer
    ├── index.html            — Entry redirect
    └── serve.js              — Optional standalone static server
```

## Database Setup
1. Open pgAdmin, connect to your PostgreSQL server
2. Run `backend/schema.sql` in the Query Tool
3. The schema is idempotent — safe to run on existing databases

## Environment Variables (`backend/.env`)
```
PORT=3001
PG_HOST=<host>
PG_PORT=<port>
PG_DATABASE=vms_db
PG_USER=postgres
PG_PASSWORD=<password>
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USER=<email>
MAIL_PASS=<app-password>
MAIL_FROM=<from-address>
TELEGRAM_BOT_TOKEN=<token>
TELEGRAM_CHAT_ID=<chat-id>
```

## Key Features
- **Registration Flow**: Multi-step form → OTP verification → Host approval
- **Check-in**: RFID card assignment OR QR badge (digital)
- **Check-out**: Manual or via QR badge scan page
- **PDF Badge**: Downloads as `visitor_name_YYYY-MM-DD.pdf`
- **Auto-close**: Unchecked visitors auto-closed at 18:30 daily
- **Telegram + Email**: Host notified on visitor arrival with approve/deny links

## Status Flow
```
registered → (host approves) → active → completed
                              ↑
                  RFID card or QR badge assigned at check-in
```
