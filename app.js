// ─── Constants ───────────────────────────────────────────────────────────────

const STORAGE_KEY = 'fintrack_v1';

const CAT_EMOJI = {
  'Alimentação': '🍽️', 'Transporte': '🚗', 'Assinaturas': '🔄',
  'Saúde': '💊', 'Lazer': '🎉', 'Moradia': '🏠',
  'Educação': '📚', 'Vestuário': '👕', 'PIX': '⇄', 'PIX': '↔️',
  'Receita': '💰', 'Outros': '•', 'Compras': '🛍️',
  'Pet': '🐾', 'Telefone': '📱', 'Feira': '🥬',
  'MEI': '🏢', 'Coleção': '📦', 'Empréstimo': '🤝',
  'Cartão de Crédito': '💳',
};
function catEmoji(cat) { return CAT_EMOJI[cat] || '•'; }

const DEFAULT_CAT_COLORS = {
  'Alimentação': '#D85A30', 'Transporte': '#378ADD', 'Assinaturas': '#7F77DD',
  'Saúde': '#1D9E75', 'Lazer': '#D4537E', 'Moradia': '#BA7517',
  'Educação': '#185FA5', 'Vestuário': '#993556', 'PIX': '#888780',
  'Receita': '#1a7a52', 'Outros': '#888780',
};

const BASE_CATS = Object.keys(DEFAULT_CAT_COLORS);
const CAT_COLORS = new Proxy({}, {
  get(_, cat) {
    return (state?.catColors && state.catColors[cat]) || DEFAULT_CAT_COLORS[cat] || '#888';
  }
});

// ─── State ────────────────────────────────────────────────────────────────────

let state = {
  transactions: [],
  customCats: [],
  catColors: {},
  budgets: [],
  rules: [],
  savedTotal: 0,
  goalTotal: 10000,
  itauBase: 0,
  nextId: 1,
  lastSaved: null,
};

let editingId = null;
let activePeriod = '30d';
let activeType = 'all';
let activeCat = '';

// ─── Storage ──────────────────────────────────────────────────────────────────



// ─── Persistence ─────────────────────────────────────────────────────────────

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state = { ...state, ...parsed };
    }
  } catch(e) {
    console.warn('Erro ao carregar dados:', e);
  }
  document.getElementById('meta-goal-input').value = state.goalTotal || 10000;
  document.getElementById('meta-saved-input').value = state.savedTotal || 0;
  updateSaveStatus();
  if (state.transactions.length > 0) {
    document.getElementById('clear-btn').style.display = 'inline-flex';
  }
}

function saveState() {
  try {
    state.lastSaved = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    updateSaveStatus();
    showSaveIndicator();
  } catch(e) {
    console.warn('Erro ao salvar:', e);
  }
}

function updateSaveStatus() {
  if (!state.lastSaved) return;
  const d = new Date(state.lastSaved);
  const dateStr = d.toLocaleDateString('pt-BR');
  const timeStr = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  document.getElementById('save-status').textContent = `salvo em ${dateStr} às ${timeStr}`;
}

function showSaveIndicator() {
  const el = document.getElementById('save-status');
  el.style.color = 'var(--green)';
  el.textContent = '✓ salvo';
  setTimeout(() => { updateSaveStatus(); el.style.color = ''; }, 2000);
}

function clearAll() {
  if (!confirm('Apagar todas as transações e configurações? Esta ação não pode ser desfeita.')) return;
  localStorage.removeItem(STORAGE_KEY);
  state = { transactions: [], customCats: [], savedTotal: 0, goalTotal: 10000, nextId: 1, lastSaved: null };
  document.getElementById('meta-goal-input').value = 10000;
  document.getElementById('meta-saved-input').value = 0;
  document.getElementById('save-status').textContent = '';
  document.getElementById('clear-btn').style.display = 'none';
  render();
  toast('Dados apagados');
}

// ─── Formatting ───────────────────────────────────────────────────────────────

