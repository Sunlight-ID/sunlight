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
var KEYS=["topics","links","sources"];

var CONTENT_URL="content/sunlight-content.json";
/* Stage 1 is a read-only public site. Editing returns once editor log-ins exist (stage 2). */
var S={topics:new Map(),links:new Map(),sources:new Map(),view:"map",sel:null,canWrite:false,loaded:false};
var drag=null,renderQueued=false;

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
  return m;
}
function gaps(){var n=0;S.topics.forEach(function(t){(t.claims||[]).forEach(function(c){if(!(c.sources||[]).length)n++})});S.links.forEach(function(l){if(!(l.sources||[]).length)n++});return n}

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
    S.loaded=true;route();
  }).catch(function(){
    S.loaded=true;setNotice("The map could not be loaded. Check your connection and reload the page.");route();
  });
}
function applyAccess(){document.body.classList.toggle("ro",S.canWrite===false)}

/* ---------- routing ---------- */
function route(){
  var h=location.hash.replace(/^#/,"");
  if(h==="sources"||h==="about"){S.view=h}
  else{
    S.view="map";
    if(h.indexOf("t-")===0&&S.topics.has(h.slice(2)))S.sel={type:"topic",id:h.slice(2)};
    else if(h.indexOf("c-")===0&&S.links.has(h.slice(2)))S.sel={type:"link",id:h.slice(2)};
    else if(h===""||h==="map"||S.loaded)S.sel=null;
  }
  render();
}
function go(hash){if(location.hash===hash)route();else location.hash=hash}
function select(type,id){go(type?"#"+(type==="topic"?"t-":"c-")+id:"#map")}
window.addEventListener("hashchange",function(){route();if(S.view==="map")$("panel").scrollTop=0});

/* ---------- map ---------- */
function wrap(t,max){
  var w=String(t).split(/\s+/),lines=[],cur="";
  w.forEach(function(x){if(cur&&(cur+" "+x).length>max){lines.push(cur);cur=x}else cur=cur?cur+" "+x:x});
  if(cur)lines.push(cur);
  if(lines.length>3){lines[2]=lines.slice(2).join(" ");lines.length=3;if(lines[2].length>max+2)lines[2]=lines[2].slice(0,max+1)+"…"}
  return lines;
}
function pos(t,i,n){
  if(typeof t.x==="number"&&typeof t.y==="number")return{x:t.x,y:t.y};
  var a=(i/Math.max(n,1))*Math.PI*2-Math.PI/2;return{x:W/2+Math.cos(a)*330,y:H/2+Math.sin(a)*210};
}
function freeSpot(){
  var best={x:W/2,y:H/2},bestD=-1,pts=[];
  S.topics.forEach(function(t){if(typeof t.x==="number")pts.push(t)});
  for(var x=120;x<=880;x+=95)for(var y=70;y<=550;y+=80){
    var d=Infinity;pts.forEach(function(p){d=Math.min(d,Math.hypot((p.x-x)/1.6,p.y-y))});
    if(d>bestD){bestD=d;best={x:x,y:y}}
  }
  return best;
}
function renderMap(){
  var body=$("map-body"),html="",sel=S.sel,near=null,why={};
  var entries=Array.from(S.topics.entries()),P={};
  entries.forEach(function(e,i){P[e[0]]=pos(e[1],i,entries.length)});
  if(sel&&sel.type==="topic"){near=new Set([sel.id]);topicLinks(sel.id).forEach(function(x){
    near.add(x[1].a);near.add(x[1].b);
    var o=x[1].a===sel.id?x[1].b:x[1].a,lb=x[1].label||"";if(lb.length>31)lb=lb.slice(0,30)+"…";
    if(lb)why[o]=why[o]?"Several connections":lb;
  })}
  if(sel&&sel.type==="link"){var L=S.links.get(sel.id);near=new Set(L?[L.a,L.b]:[])}
  S.links.forEach(function(l,id){
    var a=P[l.a],b=P[l.b];if(!a||!b)return;
    var isSel=sel&&sel.type==="link"&&sel.id===id;
    var on=!sel||isSel||(sel.type==="topic"&&(l.a===sel.id||l.b===sel.id));
    var k=EV[l.strength]?l.strength:"emerging";
    var ta=S.topics.get(l.a).title,tb=S.topics.get(l.b).title;
    html+='<g class="edge-g'+(isSel?" sel":"")+(on?"":" dim")+'" data-link="'+esc(id)+'" tabindex="0" role="button" aria-label="Connection between '+esc(ta)+' and '+esc(tb)+': '+esc(l.label||"")+'. Evidence: '+EV[k].label+'">'
      +'<line class="edge '+k+'" x1="'+a.x+'" y1="'+a.y+'" x2="'+b.x+'" y2="'+b.y+'"/>'
      +'<line class="edge-hit" x1="'+a.x+'" y1="'+a.y+'" x2="'+b.x+'" y2="'+b.y+'"/>'
      +(l.label&&S.links.size<=8?'<text class="edge-label" x="'+(a.x+b.x)/2+'" y="'+((a.y+b.y)/2+4)+'">'+esc(l.label)+'</text>':"")+'</g>';
  });
  entries.forEach(function(e){
    var id=e[0],t=e[1],p=P[id],lines=wrap(t.title,20),n3=lines.length===3;
    var isSel=sel&&sel.type==="topic"&&sel.id===id,on=!near||near.has(id);
    var nc=(t.claims||[]).length,nd=(t.debates||[]).length;
    var meta=nc+(nc===1?" finding":" findings")+(nd?" · "+nd+(nd===1?" debate":" debates"):"");
    var ty=n3?-17:lines.length===2?-12:-3,step=n3?15:18;
    html+='<g class="node'+(isSel?" sel":"")+(on?"":" dim")+'" data-node="'+esc(id)+'" transform="translate('+p.x+','+p.y+')" tabindex="0" role="button" aria-label="'+esc(t.title)+', '+esc(meta)+'">'
      +'<rect x="'+(-NW/2)+'" y="'+(-NH/2)+'" width="'+NW+'" height="'+NH+'" rx="9"/>'
      +lines.map(function(ln,i){return '<text class="node-title'+(n3?" sm":"")+'" y="'+(ty+i*step)+'">'+esc(ln)+'</text>'}).join("")
      +'<text class="node-meta'+(why[id]?" why":"")+'" y="'+(n3?28:lines.length===2?24:18)+'">'+esc(why[id]||meta)+'</text></g>';
  });
  if(!entries.length)html='<text class="empty-map" x="500" y="310">'+(S.loaded?"No topics yet. Use Add topic to start the map.":"Loading the map…")+'</text>';
  body.innerHTML=html;
}
function svgPoint(e){var svg=$("map"),pt=svg.createSVGPoint();pt.x=e.clientX;pt.y=e.clientY;return pt.matrixTransform(svg.getScreenCTM().inverse())}
function bindMap(){
  var svg=$("map");
  svg.addEventListener("pointerdown",function(e){
    var n=e.target.closest("[data-node]"),l=e.target.closest("[data-link]");
    drag={node:n?n.getAttribute("data-node"):null,link:l?l.getAttribute("data-link"):null,sx:e.clientX,sy:e.clientY,moved:false};
    if(drag.node){var t=S.topics.get(drag.node),p=svgPoint(e),cur=pos(t,0,1);
      if(typeof t.x!=="number"){var ents=Array.from(S.topics.keys());cur=pos(t,ents.indexOf(drag.node),ents.length)}
      drag.ox=cur.x-p.x;drag.oy=cur.y-p.y;try{svg.setPointerCapture(e.pointerId)}catch(_){}}
  });
  svg.addEventListener("pointermove",function(e){
    if(!drag||!drag.node||S.canWrite===false||e.pointerType==="touch")return;
    if(!drag.moved&&Math.hypot(e.clientX-drag.sx,e.clientY-drag.sy)<5)return;
    drag.moved=true;var p=svgPoint(e),t=S.topics.get(drag.node);if(!t)return;
    t.x=Math.round(Math.max(NW/2+6,Math.min(W-NW/2-6,p.x+drag.ox)));
    t.y=Math.round(Math.max(NH/2+6,Math.min(H-NH/2-6,p.y+drag.oy)));
    renderMap();
  });
  function end(){
    if(!drag)return;var d=drag;drag=null;
    if(d.moved){var t=S.topics.get(d.node);if(t)put("topics",d.node,t)}
    else if(d.node)select("topic",d.node);
    else if(d.link)select("link",d.link);
    else if(S.sel)select(null);
    if(renderQueued){renderQueued=false;route()}
  }
  svg.addEventListener("pointerup",end);
  svg.addEventListener("pointercancel",function(){drag=null});
  svg.addEventListener("keydown",function(e){
    if(e.key!=="Enter"&&e.key!==" ")return;
    var n=e.target.closest("[data-node]"),l=e.target.closest("[data-link]");
    if(n){e.preventDefault();select("topic",n.getAttribute("data-node"))}
    else if(l){e.preventDefault();select("link",l.getAttribute("data-link"))}
  });
}
function renderLegend(){
  $("legend").innerHTML='<b>Strength of evidence</b>'+EV_ORDER.map(function(k){return '<span class="ev '+k+'" title="'+esc(EV[k].desc)+'">'+evGlyph(k)+EV[k].label+'</span>'}).join("")
    +'<span class="hint">Select a topic to see how its neighbours connect, or a line to read the evidence.'+(S.canWrite===false?"":" With a mouse, drag topics to arrange them.")+'</span>';
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
function renderPanel(){
  var el=$("panel"),sel=S.sel,h="";
  if(sel&&sel.type==="topic"&&S.topics.has(sel.id)){
    var t=S.topics.get(sel.id),id=sel.id;
    var claims=(t.claims||[]).slice().sort(function(a,b){return EV_ORDER.indexOf(a.strength)-EV_ORDER.indexOf(b.strength)});
    h+='<button class="back" type="button" data-act="home">← Overview</button><p class="kicker">Topic</p><h2 class="ptitle">'+esc(t.title)+'</h2>'
      +'<p class="lede">'+esc(t.summary||"")+'</p>'
      +'<div class="meta">'+(t.updated?'<span>Updated '+esc(niceDate(t.updated))+'</span>':"")+editBtn("edit-topic","Edit topic")+'</div>';
    h+='<div class="sec"><div class="sec-h"><h3>What the evidence shows</h3>'+editBtn("add-claim","Add finding")+'</div>';
    if(!claims.length)h+='<p class="none">No findings yet.</p>';
    claims.forEach(function(c){
      h+='<div class="item"><div class="item-top">'+evPill(c.strength)+editBtn("edit-claim","Edit",' data-id="'+esc(c.id)+'"')+'</div>'
        +'<p class="claim">'+esc(c.text)+'</p>'
        +(c.note?'<p class="why"><b>Why this rating</b> '+esc(c.note)+'</p>':"")+refsHtml(c.sources)+'</div>';
    });
    h+='</div><div class="sec"><div class="sec-h"><h3>Open debates</h3>'+editBtn("add-debate","Add debate")+'</div>';
    if(!(t.debates||[]).length)h+='<p class="none">No debates recorded for this topic yet.</p>';
    (t.debates||[]).forEach(function(d){
      h+='<div class="item"><div class="item-top"><h4 class="debate-q">'+esc(d.question)+'</h4>'+editBtn("edit-debate","Edit",' data-id="'+esc(d.id)+'"')+'</div>'
        +(d.agreed?'<p class="agreed"><b>Not in dispute</b>'+esc(d.agreed)+'</p>':"")+'<div class="positions">';
      (d.positions||[]).forEach(function(p){
        h+='<div class="pos"><h4><span>'+esc(p.label)+'</span>'+editBtn("edit-pos","Edit",' data-id="'+esc(d.id)+'" data-pid="'+esc(p.id)+'"')+'</h4><p>'+esc(p.text||"")+'</p>'+refsHtml(p.sources)+'</div>';
      });
      h+='</div><p style="margin-top:10px">'+editBtn("add-pos","Add a position",' data-id="'+esc(d.id)+'"')+'</p></div>';
    });
    var ls=topicLinks(id);
    h+='</div><div class="sec"><div class="sec-h"><h3>Connected to</h3>'+editBtn("add-link-here","Add connection")+'</div>';
    if(!ls.length)h+='<p class="none">Not connected to anything yet.</p>';
    ls.forEach(function(x){
      var o=S.topics.get(x[1].a===id?x[1].b:x[1].a);
      h+='<button type="button" class="conn" data-act="open-link" data-id="'+esc(x[0])+'"><span><span class="to">'+esc(o?o.title:"?")+'</span><span class="lbl">'+esc(x[1].label||"")+'</span></span>'+evPill(x[1].strength)+'</button>';
    });
    h+='</div>';
  } else if(sel&&sel.type==="link"&&S.links.has(sel.id)){
    var l=S.links.get(sel.id),a=S.topics.get(l.a),b=S.topics.get(l.b);
    h+='<button class="back" type="button" data-act="home">← Overview</button><p class="kicker">Connection</p>'
      +'<h2 class="ptitle">'+esc(l.label||"Connection")+'</h2>'
      +'<p class="pair">Between <button type="button" data-act="open-topic" data-id="'+esc(l.a)+'">'+esc(a?a.title:"?")+'</button> and <button type="button" data-act="open-topic" data-id="'+esc(l.b)+'">'+esc(b?b.title:"?")+'</button></p>'
      +'<div class="item" style="border-bottom:0"><div class="item-top">'+evPill(l.strength)+editBtn("edit-link","Edit connection")+'</div>'
      +'<p class="lede">'+esc(l.text||"")+'</p>'+refsHtml(l.sources)+'</div>';
  } else {
    var g=gaps();
    h+='<p class="kicker">Overview</p><h2 class="ptitle">A map of connected crises</h2>'
      +'<p class="lede">Each box is a topic. Each line is a link between two of them that research supports. Select either to read what is known, how strong the evidence is, where experts disagree, and the sources behind it.</p>'
      +'<div class="stats"><div><b>'+S.topics.size+'</b><span>topics</span></div><div><b>'+S.links.size+'</b><span>connections</span></div><div><b>'+S.sources.size+'</b><span>sources</span></div>'
      +(g?'<div><b style="color:var(--danger)">'+g+'</b><span>need a source</span></div>':"")+'</div>'
      +'<div class="sec"><div class="sec-h"><h3>How to read the ratings</h3></div><div class="scale" style="margin-top:14px">'
      +EV_ORDER.map(function(k){return '<div>'+evPill(k)+'<span>'+EV[k].desc+'</span></div>'}).join("")+'</div></div>'
      +'<div class="sec"><div class="sec-h"><h3>Topics</h3></div>';
    if(!S.topics.size)h+='<p class="none">'+(S.loaded?"Nothing here yet.":"Loading…")+'</p>';
    sortedTopics().forEach(function(e){
      h+='<button type="button" class="conn" data-act="open-topic" data-id="'+esc(e[0])+'"><span><span class="to">'+esc(e[1].title)+'</span><span class="lbl">'+(e[1].claims||[]).length+' findings, '+(e[1].debates||[]).length+' debates, '+topicLinks(e[0]).length+' connections</span></span></button>';
    });
    h+='</div>';
  }
  el.innerHTML=h;
}
$("panel").addEventListener("click",function(e){
  var b=e.target.closest("[data-act]");if(!b)return;
  var act=b.getAttribute("data-act"),id=b.getAttribute("data-id"),pid=b.getAttribute("data-pid"),tid=S.sel&&S.sel.id;
  if(act==="home")select(null);
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
  var t=id?clone(S.topics.get(id)):{title:"",summary:"",claims:[],debates:[]};
  openForm({title:id?"Edit topic":"Add a topic",values:t,fields:[
    {key:"title",label:"Topic name",required:true},
    {key:"summary",label:"Plain-language summary",type:"textarea",hint:"Two or three sentences a newcomer could follow."}],
    save:function(v){
      t.title=v.title;t.summary=v.summary;
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

/* ---------- render ---------- */
function render(){
  ["map","sources","about"].forEach(function(v){$("view-"+v).hidden=S.view!==v});
  document.querySelectorAll("[data-tab]").forEach(function(a){if(a.getAttribute("data-tab")===S.view)a.setAttribute("aria-current","page");else a.removeAttribute("aria-current")});
  if(S.view==="map"){renderMap();renderLegend();renderPanel()}
  else if(S.view==="sources")renderSources();
  else renderAbout();
}
bindMap();init();
})();
