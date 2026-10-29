const path = require('path');
const express = require('express');

let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch {
  console.error('This app needs Node.js 22.13 or newer (it uses the built-in node:sqlite module).');
  process.exit(1);
}

const PORT = process.env.PORT || 3000;
const db = new DatabaseSync(path.join(__dirname, 'crm.db'));

const CONTACT_STATUSES = ['Lead', 'Prospect', 'Customer', 'Inactive'];
const DEAL_STAGES = ['Qualification', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost'];

db.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    company TEXT,
    email TEXT,
    phone TEXT,
    status TEXT NOT NULL DEFAULT 'Lead'
  );
  CREATE TABLE IF NOT EXISTS deals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
    amount REAL NOT NULL DEFAULT 0,
    stage TEXT NOT NULL DEFAULT 'Qualification',
    close_date TEXT
  );
`);

seedIfEmpty();

function seedIfEmpty() {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM contacts').get();
  if (n > 0) return;

  const contacts = [
    ['Avery Quill', 'Lumenfield Robotics', 'Customer'],
    ['Benjamin Marsh', 'Copperleaf Bakery Co.', 'Prospect'],
    ['Clara Fenwick', 'Northwind Kites', 'Lead'],
    ['Dmitri Hollow', 'Bluepine Analytics', 'Customer'],
    ['Elena Brightwater', 'Starling & Finch Legal', 'Prospect'],
    ['Felix Okonkwo', 'Granite Peak Outfitters', 'Lead'],
    ['Grace Thimbleton', 'Puddleduck Software', 'Customer'],
    ['Hiro Tanabe', 'Moonbeam Logistics', 'Prospect'],
    ['Isla Pemberton', 'Velvet Fern Studios', 'Inactive'],
    ['Jonah Whitlock', 'Acme Widget Works', 'Lead'],
    ['Keira Lindqvist', 'Fogbank Solar', 'Customer'],
    ['Leo Castellano', 'Tumbleweed Media', 'Prospect'],
    ['Maya Rosewood', 'Quarry Lane Dental', 'Lead'],
    ['Nico Albright', 'Paperplane Payments', 'Customer'],
    ['Olive Drummond', 'Riverbend Farms Cooperative', 'Inactive'],
  ];
  const insertContact = db.prepare(
    'INSERT INTO contacts (name, company, email, phone, status) VALUES (?, ?, ?, ?, ?)'
  );
  contacts.forEach(([name, company, status], i) => {
    const email = name.toLowerCase().replace(/[^a-z ]/g, '').replace(' ', '.') + '@example.com';
    const phone = `(555) 555-${String(101 + i * 7).padStart(4, '0')}`;
    insertContact.run(name, company, email, phone, status);
  });

  const deals = [
    ['Lumenfield Fleet Automation', 1, 48000, 'Negotiation', '2026-11-20'],
    ['Copperleaf POS Rollout', 2, 12500, 'Proposal', '2026-12-05'],
    ['Bluepine Data Warehouse', 4, 86000, 'Closed Won', '2026-09-30'],
    ['Starling Case Management', 5, 23000, 'Qualification', '2027-01-15'],
    ['Puddleduck Annual Renewal', 7, 18000, 'Closed Won', '2026-10-01'],
    ['Moonbeam Route Optimizer', 8, 54000, 'Proposal', '2026-12-18'],
    ['Fogbank Field Service App', 11, 31500, 'Negotiation', '2026-11-30'],
    ['Paperplane Billing Migration', 14, 9500, 'Closed Lost', '2026-08-22'],
  ];
  const insertDeal = db.prepare(
    'INSERT INTO deals (name, contact_id, amount, stage, close_date) VALUES (?, ?, ?, ?, ?)'
  );
  deals.forEach((d) => insertDeal.run(...d));
  console.log('Seeded database with 15 contacts and 8 deals.');
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function clean(value) {
  return typeof value === 'string' ? value.trim() : value ?? null;
}

function validateContact(body) {
  const c = {
    name: clean(body.name),
    company: clean(body.company) || '',
    email: clean(body.email) || '',
    phone: clean(body.phone) || '',
    status: clean(body.status) || 'Lead',
  };
  if (!c.name) return { error: 'Name is required.' };
  if (!CONTACT_STATUSES.includes(c.status)) return { error: 'Invalid status.' };
  return { value: c };
}

function validateDeal(body) {
  const amount = Number(body.amount);
  const contactId = body.contact_id ? Number(body.contact_id) : null;
  const d = {
    name: clean(body.name),
    contact_id: contactId,
    amount,
    stage: clean(body.stage) || 'Qualification',
    close_date: clean(body.close_date) || null,
  };
  if (!d.name) return { error: 'Deal name is required.' };
  if (!Number.isFinite(amount) || amount < 0) return { error: 'Amount must be a positive number.' };
  if (!DEAL_STAGES.includes(d.stage)) return { error: 'Invalid stage.' };
  if (contactId && !db.prepare('SELECT 1 FROM contacts WHERE id = ?').get(contactId)) {
    return { error: 'Selected contact does not exist.' };
  }
  return { value: d };
}

// Meta
app.get('/api/meta', (req, res) => {
  res.json({ contactStatuses: CONTACT_STATUSES, dealStages: DEAL_STAGES });
});

// Contacts
app.get('/api/contacts', (req, res) => {
  res.json(db.prepare('SELECT * FROM contacts ORDER BY name COLLATE NOCASE').all());
});

app.post('/api/contacts', (req, res) => {
  const { value, error } = validateContact(req.body);
  if (error) return res.status(400).json({ error });
  const info = db
    .prepare('INSERT INTO contacts (name, company, email, phone, status) VALUES (?, ?, ?, ?, ?)')
    .run(value.name, value.company, value.email, value.phone, value.status);
  res.status(201).json(db.prepare('SELECT * FROM contacts WHERE id = ?').get(info.lastInsertRowid));
});

app.put('/api/contacts/:id', (req, res) => {
  const { value, error } = validateContact(req.body);
  if (error) return res.status(400).json({ error });
  const info = db
    .prepare('UPDATE contacts SET name = ?, company = ?, email = ?, phone = ?, status = ? WHERE id = ?')
    .run(value.name, value.company, value.email, value.phone, value.status, req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Contact not found.' });
  res.json(db.prepare('SELECT * FROM contacts WHERE id = ?').get(req.params.id));
});

app.delete('/api/contacts/:id', (req, res) => {
  const info = db.prepare('DELETE FROM contacts WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Contact not found.' });
  res.status(204).end();
});

// Deals
const DEAL_SELECT = `
  SELECT d.*, c.name AS contact_name, c.company AS contact_company
  FROM deals d LEFT JOIN contacts c ON c.id = d.contact_id