function fmt(v) {
  return 'R$ ' + Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseBrVal(str) {
  if (!str) return 0;
  str = str.toString().trim().replace(/"/g, '');
  const neg = str.startsWith('-');
  str = str.replace(/[^\d,\.]/g, '');
  if (str.includes(',') && str.includes('.')) {
    str = str.indexOf('.') < str.indexOf(',') ? str.replace(/\./g, '').replace(',', '.') : str.replace(/,/g, '');
  } else if (str.includes(',')) {
    str = str.replace(',', '.');
  }
  const v = parseFloat(str) || 0;
  return neg ? -v : v;
}

function parseDate(str) {
  if (!str) return null;
  str = str.trim().replace(/"/g, '');
  // DD/MM/YYYY or DD/MM/YY or DD/MM
  const parts = str.split('/');
  if (parts.length >= 2) {
    const d = parseInt(parts[0]);
    const m = parseInt(parts[1]) - 1;
    const y = parts[2] ? (parts[2].length === 2 ? 2000 + parseInt(parts[2]) : parseInt(parts[2])) : new Date().getFullYear();
    return new Date(y, m, d);
  }
  return null;
}

function formatDate(dateStr) {
  const d = parseDate(dateStr);
  if (!d) return dateStr;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

// ─── Period filtering ─────────────────────────────────────────────────────────

function getDateRange(period) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (period) {
    case '7d': return new Date(today - 7 * 86400000);
    case '30d': return new Date(today - 30 * 86400000);
    case 'week': {
      const d = new Date(today);
      d.setDate(d.getDate() - d.getDay());
      return d;
    }
    case 'month': return new Date(today.getFullYear(), today.getMonth(), 1);
    case 'all': return new Date(2000, 0, 1);
    default: return new Date(today - 30 * 86400000);
  }
}

function inPeriod(tx, period) {
  const d = parseDate(tx.date);
  if (!d) return true;
  if (period === 'all') return true;
  if (period === 'custom') {
    const fromEl = document.getElementById('date-from');
    const toEl = document.getElementById('date-to');
    const from = fromEl?.value ? new Date(fromEl.value + 'T00:00:00') : null;
    const to = toEl?.value ? new Date(toEl.value + 'T23:59:59') : null;
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  }
  return d >= getDateRange(period);
}

// ─── Category helpers ─────────────────────────────────────────────────────────

function allCats() {
  const set = new Set([...BASE_CATS, ...state.customCats, ...state.transactions.map(t => t.cat)]);
  return [...set];
}

function guessCategory(name) {
  const n = name.toLowerCase();
  if (/ifood|rappi|mercado|super\s?merc|padaria|restaurante|lanche|pizza|açai|acai|hamburger|subway|mcdonald|burger/.test(n)) return 'Alimentação';
  if (/uber|99pop|cabify|taxi|gasolina|combustivel|posto|shell|petrobras|onibus|metro|ônibus/.test(n)) return 'Transporte';
  if (/netflix|spotify|amazon\s?prime|youtube|disney|hbo|deezer|apple\s?one|globoplay|paramount/.test(n)) return 'Assinaturas';
  if (/farmacia|drogasil|ultrafarma|remedio|hospital|clinica|plano\s?saude|unimed|amil|sulamerica/.test(n)) return 'Saúde';
  if (/cinema|teatro|show|ingresso|bar\s|balada|lazer|viagem|hotel|airbnb/.test(n)) return 'Lazer';
  if (/aluguel|condominio|condomínio|energia|luz\s|agua\s|água\s|internet|net\s|vivo\s|claro\s/.test(n)) return 'Moradia';
  if (/escola|faculdade|curso|udemy|alura|livro|livraria/.test(n)) return 'Educação';
  if (/salario|salário|pagamento\s?recebido|credito\s?em\s?conta|freelance|honorario/.test(n)) return 'Receita';
  if (/pix\s*[\d\*]/.test(n)) return 'PIX';
  return 'Outros';
}

// ─── Parsers ──────────────────────────────────────────────────────────────────

function isDuplicate(tx) {
  return state.transactions.some(t =>
    t.rawName === tx.rawName && t.date === tx.date && Math.abs(t.val - tx.val) < 0.01
  );
}

function parseItauCSV(text) {
  // Itaú exports .xls — browser reads as HTML table or tab-separated
  // Try multiple formats: tab-separated, semicolon, or HTML table rows
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const txs = [];

  // Find the data header row (contains "data" and "lançamento")
  let dataStart = -1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].toLowerCase();
    if ((l.includes('data') && l.includes('lan')) || l.includes('lançamento')) {
      dataStart = i + 2; // skip header + "lançamentos" label row
      break;
    }
  }
  if (dataStart === -1) dataStart = 0;

  for (let i = dataStart; i < lines.length; i++) {
    const line = lines[i];
    // Try tab first (XLS often exports as TSV), then semicolon, then comma
    let parts = line.split('\t');
    if (parts.length < 3) parts = line.split(';');
    if (parts.length < 3) parts = line.split(',');

    const date = parts[0]?.trim().replace(/"/g, '');
    if (!date || !/^\d{2}\/\d{2}/.test(date)) continue;

    const rawName = parts[1]?.trim().replace(/"/g, '') || 'Transação';

    // Skip saldo lines
    if (/saldo/i.test(rawName)) continue;

    // Value is col index 3 for XLS format (data, name, ag, value)
    // Fall back to col 2 for simple CSV
    let valStr = parts.length >= 4 ? parts[3] : parts[2];
    const val = parseBrVal(valStr);
    if (!val) continue;

    // Clean name: remove trailing date suffix like "01/05" or "MARIANA01/05"
    const cleanName = rawName.replace(/\s*\d{2}\/\d{2}$/, '').trim();

    const txDateCSV = parseDate(date.length === 5 ? date + '/' + new Date().getFullYear() : date);
    if (txDateCSV && txDateCSV > new Date()) continue;
    txs.push({
      id: state.nextId++,
      date: date.length === 5 ? date + '/' + new Date().getFullYear() : date,
      name: cleanName,
      rawName: cleanName,
      cat: guessCategory(cleanName),
      val,
      src: 'Itaú',
    });
  }
  return txs;
}

function parseItauXLS(arrayBuffer) {
  // Parse XLS binary using SheetJS (if available) or fallback to text
  try {
    if (typeof XLSX !== 'undefined') {
      const wb = XLSX.read(arrayBuffer, { type: 'array' });
      const ws = wb.Sheets['Lançamentos'] || wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
      const txs = [];

      // Find header row
      let headerIdx = -1;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (r && String(r[0]).toLowerCase().trim() === 'data') {
          headerIdx = i;
          break;
        }
      }
      if (headerIdx === -1) return [];

      let saldoAnterior = null;
      for (let i = headerIdx + 2; i < rows.length; i++) {
        const row = rows[i];
        if (!row || !row[0]) continue;
        const date = String(row[0]).trim();
        if (!/^\d{2}\/\d{2}/.test(date)) continue;
        const rawName = String(row[1] || '').trim();

        // Capture SALDO ANTERIOR (col 4 = saldos)
        if (/saldo anterior/i.test(rawName)) {
          const s = typeof row[4] === 'number' ? row[4] : parseBrVal(String(row[4] || ''));
          if (s) saldoAnterior = s;
          continue;
        }
        if (/saldo/i.test(rawName)) continue;

        const val = typeof row[3] === 'number' ? row[3] : parseBrVal(String(row[3] || ''));
        if (!val) continue;
        const cleanName = rawName.replace(/\s*\d{2}\/\d{2}$/, '').trim();
        // Skip future transactions
        const txDate = parseDate(date);
        if (txDate && txDate > new Date()) continue;
        // Try to extract time from col 2 (ag./origem sometimes has HH:MM)
        const timeRaw = String(row[2] || '').trim();
        const timeMatch = timeRaw.match(/\d{2}:\d{2}/);
        txs.push({
          id: state.nextId++,
          date,
          name: cleanName,
          rawName: cleanName,
          cat: guessCategory(cleanName),
          val,
          src: 'Itaú',
          time: timeMatch ? timeMatch[0] : null,
        });
      }
      if (saldoAnterior !== null) txs._saldoAnterior = saldoAnterior;
      return txs;
    }
  } catch(e) {
    console.warn('SheetJS parse failed, falling back to text:', e);
  }
  return null; // signal fallback to text
}

function parseInterCSV(text) {
  // Remove BOM if present
  text = text.replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const txs = [];

  // Inter format: "Data","Lançamento","Categoria","Tipo","Valor"
  const interCatMap = {
    'TRANSPORTE': 'Transporte', 'SUPERMERCADO': 'Alimentação', 'RESTAURANTES': 'Alimentação',
    'SAUDE': 'Saúde', 'ENSINO': 'Educação', 'ENTRETENIMENTO': 'Lazer',
    'VIAGEM': 'Lazer', 'COMPRAS': 'Outros', 'SERVICOS': 'Assinaturas',
    'VESTUARIO': 'Vestuário', 'PETSHOP': 'Saúde', 'OUTROS': 'Outros',
  };

  for (const line of lines) {
    // Parse quoted CSV fields
    const cols = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    cols.push(cur.trim());

    if (cols.length < 5) continue;
    const date = cols[0];
    if (!/\d{2}\/\d{2}\/\d{4}/.test(date)) continue;

    const rawName = cols[1] || 'Transação';
    // Clean up name: remove trailing country code and city
    const cleanName = rawName.replace(/\s+[A-Z]{3}\s*$/, '').replace(/\s{2,}[A-Z][A-Z\s]+$/, '').trim();
    const interCat = cols[2]?.toUpperCase();
    const valRaw = cols[4];
    const val = parseBrVal(valRaw);
    if (!val) continue;

    // Pagamentos têm valor negativo no CSV (crédito na fatura), manter como positivo
    // Compras têm valor positivo no CSV, virar negativo
    const finalVal = val < 0 ? Math.abs(val) : -val;

    // Use Inter's own category, fallback to guessCategory
    const cat = interCatMap[interCat] || guessCategory(cleanName);

    txs.push({
      id: state.nextId++,
      date,
      name: cleanName,
      rawName: cleanName,
      cat,
      val: finalVal,
      src: 'Inter',
    });
  }
  return txs;
}

// ─── File upload ──────────────────────────────────────────────────────────────

function triggerUpload(bank) {
  document.getElementById('file-' + bank).click();
}

function applyRulesAndSave(parsed, bankName) {
  if (!parsed || !parsed.length) {
    toast('Não foi possível ler o arquivo. Verifique o formato.');
    return;
  }

  // If Itaú XLS sent a saldoAnterior, update the base automatically
  if (parsed._saldoAnterior !== undefined && bankName === 'Itaú') {
    state.itauBase = parsed._saldoAnterior;
    const input = document.getElementById('itau-base-input');
    if (input) input.value = parsed._saldoAnterior;
    toast('Saldo base atualizado automaticamente para R$ ' + fmt(parsed._saldoAnterior));
  }

  const novas = parsed.filter(t => !isDuplicate(t)).map(t => {
    for (const rule of (state.rules || [])) {
      if (t.rawName.toLowerCase().includes(rule.match.toLowerCase())) {
        return { ...t, cat: rule.cat, name: rule.rename || t.name };
      }
    }
    return t;
  });
  const dupes = parsed.length - novas.length;
  state.transactions = [...novas, ...state.transactions].sort((a, b) => {
    const da = parseDate(a.date), db = parseDate(b.date);
    return (db || 0) - (da || 0);
  });
  saveState();
  render();
  document.getElementById('clear-btn').style.display = 'inline-flex';
  let msg = novas.length + ' transações importadas do ' + bankName;
  if (dupes > 0) msg += ` (${dupes} duplicada${dupes > 1 ? 's' : ''} ignorada${dupes > 1 ? 's' : ''})`;
  toast(msg);
}

function handleFile(bank, file) {
  const isXLS = file.name.toLowerCase().endsWith('.xls');

  if (bank === 'itau' && isXLS) {
    // Read as ArrayBuffer for SheetJS XLS parsing
    const reader = new FileReader();
    reader.onload = function(e) {
      const buf = new Uint8Array(e.target.result);
      let parsed = parseItauXLS(buf);
      if (parsed === null) {
        // Fallback: try reading as text (some XLS are actually HTML)
        const textReader = new FileReader();
        textReader.onload = function(e2) {
          parsed = parseItauCSV(e2.target.result);
          applyRulesAndSave(parsed, 'Itaú');
        };
        textReader.readAsText(file, 'ISO-8859-1');
        return;
      }
      applyRulesAndSave(parsed, 'Itaú');
    };
    reader.readAsArrayBuffer(file);
  } else {
    const reader = new FileReader();
    reader.onload = function(e) {
      const text = e.target.result;
      const parsed = bank === 'itau' ? parseItauCSV(text) : parseInterCSV(text);
      applyRulesAndSave(parsed, bank === 'itau' ? 'Itaú' : 'Inter');
    };
    reader.readAsText(file, bank === 'itau' ? 'ISO-8859-1' : 'UTF-8');
  }
}

document.getElementById('file-itau').addEventListener('change', function (e) {
  if (e.target.files[0]) handleFile('itau', e.target.files[0]);
  this.value = '';
});
document.getElementById('file-inter').addEventListener('change', function (e) {
  if (e.target.files[0]) handleFile('inter', e.target.files[0]);
  this.value = '';
});

// ─── Meta ─────────────────────────────────────────────────────────────────────

function updateGoal() {
  const v = parseBrVal(document.getElementById('meta-goal-input').value);
  if (v > 0) { state.goalTotal = v; saveState(); render(); }
}

function updateSaved() {
  const v = parseBrVal(document.getElementById('meta-saved-input').value);
  if (v >= 0) { state.savedTotal = v; saveState(); render(); }
}



// ─── Edit ─────────────────────────────────────────────────────────────────────

function startEdit(id) {
  editingId = id;
  render();
  setTimeout(() => {
    const inp = document.getElementById('name-input-' + id);
    if (inp) { inp.focus(); inp.select(); }
  }, 40);
}

function saveEdit(id) {
  const nameInp = document.getElementById('name-input-' + id);
  const catSel = document.getElementById('cat-sel-' + id);
  const tx = state.transactions.find(t => t.id === id);
  if (tx) {
    if (nameInp) tx.name = nameInp.value.trim() || tx.name;
    if (catSel) {
      const v = catSel.value;
      if (v === '__new__') {
        const nc = prompt('Nome da nova categoria:');
        if (nc?.trim()) {
          const cat = nc.trim();
          if (!state.customCats.includes(cat)) state.customCats.push(cat);
          tx.cat = cat;
        }
      } else {
        tx.cat = v;
      }
    }
  }
  editingId = null;
  saveState();
  render();
  toast('Transação salva');
}

function cancelEdit() { editingId = null; render(); }

// ─── Period tabs ──────────────────────────────────────────────────────────────

document.getElementById('period-tabs').addEventListener('click', function (e) {
  const tab = e.target.closest('.tab');
  if (!tab) return;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  activePeriod = tab.dataset.period;
  const dateRange = document.getElementById('date-range');
  if (dateRange) dateRange.style.display = activePeriod === 'custom' ? 'flex' : 'none';
  render();
});

document.getElementById('date-from')?.addEventListener('change', render);
document.getElementById('date-to')?.addEventListener('change', render);

document.getElementById('type-tabs').addEventListener('click', function (e) {
  const tab = e.target.closest('.type-tab');
  if (!tab) return;
  document.querySelectorAll('.type-tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  activeType = tab.dataset.type;
  render();
});

function setCatFilter(cat) {
  activeCat = activeCat === cat ? '' : cat;
  render();
}

document.getElementById('search').addEventListener('input', render);

// ─── Transaction icon helper ─────────────────────────────────────────────────

function txIcon(name) {
  const n = (name || '').toLowerCase();
  if (/pix recebido|pix entrada|transferencia recebida/.test(n))
    return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
  if (/pix|transferencia|ted|doc/.test(n))
    return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';
  if (/compra|debito|credito|qr code|pagamento/.test(n))
    return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>';
  if (/saque|resgate/.test(n))
    return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>';
  return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
}

// ─── Render ───────────────────────────────────────────────────────────────────

function getFiltered() {
  const q = document.getElementById('search').value.toLowerCase();
  return state.transactions.filter(t => {
    if (!inPeriod(t, activePeriod)) return false;
    if (q && !t.name.toLowerCase().includes(q) && !t.cat.toLowerCase().includes(q) && !t.rawName.toLowerCase().includes(q)) return false;
    if (activeType === 'expense' && t.val >= 0) return false;
    if (activeType === 'income' && t.val < 0) return false;
    if (activeCat && t.cat !== activeCat) return false;
    return true;
  });
}

function render() {
  const data = getFiltered();

  // Split by source for separate calculations
  const itauData = data.filter(t => t.src === 'Itaú' || t.src === 'demo');
  const interData = data.filter(t => t.src === 'Inter');

  // Itaú: real cash flow (entries minus exits)
  const itauIn = itauData.filter(t => t.val > 0).reduce((a, t) => a + t.val, 0);
  const itauOut = itauData.filter(t => t.val < 0).reduce((a, t) => a + Math.abs(t.val), 0);
  const itauBal = (state.itauBase || 0) + itauIn - itauOut;

  // Inter: credit card bill (sum of expenses, ignore payments to avoid double-count)
  const interFatura = interData.filter(t => t.val < 0).reduce((a, t) => a + Math.abs(t.val), 0);
  const interTxCount = interData.filter(t => t.val < 0).length;

  // What's left after paying the card
  const bal = itauBal - interFatura;

  // All data for category grid and tx list
  const outs = data.filter(t => t.val < 0);

  // Summary cards
  const itauBalEl = document.getElementById('c-itau-bal');
  itauBalEl.textContent = (itauBal < 0 ? '-' : '') + fmt(itauBal);
  itauBalEl.className = 'card-val ' + (itauBal >= 0 ? 'pos' : 'neg');
  document.getElementById('c-itau-sub').textContent = itauData.length + ' transaç' + (itauData.length === 1 ? 'ão' : 'ões');

  const interEl = document.getElementById('c-inter-fat');
  interEl.textContent = fmt(interFatura);
  interEl.style.color = 'var(--orange)';
  document.getElementById('c-inter-sub').textContent = interTxCount + ' transaç' + (interTxCount === 1 ? 'ão' : 'ões');

  document.getElementById('c-saved').textContent = fmt(state.savedTotal);

  // Meta
  const goal = state.goalTotal || 10000;
  const pct = Math.min(100, Math.round(state.savedTotal / goal * 100));
  document.getElementById('meta-bar').style.width = pct + '%';
  document.getElementById('meta-pct').textContent = pct + '% atingido';


  renderBudgets(data);
  renderRules();

  // Category pills
  const usedCats = [...new Set(state.transactions.map(t => t.cat))].sort();
  const pillsEl = document.getElementById('cat-pills');
  if (pillsEl) {
    pillsEl.innerHTML = usedCats.map(c => {
      const color = CAT_COLORS[c] || '#888';
      const isActive = activeCat === c;
      const style = isActive ? `background:${color};border-color:${color}` : '';
      return `<button class="cat-pill${isActive ? ' active' : ''}" data-cat="${c}" style="${style}" onclick="setCatFilter('${c}')"><span class="dot" style="background:${color}"></span>${c}</button>`;
    }).join('');
  }

  // Category grid — clickable cards, active ring on selected
  const catMap = {};
  data.filter(t => t.val < 0).forEach(t => { catMap[t.cat] = (catMap[t.cat] || 0) + Math.abs(t.val); });
  const maxCat = Math.max(...Object.values(catMap), 1);
  const catGrid = document.getElementById('cat-grid');
  if (catGrid) {
    if (Object.keys(catMap).length === 0) {
      catGrid.innerHTML = '';
    } else {
      catGrid.innerHTML = Object.entries(catMap).sort((a, b) => b[1] - a[1]).map(([c, v]) => {
        const color = CAT_COLORS[c] || '#888';
        const isActive = activeCat === c;
        const ring = isActive ? `box-shadow:0 0 0 2px ${color};` : '';
        return `<div class="cat-item" style="${ring}" onclick="setCatFilter('${c}')">
          <div class="cat-row">
            <span class="cat-name" style="color:${color}">${c}</span>
          </div>
          <span class="cat-amt">${fmt(v)}</span>
          <div class="cat-bar-bg">
            <div class="cat-bar-fill" style="width:${Math.round(v/maxCat*100)}%;background:${color}"></div>
          </div>
        </div>`;
      }).join('');
    }
  }

  // Category grid

  // Transaction count
  document.getElementById('tx-count').textContent = data.length + ' transaç' + (data.length === 1 ? 'ão' : 'ões');

  // Transaction list
  const txList = document.getElementById('tx-list');
  if (data.length === 0 && state.transactions.length === 0) {
    txList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
        </div>
        <p>Nenhuma transação ainda</p>
        <p class="empty-sub">Importe um extrato do Itaú ou Inter para começar</p>
        <div style="display:flex;gap:8px;justify-content:center;margin-top:1rem">
          <button class="btn" onclick="triggerUpload('itau')">Importar Itaú</button>
          <button class="btn" onclick="triggerUpload('inter')">Importar Inter</button>
        </div>
      </div>`;
  } else if (data.length === 0) {
    txList.innerHTML = '<div class="empty-state" style="padding:1.5rem">Nenhuma transação encontrada para este filtro</div>';
  } else {
    // Group by date
    const groups = {};
    data.forEach(t => {
      const d = t.date || '—';
      if (!groups[d]) groups[d] = [];
      groups[d].push(t);
    });
    const sortedDates = Object.keys(groups).sort((a, b) => {
      const da = parseDate(a), db = parseDate(b);
      return (db || 0) - (da || 0);
    });

    txList.innerHTML = sortedDates.map(date => {
      const txs = groups[date];
      const dayTotal = txs.reduce((a, t) => a + t.val, 0);
      const d = parseDate(date);
      const dateLabel = d ? d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase() : date;

      const rows = txs.map(t => {
        const isEditing = editingId === t.id;
        const color = CAT_COLORS[t.cat] || '#888';
        const catOpts = allCats().map(c => `<option value="${c}"${c === t.cat ? ' selected' : ''}>${c}</option>`).join('');
        const edited = t.name !== t.rawName;
        const iconBg = t.val > 0 ? 'var(--green-bg)' : 'var(--red-bg)';
        const iconColor = t.val > 0 ? 'var(--green)' : 'var(--red)';
        const iconSvg = t.val > 0
          ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>'
          : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M19 12l-7 7-7-7"/></svg>';

        const bankLogo = t.src === 'Itaú'
          ? `<div class="bank-logo bank-itau">it</div>`
          : t.src === 'Inter'
          ? `<div class="bank-logo bank-inter">in</div>`
          : '';

        // Transaction type label
        function txTypeLabel(name) {
          const n = (name || '').toLowerCase();
          if (/pix recebido|pix entrada|transferencia recebida|credito em conta/.test(n)) return 'PIX recebido';
          if (/pix transf|pix enviado|pix para/.test(n)) return 'PIX enviado';
          if (/pix qrs|pagamento de pix qr|pix qr/.test(n)) return 'PIX QR Code';
          if (/pix/.test(n)) return 'PIX';
          if (/compra debito|compra no debito/.test(n)) return 'Compra débito';
          if (/compra credito|compra no credito/.test(n)) return 'Compra crédito';
          if (/ted|doc/.test(n)) return 'TED/DOC';
          if (/saque/.test(n)) return 'Saque';
          if (/pagamento/.test(n)) return 'Pagamento';
          if (/salario|credito em conta/.test(n)) return 'Crédito';
          return null;
        }
        const typeLabel = txTypeLabel(t.rawName);

        if (isEditing) {
          return `<div class="tx-item">
            <div class="tx-avatar" style="background:${iconBg};color:${iconColor}">${iconSvg}</div>
            <div class="tx-info" style="flex:1">
              <input class="tx-name-input" id="name-input-${t.id}" value="${t.name.replace(/"/g, '&quot;')}"
                onkeydown="if(event.key==='Enter')saveEdit(${t.id});if(event.key==='Escape')cancelEdit()">
              <div class="tx-meta" style="margin-top:4px">
                <select class="cat-select" id="cat-sel-${t.id}">
                  ${catOpts}
                  <option value="__new__">+ Nova categoria...</option>
                </select>
              </div>
            </div>
            <div class="tx-actions">
              <button class="btn btn-sm btn-primary" onclick="saveEdit(${t.id})">Salvar</button>
              <button class="btn btn-sm" onclick="cancelEdit()">Cancelar</button>
            </div>
            <div class="tx-val ${t.val > 0 ? 'pos' : 'neg'}">${t.val > 0 ? '+' : ''}${fmt(t.val)}</div>
          </div>`;
        }

        return `<div class="tx-item${selectedIds.has(t.id) ? ' selected' : ''}" id="tx-row-${t.id}">
          <input type="checkbox" class="tx-checkbox" id="tx-cb-${t.id}" ${selectedIds.has(t.id) ? 'checked' : ''} onchange="toggleSelect(${t.id})" onclick="event.stopPropagation()">
          <div class="tx-avatar" style="background:${iconBg};color:${iconColor}">${iconSvg}</div>
          <div class="tx-info">
            <span class="tx-name" title="${edited ? 'Original: ' + t.rawName : t.name}">${t.name}${edited ? ' <span class="edited-badge">editado</span>' : ''}</span>
          </div>
          ${typeLabel ? `<div class="tx-type-label">${typeLabel}</div>` : '<div class="tx-type-label"></div>'}
          <div class="tx-middle">
            <span class="cat-badge" style="background:${color}20;color:${color};border-color:${color}40" onclick="startEdit(${t.id})" title="Clique para editar">${t.cat}</span>
          </div>
          <div class="tx-bank">
            ${bankLogo}
            <span class="tx-bank-name">${t.src && t.src !== 'demo' ? t.src : ''}</span>
          </div>
          ${t.time ? `<span class="tx-time">${t.time}</span>` : ''}
          <button class="tx-edit-btn" onclick="startEdit(${t.id})" title="Editar">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <div class="tx-val ${t.val > 0 ? 'pos' : 'neg'}">${t.val > 0 ? '+' : ''}${fmt(t.val)}</div>
        </div>`;
      }).join('');

      return `<div class="tx-group">
        <div class="tx-group-header">
          <span class="tx-group-date">${dateLabel}</span>
          <span class="tx-group-total ${dayTotal >= 0 ? 'pos' : 'neg'}">${dayTotal >= 0 ? '+' : ''}${fmt(dayTotal)}</span>
        </div>
        ${rows}
      </div>`;
    }).join('');
  }
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2500);
}

// ─── Init ─────────────────────────────────────────────────────────────────────

// Init
loadState();
render();
initTheme();

// ─── Theme ────────────────────────────────────────────────────────────────────

function initTheme() {
  const saved = localStorage.getItem('fintrack_theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved || (prefersDark ? 'dark' : 'light');
  applyTheme(theme);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const sun = document.getElementById('icon-sun');
  const moon = document.getElementById('icon-moon');
  if (theme === 'dark') {
    sun.style.display = 'block';
    moon.style.display = 'none';
  } else {
    sun.style.display = 'none';
    moon.style.display = 'block';
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  localStorage.setItem('fintrack_theme', next);
  applyTheme(next);
}

initTheme();

// ─── Rules ────────────────────────────────────────────────────────────────────

function applyRules(transactions) {
  return transactions.map(t => {
    for (const rule of (state.rules || [])) {
      if (t.rawName.toLowerCase().includes(rule.match.toLowerCase()) ||
          t.name.toLowerCase().includes(rule.match.toLowerCase())) {
        return {
          ...t,
          cat: rule.cat,
          name: rule.rename || t.name,
        };
      }
    }
    return t;
  });
}

function openRuleModal(editId) {
  const cats = allCats();
  const sel = document.getElementById('rule-cat-input');
  sel.innerHTML = cats.map(c => `<option value="${c}">${c}</option>`).join('');

  if (editId !== undefined) {
    const rule = state.rules.find(r => r.id === editId);
    if (rule) {
      document.getElementById('rule-edit-id').value = editId;
      document.getElementById('rule-match-input').value = rule.match;
      document.getElementById('rule-rename-input').value = rule.rename || '';
      sel.value = rule.cat;
      document.getElementById('rule-modal-title').textContent = 'Editar regra';
    }
  } else {
    document.getElementById('rule-edit-id').value = '';
    document.getElementById('rule-match-input').value = '';
    document.getElementById('rule-rename-input').value = '';
    document.getElementById('rule-modal-title').textContent = 'Nova regra';
  }
  document.getElementById('rule-modal').style.display = 'flex';
  setTimeout(() => document.getElementById('rule-match-input').focus(), 50);
}

function saveRule() {
  const match = document.getElementById('rule-match-input').value.trim();
  const cat = document.getElementById('rule-cat-input').value;
  const rename = document.getElementById('rule-rename-input').value.trim();
  const editId = document.getElementById('rule-edit-id').value;

  if (!match) { toast('Digite o texto a identificar'); return; }

  if (editId) {
    const rule = state.rules.find(r => r.id === parseInt(editId));
    if (rule) { rule.match = match; rule.cat = cat; rule.rename = rename; }
  } else {
    state.rules.push({ id: state.nextId++, match, cat, rename });
  }

  // Re-apply all rules to existing transactions
  state.transactions = state.transactions.map(t => {
    const original = t.rawName;
    for (const rule of state.rules) {
      if (original.toLowerCase().includes(rule.match.toLowerCase())) {
        return { ...t, cat: rule.cat, name: rule.rename || t.name };
      }
    }
    return t;
  });

  saveState();
  closeModal('rule-modal');
  render();
  toast('Regra salva — transações atualizadas');
}

function deleteRule(id) {
  if (!confirm('Remover esta regra?')) return;
  state.rules = state.rules.filter(r => r.id !== id);
  saveState();
  render();
  toast('Regra removida');
}

function renderRules() {
  const el = document.getElementById('rules-list');
  if (!el) return;
  if (!state.rules.length) {
    el.innerHTML = '<div class="empty-state" style="padding:1.25rem">Nenhuma regra criada ainda</div>';
    return;
  }
  el.innerHTML = state.rules.map(r => `
    <div class="rule-item">
      <span class="rule-match">"${r.match}"</span>
      <span class="rule-arrow">→</span>
      <span class="rule-cat">${r.cat}</span>
      ${r.rename ? `<span class="rule-rename">· renomear para "${r.rename}"</span>` : ''}
      <span class="rule-spacer"></span>
      <div class="rule-actions">
        <button class="icon-btn" onclick="openRuleModal(${r.id})" title="Editar">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="icon-btn" onclick="deleteRule(${r.id})" title="Remover">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </button>
      </div>
    </div>`).join('');
}

// ─── Budgets ──────────────────────────────────────────────────────────────────

function openBudgetModal(editId) {
  const cats = allCats().filter(c => c !== 'Receita');
  const sel = document.getElementById('budget-cat-input');
  sel.innerHTML = cats.map(c => `<option value="${c}">${c}</option>`).join('');

  if (editId !== undefined) {
    const b = state.budgets.find(b => b.id === editId);
    if (b) {
      document.getElementById('budget-edit-id').value = editId;
      document.getElementById('budget-limit-input').value = b.limit;
      sel.value = b.cat;
      document.getElementById('budget-modal-title').textContent = 'Editar orçamento';
    }
  } else {
    document.getElementById('budget-edit-id').value = '';
    document.getElementById('budget-limit-input').value = '';
    document.getElementById('budget-modal-title').textContent = 'Novo orçamento';
  }
  document.getElementById('budget-modal').style.display = 'flex';
  setTimeout(() => document.getElementById('budget-limit-input').focus(), 50);
}

function saveBudget() {
  const cat = document.getElementById('budget-cat-input').value;
  const limit = parseBrVal(document.getElementById('budget-limit-input').value);
  const editId = document.getElementById('budget-edit-id').value;

  if (!limit || limit <= 0) { toast('Digite um limite válido'); return; }

  if (editId) {
    const b = state.budgets.find(b => b.id === parseInt(editId));
    if (b) { b.cat = cat; b.limit = limit; }
  } else {
    if (state.budgets.find(b => b.cat === cat)) {
      toast('Já existe um orçamento para essa categoria'); return;
    }
    state.budgets.push({ id: state.nextId++, cat, limit });
  }

  saveState();
  closeModal('budget-modal');
  render();
  toast('Orçamento salvo');
}

function deleteBudget(id) {
  if (!confirm('Remover este orçamento?')) return;
  state.budgets = state.budgets.filter(b => b.id !== id);
  saveState();
  render();
  toast('Orçamento removido');
}

function renderBudgets(data) {
  const el = document.getElementById('budget-list');
  if (!el) return;
  if (!state.budgets.length) {
    el.innerHTML = '<div class="empty-state" style="padding:1.25rem">Nenhum orçamento definido ainda</div>';
    return;
  }

  // Use current month transactions for budget calculation
  const now = new Date();
  const monthTx = state.transactions.filter(t => {
    const d = parseDate(t.date);
    return d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && t.val < 0;
  });

  el.innerHTML = state.budgets.map(b => {
    const spent = monthTx.filter(t => t.cat === b.cat).reduce((a, t) => a + Math.abs(t.val), 0);
    const pct = Math.min(100, Math.round(spent / b.limit * 100));
    const over = spent > b.limit;
    const color = over ? 'var(--red)' : pct > 80 ? '#BA7517' : 'var(--accent)';
    return `
    <div class="budget-item">
      <div class="budget-item-header">
        <span class="budget-cat">${b.cat}</span>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="budget-amounts">${fmt(spent)} <span style="color:var(--text-3)">de</span> ${fmt(b.limit)}</span>
          <div class="budget-actions">
            <button class="icon-btn" onclick="openBudgetModal(${b.id})" title="Editar">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="icon-btn" onclick="deleteBudget(${b.id})" title="Remover">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
            </button>
          </div>
        </div>
      </div>
      <div class="budget-bar-bg">
        <div class="budget-bar-fill" style="width:${pct}%;background:${color}"></div>
      </div>
      <div class="budget-footer">
        <span class="budget-pct" style="color:${over ? 'var(--red)' : 'var(--text-3)'}">
          ${over ? `R$ ${fmt(spent - b.limit)} acima do limite` : `${pct}% utilizado`}
        </span>
      </div>
    </div>`;
  }).join('');
}

// ─── Modal helpers ────────────────────────────────────────────────────────────

function closeModal(id) {
  document.getElementById(id).style.display = 'none';
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeModal('budget-modal');
    closeModal('rule-modal');
  }
});

// ─── Categories modal ─────────────────────────────────────────────────────────

function openCatsModal() {
  renderCatsList();
  document.getElementById('cats-modal').style.display = 'flex';
  setTimeout(() => document.getElementById('new-cat-input')?.focus(), 50);
}

function renderCatsList() {
  const el = document.getElementById('cats-list');
  if (!el) return;

  const q = (document.getElementById('cats-search')?.value || '').toLowerCase();
  const inUse = [...new Set(state.transactions.map(t => t.cat))];
  const custom = state.customCats || [];
  const allUsed = [...new Set([...inUse, ...custom])].sort()
    .filter(c => !q || c.toLowerCase().includes(q));

  if (!allUsed.length) {
    el.innerHTML = '<p style="font-size:13px;color:var(--label-3);text-align:center;padding:12px 0">Nenhuma categoria encontrada</p>';
    return;
  }

  el.innerHTML = allUsed.map(c => {
    const color = CAT_COLORS[c] || '#888';
    const count = state.transactions.filter(t => t.cat === c).length;
    return `<div class="cat-modal-row" id="cat-row-${encodeURIComponent(c)}">
      <input type="color" class="cat-color-input" value="${color}" title="Mudar cor"
        onchange="updateCatColor('${c}', this.value)">
      <span class="cat-modal-name" id="cat-name-display-${encodeURIComponent(c)}">${c}</span>
      <input class="cat-modal-input form-input" id="cat-name-input-${encodeURIComponent(c)}" value="${c}" style="display:none;flex:1;padding:4px 8px;font-size:13px">
      <span class="cat-modal-count">${count} transaç${count === 1 ? 'ão' : 'ões'}</span>
      <div style="display:flex;gap:4px">
        <button class="icon-btn" onclick="startRenameCat('${c}')" title="Renomear">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="icon-btn" onclick="deleteCat('${c}')" title="Excluir" style="color:var(--red)">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </button>
      </div>
    </div>`;
  }).join('');
}

function updateCatColor(cat, color) {
  if (!state.catColors) state.catColors = {};
  state.catColors[cat] = color;
  saveState();
  render();
}

function startRenameCat(cat) {
  const key = encodeURIComponent(cat);
  const display = document.getElementById(`cat-name-display-${key}`);
  const input = document.getElementById(`cat-name-input-${key}`);
  if (!display || !input) return;
  display.style.display = 'none';
  input.style.display = 'block';
  input.focus();
  input.select();
  input.onkeydown = (e) => {
    if (e.key === 'Enter') confirmRenameCat(cat);
    if (e.key === 'Escape') { display.style.display = ''; input.style.display = 'none'; }
  };
  input.onblur = () => confirmRenameCat(cat);
}

function confirmRenameCat(oldCat) {
  const key = encodeURIComponent(oldCat);
  const input = document.getElementById(`cat-name-input-${key}`);
  if (!input) return;
  const newCat = input.value.trim();
  if (!newCat || newCat === oldCat) {
    const display = document.getElementById(`cat-name-display-${key}`);
    if (display) { display.style.display = ''; input.style.display = 'none'; }
    return;
  }
  // Update all transactions
  state.transactions = state.transactions.map(t => t.cat === oldCat ? { ...t, cat: newCat } : t);
  // Update customCats
  state.customCats = state.customCats.map(c => c === oldCat ? newCat : c);
  if (!state.customCats.includes(newCat) && !BASE_CATS.includes(newCat)) {
    state.customCats.push(newCat);
  }
  saveState();
  render();
  renderCatsList();
  toast(`"${oldCat}" renomeada para "${newCat}"`);
}

function deleteCat(cat) {
  const count = state.transactions.filter(t => t.cat === cat).length;
  const msg = count > 0
    ? `Excluir "${cat}"? As ${count} transação(ões) vinculadas irão para "Outros".`
    : `Excluir a categoria "${cat}"?`;
  if (!confirm(msg)) return;
  state.transactions = state.transactions.map(t => t.cat === cat ? { ...t, cat: 'Outros' } : t);
  state.customCats = state.customCats.filter(c => c !== cat);
  saveState();
  render();
  renderCatsList();
  toast(`Categoria "${cat}" excluída`);
}

function addCatFromModal() {
  const input = document.getElementById('new-cat-input');
  const name = input?.value.trim();
  if (!name) return;
  if (allCats().includes(name)) { toast('Categoria já existe'); return; }
  if (!state.customCats.includes(name)) state.customCats.push(name);
  saveState();
  render();
  renderCatsList();
  input.value = '';
  toast(`Categoria "${name}" adicionada`);
}

// ─── Export / Import ──────────────────────────────────────────────────────────

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `fintrack-backup-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Dados exportados com sucesso');
}

document.getElementById('import-input').addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(ev) {
    try {
      const imported = JSON.parse(ev.target.result);
      if (!imported.transactions) {
        toast('Arquivo inválido — não parece um backup do Fintrack');
        return;
      }
      if (!confirm(`Importar backup de ${imported.transactions.length} transações? Os dados atuais serão substituídos.`)) return;
      state = { ...state, ...imported };
      saveState();
      document.getElementById('meta-goal-input').value = state.goalTotal || 10000;
      document.getElementById('meta-saved-input').value = state.savedTotal || 0;
      document.getElementById('itau-base-input').value = state.itauBase || 0;
      render();
      toast('Backup importado com sucesso');
    } catch(e) {
      toast('Erro ao ler o arquivo. Verifique se é um backup válido.');
    }
  };
  reader.readAsText(file);
  this.value = '';
});

