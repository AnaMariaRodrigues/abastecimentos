// Verbo Gestão — Reembolsos e Aprovações
'use strict';

const SELECT_REEMB = 'select=*,conta:plano_contas(codigo,nome),cc:centros_custo(nome),colab:usuarios(nome)';
const nomeColab = r => r.colab?.nome || r.colaborador_nome || '—';
const TIPOS_COMPROVANTE = ['Cupom fiscal (NFC-e / SAT)', 'Nota fiscal (NF-e)', 'Nota fiscal de serviço (NFS-e)', 'Recibo', 'Comprovante de cartão', 'Outro'];
const FORMAS_PAGTO = ['Dinheiro', 'Pix', 'Cartão de débito', 'Cartão de crédito', 'Outro'];
const CUSTEIO = { reembolso: 'Reembolso', adiantamento: 'Adiantamento', fundo_fixo: 'Fundo Fixo' };
const tagCusteio = r => r.forma_custeio && r.forma_custeio !== 'reembolso' ? ` <span class="tag azul">${CUSTEIO[r.forma_custeio]}</span>` : '';
const pessoasSemLogin = f => cad('pessoas_sem_login', 'select=id,nome,usuario_id&order=nome', f);
const descrTxt = r => r.descricao || r.fornecedor_nome || '';
const categoriaTxt = r => r.conta ? `${r.conta.nome}${r.categoria_outros ? ' — ' + r.categoria_outros : ''}` : (r.categoria || '—');

function tabelaReembolsos(linhas, { comColab = false, selecionar = false } = {}) {
  if (!linhas.length) return '<div class="vazio">Nenhum reembolso encontrado.</div>';
  const total = linhas.reduce((s, r) => s + Number(r.valor), 0);
  return `<div class="tabela-wrap"><table class="responsiva"><thead><tr>
    ${selecionar ? '<th><input type="checkbox" id="sel-todos" aria-label="Selecionar todos"></th>' : ''}
    <th>Nº</th><th>Data</th>${comColab ? '<th>Colaborador</th>' : ''}<th>Categoria</th><th>Descrição</th><th class="num">Valor</th><th>Situação</th></tr></thead><tbody>
    ${linhas.map(r => `<tr class="clicavel" data-id="${r.id}">
      ${selecionar ? `<td data-r="Selecionar">${r.status === 'aprovado' && (r.forma_custeio || 'reembolso') === 'reembolso' ? `<input type="checkbox" class="sel" value="${r.id}" data-colab="${esc(r.colaborador_id || r.colaborador_nome)}">` : ''}</td>` : ''}
      <td data-r="Nº" class="nowrap">${esc(r.numero)}</td><td data-r="Data">${dataBR(r.data_despesa)}</td>
      ${comColab ? `<td data-r="Colaborador">${esc(nomeColab(r))}</td>` : ''}
      <td data-r="Categoria">${esc(categoriaTxt(r))}</td><td data-r="Descrição">${r.observacoes?.includes('VERIFICAR') ? '<span title="Verificar: veja as observações">⚠️</span> ' : ''}${esc(descrTxt(r))}</td>
      <td data-r="Valor" class="num">${brl(r.valor)}</td><td data-r="Situação">${tag(r.status)}${tagCusteio(r)}</td></tr>`).join('')}
    </tbody><tfoot><tr>${selecionar ? '<td></td>' : ''}<td colspan="${comColab ? 5 : 4}">${linhas.length} lançamento(s)</td><td class="num">${brl(total)}</td><td></td></tr></tfoot></table></div>`;
}

function ligarLinhas(tela) {
  $$('tr[data-id]', tela).forEach(tr => tr.addEventListener('click', e => {
    if (e.target.closest('input')) return;
    location.hash = '#/reembolsos/ver/' + tr.dataset.id;
  }));
}

// ---------- Meus reembolsos ----------
rota('/reembolsos', async tela => {
  const linhas = await api.listar('reembolsos', `${SELECT_REEMB}&colaborador_id=eq.${estado.usuario.id}&status=neq.cancelado&order=data_despesa.desc,numero.desc&limit=300`);
  const aberto = linhas.filter(r => !['pago', 'reprovado'].includes(r.status)).reduce((s, r) => s + Number(r.valor), 0);
  tela.innerHTML = `
    <div class="topo"><div><h1>Meus reembolsos</h1><p class="sub">${brl(aberto)} a receber</p></div>
      <a class="btn prim" href="#/reembolsos/novo">+ Lançar reembolso</a></div>
    <div class="cartao">${tabelaReembolsos(linhas)}</div>`;
  ligarLinhas(tela);
});

