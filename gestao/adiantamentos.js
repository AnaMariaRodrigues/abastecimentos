// Verbo Gestão — Fundo Fixo e Adiantamentos (prestação de contas)
'use strict';

const FORMAS_DIN = ['Dinheiro', 'Pix', 'Transferência'];
const nomeAdt = a => a.colab?.nome || a.colaborador_nome || '—';
const adtVencido = a => ['pago', 'prestando_contas'].includes(a.status) && a.prazo_prestacao && a.prazo_prestacao < hojeISO();
const STATUS_ADT = { aguardando_aprovacao: ['Aguardando aprovação', 'amarelo'], aprovado: ['Aprovado · a entregar', 'azul'], pago: ['Entregue · aguardando prestação', 'azul'],
  prestando_contas: ['Prestando contas', 'amarelo'], acertado: ['Acertado', 'verde'], devolvido: ['Devolvido p/ correção', 'vermelho'],
  reprovado: ['Reprovado', 'vermelho'], cancelado: ['Cancelado', ''] };
const tagAdt = a => adtVencido(a) ? '<span class="tag vermelho">Prestação vencida</span>' : `<span class="tag ${STATUS_ADT[a.status]?.[1] || ''}">${STATUS_ADT[a.status]?.[0] || a.status}</span>`;
const dadosConta = c => c ? [c.titular, c.banco && `Banco ${c.banco}`, c.agencia && `Ag. ${c.agencia}`, c.conta && `Conta ${c.conta}`, c.chave_pix && `Pix ${c.chave_pix}`].filter(Boolean).join(' · ') : '';
const SELECT_ADT = 'select=*,colab:usuarios(nome)';

function tabelaAdts(linhas, comNome = true) {
  if (!linhas.length) return '<div class="vazio">Nenhum adiantamento.</div>';
  return `<div class="tabela-wrap"><table class="responsiva"><thead><tr><th>Nº</th>${comNome ? '<th>Colaborador</th>' : ''}<th>Motivo</th><th class="num">Valor</th><th>Prestar contas até</th><th>Situação</th></tr></thead><tbody>
    ${linhas.map(a => `<tr class="clicavel" onclick="location.hash='#/adiantamentos/ver/${a.id}'"><td data-r="Nº" class="nowrap">${esc(a.numero)}</td>
      ${comNome ? `<td data-r="Colaborador">${esc(nomeAdt(a))}</td>` : ''}<td data-r="Motivo">${esc(a.motivo)}</td><td data-r="Valor" class="num">${brl(a.valor)}</td>
      <td data-r="Prestar contas até">${a.prazo_prestacao ? dataBR(a.prazo_prestacao) : '—'}</td><td data-r="Situação">${tagAdt(a)}</td></tr>`).join('')}
  </tbody></table></div>`;
}

// ---------- Meus adiantamentos ----------
rota('/adiantamentos', async tela => {
  const ls = await api.listar('adiantamentos', `${SELECT_ADT}&colaborador_id=eq.${estado.usuario.id}&status=neq.cancelado&order=criado_em.desc`);
  tela.innerHTML = `
    <div class="topo"><div><h1>Meus adiantamentos</h1><p class="sub">Dinheiro recebido antes da despesa: depois preste contas com os comprovantes</p></div>
      <a class="btn prim" href="#/adiantamentos/novo">+ Pedir adiantamento</a></div>
    <div class="cartao">${tabelaAdts(ls, false)}</div>`;
});

