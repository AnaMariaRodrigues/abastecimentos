// Verbo Gestão — aplicativo (Fase 1)
'use strict';

// ===================== Utilidades =====================
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const hojeISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const dataBR = s => { if (!s) return ''; const [a, m, d] = String(s).slice(0, 10).split('-'); return `${d}/${m}/${a}`; };
const dataHoraBR = s => s ? new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';
const somaDias = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const somaMeses = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setMonth(d.getMonth() + n); return d.toISOString().slice(0, 10); };
const num = v => { if (v === '' || v == null) return null; let t = String(v).replace(/[R$\s]/g, ''); if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.'); const n = Number(t); return isNaN(n) ? null : n; };
const lista = ids => 'in.(' + ids.map(encodeURIComponent).join(',') + ')';
const nomeArquivo = n => n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w.-]+/g, '_').slice(-80);

function aviso(msg, erro = false) {
  const el = $('#aviso');
  el.textContent = msg; el.className = 'aviso' + (erro ? ' erro' : ''); el.hidden = false;
  clearTimeout(aviso._t); aviso._t = setTimeout(() => (el.hidden = true), erro ? 6000 : 3000);
}
const falha = e => { console.error(e); aviso(e.message || String(e), true); };

function formDados(form) {
  const d = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') d[el.name] = el.checked;
    else if (el.type === 'file') d[el.name] = [...el.files];
    else d[el.name] = el.value.trim();
  }
  return d;
}

async function ocupado(btn, fn) {
  if (btn) { btn.disabled = true; btn.dataset.t = btn.textContent; btn.textContent = 'Aguarde…'; }
  try { return await fn(); }
  finally { if (btn) { btn.disabled = false; btn.textContent = btn.dataset.t; } }
}

// Modal genérico: devolve uma Promise com os dados do formulário (ou null se cancelar)
function modal(html, { aoAbrir, validar } = {}) {
  const fundo = $('#modal');
  fundo.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  fundo.hidden = false;
  return new Promise(resolve => {
    const fechar = v => { fundo.hidden = true; fundo.innerHTML = ''; resolve(v); };
    fundo.onclick = e => { if (e.target === fundo) fechar(null); };
    $$('[data-fechar]', fundo).forEach(b => (b.onclick = () => fechar(null)));
    const form = $('form', fundo);
    if (form) form.onsubmit = e => {
      e.preventDefault();
      const dados = { ...formDados(form), _acao: e.submitter?.value };
      const erro = validar?.(dados);
      if (erro) { aviso(erro, true); return; }
      fechar(dados);
    };
    if (aoAbrir) aoAbrir(fundo, fechar);
    setTimeout(() => $('input:not([type=hidden]),select,textarea', fundo)?.focus(), 50);
  });
}

async function confirmar(texto, { comMotivo = false, botao = 'Confirmar' } = {}) {
  const r = await modal(`<form><h2>${esc(texto)}</h2>
    ${comMotivo ? '<label class="campo">Motivo<textarea name="motivo" required></textarea></label>' : ''}
    <div class="rodape"><button type="button" class="btn" data-fechar>Voltar</button><button class="btn prim">${esc(botao)}</button></div></form>`);
  return r ? (comMotivo ? r.motivo : true) : null;
}

