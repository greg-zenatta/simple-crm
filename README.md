# Simple CRM

A small local CRM: contacts, deals, and a dashboard. Node.js + Express, the built-in SQLite module (`node:sqlite`), and plain HTML/CSS/JS with no build step.

## Run it

Requires Node.js 22.13 or newer.

```bash
npm install && npm start
```

Then open http://localhost:3000

The database (`crm.db`) is created and seeded with 15 contacts and 8 deals on first run. To wipe it and start fresh with the seed data, run `npm run reset`. To use a different port: `PORT=4000 npm start`.
