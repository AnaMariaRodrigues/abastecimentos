/* Verbo Logística · Painel do gestor de abastecimentos */
(function(){
"use strict";
const CFG=window.VERBO_CFG||{};
const API=CFG.API_URL||"";const CONFIGURADO=/^(https:\/\/|http:\/\/(localhost|127\.))/.test(API);
const FUEIS=["Diesel S10","Diesel S500","Gasolina comum","Gasolina aditivada","Etanol","GNV","ARLA 32"];
const NAO_COMB="ARLA 32"; // não entra no cálculo de consumo
const MES=["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
const WD=["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const brl=new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"});
const brl3=v=>"R$ "+Number(v).toLocaleString("pt-BR",{minimumFractionDigits:3,maximumFractionDigits:3});
const nf=(v,d=0)=>Number(v).toLocaleString("pt-BR",{minimumFractionDigits:d,maximumFractionDigits:d});
const brlc=v=>{const a=Math.abs(v);if(a>=1e6)return "R$ "+nf(v/1e6,1)+" mi";if(a>=1e5)return "R$ "+nf(v/1e3,0)+" mil";return brl.format(v)};
const pad=n=>String(n).padStart(2,"0");
const iso=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const pd=s=>{const [y,m,d]=s.split("-").map(Number);return new Date(y,m-1,d)};
const today=()=>iso(new Date());
const fmtD=s=>s?`${s.slice(8,10)}/${s.slice(5,7)}/${s.slice(0,4)}`:"—";
const fmtPlaca=p=>{p=String(p||"");return p.length===7?p.slice(0,3)+"-"+p.slice(3):p};
const css=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const sum=(a,f)=>a.reduce((s,x)=>s+(Number(f(x))||0),0);
const median=a=>{if(!a.length)return 0;const s=[...a].sort((x,y)=>x-y),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2};
const sortPt=a=>[...a].sort((x,y)=>String(x).localeCompare(String(y),"pt-BR"));
function ls(k,v){try{if(v===undefined)return localStorage.getItem(k);if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v)}catch(e){return null}}
function ss(k,v){try{if(v===undefined)return sessionStorage.getItem(k);if(v===null)sessionStorage.removeItem(k);else sessionStorage.setItem(k,v)}catch(e){return null}}
function toast(m){const t=document.createElement("div");t.className="toast";t.textContent=m;document.body.appendChild(t);setTimeout(()=>t.remove(),3000)}
function parseNum(s){s=String(s??"").trim().replace(/R\$|\s/g,"");if(!s)return NaN;if(s.includes(","))s=s.replace(/\./g,"").replace(",",".");return Number(s)}

const S={key:null,demo:false,items:[],cad:[],planilha:"",agora:null,tab:ls("verbo.g.tab")||"dash",
  f:{q:"",mes:"",mot:"",pla:"",com:"",pos:""},r:{per:"mes",de:"",ate:"",pla:"",mot:"",com:"",pos:""},
  gran:"auto",fuelPosto:"",charts:{},fotos:{},edit:null,cadEdit:null,loading:false,err:null};

/* ---------------- API ---------------- */
async function api(body){
  const r=await fetch(API,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({...body,k:S.key})});
  const j=await r.json();if(!j.ok)throw new Error(j.erro||"Erro no servidor");return j;
}
async function carregar(silencioso){
  if(S.demo){S.items=demo();S.cad=cadDe(S.items);S.agora=new Date().toISOString();renderAll();return}
  if(S.loading)return;S.loading=true;$("#upd").innerHTML=`<span class="spin"></span> carregando`;
  try{const j=await api({a:"list"});S.items=(j.itens||[]).map(norm);S.cad=j.cadastros||[];S.planilha=j.planilha||"";S.agora=j.agora;S.err=null}
  catch(e){S.err=e.message==="Senha incorreta"?null:"Não foi possível atualizar: "+e.message;if(e.message==="Senha incorreta"){sair();return}}
  finally{S.loading=false}
  renderAll();
}
function norm(x){return {...x,litros:Number(x.litros)||0,valor:Number(x.valor)||0,km:x.km===""||x.km==null?null:Number(x.km),precoLitro:Number(x.precoLitro)||(x.litros?x.valor/x.litros:0)}}
function cadDe(items){const c=[];const add=(t,n,d)=>{if(n&&!c.some(x=>x.tipo===t&&x.nome===n))c.push({tipo:t,nome:n,detalhe:d||"",ativo:true})};items.forEach(i=>{add("Motorista",i.motorista);add("Veículo",i.placa,i.modelo);add("Posto",i.posto)});return c}

/* ---------------- Login ---------------- */
function mostrar(app){$("#vLogin").hidden=app;$("#vApp").hidden=!app}
$("#frmLogin").addEventListener("submit",async e=>{
  e.preventDefault();const k=$("#inSenha").value;const er=$("#loginErr");er.hidden=true;
  if(!CONFIGURADO){er.hidden=false;er.textContent="O config.js ainda não tem a URL do Apps Script. Use os dados de exemplo ou conclua a instalação.";return}
  const b=$("#btnLogin");b.disabled=true;b.innerHTML=`<span class="spin"></span> Entrando…`;
  try{S.key=k;await api({a:"login"});
    if($("#chkLembrar").checked)ls("verbo.g.k",k);else ss("verbo.g.k",k);
    S.demo=false;mostrar(true);setTab(S.tab);await carregar();
  }catch(x){er.hidden=false;er.textContent=x.message==="Failed to fetch"?"Sem conexão com o servidor. Verifique a internet e a URL no config.js.":x.message;S.key=null}
  finally{b.disabled=false;b.textContent="Entrar"}
});
$("#btnDemo").onclick=()=>{S.demo=true;S.r.per="3m";mostrar(true);setTab("dash");carregar()};
function sair(){ls("verbo.g.k",null);ss("verbo.g.k",null);S.key=null;S.demo=false;S.items=[];destroyCharts();mostrar(false);setTimeout(()=>$("#inSenha").focus(),50)}
$("#btnSair").onclick=sair;
$("#btnRefresh").onclick=()=>carregar();
if(CFG.REEMBOLSOS_URL)$("#lnkReemb").href=CFG.REEMBOLSOS_URL;else $("#lnkReemb").hidden=true;

/* ---------------- Tabs ---------------- */
document.querySelectorAll(".tab[data-tab]").forEach(b=>b.addEventListener("click",()=>setTab(b.dataset.tab)));
function setTab(t){
  S.tab=t;ls("verbo.g.tab",t);
  document.querySelectorAll(".tab[data-tab]").forEach(b=>b.setAttribute("aria-selected",String(b.dataset.tab===t)));
  ["lanc","dash","cad"].forEach(v=>$("#view-"+v).hidden=v!==t);
  renderAll();
}
function renderAll(){
  renderBanners();refreshSelects();
  $("#upd").textContent=S.agora?"Atualizado "+new Date(S.agora).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}):"—";
  const pl=$("#lnkPlan");pl.hidden=!S.planilha;if(S.planilha)pl.href=S.planilha;
  if(S.tab==="lanc")renderList();else if(S.tab==="dash")renderDash();else renderCad();
}
function renderBanners(){
  let h="";
  if(S.demo)h+=`<div class="banner demo"><b>Dados de exemplo</b><span>Lançamentos fictícios para você conhecer o painel. Nada disso está salvo.</span><button class="btn sm" type="button" id="exitDemo">Sair do exemplo</button></div>`;
  if(S.err)h+=`<div class="banner err"><b>Atenção</b><span>${esc(S.err)}</span></div>`;
  $("#banners").innerHTML=h;const x=$("#exitDemo");if(x)x.onclick=sair;
}

