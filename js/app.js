/* 광명 건강생활 플랫폼 — 프런트엔드 (정적 SPA). 데이터: data/data.js (명세서 필드 구조) */
(function(){
'use strict';
const D = window.GM_DATA;
const LS = {get:(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch(e){return d}}, set:(k,v)=>localStorage.setItem(k,JSON.stringify(v))};

/* ---------- 코드표 ---------- */
const TYPE = {
  HOSPITAL:{l:'병원',c:'#d9480f',k:'병'}, CLINIC:{l:'의원',c:'#1971c2',k:'의'}, DENTAL:{l:'치과',c:'#7048e8',k:'치'},
  KOREAN_MED:{l:'한의원',c:'#a8721a',k:'한'}, PHARMACY:{l:'약국',c:'#2f9e44',k:'약'}, PUBLIC_HEALTH:{l:'보건소',c:'#0c8599',k:'보'}, WELFARE:{l:'복지·돌봄',c:'#c2255c',k:'복'}
};
const MEDICAL = ['HOSPITAL','CLINIC','DENTAL','KOREAN_MED'];
const STATUS = {UNVERIFIED:['미검증','b-unv'], VERIFIED:['검증완료','b-ver'], ERROR:['오류','b-err'], RECHECK:['재확인 필요','b-rec']};
const ISSUE = {WRONG_NAME:'시설명 오류',WRONG_ADDRESS:'주소 오류',WRONG_PHONE:'전화번호 오류',WRONG_HOURS:'운영시간 오류',DUPLICATE:'중복 등록',CLOSED:'폐업·휴업'};
const RES = {RECEIVED:'접수',CHECKING:'확인중',RESOLVED:'완료',REJECTED:'반려'};
const DAYS = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
const DKO = {MON:'월',TUE:'화',WED:'수',THU:'목',FRI:'금',SAT:'토',SUN:'일'};
const ORDER = ['MON','TUE','WED','THU','FRI','SAT','SUN'];
const BOUNDS = (()=>{ const B=window.GM_BASE; if(!B||!B.city.length) return [[37.395,126.815],[37.505,126.915]];
  const p=B.city.flat(); const la=p.map(x=>x[0]), lo=p.map(x=>x[1]); return [[Math.min(...la)-0.002,Math.min(...lo)-0.002],[Math.max(...la)+0.002,Math.max(...lo)+0.002]]; })();

/* ---------- 유틸 ---------- */
const $ = (s,el=document)=>el.querySelector(s);
const $$ = (s,el=document)=>[...el.querySelectorAll(s)];
const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const mm = t => { if(!t) return null; const [a,b]=t.split(':'); return +a*60+ +b; };
const dist = (a,b,c,d)=>{const R=6371000,t=x=>x*Math.PI/180,dl=t(c-a),dn=t(d-b);const h=Math.sin(dl/2)**2+Math.cos(t(a))*Math.cos(t(c))*Math.sin(dn/2)**2;return 2*R*Math.asin(Math.sqrt(h));};
const fmtD = m => m<1000? Math.round(m/10)*10+'m' : (m/1000).toFixed(1)+'km';
const yn = v => v===true?'가능':v===false?'불가':'확인 필요';
/* 좌표가 광명시 경계(내장 배경지도 기준) 안에 있는지 — 경계 밖이면 지도에서 위치가 어긋난 데이터입니다 */
const inCity=(la,lo)=>{ const B=window.GM_BASE; if(!B||!B.city||!B.city.length) return la>=BOUNDS[0][0]&&la<=BOUNDS[1][0]&&lo>=BOUNDS[0][1]&&lo<=BOUNDS[1][1];
  return B.city.some(ring=>{ let c=false; for(let i=0,j=ring.length-1;i<ring.length;j=i++){ const yi=ring[i][0],xi=ring[i][1],yj=ring[j][0],xj=ring[j][1]; if(((xi>lo)!==(xj>lo))&&(la<(yj-yi)*(lo-xi)/(xj-xi)+yi)) c=!c; } return c; }); };

/* ---------- 데이터 로드(관리자 보정 반영) ---------- */
let F = D.facilities.map(x=>({...x}));
function applyLocal(){
  const imp = LS.get('gm_import',[]);
  imp.forEach(r=>{ const i=F.findIndex(f=>f.facility_id===r.facility_id); if(i>=0) F[i]={...F[i],...r}; else F.push(r); });
  const ov = LS.get('gm_over',{});
  F.forEach(f=>{ if(ov[f.facility_id]) Object.assign(f,ov[f.facility_id]); });
  F.forEach(derive);
}
function derive(f){
  f._acc = (f.medical&&f.medical.accessibility_info)||[];
  f._wheel = f._acc.some(a=>/휠체어|엘리베이터/.test(a)) && !f._acc.includes('접근 불가');
  const p = (f.medical&&f.medical.parking_info)||'';
  f._parking = /가능|이용|유료/.test(p) && !/불가/.test(p);
  const hs = f.hours||[];
  f._weekend = hs.some(h=>(h.day_of_week==='SAT'||h.day_of_week==='SUN')&&!h.is_closed&&h.open_time);
  f._night = hs.some(h=>!h.is_closed&&h.close_time&&(h.overnight_flag||mm(h.close_time)>=20*60&&mm(h.close_time)<=23*60+30)) || (f.pharmacy&&f.pharmacy.night_operation===true);
  f._er = !!(f.medical&&f.medical.emergency);
  f._subj = ((f.medical&&f.medical.medical_subjects)||[]).concat((f.welfare&&f.welfare.categories)||[]);
  f._hay = [f.facility_name,f.address_road,f.address_jibun,f.dong,f.legal_type,(TYPE[f.facility_type]||{}).l,...f._subj,...((f.medical&&f.medical.medical_equipment)||[])].join(' ');
}
applyLocal();

/* ---------- 운영 여부 (등록된 운영시간 기준, 실시간 아님) ---------- */
function openState(f, now=new Date()){
  if(!f.is_active) return {s:'closed',t:'폐업·휴업'};
  if(!f.hours || (f.data_status==='UNVERIFIED' && !f.hours_source)) return {s:'unknown',t:'운영정보 확인 필요'};
  const get=d=>f.hours.find(h=>h.day_of_week===d);
  const di=now.getDay(), cur=now.getHours()*60+now.getMinutes();
  const ph=get(DAYS[(di+6)%7]);
  if(ph&&!ph.is_closed&&ph.overnight_flag&&ph.close_time&&cur<mm(ph.close_time)) return {s:'open',t:'운영중 · '+ph.close_time+'까지'};
  const h=get(DAYS[di]);
  if(!h||h.is_closed||!h.open_time) return {s:'closed',t:'오늘 휴무'};
  const o=mm(h.open_time); let c=mm(h.close_time); if(h.overnight_flag||c<=o) c+=1440;
  if(cur<o) return {s:'closed',t:h.open_time+' 운영 시작'};
  if(cur>=c) return {s:'closed',t:'운영 종료'};
  if(h.break_start&&cur>=mm(h.break_start)&&cur<mm(h.break_end)) return {s:'break',t:'휴게시간 · '+h.break_end+'부터'};
  return {s:'open',t:'운영중 · '+(h.close_time)+'까지'};
}
const OSB = {open:'b-open',closed:'b-closed',break:'b-break',unknown:'b-unknown'};
const osBadge = f=>{const o=openState(f);return `<span class="badge ${OSB[o.s]}">${esc(o.t)}</span>`};
const stBadge = f=>{const s=STATUS[f.data_status]||['','']; return `<span class="badge ${s[1]}">${s[0]}</span>`};
const typeBadge = f=>{const t=TYPE[f.facility_type]; return `<span class="badge b-t" style="background:${t.c}">${t.l}</span>`};

/* ---------- 필터 ---------- */
function filt(state){
  const q=(state.q||'').trim().toLowerCase().split(/\s+/).filter(Boolean);
  let r=F.filter(f=>{
    if(!f.is_active && f.data_status!=='ERROR') {}
    if(state.types&&state.types.length&&!state.types.includes(f.facility_type)) return false;
    if(state.dong&&f.dong!==state.dong) return false;
    if(state.subject&&!f._subj.some(s=>s.includes(state.subject))) return false;
    if(state.openNow&&openState(f).s!=='open') return false;
    if(state.weekend&&!f._weekend) return false;
    if(state.night&&!f._night) return false;
    if(state.wheel&&!f._wheel) return false;
    if(state.parking&&!f._parking) return false;
    if(state.er&&!f._er) return false;
    if(q.length){ const h=f._hay.toLowerCase(); if(!q.every(w=>h.includes(w))) return false; }
    return true;
  });
  if(state.ref){ r.forEach(f=>f._d=dist(state.ref[0],state.ref[1],f.latitude,f.longitude)); if(state.radius) r=r.filter(f=>f._d<=state.radius); r.sort((a,b)=>a._d-b._d); }
  else r.sort((a,b)=>a.facility_name.localeCompare(b.facility_name,'ko'));
  return r;
}
const allSubjects = ()=>[...new Set(F.filter(f=>MEDICAL.includes(f.facility_type)).flatMap(f=>f._subj))].sort((a,b)=>a.localeCompare(b,'ko'));

/* ---------- 해시 라우터 ---------- */
let CUR={route:'home',params:{}};
function parseHash(){ return CUR; }
function setQuery(){ /* 샌드박스(아티팩트)에서는 #경로?쿼리 불가 → 화면 상태는 메모리에만 보관 */ }
let skipHash=false;
function navigate(h){
  const m=String(h).replace(/^#\/?/,'').split('?'); const params={}; new URLSearchParams(m[1]||'').forEach((v,k)=>params[k]=v);
  CUR={route:PAGES[m[0]]?m[0]:'home',params};
  try{ if(location.hash!=='#'+CUR.route){ skipHash=true; location.hash='#'+CUR.route; } }catch(e){}
  render();
}
const toast=(msg)=>{ let t=$('#toast'); if(!t){ t=document.createElement('div'); t.id='toast'; t.setAttribute('role','status'); document.body.appendChild(t);} t.textContent=msg; t.classList.add('show'); clearTimeout(toast._t); toast._t=setTimeout(()=>t.classList.remove('show'),4500); };
const alert=toast;
document.addEventListener('click',e=>{ const a=e.target.closest&&e.target.closest('a[href^="#/"]'); if(a){ e.preventDefault(); navigate(a.getAttribute('href')); } });
let current=null;
function render(){
  if(current&&current.destroy) current.destroy(); current=null; closeDetail();
  const {route,params}=parseHash();
  $$('#nav a').forEach(a=>a.classList.toggle('on',a.dataset.r===route));
  $('#nav').classList.remove('open');
  const app=$('#app'); app.innerHTML='';
  const fn=PAGES[route]||PAGES.home; current=fn(app,params)||null;
  window.scrollTo(0,0);
  $('#sampleBar').style.display = D.meta.sample && route!=='admin' ? '' : (D.meta.sample?'':'none');
}
window.addEventListener('hashchange',()=>{ if(skipHash){skipHash=false;return;} const n=location.hash.replace(/^#\/?/,''); if(PAGES[n]&&n!==CUR.route){ CUR={route:n,params:{}}; render(); } });

/* ---------- 상세 드로어 ---------- */
let currentDetail=null;
function openDetail(id){
  const f=F.find(x=>x.facility_id===id); if(!f) return; currentDetail=id;
  const m=f.medical||{}, ph=f.pharmacy, w=f.welfare, todayK=DAYS[new Date().getDay()];
  const hrs = f.hours ? `<table class="hrs">${ORDER.map(d=>{const h=f.hours.find(x=>x.day_of_week===d)||{};
      const t = h.is_closed? '휴무' : (h.open_time? `${h.open_time} ~ ${h.close_time}${h.overnight_flag?' (익일)':''}${h.break_start?` <small>(휴게 ${h.break_start}~${h.break_end})</small>`:''}`:'확인 필요');
      return `<tr class="${d===todayK?'today':''}"><td>${DKO[d]}</td><td>${t}</td></tr>`}).join('')}</table>
      <div class="note">운영시간 확인일: ${esc((f.hours[0]||{}).hours_checked_at||'-')} · 등록된 운영시간 기준이며 <b>실시간 진료·영업 여부를 보장하지 않습니다.</b> 방문 전 전화로 확인해 주세요.</div>`
    : `<div class="note">등록된 운영시간 정보가 없습니다(확인 필요). 전화로 확인해 주세요.</div>`;
  const kakao=`https://map.kakao.com/link/to/${encodeURIComponent(f.facility_name)},${f.latitude},${f.longitude}`;
  const kakaoMap=`https://map.kakao.com/link/map/${encodeURIComponent(f.facility_name)},${f.latitude},${f.longitude}`;
  const naver=`https://map.naver.com/p/search/${encodeURIComponent(f.address_road)}`;
  $('#drawer').innerHTML=`
   <div class="dr-h"><button class="dr-x" aria-label="닫기" id="drX">✕</button>
     <div>${typeBadge(f)} ${f.legal_type?`<span class="badge b-unv">${esc(f.legal_type)}</span>`:''} ${f.is_sample?'<span class="badge b-sample">샘플</span>':''}</div>
     <h3>${esc(f.facility_name)}</h3><div>${osBadge(f)} ${stBadge(f)}</div></div>
   <div class="dr-b">
    <div class="actions">
      ${f.phone?`<a class="btn" href="tel:${esc(f.phone.replace(/[^0-9]/g,''))}">📞 전화 ${esc(f.phone)}</a>`:''}
      <a class="btn ghost" target="_blank" rel="noopener" href="${kakao}">길찾기(카카오맵)</a>
      <a class="btn ghost" target="_blank" rel="noopener" href="${naver}">네이버지도</a>
    </div>
    <h4>기본정보</h4>
    <dl class="kv">
      <dt>도로명주소</dt><dd>${esc(f.address_road)}</dd>
      <dt>지번주소</dt><dd>${esc(f.address_jibun||'확인 필요')}</dd>
      <dt>동</dt><dd>${esc(f.dong||'-')}</dd>
      ${f.homepage_url?`<dt>홈페이지</dt><dd><a href="${esc(f.homepage_url)}" target="_blank" rel="noopener">${esc(f.homepage_url)}</a></dd>`:''}
      ${m.medical_subjects&&m.medical_subjects.length?`<dt>진료과목</dt><dd>${m.medical_subjects.map(esc).join(', ')}</dd>`:''}
      ${m.specialist_count!=null&&m.specialist_count!==undefined?`<dt>전문의</dt><dd>${m.specialist_count}명</dd>`:''}
      ${m.medical_equipment&&m.medical_equipment.length?`<dt>주요 장비</dt><dd>${m.medical_equipment.map(esc).join(', ')}</dd>`:''}
      <dt>주차</dt><dd>${esc(m.parking_info||'확인 필요')}</dd>
      <dt>접근성</dt><dd>${(m.accessibility_info&&m.accessibility_info.length)?m.accessibility_info.map(esc).join(', '):'확인 필요'}</dd>
      ${ph?`<dt>공휴일 운영</dt><dd>${yn(ph.holiday_operation)}${ph.holiday_hours?' ('+esc(ph.holiday_hours)+')':''}</dd><dt>야간 운영</dt><dd>${yn(ph.night_operation)}${ph.public_night?' · <b>공공심야약국</b>(22시~익일 1시)':''}</dd>${ph.note?`<dt>약국 안내</dt><dd>${esc(ph.note)}</dd>`:''}${ph.dispensing_services?`<dt>조제 서비스</dt><dd>${ph.dispensing_services.map(esc).join(', ')}</dd>`:''}`:''}
      ${w?`<dt>서비스</dt><dd>${w.categories.map(esc).join(', ')}</dd><dt>이용대상</dt><dd>${esc(w.target_group)}</dd><dt>이용조건</dt><dd>${esc(w.eligibility)}</dd>${w.application_url?`<dt>신청</dt><dd><a href="${esc(w.application_url)}" target="_blank" rel="noopener">신청 안내 페이지</a></dd>`:''}`:''}
      ${m.note?`<dt>비고</dt><dd>${esc(m.note)}</dd>`:''}
    </dl>
    <h4>요일별 운영시간</h4>${hrs}
    <h4>데이터 출처·검증</h4>
    <dl class="kv"><dt>출처</dt><dd>${esc((D.sources.find(s=>s.source_id===f.source_id)||{}).source_name||f.source_id)}</dd>
      <dt>원천 갱신일</dt><dd>${esc(f.source_updated_at||'-')}</dd><dt>수집일시</dt><dd>${esc(f.collected_at||'-')}</dd>
      <dt>검증일시</dt><dd>${esc(f.verified_at||'미검증')}</dd><dt>시설 ID</dt><dd>${esc(f.facility_id)}</dd></dl>
    <div class="actions"><button class="btn warn sm" id="rptBtn">🚩 정보 오류 신고</button></div>
   </div>`;
  $('#drawer').classList.add('open'); $('#drawer').setAttribute('aria-hidden','false');
  $('#drX').onclick=closeDetail; $('#rptBtn').onclick=()=>reportModal(f);
  if(current&&current.onSelect) current.onSelect(f);
}
function closeDetail(){ $('#drawer').classList.remove('open'); $('#drawer').setAttribute('aria-hidden','true'); currentDetail=null; if(current&&current.onSelect) current.onSelect(null); }

function reportModal(f){
  const m=$('#modal'); m.innerHTML=`<div class="box" role="dialog" aria-label="정보 오류 신고"><h3>정보 오류 신고</h3>
   <p class="sub">${esc(f.facility_name)} — 개인정보는 수집하지 않습니다. 접수 후 3영업일 이내 확인을 목표로 합니다.</p>
   <div class="fld"><label>오류 유형</label><select class="inp" id="rpT">${Object.entries(ISSUE).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></div>
   <div class="fld"><label>올바른 내용(선택)</label><input class="inp" id="rpN" maxlength="200" placeholder="예: 전화번호 02-1234-5678"></div>
   <div class="actions"><button class="btn" id="rpOk">신고 접수</button><button class="btn ghost" id="rpNo">취소</button></div></div>`;
  m.classList.add('open'); m.setAttribute('aria-hidden','false');
  const close=()=>{m.classList.remove('open');m.setAttribute('aria-hidden','true')};
  $('#rpNo').onclick=close; m.onclick=e=>{if(e.target===m)close()};
  $('#rpOk').onclick=()=>{ const l=LS.get('gm_reports',[]); l.push({log_id:'USR'+String(l.length+1).padStart(4,'0'),facility_id:f.facility_id,field_name:'',old_value:null,new_value:$('#rpN').value||null,issue_type:$('#rpT').value,reported_by:'시민 신고',reported_at:new Date().toLocaleString('sv').slice(0,16),resolved_at:null,resolution_status:'RECEIVED',resolution_note:null}); LS.set('gm_reports',l); sendReport(l[l.length-1],f); close(); alert('신고가 접수되었습니다. 감사합니다.'); };
}

/* ---------- 핀 묶음: 화면에서 가까운 시설을 숫자 원 하나로 묶습니다 ---------- */
function clusterize(list,proj,R,keepId){
  const cl=[];
  list.forEach(f=>{
    const p=proj(f.latitude,f.longitude);
    if(f.facility_id===keepId){ cl.push({items:[f],fixed:true,la:f.latitude,lo:f.longitude}); return; }
    let hit=null;
    for(const c of cl){ if(c.fixed) continue; if(Math.hypot(c.x-p.x,c.y-p.y)<R){ hit=c; break; } }
    if(hit){ hit.items.push(f); hit.sx+=p.x; hit.sy+=p.y; hit.sla+=f.latitude; hit.slo+=f.longitude; const n=hit.items.length; hit.x=hit.sx/n; hit.y=hit.sy/n; hit.la=hit.sla/n; hit.lo=hit.slo/n; }
    else cl.push({items:[f],x:p.x,y:p.y,sx:p.x,sy:p.y,sla:f.latitude,slo:f.longitude,la:f.latitude,lo:f.longitude});
  });
  return cl;
}
const clSize = n => n<10?40:n<30?46:52;
function clHtml(c){
  const n=c.items.length, ts=[...new Set(c.items.map(f=>f.facility_type))], col=ts.length===1?TYPE[ts[0]].c:'var(--pri)', sz=clSize(n);
  return `<div class="clb" style="width:${sz}px;height:${sz}px;background:${col}" role="button" aria-label="${n}곳 묶음. 누르면 확대하거나 목록을 보여줍니다"><span>${n}</span></div>`;
}
function clusterList(items,pick){
  const m=$('#modal'), its=items.slice().sort((a,b)=>a.facility_name.localeCompare(b.facility_name,'ko'));
  m.innerHTML=`<div class="box" role="dialog" aria-label="같은 위치의 기관 목록"><h3>이 위치의 기관 ${its.length}곳</h3>
   <p class="sub">한 건물이거나 아주 가까운 곳입니다. 눌러서 자세히 보세요.</p>
   <ul class="clist">${its.map(f=>{const t=TYPE[f.facility_type]; return `<li><button type="button" data-id="${f.facility_id}"><span class="cdot" style="background:${t.c}">${t.k}</span><span><b>${esc(f.facility_name)}</b><small>${esc(t.l+(f._subj&&f._subj.length?' · '+f._subj.slice(0,2).join(', '):''))}</small></span></button></li>`}).join('')}</ul>
   <div class="actions"><button class="btn ghost" id="clX" type="button">닫기</button></div></div>`;
  m.classList.add('open'); m.setAttribute('aria-hidden','false');
  const close=()=>{m.classList.remove('open');m.setAttribute('aria-hidden','true')};
  $('#clX').onclick=close; m.onclick=e=>{if(e.target===m)close()};
  $$('.clist button',m).forEach(b=>b.onclick=()=>{ close(); pick(b.dataset.id); });
}
/* 묶음을 눌렀을 때: 펼쳐질 수 있으면 확대, 같은 건물이거나 더 확대할 수 없으면 목록 */
function clusterTap(c,z,fit,pick){
  const la=c.items.map(f=>f.latitude), lo=c.items.map(f=>f.longitude);
  const spread=Math.hypot((Math.max(...la)-Math.min(...la))*111320,(Math.max(...lo)-Math.min(...lo))*88300);
  if(spread<8||z>=18) clusterList(c.items,pick);
  else fit(L.latLngBounds(c.items.map(f=>[f.latitude,f.longitude])),19);
}

/* ---------- 지도 컴포넌트 (세부지도) ---------- */
function mountMap(el, init, opts={}){
  const S = Object.assign({types:MEDICAL.slice(),dong:'',subject:'',q:'',openNow:false,weekend:false,night:false,wheel:false,parking:false,er:false,ref:null,radius:0}, init);
  const dongNames=Object.keys(D.dongs);
  el.innerHTML=`<div class="mapwrap ${opts.cls||''}">
   <aside class="panel">
    <div class="pf">
      <div><label class="l" for="fq">검색</label><input id="fq" class="inp" type="search" placeholder="기관명·주소·진료과목" value="${esc(S.q)}"></div>
      <div><label class="l">시설 유형</label><div class="chips" id="fTypes"></div></div>
      <div><label class="l">동(세부지도로 이동)</label><div class="chips" id="fDongs"></div></div>
      <div><label class="l" for="fSub">진료과목</label><select id="fSub" class="inp"><option value="">전체 진료과목</option>${allSubjects().map(s=>`<option ${s===S.subject?'selected':''}>${esc(s)}</option>`).join('')}</select></div>
      <div><label class="l">조건</label><div class="tg" id="fTg">
        ${[['openNow','현재 운영중(검증정보)'],['weekend','주말 운영'],['night','야간 운영'],['wheel','휠체어 접근(정보 있는 곳만)'],['parking','주차 가능'],['er','응급실']].map(([k,l])=>`<label><input type="checkbox" data-k="${k}" ${S[k]?'checked':''}>${l}</label>`).join('')}</div></div>
      <div><label class="l" for="fRad">내 위치/기준점 반경</label>
        <div style="display:flex;gap:6px"><select id="fRad" class="inp"><option value="0">반경 제한 없음</option><option value="500">500m</option><option value="1000">1km</option><option value="2000">2km</option><option value="3000">3km</option></select>
        <button class="btn sm" id="fLoc" type="button">📍 내 위치</button></div></div>
      <button class="btn ghost sm" id="fReset" type="button">필터 초기화</button>
    </div>
    <div class="rescnt"><span id="cnt"></span><small>운영상태는 등록된 시간 기준</small></div>
    <ul class="list" id="list"></ul>
   </aside>
   <div class="mapbox"><div id="map"></div>
    <div class="zoomhint" id="zh"></div><div class="mapnote" id="mapnote">이 환경에서는 외부 타일 지도를 불러올 수 없습니다. '광명시 지도'(내장 지도)를 선택해 주세요.</div>
    <div class="maptools">
      <button class="btn sm on" data-ly="vec">광명시 지도</button><button class="btn sm" data-ly="osm">상세(타일)</button><button class="btn sm" data-ly="sat">위성</button><button class="btn sm" data-ly="lite">단순</button>
      <button class="btn sm" id="pick">🎯 기준점 찍기</button><button class="btn sm" id="fit">⤢ 광명시 전체</button>
    </div>
    <div class="maplegend">${Object.values(TYPE).map(t=>`<span><i class="badge b-t" style="background:${t.c};padding:0 6px">${t.k}</i>${t.l}</span>`).join('')}</div>
   </div></div>`;
  $('#fRad',el).value=String(S.radius||0);

  const map=L.map($('#map',el),{zoomControl:true,maxBounds:[[37.33,126.75],[37.57,126.98]],minZoom:11,maxZoom:19,preferCanvas:true}).fitBounds(BOUNDS);
  const layers={
    osm:L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}),
    sat:L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'Tiles © Esri'}),
    lite:L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{maxZoom:19,subdomains:'abcd',attribution:'© OpenStreetMap, © CARTO'})};
  /* 내장 벡터 배경지도: OSM 데이터를 광명시 범위로 가공(data/basemap.js). 외부 타일 없이도 도로·하천·공원·역·행정동 경계 표시 */
  const vec=L.layerGroup(), vlab=L.layerGroup();
  (function buildVec(){ const B=window.GM_BASE; if(!B) return; const cv=L.canvas({padding:.4}); const o={renderer:cv,interactive:false}, cap={lineCap:'round',lineJoin:'round'};
    B.city.forEach(r=>L.polygon(r,{...o,color:'#0f766e',weight:3,fillColor:'#f8f6ef',fillOpacity:1}).addTo(vec));
    B.parks.forEach(g=>L.polygon(g,{...o,stroke:false,fillColor:'#d3e9c8',fillOpacity:.95}).addTo(vec));
    B.water.forEach(w=>(w.line?L.polyline(w.g,{...o,color:'#a9cfec',weight:2.5}):L.polygon(w.g,{...o,stroke:false,fillColor:'#b7d8f0',fillOpacity:1})).addTo(vec));
    B.dongs.forEach(d=>d.r.forEach(r=>L.polygon(r,{...o,color:'#6aa39b',weight:1.2,dashArray:'5 5',fill:false}).addTo(vec)));
    /* 도로: 확대할수록 굵어지도록 기준 굵기(_bw)를 기억해 둡니다(vlabSwap에서 줌 단계별로 조정) */
    const rl=(g,st)=>{ const l=L.polyline(g,{...o,...cap,...st}); l._bw=st.weight; l.addTo(vec); };
    B.minor.forEach(m=>rl(m.g,{color:'#bcc4c0',weight:5.2}));
    B.major.forEach(m=>rl(m.g,{color:/motorway|trunk/.test(m.h)?'#c9701c':'#d2a043',weight:/motorway|trunk|primary/.test(m.h)?10.5:8}));
    B.minor.forEach(m=>rl(m.g,{color:'#fff',weight:3.6}));
    B.major.forEach(m=>rl(m.g,{color:/motorway|trunk/.test(m.h)?'#f6a85a':'#ffe29a',weight:/motorway|trunk|primary/.test(m.h)?7.4:5.6}));
    B.rail.forEach(g=>L.polyline(g,{...o,color:'#6b7280',weight:2.2,dashArray:'8 4'}).addTo(vec));
    const lab=(la,lo,txt,cls)=>L.marker([la,lo],{interactive:false,icon:L.divIcon({className:'',html:`<div class="vl ${cls}">${esc(txt)}</div>`,iconSize:[0,0]})});
    B.dongs.forEach(d=>{ const r=d.r.slice().sort((a,b)=>b.length-a.length)[0]; const la=r.reduce((a,p)=>a+p[0],0)/r.length, lo=r.reduce((a,p)=>a+p[1],0)/r.length; lab(la,lo,d.n,'vl-d').addTo(vlab); });
    const best={}; B.major.concat(B.minor).forEach(m=>{ if(!m.n) return; if(!best[m.n]||m.g.length>best[m.n].g.length) best[m.n]=m; });
    Object.values(best).forEach(m=>{ const p=m.g[Math.floor(m.g.length/2)]; lab(p[0],p[1],m.n,m.h?'vl-r vl-m':'vl-r').addTo(vlab); });
    B.stations.forEach(s=>lab(s.la,s.lo,'🚇 '+s.n+(/역$/.test(s.n)?'':'역'),'vl-s').addTo(vlab));
    B.labels.filter(l=>l.k==='시청').forEach(l=>lab(l.la,l.lo,'🏛 '+l.n,'vl-s').addTo(vlab));
  })();
  const vlabSwap=()=>{ const z=map.getZoom(), on=map.hasLayer(vec); const sh=on&&z>=14; if(sh&&!map.hasLayer(vlab)) vlab.addTo(map); if(!sh&&map.hasLayer(vlab)) map.removeLayer(vlab);
    const c=map.getContainer(); c.classList.toggle('z-lo',z<15); c.classList.toggle('z-hi',z>=16); c.classList.toggle('z-xh',z>=17);
    const s=z>=18?2.8:z>=17?2:z>=16?1.4:z>=14?1:.7; if(vlabSwap._s!==s){ vlabSwap._s=s; vec.eachLayer(l=>{ if(l._bw) l.setStyle({weight:l._bw*s}); }); } };
  let base=null, tilesOk=false;
  Object.values(layers).forEach(l=>l.on('tileload',()=>{tilesOk=true;$('#mapnote',el).style.display='none';}));
  function setBase(k){ if(base) map.removeLayer(base); map.removeLayer(vec); map.removeLayer(vlab); $('#mapnote',el).style.display='none';
    if(k==='vec'&&window.GM_BASE){ base=null; vec.addTo(map); map.getContainer().style.background='#cfd8d5'; }
    else { k=k==='vec'?'osm':k; base=layers[k].addTo(map); map.getContainer().style.background=''; tilesOk=false; setTimeout(()=>{ if(!tilesOk&&base===layers[k]) $('#mapnote',el).style.display='block'; },3500); }
    $$('[data-ly]',el).forEach(x=>x.classList.toggle('on',x.dataset.ly===k)); vlabSwap(); }
  $$('[data-ly]',el).forEach(b=>b.onclick=()=>setBase(b.dataset.ly));
  map.on('zoomend',vlabSwap);
  map.attributionControl.addAttribution('지도 데이터 © OpenStreetMap contributors (ODbL)');
  L.control.scale({imperial:false,position:'bottomright'}).addTo(map);
  setBase('vec');

  const bubbles=L.layerGroup(), pins=L.layerGroup(), over=L.layerGroup().addTo(map);
  let markers={}, res=[], selId=null, picking=false;
  const THRESH=15;
  /* 카카오맵(선택): 키가 있고 카카오 서버에 접속되면 켜집니다. 안 되면 내장 지도를 그대로 씁니다. */
  const K = window.GM_KAKAO ? window.GM_KAKAO.attach({el,map,L,D,BOUNDS,THRESH,esc,toast,mkHtml,clusterize,clHtml,clSize,clusterTap,getState:()=>({res,selId,S}),onSelect:id=>select(id,false),onPick:(la,lo)=>onPick(la,lo)}) : {render(){},zoom:()=>map.getZoom()};

  function mkHtml(f,sel){ const t=TYPE[f.facility_type]; const dim=!f.is_active||f.data_status==='ERROR';
    return `<div class="mkw"><div class="mk ${sel?'sel':''} ${dim?'dim':''}" style="background:${t.c}"><span>${t.k}</span></div><b class="mkn">${esc(f.facility_name)}</b></div>`; }
  function mkIcon(f,sel){ return L.divIcon({className:'',html:mkHtml(f,sel),iconSize:sel?[36,36]:[30,30],iconAnchor:sel?[18,36]:[15,30]}); }

  function drawTypes(){
    $('#fTypes',el).innerHTML=Object.entries(TYPE).map(([k,t])=>`<button type="button" class="chip ${S.types.includes(k)?'on':''}" data-t="${k}">${t.l}</button>`).join('')+`<button type="button" class="chip" data-t="*">전체</button>`;
    $$('#fTypes .chip',el).forEach(b=>b.onclick=()=>{ const k=b.dataset.t; if(k==='*') S.types=Object.keys(TYPE); else S.types=S.types.includes(k)?S.types.filter(x=>x!==k):S.types.concat(k); update(); });
  }
  function drawDongs(){
    const cnt={}; filt({...S,dong:''}).forEach(f=>cnt[f.dong]=(cnt[f.dong]||0)+1);
    $('#fDongs',el).innerHTML=`<button type="button" class="chip ${S.dong===''?'on':''}" data-d="">전체</button>`+dongNames.map(d=>`<button type="button" class="chip ${S.dong===d?'on':''} ${cnt[d]?'':'dim'}" data-d="${d}" ${cnt[d]?'':'disabled title="이 동에는 등록된 기관이 없습니다"'}>${d}<i>${cnt[d]||0}</i></button>`).join('');
    $$('#fDongs .chip',el).forEach(b=>b.onclick=()=>{ S.dong=b.dataset.d; update(); if(S.dong){ const rs=F.filter(f=>f.dong===S.dong&&S.types.includes(f.facility_type)); if(rs.length>1) map.flyToBounds(L.latLngBounds(rs.map(f=>[f.latitude,f.longitude])).pad(.25),{maxZoom:17,duration:.8}); else map.flyTo(D.dongs[S.dong],16); } else map.flyToBounds(BOUNDS); });
  }
  function drawMarkers(){
    pins.clearLayers(); bubbles.clearLayers(); markers={};
    const by={}; res.forEach(f=>{(by[f.dong]=by[f.dong]||[]).push(f)});
    Object.entries(by).forEach(([d,arr])=>{ const c=D.dongs[d]; if(!c) return;
      const la=arr.reduce((a,f)=>a+f.latitude,0)/arr.length, lo=arr.reduce((a,f)=>a+f.longitude,0)/arr.length;
      L.marker([la,lo],{icon:L.divIcon({className:'',html:`<div class="dongb"><div><b>${d}</b><span>${arr.length}</span></div></div>`,iconSize:[58,58],iconAnchor:[29,29]}),keyboard:true,title:d+' '+arr.length+'곳'})
        .on('click',()=>map.flyToBounds(L.latLngBounds(arr.map(f=>[f.latitude,f.longitude])).pad(.3),{maxZoom:17,duration:.8})).addTo(bubbles); });
    drawPins();
    K.render();
    zoomSwap();
  }
  function drawPins(){
    pins.clearLayers(); markers={};
    const z=map.getZoom(); if(z<THRESH) return;
    const cl=clusterize(res,(la,lo)=>map.project([la,lo],z),z>=18?30:40,selId);
    cl.forEach(c=>{
      if(c.items.length===1){ const f=c.items[0];
        const mk=L.marker([f.latitude,f.longitude],{icon:mkIcon(f,f.facility_id===selId),title:f.facility_name,riseOnHover:true}).on('click',()=>select(f.facility_id,false)); mk.addTo(pins); markers[f.facility_id]=mk; }
      else { const sz=clSize(c.items.length);
        L.marker([c.la,c.lo],{icon:L.divIcon({className:'',html:clHtml(c),iconSize:[sz,sz],iconAnchor:[sz/2,sz/2]}),title:c.items.length+'곳 묶음',keyboard:true})
          .on('click',()=>clusterTap(c,z,(b,mz)=>map.flyToBounds(b.pad(.25),{maxZoom:mz,duration:.6}),id=>select(id,true))).addTo(pins); }
    });
  }
  function zoomSwap(){
    const z=map.getZoom(); const fine=z>=THRESH;
    if(fine){ map.removeLayer(bubbles); if(!map.hasLayer(pins)) pins.addTo(map);} else { map.removeLayer(pins); if(!map.hasLayer(bubbles)) bubbles.addTo(map);}
    $('#zh',el).textContent = fine? `세부지도 · 줌 ${z} (건물 단위)` : `동별 요약 · 동 원을 누르면 세부지도로 확대 (줌 ${z})`;
  }
  map.on('zoomend',zoomSwap);
  map.on('zoomend',()=>{ if(map.getZoom()>=THRESH) drawPins(); });

  function drawList(){
    $('#cnt',el).innerHTML=`<b>${res.length}</b>곳${S.ref?' · 기준점에서 가까운 순':''}`;
    $('#list',el).innerHTML = res.length? res.map(f=>{ const t=TYPE[f.facility_type];
      return `<li class="li ${f.facility_id===selId?'sel':''}" data-id="${f.facility_id}" tabindex="0"><span class="mk" style="background:${t.c};width:26px;height:26px;border-radius:50%;transform:none"><span style="transform:none">${t.k}</span></span>
        <div><h4>${esc(f.facility_name)}</h4><p>${esc(f.address_road)}${f._d!=null&&S.ref?` · <b>${fmtD(f._d)}</b>`:''}</p>
        <div class="meta">${osBadge(f)} ${stBadge(f)} ${f._subj.slice(0,2).map(s=>`<span class="badge b-unv">${esc(s)}</span>`).join('')}</div></div></li>`}).join('')
      : `<li class="li" style="cursor:default"><div><h4>조건에 맞는 기관이 없습니다</h4><p>필터를 줄이거나 초기화해 보세요. 운영정보가 확인되지 않은 기관은 '현재 운영중' 조건에서 제외됩니다.</p></div></li>`;
    $$('.li[data-id]',el).forEach(li=>{ li.onclick=()=>select(li.dataset.id,true); li.onkeydown=e=>{if(e.key==='Enter')select(li.dataset.id,true)}; });
  }
  function select(id,fly){
    const f=F.find(x=>x.facility_id===id); if(!f) return; selId=id;
    if(fly) map.flyTo([f.latitude,f.longitude],Math.max(K.zoom(),17),{duration:.7});
    openDetail(id);
  }
  function update(){
    res=filt(S); if(!S.types.length) res=[]; drawTypes(); drawDongs(); drawList(); drawMarkers();
    if(S.ref){ over.clearLayers(); L.marker(S.ref,{icon:L.divIcon({className:'',html:'<div style="font-size:26px;filter:drop-shadow(0 2px 2px #0006)">📍</div>',iconSize:[26,26],iconAnchor:[13,24]}),interactive:false}).addTo(over); if(S.radius) L.circle(S.ref,{radius:S.radius,color:'#0f766e',weight:2,fillOpacity:.07}).addTo(over); } else over.clearLayers();
    if(!opts.noHash) setQuery({types:S.types.length===MEDICAL.length&&MEDICAL.every(t=>S.types.includes(t))?'':S.types.join(','),dong:S.dong,subject:S.subject,q:S.q,openNow:S.openNow,weekend:S.weekend,night:S.night,wheel:S.wheel,parking:S.parking,er:S.er,radius:S.radius||''});
  }
  /* 이벤트 */
  $('#fq',el).oninput=e=>{S.q=e.target.value;update()};
  $('#fSub',el).onchange=e=>{S.subject=e.target.value;update()};
  $$('#fTg input',el).forEach(i=>i.onchange=()=>{S[i.dataset.k]=i.checked;update()});
  $('#fRad',el).onchange=e=>{S.radius=+e.target.value; if(S.radius&&!S.ref){ if(!locate()) S.radius=0; } update()};
  function setRef(la,lo){ S.ref=[la,lo]; if(!S.radius){S.radius=1000;$('#fRad',el).value='1000';} update(); map.flyTo(S.ref,15,{duration:.7}); }
  function locate(){ if(!navigator.geolocation){alert('이 브라우저는 위치 기능을 지원하지 않습니다. "기준점 찍기"로 지도에서 직접 지정해 주세요.');return false;}
    navigator.geolocation.getCurrentPosition(p=>{ const la=p.coords.latitude,lo=p.coords.longitude; if(la<37.3||la>37.6||lo<126.7||lo>127.0) alert('현재 위치가 광명시 밖입니다. 지도를 눌러 기준점을 직접 지정해 보세요.'); else setRef(la,lo); },()=>alert('위치 권한이 없어 기준점을 찍는 방식으로 이용해 주세요. (🎯 기준점 찍기)'),{timeout:8000}); return true; }
  $('#fLoc',el).onclick=locate;
  $('#pick',el).onclick=e=>{ picking=!picking; e.currentTarget.classList.toggle('on',picking); map.getContainer().style.cursor=picking?'crosshair':''; };
  function onPick(la,lo){ if(picking){ picking=false; $('#pick',el).classList.remove('on'); map.getContainer().style.cursor=''; setRef(la,lo); } }
  map.on('click',e=>onPick(e.latlng.lat,e.latlng.lng));
  $('#fit',el).onclick=()=>map.flyToBounds(BOUNDS);
  $('#fReset',el).onclick=()=>{ Object.assign(S,{types:opts.defTypes||MEDICAL.slice(),dong:'',subject:'',q:'',openNow:false,weekend:false,night:false,wheel:false,parking:false,er:false,ref:null,radius:0}); $('#fq',el).value=''; $('#fSub',el).value=''; $('#fRad',el).value='0'; $$('#fTg input',el).forEach(i=>i.checked=false); update(); map.flyToBounds(BOUNDS); };

  update();
  setTimeout(()=>{ map.invalidateSize();
    if(res.length&&(S.dong||S.q||S.subject||res.length<F.length&&S.types.length<7&&false)) map.fitBounds(L.latLngBounds(res.map(f=>[f.latitude,f.longitude])).pad(.3),{maxZoom:17});
    else map.fitBounds(BOUNDS); },120);
  return { destroy(){ map.remove(); }, onSelect(f){ selId=f?f.facility_id:null; drawPins(); drawList(); K.render(); }, map, S, select, update };
}

function stateFromParams(p, defTypes){
  const s={types:p.types?p.types.split(',').filter(t=>TYPE[t]):defTypes.slice()};
  ['dong','subject','q'].forEach(k=>{if(p[k])s[k]=p[k]});
  ['openNow','weekend','night','wheel','parking','er'].forEach(k=>{if(p[k])s[k]=true});
  if(p.radius) s.radius=+p.radius;
  return s;
}

/* ---------- 공통 조각 ---------- */
const head=(t,s)=>`<div class="pghead"><div class="wrap"><h1>${t}</h1><p>${s}</p></div></div>`;
function facCard(f){ const m=f.medical||{};
  return `<div class="card fac-card" data-id="${f.facility_id}" style="cursor:pointer"><div>${typeBadge(f)} ${osBadge(f)} ${stBadge(f)}</div><h4>${esc(f.facility_name)}</h4>
  <div style="font-size:.88rem;color:var(--mut)">${esc(f.address_road)}</div>
  <div style="font-size:.88rem">${f._subj.map(esc).join(' · ')}</div>
  <div class="actions" style="margin-top:6px">${f.phone?`<a class="btn sm" href="tel:${esc(f.phone.replace(/[^0-9]/g,''))}" onclick="event.stopPropagation()">📞 ${esc(f.phone)}</a>`:''}<a class="btn ghost sm" href="#/find?q=${encodeURIComponent(f.facility_name)}" onclick="event.stopPropagation()">지도에서 보기</a></div></div>`; }
function bindCards(root){ $$('.fac-card[data-id]',root).forEach(c=>c.onclick=()=>openDetail(c.dataset.id)); }

/* ---------- AI(규칙 기반) 의료정보 안내 ---------- */
const SUBJ_ALIAS = [['정형외과',/정형|허리|무릎|관절|어깨|디스크|골절/],['소아청소년과',/소아|아기|아이|어린이/],['내과',/내과/],['이비인후과',/이비인후|코|귀|목감기/],['피부과',/피부/],['산부인과',/산부인|임신|산모/],['안과',/안과|눈/],['신경외과',/신경외과/],['비뇨의학과',/비뇨/],['재활의학과',/재활/],['정신건강의학과',/정신|우울|불면/],['가정의학과',/가정의학/],['치과',/치과|치아|임플란트/],['한방',/한방|침|한의/]];
function parseQuery(q){
  const c={state:{types:[],q:''},tags:[],near:false};
  const add=t=>c.tags.push(t);
  Object.keys(D.dongs).forEach(d=>{ if(q.includes(d)||q.includes(d.slice(0,2)+' ')||new RegExp(d.slice(0,2)+'(동|에서|근처|쪽)').test(q)){ c.state.dong=d; add('📍 '+d);} });
  const T=[];
  if(/약국|조제|처방전/.test(q)) {T.push('PHARMACY');}
  if(/치과|임플란트|치아/.test(q)) T.push('DENTAL');
  if(/한의원|한방|침/.test(q)) T.push('KOREAN_MED');
  if(/병원/.test(q)&&!/약국/.test(q)) T.push('HOSPITAL','CLINIC');
  if(/의원/.test(q)) T.push('CLINIC');
  if(/응급/.test(q)) {c.state.er=true; T.push('HOSPITAL'); add('🚑 응급실');}
  if(/보건소|검진|예방접종|백신|치매/.test(q)) T.push('PUBLIC_HEALTH');
  if(/방문진료|방문간호|돌봄|요양|복지|재가|장애인|노인|부모님/.test(q)) T.push('WELFARE');
  for(const [name,re] of SUBJ_ALIAS){ if(re.test(q)){ c.state.subject=name; add('🩺 '+name); if(!T.length) T.push('HOSPITAL','CLINIC','DENTAL','KOREAN_MED'); break; } }
  c.state.types=[...new Set(T)];
  if(/주말|토요일|일요일|휴일|공휴일/.test(q)){ c.state.weekend=true; add('📅 주말·휴일'); }
  if(/야간|밤|저녁|심야|늦게|퇴근/.test(q)){ c.state.night=true; add('🌙 야간'); }
  if(/휠체어|엘리베이터|거동/.test(q)){ c.state.wheel=true; add('♿ 휠체어 접근'); }
  if(/주차/.test(q)){ c.state.parking=true; add('🅿 주차'); }
  if(/지금|현재|오늘/.test(q)){ c.state.openNow=true; add('⏱ 현재 운영중(검증정보)'); }
  if(/가까운|근처|주변|가까이/.test(q)){ c.near=true; add('📏 가까운 순'); }
  c.state.types.forEach(t=>add(TYPE[t].l));
  return c;
}
function aiSearch(q){
  const c=parseQuery(q); let st=c.state; if(!st.types.length&&!st.subject) st.types=Object.keys(TYPE).filter(t=>t!=='WELFARE');
  if(c.near&&st.dong) st.ref=D.dongs[st.dong];
  const r=filt(st); return {c,st,r};
}

/* ---------- 페이지들 ---------- */
const PAGES={};
PAGES.home=app=>{
  const cnt=t=>F.filter(f=>f.facility_type===t).length, med=MEDICAL.reduce((a,t)=>a+cnt(t),0);
  const byDong=Object.keys(D.dongs).map(d=>[d,F.filter(f=>f.dong===d).length]).sort((a,b)=>b[1]-a[1]); const mx=byDong[0][1]||1;
  const ex=['철산동에서 주말에 진료하는 정형외과','하안동에서 가까운 약국','광명시 건강검진 받을 수 있는 곳','부모님이 이용할 수 있는 방문진료·돌봄','야간에 문 여는 약국'];
  app.innerHTML=`
  <section class="hero"><div class="hero-in"><div>
    <h1>우리 동네 의료와 건강, 돌봄을<br>하나로 연결하다</h1>
    <p>광명시 병원·의원·치과·한의원·약국을 한 번에 검색하고, 동네 단위 세부지도에서 위치를 확인하세요.</p>
    <form class="sbox" id="hs" role="search"><input id="hq" type="search" aria-label="통합 검색" placeholder="예) 철산동에서 주말에 진료하는 정형외과"><button class="btn" type="submit">검색</button></form>
    <div class="ex">${ex.map(e=>`<button type="button">${esc(e)}</button>`).join('')}</div>
  </div><div class="stat4">
    <div><b>${med}</b><span>병원·의원·치과·한의원</span></div><div><b>${cnt('PHARMACY')}</b><span>약국</span></div>
    <div><b>${cnt('PUBLIC_HEALTH')}</b><span>보건소·보건지소</span></div><div><b>${cnt('WELFARE')}</b><span>복지·돌봄 시설</span></div></div></div></section>
  <section class="tiles">
    <a class="tile" href="#/find"><span class="ic">🏥</span><b>병원 찾기</b><small>병원·의원·치과·한의원</small></a>
    <a class="tile" href="#/pharmacy"><span class="ic">💊</span><b>약국 찾기</b><small>위치·야간·휴일</small></a>
    <a class="tile" href="#/emergency"><span class="ic">🚑</span><b>응급의료</b><small>응급실·야간·휴일</small></a>
    <a class="tile" href="#/health"><span class="ic">🩺</span><b>건강검진</b><small>검진·예방접종·보건소</small></a>
    <a class="tile" href="#/welfare"><span class="ic">🤝</span><b>복지·돌봄</b><small>복지관·방문진료·요양</small></a>
  </section>
  <div class="wrap">
    <h2 class="sec">의료서비스 지도 <small style="font-size:.8rem;font-weight:400;color:var(--mut)">— 동 원을 누르면 건물 단위 세부지도로 확대됩니다</small></h2>
    <p class="sub">지도를 확대하면(줌 15 이상) 개별 기관 핀이 보입니다. 위성·단순 지도로 바꿔 건물 위치를 확인할 수 있습니다.</p>
    <div class="home-map" id="hm"></div>
    <div class="grid2" style="margin-top:22px">
      <div class="card"><h3 style="margin-top:0">동별 의료자원 현황</h3>${byDong.map(([d,n])=>`<a href="#/find?dong=${d}&types=${Object.keys(TYPE).join(',')}" style="text-decoration:none;color:inherit"><div class="dbar"><span>${d}</span><div class="bar"><i style="width:${n/mx*100}%"></i></div><b>${n}</b></div></a>`).join('')}
        <div class="note">건강보험심사평가원 자료(2026.9.30 기준) 건수입니다.</div></div>
      <div class="card"><h3 style="margin-top:0">AI 의료정보 안내</h3><p class="sub">자연어로 물어보면 조건(동·진료과·주말·야간·휠체어 등)으로 바꿔 통합 데이터에서 찾아 드립니다.</p>
        <div class="chips">${ex.slice(0,4).map(e=>`<a class="chip" href="#/ai?q=${encodeURIComponent(e)}">${esc(e)}</a>`).join('')}</div>
        <div class="note">AI 안내는 검증된 공개정보 검색을 돕는 도구이며 <b>진단·처방을 대신하지 않습니다.</b></div></div>
    </div>
    <h2 class="sec">건강정보 · 공지</h2><div class="grid3">${NEWS.slice(0,3).map(n=>`<div class="card"><span class="badge b-sample">${n.tag}</span><h4 style="margin:8px 0 4px">${n.t}</h4><p class="sub" style="margin:0">${n.d}</p></div>`).join('')}</div>
  </div>`;
  const go=q=>navigate('#/ai?q='+encodeURIComponent(q));
  $('#hs').onsubmit=e=>{e.preventDefault(); const q=$('#hq').value.trim(); if(q) go(q);};
  $$('.ex button').forEach(b=>b.onclick=()=>go(b.textContent));
  const m=mountMap($('#hm'),{types:Object.keys(TYPE)},{noHash:true});
  return m;
};
const mapPage=(title,sub,defTypes)=>(app,p)=>{
  app.innerHTML=head(title,sub)+'<div id="mp"></div>';
  const st=stateFromParams(p,defTypes); return mountMap($('#mp'),st,{defTypes});
};
PAGES.find=mapPage('의료기관 찾기','병원·의원·치과·한의원을 지도에서 검색하세요. 동을 누르면 세부지도로 이동합니다.',MEDICAL);
PAGES.pharmacy=(app,p)=>{
  app.innerHTML=head('약국 찾기','가까운 약국의 위치·운영시간과 야간·공휴일 운영 여부를 확인하세요.')+'<div class="wrap" style="padding-bottom:0"><div class="card" style="margin-bottom:10px"><b>🌙 야간·휴일에 문 여는 약국이 필요하세요?</b><p class="sub" style="margin:6px 0 0">상세 화면에서 공휴일·야간(공공심야약국) 운영 여부를 볼 수 있습니다. 운영시간은 신고된 기준이라 변동될 수 있고, 그날의 당번은 공식 정보로 확인해 주세요. <a href="https://www.e-gen.or.kr/egen/search_pharmacy.do" target="_blank" rel="noopener">응급의료포털에서 약국 찾기 ↗</a> · 운영시간은 바뀔 수 있으니 방문 전 약국에 전화로 확인하세요. 119·123에서도 안내받을 수 있습니다</p></div></div><div id="mp"></div>';
  const st=stateFromParams(p,['PHARMACY']); return mountMap($('#mp'),st,{defTypes:['PHARMACY']});
};

PAGES.emergency=app=>{
  const er=F.filter(f=>f._er), nightP=F.filter(f=>f.facility_type==='PHARMACY'&&f._night), wk=F.filter(f=>MEDICAL.includes(f.facility_type)&&f._weekend&&!f._er);
  app.innerHTML=head('응급의료','응급실·야간·휴일 진료정보 — 응급상황에서는 먼저 119에 연락하세요.')+`<div class="wrap">
   <div class="er"><div class="n">119</div><div><b>생명이 위급하면 즉시 119</b><p style="margin:2px 0 0">의식 저하·호흡곤란·심한 흉통·대량 출혈 등은 앱 검색보다 119 신고가 우선입니다.</p></div>
    <a class="btn" style="background:var(--red);border-color:var(--red)" href="tel:119">119 전화</a><a class="btn ghost" target="_blank" rel="noopener" href="https://www.e-gen.or.kr/">응급의료포털(e-gen)</a></div>
   <div class="note">응급실 가용 병상·실시간 현황은 응급의료포털/API 연동 후 <b>기준 시각과 함께</b> 제공됩니다. 현재 화면은 등록된 정보만 보여주며 실시간이 아닙니다.</div>
   <h2 class="sec">응급실 보유 기관</h2><div class="grid3" id="g1">${er.map(facCard).join('')||'<p class="sub">등록된 정보가 없습니다.</p>'}</div>
   <h2 class="sec">야간 운영 약국 <small style="font-weight:400;font-size:.8rem;color:var(--mut)">(운영시간 확인된 곳)</small></h2><div class="grid3" id="g2">${nightP.map(facCard).join('')||'<p class="sub">확인된 정보가 없습니다.</p>'}</div>
   <h2 class="sec">주말·휴일 진료 병·의원 <a class="btn ghost sm" href="#/find?weekend=1">지도에서 보기</a></h2><div class="grid3" id="g3">${wk.slice(0,9).map(facCard).join('')}</div></div>`;
  bindCards(app);
};
PAGES.health=app=>{
  const ph=F.filter(f=>f.facility_type==='PUBLIC_HEALTH');
  const sv=[['건강검진','국가건강검진·암검진 대상 확인과 검진기관 안내','https://www.nhis.or.kr/'],['예방접종','영유아·어르신 예방접종 일정과 접종기관','https://health.gm.go.kr/'],['치매안심센터','치매 조기검진·상담','https://health.gm.go.kr/'],['방문건강관리','거동 불편 시민 방문건강 서비스','https://health.gm.go.kr/']];
  app.innerHTML=head('건강생활','건강검진·예방접종·보건소 서비스를 한곳에서 안내합니다.')+`<div class="wrap">
  <div class="grid2">${sv.map(s=>`<div class="card"><h3 style="margin:0 0 4px">${s[0]}</h3><p class="sub">${s[1]}</p><a class="btn ghost sm" target="_blank" rel="noopener" href="${s[2]}">공식 안내 보기 ↗</a></div>`).join('')}</div>
  <div class="note">대상·일정·신청 방법은 수시로 바뀝니다. 반드시 공식 페이지(광명시 보건소 등)의 최신 안내를 확인하세요.</div>
  <h2 class="sec">보건소·보건지소</h2><div class="grid3">${ph.map(facCard).join('')}</div>
  <h2 class="sec">검진·예방접종 가능한 병·의원 찾기</h2><a class="btn" href="#/find?q=내과&types=CLINIC,HOSPITAL">내과·가정의학과 지도 검색</a></div>`;
  bindCards(app);
};
PAGES.welfare=(app,p)=>{
  const cats=['전체','노인복지','돌봄','재가돌봄','방문진료','방문간호','요양','장애인 생활지원']; let cur=p.c||'전체';
  app.innerHTML=head('복지·돌봄','복지관·방문진료·요양·재가돌봄 — 준비 중인 서비스')+`<div class="wrap"><div class="chips" id="wc"></div><div class="grid3" id="wg" style="margin-top:14px"></div>
   <h2 class="sec">서비스 분류</h2><div class="tblwrap"><table class="tbl"><tr><th>분류</th><th>서비스</th><th>대상</th></tr>${D.services.filter(s=>s.category_1!=='의료').map(s=>`<tr><td>${esc(s.category_1)} › ${esc(s.category_2)}</td><td>${esc(s.service_name)}</td><td>${esc(s.target_group)}</td></tr>`).join('')}</table></div>
   <div class="note">이용 자격·신청 방법은 시설·기관별로 다릅니다. 신청 전 해당 기관에 확인하세요.</div></div>`;
  const draw=()=>{ $('#wc').innerHTML=cats.map(c=>`<button class="chip ${c===cur?'on':''}" data-c="${c}">${c}</button>`).join(''); $$('#wc .chip').forEach(b=>b.onclick=()=>{cur=b.dataset.c;draw()});
    const list=F.filter(f=>f.facility_type==='WELFARE'&&(cur==='전체'||f.welfare.categories.includes(cur))); $('#wg').innerHTML=list.map(facCard).join('')||'<div class="card"><b>복지·돌봄 시설은 준비 중입니다.</b><p class="sub" style="margin:6px 0 0">광명시 복지시설 자료를 확보하는 대로 추가합니다. 급한 상담은 가까운 동 행정복지센터나 보건소에 문의하세요.</p></div>'; bindCards($('#wg')); };
  draw();
};
PAGES.ai=(app,p)=>{
  app.innerHTML=head('AI 의료정보 안내','말하듯이 질문하면 조건으로 바꿔 검증된 공개정보에서 찾아 드립니다.')+`<div class="wrap">
   <form class="sbox" id="as" style="border:1px solid var(--line);box-shadow:none"><input id="aq" type="search" placeholder="예) 하안동에서 가까운 약국을 알려주세요" value="${esc(p.q||'')}"><button class="btn">질문하기</button></form>
   <div class="chips" style="margin-top:10px">${['철산동에서 주말에 진료하는 정형외과를 찾아주세요','하안동에서 가까운 약국을 알려주세요','광명시에서 건강검진을 받을 수 있는 곳은 어디인가요?','부모님이 이용할 수 있는 방문진료 및 돌봄서비스를 알려주세요','휠체어로 갈 수 있는 소아과'].map(e=>`<button class="chip">${esc(e)}</button>`).join('')}</div>
   <div class="note">현재는 규칙 기반 해석기입니다(외부 AI 호출 없음). 이후 AI API를 연결해도 <b>결과는 통합 DB에서만 가져오고</b> 진단·처방은 하지 않도록 설계합니다.</div>
   <div id="ar" class="ai-res" style="margin-top:16px"></div></div>`;
  const run=q=>{ q=q.trim(); if(!q) return; const {c,st,r}=aiSearch(q); const tags=c.tags.length?c.tags.map(t=>`<span class="pill">${esc(t)}</span>`).join(''):'<span class="pill">조건을 인식하지 못했습니다 — 동·진료과·시설 유형을 포함해 보세요</span>';
    const qs=new URLSearchParams({types:st.types.join(','),dong:st.dong||'',subject:st.subject||''}); ['weekend','night','wheel','parking','openNow','er'].forEach(k=>{if(st[k])qs.set(k,1)});
    $('#ar').innerHTML=`<div class="card"><b>이렇게 이해했어요</b><div style="margin-top:8px">${tags}</div>
     <p class="sub" style="margin:6px 0 0">검색 결과 <b>${r.length}</b>곳 ${r.length?`· <a href="#/find?${qs}">지도에서 크게 보기</a>`:''}</p></div>
     <div class="grid3" style="margin-top:12px" id="arl">${r.slice(0,12).map(f=>facCard(f)).join('')||'<p class="sub">조건에 맞는 기관이 없습니다. 조건을 줄여 보세요.</p>'}</div>
     <div class="note">안내 결과는 등록·검증된 공개정보입니다. 증상에 대한 진단·처방은 제공하지 않으며, 방문 전 전화 확인을 권장합니다. 응급 시 119.</div>`; bindCards($('#ar')); };
  $('#as').onsubmit=e=>{e.preventDefault(); const q=$('#aq').value; setQuery({q}); run(q)};
  $$('.chips .chip',app).forEach(b=>b.onclick=()=>{$('#aq').value=b.textContent;setQuery({q:b.textContent});run(b.textContent)});
  if(p.q) run(p.q);
};
let NEWS=[
 {tag:'안내',t:'자료 출처와 기준일',d:'병원·약국 정보는 건강보험심사평가원 「전국 병의원 및 약국 현황」(2026.9.30 기준)입니다. 이후 개·폐업이나 이전은 반영되지 않았을 수 있습니다.'},
 {tag:'안내',t:'진료시간은 전화로 확인하세요',d:'진료시간이 등록된 기관은 일부입니다. 시간은 바뀔 수 있으니 방문 전 전화로 확인하세요.'},
 {tag:'안내',t:'야간·휴일 진료 · 당번 약국',d:'응급의료포털(e-gen.or.kr)의 병의원·약국 찾기에서 확인하거나 119·123으로 안내받을 수 있습니다.'},
 {tag:'안내',t:'정보가 다르면 알려 주세요',d:'상세 화면의 "정보 오류 신고"로 알려 주시면 확인해 고치겠습니다.'},
 {tag:'준비 중',t:'복지·돌봄 시설',d:'광명시 복지시설 자료를 확보하는 대로 추가할 예정입니다.'},
 {tag:'준비 중',t:'장애인 접근성 정보',d:'휠체어 출입 가능 여부 등은 자료가 없어 아직 표시하지 못합니다. 방문 전 전화로 확인해 주세요.'}];
PAGES.news=app=>{ app.innerHTML=head('광명 건강정보','이용 안내와 준비 중인 기능')+`<div class="wrap"><div class="grid3">${NEWS.map(n=>`<div class="card"><span class="badge b-sample">${n.tag}</span><h4 style="margin:8px 0 4px">${n.t}</h4><p class="sub" style="margin:0">${n.d}</p></div>`).join('')}</div></div>`; };

/* ---------- 이용 안내(사용자 매뉴얼·이용 이야기·운영자 안내) ---------- */
PAGES.guide=app=>{
  const T=[['how','이용 방법'],['story','이용 이야기'],['ops','운영자 안내']];
  const step=(n,t,d)=>`<div class="card"><span class="badge b-sample">${n}</span><h4 style="margin:8px 0 4px">${t}</h4><p class="sub" style="margin:0">${d}</p></div>`;
  const story=(who,need,path,limit)=>`<div class="card"><h4 style="margin:0 0 4px">${who}</h4><p style="margin:0 0 6px"><b>상황</b> ${need}</p><p class="sub" style="margin:0 0 6px"><b>이렇게 이용해요</b> ${path}</p><p class="sub" style="margin:0"><b>알아둘 점</b> ${limit}</p></div>`;
  const V={
   how:()=>`<h2 class="sec" style="margin-top:0">처음 오셨다면</h2>
    <div class="grid3">
     ${step('1','가까운 병원·약국 찾기','위쪽 메뉴의 「의료기관 찾기」 또는 「약국 찾기」를 누르세요. 지도에 핀이 나오고, 아래(또는 옆) 목록에 가까운 순으로 보입니다.')}
     ${step('2','동으로 좁히기','「동」 버튼을 누르면 그 동네 지도로 이동합니다. 흐리게 보이는 동은 아직 등록된 기관이 없는 곳입니다.')}
     ${step('3','내 위치 기준으로 보기','「기준점 찍기」를 누른 뒤 지도를 누르거나, 위치 허용을 선택하면 그 자리에서 가까운 순으로 정렬됩니다.')}
     ${step('4','조건으로 걸러내기','진료과, 주말·야간 진료, 주차, 휠체어, 지금 진료 중 같은 조건을 켜고 끌 수 있습니다. 「필터 초기화」로 처음 상태로 돌아갑니다.')}
     ${step('5','자세히 보기','핀이나 목록을 누르면 주소·전화·진료시간·진료과목이 나옵니다. 전화 걸기와 길찾기 버튼이 함께 있습니다.')}
     ${step('6','숫자로 묶인 핀','가까운 핀은 숫자 원으로 묶여 있습니다. 누르면 지도가 확대되고, 같은 건물이면 목록이 열립니다.')}
    </div>
    <h2 class="sec">메뉴별 안내</h2>
    <div class="tblwrap"><table class="tbl"><tr><th>메뉴</th><th>할 수 있는 일</th></tr>
     <tr><td>의료기관 찾기</td><td>병원·의원·치과·한의원을 지도와 목록에서 찾고 조건으로 걸러냅니다.</td></tr>
     <tr><td>약국 찾기</td><td>약국 위치와 요일별 운영시간, 공휴일·야간(공공심야약국) 운영 여부를 봅니다. 오늘의 당번 약국은 응급의료포털 링크로 안내합니다.</td></tr>
     <tr><td>응급의료</td><td>119 안내, 응급실 보유 기관, 야간 약국, 주말·휴일 진료 기관을 모아 봅니다.</td></tr>
     <tr><td>건강생활</td><td>건강검진·예방접종·보건소 서비스 공식 안내로 연결합니다.</td></tr>
     <tr><td>복지·돌봄</td><td>준비 중입니다. 자료를 확보하는 대로 시설이 추가됩니다.</td></tr>
     <tr><td>AI 의료정보 안내</td><td>"하안동에서 가까운 약국"처럼 말하듯 물으면 조건으로 바꿔 찾아 줍니다. 진단·처방은 하지 않습니다.</td></tr>
     <tr><td>글자 크게</td><td>오른쪽 위 「가 크게」 버튼으로 글자를 키웁니다.</td></tr></table></div>
    <div class="note"><b>꼭 알아두세요</b> ① 진료시간은 바뀔 수 있으니 방문 전 전화로 확인하세요. ② 시간 칸이 비어 있으면 아직 확인되지 않은 곳입니다. ③ 생명이 위급하면 검색하지 말고 바로 119에 연락하세요. ④ 정보가 다르면 상세 화면의 「정보 오류 신고」로 알려 주세요.</div>`,
   story:()=>`<p class="sub">실제 이용 장면을 가정해 정리한 이야기입니다. 서비스를 고치거나 설명할 때 기준으로 삼습니다.</p>
    <div class="grid2">
     ${story('① 퇴근길 직장인','저녁 8시, 아이가 열이 나서 문 연 약국이 급하다.','「약국 찾기」에서 기준점을 현재 위치로 하고 야간 운영 조건을 켭니다. 가까운 순으로 보고 전화 후 방문합니다.','오늘 당번 약국은 응급의료포털에서 한 번 더 확인합니다. 증상이 심하면 119.')}
     ${story('② 어르신과 자녀','어머니가 무릎이 아파 집 근처 정형외과를 찾는다. 글자가 작으면 읽기 힘들다.','「가 크게」를 누르고, 동을 고른 뒤 진료과를 정형외과로 합니다. 전화 버튼으로 바로 연결합니다.','진료시간이 없는 곳은 전화로 확인해야 합니다.')}
     ${story('③ 주말 진료가 필요한 학부모','토요일 오전에 소아과를 가야 한다.','「AI 의료정보 안내」에 "철산동에서 주말에 진료하는 소아과"처럼 묻거나 필터에서 주말 진료를 켭니다.','토요일 진료시간은 기관이 등록한 값입니다. 변경될 수 있습니다.')}
     ${story('④ 휠체어를 쓰는 이용자','계단 없이 갈 수 있는 병원이 필요하다.','필터의 휠체어 항목을 사용하되, 방문 전에 전화로 출입 여부를 꼭 확인합니다.','접근성 자료가 아직 부족해 모든 기관이 표시되지는 않습니다. 보강 예정입니다.')}
     ${story('⑤ 새로 이사 온 주민','동네 병원·약국·보건소를 한 번에 파악하고 싶다.','「의료기관 찾기」에서 우리 동을 눌러 세부지도로 둘러보고, 「건강생활」에서 보건소와 검진 안내를 봅니다.','동 경계 근처 기관은 다른 동으로 표시될 수 있습니다.')}
     ${story('⑥ 돌봄을 찾는 보호자','부모님을 위한 방문진료·재가돌봄 서비스를 알고 싶다.','「복지·돌봄」에서 분류를 확인하고, 급한 상담은 동 행정복지센터나 보건소에 문의합니다.','복지·돌봄 시설 목록은 준비 중입니다.')}
    </div>
    <h2 class="sec">앞으로 더하고 싶은 이야기</h2>
    <ul><li>복지·돌봄 시설을 지도에서 찾고 신청 방법까지 이어 보기</li><li>날짜별 당번 약국을 이 화면에서 바로 보기</li><li>기관별 접근성(경사로·승강기·장애인 화장실) 표시</li></ul>`,
   ops:()=>`<p class="sub">운영 담당자를 위한 안내입니다. 일반 이용자는 보지 않으셔도 됩니다.</p>
    <h2 class="sec" style="margin-top:0">데이터 갱신 순서</h2>
    <ol><li>건강보험심사평가원 「전국 병의원 및 약국 현황」 새 기준일 자료 확인(분기 단위)</li><li>국립중앙의료원 병·의원·약국 API로 진료·운영시간 다시 받기(월 1회 권장)</li><li>데이터 파일(data/data.js)에 반영하고 기준일·조회일 문구 고치기</li><li>GitHub에 올리고 화면에서 새 시간이 보이는지 확인</li></ol>
    <h2 class="sec">지켜야 할 원칙</h2>
    <ul><li>공공데이터 인증키는 사이트 파일에 넣지 않습니다.</li><li>카카오 지도 검색 결과는 저장·캐시하지 않습니다. 지도 키는 허용 도메인을 제한해 사용합니다.</li><li>이용자의 개인정보나 건강 정보를 수집하지 않습니다.</li><li>출처(건강보험심사평가원, 국립중앙의료원, 카카오맵)와 기준일을 항상 표시합니다.</li><li>광명시청 복지시설 파일은 이용조건(상업적 이용·변경 금지)이 맞지 않아 쓰지 않고, 시청에 자료 제공을 별도로 요청합니다.</li></ul>
    <h2 class="sec">구글 시트로 관리하기</h2>
    <p class="sub">복지시설 목록·정보 수정·공지를 구글 시트에 적으면 사이트에 반영되고, 시민 오류 신고가 시트에 쌓입니다. 설정은 js/sheets-config.js에 시트 주소를 넣으면 시작됩니다(비어 있으면 연동 없이 작동).</p>
    <h2 class="sec">아직 비어 있는 것</h2>
    <ul><li>복지·돌봄 시설, 장애인 접근성, 날짜별 당번 약국</li><li>진료시간이 없는 병·의원 15곳, 약국 2곳</li></ul>
    <p><a class="btn ghost sm" href="#/admin">관리자 화면으로 가기</a></p>`
  };
  let cur='how';
  app.innerHTML=head('이용 안내','처음 오신 분을 위한 사용 방법과 이용 이야기')+`<div class="wrap"><div class="tabs">${T.map(([k,l])=>`<button data-t="${k}">${l}</button>`).join('')}</div><div id="gb"></div></div>`;
  const draw=()=>{ $$('.tabs button',app).forEach(b=>b.classList.toggle('on',b.dataset.t===cur)); $('#gb').innerHTML=V[cur](); };
  $$('.tabs button',app).forEach(b=>b.onclick=()=>{cur=b.dataset.t;draw();window.scrollTo(0,0)});
  draw();
};

/* ---------- 관리자 ---------- */
function csvCell(v){ if(v==null) return ''; if(Array.isArray(v)) v=v.join(';'); v=String(v); return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v; }
const CSV_COLS=['facility_id','source_org_code','facility_name','facility_type','legal_type','address_road','address_jibun','postal_code','sido','sigungu','dong','latitude','longitude','phone','homepage_url','is_active','source_id','source_updated_at','collected_at','verified_at','data_status'];
function parseCSV(t){ const rows=[];let r=[],c='',q=false; t=t.replace(/^﻿/,''); for(let i=0;i<t.length;i++){const ch=t[i]; if(q){ if(ch==='"'){ if(t[i+1]==='"'){c+='"';i++} else q=false } else c+=ch } else if(ch==='"') q=true; else if(ch===','){r.push(c);c=''} else if(ch==='\n'){r.push(c);rows.push(r);r=[];c=''} else if(ch!=='\r') c+=ch } if(c||r.length){r.push(c);rows.push(r)} return rows; }
function download(name,text){ const m=$('#modal'); m.innerHTML=`<div class="box" role="dialog" aria-label="내보내기"><h3>${esc(name)}</h3><p class="sub">아래 내용을 복사해 엑셀·메모장에 붙여넣고 ${esc(name)}로 저장하세요(UTF-8).</p><textarea class="inp" id="expT" rows="10" readonly style="font-size:.75rem"></textarea><div class="actions"><button class="btn" id="expC">복사</button><button class="btn ghost" id="expX">닫기</button></div></div>`; $('#expT').value=text.replace(/^\uFEFF/,''); m.classList.add('open'); $('#expX').onclick=()=>m.classList.remove('open'); $('#expC').onclick=async()=>{ try{ await navigator.clipboard.writeText($('#expT').value); toast('복사했습니다.'); }catch(e){ $('#expT').select(); toast('선택된 내용을 Ctrl+C로 복사하세요.'); } }; }

PAGES.admin=app=>{
  let tab=LS.get('gm_tab','dash');
  const reports=()=>D.logs.concat(LS.get('gm_reports',[])).map(l=>({...l,...(LS.get('gm_logst',{})[l.log_id]||{})}));
  function view(){
    $$('.tabs button',app).forEach(b=>b.classList.toggle('on',b.dataset.t===tab));
    const body=$('#ab');
    if(tab==='dash'){
      const n=F.length, by=s=>F.filter(f=>f.data_status===s).length, geo=F.filter(f=>inCity(f.latitude,f.longitude)).length;
      const hrs=F.filter(f=>f.hours&&(f.data_status!=='UNVERIFIED'||f.hours_source)).length, ph=F.filter(f=>f.phone).length, pct=(a,b)=>b?Math.round(a/b*100):0;
      const rp=reports(), open=rp.filter(r=>['RECEIVED','CHECKING'].includes(r.resolution_status)).length;
      const row=(l,a,b,t)=>`<div class="card"><div style="display:flex;justify-content:space-between"><b>${l}</b><span>${pct(a,b)}% <small style="color:var(--mut)">(목표 ${t}%)</small></span></div><div class="bar ${pct(a,b)>=t?'':'warn'}" style="margin-top:8px"><i style="width:${pct(a,b)}%"></i></div></div>`;
      body.innerHTML=`<div class="kpi"><div class="card"><b>${n}</b><span>등록 시설</span></div><div class="card"><b>${by('VERIFIED')}</b><span>검증 완료</span></div><div class="card"><b>${by('UNVERIFIED')+by('RECHECK')}</b><span>미검증·재확인</span></div><div class="card"><b>${open}</b><span>처리 대기 신고</span></div></div>
      <h3>성과 지표(기획서 기준)</h3><div class="grid2">${row('주소·좌표 유효율(광명시 범위)',geo,n,95)}${row('운영시간 검증 등록률',hrs,n,80)}${row('전화번호 확보율',ph,n,95)}${row('검증 완료율',by('VERIFIED'),n,95)}</div>
      <div class="note">※ "데이터 확보율"은 공식 현황(HIRA)과 비교해 산정해야 합니다. 현재 값은 건강보험심사평가원 자료(2026.9.30 기준)로 계산한 참고치입니다.</div>`;
    } else if(tab==='rep'){
      const rp=reports(); body.innerHTML=`<div class="tblwrap"><table class="tbl"><tr><th>ID</th><th>시설</th><th>유형</th><th>내용</th><th>접수</th><th>상태</th></tr>${rp.map(r=>{const f=F.find(x=>x.facility_id===r.facility_id);return `<tr><td>${r.log_id}</td><td>${f?`<a href="#/find?q=${encodeURIComponent(f.facility_name)}">${esc(f.facility_name)}</a>`:esc(r.facility_id)}</td><td>${ISSUE[r.issue_type]||r.issue_type}</td><td>${esc(r.new_value||r.resolution_note||'')}</td><td>${esc(r.reported_at||'')}</td><td><select class="inp rs" data-id="${r.log_id}" style="padding:.2rem">${Object.entries(RES).map(([k,v])=>`<option value="${k}" ${k===r.resolution_status?'selected':''}>${v}</option>`).join('')}</select></td></tr>`}).join('')}</table></div><div class="note">처리 목표: 접수 후 3영업일 이내. 변경 이력은 data_change_logs 구조와 동일한 필드로 저장됩니다(데모는 브라우저 저장).</div>`;
      $$('.rs',body).forEach(s=>s.onchange=()=>{const st=LS.get('gm_logst',{}); st[s.dataset.id]={resolution_status:s.value,resolved_at:['RESOLVED','REJECTED'].includes(s.value)?new Date().toLocaleString('sv').slice(0,16):null}; LS.set('gm_logst',st); view();});
    } else if(tab==='data'){
      body.innerHTML=`<div class="actions" style="margin:0 0 10px"><input class="inp" id="dq" placeholder="시설명 검색" style="max-width:260px"><button class="btn sm" id="ex">CSV 내려받기</button><button class="btn ghost sm" id="im">CSV 가져오기</button><input type="file" id="imf" accept=".csv" hidden><button class="btn warn sm" id="rst">보정·가져오기 초기화</button></div>
       <div class="tblwrap"><table class="tbl"><thead><tr><th>ID</th><th>시설명</th><th>유형</th><th>동</th><th>운영</th><th>데이터 상태</th></tr></thead><tbody id="dtb"></tbody></table></div>
       <div class="note">CSV 열 이름은 데이터 명세서의 시설기본정보 필드명과 같습니다(facility_id, facility_name, facility_type, address_road, dong, latitude, longitude, phone …). 같은 facility_id는 갱신, 없으면 추가됩니다. 운영시간·상세는 API 연동 단계에서 추가합니다.</div>`;
      const draw=()=>{ const q=$('#dq').value.trim(); $('#dtb').innerHTML=F.filter(f=>!q||f.facility_name.includes(q)).map(f=>`<tr><td>${f.facility_id}</td><td>${esc(f.facility_name)}</td><td>${(TYPE[f.facility_type]||{}).l||esc(f.facility_type)}</td><td>${esc(f.dong||'')}</td>
        <td><input type="checkbox" class="act" data-id="${f.facility_id}" ${f.is_active?'checked':''} aria-label="운영 여부"></td>
        <td><select class="inp ds" data-id="${f.facility_id}" style="padding:.2rem">${Object.entries(STATUS).map(([k,v])=>`<option value="${k}" ${k===f.data_status?'selected':''}>${v[0]}</option>`).join('')}</select></td></tr>`).join('');
        const save=(id,patch)=>{const o=LS.get('gm_over',{}); o[id]={...(o[id]||{}),...patch}; LS.set('gm_over',o); const f=F.find(x=>x.facility_id===id); Object.assign(f,patch);};
        $$('.ds').forEach(s=>s.onchange=()=>save(s.dataset.id,{data_status:s.value,verified_at:s.value==='VERIFIED'?new Date().toLocaleString('sv').slice(0,16):null}));
        $$('.act').forEach(s=>s.onchange=()=>save(s.dataset.id,{is_active:s.checked})); };
      draw(); $('#dq').oninput=draw;
      $('#ex').onclick=()=>download('gm_facilities.csv','﻿'+CSV_COLS.join(',')+'\n'+F.map(f=>CSV_COLS.map(c=>csvCell(f[c])).join(',')).join('\n'),'text/csv');
      $('#im').onclick=()=>$('#imf').click();
      $('#imf').onchange=e=>{ const file=e.target.files[0]; if(!file) return; file.text().then(t=>{ const rows=parseCSV(t); const hd=rows[0].map(s=>s.trim()); if(!hd.includes('facility_name')||!hd.includes('facility_type')){alert('필수 열(facility_name, facility_type)이 없습니다.');return;}
        const out=[]; let bad=0; rows.slice(1).filter(r=>r.length>1).forEach((r,i)=>{ const o={}; hd.forEach((h,j)=>{o[h]=r[j]===''?null:r[j]}); o.latitude=parseFloat(o.latitude); o.longitude=parseFloat(o.longitude);
          if(!TYPE[o.facility_type]||isNaN(o.latitude)||isNaN(o.longitude)||!inCity(o.latitude,o.longitude)){bad++;return;} o.facility_id=o.facility_id||'GMH9'+String(i+1).padStart(5,'0'); o.is_active=!/^(false|0)$/i.test(o.is_active||'true'); o.data_status=STATUS[o.data_status]?o.data_status:'UNVERIFIED'; o.sido=o.sido||'경기도'; o.sigungu=o.sigungu||'광명시'; o.collected_at=new Date().toLocaleString('sv').slice(0,16); o.is_sample=false; o.hours=o.hours||null; o.medical=o.medical||{medical_subjects:null}; out.push(o); });
        const prev=LS.get('gm_import',[]); LS.set('gm_import',prev.concat(out)); out.forEach(o=>{ derive(o); const i=F.findIndex(f=>f.facility_id===o.facility_id); if(i>=0) F[i]={...F[i],...o}; else F.push(o); }); toast(`${out.length}건 가져옴, ${bad}건 제외(유형·좌표 오류).`); render(); }); };
      let rstArmed=false; $('#rst').onclick=e=>{ const b=e.currentTarget; if(!rstArmed){ rstArmed=true; b.textContent='한 번 더 누르면 초기화'; setTimeout(()=>{rstArmed=false;b.textContent='보정·가져오기 초기화'},4000); return; } ['gm_import','gm_over','gm_reports','gm_logst'].forEach(k=>{try{localStorage.removeItem(k)}catch(_){}}); F=D.facilities.map(x=>({...x})); F.forEach(derive); render(); toast('초기화했습니다.'); };
    } else if(tab==='src'){
      body.innerHTML=`<div class="tblwrap"><table class="tbl"><tr><th>ID</th><th>출처</th><th>데이터셋/API</th><th>방식</th><th>갱신주기</th><th>이용조건</th><th>API 키</th></tr>${D.sources.map(s=>`<tr><td>${s.source_id}</td><td><a href="${esc(s.source_url)}" target="_blank" rel="noopener">${esc(s.source_name)}</a></td><td>${esc(s.dataset_name)}</td><td>${s.access_method}</td><td>${esc(s.update_cycle)}</td><td>${esc(s.license_terms)}</td><td>${esc(s.api_key_owner||'-')}</td></tr>`).join('')}</table></div>
       <div class="note"><b>API 인증키는 브라우저 코드에 넣지 않고 서버(예: Supabase Edge Function의 환경변수)에서만 관리</b>합니다. 이용허락범위·재사용 조건은 각 원천기관 최신 문서로 확인하세요.</div>`;
    } else if(tab==='pol'){
      body.innerHTML=`<div class="tblwrap"><table class="tbl"><tr><th>검증 항목</th><th>기준</th><th>처리</th></tr>
       ${[['시설 중복','원천 시설코드+출처 우선, 시설명·주소·전화 유사 시 후보 분류','관리자 확인 후 병합'],['주소·좌표','좌표가 광명시 범위 내인지, 주소와 일치하는지','불일치 시 재확인 표시'],['운영시간','시작·종료·휴게·휴무·익일 종료 논리 점검','미검증은 "확인 필요"로 표시'],['폐업·이전','원천 상태 및 확인 결과 반영','삭제 대신 비활성 처리'],['실시간성','등록된 운영시간 ≠ 실시간 진료','기준일·확인일 표시, 전화 확인 안내'],['개인정보','환자 진료·건강정보 수집 안 함','기관 공개정보만 처리']].map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</table></div>`;
    }
  }
  app.innerHTML=head('관리자','데이터 상태·오류 신고·가져오기 관리 (데모: 브라우저 저장 / 운영 시 Supabase 인증·DB로 교체)')+`<div class="wrap"><div class="tabs">${[['dash','대시보드'],['rep','오류 신고'],['data','시설 데이터'],['src','데이터 출처'],['pol','검증 규칙']].map(([k,l])=>`<button data-t="${k}">${l}</button>`).join('')}</div><div id="ab"></div></div>`;
  $$('.tabs button',app).forEach(b=>b.onclick=()=>{tab=b.dataset.t;LS.set('gm_tab',tab);view();});
  view();
};

/* ---------- 구글 시트 연동 (선택: js/sheets-config.js 에 주소를 넣으면 작동) ---------- */
const SHC=window.GM_SHEETS||{};
function parseSheetCSV(t){ const rows=[]; let r=[],c='',q=false; t=t.replace(/^﻿/,'');
  for(let i=0;i<t.length;i++){ const ch=t[i];
    if(q){ if(ch==='"'){ if(t[i+1]==='"'){c+='"';i++;} else q=false; } else c+=ch; }
    else if(ch==='"') q=true; else if(ch===','){ r.push(c); c=''; }
    else if(ch==='\n'||ch==='\r'){ if(ch==='\r'&&t[i+1]==='\n') i++; r.push(c); c=''; if(r.some(x=>x.trim()!=='')) rows.push(r); r=[]; }
    else c+=ch; }
  if(c!==''||r.length){ r.push(c); if(r.some(x=>x.trim()!=='')) rows.push(r); }
  if(!rows.length) return []; const h=rows[0].map(x=>x.trim());
  return rows.slice(1).map(v=>{ const o={}; h.forEach((k,i)=>o[k]=(v[i]||'').trim()); return o; }); }
const fetchSheet=async u=>{ const r=await fetch(u,{cache:'no-store'}); if(!r.ok) throw new Error(r.status); return parseSheetCSV(await r.text()); };
const yes=v=>!/^(n|no|아니|아니오|x|0|false|사용안함|폐업|휴업)$/i.test(String(v||'Y').trim());
function sendReport(rec,f){ if(!SHC.reportUrl) return;
  try{ fetch(SHC.reportUrl,{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({접수번호:rec.log_id,시설ID:f.facility_id,시설명:f.facility_name,유형:rec.issue_type,내용:rec.new_value||'',접수시각:rec.reported_at})}); }catch(e){} }
const SHEET_FIX={'전화':f=>v=>{f.phone=v},'홈페이지':f=>v=>{f.homepage_url=v},'사용여부':f=>v=>{f.is_active=yes(v)},
  '주차':f=>v=>{(f.medical=f.medical||{}).parking_info=v},'접근성':f=>v=>{(f.medical=f.medical||{}).accessibility_info=v.split(/[,，]/).map(x=>x.trim()).filter(Boolean)},
  '예약링크':f=>v=>{(f.medical=f.medical||{}).reservation_url=v},'안내':f=>v=>{ if(f.pharmacy) f.pharmacy.note=v; else (f.medical=f.medical||{}).note=v; }};
async function loadSheets(){
  if(!SHC.welfare&&!SHC.fix&&!SHC.news) return; let changed=false;
  try{ if(SHC.welfare){ const rows=await fetchSheet(SHC.welfare); rows.forEach((r,i)=>{
      const la=parseFloat(r['위도']),lo=parseFloat(r['경도']); if(!r['시설명']||!isFinite(la)||!isFinite(lo)||!inCity(la,lo)) return;
      let dong=r['동']; if(!dong){ let b=1e9; F.forEach(x=>{ const d=(x.latitude-la)**2+(x.longitude-lo)**2; if(d<b){b=d;dong=x.dong;} }); }
      const id='SHW'+String(i+1).padStart(4,'0'); const i0=F.findIndex(x=>x.facility_id===id); if(i0>=0) F.splice(i0,1);
      if(!yes(r['사용여부'])) return;
      F.push({facility_id:id,facility_name:r['시설명'],facility_type:'WELFARE',legal_type:r['분류']||'복지·돌봄',address_road:r['주소']||'',address_jibun:null,sido:'경기도',sigungu:'광명시',dong,latitude:la,longitude:lo,phone:r['전화']||null,homepage_url:r['홈페이지']||null,is_active:true,source_id:'SRC_SHEET',source_updated_at:new Date().toISOString().slice(0,10),verified_at:null,data_status:/검증/.test(r['검증']||'')&&!/미검증/.test(r['검증']||'')?'VERIFIED':'UNVERIFIED',is_sample:false,hours:null,
        welfare:{categories:(r['서비스분류']||r['분류']||'').split(/[,，]/).map(x=>x.trim()).filter(Boolean),target_group:r['이용대상']||'확인 필요',eligibility:[r['이용조건'],r['운영시간']&&('운영: '+r['운영시간'])].filter(Boolean).join(' · ')||'기관에 문의',application_url:r['신청링크']||null}}); changed=true; }); }
  }catch(e){ console.warn('복지시설 시트를 불러오지 못했습니다',e); }
  try{ if(SHC.fix){ const rows=await fetchSheet(SHC.fix); rows.forEach(r=>{ const f=F.find(x=>x.facility_id===r['시설ID']); const fn=SHEET_FIX[r['항목']]; if(f&&fn&&r['새값']!==''){ fn(f)(r['새값']); changed=true; } }); }
  }catch(e){ console.warn('정보수정 시트를 불러오지 못했습니다',e); }
  try{ if(SHC.news){ const rows=await fetchSheet(SHC.news).then(a=>a.filter(r=>r['제목']&&yes(r['표시']))); if(rows.length){ NEWS=rows.map(r=>({tag:r['구분']||'안내',t:r['제목'],d:r['내용']||''})); changed=true; } }
  }catch(e){ console.warn('공지 시트를 불러오지 못했습니다',e); }
  if(changed){ F.forEach(derive); render(); }
}

/* ---------- 초기화 ---------- */
$('#fontBtn').onclick=e=>{ const on=document.documentElement.classList.toggle('big'); e.currentTarget.setAttribute('aria-pressed',on); LS.set('gm_big',on); };
if(LS.get('gm_big',false)){ document.documentElement.classList.add('big'); $('#fontBtn').setAttribute('aria-pressed','true'); }
$('#menuBtn').onclick=()=>$('#nav').classList.toggle('open');
document.addEventListener('keydown',e=>{ if(e.key==='Escape'){ closeDetail(); $('#modal').classList.remove('open'); } });
{ const n=(location.hash||'').replace(/^#\/?/,''); if(PAGES[n]) CUR={route:n,params:{}}; }
render();
loadSheets();
})();