// Observações com pendência "⚠️ VERIFICAR" (contas e reembolsos)
const temVerificar = o => (o || '').includes('VERIFICAR');
function blocoObservacao(o, podeEditar) {
  if (!o && !podeEditar) return '';
  return `<div class="largo ${temVerificar(o) ? 'alerta-obs' : ''}"><div class="${temVerificar(o) ? '' : 'muted'}"><b>Observações</b></div>
    <div style="white-space:pre-line">${o ? esc(o) : '<span class="muted">—</span>'}</div>
    ${podeEditar ? `<div class="acoes" style="margin-top:8px">${temVerificar(o) ? '<button type="button" class="btn ok peq" id="obs-ok">Marcar como verificado</button>' : ''}
      <button type="button" class="btn peq" id="obs-editar">${o ? 'Editar observação' : 'Incluir observação'}</button></div>` : ''}</div>`;
}
function ligarObservacao(tabela, id, atual) {
  $('#obs-editar')?.addEventListener('click', async () => {
    const r = await modal(`<form><h2>Observação</h2><label class="campo">Texto<textarea name="obs" rows="5">${esc(atual || '')}</textarea></label>
      <p class="muted">Para deixar como pendência, comece com “⚠️ VERIFICAR:”.</p>
      <div class="rodape"><button type="button" class="btn" data-fechar>Voltar</button><button class="btn prim">Salvar</button></div></form>`);
    if (!r) return;
    try { await api.alterar(tabela, `id=eq.${id}`, { observacoes: r.obs || null }); aviso('Observação salva.'); navegar(); } catch (err) { falha(err); }
  });
  $('#obs-ok')?.addEventListener('click', async () => {
    const r = await modal(`<form><h2>Marcar como verificado</h2><label class="campo">O que foi confirmado?<textarea name="txt" rows="4" required placeholder="Ex.: confirmado com o posto, o valor já inclui o abastecimento"></textarea></label>
      <div class="rodape"><button type="button" class="btn" data-fechar>Voltar</button><button class="btn ok">Confirmar</button></div></form>`);
    if (!r) return;
    const antes = (atual || '').replace(/⚠️\s*VERIFICAR:?/g, 'Pendência:');
    const nova = `✔ Verificado em ${dataBR(hojeISO())} por ${estado.usuario.nome}: ${r.txt}\n(${antes})`;
    try { await api.alterar(tabela, `id=eq.${id}`, { observacoes: nova }); aviso('Marcado como verificado.'); navegar(); } catch (err) { falha(err); }
  });
}

// Reduz fotos grandes antes de enviar (celular)
async function prepararArquivo(f) {
  if (!f.type.startsWith('image/') || f.size < 600 * 1024) return f;
  try {
    const img = await createImageBitmap(f);
    const esc_ = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * esc_); c.height = Math.round(img.height * esc_);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.82));
    return new File([blob], f.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch { return f; }
}

async function anexar(entidade, id, arquivos) {
  for (const original of arquivos || []) {
    const f = await prepararArquivo(original);
    const caminho = `${entidade}/${id}/${Date.now()}-${nomeArquivo(f.name)}`;
    await api.enviarArquivo(caminho, f);
    await api.inserir('anexos', { entidade, entidade_id: id, caminho_arquivo: caminho, nome_original: original.name,
                                  tipo_mime: f.type, tamanho_bytes: f.size, enviado_por: estado.usuario.id });
  }
}

async function htmlAnexos(entidade, id) {
  const a = await api.listar('anexos', `entidade=eq.${entidade}&entidade_id=eq.${id}&cancelado_em=is.null&order=enviado_em`);
  if (!a.length) return '<span class="muted">Sem anexos</span>';
  return '<div class="anexos">' + a.map(x =>
    `<span class="anexo" data-arquivo="${esc(x.caminho_arquivo)}">${x.tipo_mime?.includes('pdf') ? '📄' : '🖼️'} ${esc(x.nome_original || 'arquivo')}</span>`).join('') + '</div>';
}

document.addEventListener('click', async e => {
  const a = e.target.closest('[data-arquivo]');
  if (!a) return;
  const janela = window.open('', '_blank');
  try { janela.location = await api.linkArquivo(a.dataset.arquivo); }
  catch (err) { janela?.close(); falha(err); }
});

// ===================== Estado e cadastros em memória =====================
const estado = { usuario: null, perfis: [], cache: {} };
const tem = (...p) => p.some(x => estado.perfis.includes(x));
const veTudo = () => tem('administrador', 'diretoria', 'financeiro');
const editaFin = () => tem('administrador', 'financeiro');

async function cad(tabela, consulta, forcar = false) {
  if (!forcar && estado.cache[tabela]) return estado.cache[tabela];
  estado.cache[tabela] = await api.listar(tabela, consulta);
  return estado.cache[tabela];
}
const contas = f => cad('plano_contas', 'select=id,codigo,nome,tipo,aceita_lancamento,ativo&order=codigo', f);
const centros = f => cad('centros_custo', 'select=id,codigo,nome,ativo&order=nome', f);
const usuarios = f => cad('usuarios', 'select=id,nome,email,ativo,centro_custo_id&order=nome', f);
const fornecedores = f => cad('fornecedores', 'select=id,razao_social,nome_fantasia,ativo&order=razao_social', f);
const bancos = f => cad('contas_bancarias', 'select=id,nome,tipo,ativo&order=nome', f);
const veiculos = f => cad('veiculos', 'select=id,placa,modelo,ativo&order=placa', f);
const porId = arr => Object.fromEntries(arr.map(x => [x.id, x]));