// ---------- Novo / editar ----------
async function formReembolso(tela, r = null) {
  const [ccs, users, vs, pessoas] = await Promise.all([centros(), editaFin() ? usuarios() : [], veiculos(), editaFin() ? pessoasSemLogin() : []]);
  const adtParam = estado.params.get('adt');
  const adtFixo = adtParam ? await api.um('adiantamentos', `id=eq.${adtParam}`) : null;
  const custeioIni = r?.forma_custeio || (adtFixo ? 'adiantamento' : estado.params.get('custeio')) || 'reembolso';
  const quemIni = adtFixo ? (adtFixo.colaborador_id ? 'u:' + adtFixo.colaborador_id : 'p:' + adtFixo.pessoa_sem_login_id)
    : estado.params.get('custeio') === 'fundo_fixo' ? '' : 'u:' + estado.usuario.id;
  const adtsAbertos = await api.listar('adiantamentos', 'select=id,numero,valor,motivo,colaborador_id,pessoa_sem_login_id&status=in.(pago,prestando_contas)&order=numero').catch(() => []);
  const ccPadrao = r?.centro_custo_id || estado.usuario.centro_custo_id || ccs.find(c => c.codigo === 'GERAL')?.id;
  const contaOutros = (await contas()).filter(c => /^outr/i.test(c.nome)).map(c => c.id);
  tela.innerHTML = `
    <div class="topo"><div><h1>${r ? 'Corrigir lançamento ' + esc(r.numero) : custeioIni === 'reembolso' ? 'Lançar reembolso' : custeioIni === 'fundo_fixo' ? 'Lançar despesa do Fundo Fixo' : 'Lançar despesa da prestação de contas'}</h1>
      <p class="sub">Anexe a foto ou o PDF do comprovante.</p></div></div>
    <form class="cartao form" id="f-reemb">
      ${editaFin() && !r ? `<label class="campo">Colaborador<select name="quem" required ${adtFixo ? 'disabled' : ''}><option value="">Selecione…</option>
          <optgroup label="Com acesso ao sistema">${users.filter(u => u.ativo).map(u => `<option value="u:${u.id}" ${'u:' + u.id === quemIni ? 'selected' : ''}>${esc(u.nome)}</option>`).join('')}</optgroup>
          ${pessoas.length ? `<optgroup label="Sem acesso (cadastro interno)">${pessoas.map(p => `<option value="p:${p.id}" ${'p:' + p.id === quemIni ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}</optgroup>` : ''}</select></label>` : ''}
      <label class="campo">Como foi pago?<select name="forma_custeio" ${adtFixo ? 'disabled' : ''}>
          <option value="reembolso" ${custeioIni === 'reembolso' ? 'selected' : ''}>Do próprio bolso (quero ser reembolsado)</option>
          <option value="adiantamento" ${custeioIni === 'adiantamento' ? 'selected' : ''}>Com adiantamento recebido (prestação de contas)</option>
          ${editaFin() || custeioIni === 'fundo_fixo' ? `<option value="fundo_fixo" ${custeioIni === 'fundo_fixo' ? 'selected' : ''}>Com dinheiro do Fundo Fixo</option>` : ''}</select></label>
      <label class="campo" id="campo-adt" hidden>Adiantamento<select name="adiantamento_id" ${adtFixo ? 'disabled' : ''}></select></label>
      <label class="campo">Data da despesa<input type="date" name="data_despesa" required max="${hojeISO()}" value="${r?.data_despesa || hojeISO()}"></label>
      <label class="campo">Valor (R$)<input name="valor" inputmode="decimal" required placeholder="0,00" value="${r ? String(r.valor).replace('.', ',') : ''}"></label>
      <label class="campo">Categoria<select name="conta_id" required>${await opcoesContas(r?.conta_id)}</select></label>
      <label class="campo" id="campo-outros" ${r?.categoria_outros ? '' : 'hidden'}>Qual despesa?<input name="categoria_outros" value="${esc(r?.categoria_outros || '')}" placeholder="Descreva a categoria"></label>
      <label class="campo">Centro de custo<select name="centro_custo_id">${opcoes(ccs.filter(c => c.ativo), null, c => c.nome, ccPadrao, null)}</select></label>
      <label class="campo">Veículo (se houver)<select name="veiculo_id">${opcoes(vs.filter(v => v.ativo), null, v => v.placa + (v.modelo ? ' · ' + v.modelo : ''), r?.veiculo_id, 'Nenhum')}</select></label>
      <details class="largo comprovante" ${r?.fornecedor_nome || r?.chave_acesso ? 'open' : ''}><summary>Dados do comprovante (opcional)</summary><div class="form">
        <label class="campo">Estabelecimento<input name="fornecedor_nome" value="${esc(r?.fornecedor_nome || '')}" placeholder="Nome do posto, restaurante…"></label>
        <label class="campo">CNPJ / CPF<input name="fornecedor_documento" value="${esc(r?.fornecedor_documento || '')}" inputmode="numeric"></label>
        <label class="campo">Tipo de comprovante<select name="tipo_comprovante"><option value="">—</option>${TIPOS_COMPROVANTE.map(t => `<option ${r?.tipo_comprovante === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label class="campo">Nº da nota / cupom<input name="numero_documento" value="${esc(r?.numero_documento || '')}"></label>
        <label class="campo">Forma de pagamento<select name="forma_pagamento"><option value="">—</option>${FORMAS_PAGTO.map(t => `<option ${r?.forma_pagamento === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label class="campo">Cidade / UF<span class="lado"><input name="cidade" value="${esc(r?.cidade || '')}"><input name="uf" maxlength="2" value="${esc(r?.uf || '')}" style="max-width:64px" aria-label="UF"></span></label>
        <label class="campo largo">Chave de acesso (44 dígitos)<input name="chave_acesso" inputmode="numeric" value="${esc(r?.chave_acesso || '')}"></label>
      </div></details>
      <label class="campo largo">Descrição<textarea name="descricao" required placeholder="Ex.: almoço na viagem a Campinas">${esc(r?.descricao || '')}</textarea></label>
      <label class="campo largo">Comprovantes (foto ou PDF)<input type="file" name="arquivos" accept="image/*,application/pdf" multiple ${r ? '' : 'required'}></label>
      ${r ? `<div class="largo">Anexos atuais: ${await htmlAnexos('reembolso', r.id)}</div>` : ''}
      <div class="largo acoes"><button class="btn prim">${r ? 'Reenviar para aprovação' : 'Enviar para aprovação'}</button><a class="btn" href="#/reembolsos">Cancelar</a></div>
    </form>`;
  const f = $('#f-reemb');
  const mostrarOutros = () => { $('#campo-outros').hidden = !contaOutros.includes(f.conta_id.value); };
  f.conta_id.onchange = mostrarOutros; mostrarOutros();
  const quem = () => adtFixo ? quemIni : (f.quem ? f.quem.value : (r ? (r.colaborador_id ? 'u:' + r.colaborador_id : 'p:' + r.pessoa_sem_login_id) : 'u:' + estado.usuario.id));
  const atualizaAdt = () => {
    const ehAdt = f.forma_custeio.value === 'adiantamento'; $('#campo-adt').hidden = !ehAdt;
    const q = quem(); const meus = adtsAbertos.filter(a => (a.colaborador_id && 'u:' + a.colaborador_id === q) || (a.pessoa_sem_login_id && 'p:' + a.pessoa_sem_login_id === q));
    const sel = adtFixo?.id || r?.adiantamento_id;
    f.adiantamento_id.innerHTML = meus.length ? meus.map(a => `<option value="${a.id}" ${a.id === sel ? 'selected' : ''}>${esc(a.numero)} · ${brl(a.valor)} · ${esc(a.motivo)}</option>`).join('')
      : '<option value="">Nenhum adiantamento em aberto para esta pessoa</option>';
  };
  f.forma_custeio.onchange = atualizaAdt; if (f.quem) f.quem.onchange = atualizaAdt; atualizaAdt();
  f.onsubmit = async e => {
    e.preventDefault();
    const d = formDados(f);
    const valor = num(d.valor);
    if (!valor || valor <= 0) return aviso('Informe um valor válido.', true);
    if (contaOutros.includes(d.conta_id) && !d.categoria_outros) return aviso('Descreva a categoria "Outros".', true);
    const custeio = adtFixo ? 'adiantamento' : d.forma_custeio;
    const adtId = adtFixo ? adtFixo.id : (custeio === 'adiantamento' ? f.adiantamento_id.value : null);
    if (custeio === 'adiantamento' && !adtId) return aviso('Não há adiantamento em aberto para esta pessoa. Escolha outra forma de pagamento.', true);
    const q = quem();
    if (!r && editaFin() && !q) return aviso('Escolha o colaborador.', true);
    const dados = { forma_custeio: custeio, adiantamento_id: adtId, data_despesa: d.data_despesa, valor, conta_id: d.conta_id, categoria_outros: contaOutros.includes(d.conta_id) ? d.categoria_outros : null,
                    centro_custo_id: d.centro_custo_id || null, veiculo_id: d.veiculo_id || null, descricao: d.descricao, status: 'aguardando_aprovacao' };
    for (const k of ['fornecedor_nome', 'fornecedor_documento', 'tipo_comprovante', 'numero_documento', 'forma_pagamento', 'cidade']) dados[k] = (d[k] || '').trim() || null;
    dados.uf = (d.uf || '').trim().toUpperCase() || null;
    dados.chave_acesso = (d.chave_acesso || '').replace(/\D/g, '') || null;
    await ocupado(e.submitter, async () => {
      try {
        let id;
        if (r) { await api.alterar('reembolsos', `id=eq.${r.id}`, dados); id = r.id; }
        else {
          const pessoa = q.startsWith('p:') ? pessoas.find(p => 'p:' + p.id === q) : null;
          const [novo] = await api.inserir('reembolsos', { ...dados, colaborador_id: pessoa ? null : q.slice(2),
            pessoa_sem_login_id: pessoa?.id || null, colaborador_nome: pessoa?.nome || null }); id = novo.id; }
        await anexar('reembolso', id, d.arquivos);
        aviso(r ? 'Reembolso reenviado.' : 'Reembolso enviado para aprovação.');
        location.hash = adtId ? '#/adiantamentos/ver/' + adtId : '#/reembolsos/ver/' + id;
      } catch (err) { falha(err); }
    });
  };
}
rota('/reembolsos/novo', tela => formReembolso(tela));
rota('/reembolsos/editar/:id', async (tela, id) => formReembolso(tela, await api.um('reembolsos', `id=eq.${id}`)));

// ---------- Detalhe ----------
rota('/reembolsos/ver/:id', async (tela, id) => {
  const r = await api.um('reembolsos', `${SELECT_REEMB}&id=eq.${id}`);
  if (!r) { tela.innerHTML = '<div class="cartao vazio">Reembolso não encontrado ou sem acesso.</div>'; return; }
  const [aprov, hist] = await Promise.all([
    api.listar('aprovacoes', `entidade=eq.reembolso&entidade_id=eq.${id}&order=solicitado_em`).catch(() => []),
    htmlAnexos('reembolso', id)]);
  const nomes = porId(await usuarios());
  const dono = r.colaborador_id === estado.usuario.id;
  tela.innerHTML = `
    <div class="topo"><div><h1>Reembolso ${esc(r.numero)}</h1><p class="sub">${tag(r.status)} · lançado em ${dataHoraBR(r.criado_em)}${r.origem === 'legado_claude' ? ' · <span class="tag">Sistema anterior</span>' : ''}</p></div>
      <div class="acoes">
        ${dono && ['devolvido', 'aguardando_aprovacao'].includes(r.status) ? `<a class="btn" href="#/reembolsos/editar/${r.id}">Corrigir</a>` : ''}
        ${(dono && ['devolvido', 'aguardando_aprovacao', 'rascunho'].includes(r.status)) || (editaFin() && !['pago', 'em_pagamento', 'cancelado'].includes(r.status)) ? '<button class="btn perigo" id="cancelar">Cancelar lançamento</button>' : ''}
        <button class="btn" onclick="history.back()">Voltar</button></div></div>
    <div class="cartao"><div class="form">
      <div><div class="muted">Colaborador</div><b>${esc(nomeColab(r))}</b></div>
      <div><div class="muted">Data da despesa</div><b>${dataBR(r.data_despesa)}</b></div>
      <div><div class="muted">Valor</div><b>${brl(r.valor)}</b></div>
      <div><div class="muted">Categoria</div><b>${esc(categoriaTxt(r))}</b></div>
      <div><div class="muted">Centro de custo</div><b>${esc(r.cc?.nome || '—')}</b></div>
      <div><div class="muted">Como foi pago</div><b>${esc(CUSTEIO[r.forma_custeio] || 'Reembolso')}</b>${r.adiantamento_id ? ` · <a href="#/adiantamentos/ver/${r.adiantamento_id}">ver adiantamento</a>` : ''}${r.forma_custeio === 'fundo_fixo' ? '<div class="muted">Ao aprovar, sai do saldo do Fundo Fixo</div>' : ''}</div>
      ${[['Estabelecimento', r.fornecedor_nome], ['CNPJ / CPF', r.fornecedor_documento], ['Comprovante', [r.tipo_comprovante, r.numero_documento && 'nº ' + r.numero_documento].filter(Boolean).join(' · ')],
         ['Forma de pagamento', r.forma_pagamento], ['Cidade', [r.cidade, r.uf].filter(Boolean).join(' / ')], ['Placa', r.placa], ['Rota', r.rota]]
        .filter(([, v]) => v).map(([k, v]) => `<div><div class="muted">${k}</div>${esc(v)}</div>`).join('')}
      ${r.chave_acesso ? `<div class="largo"><div class="muted">Chave de acesso</div><span class="mono">${esc(r.chave_acesso)}</span></div>` : ''}
      <div class="largo"><div class="muted">Descrição</div>${esc(r.descricao || '—')}</div>
      ${blocoObservacao(r.observacoes, editaFin())}
      <div class="largo"><div class="muted">Comprovantes</div>${hist}</div>
      ${['aguardando_aprovacao', 'devolvido'].includes(r.status) ? `<label class="campo largo">Incluir mais comprovantes<input type="file" id="mais" accept="image/*,application/pdf" multiple></label>` : ''}
    </div></div>
    <div class="cartao"><h2>Histórico</h2><ul class="lista-simples">
      <li><span>Lançado</span><span class="muted">${dataHoraBR(r.criado_em)}</span></li>
      ${aprov.map(a => `<li><span>${a.decisao === 'pendente' ? 'Aguardando ' + (a.aprovador_id ? esc(nomes[a.aprovador_id]?.nome) : 'perfil ' + esc(a.perfil_aprovador)) : `${tag(a.decisao)} por ${esc(nomes[a.aprovador_id]?.nome || '—')}${a.comentario ? ' — “' + esc(a.comentario) + '”' : ''}`}</span>
        <span class="muted">${dataHoraBR(a.decidido_em || a.solicitado_em)}</span></li>`).join('')}
    </ul></div>`;
  ligarObservacao('reembolsos', id, r.observacoes);
  $('#mais')?.addEventListener('change', async e => {
    try { await anexar('reembolso', id, [...e.target.files]); aviso('Comprovante incluído.'); navegar(); } catch (err) { falha(err); }
  });
  $('#cancelar')?.addEventListener('click', async () => {
    const motivo = await confirmar('Cancelar este reembolso?', { comMotivo: true, botao: 'Cancelar lançamento' });
    if (!motivo) return;
    try { await api.alterar('reembolsos', `id=eq.${id}`, { status: 'cancelado', cancelado_em: new Date().toISOString(), cancelado_por: estado.usuario.id, motivo_cancelamento: motivo });
          aviso('Reembolso cancelado.'); history.back(); } catch (err) { falha(err); }
  });
});

// ---------- Gestão (Financeiro) ----------
rota('/financeiro/reembolsos', async tela => {
  const st = estado.params.get('status') || 'abertos';
  const filtroSt = { abertos: 'status=in.(aguardando_aprovacao,aprovado,em_pagamento,devolvido)', aprovado: 'status=eq.aprovado&forma_custeio=eq.reembolso',
                     pago: 'status=eq.pago', todos: 'status=neq.cancelado' }[st] || 'status=neq.cancelado';
  const ini = estado.params.get('de') || '', fim = estado.params.get('ate') || '';
  const linhas = await api.listar('reembolsos', `${SELECT_REEMB}&${filtroSt}${ini ? '&data_despesa=gte.' + ini : ''}${fim ? '&data_despesa=lte.' + fim : ''}&order=data_despesa.desc,numero.desc&limit=1000`);
  tela.innerHTML = `
    <div class="topo"><div><h1>Reembolsos</h1><p class="sub">Financeiro · todos os colaboradores</p></div>
      <div class="acoes">${editaFin() ? '<button class="btn ok" id="lote" disabled>Gerar pagamento dos selecionados</button>' : ''}
      <a class="btn prim" href="#/reembolsos/novo">+ Lançar</a></div></div>
    <form class="filtros" id="filtros">
      <select name="status">${[['abertos', 'Em andamento'], ['aprovado', 'Aprovados a pagar'], ['pago', 'Pagos'], ['todos', 'Todos']].map(([v, t]) => `<option value="${v}" ${v === st ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <input type="date" name="de" value="${ini}" aria-label="De"><input type="date" name="ate" value="${fim}" aria-label="Até">
      <button class="btn">Filtrar</button>
    </form>
    ${editaFin() && st !== 'aprovado' ? '<p class="muted">Para pagar, filtre "Aprovados a pagar", marque os lançamentos de um mesmo colaborador e gere o pagamento.</p>' : ''}
    <div class="cartao">${tabelaReembolsos(linhas, { comColab: true, selecionar: editaFin() })}</div>`;
  $('#filtros').onsubmit = e => { e.preventDefault(); const d = formDados(e.target);
    location.hash = '#/financeiro/reembolsos?' + new URLSearchParams(Object.entries(d).filter(([, v]) => v)).toString(); };
  ligarLinhas(tela);
  const atualizar = () => {
    const sel = $$('.sel:checked', tela);
    const pessoas = new Set(sel.map(s => s.dataset.colab));
    const b = $('#lote'); if (!b) return;
    b.disabled = !sel.length || pessoas.size > 1;
    const total = sel.reduce((s, c) => s + Number(linhas.find(l => l.id === c.value).valor), 0);
    b.textContent = pessoas.size > 1 ? 'Selecione um colaborador por vez' : sel.length ? `Gerar pagamento (${sel.length} · ${brl(total)})` : 'Gerar pagamento dos selecionados';
  };
  $$('.sel', tela).forEach(c => (c.onchange = atualizar));
  $('#sel-todos')?.addEventListener('change', e => { $$('.sel', tela).forEach(c => (c.checked = e.target.checked)); atualizar(); });
  $('#lote')?.addEventListener('click', async () => {
    const ids = $$('.sel:checked', tela).map(c => c.value);
    const r = await modal(`<form><h2>Gerar pagamento</h2><p>${ids.length} reembolso(s) viram uma conta a pagar para o colaborador.</p>
      <label class="campo">Data prevista do pagamento<input type="date" name="venc" value="${hojeISO()}" required></label>
      <div class="rodape"><button type="button" class="btn" data-fechar>Voltar</button><button class="btn prim">Gerar</button></div></form>`);
    if (!r) return;
    try { await api.rpc('gerar_lote_reembolso', { p_reembolsos: ids, p_vencimento: r.venc });
          aviso('Pagamento gerado em Contas a pagar.'); location.hash = '#/financeiro/pagar'; } catch (err) { falha(err); }
  });
});

// ===================== Aprovações =====================
rota('/aprovacoes', async tela => {
  const pend = await api.listar('aprovacoes', 'decisao=eq.pendente&order=solicitado_em');
  const ids = pend.filter(a => a.entidade === 'reembolso').map(a => a.entidade_id);
  const docs = ids.length ? porId(await api.listar('reembolsos', `${SELECT_REEMB}&id=${lista(ids)}`)) : {};
  const idsA = pend.filter(a => a.entidade === 'adiantamento').map(a => a.entidade_id);
  const adts = idsA.length ? porId(await api.listar('adiantamentos', `select=*,colab:usuarios(nome)&id=${lista(idsA)}`)) : {};
  const meusA = pend.filter(a => a.entidade === 'adiantamento' && adts[a.entidade_id]?.status === 'aguardando_aprovacao' && adts[a.entidade_id].colaborador_id !== estado.usuario.id
                          && (a.aprovador_id === estado.usuario.id || (a.perfil_aprovador && tem(a.perfil_aprovador))));
  const meus = pend.filter(a => a.entidade === 'reembolso' && docs[a.entidade_id]?.status === 'aguardando_aprovacao' && docs[a.entidade_id].colaborador_id !== estado.usuario.id
                         && (a.aprovador_id === estado.usuario.id || (a.perfil_aprovador && tem(a.perfil_aprovador))));
  const outros = pend.length - meus.length - meusA.length;
  tela.innerHTML = `
    <div class="topo"><div><h1>Aprovações</h1><p class="sub">${meus.length + meusA.length} item(ns) esperando a sua decisão</p></div>
      ${meus.length ? '<button class="btn ok" id="aprovar-sel" disabled>Aprovar selecionados</button>' : ''}</div>
    ${meus.length ? meus.map(a => { const r = docs[a.entidade_id]; return `
      <div class="cartao" data-ap="${a.id}">
        <div class="topo" style="margin-bottom:8px"><label class="check"><input type="checkbox" class="sel-ap" value="${a.id}">
          <span><b>Reembolso ${esc(r.numero)}</b> · ${esc(nomeColab(r))}</span></label><b style="font-size:18px">${brl(r.valor)}</b></div>
        <div class="muted">${dataBR(r.data_despesa)} · ${esc(categoriaTxt(r))} · ${esc(r.cc?.nome || '')}</div>
        <p style="margin:8px 0">${esc([r.fornecedor_nome, r.descricao].filter(Boolean).join(' — '))}</p>
        ${r.observacoes ? `<p class="alerta-obs" style="white-space:pre-line">${esc(r.observacoes)}</p>` : ''}
        <div class="anexos-de" data-id="${r.id}"><span class="muted">Carregando comprovantes…</span></div>
        <div class="acoes" style="margin-top:12px"><button class="btn ok peq" data-d="aprovado">Aprovar</button>
          <button class="btn peq" data-d="devolvido">Devolver p/ correção</button><button class="btn perigo peq" data-d="reprovado">Reprovar</button></div>
      </div>`; }).join('') : ''}
    ${meusA.map(a => { const x = adts[a.entidade_id]; return `
      <div class="cartao" data-ap="${a.id}">
        <div class="topo" style="margin-bottom:8px"><span><b>Adiantamento ${esc(x.numero)}</b> · ${esc(x.colab?.nome || x.colaborador_nome || '—')}</span><b style="font-size:18px">${brl(x.valor)}</b></div>
        <div class="muted">${x.data_saida ? 'Saída ' + dataBR(x.data_saida) : ''}${x.data_retorno ? ' · retorno ' + dataBR(x.data_retorno) : ''}</div>
        <p style="margin:8px 0">${esc(x.motivo)}</p>
        <div class="acoes" style="margin-top:12px"><button class="btn ok peq" data-d="aprovado">Aprovar</button>
          <button class="btn peq" data-d="devolvido">Devolver p/ correção</button><button class="btn perigo peq" data-d="reprovado">Reprovar</button>
          <a class="btn peq" href="#/adiantamentos/ver/${x.id}">Abrir</a></div>
      </div>`; }).join('')}
    ${!meus.length && !meusA.length ? '<div class="cartao vazio">Nada para aprovar agora. 🎉</div>' : ''}
    ${outros > 0 && veTudo() ? `<p class="muted">${outros} item(ns) aguardam outros aprovadores (ou são lançamentos seus, que sobem para outra pessoa).</p>` : ''}`;
  $$('.anexos-de', tela).forEach(async el => { el.innerHTML = await htmlAnexos('reembolso', el.dataset.id); });
  const decidir = async (apId, decisao, comentario = null) => api.rpc('decidir_aprovacao', { p_aprovacao: apId, p_decisao: decisao, p_comentario: comentario });
  $$('[data-d]', tela).forEach(b => b.addEventListener('click', async () => {
    const apId = b.closest('[data-ap]').dataset.ap, d = b.dataset.d;
    let coment = null;
    if (d !== 'aprovado') { coment = await confirmar(d === 'devolvido' ? 'Devolver para correção' : 'Reprovar reembolso', { comMotivo: true, botao: d === 'devolvido' ? 'Devolver' : 'Reprovar' }); if (!coment) return; }
    await ocupado(b, async () => { try { await decidir(apId, d, coment); aviso('Decisão registrada.'); navegar(); } catch (err) { falha(err); } });
  }));
  const bSel = $('#aprovar-sel');
  $$('.sel-ap', tela).forEach(c => (c.onchange = () => { const n = $$('.sel-ap:checked', tela).length; bSel.disabled = !n; bSel.textContent = n ? `Aprovar selecionados (${n})` : 'Aprovar selecionados'; }));
  bSel?.addEventListener('click', async () => {
    await ocupado(bSel, async () => {
      try { for (const c of $$('.sel-ap:checked', tela)) await decidir(c.value, 'aprovado'); aviso('Itens aprovados.'); navegar(); } catch (err) { falha(err); }
    });
  });
});
