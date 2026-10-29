const state = { meta: null, contacts: [], deals: [] };

const $ = (sel) => document.querySelector(sel);
const view = $('#view');

const STAGE_COLORS = {
  Qualification: '#3b82f6',
  Proposal: '#8b5cf6',
  Negotiation: '#f59e0b',
  'Closed Won': '#22c55e',
  'Closed Lost': '#ef4444',
};
const AVATAR_COLORS = ['#6366f1', '#0ea5e9', '#14b8a6', '#f59e0b', '#ec4899', '#8b5cf6', '#22c55e', '#f97316'];

// Helpers
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
const money = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);
const slug = (s) => String(s).toLowerCase().replace(/\s+/g, '-');
const badge = (text) => `<span class="badge badge-${slug(text)}">${esc(text)}</span>`;
function formatDate(iso) {
  if (!iso) return '<span class="muted">None</span>';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function avatar(name) {
  const initials = name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  const color = AVATAR_COLORS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length];
  return `<span class="avatar" style="background:${color}">${esc(initials)}</span>`;
}

async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2200);
}

function setHeader(title, subtitle, actionsHtml = '') {
  $('#page-title').textContent = title;
  $('#page-subtitle').textContent = subtitle;
  $('#page-actions').innerHTML = actionsHtml;
  document.title = `${title} · Simple CRM`;
}

// Modal form
const modal = {
  open({ title, fields, values = {}, onSubmit, onDelete }) {
    $('#modal-title').textContent = title;
    $('#modal-error').textContent = '';
    $('#modal-body').innerHTML = fields.map((f) => fieldHtml(f, values[f.name])).join('');
    const del = $('#modal-delete');
    del.classList.toggle('hidden', !onDelete);
    del.onclick = onDelete ? () => onDelete() : null;
    this.onSubmit = onSubmit;
    $('#modal').classList.remove('hidden');
    setTimeout(() => $('#modal-body input, #modal-body select')?.focus(), 30);
  },
  close() {
    $('#modal').classList.add('hidden');
  },
  error(msg) {
    $('#modal-error').textContent = msg;
  },
};

function fieldHtml(f, value) {
  const cls = f.full ? 'field full' : 'field';
  const id = `f-${f.name}`;
  let input;
  if (f.type === 'select') {
    const opts = f.options
      .map((o) => {
        const [val, label] = typeof o === 'object' ? [o.value, o.label] : [o, o];
        return `<option value="${esc(val)}" ${String(val) === String(value ?? '') ? 'selected' : ''}>${esc(label)}</option>`;
      })
      .join('');
    input = `<select id="${id}" name="${f.name}">${opts}</select>`;
  } else {
    const extra = f.type === 'number' ? 'min="0" step="any"' : '';
    input = `<input id="${id}" name="${f.name}" type="${f.type || 'text'}" value="${esc(value)}" placeholder="${esc(f.placeholder || '')}" ${f.required ? 'required' : ''} ${extra}>`;
  }
  return `<div class="${cls}"><label for="${id}">${esc(f.label)}</label>${input}</div>`;
}

$('#modal-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target));
  const btn = $('#modal-submit');
  btn.disabled = true;
  try {
    await modal.onSubmit(data);
    modal.close();
  } catch (err) {
    modal.error(err.message);
  } finally {
    btn.disabled = false;
  }
});
document.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', () => modal.close()));
document.addEventListener('keydown', (e) => e.key === 'Escape' && modal.close());

