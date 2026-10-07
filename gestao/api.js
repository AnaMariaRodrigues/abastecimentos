// Verbo Gestão — cliente leve do Supabase (Auth, banco e arquivos), sem dependências
const SB_URL = 'https://qxuwokglibazfgwuhbah.supabase.co';
const SB_KEY = 'sb_publishable_16Vb2lYj-aWyKaGVq7nh1g_LRkSCFAr';
const APP_URL = location.origin + location.pathname.replace(/index\.html$/, '');
const SESSAO_KEY = 'vg_sessao';

const MENSAGENS = {
  'Invalid login credentials': 'E-mail ou senha incorretos.',
  'Email not confirmed': 'E-mail ainda não confirmado. Use "Primeiro acesso".',
  'User not found': 'Usuário não encontrado.',
  'Password should be at least 6 characters.': 'A senha precisa ter pelo menos 6 caracteres.',
  'New password should be different from the old password.': 'A nova senha precisa ser diferente da atual.',
  'For security purposes, you can only request this after': 'Aguarde alguns segundos antes de pedir outro link.',
  'Email rate limit exceeded': 'Limite de e-mails atingido. Tente de novo em alguns minutos.',
  'JWT expired': 'Sua sessão expirou. Entre de novo.',
};

function traduzir(msg) {
  if (!msg) return 'Erro inesperado.';
  for (const k in MENSAGENS) if (msg.startsWith(k)) return MENSAGENS[k];
  return msg;
}

const api = {
  sessao: (() => { try { return JSON.parse(localStorage.getItem(SESSAO_KEY)); } catch { return null; } })(),

  salvar(s) {
    this.sessao = s;
    try { s ? localStorage.setItem(SESSAO_KEY, JSON.stringify(s)) : localStorage.removeItem(SESSAO_KEY); } catch {}
  },

  _sessaoDe(d) {
    return { access_token: d.access_token, refresh_token: d.refresh_token,
             expires_at: d.expires_at || Math.floor(Date.now() / 1000) + (d.expires_in || 3600), user: d.user };
  },

  async _fetch(url, opts = {}) {
    let r;
    try { r = await fetch(url, opts); }
    catch { throw new Error('Sem conexão com a internet.'); }
    const txt = await r.text();
    let data = null;
    try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
    if (!r.ok) {
      const m = (data && (data.msg || data.message || data.error_description || data.error)) || r.statusText;
      const e = new Error(traduzir(m)); e.status = r.status; e.data = data; throw e;
    }
    return data;
  },

  async auth(caminho, corpo, metodo = 'POST', comToken = false) {
    const h = { apikey: SB_KEY, 'Content-Type': 'application/json' };
    if (comToken) { await this.garantir(); h.Authorization = 'Bearer ' + this.sessao.access_token; }
    return this._fetch(SB_URL + '/auth/v1/' + caminho, { method: metodo, headers: h, body: corpo ? JSON.stringify(corpo) : undefined });
  },

  async entrar(email, senha) {
    const d = await this.auth('token?grant_type=password', { email, password: senha });
    this.salvar(this._sessaoDe(d));
    return d.user;
  },

  async renovar() {
    if (!this.sessao?.refresh_token) throw new Error('Sessão encerrada.');
    try {
      const d = await this.auth('token?grant_type=refresh_token', { refresh_token: this.sessao.refresh_token });
      this.salvar(this._sessaoDe(d));
    } catch (e) {
      if (e.status && e.status < 500) this.salvar(null);
      throw e;
    }
  },

  async garantir() {
    if (!this.sessao) throw new Error('Sessão encerrada.');
    if (this.sessao.expires_at - Date.now() / 1000 < 60) await this.renovar();
  },

  async sair() {
    try { await this.auth('logout', null, 'POST', true); } catch {}
    this.salvar(null);
  },

  // Primeiro acesso ou esqueci a senha: manda link por e-mail
  async enviarLink(email) {
    return this.auth('recover?redirect_to=' + encodeURIComponent(APP_URL), { email });
  },

  // Administrador convida: cria o usuário e manda link de acesso
  async convidar(email, nome) {
    return this.auth('otp?redirect_to=' + encodeURIComponent(APP_URL),
      { email, create_user: true, data: { nome } });
  },

  async definirSenha(senha) {
    const u = await this.auth('user', { password: senha, data: { senha_definida: true } }, 'PUT', true);
    this.sessao.user = u; this.salvar(this.sessao);
    return u;
  },

  // Volta do link do e-mail: #access_token=...&refresh_token=...&type=recovery
  lerRetornoDoEmail() {
    const h = location.hash.startsWith('#access_token') || location.hash.includes('&access_token') ? location.hash.slice(1) : '';
    const erro = new URLSearchParams(location.hash.slice(1)).get('error_description');
    if (erro) { history.replaceState(null, '', location.pathname); return { erro: erro.replace(/\+/g, ' ') }; }
    if (!h) return null;
    const p = new URLSearchParams(h);
    this.salvar({ access_token: p.get('access_token'), refresh_token: p.get('refresh_token'),
                  expires_at: Number(p.get('expires_at')) || Math.floor(Date.now() / 1000) + Number(p.get('expires_in') || 3600),
                  user: null });
    history.replaceState(null, '', location.pathname);
    return { tipo: p.get('type') };
  },

  async usuarioAtual() { return this.auth('user', null, 'GET', true); },

  // ---------------- Banco (PostgREST) ----------------
  async rest(caminho, { metodo = 'GET', corpo, prefer, tentativa = 0 } = {}) {
    await this.garantir();
    const h = { apikey: SB_KEY, Authorization: 'Bearer ' + this.sessao.access_token, 'Content-Type': 'application/json' };
    if (prefer) h.Prefer = prefer;
    try {
      return await this._fetch(SB_URL + '/rest/v1/' + caminho, { method: metodo, headers: h, body: corpo !== undefined ? JSON.stringify(corpo) : undefined });
    } catch (e) {
      if (e.status === 401 && tentativa === 0) { await this.renovar(); return this.rest(caminho, { metodo, corpo, prefer, tentativa: 1 }); }
      throw e;
    }
  },
  listar(tabela, consulta = '') { return this.rest(tabela + (consulta ? '?' + consulta : '')); },
  async um(tabela, consulta) { const r = await this.listar(tabela, consulta); return r[0] || null; },
  inserir(tabela, linhas) { return this.rest(tabela, { metodo: 'POST', corpo: linhas, prefer: 'return=representation' }); },
  alterar(tabela, filtro, dados) { return this.rest(tabela + '?' + filtro, { metodo: 'PATCH', corpo: dados, prefer: 'return=representation' }); },
  excluir(tabela, filtro) { return this.rest(tabela + '?' + filtro, { metodo: 'DELETE' }); },
  rpc(funcao, args = {}) { return this.rest('rpc/' + funcao, { metodo: 'POST', corpo: args }); },

  // ---------------- Arquivos (Storage) ----------------
  async enviarArquivo(caminho, arquivo) {
    await this.garantir();
    return this._fetch(SB_URL + '/storage/v1/object/anexos/' + caminho, {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: 'Bearer ' + this.sessao.access_token,
                 'Content-Type': arquivo.type || 'application/octet-stream', 'x-upsert': 'false' },
      body: arquivo,
    });
  },
  async linkArquivo(caminho) {
    await this.garantir();
    const d = await this._fetch(SB_URL + '/storage/v1/object/sign/anexos/' + caminho, {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: 'Bearer ' + this.sessao.access_token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: 3600 }),
    });
    return SB_URL + '/storage/v1' + d.signedURL;
  },
};
