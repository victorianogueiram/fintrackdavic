/* Fintrack — login (nick + senha) e sincronização via funções do Supabase. Sem SDK. */
(function (root) {
  'use strict';
  const C = root.FT_CONFIG;
  const LS = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} }, del: (k) => { try { localStorage.removeItem(k); } catch (e) {} } };

  async function rpc(fn, args) {
    let res;
    try {
      res = await fetch(C.url + '/rest/v1/rpc/' + fn, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: C.key, Authorization: 'Bearer ' + C.key }, body: JSON.stringify(args || {}) });
    } catch (e) { const err = new Error('sem conexão'); err.offline = true; throw err; }
    const txt = await res.text(); let body = null; try { body = txt ? JSON.parse(txt) : null; } catch (e) { body = txt; }
    if (!res.ok) { const err = new Error((body && body.message) || 'erro ' + res.status); err.status = res.status; err.invalidSession = /sessao invalida/.test(err.message); throw err; }
    return body;
  }
  const Cloud = {
    token: () => LS.get('ft2_token'), nick: () => LS.get('ft2_nick'),
    async login(nick, pass) { const t = await rpc('ft_login', { p_nick: nick, p_pass: pass }); LS.set('ft2_token', t); LS.set('ft2_nick', nick.trim().toLowerCase()); return t; },
    async register(nick, pass) { const t = await rpc('ft_register', { p_nick: nick, p_pass: pass }); LS.set('ft2_token', t); LS.set('ft2_nick', nick.trim().toLowerCase()); return t; },
    load: () => rpc('ft_load', { p_token: Cloud.token() }),
    save: (data) => rpc('ft_save', { p_token: Cloud.token(), p_data: data }),
    async logout() { try { await rpc('ft_logout', { p_token: Cloud.token() }); } catch (e) {} LS.del('ft2_token'); },
    LS
  };
  root.FTCloud = Cloud;
})(window);