// ---------- Adiantamentos (Financeiro) ----------
rota('/financeiro/adiantamentos', async tela => {
  const st = estado.params.get('status') || 'abertos';
  const filtro = { abertos: 'status=in.(aguardando_aprovacao,aprovado,pago,prestando_contas,devolvido)', acertados: 'status=eq.acertado', todos: 'status=neq.cancelado' }[st];
  const ls = await api.listar('adiantamentos', `${SELECT_ADT}&${filtro}&order=criado_em.desc&limit=500`);
  const emAberto = ls.filter(a => ['pago', 'prestando_contas'].includes(a.status));
  tela.innerHTML = `
    <div class="topo"><div><h1>Adiantamentos</h1><p class="sub">${emAberto.length} com colaborador · ${brl(emAberto.reduce((s, a) => s + Number(a.valor), 0))} a prestar contas · ${ls.filter(adtVencido).length} vencido(s)</p></div>
      <div class="acoes"><a class="btn prim" href="#/adiantamentos/novo">+ Novo adiantamento</a></div></div>
    <form class="filtros" id="filtros"><select name="status">${[['abertos', 'Em andamento'], ['acertados', 'Acertados'], ['todos', 'Todos']].map(([v, t]) => `<option value="${v}" ${v === st ? 'selected' : ''}>${t}</option>`).join('')}</select><button class="btn">Filtrar</button></form>
    <div class="cartao">${tabelaAdts(ls)}</div>`;
  $('#filtros').onsubmit = e => { e.preventDefault(); location.hash = '#/financeiro/adiantamentos?status=' + formDados(e.target).status; };
});

// ---------- Novo adiantamento ----------
rota('/adiantamentos/novo', async tela => {
  const [users, pessoas, ccs] = await Promise.all([editaFin() ? usuarios() : [], editaFin() ? pessoasSemLogin() : [], centros()]);
  const ccPadrao = estado.usuario.centro_custo_id || ccs.find(c => c.codigo === 'GERAL')?.id;
  tela.innerHTML = `
    <div class="topo"><div><h1>${editaFin() ? 'Novo adiantamento' : 'Pedir adiantamento'}</h1><p class="sub">Depois de aprovado, o Financeiro entrega o valor. A prestação de contas vence ${5} dias após o retorno.</p></div></div>
    <form class="cartao form" id="f-adt">
      ${editaFin() ? `<label class="campo">Colaborador<select name="quem" required><option value="">Selecione…</option>
        <optgroup label="Com acesso ao sistema">${users.filter(u => u.ativo).map(u => `<option value="u:${u.id}">${esc(u.nome)}</option>`).join('')}</optgroup>
        ${pessoas.length ? `<optgroup label="Sem acesso (cadastro interno)">${pessoas.map(p => `<option value="p:${p.id}">${esc(p.nome)}</option>`).join('')}</optgroup>` : ''}</select></label>` : ''}
      <label class="campo">Valor (R$)<input name="valor" inputmode="decimal" required placeholder="0,00"></label>
      <label class="campo largo">Motivo<input name="motivo" required placeholder="Ex.: viagem Guararapes × Três Lagoas, combustível e alimentação"></label>
      <label class="campo">Data de saída<input type="date" name="data_saida" value="${hojeISO()}"></label>
      <label class="campo">Data de retorno<input type="date" name="data_retorno"></label>
      <label class="campo">Centro de custo<select name="cc">${opcoes(ccs.filter(c => c.ativo), null, c => c.nome, ccPadrao, null)}</select></label>
      <div class="largo acoes"><button class="btn prim">Enviar para aprovação</button><a class="btn" href="javascript:history.back()">Cancelar</a></div>
    </form>`;
  const f = $('#f-adt');
  f.onsubmit = async e => {
    e.preventDefault();
    const d = formDados(f); const v = num(d.valor);
    if (!v || v <= 0) return aviso('Informe o valor.', true);
    const q = d.quem || 'u:' + estado.usuario.id;
    const pessoa = q.startsWith('p:') ? pessoas.find(p => 'p:' + p.id === q) : null;
    await ocupado(e.submitter, async () => {
      try {
        const [a] = await api.inserir('adiantamentos', { colaborador_id: pessoa ? null : q.slice(2), pessoa_sem_login_id: pessoa?.id || null, colaborador_nome: pessoa?.nome || null,
          valor: v, motivo: d.motivo, data_saida: d.data_saida || null, data_retorno: d.data_retorno || null, centro_custo_id: d.cc || null, status: 'aguardando_aprovacao' });
        aviso(`Adiantamento ${a.numero} enviado para aprovação.`); location.hash = '#/adiantamentos/ver/' + a.id;
      } catch (err) { falha(err); }
    });
  };
});

