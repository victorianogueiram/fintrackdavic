/* Fintrack v2 — app mobile. Tudo declarado no topo (evita erros de inicialização). */
(function () {
  'use strict';
  const E = window.FTEngine, P = window.FTParsers, Cloud = window.FTCloud;

  /* ---------- estado global ---------- */
  let S = E.newState();
  let nick = null;
  let view = { name: 'resumo', sub: null, month: null, periodo: 'mes', tipo: 'todas', cat: '', conta: '', q: '', selMode: false, sel: new Set() };
  let dec = { step: 0, item: '', nec: '', preco: '', forma: '', parcelas: '6', juros: '', res: null };
  let loginMode = 'login';
  let askQueue = [];
  let pushTimer = null, dirty = false, syncState = 'ok';
  let editingId = null;

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const brl = (n) => (n < 0 ? '-' : '') + 'R$ ' + Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const brl0 = (n) => 'R$ ' + Math.round(n).toLocaleString('pt-BR');
  const pad = (n) => String(n).padStart(2, '0');
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const dm = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7);
  const parseBR = (s) => { const t = String(s || '').replace(/[^\d,.-]/g, ''); if (!t) return NaN; return t.includes(',') ? parseFloat(t.replace(/\./g, '').replace(',', '.')) : parseFloat(t); };
  const catObj = (name) => S.cats.find((c) => c.name === name) || { name: name || 'Sem categoria', color: '#9a9aa5' };

  /* ---------- ícones ---------- */
  const IC = {
    home: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z', pie: 'M12 3v9h9a9 9 0 1 1-9-9z', list: 'M4 6h16M4 12h16M4 18h16',
    spark: 'M12 3l2.2 5.6L20 10l-4.4 3.8L17 20l-5-3-5 3 1.4-6.2L4 10l5.8-1.4z', more: 'M5 12h.01M12 12h.01M19 12h.01',
    food: 'M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 2-2 6 0 8v10', car: 'M5 16l1.5-5h11L19 16M5 16v3h2v-2h10v2h2v-3M5 16h14',
    repeat: 'M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3', heart: 'M12 21s-8-5-8-11a4.5 4.5 0 0 1 8-2.5A4.5 4.5 0 0 1 20 10c0 6-8 11-8 11z',
    smile: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01', book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5',
    bag: 'M6 7h12l1 13H5zM9 7a3 3 0 0 1 6 0', send: 'M22 2L11 13M22 2l-7 20-4-9-9-4z', down: 'M12 5v14M6 13l6 6 6-6', tag: 'M3 12V4h8l10 10-8 8zM7.5 7.5h.01',
    paw: 'M12 14c-3 0-5 2-5 4s2 2 5 2 5 0 5-2-2-4-5-4zM6 9h.01M10 6h.01M14 6h.01M18 9h.01', phone: 'M8 2h8v20H8zM11 18h2', card: 'M3 6h18v12H3zM3 10h18', swap: 'M7 7h13l-4-4M17 17H4l4 4'
  };
  const CAT_IC = { 'Alimentação': 'food', 'Transporte': 'car', 'Assinaturas': 'repeat', 'Saúde': 'heart', 'Lazer': 'smile', 'Moradia': 'home', 'Educação': 'book', 'Vestuário': 'bag', 'PIX': 'send', 'Receita': 'down', 'Pet': 'paw', 'Telefone': 'phone', 'Cartão de Crédito': 'card', 'Transferência': 'swap', 'Compras': 'bag', 'Feira': 'food' };
  const ic = (n, sw) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (sw || 1.8) + '" stroke-linecap="round" stroke-linejoin="round"><path d="' + (IC[n] || IC.tag) + '"/></svg>';
  const catIc = (cat) => ic(CAT_IC[cat] || 'tag');

  /* ---------- persistência e sincronização ---------- */
  const LSK = () => 'ft2_state_' + nick;
  function normalize(d) {
    const base = E.newState();
    const o = Object.assign(base, d || {});
    o.settings = Object.assign(base.settings, (d && d.settings) || {});
    ['cats', 'tx', 'metas', 'decisoes', 'faturas'].forEach((k) => { if (!Array.isArray(o[k])) o[k] = base[k]; });
    ['rules', 'budget', 'dismissed'].forEach((k) => { if (!o[k] || typeof o[k] !== 'object') o[k] = {}; });
    return o;
  }
  function persistLocal() { try { const { _seen, ...clean } = S; Cloud.LS.set(LSK(), JSON.stringify({ S: clean, dirty })); } catch (e) {} }
  function loadLocal() { try { const j = JSON.parse(Cloud.LS.get(LSK()) || 'null'); if (j && j.S) { S = normalize(j.S); dirty = !!j.dirty; } } catch (e) {} }
  function setSync(st) { syncState = st; const d = $('syncDot'); d.className = 'sync ' + (st === 'busy' ? 'busy' : st === 'off' ? 'off' : ''); d.title = st === 'ok' ? 'Sincronizado' : st === 'busy' ? 'Salvando…' : 'Sem conexão — salvo neste aparelho'; $('banner').hidden = st !== 'off'; if (st === 'off') $('banner').textContent = 'Sem conexão com o servidor. Suas alterações estão salvas neste aparelho e vão sincronizar quando a conexão voltar.'; }
  function save() { dirty = true; persistLocal(); setSync('busy'); clearTimeout(pushTimer); pushTimer = setTimeout(pushNow, 900); }
  async function pushNow() {
    try { const { _seen, ...clean } = S; await Cloud.save(clean); dirty = false; persistLocal(); setSync('ok'); }
    catch (e) { if (e.invalidSession) { toastMsg('Sessão expirada. Entre de novo.'); doLogout(true); } else setSync('off'); }
  }
  window.addEventListener('online', () => { if (dirty && nick) pushNow(); });

  /* ---------- login ---------- */
  function showLogin(msg) {
    $('app').hidden = true; const L = $('login'); L.hidden = false;
    const reg = loginMode === 'register';
    L.innerHTML = '<h1>Fintrack</h1><p>' + (reg ? 'Crie seu acesso com um nick e uma senha.' : 'Entre com seu nick e senha.') + '</p>' +
      '<input class="input" id="lNick" placeholder="nick" autocapitalize="none" autocomplete="username">' +
      '<input class="input" id="lPass" type="password" placeholder="senha" autocomplete="' + (reg ? 'new-password' : 'current-password') + '">' +
      (reg ? '<input class="input" id="lPass2" type="password" placeholder="repita a senha" autocomplete="new-password">' : '') +
      '<div class="err" id="lErr">' + esc(msg || '') + '</div>' +
      '<button class="btn" data-act="doLogin">' + (reg ? 'Criar acesso' : 'Entrar') + '</button>' +
      '<p class="small" style="margin:16px 0 0;text-align:center"><button class="link" data-act="toggleLogin">' + (reg ? 'Já tenho acesso' : 'Primeiro acesso? Criar') + '</button></p>';
  }
  async function doLoginAct() {
    const n = $('lNick').value.trim().toLowerCase(), p = $('lPass').value; const err = (m) => { $('lErr').textContent = m; };
    if (!/^[a-z0-9_.-]{3,30}$/.test(n)) return err('Nick: 3 a 30 letras minúsculas, números, ponto, hífen ou _.');
    if (p.length < 6) return err('A senha precisa ter ao menos 6 caracteres.');
    if (loginMode === 'register' && p !== $('lPass2').value) return err('As senhas não são iguais.');
    err('Entrando…');
    try { if (loginMode === 'register') await Cloud.register(n, p); else await Cloud.login(n, p); }
    catch (e) { return err(e.offline ? 'Sem conexão. Tente de novo.' : /duplicate|already|ft_users_pkey/.test(e.message) ? 'Esse nick já existe.' : /cadastro fechado/.test(e.message) ? 'Cadastro fechado.' : e.message); }
    S = E.newState(); dirty = false; await boot();
  }
  async function doLogout(silent) {
    if (!silent) await Cloud.logout(); else Cloud.LS.del('ft2_token');
    nick = null; S = E.newState(); loginMode = 'login'; showLogin(silent ? 'Sua sessão expirou, entre de novo.' : '');
  }

  /* ---------- boot ---------- */
  async function boot() {
    if (!Cloud.token()) return showLogin();
    nick = Cloud.nick(); S = E.newState(); dirty = false; loadLocal();
    $('login').hidden = true; $('app').hidden = false; applyTheme(); render();
    try {
      const r = await Cloud.load();
      if (dirty) await pushNow();
      else if (r && r.data && r.data.v) { S = normalize(r.data); persistLocal(); setSync('ok'); }
      else setSync('ok');
      render(); maybeAsk(false);
    } catch (e) {
      if (e.invalidSession) { await doLogout(true); } else setSync('off');
    }
  }

  /* ---------- tema ---------- */
  function applyTheme() { const t = S.settings.tema; if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t); }

  /* ---------- helpers de dados ---------- */
  function currentMonth() {
    if (view.month) return view.month;
    const ms = E.monthsWithData(S); const nowM = E.ym(today());
    view.month = ms.includes(nowM) || !ms.length ? nowM : ms[ms.length - 1]; return view.month;
  }
  const refDate = () => (currentMonth() === E.ym(today()) ? today() : currentMonth() + '-15');
  function filteredTx() {
    const m = currentMonth(); const q = view.q.trim().toLowerCase();
    return S.tx.filter((t) => {
      if (view.periodo === 'mes' && E.ym(t.data) !== m) return false;
      if (view.tipo === 'despesas' && !(t.valor < 0 && !t.transfer)) return false;
      if (view.tipo === 'receitas' && !(t.valor > 0 && !t.transfer)) return false;
      if (view.cat && (t.cat || 'Sem categoria') !== view.cat) return false;
      if (view.conta && t.conta !== view.conta) return false;
      if (q && !(t.nome + ' ' + (t.cat || '')).toLowerCase().includes(q)) return false;
      return true;
    }).sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0));
  }

  /* ---------- renderização ---------- */
  const TABS = [['resumo', 'Resumo', 'home'], ['orcamento', 'Orçamento', 'pie'], ['transacoes', 'Transações', 'list'], ['decidir', 'Decidir', 'spark'], ['mais', 'Mais', 'more']];
  const TITLES = { resumo: 'Resumo', orcamento: 'Orçamento', transacoes: 'Transações', decidir: 'Decidir', mais: 'Mais', parcelas: 'Parcelamentos', recorrentes: 'Recorrentes', metas: 'Metas', reserva: 'Reserva de emergência', ajustes: 'Ajustes' };
  function render() {
    if ($('app').hidden) return;
    const key = view.name === 'mais' && view.sub ? view.sub : view.name;
    $('topTitle').textContent = TITLES[key];
    $('topSub').textContent = ['resumo', 'orcamento'].includes(view.name) ? E.monthLabel(currentMonth()) : '';
    $('tabs').innerHTML = '<div class="tabs-in">' + TABS.map(([k, l, i]) => '<button class="tab' + (view.name === k ? ' on' : '') + '" data-act="tab" data-v="' + k + '">' + ic(i) + '<span>' + l + '</span></button>').join('') + '</div>';
    $('fab').hidden = !['resumo', 'transacoes', 'orcamento'].includes(view.name) || view.selMode;
    const fn = { resumo: vResumo, orcamento: vOrcamento, transacoes: vTransacoes, decidir: vDecidir, mais: vMais }[view.name];
    $('view').innerHTML = fn();
    renderSelbar();
  }
  const monthNav = () => '<div class="mnav"><button data-act="mprev" aria-label="Mês anterior">‹</button><b>' + esc(E.monthLabel(currentMonth())) + '</b><button data-act="mnext" aria-label="Próximo mês">›</button></div>';

  /* ----- Resumo ----- */
  function vResumo() {
    const m = currentMonth(), ref = refDate(); const v = E.visaoMes(S, ref); const al = E.alertas(S, today());
    if (!S.tx.length) return '<div class="card hero"><h2>Bem-vinda</h2><p class="mid" style="margin-bottom:6px">Comece enviando um extrato ou fatura</p><p class="muted small" style="margin-bottom:14px">Toque no + para enviar o extrato da conta (Excel, CSV, OFX ou PDF) e a fatura do cartão (PDF). Gastos do dia a dia você lança manualmente.</p><button class="btn" data-act="plus">Adicionar</button></div>';
    let h = monthNav();
    if (v.posso == null) {
      h += '<div class="card hero"><h2>Quanto posso gastar</h2><p class="muted" style="margin-bottom:12px">Informe sua renda para eu calcular quanto ainda pode gastar no mês.</p><button class="btn small" data-act="goAjustes">Informar renda</button></div>';
    } else {
      const pct = v.plano.plano ? Math.min(100, (v.gasto + v.parcelasPendentes) / v.plano.plano * 100) : 0; const cls = pct > 100 ? 'bad' : pct > 85 ? 'warn' : 'ok';
      const dias = m === E.ym(today()) ? Math.max(1, new Date(+m.slice(0, 4), +m.slice(5), 0).getDate() - new Date().getDate() + 1) : null;
      h += '<div class="card hero"><h2>Quanto posso gastar no mês</h2><div class="big ' + (v.posso < 0 ? 'orange' : '') + '">' + (v.posso < 0 ? 'Passou ' + brl(-v.posso) : brl(v.posso)) + '</div>' +
        '<p class="muted small" style="margin:6px 0 12px">Plano de ' + brl0(v.plano.plano) + ' · gasto ' + brl(v.gasto) + (v.parcelasPendentes ? ' · parcelas a cair ' + brl(v.parcelasPendentes) : '') + '</p><div class="bar ' + cls + '"><i style="width:' + pct + '%"></i></div>' +
        (dias && v.posso > 0 ? '<p class="small" style="margin-top:10px">Dá cerca de <b>' + brl(v.posso / dias) + '</b> por dia até o fim do mês.</p>' : '') + '</div>';
    }
    h += '<div class="grid2"><div class="card"><h2>Gastos</h2><div class="mid">' + brl(v.gasto) + '</div></div><div class="card"><h2>Receitas</h2><div class="mid pos">' + brl(v.receita) + '</div></div></div>';
    const f = S.faturas.slice().sort((a, b) => (a.vencimentoISO < b.vencimentoISO ? 1 : -1))[0];
    if (f) h += '<div class="card"><h2>Fatura do cartão</h2><div class="row between"><div class="mid orange">' + brl(f.total) + '</div><div class="muted small">vence ' + esc(f.vencimento.slice(0, 5)) + '</div></div></div>';
    if (al.atencao.length) h += '<div class="card"><h2>Precisa da sua atenção</h2><div class="stack">' + al.atencao.map(alertItem).join('') + '</div></div>';
    if (al.bem.length) h += '<div class="card"><h2>Você está indo bem</h2><div class="stack">' + al.bem.map((b) => '<div class="note ok">' + esc(b.texto) + '</div>').join('') + '</div></div>';
    const cats = Object.entries(v.porCat).sort((a, b) => b[1] - a[1]);
    if (cats.length) {
      const max = cats[0][1];
      h += '<div class="card"><h2>Para onde foi o dinheiro</h2>' + cats.slice(0, 8).map(([c, val]) => { const co = catObj(c); return '<div class="cat-row" data-act="goCat" data-c="' + esc(c) + '"><div class="row between"><span class="row"><span class="badge" style="background:' + co.color + '22;color:' + co.color + '">' + esc(c) + '</span></span><span class="money">' + brl(val) + '</span></div><div class="bar"><i style="width:' + (val / max * 100) + '%;background:' + co.color + '"></i></div></div>'; }).join('') + '</div>';
    }
    return h;
  }
  function alertItem(a) {
    if (a.tipo === 'decisao') return '<div class="note warn"><div style="margin-bottom:10px">' + esc(a.texto) + '</div><div class="row"><button class="btn small" data-act="decStill" data-id="' + a.id + '">Ainda quero</button><button class="btn small ghost" data-act="decDrop" data-id="' + a.id + '">Desisti</button></div></div>';
    if (a.tipo === 'sem-cat') return '<div class="note warn row between"><span>' + esc(a.texto) + '</span><button class="link" data-act="startAsk">Categorizar</button></div>';
    return '<div class="note warn">' + esc(a.texto) + '</div>';
  }

  /* ----- Orçamento ----- */
  function vOrcamento() {
    const v = E.visaoMes(S, refDate()); const sug = E.sugerirLimites(S, today()); const meses = E.monthsWithData(S).length;
    let h = monthNav();
    h += '<div class="card"><h2>Renda mensal</h2><div class="row"><input class="input" id="rendaIn" inputmode="decimal" placeholder="Ex.: 6.000,00" value="' + (S.settings.renda ? String(S.settings.renda).replace('.', ',') : '') + '"><button class="btn small" data-act="saveRenda">Salvar</button></div>' +
      '<p class="muted small" style="margin-top:8px">Limite de gasto: ' + S.settings.limitePct + '% da renda' + (S.settings.renda ? ' = ' + brl0(S.settings.renda * S.settings.limitePct / 100) : '') + '. Ajuste em Mais › Ajustes.</p></div>';
    h += '<div class="card"><h2>Plano por categoria</h2>';
    if (sug) h += '<div class="note ok row between" style="margin-bottom:10px"><span>Tenho sugestões baseadas nos seus últimos meses.</span><button class="link" data-act="applySug">Usar</button></div>';
    else h += '<p class="muted small" style="margin-bottom:10px">As sugestões de limite aparecem depois de 2–3 meses de extratos (você tem ' + meses + '). Por enquanto, defina os limites que quiser.</p>';
    const cats = S.cats.filter((c) => !['Receita', 'Cartão de Crédito', 'Transferência'].includes(c.name));
    h += cats.map((c) => { const lim = +S.budget[c.name] || 0; const g = v.porCat[c.name] || 0; const pct = lim ? Math.min(100, g / lim * 100) : 0; const cls = lim && g > lim ? 'bad' : pct > 85 ? 'warn' : 'ok';
      return '<div class="cat-row"><div class="row between"><span class="badge" style="background:' + c.color + '22;color:' + c.color + '">' + esc(c.name) + '</span><span class="small muted">' + brl(g) + (lim ? ' de' : '') + '</span><input class="input" style="width:110px;padding:8px 10px;text-align:right" inputmode="decimal" placeholder="limite" data-chg="budget" data-c="' + esc(c.name) + '" value="' + (lim ? String(lim).replace('.', ',') : '') + '"></div>' + (lim ? '<div class="bar ' + cls + '"><i style="width:' + pct + '%"></i></div>' : '') + '</div>'; }).join('');
    h += '</div>';
    if (v.plano.somaLimites && S.settings.renda) h += '<p class="muted small" style="padding:0 6px 8px">Soma dos limites: ' + brl0(v.plano.somaLimites) + (v.plano.somaLimites > S.settings.renda * S.settings.limitePct / 100 ? ' — acima do seu teto de ' + brl0(S.settings.renda * S.settings.limitePct / 100) + '.' : '.') + '</p>';
    return h;
  }

  /* ----- Transações ----- */
  function txRow(t) {
    const co = catObj(t.cat), sel = view.sel.has(t.id);
    return '<div class="tx" data-act="txTap" data-id="' + t.id + '">' + (view.selMode ? '<span class="check' + (sel ? ' on' : '') + '"></span>' : '') +
      '<div class="ic" style="background:' + co.color + '22;color:' + co.color + '">' + catIc(t.cat) + '</div><div class="mid-col"><div class="nm">' + esc(t.nome) + '</div><div class="sub"><span class="badge" style="background:' + co.color + '22;color:' + co.color + '">' + esc(t.cat || 'Sem categoria') + '</span><span class="acc">' + (t.conta === 'cartao' ? 'Cartão' : 'Conta') + (t.parcela ? ' · ' + t.parcela.n + '/' + t.parcela.de : '') + (t.transfer ? ' · transferência' : '') + '</span></div></div>' +
      '<div class="money ' + (t.valor > 0 && !t.transfer ? 'pos' : '') + '">' + brl(t.valor) + '</div></div>';
  }
  function txListHtml() {
    const list = filteredTx(); if (!list.length) return '<div class="empty">Nenhum lançamento por aqui.</div>';
    const tot = list.filter((t) => !t.transfer).reduce((s, t) => s + t.valor, 0);
    let h = '<div class="muted small" style="padding:0 2px 4px">' + list.length + ' lançamentos · saldo do filtro <b class="' + (tot >= 0 ? 'pos' : '') + '">' + brl(tot) + '</b></div><div class="card" style="padding:4px 16px">'; let last = '';
    list.forEach((t) => { if (t.data !== last) { last = t.data; h += '<div class="day"><span>' + dm(t.data) + '</span></div>'; } h += txRow(t); });
    return h + '</div>';
  }
  function vTransacoes() {
    const usedCats = [...new Set(S.tx.map((t) => t.cat || 'Sem categoria'))].sort();
    let h = '<input class="input" id="qIn" placeholder="Buscar lançamento" value="' + esc(view.q) + '" style="margin-bottom:10px">';
    h += '<div class="seg"><button class="' + (view.periodo === 'mes' ? 'on' : '') + '" data-act="periodo" data-v="mes">Mês</button><button class="' + (view.periodo === 'tudo' ? 'on' : '') + '" data-act="periodo" data-v="tudo">Tudo</button></div>';
    if (view.periodo === 'mes') h += monthNav();
    h += '<div class="chips">' + [['todas', 'Todas'], ['despesas', 'Despesas'], ['receitas', 'Receitas']].map(([k, l]) => '<button class="chip' + (view.tipo === k ? ' on' : '') + '" data-act="tipo" data-v="' + k + '">' + l + '</button>').join('') + '<button class="chip' + (view.conta === 'cc' ? ' on' : '') + '" data-act="conta" data-v="cc">Conta corrente</button><button class="chip' + (view.conta === 'cartao' ? ' on' : '') + '" data-act="conta" data-v="cartao">Cartão</button></div>';
    h += '<div class="chips"><button class="chip' + (!view.cat ? ' on' : '') + '" data-act="catf" data-c="">Todas as categorias</button>' + usedCats.map((c) => '<button class="chip' + (view.cat === c ? ' on' : '') + '" data-act="catf" data-c="' + esc(c) + '"><span class="dot" style="background:' + catObj(c).color + '"></span>' + esc(c) + '</button>').join('') + '</div>';
    h += '<div class="row between" style="padding:4px 2px 8px"><span></span><button class="link" data-act="selMode">' + (view.selMode ? 'Cancelar seleção' : 'Selecionar') + '</button></div>';
    return h + '<div id="txlist">' + txListHtml() + '</div>';
  }
  function renderSelbar() {
    let b = $('selbar'); if (!b) { b = document.createElement('div'); b.id = 'selbar'; b.className = 'selbar'; document.body.appendChild(b); }
    b.hidden = !(view.selMode && view.name === 'transacoes');
    b.innerHTML = '<button class="btn small" data-act="bulkCat">Categoria (' + view.sel.size + ')</button><button class="btn small danger" data-act="bulkDel">Excluir</button><button class="btn small ghost" data-act="selAll">Todos</button>';
  }

  /* ----- Decidir ----- */
  function vDecidir() {
    const d = dec; let h = '';
    const pend = S.decisoes.filter((x) => x.status === 'pendente');
    if (d.step === 0) {
      h += '<div class="card"><h2>Antes de comprar</h2><p class="muted small" style="margin-bottom:12px">Vou olhar seu mês, as parcelas que já estão por vir e dizer se cabe.</p><label class="f" style="margin-top:0">O que você quer comprar?</label><input class="input" id="dItem" placeholder="Ex.: tênis, fone, jaqueta" value="' + esc(d.item) + '"><div style="height:14px"></div><button class="btn" data-act="dNext">Continuar</button></div>';
    } else if (d.step === 1) {
      h += '<div class="card"><h2>' + esc(d.item) + '</h2><p class="mid" style="margin-bottom:12px">Quanto você precisa disso?</p>' +
        [['preciso', 'Preciso muito', 'Melhora meu dia a dia'], ['quero', 'Quero muito', 'Mas não é necessário nem urgente'], ['impulso', 'Compra impulsiva', 'Deu vontade agora']].map(([k, a, b]) => '<button class="opt' + (d.nec === k ? ' on' : '') + '" data-act="dNec" data-v="' + k + '"><b>' + a + '</b><span>' + b + '</span></button>').join('') + '</div>';
    } else if (d.step === 2) {
      h += '<div class="card"><h2>' + esc(d.item) + '</h2><label class="f" style="margin-top:0">Quanto custa?</label><input class="input" id="dPreco" inputmode="decimal" placeholder="R$ 0,00" value="' + esc(d.preco) + '"><div style="height:14px"></div><button class="btn" data-act="dNext">Continuar</button></div>';
    } else if (d.step === 3) {
      h += '<div class="card"><h2>Como você vai pagar?</h2>' + [['avista', 'À vista', 'Sai tudo neste mês'], ['parcelado', 'Parcelado', 'Divido em parcelas'], ['sistema', 'Você decide', 'Escolho a forma que pesa menos']].map(([k, a, b]) => '<button class="opt' + (d.forma === k ? ' on' : '') + '" data-act="dForma" data-v="' + k + '"><b>' + a + '</b><span>' + b + '</span></button>').join('') + '</div>';
    } else if (d.step === 4) {
      h += '<div class="card"><h2>Parcelamento</h2><label class="f" style="margin-top:0">Quantas parcelas?</label><input class="input" id="dParc" inputmode="numeric" value="' + esc(d.parcelas) + '"><label class="f">Tem juros?</label><div class="seg">' + [['nao', 'Não'], ['sim', 'Sim'], ['nao-sei', 'Não sei']].map(([k, l]) => '<button class="' + (d.juros === k ? 'on' : '') + '" data-act="dJuros" data-v="' + k + '">' + l + '</button>').join('') + '</div><p class="muted small">Se houver juros ou você não souber, estimo com a taxa de parcelamento do cartão (5,99% a.m.).</p><div style="height:14px"></div><button class="btn" data-act="dCalc">Ver resultado</button></div>';
    } else if (d.step === 5 && d.res) {
      const r = d.res; h += '<div class="verdict ' + r.veredito + '"><h2>' + esc(r.titulo) + '</h2><p>' + esc(r.texto) + '</p></div>';
      if (r.escolha) h += '<div class="card"><h2>Resumo</h2><div class="stack"><div class="row between"><span class="muted">Forma</span><b>' + (r.escolha.forma === 'avista' ? 'À vista' : r.escolha.n + 'x de ' + brl(r.escolha.mensal)) + '</b></div>' + (r.usouJurosEstimado ? '<div class="row between"><span class="muted">Total estimado c/ juros</span><b>' + brl(r.escolha.total) + '</b></div>' : '') + '<div class="row between"><span class="muted">Gasto do mês + parcelas por vir</span><b>' + brl(r.base) + '</b></div><div class="row between"><span class="muted">Com essa compra</span><b>' + brl(r.projetado) + '</b></div><div class="row between"><span class="muted">Seu limite do mês</span><b>' + brl(r.teto) + '</b></div><div class="row between"><span class="muted">Sobra</span><b class="' + (r.sobra < 0 ? 'orange' : 'pos') + '">' + brl(r.sobra) + '</b></div></div></div>';
      h += '<div class="stack"><button class="btn" data-act="dSave" data-v="comprei">Vou comprar</button><button class="btn ghost" data-act="dSave" data-v="amanha">Na dúvida, decide amanhã</button><button class="btn ghost" data-act="dSave" data-v="desisti">Desisti</button><button class="link" data-act="dReset" style="display:block;margin:6px auto">Nova análise</button></div>';
    }
    if (d.step > 0 && d.step < 5) h += '<p style="text-align:center;margin:6px 0"><button class="link" data-act="dBack">Voltar</button></p>';
    if (d.step === 0 && pend.length) h += '<div class="card"><h2>Para decidir amanhã</h2>' + pend.map((x) => '<div class="row between" style="padding:8px 0"><span>' + esc(x.item) + ' <span class="muted small">' + brl(x.preco) + '</span></span><span class="small muted">' + (x.seguir <= today() ? 'hoje' : dm(x.seguir)) + '</span></div>').join('') + '</div>';
    const hist = S.decisoes.filter((x) => x.status !== 'pendente').slice(-5).reverse();
    if (d.step === 0 && hist.length) h += '<div class="card"><h2>Últimas decisões</h2>' + hist.map((x) => '<div class="row between" style="padding:8px 0"><span>' + esc(x.item) + '</span><span class="small muted">' + ({ comprei: 'comprou', desisti: 'desistiu', ainda: 'ainda quer' }[x.status] || x.status) + ' · ' + brl(x.preco) + '</span></div>').join('') + '</div>';
    return h;
  }

  /* ----- Mais ----- */
  function vMais() {
    const sub = view.sub; if (sub === 'parcelas') return vParcelas(); if (sub === 'recorrentes') return vRecorrentes(); if (sub === 'metas') return vMetas(); if (sub === 'reserva') return vReserva(); if (sub === 'ajustes') return vAjustes();
    const items = [['parcelas', 'Parcelamentos', 'Parcelas em andamento e meses pendentes'], ['recorrentes', 'Recorrentes e custos anuais', 'Gastos que se repetem'], ['metas', 'Metas', 'Quanto guardar por mês'], ['reserva', 'Reserva de emergência', '6 meses dos seus gastos'], ['ajustes', 'Ajustes', 'Renda, limites, categorias, tema, backup']];
    return '<div class="card" style="padding:4px 16px">' + items.map(([k, a, b]) => '<button class="menu-item" data-act="sub" data-v="' + k + '"><span><b>' + a + '</b><br><span class="muted small">' + b + '</span></span><span class="muted">›</span></button>').join('') + '</div><p class="muted small" style="text-align:center">Conectada como <b>' + esc(nick) + '</b></p>';
  }
  const back = () => '<button class="link" data-act="sub" data-v="" style="margin-bottom:10px">‹ Mais</button>';
  function vParcelas() {
    const Pp = E.parcelamentos(S, today()); if (!Pp.length) return back() + '<div class="empty">Nenhum parcelamento em andamento.<br>Eles aparecem quando você envia a fatura do cartão.</div>';
    const total = Pp.reduce((s, p) => s + p.restanteTotal, 0); const start = E.addMonths(E.ym(today()), 0); const comp = E.compromissosPorMes(Pp, Pp.reduce((m, p) => (p.meses[0] < m ? p.meses[0] : m), Pp[0].meses[0]), 8);
    let h = back() + '<div class="card hero"><h2>Ainda vai pagar</h2><div class="big">' + brl(total) + '</div><p class="muted small">em ' + Pp.length + ' parcelamentos</p></div>';
    h += '<div class="card"><h2>Mês a mês</h2>' + Object.entries(comp).filter(([, v]) => v > 0).map(([m, v]) => '<div class="row between" style="padding:6px 0"><span class="cap">' + esc(E.monthLabel(m)) + '</span><b class="money">' + brl(v) + '</b></div>').join('') + '</div>';
    h += '<div class="card"><h2>Em andamento</h2>' + Pp.map((p) => '<div style="padding:10px 0;border-bottom:1px solid var(--line)"><div class="row between"><b>' + esc(p.nome) + '</b><span class="money">' + brl(p.valor) + '</span></div><div class="muted small" style="margin:2px 0 6px">Parcela ' + p.n + ' de ' + p.de + ' · faltam ' + p.restantes + ' (' + brl(p.restanteTotal) + ')</div><div class="bar"><i style="width:' + (p.n / p.de * 100) + '%"></i></div><div class="chips" style="margin-top:8px">' + p.meses.map((m) => '<span class="chip" style="padding:4px 10px;font-size:12px">' + m.slice(5) + '/' + m.slice(2, 4) + '</span>').join('') + '</div></div>').join('') + '</div>';
    return h;
  }
  function vRecorrentes() {
    const r = E.recorrentes(S);
    if (!r.pronto) return back() + '<div class="card"><h2>Recorrentes</h2><p class="muted">Preciso de pelo menos 3 meses de extratos para reconhecer o que se repete. Faltam ' + r.faltam + ' mês(es).</p></div>';
    if (!r.itens.length) return back() + '<div class="empty">Ainda não encontrei gastos que se repetem todo mês.</div>';
    const tot = r.itens.reduce((s, i) => s + i.anual, 0);
    return back() + '<div class="card hero"><h2>Custo anual dos recorrentes</h2><div class="big">' + brl(tot) + '</div><p class="muted small">' + brl(tot / 12) + ' por mês</p></div><div class="card" style="padding:4px 16px">' + r.itens.map((i) => '<div class="tx"><div class="ic" style="background:' + catObj(i.cat).color + '22;color:' + catObj(i.cat).color + '">' + catIc(i.cat) + '</div><div class="mid-col"><div class="nm">' + esc(i.nome) + '</div><div class="muted small">' + brl(i.mensal) + ' por mês · ' + i.meses + ' meses</div></div><div class="money">' + brl(i.anual) + '<div class="muted small" style="text-align:right;font-weight:400">por ano</div></div></div>').join('') + '</div>';
  }
  function vMetas() {
    let h = back() + '<button class="btn" data-act="metaNew" style="margin-bottom:12px">Nova meta</button>';
    if (!S.metas.length) return h + '<div class="empty">Crie uma meta para saber quanto guardar por mês.</div>';
    return h + S.metas.map((m) => { const c = E.metaMensal(m, today()); const pct = Math.min(100, (m.atual || 0) / m.alvo * 100); return '<div class="card" data-act="metaEdit" data-id="' + m.id + '"><div class="row between"><b>' + esc(m.nome) + '</b><span class="muted small">até ' + m.data.slice(5) + '/' + m.data.slice(0, 4) + '</span></div><div class="bar" style="margin:10px 0"><i style="width:' + pct + '%"></i></div><div class="row between small"><span class="muted">' + brl(m.atual || 0) + ' de ' + brl(m.alvo) + '</span><b>' + (c.falta > 0 ? 'Guardar ' + brl(c.mensal) + '/mês' : 'Meta atingida') + '</b></div></div>'; }).join('');
  }
  function vReserva() {
    const r = E.reserva(S, today()); const tenho = +S.settings.reservaAtual || 0; const pct = r.alvo ? Math.min(100, tenho / r.alvo * 100) : 0;
    if (!r.alvo) return back() + '<div class="empty">Preciso de pelo menos um mês de gastos para calcular sua reserva.</div>';
    return back() + '<div class="card hero"><h2>Meta da reserva</h2><div class="big">' + brl(r.alvo) + '</div><p class="muted small">' + r.meses + ' meses de gastos · média de ' + brl(r.mediaMensal) + ' por mês (base: ' + r.base + ' mês(es))</p></div><div class="card"><h2>Quanto já tenho</h2><div class="row"><input class="input" id="resIn" inputmode="decimal" placeholder="R$ 0,00" value="' + (tenho ? String(tenho).replace('.', ',') : '') + '"><button class="btn small" data-act="saveRes">Salvar</button></div><div class="bar" style="margin:14px 0 8px"><i style="width:' + pct + '%"></i></div><p class="small muted">' + pct.toFixed(0) + '% da meta · cobre ' + (r.mediaMensal ? (tenho / r.mediaMensal).toFixed(1).replace('.', ',') : 0) + ' meses</p></div>';
  }
  function vAjustes() {
    const s = S.settings;
    return back() + '<div class="card"><h2>Orçamento</h2><label class="f" style="margin-top:0">Renda mensal</label><input class="input" id="aRenda" inputmode="decimal" value="' + (s.renda ? String(s.renda).replace('.', ',') : '') + '"><label class="f">Limite de gasto (% da renda)</label><input class="input" id="aLim" inputmode="numeric" value="' + s.limitePct + '"><label class="f">Meses da reserva de emergência</label><input class="input" id="aRes" inputmode="numeric" value="' + s.reservaMeses + '"><div style="height:14px"></div><button class="btn" data-act="saveAjustes">Salvar</button></div>' +
      '<div class="card"><h2>Aparência</h2><div class="seg">' + [['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Escuro']].map(([k, l]) => '<button class="' + (s.tema === k ? 'on' : '') + '" data-act="tema" data-v="' + k + '">' + l + '</button>').join('') + '</div></div>' +
      '<div class="card" style="padding:4px 16px"><button class="menu-item" data-act="catsMgr"><b>Categorias</b><span class="muted">›</span></button><button class="menu-item" data-act="exportBk"><b>Exportar backup</b><span class="muted">›</span></button><button class="menu-item" data-act="importBk"><b>Importar backup</b><span class="muted">›</span></button><button class="menu-item" data-act="logout"><b>Sair</b><span class="muted">›</span></button></div>' +
      '<button class="btn danger" data-act="wipe">Apagar todos os dados</button>';
  }

  /* ---------- bottom sheet ---------- */
  function openSheet(html) { $('sheet').innerHTML = html; $('sheetWrap').hidden = false; $('sheet').scrollTop = 0; }
  function closeSheet() { $('sheetWrap').hidden = true; $('sheet').innerHTML = ''; editingId = null; }
  function toastMsg(m) { const t = $('toast'); t.textContent = m; t.hidden = false; clearTimeout(toastMsg.t); toastMsg.t = setTimeout(() => { t.hidden = true; }, 3200); }
  const catChips = (sel, act) => '<div class="chips" style="flex-wrap:wrap;overflow:visible">' + S.cats.map((c) => '<button class="chip' + (sel === c.name ? ' on' : '') + '" data-act="' + act + '" data-c="' + esc(c.name) + '"><span class="dot" style="background:' + c.color + '"></span>' + esc(c.name) + '</button>').join('') + '</div>';

  function sheetPlus() {
    openSheet('<h3>Adicionar</h3><p class="muted small" style="margin-bottom:14px">O que você quer fazer?</p><button class="opt" data-act="newExpense"><b>Lançar gasto</b><span>Registre um gasto do dia a dia em segundos</span></button><button class="opt" data-act="pickFile"><b>Extrato ou fatura</b><span>Excel, CSV, OFX ou PDF da conta e do cartão Itaú</span></button>');
  }
  let expCat = 'Alimentação', expConta = 'cartao';
  function sheetExpense() {
    expCat = ''; expConta = 'cartao';
    openSheet('<h3>Lançar gasto</h3><label class="f">Valor</label><input class="input" id="eVal" inputmode="decimal" placeholder="R$ 0,00" style="font-size:24px;font-weight:700"><label class="f">Descrição</label><input class="input" id="eNome" placeholder="Ex.: almoço, Uber"><label class="f">Categoria</label><div id="eCats">' + catChips(expCat, 'eCat') + '</div><label class="f">Pago com</label><div class="seg" id="eConta"><button class="on" data-act="eConta" data-v="cartao">Cartão de crédito</button><button data-act="eConta" data-v="cc">Conta corrente</button></div><label class="f">Data</label><input class="input" id="eData" type="date" value="' + today() + '"><div style="height:16px"></div><button class="btn" data-act="saveExpense">Lançar</button>');
    setTimeout(() => { const i = $('eVal'); if (i) i.focus(); }, 250);
  }
  function sheetEdit(t) {
    editingId = t.id;
    openSheet('<h3>Editar lançamento</h3><label class="f">Nome</label><input class="input" id="xNome" value="' + esc(t.nome) + '"><div class="grid2"><div><label class="f">Valor</label><input class="input" id="xVal" inputmode="decimal" value="' + String(t.valor).replace('.', ',') + '"></div><div><label class="f">Data</label><input class="input" id="xData" type="date" value="' + t.data + '"></div></div><label class="f">Categoria</label><div id="xCats">' + catChips(t.cat, 'xCat') + '</div><label class="f">Conta</label><div class="seg"><button class="' + (t.conta === 'cartao' ? 'on' : '') + '" data-act="xConta" data-v="cartao">Cartão</button><button class="' + (t.conta === 'cc' ? 'on' : '') + '" data-act="xConta" data-v="cc">Conta corrente</button></div><label class="row small" style="margin-top:12px"><input type="checkbox" id="xLearn" checked> Lembrar para lançamentos parecidos</label><div style="height:14px"></div><div class="stack"><button class="btn" data-act="saveEdit">Salvar</button><button class="btn danger" data-act="delTx">Excluir</button></div>');
    sheet_x = { cat: t.cat, conta: t.conta };
  }
  let sheet_x = { cat: null, conta: 'cartao' };

  /* ---------- "Isso é o quê?" ---------- */
  function pendingKeys() {
    const seen = {}; S.tx.filter((t) => !t.cat).forEach((t) => { const k = E.ruleKey(t.nomeOrig || t.nome); (seen[k] = seen[k] || []).push(t); });
    return Object.entries(seen).map(([k, arr]) => ({ k, arr })).sort((a, b) => b.arr.length - a.arr.length);
  }
  function maybeAsk(force) { const q = pendingKeys(); if (q.length && (force || !S.dismissed[today()])) { askQueue = q.map((x) => x.k); showAsk(); } }
  function showAsk() {
    const q = pendingKeys().filter((x) => askQueue.includes(x.k)); if (!q.length) { closeSheet(); render(); return; }
    const cur = q[0], t = cur.arr[0];
    openSheet('<p class="muted small">' + q.length + ' para classificar</p><h3>Isso é o quê?</h3><div class="card" style="margin:12px 0"><div class="nm" style="font-weight:600">' + esc(t.nome) + '</div><div class="muted small">' + dm(t.data) + ' · ' + brl(t.valor) + (cur.arr.length > 1 ? ' · e mais ' + (cur.arr.length - 1) + ' parecido(s)' : '') + '</div></div>' + catChips('', 'askCat') +
      '<div class="row" style="margin-top:8px"><input class="input" id="newCat" placeholder="Nova categoria"><button class="btn small" data-act="askNew">Criar</button></div><div style="height:12px"></div><button class="btn ghost" data-act="askSkip">Pular por agora</button>');
    sheet_ask = cur;
  }
  let sheet_ask = null;
  function askApply(cat) { if (!sheet_ask) return; E.learn(S, sheet_ask.arr[0], cat); askQueue = askQueue.filter((k) => k !== sheet_ask.k); save(); showAsk(); }

  /* ---------- importação ---------- */
  async function readFileLines(file) {
    const name = file.name.toLowerCase();
    if (name.endsWith('.pdf')) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      const doc = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise; const pages = [];
      for (let i = 1; i <= doc.numPages; i++) { const pg = await doc.getPage(i); const vp = pg.getViewport({ scale: 1 }); const tc = await pg.getTextContent(); pages.push({ width: vp.width, items: tc.items.map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width })) }); }
      const r = P.parseItauCardPages(pages);
      if (!r.lancamentos.length || !r.resumo.total) throw new Error('Não reconheci essa fatura. Se puder, envie o arquivo da fatura em CSV ou o PDF original do Itaú.');
      const iso = (s) => s ? s.slice(6) + '-' + s.slice(3, 5) + '-' + s.slice(0, 2) : null;
      return { lines: r.lancamentos, source: 'fatura', meta: { vencimento: r.resumo.vencimento, vencimentoISO: iso(r.resumo.vencimento), fechamentoISO: iso(r.resumo.fechamento), total: r.resumo.total, limite: r.resumo.limite }, check: Math.abs(r.resumo.somaLancamentos - r.resumo.total) < 0.02 };
    }
    if (/\.(xls|xlsx)$/.test(name)) {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' }); const sh = wb.Sheets['Lançamentos'] || wb.Sheets[wb.SheetNames[0]];
      const r = P.parseItauXLS(XLSX.utils.sheet_to_json(sh, { header: 1, raw: true }), new Date());
      if (!r.transacoes.length) throw new Error('Não encontrei lançamentos nesse Excel.');
      return { lines: r.transacoes, source: 'extrato' };
    }
    const txt = await file.text();
    const lines = name.endsWith('.ofx') ? P.parseOFX(txt) : P.parseCSV(txt);
    if (!lines.length) throw new Error('Não consegui ler esse arquivo.');
    return { lines, source: 'extrato' };
  }
  async function handleFiles(files) {
    closeSheet(); let msg = [];
    for (const f of files) {
      toastMsg('Lendo ' + f.name + '…');
      try {
        const r = await readFileLines(f); const res = E.importLines(S, r.lines, r.source, r.meta);
        msg.push((r.source === 'fatura' ? 'Fatura' : 'Extrato') + ': ' + res.novos + ' novos' + (res.mesclados ? ', ' + res.mesclados + ' mesclados com seus lançamentos' : '') + (res.duplicados ? ', ' + res.duplicados + ' já existiam' : '') + (r.check === false ? ' (confira o total!)' : ''));
      } catch (e) { msg.push(f.name + ': ' + e.message); }
    }
    save(); view.month = null; render(); toastMsg(msg.join('\n')); maybeAsk(true);
  }

  /* ---------- ações ---------- */
  const A = {
    tab: (el) => { view.name = el.dataset.v; view.sub = null; view.selMode = false; view.sel.clear(); render(); window.scrollTo(0, 0); },
    sub: (el) => { view.sub = el.dataset.v || null; render(); window.scrollTo(0, 0); },
    plus: sheetPlus, closeSheet,
    pickFile: () => { closeSheet(); $('fileIn').value = ''; $('fileIn').click(); },
    newExpense: sheetExpense,
    eCat: (el) => { expCat = el.dataset.c; $('eCats').innerHTML = catChips(expCat, 'eCat'); },
    eConta: (el) => { expConta = el.dataset.v; [...$('eConta').children].forEach((b) => b.classList.toggle('on', b.dataset.v === expConta)); },
    saveExpense: () => {
      const v = parseBR($('eVal').value), nome = $('eNome').value.trim() || (expCat || 'Gasto'); if (!(v > 0)) return toastMsg('Informe o valor.');
      E.addManual(S, { data: $('eData').value || today(), nome, valor: v, cat: expCat || undefined, conta: expConta }); save(); closeSheet(); view.month = null; render(); toastMsg('Gasto lançado');
    },
    txTap: (el) => {
      const t = S.tx.find((x) => x.id === el.dataset.id); if (!t) return;
      if (view.selMode) { view.sel.has(t.id) ? view.sel.delete(t.id) : view.sel.add(t.id); render(); } else sheetEdit(t);
    },
    xCat: (el) => { sheet_x.cat = el.dataset.c; $('xCats').innerHTML = catChips(sheet_x.cat, 'xCat'); },
    xConta: (el) => { sheet_x.conta = el.dataset.v; [...el.parentNode.children].forEach((b) => b.classList.toggle('on', b === el)); },
    saveEdit: () => {
      const t = S.tx.find((x) => x.id === editingId); if (!t) return; const v = parseBR($('xVal').value); if (isNaN(v)) return toastMsg('Valor inválido.');
      t.nome = $('xNome').value.trim() || t.nome; t.valor = v; t.data = $('xData').value || t.data; t.conta = sheet_x.conta;
      if (sheet_x.cat) { if ($('xLearn').checked) E.learn(S, t, sheet_x.cat); else t.cat = sheet_x.cat; }
      save(); closeSheet(); render();
    },
    delTx: () => { if (!confirm('Excluir este lançamento?')) return; S.tx = S.tx.filter((x) => x.id !== editingId); save(); closeSheet(); render(); },
    mprev: () => { view.month = E.addMonths(currentMonth(), -1); render(); }, mnext: () => { view.month = E.addMonths(currentMonth(), 1); render(); },
    periodo: (el) => { view.periodo = el.dataset.v; render(); }, tipo: (el) => { view.tipo = el.dataset.v; render(); },
    conta: (el) => { view.conta = view.conta === el.dataset.v ? '' : el.dataset.v; render(); }, catf: (el) => { view.cat = el.dataset.c; render(); },
    goCat: (el) => { view.name = 'transacoes'; view.cat = el.dataset.c; view.tipo = 'despesas'; view.periodo = 'mes'; render(); window.scrollTo(0, 0); },
    goAjustes: () => { view.name = 'mais'; view.sub = 'ajustes'; render(); },
    selMode: () => { view.selMode = !view.selMode; view.sel.clear(); render(); }, selAll: () => { filteredTx().forEach((t) => view.sel.add(t.id)); render(); },
    bulkCat: () => { if (!view.sel.size) return toastMsg('Selecione lançamentos.'); openSheet('<h3>Categoria para ' + view.sel.size + ' lançamento(s)</h3><div style="height:10px"></div>' + catChips('', 'bulkApply')); },
    bulkApply: (el) => { S.tx.forEach((t) => { if (view.sel.has(t.id)) t.cat = el.dataset.c; }); save(); view.sel.clear(); view.selMode = false; closeSheet(); render(); },
    bulkDel: () => { if (!view.sel.size || !confirm('Excluir ' + view.sel.size + ' lançamento(s)?')) return; S.tx = S.tx.filter((t) => !view.sel.has(t.id)); save(); view.sel.clear(); view.selMode = false; render(); },
    startAsk: () => maybeAsk(true), askCat: (el) => askApply(el.dataset.c),
    askNew: () => { const n = $('newCat').value.trim(); if (!n) return; if (!S.cats.some((c) => c.name.toLowerCase() === n.toLowerCase())) S.cats.push({ id: E.uid(), name: n, color: '#' + ((Math.random() * 0x777777 + 0x555555) | 0).toString(16).padStart(6, '0') }); askApply(n); },
    askSkip: () => { if (sheet_ask) askQueue = askQueue.filter((k) => k !== sheet_ask.k); S.dismissed[today()] = true; save(); showAsk(); },
    saveRenda: () => { const v = parseBR($('rendaIn').value); S.settings.renda = isNaN(v) ? 0 : v; save(); render(); toastMsg('Renda salva'); },
    applySug: () => { const s = E.sugerirLimites(S, today()); if (s) { S.budget = s; save(); render(); toastMsg('Limites sugeridos aplicados'); } },
    saveAjustes: () => { const r = parseBR($('aRenda').value); S.settings.renda = isNaN(r) ? 0 : r; S.settings.limitePct = Math.min(100, Math.max(30, parseInt($('aLim').value, 10) || 90)); S.settings.reservaMeses = Math.min(24, Math.max(1, parseInt($('aRes').value, 10) || 6)); save(); render(); toastMsg('Ajustes salvos'); },
    tema: (el) => { S.settings.tema = el.dataset.v; applyTheme(); save(); render(); },
    saveRes: () => { const v = parseBR($('resIn').value); S.settings.reservaAtual = isNaN(v) ? 0 : v; save(); render(); },
    metaNew: () => sheetMeta(null), metaEdit: (el) => sheetMeta(S.metas.find((m) => m.id === el.dataset.id)),
    saveMeta: (el) => {
      const nome = $('mNome').value.trim(), alvo = parseBR($('mAlvo').value), data = $('mData').value; if (!nome || !(alvo > 0) || !data) return toastMsg('Preencha nome, valor e data.');
      const atual = parseBR($('mAtual').value) || 0; const id = el.dataset.id;
      if (id) Object.assign(S.metas.find((m) => m.id === id), { nome, alvo, data, atual }); else S.metas.push({ id: E.uid(), nome, alvo, data, atual }); save(); closeSheet(); render();
    },
    delMeta: (el) => { S.metas = S.metas.filter((m) => m.id !== el.dataset.id); save(); closeSheet(); render(); },
    /* decidir */
    dNext: () => { if (dec.step === 0) { dec.item = $('dItem').value.trim(); if (!dec.item) return toastMsg('Diga o que quer comprar.'); } if (dec.step === 2) { const v = parseBR($('dPreco').value); if (!(v > 0)) return toastMsg('Informe o preço.'); dec.preco = String(v); } dec.step++; render(); },
    dNec: (el) => { dec.nec = el.dataset.v; dec.step = 2; render(); },
    dForma: (el) => { dec.forma = el.dataset.v; if (dec.forma === 'parcelado') { dec.step = 4; render(); } else calcDecisao(); },
    dJuros: (el) => { dec.juros = el.dataset.v; [...el.parentNode.children].forEach((b) => b.classList.toggle('on', b === el)); },
    dCalc: () => { dec.parcelas = String(parseInt($('dParc').value, 10) || 2); if (!dec.juros) return toastMsg('Diga se tem juros.'); calcDecisao(); },
    dBack: () => { dec.step = dec.step === 4 ? 3 : dec.step - 1; render(); }, dReset: () => { dec = { step: 0, item: '', nec: '', preco: '', forma: '', parcelas: '6', juros: '', res: null }; render(); },
    dSave: (el) => {
      const v = el.dataset.v; const base = { id: E.uid(), item: dec.item, nec: dec.nec, preco: +dec.preco, criada: today(), veredito: dec.res && dec.res.veredito };
      S.decisoes.push(v === 'amanha' ? { ...base, status: 'pendente', seguir: tomorrow() } : { ...base, status: v });
      save(); toastMsg(v === 'amanha' ? 'Combinado. Amanhã eu pergunto de novo.' : v === 'comprei' ? 'Anotado' : 'Boa decisão'); A.dReset();
    },
    decStill: (el) => { const d = S.decisoes.find((x) => x.id === el.dataset.id); if (d) { dec = { step: 1, item: d.item, nec: d.nec || '', preco: String(d.preco), forma: '', parcelas: '6', juros: '', res: null }; d.status = 'ainda'; save(); view.name = 'decidir'; render(); } },
    decDrop: (el) => { const d = S.decisoes.find((x) => x.id === el.dataset.id); if (d) { d.status = 'desisti'; save(); render(); toastMsg('Boa decisão'); } },
    /* ajustes */
    catsMgr: () => { openSheet('<h3>Categorias</h3><div style="height:8px"></div>' + S.cats.map((c) => '<div class="row" style="margin-bottom:8px"><input type="color" value="' + c.color + '" data-chg="catColor" data-c="' + esc(c.name) + '" style="width:44px;height:44px;border:0;background:none"><input class="input" value="' + esc(c.name) + '" data-chg="catName" data-c="' + esc(c.name) + '"><button class="link" data-act="catDel" data-c="' + esc(c.name) + '">Excluir</button></div>').join('') + '<div class="row"><input class="input" id="catNew" placeholder="Nova categoria"><button class="btn small" data-act="catAdd">Adicionar</button></div>'); },
    catAdd: () => { const n = $('catNew').value.trim(); if (n && !S.cats.some((c) => c.name.toLowerCase() === n.toLowerCase())) { S.cats.push({ id: E.uid(), name: n, color: '#b03d6e' }); save(); A.catsMgr(); } },
    catDel: (el) => { const n = el.dataset.c; if (S.tx.some((t) => t.cat === n)) return toastMsg('Há lançamentos nessa categoria. Mude-os antes.'); S.cats = S.cats.filter((c) => c.name !== n); save(); A.catsMgr(); },
    exportBk: () => { const { _seen, ...clean } = S; const b = new Blob([JSON.stringify(clean)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'fintrack-backup-' + today() + '.json'; a.click(); },
    importBk: () => { const i = document.createElement('input'); i.type = 'file'; i.accept = '.json'; i.onchange = async () => { try { const d = JSON.parse(await i.files[0].text()); if (!d.tx || !d.cats) throw 0; if (!confirm('Substituir os dados atuais pelo backup?')) return; S = normalize(d); save(); render(); toastMsg('Backup importado'); } catch (e) { toastMsg('Arquivo de backup inválido.'); } }; i.click(); },
    wipe: () => { if (!confirm('Apagar TODOS os dados? Isso não pode ser desfeito.')) return; S = E.newState(); save(); view.month = null; render(); toastMsg('Dados apagados'); },
    logout: async () => { if (confirm('Sair deste aparelho?')) await doLogout(false); },
    toggleLogin: () => { loginMode = loginMode === 'login' ? 'register' : 'login'; showLogin(); }, doLogin: doLoginAct
  };
  function calcDecisao() { dec.res = E.decidir(S, today(), { necessidade: dec.nec, preco: +dec.preco, forma: dec.forma, parcelas: +dec.parcelas, juros: dec.juros }); dec.step = 5; render(); }
  function sheetMeta(m) {
    openSheet('<h3>' + (m ? 'Editar meta' : 'Nova meta') + '</h3><label class="f">Nome</label><input class="input" id="mNome" value="' + esc(m ? m.nome : '') + '" placeholder="Ex.: viagem, notebook"><label class="f">Quanto quero juntar</label><input class="input" id="mAlvo" inputmode="decimal" value="' + (m ? String(m.alvo).replace('.', ',') : '') + '"><label class="f">Até quando</label><input class="input" id="mData" type="month" value="' + (m ? m.data : '') + '"><label class="f">Quanto já tenho</label><input class="input" id="mAtual" inputmode="decimal" value="' + (m && m.atual ? String(m.atual).replace('.', ',') : '') + '"><div style="height:16px"></div><div class="stack"><button class="btn" data-act="saveMeta" data-id="' + (m ? m.id : '') + '">Salvar</button>' + (m ? '<button class="btn danger" data-act="delMeta" data-id="' + m.id + '">Excluir</button>' : '') + '</div>');
  }

  /* ---------- eventos ---------- */
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]'); if (!el) return; const fn = A[el.dataset.act];
    if (fn) { e.preventDefault(); fn(el, e); }
  });
  document.addEventListener('change', (e) => {
    const el = e.target.closest('[data-chg]'); if (!el) return; const c = el.dataset.c;
    if (el.dataset.chg === 'budget') { const v = parseBR(el.value); if (isNaN(v) || v <= 0) delete S.budget[c]; else S.budget[c] = v; save(); render(); }
    else if (el.dataset.chg === 'catColor') { const o = S.cats.find((x) => x.name === c); if (o) { o.color = el.value; save(); } }
    else if (el.dataset.chg === 'catName') { const o = S.cats.find((x) => x.name === c); const n = el.value.trim(); if (o && n && n !== c) { S.tx.forEach((t) => { if (t.cat === c) t.cat = n; }); Object.keys(S.rules).forEach((k) => { if (S.rules[k] === c) S.rules[k] = n; }); if (S.budget[c] != null) { S.budget[n] = S.budget[c]; delete S.budget[c]; } o.name = n; save(); } }
  });
  document.addEventListener('input', (e) => { if (e.target.id === 'qIn') { view.q = e.target.value; const l = $('txlist'); if (l) l.innerHTML = txListHtml(); } });
  document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.closest('#login')) doLoginAct(); });
  $('fileIn').addEventListener('change', (e) => { if (e.target.files.length) handleFiles([...e.target.files]); });

  /* expõe para testes */
  window.__ft = { get S() { return S; }, set S(v) { S = v; }, render, view };
  boot();
})();
