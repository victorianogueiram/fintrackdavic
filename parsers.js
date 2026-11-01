/* Fintrack — leitores de extrato/fatura (Itaú). Funciona no navegador e no Node (testes). */
(function (root) {
  'use strict';

  const brNum = (s) => {
    if (s == null) return NaN;
    if (typeof s === 'number') return s;
    const t = String(s).replace(/R\$/g, '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
    return parseFloat(t);
  };
  const iso = (d, m, y) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const cleanName = (s) => s.replace(/\s+/g, ' ').trim();

  /* ---------- Categoria do cartão Itaú -> categoria Fintrack ---------- */
  const CARD_CAT = {
    'transporte': 'Transporte', 'supermercado': 'Alimentação', 'restaurante': 'Alimentação',
    'serviços': 'Assinaturas', 'saúde': 'Saúde', 'lazer': 'Lazer', 'casa': 'Moradia',
    'vestuário': 'Vestuário', 'educação': 'Educação', 'viagem': 'Lazer', 'eletronicos': 'Compras',
    'outros': null
  };

  /* ---------- PDF de fatura do cartão Itaú ----------
     Entrada: lista de páginas, cada uma com items {str,x,y}. (gerado por pdf.js)
     Saída: {lancamentos[], parcelasFuturas[], resumo{}} */
  function groupLines(items, pageWidth) {
    // acha as âncoras de coluna pela posição X das datas "DD/MM"
    const dateX = items.filter(i => /^\d{2}\/\d{2}$/.test(i.str.trim())).map(i => Math.round(i.x));
    const uniq = [...new Set(dateX)].sort((a, b) => a - b);
    const left = uniq.length ? uniq[0] : 0;
    const rightC = uniq.find(x => x - left > 120);
    const splitX = rightC != null ? rightC - 6 : Infinity;
    const cols = { L: [], R: [] };
    items.forEach(it => { if (it.str.trim()) (it.x >= splitX ? cols.R : cols.L).push(it); });
    const out = [];
    ['L', 'R'].forEach(c => {
      const rows = [];
      cols[c].sort((a, b) => b.y - a.y || a.x - b.x).forEach(it => {
        const r = rows.find(r => Math.abs(r.y - it.y) < 2.5);
        if (r) r.items.push(it); else rows.push({ y: it.y, items: [it] });
      });
      rows.sort((a, b) => b.y - a.y).forEach(r => {
        r.items.sort((a, b) => a.x - b.x);
        let txt = '', prevEnd = null;
        r.items.forEach(i => {
          const gap = prevEnd == null ? 0 : i.x - prevEnd;
          if (prevEnd != null && gap > 1.2) txt += ' ';
          txt += i.str.trim(); prevEnd = i.x + (i.w || 0);
        });
        out.push({ col: c, y: r.y, text: cleanName(txt), cells: r.items });
      });
    });
    return out;
  }

  function parseItauCardPages(pages) {
    const lines = [];
    pages.forEach((p, pi) => groupLines(p.items, p.width).forEach(l => lines.push({ ...l, page: pi })));
    const full = lines.map(l => l.text).join('\n');

    const resumo = {};
    const m = (re) => { const r = full.match(re); return r ? r[1] : null; };
    resumo.total = brNum(m(/Total desta fatura\s+([\d.]+,\d{2})/));
    resumo.vencimento = m(/Vencimento:\s*(\d{2}\/\d{2}\/\d{4})/);
    resumo.fechamento = m(/Postagem:\s*(\d{2}\/\d{2}\/\d{4})/);
    resumo.proxFechamento = m(/pr[óo]x\.? Fechamento:\s*(\d{2}\/\d{2}\/\d{4})/i);
    resumo.limite = brNum(m(/Limite total de cr[ée]dito\s+([\d.]+,\d{2})/));
    resumo.limiteDisponivel = brNum(m(/Limite dispon[ií]vel\s+([\d.]+,\d{2})/));
    resumo.faturaAnterior = brNum(m(/Total da fatura anterior\s+([\d.]+,\d{2})/));
    const pag = full.match(/Pagamento efetuado em (\d{2}\/\d{2}\/\d{4})\s+-?([\d.]+,\d{2})/);
    if (pag) { resumo.pagamentoData = pag[1]; resumo.pagamentoValor = brNum(pag[2]); }

    // ano de referência: vencimento (fatura que vence em out/2026 tem compras de ago-out/2026)
    const refYear = resumo.vencimento ? +resumo.vencimento.slice(6) : new Date().getFullYear();
    const refMonth = resumo.vencimento ? +resumo.vencimento.slice(3, 5) : 12;
    const yearFor = (mm) => (mm > refMonth ? refYear - 1 : refYear);

    const lancamentos = [], parcelasFuturas = [];
    let section = null; // 'compras' | 'inter' | 'prodserv' | 'futuras' | 'pagamentos' | null
    const reItem = /^(\d{2})\/(\d{2})\s+(.+?)\s+(-?[\d.]+,\d{2})$/;
    const reItemInter = /^(\d{2})\/(\d{2})\s+(.+?)\s+(-?[\d.]+,\d{2})$/;
    const reInst = /\s(\d{2})\/(\d{2})$/;

    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].text;
      if (/^Pagamentos efetuados/i.test(t)) { section = 'pagamentos'; continue; }
      if (/^Lançamentos: compras e saques/i.test(t)) { section = 'compras'; continue; }
      if (/^Lançamentos internacionais/i.test(t)) { section = 'inter'; continue; }
      if (/^Lançamentos: produtos e serviços/i.test(t)) { section = 'prodserv'; continue; }
      if (/^Compras parceladas - próximas faturas/i.test(t)) { section = 'futuras'; continue; }
      if (/^(Limites de cr[ée]dito|Encargos cobrados)/i.test(t)) { section = null; continue; }
      if (/^(Total dos pagamentos|Lançamentos no cartão|Total transações inter|Total dos lançamentos|Próxima fatura|Demais faturas|Total para próximas)/i.test(t)) continue;
      if (section === 'pagamentos') continue;

      if (section === 'compras' || section === 'prodserv') {
        const mm = t.match(reItem);
        if (!mm || /^(DATA)/.test(t)) continue;
        const dia = +mm[1], mes = +mm[2];
        let nome = mm[3], valor = brNum(mm[4]);
        // linha seguinte: "categoria CIDADE"
        let cat = null;
        const next = lines[i + 1];
        if (next && next.col === lines[i].col && !/^\d{2}\/\d{2}\s/.test(next.text) && !/\d,\d{2}$/.test(next.text)) {
          cat = next.text.split(' ')[0].toLowerCase();
        } else if (next && next.col === lines[i].col && /^[a-zçãéíóúâêô]+\s/.test(next.text) && !/^\d{2}\/\d{2}\s/.test(next.text)) {
          cat = next.text.split(' ')[0].toLowerCase();
        }
        let parcela = null;
        const pi = nome.match(reInst);
        if (pi && +pi[2] > 1 && +pi[1] <= +pi[2]) { parcela = { n: +pi[1], de: +pi[2] }; nome = nome.replace(reInst, ''); }
        if (section === 'prodserv') cat = 'tarifa';
        lancamentos.push({
          data: iso(dia, mes, yearFor(mes)), nome: cleanName(nome), valor: -valor,
          cartaoCat: cat, categoriaSugerida: CARD_CAT[cat] || null, parcela, origem: 'cartao'
        });
      } else if (section === 'inter') {
        // "07/09 ANTHROPIC* CLAUDE SUBAN   116,91" + linha "110,00 BRL 21,57"
        const mm = t.match(/^(\d{2})\/(\d{2})\s+(.+?)\s+([\d.]+,\d{2})$/);
        if (mm && !/^DATA/.test(t)) {
          lancamentos.push({
            data: iso(+mm[1], +mm[2], yearFor(+mm[2])), nome: cleanName(mm[3]), valor: -brNum(mm[4]),
            cartaoCat: 'internacional', categoriaSugerida: null, parcela: null, origem: 'cartao', internacional: true
          });
        } else if (/^Repasse de IOF em R\$\s+([\d.]+,\d{2})/.test(t)) {
          const v = brNum(t.match(/([\d.]+,\d{2})$/)[1]);
          lancamentos.push({
            data: iso(+resumo.fechamento.slice(0, 2), +resumo.fechamento.slice(3, 5), +resumo.fechamento.slice(6)),
            nome: 'IOF compra internacional', valor: -v, cartaoCat: 'tarifa', categoriaSugerida: null, parcela: null, origem: 'cartao'
          });
        }
      } else if (section === 'futuras') {
        const mm = t.match(reItem);
        if (!mm || /^DATA/.test(t)) continue;
        const pi = mm[3].match(reInst);
        if (!pi) continue;
        parcelasFuturas.push({
          dataCompra: iso(+mm[1], +mm[2], yearFor(+mm[2])), nome: cleanName(mm[3].replace(reInst, '')),
          n: +pi[1], de: +pi[2], valor: brNum(mm[4])
        });
      }
    }
    // "Demais faturas" / "Próxima fatura"
    resumo.proximaFatura = brNum((full.match(/Próxima fatura\s+([\d.]+,\d{2})/) || [])[1]);
    resumo.demaisFaturas = brNum((full.match(/Demais faturas\s+([\d.]+,\d{2})/) || [])[1]);
    resumo.somaLancamentos = Math.round(lancamentos.reduce((s, l) => s - l.valor, 0) * 100) / 100;
    return { lancamentos, parcelasFuturas, resumo };
  }

  /* ---------- Extrato conta corrente Itaú (.xls via SheetJS) ---------- */
  function parseItauXLS(rows, today) {
    // rows: array de arrays (sheet "Lançamentos")
    const out = []; let saldoInicial = null;
    let hi = rows.findIndex(r => String(r[0] || '').trim().toLowerCase() === 'data');
    if (hi < 0) return { transacoes: [], saldoInicial: null, erro: 'cabeçalho não encontrado' };
    const hoje = today || new Date();
    for (let i = hi + 1; i < rows.length; i++) {
      const r = rows[i]; if (!r || !r[0]) continue;
      const nome = String(r[1] || '').trim();
      if (/^SALDO ANTERIOR/i.test(nome)) { saldoInicial = brNum(r[4]); continue; }
      if (/^SALDO TOTAL/i.test(nome) || /^SALDO/i.test(nome)) continue;
      const dm = String(r[0]).match(/(\d{2})\/(\d{2})\/(\d{4})/); if (!dm) continue;
      const d = new Date(+dm[3], +dm[2] - 1, +dm[1]); if (d > hoje) continue; // sem lançamentos futuros
      const valor = typeof r[3] === 'number' ? r[3] : brNum(r[3]); if (isNaN(valor)) continue;
      out.push({
        data: iso(+dm[1], +dm[2], +dm[3]), nome: cleanName(nome.replace(/\s*\d{2}\/\d{2}$/, '')),
        valor, origem: 'conta', transferenciaFatura: /FATURA PAGA|PAGTO.*FATURA|PAGAMENTO.*CART/i.test(nome)
      });
    }
    return { transacoes: out, saldoInicial };
  }

  /* ---------- OFX e CSV genéricos ---------- */
  function parseOFX(text) {
    const out = [];
    const blocks = text.split(/<STMTTRN>/i).slice(1);
    blocks.forEach(b => {
      const g = (tag) => { const m = b.match(new RegExp('<' + tag + '>([^<\\r\\n]+)', 'i')); return m ? m[1].trim() : ''; };
      const dt = g('DTPOSTED'); const amt = parseFloat(g('TRNAMT').replace(',', '.'));
      if (!dt || isNaN(amt)) return;
      out.push({ data: iso(+dt.slice(6, 8), +dt.slice(4, 6), +dt.slice(0, 4)), nome: cleanName(g('MEMO') || g('NAME')), valor: amt, origem: 'conta',
        transferenciaFatura: /FATURA PAGA|PAGTO.*FATURA/i.test(g('MEMO')) });
    });
    return out;
  }
  function parseCSV(text) {
    text = text.replace(/^﻿/, '');
    const lines = text.split(/\r?\n/).filter(Boolean);
    const sep = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ';' : ',';
    const split = (l) => { const r = []; let c = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === sep && !q) { r.push(c); c = ''; } else c += ch; } r.push(c); return r; };
    const head = split(lines[0]).map(h => h.toLowerCase());
    const iD = head.findIndex(h => /data/.test(h)), iN = head.findIndex(h => /(descri|lan[cç]amento|hist)/.test(h)), iV = head.findIndex(h => /valor/.test(h));
    if (iD < 0 || iV < 0) return [];
    return lines.slice(1).map(l => {
      const c = split(l); const dm = (c[iD] || '').match(/(\d{2})\/(\d{2})\/(\d{4})/); if (!dm) return null;
      const v = brNum(c[iV]); if (isNaN(v)) return null;
      return { data: iso(+dm[1], +dm[2], +dm[3]), nome: cleanName(c[iN] || ''), valor: v, origem: 'conta' };
    }).filter(Boolean);
  }

  const api = { brNum, parseItauCardPages, parseItauXLS, parseOFX, parseCSV, CARD_CAT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FTParsers = api;
})(typeof window !== 'undefined' ? window : globalThis);