const opcoes = (arr, valor, rotulo, sel, vazio = '') =>
  (vazio !== null ? `<option value="">${esc(vazio)}</option>` : '') +
  arr.map(x => `<option value="${esc(x.id)}" ${x.id === sel ? 'selected' : ''}>${esc(rotulo(x))}</option>`).join('');

async function opcoesContas(sel, tipos) {
  const cs = (await contas()).filter(c => c.ativo && (!tipos || tipos.includes(c.tipo)));
  let html = '<option value="">Selecione…</option>', grupo = '';
  for (const c of cs) {
    if (!c.aceita_lancamento) { if (grupo) html += '</optgroup>'; html += `<optgroup label="${esc(c.codigo + ' ' + c.nome)}">`; grupo = c.codigo; continue; }
    html += `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.codigo + ' ' + c.nome)}</option>`;
  }
  return html + (grupo ? '</optgroup>' : '');
}

// ===================== Status =====================
const STATUS = {
  rascunho: ['Rascunho', ''], aguardando_aprovacao: ['Aguardando aprovação', 'amarelo'], aprovado: ['Aprovado', 'azul'],
  aprovada: ['Aprovada', 'azul'], em_pagamento: ['Em pagamento', 'azul'], pago: ['Pago', 'verde'], paga: ['Paga', 'verde'],
  devolvido: ['Devolvido p/ correção', 'vermelho'], devolvida: ['Devolvida', 'vermelho'], reprovado: ['Reprovado', 'vermelho'],
  reprovada: ['Reprovada', 'vermelho'], cancelado: ['Cancelado', ''], cancelada: ['Cancelada', ''], aberto: ['Aberto', 'amarelo'],
  aberta: ['Aberta', 'amarelo'], previsto: ['Previsto', ''], prevista: ['Prevista', ''], parcialmente_pago: ['Pago em parte', 'azul'],
  pendente: ['Pendente', 'amarelo'],
};
const tag = (s, vencida) => vencida ? '<span class="tag vermelho">Vencida</span>'
  : `<span class="tag ${STATUS[s]?.[1] || ''}">${esc(STATUS[s]?.[0] || s)}</span>`;

// ===================== Roteamento e casca =====================
const ROTAS = {};
const rota = (padrao, fn) => (ROTAS[padrao] = fn);

function menu() {
  const itens = [
    ['Início', '#/inicio', true, '🏠'],
    ['Aprovações', '#/aprovacoes', true, '✅', 'aprovar'],
    ['Meus reembolsos', '#/reembolsos', true, '🧾', 'devolvidos'],
    ['grupo', 'Financeiro', veTudo() || tem('comprador', 'aprovador')],
    ['Contas a pagar', '#/financeiro/pagar', veTudo() || tem('comprador'), '💳', 'sem_comprovante', true],
    ['A verificar', '#/financeiro/verificar', veTudo(), '⚠️', 'a_verificar', true],
    ['Contas a receber', '#/financeiro/receber', veTudo(), '📥', null, true],
    ['Reembolsos', '#/financeiro/reembolsos', veTudo() || tem('aprovador'), '💰', 'reembolsos_a_pagar', true],
    ['grupo', 'Cadastros', veTudo() || tem('comprador')],
    ['Fornecedores', '#/cadastros/fornecedores', veTudo() || tem('comprador'), '🏢', null, true],
    ['Clientes', '#/cadastros/clientes', veTudo(), '🤝', null, true],
    ['Plano de contas', '#/cadastros/plano_contas', veTudo(), '📚', null, true],
    ['Centros de custo', '#/cadastros/centros_custo', veTudo(), '🎯', null, true],
    ['Bancos e caixa', '#/cadastros/contas_bancarias', veTudo(), '🏦', null, true],
    ['Veículos', '#/cadastros/veiculos', veTudo(), '🚚', null, true],
    ['grupo', 'Configurações', tem('administrador', 'diretoria')],
    ['Usuários e perfis', '#/config/usuarios', tem('administrador'), '👥', null, true],
    ['Auditoria', '#/config/auditoria', veTudo(), '🔎', null, true],
    ['Importar sistema anterior', '#/config/importar', tem('administrador'), '📦', null, true],
  ];
  return itens.filter(i => i[2]);
}