/* ---------------- Selects ---------------- */
const uniq=f=>sortPt([...new Set(S.items.map(f).filter(Boolean))]);
function fillSel(el,opts,lab){const v=el.value;const first=el.options[0].outerHTML;el.innerHTML=first+opts.map(o=>`<option value="${esc(o)}">${esc(lab?lab(o):o)}</option>`).join("");if(opts.includes(v))el.value=v}
function refreshSelects(){
  const mot=uniq(i=>i.motorista),pla=uniq(i=>i.placa),pos=uniq(i=>i.posto);
  const com=[...FUEIS.filter(f=>S.items.some(i=>i.combustivel===f)),...uniq(i=>i.combustivel).filter(f=>!FUEIS.includes(f))];
  const modelo=p=>{const i=S.items.find(x=>x.placa===p&&x.modelo);return fmtPlaca(p)+(i?" · "+i.modelo:"")};
  fillSel($("#fMot"),mot);fillSel($("#rMot"),mot);fillSel($("#fPla"),pla,modelo);fillSel($("#rPla"),pla,modelo);
  fillSel($("#fCom"),com);fillSel($("#rCom"),com);fillSel($("#fPos"),pos);fillSel($("#rPos"),pos);
}
const fuelColor=f=>{const i=FUEIS.indexOf(f);return css("--c"+((i<0?7:i)%8+1))};