`;

app.get('/api/deals', (req, res) => {
  res.json(db.prepare(`${DEAL_SELECT} ORDER BY d.close_date IS NULL, d.close_date`).all());
});

app.post('/api/deals', (req, res) => {
  const { value, error } = validateDeal(req.body);
  if (error) return res.status(400).json({ error });
  const info = db
    .prepare('INSERT INTO deals (name, contact_id, amount, stage, close_date) VALUES (?, ?, ?, ?, ?)')
    .run(value.name, value.contact_id, value.amount, value.stage, value.close_date);
  res.status(201).json(db.prepare(`${DEAL_SELECT} WHERE d.id = ?`).get(info.lastInsertRowid));
});

app.put('/api/deals/:id', (req, res) => {
  const { value, error } = validateDeal(req.body);
  if (error) return res.status(400).json({ error });
  const info = db
    .prepare('UPDATE deals SET name = ?, contact_id = ?, amount = ?, stage = ?, close_date = ? WHERE id = ?')
    .run(value.name, value.contact_id, value.amount, value.stage, value.close_date, req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Deal not found.' });
  res.json(db.prepare(`${DEAL_SELECT} WHERE d.id = ?`).get(req.params.id));
});

app.delete('/api/deals/:id', (req, res) => {
  const info = db.prepare('DELETE FROM deals WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Deal not found.' });
  res.status(204).end();
});

// Dashboard
app.get('/api/dashboard', (req, res) => {
  const totalContacts = db.prepare('SELECT COUNT(*) AS n FROM contacts').get().n;
  const openDeals = db
    .prepare(
      "SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS total FROM deals WHERE stage NOT IN ('Closed Won', 'Closed Lost')"
    )
    .get();
  const wonValue = db
    .prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM deals WHERE stage = 'Closed Won'")
    .get().total;
  const rows = db.prepare('SELECT stage, COUNT(*) AS count, SUM(amount) AS value FROM deals GROUP BY stage').all();
  const byStage = DEAL_STAGES.map((stage) => {
    const row = rows.find((r) => r.stage === stage);
    return { stage, count: row ? row.count : 0, value: row ? row.value : 0 };
  });
  const recentDeals = db.prepare(`${DEAL_SELECT} ORDER BY d.id DESC LIMIT 5`).all();
  res.json({
    totalContacts,
    openDealCount: openDeals.n,
    openDealValue: openDeals.total,
    wonValue,
    byStage,
    recentDeals,
  });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log(`Simple CRM running at http://localhost:${PORT}`);
});
