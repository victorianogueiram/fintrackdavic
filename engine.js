/* Fintrack — motor de regras e cálculos (sem DOM). */
(function (root) {
  'use strict';

  const DEFAULT_CATS = [
    ['Alimentação', '#e8833a'], ['Transporte', '#3b82c4'], ['Assinaturas', '#8b5cf6'], ['Saúde', '#d9485f'],
    ['Lazer', '#e0a21b'], ['Moradia', '#2f9e8f'], ['Educação', '#4f6bd8'], ['Vestuário', '#c2569c'],
    ['PIX', '#64748b'], ['Receita', '#2e9e5b'], ['Coleção', '#b07a3a'], ['Pet', '#7a9e2e'], ['Telefone', '#3aa3b0'],
    ['Feira', '#6fa03c'], ['MEI', '#9a6bd1'], ['Empréstimo', '#a14a4a'], ['Compras', '#d9778a'],
    ['Cartão de Crédito', '#8a8a93'], ['Transferência', '#a8a8b3'], ['Outros', '#9a9aa5']
  ].map(([name, color], i) => ({ id: 'c' + i, name, color }));

  const GUESS = [
    [/UBER|99\b|99\*|TAXI|CABIFY/i, 'Transporte'], [/IFOOD|IFD\*|RESTAURANTE|LANCH|CAFE|PADARIA|CONFEITARIA|SUPERMERC|ZAFFARI|BOURBON|MERCADO|FEIRA/i, 'Alimentação'],
    [/NETFLIX|SPOTIFY|DEEZER|YOUTUBE|APPLE\.COM|MUBI|DISNEY|AMAZON PRIME|CLAUDE|ANTHROPIC|HBO|GOOGLE/i, 'Assinaturas'],
    [/PANVEL|FARMAC|DROGA|ZENKLUB|CLINICA|HOSPITAL|UNIMED|DENTIST/i, 'Saúde'], [/PETLOVE|PETZ|COBASI|VETERIN/i, 'Pet'],
    [/SHEIN|RENNER|C&A|ZARA|VESTU/i, 'Vestuário'], [/SYMPLA|CINEMA|INGRESSO|MUSEU|BRINQUEDO/i, 'Lazer'],
    [/CLARO|VIVO|TIM\b|OI\b/i, 'Telefone'], [/ALUGUEL|CONDOM|LUZ|CEEE|RGE|CORSAN|NET\b|ENERGIA/i, 'Moradia'], [/FATURA PAGA/i, 'Cartão de Crédito'], [/PIX|TED\b|DOC\b|TRANSF/i, 'PIX'], [/BOLETO/i, 'Outros']
  ];

  const r2 = (n) => Math.round(n * 100) / 100;
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const ym = (d) => d.slice(0, 7);
  const addMonths = (ymStr, k) => { const [y, m] = ymStr.split('-').map(Number); const d = new Date(y, m - 1 + k, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
  const monthLabel = (ymStr) => { const [y, m] = ymStr.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }); };

  function newState() {
    return {
      v: 2, cats: JSON.parse(JSON.stringify(DEFAULT_CATS)), rules: {}, tx: [], budget: {}, metas: [], decisoes: [],
      faturas: [], settings: { renda: 0, limitePct: 90, saldoConta: null, reservaMeses: 6, tema: 'auto' }, dismissed: {}
    };
  }

  /* chave de aprendizado de um estabelecimento */
  function ruleKey(nome) {
    const toks = String(nome).toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
    if (!toks.length) return '';
    let k = toks[0];
    if (k.length <= 3 && !/^(99|UBER)$/.test(k) && toks[1]) k += ' ' + toks[1];
    return k;
  }
  function guessCat(S, nome, cartaoCatSugerida) {
    const k = ruleKey(nome);
    if (S.rules[k]) return S.rules[k];
    for (const [re, c] of GUESS) if (re.test(nome)) return c;
    return cartaoCatSugerida || null;
  }

  /* importa linhas de extrato/fatura: mescla com lançamentos manuais e evita duplicidade */
  function importLines(S, lines, source, meta) {
    const res = { novos: 0, duplicados: 0, mesclados: 0, perguntar: [] };
    lines.forEach(l0 => {
      const l = Object.assign({}, l0);
      if (meta && meta.fechamentoISO && l.parcela && l.parcela.n > 1) { l.dataCompra = l.data; l.data = meta.fechamentoISO; }
      const conta = l.origem === 'cartao' ? 'cartao' : 'cc';
      // duplicado exato (mesma data, valor e nome, já veio de arquivo)
      const dup = S.tx.find(t => t.origem !== 'manual' && t.conta === conta && (t.data === l.data || t.dataCompra === l.data) && Math.abs(t.valor - l.valor) < 0.005 && t.nomeOrig === l.nome && !t._m);
      if (dup && S._seen && S._seen.has(dup.id)) { /* linha idêntica legítima no mesmo arquivo */ }
      else if (dup) { res.duplicados++; return; }
      // manual correspondente (mesmo valor, data até 4 dias de distância)
      const man = S.tx.find(t => t.origem === 'manual' && !t.casado && Math.abs(t.valor - l.valor) < 0.005 &&
        Math.abs((new Date(t.data) - new Date(l.data)) / 864e5) <= 4 && (t.conta === conta || !t.conta));
      if (man) {
        man.casado = true; man.origem = source; man.data = l.data; man.nomeOrig = l.nome; man.conta = conta;
        man.parcela = l.parcela || man.parcela; res.mesclados++; markSeen(S, man.id); return;
      }
      const invest = /APLICA[CÇ]|RES\.? ?APLIC|RESGATE|CDB|POUPAN/i.test(l.nome);
      const transfer = !!l.transferenciaFatura || invest;
      const k0 = ruleKey(l.nome);
      let cat = transfer ? (invest ? 'Transferência' : 'Cartão de Crédito') : S.rules[k0] || (l.valor > 0 && conta === 'cc' ? 'Receita' : guessCat(S, l.nome, l.categoriaSugerida));
      const t = { id: uid(), data: l.data, nome: l.nome, nomeOrig: l.nome, valor: l.valor, conta, cat, origem: source, parcela: l.parcela || null, transfer, internacional: !!l.internacional, dataCompra: l.dataCompra || null, fat: meta && meta.fechamentoISO ? meta.fechamentoISO.slice(0, 7) : null };
      S.tx.push(t); markSeen(S, t.id); res.novos++;
      if (!cat) res.perguntar.push(t.id);
    });
    S._seen = null;
    if (meta) S.faturas = S.faturas.filter(f => f.vencimento !== meta.vencimento).concat([meta]);
    return res;
  }
  function markSeen(S, id) { (S._seen = S._seen || new Set()).add(id); }

  function addManual(S, { data, nome, valor, cat, conta }) {
    const t = { id: uid(), data, nome, nomeOrig: nome, valor: -Math.abs(valor), conta: conta || 'cartao', cat: cat || guessCat(S, nome) || 'Outros', origem: 'manual', parcela: null, transfer: false };
    S.tx.push(t); return t;
  }
  function learn(S, tx, cat) {
    tx.cat = cat; const k = ruleKey(tx.nomeOrig || tx.nome); if (k) S.rules[k] = cat;
    S.tx.forEach(o => { if (!o.cat && ruleKey(o.nomeOrig || o.nome) === k) o.cat = cat; });
  }

  /* ---------- agregações ---------- */
  const isExpense = (t) => !t.transfer && t.cat !== 'Receita' && !(t.valor > 0 && t.conta === 'cc');
  const isIncome = (t) => !t.transfer && (t.cat === 'Receita' || (t.valor > 0 && t.conta === 'cc'));
  function monthStats(S, month) {
    const tx = S.tx.filter(t => ym(t.data) === month);
    const gasto = r2(-tx.filter(isExpense).reduce((s, t) => s + t.valor, 0));
    const receita = r2(tx.filter(isIncome).reduce((s, t) => s + t.valor, 0));
    const porCat = {};
    tx.filter(isExpense).forEach(t => { const c = t.cat || 'Sem categoria'; porCat[c] = r2((porCat[c] || 0) - t.valor); });
    return { gasto, receita, porCat, n: tx.length };
  }
  function monthsWithData(S) { return [...new Set(S.tx.map(t => ym(t.data)))].sort(); }

  /* ---------- parcelamentos ---------- */
  function parcelamentos(S, today) {
    const series = {};
    S.tx.filter(t => t.parcela && t.conta === 'cartao').forEach(t => {
      const k = ruleKey(t.nomeOrig || t.nome) + '|' + t.parcela.de + '|' + r2(Math.abs(t.valor)).toFixed(0);
      const cur = series[k];
      if (!cur || t.parcela.n > cur.n) series[k] = { nome: t.nome, n: t.parcela.n, de: t.parcela.de, valor: Math.abs(t.valor), ultima: t.data, fat: t.fat || null, cat: t.cat };
    });
    const base = ym(today);
    return Object.values(series).map(s => {
      const restantes = s.de - s.n;
      // próxima cobrança: mês seguinte à última cobrança observada
      const proximoMes = addMonths(s.fat || ym(s.ultima), 1);
      const meses = []; for (let i = 0; i < restantes; i++) meses.push(addMonths(proximoMes, i));
      return { ...s, restantes, restanteTotal: r2(restantes * s.valor), meses };
    }).filter(s => s.restantes > 0).sort((a, b) => a.meses[0] < b.meses[0] ? -1 : 1);
  }
  function compromissosPorMes(P, from, count) {
    const out = {}; for (let i = 0; i < count; i++) out[addMonths(from, i)] = 0;
    P.forEach(p => p.meses.forEach(m => { if (m in out) out[m] = r2(out[m] + p.valor); }));
    return out;
  }

  /* ---------- recorrentes ---------- */
  function recorrentes(S) {
    const meses = monthsWithData(S);
    if (meses.length < 3) return { pronto: false, faltam: 3 - meses.length, itens: [] };
    const g = {};
    S.tx.filter(t => isExpense(t) && t.valor < 0 && !t.parcela).forEach(t => {
      const k = ruleKey(t.nomeOrig || t.nome) + '|' + (t.cat || '');
      (g[k] = g[k] || { nome: t.nome, cat: t.cat, itens: [] }).itens.push(t);
    });
    const itens = [];
    Object.values(g).forEach(x => {
      const porMes = {}; x.itens.forEach(t => { (porMes[ym(t.data)] = porMes[ym(t.data)] || []).push(Math.abs(t.valor)); });
      const ms = Object.keys(porMes).sort(); if (ms.length < 3) return;
      const vals = ms.map(m => porMes[m].reduce((a, b) => a + b, 0) / (porMes[m].length));
      if (porMes[ms[0]].length > 1 && ms.every(m => porMes[m].length > 2)) return; // muito frequente (ex.: transporte) não é recorrente fixo
      const med = [...vals].sort((a, b) => a - b)[Math.floor(vals.length / 2)];
      if (!vals.every(v => Math.abs(v - med) / med <= 0.25)) return;
      itens.push({ nome: x.nome, cat: x.cat, mensal: r2(med), anual: r2(med * 12), meses: ms.length });
    });
    return { pronto: true, itens: itens.sort((a, b) => b.anual - a.anual) };
  }

  /* ---------- plano / livre ---------- */
  function planoMes(S) {
    const lim = Object.values(S.budget).reduce((s, v) => s + (+v || 0), 0);
    const teto = S.settings.renda ? r2(S.settings.renda * S.settings.limitePct / 100) : 0;
    return { teto, somaLimites: r2(lim), plano: lim > 0 ? r2(lim) : teto };
  }
  function visaoMes(S, today) {
    const month = ym(today); const st = monthStats(S, month); const P = parcelamentos(S, today);
    const pl = planoMes(S);
    // parcelas que ainda vão cair neste mês (série cuja última cobrança foi antes do mês)
    const pend = r2(P.filter(p => p.meses[0] === month).reduce((s, p) => s + p.valor, 0));
    const posso = pl.plano ? r2(pl.plano - st.gasto - pend) : null;
    return { month, ...st, plano: pl, parcelasPendentes: pend, posso };
  }

  /* sugestão de limites após >=2 meses completos: média por categoria */
  function sugerirLimites(S, today) {
    const ms = monthsWithData(S).filter(m => m < ym(today));
    if (ms.length < 2) return null;
    const soma = {}; ms.forEach(m => { const st = monthStats(S, m); Object.entries(st.porCat).forEach(([c, v]) => soma[c] = (soma[c] || 0) + v); });
    const out = {}; Object.entries(soma).forEach(([c, v]) => { if (c !== 'Sem categoria') out[c] = Math.ceil(v / ms.length / 10) * 10; });
    return out;
  }

  /* ---------- Decidir ---------- */
  const JUROS_AM = 0.0599;
  function pmt(pv, i, n) { return i === 0 ? pv / n : pv * i / (1 - Math.pow(1 + i, -n)); }
  function decidir(S, today, { necessidade, preco, forma, parcelas, juros }) {
    const v = visaoMes(S, today); const renda = S.settings.renda; const teto = renda * S.settings.limitePct / 100;
    if (!renda) return { veredito: 'sem-renda', titulo: 'Informe sua renda', texto: 'Preciso da sua renda mensal (em Mais > Ajustes) para avaliar se cabe.' };
    const P = parcelamentos(S, today);
    const base = v.gasto + v.parcelasPendentes;
    const opcoes = [];
    opcoes.push({ forma: 'avista', n: 1, mensal: preco, total: preco });
    for (const n of [2, 3, 4, 5, 6, 8, 10, 12]) opcoes.push({ forma: 'parcelado', n, mensal: r2(preco / n), total: preco, semJuros: true });
    let escolha;
    if (forma === 'avista') escolha = opcoes[0];
    else if (forma === 'parcelado') {
      const n = Math.max(2, +parcelas || 2);
      if (juros === 'nao') escolha = { forma: 'parcelado', n, mensal: r2(preco / n), total: preco };
      else { const m = pmt(preco, JUROS_AM, n); escolha = { forma: 'parcelado', n, mensal: r2(m), total: r2(m * n), estimado: juros === 'nao-sei', comJuros: true }; }
    } else { // sistema decide: menor impacto no mês que ainda caiba, preferindo menos parcelas
      escolha = opcoes.find(o => (base + o.mensal) <= teto) || opcoes[opcoes.length - 1];
    }
    const projetado = base + escolha.mensal;
    const ratio = teto ? projetado / teto : 9;
    // impacto nos meses seguintes
    const comp = compromissosPorMes(P, addMonths(v.month, 1), 3);
    const sobra = r2(teto - projetado);
    let veredito, titulo, texto;
    if (ratio <= 0.85) { veredito = 'pode'; titulo = 'Pode ir'; texto = 'Cabe no mês com folga.'; }
    else if (ratio <= 1) { veredito = 'cabe'; titulo = 'Cabe, mas com custo'; texto = 'Cabe dentro do limite, mas deixa pouca folga no mês.'; }
    else { veredito = 'nao'; titulo = 'Não recomendo agora'; texto = 'Passa do limite que você definiu para o mês.'; }
    if (necessidade === 'impulso') { texto = 'Compra por impulso: espere até amanhã antes de decidir. ' + texto; if (veredito === 'pode') { titulo = 'Espere até amanhã'; veredito = 'espere'; } }
    else if (necessidade === 'quero' && veredito === 'pode') { texto = 'Não é urgente, mas cabe. ' + texto; }
    if (necessidade === 'preciso' && veredito === 'nao') texto += ' Como é necessário, vale parcelar em mais vezes ou esperar a próxima fatura.';
    const alternativa = (veredito === 'nao' || veredito === 'cabe') && forma !== 'avista' ? null : null;
    return { veredito, titulo, texto, escolha, projetado: r2(projetado), teto: r2(teto), sobra, ratio, base: r2(base), proximos: comp, usouJurosEstimado: !!escolha.estimado || !!escolha.comJuros, alternativa };
  }

  /* ---------- reserva e metas ---------- */
  function reserva(S, today) {
    const ms = monthsWithData(S).filter(m => m < ym(today)); const usar = ms.length ? ms : monthsWithData(S);
    const media = usar.length ? usar.reduce((s, m) => s + monthStats(S, m).gasto, 0) / usar.length : 0;
    const alvo = r2(media * S.settings.reservaMeses);
    return { mediaMensal: r2(media), alvo, meses: S.settings.reservaMeses, base: usar.length };
  }
  function metaMensal(meta, today) {
    const falta = Math.max(0, meta.alvo - (meta.atual || 0));
    const [y, m] = meta.data.split('-').map(Number); const t = new Date(today);
    const n = Math.max(1, (y - t.getFullYear()) * 12 + (m - 1 - t.getMonth()) + 1);
    return { falta: r2(falta), meses: n, mensal: r2(falta / n) };
  }

  /* ---------- atenção / indo bem ---------- */
  function alertas(S, today) {
    const v = visaoMes(S, today); const out = { atencao: [], bem: [] };
    const sem = S.tx.filter(t => !t.cat).length; if (sem) out.atencao.push({ tipo: 'sem-cat', texto: sem + ' lançamento(s) sem categoria', acao: 'categorizar' });
    if (v.plano.plano) {
      if (v.gasto > v.plano.plano) out.atencao.push({ tipo: 'estouro', texto: 'Você passou do plano do mês em R$ ' + r2(v.gasto - v.plano.plano).toFixed(2).replace('.', ',') });
      else if (v.gasto > v.plano.plano * 0.85) out.atencao.push({ tipo: 'perto', texto: 'Você já usou mais de 85% do plano do mês' });
      else if (v.gasto > 0) out.bem.push({ texto: 'Gastos dentro do plano até agora' });
    }
    Object.entries(S.budget).forEach(([c, lim]) => { const g = v.porCat[c] || 0; if (lim > 0 && g > lim) out.atencao.push({ tipo: 'cat', texto: c + ' passou do limite (' + g.toFixed(0) + ' de ' + lim + ')' }); });
    S.decisoes.filter(d => d.seguir && d.status === 'pendente' && d.seguir <= today).forEach(d => out.atencao.push({ tipo: 'decisao', texto: 'Ontem você ficou em dúvida sobre: ' + d.item, id: d.id }));
    const f = S.faturas.slice().sort((a, b) => a.vencimento < b.vencimento ? 1 : -1)[0];
    if (f) { const dias = Math.round((new Date(f.vencimentoISO) - new Date(today)) / 864e5); if (dias >= 0 && dias <= 5) out.atencao.push({ tipo: 'fatura', texto: 'Fatura de R$ ' + f.total.toFixed(2).replace('.', ',') + ' vence em ' + dias + ' dia(s)' }); }
    return out;
  }

  const api = { DEFAULT_CATS, newState, ruleKey, guessCat, importLines, addManual, learn, monthStats, monthsWithData, parcelamentos, compromissosPorMes, recorrentes, planoMes, visaoMes, sugerirLimites, decidir, reserva, metaMensal, alertas, isExpense, isIncome, addMonths, monthLabel, ym, r2, uid };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FTEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
