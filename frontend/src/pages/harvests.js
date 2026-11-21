import{esc,data}from'../utils/format.js';import{title,regenOptions,specimen,empty}from'../components/specimens.js';import{perform,bindActions}from'../utils/actions.js';import{LINEAGE_STATES}from'../constants.js';

const bagMap=d=>new Map(d.lots.map(l=>[l.id,l.code]));
function sourceBlock(src,d){
  if(!src)return`<div class="source"><b>谱系来源：缺失</b><small>该后代种批没有来源记录，来源无法核实，共享将被阻断。</small></div>`;
  let lot=d.lots.find(l=>l.id===src.offspring_lot_id),codes=bagMap(d);
  return `<div class="source ${src.status}"><b>谱系来源 · ${LINEAGE_STATES[src.status]||esc(src.status)} <small>r${src.revision}</small></b>
  <dl><div><dt>母本</dt><dd>${esc(codes.get(src.mother_lot_id)||'#'+src.mother_lot_id)}</dd></div><div><dt>父本</dt><dd>${esc(codes.get(src.father_lot_id)||'#'+src.father_lot_id)}</dd></div><div><dt>袋签</dt><dd>${esc(src.bag_code)}</dd></div><div><dt>花期</dt><dd>${esc(src.flowering_plot_code)} ${esc(src.flowering_start)} → ${esc(src.flowering_end)}</dd></div><div><dt>活力版本</dt><dd>${esc(src.vitality_version)}</dd></div><div><dt>后代种批</dt><dd>${esc(lot?.code||'')}</dd></div></dl>
  ${src.status==='pending'?`<p class="error">待核理由：${esc(src.pending_reason||'花期、袋签或活力版本抄录待核对')}</p>`:`<small>${esc(src.verified_by||'')} 于 ${esc(src.verified_at||'')} 核对</small>`}</div>`;
}
export function render(s){
  let d=s.data,srcs=d.lineage_sources||[],x=d.harvests.find(h=>h.id===Number(sessionStorage.getItem('harvest-selected'))),write=s.user.role!=='viewer',boss=s.user.role==='supervisor',src=x?srcs.find(v=>v.harvest_id===x.id):null;
  return title('05 / HARVEST LINEAGE','归仓的不只是种子，还有代次。','收获在主管授粉后登记，含水率≤12%才可回库；回库建立母本下一代种批并冻结母本、父本、袋签、花期与活力版本，来源待核会阻断共享签发。')
  +`<div class="two"><section>${d.harvests.map(h=>{let sv=srcs.find(v=>v.harvest_id===h.id);return `<article class="paper"><h2>${esc(h.code)} <small>${h.state==='stored'?'已回库':'干燥中'}</small></h2><p>${h.seeds}粒 · 含水率${h.moisture}%</p>${h.offspring_lot_id?specimen(d.lots.find(l=>l.id===h.offspring_lot_id),d):''}${h.lineage?`<div class="lineage"><span>${esc(h.lineage.parent_lot.code)} / G${h.lineage.parent_lot.generation}</span><b>→</b><span>${esc(d.lots.find(l=>l.id===h.offspring_lot_id)?.code)} / G${h.lineage.parent_lot.generation+1}</span></div><p>父本 ${esc(h.lineage.father_lot.code)}<br>隔离袋 ${esc(h.lineage.pollination.bag_code)}<br>花期 ${h.lineage.flowering.start} 至 ${h.lineage.flowering.end}</p>`:''}${h.state==='stored'?sourceBlock(sv,d):''}<div class="actions"><button data-harvest="${h.id}">查看 / 干燥复测</button><button class="primary" data-action="/harvests/${h.id}/store" ${!boss||h.state!=='drying'?'disabled':''}>主管验收回库</button></div></article>`}).join('')||empty('完成隔离授粉后登记收获和干燥实测。')}</section>
  <aside><section class="paper"><div class="heading"><h2>${x?'收获干燥复测':'收获入库登记'}</h2><button id="new-harvest">新收获</button></div><form id="harvest-form" data-id="${x?.id||''}"><label>完成授粉的复壮单</label><select name="regeneration_id">${regenOptions(d,['issued','harvested'])}</select><label>收获编号</label><input name="code" value="${esc(x?.code||'')}" required><label>净收获 / 粒</label><input name="seeds" type="number" min="1" value="${x?.seeds||1800}" required><label>实测含水率 / %</label><input name="moisture" type="number" min="0" max="40" step=".1" value="${x?.moisture||10.5}" required><button class="primary" ${!write||x?.state==='stored'?'disabled':''}>${x?'保存干燥复测':'登记收获'}</button></form></section>
  ${x&&x.state==='stored'?`<section class="paper"><h2>来源核对 / 更正 <small>${src?LINEAGE_STATES[src.status]:'缺失'}</small></h2><form id="source-form" data-id="${src?.id||''}"><label>袋签编号</label><input name="bag_code" value="${esc(src?.bag_code||'')}" required><label>花期小区</label><input name="flowering_plot_code" value="${esc(src?.flowering_plot_code||'')}" required><div class="pair"><div><label>始花日</label><input name="flowering_start" type="date" value="${esc(src?.flowering_start||'')}" required></div><div><label>终花日</label><input name="flowering_end" type="date" value="${esc(src?.flowering_end||'')}" required></div></div><label>更正理由 / 核对说明</label><textarea name="reason" maxlength="300" placeholder="如：袋签抄错、花期提前一天">${esc(src?.pending_reason||'')}</textarea><div class="actions"><button class="primary" id="source-verify" ${!boss?'disabled':''}>主管更正并核对来源</button><button type="button" id="source-correct" ${!boss?'disabled':''}>仅更正，保持待核</button></div></form><p class="note">核对与共享签发并发时按锁序先落账者保留结果；重复核对不会再次递增版本。已签发共享保留签发时的来源依据。</p></section>`:''}
  <p class="note">后代初始发芽率只继承为计划先验，不能据此共享；应重新抽样复测。回库后收获粒数、谱系和含水记录不可覆盖，地块占用同步释放。</p></aside></div>`;
}
export function bind(s,reload){
  bindActions(reload);let x=s.data.harvests.find(h=>h.id===Number(sessionStorage.getItem('harvest-selected')));
  if(x)document.querySelector('#harvest-form [name=regeneration_id]').value=x.regeneration_id;
  document.querySelectorAll('[data-harvest]').forEach(b=>b.onclick=async()=>{sessionStorage.setItem('harvest-selected',b.dataset.harvest);await reload()});
  document.querySelector('#new-harvest').onclick=async()=>{sessionStorage.removeItem('harvest-selected');await reload()};
  document.querySelector('#harvest-form').onsubmit=e=>{e.preventDefault();let id=e.target.dataset.id;perform('/harvests'+(id?'/'+id:''),id?'PUT':'POST',data(e.target,['regeneration_id','seeds','moisture']),reload,'收获干燥记录已保存',x=>sessionStorage.setItem('harvest-selected',x.id))};
  let f=document.querySelector('#source-form');
  if(f){let send=(action,msg)=>perform('/lineage-sources/'+f.dataset.id+'/'+action,'POST',data(f,[]),reload,msg);
    f.onsubmit=e=>{e.preventDefault();send('verify','来源核对已落账；未签发共享可继续申请')};
    document.querySelector('#source-correct').onclick=()=>send('correct','来源已更正并回到待核，等待主管复核');}
}
