const $ = id => document.getElementById(id);
const esc = text => String(text ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const sample = [
  {name:"断桥残雪",lng:120.1491,lat:30.2592},
  {name:"灵隐寺",lng:120.1014,lat:30.2408},
  {name:"龙井村",lng:120.1063,lat:30.2186},
  {name:"河坊街",lng:120.1745,lat:30.2384},
  {name:"西湖文化广场",lng:120.1654,lat:30.2794}
].map(p=>({...p,id:crypto.randomUUID(),address:"杭州 · 示例地点"}));
function read(key){try{return JSON.parse(localStorage.getItem(key));}catch{return null;}}
function point(p){return p && typeof p.name==="string" ? {...p,id:p.id||crypto.randomUUID()} : null;}
const old = read("trip-stops");
const saved = read("tuji-trip-v2");
const initial = Array.isArray(old) ? old.map(point).filter(Boolean) : sample;
const state = {
  start:point(saved ? saved.start : initial[0]),
  end:point(saved ? saved.end : initial.length>1 ? initial.at(-1) : null),
  via:(saved?.via || initial.slice(1,-1)).map(point).filter(Boolean),
  mode:saved?.mode || "driving", round:!!saved?.round, sort:saved?.sort!==false,
  map:null, ready:false, markers:[], lines:[], routes:[], selected:0,
  revision:0, busy:false, pick:null, searchToken:0,
  view:{x:0,y:0,w:1200,h:900}
};
const coord = p => p && Number.isFinite(p.lng) && Number.isFinite(p.lat);
const trip = () => [state.start,...state.via,state.round ? state.start : state.end].filter(Boolean);
function persist(){try{localStorage.setItem("tuji-trip-v2",JSON.stringify({start:state.start,end:state.end,via:state.via,mode:state.mode,round:state.round,sort:state.sort}));}catch{}}
function toast(text){$("toast").textContent=text;$("toast").classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>$("toast").classList.remove("show"),2800);}
function status(text){$("statusLine").textContent=text;}
function clearLines(){if(state.map && state.lines.length)state.map.remove(state.lines);state.lines=[];$("demoRoutes").replaceChildren();}
function invalidate(message="地点已更新，确认后重新预览路线"){
  state.revision++;state.busy=false;state.routes=[];$("routeSummary").hidden=true;clearLines();$("optimizeButton").disabled=false;
  status(message);
}
function update(){invalidate();persist();render();}
function clearAll(){state.start=null;state.end=null;state.via=[];state.pick=null;state.searchToken++;$("searchResults").hidden=true;$("placeInput").value="";update();status("所有地点已清空，请设置起点和终点");}
function rolePoints(){return [{p:state.start,key:"start",label:"起"},...state.via.map((p,i)=>({p,key:p.id,label:String(i+1)})),...(!state.round ? [{p:state.end,key:"end",label:"终"}] : [])].filter(x=>x.p);}
function render(){
  $("startInput").value=state.start?.name||"";
  $("endInput").value=state.round ? state.start?.name||"" : state.end?.name||"";
  $("endInput").disabled=state.round;
  document.querySelectorAll('[data-pick="end"],[data-remove="end"]').forEach(b=>b.disabled=state.round);
  $("swapEndpoints").disabled=state.round;
  $("roundTrip").checked=state.round;$("sortStops").checked=state.sort;
  document.querySelectorAll(".mode").forEach(b=>{const selected=b.dataset.mode===state.mode;b.classList.toggle("active",selected);b.setAttribute("aria-pressed",String(selected));});
  $("pointCount").textContent=rolePoints().length+" 个地点";
  $("stopList").innerHTML=state.via.length ? state.via.map((p,i)=>`<li class="stop-item" data-id="${p.id}"><span class="stop-number">${i+1}</span><span class="stop-copy"><strong>${esc(p.name)}</strong><small>${esc(p.address||"可拖动地图标记调整位置")}</small></span><span class="stop-actions"><button class="mini-button" data-action="start" title="设为起点" aria-label="将${esc(p.name)}设为起点">起</button><button class="mini-button" data-action="end" title="设为终点" aria-label="将${esc(p.name)}设为终点">终</button>${i ? '<button class="mini-button" data-action="up" aria-label="途经点上移">↑</button>' : ""}<button class="remove-button" data-action="remove" aria-label="删除${esc(p.name)}">×</button></span></li>`).join("") : '<li class="empty-stops">可添加想去的景点，也可直接规划两点路线。</li>';
  const live=state.ready && state.mode==="driving";
  $("trafficState").textContent=live?"已接入":state.ready?"无需路况":"未接入";
  document.querySelector(".traffic-pill").classList.toggle("live",live);
  $("mapHint").textContent=state.pick ? "点击地图选择"+({start:"起点",end:"终点",via:"途经点"}[state.pick])+" · 再次点击选点按钮可取消" : (state.ready?"":"示意地图 · ")+"拖动平移 · 滚轮缩放 · 拖动标记";
  $("demoMap").classList.toggle("picking",!!state.pick);
  renderMarkers();
}
function assign(role,p){
  if(role==="start") state.start=p;else if(role==="end"){state.round=false;state.end=p;}
  else {if(state.via.length>=16)return toast("最多添加 16 个途经点");state.via.push(p);}
  state.pick=null;update();
}
$("clearAll").onclick=clearAll;
document.querySelectorAll("[data-remove]").forEach(b=>b.onclick=()=>{state[b.dataset.remove]=null;update();});
$("swapEndpoints").onclick=()=>{[state.start,state.end]=[state.end,state.start];update();};
$("stopList").onclick=e=>{
  const b=e.target.closest("[data-action]");if(!b)return;
  const index=state.via.findIndex(p=>p.id===b.closest("[data-id]").dataset.id);if(index<0)return;
  const action=b.dataset.action;
  if(action==="up"){[state.via[index-1],state.via[index]]=[state.via[index],state.via[index-1]];update();return;}
  const [p]=state.via.splice(index,1);
  if(action==="start"||action==="end"){
    if(state[action])state.via.splice(index,0,state[action]);
    state[action]=p;if(action==="end")state.round=false;
  }
  update();
};
document.querySelectorAll(".mode").forEach(b=>b.onclick=()=>{state.mode=b.dataset.mode;update();});
$("roundTrip").onchange=e=>{state.round=e.target.checked;update();};
$("sortStops").onchange=e=>{state.sort=e.target.checked;update();};
document.querySelectorAll("[data-pick]").forEach(b=>b.onclick=()=>{state.pick=state.pick===b.dataset.pick?null:b.dataset.pick;render();});
$("pickVia").onclick=()=>{state.pick=state.pick==="via"?null:"via";render();};
function editedEndpoint(role,input){
  const name=input.value.trim(),previous=state[role];
  state[role]=name ? (previous?.name===name ? previous : {id:previous?.id||crypto.randomUUID(),name}) : null;
  invalidate();persist();renderMarkers();
  if(state.round)$("endInput").value=state.start?.name||"";
}
["start","end"].forEach(role=>{
  const input=$(role+"Input");
  input.oninput=()=>{editedEndpoint(role,input);state.searchToken++;$("searchResults").hidden=true;clearTimeout(input.timer);const token=state.searchToken;if(input.value.trim())input.timer=setTimeout(()=>search(role,input.value.trim(),token),550);};
  input.onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();clearTimeout(input.timer);search(role,input.value.trim(),++state.searchToken);}};
});
$("addPlaceForm").onsubmit=e=>{e.preventDefault();search("via",$("placeInput").value.trim(),++state.searchToken);};
function normalizePoi(p,source="关键词"){
  if(!p?.location)return null;
  return {id:p.id||p.uid||"",name:p.name||p.address||"地图地点",address:[p.cityname,p.adname,p.district,p.address].filter(Boolean).join(" "),location:p.location,source};
}
function mergePois(groups){
  const seen=new Set(),result=[];
  for(const group of groups)for(const raw of group||[]){
    const p=normalizePoi(raw,raw.source)||raw;if(!p?.location)continue;
    const lng=Number(p.location.lng??p.location.getLng?.()),lat=Number(p.location.lat??p.location.getLat?.());
    const key=p.id||[p.name,lng.toFixed(5),lat.toFixed(5)].join("|");
    if(!seen.has(key)){seen.add(key);result.push({...p,location:{lng,lat}});}
  }
  return result.slice(0,20);
}
function placeSearch(keyword,options={}){
  return new Promise(resolve=>{
    const service=new AMap.PlaceSearch({pageSize:20,pageIndex:1,city:options.city||"全国",citylimit:!!options.citylimit,extensions:"all",children:1});
    const done=(s,data)=>resolve(s==="complete"?(data?.poiList?.pois||[]).filter(p=>p.location).map(p=>({...p,source:options.source||"关键词"})):[]);
    if(options.near&&service.searchNearBy)service.searchNearBy(keyword,options.near,50000,done);else service.search(keyword,done);
  });
}
function inputTips(keyword){
  return new Promise(resolve=>{
    if(!AMap.AutoComplete)return resolve([]);
    new AMap.AutoComplete({city:"全国",citylimit:false,datatype:"all"}).search(keyword,(s,data)=>resolve(s==="complete"?(data?.tips||[]).filter(p=>p.location).map(p=>({...p,source:"输入联想"})):[]));
  });
}
function cityVariants(keyword){
  if(!/^[\u3400-\u9fff]{4,}$/.test(keyword))return [];
  const variants=[];
  for(const length of [2,3,4]){
    if(keyword.length-length<2)continue;
    variants.push({city:keyword.slice(0,length).replace(/市$/,""),term:keyword.slice(length),source:"城市匹配"});
  }
  return variants;
}
async function requestSearch(keyword){
  const tasks=[placeSearch(keyword),inputTips(keyword)];
  const center=state.map?.getCenter?.();
  if(center)tasks.push(placeSearch(keyword,{near:center,source:"地图附近"}));
  cityVariants(keyword).forEach(v=>tasks.push(placeSearch(v.term,{city:v.city,citylimit:true,source:v.source})));
  let timer;
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error("地点搜索超时，请重试")),18000);});
  let settled;
  try{settled=await Promise.race([Promise.allSettled(tasks),timeout]);}finally{clearTimeout(timer);}
  const pois=mergePois(settled.filter(x=>x.status==="fulfilled").map(x=>x.value));
  if(!pois.length)throw new Error("高德仍未找到该地点。可粘贴 Apple 地图分享链接，或在地图上手动选点");
  return pois;
}
function importedLocation(value){
  const text=value.trim();
  const direct=text.match(/^\s*(-?\d{1,3}(?:\.\d+)?)\s*[,，]\s*(-?\d{1,2}(?:\.\d+)?)\s*$/);
  if(direct){
    const lng=Number(direct[1]),lat=Number(direct[2]);
    if(Math.abs(lng)<=180&&Math.abs(lat)<=90)return {id:crypto.randomUUID(),name:"坐标点",address:lng.toFixed(6)+", "+lat.toFixed(6),lng,lat};
  }
  if(!/^https?:\/\//i.test(text)||!/(?:maps\.apple\.com|maps\.apple)/i.test(text))return null;
  try{
    const url=new URL(text),pair=url.searchParams.get("ll")||url.searchParams.get("coordinate")||url.searchParams.get("center");
    if(!pair)throw new Error("这个 Apple 地图链接不含坐标。请在 Apple 地图打开该地点，选择“共享 → 拷贝”后再粘贴");
    const [lat,lng]=pair.split(",").map(Number);
    if(!Number.isFinite(lat)||!Number.isFinite(lng))throw new Error("Apple 地图链接中的坐标无法识别");
    return {id:crypto.randomUUID(),name:url.searchParams.get("q")||url.searchParams.get("name")||"Apple 地图地点",address:url.searchParams.get("address")||"从 Apple 地图导入",lng,lat};
  }catch(error){throw new Error(error.message||"无法读取 Apple 地图链接");}
}
async function search(role,keyword,token){
  if(!keyword)return;
  try{
    const imported=importedLocation(keyword);
    if(imported){
      assign(role,imported);if(role==="via")$("placeInput").value="";
      $("searchResults").hidden=true;fitMap();toast("已从链接或坐标导入地点");return;
    }
  }catch(error){$("searchResults").hidden=false;$("searchResults").innerHTML="<p>"+esc(error.message)+"</p>";return;}
  if(!state.ready){
    const match=sample.find(p=>p.name===keyword);
    if(role==="via")assign(role,match?{...match,id:crypto.randomUUID()}:{id:crypto.randomUUID(),name:keyword,address:"待接入高德后定位"});
    else if(match){state[role]={...match,id:state[role]?.id||crypto.randomUUID()};update();}
    status("当前为示意地图。接入高德后可搜索真实地点；也可用地图选点体验。");
    return;
  }
  const box=$("searchResults");box.hidden=false;box.innerHTML="<p>正在搜索地点…</p>";
  try{
    const pois=await requestSearch(keyword);if(token!==state.searchToken)return;
    box.innerHTML=pois.map((p,i)=>`<button data-poi="${i}"><strong>${esc(p.name)}</strong><small>${esc(p.address||"地址信息暂无")} · ${esc(p.source||"高德")}</small></button>`).join("");
    box.onclick=e=>{const b=e.target.closest("[data-poi]");if(!b)return;const p=pois[Number(b.dataset.poi)];
      assign(role,{id:crypto.randomUUID(),name:p.name,address:p.address||"高德地点",lng:p.location.lng,lat:p.location.lat});
      if(role==="via")$("placeInput").value="";box.hidden=true;state.searchToken++;fitMap();
    };
  }catch(error){if(token===state.searchToken)box.innerHTML="<p>"+esc(error.message)+"</p>";}
}
function mapXY(p){return [(p.lng-120.075)/.13*1200,(30.305-p.lat)/.11*900];}
function coordinates(x,y){return {lng:120.075+x/1200*.13,lat:30.305-y/900*.11};}
function moved(p,lng,lat){
  p.lng=lng;p.lat=lat;p.name="地图选点";p.address=lng.toFixed(5)+", "+lat.toFixed(5);
}
function markerMove(key,lng,lat){
  const p=key==="start"?state.start:key==="end"?state.end:state.via.find(p=>p.id===key);
  if(!p)return;moved(p,lng,lat);update();
}
function renderMarkers(){
  const points=rolePoints().filter(x=>coord(x.p));
  if(state.ready){
    if(state.markers.length)state.map.remove(state.markers);
    state.markers=points.map(({p,key,label})=>{
      const m=new AMap.Marker({position:[p.lng,p.lat],title:p.name,draggable:true,content:`<span class="map-marker" style="background:${key==="end"?"#ef4444":"#007aff"}">${label}</span>`,offset:new AMap.Pixel(-15,-15),zIndex:150});
      m.on("dragstart",()=>invalidate("位置调整中，确认后重新预览"));
      m.on("dragend",e=>markerMove(key,e.lnglat.lng,e.lnglat.lat));return m;
    });state.map.add(state.markers);return;
  }
  const scale=1/($("demoSvg").getScreenCTM?.()?.a||1);
  $("demoPins").innerHTML=points.map(({p,key,label})=>{const [x,y]=mapXY(p);return `<g class="demo-pin" data-key="${key}" transform="translate(${x} ${y}) scale(${scale})"><circle r="17" fill="${key==="end"?"#ef4444":"#007aff"}"/><text>${label}</text></g>`;}).join("");
}
function pickAt(lng,lat){
  if(!state.pick)return;const role=state.pick;
  assign(role,{id:crypto.randomUUID(),name:"地图选点",address:lng.toFixed(5)+", "+lat.toFixed(5),lng,lat});
}
const svg=$("demoSvg"), demo=$("demoMap");
function localXY(e){const m=svg.getScreenCTM();if(!m)return {x:0,y:0};return new DOMPoint(e.clientX,e.clientY).matrixTransform(m.inverse());}
function applyView(){const v=state.view;svg.setAttribute("viewBox",[v.x,v.y,v.w,v.h].join(" "));if(!state.ready)renderMarkers();}
let drag=null;
demo.onpointerdown=e=>{
  if(e.button!==0)return;
  const pos=localXY(e),pin=e.target.closest("[data-key]");
  drag={id:e.pointerId,sx:e.clientX,sy:e.clientY,last:pos,key:pin?.dataset.key,moved:false};
  demo.setPointerCapture(e.pointerId);demo.classList.add("dragging");
};
demo.onpointermove=e=>{
  if(!drag||e.pointerId!==drag.id)return;
  const pos=localXY(e);if(Math.hypot(e.clientX-drag.sx,e.clientY-drag.sy)>4)drag.moved=true;
  if(!drag.moved)return;
  if(drag.key){
    if(!drag.invalidated){invalidate("地点已移动，确认后重新预览");drag.invalidated=true;}
    const p=rolePoints().find(x=>x.key===drag.key)?.p;
    if(p){Object.assign(p,coordinates(pos.x,pos.y));renderMarkers();}
  }else{state.view.x-=pos.x-drag.last.x;state.view.y-=pos.y-drag.last.y;applyView();}
  drag.last=localXY(e);
};
function endDrag(e){
  if(!drag||e.pointerId!==drag.id)return;const d=drag;drag=null;demo.classList.remove("dragging");
  if(d.key&&d.moved){const p=rolePoints().find(x=>x.key===d.key)?.p;if(p)markerMove(d.key,p.lng,p.lat);}
  else if(!d.moved&&state.pick){const q=localXY(e),c=coordinates(q.x,q.y);pickAt(c.lng,c.lat);}
}
demo.onpointerup=endDrag;demo.onpointercancel=e=>{if(drag?.moved&&drag.key){persist();render();}drag=null;demo.classList.remove("dragging");};
function zoom(factor,anchor){
  if(state.ready){state.map.setZoom(state.map.getZoom()+(factor<1?1:-1));return;}
  const v=state.view;const q=anchor||{x:v.x+v.w/2,y:v.y+v.h/2};const w=Math.max(150,Math.min(6000,v.w*factor)),f=w/v.w;
  state.view={x:q.x-(q.x-v.x)*f,y:q.y-(q.y-v.y)*f,w,h:v.h*f};applyView();
}
demo.addEventListener("wheel",e=>{e.preventDefault();zoom(e.deltaY>0?1.14:1/1.14,localXY(e));},{passive:false});
$("zoomIn").onclick=()=>zoom(.8);$("zoomOut").onclick=()=>zoom(1.25);
function fitMap(){
  if(state.ready){const all=[...state.markers,...state.lines];if(all.length)state.map.setFitView(all,false,innerWidth>800?[90,90,140,410]:[60,60,70,60]);return;}
  const points=rolePoints().filter(x=>coord(x.p)).map(x=>mapXY(x.p));
  if(!points.length)state.view={x:0,y:0,w:1200,h:900};
  else{const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);const w=Math.max(800,Math.max(...xs)-Math.min(...xs)+500),h=Math.max(600,Math.max(...ys)-Math.min(...ys)+300);
    state.view={x:(Math.min(...xs)+Math.max(...xs)-w)/2-(innerWidth>800?w*.16:0),y:(Math.min(...ys)+Math.max(...ys)-h)/2,w,h};}
  applyView();
}
$("fitMapButton").onclick=fitMap;
$("closePreview").onclick=()=>{invalidate("预览已收起，可继续调整地点");};
function checkRevision(rev){if(rev!==state.revision)throw new Error("行程已更改");}
function query(points,mode,policy){
  return new Promise((resolve,reject)=>{
    const opts={policy,extensions:"all",hideMarkers:true,autoFitView:false};
    const service=mode==="walking"?new AMap.Walking(opts):mode==="riding"?new AMap.Riding(opts):new AMap.Driving(opts);
    const timer=setTimeout(()=>reject(new Error("路线请求超时，请重试")),20000);
    const callback=(status,data)=>{
      clearTimeout(timer);
      if(status!=="complete"||!data?.routes?.length)return reject(new Error("该路线暂不可用，请检查地点或高德服务额度"));
      const routes=data.routes.map(route=>{
        const path=(route.steps||[]).flatMap(step=>step.path||[]).map(p=>[p.lng??p.getLng?.()??p[0],p.lat??p.getLat?.()??p[1]]);
        return {time:Number(route.time),distance:Number(route.distance),path};
      }).filter(r=>r.path.length>1&&Number.isFinite(r.time)&&Number.isFinite(r.distance));
      routes.length?resolve(routes):reject(new Error("未返回可用路线"));
    };
    const a=[points[0].lng,points[0].lat],b=[points.at(-1).lng,points.at(-1).lat];
    if(mode==="driving")service.search(a,b,{waypoints:points.slice(1,-1).map(p=>[p.lng,p.lat])},callback);
    else service.search(a,b,callback);
  });
}
function bestOrder(matrix){
  const n=matrix.length,m=n-2;if(m<=0)return [0,n-1];
  if(m>9){
    const remaining=new Set(Array.from({length:m},(_,i)=>i+1)),order=[0];
    while(remaining.size){let next=[...remaining].sort((a,b)=>matrix[order.at(-1)][a]-matrix[order.at(-1)][b])[0];order.push(next);remaining.delete(next);}
    return [...order,n-1];
  }
  const size=1<<m,dp=Array.from({length:size},()=>Array(m).fill(Infinity)),prev=Array.from({length:size},()=>Array(m).fill(-1));
  for(let j=0;j<m;j++)dp[1<<j][j]=matrix[0][j+1];
  for(let mask=1;mask<size;mask++)for(let j=0;j<m;j++)if(mask&(1<<j)){
    const rest=mask^(1<<j);for(let k=0;k<m;k++)if(rest&(1<<k)){
      const cost=dp[rest][k]+matrix[k+1][j+1];if(cost<dp[mask][j]){dp[mask][j]=cost;prev[mask][j]=k;}
    }
  }
  let last=0;for(let j=1;j<m;j++)if(dp[size-1][j]+matrix[j+1][n-1]<dp[size-1][last]+matrix[last+1][n-1])last=j;
  const result=[];let mask=size-1;
  while(last>=0){result.push(last+1);const next=prev[mask][last];mask^=1<<last;last=next;}
  return [0,...result.reverse(),n-1];
}
async function optimizePoints(points,rev){
  if(!state.sort||points.length<4)return points;
  const n=points.length,matrix=Array.from({length:n},()=>Array(n).fill(Infinity));let done=0;
  for(let i=0;i<n-1;i++)for(let j=1;j<n;j++){
    if(i===j){matrix[i][j]=0;continue;}checkRevision(rev);
    status("正在比较途经点顺序 "+(++done)+"/"+((n-1)*(n-1)-(n-2)));
    if(points[i].lng===points[j].lng&&points[i].lat===points[j].lat){matrix[i][j]=0;continue;}
    matrix[i][j]=(await query([points[i],points[j]],state.mode,AMap.DrivingPolicy.REAL_TRAFFIC))[0].time;
  }
  checkRevision(rev);return bestOrder(matrix).map(i=>points[i]);
}
function uniqueRoutes(routes){
  const seen=new Set();return routes.filter(r=>{
    // Compare actual path geometry; strategies returning the same road are not extra choices.
    const key=r.path.map(p=>p.map(v=>Number(v).toFixed(5)).join(",")).join(";");
    if(seen.has(key))return false;seen.add(key);return true;
  }).slice(0,3);
}
async function realRoutes(points,rev){
  const order=await optimizePoints(points,rev), results=[];
  if(state.mode==="driving"){
    const policies=[[AMap.DrivingPolicy.REAL_TRAFFIC,"路况推荐"],[AMap.DrivingPolicy.LEAST_FEE,"少收费"],[AMap.DrivingPolicy.LEAST_DISTANCE,"距离优先"]];
    let failures=0;
    for(const [policy,label] of policies){
      checkRevision(rev);status("正在比较路线 · "+label);
      try{const routes=await query(order,state.mode,policy);results.push(...routes.map((r,i)=>({...r,label:i?label+"备选":label,order})));}catch(e){checkRevision(rev);failures++;}
    }
    checkRevision(rev);
    if(!results.length)throw new Error("未能获取路线，请检查地点、网络或高德服务额度");
    return {routes:uniqueRoutes(results),partial:failures>0};
  }
  let combinations=[{time:0,distance:0,path:[],order,label:"推荐路线"}];
  for(let i=0;i<order.length-1;i++){
    checkRevision(rev);const legs=await query([order[i],order[i+1]],state.mode);
    combinations=uniqueRoutes(combinations.flatMap(a=>legs.map(b=>({...a,time:a.time+b.time,distance:a.distance+b.distance,path:[...a.path,...b.path]}))).sort((a,b)=>a.time-b.time));
  }
  return {routes:combinations.map((r,i)=>({...r,label:i?"备选路线 "+(i+1):"推荐路线"})),partial:false};
}
function demoRoutes(points){
  const matrix=points.map(a=>points.map(b=>Math.hypot((a.lng-b.lng)*.86,a.lat-b.lat)));
  const optimized=state.sort?bestOrder(matrix).map(i=>points[i]):points;
  const orders=[optimized,points];
  if(state.sort&&points.length>3)orders.push([points[0],...points.slice(1,-1).reverse(),points.at(-1)]);
  return uniqueRoutes(orders.map(order=>({order,demo:true,path:order.map(p=>[p.lng,p.lat])}))).map((r,i)=>({...r,label:i?"顺序示意 "+(i+1):"路线示意"}));
}
async function confirmPreview(){
  if(state.busy)return;
  const points=trip();
  if(!state.start||(!state.round&&!state.end)||points.length<2)throw new Error("请先设置起点和终点");
  if(state.round&&!state.via.length)throw new Error("返回起点至少需要一个途经点");
  if(points.some(p=>!coord(p)))throw new Error(state.ready?"请在搜索结果中选择地点，或使用地图选点":"部分地点尚未定位，请使用地图选点，或连接高德后搜索");
  invalidate("正在计算路线…");const rev=state.revision;
  state.busy=true;$("optimizeButton").disabled=true;
  try{
    const result=state.ready?await realRoutes(points,rev):{routes:demoRoutes(points),partial:false};checkRevision(rev);
    state.routes=result.routes;state.selected=0;
    $("routeSummary").hidden=false;
    $("routeNote").textContent=state.ready ? result.partial?"部分策略暂不可用，已显示成功返回的方案。":("已按"+(state.mode==="driving"?"当前路况":"当前出行方式")+"规划 · "+state.routes.length+" 种可用方案"+(state.routes.length<3?"（相同路线已合并）":"")) : "仅为地点连接示意，不代表真实道路、距离或路况。接入高德后可比较真实路线。";
    selectRoute(0);fitMap();
    if(innerWidth<=800)document.querySelector(".map-stage").scrollIntoView({behavior:"smooth",block:"start"});
    status(state.ready?"路线已更新 · "+new Date().toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit"})+" · 修改地点后需重新确认":"示意预览已生成 · 真实导航需接入高德");
  }finally{if(rev===state.revision){state.busy=false;$("optimizeButton").disabled=false;}}
}
function duration(seconds){const m=Math.max(1,Math.round(seconds/60));return m<60?m+" 分钟":Math.floor(m/60)+" 小时 "+m%60+" 分";}
function selectRoute(index){
  if(!state.routes[index])return;state.selected=index;clearLines();
  const selected=state.routes[index];
  $("routeOptions").innerHTML=state.routes.map((r,i)=>`<button class="route-option ${i===index?"selected":""}" data-route="${i}" aria-pressed="${i===index}"><span class="option-top"><span>${esc(r.label)}</span><span>${r.demo?"示意":duration(r.time)}</span></span><small>${r.demo?"未接入实时数据":(r.distance/1000).toFixed(1)+" 公里"} · ${r.order.length-2} 个途经点${i===index?" · 已选择":""}</small></button>`).join("");
  $("routeOrder").textContent=selected.order.map(p=>p.name).join(" → ");
  if(state.ready){
    // Draw only the selected provider-returned path, after explicit confirmation.
    const line=new AMap.Polyline({path:selected.path,strokeColor:"#007aff",strokeWeight:7,isOutline:true,outlineColor:"white",borderWeight:2,lineJoin:"round",lineCap:"round",zIndex:60});
    state.lines=[line];state.map.add(line);
  }else{$("demoRoutes").innerHTML=`<polyline class="demo-route-line" points="${selected.path.map(([lng,lat])=>mapXY({lng,lat}).join(",")).join(" ")}"/>`;}
}
$("routeOptions").onclick=e=>{const b=e.target.closest("[data-route]");if(b)selectRoute(Number(b.dataset.route));};
$("optimizeButton").onclick=()=>confirmPreview().catch(e=>{if(e.message!=="行程已更改"){status(e.message);toast(e.message);}});
$("settingsButton").onclick=()=>{$("amapKey").value=localStorage.getItem("amap-key")||"";$("amapSecurity").value=localStorage.getItem("amap-security")||"";$("settingsDialog").showModal();};
$("saveSettingsButton").onclick=e=>{
  e.preventDefault();const key=$("amapKey").value.trim(),security=$("amapSecurity").value.trim();
  if(!key||!security)return toast("请填写 Key 和安全密钥");
  localStorage.setItem("amap-key",key);localStorage.setItem("amap-security",security);location.reload();
};
function loadMap(){
  const key=localStorage.getItem("amap-key"),security=localStorage.getItem("amap-security");if(!key||!security)return;
  window._AMapSecurityConfig={securityJsCode:security};
  const script=document.createElement("script");
  script.src="https://webapi.amap.com/maps?v=2.0&key="+encodeURIComponent(key)+"&plugin=AMap.Driving,AMap.Walking,AMap.Riding,AMap.PlaceSearch,AMap.AutoComplete";
  script.onerror=()=>status("高德地图加载失败，请检查网络及地图设置");
  script.onload=()=>{
    try{
      state.map=new AMap.Map("map",{viewMode:"2D",zoom:12,center:[120.1491,30.2592],dragEnable:true,zoomEnable:true,scrollWheel:true,doubleClickZoom:true,touchZoom:true,mapStyle:"amap://styles/normal"});
      state.map.on("complete",()=>{
        invalidate("地图已连接，设置地点后确认预览");state.ready=true;$("map").classList.add("ready");$("demoMap").hidden=true;render();fitMap();
      });
      state.map.on("click",e=>pickAt(e.lnglat.lng,e.lnglat.lat));
    }catch{status("地图初始化失败，请检查高德配置");}
  };document.head.appendChild(script);
}
function registerTools(){
  const context=document.modelContext;if(!context?.registerTool)return;
  const lifecycle=new AbortController();window.addEventListener("pagehide",()=>lifecycle.abort(),{once:true});
  const register=tool=>{try{Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}};
  register({name:"set_trip_points",title:"设置旅行地点",description:"Stage travel points without showing any route. First is the start, last is the end; empty list clears all points.",
    inputSchema:{type:"object",properties:{stops:{type:"array",maxItems:18,items:{type:"object",properties:{name:{type:"string"},lng:{type:"number"},lat:{type:"number"},address:{type:"string"}},required:["name"],additionalProperties:false}}},required:["stops"],additionalProperties:false},
    annotations:{readOnlyHint:false,untrustedContentHint:false},
    execute(input){
      if(!Array.isArray(input?.stops)||input.stops.length>18||input.stops.some(p=>!p||typeof p.name!=="string"||!p.name.trim()||(p.lng!==undefined&&(!Number.isFinite(p.lng)||Math.abs(p.lng)>180))||(p.lat!==undefined&&(!Number.isFinite(p.lat)||Math.abs(p.lat)>90))))throw new Error("无效的地点列表");
      const points=input.stops.map(p=>({...p,id:crypto.randomUUID()}));state.start=points[0]||null;state.end=points.length>1?points.at(-1):null;state.via=points.slice(1,-1);state.round=false;update();
      return {count:points.length,previewVisible:false};
    }
  });
  register({name:"optimize_trip_route",title:"确认并预览路线",description:"Generate and show at most three route alternatives only when the user has explicitly requested a preview. Keep start and end fixed.",
    inputSchema:{type:"object",properties:{confirmed:{type:"boolean",const:true}},required:["confirmed"],additionalProperties:false},
    annotations:{readOnlyHint:false,untrustedContentHint:false},
    async execute(input){if(input?.confirmed!==true)throw new Error("请先确认预览");await confirmPreview();return {count:state.routes.length,mode:state.ready?"live":"demo"};}
  });
}
window.addEventListener("resize",()=>{clearTimeout(fitMap.resizeTimer);fitMap.resizeTimer=setTimeout(fitMap,150);});
render();fitMap();loadMap();registerTools();