// ─── Bulk selection ───────────────────────────────────────────────────────────

let selectedIds = new Set();

function toggleSelect(id) {
  if (selectedIds.has(id)) {
    selectedIds.delete(id);
  } else {
    selectedIds.add(id);
  }
  updateBulkBar();
  // Update visual state of the row
  const row = document.getElementById('tx-row-' + id);
  if (row) row.classList.toggle('selected', selectedIds.has(id));
  const cb = document.getElementById('tx-cb-' + id);
  if (cb) cb.checked = selectedIds.has(id);
}

function toggleSelectAll() {
  const filtered = getFiltered();
  const allSelected = filtered.every(t => selectedIds.has(t.id));
  if (allSelected) {
    filtered.forEach(t => selectedIds.delete(t.id));
  } else {
    filtered.forEach(t => selectedIds.add(t.id));
  }
  updateBulkBar();
  render();
}

function clearSelection() {
  selectedIds.clear();
  updateBulkBar();
  render();
}

function updateBulkBar() {
  const bar = document.getElementById('bulk-bar');
  const count = selectedIds.size;
  if (count > 0) {
    bar.style.display = 'block';
    document.getElementById('bulk-count').textContent = count + ' selecionada' + (count !== 1 ? 's' : '');
    const filtered = getFiltered();
    const allSel = filtered.length > 0 && filtered.every(t => selectedIds.has(t.id));
    document.getElementById('bulk-select-all-label').textContent = allSel ? 'Desselecionar todas' : 'Selecionar todas';
  } else {
    bar.style.display = 'none';
  }
}