async function desenharCasca() {
  const pend = {};
  try { (await api.rpc('minhas_pendencias')).forEach(p => (pend[p.tipo] = Number(p.quantidade))); } catch {}
  estado.pendencias = pend;
  const atual = location.hash || '#/inicio';
  const links = menu().map(i => i[0] === 'grupo'
    ? `<div class="menu-grupo">${esc(i[1])}</div>`
    : `<a href="${i[1]}" class="${atual.startsWith(i[1]) ? 'ativo' : ''} ${i[5] ? 'sub-item' : ''}"><span>${esc(i[0])}</span>${i[4] && pend[i[4]] ? `<span class="tag amarelo">${pend[i[4]]}</span>` : ''}</a>`).join('');
  const ehMot = tem('motorista') && !veTudo() && !tem('comprador', 'aprovador');
  $('#app').innerHTML = `
    <div class="casca">
      <nav class="lateral" aria-label="Menu">
        <div class="marca"><img src="logo.png" alt="Verbo Logística"><div class="sistema">Gestão</div></div>
        <div class="menu">${links}</div>
        <div class="usuario">${esc(estado.usuario.nome)}<br>
          <a href="#/perfil" style="color:#fff">Meu perfil</a> ·
          <a href="#" id="sair" style="color:#fff">Sair</a></div>
      </nav>
      <main class="conteudo" id="tela"><div class="carregando">Carregando…</div></main>
    </div>
    <nav class="barra-baixo" aria-label="Menu rápido">
      <a href="#/inicio" class="${atual.startsWith('#/inicio') ? 'ativo' : ''}"><span class="ic">🏠</span>Início</a>
      <a href="#/reembolsos/novo" class="${atual.startsWith('#/reembolsos/novo') ? 'ativo' : ''}"><span class="ic">➕</span>Lançar</a>
      ${ehMot ? '' : `<a href="#/aprovacoes" class="${atual.startsWith('#/aprovacoes') ? 'ativo' : ''}"><span class="ic">✅</span>Aprovar${pend.aprovar ? ` (${pend.aprovar})` : ''}</a>`}
      <a href="#/reembolsos" class="${atual === '#/reembolsos' ? 'ativo' : ''}"><span class="ic">🧾</span>Meus</a>
      <a href="#/menu"><span class="ic">☰</span>Menu</a>
    </nav>`;
  $('#sair').onclick = async e => { e.preventDefault(); await api.sair(); location.hash = ''; iniciar(); };
}

async function navegar() {
  if (!estado.usuario) return;
  const [h, qs] = (location.hash || '#/inicio').slice(1).split('?');
  estado.params = new URLSearchParams(qs || '');
  await desenharCasca();
  const tela = $('#tela');
  for (const padrao in ROTAS) {
    const re = new RegExp('^' + padrao.replace(/:(\w+)/g, '([^/]+)') + '$');
    const m = h.match(re);
    if (m) {
      try { await ROTAS[padrao](tela, ...m.slice(1).map(decodeURIComponent)); }
      catch (e) { tela.innerHTML = `<div class="cartao erro-txt">Não foi possível abrir esta tela: ${esc(e.message)}</div>`; console.error(e); }
      window.scrollTo(0, 0);
      return;
    }
  }
  location.hash = '#/inicio';
}
window.addEventListener('hashchange', navegar);

// Menu completo no celular
rota('/menu', tela => {
  tela.innerHTML = `<div class="menu-cel"><div class="marca"><img src="logo.png" alt="Verbo Logística"><div class="sistema">Gestão</div></div>
    <div class="menu">${menu().map(i => i[0] === 'grupo' ? `<div class="menu-grupo" style="color:#fff">${esc(i[1])}</div>`
      : `<a href="${i[1]}">${i[3] || ''} ${esc(i[0])}</a>`).join('')}
    <div class="menu-grupo" style="color:#fff">Conta</div><a href="#/perfil">👤 Meu perfil</a><a href="#" id="sair2">🚪 Sair</a></div></div>`;
  $('#sair2').onclick = async e => { e.preventDefault(); await api.sair(); location.hash = ''; iniciar(); };
});