// Dashboard
async function renderDashboard() {
  setHeader('Dashboard', 'A quick snapshot of your pipeline.');
  const d = await api('/dashboard');
  const maxCount = Math.max(1, ...d.byStage.map((s) => s.count));

  view.innerHTML = `
    <div class="stats">
      <div class="card stat">
        <div class="stat-label">Total Contacts</div>
        <div class="stat-value">${d.totalContacts}</div>
        <div class="stat-sub">People in your CRM</div>
      </div>
      <div class="card stat">
        <div class="stat-label">Open Deal Value</div>
        <div class="stat-value">${money(d.openDealValue)}</div>
        <div class="stat-sub">${d.openDealCount} open deal${d.openDealCount === 1 ? '' : 's'}</div>
      </div>
      <div class="card stat">
        <div class="stat-label">Closed Won</div>
        <div class="stat-value">${money(d.wonValue)}</div>
        <div class="stat-sub">Revenue from won deals</div>
      </div>
    </div>
    <div class="grid-2">
      <div class="card">
        <div class="card-head"><h3>Deals by Stage</h3><a href="#/deals">View all</a></div>
        <div class="stage-list">
          ${d.byStage
            .map(
              (s) => `
            <div class="stage-row">
              <div class="stage-row-top">
                <span>${esc(s.stage)}</span>
                <span class="muted">${s.count} deal${s.count === 1 ? '' : 's'} · ${money(s.value)}</span>
              </div>
              <div class="bar"><div style="width:${(s.count / maxCount) * 100}%;background:${STAGE_COLORS[s.stage]}"></div></div>
            </div>`
            )
            .join('')}
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Recent Deals</h3><a href="#/deals">View all</a></div>
        <div class="table-wrap">
          <table>
            <tbody>
              ${
                d.recentDeals.length
                  ? d.recentDeals
                      .map(
                        (deal) => `
                <tr onclick="location.hash='#/deals'">
                  <td><div style="font-weight:600">${esc(deal.name)}</div><div class="muted" style="font-size:12px">${esc(deal.contact_name || 'No contact')}</div></td>
                  <td>${badge(deal.stage)}</td>
                  <td class="num">${money(deal.amount)}</td>
                </tr>`
                      )
                      .join('')
                  : '<tr><td class="empty">No deals yet.</td></tr>'
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
}

// Contacts
const contactFields = () => [
  { name: 'name', label: 'Full name', required: true, full: true, placeholder: 'Jane Doe' },
  { name: 'company', label: 'Company', placeholder: 'Example Corp' },
  { name: 'status', label: 'Status', type: 'select', options: state.meta.contactStatuses },
  { name: 'email', label: 'Email', type: 'email', placeholder: 'jane@example.com' },
  { name: 'phone', label: 'Phone', type: 'tel', placeholder: '(555) 555-0100' },
];

async function renderContacts() {
  setHeader('Contacts', 'Everyone you do business with.', '<button class="btn btn-primary" id="add-contact">+ Add Contact</button>');
  $('#add-contact').onclick = () => openContactForm();
  state.contacts = await api('/contacts');

  view.innerHTML = `
    <div class="card">
      <div class="toolbar">
        <input class="search" id="contact-search" placeholder="Search contacts...">
        <select id="contact-filter">
          <option value="">All statuses</option>
          ${state.meta.contactStatuses.map((s) => `<option>${esc(s)}</option>`).join('')}
        </select>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Company</th><th>Email</th><th>Phone</th><th>Status</th></tr></thead>
          <tbody id="contact-rows"></tbody>
        </table>
      </div>
    </div>`;

  const draw = () => {
    const q = $('#contact-search').value.toLowerCase();
    const status = $('#contact-filter').value;
    const rows = state.contacts.filter(
      (c) =>
        (!status || c.status === status) &&
        [c.name, c.company, c.email, c.phone].some((v) => (v || '').toLowerCase().includes(q))
    );
    $('#contact-rows').innerHTML = rows.length
      ? rows
          .map(
            (c) => `
        <tr data-id="${c.id}">
          <td><div class="person">${avatar(c.name)}${esc(c.name)}</div></td>
          <td>${esc(c.company)}</td>
          <td class="muted">${esc(c.email)}</td>
          <td class="muted">${esc(c.phone)}</td>
          <td>${badge(c.status)}</td>
        </tr>`
          )
          .join('')
      : '<tr><td colspan="5" class="empty">No contacts found.</td></tr>';
  };
  $('#contact-search').oninput = draw;
  $('#contact-filter').onchange = draw;
  $('#contact-rows').onclick = (e) => {
    const row = e.target.closest('tr[data-id]');
    if (row) openContactForm(state.contacts.find((c) => c.id === Number(row.dataset.id)));
  };
  draw();
}

function openContactForm(contact) {
  modal.open({
    title: contact ? 'Edit Contact' : 'Add Contact',
    fields: contactFields(),
    values: contact || { status: 'Lead' },
    onSubmit: async (data) => {
      if (contact) await api(`/contacts/${contact.id}`, { method: 'PUT', body: data });
      else await api('/contacts', { method: 'POST', body: data });
      toast(contact ? 'Contact updated' : 'Contact added');
      renderContacts();
    },
    onDelete: contact
      ? async () => {
          if (!confirm(`Delete ${contact.name}? Their deals will be kept but unlinked.`)) return;
          await api(`/contacts/${contact.id}`, { method: 'DELETE' });
          modal.close();
          toast('Contact deleted');
          renderContacts();
        }
      : null,
  });
}

// Deals
async function renderDeals() {
  setHeader('Deals', 'Track opportunities through your pipeline.', '<button class="btn btn-primary" id="add-deal">+ Add Deal</button>');
  $('#add-deal').onclick = () => openDealForm();
  [state.deals, state.contacts] = await Promise.all([api('/deals'), api('/contacts')]);

  view.innerHTML = `
    <div class="card">
      <div class="toolbar">
        <input class="search" id="deal-search" placeholder="Search deals...">
        <select id="deal-filter">
          <option value="">All stages</option>
          ${state.meta.dealStages.map((s) => `<option>${esc(s)}</option>`).join('')}
        </select>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Deal Name</th><th>Contact</th><th class="num">Amount</th><th>Stage</th><th>Close Date</th></tr></thead>
          <tbody id="deal-rows"></tbody>
        </table>
      </div>
    </div>`;

  const draw = () => {
    const q = $('#deal-search').value.toLowerCase();
    const stage = $('#deal-filter').value;
    const rows = state.deals.filter(
      (d) =>
        (!stage || d.stage === stage) &&
        [d.name, d.contact_name, d.contact_company].some((v) => (v || '').toLowerCase().includes(q))
    );
    $('#deal-rows').innerHTML = rows.length
      ? rows
          .map(
            (d) => `
        <tr data-id="${d.id}">
          <td style="font-weight:600">${esc(d.name)}</td>
          <td>${d.contact_name ? `<div class="person">${avatar(d.contact_name)}<span style="font-weight:500">${esc(d.contact_name)}</span></div>` : '<span class="muted">None</span>'}</td>
          <td class="num">${money(d.amount)}</td>
          <td>${badge(d.stage)}</td>
          <td>${formatDate(d.close_date)}</td>
        </tr>`
          )
          .join('')
      : '<tr><td colspan="5" class="empty">No deals found.</td></tr>';
  };
  $('#deal-search').oninput = draw;
  $('#deal-filter').onchange = draw;
  $('#deal-rows').onclick = (e) => {
    const row = e.target.closest('tr[data-id]');
    if (row) openDealForm(state.deals.find((d) => d.id === Number(row.dataset.id)));
  };
  draw();
}

function openDealForm(deal) {
  const contactOptions = [{ value: '', label: 'No contact' }].concat(
    state.contacts.map((c) => ({ value: c.id, label: c.company ? `${c.name} (${c.company})` : c.name }))
  );
  modal.open({
    title: deal ? 'Edit Deal' : 'Add Deal',
    fields: [
      { name: 'name', label: 'Deal name', required: true, full: true, placeholder: 'New website project' },
      { name: 'contact_id', label: 'Contact', type: 'select', options: contactOptions, full: true },
      { name: 'amount', label: 'Amount (USD)', type: 'number', required: true, placeholder: '10000' },
      { name: 'stage', label: 'Stage', type: 'select', options: state.meta.dealStages },
      { name: 'close_date', label: 'Expected close date', type: 'date', full: true },
    ],
    values: deal || { stage: 'Qualification' },
    onSubmit: async (data) => {
      if (deal) await api(`/deals/${deal.id}`, { method: 'PUT', body: data });
      else await api('/deals', { method: 'POST', body: data });
      toast(deal ? 'Deal updated' : 'Deal added');
      renderDeals();
    },
    onDelete: deal
      ? async () => {
          if (!confirm(`Delete the deal "${deal.name}"?`)) return;
          await api(`/deals/${deal.id}`, { method: 'DELETE' });
          modal.close();
          toast('Deal deleted');
          renderDeals();
        }
      : null,
  });
}

// Router
const routes = { '': renderDashboard, contacts: renderContacts, deals: renderDeals };

async function router() {
  const key = location.hash.replace(/^#\/?/, '').split('/')[0];
  const render = routes[key] || renderDashboard;
  const active = key && routes[key] ? key : 'dashboard';
  document.querySelectorAll('.sidebar nav a').forEach((a) => a.classList.toggle('active', a.dataset.route === active));
  modal.close();
  try {
    await render();
  } catch (err) {
    view.innerHTML = `<div class="card empty">Could not load data: ${esc(err.message)}</div>`;
  }
}

(async function init() {
  state.meta = await api('/meta');
  window.addEventListener('hashchange', router);
  router();
})();