function openBulkModal() {
  const cats = allCats();
  const sel = document.getElementById('bulk-cat-input');
  sel.innerHTML = '<option value="">— manter categoria atual —</option>' +
    cats.map(c => `<option value="${c}">${c}</option>`).join('');
  document.getElementById('bulk-cat-check').checked = false;
  document.getElementById('bulk-cat-input').disabled = true;
  document.getElementById('bulk-name-check').checked = false;
  document.getElementById('bulk-name-input').disabled = true;
  document.getElementById('bulk-name-input').value = '';
  document.getElementById('bulk-modal-title').textContent = `Editar ${selectedIds.size} transaç${selectedIds.size === 1 ? 'ão' : 'ões'}`;
  document.getElementById('bulk-modal').style.display = 'flex';
}

function applyBulkEdit() {
  const changeCat = document.getElementById('bulk-cat-check').checked;
  const newCat = document.getElementById('bulk-cat-input').value;
  const changeName = document.getElementById('bulk-name-check').checked;
  const newName = document.getElementById('bulk-name-input').value.trim();

  if (!changeCat && !changeName) {
    toast('Selecione pelo menos uma alteração');
    return;
  }

  let changed = 0;
  state.transactions = state.transactions.map(t => {
    if (!selectedIds.has(t.id)) return t;
    changed++;
    return {
      ...t,
      ...(changeCat && newCat ? { cat: newCat } : {}),
      ...(changeName && newName ? { name: newName } : {}),
    };
  });

  saveState();
  closeModal('bulk-modal');
  clearSelection();
  render();
  toast(`${changed} transaç${changed === 1 ? 'ão atualizada' : 'ões atualizadas'}`);
}
