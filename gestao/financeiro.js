// Verbo Gestão — Contas a pagar e Contas a receber
'use strict';

const FAIXAS = {
  vencidos: ['Vencidas', p => p.vencida],
  '1_vencidos': ['Vencidas', p => p.vencida],
  '2_hoje': ['Vencem hoje', p => p.vencimento === hojeISO()],
  '3_7_dias': ['Próximos 7 dias', p => p.vencimento > hojeISO() && p.vencimento <= somaDias(hojeISO(), 7)],
  '4_30_dias': ['Próximos 30 dias', p => p.vencimento > somaDias(hojeISO(), 7) && p.vencimento <= somaDias(hojeISO(), 30)],
};

// Textos e regras que mudam entre pagar e receber
const TIPO = {
  pagar: { titulo: 'Contas a pagar', novo: 'Nova conta a pagar', rota: '#/financeiro/pagar', pessoa: 'Favorecido', cadastro: 'Fornecedor',
           baixa: 'Registrar pagamento', baixaFeita: 'Pagamento registrado.', conta: 'Saiu de qual conta', feito: 'Pago', feitas: 'Pagas',
           legado: 'Compra anterior ao sistema (controlar só a quitação)', exemplo: 'Ex.: aluguel de outubro', tiposConta: ['custo', 'despesa', 'financeiro', 'investimento', 'deducao'] },
  receber: { titulo: 'Contas a receber', novo: 'Nova conta a receber', rota: '#/financeiro/receber', pessoa: 'Cliente', cadastro: 'Cliente',
           baixa: 'Registrar recebimento', baixaFeita: 'Recebimento registrado.', conta: 'Entrou em qual conta', feito: 'Recebido', feitas: 'Recebidas',
           legado: 'Venda anterior ao sistema (controlar só o recebimento)', exemplo: 'Ex.: frete São Paulo × Campinas, CT-e 123', tiposConta: ['receita', 'financeiro'] },
};
const clientes = f => cad('clientes', 'select=id,nome,documento,ativo&order=nome', f);

