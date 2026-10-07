// Verbo Gestão — Cadastros, Usuários, Auditoria e Meu perfil
'use strict';

// Definição dos cadastros: campos do formulário e colunas da lista
const CADASTROS = {
  fornecedores: { titulo: 'Fornecedores', ordem: 'razao_social', edita: () => tem('administrador', 'financeiro', 'comprador'),
    campos: [['razao_social', 'Razão social / nome', 'texto', true], ['nome_fantasia', 'Nome fantasia'], ['documento', 'CNPJ ou CPF'],
             ['categoria', 'Categoria', 'lista', false, ['Posto de combustível', 'Oficina / peças', 'Pneus', 'Loja / material', 'Prestador de serviço', 'Aluguel / imóvel', 'Concessionária (energia, água, internet)', 'Outro']],
             ['telefone', 'Telefone'], ['email', 'E-mail'], ['chave_pix', 'Chave Pix'], ['banco', 'Banco'], ['agencia', 'Agência'], ['conta', 'Conta'],
             ['condicao_padrao', 'Condição de pagamento'], ['conta_padrao_id', 'Conta padrão do plano', 'conta']],
    colunas: ['razao_social', 'documento', 'categoria', 'telefone'] },
  plano_contas: { titulo: 'Plano de contas', ordem: 'codigo', edita: editaFin,
    campos: [['codigo', 'Código (ex.: 3.9)', 'texto', true], ['nome', 'Nome', 'texto', true],
             ['tipo', 'Tipo', 'lista', true, ['receita', 'deducao', 'custo', 'despesa', 'financeiro', 'investimento']],
             ['aceita_lancamento', 'Aceita lançamentos (desmarque para grupos)', 'bool'], ['grupo_dre', 'Linha da DRE']],
    colunas: ['codigo', 'nome', 'tipo', 'grupo_dre'] },
  centros_custo: { titulo: 'Centros de custo', ordem: 'nome', edita: editaFin,
    campos: [['codigo', 'Código', 'texto', true], ['nome', 'Nome', 'texto', true], ['responsavel_id', 'Responsável (aprovador)', 'usuario']],
    colunas: ['codigo', 'nome', 'responsavel_id'] },
  contas_bancarias: { titulo: 'Bancos e caixa', ordem: 'nome', edita: editaFin,
    campos: [['nome', 'Nome', 'texto', true], ['tipo', 'Tipo', 'lista', true, ['corrente', 'poupanca', 'caixa', 'cartao', 'aplicacao']],
             ['banco', 'Banco'], ['agencia', 'Agência'], ['conta', 'Conta'], ['saldo_inicial', 'Saldo inicial (R$)', 'valor'], ['data_saldo_inicial', 'Data do saldo inicial', 'data']],
    colunas: ['nome', 'tipo', 'banco', 'saldo_inicial'] },
  veiculos: { titulo: 'Veículos', ordem: 'placa', edita: () => tem('administrador'),
    campos: [['placa', 'Placa', 'texto', true], ['modelo', 'Modelo'], ['combustivel', 'Combustível', 'lista', false, ['Diesel', 'Diesel S10', 'Gasolina', 'Etanol', 'Flex', 'GNV']],
             ['centro_custo_id', 'Centro de custo', 'cc'], ['motorista_padrao_id', 'Motorista principal', 'usuario'], ['km_atual', 'Km atual', 'numero']],
    colunas: ['placa', 'modelo', 'combustivel', 'centro_custo_id'] },
};

async function valorExibido(campo, v) {
  if (v == null || v === '') return '—';
  if (campo === 'responsavel_id' || campo === 'motorista_padrao_id') return porId(await usuarios())[v]?.nome || '—';
  if (campo === 'centro_custo_id') return porId(await centros())[v]?.nome || '—';
  if (campo === 'saldo_inicial') return brl(v);
  return v;
}

