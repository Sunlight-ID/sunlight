(function(){
"use strict";
var W=1000,H=620,NW=188,NH=66;
var EV={
  settled:{label:"Settled",desc:"Many independent lines of evidence agree, and major scientific assessments state it without hedging. Treated here as fact."},
  strong:{label:"Strong",desc:"Well supported by good studies or assessments. Exact numbers or scope may still shift."},
  emerging:{label:"Emerging",desc:"Early or limited evidence. Could change as more research comes in."},
  contested:{label:"Contested",desc:"Qualified experts disagree, and the disagreement is about evidence."}
};
var EV_ORDER=["settled","strong","emerging","contested"];
var KINDS={article:"Peer-reviewed article",assessment:"Scientific assessment",report:"Institutional report",book:"Book",data:"Dataset",other:"Other"};
var KEYS=["groups","countries","topics","links","sources"];

var CONTENT_URL="content/sunlight-content.json";
/* Stage 1 is a read-only public site. Editing returns once editor log-ins exist (stage 2). */
var S={groups:new Map(),countries:new Map(),topics:new Map(),links:new Map(),sources:new Map(),view:"map",sel:null,open:null,csel:null,canWrite:false,loaded:false};


/* ---------- helpers ---------- */
function $(id){return document.getElementById(id)}
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function clone(o){return JSON.parse(JSON.stringify(o))}
function rid(p){return p+Math.random().toString(36).slice(2,9)}
function today(){return new Date().toISOString().slice(0,10)}
function safeUrl(u){u=String(u||"").trim();if(/^10\.\d{4,}\//.test(u))u="https://doi.org/"+u;return /^https?:\/\//i.test(u)?u:""}
function niceDate(d){var t=new Date(d+"T00:00:00");return isNaN(t)?"":t.toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"})}
function slug(t){return String(t).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,40)||"topic"}
function evGlyph(k){
  var d=k==="emerging"?' stroke-dasharray="5 3"':k==="contested"?' stroke-dasharray="1 4"':"";
  return '<svg width="20" height="6" viewBox="0 0 20 6" aria-hidden="true"><line x1="2" y1="3" x2="18" y2="3" stroke="currentColor" stroke-linecap="round" stroke-width="'+(k==="settled"?4:2.6)+'"'+d+'/></svg>';
}
function evPill(k){if(!EV[k])k="emerging";return '<span class="ev '+k+'">'+evGlyph(k)+EV[k].label+'</span>'}
function topicLinks(id){var out=[];S.links.forEach(function(l,lid){if(l.a===id||l.b===id)out.push([lid,l])});return out}
function sortedTopics(){return Array.from(S.topics.entries()).sort(function(a,b){return a[1].title.localeCompare(b[1].title)})}
function sourceUses(){
  var m=new Map();function add(ids,where){(ids||[]).forEach(function(i){if(!m.has(i))m.set(i,[]);m.get(i).push(where)})}
  S.topics.forEach(function(t){(t.claims||[]).forEach(function(c){add(c.sources,t.title)});(t.debates||[]).forEach(function(d){(d.positions||[]).forEach(function(p){add(p.sources,t.title)})})});
  S.links.forEach(function(l){var a=S.topics.get(l.a),b=S.topics.get(l.b);add(l.sources,(a?a.title:"?")+" and "+(b?b.title:"?"))});
  S.countries.forEach(function(c,id){var nm=c.name||id;(c.claims||[]).forEach(function(x){add(x.sources,nm)});(c.debates||[]).forEach(function(d){(d.positions||[]).forEach(function(p){add(p.sources,nm)})})});
  return m;
}
function gaps(){var n=0;S.countries.forEach(function(c){(c.claims||[]).forEach(function(x){if(!(x.sources||[]).length)n++})});S.topics.forEach(function(t){(t.claims||[]).forEach(function(c){if(!(c.sources||[]).length)n++})});S.links.forEach(function(l){if(!(l.sources||[]).length)n++});return n}

/* ---------- storage ---------- */
function setStatus(t,bad){var el=$("status");el.textContent=t||"";el.classList.toggle("bad",!!bad)}
function setNotice(t){var el=$("notice");el.hidden=!t;el.textContent=t||""}
/* Edits only change what is on screen until editor log-ins and a database exist.
   With S.canWrite false the edit controls are hidden, so these are not reached by readers. */
function put(kind,id,data){S[kind].set(id,data);render();setStatus("Not saved: editing is not switched on yet.",true)}
function del(kind,id){S[kind].delete(id);render();setStatus("Not saved: editing is not switched on yet.",true)}
function init(){
  applyAccess();route();
  fetch(CONTENT_URL,{cache:"no-cache"}).then(function(r){
    if(!r.ok)throw new Error("HTTP "+r.status);return r.json();
  }).then(function(d){
    KEYS.forEach(function(k){S[k]=new Map(Object.entries((d&&d[k])||{}))});
    normalise();S.loaded=true;route();
  }).catch(function(){
    S.loaded=true;setNotice("The map could not be loaded. Check your connection and reload the page.");route();
  });
}
function applyAccess(){document.body.classList.toggle("ro",S.canWrite===false)}

/* ---------- areas ---------- */
/* Each topic belongs to one area (content key "groups"). The map opens on the areas;
   opening an area shows its topics, plus the topics in other areas they connect to. */
function normalise(){
  var stray=false;S.topics.forEach(function(t){if(!S.groups.has(t.group))stray=true});
  if(stray&&!S.groups.has("_other"))S.groups.set("_other",{title:"Other topics",summary:"Topics not yet placed in an area.",order:999});
  S.topics.forEach(function(t){if(!S.groups.has(t.group))t.group="_other"});
}
function groupOf(tid){var t=S.topics.get(tid);return t?t.group:null}
function groupTitle(gid){var g=S.groups.get(gid);return g?g.title:""}
function sortedGroups(){return Array.from(S.groups.entries()).sort(function(a,b){return (a[1].order||0)-(b[1].order||0)||String(a[1].title).localeCompare(String(b[1].title))})}
function groupTopics(gid){return sortedTopics().filter(function(e){return e[1].group===gid})}
function pairLinks(x,y){var out=[];S.links.forEach(function(l,id){var ga=groupOf(l.a),gb=groupOf(l.b);if((ga===x&&gb===y)||(ga===y&&gb===x))out.push([id,l])});return out}
function pl(n,word){return n+" "+word+(n===1?"":"s")}
function trunc(s,n){s=String(s);return s.length>n?s.slice(0,n-1)+"…":s}

/* ---------- routing ---------- */
/* #map: all areas. #g-<area>: one area open. #t-<topic>, #c-<connection>: selected inside its area.
   #p-<area>~<area>: the connections between two areas. */
function route(){
  var h=decodeURIComponent(location.hash.replace(/^#/,""));
  if(h==="sources"||h==="about"){S.view=h;render();return}
  if(h==="about-us"){S.view="us";render();window.scrollTo(0,0);return}
  if(h==="world"||h.indexOf("w-")===0){var was=S.csel;S.view="world";S.csel=h==="world"?null:h.slice(2);if(S.csel&&S.csel!==was&&Wd.fitNext!==false)Wd.fitNext=true;render();return}
  S.view="map";S.sel=null;
  if(!S.loaded){render();return}
  var id=h.slice(2);
  if(h.indexOf("t-")===0&&S.topics.has(id)){S.sel={type:"topic",id:id};S.open=groupOf(id)}
  else if(h.indexOf("c-")===0&&S.links.has(id)){
    var l=S.links.get(id),ga=groupOf(l.a),gb=groupOf(l.b);
    S.sel={type:"link",id:id};if(S.open!==ga&&S.open!==gb)S.open=ga;
  }
  else if(h.indexOf("g-")===0&&S.groups.has(id)){S.sel={type:"group",id:id};S.open=id}
  else if(h.indexOf("p-")===0){
    var pr=id.split("~");S.open=null;
    if(pr.length===2&&S.groups.has(pr[0])&&S.groups.has(pr[1])&&pr[0]!==pr[1])S.sel={type:"pair",a:pr[0],b:pr[1]};
  }
  else S.open=null;
  render();
}
function go(hash){if(location.hash===hash)route();else location.hash=hash}
var PREFIX={topic:"t-",link:"c-",group:"g-",pair:"p-"};
function select(type,id){go(type?"#"+PREFIX[type]+id:"#map")}
window.addEventListener("hashchange",function(){route();if(S.view==="map")$("panel").scrollTop=0;if(S.view==="world")$("wpanel").scrollTop=0});

/* ---------- map ---------- */
var CW=300,CH=140,GW=196,GH=60,GX=1000-GW/2-14;
function wrap(t,max,maxLines){
  maxLines=maxLines||3;
  var w=String(t).split(/\s+/),lines=[],cur="";
  w.forEach(function(x){if(cur&&(cur+" "+x).length>max){lines.push(cur);cur=x}else cur=cur?cur+" "+x:x});
  if(cur)lines.push(cur);
  if(lines.length>maxLines){
    var last=lines.slice(maxLines-1).join(" ");lines.length=maxLines;
    lines[maxLines-1]=last.length>max?last.slice(0,max-1).replace(/\s+\S*$/,"")+"…":last;
  }
  return lines;
}
function corePos(i,n){
  if(n===1)return{x:500,y:300};
  if(n===2)return[{x:270,y:300},{x:730,y:300}][i];
  if(n===3)return[{x:245,y:170},{x:755,y:170},{x:500,y:450}][i];
  var a=-Math.PI/2+i/n*Math.PI*2;return{x:500+Math.cos(a)*330,y:310+Math.sin(a)*210};
}
function lineXY(a,b){return 'x1="'+a.x+'" y1="'+a.y+'" x2="'+b.x+'" y2="'+b.y+'"'}
function linkLine(id,l,a,b,on,isSel){
  var k=EV[l.strength]?l.strength:"emerging",ta=S.topics.get(l.a),tb=S.topics.get(l.b);
  return '<g class="edge-g'+(isSel?" sel":"")+(on?"":" dim")+'" data-link="'+esc(id)+'" tabindex="0" role="button" aria-label="Connection between '+esc(ta?ta.title:"?")+' and '+esc(tb?tb.title:"?")+': '+esc(l.label||"")+'. Evidence: '+EV[k].label+'">'
    +'<line class="edge '+k+'" '+lineXY(a,b)+'/><line class="edge-hit" '+lineXY(a,b)+'/></g>';
}
function topicNode(id,t,p,isSel,on,why){
  var lines=wrap(t.title,20),n3=lines.length===3;
  var nc=(t.claims||[]).length,nd=(t.debates||[]).length;
  var meta=pl(nc,"finding")+(nd?" · "+pl(nd,"debate"):"");
  var ty=n3?-17:lines.length===2?-12:-3,step=n3?15:18;
  return '<g class="node'+(isSel?" sel":"")+(on?"":" dim")+'" data-node="'+esc(id)+'" transform="translate('+p.x+','+p.y+')" tabindex="0" role="button" aria-label="'+esc(t.title)+', '+esc(meta)+'">'
    +'<rect x="'+(-NW/2)+'" y="'+(-NH/2)+'" width="'+NW+'" height="'+NH+'" rx="9"/>'
    +lines.map(function(ln,i){return '<text class="node-title'+(n3?" sm":"")+'" y="'+(ty+i*step)+'">'+esc(ln)+'</text>'}).join("")
    +'<text class="node-meta'+(why?" why":"")+'" y="'+(n3?28:lines.length===2?24:18)+'">'+esc(why||meta)+'</text></g>';
}
function ghostNode(id,t,p,on,why){
  var lines=wrap(t.title,24,2),ty=lines.length===2?-13:-4;
  return '<g class="node ghost'+(on?"":" dim")+'" data-node="'+esc(id)+'" transform="translate('+p.x+','+p.y+')" tabindex="0" role="button" aria-label="'+esc(t.title)+', in '+esc(groupTitle(t.group))+'. Go to this topic">'
    +'<rect x="'+(-GW/2)+'" y="'+(-GH/2)+'" width="'+GW+'" height="'+GH+'" rx="8"/>'
    +lines.map(function(ln,i){return '<text class="node-title" y="'+(ty+i*15)+'">'+esc(ln)+'</text>'}).join("")
    +'<text class="node-meta'+(why?" why":"")+'" y="'+(GH/2-9)+'">'+esc(why||"Go to topic →")+'</text></g>';
}
function overviewMap(){
  var gs=sortedGroups().filter(function(e){return groupTopics(e[0]).length}),P={},h="",sel=S.sel;
  gs.forEach(function(e,i){P[e[0]]=corePos(i,gs.length)});
  for(var i=0;i<gs.length;i++)for(var j=i+1;j<gs.length;j++){
    var ga=gs[i][0],gb=gs[j][0],ls=pairLinks(ga,gb);if(!ls.length)continue;
    var a=P[ga],b=P[gb],isSel=sel&&sel.type==="pair"&&((sel.a===ga&&sel.b===gb)||(sel.a===gb&&sel.b===ga));
    h+='<g class="edge-g'+(isSel?" sel":"")+'" data-pair="'+esc(ga+"~"+gb)+'" tabindex="0" role="button" aria-label="'+pl(ls.length,"connection")+' between '+esc(gs[i][1].title)+' and '+esc(gs[j][1].title)+'">'
      +'<line class="edge agg" style="stroke-width:'+Math.min(3+ls.length*1.5,14)+'px" '+lineXY(a,b)+'/><line class="edge-hit" '+lineXY(a,b)+'/>'
      +'<text class="edge-label" x="'+(a.x+b.x)/2+'" y="'+((a.y+b.y)/2+4)+'">'+pl(ls.length,"connection")+'</text></g>';
  }
  gs.forEach(function(e){
    var gid=e[0],g=e[1],p=P[gid],tops=groupTopics(gid),isSel=sel&&sel.type==="pair"&&(sel.a===gid||sel.b===gid);
    var shown=tops.length>5?tops.slice(0,4):tops;
    h+='<g class="node core'+(isSel?" sel":"")+'" data-group="'+esc(gid)+'" transform="translate('+p.x+','+p.y+')" tabindex="0" role="button" aria-label="'+esc(g.title)+', '+pl(tops.length,"topic")+'. Open this area">'
      +'<rect x="'+(-CW/2)+'" y="'+(-CH/2)+'" width="'+CW+'" height="'+CH+'" rx="12"/>'
      +'<text class="core-title" y="'+(-CH/2+32)+'">'+esc(g.title)+'</text>'
      +shown.map(function(t,i){return '<text class="node-sub" y="'+(-CH/2+57+i*16)+'">'+esc(trunc(t[1].title,40))+'</text>'}).join("")
      +(shown.length<tops.length?'<text class="node-sub" y="'+(-CH/2+57+4*16)+'">and '+(tops.length-4)+' more</text>':"")+'</g>';
  });
  return h;
}
function groupMap(gid){
  var inner=groupTopics(gid),n=inner.length,P={},sel=S.sel,extCount=new Map(),ext=new Map();
  inner.forEach(function(e){extCount.set(e[0],0)});
  S.links.forEach(function(l){var ia=extCount.has(l.a),ib=extCount.has(l.b);if(ia!==ib){var k=ia?l.a:l.b;extCount.set(k,extCount.get(k)+1)}});
  /* topics of this area sit on a ring; the ones with most outside links go nearest the right-hand column */
  var cx=345,cy=305,rx=n<=1?0:205,ry=n<=2?0:195,slots=[];
  for(var i=0;i<n;i++){var a=i/n*Math.PI*2;slots.push({x:Math.round(cx+Math.cos(a)*rx),y:Math.round(cy+Math.sin(a)*ry)})}
  slots.sort(function(a,b){return b.x-a.x||a.y-b.y});
  inner.slice().sort(function(a,b){return extCount.get(b[0])-extCount.get(a[0])||a[1].title.localeCompare(b[1].title)}).forEach(function(e,i){P[e[0]]=slots[i]});
  /* connected topics in other areas: a column on the right, grouped by area */
  S.links.forEach(function(l){
    var ia=extCount.has(l.a),ib=extCount.has(l.b);if(ia===ib)return;
    var o=ia?l.b:l.a,inn=ia?l.a:l.b;if(!S.topics.has(o))return;
    if(!ext.has(o))ext.set(o,[]);ext.get(o).push(P[inn].y);
  });
  var eg=sortedGroups().map(function(g){
    var items=[];ext.forEach(function(ys,tid){if(groupOf(tid)===g[0])items.push({id:tid,y:ys.reduce(function(s,v){return s+v},0)/ys.length})});
    items.sort(function(a,b){return a.y-b.y||S.topics.get(a.id).title.localeCompare(S.topics.get(b.id).title)});
    return{title:g[1].title,items:items};
  }).filter(function(g){return g.items.length});
  var count=0;eg.forEach(function(g){count+=g.items.length});
  var HEAD=26,step=count?Math.min(GH+10,(600-eg.length*HEAD)/count):0,y=(620-eg.length*HEAD-count*step)/2,heads="";
  eg.forEach(function(g){
    heads+='<text class="ext-head" x="'+GX+'" y="'+(y+17)+'">'+esc(g.title.toUpperCase())+'</text>';y+=HEAD;
    g.items.forEach(function(it){P[it.id]={x:GX,y:Math.round(y+step/2),ghost:true};y+=step});
  });
  /* what to emphasise */
  var near=null,why={};
  if(sel&&sel.type==="topic"){near=new Set([sel.id]);topicLinks(sel.id).forEach(function(x){
    var o=x[1].a===sel.id?x[1].b:x[1].a,lb=trunc(x[1].label||"",31);near.add(o);
    if(lb)why[o]=why[o]?"Several connections":lb;
  })}
  if(sel&&sel.type==="link"){var L=S.links.get(sel.id);near=new Set(L?[L.a,L.b]:[])}
  var edges="",nodes="";
  S.links.forEach(function(l,id){
    var a=P[l.a],b=P[l.b];if(!a||!b||(a.ghost&&b.ghost))return;
    if(a.ghost)a={x:a.x-GW/2,y:a.y};if(b.ghost)b={x:b.x-GW/2,y:b.y};
    var isSel=sel&&sel.type==="link"&&sel.id===id;
    var on=!sel||sel.type==="group"||isSel||(sel.type==="topic"&&(l.a===sel.id||l.b===sel.id));
    edges+=linkLine(id,l,a,b,on,isSel);
  });
  inner.forEach(function(e){nodes+=topicNode(e[0],e[1],P[e[0]],sel&&sel.type==="topic"&&sel.id===e[0],!near||near.has(e[0]),why[e[0]])});
  ext.forEach(function(_,tid){nodes+=ghostNode(tid,S.topics.get(tid),P[tid],!near||near.has(tid),why[tid])});
  return edges+heads+nodes;
}
function renderMap(){
  var body=$("map-body");
  if(!S.topics.size)body.innerHTML='<text class="empty-map" x="500" y="310">'+(S.loaded?"Nothing to show yet.":"Loading the map…")+'</text>';
  else body.innerHTML=S.open&&S.groups.has(S.open)?groupMap(S.open):overviewMap();
  var c=$("crumbs");
  if(S.open&&S.groups.has(S.open))c.innerHTML='<a href="#map">All areas</a><span aria-hidden="true">›</span><b>'+esc(groupTitle(S.open))+'</b>';
  else c.innerHTML='<b>All areas</b><span class="crumb-hint">Select an area to open it</span>';
}
function bindMap(){
  var svg=$("map");
  function act(e){
    var n=e.target.closest("[data-node]"),l=e.target.closest("[data-link]"),g=e.target.closest("[data-group]"),p=e.target.closest("[data-pair]");
    if(n)select("topic",n.getAttribute("data-node"));
    else if(l)select("link",l.getAttribute("data-link"));
    else if(g)select("group",g.getAttribute("data-group"));
    else if(p)select("pair",p.getAttribute("data-pair"));
    else return false;
    return true;
  }
  svg.addEventListener("click",function(e){
    if(act(e))return;
    if(S.open){if(!(S.sel&&S.sel.type==="group"))select("group",S.open)}
    else if(S.sel)select(null);
  });
  svg.addEventListener("keydown",function(e){if((e.key==="Enter"||e.key===" ")&&act(e))e.preventDefault()});
}
function renderLegend(){
  $("legend").innerHTML='<b>Strength of evidence</b>'+EV_ORDER.map(function(k){return '<span class="ev '+k+'" title="'+esc(EV[k].desc)+'">'+evGlyph(k)+EV[k].label+'</span>'}).join("")
    +'<span class="hint">'+(S.open?"Topics on the right belong to other areas. Select one to go there.":"Thicker lines mean more connections between two areas.")+'</span>';
}

/* ---------- references ---------- */
function refHtml(id){
  var s=S.sources.get(id);if(!s)return '<li><span class="flag">Missing source</span></li>';
  var u=safeUrl(s.url);
  return '<li>'+esc(s.authors)+(s.year?" ("+esc(s.year)+"). ":". ")+'<i>'+esc(s.title)+'</i>. '+(s.venue?esc(s.venue)+". ":"")
    +(u?'<a href="'+esc(u)+'" target="_blank" rel="noopener">View source</a> ':"")
    +(s.open?'<span class="tag free">Free to read</span>':"")+'</li>';
}
function refsHtml(ids){
  if(!(ids||[]).length)return '<p style="margin-top:9px"><span class="flag">Needs a source</span></p>';
  return '<ul class="refs" aria-label="Sources">'+ids.map(refHtml).join("")+'</ul>';
}
function editBtn(act,label,extra){return '<button type="button" class="btn quiet edit" data-act="'+act+'"'+(extra||"")+'>'+(label||"Edit")+'</button>'}

/* ---------- panel ---------- */
function connBtn(act,id,to,lbl,pill,cls){
  return '<button type="button" class="conn'+(cls?" "+cls:"")+'" data-act="'+act+'" data-id="'+esc(id)+'"><span><span class="to">'+esc(to)+'</span>'+(lbl?'<span class="lbl">'+esc(lbl)+'</span>':"")+'</span>'+(pill||"")+'</button>';
}
function linkName(l){var a=S.topics.get(l.a),b=S.topics.get(l.b);return (a?a.title:"?")+" and "+(b?b.title:"?")}
function topicCounts(id,t){return pl((t.claims||[]).length,"finding")+", "+pl((t.debates||[]).length,"debate")+", "+pl(topicLinks(id).length,"connection")}
function backBtn(gid){return gid&&S.groups.has(gid)?'<button class="back" type="button" data-act="open-group" data-id="'+esc(gid)+'">← '+esc(groupTitle(gid))+'</button>':'<button class="back" type="button" data-act="home">← All areas</button>'}
function scaleHtml(){return '<div class="scale" style="margin-top:14px">'+EV_ORDER.map(function(k){return '<div>'+evPill(k)+'<span>'+EV[k].desc+'</span></div>'}).join("")+'</div>'}
/* Findings and debates look the same on topics and country profiles. Edit buttons only on topics for now. */
function findingsHtml(claims,ed){
  var E=ed?editBtn:function(){return ""},h='<div class="sec"><div class="sec-h"><h3>What the evidence shows</h3>'+E("add-claim","Add finding")+'</div>';
  if(!claims.length)h+='<p class="none">No findings yet.</p>';
  claims.forEach(function(c){
    h+='<div class="item"><div class="item-top">'+evPill(c.strength)+E("edit-claim","Edit",' data-id="'+esc(c.id)+'"')+'</div>'
      +'<p class="claim">'+esc(c.text)+'</p>'
      +(c.note?'<p class="why"><b>Why this rating</b> '+esc(c.note)+'</p>':"")+refsHtml(c.sources)+'</div>';
  });
  return h+'</div>';
}
function debatesHtml(debates,ed,noun){
  var E=ed?editBtn:function(){return ""},h='<div class="sec"><div class="sec-h"><h3>Open debates</h3>'+E("add-debate","Add debate")+'</div>';
  if(!(debates||[]).length)h+='<p class="none">No debates recorded for '+noun+' yet.</p>';
  (debates||[]).forEach(function(d){
    h+='<div class="item"><div class="item-top"><h4 class="debate-q">'+esc(d.question)+'</h4>'+E("edit-debate","Edit",' data-id="'+esc(d.id)+'"')+'</div>'
      +(d.agreed?'<p class="agreed"><b>Not in dispute</b>'+esc(d.agreed)+'</p>':"")+'<div class="positions">';
    (d.positions||[]).forEach(function(p){
      h+='<div class="pos"><h4><span>'+esc(p.label)+'</span>'+E("edit-pos","Edit",' data-id="'+esc(d.id)+'" data-pid="'+esc(p.id)+'"')+'</h4><p>'+esc(p.text||"")+'</p>'+refsHtml(p.sources)+'</div>';
    });
    h+='</div>'+(ed?'<p style="margin-top:10px">'+E("add-pos","Add a position",' data-id="'+esc(d.id)+'"')+'</p>':"")+'</div>';
  });
  return h+'</div>';
}
function sortClaims(list){return (list||[]).slice().sort(function(a,b){return EV_ORDER.indexOf(a.strength)-EV_ORDER.indexOf(b.strength)})}
function renderPanel(){
  var el=$("panel"),sel=S.sel,h="";
  if(sel&&sel.type==="topic"&&S.topics.has(sel.id)){
    var t=S.topics.get(sel.id),id=sel.id;
    var claims=(t.claims||[]).slice().sort(function(a,b){return EV_ORDER.indexOf(a.strength)-EV_ORDER.indexOf(b.strength)});
    h+=backBtn(t.group)+'<p class="kicker">Topic · '+esc(groupTitle(t.group))+'</p><h2 class="ptitle">'+esc(t.title)+'</h2>'
      +'<p class="lede">'+esc(t.summary||"")+'</p>'
      +'<div class="meta">'+(t.updated?'<span>Updated '+esc(niceDate(t.updated))+'</span>':"")+editBtn("edit-topic","Edit topic")+'</div>';
    h+=findingsHtml(claims,true)+debatesHtml(t.debates,true,"this topic");
    var ls=topicLinks(id);
    h+='<div class="sec"><div class="sec-h"><h3>Connected to</h3>'+editBtn("add-link-here","Add connection")+'</div>';
    if(!ls.length)h+='<p class="none">Not connected to anything yet.</p>';
    ls.forEach(function(x){
      var oid=x[1].a===id?x[1].b:x[1].a,o=S.topics.get(oid),other=o&&o.group!==t.group;
      h+=connBtn("open-link",x[0],o?o.title:"?",(x[1].label||"")+(other?" · in "+groupTitle(o.group):""),evPill(x[1].strength));
    });
    h+='</div>';
  } else if(sel&&sel.type==="link"&&S.links.has(sel.id)){
    var l=S.links.get(sel.id),a=S.topics.get(l.a),b=S.topics.get(l.b);
    h+=backBtn(S.open)+'<p class="kicker">Connection</p>'
      +'<h2 class="ptitle">'+esc(l.label||"Connection")+'</h2>'
      +'<p class="pair">Between <button type="button" data-act="open-topic" data-id="'+esc(l.a)+'">'+esc(a?a.title:"?")+'</button> and <button type="button" data-act="open-topic" data-id="'+esc(l.b)+'">'+esc(b?b.title:"?")+'</button></p>'
      +'<div class="item" style="border-bottom:0"><div class="item-top">'+evPill(l.strength)+editBtn("edit-link","Edit connection")+'</div>'
      +'<p class="lede">'+esc(l.text||"")+'</p>'+refsHtml(l.sources)+'</div>';
  } else if(sel&&sel.type==="group"&&S.groups.has(sel.id)){
    var gid=sel.id,g=S.groups.get(gid),tops=groupTopics(gid),nf=0,nd=0;
    tops.forEach(function(e){nf+=(e[1].claims||[]).length;nd+=(e[1].debates||[]).length});
    h+=backBtn(null)+'<p class="kicker">Area</p><h2 class="ptitle">'+esc(g.title)+'</h2>'
      +'<p class="lede">'+esc(g.summary||"")+'</p>'
      +'<div class="stats"><div><b>'+tops.length+'</b><span>topics</span></div><div><b>'+nf+'</b><span>findings</span></div><div><b>'+nd+'</b><span>debates</span></div></div>'
      +'<div class="sec"><div class="sec-h"><h3>Topics in this area</h3></div>';
    tops.forEach(function(e){h+=connBtn("open-topic",e[0],e[1].title,topicCounts(e[0],e[1]))});
    h+='</div><div class="sec"><div class="sec-h"><h3>Links to other areas</h3></div>';
    var any=false;
    sortedGroups().forEach(function(o){
      if(o[0]===gid)return;var pls=pairLinks(gid,o[0]);if(!pls.length)return;any=true;
      h+='<p class="subhead">With '+esc(o[1].title)+'</p>';
      pls.forEach(function(x){h+=connBtn("open-link",x[0],x[1].label||"Connection",linkName(x[1]),evPill(x[1].strength))});
    });
    if(!any)h+='<p class="none">No links to other areas yet.</p>';
    h+='</div>';
  } else if(sel&&sel.type==="pair"){
    var pls2=pairLinks(sel.a,sel.b);
    h+=backBtn(null)+'<p class="kicker">Between two areas</p><h2 class="ptitle">'+esc(groupTitle(sel.a))+' and '+esc(groupTitle(sel.b))+'</h2>'
      +'<p class="pair">Open <button type="button" data-act="open-group" data-id="'+esc(sel.a)+'">'+esc(groupTitle(sel.a))+'</button> or <button type="button" data-act="open-group" data-id="'+esc(sel.b)+'">'+esc(groupTitle(sel.b))+'</button></p>'
      +'<p class="lede" style="margin-top:12px">'+pl(pls2.length,"connection")+' link topics in these two areas. Select one to read the evidence behind it.</p>'
      +'<div class="sec"><div class="sec-h"><h3>Connections</h3></div>';
    pls2.forEach(function(x){h+=connBtn("open-link",x[0],x[1].label||"Connection",linkName(x[1]),evPill(x[1].strength))});
    h+='</div>';
  } else {
    var gp=gaps(),gs=sortedGroups().filter(function(e){return groupTopics(e[0]).length});
    h+='<p class="kicker">Overview</p><h2 class="ptitle">A map of connected crises</h2>'
      +'<p class="lede">The map groups the crises of our time into '+(gs.length===3?"three":gs.length)+' areas. Open an area to see its topics and how they link to topics elsewhere. Select a topic or a line to read what is known, how strong the evidence is, where experts disagree, and the sources behind it.</p>'
      +'<div class="stats"><div><b>'+S.topics.size+'</b><span>topics</span></div><div><b>'+S.links.size+'</b><span>connections</span></div><div><b>'+S.sources.size+'</b><span>sources</span></div>'
      +(gp?'<div><b style="color:var(--danger)">'+gp+'</b><span>need a source</span></div>':"")+'</div>'
      +'<div class="sec"><div class="sec-h"><h3>How to read the ratings</h3></div>'+scaleHtml()+'</div>'
      +'<div class="sec"><div class="sec-h"><h3>Areas and topics</h3></div>';
    if(!S.topics.size)h+='<p class="none">'+(S.loaded?"Nothing here yet.":"Loading…")+'</p>';
    gs.forEach(function(e){
      h+=connBtn("open-group",e[0],e[1].title,e[1].summary,"","area");
      groupTopics(e[0]).forEach(function(x){h+=connBtn("open-topic",x[0],x[1].title,topicCounts(x[0],x[1]),"","sub")});
    });
    h+='</div>';
  }
  el.innerHTML=h;
}
$("panel").addEventListener("click",function(e){
  var b=e.target.closest("[data-act]");if(!b)return;
  var act=b.getAttribute("data-act"),id=b.getAttribute("data-id"),pid=b.getAttribute("data-pid"),tid=S.sel&&S.sel.id;
  if(act==="home")select(null);
  else if(act==="open-group")select("group",id);
  else if(act==="open-topic")select("topic",id);
  else if(act==="open-link")select("link",id);
  else if(act==="edit-topic")formTopic(tid);
  else if(act==="add-claim")formClaim(tid,null);
  else if(act==="edit-claim")formClaim(tid,id);
  else if(act==="add-debate")formDebate(tid,null);
  else if(act==="edit-debate")formDebate(tid,id);
  else if(act==="add-pos")formPosition(tid,id,null);
  else if(act==="edit-pos")formPosition(tid,id,pid);
  else if(act==="add-link-here")formLink(null,tid);
  else if(act==="edit-link")formLink(tid);
});

/* ---------- sources + method pages ---------- */
function renderSources(){
  var uses=sourceUses(),list=Array.from(S.sources.entries()).sort(function(a,b){return String(a[1].authors).localeCompare(String(b[1].authors))||String(a[1].year).localeCompare(String(b[1].year))});
  var h='<div class="bar"><div><p class="kicker">Bibliography</p><h2>Sources</h2></div><button type="button" class="btn primary edit" data-act="add-source">Add source</button></div>'
    +'<p class="intro">Every finding, debate position and connection on the map points to one or more of these. '+list.length+' in total.</p><div style="margin-top:18px;border-top:1.5px solid var(--ink)">';
  if(!list.length)h+='<p class="none">'+(S.loaded?"No sources yet.":"Loading…")+'</p>';
  list.forEach(function(e){
    var s=e[1],u=safeUrl(s.url),us=uses.get(e[0])||[],where=Array.from(new Set(us));
    h+='<div class="src"><div><p class="cite">'+esc(s.authors)+(s.year?" ("+esc(s.year)+"). ":". ")+'<i>'+esc(s.title)+'</i>. '+(s.venue?esc(s.venue)+".":"")+'</p>'
      +'<div class="sm"><span class="tag">'+esc(KINDS[s.kind]||KINDS.other)+'</span>'+(s.open?'<span class="tag free">Free to read</span>':"")
      +(u?'<a href="'+esc(u)+'" target="_blank" rel="noopener">View source</a>':"")
      +(us.length?'<span>Used in: '+esc(where.join("; "))+'</span>':'<span class="flag">Not used yet</span>')+'</div>'
      +(s.note?'<p class="why">'+esc(s.note)+'</p>':"")+'</div>'+editBtn("edit-source","Edit",' data-id="'+esc(e[0])+'"')+'</div>';
  });
  $("sources-body").innerHTML=h+'</div>';
}
$("sources-body").addEventListener("click",function(e){
  var b=e.target.closest("[data-act]");if(!b)return;
  formSource(b.getAttribute("data-act")==="add-source"?null:b.getAttribute("data-id"));
});
function renderAbout(){
  var h='<p class="kicker">Method</p><h2>How this map is made</h2>'
    +'<p class="intro">Sunlight is for people who do not have the time, or the journal access, to read the research themselves. It sets out what is known about the major crises of our time and how they feed one another.</p>'
    +'<ol class="principles" style="margin-top:22px">'
    +'<li><span><b>Follow the evidence.</b> Where the science is settled, the map says so plainly. It does not invent balance where the evidence points one way.</span></li>'
    +'<li><span><b>Show the real debates.</b> Where qualified experts disagree, each position is set out with its sources, alongside what both sides accept.</span></li>'
    +'<li><span><b>Every claim carries its sources.</b> Peer-reviewed research and scientific assessments come first. Sources that are free to read are marked.</span></li>'
    +'<li><span><b>Plain language.</b> Short sentences, everyday words, numbers with their context.</span></li>'
    +'<li><span><b>Clear values.</b> The map starts from the equal worth of every person and care for the living world. Values shape which questions get asked. They do not decide what the evidence shows.</span></li></ol>'
    +'<div class="sec"><div class="sec-h"><h3>Strength of evidence</h3></div><div class="scale" style="margin-top:14px">'
    +EV_ORDER.map(function(k){return '<div>'+evPill(k)+'<span>'+EV[k].desc+'</span></div>'}).join("")+'</div></div>'
    +'<div class="sec"><div class="sec-h"><h3>Open data</h3></div><p class="intro" style="font-size:15.5px">The whole map is available as one file: topics, connections and sources. You are welcome to download it and check our work.</p>'
    +'<div class="backup"><a class="btn" href="'+CONTENT_URL+'" download="sunlight-content.json">Download the data (JSON)</a></div></div>';
  $("about-body").innerHTML=h;
}

/* ---------- about us ---------- */
function renderUs(){
  var h='<p class="kicker">About us</p><h2>Why Sunlight exists</h2>'
    +'<p class="pull">Democracy works best when the people in it can see clearly.</p>'
    +'<p class="intro">Every day, people are asked to make choices about climate, money, technology and power: at the ballot box, at work and at home. Making those choices well means knowing what the evidence says. Too often that evidence is scattered, hard to read or locked away. Sunlight brings it into the open.</p>'

    +'<div class="sec"><div class="sec-h"><h3>Where we stand</h3></div>'
    +'<p class="intro" style="margin-top:14px">We believe a healthy democracy depends on people being able to find out what is true about the problems they face, and to judge for themselves what should be done about them.</p>'
    +'<p class="intro">We start from two commitments: <b class="ui">the equal worth of every person</b>, and <b class="ui">care for the living world</b>. We say this openly because every project has a point of view, and you deserve to know ours.</p>'
    +'<p class="intro">These values guide why we built Sunlight and which questions we ask. They do not decide the answers. Where the evidence is settled, we say so plainly. Where qualified experts disagree, we set out each side with its sources and what both sides accept.</p></div>'

    +'<div class="sec"><div class="sec-h"><h3>Our mission</h3></div>'
    +'<ol class="principles" style="margin-top:16px">'
    +'<li><span><b>An informed, educated democracy.</b> We want everyone to have a fair starting point: clear, plain-language accounts of what research shows about the major crises of our time.</span></li>'
    +'<li><span><b>Connecting the issues.</b> Climate change, inequality, misinformation and the state of democracy are usually reported as separate stories. They are not. They feed one another in ways that matter. Our map shows those links, and every link is a sourced claim in its own right.</span></li>'
    +'<li><span><b>Opening up the evidence.</b> Much of the best research sits behind journal paywalls or inside long technical reports. We summarise it, cite it in full, and mark the sources that anyone can read for free.</span></li>'
    +'</ol></div>'

    +'<div class="sec"><div class="sec-h"><h3>Judge for yourself</h3></div>'
    +'<p class="intro" style="margin-top:14px">We would rather show you the evidence than ask you to trust us. Every finding is rated for how strong its evidence is, and every claim lists its sources. We draw on as wide a range of sources as we can, with peer-reviewed research and scientific assessments first. Follow the links, read the sources, and make up your own mind.</p>'
    +'<div class="backup"><a class="btn" href="#about">How we rate evidence</a><a class="btn" href="#sources">Browse all sources</a><a class="btn" href="#map">Explore the map</a></div></div>'

    +'<div class="sec"><div class="sec-h"><h3>A human project</h3></div>'
    +'<p class="intro" style="margin-top:14px">Sunlight is a fundamentally human project. The judgements that matter, such as how strong a piece of evidence is, what counts as settled and where real disagreement lies, are made by people. Each area will be reviewed by academics and experts who know its research.</p>'
    +'<p class="intro">We are open about how we work. We use AI tools for practical tasks, such as finding sources and drafting summaries, and our first entries were drafted this way. Every entry is being checked by people against its full sources, and no finding stands on an AI\'s judgement alone.</p>'
    +'<p class="intro">We respect your judgement and your power to act. Sunlight will not tell you what to think or what to do. It sets out the evidence so that you can decide for yourself, and change things in the world as you see fit.</p></div>'

    +'<div class="sec"><div class="sec-h"><h3>Who we are</h3></div>'
    +'<p class="intro" style="margin-top:14px">Sunlight is an independent passion project. It has no funding, no advertising and no sponsors, so no one pays to shape what it says. The people behind it are anonymous for now. We would rather you judge Sunlight by the evidence it shows than by who we are.</p></div>'

    +'<div class="sec"><div class="sec-h"><h3>A work in progress</h3></div>'
    +'<p class="intro" style="margin-top:14px">Sunlight is new. We are still checking entries against their full sources, and adding topics and countries. Much of the research we cite so far comes from a handful of wealthy countries, and we want to widen that. Treat it as a careful first draft, and check the sources behind anything that matters to you.</p></div>';
  $("us-body").innerHTML=h;
}

/* ---------- forms ---------- */
var F=null;
function pickHtml(key,checked){
  var list=Array.from(S.sources.entries()).sort(function(a,b){return String(a[1].short||a[1].authors).localeCompare(String(b[1].short||b[1].authors))});
  var set=new Set(checked||[]);
  return list.map(function(e){
    return '<label class="chk"><input type="checkbox" id="f-'+key+'-'+esc(e[0])+'" data-src="'+esc(e[0])+'"'+(set.has(e[0])?" checked":"")+'><span><b class="ui">'+esc(e[1].short||e[1].authors)+'</b> '+esc(e[1].title)+'</span></label>';
  }).join("")||'<span class="none" style="padding:4px 0">No sources yet. Add one below.</span>';
}
function fieldHtml(f,v){
  var id="f-"+f.key,val=v==null?"":v,h='<div class="fld">';
  if(f.type==="check")return h+'<label class="chk"><input type="checkbox" id="'+id+'"'+(val?" checked":"")+'><span>'+esc(f.label)+'</span></label></div>';
  if(f.type==="sources"){
    return h+'<span class="lab">'+esc(f.label)+'</span><small>Tick every source that supports this.</small><div class="pick" id="'+id+'" data-pick>'+pickHtml(f.key,val||[])+'</div>'
      +'<details class="qa"><summary>Add a new source</summary><div class="g">'
      +'<div class="fld"><label for="qa-authors">Authors or organisation</label><input type="text" id="qa-authors"></div>'
      +'<div class="fld"><label for="qa-year">Year</label><input type="text" id="qa-year" inputmode="numeric"></div>'
      +'<div class="fld"><label for="qa-title">Title</label><input type="text" id="qa-title"></div>'
      +'<div class="fld"><label for="qa-venue">Journal, publisher or organisation</label><input type="text" id="qa-venue"></div>'
      +'<div class="fld"><label for="qa-url">Link or DOI</label><input type="text" id="qa-url"></div>'
      +'<div><button type="button" class="btn" id="qa-add">Add to the list</button> <span class="err" id="qa-err"></span></div></div></details></div>';
  }
  h+='<label for="'+id+'">'+esc(f.label)+'</label>'+(f.hint?'<small>'+esc(f.hint)+'</small>':"");
  if(f.type==="textarea")h+='<textarea id="'+id+'">'+esc(val)+'</textarea>';
  else if(f.type==="select")h+='<select id="'+id+'">'+f.options.map(function(o){return '<option value="'+esc(o[0])+'"'+(o[0]===val?" selected":"")+'>'+esc(o[1])+'</option>'}).join("")+'</select>';
  else h+='<input type="text" id="'+id+'" value="'+esc(val)+'">';
  return h+'</div>';
}
function openForm(cfg){
  F=cfg;var v=cfg.values||{};
  $("dlg-form").innerHTML='<div class="dh"><h2 id="dlg-title">'+esc(cfg.title)+'</h2></div><div class="db">'
    +cfg.fields.map(function(f){return fieldHtml(f,v[f.key])}).join("")+'<p class="err" id="f-err" role="alert"></p></div>'
    +'<div class="df">'+(cfg.remove?'<button type="button" class="btn danger sp" id="f-del">Delete</button>':"")
    +'<button type="button" class="btn" id="f-cancel">Cancel</button><button type="submit" class="btn primary">Save</button></div>';
  $("dlg").showModal();
  var first=$("dlg-form").querySelector("input[type=text],textarea,select");if(first)first.focus();
}
function readForm(){
  var out={};
  F.fields.forEach(function(f){
    var el=$("f-"+f.key);
    if(f.type==="check")out[f.key]=el.checked;
    else if(f.type==="sources")out[f.key]=Array.from(el.querySelectorAll("input:checked")).map(function(i){return i.getAttribute("data-src")});
    else out[f.key]=el.value.trim();
  });
  return out;
}
$("dlg-form").addEventListener("submit",function(e){
  e.preventDefault();if(!F)return;var v=readForm();
  var miss=F.fields.filter(function(f){return f.required&&!v[f.key]});
  if(miss.length){$("f-err").textContent="Please fill in: "+miss.map(function(f){return f.label}).join(", ")+".";return}
  var er=F.save(v);if(er){$("f-err").textContent=er;return}
  $("dlg").close();F=null;
});
$("dlg-form").addEventListener("click",function(e){
  var id=e.target.id;
  if(id==="f-cancel"){$("dlg").close();F=null}
  else if(id==="f-del"){
    if(e.target.dataset.sure){var er=F.remove();if(er){$("f-err").textContent=er;return}$("dlg").close();F=null}
    else{e.target.dataset.sure="1";e.target.textContent="Select again to delete for good"}
  } else if(id==="qa-add"){
    var a=$("qa-authors").value.trim(),t=$("qa-title").value.trim(),y=$("qa-year").value.trim();
    if(!a||!t){$("qa-err").textContent="Authors and title are needed.";return}
    var sid=rid("s"),pick=$("dlg-form").querySelector("[data-pick]"),key=pick.id.slice(2);
    var checked=Array.from(pick.querySelectorAll("input:checked")).map(function(i){return i.getAttribute("data-src")});
    put("sources",sid,{short:shortCite(a,y),authors:a,year:y,title:t,venue:$("qa-venue").value.trim(),url:$("qa-url").value.trim(),kind:"article",open:false,note:""});
    checked.push(sid);pick.innerHTML=pickHtml(key,checked);
    ["qa-authors","qa-year","qa-title","qa-venue","qa-url"].forEach(function(i){$(i).value=""});
    $("qa-err").textContent="";e.target.closest("details").open=false;
  }
});
function shortCite(authors,year){
  var a=String(authors).trim(),first=a.split(",")[0].trim(),many=/&| and |et al|;/.test(a)||a.split(",").length>3;
  return (first+(many?" et al.":"")+" "+(year||"")).trim();
}
var EV_OPTS=EV_ORDER.map(function(k){return[k,EV[k].label+": "+EV[k].desc]});
function touch(t){t.updated=today();return t}

function formTopic(id){
  var gs=sortedGroups(),t=id?clone(S.topics.get(id)):{title:"",summary:"",group:S.open||(gs[0]&&gs[0][0])||"",claims:[],debates:[]};
  openForm({title:id?"Edit topic":"Add a topic",values:t,fields:[
    {key:"title",label:"Topic name",required:true},
    {key:"group",label:"Area",type:"select",options:gs.map(function(e){return[e[0],e[1].title]})},
    {key:"summary",label:"Plain-language summary",type:"textarea",hint:"Two or three sentences a newcomer could follow."}],
    save:function(v){
      t.title=v.title;t.summary=v.summary;t.group=v.group;
      if(!id){id=slug(v.title);while(S.topics.has(id))id=slug(v.title)+"-"+rid("").slice(0,3);var p=freeSpot();t.x=p.x;t.y=p.y}
      put("topics",id,touch(t));select("topic",id);
    },
    remove:id?function(){topicLinks(id).forEach(function(x){del("links",x[0])});del("topics",id);select(null)}:null});
}
function formClaim(tid,cid){
  var t=clone(S.topics.get(tid)),c=cid?t.claims.find(function(x){return x.id===cid}):{id:rid("c"),text:"",strength:"strong",note:"",sources:[]};
  openForm({title:cid?"Edit finding":"Add a finding",values:c,fields:[
    {key:"text",label:"Finding",type:"textarea",required:true,hint:"One clear statement in plain language."},
    {key:"strength",label:"Strength of evidence",type:"select",options:EV_OPTS},
    {key:"note",label:"Why this rating",type:"textarea",hint:"What kind of evidence this rests on, and any caveat."},
    {key:"sources",label:"Sources",type:"sources"}],
    save:function(v){t=clone(S.topics.get(tid));Object.assign(c,v);var i=t.claims.findIndex(function(x){return x.id===c.id});if(i<0)t.claims.push(c);else t.claims[i]=c;put("topics",tid,touch(t))},
    remove:cid?function(){t=clone(S.topics.get(tid));t.claims=t.claims.filter(function(x){return x.id!==cid});put("topics",tid,touch(t))}:null});
}
function formDebate(tid,did){
  var t=clone(S.topics.get(tid)),d=did?t.debates.find(function(x){return x.id===did}):{id:rid("d"),question:"",agreed:"",positions:[]};
  openForm({title:did?"Edit debate":"Add a debate",values:d,fields:[
    {key:"question",label:"The question experts disagree on",required:true},
    {key:"agreed",label:"What is not in dispute",type:"textarea",hint:"The common ground both sides accept."}],
    save:function(v){t=clone(S.topics.get(tid));t.debates=t.debates||[];Object.assign(d,v);var i=t.debates.findIndex(function(x){return x.id===d.id});if(i<0)t.debates.push(d);else{d.positions=t.debates[i].positions;t.debates[i]=d}put("topics",tid,touch(t))},
    remove:did?function(){t=clone(S.topics.get(tid));t.debates=t.debates.filter(function(x){return x.id!==did});put("topics",tid,touch(t))}:null});
}
function formPosition(tid,did,pid){
  var t=clone(S.topics.get(tid)),d=t.debates.find(function(x){return x.id===did});
  var p=pid?d.positions.find(function(x){return x.id===pid}):{id:rid("p"),label:"",text:"",sources:[]};
  openForm({title:pid?"Edit position":"Add a position",values:p,fields:[
    {key:"label",label:"The position, in a few words",required:true},
    {key:"text",label:"The argument and who makes it",type:"textarea"},
    {key:"sources",label:"Sources",type:"sources"}],
    save:function(v){t=clone(S.topics.get(tid));d=t.debates.find(function(x){return x.id===did});d.positions=d.positions||[];Object.assign(p,v);var i=d.positions.findIndex(function(x){return x.id===p.id});if(i<0)d.positions.push(p);else d.positions[i]=p;put("topics",tid,touch(t))},
    remove:pid?function(){t=clone(S.topics.get(tid));d=t.debates.find(function(x){return x.id===did});d.positions=d.positions.filter(function(x){return x.id!==pid});put("topics",tid,touch(t))}:null});
}
function formLink(lid,fromTopic){
  if(S.topics.size<2){setStatus("Add at least two topics before connecting them.",true);return}
  var opts=sortedTopics().map(function(e){return[e[0],e[1].title]});
  var l=lid?clone(S.links.get(lid)):{a:fromTopic||opts[0][0],b:(opts.find(function(o){return o[0]!==(fromTopic||opts[0][0])})||opts[1])[0],label:"",text:"",strength:"strong",sources:[]};
  openForm({title:lid?"Edit connection":"Add a connection",values:l,fields:[
    {key:"a",label:"Between",type:"select",options:opts},
    {key:"b",label:"And",type:"select",options:opts},
    {key:"label",label:"Short label shown on the line",required:true,hint:"Three or four words."},
    {key:"text",label:"How the two are linked",type:"textarea"},
    {key:"strength",label:"Strength of evidence",type:"select",options:EV_OPTS},
    {key:"sources",label:"Sources",type:"sources"}],
    save:function(v){if(v.a===v.b)return "Choose two different topics.";Object.assign(l,v);var id=lid||rid("l");put("links",id,l);select("link",id)},
    remove:lid?function(){del("links",lid);select(null)}:null});
}
function formSource(sid){
  var s=sid?clone(S.sources.get(sid)):{short:"",authors:"",year:"",title:"",venue:"",url:"",kind:"article",open:false,note:""};
  openForm({title:sid?"Edit source":"Add a source",values:s,fields:[
    {key:"authors",label:"Authors or organisation",required:true,hint:"For example: Lynas, M., Houlton, B. Z., & Perry, S."},
    {key:"year",label:"Year"},
    {key:"title",label:"Title",required:true},
    {key:"venue",label:"Journal, publisher or organisation",hint:"Include volume and pages for journal articles."},
    {key:"url",label:"Link or DOI"},
    {key:"kind",label:"Type of source",type:"select",options:Object.keys(KINDS).map(function(k){return[k,KINDS[k]]})},
    {key:"open",label:"Free for anyone to read",type:"check"},
    {key:"short",label:"Short citation",hint:"Leave blank to fill in automatically, for example Lynas et al. 2021."},
    {key:"note",label:"Note",hint:"For example, where a free copy can be found."}],
    save:function(v){Object.assign(s,v);if(!s.short)s.short=shortCite(s.authors,s.year);put("sources",sid||rid("s"),s)},
    remove:sid?function(){var n=(sourceUses().get(sid)||[]).length;if(n)return "This source is used in "+n+(n===1?" place":" places")+". Remove it from those first.";del("sources",sid)}:null});
}
$("add-topic").addEventListener("click",function(){formTopic(null)});
$("add-link").addEventListener("click",function(){formLink(null,S.sel&&S.sel.type==="topic"?S.sel.id:null)});

/* ---------- world ---------- */
/* Country shapes: Natural Earth 1:50m via the world-atlas package, keyed by ISO 3166-1 numeric code ("826" is the UK).
   Country profiles live in content key "countries" under the same code: name, summary, updated, claims[], debates[],
   topics[] (ids of related topics on the main map). Shapes without a code (e.g. Kosovo) use "x-" plus a slug of the name. */
var WORLD_URL="vendor/countries-50m.json",WW=1000,WH=520;
var NAME_FIX={"Antigua and Barb.":"Antigua and Barbuda","Ashmore and Cartier Is.":"Ashmore and Cartier Islands","Bosnia and Herz.":"Bosnia and Herzegovina",
  "Br. Indian Ocean Ter.":"British Indian Ocean Territory","British Virgin Is.":"British Virgin Islands","Cayman Is.":"Cayman Islands","Central African Rep.":"Central African Republic",
  "Cook Is.":"Cook Islands","Dem. Rep. Congo":"Democratic Republic of the Congo","Dominican Rep.":"Dominican Republic","Eq. Guinea":"Equatorial Guinea","Faeroe Is.":"Faroe Islands",
  "Falkland Is.":"Falkland Islands","Fr. Polynesia":"French Polynesia","Fr. S. Antarctic Lands":"French Southern and Antarctic Lands","Heard I. and McDonald Is.":"Heard Island and McDonald Islands",
  "Indian Ocean Ter.":"Australian Indian Ocean Territories","Marshall Is.":"Marshall Islands","N. Cyprus":"Northern Cyprus","N. Mariana Is.":"Northern Mariana Islands","Pitcairn Is.":"Pitcairn Islands",
  "S. Geo. and the Is.":"South Georgia and the South Sandwich Islands","S. Sudan":"South Sudan","Solomon Is.":"Solomon Islands","St. Kitts and Nevis":"Saint Kitts and Nevis",
  "St. Pierre and Miquelon":"Saint Pierre and Miquelon","St. Vin. and Gren.":"Saint Vincent and the Grenadines","Turks and Caicos Is.":"Turks and Caicos Islands",
  "U.S. Virgin Is.":"United States Virgin Islands","W. Sahara":"Western Sahara","Wallis and Futuna Is.":"Wallis and Futuna"};
var Wd={status:"idle",features:[],byId:new Map(),drawn:false,vb:{x:0,y:0,w:WW,h:WH},fitNext:null,ptrs:new Map(),pan:null,pinch:null};
function countryName(id){var c=S.countries.get(id),f=Wd.byId.get(id);return (c&&c.name)||(f&&f.name)||id}
function loadWorld(){
  if(Wd.status!=="idle")return;
  Wd.status="loading";
  if(!window.d3||!d3.geoEqualEarth||!window.topojson){Wd.status="error";return}
  fetch(WORLD_URL).then(function(r){if(!r.ok)throw new Error("HTTP "+r.status);return r.json()}).then(function(topo){
    var feats=topojson.feature(topo,topo.objects.countries).features.filter(function(f){return f.id!=="010"}); /* leave out Antarctica */
    var proj=d3.geoEqualEarth().fitExtent([[6,6],[WW-6,WH-6]],{type:"FeatureCollection",features:feats});
    var path=d3.geoPath(proj);if(path.digits)path.digits(1);
    feats.forEach(function(f){
      var raw=(f.properties&&f.properties.name)||"",id=f.id||("x-"+slug(raw)),d=path(f);if(!d)return;
      var c={id:id,name:NAME_FIX[raw]||raw,d:d,b:path.bounds(f)};Wd.features.push(c);Wd.byId.set(id,c);
    });
    Wd.features.sort(function(a,b){return a.name.localeCompare(b.name)});
    Wd.status="ready";if(S.view==="world")render();
  }).catch(function(){Wd.status="error";if(S.view==="world")render()});
}
function setVB(x,y,w){
  w=Math.max(WW/40,Math.min(WW,w));var h=w*WH/WW;
  x=Math.max(0,Math.min(WW-w,x));y=Math.max(0,Math.min(WH-h,y));
  Wd.vb={x:x,y:y,w:w,h:h};$("world").setAttribute("viewBox",[x,y,w,h].map(function(n){return Math.round(n*100)/100}).join(" "));
}
function zoomAt(px,py,k){var v=Wd.vb,w=Math.max(WW/40,Math.min(WW,v.w*k));k=w/v.w;setVB(px-(px-v.x)*k,py-(py-v.y)*k,w)}
function fitCountry(id){
  var f=Wd.byId.get(id);if(!f)return;
  var b=f.b,cx=(b[0][0]+b[1][0])/2,cy=(b[0][1]+b[1][1])/2,w=Math.max((b[1][0]-b[0][0])*2.4,(b[1][1]-b[0][1])*2.4*WW/WH,WW/14);
  if(w>WW*.8)w=WW;setVB(cx-w/2,cy-w*WH/WW/2,w);
}
function svgPt(clientX,clientY){var svg=$("world"),p=svg.createSVGPoint();p.x=clientX;p.y=clientY;return p.matrixTransform(svg.getScreenCTM().inverse())}
function renderWorld(){
  loadWorld();
  var body=$("world-body");
  if(Wd.status!=="ready"){
    Wd.drawn=false;
    body.innerHTML='<text class="empty-map" x="500" y="260">'+(Wd.status==="error"?"The world map could not be loaded. Reload the page to try again.":"Loading the world map…")+'</text>';
  } else {
    if(!Wd.drawn){
      body.innerHTML=Wd.features.map(function(f){return '<path class="country" data-c="'+esc(f.id)+'" d="'+f.d+'"><title>'+esc(f.name)+'</title></path>'}).join("");
      $("w-list").innerHTML=Wd.features.map(function(f){return '<option value="'+esc(f.name)+'">'}).join("");
      Wd.drawn=true;
    }
    Array.prototype.forEach.call(body.querySelectorAll("path.country"),function(p){
      var id=p.getAttribute("data-c");p.classList.toggle("has",S.countries.has(id));p.classList.toggle("sel",id===S.csel);
    });
    var sp=S.csel&&body.querySelector('path[data-c="'+S.csel.replace(/"/g,"")+'"]');if(sp)body.appendChild(sp); /* draw selected on top */
    if(Wd.fitNext===true&&S.csel)fitCountry(S.csel);
    Wd.fitNext=null;
  }
  $("wlegend").innerHTML='<span><span class="swatch has"></span>Has a profile</span><span><span class="swatch"></span>No profile yet</span>'
    +'<span class="hint">Scroll or pinch to zoom. Drag to move.</span>';
  renderWorldPanel();
}
function renderWorldPanel(){
  var el=$("wpanel"),id=S.csel,h="";
  if(id&&(Wd.byId.has(id)||S.countries.has(id))){
    var c=S.countries.get(id),name=countryName(id);
    h+='<button class="back" type="button" data-act="world-home">← World</button><p class="kicker">Country</p><h2 class="ptitle">'+esc(name)+'</h2>';
    if(c){
      h+=(c.summary?'<p class="lede">'+esc(c.summary)+'</p>':"")
        +(c.updated?'<div class="meta"><span>Updated '+esc(niceDate(c.updated))+'</span></div>':"")
        +findingsHtml(sortClaims(c.claims),false)+debatesHtml(c.debates,false,name);
      var rel=(c.topics||[]).filter(function(t){return S.topics.has(t)});
      if(rel.length){
        h+='<div class="sec"><div class="sec-h"><h3>Related topics</h3></div>';
        rel.forEach(function(t){var tp=S.topics.get(t);h+=connBtn("open-topic",t,tp.title,groupTitle(tp.group))});
        h+='</div>';
      }
    } else {
      h+='<p class="lede">There is no profile for '+esc(name)+' yet.</p>'
        +'<p class="why" style="margin-top:12px">Country profiles are being written. Each one will set out the issues that matter most there, with the evidence and the sources behind it. Until then, the topics map covers the global picture.</p>'
        +'<p style="margin-top:16px"><a class="btn" href="#map">Explore the topics</a></p>';
    }
  } else {
    var list=Array.from(S.countries.keys()).sort(function(a,b){return countryName(a).localeCompare(countryName(b))});
    h+='<p class="kicker">World</p><h2 class="ptitle">Countries</h2>'
      +'<p class="lede">Select a country on the map, or search for it by name, to read about the issues that matter most there.</p>'
      +'<div class="sec"><div class="sec-h"><h3>Country profiles</h3></div>';
    if(!S.loaded)h+='<p class="none">Loading…</p>';
    else if(!list.length)h+='<p class="none">No country profiles have been published yet. Every country can still be selected on the map.</p>';
    list.forEach(function(cid){var c=S.countries.get(cid);h+=connBtn("open-country",cid,countryName(cid),pl((c.claims||[]).length,"finding"))});
    h+='</div><p class="why" style="margin-top:22px">Country borders come from Natural Earth. Showing them does not mean Sunlight takes a position on any disputed border.</p>';
  }
  el.innerHTML=h;
}
function bindWorld(){
  var svg=$("world");
  function goCountry(id,fit){Wd.fitNext=fit?true:false;go("#w-"+id)}
  svg.addEventListener("wheel",function(e){
    if(Wd.status!=="ready")return;e.preventDefault();
    var p=svgPt(e.clientX,e.clientY);zoomAt(p.x,p.y,e.deltaY>0?1.2:1/1.2);
  },{passive:false});
  svg.addEventListener("pointerdown",function(e){
    Wd.ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
    try{svg.setPointerCapture(e.pointerId)}catch(_){}
    if(Wd.ptrs.size===1){var t=e.target.closest&&e.target.closest("[data-c]");Wd.pan={sx:e.clientX,sy:e.clientY,vb:Wd.vb,moved:false,target:t?t.getAttribute("data-c"):null}}
    else if(Wd.ptrs.size===2){var q=Array.from(Wd.ptrs.values());Wd.pinch={d:Math.hypot(q[0].x-q[1].x,q[0].y-q[1].y)};if(Wd.pan)Wd.pan.moved=true}
  });
  svg.addEventListener("pointermove",function(e){
    if(!Wd.ptrs.has(e.pointerId))return;
    Wd.ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(Wd.ptrs.size===2&&Wd.pinch){
      var q=Array.from(Wd.ptrs.values()),d=Math.hypot(q[0].x-q[1].x,q[0].y-q[1].y);
      if(d>0&&Wd.pinch.d>0){var m=svgPt((q[0].x+q[1].x)/2,(q[0].y+q[1].y)/2);zoomAt(m.x,m.y,Wd.pinch.d/d)}
      Wd.pinch.d=d;return;
    }
    var pn=Wd.pan;if(!pn)return;
    var dx=e.clientX-pn.sx,dy=e.clientY-pn.sy;
    if(!pn.moved&&Math.hypot(dx,dy)<5)return;
    pn.moved=true;svg.classList.add("panning");
    var s=svg.getScreenCTM().a||1;setVB(pn.vb.x-dx/s,pn.vb.y-dy/s,pn.vb.w);
  });
  function end(e){
    Wd.ptrs.delete(e.pointerId);
    if(Wd.ptrs.size<2)Wd.pinch=null;
    if(Wd.ptrs.size)return;
    var pn=Wd.pan;Wd.pan=null;svg.classList.remove("panning");
    if(pn&&!pn.moved&&e.type==="pointerup"){if(pn.target)goCountry(pn.target,false);else if(S.csel)go("#world")}
  }
  svg.addEventListener("pointerup",end);
  svg.addEventListener("pointercancel",end);
  function find(){
    var q=$("w-find").value.trim().toLowerCase();if(!q||Wd.status!=="ready")return;
    var f=Wd.features.find(function(x){return x.name.toLowerCase()===q})||Wd.features.find(function(x){return x.name.toLowerCase().indexOf(q)===0})||Wd.features.find(function(x){return x.name.toLowerCase().indexOf(q)>=0});
    if(f){goCountry(f.id,true);$("w-find").value="";$("w-find").blur()}
  }
  $("w-find").addEventListener("change",find);
  $("w-find").addEventListener("keydown",function(e){if(e.key==="Enter"){e.preventDefault();find()}});
  $("w-in").addEventListener("click",function(){var v=Wd.vb;zoomAt(v.x+v.w/2,v.y+v.h/2,1/1.5)});
  $("w-out").addEventListener("click",function(){var v=Wd.vb;zoomAt(v.x+v.w/2,v.y+v.h/2,1.5)});
  $("w-reset").addEventListener("click",function(){setVB(0,0,WW)});
  $("wpanel").addEventListener("click",function(e){
    var b=e.target.closest("[data-act]");if(!b)return;
    var act=b.getAttribute("data-act"),id=b.getAttribute("data-id");
    if(act==="world-home")go("#world");
    else if(act==="open-country")goCountry(id,true);
    else if(act==="open-topic")select("topic",id);
  });
}

/* ---------- render ---------- */
function render(){
  ["map","world","sources","about","us"].forEach(function(v){$("view-"+v).hidden=S.view!==v});
  document.querySelectorAll("[data-tab]").forEach(function(a){if(a.getAttribute("data-tab")===S.view)a.setAttribute("aria-current","page");else a.removeAttribute("aria-current")});
  if(S.view==="map"){renderMap();renderLegend();renderPanel()}
  else if(S.view==="world")renderWorld();
  else if(S.view==="sources")renderSources();
  else if(S.view==="us")renderUs();
  else renderAbout();
}
bindMap();bindWorld();init();
})();