// ---------- Detalhe e prestação de contas ----------
rota('/adiantamentos/ver/:id', async (tela, id) => {
  const a = await api.um('adiantamentos', `${SELECT_ADT}&id=eq.${id}`);
  if (!a) { tela.innerHTML = '<div class="cartao vazio">Adiantamento não encontrado ou sem acesso.</div>'; return; }
  const [desp, devs, bs, saldos] = await Promise.all([
    api.listar('reembolsos', `${SELECT_REEMB}&adiantamento_id=eq.${id}&status=neq.cancelado&order=data_despesa`),
    api.listar('devolucoes_adiantamento', `adiantamento_id=eq.${id}&cancelado_em=is.null&order=data`).catch(() => []),
    api.listar('contas_bancarias', 'select=*&ativo=eq.true&order=nome').catch(() => []),
    api.listar('v_saldos_contas', 'select=id,saldo').catch(() => [])]);
  const aprovado = desp.filter(r => ['aprovado', 'pago'].includes(r.status)).reduce((s, r) => s + Number(r.valor), 0);
  const emAnalise = desp.filter(r => ['aguardando_aprovacao', 'devolvido'].includes(r.status)).reduce((s, r) => s + Number(r.valor), 0);
  const devolvido = Number(a.valor_devolvido || 0);
  const saldo = Number(a.valor) - aprovado - devolvido;
  const dono = a.colaborador_id === estado.usuario.id;
  const aberto = ['pago', 'prestando_contas'].includes(a.status);
  const fundo = bs.find(b => b.tipo === 'fundo_fixo');
  const anexosEntrega = await htmlAnexos('adiantamento', id);
  const compDev = {}; for (const dv of devs) compDev[dv.id] = await htmlAnexos('devolucao', dv.id);
  tela.innerHTML = `
    <div class="topo"><div><h1>Adiantamento ${esc(a.numero)} · ${esc(nomeAdt(a))}</h1><p class="sub">${tagAdt(a)} · ${esc(a.motivo)}</p></div>
      <div class="acoes">
        ${editaFin() && a.status === 'aprovado' ? '<button class="btn ok" id="entregar">Registrar entrega</button>' : ''}
        ${aberto && (dono || editaFin()) ? `<a class="btn prim" href="#/reembolsos/novo?adt=${id}">+ Lançar despesa da prestação</a>` : ''}
        ${editaFin() && aberto && saldo > 0.004 ? '<button class="btn" id="devolver">Registrar devolução</button>' : ''}
        ${editaFin() && aberto ? '<button class="btn ok" id="acertar">Fazer o acerto</button>' : ''}
        ${(editaFin() || dono) && ['aguardando_aprovacao', 'aprovado', 'devolvido'].includes(a.status) ? '<button class="btn perigo" id="cancelar">Cancelar</button>' : ''}
        <button class="btn" onclick="history.back()">Voltar</button></div></div>
    <div class="grade" style="margin-bottom:16px">
      <div class="cartao kpi"><div class="n" style="font-size:22px">${brl(a.valor)}</div><div class="r">adiantado</div></div>
      <div class="cartao kpi"><div class="n" style="font-size:22px">${brl(aprovado)}</div><div class="r">comprovado e aprovado</div></div>
      <div class="cartao kpi ${emAnalise ? 'alerta' : ''}"><div class="n" style="font-size:22px">${brl(emAnalise)}</div><div class="r">em aprovação</div></div>
      <div class="cartao kpi"><div class="n" style="font-size:22px">${brl(devolvido)}</div><div class="r">devolvido</div></div>
      <div class="cartao kpi ${a.status !== 'acertado' && Math.abs(saldo) > 0.004 ? 'alerta' : ''}"><div class="n" style="font-size:22px">${brl(Math.abs(saldo))}</div>
        <div class="r">${a.status === 'acertado' ? 'acertado' : saldo > 0.004 ? 'a devolver ou comprovar' : saldo < -0.004 ? 'a complementar ao colaborador' : 'sem diferença'}</div></div>
    </div>
    <div class="cartao"><div class="form">
      <div><div class="muted">Saída / retorno</div><b>${a.data_saida ? dataBR(a.data_saida) : '—'}${a.data_retorno ? ' → ' + dataBR(a.data_retorno) : ''}</b></div>
      <div><div class="muted">Entregue</div><b>${a.data_entrega ? dataBR(a.data_entrega) + ' · ' + esc(a.forma_entrega || '') : '—'}</b>${a.conta_bancaria_id ? `<div class="muted">de ${esc(bs.find(b => b.id === a.conta_bancaria_id)?.nome || '')}</div>` : ''}</div>
      <div><div class="muted">Prestar contas até</div><b>${a.prazo_prestacao ? dataBR(a.prazo_prestacao) : '—'}</b></div>
      ${a.status === 'acertado' ? `<div><div class="muted">Acerto</div><b>${dataHoraBR(a.acertado_em)}</b>${Number(a.valor_complemento) > 0 ? `<div class="muted">Complemento de ${brl(a.valor_complemento)} em Contas a pagar</div>` : ''}</div>` : ''}
      <div class="largo"><div class="muted">Comprovante da entrega</div>${anexosEntrega}</div>
      ${blocoObservacao(a.observacoes, editaFin())}
    </div></div>
    <div class="cartao"><h2>Despesas da prestação de contas (${desp.length})</h2>${tabelaReembolsos(desp)}</div>
    ${devs.length ? `<div class="cartao"><h2>Devoluções</h2><ul class="lista-simples">${devs.map(dv => `<li style="flex-wrap:wrap"><span>${dataBR(dv.data)} · ${esc(dv.forma)} · ${dv.destino === 'fundo_fixo' ? 'Fundo Fixo' : 'Empresa'} · ${esc(bs.find(b => b.id === dv.conta_bancaria_id)?.nome || '')}${dv.dados_destino ? ' · ' + esc(dv.dados_destino) : ''}</span><b>${brl(dv.valor)}</b>
      <div style="flex-basis:100%"><span class="muted">Comprovante:</span> ${dv.forma === 'Dinheiro' && compDev[dv.id].includes('Sem anexos') ? '<span class="muted">em dinheiro</span>' : compDev[dv.id]}</div></li>`).join('')}</ul></div>` : ''}`;
  ligarLinhas(tela);
  ligarObservacao('adiantamentos', id, a.observacoes);

  const contaOpcoes = (sel, filtro = () => true) => bs.filter(filtro).map(b => `<option value="${b.id}" ${b.id === sel ? 'selected' : ''}>${esc(b.nome)}${b.tipo === 'fundo_fixo' ? ` (saldo ${brl(saldos.find(s => s.id === b.id)?.saldo)})` : ''}</option>`).join('');
  const exigeComprovante = d => d.forma !== 'Dinheiro' && !d.arquivos.length ? 'Anexe o comprovante. Só dinheiro dispensa comprovante.' : null;

  $('#entregar')?.addEventListener('click', async () => {
    const r = await modal(`<form><h2>Entregar ${esc(a.numero)} · ${brl(a.valor)}</h2><div class="form">
      <label class="campo">Data<input type="date" name="data" value="${hojeISO()}" required></label>
      <label class="campo">Saiu de<select name="conta" required>${contaOpcoes(fundo?.id)}</select></label>
      <label class="campo">Forma<select name="forma" required>${FORMAS_DIN.map(x => `<option>${x}</option>`).join('')}</select></label>
      <label class="campo largo">Observação<input name="obs"></label>
      <label class="campo largo">Comprovante (obrigatório, exceto dinheiro)<input type="file" name="arquivos" accept="image/*,application/pdf" multiple></label></div>
      <div class="rodape"><button type="button" class="btn" data-fechar>Voltar</button><button class="btn ok">Confirmar entrega</button></div></form>`, { validar: exigeComprovante });
    if (!r) return;
    try { await api.rpc('entregar_adiantamento', { p_id: id, p_data: r.data, p_conta: r.conta, p_forma: r.forma, p_obs: r.obs || null });
          await anexar('adiantamento', id, r.arquivos); aviso('Entrega registrada.'); navegar(); } catch (err) { falha(err); }
  });

  $('#devolver')?.addEventListener('click', async () => {
    const r = await modal(`<form><h2>Devolução de sobra · ${esc(a.numero)}</h2><div class="form">
      <label class="campo">Data<input type="date" name="data" value="${hojeISO()}" required></label>
      <label class="campo">Valor (R$)<input name="valor" inputmode="decimal" value="${saldo.toFixed(2).replace('.', ',')}" required></label>
      <label class="campo">Forma<select name="forma" required>${FORMAS_DIN.map(x => `<option>${x}</option>`).join('')}</select></label>
      <label class="campo">Quem recebe<select name="destino" required><option value="fundo_fixo">Responsável do Fundo Fixo</option><option value="empresa">Empresa (conta bancária)</option></select></label>
      <label class="campo">Conta que recebe<select name="conta" required>${contaOpcoes(fundo?.id)}</select></label>
      <label class="campo largo">Dados de quem recebe (conta ou chave Pix)<input name="dados" value="${esc(dadosConta(fundo))}"></label>
      <label class="campo largo">Observação<input name="obs"></label>
      <label class="campo largo">Comprovante (obrigatório, exceto dinheiro)<input type="file" name="arquivos" accept="image/*,application/pdf" multiple></label></div>
      <div class="rodape"><button type="button" class="btn" data-fechar>Voltar</button><button class="btn ok">Registrar</button></div></form>`, {
      aoAbrir: raiz => {
        const f = $('form', raiz);
        const sinc = () => { const c = bs.find(b => b.id === f.conta.value); f.dados.value = dadosConta(c); };
        f.destino.onchange = () => { const alvo = f.destino.value === 'fundo_fixo' ? fundo : bs.find(b => b.tipo !== 'fundo_fixo');
          f.conta.innerHTML = contaOpcoes(alvo?.id, b => (f.destino.value === 'fundo_fixo') === (b.tipo === 'fundo_fixo')); sinc(); };
        f.conta.onchange = sinc;
      },
      validar: d => !(num(d.valor) > 0) ? 'Informe o valor devolvido.' : exigeComprovante(d) });
    if (!r) return;
    try {
      const devId = await api.rpc('registrar_devolucao', { p_adiantamento: id, p_data: r.data, p_valor: num(r.valor), p_forma: r.forma,
        p_destino: r.destino, p_conta: r.conta, p_dados: r.dados || null, p_obs: r.obs || null });
      await anexar('devolucao', devId, r.arquivos); aviso('Devolução registrada.'); navegar();
    } catch (err) { falha(err); }
  });

  $('#acertar')?.addEventListener('click', async () => {
    const msg = emAnalise > 0 ? 'Ainda há despesas em aprovação. Aprove ou reprove antes do acerto.'
      : saldo > 0.004 ? `Falta ${brl(saldo)}: registre a devolução da sobra antes do acerto.`
      : saldo < -0.004 ? `O colaborador gastou ${brl(-saldo)} a mais. Ao confirmar, a diferença vira uma conta a pagar para ele.` : 'Prestação de contas fecha sem diferença.';
    if (emAnalise > 0 || saldo > 0.004) return aviso(msg, true);
    if (!await confirmar(msg + ' Confirmar o acerto?', { botao: 'Fazer o acerto' })) return;
    try { await api.rpc('acertar_adiantamento', { p_id: id }); aviso('Adiantamento acertado.'); navegar(); } catch (err) { falha(err); }
  });

  $('#cancelar')?.addEventListener('click', async () => {
    const motivo = await confirmar('Cancelar este adiantamento?', { comMotivo: true, botao: 'Cancelar adiantamento' });
    if (!motivo) return;
    try { await api.alterar('adiantamentos', `id=eq.${id}`, { status: 'cancelado', cancelado_em: new Date().toISOString(), cancelado_por: estado.usuario.id, motivo_cancelamento: motivo });
          aviso('Adiantamento cancelado.'); navegar(); } catch (err) { falha(err); }
  });
});