async function listaTitulos(tela, tipo) {
  const T = TIPO[tipo];
  const st = estado.params.get('status') || 'abertas';
  const faixa = estado.params.get('faixa') || '';
  const busca = (estado.params.get('q') || '').toLowerCase();
  const filtroSt = { abertas: 'status=in.(aberta,aprovada,prevista)', pagas: 'status=eq.paga', todas: 'status=neq.cancelada' }[st];
  let ps = await api.listar('v_parcelas', `tipo=eq.${tipo}&${filtroSt}&order=vencimento,titulo_numero&limit=2000`);
  const pessoas = porId(tipo === 'pagar' ? await fornecedores() : await clientes());
  const nome = p => (tipo === 'pagar' ? pessoas[p.fornecedor_id]?.razao_social : pessoas[p.cliente_id]?.nome) || p.favorecido_nome || '—';
  if (faixa && FAIXAS[faixa]) ps = ps.filter(FAIXAS[faixa][1]);
  if (busca) ps = ps.filter(p => (nome(p) + ' ' + (p.descricao || '') + ' ' + p.titulo_numero).toLowerCase().includes(busca));
  const total = ps.reduce((s, p) => s + Number(st === 'pagas' ? p.valor_pago : p.saldo), 0);
  const colValor = st === 'pagas' ? T.feito : 'Saldo';
  tela.innerHTML = `
    <div class="topo"><div><h1>${T.titulo}</h1><p class="sub">${ps.length} parcela(s) · ${brl(total)}</p></div>
      ${editaFin() ? `<div class="acoes"><a class="btn prim" href="${T.rota}/novo">+ ${T.novo}</a></div>` : ''}</div>
    <form class="filtros" id="filtros">
      <select name="status">${[['abertas', 'Em aberto'], ['pagas', T.feitas], ['todas', 'Todas']].map(([v, t]) => `<option value="${v}" ${v === st ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <select name="faixa"><option value="">Qualquer vencimento</option>${Object.entries(FAIXAS).filter(([k]) => k !== 'vencidos').map(([k, [t]]) => `<option value="${k}" ${k === faixa ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <input name="q" placeholder="Buscar ${T.pessoa.toLowerCase()} ou descrição" value="${esc(estado.params.get('q') || '')}">
      <button class="btn">Filtrar</button></form>
    <div class="cartao">${ps.length ? `<div class="tabela-wrap"><table class="responsiva"><thead><tr><th>Vencimento</th><th>${T.pessoa}</th><th>Descrição</th><th>Título</th><th class="num">Valor</th><th class="num">${colValor}</th><th>Situação</th></tr></thead><tbody>
      ${ps.map(p => `<tr class="clicavel" data-t="${p.titulo_id}"><td data-r="Vencimento" class="nowrap">${dataBR(p.vencimento)}</td><td data-r="${T.pessoa}">${esc(nome(p))}</td>
        <td data-r="Descrição">${esc(p.descricao || '')}</td><td data-r="Título" class="nowrap">${esc(p.titulo_numero)}${p.parcela > 1 ? ` <span class="muted">${p.parcela}ª</span>` : ''}</td>
        <td data-r="Valor" class="num">${brl(p.valor)}</td><td data-r="${colValor}" class="num"><b>${brl(st === 'pagas' ? p.valor_pago : p.saldo)}</b></td><td data-r="Situação">${tagTitulo(p.status, p.vencida, tipo)}</td></tr>`).join('')}
      </tbody><tfoot><tr><td colspan="5">Total</td><td class="num">${brl(total)}</td><td></td></tr></tfoot></table></div>` : '<div class="vazio">Nenhuma conta encontrada.</div>'}</div>`;
  $('#filtros').onsubmit = e => { e.preventDefault(); const d = formDados(e.target);
    location.hash = T.rota + '?' + new URLSearchParams(Object.entries(d).filter(([, v]) => v)).toString(); };
  $$('tr[data-t]', tela).forEach(tr => (tr.onclick = () => (location.hash = T.rota + '/ver/' + tr.dataset.t)));
}
const tagTitulo = (s, vencida, tipo) => tipo === 'receber' && ['paga', 'pago'].includes(s) ? '<span class="tag verde">Recebida</span>' : tag(s, vencida);

async function novoTitulo(tela, tipo) {
  const T = TIPO[tipo];
  if (!editaFin()) { tela.innerHTML = '<div class="cartao vazio">Sem permissão.</div>'; return; }
  const [pess, ccs] = await Promise.all([tipo === 'pagar' ? fornecedores(true) : clientes(true), centros()]);
  const rot = x => tipo === 'pagar' ? x.razao_social : x.nome + (x.documento ? ' · ' + x.documento : '');
  tela.innerHTML = `
    <div class="topo"><div><h1>${T.novo}</h1><p class="sub">${tipo === 'pagar' ? 'Para compras anteriores ao sistema, marque a opção no fim do formulário.' : 'Fretes e outras receitas. Pode dividir em parcelas.'}</p></div></div>
    <form class="cartao form" id="f-tit">
      <label class="campo largo">${T.cadastro}<select name="pessoa_id">${opcoes(pess.filter(f => f.ativo), null, rot, null, 'Sem cadastro (digitar nome abaixo)')}</select></label>
      <label class="campo largo" id="campo-fav">Nome do ${T.pessoa.toLowerCase()}<input name="favorecido_nome" placeholder="${tipo === 'pagar' ? 'Quem vai receber' : 'Quem vai pagar'}"></label>
      <label class="campo largo">Descrição<input name="descricao" required placeholder="${T.exemplo}"></label>
      <label class="campo">Nº do documento (${tipo === 'pagar' ? 'NF, boleto' : 'NF, CT-e, fatura'})<input name="documento"></label>
      <label class="campo">Data de emissão<input type="date" name="data_emissao" value="${hojeISO()}" required></label>
      <label class="campo">Conta do plano<select name="conta_id" required>${await opcoesContas(null, T.tiposConta)}</select></label>
      <label class="campo">Centro de custo<select name="centro_custo_id">${opcoes(ccs.filter(c => c.ativo), null, c => c.nome, ccs.find(c => c.codigo === 'GERAL')?.id, null)}</select></label>
      <label class="campo">Valor total (R$)<input name="valor" inputmode="decimal" required placeholder="0,00"></label>
      <label class="campo">Nº de parcelas<input type="number" name="parcelas" min="1" max="60" value="1" required></label>
      <label class="campo">1º vencimento<input type="date" name="vencimento" value="${hojeISO()}" required></label>
      <label class="campo">Intervalo<select name="intervalo"><option value="mes">Mensal</option><option value="30">A cada 30 dias</option><option value="15">A cada 15 dias</option><option value="7">Semanal</option></select></label>
      <label class="check largo"><input type="checkbox" name="legado"> ${T.legado}</label>
      <label class="campo largo">Anexos (${tipo === 'pagar' ? 'boleto, nota' : 'nota, CT-e, comprovante'})<input type="file" name="arquivos" accept="image/*,application/pdf" multiple></label>
      <div class="largo muted" id="previa"></div>
      <div class="largo acoes"><button class="btn prim">Salvar</button><a class="btn" href="${T.rota}">Cancelar</a></div>
    </form>`;
  const f = $('#f-tit');
  const venc = (d, i) => d.intervalo === 'mes' ? somaMeses(d.vencimento, i) : somaDias(d.vencimento, i * Number(d.intervalo));
  const plano = d => {
    const n = Math.max(1, parseInt(d.parcelas) || 1), v = num(d.valor) || 0;
    const base = Math.floor((v / n) * 100) / 100;
    return Array.from({ length: n }, (_, i) => ({ parcela: i + 1, vencimento: venc(d, i), valor: i === n - 1 ? Math.round((v - base * (n - 1)) * 100) / 100 : base }));
  };
  const prev = () => { const d = formDados(f); $('#campo-fav').hidden = !!d.pessoa_id;
    $('#previa').innerHTML = num(d.valor) ? plano(d).map(x => `${x.parcela}ª ${dataBR(x.vencimento)} · ${brl(x.valor)}`).join(' &nbsp;|&nbsp; ') : ''; };
  f.oninput = prev; prev();
  f.onsubmit = async e => {
    e.preventDefault();
    const d = formDados(f);
    if (!d.pessoa_id && !d.favorecido_nome) return aviso(`Escolha o ${T.cadastro.toLowerCase()} ou digite o nome.`, true);
    const v = num(d.valor); if (!v || v <= 0) return aviso('Informe o valor.', true);
    await ocupado(e.submitter, async () => {
      try {
        const [t] = await api.inserir('titulos', { tipo, origem: d.legado ? 'legado' : 'avulso',
          fornecedor_id: tipo === 'pagar' ? d.pessoa_id || null : null, cliente_id: tipo === 'receber' ? d.pessoa_id || null : null,
          favorecido_nome: d.pessoa_id ? null : d.favorecido_nome, descricao: d.descricao, documento: d.documento || null,
          data_emissao: d.data_emissao, competencia: d.data_emissao.slice(0, 8) + '01', conta_id: d.conta_id, centro_custo_id: d.centro_custo_id || null, valor_total: v, status: 'aberto' });
        await api.inserir('titulo_parcelas', plano(d).map(p => ({ ...p, titulo_id: t.id, status: 'aberta' })));
        await anexar('titulo', t.id, d.arquivos);
        aviso(`${tipo === 'pagar' ? 'Conta a pagar' : 'Conta a receber'} ${t.numero} criada.`);
        location.hash = T.rota + '/ver/' + t.id;
      } catch (err) { falha(err); }
    });
  };
}

async function verTitulo(tela, id, tipo) {
  const T = TIPO[tipo];
  const t = await api.um('titulos', `id=eq.${id}&select=*,conta:plano_contas(codigo,nome),cc:centros_custo(nome),forn:fornecedores(razao_social,chave_pix),cli:clientes(nome,documento),colab:usuarios(nome,chave_pix)`);
  if (!t) { tela.innerHTML = '<div class="cartao vazio">Conta não encontrada ou sem acesso.</div>'; return; }
  if (t.tipo && t.tipo !== tipo) { location.hash = TIPO[t.tipo].rota + '/ver/' + id; return; }
  const ps = await api.listar('titulo_parcelas', `titulo_id=eq.${id}&order=parcela`);
  const baixas = veTudo() && ps.length ? await api.listar('baixas', `parcela_id=${lista(ps.map(p => p.id))}&cancelado_em=is.null&order=data_pagamento`) : [];
  const bs = await bancos();
  const reembs = t.origem === 'reembolso' ? await api.listar('reembolsos', `titulo_id=eq.${id}&select=id,numero,data_despesa,descricao,valor&order=data_despesa`) : [];
  const pessoa = t.forn?.razao_social || t.cli?.nome || t.colab?.nome || t.favorecido_nome || '—';
  const pix = t.forn?.chave_pix || t.colab?.chave_pix;
  const origens = { reembolso: 'Reembolso', avulso: 'Lançamento avulso', legado: tipo === 'pagar' ? 'Compra anterior ao sistema' : 'Venda anterior ao sistema', pedido: 'Pedido de compra' };
  tela.innerHTML = `
    <div class="topo"><div><h1>${esc(t.numero)} · ${esc(pessoa)}</h1><p class="sub">${tagTitulo(t.status, false, tipo)} · ${esc(t.descricao || '')}</p></div>
      <div class="acoes">${editaFin() && !['pago', 'cancelado'].includes(t.status) && !baixas.length ? '<button class="btn perigo" id="cancelar">Cancelar conta</button>' : ''}
        <button class="btn" onclick="history.back()">Voltar</button></div></div>
    <div class="cartao"><div class="form">
      <div><div class="muted">${T.pessoa}</div><b>${esc(pessoa)}</b>${t.cli?.documento ? `<div class="muted">${esc(t.cli.documento)}</div>` : ''}${pix ? `<div class="muted">Pix: ${esc(pix)}</div>` : ''}</div>
      <div><div class="muted">Valor total</div><b>${brl(t.valor_total)}</b></div>
      <div><div class="muted">Documento</div><b>${esc(t.documento || '—')}</b></div>
      <div><div class="muted">Emissão</div><b>${dataBR(t.data_emissao)}</b></div>
      <div><div class="muted">Conta</div><b>${esc(t.conta ? t.conta.codigo + ' ' + t.conta.nome : '—')}</b></div>
      <div><div class="muted">Centro de custo</div><b>${esc(t.cc?.nome || '—')}</b></div>
      <div><div class="muted">Origem</div><b>${esc(origens[t.origem] || t.origem)}</b></div>
      <div class="largo"><div class="muted">Anexos</div>${await htmlAnexos('titulo', id)}
        ${editaFin() ? '<label class="campo" style="margin-top:8px">Incluir anexo<input type="file" id="mais" accept="image/*,application/pdf" multiple></label>' : ''}</div>
    </div></div>
    ${reembs.length ? `<div class="cartao"><h2>Reembolsos deste pagamento</h2><table><tbody>${reembs.map(r => `<tr class="clicavel" onclick="location.hash='#/reembolsos/ver/${r.id}'"><td>${esc(r.numero)}</td><td>${dataBR(r.data_despesa)}</td><td>${esc(r.descricao || '')}</td><td class="num">${brl(r.valor)}</td></tr>`).join('')}</tbody></table></div>` : ''}
    <div class="cartao"><h2>Parcelas</h2><div class="tabela-wrap"><table class="responsiva"><thead><tr><th>Parcela</th><th>Vencimento</th><th class="num">Valor</th><th class="num">${T.feito}</th><th>Situação</th><th></th></tr></thead><tbody>
      ${ps.map(p => `<tr><td data-r="Parcela">${p.parcela}ª</td><td data-r="Vencimento">${dataBR(p.vencimento)}</td><td data-r="Valor" class="num">${brl(p.valor)}</td>
        <td data-r="${T.feito}" class="num">${brl(p.valor_pago)}</td><td data-r="Situação">${tagTitulo(p.status, ['aberta', 'aprovada'].includes(p.status) && p.vencimento < hojeISO(), tipo)}</td>
        <td>${editaFin() && ['aberta', 'aprovada'].includes(p.status) && t.status !== 'cancelado' ? `<button class="btn ok peq" data-baixa="${p.id}">${T.baixa}</button>` : ''}</td></tr>`).join('')}
    </tbody></table></div></div>
    ${baixas.length ? `<div class="cartao"><h2>${tipo === 'pagar' ? 'Pagamentos' : 'Recebimentos'}</h2><ul class="lista-simples">${baixas.map(b => `<li><span>${dataBR(b.data_pagamento)} · ${esc(bs.find(x => x.id === b.conta_bancaria_id)?.nome || '')}${b.observacao ? ' · ' + esc(b.observacao) : ''}</span><b>${brl(Number(b.valor) + Number(b.juros) + Number(b.multa) - Number(b.desconto))}</b></li>`).join('')}</ul></div>` : ''}`;
  $('#mais')?.addEventListener('change', async e => { try { await anexar('titulo', id, [...e.target.files]); aviso('Anexo incluído.'); navegar(); } catch (err) { falha(err); } });
  $('#cancelar')?.addEventListener('click', async () => {
    const motivo = await confirmar('Cancelar esta conta?', { comMotivo: true, botao: 'Cancelar conta' });
    if (!motivo) return;
    try {
      await api.alterar('titulo_parcelas', `titulo_id=eq.${id}&status=in.(aberta,aprovada,prevista)`, { status: 'cancelada' });
      await api.alterar('titulos', `id=eq.${id}`, { status: 'cancelado', cancelado_em: new Date().toISOString(), cancelado_por: estado.usuario.id, motivo_cancelamento: motivo });
      if (t.origem === 'reembolso') await api.alterar('reembolsos', `titulo_id=eq.${id}&status=eq.em_pagamento`, { status: 'aprovado', titulo_id: null });
      aviso('Conta cancelada.'); navegar();
    } catch (err) { falha(err); }
  });
  $$('[data-baixa]', tela).forEach(b => b.addEventListener('click', async () => {
    const p = ps.find(x => x.id === b.dataset.baixa);
    const saldo = Number(p.valor) - Number(p.valor_pago);
    const r = await modal(`<form><h2>${T.baixa} · ${p.parcela}ª parcela</h2><div class="form">
      <label class="campo">Data<input type="date" name="data" value="${hojeISO()}" required></label>
      <label class="campo">Valor (R$)<input name="valor" inputmode="decimal" value="${saldo.toFixed(2).replace('.', ',')}" required></label>
      <label class="campo">${T.conta}<select name="conta" required>${opcoes(bs.filter(x => x.ativo), null, x => x.nome, bs.find(x => x.tipo === 'corrente')?.id, null)}</select></label>
      <label class="campo">Juros (R$)<input name="juros" inputmode="decimal" placeholder="0,00"></label>
      <label class="campo">Multa (R$)<input name="multa" inputmode="decimal" placeholder="0,00"></label>
      <label class="campo">Desconto (R$)<input name="desconto" inputmode="decimal" placeholder="0,00"></label>
      <label class="campo largo">Observação<input name="obs"></label>
      <label class="campo largo">Comprovante<input type="file" name="arquivos" accept="image/*,application/pdf" multiple></label></div>
      <div class="rodape"><button type="button" class="btn" data-fechar>Voltar</button><button class="btn ok">Confirmar</button></div></form>`);
    if (!r) return;
    try {
      await api.rpc('registrar_baixa', { p_parcela: p.id, p_data: r.data, p_valor: num(r.valor), p_conta_bancaria: r.conta,
        p_juros: num(r.juros) || 0, p_multa: num(r.multa) || 0, p_desconto: num(r.desconto) || 0, p_obs: r.obs || null });
      await anexar('titulo', id, r.arquivos);
      aviso(T.baixaFeita); navegar();
    } catch (err) { falha(err); }
  }));
}

rota('/financeiro/pagar', tela => listaTitulos(tela, 'pagar'));
rota('/financeiro/pagar/novo', tela => novoTitulo(tela, 'pagar'));
rota('/financeiro/pagar/ver/:id', (tela, id) => verTitulo(tela, id, 'pagar'));
rota('/financeiro/receber', tela => listaTitulos(tela, 'receber'));
rota('/financeiro/receber/novo', tela => novoTitulo(tela, 'receber'));
rota('/financeiro/receber/ver/:id', (tela, id) => verTitulo(tela, id, 'receber'));