async function campoHTML([nome, rotulo, tipo = 'texto', obrig, ops], v) {
  const req = obrig ? 'required' : '';
  if (tipo === 'bool') return `<label class="check largo"><input type="checkbox" name="${nome}" ${v ?? true ? 'checked' : ''}> ${esc(rotulo)}</label>`;
  let input;
  if (tipo === 'lista') input = `<select name="${nome}" ${req}><option value=""></option>${ops.map(o => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  else if (tipo === 'conta') input = `<select name="${nome}">${await opcoesContas(v)}</select>`;
  else if (tipo === 'usuario') input = `<select name="${nome}">${opcoes((await usuarios()).filter(u => u.ativo), null, u => u.nome, v, 'Nenhum')}</select>`;
  else if (tipo === 'cc') input = `<select name="${nome}">${opcoes((await centros()).filter(c => c.ativo), null, c => c.nome, v, 'Nenhum')}</select>`;
  else if (tipo === 'data') input = `<input type="date" name="${nome}" value="${esc(v || hojeISO())}" ${req}>`;
  else if (tipo === 'valor') input = `<input name="${nome}" inputmode="decimal" value="${v != null ? String(v).replace('.', ',') : ''}" ${req}>`;
  else if (tipo === 'numero') input = `<input type="number" name="${nome}" value="${esc(v ?? '')}" ${req}>`;
  else input = `<input name="${nome}" value="${esc(v ?? '')}" ${req}>`;
  return `<label class="campo">${esc(rotulo)}${obrig ? ' *' : ''}${input}</label>`;
}

rota('/cadastros/:tabela', async (tela, tabela) => {
  const def = CADASTROS[tabela];
  if (!def) { location.hash = '#/inicio'; return; }
  const inativos = estado.params.get('inativos') === '1';
  const linhas = await api.listar(tabela, `order=${def.ordem}${inativos ? '' : '&ativo=eq.true'}`);
  const rot = Object.fromEntries(def.campos.map(c => [c[0], c[1]]));
  const celulas = await Promise.all(linhas.map(async l => Promise.all(def.colunas.map(c => valorExibido(c, l[c])))));
  tela.innerHTML = `
    <div class="topo"><div><h1>${esc(def.titulo)}</h1><p class="sub">${linhas.length} cadastro(s)</p></div>
      <div class="acoes"><a class="btn" href="#/cadastros/${tabela}${inativos ? '' : '?inativos=1'}">${inativos ? 'Ocultar inativos' : 'Mostrar inativos'}</a>
      ${def.edita() ? '<button class="btn prim" id="novo">+ Novo</button>' : ''}</div></div>
    <div class="cartao">${linhas.length ? `<div class="tabela-wrap"><table class="responsiva"><thead><tr>${def.colunas.map(c => `<th>${esc(rot[c].replace(/ \(.*/, ''))}</th>`).join('')}<th></th></tr></thead><tbody>
      ${linhas.map((l, i) => `<tr class="${def.edita() ? 'clicavel' : ''}" data-i="${i}">${def.colunas.map((c, j) => `<td data-r="${esc(rot[c])}">${esc(celulas[i][j])}</td>`).join('')}<td>${l.ativo ? '' : '<span class="tag">Inativo</span>'}</td></tr>`).join('')}
    </tbody></table></div>` : '<div class="vazio">Nenhum cadastro ainda.</div>'}</div>`;
  const editar = async (l = null) => {
    const campos = (await Promise.all(def.campos.map(c => campoHTML(c, l?.[c[0]])))).join('');
    const r = await modal(`<form><h2>${l ? 'Editar' : 'Novo'} · ${esc(def.titulo)}</h2><div class="form">${campos}</div>
      <div class="rodape">${l ? `<button class="btn ${l.ativo ? 'perigo' : ''}" value="${l.ativo ? 'desativar' : 'ativar'}">${l.ativo ? 'Desativar' : 'Reativar'}</button>` : ''}
      <button type="button" class="btn" data-fechar>Voltar</button><button class="btn prim" value="salvar">Salvar</button></div></form>`);
    if (!r) return;
    const dados = {};
    for (const [nome, , tipo] of def.campos) {
      let v = r[nome];
      if (tipo === 'valor') v = num(v) ?? 0; else if (tipo === 'numero') v = v === '' ? null : Number(v);
      else if (tipo !== 'bool' && v === '') v = null;
      dados[nome] = v;
    }
    if (r._acao === 'desativar' || r._acao === 'ativar') Object.assign(dados, { ativo: r._acao === 'ativar' });
    try {
      if (l) await api.alterar(tabela, `id=eq.${l.id}`, dados); else await api.inserir(tabela, dados);
      delete estado.cache[tabela]; aviso('Salvo.'); navegar();
    } catch (err) { falha(err.message.includes('duplicate') ? new Error('Já existe um cadastro com esse código/documento.') : err); }
  };
  $('#novo')?.addEventListener('click', () => editar());
  if (def.edita()) $$('tr[data-i]', tela).forEach(tr => (tr.onclick = () => editar(linhas[tr.dataset.i])));
});

// ===================== Usuários e perfis =====================
const PERFIS = [['administrador', 'Administrador'], ['diretoria', 'Diretoria'], ['financeiro', 'Financeiro'], ['comprador', 'Comprador'],
                ['aprovador', 'Aprovador'], ['solicitante', 'Solicitante'], ['motorista', 'Motorista']];

rota('/config/usuarios', async tela => {
  if (!tem('administrador')) { tela.innerHTML = '<div class="cartao vazio">Somente o administrador gerencia usuários.</div>'; return; }
  const [us, ps, ccs] = await Promise.all([usuarios(true), api.listar('usuario_perfis', 'select=*'), centros()]);
  const perfisDe = id => ps.filter(p => p.usuario_id === id).map(p => p.perfil);
  tela.innerHTML = `
    <div class="topo"><div><h1>Usuários e perfis</h1><p class="sub">${us.filter(u => u.ativo).length} usuário(s) ativo(s)</p></div>
      <button class="btn prim" id="convidar">+ Convidar usuário</button></div>
    <div class="cartao"><div class="tabela-wrap"><table class="responsiva"><thead><tr><th>Nome</th><th>E-mail</th><th>Perfis</th><th>Centro de custo</th><th></th></tr></thead><tbody>
      ${us.map(u => `<tr class="clicavel" data-id="${u.id}"><td data-r="Nome">${esc(u.nome)}</td><td data-r="E-mail">${esc(u.email)}</td>
        <td data-r="Perfis">${perfisDe(u.id).map(p => `<span class="tag azul">${esc(PERFIS.find(x => x[0] === p)?.[1] || p)}</span>`).join(' ')}</td>
        <td data-r="Centro de custo">${esc(ccs.find(c => c.id === u.centro_custo_id)?.nome || '—')}</td><td>${u.ativo ? '' : '<span class="tag">Inativo</span>'}</td></tr>`).join('')}
    </tbody></table></div></div>
    <p class="muted">O convite chega por e-mail com um link de acesso. No primeiro acesso a pessoa cria a própria senha.</p>`;
  $('#convidar').onclick = async () => {
    const r = await modal(`<form><h2>Convidar usuário</h2><div class="form">
      <label class="campo largo">Nome completo<input name="nome" required></label>
      <label class="campo largo">E-mail<input type="email" name="email" required></label>
      <div class="largo"><div class="muted" style="margin-bottom:6px">Perfis</div>${PERFIS.map(([v, t]) => `<label class="check"><input type="checkbox" name="p_${v}" ${v === 'solicitante' ? 'checked' : ''}> ${t}</label>`).join('')}</div></div>
      <div class="rodape"><button type="button" class="btn" data-fechar>Voltar</button><button class="btn prim">Enviar convite</button></div></form>`);
    if (!r) return;
    try {
      await api.convidar(r.email.toLowerCase(), r.nome);
      const novo = await api.um('usuarios', `email=eq.${encodeURIComponent(r.email.toLowerCase())}`);
      if (novo) {
        await api.alterar('usuarios', `id=eq.${novo.id}`, { nome: r.nome });
        const sel = PERFIS.map(p => p[0]).filter(p => r['p_' + p]);
        await api.excluir('usuario_perfis', `usuario_id=eq.${novo.id}&perfil=not.in.(${sel.join(',') || 'x'})`);
        if (sel.length) await api.rest('usuario_perfis', { metodo: 'POST', corpo: sel.map(p => ({ usuario_id: novo.id, perfil: p })), prefer: 'resolution=ignore-duplicates' });
      }
      aviso('Convite enviado para ' + r.email + '.'); navegar();
    } catch (err) { falha(err); }
  };
  $$('tr[data-id]', tela).forEach(tr => (tr.onclick = async () => {
    const u = us.find(x => x.id === tr.dataset.id), atuais = perfisDe(u.id);
    const r = await modal(`<form><h2>${esc(u.nome)}</h2><p class="muted">${esc(u.email)}</p><div class="form">
      <label class="campo largo">Nome<input name="nome" value="${esc(u.nome)}" required></label>
      <label class="campo largo">Centro de custo<select name="cc">${opcoes(ccs.filter(c => c.ativo), null, c => c.nome, u.centro_custo_id, 'Nenhum')}</select></label>
      <div class="largo"><div class="muted" style="margin-bottom:6px">Perfis</div>${PERFIS.map(([v, t]) => `<label class="check"><input type="checkbox" name="p_${v}" ${atuais.includes(v) ? 'checked' : ''} ${v === 'administrador' && u.id === estado.usuario.id ? 'disabled' : ''}> ${t}</label>`).join('')}</div></div>
      <div class="rodape">${u.id !== estado.usuario.id ? `<button class="btn ${u.ativo ? 'perigo' : ''}" value="${u.ativo ? 'desativar' : 'ativar'}">${u.ativo ? 'Desativar acesso' : 'Reativar acesso'}</button>` : ''}
      <button type="button" class="btn" data-fechar>Voltar</button><button class="btn prim" value="salvar">Salvar</button></div></form>`);
    if (!r) return;
    try {
      const dados = { nome: r.nome, centro_custo_id: r.cc || null };
      if (r._acao === 'desativar' || r._acao === 'ativar') dados.ativo = r._acao === 'ativar';
      await api.alterar('usuarios', `id=eq.${u.id}`, dados);
      const sel = PERFIS.map(p => p[0]).filter(p => r['p_' + p] || (p === 'administrador' && u.id === estado.usuario.id && atuais.includes(p)));
      const tirar = atuais.filter(p => !sel.includes(p)), por = sel.filter(p => !atuais.includes(p));
      if (tirar.length) await api.excluir('usuario_perfis', `usuario_id=eq.${u.id}&perfil=in.(${tirar.join(',')})`);
      if (por.length) await api.inserir('usuario_perfis', por.map(p => ({ usuario_id: u.id, perfil: p })));
      delete estado.cache.usuarios; aviso('Usuário atualizado.'); navegar();
    } catch (err) { falha(err); }
  }));
});

// ===================== Auditoria =====================
const NOMES_TABELA = { reembolsos: 'Reembolso', titulos: 'Conta a pagar', titulo_parcelas: 'Parcela', baixas: 'Pagamento', usuarios: 'Usuário',
  usuario_perfis: 'Perfil de usuário', aprovacoes: 'Aprovação', fornecedores: 'Fornecedor', plano_contas: 'Plano de contas', centros_custo: 'Centro de custo',
  contas_bancarias: 'Conta bancária', anexos: 'Anexo', movimentos_bancarios: 'Movimento bancário', configuracoes: 'Configuração', alcadas: 'Alçada' };

rota('/config/auditoria', async tela => {
  const tab = estado.params.get('tabela') || '';
  const linhas = await api.listar('auditoria', `order=id.desc&limit=300${tab ? '&tabela=eq.' + tab : ''}`);
  const nomes = porId(await usuarios());
  const resumo = l => { const d = l.dados_depois || l.dados_antes || {}; return d.numero || d.nome || d.razao_social || d.codigo || d.perfil || d.titulo || ''; };
  const mudou = l => l.acao !== 'UPDATE' ? '' : Object.keys(l.dados_depois || {}).filter(k => !['atualizado_em', 'atualizado_por'].includes(k)
    && JSON.stringify(l.dados_depois[k]) !== JSON.stringify(l.dados_antes?.[k])).join(', ');
  tela.innerHTML = `
    <div class="topo"><div><h1>Auditoria</h1><p class="sub">Últimas 300 alterações${tab ? ' em ' + esc(NOMES_TABELA[tab] || tab) : ''}</p></div>
      <select id="tab" style="width:auto"><option value="">Todas as tabelas</option>${Object.entries(NOMES_TABELA).map(([k, v]) => `<option value="${k}" ${k === tab ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    <div class="cartao"><div class="tabela-wrap"><table class="responsiva"><thead><tr><th>Quando</th><th>Quem</th><th>O quê</th><th>Ação</th><th>Campos alterados</th></tr></thead><tbody>
      ${linhas.map(l => `<tr><td data-r="Quando" class="nowrap">${dataHoraBR(l.data_hora)}</td><td data-r="Quem">${esc(nomes[l.usuario_id]?.nome || 'Sistema')}</td>
        <td data-r="O quê">${esc(NOMES_TABELA[l.tabela] || l.tabela)} ${esc(resumo(l))}</td><td data-r="Ação">${{ INSERT: 'Criou', UPDATE: 'Alterou', DELETE: 'Removeu' }[l.acao]}</td>
        <td data-r="Campos" class="muted">${esc(mudou(l))}</td></tr>`).join('')}
    </tbody></table></div></div>`;
  $('#tab').onchange = e => (location.hash = '#/config/auditoria' + (e.target.value ? '?tabela=' + e.target.value : ''));
});

// ===================== Meu perfil =====================
rota('/perfil', async tela => {
  const u = estado.usuario;
  tela.innerHTML = `
    <div class="topo"><div><h1>Meu perfil</h1><p class="sub">${esc(u.email)} · ${estado.perfis.map(p => PERFIS.find(x => x[0] === p)?.[1] || p).join(', ')}</p></div></div>
    <form class="cartao form" id="f-perfil">
      <label class="campo">Nome<input name="nome" value="${esc(u.nome)}" required></label>
      <label class="campo">Telefone<input name="telefone" value="${esc(u.telefone || '')}" inputmode="tel"></label>
      <label class="campo largo">Chave Pix (para receber reembolsos)<input name="chave_pix" value="${esc(u.chave_pix || '')}"></label>
      <div class="largo"><button class="btn prim">Salvar</button></div></form>
    <form class="cartao form" id="f-senha2"><h2 class="largo" style="margin:0">Trocar senha</h2>
      <label class="campo">Nova senha<input type="password" name="s1" minlength="8" autocomplete="new-password" required></label>
      <label class="campo">Repita<input type="password" name="s2" minlength="8" autocomplete="new-password" required></label>
      <div class="largo"><button class="btn">Trocar senha</button></div></form>`;
  $('#f-perfil').onsubmit = async e => { e.preventDefault(); const d = formDados(e.target);
    try { const [n] = await api.alterar('usuarios', `id=eq.${u.id}`, { nome: d.nome, telefone: d.telefone || null, chave_pix: d.chave_pix || null });
          Object.assign(estado.usuario, n); aviso('Perfil salvo.'); navegar(); } catch (err) { falha(err); } };
  $('#f-senha2').onsubmit = async e => { e.preventDefault(); const d = formDados(e.target);
    if (d.s1 !== d.s2) return aviso('As senhas não são iguais.', true);
    try { await api.definirSenha(d.s1); e.target.reset(); aviso('Senha alterada.'); } catch (err) { falha(err); } };
});

// ===================== Início do app =====================
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
iniciar();
