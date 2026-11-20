/* 광명 건강생활 플랫폼 — 카카오맵 연동 모듈
   window.GM_KAKAO.attach(ctx) : 기존 지도 화면(mountMap)에 카카오맵을 '선택 가능한 배경지도'로 붙입니다.
   - 키가 없거나 카카오 서버에 접속할 수 없으면 아무 일도 하지 않고 내장 지도를 그대로 사용합니다.
   - 좌표계는 WGS84(위도·경도)로 기존 데이터를 그대로 씁니다. */
(function(){
'use strict';
var LSK='gm_kakao_key';

function getKey(){
  var k=String(window.GM_KAKAO_KEY||'').trim();
  if(!k){ try{ k=String(localStorage.getItem(LSK)||'').trim(); }catch(e){} }
  return k;
}
function setKey(k){ try{ if(k) localStorage.setItem(LSK,k); else localStorage.removeItem(LSK); }catch(e){} }

/* ---------- SDK 불러오기 (한 번만) ---------- */
var sdkP=null, sdkKey='';
function loadSdk(){
  var key=getKey();
  if(!key) return Promise.resolve(false);
  if(window.kakao&&window.kakao.maps&&window.kakao.maps.Map) return Promise.resolve(true);
  if(sdkP&&sdkKey===key) return sdkP;
  sdkKey=key;
  sdkP=new Promise(function(res){
    var done=false, tm=null;
    function fin(ok){ if(done) return; done=true; clearTimeout(tm); res(ok); }
    tm=setTimeout(function(){ fin(false); },9000);
    var s=document.createElement('script');
    s.src='https://dapi.kakao.com/v2/maps/sdk.js?appkey='+encodeURIComponent(key)+'&autoload=false';
    s.async=true;
    s.onload=function(){ try{ window.kakao.maps.load(function(){ fin(true); }); }catch(e){ fin(false); } };
    s.onerror=function(){ fin(false); };
    document.head.appendChild(s);
  }).then(function(ok){ if(!ok) sdkP=null; return ok; });
  return sdkP;
}

/* ---------- 화면에 붙이기 ---------- */
function attach(c){
  var el=c.el, map=c.map, L=c.L, D=c.D, THRESH=c.THRESH, esc=c.esc, toast=c.toast||function(){};
  var box=el.querySelector('.mapbox'), tools=el.querySelector('.maptools');
  var zh=el.querySelector('#zh'), note=el.querySelector('#mapnote');
  var noteTxt0=note?note.textContent:'';
  var kdiv=document.createElement('div'); kdiv.id='kmap'; box.insertBefore(kdiv,box.firstChild);

  var on=false, kmap=null, ovs=[], circ=null, type='road';
  var K=window.kakao;           // SDK 로드 후 window.kakao 로 접근
  function ll(la,lo){ return new window.kakao.maps.LatLng(la,lo); }
  function zoomNow(){ return (on&&kmap)? 21-kmap.getLevel() : map.getZoom(); }   // 카카오 레벨 ↔ 줌(근사: 줌 = 21 − 레벨)
  function lvOf(z){ return Math.max(1,Math.min(14,Math.round(21-z))); }

  /* 버튼 */
  function mkBtn(txt,tip){ var b=document.createElement('button'); b.type='button'; b.className='btn sm kk'; b.textContent=txt; b.title=tip; return b; }
  var bK=mkBtn('카카오맵','카카오맵 일반 지도'), bS=mkBtn('카카오 위성','카카오맵 위성+지명');
  tools.insertBefore(bS,tools.firstChild); tools.insertBefore(bK,tools.firstChild);
  function mark(){
    bK.classList.toggle('on',on&&type==='road'); bS.classList.toggle('on',on&&type==='hybrid');
    if(on) [].forEach.call(tools.querySelectorAll('[data-ly]'),function(b){ b.classList.remove('on'); });
  }

  /* 이동 함수 — 기존 Leaflet 호출(map.flyTo 등)을 카카오가 켜져 있을 때만 가로챔 */
  function kFlyTo(a,z){
    if(!kmap) return; var p=Array.isArray(a)?a:[a.lat,a.lng];
    kmap.setLevel(lvOf(z==null?zoomNow():z)); kmap.panTo(ll(p[0],p[1]));
  }
  function kFit(b,o){
    if(!kmap) return; var lb=L.latLngBounds(b), sw=lb.getSouthWest(), ne=lb.getNorthEast();
    kmap.setBounds(new window.kakao.maps.LatLngBounds(ll(sw.lat,sw.lng),ll(ne.lat,ne.lng)),30,30,30,30);
    var mz=o&&o.maxZoom; if(mz){ var minLv=lvOf(mz); if(kmap.getLevel()<minLv) kmap.setLevel(minLv); }
  }
  var _fly=map.flyTo.bind(map), _flyB=map.flyToBounds.bind(map), _fit=map.fitBounds.bind(map);
  map.flyTo=function(a,z,o){ return on?kFlyTo(a,z):_fly(a,z,o); };
  map.flyToBounds=function(b,o){ return on?kFit(b,o):_flyB(b,o); };
  map.fitBounds=function(b,o){ return on?kFit(b,o):_fit(b,o); };

  /* 마커·동 요약·기준점 그리기 */
  function clearOv(){ ovs.forEach(function(o){ o.setMap(null); }); ovs=[]; if(circ){ circ.setMap(null); circ=null; } }
  function addOv(pos,node,z,xa,ya){
    var o=new window.kakao.maps.CustomOverlay({position:pos,content:node,xAnchor:xa,yAnchor:ya,zIndex:z,clickable:true});
    o.setMap(kmap); ovs.push(o); return o;
  }
  function render(){
    if(!on||!kmap) return;
    clearOv();
    var st=c.getState(), z=zoomNow(), fine=z>=THRESH;
    kdiv.classList.toggle('z-xh',z>=17);
    if(zh) zh.textContent=fine?('세부지도 · 줌 '+z+' (건물 단위) · 카카오맵'):('동별 요약 · 동 원을 누르면 세부지도로 확대 (줌 '+z+') · 카카오맵');
    if(fine){
      st.res.forEach(function(f){
        var sel=f.facility_id===st.selId, n=document.createElement('div');
        n.innerHTML=c.mkHtml(f,sel); n.style.cursor='pointer'; n.title=f.facility_name; n.tabIndex=0; n.setAttribute('role','button');
        function go(){ c.onSelect(f.facility_id); }
        n.addEventListener('click',go); n.addEventListener('keydown',function(e){ if(e.key==='Enter') go(); });
        addOv(ll(f.latitude,f.longitude),n,sel?100:10,0.5,1);
      });
    } else {
      var by={}; st.res.forEach(function(f){ (by[f.dong]=by[f.dong]||[]).push(f); });
      Object.keys(by).forEach(function(d){
        if(!D.dongs[d]) return; var arr=by[d];
        var la=arr.reduce(function(a,f){return a+f.latitude;},0)/arr.length, lo=arr.reduce(function(a,f){return a+f.longitude;},0)/arr.length;
        var n=document.createElement('div');
        n.innerHTML='<div class="dongb"><div><b>'+esc(d)+'</b><span>'+arr.length+'</span></div></div>'; n.title=d+' '+arr.length+'곳';
        n.addEventListener('click',function(){ kFit(L.latLngBounds(arr.map(function(f){return [f.latitude,f.longitude];})).pad(.3),{maxZoom:17}); });
        addOv(ll(la,lo),n,5,0.5,0.5);
      });
    }
    var ref=st.S.ref;
    if(ref){
      var p=document.createElement('div'); p.style.cssText='font-size:26px;line-height:1;filter:drop-shadow(0 2px 2px #0006);pointer-events:none'; p.textContent='📍';
      addOv(ll(ref[0],ref[1]),p,200,0.5,0.9);
      if(st.S.radius){
        circ=new window.kakao.maps.Circle({center:ll(ref[0],ref[1]),radius:st.S.radius,strokeWeight:2,strokeColor:'#0f766e',strokeOpacity:1,strokeStyle:'solid',fillColor:'#0f766e',fillOpacity:0.08});
        circ.setMap(kmap);
      }
    }
  }

  function setType(t){
    type=t; if(!kmap) return;
    var T=window.kakao.maps.MapTypeId; kmap.setMapTypeId(t==='hybrid'?T.HYBRID:T.ROADMAP); mark();
  }

  function activate(t){
    if(!window.kakao||!window.kakao.maps||!el.isConnected) return false;
    var b0=map.getBounds();                       // 지금 보던 구역을 그대로 유지
    map.getContainer().style.display='none'; kdiv.style.display='block';
    if(!kmap){
      kmap=new window.kakao.maps.Map(kdiv,{center:ll(37.4784,126.8644),level:6});
      window.kakao.maps.event.addListener(kmap,'zoom_changed',render);
      window.kakao.maps.event.addListener(kmap,'click',function(e){ c.onPick(e.latLng.getLat(),e.latLng.getLng()); });
      try{ kmap.addControl(new window.kakao.maps.ZoomControl(),window.kakao.maps.ControlPosition.BOTTOMRIGHT); }catch(e){}
    } else kmap.relayout();
    on=true; if(note) note.style.display='none';
    setType(t||type); kFit(b0); render(); mark();
    return true;
  }
  function deactivate(){
    if(!on) return; on=false;
    var b=null; try{ b=kmap.getBounds(); }catch(e){}
    kdiv.style.display='none'; map.getContainer().style.display=''; clearOv(); mark(); map.invalidateSize();
    if(b){ var sw=b.getSouthWest(), ne=b.getNorthEast(); _fit(L.latLngBounds([sw.getLat(),sw.getLng()],[ne.getLat(),ne.getLng()])); }
    map.fire('zoomend');
  }
  [].forEach.call(tools.querySelectorAll('[data-ly]'),function(b){ b.addEventListener('click',deactivate); });

  /* 연결 시도 */
  function fail(){
    if(!note) return;
    note.textContent='카카오맵을 불러오지 못해 내장 지도를 보여 드립니다. 키·등록한 사이트 주소·인터넷 연결을 확인해 주세요. (Claude 미리보기 창 안에서는 카카오 서버 접속이 막혀 있어 나오지 않습니다.)';
    note.style.display='block';
    setTimeout(function(){ if(!on){ note.style.display='none'; note.textContent=noteTxt0; } },12000);
  }
  function connect(manual,t){
    if(!getKey()){ if(manual) openModal(); return Promise.resolve(false); }
    if(manual) toast('카카오맵을 불러오는 중입니다…');
    return loadSdk().then(function(ok){
      if(!el.isConnected) return false;
      if(ok&&activate(t)) return true;
      fail(); return false;
    });
  }
  function choose(t){ if(on) setType(t); else connect(true,t); }
  bK.onclick=function(){ choose('road'); }; bS.onclick=function(){ choose('hybrid'); };

  /* 키 입력 안내창 (초보자용 순서 안내) */
  function openModal(){
    var m=document.getElementById('modal'); if(!m) return;
    var origin=/^https?:/.test(location.origin)?location.origin:'https://내아이디.github.io';
    m.innerHTML='<div class="box" role="dialog" aria-label="카카오맵 연결"><h3>카카오맵 연결하기</h3>'
     +'<p class="sub">카카오맵은 카카오의 규칙에 따라 <b>내가 직접 발급받은 \'JavaScript 키\'</b>가 있어야 나옵니다. 아래 순서대로 <b>딱 한 번만</b> 하시면 됩니다.</p>'
     +'<ol class="kk-steps">'
     +'<li>인터넷 주소창에 <b>developers.kakao.com</b> 을 입력해 들어가 카카오 계정으로 로그인합니다. <a href="https://developers.kakao.com/" target="_blank" rel="noopener">바로 가기 ↗</a></li>'
     +'<li>위쪽 메뉴 <b>[앱]</b>(또는 내 애플리케이션)에서 <b>[앱 만들기]</b>를 누르고 이름(예: 광명건강생활)을 적어 저장합니다.</li>'
     +'<li>만든 앱 화면에서 <b>카카오맵 사용 설정을 ON</b>(활성화)으로 바꿉니다.</li>'
     +'<li><b>[플랫폼 키] → [JavaScript 키]</b>를 누르고, <b>[JavaScript SDK 도메인]</b> 칸에 이 사이트 주소 <code>'+esc(origin)+'</code> 를 적어 저장합니다.</li>'
     +'<li>같은 화면의 <b>JavaScript 키</b>(영어·숫자가 섞인 긴 글자)를 복사해서 아래 칸에 붙여넣고 <b>[저장하고 연결]</b>을 누릅니다.</li></ol>'
     +'<div class="fld"><label for="kkKey">JavaScript 키</label><input class="inp" id="kkKey" autocomplete="off" spellcheck="false" placeholder="여기에 붙여넣기" value="'+esc(getKey())+'"></div>'
     +'<div class="note">※ 카카오 화면의 메뉴 이름은 바뀔 수 있습니다.<br>※ 주소가 정해진 내 사이트(예: https://…github.io)에서만 작동합니다. Claude 미리보기 창 안에서는 카카오 서버 접속이 막혀 있어 나오지 않습니다.<br>※ 입력한 키는 이 브라우저에만 저장됩니다. 모든 방문자에게 보이게 하려면 js/kakao-config.js 파일에 키를 넣어 주세요.</div>'
     +'<div class="actions"><button class="btn" id="kkOk" type="button">저장하고 연결</button><button class="btn ghost" id="kkDel" type="button">키 지우기</button><button class="btn ghost" id="kkNo" type="button">닫기</button></div></div>';
    m.classList.add('open'); m.setAttribute('aria-hidden','false');
    function close(){ m.classList.remove('open'); m.setAttribute('aria-hidden','true'); }
    m.onclick=function(e){ if(e.target===m) close(); };
    m.querySelector('#kkNo').onclick=close;
    m.querySelector('#kkDel').onclick=function(){ setKey(''); m.querySelector('#kkKey').value=''; toast('저장된 키를 지웠습니다.'); };
    m.querySelector('#kkOk').onclick=function(){
      var v=String(m.querySelector('#kkKey').value||'').trim().replace(/["']/g,'');
      if(!/^[A-Za-z0-9]{16,}$/.test(v)){ toast('키 모양이 맞지 않습니다. 영어·숫자로 된 긴 글자(JavaScript 키)를 그대로 붙여넣어 주세요.'); return; }
      setKey(v); close(); connect(true,'road');
    };
    setTimeout(function(){ var i=m.querySelector('#kkKey'); if(i) i.focus(); },30);
  }

  if(getKey()) setTimeout(function(){ connect(false,'road'); },50);   // 키가 있으면 자동 연결
  return { render:render, zoom:zoomNow, isOn:function(){ return on; } };
}

window.GM_KAKAO={attach:attach,getKey:getKey,setKey:setKey,loadSdk:loadSdk};
})();