// ===================== Login e primeiro acesso =====================
function telaLogin(msg = '') {
  $('#app').innerHTML = `
    <div class="login"><div class="login-caixa">
      <img class="login-logo" src="logo.png" alt="Verbo Logística"><div class="login-sub">Sistema de Gestão</div>
      <div class="cartao"><h2>Entrar</h2>
      <form id="f-login" class="form" style="grid-template-columns:1fr">
        <label class="campo">E-mail<input name="email" type="email" autocomplete="username" required></label>
        <label class="campo">Senha<input name="senha" type="password" autocomplete="current-password" required></label>
        <div id="msg" class="${msg.startsWith('!') ? 'erro-txt' : 'muted'}">${esc(msg.replace(/^!/, ''))}</div>
        <button class="btn prim">Entrar</button>
        <button type="button" class="btn" id="primeiro">Primeiro acesso ou esqueci a senha</button>
      </form>
    </div></div></div>`;
  const f = $('#f-login');
  f.onsubmit = async e => {
    e.preventDefault();
    const d = formDados(f);
    await ocupado(e.submitter, async () => {
      try { await api.entrar(d.email, d.senha); await iniciar(); }
      catch (err) { $('#msg').className = 'erro-txt'; $('#msg').textContent = err.message; }
    });
  };
  $('#primeiro').onclick = async e => {
    const email = f.email.value.trim();
    if (!email) { $('#msg').className = 'erro-txt'; $('#msg').textContent = 'Digite seu e-mail acima e clique de novo.'; return; }
    await ocupado(e.target, async () => {
      try { await api.enviarLink(email); $('#msg').className = 'muted';
            $('#msg').textContent = 'Enviamos um link para ' + email + '. Abra o e-mail e clique no link para criar sua senha.'; }
      catch (err) { $('#msg').className = 'erro-txt'; $('#msg').textContent = err.message; }
    });
  };
}

function telaNovaSenha() {
  $('#app').innerHTML = `
    <div class="login"><div class="login-caixa">
      <img class="login-logo" src="logo.png" alt="Verbo Logística"><div class="login-sub">Sistema de Gestão</div>
      <div class="cartao"><h2>Crie sua senha</h2>
      <form id="f-senha" class="form" style="grid-template-columns:1fr">
        <label class="campo">Nova senha<input name="s1" type="password" minlength="8" autocomplete="new-password" required></label>
        <label class="campo">Repita a senha<input name="s2" type="password" minlength="8" autocomplete="new-password" required></label>
        <div class="muted">Pelo menos 8 caracteres.</div><div id="msg" class="erro-txt"></div>
        <button class="btn prim">Salvar senha e entrar</button>
      </form></div></div></div>`;
  const f = $('#f-senha');
  f.onsubmit = async e => {
    e.preventDefault();
    const d = formDados(f);
    if (d.s1 !== d.s2) { $('#msg').textContent = 'As senhas não são iguais.'; return; }
    await ocupado(e.submitter, async () => {
      try { await api.definirSenha(d.s1); aviso('Senha criada.'); await iniciar(); }
      catch (err) { $('#msg').textContent = err.message; }
    });
  };
}

async function iniciar() {
  const ret = api.lerRetornoDoEmail();
  if (ret?.erro) return telaLogin('!O link expirou ou já foi usado. Peça um novo em "Primeiro acesso".');
  if (!api.sessao) return telaLogin();
  try {
    const u = await api.usuarioAtual();
    if (ret && ['recovery', 'invite', 'magiclink', 'signup'].includes(ret.tipo)) {
      estado.usuario = { id: u.id };
      if (ret.tipo !== 'magiclink' || !u.user_metadata?.senha_definida) return telaNovaSenha();
    }
    const [perfil] = await api.listar('usuarios', `id=eq.${u.id}&select=*`);
    if (!perfil) throw new Error('Usuário sem cadastro no sistema.');
    if (!perfil.ativo) { await api.sair(); return telaLogin('!Seu acesso está desativado. Fale com o administrador.'); }
    estado.usuario = perfil;
    estado.perfis = (await api.listar('usuario_perfis', `usuario_id=eq.${u.id}&select=perfil`)).map(p => p.perfil);
    estado.cache = {};
    if (!location.hash || location.hash === '#') location.hash = '#/inicio';
    await navegar();
  } catch (e) {
    console.error(e);
    if (!api.sessao) return telaLogin('!Sua sessão expirou. Entre de novo.');
    $('#app').innerHTML = `<div class="login"><div class="cartao"><h2>Não foi possível carregar</h2><p>${esc(e.message)}</p>
      <div class="acoes"><button class="btn prim" onclick="location.reload()">Tentar de novo</button>
      <button class="btn" id="sair3">Sair</button></div></div></div>`;
    $('#sair3').onclick = async () => { await api.sair(); telaLogin(); };
  }
}

