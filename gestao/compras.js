// Verbo Gestão — Compras: requisição → cotação → aprovação da compra → pedido → recebimento (NF) → conta a pagar
'use strict';

Object.assign(STATUS, {
  aguardando_cotacao: ['Aguardando cotação', 'amarelo'], em_cotacao: ['Em cotação', 'azul'], pedido_emitido: ['Pedido emitido', 'azul'],
  recebida: ['Recebida', 'verde'], emitido: ['Emitido · a receber', 'azul'], parcialmente_recebido: ['Recebido em parte', 'amarelo'],
  recebido: ['Recebido', 'verde'], conferido: ['Conferido', 'verde'], com_divergencia: ['Com divergência', 'vermelho'],
});
const URGENCIA = { baixa: 'Baixa', normal: 'Normal', alta: 'Alta (urgente)' };
const UNIDADES = ['un', 'pç', 'cx', 'kg', 'l', 'm', 'm²', 'par', 'jogo', 'serviço', 'mês'];
const ehComprador = () => tem('administrador', 'comprador');
const veCompras = () => veTudo() || tem('comprador', 'aprovador');
const minimoCot = v => (v <= 1000 ? 1 : v <= 5000 ? 2 : 3);   // espelha regras_cotacao (mínimo obrigatório)
const SELECT_REQ = 'select=*,cc:centros_custo(nome),solic:usuarios!requisicoes_solicitante_id_fkey(nome)';
const nomeForn = f => f ? (f.nome_fantasia ? `${f.razao_social} (${f.nome_fantasia})` : f.razao_social) : '—';

async function listarReq(consulta) {
  try { return await api.listar('requisicoes', `${SELECT_REQ}&${consulta}`); }
  catch { return api.listar('requisicoes', `select=*,cc:centros_custo(nome)&${consulta}`); }   // se o nome da relação mudar
}

function tabelaReq(linhas, comSolic = true) {
  if (!linhas.length) return '<div class="vazio">Nenhuma requisição.</div>';
  return `<div class="tabela-wrap"><table class="responsiva"><thead><tr><th>Nº</th><th>Data</th>${comSolic ? '<th>Solicitante</th>' : ''}<th>O que precisa</th><th>Urgência</th><th class="num">Estimado</th><th>Situação</th></tr></thead><tbody>
    ${linhas.map(r => `<tr class="clicavel" onclick="location.hash='#/compras/requisicoes/ver/${r.id}'"><td data-r="Nº" class="nowrap">${esc(r.numero)}</td>
      <td data-r="Data">${dataBR(r.criado_em)}</td>${comSolic ? `<td data-r="Solicitante">${esc(r.solic?.nome || '')}</td>` : ''}
      <td data-r="O que precisa">${esc(r.justificativa || '')}</td><td data-r="Urgência">${r.urgencia === 'alta' ? '<span class="tag vermelho">Urgente</span>' : esc(URGENCIA[r.urgencia] || '')}</td>
      <td data-r="Estimado" class="num">${brl(r.valor_estimado)}</td><td data-r="Situação">${tag(r.status)}</td></tr>`).join('')}
  </tbody></table></div>`;
}

// ---------- Requisições ----------
rota('/compras/requisicoes', async tela => {
  const todas = ehComprador() || veTudo();
  const st = estado.params.get('status') || (todas ? 'abertas' : 'todas');
  const filtro = { abertas: 'status=in.(rascunho,aguardando_cotacao,em_cotacao,aguardando_aprovacao,pedido_emitido)', a_cotar: 'status=in.(aguardando_cotacao,em_cotacao)',
                   concluidas: 'status=in.(recebida,reprovada,cancelada)', todas: 'status=neq.cancelada' }[st] || 'status=neq.cancelada';
  const minhas = estado.params.get('minhas') === '1' || !todas;
  const ls = await listarReq(`${filtro}${minhas ? '&solicitante_id=eq.' + estado.usuario.id : ''}&order=criado_em.desc&limit=500`);
  tela.innerHTML = `
    <div class="topo"><div><h1>${minhas ? 'Minhas requisições' : 'Requisições de compra'}</h1><p class="sub">Peça aqui o que precisa comprar. Compras cota, a compra é aprovada e o pedido é emitido.</p></div>
      <a class="btn prim" href="#/compras/requisicoes/nova">+ Nova requisição</a></div>
    <form class="filtros" id="filtros"><select name="status">${[['abertas', 'Em andamento'], ['a_cotar', 'A cotar'], ['concluidas', 'Concluídas'], ['todas', 'Todas']]
      .map(([v, t]) => `<option value="${v}" ${v === st ? 'selected' : ''}>${t}</option>`).join('')}</select>
      ${todas ? `<label class="check"><input type="checkbox" name="minhas" ${minhas ? 'checked' : ''}> Só as minhas</label>` : ''}<button class="btn">Filtrar</button></form>
    <div class="cartao">${tabelaReq(ls, !minhas)}</div>`;
  $('#filtros').onsubmit = e => { e.preventDefault(); const d = formDados(e.target);
    location.hash = '#/compras/requisicoes?status=' + d.status + (d.minhas ? '&minhas=1' : ''); };
});

// ---------- Nova / editar requisição ----------
rota('/compras/requisicoes/nova', tela => formRequisicao(tela));
rota('/compras/requisicoes/editar/:id', async (tela, id) => formRequisicao(tela, await api.um('requisicoes', `id=eq.${id}`)));