/* ================= LANÇAMENTOS ================= */
const fmap={fQ:"q",fMes:"mes",fMot:"mot",fPla:"pla",fCom:"com",fPos:"pos"};
Object.keys(fmap).forEach(id=>$("#"+id).addEventListener("input",e=>{S.f[fmap[id]]=e.target.value;renderList()}));
function listFiltered(){
  const f=S.f,q=f.q.trim().toLowerCase();
  return S.items.filter(i=>(!f.mes||i.data.startsWith(f.mes))&&(!f.mot||i.motorista===f.mot)&&(!f.pla||i.placa===f.pla)&&(!f.com||i.combustivel===f.com)&&(!f.pos||i.posto===f.pos)
    &&(!q||[i.motorista,i.placa,fmtPlaca(i.placa),i.modelo,i.posto,i.combustivel,i.obs].join(" ").toLowerCase().includes(q)))
    .sort((a,b)=>b.data.localeCompare(a.data)||String(b.criadoEm||"").localeCompare(String(a.criadoEm||"")));
}
function renderList(){
  if(!S.items.length){$("#strip").hidden=true;$("#listWrap").style.borderRadius="var(--r)";
    $("#listWrap").innerHTML=`<div class="empty"><h3>${S.loading?"Carregando…":"Nenhum abastecimento recebido ainda"}</h3><p>Assim que um condutor salvar um abastecimento no app (e tiver internet), ele aparece aqui automaticamente. Use <b>Atualizar</b> no topo para buscar novidades.</p></div>`;return}
  $("#strip").hidden=false;$("#listWrap").style.borderRadius="";
  const L=listFiltered();const lit=sum(L,i=>i.litros),val=sum(L,i=>i.valor);
  $("#strip").innerHTML=`<div><small>Abastecimentos</small><strong>${L.length}</strong></div><div><small>Litros</small><strong>${nf(lit,1)} L</strong></div><div><small>Valor total</small><strong>${brl.format(val)}</strong></div><div><small>Preço médio / L</small><strong>${lit?brl3(val/lit):"—"}</strong></div>`;
  if(!L.length){$("#listWrap").innerHTML=`<div class="empty"><h3>Nenhum lançamento com esses filtros</h3><p>Ajuste a busca ou limpe os filtros.</p></div>`;return}
  const flags=alertIds(S.items);
  $("#listWrap").innerHTML=`<table><thead><tr><th>Data</th><th>Motorista</th><th>Veículo</th><th class="hide-sm">Posto</th><th>Combustível</th><th class="r">Litros</th><th class="r hide-sm">R$/L</th><th class="r">Valor</th><th class="r hide-sm">Hodômetro</th><th class="hide-sm">Foto</th></tr></thead><tbody>`+
    L.map(i=>`<tr class="row" data-id="${esc(i.id)}"><td class="num">${fmtD(i.data)}</td><td><b style="font-weight:600">${esc(i.motorista)}</b></td>
      <td><span class="plate">${esc(fmtPlaca(i.placa))}</span>${i.modelo?`<div class="sub">${esc(i.modelo)}</div>`:""}</td>
      <td class="hide-sm">${esc(i.posto)}</td><td><span class="fuel"><i style="background:${fuelColor(i.combustivel)}"></i>${esc(i.combustivel)}</span></td>
      <td class="r num">${nf(i.litros,2)}</td><td class="r num hide-sm">${brl3(i.precoLitro)}${flags[i.id]?`<span class="flag" title="${esc(flags[i.id])}">!</span>`:""}</td>
      <td class="r num"><b style="font-weight:600">${brl.format(i.valor)}</b></td><td class="r num hide-sm">${i.km!=null?nf(i.km):"<span class='sub'>—</span>"}</td>
      <td class="hide-sm">${i.fotoId?`<span class="clip">📎 ver</span>`:`<span class="clip none">sem foto</span>`}</td></tr>`).join("")+`</tbody></table>`;
}
$("#listWrap").addEventListener("click",e=>{const tr=e.target.closest("tr.row");if(tr)openDrawer(S.items.find(i=>i.id===tr.dataset.id))});
$("#btnCsv").onclick=()=>{
  const L=listFiltered();const H=["Data","Motorista","Placa","Modelo","Posto","Combustível","Litros","Valor (R$)","Preço/L (R$)","Hodômetro (km)","Observação","Foto"];
  const q=v=>{v=String(v??"");return /[;"\n]/.test(v)?`"${v.replace(/"/g,'""')}"`:v};
  const n=(v,d)=>v==null||v===""?"":Number(v).toFixed(d).replace(".",",");
  const rows=L.map(i=>[fmtD(i.data),i.motorista,i.placa,i.modelo,i.posto,i.combustivel,n(i.litros,3),n(i.valor,2),n(i.precoLitro,3),i.km??"",i.obs,i.fotoUrl||""].map(q).join(";"));
  const blob=new Blob(["﻿"+[H.join(";"),...rows].join("\r\n")],{type:"text/csv;charset=utf-8"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`abastecimentos-verbo-${today()}.csv`;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500);
};

/* ---------------- Drawer ---------------- */
function opts(list,v){const l=v&&!list.includes(v)?[...list,v]:list;return l.map(o=>`<option ${o===v?"selected":""}>${esc(o)}</option>`).join("")}
function openDrawer(it){
  if(!it)return;S.edit=it;
  const flags=alertIds(S.items)[it.id];
  $("#drawerHost").innerHTML=`<div class="scrim" data-close></div>
  <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="dT">
    <header><div><div class="eyebrow">Abastecimento · ${fmtD(it.data)}</div><h2 id="dT">${esc(it.motorista)} · ${esc(fmtPlaca(it.placa))}</h2></div><button class="btn sm" type="button" data-close>Fechar</button></header>
    <form class="body" id="frmE" novalidate>
      ${flags?`<div class="banner demo" style="margin:0"><b>Atenção</b><span>${esc(flags)}</span></div>`:""}
      <fieldset><legend>Comprovante</legend><div class="photo" id="ph">${it.fotoId?`<span><span class="spin"></span> carregando foto…</span>`:"Sem foto anexada"}</div>
        ${it.fotoUrl?`<a class="span2" href="${esc(it.fotoUrl)}" target="_blank" rel="noopener" style="font-size:13px;font-weight:600">Abrir no Google Drive ↗</a>`:""}</fieldset>
      <fieldset><legend>Dados do abastecimento</legend>
        <label class="f">Data<input class="in" type="date" id="e_data" value="${esc(it.data)}"></label>
        <label class="f">Motorista<input class="in" id="e_mot" value="${esc(it.motorista)}" list="dlM"><datalist id="dlM">${uniq(i=>i.motorista).map(n=>`<option value="${esc(n)}">`).join("")}</datalist></label>
        <label class="f">Placa<input class="in num" id="e_pla" value="${esc(it.placa)}" style="text-transform:uppercase"></label>
        <label class="f">Modelo<input class="in" id="e_mod" value="${esc(it.modelo)}"></label>
        <label class="f span2">Posto<input class="in" id="e_pos" value="${esc(it.posto)}" list="dlP"><datalist id="dlP">${uniq(i=>i.posto).map(n=>`<option value="${esc(n)}">`).join("")}</datalist></label>
        <label class="f">Combustível<select class="in" id="e_com">${opts(FUEIS,it.combustivel)}</select></label>
        <label class="f">Hodômetro (km)<input class="in num" id="e_km" inputmode="numeric" value="${it.km??""}"></label>
        <label class="f">Litros<input class="in num" id="e_lit" inputmode="decimal" value="${nf(it.litros,3)}"></label>
        <label class="f">Valor (R$)<input class="in num" id="e_val" inputmode="decimal" value="${nf(it.valor,2)}"></label>
        <label class="f span2">Observação<textarea class="in" id="e_obs" rows="2">${esc(it.obs||"")}</textarea></label>
        <div class="span2 sub">Preço por litro: <b class="num" id="e_pl">${brl3(it.precoLitro)}</b> · Registrado no celular em ${it.criadoEm?new Date(it.criadoEm).toLocaleString("pt-BR"):"—"} · Recebido em ${it.recebidoEm?new Date(it.recebidoEm).toLocaleString("pt-BR"):"—"}${it.editadoEm?` · Editado em ${new Date(it.editadoEm).toLocaleString("pt-BR")}`:""}</div>
        <div class="span2 err-msg" id="eErr" hidden></div>
      </fieldset>
    </form>
    <footer><button class="btn danger" type="button" id="btnDel">Excluir</button><div class="actions"><button class="btn" type="button" data-close>Cancelar</button><button class="btn primary" type="submit" form="frmE" id="btnSv">Salvar alterações</button></div></footer>
  </aside>`;
  $("#drawerHost").querySelectorAll("[data-close]").forEach(b=>b.onclick=closeDrawer);
  document.addEventListener("keydown",escClose);
  ["#e_lit","#e_val"].forEach(s=>$(s).addEventListener("input",()=>{const l=parseNum($("#e_lit").value),v=parseNum($("#e_val").value);$("#e_pl").textContent=l>0&&v>0?brl3(v/l):"—"}));
  if(it.fotoId)loadFoto(it);
  $("#frmE").addEventListener("submit",async e=>{
    e.preventDefault();const er=$("#eErr");er.hidden=true;
    const rec={id:it.id,data:$("#e_data").value,motorista:$("#e_mot").value.trim(),placa:$("#e_pla").value.toUpperCase().replace(/[^A-Z0-9]/g,""),modelo:$("#e_mod").value.trim(),
      posto:$("#e_pos").value.trim(),combustivel:$("#e_com").value,km:$("#e_km").value.replace(/\D/g,"")?Number($("#e_km").value.replace(/\D/g,"")):"",
      litros:parseNum($("#e_lit").value),valor:parseNum($("#e_val").value),obs:$("#e_obs").value.trim()};
    if(!rec.data||!rec.motorista||!rec.placa||!rec.posto||!(rec.litros>0)||!(rec.valor>0)){er.hidden=false;er.textContent="Preencha data, motorista, placa, posto, litros e valor.";return}
    if(S.demo){Object.assign(it,norm({...it,...rec,precoLitro:rec.valor/rec.litros}));closeDrawer();renderAll();toast("Alterado (exemplo — não salvo)");return}
    const b=$("#btnSv");b.disabled=true;b.innerHTML=`<span class="spin"></span> Salvando…`;
    try{const j=await api({a:"upd",rec});Object.assign(it,norm(j.rec));closeDrawer();renderAll();toast("Alterações salvas na planilha")}
    catch(x){b.disabled=false;b.textContent="Salvar alterações";er.hidden=false;er.textContent=x.message}
  });
  const del=$("#btnDel");
  del.onclick=async()=>{
    if(!del.classList.contains("armed")){del.classList.add("armed");del.textContent="Confirmar exclusão";setTimeout(()=>{if(del.isConnected){del.classList.remove("armed");del.textContent="Excluir"}},4000);return}
    del.disabled=true;
    try{if(!S.demo)await api({a:"del",id:it.id});S.items=S.items.filter(x=>x!==it);closeDrawer();renderAll();toast("Lançamento excluído")}
    catch(x){del.disabled=false;toast("Não foi possível excluir: "+x.message)}
  };
}
async function loadFoto(it){
  const ph=()=>$("#ph");
  try{
    if(S.demo)throw new Error("demo");
    let src=S.fotos[it.fotoId];
    if(!src){const j=await api({a:"foto",fotoId:it.fotoId});src=S.fotos[it.fotoId]=`data:${j.mime};base64,${j.b64}`}
    if(S.edit!==it||!ph())return;
    ph().innerHTML=`<img src="${src}" alt="Comprovante">`;ph().querySelector("img").onclick=()=>openLb(src);
  }catch(e){if(ph())ph().textContent=S.demo?"(foto ilustrativa indisponível nos dados de exemplo)":"Não foi possível carregar a foto. Use o link do Drive."}
}
function openLb(src){$("#lbHost").innerHTML=`<div class="lb"><img src="${src}" alt="Comprovante"><button type="button">Fechar</button></div>`;$("#lbHost .lb").onclick=closeLb}
function closeLb(){$("#lbHost").innerHTML=""}
function escClose(e){if(e.key==="Escape"){if($("#lbHost").innerHTML)closeLb();else closeDrawer()}}
function closeDrawer(){$("#drawerHost").innerHTML="";S.edit=null;document.removeEventListener("keydown",escClose)}

/* ================= ANÁLISES ================= */
// Consumo: por veículo, em ordem cronológica; soma os litros desde a última leitura de hodômetro.
function consumo(items){
  const by={};items.filter(i=>i.combustivel!==NAO_COMB).forEach(i=>(by[i.placa]=by[i.placa]||[]).push(i));
  const out={};const trechos=[];
  Object.entries(by).forEach(([p,arr])=>{
    arr.sort((a,b)=>a.data.localeCompare(b.data)||(a.km??0)-(b.km??0)||String(a.criadoEm).localeCompare(String(b.criadoEm)));
    let last=null,accL=0,accV=0,km=0,L=0,V=0;
    arr.forEach(i=>{
      if(last!=null){accL+=i.litros;accV+=i.valor}
      if(i.km!=null){
        if(last!=null){const d=i.km-last.km;
          if(d>0&&d<10000&&accL>0){km+=d;L+=accL;V+=accV;trechos.push({placa:p,item:i,km:d,litros:accL,kml:d/accL})}
          else if(d<=0)trechos.push({placa:p,item:i,inconsistente:true,ant:last.km});
        }
        last=i;accL=0;accV=0;
      }
    });
    out[p]={km,litros:L,valor:V,kml:L?km/L:null,rpkm:km?V/km:null};
  });
  return {porVeiculo:out,trechos};
}
function alertas(items){
  const A=[];
  // preço acima da mediana do combustível
  const porC={};items.forEach(i=>(porC[i.combustivel]=porC[i.combustivel]||[]).push(i.precoLitro));
  const med={};Object.entries(porC).forEach(([c,a])=>med[c]=median(a));
  items.forEach(i=>{const m=med[i.combustivel];if(porC[i.combustivel].length>=4&&m&&i.precoLitro>m*1.08)A.push({t:"w",id:i.id,ord:1,txt:`Preço ${nf((i.precoLitro/m-1)*100,0)}% acima da mediana de ${i.combustivel}`,sub:`${brl3(i.precoLitro)}/L em ${i.posto} · ${fmtPlaca(i.placa)} · ${fmtD(i.data)} (mediana ${brl3(m)})`})});
  // mais de um abastecimento do mesmo veículo no mesmo dia
  const dia={};items.filter(i=>i.combustivel!==NAO_COMB).forEach(i=>{const k=i.placa+"|"+i.data;(dia[k]=dia[k]||[]).push(i)});
  Object.values(dia).filter(a=>a.length>1).forEach(a=>a.forEach(i=>A.push({t:"b",id:i.id,ord:0,txt:`${fmtPlaca(i.placa)} abasteceu ${a.length}× no mesmo dia`,sub:`${fmtD(i.data)} · ${i.motorista} · ${nf(i.litros,1)} L em ${i.posto} — confira se não é lançamento duplicado`})));
  // hodômetro e consumo
  const c=consumo(items);
  const kmlV={};Object.entries(c.porVeiculo).forEach(([p,v])=>kmlV[p]=v.kml);
  c.trechos.forEach(t=>{
    if(t.inconsistente)A.push({t:"b",id:t.item.id,ord:0,txt:`Hodômetro menor ou igual ao anterior — ${fmtPlaca(t.placa)}`,sub:`${nf(t.item.km)} km em ${fmtD(t.item.data)} (anterior ${nf(t.ant)} km) · ${t.item.motorista}`});
    else{const m=kmlV[t.placa];if(m&&t.kml<m*0.6&&t.litros>20)A.push({t:"w",id:t.item.id,ord:1,txt:`Consumo baixo no trecho — ${fmtPlaca(t.placa)}`,sub:`${nf(t.kml,2)} km/L (média do veículo ${nf(m,2)}) · ${nf(t.km)} km com ${nf(t.litros,1)} L · ${fmtD(t.item.data)}`})}
  });
  const semKm=items.filter(i=>i.km==null&&i.combustivel!==NAO_COMB).length;
  if(semKm)A.push({t:"i",ord:2,txt:`${semKm} abastecimento${semKm>1?"s":""} sem hodômetro`,sub:"Peça aos condutores que informem o km — é o que permite medir consumo e custo por km."});
  const semFoto=items.filter(i=>!i.fotoId&&!S.demo).length;
  if(semFoto)A.push({t:"i",ord:2,txt:`${semFoto} lançamento${semFoto>1?"s":""} sem foto do comprovante`,sub:"Lançamentos editados ou antigos sem anexo."});
  return A.sort((a,b)=>a.ord-b.ord);
}
function alertIds(items){const m={};alertas(items).forEach(a=>{if(a.id&&!m[a.id])m[a.id]=a.txt});return m}

/* ================= DASHBOARD ================= */
const rmap={rPer:"per",rDe:"de",rAte:"ate",rPla:"pla",rMot:"mot",rCom:"com",rPos:"pos"};
Object.keys(rmap).forEach(id=>$("#"+id).addEventListener("input",e=>{S.r[rmap[id]]=e.target.value;if(id==="rDe"||id==="rAte"){S.r.per="custom";$("#rPer").value="custom"}renderDash()}));
function range(){
  const r=S.r,n=new Date(),y=n.getFullYear(),m=n.getMonth();
  const map={mes:[new Date(y,m,1),n],mesant:[new Date(y,m-1,1),new Date(y,m,0)],"30d":[new Date(y,m,n.getDate()-29),n],"3m":[new Date(y,m-2,1),n],"6m":[new Date(y,m-5,1),n],ano:[new Date(y,0,1),n]};
  if(r.per==="custom")return [r.de||"0000-01-01",r.ate||"9999-12-31"];
  if(r.per==="tudo"){const ds=S.items.map(i=>i.data).sort();return [ds[0]||today(),ds[ds.length-1]||today()]}
  const [a,b]=map[r.per];return [iso(a),iso(b)];
}
function prevRange([a,b]){if(S.r.per==="tudo"||a.startsWith("0000")||b.startsWith("9999"))return null;
  if(S.r.per==="mes"||S.r.per==="mesant"){const d=pd(a);const pa=new Date(d.getFullYear(),d.getMonth()-1,1);const days=Math.round((pd(b)-pd(a))/864e5);const pb=new Date(pa.getFullYear(),pa.getMonth(),Math.min(pa.getDate()+days,new Date(pa.getFullYear(),pa.getMonth()+1,0).getDate()));return [iso(pa),iso(pb)]}
  const len=Math.round((pd(b)-pd(a))/864e5)+1;const pb=new Date(pd(a).getTime()-864e5);const pa=new Date(pb.getTime()-(len-1)*864e5);return [iso(pa),iso(pb)]}
function dashFilter(rg){const r=S.r;return S.items.filter(i=>i.data>=rg[0]&&i.data<=rg[1]&&(!r.pla||i.placa===r.pla)&&(!r.mot||i.motorista===r.mot)&&(!r.com||i.combustivel===r.com)&&(!r.pos||i.posto===r.pos))}
function destroyCharts(){Object.values(S.charts).forEach(c=>{try{c.destroy()}catch(e){}});S.charts={}}
function group(arr,f){const m=new Map();arr.forEach(i=>{const k=f(i);if(!m.has(k))m.set(k,[]);m.get(k).push(i)});return m}
function delta(cur,prev,inverse){if(prev==null||!isFinite(prev)||prev===0||cur==null)return "";const d=(cur/prev-1)*100;if(Math.abs(d)<0.05)return `<span class="delta">= vs. período anterior</span>`;
  const up=d>0;const cls=(inverse?!up:up)?"up":"down";return `<span class="delta ${cls}">${up?"▲":"▼"} ${nf(Math.abs(d),1)}% vs. anterior</span>`}

function renderDash(){
  destroyCharts();
  const rg=range();const P=dashFilter(rg);const pr=prevRange(rg);const Q=pr?dashFilter(pr):null;
  $("#rDe").value=S.r.per==="custom"?S.r.de:rg[0];$("#rAte").value=S.r.per==="custom"?S.r.ate:rg[1];$("#rPer").value=S.r.per;
  $("#repPer").textContent=`${fmtD(rg[0]).replace(/^0000.*/,"início")} a ${fmtD(rg[1]).replace(/^31\/12\/9999/,"hoje")}`;
  $("#repGer").textContent=S.agora?new Date(S.agora).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"}):"—";
  const body=$("#dashBody");
  if(!S.items.length){body.innerHTML=`<div class="card"><div class="empty"><h3>${S.loading?"Carregando…":"Ainda não há abastecimentos"}</h3><p>O painel ganha vida assim que os primeiros lançamentos chegarem.</p></div></div>`;return}
  if(!P.length){body.innerHTML=`<div class="card"><div class="empty"><h3>Nenhum abastecimento neste período</h3><p>Escolha outro período ou limpe os filtros.</p><button class="btn" type="button" id="goAll">Ver todo o histórico</button></div></div>`;$("#goAll").onclick=()=>{S.r.per="tudo";renderDash()};return}

  const k=x=>{const fuel=x.filter(i=>i.combustivel!==NAO_COMB);const L=sum(fuel,i=>i.litros),V=sum(x,i=>i.valor),VF=sum(fuel,i=>i.valor);const c=consumo(x);const km=sum(Object.values(c.porVeiculo),v=>v.km),cl=sum(Object.values(c.porVeiculo),v=>v.litros),cv=sum(Object.values(c.porVeiculo),v=>v.valor);
    return {n:x.length,V,L,pm:L?VF/L:null,tk:x.length?V/x.length:null,km,kml:cl?km/cl:null,rpkm:km?cv/km:null,veic:new Set(x.map(i=>i.placa)).size}};
  const K=k(P),KQ=Q&&Q.length?k(Q):null;
  const days=Math.max(1,Math.round((pd(rg[1])-pd(rg[0]))/864e5)+1);

  /* insights */
  const ins=[];
  const byV=[...group(P,i=>i.placa)].map(([p,a])=>({p,v:sum(a,i=>i.valor),mod:a.find(i=>i.modelo)?.modelo||""})).sort((a,b)=>b.v-a.v);
  if(byV.length)ins.push(`<b>${esc(fmtPlaca(byV[0].p))}</b>${byV[0].mod?" ("+esc(byV[0].mod)+")":""} concentra <b>${nf(byV[0].v/K.V*100,0)}%</b> do gasto (${brl.format(byV[0].v)}).`);
  const fuelMain=[...group(P.filter(i=>i.combustivel!==NAO_COMB),i=>i.combustivel)].sort((a,b)=>sum(b[1],i=>i.litros)-sum(a[1],i=>i.litros))[0];
  if(fuelMain){const postos=[...group(fuelMain[1],i=>i.posto)].map(([p,a])=>({p,pm:sum(a,i=>i.valor)/sum(a,i=>i.litros),n:a.length})).sort((a,b)=>a.pm-b.pm);
    if(postos.length>1){const b=postos[0],w=postos[postos.length-1];ins.push(`${esc(fuelMain[0])}: posto mais barato <b>${esc(b.p)}</b> (${brl3(b.pm)}/L), mais caro ${esc(w.p)} (${brl3(w.pm)}/L) — diferença de <b>${nf((w.pm/b.pm-1)*100,1)}%</b>.`);
      const extra=sum(fuelMain[1],i=>Math.max(0,i.precoLitro-b.pm)*i.litros);if(extra>1)ins.push(`Se todo ${esc(fuelMain[0])} fosse comprado ao preço do posto mais barato, a economia seria de <b>${brl.format(extra)}</b> no período.`)}}
  if(KQ)ins.push(`Gasto ${K.V>=KQ.V?"subiu":"caiu"} <b>${nf(Math.abs(K.V/KQ.V-1)*100,1)}%</b> em relação ao período anterior (${brl.format(KQ.V)}).`);
  if(K.kml){const cv=consumo(P).porVeiculo;const best=Object.entries(cv).filter(([,v])=>v.kml).sort((a,b)=>b[1].kml-a[1].kml);if(best.length>1)ins.push(`Melhor consumo: <b>${esc(fmtPlaca(best[0][0]))}</b> com ${nf(best[0][1].kml,2)} km/L; pior: ${esc(fmtPlaca(best[best.length-1][0]))} com ${nf(best[best.length-1][1].kml,2)} km/L.`)}
  ins.push(`Média de <b>${brl.format(K.V/days)}</b> por dia e <b>${nf(K.n/days*7,1)}</b> abastecimentos por semana.`);
  const al=alertas(P);const nb=al.filter(a=>a.t!=="i").length;if(nb)ins.push(`<b>${nb}</b> ponto${nb>1?"s":""} de atenção para conferir (veja no fim do painel).`);

  /* fuel options for posto ranking */
  const fuelsP=[...group(P,i=>i.combustivel)].sort((a,b)=>sum(b[1],i=>i.litros)-sum(a[1],i=>i.litros)).map(x=>x[0]);
  if(!fuelsP.includes(S.fuelPosto))S.fuelPosto=fuelsP[0];

  body.innerHTML=`
  <div class="kpis">
    <div class="kpi hero"><small>Gasto total</small><strong>${brlc(K.V)}</strong>${KQ?delta(K.V,KQ.V):`<span class="sub">${K.veic} veículo${K.veic>1?"s":""}</span>`}</div>
    <div class="kpi"><small>Litros abastecidos</small><strong>${nf(K.L,0)} L</strong>${KQ?delta(K.L,KQ.L):""}</div>
    <div class="kpi"><small>Preço médio / litro</small><strong>${K.pm?brl3(K.pm):"—"}</strong>${KQ&&K.pm&&KQ.pm?delta(K.pm,KQ.pm):`<span class="sub">média ponderada</span>`}</div>
    <div class="kpi"><small>Abastecimentos</small><strong>${K.n}</strong><span class="sub">ticket médio ${brl.format(K.tk)}</span></div>
    <div class="kpi"><small>Consumo médio</small><strong>${K.kml?nf(K.kml,2)+" km/L":"—"}</strong><span class="sub">${K.km?nf(K.km)+" km medidos":"informe o hodômetro"}</span></div>
    <div class="kpi"><small>Custo por km</small><strong>${K.rpkm?brl3(K.rpkm):"—"}</strong>${KQ&&K.rpkm&&KQ.rpkm?delta(K.rpkm,KQ.rpkm):`<span class="sub">combustível / km rodado</span>`}</div>
  </div>
  <div class="insight"><div class="eyebrow">Destaques</div><ul>${ins.map(t=>`<li>${t}</li>`).join("")}</ul></div>
  <div class="grid">
    <div class="card s8"><div class="ch"><h3>Evolução do gasto e dos litros</h3><div class="seg" id="segG">${["auto","dia","semana","mes"].map(g=>`<button type="button" data-g="${g}" aria-pressed="${S.gran===g}">${{auto:"Auto",dia:"Dia",semana:"Semana",mes:"Mês"}[g]}</button>`).join("")}</div></div><div class="cv"><canvas id="chEvo"></canvas></div></div>
    <div class="card s4"><h3>Gasto por combustível</h3><div class="donut-wrap"><div class="cv"><canvas id="chMix"></canvas></div><div class="legend" id="lgMix"></div></div></div>
    <div class="card s6"><h3>Gasto por veículo</h3><p class="cap">Top 10 no período</p><div class="cv" id="cvV"><canvas id="chVei"></canvas></div></div>
    <div class="card s6"><h3>Gasto por motorista</h3><p class="cap">Top 10 no período</p><div class="cv" id="cvM"><canvas id="chMot"></canvas></div></div>
    <div class="card s6"><div class="ch"><h3>Ranking de postos · preço médio do litro</h3><div class="seg" id="segF">${fuelsP.filter(f=>f).slice(0,5).map(f=>`<button type="button" data-f="${esc(f)}" aria-pressed="${S.fuelPosto===f}">${esc(f)}</button>`).join("")}</div></div><div style="overflow-x:auto" id="tbPostos"></div></div>
    <div class="card s6"><h3>Preço do litro ao longo do tempo</h3><p class="cap">Média ponderada por ${granOf(rg)==="mes"?"mês":granOf(rg)==="semana"?"semana":"dia"}, por combustível</p><div class="cv"><canvas id="chPreco"></canvas></div></div>
    <div class="card s12"><h3>Eficiência da frota por veículo</h3><p class="cap">Consumo e custo por km usam os hodômetros informados (litros somados entre duas leituras). ARLA 32 entra no gasto, mas não no consumo.</p><div style="overflow-x:auto" id="tbFrota"></div></div>
    <div class="card s6"><h3>Abastecimentos por dia da semana</h3><div class="cv" style="height:230px"><canvas id="chWd"></canvas></div></div>
    <div class="card s6"><div class="ch"><h3>Pontos de atenção</h3><span class="sub">${al.length} item${al.length===1?"":"s"}</span></div><div class="alerts" id="alerts" style="max-height:320px;overflow-y:auto"></div></div>
  </div>`;

  $("#segG").onclick=e=>{const b=e.target.closest("button");if(b){S.gran=b.dataset.g;renderDash()}};
  const sf=$("#segF");if(sf)sf.onclick=e=>{const b=e.target.closest("button");if(b){S.fuelPosto=b.dataset.f;renderDash()}};

  Chart.defaults.font.family=css("--f-body").split(",")[0].replace(/"/g,"")||"sans-serif";
  Chart.defaults.color=css("--muted");Chart.defaults.borderColor=css("--line");
  const tip={backgroundColor:css("--ink"),titleColor:css("--bg"),bodyColor:css("--bg"),padding:10,cornerRadius:6,boxPadding:4};
  const C=[1,2,3,4,5,6,7,8].map(i=>css("--c"+i));

  /* evolução */
  const g=S.gran==="auto"?granOf(rg):S.gran;
  const buckets=bucketList(rg,g,P);const bk=i=>bucketKey(i.data,g);
  const gm=group(P,bk);
  S.charts.evo=new Chart($("#chEvo"),{data:{labels:buckets.map(b=>b.label),datasets:[
    {type:"bar",label:"Gasto (R$)",data:buckets.map(b=>sum(gm.get(b.key)||[],i=>i.valor)),backgroundColor:C[0],borderRadius:4,yAxisID:"y",order:2,maxBarThickness:42},
    {type:"line",label:"Litros",data:buckets.map(b=>sum((gm.get(b.key)||[]).filter(i=>i.combustivel!==NAO_COMB),i=>i.litros)),borderColor:C[1],backgroundColor:C[1],yAxisID:"y1",tension:.3,pointRadius:buckets.length>40?0:3,borderWidth:2.5,order:1}]},
    options:{maintainAspectRatio:false,interaction:{mode:"index",intersect:false},plugins:{legend:{position:"top",align:"end",labels:{boxWidth:10,boxHeight:10}},tooltip:{...tip,callbacks:{label:c=>c.dataset.yAxisID==="y"?` Gasto: ${brl.format(c.raw)}`:` Litros: ${nf(c.raw,1)} L`}}},
      scales:{x:{grid:{display:false},ticks:{maxRotation:0,autoSkip:true}},y:{beginAtZero:true,ticks:{callback:v=>brlc(v)}},y1:{beginAtZero:true,position:"right",grid:{display:false},ticks:{callback:v=>nf(v)+" L"}}}}});

  /* mix */
  const mix=[...group(P,i=>i.combustivel)].map(([f,a])=>({f,v:sum(a,i=>i.valor),l:sum(a,i=>i.litros)})).sort((a,b)=>b.v-a.v);
  S.charts.mix=new Chart($("#chMix"),{type:"doughnut",data:{labels:mix.map(m=>m.f),datasets:[{data:mix.map(m=>m.v),backgroundColor:mix.map(m=>fuelColor(m.f)),borderColor:css("--surface"),borderWidth:2}]},
    options:{maintainAspectRatio:false,cutout:"66%",plugins:{legend:{display:false},tooltip:{...tip,callbacks:{label:c=>` ${brl.format(c.raw)} (${nf(c.raw/K.V*100,1)}%)`}}}}});
  $("#lgMix").innerHTML=mix.map(m=>`<div><i style="background:${fuelColor(m.f)}"></i><span>${esc(m.f)} <span class="sub">· ${nf(m.l,0)} L</span></span><b>${nf(m.v/K.V*100,1)}%</b></div>`).join("");

  /* barras horizontais */
  const hbar=(id,wrap,rows,color)=>{const top=rows.slice(0,10);$(wrap).style.height=Math.max(160,top.length*30+40)+"px";
    S.charts[id]=new Chart($("#"+id),{type:"bar",data:{labels:top.map(r=>r.lab),datasets:[{data:top.map(r=>r.v),backgroundColor:color,borderRadius:4,maxBarThickness:22}]},
      options:{indexAxis:"y",maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{...tip,callbacks:{label:c=>` ${brl.format(c.raw)} · ${top[c.dataIndex].n} abastec. · ${nf(top[c.dataIndex].l,0)} L`}}},
        scales:{x:{beginAtZero:true,ticks:{callback:v=>brlc(v)}},y:{grid:{display:false}}}}})};
  hbar("chVei","#cvV",[...group(P,i=>i.placa)].map(([p,a])=>({lab:fmtPlaca(p)+(a.find(i=>i.modelo)?" · "+a.find(i=>i.modelo).modelo:""),v:sum(a,i=>i.valor),n:a.length,l:sum(a,i=>i.litros)})).sort((a,b)=>b.v-a.v),C[0]);
  hbar("chMot","#cvM",[...group(P,i=>i.motorista)].map(([p,a])=>({lab:p,v:sum(a,i=>i.valor),n:a.length,l:sum(a,i=>i.litros)})).sort((a,b)=>b.v-a.v),C[2]);

  /* ranking postos */
  const PF=P.filter(i=>i.combustivel===S.fuelPosto);const pmF=sum(PF,i=>i.valor)/(sum(PF,i=>i.litros)||1);
  const rk=[...group(PF,i=>i.posto)].map(([p,a])=>({p,n:a.length,l:sum(a,i=>i.litros),v:sum(a,i=>i.valor)})).map(x=>({...x,pm:x.v/x.l})).sort((a,b)=>a.pm-b.pm);
  const maxPm=Math.max(...rk.map(r=>r.pm),0),minPm=Math.min(...rk.map(r=>r.pm));
  $("#tbPostos").innerHTML=rk.length?`<table class="mini"><thead><tr><th>#</th><th>Posto</th><th class="r">Abast.</th><th class="r">Litros</th><th class="r">R$/L</th><th class="r">vs. média</th></tr></thead><tbody>${rk.map((r,ix)=>{const d=(r.pm/pmF-1)*100;
    return `<tr><td class="num sub">${ix+1}</td><td>${esc(r.p)}</td><td class="r num">${r.n}</td><td class="r num">${nf(r.l,0)}</td><td class="r"><div class="bar-cell"><i style="width:${maxPm>minPm?20+60*(r.pm-minPm)/(maxPm-minPm):40}px;background:${d<=0?css("--ok"):css("--warn")}"></i><span class="num">${brl3(r.pm)}</span></div></td><td class="r num ${d<=-0.5?"good":d>=0.5?"badc":""}">${d>0?"+":""}${nf(d,1)}%</td></tr>`}).join("")}</tbody></table>`:`<p class="sub">Sem dados.</p>`;

  /* preço ao longo do tempo */
  const gp=granOf(rg);const bp=bucketList(rg,gp,P);
  const fuelsLine=fuelsP.filter(f=>f!==NAO_COMB).slice(0,4);
  S.charts.preco=new Chart($("#chPreco"),{type:"line",data:{labels:bp.map(b=>b.label),datasets:fuelsLine.map(f=>{const gm2=group(P.filter(i=>i.combustivel===f),i=>bucketKey(i.data,gp));
    return {label:f,data:bp.map(b=>{const a=gm2.get(b.key);return a?sum(a,i=>i.valor)/sum(a,i=>i.litros):null}),borderColor:fuelColor(f),backgroundColor:fuelColor(f),spanGaps:true,tension:.3,pointRadius:bp.length>40?0:3,borderWidth:2.5}})},
    options:{maintainAspectRatio:false,interaction:{mode:"index",intersect:false},plugins:{legend:{position:"top",align:"end",labels:{boxWidth:10,boxHeight:10}},tooltip:{...tip,callbacks:{label:c=>c.raw==null?null:` ${c.dataset.label}: ${brl3(c.raw)}`}}},
      scales:{x:{grid:{display:false},ticks:{maxRotation:0,autoSkip:true}},y:{ticks:{callback:v=>"R$ "+nf(v,2)}}}}});

  /* frota */
  const cv=consumo(P).porVeiculo;
  const fr=[...group(P,i=>i.placa)].map(([p,a])=>{const s=[...a].sort((x,y)=>y.data.localeCompare(x.data));return {p,mod:a.find(i=>i.modelo)?.modelo||"",n:a.length,l:sum(a.filter(i=>i.combustivel!==NAO_COMB),i=>i.litros),v:sum(a,i=>i.valor),c:cv[p]||{},ult:s[0],mots:new Set(a.map(i=>i.motorista)).size}}).sort((a,b)=>b.v-a.v);
  const kmlVals=fr.map(r=>r.c.kml).filter(Boolean);const kmlMed=kmlVals.length?median(kmlVals):null;
  $("#tbFrota").innerHTML=`<table class="mini"><thead><tr><th>Veículo</th><th class="r">Abast.</th><th class="r">Litros</th><th class="r">Gasto</th><th class="r">Part.</th><th class="r">Km medidos</th><th class="r">Km/L</th><th class="r">R$/km</th><th class="hide-sm">Último abastecimento</th></tr></thead><tbody>${fr.map(r=>`<tr>
    <td><span class="plate">${esc(fmtPlaca(r.p))}</span> <span class="sub">${esc(r.mod)}</span></td><td class="r num">${r.n}</td><td class="r num">${nf(r.l,0)}</td><td class="r num"><b style="font-weight:600">${brl.format(r.v)}</b></td>
    <td class="r"><div class="bar-cell"><i style="width:${Math.max(2,r.v/K.V*70)}px"></i><span class="num">${nf(r.v/K.V*100,1)}%</span></div></td>
    <td class="r num">${r.c.km?nf(r.c.km):"—"}</td><td class="r num ${r.c.kml&&kmlMed&&fr.length>2?(r.c.kml>=kmlMed*1.05?"good":r.c.kml<=kmlMed*0.9?"badc":""):""}">${r.c.kml?nf(r.c.kml,2):"—"}</td><td class="r num">${r.c.rpkm?brl3(r.c.rpkm):"—"}</td>
    <td class="hide-sm sub">${fmtD(r.ult.data)} · ${esc(r.ult.motorista)}${r.ult.km!=null?" · "+nf(r.ult.km)+" km":""}</td></tr>`).join("")}</tbody>
    <tfoot><tr><th>Total frota</th><th class="r num">${K.n}</th><th class="r num">${nf(K.L,0)}</th><th class="r num">${brl.format(K.V)}</th><th class="r num">100%</th><th class="r num">${K.km?nf(K.km):"—"}</th><th class="r num">${K.kml?nf(K.kml,2):"—"}</th><th class="r num">${K.rpkm?brl3(K.rpkm):"—"}</th><th class="hide-sm"></th></tr></tfoot></table>`;

  /* dia da semana */
  const wd=[1,2,3,4,5,6,0];const wg=group(P,i=>pd(i.data).getDay());
  S.charts.wd=new Chart($("#chWd"),{type:"bar",data:{labels:wd.map(d=>WD[d]),datasets:[{label:"Abastecimentos",data:wd.map(d=>(wg.get(d)||[]).length),backgroundColor:C[6],borderRadius:4,maxBarThickness:36}]},
    options:{maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{...tip,callbacks:{label:c=>{const a=wg.get(wd[c.dataIndex])||[];return ` ${c.raw} abastec. · ${brl.format(sum(a,i=>i.valor))}`}}}},scales:{x:{grid:{display:false}},y:{beginAtZero:true,ticks:{precision:0}}}}});

  /* alertas */
  $("#alerts").innerHTML=al.length?al.slice(0,60).map(a=>`<div class="al" ${a.id?`data-id="${esc(a.id)}"`:""} role="${a.id?"button":"note"}" ${a.id?'tabindex="0"':""}><span class="ic ${a.t}">${a.t==="i"?"i":"!"}</span><div><b style="font-weight:600">${esc(a.txt)}</b><br><small>${esc(a.sub)}</small></div></div>`).join("")
    :`<p class="sub" style="margin:0">Nada fora do padrão neste período. 👍</p>`;
  $("#alerts").onclick=e=>{const d=e.target.closest("[data-id]");if(d)openDrawer(S.items.find(i=>i.id===d.dataset.id))};
  $("#alerts").onkeydown=e=>{if(e.key==="Enter"){const d=e.target.closest("[data-id]");if(d)openDrawer(S.items.find(i=>i.id===d.dataset.id))}};
}
function granOf(rg){const a=rg[0].startsWith("0000")?(S.items.map(i=>i.data).sort()[0]||today()):rg[0];const b=rg[1].startsWith("9999")?today():rg[1];const d=(pd(b)-pd(a))/864e5;return d<=35?"dia":d<=120?"semana":"mes"}
function weekStart(s){const d=pd(s);const wd=(d.getDay()+6)%7;d.setDate(d.getDate()-wd);return iso(d)}
function bucketKey(s,g){return g==="dia"?s:g==="semana"?weekStart(s):s.slice(0,7)}
function bucketList(rg,g,P){
  let a=rg[0],b=rg[1];const ds=P.map(i=>i.data).sort();if(a.startsWith("0000"))a=ds[0];if(b.startsWith("9999")||b>today())b=ds[ds.length-1]>today()?ds[ds.length-1]:today();
  if(S.r.per==="tudo"){a=ds[0];b=ds[ds.length-1]}
  const out=[];let d=pd(bucketKey(a,g)+(g==="mes"?"-01":""));const end=pd(b);let guard=0;
  while(d<=end&&guard++<800){const s=iso(d);const key=bucketKey(s,g);
    out.push({key,label:g==="mes"?`${MES[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`:`${pad(d.getDate())}/${pad(d.getMonth()+1)}`});
    if(g==="dia")d.setDate(d.getDate()+1);else if(g==="semana")d.setDate(d.getDate()+7);else d=new Date(d.getFullYear(),d.getMonth()+1,1)}
  return out;
}

/* ================= CADASTROS ================= */
function renderCad(){
  const tipos=[["Motorista","Motoristas","motorista"],["Veículo","Veículos","placa"],["Posto","Postos","posto"]];
  const cad=S.cad.length?S.cad:cadDe(S.items);
  $("#cadBody").innerHTML=tipos.map(([t,tit,campo])=>{
    const L=cad.filter(c=>c.tipo===t).map(c=>{const a=S.items.filter(i=>i[campo]===c.nome);return {...c,n:a.length,ult:a.map(i=>i.data).sort().pop()}}).sort((a,b)=>(b.ativo-a.ativo)||String(a.nome).localeCompare(String(b.nome),"pt-BR"));
    return `<div class="card"><div class="ch"><h3>${tit}</h3><span class="sub">${L.filter(c=>c.ativo).length} ativo(s)</span></div><div>${L.length?L.map(c=>{const key=t+"|"+c.nome;
      if(S.cadEdit===key)return `<div class="edit-row" data-key="${esc(key)}"><label class="f">${t==="Veículo"?"Placa":"Nome"}<input class="in" id="ceNome" value="${esc(c.nome)}"></label>${t==="Veículo"?`<label class="f">Modelo<input class="in" id="ceDet" value="${esc(c.detalhe)}"></label>`:""}<div class="sub">Se renomear para um nome que já existe, os dois cadastros são unidos. Os lançamentos antigos também são corrigidos.</div><div class="actions"><button class="btn primary sm" type="button" data-save="${esc(key)}">Salvar</button><button class="btn sm" type="button" data-cancel>Cancelar</button></div></div>`;
      return `<div class="cad-item ${c.ativo?"":"off"}"><div class="d"><b>${esc(t==="Veículo"?fmtPlaca(c.nome):c.nome)}</b><span class="sub">${t==="Veículo"&&c.detalhe?esc(c.detalhe)+" · ":""}${c.n} lançamento${c.n===1?"":"s"}${c.ult?" · último "+fmtD(c.ult):""}</span></div>
        <button class="btn sm" type="button" data-edit="${esc(key)}">Editar</button><label class="sw" title="${c.ativo?"Aparece no app":"Oculto no app"}"><input type="checkbox" data-tog="${esc(key)}" ${c.ativo?"checked":""} aria-label="Ativo no app: ${esc(c.nome)}"><span></span></label></div>`}).join(""):`<p class="sub">Nenhum cadastro ainda.</p>`}</div></div>`}).join("");
}
$("#cadBody").addEventListener("click",async e=>{
  const ed=e.target.closest("[data-edit]");if(ed){S.cadEdit=ed.dataset.edit;renderCad();setTimeout(()=>$("#ceNome")?.focus(),30);return}
  if(e.target.closest("[data-cancel]")){S.cadEdit=null;renderCad();return}
  const sv=e.target.closest("[data-save]");
  if(sv){const [tipo,...rest]=sv.dataset.save.split("|");const nome=rest.join("|");const novo=$("#ceNome").value.trim();const det=$("#ceDet")?$("#ceDet").value.trim():undefined;
    if(!novo){toast("Nome não pode ficar vazio");return}
    sv.disabled=true;sv.innerHTML=`<span class="spin"></span>`;
    try{if(!S.demo)await api({a:"cadupd",tipo,nome,novoNome:novo,detalhe:det,ativo:true});S.cadEdit=null;
      if(S.demo){const c=S.cad.find(x=>x.tipo===tipo&&x.nome===nome);if(c){c.nome=tipo==="Veículo"?novo.toUpperCase():novo;if(det!=null)c.detalhe=det}renderCad();return}
      await carregar();toast("Cadastro atualizado")}catch(x){toast(x.message);sv.disabled=false;sv.textContent="Salvar"}}
});
$("#cadBody").addEventListener("change",async e=>{
  const t=e.target.closest("[data-tog]");if(!t)return;const [tipo,...rest]=t.dataset.tog.split("|");const nome=rest.join("|");
  const c=S.cad.find(x=>x.tipo===tipo&&x.nome===nome);
  try{if(!S.demo)await api({a:"cadupd",tipo,nome,ativo:t.checked,detalhe:c?.detalhe});if(c)c.ativo=t.checked;renderCad();toast(t.checked?"Voltou a aparecer no app":"Oculto no app do condutor")}
  catch(x){t.checked=!t.checked;toast(x.message)}
});

/* ================= DADOS DE EXEMPLO ================= */
function demo(){
  let seed=11;const rnd=()=>{seed=(seed*16807)%2147483647;return (seed-1)/2147483646};
  const veic=[["RAX2B41","Volvo FH 540","Diesel S10",2.25],["QBT7C19","Scania R 450","Diesel S10",2.4],["RTE4F02","Mercedes Actros 2651","Diesel S10",2.15],["QCX9A77","VW Delivery 11.180","Diesel S10",5.2],["SFJ1D33","Fiat Strada","Etanol",9.5]];
  const mot=["Exemplo · Carlos Mendes","Exemplo · João Batista","Exemplo · Marcos Souza","Exemplo · Rafael Lima","Exemplo · Ana Paula Reis"];
  const postos=[["Posto Rota 364 – Cuiabá",0],["Auto Posto Várzea Grande",0.08],["Posto Trevo – Rondonópolis",-0.06],["Posto Serra – Jaciara",0.15],["Posto Cerrado – Sinop",0.04]];
  const base={"Diesel S10":6.09,"Etanol":4.39,"ARLA 32":3.6};const out=[];const now=new Date();
  veic.forEach(([p,mo,c,kml],vi)=>{let km=180000+vi*53000+Math.floor(rnd()*20000);let d=new Date(now.getFullYear(),now.getMonth()-5,1+vi);
    while(d<=now){const tank=c==="Etanol"?42:vi===3?150:520;const lit=Math.round(tank*(0.55+rnd()*0.4)*100)/100;const dist=Math.round(lit*kml*(0.9+rnd()*0.2));km+=dist;
      const [ps,adj]=postos[Math.floor(rnd()*postos.length)];const month=(d.getFullYear()-now.getFullYear())*12+d.getMonth()-now.getMonth();
      const pl=Math.round((base[c]+adj+month*-0.03+(rnd()-.5)*0.12)*1000)/1000;
      const m=mot[(vi+(rnd()<.2?1:0))%mot.length];
      out.push({id:"d"+out.length,data:iso(d),motorista:m,placa:p,modelo:mo,posto:ps,combustivel:c,litros:lit,valor:Math.round(lit*pl*100)/100,precoLitro:pl,km:rnd()<.9?km:null,obs:"",fotoId:"x",criadoEm:d.toISOString()});
      if(c!=="Etanol"&&rnd()<.25){const l2=Math.round((20+rnd()*40)*10)/10;out.push({id:"d"+out.length,data:iso(d),motorista:m,placa:p,modelo:mo,posto:ps,combustivel:"ARLA 32",litros:l2,valor:Math.round(l2*base["ARLA 32"]*100)/100,precoLitro:base["ARLA 32"],km:null,obs:"",fotoId:"x",criadoEm:d.toISOString()})}
      d=new Date(d.getTime()+(c==="Etanol"?5:vi===3?4:3+Math.floor(rnd()*3))*864e5);}
  });
  const x=out[20];if(x){out[20]={...x,precoLitro:x.precoLitro*1.18,valor:Math.round(x.valor*1.18*100)/100}}
  return out.map(norm);
}

/* ================= INÍCIO ================= */
const saved=ls("verbo.g.k")||ss("verbo.g.k");
if(saved&&CONFIGURADO){S.key=saved;mostrar(true);setTab(S.tab);carregar()}
else{mostrar(false);if(!CONFIGURADO)$("#loginErr").hidden=true}
setInterval(()=>{if(!document.hidden&&S.key&&!S.demo&&!$("#drawerHost").innerHTML)carregar(true)},120000);
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change",()=>{if(S.tab==="dash")renderDash()});
})();