// ---------- Fundo Fixo ----------
rota('/financeiro/fundo', async tela => {
  const fundo = await api.um('contas_bancarias', 'tipo=eq.fundo_fixo&ativo=eq.true&select=*');
  if (!fundo) { tela.innerHTML = '<div class="cartao vazio">Fundo Fixo não cadastrado. Crie em Cadastros → Bancos e caixa com o tipo “fundo_fixo”.</div>'; return; }
  const de = estado.params.get('de') || '', ate = estado.params.get('ate') || '';
  const [movs, saldoV, adts, pendFundo, bs] = await Promise.all([
    api.listar('movimentos_bancarios', `conta_bancaria_id=eq.${fundo.id}&cancelado_em=is.null${de ? '&data=gte.' + de : ''}${ate ? '&data=lte.' + ate : ''}&order=data,criado_em&limit=2000`),
    api.um('v_saldos_contas', `id=eq.${fundo.id}`),
    api.listar('adiantamentos', `${SELECT_ADT}&conta_bancaria_id=eq.${fundo.id}&status=in.(pago,prestando_contas)&order=prazo_prestacao`),
    api.listar('reembolsos', `select=id,valor&forma_custeio=eq.fundo_fixo&status=in.(aguardando_aprovacao,devolvido)`),
    api.listar('contas_bancarias', 'select=*&ativo=eq.true&order=nome')]);
  const saldo = Number(saldoV?.saldo || 0);
  const comColab = adts.reduce((s, a) => s + Number(a.valor), 0);
  const aAprovar = pendFundo.reduce((s, r) => s + Number(r.valor), 0);
  let acum = Number(fundo.saldo_inicial) + (de ? 0 : 0);
  const ORIGEM = { transferencia: 'Transferência', reposicao: 'Reposição', despesa_fundo: 'Despesa', adiantamento: 'Adiantamento entregue', devolucao: 'Devolução', ajuste: 'Ajuste', baixa: 'Pagamento' };
  tela.innerHTML = `
    <div class="topo"><div><h1>Fundo Fixo</h1><p class="sub">Responsável: ${esc(fundo.responsavel_nome || '—')}${fundo.chave_pix ? ' · Pix ' + esc(fundo.chave_pix) : ''}</p></div>
      <div class="acoes">${editaFin() ? `<a class="btn prim" href="#/reembolsos/novo?custeio=fundo_fixo">+ Despesa paga pelo fundo</a>
        <a class="btn" href="#/adiantamentos/novo">+ Adiantamento</a><button class="btn ok" id="repor">Repor o fundo</button>` : ''}</div></div>
    <div class="grade" style="margin-bottom:16px">
      <div class="cartao kpi"><div class="n">${brl(saldo)}</div><div class="r">saldo do fundo</div></div>
      <div class="cartao kpi ${adts.some(adtVencido) ? 'alerta' : ''}"><div class="n">${brl(comColab)}</div><div class="r">${adts.length} adiantamento(s) com colaboradores</div></div>
      <a class="cartao kpi ${aAprovar ? 'alerta' : ''}" href="#/aprovacoes"><div class="n">${brl(aAprovar)}</div><div class="r">${pendFundo.length} despesa(s) do fundo aguardando aprovação</div></a>
    </div>
    ${adts.length ? `<div class="cartao"><h2>Adiantamentos em aberto</h2>${tabelaAdts(adts)}</div>` : ''}
    <div class="cartao"><div class="topo" style="margin:0 0 8px"><h2 style="margin:0">Extrato do fundo</h2>
      <form class="filtros" id="filtros" style="margin:0"><input type="date" name="de" value="${de}" aria-label="De"><input type="date" name="ate" value="${ate}" aria-label="Até"><button class="btn peq">Filtrar</button></form></div>
      ${movs.length ? `<div class="tabela-wrap"><table class="responsiva"><thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th class="num">Entrada</th><th class="num">Saída</th></tr></thead><tbody>
      ${movs.map(m => `<tr ${m.entidade === 'reembolso' ? `class="clicavel" onclick="location.hash='#/reembolsos/ver/${m.entidade_id}'"` : m.entidade === 'adiantamento' ? `class="clicavel" onclick="location.hash='#/adiantamentos/ver/${m.entidade_id}'"` : ''}>
        <td data-r="Data" class="nowrap">${dataBR(m.data)}</td><td data-r="Tipo">${esc(ORIGEM[m.origem] || m.origem)}</td><td data-r="Descrição">${esc(m.descricao || '')}</td>
        <td data-r="Entrada" class="num">${m.valor > 0 ? brl(m.valor) : ''}</td><td data-r="Saída" class="num">${m.valor < 0 ? brl(-m.valor) : ''}</td></tr>`).join('')}
      </tbody><tfoot><tr><td colspan="3">Movimento do período</td><td class="num">${brl(movs.filter(m => m.valor > 0).reduce((s, m) => s + Number(m.valor), 0))}</td><td class="num">${brl(-movs.filter(m => m.valor < 0).reduce((s, m) => s + Number(m.valor), 0))}</td></tr></tfoot></table></div>`
      : '<div class="vazio">Sem movimentos no período.</div>'}</div>`;
  $('#filtros').onsubmit = e => { e.preventDefault(); const d = formDados(e.target);
    location.hash = '#/financeiro/fundo?' + new URLSearchParams(Object.entries(d).filter(([, v]) => v)).toString(); };
  $('#repor')?.addEventListener('click', async () => {
    const r = await modal(`<form><h2>Repor o Fundo Fixo</h2><div class="form">
      <label class="campo">Data<input type="date" name="data" value="${hojeISO()}" required></label>
      <label class="campo">Valor (R$)<input name="valor" inputmode="decimal" required></label>
      <label class="campo">Saiu de<select name="conta" required>${bs.filter(b => b.tipo !== 'fundo_fixo').map(b => `<option value="${b.id}" ${b.tipo === 'corrente' ? 'selected' : ''}>${esc(b.nome)}</option>`).join('')}</select></label>
      <label class="campo">Forma<select name="forma">${FORMAS_DIN.map(x => `<option>${x}</option>`).join('')}</select></label>
      <label class="campo largo">Observação<input name="obs" placeholder="Ex.: reposição das despesas de 01 a 15/10"></label>
      <label class="campo largo">Comprovante (obrigatório, exceto dinheiro)<input type="file" name="arquivos" accept="image/*,application/pdf" multiple></label></div>
      <div class="rodape"><button type="button" class="btn" data-fechar>Voltar</button><button class="btn ok">Repor</button></div></form>`,
      { validar: d => !(num(d.valor) > 0) ? 'Informe o valor.' : d.forma !== 'Dinheiro' && !d.arquivos.length ? 'Anexe o comprovante. Só dinheiro dispensa comprovante.' : null });
    if (!r) return;
    try { const mov = await api.rpc('repor_fundo', { p_data: r.data, p_valor: num(r.valor), p_conta_origem: r.conta, p_forma: r.forma, p_obs: r.obs || null });
          await anexar('reposicao', mov, r.arquivos); aviso('Reposição registrada.'); navegar(); } catch (err) { falha(err); }
  });
});