async function formRequisicao(tela, r = null) {
  if (r && !(['rascunho', 'devolvida'].includes(r.status) || (ehComprador() && ['aguardando_cotacao', 'em_cotacao'].includes(r.status)))) {
    tela.innerHTML = '<div class="cartao vazio">Esta requisição não pode mais ser alterada.</div>'; return;
  }
  const [ccs, itens] = await Promise.all([centros(), r ? api.listar('requisicao_itens', `requisicao_id=eq.${r.id}&order=id`) : []]);
  const ccPadrao = r?.centro_custo_id || estado.usuario.centro_custo_id || ccs.find(c => c.codigo === 'GERAL')?.id;
  const linhaItem = (i = {}) => `<tr class="item">
      <td data-r="Descrição"><input name="i_desc" value="${esc(i.descricao || '')}" placeholder="Ex.: pneu 295/80 R22,5 liso" aria-label="Descrição"></td>
      <td data-r="Qtd."><input name="i_qtd" inputmode="decimal" value="${i.quantidade != null ? String(Number(i.quantidade)).replace('.', ',') : '1'}" aria-label="Quantidade" style="width:70px"></td>
      <td data-r="Unid."><select name="i_un" aria-label="Unidade">${UNIDADES.map(u => `<option ${u === (i.unidade || 'un') ? 'selected' : ''}>${u}</option>`).join('')}</select></td>
      <td data-r="Valor unit. estimado"><input name="i_val" inputmode="decimal" value="${i.valor_estimado ? Number(i.valor_estimado).toFixed(2).replace('.', ',') : ''}" placeholder="0,00" aria-label="Valor unitário estimado" style="width:110px"></td>
      <td data-r="Subtotal" class="num sub-item-v">—</td>
      <td><button type="button" class="btn peq perigo rem" aria-label="Remover item">✕</button></td></tr>`;
  tela.innerHTML = `
    <div class="topo"><div><h1>${r ? 'Editar requisição ' + esc(r.numero) : 'Nova requisição de compra'}</h1>
      <p class="sub">Descreva o que precisa. O valor estimado define quantas cotações Compras precisa buscar (até R$ 1.000: 1 · até R$ 5.000: 2 · acima: 3).</p></div></div>
    <form class="cartao form" id="f-req">
      <label class="campo largo">Para que é a compra?<input name="justificativa" required value="${esc(r?.justificativa || '')}" placeholder="Ex.: troca dos pneus dianteiros do caminhão ABC-1D23"></label>
      <label class="campo">Centro de custo<select name="cc">${opcoes(ccs.filter(c => c.ativo), null, c => c.nome, ccPadrao, null)}</select></label>
      <label class="campo">Precisa até<input type="date" name="data_necessidade" value="${r?.data_necessidade || ''}"></label>
      <label class="campo">Urgência<select name="urgencia">${Object.entries(URGENCIA).map(([v, t]) => `<option value="${v}" ${v === (r?.urgencia || 'normal') ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <div class="largo"><b>Itens</b>
        <div class="tabela-wrap"><table class="responsiva itens-req"><thead><tr><th>Descrição</th><th>Qtd.</th><th>Unid.</th><th>Valor unit. estimado</th><th class="num">Subtotal</th><th></th></tr></thead>
        <tbody id="itens">${(itens.length ? itens : [{}]).map(linhaItem).join('')}</tbody></table></div>
        <button type="button" class="btn peq" id="mais-item" style="margin-top:8px">+ Item</button>
        <div class="conferencia" style="margin-top:10px">Total estimado: <b id="total-est">R$ 0,00</b> · <span id="min-cot" class="muted"></span></div></div>
      <label class="campo largo">Anexos (foto, link do produto em PDF, orçamento que você já tem)<input type="file" name="arquivos" accept="image/*,application/pdf" multiple></label>
      ${r ? `<div class="largo">Anexos atuais: ${await htmlAnexos('requisicao', r.id)}</div>` : ''}
      <div class="largo acoes"><button class="btn prim" value="enviar">${r && r.status !== 'rascunho' && r.status !== 'devolvida' ? 'Salvar' : 'Enviar para Compras'}</button>
        ${!r || ['rascunho', 'devolvida'].includes(r.status) ? '<button class="btn" value="rascunho">Salvar rascunho</button>' : ''}<a class="btn" href="javascript:history.back()">Cancelar</a></div>
    </form>`;
  const f = $('#f-req'), corpo = $('#itens');
  const lerItens = () => $$('tr.item', corpo).map(tr => ({ descricao: $('[name=i_desc]', tr).value.trim(), quantidade: num($('[name=i_qtd]', tr).value) || 0,
    unidade: $('[name=i_un]', tr).value, valor_estimado: num($('[name=i_val]', tr).value) || 0, tr })).filter(i => i.descricao);
  const recalcular = () => {
    let total = 0;
    $$('tr.item', corpo).forEach(tr => { const q = num($('[name=i_qtd]', tr).value) || 0, v = num($('[name=i_val]', tr).value) || 0;
      total += q * v; $('.sub-item-v', tr).textContent = q * v ? brl(q * v) : '—'; });
    $('#total-est').textContent = brl(total);
    $('#min-cot').textContent = total ? `mínimo de ${minimoCot(total)} cotação(ões)` : 'informe os valores estimados, se souber';
    return total;
  };
  const ligar = () => { $$('.rem', corpo).forEach(b => (b.onclick = () => { if ($$('tr.item', corpo).length > 1) b.closest('tr').remove(); else $$('input', b.closest('tr')).forEach(i => (i.value = '')); recalcular(); }));
    $$('input', corpo).forEach(i => (i.oninput = recalcular)); };
  $('#mais-item').onclick = () => { corpo.insertAdjacentHTML('beforeend', linhaItem()); ligar(); $('tr.item:last-child [name=i_desc]', corpo).focus(); };
  ligar(); recalcular();
  f.onsubmit = async e => {
    e.preventDefault();
    const d = formDados(f), acao = e.submitter?.value || 'enviar';
    const its = lerItens();
    if (!its.length) return aviso('Inclua pelo menos um item.', true);
    if (its.some(i => !(i.quantidade > 0))) return aviso('Informe a quantidade de cada item.', true);
    const total = Math.round(its.reduce((s, i) => s + i.quantidade * i.valor_estimado, 0) * 100) / 100;
    await ocupado(e.submitter, async () => {
      try {
        const dados = { justificativa: d.justificativa, centro_custo_id: d.cc || null, data_necessidade: d.data_necessidade || null, urgencia: d.urgencia, valor_estimado: total };
        let id = r?.id, numero = r?.numero;
        if (r) {
          // itens só podem ser trocados com a requisição em rascunho (ou por Compras)
          if (r.status === 'devolvida') await api.alterar('requisicoes', `id=eq.${id}`, { status: 'rascunho' });
          await api.alterar('requisicoes', `id=eq.${id}`, dados);
          await api.excluir('requisicao_itens', `requisicao_id=eq.${id}`);
        } else {
          const [nova] = await api.inserir('requisicoes', { ...dados, solicitante_id: estado.usuario.id, status: 'rascunho' });
          id = nova.id; numero = nova.numero;
        }
        await api.inserir('requisicao_itens', its.map(i => ({ requisicao_id: id, descricao: i.descricao, quantidade: i.quantidade, unidade: i.unidade, valor_estimado: i.valor_estimado })));
        await anexar('requisicao', id, d.arquivos);
        if (acao === 'enviar' && (!r || ['rascunho', 'devolvida'].includes(r.status))) {
          await api.alterar('requisicoes', `id=eq.${id}`, { status: 'aguardando_cotacao' });
          aviso(`Requisição ${numero} enviada para Compras.`);
        } else aviso('Requisição salva.');
        location.hash = '#/compras/requisicoes/ver/' + id;
      } catch (err) { falha(err); }
    });
  };
}

// ---------- Detalhe da requisição ----------
rota('/compras/requisicoes/ver/:id', async (tela, id) => {
  const [r] = await listarReq(`id=eq.${id}`);
  if (!r) { tela.innerHTML = '<div class="cartao vazio">Requisição não encontrada ou sem acesso.</div>'; return; }
  const [itens, cots, peds] = await Promise.all([
    api.listar('requisicao_itens', `requisicao_id=eq.${id}&order=id`),
    api.listar('cotacoes', `requisicao_id=eq.${id}&order=criado_em.desc`).catch(() => []),
    api.listar('pedidos', `requisicao_id=eq.${id}&order=criado_em.desc`).catch(() => [])]);
  const dono = r.solicitante_id === estado.usuario.id;
  const cot = cots.find(c => c.status !== 'cancelada');
  const podeEditar = (dono && ['rascunho', 'devolvida'].includes(r.status)) || (ehComprador() && ['aguardando_cotacao', 'em_cotacao'].includes(r.status));
  tela.innerHTML = `
    <div class="topo"><div><h1>Requisição ${esc(r.numero)}</h1><p class="sub">${tag(r.status)} · ${esc(r.justificativa || '')}</p></div>
      <div class="acoes">
        ${ehComprador() && ['aguardando_cotacao', 'em_cotacao'].includes(r.status) ? `<button class="btn prim" id="cotar">${cot ? 'Abrir cotação' : 'Iniciar cotação'}</button>` : ''}
        ${dono && ['rascunho', 'devolvida'].includes(r.status) ? '<button class="btn prim" id="enviar">Enviar para Compras</button>' : ''}
        ${podeEditar ? `<a class="btn" href="#/compras/requisicoes/editar/${id}">Editar</a>` : ''}
        ${(dono && ['rascunho', 'devolvida', 'aguardando_cotacao'].includes(r.status)) || (ehComprador() && ['aguardando_cotacao', 'em_cotacao'].includes(r.status)) ? '<button class="btn perigo" id="cancelar">Cancelar</button>' : ''}
        <button class="btn" onclick="history.back()">Voltar</button></div></div>
    <div class="cartao"><div class="form">
      <div><div class="muted">Solicitante</div><b>${esc(r.solic?.nome || '')}</b><div class="muted">${dataHoraBR(r.criado_em)}</div></div>
      <div><div class="muted">Centro de custo</div><b>${esc(r.cc?.nome || '—')}</b></div>
      <div><div class="muted">Precisa até</div><b>${r.data_necessidade ? dataBR(r.data_necessidade) : '—'}</b> ${r.urgencia === 'alta' ? '<span class="tag vermelho">Urgente</span>' : ''}</div>
      <div><div class="muted">Estimado</div><b>${brl(r.valor_estimado)}</b><div class="muted">mínimo de ${minimoCot(Number(r.valor_estimado))} cotação(ões)</div></div>
      ${r.motivo_cancelamento ? `<div class="largo alerta-obs"><b>Cancelada:</b> ${esc(r.motivo_cancelamento)}</div>` : ''}
      <div class="largo"><div class="muted">Anexos</div>${await htmlAnexos('requisicao', id)}</div>
    </div></div>
    <div class="cartao"><h2>Itens</h2>${tabelaItens(itens.map(i => ({ ...i, valor: i.valor_estimado })), 'Valor unit. estimado')}</div>
    ${cots.length ? `<div class="cartao"><h2>Cotação</h2><ul class="lista-simples">${cots.map(c => `<li>${veCompras() ? `<a href="#/compras/cotacoes/ver/${c.id}">${esc(c.numero)}</a>` : esc(c.numero)} ${tag(c.status)}${c.comentario_aprovacao ? `<br><span class="muted">${esc(c.comentario_aprovacao)}</span>` : ''}</li>`).join('')}</ul></div>` : ''}
    ${peds.length ? `<div class="cartao"><h2>Pedido de compra</h2><ul class="lista-simples">${peds.map(p => `<li><a href="#/compras/pedidos/ver/${p.id}">${esc(p.numero)}</a> ${tag(p.status)}<b>${brl(p.valor_total)}</b></li>`).join('')}</ul></div>` : ''}`;
  $('#cotar')?.addEventListener('click', async e => ocupado(e.target, async () => {
    try { const c = await api.rpc('abrir_cotacao', { p_requisicao: id }); location.hash = '#/compras/cotacoes/ver/' + c; } catch (err) { falha(err); }
  }));
  $('#enviar')?.addEventListener('click', async e => ocupado(e.target, async () => {
    try { await api.alterar('requisicoes', `id=eq.${id}`, { status: 'aguardando_cotacao' }); aviso('Enviada para Compras.'); navegar(); } catch (err) { falha(err); }
  }));
  $('#cancelar')?.addEventListener('click', async () => {
    const motivo = await confirmar('Cancelar esta requisição?', { comMotivo: true, botao: 'Cancelar requisição' });
    if (!motivo) return;
    try {
      if (cot && cot.status === 'aberta') await api.alterar('cotacoes', `id=eq.${cot.id}`, { status: 'cancelada', cancelado_em: new Date().toISOString(), cancelado_por: estado.usuario.id, motivo_cancelamento: motivo });
      await api.alterar('requisicoes', `id=eq.${id}`, { status: 'cancelada', cancelado_em: new Date().toISOString(), cancelado_por: estado.usuario.id, motivo_cancelamento: motivo });
      aviso('Requisição cancelada.'); navegar();
    } catch (err) { falha(err); }
  });
});

function tabelaItens(itens, rotuloValor = 'Valor unit.') {
  if (!itens.length) return '<div class="vazio">Sem itens.</div>';
  const total = itens.reduce((s, i) => s + Number(i.quantidade) * Number(i.valor || 0), 0);
  return `<div class="tabela-wrap"><table class="responsiva"><thead><tr><th>Descrição</th><th class="num">Qtd.</th><th>Unid.</th><th class="num">${rotuloValor}</th><th class="num">Subtotal</th></tr></thead><tbody>
    ${itens.map(i => `<tr><td data-r="Descrição">${esc(i.descricao)}</td><td data-r="Qtd." class="num">${Number(i.quantidade).toLocaleString('pt-BR')}</td><td data-r="Unid.">${esc(i.unidade)}</td>
      <td data-r="${rotuloValor}" class="num">${i.valor ? brl(i.valor) : '—'}</td><td data-r="Subtotal" class="num">${i.valor ? brl(Number(i.quantidade) * Number(i.valor)) : '—'}</td></tr>`).join('')}
  </tbody>${total ? `<tfoot><tr><td colspan="4">Total</td><td class="num"><b>${brl(total)}</b></td></tr></tfoot>` : ''}</table></div>`;
}

// ---------- Cotações ----------
rota('/compras/cotacoes', async tela => {
  const st = estado.params.get('status') || 'abertas';
  const filtro = { abertas: 'status=in.(aberta,aguardando_aprovacao)', aprovadas: 'status=eq.aprovada', todas: 'status=neq.cancelada' }[st] || 'status=neq.cancelada';
  const [aCotar, cots] = await Promise.all([
    ehComprador() ? listarReq('status=eq.aguardando_cotacao&order=urgencia.desc,criado_em') : [],
    api.listar('cotacoes', `select=*,req:requisicoes(numero,justificativa,valor_estimado,urgencia),propostas:cotacao_propostas(valor_total,vencedora)&${filtro}&order=criado_em.desc&limit=300`)]);
  tela.innerHTML = `
    <div class="topo"><div><h1>Cotações</h1><p class="sub">Mínimo obrigatório: até R$ 1.000 → 1 cotação · até R$ 5.000 → 2 · acima de R$ 5.000 → 3 (pode incluir mais)</p></div></div>
    ${aCotar.length ? `<div class="cartao"><h2>Requisições aguardando cotação (${aCotar.length})</h2>${tabelaReq(aCotar)}</div>` : ''}
    <form class="filtros" id="filtros"><select name="status">${[['abertas', 'Em andamento'], ['aprovadas', 'Aprovadas'], ['todas', 'Todas']].map(([v, t]) => `<option value="${v}" ${v === st ? 'selected' : ''}>${t}</option>`).join('')}</select><button class="btn">Filtrar</button></form>
    <div class="cartao">${cots.length ? `<div class="tabela-wrap"><table class="responsiva"><thead><tr><th>Nº</th><th>Requisição</th><th>Para que</th><th>Propostas</th><th class="num">Escolhida</th><th>Situação</th></tr></thead><tbody>
      ${cots.map(c => { const venc = c.propostas.find(p => p.vencedora); const menor = c.propostas.length ? Math.min(...c.propostas.map(p => Number(p.valor_total))) : 0;
        const exig = minimoCot(Number(venc?.valor_total || menor || c.req?.valor_estimado || 0));
        return `<tr class="clicavel" onclick="location.hash='#/compras/cotacoes/ver/${c.id}'"><td data-r="Nº" class="nowrap">${esc(c.numero)}</td><td data-r="Requisição">${esc(c.req?.numero || '')}</td>
        <td data-r="Para que">${esc(c.req?.justificativa || '')}</td><td data-r="Propostas">${c.propostas.length} de ${exig} ${c.status === 'aberta' && c.propostas.length < exig ? '<span class="tag amarelo">faltam</span>' : ''}</td>
        <td data-r="Escolhida" class="num">${venc ? brl(venc.valor_total) : '—'}</td><td data-r="Situação">${tag(c.status)}</td></tr>`; }).join('')}
    </tbody></table></div>` : '<div class="vazio">Nenhuma cotação.</div>'}</div>`;
  $('#filtros').onsubmit = e => { e.preventDefault(); location.hash = '#/compras/cotacoes?status=' + formDados(e.target).status; };
});

rota('/compras/cotacoes/ver/:id', async (tela, id) => {
  const c = await api.um('cotacoes', `id=eq.${id}&select=*`);
  if (!c) { tela.innerHTML = '<div class="cartao vazio">Cotação não encontrada ou sem acesso.</div>'; return; }
  const [[r], itens, props, forns, aprs] = await Promise.all([
    listarReq(`id=eq.${c.requisicao_id}`),
    api.listar('requisicao_itens', `requisicao_id=eq.${c.requisicao_id}&order=id`),
    api.listar('cotacao_propostas', `cotacao_id=eq.${id}&order=valor_total`),
    fornecedores(true),
    api.listar('aprovacoes', `entidade=eq.cotacao&entidade_id=eq.${id}&order=solicitado_em`).catch(() => [])]);
  const fs = porId(forns);
  const menor = props.length ? Math.min(...props.map(p => Number(p.valor_total))) : 0;
  const venc = props.find(p => p.vencedora);
  const exig = minimoCot(Number(venc?.valor_total || menor || r?.valor_estimado || 0));
  const aberta = c.status === 'aberta' && ehComprador();
  const anx = {}; await Promise.all(props.map(async p => (anx[p.id] = await htmlAnexos('proposta', p.id))));
  const conta = c.conta_id ? (await contas()).find(x => x.id === c.conta_id) : null;
  const apPend = aprs.find(a => a.decisao === 'pendente');
  const souAprovador = apPend && (apPend.aprovador_id === estado.usuario.id || (apPend.perfil_aprovador && tem(apPend.perfil_aprovador))) && c.comprador_id !== estado.usuario.id;
  tela.innerHTML = `
    <div class="topo"><div><h1>Cotação ${esc(c.numero)}</h1><p class="sub">${tag(c.status)} · Requisição <a href="#/compras/requisicoes/ver/${c.requisicao_id}">${esc(r?.numero || '')}</a> · ${esc(r?.justificativa || '')}</p></div>
      <div class="acoes">${aberta ? '<button class="btn" id="nova-prop">+ Proposta</button><button class="btn prim" id="enviar">Enviar para aprovação</button>' : ''}
        ${souAprovador ? '<a class="btn prim" href="#/aprovacoes">Decidir em Aprovações</a>' : ''}<button class="btn" onclick="history.back()">Voltar</button></div></div>
    ${c.status === 'aberta' && c.comentario_aprovacao ? `<div class="cartao alerta-obs"><b>Devolvida pelo aprovador:</b> ${esc(c.comentario_aprovacao)}</div>` : ''}
    <div class="grade" style="margin-bottom:16px">
      <div class="cartao kpi ${c.status === 'aberta' && props.length < exig ? 'alerta' : ''}"><div class="n">${props.length} / ${exig}</div><div class="r">propostas (mínimo obrigatório)</div></div>
      <div class="cartao kpi"><div class="n" style="font-size:22px">${brl(r?.valor_estimado)}</div><div class="r">estimado na requisição</div></div>
      <div class="cartao kpi"><div class="n" style="font-size:22px">${props.length ? brl(menor) : '—'}</div><div class="r">menor proposta</div></div>
      ${venc ? `<div class="cartao kpi"><div class="n" style="font-size:22px">${brl(venc.valor_total)}</div><div class="r">escolhida · ${esc(nomeForn(fs[venc.fornecedor_id]))}</div></div>` : ''}
    </div>
    <div class="cartao"><h2>Propostas</h2>
      ${props.length ? `<div class="tabela-wrap"><table class="responsiva"><thead><tr><th>Fornecedor</th><th class="num">Valor total</th><th>Entrega</th><th>Pagamento</th><th>Validade</th><th>Orçamento</th><th></th></tr></thead><tbody>
        ${props.map(p => `<tr><td data-r="Fornecedor"><b>${esc(nomeForn(fs[p.fornecedor_id]))}</b>${p.vencedora ? ' <span class="tag verde">Escolhida</span>' : ''}${Number(p.valor_total) === menor ? ' <span class="tag azul">Menor preço</span>' : ''}
            ${p.itens_descricao ? `<div class="muted">${esc(p.itens_descricao)}</div>` : ''}${p.observacao ? `<div class="muted">${esc(p.observacao)}</div>` : ''}</td>
          <td data-r="Valor total" class="num"><b>${brl(p.valor_total)}</b></td><td data-r="Entrega">${p.prazo_entrega_dias != null ? p.prazo_entrega_dias + ' dia(s)' : '—'}</td>
          <td data-r="Pagamento">${esc(p.condicao_pagamento || '—')}</td><td data-r="Validade">${p.validade ? dataBR(p.validade) : '—'}</td><td data-r="Orçamento">${anx[p.id]}</td>
          <td>${aberta ? `<button class="btn peq" data-edit="${p.id}">Editar</button> <button class="btn peq perigo" data-del="${p.id}">Excluir</button>` : ''}</td></tr>`).join('')}
      </tbody></table></div>` : '<div class="vazio">Nenhuma proposta ainda. Clique em “+ Proposta” para incluir cada orçamento recebido.</div>'}
      ${c.justificativa_escolha ? `<p class="alerta-obs" style="margin-top:10px"><b>Por que não a mais barata:</b> ${esc(c.justificativa_escolha)}</p>` : ''}
      ${conta ? `<p class="muted">Conta do plano: ${esc(conta.codigo + ' ' + conta.nome)}</p>` : ''}</div>
    <div class="cartao"><h2>Itens pedidos</h2>${tabelaItens(itens.map(i => ({ ...i, valor: i.valor_estimado })), 'Valor unit. estimado')}</div>
    ${aprs.length ? `<div class="cartao"><h2>Aprovação</h2><ul class="lista-simples">${aprs.map(a => `<li><span>${tag(a.decisao)} ${a.comentario ? esc(a.comentario) : ''}</span><span class="muted">${dataHoraBR(a.decidido_em || a.solicitado_em)}</span></li>`).join('')}</ul></div>` : ''}`;

  const formProposta = async (p = {}) => {
    const fsAtivos = forns.filter(f => f.ativo);
    return modal(`<form><h2>${p.id ? 'Editar proposta' : 'Nova proposta'}</h2><div class="form">
      <label class="campo largo">Fornecedor<select name="forn" required><option value="">Selecione…</option><option value="novo">+ Cadastrar novo fornecedor</option>
        ${fsAtivos.map(f => `<option value="${f.id}" ${f.id === p.fornecedor_id ? 'selected' : ''}>${esc(nomeForn(f))}</option>`).join('')}</select></label>
      <div class="largo form" id="novo-forn" hidden style="padding:0">
        <label class="campo">Razão social / nome<input name="nf_nome"></label><label class="campo">CNPJ ou CPF<input name="nf_doc"></label>
        <label class="campo">Telefone<input name="nf_tel"></label><label class="campo">E-mail<input name="nf_email" type="email"></label></div>
      <label class="campo">Valor total (R$)<input name="valor" inputmode="decimal" required value="${p.valor_total ? Number(p.valor_total).toFixed(2).replace('.', ',') : ''}"></label>
      <label class="campo">Prazo de entrega (dias)<input name="prazo" inputmode="numeric" value="${p.prazo_entrega_dias ?? ''}"></label>
      <label class="campo">Condição de pagamento<input name="cond" value="${esc(p.condicao_pagamento || '')}" placeholder="Ex.: 30 dias boleto · à vista Pix"></label>
      <label class="campo">Validade da proposta<input type="date" name="validade" value="${p.validade || ''}"></label>
      <label class="campo largo">O que está incluso (marca, modelo, frete)<input name="itens" value="${esc(p.itens_descricao || '')}"></label>
      <label class="campo largo">Observação<input name="obs" value="${esc(p.observacao || '')}"></label>
      <label class="campo largo">Orçamento (PDF ou foto)${p.id ? '' : ' — obrigatório'}<input type="file" name="arquivos" accept="image/*,application/pdf" multiple></label>
      ${p.id ? '' : '<label class="check largo"><input type="checkbox" name="verbal"> Orçamento por telefone/WhatsApp sem documento (explique na observação)</label>'}</div>
      <div class="rodape"><button type="button" class="btn" data-fechar>Voltar</button><button class="btn prim">Salvar</button></div></form>`, {
      aoAbrir: raiz => { const f = $('form', raiz); f.forn.onchange = () => { $('#novo-forn', raiz).hidden = f.forn.value !== 'novo'; }; },
      validar: d => !d.forn ? 'Escolha o fornecedor.' : d.forn === 'novo' && !d.nf_nome ? 'Informe o nome do novo fornecedor.'
        : !(num(d.valor) > 0) ? 'Informe o valor total da proposta.'
        : !p.id && !d.arquivos.length && !(d.verbal && d.obs) ? 'Anexe o orçamento. Se foi verbal, marque a opção e explique na observação.' : null });
  };
  const salvarProposta = async (d, p = {}) => {
    let forn = d.forn;
    if (forn === 'novo') {
      const [nf] = await api.inserir('fornecedores', { razao_social: d.nf_nome, documento: d.nf_doc || null, telefone: d.nf_tel || null, email: d.nf_email || null });
      forn = nf.id; await fornecedores(true);
    }
    const dados = { fornecedor_id: forn, valor_total: num(d.valor), prazo_entrega_dias: d.prazo ? parseInt(d.prazo, 10) : null, condicao_pagamento: d.cond || null,
                    validade: d.validade || null, itens_descricao: d.itens || null, observacao: d.obs || null };
    let pid = p.id;
    if (pid) await api.alterar('cotacao_propostas', `id=eq.${pid}`, dados);
    else [{ id: pid }] = await api.inserir('cotacao_propostas', { ...dados, cotacao_id: id });
    await anexar('proposta', pid, d.arquivos);
  };
  $('#nova-prop')?.addEventListener('click', async () => {
    const d = await formProposta(); if (!d) return;
    try { await salvarProposta(d); aviso('Proposta incluída.'); navegar(); } catch (err) { falha(err); }
  });
  $$('[data-edit]', tela).forEach(b => b.addEventListener('click', async () => {
    const p = props.find(x => x.id === b.dataset.edit); const d = await formProposta(p); if (!d) return;
    try { await salvarProposta(d, p); aviso('Proposta alterada.'); navegar(); } catch (err) { falha(err); }
  }));
  $$('[data-del]', tela).forEach(b => b.addEventListener('click', async () => {
    if (!await confirmar('Excluir esta proposta?', { botao: 'Excluir' })) return;
    try { await api.excluir('cotacao_propostas', `id=eq.${b.dataset.del}`); aviso('Proposta excluída.'); navegar(); } catch (err) { falha(err); }
  }));
  $('#enviar')?.addEventListener('click', async () => {
    if (!props.length) return aviso('Inclua as propostas antes de enviar.', true);
    const maisBarata = props.find(p => Number(p.valor_total) === menor);
    const r2 = await modal(`<form><h2>Enviar compra para aprovação</h2>
      <p class="muted">A aprovação é da compra: o aprovador vê todas as propostas e a escolhida. Aprovada, o pedido de compra é emitido.</p>
      <div class="form"><div class="largo"><b>Proposta escolhida</b>${props.map(p => `<label class="check" style="display:flex;margin:6px 0"><input type="radio" name="venc" value="${p.id}" ${(venc || maisBarata).id === p.id ? 'checked' : ''}>
          <span>${esc(nomeForn(fs[p.fornecedor_id]))} · <b>${brl(p.valor_total)}</b>${Number(p.valor_total) === menor ? ' <span class="tag azul">Menor preço</span>' : ''}</span></label>`).join('')}</div>
        <div class="largo conferencia" id="regra"></div>
        <label class="campo largo">Conta do plano de contas<select name="conta" required>${await opcoesContas(c.conta_id, ['custo', 'despesa', 'investimento'])}</select></label>
        <label class="campo largo" id="just-campo">Por que não a mais barata?<textarea name="just" rows="3">${esc(c.justificativa_escolha || '')}</textarea></label></div>
      <div class="rodape"><button type="button" class="btn" data-fechar>Voltar</button><button class="btn prim">Enviar para aprovação</button></div></form>`, {
      aoAbrir: raiz => {
        const f = $('form', raiz);
        const sinc = () => { const p = props.find(x => x.id === f.venc.value); const ex = minimoCot(Number(p.valor_total));
          $('#regra', raiz).innerHTML = `Compra de <b>${brl(p.valor_total)}</b>: mínimo de <b>${ex}</b> cotação(ões) · esta tem <b>${props.length}</b> ${props.length < ex ? '<span class="tag vermelho">faltam ' + (ex - props.length) + '</span>' : '<span class="tag verde">ok</span>'}`;
          $('#just-campo', raiz).hidden = Number(p.valor_total) <= menor; };
        $$('[name=venc]', raiz).forEach(x => (x.onchange = sinc)); sinc();
      },
      validar: d => { const p = props.find(x => x.id === d.venc); if (!p) return 'Escolha a proposta.';
        if (props.length < minimoCot(Number(p.valor_total))) return `Para compras de ${brl(p.valor_total)} são obrigatórias ${minimoCot(Number(p.valor_total))} cotações.`;
        if (!d.conta) return 'Escolha a conta do plano de contas.';
        if (Number(p.valor_total) > menor && !d.just) return 'Explique por que não escolheu a mais barata.'; return null; } });
    if (!r2) return;
    try { await api.rpc('enviar_cotacao', { p_cotacao: id, p_vencedora: r2.venc, p_conta: r2.conta, p_justificativa: r2.just || null });
          aviso('Compra enviada para aprovação.'); navegar(); } catch (err) { falha(err); }
  });
});

// ---------- Cartões de compra na tela Aprovações ----------
async function cartoesCotacao(pend) {
  const meus = pend.filter(a => a.entidade === 'cotacao' && (a.aprovador_id === estado.usuario.id || (a.perfil_aprovador && tem(a.perfil_aprovador))));
  if (!meus.length) return { html: '', n: 0 };
  const ids = meus.map(a => a.entidade_id);
  const [cots, props, forns] = await Promise.all([
    api.listar('cotacoes', `select=*,req:requisicoes(id,numero,justificativa,urgencia,data_necessidade,solicitante_id)&id=${lista(ids)}`),
    api.listar('cotacao_propostas', `cotacao_id=${lista(ids)}&order=valor_total`), fornecedores()]);
  const cs = porId(cots), fs = porId(forns);
  const validos = meus.filter(a => cs[a.entidade_id]?.status === 'aguardando_aprovacao' && cs[a.entidade_id].comprador_id !== estado.usuario.id);
  const html = validos.map(a => { const c = cs[a.entidade_id]; const ps = props.filter(p => p.cotacao_id === c.id); const v = ps.find(p => p.vencedora) || {};
    const menor = Math.min(...ps.map(p => Number(p.valor_total)));
    return `<div class="cartao" data-ap="${a.id}">
      <div class="topo" style="margin-bottom:8px"><span><b>Compra ${esc(c.numero)}</b> · ${esc(nomeForn(fs[v.fornecedor_id]))}</span><b style="font-size:18px">${brl(v.valor_total)}</b></div>
      <p style="margin:4px 0 8px">${esc(c.req?.justificativa || '')} ${c.req?.urgencia === 'alta' ? '<span class="tag vermelho">Urgente</span>' : ''}</p>
      <ul class="lista-simples">${ps.map(p => `<li><span>${p.vencedora ? '✅ ' : ''}${esc(nomeForn(fs[p.fornecedor_id]))}${p.prazo_entrega_dias != null ? ` · ${p.prazo_entrega_dias} dia(s)` : ''}${p.condicao_pagamento ? ' · ' + esc(p.condicao_pagamento) : ''}</span>
        <b>${brl(p.valor_total)}${Number(p.valor_total) === menor ? ' <span class="tag azul">menor</span>' : ''}</b></li>`).join('')}</ul>
      ${c.justificativa_escolha ? `<p class="alerta-obs"><b>Por que não a mais barata:</b> ${esc(c.justificativa_escolha)}</p>` : ''}
      <div class="acoes" style="margin-top:12px"><button class="btn ok peq" data-d="aprovado">Aprovar compra</button>
        <button class="btn peq" data-d="devolvido">Devolver p/ Compras</button><button class="btn perigo peq" data-d="reprovado">Reprovar</button>
        <a class="btn peq" href="#/compras/cotacoes/ver/${c.id}">Ver orçamentos</a></div></div>`; }).join('');
  return { html, n: validos.length };
}

// ---------- Pedidos ----------
rota('/compras/pedidos', async tela => {
  const st = estado.params.get('status') || 'receber';
  const filtro = { receber: 'status=in.(emitido,parcialmente_recebido)', recebidos: 'status=eq.recebido', todos: 'status=neq.cancelado' }[st] || 'status=neq.cancelado';
  const [ps, forns] = await Promise.all([api.listar('pedidos', `select=*,req:requisicoes(numero,justificativa)&${filtro}&order=criado_em.desc&limit=500`), fornecedores()]);
  const fs = porId(forns);
  tela.innerHTML = `
    <div class="topo"><div><h1>Pedidos de compra</h1><p class="sub">${ps.length} pedido(s) · ${brl(ps.reduce((s, p) => s + Number(p.valor_total), 0))}</p></div></div>
    <form class="filtros" id="filtros"><select name="status">${[['receber', 'A receber'], ['recebidos', 'Recebidos'], ['todos', 'Todos']].map(([v, t]) => `<option value="${v}" ${v === st ? 'selected' : ''}>${t}</option>`).join('')}</select><button class="btn">Filtrar</button></form>
    <div class="cartao">${ps.length ? `<div class="tabela-wrap"><table class="responsiva"><thead><tr><th>Nº</th><th>Emissão</th><th>Fornecedor</th><th>Para que</th><th>Previsão</th><th class="num">Valor</th><th>Situação</th></tr></thead><tbody>
      ${ps.map(p => `<tr class="clicavel" onclick="location.hash='#/compras/pedidos/ver/${p.id}'"><td data-r="Nº" class="nowrap">${esc(p.numero)}</td><td data-r="Emissão">${dataBR(p.criado_em)}</td>
        <td data-r="Fornecedor">${esc(nomeForn(fs[p.fornecedor_id]))}</td><td data-r="Para que">${esc(p.req?.justificativa || '')}</td>
        <td data-r="Previsão">${p.previsao_entrega ? dataBR(p.previsao_entrega) : '—'}${p.status === 'emitido' && p.previsao_entrega && p.previsao_entrega < hojeISO() ? ' <span class="tag vermelho">atrasado</span>' : ''}</td>
        <td data-r="Valor" class="num">${brl(p.valor_total)}</td><td data-r="Situação">${tag(p.status)}</td></tr>`).join('')}
    </tbody></table></div>` : '<div class="vazio">Nenhum pedido.</div>'}</div>`;
  $('#filtros').onsubmit = e => { e.preventDefault(); location.hash = '#/compras/pedidos?status=' + formDados(e.target).status; };
});

rota('/compras/pedidos/ver/:id', async (tela, id) => {
  const p = await api.um('pedidos', `id=eq.${id}&select=*`);
  if (!p) { tela.innerHTML = '<div class="cartao vazio">Pedido não encontrado ou sem acesso.</div>'; return; }
  const [itens, recs, forn, [r], cot] = await Promise.all([
    api.listar('pedido_itens', `pedido_id=eq.${id}&order=id`),
    api.listar('recebimentos', `pedido_id=eq.${id}&cancelado_em=is.null&order=data_recebimento`),
    api.um('fornecedores', `id=eq.${p.fornecedor_id}&select=*`),
    p.requisicao_id ? listarReq(`id=eq.${p.requisicao_id}`) : [null],
    p.cotacao_id ? api.um('cotacoes', `id=eq.${p.cotacao_id}&select=numero`).catch(() => null) : null]);
  const conta = p.conta_id ? (await contas()).find(x => x.id === p.conta_id) : null;
  const dono = r?.solicitante_id === estado.usuario.id;
  const podeReceber = ['emitido', 'parcialmente_recebido'].includes(p.status) && (tem('administrador', 'comprador', 'financeiro') || dono);
  const anx = {}; await Promise.all(recs.map(async x => (anx[x.id] = await htmlAnexos('recebimento', x.id))));
  tela.innerHTML = `
    <div class="topo"><div><h1>Pedido ${esc(p.numero)}</h1><p class="sub">${tag(p.status)} · ${esc(nomeForn(forn))} · <b>${brl(p.valor_total)}</b></p></div>
      <div class="acoes">${podeReceber ? '<button class="btn ok" id="receber">Registrar recebimento (NF)</button>' : ''}
        <button class="btn" id="imprimir">Imprimir pedido</button>
        ${ehComprador() && p.status === 'emitido' ? '<button class="btn perigo" id="cancelar">Cancelar pedido</button>' : ''}
        <button class="btn" onclick="history.back()">Voltar</button></div></div>
    <div class="cartao"><div class="form">
      <div><div class="muted">Fornecedor</div><b>${esc(nomeForn(forn))}</b><div class="muted">${esc([forn?.documento, forn?.telefone, forn?.email].filter(Boolean).join(' · '))}</div></div>
      <div><div class="muted">Pagamento</div><b>${esc(p.condicao_pagamento || '—')}</b></div>
      <div><div class="muted">Previsão de entrega</div><b>${p.previsao_entrega ? dataBR(p.previsao_entrega) : '—'}</b></div>
      <div><div class="muted">Origem</div>${r ? `Requisição <a href="#/compras/requisicoes/ver/${r.id}">${esc(r.numero)}</a> · ${esc(r.solic?.nome || '')}` : '—'}${cot && veCompras() ? `<br>Cotação <a href="#/compras/cotacoes/ver/${p.cotacao_id}">${esc(cot.numero)}</a>` : ''}</div>
      ${conta ? `<div><div class="muted">Conta do plano</div><b>${esc(conta.codigo + ' ' + conta.nome)}</b></div>` : ''}
      <div class="largo"><div class="muted">Para que</div>${esc(r?.justificativa || '—')}</div>
      ${p.motivo_cancelamento ? `<div class="largo alerta-obs"><b>Cancelado:</b> ${esc(p.motivo_cancelamento)}</div>` : ''}
    </div></div>
    <div class="cartao"><h2>Itens</h2>${tabelaItens(itens.map(i => ({ ...i, valor: i.valor_unitario })))}</div>
    ${recs.length ? `<div class="cartao"><h2>Recebimento</h2><ul class="lista-simples">${recs.map(x => `<li style="flex-wrap:wrap"><span>${dataBR(x.data_recebimento)} · NF ${esc(x.numero_nf || '')} ${tag(x.status)}
        ${x.titulo_id && veTudo() ? ` · <a href="#/financeiro/pagar/ver/${x.titulo_id}">conta a pagar</a>` : ''}</span><b>${brl(x.valor_nf)}</b>
        ${x.divergencia ? `<div style="flex-basis:100%" class="alerta-obs">Divergência: ${esc(x.divergencia)}</div>` : ''}
        <div style="flex-basis:100%"><span class="muted">Nota fiscal:</span> ${anx[x.id]}</div></li>`).join('')}</ul></div>` : ''}`;

  $('#imprimir').onclick = () => imprimirPedido(p, forn, itens, r);
  $('#cancelar')?.addEventListener('click', async () => {
    const motivo = await confirmar('Cancelar este pedido?', { comMotivo: true, botao: 'Cancelar pedido' });
    if (!motivo) return;
    const quando = new Date().toISOString();
    try { await api.alterar('pedidos', `id=eq.${id}`, { status: 'cancelado', cancelado_em: quando, cancelado_por: estado.usuario.id, motivo_cancelamento: motivo });
          if (r) await api.alterar('requisicoes', `id=eq.${r.id}`, { status: 'cancelada', cancelado_em: quando, cancelado_por: estado.usuario.id, motivo_cancelamento: 'Pedido cancelado: ' + motivo });
          aviso('Pedido cancelado.'); navegar(); } catch (err) { falha(err); }
  });

  $('#receber')?.addEventListener('click', async () => {
    const parcelasDe = (total, n, primeiro, intervalo) => {
      const base = Math.floor(total / n * 100) / 100; const ps = [];
      for (let k = 0; k < n; k++) ps.push({ vencimento: somaDias(primeiro, k * intervalo), valor: k === n - 1 ? Math.round((total - base * (n - 1)) * 100) / 100 : base });
      return ps;
    };
    const venc1 = somaDias(hojeISO(), /(\d+)\s*d/i.test(p.condicao_pagamento || '') ? Number(p.condicao_pagamento.match(/(\d+)\s*d/i)[1]) : 30);
    const res = await modal(`<form><h2>Recebimento do pedido ${esc(p.numero)}</h2>
      <p class="muted">Confira a mercadoria e a nota. Ao confirmar, a conta a pagar é criada para o Financeiro.</p><div class="form">
      <label class="campo">Data do recebimento<input type="date" name="data" value="${hojeISO()}" required></label>
      <label class="campo">Nº da nota fiscal<input name="nf" required></label>
      <label class="campo">Valor da nota (R$)<input name="valor" inputmode="decimal" value="${Number(p.valor_total).toFixed(2).replace('.', ',')}" required></label>
      <div class="largo conferencia" id="conf"></div>
      <label class="campo largo" id="div-campo" hidden>O que mudou em relação ao pedido? (obrigatório)<textarea name="div" rows="2"></textarea></label>
      <label class="campo">Parcelas<input name="n" inputmode="numeric" value="1"></label>
      <label class="campo">1º vencimento<input type="date" name="venc" value="${venc1}"></label>
      <label class="campo">Intervalo (dias)<input name="int" inputmode="numeric" value="30"></label>
      <div class="largo" id="parcelas"></div>
      <label class="campo largo">Observação<input name="obs"></label>
      <label class="campo largo">Nota fiscal (PDF ou foto) — obrigatório<input type="file" name="arquivos" accept="image/*,application/pdf" multiple></label></div>
      <div class="rodape"><button type="button" class="btn" data-fechar>Voltar</button><button class="btn ok">Confirmar recebimento</button></div></form>`, {
      aoAbrir: raiz => {
        const f = $('form', raiz);
        const sinc = () => {
          const v = num(f.valor.value) || 0, dif = Math.round((v - Number(p.valor_total)) * 100) / 100;
          $('#conf', raiz).innerHTML = `Pedido: <b>${brl(p.valor_total)}</b> · Nota: <b>${brl(v)}</b> ${Math.abs(dif) > 0.009 ? `<span class="tag vermelho">diferença ${brl(dif)}</span>` : '<span class="tag verde">confere</span>'}`;
          $('#div-campo', raiz).hidden = Math.abs(dif) <= 0.009;
          const n = Math.max(1, parseInt(f.n.value, 10) || 1);
          const ps = v > 0 && f.venc.value ? parcelasDe(v, n, f.venc.value, parseInt(f.int.value, 10) || 30) : [];
          $('#parcelas', raiz).innerHTML = ps.length ? '<div class="muted">Parcelas (pode ajustar):</div>' + ps.map((x, k) => `<div class="lado" style="gap:8px;margin:4px 0">
            <span class="nowrap">${k + 1}ª</span><input type="date" class="pv" value="${x.vencimento}" aria-label="Vencimento ${k + 1}"><input class="pval" inputmode="decimal" value="${x.valor.toFixed(2).replace('.', ',')}" aria-label="Valor ${k + 1}" style="width:120px"></div>`).join('') : '';
        };
        ['valor', 'n', 'venc', 'int'].forEach(k => f[k].addEventListener('input', sinc)); sinc();
      },
      validar: d => {
        const v = num(d.valor);
        if (!d.nf) return 'Informe o número da nota fiscal.';
        if (!(v > 0)) return 'Informe o valor da nota.';
        if (Math.abs(v - Number(p.valor_total)) > 0.009 && !d.div) return 'O valor da nota é diferente do pedido: explique a divergência.';
        if (!d.arquivos.length) return 'Anexe a nota fiscal.';
        const ps = $$('#parcelas .pv').map((el, k) => ({ vencimento: el.value, valor: num($$('#parcelas .pval')[k].value) || 0 }));
        if (ps.some(x => !x.vencimento || !(x.valor > 0))) return 'Confira as datas e os valores das parcelas.';
        if (Math.abs(ps.reduce((s, x) => s + x.valor, 0) - v) > 0.009) return `A soma das parcelas precisa dar ${brl(v)}.`;
        receber._parcelas = ps; return null;
      } });
    if (!res) return;
    try {
      const out = await api.rpc('registrar_recebimento', { p_pedido: id, p_data: res.data, p_nf: res.nf, p_valor_nf: num(res.valor),
        p_parcelas: receber._parcelas, p_divergencia: res.div || null, p_obs: res.obs || null });
      await anexarEm([['recebimento', out.recebimento], ['titulo', out.titulo]], res.arquivos);
      aviso('Recebimento registrado. A conta a pagar foi criada.'); navegar();
    } catch (err) { falha(err); }
  });
});
const receber = {};

// Um arquivo, vários vínculos (ex.: a NF fica no recebimento e na conta a pagar)
async function anexarEm(destinos, arquivos) {
  for (const original of arquivos || []) {
    const f = await prepararArquivo(original);
    const [ent0, id0] = destinos[0];
    const caminho = `${ent0}/${id0}/${Date.now()}-${nomeArquivo(f.name)}`;
    await api.enviarArquivo(caminho, f);
    await api.inserir('anexos', destinos.map(([entidade, entidade_id]) => ({ entidade, entidade_id, caminho_arquivo: caminho, nome_original: original.name,
      tipo_mime: f.type, tamanho_bytes: f.size, enviado_por: estado.usuario.id })));
  }
}

// Pedido para enviar ao fornecedor (imprimir ou salvar em PDF)
function imprimirPedido(p, forn, itens, r) {
  const w = window.open('', '_blank');
  if (!w) return aviso('Libere as janelas pop-up para imprimir.', true);
  const total = itens.reduce((s, i) => s + Number(i.quantidade) * Number(i.valor_unitario), 0);
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Pedido ${esc(p.numero)}</title>
    <style>body{font-family:Arial,sans-serif;color:#222;margin:32px;font-size:13px}h1{font-size:20px;margin:0}table{width:100%;border-collapse:collapse;margin-top:16px}
    th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}td.n,th.n{text-align:right}.cab{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #1b3a5c;padding-bottom:10px}
    .bl{margin-top:14px}.muted{color:#666}img{height:48px}</style></head><body>
    <div class="cab"><img src="${location.origin + location.pathname.replace(/[^/]*$/, '')}logo.png" alt="Verbo Logística"><div style="text-align:right"><h1>Pedido de compra ${esc(p.numero)}</h1><div class="muted">Emitido em ${dataBR(p.criado_em)}</div></div></div>
    <div class="bl"><b>Fornecedor:</b> ${esc(nomeForn(forn))}${forn?.documento ? ' · ' + esc(forn.documento) : ''}${forn?.telefone ? ' · ' + esc(forn.telefone) : ''}</div>
    <div class="bl"><b>Condição de pagamento:</b> ${esc(p.condicao_pagamento || '—')} · <b>Previsão de entrega:</b> ${p.previsao_entrega ? dataBR(p.previsao_entrega) : '—'}</div>
    ${r?.justificativa ? `<div class="bl"><b>Referência:</b> ${esc(r.justificativa)}</div>` : ''}
    <table><thead><tr><th>Descrição</th><th class="n">Qtd.</th><th>Unid.</th><th class="n">Valor unit.</th><th class="n">Total</th></tr></thead><tbody>
    ${itens.map(i => `<tr><td>${esc(i.descricao)}</td><td class="n">${Number(i.quantidade).toLocaleString('pt-BR')}</td><td>${esc(i.unidade)}</td><td class="n">${brl(i.valor_unitario)}</td><td class="n">${brl(Number(i.quantidade) * Number(i.valor_unitario))}</td></tr>`).join('')}
    </tbody><tfoot><tr><td colspan="4"><b>Total do pedido</b></td><td class="n"><b>${brl(p.valor_total)}</b></td></tr></tfoot></table>
    ${Math.abs(total - Number(p.valor_total)) > 0.05 ? '<p class="muted">Valores unitários aproximados a partir do total da proposta aprovada.</p>' : ''}
    <p class="bl muted">Favor informar o número deste pedido na nota fiscal.</p>
    <script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`);
  w.document.close();
}
