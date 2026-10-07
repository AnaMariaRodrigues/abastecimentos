// Verbo Gestão — Importação dos reembolsos do sistema anterior (Claude)
'use strict';

async function sha256Hex(arquivo) {
  const h = await crypto.subtle.digest('SHA-256', await arquivo.arrayBuffer());
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function resumoLegado(itens, chave) {
  const m = {};
  for (const i of itens) { const k = chave(i); (m[k] ||= { q: 0, v: 0 }); m[k].q++; m[k].v += Number(i.valor); }
  return m;
}

async function conferirLegado(man) {
  const linhas = await api.listar('reembolsos', 'select=id,id_legado,valor,status,data_despesa,colaborador_nome&origem=eq.legado_claude&limit=2000');
  const ids = linhas.map(l => l.id);
  let anexos = [];
  for (let i = 0; i < ids.length; i += 80)
    anexos = anexos.concat(await api.listar('anexos', `select=entidade_id,caminho_arquivo&entidade=eq.reembolso&cancelado_em=is.null&entidade_id=${lista(ids.slice(i, i + 80))}`));
  const legadoAnexos = anexos.filter(a => /\/legado-/.test(a.caminho_arquivo));
  const st = s => (s === 'pago' ? 'pago' : 'pendente');
  const linhasConf = [];
  const add = (rotulo, a, b, fmt = x => x) => linhasConf.push([rotulo, fmt(a), fmt(b), Math.abs(Number(a) - Number(b)) < 0.005]);
  add('Lançamentos', man.itens.length, linhas.length);
  add('Valor total', man.itens.reduce((s, i) => s + i.valor, 0), linhas.reduce((s, l) => s + Number(l.valor), 0), brl);
  const porMesA = resumoLegado(man.itens, i => i.data.slice(0, 7)), porMesB = resumoLegado(linhas, l => l.data_despesa.slice(0, 7));
  for (const k of new Set([...Object.keys(porMesA), ...Object.keys(porMesB)]))
    add('Mês ' + k.split('-').reverse().join('/'), porMesA[k]?.v || 0, porMesB[k]?.v || 0, brl);
  const porColA = resumoLegado(man.itens, i => i.colaborador), porColB = resumoLegado(linhas, l => l.colaborador_nome);
  for (const k of new Set([...Object.keys(porColA), ...Object.keys(porColB)]))
    add(k, porColA[k]?.v || 0, porColB[k]?.v || 0, brl);
  const porStA = resumoLegado(man.itens, i => i.situacao), porStB = resumoLegado(linhas, l => st(l.status));
  for (const k of ['pendente', 'pago']) add(k === 'pago' ? 'Pagos (no sistema anterior)' : 'Pendentes → Aprovações', porStA[k]?.v || 0, porStB[k]?.v || 0, brl);
  add('Comprovantes', man.anexos.length, legadoAnexos.length);
  return linhasConf;
}

function tabelaConferencia(l) {
  const ok = l.every(x => x[3]);
  return `<div class="cartao"><h2>${ok ? '✅ Conciliação fechada' : '⚠️ Há diferenças'}</h2>
    <div class="tabela-wrap"><table class="conferencia"><thead><tr><th>Item</th><th class="num">Sistema anterior</th><th class="num">Verbo Gestão</th><th></th></tr></thead>
    <tbody>${l.map(([r, a, b, k]) => `<tr><td>${esc(r)}</td><td class="num">${a}</td><td class="num">${b}</td><td class="${k ? 'ok' : 'erro'}">${k ? '✓' : '✗'}</td></tr>`).join('')}</tbody></table></div></div>`;
}

rota('/config/importar', async tela => {
  if (!tem('administrador')) { tela.innerHTML = '<div class="cartao vazio">Somente o administrador.</div>'; return; }
  const bancos = await api.listar('contas_bancarias', 'select=id,nome,tipo&ativo=eq.true&order=nome').catch(() => api.listar('contas_bancarias', 'select=id,nome,tipo&order=nome'));
  tela.innerHTML = `
    <div class="topo"><div><h1>Importar sistema anterior</h1><p class="sub">Reembolsos lançados no app antigo, com os comprovantes</p></div></div>
    <div class="cartao form">
      <p class="largo">Selecione a pasta <b>Verbo - migracao reembolsos</b> (ela tem o arquivo <b>manifesto.json</b> e a pasta de comprovantes).
        Nada é enviado antes de você conferir o resumo. Pode repetir: o que já foi importado é ignorado.</p>
      <label class="campo largo">Pasta da migração<input type="file" id="pasta" webkitdirectory directory multiple></label>
      <label class="campo">Conta usada nos pagamentos já feitos<select id="banco">${bancos.map(b => `<option value="${b.id}" ${b.tipo === 'corrente' ? 'selected' : ''}>${esc(b.nome)}</option>`).join('')}</select></label>
    </div>
    <div id="previa"></div><div id="resultado"></div>`;

  let man = null, arquivos = {};
  $('#pasta').onchange = async e => {
    const fs = [...e.target.files];
    const mf = fs.find(f => f.name === 'manifesto.json');
    if (!mf) return aviso('Não encontrei o manifesto.json nessa pasta.', true);
    man = JSON.parse(await mf.text());
    arquivos = Object.fromEntries(fs.map(f => [f.name, f]));
    $('#previa').innerHTML = '<div class="cartao">Conferindo os comprovantes…</div>';
    const faltam = [], diferentes = [];
    for (const a of man.anexos) {
      const f = arquivos[a.arquivo];
      if (!f) faltam.push(a.arquivo);
      else if (await sha256Hex(f) !== a.sha256) diferentes.push(a.arquivo);
    }
    const porSt = resumoLegado(man.itens, i => i.situacao), porCol = resumoLegado(man.itens, i => i.colaborador);
    const total = man.itens.reduce((s, i) => s + i.valor, 0);
    const okArq = !faltam.length && !diferentes.length;
    $('#previa').innerHTML = `<div class="cartao">
      <h2>Resumo do que será importado</h2>
      <ul class="lista-simples">
        <li><span>Lançamentos</span><b>${man.itens.length} · ${brl(total)}</b></li>
        <li><span>Pendentes (vão para Aprovações)</span><b>${porSt.pendente?.q || 0} · ${brl(porSt.pendente?.v || 0)}</b></li>
        <li><span>Já pagos (entram pagos, com baixa na data original)</span><b>${porSt.pago?.q || 0} · ${brl(porSt.pago?.v || 0)}</b></li>
        ${Object.entries(porCol).map(([k, v]) => `<li><span>${esc(k)}</span><span>${v.q} · ${brl(v.v)}</span></li>`).join('')}
        <li><span>Comprovantes</span><b>${man.anexos.length - faltam.length - diferentes.length} de ${man.anexos.length} conferidos</b></li>
      </ul>
      ${okArq ? '' : `<p class="erro">Faltando: ${faltam.map(esc).join(', ') || '—'} · Diferentes: ${diferentes.map(esc).join(', ') || '—'}</p>`}
      <div class="acoes"><button class="btn prim" id="importar" ${okArq ? '' : 'disabled'}>Importar agora</button></div></div>`;
    $('#importar').onclick = e2 => ocupado(e2.target, () => importar(man));
  };

  async function importar(man) {
    const res = $('#resultado');
    res.innerHTML = `<div class="cartao"><div id="etapa">Gravando lançamentos…</div><div class="progresso"><div id="barra"></div></div></div>`;
    try {
      const r = await api.rpc('importar_reembolsos_legado', { p_itens: man.itens, p_conta_bancaria: $('#banco').value });
      const mapa = r.mapa;
      const ids = [...new Set(Object.values(mapa))];
      let existentes = [];
      for (let i = 0; i < ids.length; i += 80)
        existentes = existentes.concat(await api.listar('anexos', `select=caminho_arquivo&entidade=eq.reembolso&entidade_id=${lista(ids.slice(i, i + 80))}`));
      const ja = new Set(existentes.map(a => a.caminho_arquivo));
      let n = 0, enviados = 0;
      for (const a of man.anexos) {
        n++;
        $('#etapa').textContent = `Enviando comprovantes ${n} de ${man.anexos.length}…`;
        $('#barra').style.width = Math.round(100 * n / man.anexos.length) + '%';
        const id = mapa[a.id_legado];
        const caminho = `reembolso/${id}/legado-${a.arquivo}`;
        if (ja.has(caminho)) continue;
        const f = arquivos[a.arquivo];
        try { await api.enviarArquivo(caminho, new File([f], a.arquivo, { type: a.tipo })); }
        catch (err) { if (!(err.status === 409 || err.status === 400 && /exists|Duplicate/i.test(JSON.stringify(err.data)))) throw err; }
        await api.inserir('anexos', { entidade: 'reembolso', entidade_id: id, caminho_arquivo: caminho, nome_original: a.nome,
                                      tipo_mime: a.tipo, tamanho_bytes: a.tamanho, descricao: 'Sistema anterior', enviado_por: estado.usuario.id });
        enviados++;
      }
      $('#etapa').textContent = `Concluído: ${r.novos} lançamento(s) novo(s), ${r.ignorados} já existiam, ${enviados} comprovante(s) enviado(s).`;
      res.insertAdjacentHTML('beforeend', tabelaConferencia(await conferirLegado(man)));
    } catch (err) { $('#etapa').textContent = 'Parou com erro — pode repetir, o que já entrou é ignorado.'; falha(err); }
  }
});