// ===================== Início =====================
rota('/inicio', async tela => {
  const p = estado.pendencias || {};
  const faixas = { '1_vencidos': 'Vencidos', '2_hoje': 'Vencem hoje', '3_7_dias': 'Próximos 7 dias', '4_30_dias': 'Próximos 30 dias', '5_depois': 'Depois de 30 dias' };
  let agenda = '';
  if (veTudo()) {
    const ag = await api.listar('v_agenda_vencimentos', 'order=faixa');
    const bloco = (tipo, titulo) => { const linhas = ag.filter(a => a.tipo === tipo);
      return `<div class="cartao"><h2>${titulo}</h2>${linhas.length ? `<table><tbody>${linhas.map(a =>
      `<tr class="clicavel" onclick="location.hash='#/financeiro/${tipo}?faixa=${a.faixa}'"><td>${a.faixa === '1_vencidos' ? '<span class="tag vermelho">Vencidos</span>' : esc(faixas[a.faixa])}</td>
       <td class="num">${a.quantidade} conta(s)</td><td class="num"><b>${brl(a.total)}</b></td></tr>`).join('')}</tbody></table>`
      : '<div class="vazio">Nada em aberto.</div>'}</div>`; };
    agenda = `<div class="grade" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr))">${bloco('pagar', 'A pagar')}${bloco('receber', 'A receber')}</div>`;
  }
  const notifs = await api.listar('notificacoes', `usuario_id=eq.${estado.usuario.id}&order=criado_em.desc&limit=8`);
  tela.innerHTML = `
    <div class="topo"><div><h1>Olá, ${esc(estado.usuario.nome.split(' ')[0])}</h1><p class="sub">${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</p></div>
      <div class="acoes"><a class="btn prim" href="#/reembolsos/novo">+ Lançar reembolso</a>${editaFin() ? '<a class="btn" href="#/financeiro/pagar/novo">+ Conta a pagar</a><a class="btn" href="#/financeiro/receber/novo">+ Conta a receber</a>' : ''}</div></div>
    <div class="grade" style="margin-bottom:16px">
      ${!tem('motorista') || veTudo() || tem('aprovador') ? `<a class="cartao kpi ${p.aprovar ? 'alerta' : ''}" href="#/aprovacoes"><div class="n">${p.aprovar || 0}</div><div class="r">para você aprovar</div></a>` : ''}
      <a class="cartao kpi ${p.devolvidos ? 'alerta' : ''}" href="#/reembolsos"><div class="n">${p.devolvidos || 0}</div><div class="r">reembolsos devolvidos para correção</div></a>
      ${editaFin() ? `<a class="cartao kpi" href="#/financeiro/reembolsos?status=aprovado"><div class="n">${p.reembolsos_a_pagar || 0}</div><div class="r">reembolsos aprovados a pagar</div></a>` : ''}
      ${editaFin() ? `<a class="cartao kpi ${p.sem_comprovante ? 'alerta' : ''}" href="#/financeiro/pagar?status=semcomp"><div class="n">${p.sem_comprovante || 0}</div><div class="r">pagamentos sem comprovante</div></a>` : ''}
      ${veTudo() ? `<a class="cartao kpi ${p.a_verificar ? 'alerta' : ''}" href="#/financeiro/verificar"><div class="n">${p.a_verificar || 0}</div><div class="r">lançamentos a verificar</div></a>` : ''}
    </div>
    ${agenda}
    <div class="cartao"><div class="topo" style="margin:0 0 6px"><h2 style="margin:0">Avisos</h2>${notifs.some(n => !n.lida) ? '<button class="btn peq" id="lidas">Marcar como lidos</button>' : ''}</div>
      ${notifs.length ? `<ul class="lista-simples">${notifs.map(n => `<li class="${n.lida ? '' : 'nao-lida'}"><span>${n.link ? `<a href="${esc(n.link)}">${esc(n.titulo)}</a>` : esc(n.titulo)}${n.corpo ? `<br><span class="muted">${esc(n.corpo)}</span>` : ''}</span><span class="muted nowrap">${dataHoraBR(n.criado_em)}</span></li>`).join('')}</ul>`
        : '<div class="vazio">Nenhum aviso por enquanto.</div>'}</div>`;
  $('#lidas')?.addEventListener('click', async () => {
    await api.alterar('notificacoes', `usuario_id=eq.${estado.usuario.id}&lida=eq.false`, { lida: true }); navegar();
  });
});
