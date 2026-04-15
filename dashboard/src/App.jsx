import { useState, useEffect, useMemo } from "react";
var _v="2.0";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Line, Legend, LabelList } from "recharts";

var P={void:"#121212",cosmos:"#121212",nebula:"#1a1a1a",glass:"rgba(30,18,50,0.65)",ember:"#F96203",blaze:"#FF3D00",solar:"#FFAA00",lava:"#FF2222",orchid:"#A855F7",violet:"#7C3AED",fuchsia:"#D946EF",rose:"#F43F5E",cyan:"#22D3EE",mint:"#34D399",fb:"#4599FF",ig:"#E1306C",tt:"#00F2EA",gd:"#34A853",yt:"#FF0000",txt:"#FFFBF8",sub:"#8B7FA3",dim:"#4A3D60",rule:"rgba(168,85,247,0.12)",critical:"#ef4444",warning:"#fbbf24",info:"#60a5fa",positive:"#4ade80"};
var gFire="linear-gradient(135deg,#E8231A,#FF6B00,#FFAA00)",gEmber="linear-gradient(135deg,#FF3D00,#FF6B00)";
var ff="Poppins,Outfit,Segoe UI,sans-serif",fm="JetBrains Mono,Consolas,monospace";
var API=window.location.origin;
var API_KEY="c0c7438297c52d8100494263d97389b5777312af2e88f8cdfc247622454b3d80";
var LOOKER_URLS={"mtn momo pos":"https://lookerstudio.google.com/reporting/2c88c27a-4e0f-46ed-8ef9-afdb1b54a9dd/page/p_2upnicpx0d","momo pos":"https://lookerstudio.google.com/reporting/2c88c27a-4e0f-46ed-8ef9-afdb1b54a9dd/page/p_2upnicpx0d","momo":"https://lookerstudio.google.com/reporting/e527d821-db3b-4e60-9f3a-626165e2eed1/page/p_1ooj1p0nmd","mtn momo":"https://lookerstudio.google.com/reporting/e527d821-db3b-4e60-9f3a-626165e2eed1/page/p_1ooj1p0nmd","willowbrook":"https://lookerstudio.google.com/reporting/823fd5fa-b39d-4dc3-b623-549197d0341f/page/p_2upnicpx0d","psycho":"https://lookerstudio.google.com/reporting/0adc106a-50e2-42cc-a4ca-aafc04160e5d/page/p_1ooj1p0nmd","khava":"","concord":"","eden":"","flower":""};
var LOOKER_KEYS=["mtn momo pos","momo pos","willowbrook","psycho","khava","concord","eden","flower","momo","mtn momo"];
function findLookerUrl(camps,sel){var s=camps.filter(function(x){return sel.indexOf(x.campaignId)>=0;});if(s.length===0)return{url:"",client:"none"};var names=s.map(function(x){return(x.campaignName||"").toLowerCase();}).join(" ");for(var i=0;i<LOOKER_KEYS.length;i++){if(names.indexOf(LOOKER_KEYS[i])>=0){var u=LOOKER_URLS[LOOKER_KEYS[i]];return{url:u,client:LOOKER_KEYS[i]};}}return{url:"",client:"unknown"};}
var fmt=function(n){var v=parseFloat(n);if(isNaN(v))return"0";if(v>=1e6)return(v/1e6).toFixed(2)+"M";if(v>=1e3)return(v/1e3).toFixed(1)+"K";return Math.round(v).toLocaleString();};
var fR=function(n){var v=parseFloat(n);return isNaN(v)?"R0.00":"R"+v.toLocaleString("en-ZA",{minimumFractionDigits:2,maximumFractionDigits:2});};
var pc=function(n){var v=parseFloat(n);return isNaN(v)?"0.00%":v.toFixed(2)+"%";};

function LoginScreen(props){
  var es=useState(""),loginErr=es[0],setLoginErr=es[1];
  var ps=useState(""),pw=ps[0],setPw=ps[1];
  var ls=useState(false),busy=ls[0],setBusy=ls[1];
  var handleLogin=function(){
    if(!pw){setLoginErr("Please enter a password");return;}
    setBusy(true);setLoginErr("");
    fetch(API+"/api/auth",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:pw})})
    .then(function(r){return r.json();})
    .then(function(d){
      setBusy(false);
      if(d.token){sessionStorage.setItem("gas_session",d.token);sessionStorage.setItem("gas_role",d.role||"admin");props.onLogin(d.token,d.role);}
      else{setLoginErr("Invalid password");}
    }).catch(function(){setBusy(false);setLoginErr("Connection error");});
  };
  return(<div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"linear-gradient(170deg,#06020e,#0d0618 30%,#150b24 60%,#0d0618)",fontFamily:ff}}>
    <div style={{position:"fixed",inset:0,pointerEvents:"none"}}><div style={{position:"absolute",inset:0,opacity:0.015,backgroundImage:"radial-gradient("+P.ember+" 0.5px,transparent 0.5px),radial-gradient("+P.orchid+" 0.5px,transparent 0.5px)",backgroundSize:"40px 40px",backgroundPosition:"0 0,20px 20px"}}/></div>
    <div style={{width:"100%",maxWidth:380,padding:32,position:"relative",zIndex:1}}>
      <div style={{textAlign:"center",marginBottom:40}}>
        <div style={{width:72,height:72,borderRadius:"50%",overflow:"hidden",margin:"0 auto 20px",boxShadow:"0 0 40px rgba(249,98,3,0.3)"}}><img src="/GAS_LOGO_EMBLEM_GAS_Primary_Gradient.png" alt="GAS" style={{width:"100%",height:"100%",objectFit:"cover"}}/></div>
        <div style={{fontSize:20,fontWeight:900,letterSpacing:6,fontFamily:fm,lineHeight:1,marginBottom:8}}><span style={{color:P.txt}}>MEDIA </span><span style={{color:P.ember}}>ON </span><span style={{background:gFire,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>GAS</span></div>
        <div style={{fontSize:10,color:P.sub,letterSpacing:3,textTransform:"uppercase",fontFamily:fm,fontWeight:600}}>Digital Performance Intelligence</div>
      </div>
      <div style={{background:"rgba(30,18,50,0.5)",border:"1px solid "+P.rule,borderRadius:16,padding:28,backdropFilter:"blur(20px)"}}>
        <div style={{fontSize:11,color:P.sub,fontFamily:fm,letterSpacing:2,textTransform:"uppercase",fontWeight:700,marginBottom:16,textAlign:"center"}}>Dashboard Access</div>
        <input type="password" placeholder="Enter password" value={pw} onChange={function(e){setPw(e.target.value);setLoginErr("");}} onKeyDown={function(e){if(e.key==="Enter")handleLogin();}} autoFocus style={{width:"100%",boxSizing:"border-box",background:"rgba(6,2,14,0.6)",border:"1px solid "+P.rule,borderRadius:10,padding:"14px 16px",color:P.txt,fontSize:14,fontFamily:fm,outline:"none",marginBottom:16,letterSpacing:2}}/>
        {loginErr&&<div style={{color:P.critical,fontSize:11,fontFamily:fm,marginBottom:12,textAlign:"center"}}>{loginErr}</div>}
        <button onClick={handleLogin} disabled={busy} style={{width:"100%",background:busy?"#555":gEmber,border:"none",borderRadius:10,padding:"14px 24px",color:"#fff",fontSize:13,fontWeight:800,fontFamily:fm,cursor:busy?"wait":"pointer",letterSpacing:2,opacity:busy?0.7:1}}>{busy?"AUTHENTICATING...":"ENTER"}</button>
      </div>
    </div>
  </div>);
}

var Ic={
chart:function(c,s){s=s||20;return<svg width={s} height={s} viewBox="0 0 24 24" fill="none"><rect x="3" y="12" width="4" height="9" rx="1" stroke={c} strokeWidth="1.5" fill={c+"15"}/><rect x="10" y="6" width="4" height="15" rx="1" stroke={c} strokeWidth="1.5" fill={c+"15"}/><rect x="17" y="2" width="4" height="19" rx="1" stroke={c} strokeWidth="1.5" fill={c+"15"}/></svg>;},
radar:function(c,s){s=s||20;return<svg width={s} height={s} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke={c} strokeWidth="1.5" opacity="0.3"/><circle cx="12" cy="12" r="6" stroke={c} strokeWidth="1.5" opacity="0.5"/><circle cx="12" cy="12" r="2" fill={c}/></svg>;},
pulse:function(c,s){s=s||20;return<svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M2 12h4l3-8 4 16 3-8h6" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>;},
target:function(c,s){s=s||20;return<svg width={s} height={s} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke={c} strokeWidth="1.5"/><circle cx="12" cy="12" r="6" stroke={c} strokeWidth="1.5"/><circle cx="12" cy="12" r="2" fill={c}/></svg>;},
bolt:function(c,s){s=s||20;return<svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke={c} strokeWidth="1.5" fill={c+"15"} strokeLinejoin="round"/></svg>;},
eye:function(c,s){s=s||20;return<svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" stroke={c} strokeWidth="1.5"/><circle cx="12" cy="12" r="3" stroke={c} strokeWidth="1.5"/></svg>;},
crown:function(c,s){s=s||20;return<svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M2 20h20L19 8l-4 5-3-7-3 7-4-5L2 20z" stroke={c} strokeWidth="1.5" fill={c+"15"} strokeLinejoin="round"/></svg>;},
users:function(c,s){s=s||20;return<svg width={s} height={s} viewBox="0 0 24 24" fill="none"><circle cx="9" cy="7" r="3" stroke={c} strokeWidth="1.5"/><path d="M2 21v-2a5 5 0 0110 0v2" stroke={c} strokeWidth="1.5"/></svg>;},
globe:function(c,s){s=s||20;return<svg width={s} height={s} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke={c} strokeWidth="1.5"/><path d="M2 12h20" stroke={c} strokeWidth="1" opacity="0.3"/></svg>;},
share:function(c,s){s=s||20;return<svg width={s} height={s} viewBox="0 0 24 24" fill="none"><circle cx="18" cy="5" r="3" stroke={c} strokeWidth="1.5"/><circle cx="6" cy="12" r="3" stroke={c} strokeWidth="1.5"/><circle cx="18" cy="19" r="3" stroke={c} strokeWidth="1.5"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" stroke={c} strokeWidth="1.5"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" stroke={c} strokeWidth="1.5"/></svg>;},
check:function(c,s){s=s||20;return<svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>;},
flag:function(c,s){s=s||20;return<svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" stroke={c} strokeWidth="1.5" fill={c+"15"}/><line x1="4" y1="22" x2="4" y2="15" stroke={c} strokeWidth="1.5"/></svg>;},
alert:function(c,s){s=s||20;return<svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke={c} strokeWidth="1.5"/><line x1="12" y1="9" x2="12" y2="13" stroke={c} strokeWidth="1.5"/></svg>;},
fire:function(c,s){s=s||20;return<svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M12 2c0 4-4 6-4 10a6 6 0 0012 0c0-4-4-6-4-10z" stroke={c} strokeWidth="1.5" fill={c+"20"}/></svg>;}
};

function Glass(props){var a=props.accent||P.ember,st=props.st||{},hv=props.hv;var s=useState(false);return(<div onMouseEnter={function(){s[1](true);}} onMouseLeave={function(){s[1](false);}} style={Object.assign({background:P.glass,border:"1px solid "+(s[0]&&hv?a+"50":P.rule),borderRadius:16,position:"relative",overflow:"hidden",transition:"all 0.3s ease",transform:s[0]&&hv?"translateY(-2px)":"none",boxShadow:s[0]&&hv?"0 12px 40px "+a+"15":"0 4px 20px rgba(0,0,0,0.25)"},st)}><div style={{position:"absolute",top:0,left:"10%",right:"10%",height:1,background:"linear-gradient(90deg,transparent,"+a+"80,transparent)",opacity:s[0]&&hv?1:0.4}}/>{props.children}</div>);}
function Metric(props){return(<Glass accent={props.accent} hv={true} st={{padding:"22px 20px"}}><div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}><div style={{display:"flex",alignItems:"center",gap:8}}>{props.icon}<span style={{fontSize:9,fontWeight:700,color:P.sub,letterSpacing:2.5,textTransform:"uppercase",fontFamily:fm}}>{props.label}</span></div><div style={{width:8,height:8,borderRadius:"50%",background:props.accent,boxShadow:"0 0 12px "+props.accent+"60",animation:"pulse-glow 2s ease-in-out infinite"}}></div></div><div style={{fontSize:28,fontWeight:900,fontFamily:ff,lineHeight:1,letterSpacing:-1.5,color:props.accent,marginBottom:6}}>{props.value}</div>{props.sub&&<div style={{fontSize:10,color:P.dim,marginTop:10,fontFamily:fm,lineHeight:1.7,borderTop:"1px solid "+P.rule,paddingTop:10}}>{props.sub}</div>}</Glass>);}
function SH(props){var a=props.accent||P.ember;return(<div style={{marginBottom:28}}><div style={{display:"flex",alignItems:"center",gap:14}}><div style={{width:40,height:40,borderRadius:12,background:"linear-gradient(135deg,"+a+"20,"+a+"08)",border:"1px solid "+a+"30",display:"flex",alignItems:"center",justifyContent:"center"}}>{props.icon}</div><div><h2 style={{margin:0,fontSize:22,fontWeight:900,color:P.txt,fontFamily:ff}}>{props.title}</h2>{props.sub&&<p style={{margin:"2px 0 0",fontSize:11,color:P.sub,fontFamily:fm}}>{props.sub}</p>}</div></div><div style={{height:1,marginTop:16,background:"linear-gradient(90deg,"+a+"50,"+a+"15,transparent 80%)"}}/></div>);}
function Pill(props){return(<span style={{display:"inline-flex",alignItems:"center",gap:5,background:props.color+"12",border:"1px solid "+props.color+"30",borderRadius:20,padding:"3px 10px",fontSize:9,fontWeight:700,color:props.color,fontFamily:fm,textTransform:"uppercase"}}><span style={{width:6,height:6,borderRadius:"50%",background:props.color}}/>{props.name}</span>);}
function Tip(props){if(!props.active||!props.payload||!props.payload.length)return null;return(<div style={{background:"#121212",border:"1px solid rgba(255,255,255,0.2)",borderRadius:12,padding:"12px 16px",boxShadow:"0 8px 32px rgba(0,0,0,0.6)"}}><div style={{fontSize:11,fontWeight:800,color:P.txt,fontFamily:fm,marginBottom:4}}>{props.label}</div>{props.payload.map(function(p,i){var v=p.value;var display="";var n=(p.name||"").toLowerCase();var dn=(p.dataKey||"").toLowerCase();var isPct=dn==="ctr"||n.indexOf("ctr")>=0||n.indexOf("rate")>=0;var isCurrency=n.indexOf("spend")>=0||n.indexOf("cpc")>=0||n.indexOf("cpm")>=0||n.indexOf("cpl")>=0||n.indexOf("cpf")>=0||n.indexOf("cost per")>=0||n.indexOf("cost-per")>=0||dn==="spend"||dn==="cpc"||dn==="cpm"||dn==="costper";if(isPct){display=typeof v==="number"?v.toFixed(2)+"%":v;}else if(isCurrency){display="R"+(typeof v==="number"?v.toLocaleString("en-ZA",{minimumFractionDigits:2,maximumFractionDigits:2}):v);}else{display=typeof v==="number"?v.toLocaleString():v;}return<div key={i} style={{fontSize:11,color:p.color||P.sub,fontFamily:fm,lineHeight:1.8}}>{p.name}: {display}</div>;})}</div>);}
function PH(props){var bg=props.platform==="Facebook"?P.fb:props.platform==="Instagram"?"linear-gradient(135deg,#e1306c,#833ab4)":props.platform==="TikTok"?"#1e1e2e":P.ember;var dot=props.platform==="Facebook"?"#fff":props.platform==="TikTok"?P.tt:"#fff";return(<div style={{background:bg,padding:"14px 24px",borderRadius:12,marginBottom:18,display:"flex",alignItems:"center",justifyContent:"space-between",boxShadow:"0 4px 20px rgba(0,0,0,0.3)"}}><div style={{display:"flex",alignItems:"center",gap:10}}><span style={{width:10,height:10,borderRadius:"50%",background:dot,boxShadow:"0 0 10px "+dot}}></span><span style={{fontSize:15,fontWeight:800,color:"#fff",fontFamily:ff,letterSpacing:0.5}}>{props.platform}</span>{props.suffix&&<span style={{fontSize:12,fontWeight:400,color:"rgba(255,255,255,0.7)",fontFamily:fm}}>· {props.suffix}</span>}</div><div style={{fontSize:10,fontWeight:700,color:"rgba(255,255,255,0.4)",fontFamily:fm,letterSpacing:2,textTransform:"uppercase"}}>LIVE DATA</div></div>);}
function Insight(props){var a=props.accent||P.ember;return(<div style={{marginTop:24,padding:"22px 26px",background:"linear-gradient(135deg,"+a+"08 0%,"+a+"03 50%, transparent 100%)",border:"1px solid "+a+"20",borderLeft:"4px solid "+a,borderRadius:"0 14px 14px 0",position:"relative",overflow:"hidden"}}><div style={{position:"absolute",top:0,left:4,width:120,height:"100%",background:"linear-gradient(90deg,"+a+"06, transparent)",pointerEvents:"none"}}></div><div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,position:"relative"}}>{props.icon||Ic.bolt(a,16)}<span style={{fontSize:10,fontWeight:800,color:a,letterSpacing:3,fontFamily:fm,textTransform:"uppercase"}}>{props.title||"Campaign Read"}</span><div style={{flex:1,height:1,background:"linear-gradient(90deg,"+a+"30, transparent)",marginLeft:8}}></div></div><div style={{fontSize:13.5,color:P.txt,lineHeight:2.1,fontFamily:ff,position:"relative",letterSpacing:0.2}}>{props.children}</div></div>);}
function SevBadge(props){var c={critical:P.critical,warning:P.warning,info:P.info,positive:P.positive}[props.s]||P.info;return(<span style={{display:"inline-flex",alignItems:"center",gap:5,background:c+"18",border:"1px solid "+c+"40",borderRadius:6,padding:"3px 10px",fontSize:10,fontWeight:800,color:c,fontFamily:fm,textTransform:"uppercase"}}><span style={{width:7,height:7,borderRadius:"50%",background:c}}/>{props.s}</span>);}

function CampaignSelector(props){
  var cs=props.campaigns,sel=props.selected,search=props.search;
  var f=cs.filter(function(c){return (parseFloat(c.impressions||0)>0||parseFloat(c.spend||0)>0)&&(c.campaignName.toLowerCase().indexOf(search.toLowerCase())>=0||c.accountName.toLowerCase().indexOf(search.toLowerCase())>=0);});
  var g={};f.forEach(function(c){var k=c.accountName||"Unknown";if(!g[k])g[k]={platform:c.platform,campaigns:[]};g[k].campaigns.push(c);});
  return(<div style={{background:P.glass,border:"1px solid "+P.rule,borderRadius:16,padding:18,maxHeight:480,overflowY:"auto"}}>
    <input placeholder="Search campaigns..." value={search} onChange={function(e){props.onSearch(e.target.value);}} style={{width:"100%",boxSizing:"border-box",background:"rgba(40,25,60,0.5)",border:"1px solid "+P.rule,borderRadius:8,padding:"8px 14px",color:P.txt,fontSize:12,fontFamily:fm,outline:"none",marginBottom:12}}/>
    <div style={{display:"flex",gap:8,marginBottom:12}}>
      <button onClick={props.onSelectAll} style={{background:P.ember+"15",border:"1px solid "+P.ember+"30",borderRadius:8,padding:"4px 12px",color:P.ember,fontSize:10,fontWeight:700,fontFamily:fm,cursor:"pointer"}}>All ({f.length})</button>
      <button onClick={props.onClearAll} style={{background:P.rule,border:"1px solid "+P.rule,borderRadius:8,padding:"4px 12px",color:P.sub,fontSize:10,fontWeight:700,fontFamily:fm,cursor:"pointer"}}>Clear</button>
      <span style={{fontSize:10,color:P.dim,fontFamily:fm,alignSelf:"center",marginLeft:"auto"}}>{sel.length} sel</span>
    </div>
    {Object.keys(g).map(function(k){var gr=g[k];var gc=gr.campaigns[0].platform==="TikTok"?P.tt:gr.campaigns[0].platform==="Google Display"?P.gd:gr.campaigns[0].platform==="Instagram"?P.ig:P.fb;return(<div key={k} style={{marginBottom:12}}><div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6,paddingBottom:4,borderBottom:"1px solid "+P.rule}}><span style={{width:7,height:7,borderRadius:"50%",background:gc}}/><span style={{fontSize:9,fontWeight:800,color:gc,letterSpacing:2,textTransform:"uppercase",fontFamily:fm}}>{k}</span></div>
      {gr.campaigns.map(function(c){var s=sel.indexOf(c.campaignId)>=0;return(<div key={c.campaignId} onClick={function(){props.onToggle(c.campaignId);}} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",marginBottom:2,borderRadius:8,cursor:"pointer",background:s?gc+"10":"transparent",border:"1px solid "+(s?gc+"30":"transparent")}}>
        <div style={{width:18,height:18,borderRadius:5,border:"2px solid "+(s?gc:P.dim),background:s?gc:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{s&&Ic.check("#fff",12)}</div>
        <div style={{flex:1,minWidth:0}}><div style={{fontSize:11,fontWeight:600,color:s?P.txt:P.sub,whiteSpace:"normal",wordBreak:"break-word",lineHeight:1.4}}>{c.campaignName}</div><div style={{fontSize:9,color:P.dim,fontFamily:fm}}>{fmt(c.impressions)} imps {(function(){var isCompleted=(c.endDate&&new Date(c.endDate)<new Date())||(c.status==="paused"||c.status==="campaign_paused"||c.status==="adset_paused");if(isCompleted)return <span style={{background:"rgba(136,136,136,0.2)",color:"#888",fontWeight:800,textTransform:"uppercase",marginLeft:4,fontSize:7,padding:"2px 6px",borderRadius:4,letterSpacing:1}}>COMPLETED</span>;if(c.status==="scheduled")return <span style={{background:P.solar+"20",color:P.solar,fontWeight:800,textTransform:"uppercase",marginLeft:4,fontSize:7,padding:"2px 6px",borderRadius:4,letterSpacing:1}}>SCHEDULED</span>;return null;})()} · {fR(parseFloat(c.spend))}</div></div>
      </div>);})}
    </div>);})}
  </div>);
}

function ShareModal(props){var shareUrl=window.location.origin+'/view/?from='+props.dateFrom+'&to='+props.dateTo+'&campaigns='+props.selected.join(',');var cs=useState(false);var copy=function(){navigator.clipboard.writeText(shareUrl);cs[1](true);setTimeout(function(){cs[1](false);},2000);};return(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000}} onClick={props.onClose}><div onClick={function(e){e.stopPropagation();}} style={{background:P.cosmos,border:"1px solid "+P.rule,borderRadius:20,padding:32,width:480,maxWidth:"90vw"}}><div style={{fontSize:18,fontWeight:900,color:P.txt,fontFamily:ff,marginBottom:6}}>Share with Client</div><div style={{fontSize:12,color:P.sub,marginBottom:16}}>Client gets read-only access with date toggles. No campaign selector, no optimisation tab.</div><div style={{display:"flex",gap:8}}><input readOnly value={shareUrl} style={{flex:1,background:P.glass,border:"1px solid "+P.rule,borderRadius:10,padding:"10px 14px",color:P.txt,fontSize:12,fontFamily:fm,outline:"none"}}/><button onClick={copy} style={{background:cs[0]?P.mint:gEmber,border:"none",borderRadius:10,padding:"10px 20px",color:"#fff",fontSize:12,fontWeight:800,fontFamily:fm,cursor:"pointer"}}>{cs[0]?"Copied!":"Copy"}</button></div></div></div>);}

function genFlags(m,t,camps){
  var fl=[],id=1;
  var metaImpShare=m.impressions>0&&t.impressions>0?(m.impressions/(m.impressions+t.impressions)*100):0;
  var ttImpShare=t.impressions>0&&m.impressions>0?(t.impressions/(m.impressions+t.impressions)*100):0;
  var metaSpendShare=m.spend>0&&t.spend>0?(m.spend/(m.spend+t.spend)*100):0;
  var blendedCpc=(m.clicks+t.clicks)>0?(m.spend+t.spend)/(m.clicks+t.clicks):0;
  var cpfTT=t.follows>0?t.spend/t.follows:0;
  if(m.frequency>4.0)fl.push({id:id++,severity:"critical",platform:"Meta",metric:"Audience Saturation, Frequency",currentValue:m.frequency.toFixed(2)+"x",threshold:"4.0x",message:"Meta frequency has breached the critical 4.0x ceiling. At this level, diminishing returns accelerate sharply, each additional impression delivers progressively less incremental value whilst actively increasing the risk of negative brand sentiment and audience fatigue. Historical benchmarks show engagement rates typically decline 15-25% once frequency exceeds 4x in a single flight.",recommendation:"Immediately implement audience exclusion rules for users with 4+ impressions. Rotate in fresh creative assets to reset engagement curves. Consider splitting the budget across a broader Lookalike stack (1-3%, 3-5%, 5-10%) to access untapped reach pools whilst maintaining quality.",status:"open"});
  else if(m.frequency>3.0)fl.push({id:id++,severity:"warning",platform:"Meta",metric:"Frequency Pressure Building",currentValue:m.frequency.toFixed(2)+"x",threshold:"3.0x",message:"Meta frequency is approaching the fatigue threshold at "+m.frequency.toFixed(2)+"x. Whilst still within acceptable range for direct-response campaigns, sustained delivery at this level will erode CTR and inflate Cost Per Click within the next 3-5 days if audience pools are not refreshed.",recommendation:"Proactively expand audience size by layering in new interest-based or behavioural targeting segments. Schedule a creative rotation for the next 48 hours, even minor variations (colour shifts, headline swaps, thumbnail changes) can reset the frequency curve and extend the productive lifespan of the ad set.",status:"open"});
  if(m.ctr>0&&m.ctr<0.8)fl.push({id:id++,severity:"critical",platform:"Meta",metric:"Engagement Deficit, Click Through Rate",currentValue:pc(m.ctr),threshold:"0.80%",message:"Meta Click Through Rate at "+pc(m.ctr)+" is significantly below the 0.80% floor for paid social in the paid social market. This indicates a fundamental disconnect between the creative message and the target audience, the ads are being served but failing to generate meaningful intent signals. Low CTR also degrades Meta’s quality ranking, which compounds the problem by increasing Cost Per Thousand Ads Served.",recommendation:"Conduct an immediate creative audit: review thumb-stop rates (are users pausing?), hook completion rates (are they watching past 3 seconds?), and CTA click-through. Test UGC-style creative against polished brand assets, UGC typically outperforms by 30-50% on CTR in the the market. Verify audience-message alignment: are you showing data deals to data-hungry segments, or mismatching offers?",status:"open"});
  else if(m.ctr>0&&m.ctr<1.2)fl.push({id:id++,severity:"warning",platform:"Meta",metric:"CTR Below Benchmark",currentValue:pc(m.ctr),threshold:"1.20%",message:"Meta Click Through Rate at "+pc(m.ctr)+" is below the 1.20% benchmark for optimised paid social campaigns. Whilst not critical, this suggests room for creative or targeting refinement that could materially improve downstream conversion efficiency.",recommendation:"A/B test three creative variations: (1) different opening hooks in the first 2 seconds, (2) stronger value proposition in the primary text, (3) more urgent or specific CTA copy. Also test narrowing the audience to higher-intent segments, a smaller but more engaged audience often delivers better blended ROI than broad reach with weak engagement.",status:"open"});
  if(m.cpc>0&&m.cpc>5.0)fl.push({id:id++,severity:"critical",platform:"Meta",metric:"Cost Efficiency Alert, Cost Per Click",currentValue:fR(m.cpc),threshold:"R5.00",message:"Meta CPC at "+fR(m.cpc)+" has exceeded the R5.00 efficiency ceiling. At this rate, the cost to drive each click is eroding campaign ROI and suggests either creative fatigue, audience saturation, or competitive auction pressure in the targeted segments.",recommendation:"Shift budget allocation toward your lowest-CPC ad sets immediately. Pause any ad sets with CPC above "+fR(m.cpc*1.2)+" and reallocate to proven performers. Test Advantage+ placements to access lower-cost inventory across Reels, Stories, and the Audience Network. Consider bid cap strategies to enforce CPC discipline.",status:"open"});
  if(t.cpm>0&&m.cpm>0){var cpmRatio=m.cpm/t.cpm;if(cpmRatio>3.0)fl.push({id:id++,severity:"warning",platform:"Cross-platform",metric:"Platform Efficiency Gap, Cost Per Thousand Ads Served",currentValue:cpmRatio.toFixed(1)+"x differential",threshold:"3.0x",message:"Meta is delivering impressions at "+fR(m.cpm)+" Cost Per Thousand Ads Served versus TikTok’s "+fR(t.cpm)+" Cost Per Thousand Ads Served, a "+cpmRatio.toFixed(1)+"x cost differential. Whilst Meta’s higher CPM reflects richer targeting data and stronger attribution, a gap this wide warrants strategic budget rebalancing to optimise overall campaign efficiency.",recommendation:"Model a 10-15% budget shift from Meta awareness campaigns to TikTok, maintaining Meta’s allocation for conversion and retargeting objectives where its attribution advantage justifies the premium. Run a two-week test comparing blended CPA across both allocation models before committing to a permanent shift."});
  else if(cpmRatio>2.0)fl.push({id:id++,severity:"info",platform:"Cross-platform",metric:"CPM Variance Across Platforms",currentValue:cpmRatio.toFixed(1)+"x differential",threshold:"2.0x",message:"Meta CPM ("+fR(m.cpm)+") runs "+cpmRatio.toFixed(1)+"x higher than TikTok ("+fR(t.cpm)+"). This is within normal range for a dual-platform strategy where Meta handles precision targeting and TikTok drives scale, but worth monitoring as the gap widens.",recommendation:"Continue monitoring the CPM delta weekly. If it exceeds 3x, evaluate whether Meta’s higher-funnel campaigns (awareness, reach) could be more efficiently served on TikTok, reserving Meta budget for mid-to-lower funnel objectives where its measurement stack provides clearer ROI visibility.",status:"open"});}
  if(metaSpendShare>75&&ttImpShare>50)fl.push({id:id++,severity:"info",platform:"Cross-platform",metric:"Budget-to-Impression Imbalance",currentValue:metaSpendShare.toFixed(0)+"% spend on Meta",threshold:"75%",message:"Meta is consuming "+metaSpendShare.toFixed(0)+"% of budget but TikTok is delivering "+ttImpShare.toFixed(0)+"% of Total Ads Served. This suggests TikTok is significantly more capital-efficient for reach, and the current allocation may be over-indexing on Meta for awareness objectives.",recommendation:"Review whether Meta’s outsized budget share is justified by conversion performance. If Meta is driving the majority of measurable conversions, the allocation is correct. If both platforms serve primarily awareness objectives, rebalance toward TikTok’s superior impression economics.",status:"open"});
  if(m.cpc>0&&m.cpc<1.50)fl.push({id:id++,severity:"positive",platform:"Meta",metric:"Strong Click Efficiency",currentValue:fR(m.cpc),threshold:"R1.50",message:"Meta CPC at "+fR(m.cpc)+" is operating well below the R1.50 efficiency benchmark for paid social. This indicates excellent creative-audience fit, the algorithm has identified high-intent audience pockets and the creative is converting attention into action at an efficient rate.",recommendation:"This is a scale signal. Increase daily budgets by 15-20% on the top-performing ad sets to capitalise on the efficient delivery window before auction dynamics shift. Document the winning creative elements (hook, format, CTA) for replication across future campaigns.",status:"open"});
  else if(m.cpc>0&&m.cpc<3.0)fl.push({id:id++,severity:"positive",platform:"Meta",metric:"CPC Within Target Range",currentValue:fR(m.cpc),threshold:"R3.00",message:"Meta CPC at "+fR(m.cpc)+" is within the healthy R1.50-R3.00 range for direct-response campaigns in the the market, confirming effective creative and audience targeting.",recommendation:"Maintain current optimisation approach. Focus on incremental improvements: test new ad formats (Reels, carousel) against current winners, and expand Lookalike audiences from 1% to 2-3% to increase addressable reach without sacrificing click quality.",status:"open"});
  if(t.follows>1000){var cpf=t.spend/t.follows;fl.push({id:id++,severity:"positive",platform:"TikTok",metric:"Community Acquisition Momentum",currentValue:fmt(t.follows)+" follows at "+fR(cpf)+" Cost Per Follow",threshold:"1,000 follows",message:"TikTok has acquired "+fmt(t.follows)+" followers at "+fR(cpf)+" cost-per-follow. This community represents a compounding organic asset, each follower increases future organic reach, reduces paid media dependency, and provides a retargetable first-party audience for subsequent campaigns.",recommendation:"Accelerate community investment. The current CPF of "+fR(cpf)+" is below market rates for quality follower acquisition. Consider allocating an additional 10-15% of TikTok budget specifically to follower campaigns whilst the creative is resonating. Every follower acquired now reduces future paid reach costs.",status:"open"});}
  else if(t.follows>200)fl.push({id:id++,severity:"positive",platform:"TikTok",metric:"Community Growth Active",currentValue:fmt(t.follows)+" follows",threshold:"200",message:"TikTok follower acquisition is tracking positively with "+fmt(t.follows)+" new follows in the period. Building owned audience on TikTok reduces long-term paid media dependency.",recommendation:"Continue current follower strategy. Test creator-led content and trending audio formats to accelerate organic follow rates alongside paid acquisition.",status:"open"});
  if(t.cpm>0&&t.cpm<8)fl.push({id:id++,severity:"positive",platform:"TikTok",metric:"Exceptional Impression Value",currentValue:fR(t.cpm)+" Cost Per Thousand Ads Served",threshold:"R8.00",message:"TikTok is delivering impressions at "+fR(t.cpm)+" Cost Per Thousand Ads Served, significantly below the R8.00 benchmark for the paid social market. At this rate, every R1,000 buys approximately "+fmt(Math.round(1000/t.cpm*1000))+" impressions, making TikTok the most capital-efficient awareness channel in the campaign.",recommendation:"Maximise TikTok as the primary scale and awareness channel. This CPM level typically indicates strong content relevance scores and favourable auction positioning, the algorithm is rewarding the creative quality. Increase investment to capture this efficiency window before competitive pressure normalises rates.",status:"open"});
  else if(t.cpm>0&&t.cpm<15)fl.push({id:id++,severity:"positive",platform:"TikTok",metric:"Competitive Cost Per Thousand Ads Served",currentValue:fR(t.cpm)+" Cost Per Thousand Ads Served",threshold:"R15.00",message:"TikTok CPM at "+fR(t.cpm)+" is within the efficient range for paid social in the target market, confirming good content-audience alignment.",recommendation:"Monitor CPM trends weekly. If CPM begins rising above R15, review creative freshness and audience targeting for signs of saturation.",status:"open"});
  camps.filter(function(c){return parseFloat(c.spend)>3000;}).forEach(function(c){
    var cCtr=parseFloat(c.ctr||0);var cCpc=parseFloat(c.cpc||0);var cSpend=parseFloat(c.spend);var cImps=parseFloat(c.impressions||0);
    if(cCtr<0.6&&cImps>10000)fl.push({id:id++,severity:"critical",platform:c.platform||"Meta",metric:"Underperforming Campaign",currentValue:pc(cCtr)+" Click Through Rate on "+fR(cSpend),threshold:"0.60% Click Through Rate",message:"Campaign ‘"+c.campaignName+"’ is delivering "+pc(cCtr)+" Click Through Rate with "+fR(cSpend)+" invested against "+fmt(cImps)+" impressions. This level of engagement failure with meaningful spend indicates a structural issue with either creative relevance, audience targeting, or landing page experience.",recommendation:"Conduct a three-part diagnostic: (1) Creative, are the first 3 seconds compelling enough to stop the scroll? (2) Audience, is the targeting aligned with the offer? (3) Landing page, does the destination match the ad promise? Pause the lowest-performing ad sets and reallocate budget to campaigns delivering above "+pc(1.0)+" Click Through Rate.",status:"open"});
    else if(cCtr<1.0&&cImps>5000)fl.push({id:id++,severity:"warning",platform:c.platform||"Meta",metric:"Below-Benchmark Campaign",currentValue:pc(cCtr)+" Click Through Rate",threshold:"1.00%",message:"Campaign ‘"+c.campaignName+"’ at "+pc(cCtr)+" Click Through Rate is underperforming against the 1.0% benchmark with "+fR(cSpend)+" spend.",recommendation:"Review the top 3 ad creatives within this campaign. Replace the lowest performer with a new variant testing a different hook, format, or value proposition.",status:"open"});
    if(cCpc>8&&c.platform==="Meta")fl.push({id:id++,severity:"warning",platform:"Meta",metric:"High CPC Campaign",currentValue:fR(cCpc)+" Cost Per Click",threshold:"R8.00",message:"Campaign ‘"+c.campaignName+"’ is running at "+fR(cCpc)+" Cost Per Click, well above the efficient range. This inflated cost-per-click is dragging down the blended account Cost Per Click.",recommendation:"Review the bid strategy on this campaign. Switch from lowest-cost to cost-cap bidding with a target CPC of "+fR(cCpc*0.6)+". If performance doesn’t improve within 48 hours, consolidate this campaign’s budget into higher-performing campaigns.",status:"open"});
  });
  if(blendedCpc>0&&blendedCpc<2.0)fl.push({id:id++,severity:"positive",platform:"Cross-platform",metric:"Blended Cost Efficiency",currentValue:fR(blendedCpc)+" blended Cost Per Click",threshold:"R2.00",message:"The cross-platform blended Cost Per Click of "+fR(blendedCpc)+" confirms the multi-channel strategy is delivering cost-efficient engagement. The combination of Meta’s targeted clicks and TikTok’s volume-driven engagement is optimising the overall cost base.",recommendation:"This efficiency level supports budget scaling. Model a 15-20% budget increase across both platforms and monitor whether the blended Cost Per Click holds below R2.00, if it does, the campaign has room to grow without sacrificing efficiency.",status:"open"});
  fl.sort(function(a,b){var o={critical:0,warning:1,info:2,positive:3};return(o[a.severity]||9)-(o[b.severity]||9);});
  return fl;
}

export default function MediaOnGas(){
  var au=useState(null),session=au[0],setSession=au[1];
  var ac=useState(true),authChecking=ac[0],setAuthChecking=ac[1];
  var ar=useState(null),authRole=ar[0],setAuthRole=ar[1];
  var ts=useState("summary"),tab=ts[0],setTab=ts[1];
  var nowD=new Date();var monthStart=nowD.getFullYear()+"-"+String(nowD.getMonth()+1).padStart(2,"0")+"-01";var ds=useState(monthStart),df=ds[0],setDf=ds[1];
  var lastDay=new Date(nowD.getFullYear(),nowD.getMonth()+1,0).getDate();var monthEnd=nowD.getFullYear()+"-"+String(nowD.getMonth()+1).padStart(2,"0")+"-"+String(lastDay).padStart(2,"0");var de=useState(monthEnd),dt=de[0],setDt=de[1];
  var cs=useState([]),campaigns=cs[0],setCampaigns=cs[1];
  var ss=useState([]),selected=ss[0],setSelected=ss[1];
  var us=useState(null),urlSelected=us[0],setUrlSelected=us[1];
  var rs=useState(""),search=rs[0],setSearch=rs[1];
  var ls=useState(true),loading=ls[0],setLoading=ls[1];
  var sc=useState(true),showCampaigns=sc[0],setShowCampaigns=sc[1];
  var sm=useState(false),showShare=sm[0],setShowShare=sm[1];
  var fs=useState([]),flags=fs[0],setFlags=fs[1];
  var ps=useState([]),pages=ps[0],setPages=ps[1];
  var as2=useState([]),adsets=as2[0],setAdsets=as2[1];
  var ad3=useState([]),adsList=ad3[0],setAdsList=ad3[1];
  var tfs=useState(0),ttCumFollows=tfs[0],setTtCumFollows=tfs[1];

  useEffect(function(){
    var saved=sessionStorage.getItem("gas_session");
    if(!saved){setAuthChecking(false);return;}
    fetch(API+"/api/auth",{headers:{"x-session-token":saved}})
    .then(function(r){return r.json();})
    .then(function(d){if(d.valid){setSession(saved);setAuthRole(d.role||sessionStorage.getItem("gas_role")||"admin");}else{sessionStorage.removeItem("gas_session");sessionStorage.removeItem("gas_role");}setAuthChecking(false);})
    .catch(function(){sessionStorage.removeItem("gas_session");sessionStorage.removeItem("gas_role");setAuthChecking(false);});
  },[]);

  useEffect(function(){
    var params=new URLSearchParams(window.location.search);
    var camps=params.get('campaigns');
    if(camps){
      var ids=camps.split(',').map(function(id){return id.trim();}).filter(function(id){return id;});
      setUrlSelected(ids);
    }
    var from=params.get('from');
    if(from)setDf(from);
    var to=params.get('to');
    if(to)setDt(to);
  },[]);

  var handleLogin=function(token,role){setSession(token);setAuthRole(role||"admin");};
  var handleLogout=function(){sessionStorage.removeItem("gas_session");sessionStorage.removeItem("gas_role");setSession(null);setAuthRole(null);};

  var isClient=window.location.pathname.indexOf("/view/")===0||authRole==="client";

  var pageOverrides=[
    {campaign:"willowbrook",page:"flower foundation"},
    {campaign:"flower",page:"flower foundation"}
  ];
  var autoMatchPage=function(campaignName,pageName){
    var cn=(campaignName||"").toLowerCase();
    var pn=(pageName||"").toLowerCase();
    for(var oi=0;oi<pageOverrides.length;oi++){if(cn.indexOf(pageOverrides[oi].campaign)>=0&&pn.indexOf(pageOverrides[oi].page)>=0)return 10;}
    var cn=(campaignName||"").toLowerCase().replace(/[|_\-]/g," ");
    var pn=(pageName||"").toLowerCase().replace(/[|_\-]/g," ");
    var cWords=cn.split(/\s+/).filter(function(w){return w.length>2&&["gas","the","and","for","from","apr","mar","may","jun","jul","aug","sep","oct","nov","dec","jan","feb","2026","2025","paid","social","facebook","instagram","tiktok","campaign","funnel","cycle","leads","lead","follower","like","appinstall","traffic","cold","warm","display","search"].indexOf(w)<0;});
    var score=0;
    for(var wi=0;wi<cWords.length;wi++){
      if(pn.indexOf(cWords[wi])>=0)score++;
    }
    return score;
  };
  var matchPage=function(campaignName,pageName){
    return autoMatchPage(campaignName,pageName)>0;
  };
  var ttBaselines={"momo":{followers:123995,asOf:"2026-03-31"}};
  var getTtTotal=function(campaignName,earnedFollows){
    var cn=(campaignName||"").toLowerCase();
    var cumFollows=ttCumFollows||0;
    var keys=Object.keys(ttBaselines);
    for(var ki=0;ki<keys.length;ki++){if(cn.indexOf(keys[ki])>=0)return ttBaselines[keys[ki]].followers+(cumFollows>0?cumFollows:earnedFollows);}
    return earnedFollows;
  };
    var findBestPage=function(campaignName,pagesArr){
    var bestPage=null;var bestScore=0;
    for(var pi=0;pi<pagesArr.length;pi++){
      var matchSc=autoMatchPage(campaignName,pagesArr[pi].name);
      if(matchSc>bestScore){bestScore=matchSc;bestPage=pagesArr[pi];}
    }
    return bestPage;
  };
  var findIgGrowth=function(campaignName,pagesArr){
    var pg=findBestPage(campaignName,pagesArr);
    if(pg&&pg.instagram_business_account){return pg.instagram_business_account.follower_growth||0;}
    return 0;
  };


  var fetchData=function(){setLoading(true);fetch(API+"/api/campaigns?from="+df+"&to="+dt,{headers:{"x-api-key":API_KEY,"x-session-token":session||""}}).then(function(r){return r.json();}).then(function(d){if(d.campaigns){var prev=selected;setCampaigns(d.campaigns);if(prev.length>0){var validIds=d.campaigns.map(function(x){return x.campaignId;});var kept=prev.filter(function(id){return validIds.indexOf(id)>=0;});setSelected(kept.length>0?kept:d.campaigns.filter(function(x){return parseFloat(x.impressions||0)>0||parseFloat(x.spend||0)>0;}).map(function(x){return x.campaignId;}));}else{if(urlSelected){var valid=urlSelected.filter(function(id){return d.campaigns.some(function(c){return c.campaignId===id;});});setSelected(valid.length>0?valid:d.campaigns.filter(function(x){return parseFloat(x.impressions||0)>0||parseFloat(x.spend||0)>0;}).map(function(x){return x.campaignId;}));}else{setSelected(d.campaigns.filter(function(x){return parseFloat(x.impressions||0)>0||parseFloat(x.spend||0)>0;}).map(function(x){return x.campaignId;}));}}}if(d.pages){setPages(d.pages);}if(d.ttCumulativeFollows!==undefined){setTtCumFollows(d.ttCumulativeFollows);}setLoading(false);}).catch(function(err){console.error("API Error:",err);setLoading(false);});fetch(API+"/api/adsets?from="+df+"&to="+dt,{headers:{"x-api-key":API_KEY,"x-session-token":session||""}}).then(function(r){return r.json();}).then(function(d2){if(d2.adsets){setAdsets(d2.adsets);}}).catch(function(){});fetch(API+"/api/ads?from="+df+"&to="+dt,{headers:{"x-api-key":API_KEY,"x-session-token":session||""}}).then(function(r){return r.json();}).then(function(d3){if(d3.ads){setAdsList(d3.ads);}}).catch(function(err){console.error("Ads API error:",err);});};
  useEffect(function(){if(session){fetchData();}},[df,dt,session]);
  var refreshData=function(){fetchData();};
  var toggle=function(id){setSelected(function(p){return p.indexOf(id)>=0?p.filter(function(x){return x!==id;}):p.concat([id]);});};
  var selectAll=function(){var f=campaigns.filter(function(c){return (parseFloat(c.impressions||0)>0||parseFloat(c.spend||0)>0)&&(c.campaignName.toLowerCase().indexOf(search.toLowerCase())>=0||c.accountName.toLowerCase().indexOf(search.toLowerCase())>=0);});setSelected(f.map(function(c){return c.campaignId;}));};
  var clearAll=function(){setSelected([]);};

  var computed=useMemo(function(){
    if(selected.length===0){var z={impressions:0,reach:0,spend:0,clicks:0,cpm:0,cpc:0,ctr:0,frequency:0,leads:0,appInstalls:0,landingPageViews:0,pageLikes:0,follows:0,likes:0,costPerLead:0,costPerInstall:0};return{fbCamps:[],igCamps:[],metaCamps:[],ttCamps:[],fb:Object.assign({},z),ig:Object.assign({},z),meta:Object.assign({},z),tt:Object.assign({},z),gdCamps:[],gd:Object.assign({},z),grand:Object.assign({},z),totalImps:0,totalSpend:0,totalClicks:0,blendedCpm:0,allSelected:[]};}
    var sel=campaigns.filter(function(c){return selected.indexOf(c.campaignId)>=0;});
    var fbC=sel.filter(function(c){return c.platform==="Facebook";});
    var igC=sel.filter(function(c){return c.platform==="Instagram";});
    var mc=sel.filter(function(c){return c.platform==="Facebook"||c.platform==="Instagram"||c.platform==="Meta";});
    var tc=sel.filter(function(c){return c.platform==="TikTok";});
    var gdC=sel.filter(function(c){return c.platform==="Google Display"||c.platform==="YouTube"||c.platform==="Google Search";});
    var sumP=function(arr){return arr.reduce(function(a,c){return{impressions:a.impressions+parseFloat(c.impressions||0),reach:a.reach+parseFloat(c.reach||0),spend:a.spend+parseFloat(c.spend||0),clicks:a.clicks+parseFloat(c.clicks||0),leads:a.leads+parseFloat(c.leads||0),appInstalls:a.appInstalls+parseFloat(c.appInstalls||0),landingPageViews:a.landingPageViews+parseFloat(c.landingPageViews||0),pageLikes:a.pageLikes+parseFloat(c.pageLikes||0),follows:a.follows+parseFloat(c.follows||0),likes:a.likes+parseFloat(c.likes||0)};},{impressions:0,reach:0,spend:0,clicks:0,leads:0,appInstalls:0,landingPageViews:0,pageLikes:0,follows:0,likes:0});};
    var calcD=function(d){d.cpm=d.impressions>0?(d.spend/d.impressions)*1000:0;d.cpc=d.clicks>0?d.spend/d.clicks:0;d.ctr=d.impressions>0?(d.clicks/d.impressions)*100:0;d.frequency=d.reach>0?d.impressions/d.reach:0;d.costPerLead=d.leads>0?d.spend/d.leads:0;d.costPerInstall=d.appInstalls>0?d.spend/d.appInstalls:0;return d;};
    var fb=calcD(sumP(fbC));var ig=calcD(sumP(igC));var mt=calcD(sumP(mc));var tt=calcD(sumP(tc));var gd=calcD(sumP(gdC));
    var ti=mt.impressions+tt.impressions+gd.impressions,ts2=mt.spend+tt.spend+gd.spend,tc2=mt.clicks+tt.clicks+gd.clicks;
    var grand={impressions:ti,spend:ts2,clicks:tc2,reach:mt.reach+tt.reach+gd.reach,leads:mt.leads+tt.leads+gd.leads,appInstalls:mt.appInstalls+tt.appInstalls+gd.appInstalls,follows:mt.follows+tt.follows+gd.follows,pageLikes:mt.pageLikes+tt.pageLikes+gd.pageLikes,likes:mt.likes+tt.likes+gd.likes,landingPageViews:mt.landingPageViews+tt.landingPageViews+gd.landingPageViews};
    grand.cpm=grand.impressions>0?(grand.spend/grand.impressions)*1000:0;grand.cpc=grand.clicks>0?grand.spend/grand.clicks:0;grand.ctr=grand.impressions>0?(grand.clicks/grand.impressions)*100:0;grand.frequency=grand.reach>0?grand.impressions/grand.reach:0;grand.costPerLead=grand.leads>0?grand.spend/grand.leads:0;
    return{fbCamps:fbC,igCamps:igC,metaCamps:mc,ttCamps:tc,gdCamps:gdC,gd:gd,fb:fb,ig:ig,meta:mt,tt:tt,grand:grand,totalImps:ti,totalSpend:ts2,totalClicks:tc2,blendedCpm:ti>0?(ts2/ti)*1000:0,allSelected:sel};
  },[campaigns,selected]);

  useEffect(function(){if(computed.meta)setFlags(genFlags(computed.meta,computed.tt,computed.allSelected||[]));},[computed]);

  var m=computed.meta,t=computed.tt;
  var benchmarks={
    meta:{cpm:{low:12,mid:18,high:25,label:"R12-R25"},cpc:{low:0.80,mid:1.50,high:3.00,label:"R0.80-R3.00"},ctr:{low:0.8,mid:1.2,high:2.0,label:"0.8%-2.0%"},cpf:{low:2.0,mid:4.0,high:8.0,label:"R2-R8"},cpl:{low:15,mid:35,high:60,label:"R15-R60"}},
    tiktok:{cpm:{low:4,mid:8,high:15,label:"R4-R15"},cpc:{low:0.01,mid:0.05,high:0.20,label:"R0.01-R0.20"},cpf:{low:1.0,mid:2.5,high:5.0,label:"R1-R5"}},
    google:{cpm:{low:8,mid:15,high:30,label:"R8-R30"},cpc:{low:1.0,mid:3.0,high:6.0,label:"R1-R6"}}
  };
  var benchLabel=function(val,bm){if(!bm)return"";if(val<=bm.low)return"well below the SA benchmark ("+bm.label+")";if(val<=bm.mid)return"within the efficient range of the SA benchmark ("+bm.label+")";if(val<=bm.high)return"at the upper end of the SA benchmark ("+bm.label+")";return"above the SA benchmark range ("+bm.label+")";};
  var daysBetween=function(a,b){return Math.max(1,Math.round((new Date(b)-new Date(a))/86400000)+1);};
  var totalDays=daysBetween(df,dt);
  var elapsed=daysBetween(df,new Date().toISOString().split("T")[0]);
  var pctElapsed=Math.min(100,(elapsed/totalDays*100));
  var pctSpent=computed.totalSpend>0&&computed.grand&&computed.grand.spend>0?100:0;
  var dailySpendRate=elapsed>0?computed.totalSpend/elapsed:0;
  var projectedSpend=dailySpendRate*totalDays;
  var freqStatus=m.frequency>4?"critical":m.frequency>3?"warning":m.frequency>2?"healthy":"early";
  var ack=function(id){setFlags(function(p){return p.map(function(f){return f.id===id?Object.assign({},f,{status:"acknowledged"}):f;});});};
  var resolve=function(id){setFlags(function(p){return p.map(function(f){return f.id===id?Object.assign({},f,{status:"resolved"}):f;});});};
  var openFlags=flags.filter(function(f){return f.status==="open";}).length;

  var tabs=[{id:"summary",label:"Summary",icon:Ic.crown(P.ember,16)},{id:"overview",label:"Reporting",icon:Ic.chart(P.orchid,16)},{id:"creative",label:"Creative",icon:Ic.fire(P.blaze,16)},{id:"community",label:"Community",icon:Ic.users(P.mint,16)},{id:"targeting",label:"Targeting",icon:Ic.radar(P.solar,16)}];if(!isClient)tabs.push({id:"optimise",label:"Optimisation"+(openFlags>0?" ("+openFlags+")":""),icon:Ic.flag(P.warning,16)});

  if(authChecking)return(<div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"linear-gradient(170deg,#06020e,#0d0618 30%,#150b24 60%,#0d0618)"}}><div style={{color:P.sub,fontFamily:fm,fontSize:12,letterSpacing:3}}>LOADING...</div></div>);
  if(!session)return(<LoginScreen onLogin={handleLogin}/>);

  return(<div style={{minHeight:"100vh",background:"linear-gradient(170deg,"+P.void+","+P.cosmos+" 30%,"+P.nebula+" 60%,"+P.cosmos+")",color:P.txt,fontFamily:ff,WebkitFontSmoothing:"antialiased"}}>
    <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0}}><div style={{position:"absolute",inset:0,opacity:0.018,backgroundImage:"radial-gradient("+P.ember+" 0.5px,transparent 0.5px),radial-gradient("+P.orchid+" 0.5px,transparent 0.5px)",backgroundSize:"40px 40px",backgroundPosition:"0 0,20px 20px"}}/></div>

    <header style={{position:"sticky",top:0,zIndex:100,background:"rgba(6,2,14,0.92)",backdropFilter:"blur(24px)",borderBottom:"1px solid "+P.rule}}>
      <div style={{maxWidth:1400,margin:"0 auto",padding:"10px 28px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
          <div style={{display:"flex",alignItems:"center",gap:14}}>
            <div style={{width:42,height:42,borderRadius:"50%",overflow:"hidden",animation:"pulse-glow 3s ease-in-out infinite"}}><img src="/GAS_LOGO_EMBLEM_GAS_Primary_Gradient.png" alt="GAS" style={{width:"100%",height:"100%",objectFit:"cover"}}/></div>
            <div><div style={{fontSize:16,fontWeight:900,letterSpacing:4,fontFamily:fm,lineHeight:1}}><span style={{color:P.txt}}>MEDIA </span><span style={{color:P.ember}}>ON </span><span style={{background:gFire,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>GAS</span></div><div style={{fontSize:9,color:P.sub,letterSpacing:4,textTransform:"uppercase",fontFamily:fm,marginTop:3,fontWeight:600}}>{isClient?"Client Dashboard":"Digital Performance Intelligence"}</div></div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
            {!isClient&&<button onClick={function(){setShowCampaigns(function(prev){return !prev;});}} style={{background:showCampaigns?P.ember+"15":P.glass,border:"1px solid "+(showCampaigns?P.ember+"50":P.rule),borderRadius:10,padding:"8px 16px",color:showCampaigns?P.ember:P.sub,fontSize:11,fontWeight:700,fontFamily:fm,cursor:"pointer",display:"flex",alignItems:"center",gap:5}}>{Ic.chart(showCampaigns?P.ember:P.sub,14)} {selected.length} Campaigns</button>}
            <div style={{display:"flex",alignItems:"center",gap:5,background:P.glass,border:"1px solid "+P.rule,borderRadius:10,padding:"6px 12px"}}><span style={{fontSize:8,color:P.sub,fontFamily:fm,letterSpacing:2,fontWeight:700}}>FROM</span><input type="date" value={df} onChange={function(e){setDf(e.target.value);}} style={{background:"transparent",border:"none",color:"#fff",fontSize:12,fontFamily:fm,outline:"none",width:105,fontWeight:500}}/><div style={{width:12,height:1,background:"linear-gradient(90deg,"+P.ember+","+P.solar+")"}}/><span style={{fontSize:8,color:P.sub,fontFamily:fm,letterSpacing:2,fontWeight:700}}>TO</span><input type="date" value={dt} onChange={function(e){setDt(e.target.value);}} style={{background:"transparent",border:"none",color:"#fff",fontSize:12,fontFamily:fm,outline:"none",width:105,fontWeight:500}}/></div>
            <button onClick={refreshData} style={{background:gEmber,border:"none",borderRadius:10,padding:"8px 18px",color:"#fff",fontSize:11,fontWeight:800,fontFamily:fm,cursor:"pointer",letterSpacing:1.5}}>REFRESH</button>
            {!isClient&&<button onClick={function(){setShowShare(true);}} style={{background:P.glass,border:"1px solid "+P.rule,borderRadius:10,padding:"8px 12px",color:P.ember,fontSize:11,fontWeight:700,fontFamily:fm,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>{Ic.share(P.ember,14)} Share</button>}
            <button onClick={handleLogout} style={{background:"transparent",border:"1px solid "+P.rule,borderRadius:10,padding:"8px 12px",color:P.dim,fontSize:10,fontWeight:600,fontFamily:fm,cursor:"pointer",letterSpacing:1}}>LOGOUT</button>
          </div>
        </div>
      </div>
      <div style={{maxWidth:1400,margin:"0 auto",padding:"0 28px"}}><div style={{display:"flex",gap:1}}>{tabs.map(function(tb){return<button key={tb.id} onClick={function(){setTab(tb.id);}} style={{display:"flex",alignItems:"center",gap:5,background:tab===tb.id?P.ember+"10":"transparent",border:"none",borderBottom:tab===tb.id?"2px solid "+P.ember:"2px solid transparent",padding:"10px 18px",cursor:"pointer",color:tab===tb.id?P.ember:P.sub,fontSize:13,fontWeight:tab===tb.id?800:500,fontFamily:ff,letterSpacing:0.3}}>{tb.icon}<span>{tb.label}</span></button>;})}</div></div>
    </header>

    {showShare&&<ShareModal onClose={function(){setShowShare(false);}} selected={selected} dateFrom={df} dateTo={dt}/>}

    <div style={{maxWidth:1400,margin:"0 auto",padding:"20px 28px 80px",display:"flex",gap:20,position:"relative",zIndex:1}}>
      {showCampaigns&&<><div onClick={function(){setShowCampaigns(false);}} style={{position:"fixed",inset:0,zIndex:9,background:"transparent",cursor:"default"}}/><div style={{width:340,flexShrink:0,position:"sticky",top:120,maxHeight:"calc(100vh - 140px)",overflowY:"auto",alignSelf:"flex-start",zIndex:10}}><CampaignSelector campaigns={campaigns} selected={selected} onToggle={toggle} onSelectAll={selectAll} onClearAll={clearAll} search={search} onSearch={setSearch}/></div></>}

      <div style={{flex:1,minWidth:0}}>
        {loading?(<div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"80px 40px",gap:20}}><div style={{width:48,height:48,border:"3px solid "+P.rule,borderTop:"3px solid "+P.ember,borderRadius:"50%",animation:"spin 1s linear infinite"}}/><style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style><div style={{fontSize:14,color:P.sub,fontFamily:fm}}>Pulling live data from Meta and TikTok…</div></div>):(<>

        {/* OVERVIEW */}
        {tab==="summary"&&(<div>
          <SH icon={Ic.crown(P.ember,20)} title="Media Insights" sub={df+" to "+dt+" \u00b7 Performance Intelligence Brief"} accent={P.ember}/>
          {(function(){
            var sel=campaigns.filter(function(x){return selected.indexOf(x.campaignId)>=0;});
            if(sel.length===0)return <div style={{padding:30,textAlign:"center",color:P.dim,fontFamily:fm}}>Select campaigns to view summary.</div>;
            var totalDays2=Math.max(1,Math.round((new Date(dt)-new Date(df))/86400000)+1);
            var todayStr=new Date().toISOString().split("T")[0];
            var elapsedDays=Math.max(1,Math.round((new Date(todayStr>dt?dt:todayStr)-new Date(df))/86400000)+1);
            var dailySpend=computed.totalSpend>0?computed.totalSpend/elapsedDays:0;
            var projSpend=dailySpend*totalDays2;
            var paceRatio=totalDays2>0?elapsedDays/totalDays2:1;
            var pacePct=Math.min(100,Math.round(paceRatio*100));
            var blCpc=computed.totalClicks>0?computed.totalSpend/computed.totalClicks:0;
            var blCtr=computed.totalImps>0?(computed.totalClicks/computed.totalImps*100):0;
            var blFreq=(m.reach+t.reach)>0?(m.impressions+t.impressions)/(m.reach+t.reach):0;

            var objectives4={};sel.forEach(function(camp){
              var n=(camp.campaignName||"").toLowerCase();var obj="Traffic";
              if(n.indexOf("appinstal")>=0||n.indexOf("app install")>=0)obj="App Store Clicks";
              else if(n.indexOf("follower")>=0||n.indexOf("_like_")>=0||n.indexOf("_like ")>=0||n.indexOf("paidsocial_like")>=0||n.indexOf("like_facebook")>=0||n.indexOf("like_instagram")>=0)obj="Followers & Likes";
              else if(n.indexOf("lead")>=0||n.indexOf("pos")>=0)obj="Leads";
              else if(n.indexOf("homeloan")>=0||n.indexOf("traffic")>=0||n.indexOf("paidsearch")>=0)obj="Landing Page Clicks";
              if(!objectives4[obj])objectives4[obj]={spend:0,clicks:0,imps:0,results:0};
              objectives4[obj].spend+=parseFloat(camp.spend||0);objectives4[obj].clicks+=parseFloat(camp.clicks||0);objectives4[obj].imps+=parseFloat(camp.impressions||0);
              var result=obj==="Leads"?parseFloat(camp.leads||0):obj==="Followers & Likes"?parseFloat(camp.pageLikes||0)+parseFloat(camp.follows||0):parseFloat(camp.clicks||0);
              objectives4[obj].results+=result;
            });

            var platBreak={};sel.forEach(function(camp){
              var pl=camp.platform;if(!platBreak[pl])platBreak[pl]={spend:0,clicks:0,imps:0,reach:0};
              platBreak[pl].spend+=parseFloat(camp.spend||0);platBreak[pl].clicks+=parseFloat(camp.clicks||0);platBreak[pl].imps+=parseFloat(camp.impressions||0);platBreak[pl].reach+=parseFloat(camp.reach||0);
            });

            var platOrd4={"Facebook":0,"Instagram":1,"TikTok":2,"Google Display":3,"YouTube":4};
            var platCol4={"Facebook":P.fb,"Instagram":P.ig,"TikTok":P.tt,"Google Display":P.gd,"YouTube":P.lava};
            var platShort={"Facebook":"FB","Instagram":"IG","TikTok":"TT","Google Display":"GD","YouTube":"YT"};
            var objKeys=["App Store Clicks","Landing Page Clicks","Leads","Followers & Likes"];
            var objCol4={"App Store Clicks":P.fb,"Landing Page Clicks":P.cyan,"Leads":P.rose,"Followers & Likes":P.tt};
            var objCL4={"App Store Clicks":"CPC","Landing Page Clicks":"CPC","Leads":"CPL","Followers & Likes":"CPF"};

            var sortedPlats=Object.keys(platBreak).sort(function(a,b){return (platOrd4[a]||9)-(platOrd4[b]||9);});
            var spendData=sortedPlats.map(function(pl){return{name:platShort[pl]||pl,value:platBreak[pl].spend,color:platCol4[pl]||P.ember};});
            var impData=sortedPlats.map(function(pl){return{name:platShort[pl]||pl,value:platBreak[pl].imps,color:platCol4[pl]||P.ember};});
            var cpcData=sortedPlats.filter(function(pl){return platBreak[pl].clicks>0;}).map(function(pl){var pb=platBreak[pl];return{name:platShort[pl]||pl,cpc:pb.clicks>0?parseFloat((pb.spend/pb.clicks).toFixed(2)):0,color:platCol4[pl]||P.ember};});
            var cpmData=sortedPlats.filter(function(pl){return platBreak[pl].imps>0;}).map(function(pl){var pb=platBreak[pl];return{name:platShort[pl]||pl,cpm:pb.imps>0?parseFloat((pb.spend/pb.imps*1000).toFixed(2)):0,color:platCol4[pl]||P.ember};});

            /* --- Executive Narrative --- */
            var execLines=[];
            var bestCpmPlat="";var bestCpmVal=Infinity;var worstCpmPlat="";var worstCpmVal=0;
            var bestCpcPlat="";var bestCpcVal=Infinity;
            sortedPlats.forEach(function(pl){var pb=platBreak[pl];var cpm=pb.imps>0?pb.spend/pb.imps*1000:0;var cpc=pb.clicks>0?pb.spend/pb.clicks:0;if(cpm>0&&cpm<bestCpmVal){bestCpmVal=cpm;bestCpmPlat=pl;}if(cpm>worstCpmVal){worstCpmVal=cpm;worstCpmPlat=pl;}if(cpc>0&&cpc<bestCpcVal){bestCpcVal=cpc;bestCpcPlat=pl;}});

            execLines.push(fR(computed.totalSpend)+" deployed across "+sortedPlats.length+" platforms ("+sortedPlats.join(", ")+") over "+elapsedDays+" of "+totalDays2+" days, delivering "+fmt(computed.totalImps)+" impressions and "+fmt(computed.totalClicks)+" clicks at "+fR(blCpc)+" blended CPC ("+benchLabel(blCpc,benchmarks.meta.cpc)+") and "+fR(computed.blendedCpm)+" CPM.");
            execLines.push("Run rate: "+fR(dailySpend)+"/day, projecting "+fR(projSpend)+" by period end."+(pacePct>=90?" Flight nearing completion,consolidate learnings.":pacePct>=50?" Pacing on track,mid-flight optimisation window.":"  Early delivery,algorithms in learning phase."));
            var activeObj=objKeys.filter(function(k){return objectives4[k]&&objectives4[k].results>0;});
            activeObj.forEach(function(objName){var od=objectives4[objName];var cp=od.results>0?od.spend/od.results:0;var bm=objName==="Leads"?benchmarks.meta.cpl:objName==="Followers & Likes"?benchmarks.meta.cpf:benchmarks.meta.cpc;if(od.results>=10)execLines.push(objName+": "+fmt(od.results)+" results at "+fR(cp)+"/result, "+benchLabel(cp,bm)+". Confirmed at scale.");else if(od.results>0)execLines.push(objName+": "+fmt(od.results)+" early results at "+fR(cp)+". Below 10-result threshold for confirmed read.");});
            var noResultObj=objKeys.filter(function(k){return objectives4[k]&&objectives4[k].results===0&&objectives4[k].spend>500;});
            noResultObj.forEach(function(objName){execLines.push(objName+": "+fR(objectives4[objName].spend)+" invested, no results yet,verify pixel and landing page.");});
            if(bestCpmPlat&&sortedPlats.length>1&&worstCpmPlat!==bestCpmPlat){var cpmDiff=Math.round(worstCpmVal/bestCpmVal);execLines.push(bestCpmPlat+" leads on reach efficiency at "+fR(bestCpmVal)+" CPM vs "+worstCpmPlat+" at "+fR(worstCpmVal)+" ("+cpmDiff+"x gap)"+(cpmDiff>=3?". Rebalance awareness spend towards "+bestCpmPlat+".":"."));}
            if(m.frequency>0)execLines.push("Meta frequency: "+m.frequency.toFixed(2)+"x,"+(freqStatus==="critical"?"above 4x fatigue ceiling, creative rotation overdue.":freqStatus==="warning"?"approaching 3x, refresh creative within 48h.":freqStatus==="healthy"?"in the 2\u20133x recall sweet spot.":"early build phase, full headroom."));

            /* --- Adset performance data --- */
            var selAdsets2=adsets.filter(function(a){
              for(var si3=0;si3<sel.length;si3++){if(a.campaignName===sel[si3].campaignName||a.campaignId===(sel[si3].rawCampaignId||sel[si3].campaignId.replace(/_facebook$/,"").replace(/_instagram$/,"")))return true;}
              return false;
            }).filter(function(a){return parseFloat(a.impressions||0)>0||parseFloat(a.spend||0)>0;});

            /* --- Community --- */
            var matchedPages3=[];var matchedIds3={};
            for(var s3=0;s3<sel.length;s3++){var bestPg3=null;var bestSc3=0;for(var p3=0;p3<pages.length;p3++){var sc4=autoMatchPage(sel[s3].campaignName,pages[p3].name);if(sc4>bestSc3){bestSc3=sc4;bestPg3=pages[p3];}}if(bestPg3&&bestSc3>=2&&matchedIds3[bestPg3.id]!==true){matchedPages3.push(bestPg3);matchedIds3[bestPg3.id]=true;}}
            var fbT2=0;var igT2=0;var igGrowth=0;matchedPages3.forEach(function(mp){fbT2+=mp.followers_count||mp.fan_count||0;if(mp.instagram_business_account){igT2+=mp.instagram_business_account.followers_count||0;igGrowth+=mp.instagram_business_account.follower_growth||0;}});
            var ttE2=0;sel.forEach(function(camp){if(camp.platform==="TikTok"){ttE2+=parseFloat(camp.follows||0);}});
            var ttT2=getTtTotal(sel.map(function(x){return x.campaignName;}).join(" "),ttE2);
            var grandT2=fbT2+igT2+ttT2;
            var earnedTotal=parseFloat(m.pageLikes||0)+igGrowth+ttE2;
            var communityData=[];
            if(fbT2>0)communityData.push({name:"FB",total:fbT2,earned:parseFloat(m.pageLikes||0),color:P.fb});
            if(igT2>0)communityData.push({name:"IG",total:igT2,earned:igGrowth,color:P.ig});
            if(ttT2>0)communityData.push({name:"TT",total:ttT2,earned:ttE2,color:P.tt});

            var tHead={padding:"9px 10px",fontSize:9,fontWeight:800,textTransform:"uppercase",color:P.ember,letterSpacing:1,background:"rgba(249,98,3,0.12)",border:"1px solid rgba(249,98,3,0.25)",fontFamily:fm};
            var tCell=function(extra){return Object.assign({padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12},extra||{});};
            var secHead=function(color,title,icon){return <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"18px 0 14px"}}><div style={{display:"flex",alignItems:"center",gap:10}}>{icon||<span style={{width:14,height:14,borderRadius:"50%",background:color}}></span>}<span style={{fontSize:16,fontWeight:900,color:color,fontFamily:ff,letterSpacing:1}}>{title}</span></div></div>;};
            var lblStyle={fontSize:10,fill:P.txt,fontFamily:"JetBrains Mono,Consolas,monospace",fontWeight:700};
            var lblStyleSm={fontSize:9,fill:P.sub,fontFamily:"JetBrains Mono,Consolas,monospace",fontWeight:600};
            var legStyle={fontSize:10,fontFamily:"JetBrains Mono,Consolas,monospace",paddingTop:6};
            var stand=function(label,value,color){return<div style={{flex:1,minWidth:160,background:"rgba(0,0,0,0.25)",border:"1px solid "+color+"30",borderLeft:"3px solid "+color,borderRadius:"0 10px 10px 0",padding:"12px 14px"}}><div style={{fontSize:9,fontWeight:800,color:color,fontFamily:fm,letterSpacing:2,textTransform:"uppercase",marginBottom:4}}>{label}</div><div style={{fontSize:13,fontWeight:700,color:P.txt,fontFamily:fm}}>{value}</div></div>;};
            var standRow=function(items){return<div style={{display:"flex",flexWrap:"wrap",gap:10,marginTop:16}}>{items.filter(function(x){return x;})}</div>;};

            return <div>

              {/* ═══ 1. BUDGET PACING ═══ */}
              <div style={{marginBottom:28}}>
                <div style={{background:P.glass,borderRadius:18,padding:"24px 28px",border:"1px solid "+P.rule}}>
                  {secHead(P.ember,"BUDGET PACING",Ic.chart(P.ember,18))}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:14,marginBottom:20}}>
                    <Glass accent={P.ember} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>TOTAL SPEND</div><div style={{fontSize:22,fontWeight:900,color:P.ember,fontFamily:fm}}>{fR(computed.totalSpend)}</div></Glass>
                    <Glass accent={P.solar} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>DAILY RUN RATE</div><div style={{fontSize:22,fontWeight:900,color:P.solar,fontFamily:fm}}>{fR(dailySpend)}</div></Glass>
                    <Glass accent={P.cyan} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>PROJECTED TOTAL</div><div style={{fontSize:22,fontWeight:900,color:P.cyan,fontFamily:fm}}>{fR(projSpend)}</div></Glass>
                    <Glass accent={P.orchid} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>PLATFORMS</div><div style={{fontSize:22,fontWeight:900,color:P.orchid,fontFamily:fm}}>{sortedPlats.length}</div></Glass>
                  </div>
                  <div style={{padding:"18px 0 10px"}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                      <span style={{fontSize:11,fontWeight:800,color:P.ember,fontFamily:fm,letterSpacing:2}}>{"SPEND TO DATE: "+fR(computed.totalSpend)}</span>
                      <span style={{fontSize:11,fontWeight:700,color:pacePct>90?P.rose:pacePct>60?P.solar:P.mint,fontFamily:fm,letterSpacing:2}}>{"DAY "+elapsedDays+" OF "+totalDays2+" ("+pacePct+"%)"}</span>
                    </div>
                    <div style={{position:"relative",height:44,background:"rgba(0,0,0,0.3)",borderRadius:12,overflow:"hidden",border:"1px solid "+P.rule}}>
                      <div style={{position:"absolute",left:0,top:0,bottom:0,width:pacePct+"%",background:"linear-gradient(90deg,"+P.ember+","+P.solar+")",borderRadius:12,transition:"width 0.6s ease"}}/>
                      <div style={{position:"absolute",left:pacePct+"%",top:-2,bottom:-2,width:2,background:P.txt,opacity:0.6,zIndex:2}}/>
                      <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",zIndex:3}}><span style={{fontSize:13,fontWeight:900,color:"#fff",fontFamily:fm,textShadow:"0 1px 6px rgba(0,0,0,0.9)"}}>{fR(computed.totalSpend)+" spent, projecting "+fR(projSpend)}</span></div>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",marginTop:8}}><span style={{fontSize:10,color:P.sub,fontFamily:fm}}>{df}</span><span style={{fontSize:10,color:P.sub,fontFamily:fm}}>{dt}</span></div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginTop:24}}>
                    <div style={{height:300}}>
                      <div style={{fontSize:10,fontWeight:800,color:P.sub,fontFamily:fm,letterSpacing:2,marginBottom:8,textAlign:"center"}}>SPEND BY PLATFORM</div>
                      <ResponsiveContainer width="100%" height="92%">
                        <PieChart><Pie data={spendData} dataKey="value" cx="50%" cy="45%" innerRadius={45} outerRadius={75} paddingAngle={3} stroke="none" label={function(e){var radius=75+22;var rad=Math.PI/180;var x2=e.cx+radius*Math.cos(-e.midAngle*rad);var y2=e.cy+radius*Math.sin(-e.midAngle*rad);return<text x={x2} y={y2} textAnchor={x2>e.cx?"start":"end"} dominantBaseline="central" style={{fontSize:11,fontFamily:fm,fontWeight:700,fill:e.payload.color||P.txt}}>{e.name+" "+Math.round(e.value/computed.totalSpend*100)+"%"}</text>;}} labelLine={{stroke:P.sub,strokeWidth:1}}>{spendData.map(function(e,i){return <Cell key={i} fill={e.color}/>;})}</Pie><Tooltip content={<Tip/>} wrapperStyle={{outline:"none"}}/><Legend verticalAlign="bottom" iconType="circle" wrapperStyle={legStyle} formatter={function(v,e){return<span style={{color:P.txt,fontFamily:fm,fontSize:10}}>{v+" ("+fR(e.payload.value)+")"}</span>;}}/></PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div style={{height:300}}>
                      <div style={{fontSize:10,fontWeight:800,color:P.sub,fontFamily:fm,letterSpacing:2,marginBottom:8,textAlign:"center"}}>IMPRESSIONS BY PLATFORM</div>
                      <ResponsiveContainer width="100%" height="92%">
                        <BarChart data={impData} barSize={44} margin={{top:24,right:12,left:0,bottom:0}}><CartesianGrid strokeDasharray="3 3" stroke={P.rule}/><XAxis dataKey="name" tick={{fontSize:11,fill:P.sub,fontFamily:fm}} axisLine={false} tickLine={false}/><YAxis tick={{fontSize:10,fill:P.dim,fontFamily:fm}} axisLine={false} tickLine={false} tickFormatter={function(v){return fmt(v);}}/><Tooltip content={<Tip/>} wrapperStyle={{outline:"none"}} cursor={{fill:"rgba(255,255,255,0.05)"}}/><Legend verticalAlign="bottom" iconType="circle" wrapperStyle={legStyle}/><Bar dataKey="value" name="Impressions" radius={[6,6,0,0]}>{impData.map(function(e,i){return <Cell key={i} fill={e.color}/>;})}<LabelList dataKey="value" position="top" formatter={function(v){return fmt(v);}} style={lblStyle}/></Bar></BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  {(function(){var topPlatBySpend=sortedPlats.slice().sort(function(a,b){return platBreak[b].spend-platBreak[a].spend;})[0];var topPlatByImps=sortedPlats.slice().sort(function(a,b){return platBreak[b].imps-platBreak[a].imps;})[0];return standRow([stand("SPEND TO DATE",fR(computed.totalSpend),P.ember),stand("DAILY RUN RATE",fR(dailySpend)+"/day",P.solar),stand("PROJECTED TOTAL",fR(projSpend),P.cyan),topPlatBySpend?stand("BIGGEST SPEND",topPlatBySpend+" ("+fR(platBreak[topPlatBySpend].spend)+")",platCol4[topPlatBySpend]||P.orchid):null,topPlatByImps?stand("MOST IMPRESSIONS",topPlatByImps+" ("+fmt(platBreak[topPlatByImps].imps)+")",platCol4[topPlatByImps]||P.mint):null]);})()}
                </div>
              </div>

              {/* ═══ 2. AWARENESS HIGHLIGHTS ═══ */}
              <div style={{background:P.glass,borderRadius:18,padding:"6px 28px 28px",marginBottom:28,border:"1px solid "+P.rule}}>
                {secHead(P.cyan,"AWARENESS HIGHLIGHTS",Ic.eye(P.cyan,18))}
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
                  <Glass accent={P.cyan} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>TOTAL IMPRESSIONS</div><div style={{fontSize:24,fontWeight:900,color:P.cyan,fontFamily:fm}}>{fmt(computed.totalImps)}</div></Glass>
                  <Glass accent={P.orchid} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>TOTAL REACH</div><div style={{fontSize:24,fontWeight:900,color:P.orchid,fontFamily:fm}}>{fmt(m.reach+t.reach+computed.gd.reach)}</div></Glass>
                  <Glass accent={P.solar} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>BLENDED CPM</div><div style={{fontSize:24,fontWeight:900,color:computed.blendedCpm<=benchmarks.meta.cpm.mid?P.mint:computed.blendedCpm<=benchmarks.meta.cpm.high?P.solar:P.rose,fontFamily:fm}}>{fR(computed.blendedCpm)}</div><div style={{marginTop:4}}><span style={{fontSize:9,fontWeight:800,padding:"3px 10px",borderRadius:5,color:"#fff",background:computed.blendedCpm<=benchmarks.meta.cpm.low?P.mint:computed.blendedCpm<=benchmarks.meta.cpm.mid?P.solar:P.rose}}>{computed.blendedCpm<=benchmarks.meta.cpm.low?"EXCELLENT":computed.blendedCpm<=benchmarks.meta.cpm.mid?"GOOD":computed.blendedCpm<=benchmarks.meta.cpm.high?"AVERAGE":"REVIEW"}</span></div></Glass>
                  <Glass accent={m.frequency>4?P.rose:m.frequency>3?P.warning:P.mint} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>META FREQUENCY</div><div style={{fontSize:24,fontWeight:900,color:m.frequency>4?P.rose:m.frequency>3?P.warning:m.frequency>2?P.mint:P.txt,fontFamily:fm}}>{m.frequency>0?m.frequency.toFixed(2)+"x":"-"}</div><div style={{marginTop:4}}><span style={{fontSize:9,fontWeight:800,padding:"3px 10px",borderRadius:5,color:"#fff",background:m.frequency>4?P.rose:m.frequency>3?P.warning:P.mint}}>{m.frequency>4?"FATIGUE":m.frequency>3?"MONITOR":m.frequency>2?"OPTIMAL":"BUILDING"}</span></div></Glass>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
                  <div style={{height:300}}>
                    <div style={{fontSize:10,fontWeight:800,color:P.sub,fontFamily:fm,letterSpacing:2,marginBottom:10,textAlign:"center"}}>CPM BY PLATFORM</div>
                    <ResponsiveContainer width="100%" height="90%">
                      <BarChart data={cpmData} barSize={44} margin={{top:24,right:12,left:0,bottom:0}}><CartesianGrid strokeDasharray="3 3" stroke={P.rule}/><XAxis dataKey="name" tick={{fontSize:11,fill:P.sub,fontFamily:fm}} axisLine={false} tickLine={false}/><YAxis tick={{fontSize:10,fill:P.dim,fontFamily:fm}} axisLine={false} tickLine={false} tickFormatter={function(v){return"R"+v;}}/><Tooltip content={<Tip/>} wrapperStyle={{outline:"none"}} cursor={{fill:"rgba(255,255,255,0.05)"}}/><Legend verticalAlign="bottom" iconType="circle" wrapperStyle={legStyle}/><Bar dataKey="cpm" name="CPM" radius={[6,6,0,0]}>{cpmData.map(function(e,i){return <Cell key={i} fill={e.color}/>;})}<LabelList dataKey="cpm" position="top" formatter={function(v){return"R"+v;}} style={lblStyle}/></Bar></BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={{height:300}}>
                    <div style={{fontSize:10,fontWeight:800,color:P.sub,fontFamily:fm,letterSpacing:2,marginBottom:10,textAlign:"center"}}>REACH BY PLATFORM</div>
                    <ResponsiveContainer width="100%" height="90%">
                      <BarChart data={sortedPlats.filter(function(pl){return platBreak[pl].reach>0;}).map(function(pl){return{name:platShort[pl]||pl,reach:platBreak[pl].reach,color:platCol4[pl]||P.ember};})} barSize={44} margin={{top:24,right:12,left:0,bottom:0}}><CartesianGrid strokeDasharray="3 3" stroke={P.rule}/><XAxis dataKey="name" tick={{fontSize:11,fill:P.sub,fontFamily:fm}} axisLine={false} tickLine={false}/><YAxis tick={{fontSize:10,fill:P.dim,fontFamily:fm}} axisLine={false} tickLine={false} tickFormatter={function(v){return fmt(v);}}/><Tooltip content={<Tip/>} wrapperStyle={{outline:"none"}} cursor={{fill:"rgba(255,255,255,0.05)"}}/><Legend verticalAlign="bottom" iconType="circle" wrapperStyle={legStyle}/><Bar dataKey="reach" name="Reach" radius={[6,6,0,0]}>{sortedPlats.filter(function(pl){return platBreak[pl].reach>0;}).map(function(pl,i){return <Cell key={i} fill={platCol4[pl]||P.ember}/>;})}<LabelList dataKey="reach" position="top" formatter={function(v){return fmt(v);}} style={lblStyle}/></Bar></BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                {(function(){var bestCpmP=sortedPlats.filter(function(pl){return platBreak[pl].imps>0;}).slice().sort(function(a,b){return(platBreak[a].spend/platBreak[a].imps*1000)-(platBreak[b].spend/platBreak[b].imps*1000);})[0];var widestReach=sortedPlats.slice().sort(function(a,b){return platBreak[b].reach-platBreak[a].reach;})[0];return standRow([bestCpmP?stand("BEST CPM",bestCpmP+", "+fR(platBreak[bestCpmP].spend/platBreak[bestCpmP].imps*1000),platCol4[bestCpmP]||P.cyan):null,widestReach&&platBreak[widestReach].reach>0?stand("WIDEST REACH",widestReach+", "+fmt(platBreak[widestReach].reach),platCol4[widestReach]||P.orchid):null,m.frequency>0?stand("META FREQUENCY",m.frequency.toFixed(2)+"x"+(m.frequency>4?" (fatigue)":m.frequency>3?" (monitor)":m.frequency>2?" (optimal)":" (building)"),m.frequency>4?P.rose:m.frequency>3?P.warning:P.mint):null]);})()}
              </div>

              {/* ═══ 4. ENGAGEMENT HIGHLIGHTS ═══ */}
              <div style={{background:P.glass,borderRadius:18,padding:"6px 28px 28px",marginBottom:28,border:"1px solid "+P.rule}}>
                {secHead(P.mint,"ENGAGEMENT HIGHLIGHTS",Ic.bolt(P.mint,18))}
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:20}}>
                  <Glass accent={P.mint} hv={true} st={{padding:18,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>BLENDED CPC</div><div style={{fontSize:28,fontWeight:900,color:blCpc>0&&blCpc<1.5?P.mint:blCpc<3?P.solar:P.rose,fontFamily:fm,lineHeight:1}}>{fR(blCpc)}</div><div style={{marginTop:8}}><span style={{fontSize:9,fontWeight:800,padding:"3px 10px",borderRadius:5,color:"#fff",background:blCpc>0&&blCpc<=benchmarks.meta.cpc.low?P.mint:blCpc<=benchmarks.meta.cpc.mid?P.solar:P.rose}}>{blCpc>0&&blCpc<=benchmarks.meta.cpc.low?"EXCELLENT":blCpc<=benchmarks.meta.cpc.mid?"GOOD":blCpc<=benchmarks.meta.cpc.high?"AVERAGE":"REVIEW"}</span></div></Glass>
                  <Glass accent={P.solar} hv={true} st={{padding:18,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>BLENDED CTR</div><div style={{fontSize:28,fontWeight:900,color:blCtr>2?P.mint:blCtr>1?P.txt:P.warning,fontFamily:fm,lineHeight:1}}>{blCtr.toFixed(2)+"%"}</div><div style={{fontSize:9,color:P.sub,fontFamily:fm,marginTop:8}}>{"SA benchmark: 0.9\u20131.4%"}</div></Glass>
                  <Glass accent={P.cyan} hv={true} st={{padding:18,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>TOTAL CLICKS</div><div style={{fontSize:28,fontWeight:900,color:P.cyan,fontFamily:fm,lineHeight:1}}>{fmt(computed.totalClicks)}</div><div style={{fontSize:9,color:P.sub,fontFamily:fm,marginTop:8}}>{sel.length+" campaigns"}</div></Glass>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
                  <div style={{height:300}}>
                    <div style={{fontSize:10,fontWeight:800,color:P.sub,fontFamily:fm,letterSpacing:2,marginBottom:10,textAlign:"center"}}>CPC BY PLATFORM</div>
                    <ResponsiveContainer width="100%" height="90%">
                      <BarChart data={cpcData} barSize={44} margin={{top:24,right:12,left:0,bottom:0}}><CartesianGrid strokeDasharray="3 3" stroke={P.rule}/><XAxis dataKey="name" tick={{fontSize:11,fill:P.sub,fontFamily:fm}} axisLine={false} tickLine={false}/><YAxis tick={{fontSize:10,fill:P.dim,fontFamily:fm}} axisLine={false} tickLine={false} tickFormatter={function(v){return"R"+v;}}/><Tooltip content={<Tip/>} wrapperStyle={{outline:"none"}} cursor={{fill:"rgba(255,255,255,0.05)"}}/><Legend verticalAlign="bottom" iconType="circle" wrapperStyle={legStyle}/><Bar dataKey="cpc" name="CPC" radius={[6,6,0,0]}>{cpcData.map(function(e,i){return <Cell key={i} fill={e.color}/>;})}<LabelList dataKey="cpc" position="top" formatter={function(v){return"R"+v;}} style={lblStyle}/></Bar></BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={{height:300}}>
                    <div style={{fontSize:10,fontWeight:800,color:P.sub,fontFamily:fm,letterSpacing:2,marginBottom:10,textAlign:"center"}}>CTR BY PLATFORM</div>
                    <ResponsiveContainer width="100%" height="90%">
                      <BarChart data={sortedPlats.filter(function(pl){return platBreak[pl].clicks>0;}).map(function(pl){var pb=platBreak[pl];return{name:platShort[pl]||pl,ctr:pb.imps>0?parseFloat((pb.clicks/pb.imps*100).toFixed(2)):0,color:platCol4[pl]||P.ember};})} barSize={44} margin={{top:24,right:12,left:0,bottom:0}}><CartesianGrid strokeDasharray="3 3" stroke={P.rule}/><XAxis dataKey="name" tick={{fontSize:11,fill:P.sub,fontFamily:fm}} axisLine={false} tickLine={false}/><YAxis tick={{fontSize:10,fill:P.dim,fontFamily:fm}} axisLine={false} tickLine={false} tickFormatter={function(v){return v+"%";}}/><Tooltip content={<Tip/>} wrapperStyle={{outline:"none"}} cursor={{fill:"rgba(255,255,255,0.05)"}}/><Legend verticalAlign="bottom" iconType="circle" wrapperStyle={legStyle}/><Bar dataKey="ctr" name="CTR" radius={[6,6,0,0]}>{sortedPlats.filter(function(pl){return platBreak[pl].clicks>0;}).map(function(pl,i){return <Cell key={i} fill={platCol4[pl]||P.ember}/>;})}<LabelList dataKey="ctr" position="top" formatter={function(v){return v+"%";}} style={lblStyle}/></Bar></BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                {(function(){var bestCpcP=sortedPlats.filter(function(pl){return platBreak[pl].clicks>0;}).slice().sort(function(a,b){return(platBreak[a].spend/platBreak[a].clicks)-(platBreak[b].spend/platBreak[b].clicks);})[0];var bestCtrP=sortedPlats.filter(function(pl){return platBreak[pl].clicks>0;}).slice().sort(function(a,b){return(platBreak[b].clicks/platBreak[b].imps)-(platBreak[a].clicks/platBreak[a].imps);})[0];var mostClicksP=sortedPlats.slice().sort(function(a,b){return platBreak[b].clicks-platBreak[a].clicks;})[0];return standRow([bestCpcP?stand("BEST CPC",bestCpcP+", "+fR(platBreak[bestCpcP].spend/platBreak[bestCpcP].clicks),platCol4[bestCpcP]||P.mint):null,bestCtrP?stand("HIGHEST CTR",bestCtrP+", "+(platBreak[bestCtrP].clicks/platBreak[bestCtrP].imps*100).toFixed(2)+"%",platCol4[bestCtrP]||P.solar):null,mostClicksP?stand("MOST CLICKS",mostClicksP+", "+fmt(platBreak[mostClicksP].clicks),platCol4[mostClicksP]||P.cyan):null]);})()}
              </div>

              {/* ═══ 5. OBJECTIVE HIGHLIGHTS ═══ */}
              {objKeys.filter(function(k){return objectives4[k];}).length>0&&<div style={{background:P.glass,borderRadius:18,padding:"6px 28px 28px",marginBottom:28,border:"1px solid "+P.rule}}>
                {secHead(P.rose,"OBJECTIVE HIGHLIGHTS",Ic.target(P.rose,18))}
                <div style={{display:"grid",gridTemplateColumns:"repeat("+Math.min(4,objKeys.filter(function(k){return objectives4[k];}).length)+",1fr)",gap:14,marginBottom:20}}>
                  {objKeys.filter(function(k){return objectives4[k];}).map(function(objName){
                    var od=objectives4[objName];var oc=objCol4[objName]||P.ember;var costPer=od.results>0?od.spend/od.results:0;
                    var bm=objName==="Leads"?benchmarks.meta.cpl:objName==="Followers & Likes"?benchmarks.meta.cpf:benchmarks.meta.cpc;
                    var bmCol=costPer>0&&bm&&costPer<=bm.mid?P.mint:costPer>0&&bm&&costPer>bm.high?P.rose:P.solar;
                    var bmTag=costPer>0&&bm?(costPer<=bm.low?"EXCELLENT":costPer<=bm.mid?"GOOD":costPer<=bm.high?"AVERAGE":"REVIEW"):"";
                    return <div key={objName} style={{background:"rgba(0,0,0,0.2)",borderRadius:14,padding:"20px 18px",border:"1px solid "+oc+"25"}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:14}}><span style={{width:10,height:10,borderRadius:"50%",background:oc}}></span><span style={{fontSize:10,fontWeight:800,color:oc,fontFamily:ff,letterSpacing:0.5}}>{objName}</span></div>
                      <div style={{fontSize:30,fontWeight:900,color:oc,fontFamily:fm,lineHeight:1,marginBottom:4}}>{fmt(od.results)}</div>
                      <div style={{fontSize:10,color:P.sub,fontFamily:fm,marginBottom:14}}>from {fR(od.spend)} invested</div>
                      <div style={{borderTop:"1px solid "+P.rule,paddingTop:12,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                        <div><div style={{fontSize:10,color:"rgba(255,255,255,0.5)",fontFamily:fm,letterSpacing:1}}>{objCL4[objName]||"COST PER"}</div><div style={{fontSize:18,fontWeight:900,color:costPer>0?bmCol:P.dim,fontFamily:fm}}>{costPer>0?fR(costPer):"-"}</div></div>
                        {bmTag&&<span style={{fontSize:9,fontWeight:800,padding:"4px 10px",borderRadius:5,color:"#fff",background:bmCol}}>{bmTag}</span>}
                      </div>
                    </div>;})}
                </div>
                {(function(){var objData=objKeys.filter(function(k){return objectives4[k]&&objectives4[k].results>0;}).map(function(k){var od=objectives4[k];return{name:k.replace("Landing Page ","LP ").replace("App Store ","App ").replace("Followers & ","Foll/"),results:od.results,spend:od.spend,costPer:od.results>0?parseFloat((od.spend/od.results).toFixed(2)):0,color:objCol4[k]||P.ember};});if(objData.length<2)return null;return <div style={{height:300}}><div style={{fontSize:10,fontWeight:800,color:P.sub,fontFamily:fm,letterSpacing:2,marginBottom:10,textAlign:"center"}}>COST PER RESULT BY OBJECTIVE</div><ResponsiveContainer width="100%" height="90%"><BarChart data={objData} barSize={48} margin={{top:24,right:12,left:0,bottom:0}}><CartesianGrid strokeDasharray="3 3" stroke={P.rule}/><XAxis dataKey="name" tick={{fontSize:10,fill:P.sub,fontFamily:fm}} axisLine={false} tickLine={false}/><YAxis tick={{fontSize:10,fill:P.dim,fontFamily:fm}} axisLine={false} tickLine={false} tickFormatter={function(v){return"R"+v;}}/><Tooltip content={<Tip/>} wrapperStyle={{outline:"none"}} cursor={{fill:"rgba(255,255,255,0.05)"}}/><Legend verticalAlign="bottom" iconType="circle" wrapperStyle={legStyle}/><Bar dataKey="costPer" name="Cost Per Result" radius={[6,6,0,0]}>{objData.map(function(e,i){return <Cell key={i} fill={e.color}/>;})}<LabelList dataKey="costPer" position="top" formatter={function(v){return"R"+v;}} style={lblStyle}/></Bar></BarChart></ResponsiveContainer></div>;})()}
                {(function(){var active=objKeys.filter(function(k){return objectives4[k]&&objectives4[k].results>0;});if(active.length===0)return null;var topVol=active.slice().sort(function(a,b){return objectives4[b].results-objectives4[a].results;})[0];var bestEff=active.slice().sort(function(a,b){return(objectives4[a].spend/objectives4[a].results)-(objectives4[b].spend/objectives4[b].results);})[0];var totalResults=0;active.forEach(function(k){totalResults+=objectives4[k].results;});return standRow([topVol?stand("HIGHEST VOLUME",topVol+", "+fmt(objectives4[topVol].results),objCol4[topVol]||P.rose):null,bestEff?stand("BEST EFFICIENCY",bestEff+", "+fR(objectives4[bestEff].spend/objectives4[bestEff].results)+"/result",objCol4[bestEff]||P.mint):null,stand("TOTAL RESULTS",fmt(totalResults),P.ember)]);})()}
              </div>}

              {/* ═══ 6. TARGETING STANDOUTS ═══ */}
              {selAdsets2.length>0&&(function(){
                var topAd=selAdsets2.map(function(a){
                  var sp=parseFloat(a.spend||0);var cl=parseFloat(a.clicks||0);var im=parseFloat(a.impressions||0);
                  var res=parseFloat(a.follows||0)+parseFloat(a.pageLikes||0)+parseFloat(a.leads||0);if(res===0)res=cl;
                  return{name:a.adsetName,platform:a.platform,spend:sp,result:res,costPer:res>0?sp/res:0,ctr:im>0?(cl/im*100):0,imps:im};
                }).filter(function(a){return a.result>=3&&a.spend>100;}).sort(function(a,b){return(b.result>0?b.result/b.spend:0)-(a.result>0?a.result/a.spend:0);});
                var worstAd=selAdsets2.map(function(a){
                  var sp=parseFloat(a.spend||0);var cl=parseFloat(a.clicks||0);var im=parseFloat(a.impressions||0);
                  var res=parseFloat(a.follows||0)+parseFloat(a.pageLikes||0)+parseFloat(a.leads||0);if(res===0)res=cl;
                  return{name:a.adsetName,platform:a.platform,spend:sp,result:res,costPer:res>0?sp/res:0,ctr:im>0?(cl/im*100):0};
                }).filter(function(a){return a.spend>200&&(a.result===0||(a.ctr<0.5&&a.spend>300));}).sort(function(a,b){return b.spend-a.spend;});
                if(topAd.length===0&&worstAd.length===0)return null;
                var topChart=topAd.slice(0,5).map(function(a){return{name:a.name.length>25?a.name.substring(0,22)+"...":a.name,results:a.result,costPer:a.costPer>0?parseFloat(a.costPer.toFixed(2)):0,color:platCol4[a.platform]||P.ember};});
                return <div style={{background:P.glass,borderRadius:18,padding:"6px 28px 28px",marginBottom:28,border:"1px solid "+P.rule}}>
                  {secHead(P.solar,"TARGETING STANDOUTS",Ic.radar(P.solar,18))}
                  <div style={{display:"grid",gridTemplateColumns:topAd.length>0&&worstAd.length>0?"1fr 1fr":"1fr",gap:20,marginBottom:20}}>
                    {topAd.length>0&&<div>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}><div style={{width:28,height:28,borderRadius:8,background:P.mint+"15",border:"1px solid "+P.mint+"30",display:"flex",alignItems:"center",justifyContent:"center"}}>{Ic.check(P.mint,16)}</div><span style={{fontSize:13,fontWeight:900,color:P.mint,fontFamily:ff,letterSpacing:1}}>TOP PERFORMERS</span></div>
                      {topAd.slice(0,4).map(function(ta,ti){
                        var pc7=platCol4[ta.platform]||P.ember;
                        return <div key={ti} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",marginBottom:8,background:"linear-gradient(135deg,"+P.mint+"08,transparent)",borderLeft:"3px solid "+P.mint,borderRadius:"0 12px 12px 0",border:"1px solid "+P.mint+"15",borderLeftWidth:3}}>
                          <span style={{background:pc7,color:"#fff",fontSize:8,fontWeight:800,padding:"3px 10px",borderRadius:8,flexShrink:0,letterSpacing:1}}>{platShort[ta.platform]||ta.platform}</span>
                          <div style={{flex:1,minWidth:0}}><div style={{fontSize:11,fontWeight:700,color:P.txt,lineHeight:1.4,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ta.name}</div><div style={{fontSize:9,color:P.sub,fontFamily:fm,marginTop:2}}>{fmt(ta.imps)+" impressions \u00b7 "+ta.ctr.toFixed(2)+"% CTR"}</div></div>
                          <div style={{textAlign:"right",flexShrink:0}}><div style={{fontSize:18,fontWeight:900,color:P.mint,fontFamily:fm,lineHeight:1}}>{fmt(ta.result)}</div><div style={{fontSize:9,color:P.sub,fontFamily:fm,marginTop:2}}>{fR(ta.costPer)+"/ea"}</div></div>
                        </div>;})}
                    </div>}
                    {worstAd.length>0&&<div>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}><div style={{width:28,height:28,borderRadius:8,background:P.rose+"15",border:"1px solid "+P.rose+"30",display:"flex",alignItems:"center",justifyContent:"center"}}>{Ic.alert(P.rose,16)}</div><span style={{fontSize:13,fontWeight:900,color:P.rose,fontFamily:ff,letterSpacing:1}}>REQUIRES ATTENTION</span></div>
                      {worstAd.slice(0,4).map(function(wa,wi){
                        var pc8=platCol4[wa.platform]||P.ember;
                        return <div key={wi} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",marginBottom:8,background:"linear-gradient(135deg,"+P.rose+"08,transparent)",borderLeft:"3px solid "+P.rose,borderRadius:"0 12px 12px 0",border:"1px solid "+P.rose+"15",borderLeftWidth:3}}>
                          <span style={{background:pc8,color:"#fff",fontSize:8,fontWeight:800,padding:"3px 10px",borderRadius:8,flexShrink:0,letterSpacing:1}}>{platShort[wa.platform]||wa.platform}</span>
                          <div style={{flex:1,minWidth:0}}><div style={{fontSize:11,fontWeight:700,color:P.txt,lineHeight:1.4,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{wa.name}</div><div style={{fontSize:9,color:P.sub,fontFamily:fm,marginTop:2}}>{fR(wa.spend)+" spent \u00b7 "+wa.ctr.toFixed(2)+"% CTR"}</div></div>
                          <div style={{textAlign:"right",flexShrink:0}}><div style={{fontSize:14,fontWeight:900,color:P.rose,fontFamily:fm,lineHeight:1}}>{wa.result===0?"No results":fmt(wa.result)}</div><div style={{fontSize:9,color:P.sub,fontFamily:fm,marginTop:2}}>{wa.result===0?"zero conversions":fR(wa.costPer)+"/ea"}</div></div>
                        </div>;})}
                    </div>}
                  </div>
                  {topChart.length>=2&&<div style={{height:320}}>
                    <div style={{fontSize:10,fontWeight:800,color:P.sub,fontFamily:fm,letterSpacing:2,marginBottom:10,textAlign:"center"}}>TOP AD SET EFFICIENCY (RESULTS VS COST)</div>
                    <ResponsiveContainer width="100%" height="90%">
                      <ComposedChart data={topChart} barSize={36} margin={{top:24,right:12,left:0,bottom:0}}><CartesianGrid strokeDasharray="3 3" stroke={P.rule}/><XAxis dataKey="name" tick={{fontSize:9,fill:P.sub,fontFamily:fm}} axisLine={false} tickLine={false} interval={0}/><YAxis yAxisId="left" tick={{fontSize:10,fill:P.dim,fontFamily:fm}} axisLine={false} tickLine={false}/><YAxis yAxisId="right" orientation="right" tick={{fontSize:10,fill:P.dim,fontFamily:fm}} axisLine={false} tickLine={false} tickFormatter={function(v){return"R"+v;}}/><Tooltip content={<Tip/>} wrapperStyle={{outline:"none"}} cursor={{fill:"rgba(255,255,255,0.05)"}}/><Legend verticalAlign="bottom" iconType="circle" wrapperStyle={legStyle}/><Bar yAxisId="left" dataKey="results" name="Results" radius={[6,6,0,0]}>{topChart.map(function(e,i){return <Cell key={i} fill={e.color}/>;})}<LabelList dataKey="results" position="top" formatter={function(v){return fmt(v);}} style={lblStyle}/></Bar><Line yAxisId="right" type="monotone" dataKey="costPer" name="Cost Per Result" stroke={P.solar} strokeWidth={2} dot={{fill:P.solar,r:4}}><LabelList dataKey="costPer" position="top" formatter={function(v){return"R"+v;}} style={lblStyleSm}/></Line></ComposedChart>
                    </ResponsiveContainer>
                  </div>}
                  {(function(){var totalWaste=0;worstAd.forEach(function(w){totalWaste+=w.spend;});return standRow([topAd.length>0?stand("BEST AD SET",(topAd[0].name.length>30?topAd[0].name.substring(0,28)+"..":topAd[0].name)+", "+fR(topAd[0].costPer)+"/ea",platCol4[topAd[0].platform]||P.mint):null,stand("ACTIVE AD SETS",selAdsets2.length,P.cyan),worstAd.length>0?stand("FLAGGED WASTE",fR(totalWaste)+" across "+worstAd.length,P.rose):null]);})()}
                </div>;
              })()}

              {/* ═══ 7. COMMUNITY GROWTH ═══ */}
              {grandT2>0&&<div style={{background:P.glass,borderRadius:18,padding:"6px 28px 28px",marginBottom:28,border:"1px solid "+P.rule}}>
                {secHead(P.tt,"COMMUNITY GROWTH",Ic.users(P.tt,18))}
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
                  <Glass accent={P.mint} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>TOTAL COMMUNITY</div><div style={{fontSize:24,fontWeight:900,color:P.mint,fontFamily:fm}}>{fmt(grandT2)}</div></Glass>
                  <Glass accent={P.ember} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>EARNED THIS PERIOD</div><div style={{fontSize:24,fontWeight:900,color:P.ember,fontFamily:fm}}>{earnedTotal>0?"+"+fmt(earnedTotal):"-"}</div></Glass>
                  <Glass accent={P.orchid} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>GROWTH RATE</div><div style={{fontSize:24,fontWeight:900,color:P.orchid,fontFamily:fm}}>{grandT2>0&&earnedTotal>0?(earnedTotal/grandT2*100).toFixed(1)+"%":"-"}</div></Glass>
                  <Glass accent={P.solar} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>COST PER MEMBER</div><div style={{fontSize:24,fontWeight:900,color:P.solar,fontFamily:fm}}>{earnedTotal>0?fR(computed.totalSpend/earnedTotal):"-"}</div></Glass>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
                  <div style={{height:300}}>
                    <div style={{fontSize:10,fontWeight:800,color:P.sub,fontFamily:fm,letterSpacing:2,marginBottom:10,textAlign:"center"}}>COMMUNITY BY PLATFORM</div>
                    <ResponsiveContainer width="100%" height="90%">
                      <BarChart data={communityData} barSize={44} margin={{top:24,right:12,left:0,bottom:0}}><CartesianGrid strokeDasharray="3 3" stroke={P.rule}/><XAxis dataKey="name" tick={{fontSize:11,fill:P.sub,fontFamily:fm}} axisLine={false} tickLine={false}/><YAxis tick={{fontSize:10,fill:P.dim,fontFamily:fm}} axisLine={false} tickLine={false} tickFormatter={function(v){return fmt(v);}}/><Tooltip content={<Tip/>} wrapperStyle={{outline:"none"}} cursor={{fill:"rgba(255,255,255,0.05)"}}/><Legend verticalAlign="bottom" iconType="circle" wrapperStyle={legStyle}/><Bar dataKey="total" name="Total Followers" radius={[6,6,0,0]}>{communityData.map(function(e,i){return <Cell key={i} fill={e.color}/>;})}<LabelList dataKey="total" position="top" formatter={function(v){return fmt(v);}} style={lblStyle}/></Bar></BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={{height:300}}>
                    <div style={{fontSize:10,fontWeight:800,color:P.sub,fontFamily:fm,letterSpacing:2,marginBottom:10,textAlign:"center"}}>EARNED THIS PERIOD</div>
                    <ResponsiveContainer width="100%" height="90%">
                      <BarChart data={communityData.filter(function(c){return c.earned>0;})} barSize={44} margin={{top:24,right:12,left:0,bottom:0}}><CartesianGrid strokeDasharray="3 3" stroke={P.rule}/><XAxis dataKey="name" tick={{fontSize:11,fill:P.sub,fontFamily:fm}} axisLine={false} tickLine={false}/><YAxis tick={{fontSize:10,fill:P.dim,fontFamily:fm}} axisLine={false} tickLine={false} tickFormatter={function(v){return fmt(v);}}/><Tooltip content={<Tip/>} wrapperStyle={{outline:"none"}} cursor={{fill:"rgba(255,255,255,0.05)"}}/><Legend verticalAlign="bottom" iconType="circle" wrapperStyle={legStyle}/><Bar dataKey="earned" name="Earned Followers" radius={[6,6,0,0]}>{communityData.filter(function(c){return c.earned>0;}).map(function(e,i){return <Cell key={i} fill={e.color}/>;})}<LabelList dataKey="earned" position="top" formatter={function(v){return fmt(v);}} style={lblStyle}/></Bar></BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                {(function(){var biggestPlat=communityData.slice().sort(function(a,b){return b.total-a.total;})[0];var fastestGrow=communityData.filter(function(c){return c.earned>0;}).slice().sort(function(a,b){return b.earned-a.earned;})[0];return standRow([biggestPlat?stand("BIGGEST PLATFORM",biggestPlat.name+", "+fmt(biggestPlat.total),biggestPlat.color):null,fastestGrow?stand("TOP GROWTH THIS PERIOD",fastestGrow.name+", +"+fmt(fastestGrow.earned),fastestGrow.color):null,earnedTotal>0?stand("COST PER MEMBER",fR(computed.totalSpend/earnedTotal),P.solar):null]);})()}
              </div>}

              {/* ═══ 7. EXECUTIVE SUMMARY (consolidated at bottom) ═══ */}
              {(function(){
                var bestCpcPlatLocal="";var bestCpcValLocal=Infinity;
                sortedPlats.forEach(function(pl){var pb=platBreak[pl];var cpc=pb.clicks>0?pb.spend/pb.clicks:0;if(cpc>0&&cpc<bestCpcValLocal){bestCpcValLocal=cpc;bestCpcPlatLocal=pl;}});
                var awarenessRead=fmt(computed.totalImps)+" impressions to "+fmt(m.reach+t.reach+computed.gd.reach)+" unique users at "+fR(computed.blendedCpm)+" blended CPM ("+benchLabel(computed.blendedCpm,benchmarks.meta.cpm)+")."+(bestCpmPlat&&sortedPlats.length>1?" "+bestCpmPlat+" leads reach efficiency at "+fR(bestCpmVal)+" CPM"+(worstCpmPlat!==bestCpmPlat?" vs "+worstCpmPlat+" at "+fR(worstCpmVal):"")+".":"")+(m.frequency>0?" Meta frequency "+m.frequency.toFixed(2)+"x, "+(freqStatus==="critical"?"above 4x fatigue ceiling, creative rotation overdue.":freqStatus==="warning"?"approaching 3x, refresh creative within 48h.":freqStatus==="healthy"?"in the 2 to 3x recall sweet spot.":"early build phase, full headroom."):"");
                var engagementRead=fmt(computed.totalClicks)+" clicks at "+fR(blCpc)+" blended CPC ("+benchLabel(blCpc,benchmarks.meta.cpc)+"), "+blCtr.toFixed(2)+"% CTR against SA benchmark 0.9 to 1.4%."+(bestCpcPlatLocal?" "+bestCpcPlatLocal+" leads click efficiency at "+fR(bestCpcValLocal)+" CPC.":"")+" "+(blCpc<=benchmarks.meta.cpc.low?"Strong efficiency, scale opportunity, increase top-performer budgets 15 to 20%.":blCpc<=benchmarks.meta.cpc.mid?"Within healthy range, push further via creative testing on hooks and CTAs.":"Above benchmark midpoint, audit bottom 25% of ad sets, test broader placements.");
                var objectiveRead=(function(){var lines=[];objKeys.filter(function(k){return objectives4[k];}).forEach(function(objName){var od=objectives4[objName];var cp=od.results>0?od.spend/od.results:0;var bm=objName==="Leads"?benchmarks.meta.cpl:objName==="Followers & Likes"?benchmarks.meta.cpf:benchmarks.meta.cpc;if(od.results>=10)lines.push(objName+": "+fmt(od.results)+" results at "+fR(cp)+" ("+benchLabel(cp,bm)+"), confirmed at scale."+(cp>0&&bm&&cp<=bm.low?" Top-tier, scale investment.":""));else if(od.results>0)lines.push(objName+": "+fmt(od.results)+" early results at "+fR(cp)+". Below 10-result threshold, allow learning phase to complete.");else if(od.spend>500)lines.push(objName+": "+fR(od.spend)+" invested, no results. Verify pixel and landing page.");else if(od.spend>0)lines.push(objName+": "+fR(od.spend)+", early delivery phase.");});return lines.join(" ")||"No active objectives detected.";})();
                var targetingRead=(function(){if(selAdsets2.length===0)return"No ad set data available for targeting analysis.";var topAd2=selAdsets2.map(function(a){var sp=parseFloat(a.spend||0);var cl=parseFloat(a.clicks||0);var im=parseFloat(a.impressions||0);var res=parseFloat(a.follows||0)+parseFloat(a.pageLikes||0)+parseFloat(a.leads||0);if(res===0)res=cl;return{name:a.adsetName,platform:a.platform,spend:sp,result:res,costPer:res>0?sp/res:0,ctr:im>0?(cl/im*100):0};}).filter(function(a){return a.result>=3&&a.spend>100;}).sort(function(a,b){return(b.result>0?b.result/b.spend:0)-(a.result>0?a.result/a.spend:0);});var worstAd2=selAdsets2.map(function(a){var sp=parseFloat(a.spend||0);var cl=parseFloat(a.clicks||0);var im=parseFloat(a.impressions||0);var res=parseFloat(a.follows||0)+parseFloat(a.pageLikes||0)+parseFloat(a.leads||0);if(res===0)res=cl;return{name:a.adsetName,platform:a.platform,spend:sp,result:res,ctr:im>0?(cl/im*100):0};}).filter(function(a){return a.spend>200&&(a.result===0||(a.ctr<0.5&&a.spend>300));}).sort(function(a,b){return b.spend-a.spend;});var parts=[selAdsets2.length+" active ad sets analysed."];if(topAd2.length>0){var best=topAd2[0];parts.push("Top performer: \""+best.name+"\" ("+best.platform+"), "+fmt(best.result)+" results at "+fR(best.costPer)+"/ea, "+best.ctr.toFixed(2)+"% CTR."+(topAd2.length>1?" Scale budgets 15 to 25% on the top "+Math.min(topAd2.length,4)+".":""));}if(worstAd2.length>0){var worst=worstAd2[0];var totalWaste=0;worstAd2.forEach(function(w){totalWaste+=w.spend;});parts.push(worstAd2.length+" underperforming ("+fR(totalWaste)+" combined). Weakest: \""+worst.name+"\", "+(worst.result===0?"zero results":worst.ctr.toFixed(2)+"% CTR")+". Pause and reallocate.");}return parts.join(" ");})();
                var communityRead=grandT2===0?"No community data in the selected campaigns.":"Owned audience: "+fmt(grandT2)+" across "+communityData.length+" platforms. "+(fbT2>0?"Facebook "+fmt(fbT2)+(parseFloat(m.pageLikes||0)>0?" (+"+fmt(parseFloat(m.pageLikes||0))+")":"")+". ":"")+(igT2>0?"Instagram "+fmt(igT2)+(igGrowth>0?" (+"+fmt(igGrowth)+")":"")+". ":"")+(ttT2>0?"TikTok "+fmt(ttT2)+(ttE2>0?" (+"+fmt(ttE2)+(t.follows>0?" at "+fR(t.spend/t.follows)+" CPF":"")+")":"")+". ":"")+(earnedTotal>0?fmt(earnedTotal)+" new members this period, each reduces future paid reach cost and builds organic distribution. "+(earnedTotal>100?"Meaningful scale, maintain follower budget whilst CPF holds within benchmark.":"Early momentum."):"");
                var subSec=function(color,icon,title,body){return<div style={{marginBottom:18,paddingBottom:18,borderBottom:"1px solid "+P.rule}}><div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>{icon}<span style={{fontSize:12,fontWeight:900,color:color,fontFamily:fm,letterSpacing:2,textTransform:"uppercase"}}>{title}</span><div style={{flex:1,height:1,background:"linear-gradient(90deg,"+color+"30, transparent)"}}/></div><div style={{fontSize:13,color:P.txt,lineHeight:1.9,fontFamily:ff,letterSpacing:0.2}}>{body}</div></div>;};
                return <div style={{marginTop:28,padding:"26px 30px",background:"linear-gradient(135deg,"+P.ember+"08 0%,"+P.ember+"03 50%, transparent 100%)",border:"1px solid "+P.ember+"25",borderLeft:"4px solid "+P.ember,borderRadius:"0 16px 16px 0"}}>
                  <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:22}}>{Ic.crown(P.ember,22)}<div><div style={{fontSize:18,fontWeight:900,color:P.ember,fontFamily:ff,letterSpacing:1}}>EXECUTIVE SUMMARY</div><div style={{fontSize:10,color:P.sub,fontFamily:fm,letterSpacing:2,marginTop:2}}>{df+" to "+dt+" \u00b7 "+fR(computed.totalSpend)+" spend \u00b7 "+sortedPlats.length+" platforms"}</div></div></div>
                  {subSec(P.cyan,Ic.eye(P.cyan,16),"Awareness",awarenessRead)}
                  {subSec(P.mint,Ic.bolt(P.mint,16),"Engagement",engagementRead)}
                  {subSec(P.rose,Ic.target(P.rose,16),"Objectives",objectiveRead)}
                  {subSec(P.solar,Ic.radar(P.solar,16),"Targeting",targetingRead)}
                  {subSec(P.tt,Ic.users(P.tt,16),"Community Growth",communityRead)}
                </div>;
              })()}

              {/* ═══ 8. COMBINED SUMMARY INSIGHTS ═══ */}
              {(function(){
                var parts=[];
                var freqTag=m.frequency>4?"fatigue risk":m.frequency>3?"pressure building":m.frequency>2?"optimal recall":"early build";
                var cpmTag=computed.blendedCpm<=benchmarks.meta.cpm.low?"well below":computed.blendedCpm<=benchmarks.meta.cpm.mid?"within":computed.blendedCpm<=benchmarks.meta.cpm.high?"upper range of":"above";
                var cpcTag=blCpc<=benchmarks.meta.cpc.low?"well below":blCpc<=benchmarks.meta.cpc.mid?"within":blCpc<=benchmarks.meta.cpc.high?"upper range of":"above";
                parts.push(fR(computed.totalSpend)+" deployed across "+sortedPlats.length+" platforms over "+elapsedDays+" of "+totalDays2+" days at "+fR(dailySpend)+"/day (projecting "+fR(projSpend)+").");
                parts.push("Reach and engagement are tracking "+cpmTag+" SA benchmark on CPM ("+fR(computed.blendedCpm)+") and "+cpcTag+" benchmark on CPC ("+fR(blCpc)+"), with frequency in "+freqTag+" territory.");
                var activeO=objKeys.filter(function(k){return objectives4[k]&&objectives4[k].results>0;});
                if(activeO.length>0){var topO=activeO.slice().sort(function(a,b){return objectives4[b].results-objectives4[a].results;})[0];var tot=0;activeO.forEach(function(k){tot+=objectives4[k].results;});parts.push("Objective delivery: "+fmt(tot)+" total results across "+activeO.length+" objectives, with "+topO+" leading on volume.");}
                if(bestCpmPlat&&worstCpmPlat&&bestCpmPlat!==worstCpmPlat)parts.push(bestCpmPlat+" is the most cost-efficient channel for reach, "+worstCpmPlat+" the least.");
                if(grandT2>0)parts.push("Community stands at "+fmt(grandT2)+(earnedTotal>0?" with +"+fmt(earnedTotal)+" earned this period":"")+".");
                parts.push("Next moves: scale winning ad sets, pause underperformers, refresh creative ahead of frequency pressure, and rebalance spend towards the highest-efficiency platform.");
                var text=parts.join(" ");
                if(text.length>1000)text=text.substring(0,997)+"...";
                return <div style={{marginTop:20,padding:"24px 28px",background:"linear-gradient(135deg,"+P.orchid+"10 0%,"+P.ember+"06 50%, transparent 100%)",border:"1px solid "+P.orchid+"25",borderLeft:"4px solid "+P.orchid,borderRadius:"0 16px 16px 0"}}>
                  <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>{Ic.bolt(P.orchid,20)}<div><div style={{fontSize:15,fontWeight:900,color:P.orchid,fontFamily:ff,letterSpacing:1}}>COMBINED SUMMARY INSIGHTS</div><div style={{fontSize:10,color:P.sub,fontFamily:fm,letterSpacing:2,marginTop:2}}>{text.length+" / 1000 chars"}</div></div></div>
                  <div style={{fontSize:13,color:P.txt,lineHeight:1.9,fontFamily:ff,letterSpacing:0.2}}>{text}</div>
                </div>;
              })()}

            </div>;
          })()}
        </div>)}

        {tab==="creative"&&(<div>
          <SH icon={Ic.fire(P.blaze,20)} title="Creative Performance" sub={df+" to "+dt+" \u00b7 Ad-level intelligence with thumbnails and live previews"} accent={P.blaze}/>
          {(function(){
            var selCamps=campaigns.filter(function(x){return selected.indexOf(x.campaignId)>=0;});
            if(selCamps.length===0)return <div style={{padding:30,textAlign:"center",color:P.dim,fontFamily:fm}}>Select campaigns on the left to view ad-level creative performance.</div>;
            var selCampIds={};
            selCamps.forEach(function(c){
              selCampIds[String(c.rawCampaignId||"")]=true;
              selCampIds[String(c.campaignId||"").replace(/_facebook$/,"").replace(/_instagram$/,"")]=true;
              selCampIds[String(c.campaignId||"")]=true;
            });
            var selCampNames={};
            selCamps.forEach(function(c){if(c.campaignName)selCampNames[c.campaignName]=true;});

            var filteredAds=adsList.filter(function(a){
              if(selCampIds[String(a.campaignId||"")])return true;
              if(selCampNames[a.campaignName])return true;
              return false;
            });

            if(filteredAds.length===0)return <div style={{padding:30,textAlign:"center",color:P.dim,fontFamily:fm,lineHeight:1.8}}><div style={{fontSize:14,color:P.sub,marginBottom:8}}>No ad-level creative data for the selected campaigns.</div><div style={{fontSize:11}}>Data is still loading, try refreshing, or the selected campaigns may not have ad-level insights available yet.</div></div>;

            var platCol5={"Facebook":P.fb,"Instagram":P.ig,"TikTok":P.tt,"Google Display":P.gd,"YouTube":P.lava};
            var platShort2={"Facebook":"FB","Instagram":"IG","TikTok":"TT","Google Display":"GD","YouTube":"YT"};
            var platBench={"Facebook":benchmarks.meta,"Instagram":benchmarks.meta,"TikTok":benchmarks.tiktok,"Google Display":benchmarks.google,"YouTube":benchmarks.google};
            var platforms5={};
            filteredAds.forEach(function(a){if(!platforms5[a.platform])platforms5[a.platform]=[];platforms5[a.platform].push(a);});

            var scoreAd=function(a){
              var bm=platBench[a.platform]||benchmarks.meta;
              var ctrS=a.ctr>=2.0?4:a.ctr>=1.2?3:a.ctr>=0.8?2:1;
              var cpcS=bm.cpc&&a.cpc>0?(a.cpc<=bm.cpc.low?4:a.cpc<=bm.cpc.mid?3:a.cpc<=bm.cpc.high?2:1):2;
              var volS=a.impressions>=50000?3:a.impressions>=10000?2:1;
              return ctrS*0.4+cpcS*0.4+volS*0.2;
            };
            var gradeFor=function(s){return s>=3.5?{label:"A",color:P.mint,word:"Excellent"}:s>=2.8?{label:"B",color:P.positive,word:"Good"}:s>=2.0?{label:"C",color:P.solar,word:"Average"}:{label:"D",color:P.rose,word:"Review"};};

            var platformOrder=["Facebook","Instagram","TikTok","Google Display","YouTube"];
            var grandSpend=0,grandImps=0,grandClicks=0;
            filteredAds.forEach(function(a){grandSpend+=a.spend;grandImps+=a.impressions;grandClicks+=a.clicks;});

            return <div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:24}}>
                <Glass accent={P.blaze} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>ADS ANALYSED</div><div style={{fontSize:24,fontWeight:900,color:P.blaze,fontFamily:fm}}>{filteredAds.length}</div></Glass>
                <Glass accent={P.ember} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>TOTAL SPEND</div><div style={{fontSize:24,fontWeight:900,color:P.ember,fontFamily:fm}}>{fR(grandSpend)}</div></Glass>
                <Glass accent={P.cyan} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>IMPRESSIONS</div><div style={{fontSize:24,fontWeight:900,color:P.cyan,fontFamily:fm}}>{fmt(grandImps)}</div></Glass>
                <Glass accent={P.mint} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>BLENDED CTR</div><div style={{fontSize:24,fontWeight:900,color:P.mint,fontFamily:fm}}>{grandImps>0?(grandClicks/grandImps*100).toFixed(2)+"%":"-"}</div></Glass>
              </div>

              {platformOrder.filter(function(p){return platforms5[p]&&platforms5[p].length>0;}).map(function(pl){
                var platC=platCol5[pl]||P.ember;
                var pads=platforms5[pl].map(function(a){return Object.assign({},a,{_score:scoreAd(a)});}).sort(function(a,b){return b._score-a._score;});
                var pSpend=0,pImps=0,pClicks=0;
                pads.forEach(function(a){pSpend+=a.spend;pImps+=a.impressions;pClicks+=a.clicks;});
                var pCtr=pImps>0?(pClicks/pImps*100):0;
                var pCpc=pClicks>0?pSpend/pClicks:0;
                var aCount=pads.filter(function(x){return x._score>=3.5;}).length;
                var bCount=pads.filter(function(x){return x._score>=2.8&&x._score<3.5;}).length;
                var cCount=pads.filter(function(x){return x._score>=2.0&&x._score<2.8;}).length;
                var dCount=pads.filter(function(x){return x._score<2.0;}).length;
                var topAd=pads[0];
                var worstAd=pads[pads.length-1];

                return <div key={pl} style={{marginBottom:32,background:P.glass,borderRadius:18,padding:"6px 28px 28px",border:"1px solid "+P.rule}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"18px 0 18px",borderBottom:"1px solid "+P.rule,marginBottom:22}}>
                    <div style={{display:"flex",alignItems:"center",gap:14}}>
                      <div style={{width:44,height:44,borderRadius:12,background:"linear-gradient(135deg,"+platC+"25,"+platC+"08)",border:"1px solid "+platC+"40",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:900,color:platC,fontFamily:fm,letterSpacing:1}}>{platShort2[pl]||pl}</div>
                      <div><div style={{fontSize:19,fontWeight:900,color:platC,fontFamily:ff,letterSpacing:1}}>{pl}</div><div style={{fontSize:11,color:P.sub,fontFamily:fm,marginTop:3}}>{pads.length+" ads, "+fR(pSpend)+" spent, "+fmt(pImps)+" impressions, "+pCtr.toFixed(2)+"% CTR, "+fR(pCpc)+" CPC"}</div></div>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      {aCount>0&&<span style={{background:P.mint,color:"#fff",fontSize:10,fontWeight:900,padding:"5px 10px",borderRadius:6,fontFamily:fm}}>{"A\u00d7"+aCount}</span>}
                      {bCount>0&&<span style={{background:P.positive,color:"#fff",fontSize:10,fontWeight:900,padding:"5px 10px",borderRadius:6,fontFamily:fm}}>{"B\u00d7"+bCount}</span>}
                      {cCount>0&&<span style={{background:P.solar,color:"#fff",fontSize:10,fontWeight:900,padding:"5px 10px",borderRadius:6,fontFamily:fm}}>{"C\u00d7"+cCount}</span>}
                      {dCount>0&&<span style={{background:P.rose,color:"#fff",fontSize:10,fontWeight:900,padding:"5px 10px",borderRadius:6,fontFamily:fm}}>{"D\u00d7"+dCount}</span>}
                    </div>
                  </div>

                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:18,marginBottom:22}}>
                    {pads.map(function(ad,ai){
                      var g=gradeFor(ad._score);
                      return <div key={ai} style={{background:"rgba(0,0,0,0.35)",borderRadius:14,border:"1px solid "+P.rule,overflow:"hidden",transition:"all 0.2s ease",display:"flex",flexDirection:"column"}}>
                        <div style={{position:"relative",width:"100%",paddingTop:"100%",background:"#1a0f2a",overflow:"hidden"}}>
                          {ad.thumbnail?<a href={ad.previewUrl||ad.thumbnail} target="_blank" rel="noopener noreferrer" style={{position:"absolute",inset:0,display:"block"}}><img src={ad.thumbnail} alt={ad.adName||"Ad"} style={{width:"100%",height:"100%",objectFit:"cover",cursor:"pointer"}} onError={function(e){e.target.parentElement.innerHTML='<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:'+P.dim+';font-size:11px;font-family:'+fm+'">Preview unavailable</div>';}}/></a>:<div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",color:P.dim,fontSize:11,fontFamily:fm}}>No preview available</div>}
                          <div style={{position:"absolute",top:10,left:10,background:g.color,color:"#fff",padding:"5px 11px",borderRadius:6,fontSize:13,fontWeight:900,fontFamily:fm,letterSpacing:1,boxShadow:"0 2px 8px rgba(0,0,0,0.4)"}}>{g.label}</div>
                          <div style={{position:"absolute",top:10,right:10,background:platC,color:"#fff",padding:"4px 10px",borderRadius:6,fontSize:9,fontWeight:800,fontFamily:fm,letterSpacing:1,boxShadow:"0 2px 8px rgba(0,0,0,0.4)"}}>{platShort2[pl]||pl}</div>
                          <div style={{position:"absolute",bottom:10,left:10,background:"rgba(0,0,0,0.8)",color:"#fff",padding:"3px 9px",borderRadius:4,fontSize:9,fontWeight:700,fontFamily:fm,letterSpacing:1}}>{ad.format||"AD"}</div>
                        </div>
                        <div style={{padding:"14px 16px",flex:1,display:"flex",flexDirection:"column"}}>
                          <div style={{fontSize:10,color:P.sub,fontFamily:fm,marginBottom:4,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={ad.campaignName}>{ad.campaignName}</div>
                          <div style={{fontSize:12,fontWeight:700,color:P.txt,fontFamily:ff,marginBottom:12,lineHeight:1.4,minHeight:34,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}} title={ad.adName}>{ad.adName}</div>
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,fontSize:10,fontFamily:fm,marginBottom:12}}>
                            <div><div style={{color:P.sub,marginBottom:3,letterSpacing:1,fontSize:9}}>SPEND</div><div style={{color:P.txt,fontWeight:700,fontSize:12}}>{fR(ad.spend)}</div></div>
                            <div><div style={{color:P.sub,marginBottom:3,letterSpacing:1,fontSize:9}}>IMPS</div><div style={{color:P.txt,fontWeight:700,fontSize:12}}>{fmt(ad.impressions)}</div></div>
                            <div><div style={{color:P.sub,marginBottom:3,letterSpacing:1,fontSize:9}}>CTR</div><div style={{color:ad.ctr>=1.2?P.mint:ad.ctr>=0.8?P.txt:P.warning,fontWeight:700,fontSize:12}}>{ad.ctr.toFixed(2)+"%"}</div></div>
                            <div><div style={{color:P.sub,marginBottom:3,letterSpacing:1,fontSize:9}}>CPC</div><div style={{color:P.txt,fontWeight:700,fontSize:12}}>{fR(ad.cpc)}</div></div>
                          </div>
                          {ad.previewUrl?<a href={ad.previewUrl} target="_blank" rel="noopener noreferrer" style={{display:"block",marginTop:"auto",padding:"9px 12px",background:platC+"18",border:"1px solid "+platC+"40",borderRadius:8,color:platC,fontSize:10,fontWeight:800,fontFamily:fm,textAlign:"center",textDecoration:"none",letterSpacing:1.5}}>VIEW AD \u2192</a>:<div style={{marginTop:"auto",padding:"9px 12px",background:"rgba(255,255,255,0.04)",border:"1px solid "+P.rule,borderRadius:8,color:P.dim,fontSize:10,fontWeight:700,fontFamily:fm,textAlign:"center",letterSpacing:1.5}}>NO PREVIEW LINK</div>}
                        </div>
                      </div>;
                    })}
                  </div>

                  <Insight title={pl+" Creative Assessment"} accent={platC} icon={Ic.fire(platC,14)}>{(function(){
                    var lines=[];
                    lines.push(pads.length+" "+pl+" ads analysed with "+fR(pSpend)+" combined spend, "+fmt(pImps)+" impressions and "+pCtr.toFixed(2)+"% blended CTR.");
                    lines.push("Grade distribution: "+aCount+" A-grade (excellent), "+bCount+" B-grade (good), "+cCount+" C-grade (average), "+dCount+" D-grade (review).");
                    if(topAd)lines.push("Top performer: \""+(topAd.adName||"Unnamed").substring(0,60)+"\" ("+fR(topAd.spend)+" spent, "+topAd.ctr.toFixed(2)+"% CTR, "+fR(topAd.cpc)+" CPC).");
                    if(dCount>0&&worstAd&&worstAd!==topAd)lines.push("Weakest: \""+(worstAd.adName||"Unnamed").substring(0,60)+"\" at "+worstAd.ctr.toFixed(2)+"% CTR, "+fR(worstAd.cpc)+" CPC, "+fR(worstAd.spend)+" already spent.");
                    if(aCount>0)lines.push("Scale winning A-grade creatives by increasing adset budgets 15 to 25%.");
                    if(dCount>0)lines.push("Pause D-grade ads below 0.8% CTR and reallocate to proven performers.");
                    return lines.join(" ");
                  })()}</Insight>
                </div>;
              })}
            </div>;
          })()}
        </div>)}

        {tab==="overview"&&(<div>

          <SH icon={Ic.chart(P.orchid,20)} title="Campaign Overview" sub={df+" to "+dt+" · "+selected.length+" campaigns · Funnel Performance Report"} accent={P.orchid}/>

          {/* ═══ AWARENESS KEY METRICS ═══ */}
          <div style={{background:P.glass,borderRadius:18,padding:"6px 24px 24px",marginBottom:28,border:"1px solid "+P.rule}}>
            <div style={{textAlign:"center",padding:"18px 0 16px"}}><span style={{fontSize:18,fontWeight:900,color:"#fff",fontFamily:ff,letterSpacing:1}}>AWARENESS KEY METRICS</span><div style={{fontSize:10,color:"rgba(255,255,255,0.5)",fontFamily:fm,marginTop:4,letterSpacing:3}}>TOP OF FUNNEL</div></div>

            <table style={{width:"100%",borderCollapse:"collapse",marginBottom:16}}>
              <thead><tr>{["Platform","Media Spend","Impressions","Reach","CPM","Frequency"].map(function(h,i){return <th key={i} style={{padding:"10px 12px",fontSize:10,fontWeight:800,textTransform:"uppercase",color:"#F96203",letterSpacing:1.5,textAlign:i===0?"left":"center",background:"rgba(249,98,3,0.15)",border:"1px solid rgba(249,98,3,0.3)",backdropFilter:"blur(8px)",fontFamily:fm,letterSpacing:1}}>{h}</th>;})}</tr></thead>
              <tbody>
                <tr style={{background:"rgba(69,153,255,0.08)"}}><td style={{padding:"12px",border:"1px solid "+P.rule,display:"flex",alignItems:"center",gap:8}}><span style={{width:10,height:10,borderRadius:"50%",background:P.fb}}></span><span style={{fontSize:12,fontWeight:700,color:P.txt}}>Facebook</span></td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:"#fff",fontFamily:fm,fontSize:13,fontWeight:700}}>{fR(computed.fb.spend)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:"#fff",fontFamily:fm,fontSize:13}}>{fmt(computed.fb.impressions)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:"#fff",fontFamily:fm,fontSize:13}}>{fmt(computed.fb.reach)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:computed.fb.cpm<15?P.mint:P.warning,fontFamily:fm,fontSize:13,fontWeight:700}}>{fR(computed.fb.cpm)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:computed.fb.frequency>3?P.warning:"#fff",fontFamily:fm,fontSize:13,fontWeight:700}}>{computed.fb.frequency>0?computed.fb.frequency.toFixed(2)+"x":"-"}</td></tr>
                <tr style={{background:"rgba(225,48,108,0.08)"}}><td style={{padding:"12px",border:"1px solid "+P.rule,display:"flex",alignItems:"center",gap:8}}><span style={{width:10,height:10,borderRadius:"50%",background:P.ig}}></span><span style={{fontSize:12,fontWeight:700,color:P.txt}}>Instagram</span></td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:"#fff",fontFamily:fm,fontSize:13,fontWeight:700}}>{fR(computed.ig.spend)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:"#fff",fontFamily:fm,fontSize:13}}>{fmt(computed.ig.impressions)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:"#fff",fontFamily:fm,fontSize:13}}>{fmt(computed.ig.reach)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:computed.ig.cpm<15?P.mint:P.warning,fontFamily:fm,fontSize:13,fontWeight:700}}>{fR(computed.ig.cpm)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:computed.ig.frequency>3?P.warning:"#fff",fontFamily:fm,fontSize:13,fontWeight:700}}>{computed.ig.frequency>0?computed.ig.frequency.toFixed(2)+"x":"-"}</td></tr>
                <tr style={{background:"rgba(69,153,255,0.15)"}}><td style={{padding:"12px",border:"1px solid "+P.rule}}><span style={{fontSize:12,fontWeight:900,color:P.fb}}>Meta Total</span></td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.fb,fontFamily:fm,fontSize:14,fontWeight:900}}>{fR(m.spend)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.fb,fontFamily:fm,fontSize:14,fontWeight:900}}>{fmt(m.impressions)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.fb,fontFamily:fm,fontSize:14,fontWeight:900}}>{fmt(m.reach)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.fb,fontFamily:fm,fontSize:14,fontWeight:900}}>{fR(m.cpm)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.fb,fontFamily:fm,fontSize:14,fontWeight:900}}>{m.frequency>0?m.frequency.toFixed(2)+"x":"-"}</td></tr>
                <tr style={{background:"rgba(0,242,234,0.08)"}}><td style={{padding:"12px",border:"1px solid "+P.rule,display:"flex",alignItems:"center",gap:8}}><span style={{width:10,height:10,borderRadius:"50%",background:P.tt}}></span><span style={{fontSize:12,fontWeight:700,color:P.txt}}>TikTok</span></td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:"#fff",fontFamily:fm,fontSize:13,fontWeight:700}}>{fR(t.spend)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:"#fff",fontFamily:fm,fontSize:13}}>{fmt(t.impressions)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:"#fff",fontFamily:fm,fontSize:13}}>{fmt(t.reach)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:t.cpm<15?P.mint:P.warning,fontFamily:fm,fontSize:13,fontWeight:700}}>{fR(t.cpm)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:"#fff",fontFamily:fm,fontSize:13,fontWeight:700}}>{t.frequency>0?t.frequency.toFixed(2)+"x":"-"}</td></tr>
                <tr style={{background:"rgba(52,168,83,0.08)"}}><td style={{padding:"12px",border:"1px solid "+P.rule,display:"flex",alignItems:"center",gap:8}}><span style={{width:10,height:10,borderRadius:"50%",background:P.gd}}></span><span style={{fontSize:12,fontWeight:700,color:P.txt}}>Google Display</span></td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{fR(computed.gd.spend)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13}}>{fmt(computed.gd.impressions)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.dim,fontFamily:fm,fontSize:13}}>-</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:computed.gd.cpm<15?P.mint:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{fR(computed.gd.cpm)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.dim,fontFamily:fm,fontSize:13}}>-</td></tr>
                <tr style={{background:"rgba(255,107,0,0.15)"}}><td style={{padding:"12px",border:"1px solid "+P.rule}}><span style={{fontSize:13,fontWeight:900,color:"#FFCB05"}}>GRAND TOTAL</span></td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:"#FFCB05",fontFamily:fm,fontSize:15,fontWeight:900}}>{fR(computed.totalSpend)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:"#FFCB05",fontFamily:fm,fontSize:15,fontWeight:900}}>{fmt(computed.totalImps)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:"#FFCB05",fontFamily:fm,fontSize:15,fontWeight:900}}>{fmt(m.reach+t.reach+computed.gd.reach)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:"#FFCB05",fontFamily:fm,fontSize:15,fontWeight:900}}>{fR(computed.blendedCpm)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:"#FFCB05",fontFamily:fm,fontSize:15,fontWeight:900}}>{(m.reach+t.reach)>0?((m.impressions+t.impressions+computed.gd.impressions)/(m.reach+t.reach)).toFixed(2)+"x":"-"}</td></tr>
              </tbody>
            </table>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
              <div style={{background:"rgba(0,0,0,0.2)",borderRadius:12,padding:20}}><div style={{fontSize:10,fontWeight:800,color:"rgba(255,255,255,0.5)",letterSpacing:3,fontFamily:fm,textTransform:"uppercase",marginBottom:14}}>Impressions & Reach by Platform</div><ResponsiveContainer width="100%" height={200}><BarChart data={[{name:"Facebook",Impressions:computed.fb.impressions,Reach:computed.fb.reach},{name:"Instagram",Impressions:computed.ig.impressions,Reach:computed.ig.reach},{name:"TikTok",Impressions:t.impressions,Reach:t.reach},{name:"Google",Impressions:computed.gd.impressions,Reach:0}]} barSize={20}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)"/><XAxis dataKey="name" tick={{fontSize:11,fill:"rgba(255,255,255,0.85)",fontFamily:fm}} stroke="transparent"/><YAxis tick={{fontSize:10,fill:"rgba(255,255,255,0.65)",fontFamily:fm}} stroke="transparent" tickFormatter={function(v){return fmt(v);}}/><Tooltip content={<Tip/>} wrapperStyle={{outline:"none"}} cursor={{fill:"rgba(255,255,255,0.05)"}}/><Bar dataKey="Impressions" fill={P.cyan} radius={[6,6,0,0]}/><Bar dataKey="Reach" fill={P.orchid} radius={[6,6,0,0]}/></BarChart></ResponsiveContainer><div style={{display:"flex",justifyContent:"center",gap:16,marginTop:8}}><div style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:8,height:8,borderRadius:2,background:P.cyan}}></span><span style={{fontSize:10,color:"rgba(255,255,255,0.7)",fontFamily:fm}}>Impressions</span></div><div style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:8,height:8,borderRadius:2,background:P.orchid}}></span><span style={{fontSize:10,color:"rgba(255,255,255,0.7)",fontFamily:fm}}>Reach</span></div></div></div>
              <div style={{background:"rgba(0,0,0,0.2)",borderRadius:12,padding:20}}><div style={{fontSize:10,fontWeight:800,color:"rgba(255,255,255,0.5)",letterSpacing:3,fontFamily:fm,textTransform:"uppercase",marginBottom:14}}>Spend Allocation</div><ResponsiveContainer width="100%" height={200}><PieChart><Pie data={[{name:"Facebook",value:computed.fb.spend},{name:"Instagram",value:computed.ig.spend},{name:"TikTok",value:t.spend},{name:"Google",value:computed.gd.spend}].filter(function(x){return x.value>0;})} cx="50%" cy="50%" outerRadius={65} innerRadius={40} paddingAngle={4} dataKey="value" stroke="none" label={function(entry){var total=computed.totalSpend;var pct=total>0?(entry.value/total*100).toFixed(0):0;return pct>0?pct+"%":"";}} labelStyle={{fontSize:7,fontFamily:fm,fill:"rgba(255,255,255,0.9)"}}><Cell fill={P.fb}/><Cell fill={P.ig}/><Cell fill={P.tt}/><Cell fill={P.gd}/></Pie><Tooltip content={<Tip/>} wrapperStyle={{outline:"none"}} cursor={{fill:"rgba(255,255,255,0.05)"}}/></PieChart></ResponsiveContainer><div style={{display:"flex",justifyContent:"center",gap:12,marginTop:8}}>{(function(){var total=computed.totalSpend;return [{n:"FB",v:computed.fb.spend,c:P.fb},{n:"IG",v:computed.ig.spend,c:P.ig},{n:"TT",v:t.spend,c:P.tt},{n:"GD",v:computed.gd.spend,c:P.gd}].map(function(p){var pct=total>0?(p.v/total*100).toFixed(1):"0.0";return <div key={p.n} style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:8,height:8,borderRadius:"50%",background:p.c}}></span><span style={{fontSize:10,color:"rgba(255,255,255,0.7)",fontFamily:fm}}>{p.n} {fR(p.v)} ({pct}%)</span></div>;});})()}</div></div>
            </div>

            <Insight title="Awareness Key Metrics" accent={P.cyan} icon={Ic.eye(P.cyan,16)}>{(function(){var parts=[];var totalReach=computed.fb.reach+computed.ig.reach+t.reach+computed.gd.reach;var metaShare=computed.totalImps>0?((m.impressions/computed.totalImps)*100).toFixed(1):"0";var ttShare=computed.totalImps>0?(computed.totalImps>0?(t.impressions/computed.totalImps*100).toFixed(1):"0"):"0";parts.push("Across the selected campaign period, "+fmt(computed.totalImps)+" Total Ads Served were delivered against "+fR(computed.totalSpend)+" media investment, achieving a blended Cost Per Thousand Ads Served of "+fR(computed.blendedCpm)+". "+(computed.blendedCpm<12?"This is well below the R12 to R25 paid social CPM benchmark range, confirming exceptional media value.":computed.blendedCpm<18?"This sits within the efficient range of R12 to R25 for the paid social market.":"This is at the upper end of the R12 to R25 paid social CPM range, reflecting the platform mix and audience targeting precision.")+"");if(computed.fb.impressions>0){parts.push("Facebook accounts for "+(computed.totalImps>0?(computed.fb.impressions/computed.totalImps*100).toFixed(1):"0")+"% of Total Ads Served volume ("+fmt(computed.fb.impressions)+"), reaching "+fmt(computed.fb.reach)+" unique individuals at a frequency of "+computed.fb.frequency.toFixed(2)+"x. "+(computed.fb.frequency<2?"The sub-2x frequency indicates the campaign is in its early awareness phase with significant headroom to increase reach depth before encountering diminishing returns.":computed.fb.frequency<3?"Frequency at "+computed.fb.frequency.toFixed(2)+"x sits within the optimal recall-building window of 2-3x, where brand message retention is highest without triggering ad fatigue.":"Frequency at "+computed.fb.frequency.toFixed(2)+"x indicates the campaign has established strong recall-building repetition within the target audience.")+" Facebook CPM at "+fR(computed.fb.cpm)+" reflects the platform\'s premium inventory value, which includes superior audience segmentation, cross-device attribution, and conversion measurement capabilities.");}if(computed.ig.impressions>0){parts.push("Instagram contributes "+(computed.totalImps>0?(computed.ig.impressions/computed.totalImps*100).toFixed(1):"0")+"% of Total Ads Served ("+fmt(computed.ig.impressions)+") reaching "+fmt(computed.ig.reach)+" unique users at "+fR(computed.ig.cpm)+" Cost Per Thousand Ads Served."+(computed.ig.cpm<computed.fb.cpm&&computed.fb.cpm>0&&((1-computed.ig.cpm/computed.fb.cpm)*100)>5?" Instagram\'s "+((1-computed.ig.cpm/computed.fb.cpm)*100).toFixed(0)+"% CPM advantage over Facebook makes it the more capital-efficient Meta placement for awareness delivery, driven by higher engagement rates in Stories and Reels placements that reduce effective cost per quality impression.":""));}if(t.impressions>0){var ttCpmNote="";if(t.cpm>0&&computed.fb.cpm>0){if(t.cpm<computed.fb.cpm*0.9){ttCpmNote=" TikTok delivers a "+(((computed.fb.cpm-t.cpm)/computed.fb.cpm)*100).toFixed(0)+"% Cost Per Thousand Ads Served advantage over Facebook, confirming strong content relevance scores and favourable auction positioning.";}else if(t.cpm>computed.fb.cpm*1.1){ttCpmNote=" TikTok Cost Per Thousand Ads Served at "+fR(t.cpm)+" is "+(((t.cpm-computed.fb.cpm)/computed.fb.cpm)*100).toFixed(0)+"% higher than Facebook, reflecting premium video inventory and higher engagement depth per impression.";}else{ttCpmNote=" TikTok and Facebook deliver comparable Cost Per Thousand Ads Served at "+fR(t.cpm)+" and "+fR(computed.fb.cpm)+" respectively.";}}parts.push("TikTok delivers "+ttShare+"% of all campaign Total Ads Served ("+fmt(t.impressions)+") at "+fR(t.cpm)+" Cost Per Thousand Ads Served"+(t.reach>0?", reaching "+fmt(t.reach)+" users":"")+"."+ttCpmNote);}if(computed.gd.clicks>0){parts.push("Google Display generated "+fmt(computed.gd.clicks)+" clicks at "+fR(computed.gd.cpc)+" Cost Per Click with "+pc(computed.gd.ctr)+" Click Through Rate, extending campaign reach across Google's display network and partner sites.");}if(t.clicks>0){parts.push("TikTok contributed "+fmt(t.clicks)+" clicks"+(t.cpc>0?" at "+fR(t.cpc)+" Cost Per Click":"")+(t.ctr>0?" with "+pc(t.ctr)+" Click Through Rate":"")+". Beyond the direct click metrics, TikTok engagement carries multiplicative value: each interaction signals content quality to the recommendation algorithm, which can extend organic distribution to non-targeted users at zero marginal cost.");}if(computed.totalClicks===0){parts.push("No click engagement was recorded for the selected campaigns in this period. The campaigns are configured for awareness and reach objectives, building brand visibility across the target audience.");}return parts.join(" ");})()}</Insight>
          </div>

          {/* \u2550\u2550\u2550 ENGAGEMENT KEY METRICS \u2550\u2550\u2550 */}
          <div style={{background:P.glass,borderRadius:18,padding:"6px 24px 24px",marginBottom:28,border:"1px solid "+P.rule}}>
            <div style={{textAlign:"center",padding:"18px 0 16px"}}><span style={{fontSize:18,fontWeight:900,color:P.txt,fontFamily:ff,letterSpacing:1}}>ENGAGEMENT KEY METRICS</span><div style={{fontSize:10,color:P.sub,fontFamily:fm,marginTop:4,letterSpacing:3}}>MIDDLE OF FUNNEL</div></div>

            <table style={{width:"100%",borderCollapse:"collapse",marginBottom:16}}>
              <thead><tr>{["Platform","Media Spend","Impressions","Reach","Clicks","CTR %","CPC"].map(function(h,i){return <th key={i} style={{padding:"10px 12px",fontSize:10,fontWeight:800,textTransform:"uppercase",color:"#F96203",letterSpacing:1.5,textAlign:i===0?"left":"center",background:"rgba(249,98,3,0.15)",border:"1px solid rgba(249,98,3,0.3)",backdropFilter:"blur(8px)",fontFamily:fm,letterSpacing:1}}>{h}</th>;})}</tr></thead>
              <tbody>
                <tr style={{background:"rgba(69,153,255,0.06)"}}><td style={{padding:"12px",border:"1px solid "+P.rule,display:"flex",alignItems:"center",gap:8}}><span style={{width:10,height:10,borderRadius:"50%",background:P.fb}}></span><span style={{fontSize:12,fontWeight:700,color:P.txt}}>Facebook</span></td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{fR(computed.fb.spend)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13}}>{fmt(computed.fb.impressions)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13}}>{fmt(computed.fb.reach)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{fmt(computed.fb.clicks)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:computed.fb.ctr>2?P.mint:computed.fb.ctr>1?P.txt:P.warning,fontFamily:fm,fontSize:13,fontWeight:700}}>{pc(computed.fb.ctr)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:computed.fb.cpc<2?P.mint:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{fR(computed.fb.cpc)}</td></tr>
                <tr style={{background:"rgba(225,48,108,0.06)"}}><td style={{padding:"12px",border:"1px solid "+P.rule,display:"flex",alignItems:"center",gap:8}}><span style={{width:10,height:10,borderRadius:"50%",background:P.ig}}></span><span style={{fontSize:12,fontWeight:700,color:P.txt}}>Instagram</span></td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{fR(computed.ig.spend)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13}}>{fmt(computed.ig.impressions)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13}}>{fmt(computed.ig.reach)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{fmt(computed.ig.clicks)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:computed.ig.ctr>2?P.mint:computed.ig.ctr>1?P.txt:P.warning,fontFamily:fm,fontSize:13,fontWeight:700}}>{pc(computed.ig.ctr)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:computed.ig.cpc<2?P.mint:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{fR(computed.ig.cpc)}</td></tr>
                <tr style={{background:"rgba(69,153,255,0.12)"}}><td style={{padding:"12px",border:"1px solid "+P.rule}}><span style={{fontSize:12,fontWeight:900,color:P.fb}}>Meta Total</span></td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.fb,fontFamily:fm,fontSize:14,fontWeight:900}}>{fR(m.spend)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.fb,fontFamily:fm,fontSize:14,fontWeight:900}}>{fmt(m.impressions)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.fb,fontFamily:fm,fontSize:14,fontWeight:900}}>{fmt(m.reach)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.fb,fontFamily:fm,fontSize:14,fontWeight:900}}>{fmt(m.clicks)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.fb,fontFamily:fm,fontSize:14,fontWeight:900}}>{pc(m.ctr)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.fb,fontFamily:fm,fontSize:14,fontWeight:900}}>{fR(m.cpc)}</td></tr>
                <tr style={{background:"rgba(0,242,234,0.06)"}}><td style={{padding:"12px",border:"1px solid "+P.rule,display:"flex",alignItems:"center",gap:8}}><span style={{width:10,height:10,borderRadius:"50%",background:P.tt}}></span><span style={{fontSize:12,fontWeight:700,color:P.txt}}>TikTok</span></td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{fR(t.spend)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13}}>{fmt(t.impressions)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13}}>{fmt(t.reach)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{fmt(t.clicks)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:t.ctr>2?P.mint:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{pc(t.ctr)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:t.cpc<2?P.mint:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{fR(t.cpc)}</td></tr>
                
                <tr style={{background:"rgba(52,168,83,0.06)"}}><td style={{padding:"12px",border:"1px solid "+P.rule,display:"flex",alignItems:"center",gap:8}}><span style={{width:10,height:10,borderRadius:"50%",background:P.gd}}></span><span style={{fontSize:12,fontWeight:700,color:P.txt}}>Google Display</span></td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{fR(computed.gd.spend)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13}}>{fmt(computed.gd.impressions)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.dim,fontFamily:fm,fontSize:13}}>-</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{fmt(computed.gd.clicks)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:computed.gd.ctr>2?P.mint:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{pc(computed.gd.ctr)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:computed.gd.cpc<2?P.mint:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{fR(computed.gd.cpc)}</td></tr>
                <tr style={{background:"rgba(255,107,0,0.12)"}}><td style={{padding:"12px",border:"1px solid "+P.rule}}><span style={{fontSize:13,fontWeight:900,color:P.ember}}>GRAND TOTAL</span></td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.ember,fontFamily:fm,fontSize:15,fontWeight:900}}>{fR(computed.totalSpend)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.ember,fontFamily:fm,fontSize:15,fontWeight:900}}>{fmt(computed.totalImps)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.ember,fontFamily:fm,fontSize:15,fontWeight:900}}>{fmt(m.reach+t.reach+computed.gd.reach)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.ember,fontFamily:fm,fontSize:15,fontWeight:900}}>{fmt(computed.totalClicks)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.ember,fontFamily:fm,fontSize:15,fontWeight:900}}>{pc(computed.totalImps>0?(computed.totalClicks/computed.totalImps)*100:0)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.ember,fontFamily:fm,fontSize:15,fontWeight:900}}>{fR(computed.totalClicks>0?computed.totalSpend/computed.totalClicks:0)}</td></tr>
              </tbody>
            </table>

            <div style={{background:"rgba(0,0,0,0.15)",borderRadius:12,padding:20,marginBottom:16}}><div style={{fontSize:10,fontWeight:800,color:P.sub,letterSpacing:3,fontFamily:fm,textTransform:"uppercase",marginBottom:14}}>Clicks, CPC & CTR by Platform</div><ResponsiveContainer width="100%" height={220}><ComposedChart data={[{name:"Facebook",Clicks:computed.fb.clicks,CPC:computed.fb.cpc,CTR:computed.fb.ctr},{name:"Instagram",Clicks:computed.ig.clicks,CPC:computed.ig.cpc,CTR:computed.ig.ctr},{name:"TikTok",Clicks:t.clicks,CPC:t.cpc,CTR:t.ctr},{name:"Google",Clicks:computed.gd.clicks,CPC:computed.gd.cpc,CTR:computed.gd.ctr}]}><CartesianGrid strokeDasharray="3 3" stroke={P.rule}/><XAxis dataKey="name" tick={{fontSize:11,fill:"rgba(255,255,255,0.85)",fontFamily:fm}} stroke="transparent"/><YAxis yAxisId="left" tick={{fontSize:10,fill:"rgba(255,255,255,0.6)",fontFamily:fm}} stroke="transparent" tickFormatter={function(v){return fmt(v);}}/><YAxis yAxisId="right" orientation="right" tick={{fontSize:10,fill:P.ember,fontFamily:fm}} stroke="transparent" tickFormatter={function(v){return v<20?v.toFixed(2)+"%":"R"+v.toFixed(2);}}/><Tooltip content={<Tip/>} wrapperStyle={{outline:"none"}} cursor={{fill:"rgba(255,255,255,0.05)"}}/><Bar yAxisId="left" dataKey="Clicks" fill={P.mint} radius={[6,6,0,0]} barSize={30}/><Line yAxisId="right" type="monotone" dataKey="CPC" stroke={P.ember} strokeWidth={2.5} dot={{r:5,fill:P.ember}} activeDot={{r:7}}/><Line yAxisId="right" type="monotone" dataKey="CTR" stroke={P.cyan} strokeWidth={2.5} dot={{r:5,fill:P.cyan}} activeDot={{r:7}} strokeDasharray="5 5"/></ComposedChart></ResponsiveContainer></div>

            
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:16}}>
              <Glass accent={P.fb} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>FACEBOOK CTR</div><div style={{fontSize:22,fontWeight:900,color:P.fb,fontFamily:fm}}>{pc(computed.fb.ctr)}</div><div style={{fontSize:9,color:"rgba(255,255,255,0.5)",fontFamily:fm,marginTop:4}}>{fmt(computed.fb.clicks)} clicks</div></Glass>
              <Glass accent={P.ig} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>INSTAGRAM CTR</div><div style={{fontSize:22,fontWeight:900,color:P.ig,fontFamily:fm}}>{pc(computed.ig.ctr)}</div><div style={{fontSize:9,color:"rgba(255,255,255,0.5)",fontFamily:fm,marginTop:4}}>{fmt(computed.ig.clicks)} clicks</div></Glass>
              <Glass accent={P.tt} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>TIKTOK CTR</div><div style={{fontSize:22,fontWeight:900,color:P.tt,fontFamily:fm}}>{pc(t.ctr)}</div><div style={{fontSize:9,color:"rgba(255,255,255,0.5)",fontFamily:fm,marginTop:4}}>{fmt(t.clicks)} clicks</div></Glass>
              <Glass accent={P.gd} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>GOOGLE CTR</div><div style={{fontSize:22,fontWeight:900,color:P.gd,fontFamily:fm}}>{pc(computed.gd.ctr)}</div><div style={{fontSize:9,color:"rgba(255,255,255,0.5)",fontFamily:fm,marginTop:4}}>{fmt(computed.gd.clicks)} clicks</div></Glass>
            </div>

            <Insight title="Engagement Key Metrics" accent={P.mint} icon={Ic.pulse(P.mint,16)}>{(function(){var parts=[];var blendedCpc=computed.totalClicks>0?computed.totalSpend/computed.totalClicks:0;var clickToImpRate=computed.totalImps>0?(computed.totalClicks/computed.totalImps*100):0;parts.push("The campaign generated "+fmt(computed.totalClicks)+" total click actions across all platforms, converting "+clickToImpRate.toFixed(2)+"% of "+fmt(computed.totalImps)+" impressions into measurable engagement signals. The cross-platform blended Cost Per Click of "+fR(blendedCpc)+" confirms efficient translation of awareness into intent.");if(computed.fb.clicks>0){var fbClickShare=computed.totalClicks>0?((computed.fb.clicks/computed.totalClicks)*100).toFixed(1):"0";parts.push("Facebook drives "+fbClickShare+"% of total click volume with "+fmt(computed.fb.clicks)+" clicks at "+fR(computed.fb.cpc)+" Cost Per Click and "+pc(computed.fb.ctr)+" Click Through Rate. "+(computed.fb.ctr>3?"The Click Through Rate exceeding 3% places this campaign in the top 10% of Facebook engagement benchmarks for the paid social market, indicating exceptional creative-audience resonance. The ad creative is not only stopping the scroll but compelling users to take deliberate action.":computed.fb.ctr>1.5?"CTR at "+pc(computed.fb.ctr)+" exceeds the 1.5% performance benchmark, confirming the creative messaging is effectively converting passive impressions into active engagement. The hook and value proposition are landing with the target audience.":"CTR at "+pc(computed.fb.ctr)+" reflects the current creative-audience engagement level for this campaign period."));}if(computed.ig.clicks>0){parts.push("Instagram delivered "+fmt(computed.ig.clicks)+" clicks at "+fR(computed.ig.cpc)+" Cost Per Click with "+pc(computed.ig.ctr)+" Click Through Rate."+(computed.ig.cpc<computed.fb.cpc&&computed.fb.cpc>0?" Instagram\'s "+((1-computed.ig.cpc/computed.fb.cpc)*100).toFixed(0)+"% CPC advantage over Facebook reflects the platform\'s stronger visual engagement environment, where users are predisposed to interact with compelling creative content.":"")+"");}if(computed.gd.clicks>0){parts.push("Google Display generated "+fmt(computed.gd.clicks)+" clicks at "+fR(computed.gd.cpc)+" Cost Per Click with "+pc(computed.gd.ctr)+" Click Through Rate, extending campaign reach across Google's display network and partner sites.");}if(t.clicks>0){parts.push("TikTok contributed "+fmt(t.clicks)+" clicks"+(t.cpc>0?" at "+fR(t.cpc)+" Cost Per Click":"")+(t.ctr>0?" with "+pc(t.ctr)+" Click Through Rate":"")+". Beyond the direct click metrics, TikTok engagement carries multiplicative value: each interaction signals content quality to the recommendation algorithm, which can extend organic distribution to non-targeted users at zero marginal cost.");}if(computed.totalClicks===0){parts.push("No click engagement was recorded for the selected campaigns in this period. The campaigns are configured for awareness and reach objectives, building brand visibility across the target audience.");}return parts.join(" ");})()}</Insight>
          </div>

          {/* OBJECTIVE KEY METRICS */}
          <div style={{background:P.glass,borderRadius:18,padding:"6px 24px 24px",marginBottom:28,border:"1px solid "+P.rule}}>
            <div style={{textAlign:"center",padding:"18px 0 16px"}}><span style={{fontSize:18,fontWeight:900,color:P.txt,fontFamily:ff,letterSpacing:1}}>OBJECTIVE KEY METRICS</span><div style={{fontSize:10,color:P.sub,fontFamily:fm,marginTop:4,letterSpacing:3}}>BOTTOM OF FUNNEL, CAMPAIGN KPIs</div></div>

            {(function(){
              var sel=campaigns.filter(function(x){return selected.indexOf(x.campaignId)>=0;});
              if(sel.length===0)return <div style={{padding:30,textAlign:"center",color:P.dim,fontFamily:fm}}>Select campaigns to view objective results.</div>;

              var getObj=function(name){
                var n=(name||"").toLowerCase();
                if(n.indexOf("appinstal")>=0||n.indexOf("app install")>=0)return "App Store Clicks";
                if(n.indexOf("follower")>=0)return "Followers & Likes";
                if(n.indexOf("page like")>=0||n.indexOf("pagelikes")>=0||n.indexOf("_like_")>=0||n.indexOf("_like ")>=0||n.indexOf("paidSocial_like")>=0||n.indexOf("paidsocial_like")>=0)return "Followers & Likes";
                if(n.indexOf("lead")>=0||n.indexOf("pos")>=0)return "Leads";
                if(n.indexOf("homeloan")>=0||n.indexOf("traffic")>=0||n.indexOf("paidsearch")>=0)return "Landing Page Clicks";
                return "Traffic";
              };

              var getResult=function(camp,obj){
                if(obj==="Leads")return parseFloat(camp.leads||0);
                if(obj==="Followers & Likes"){var fl=parseFloat(camp.follows||0)+parseFloat(camp.pageLikes||0);if(fl===0&&camp.platform==="Instagram"){var igFL=findIgGrowth(camp.campaignName,pages);if(igFL>0)fl=igFL;}return fl;}
                return parseFloat(camp.clicks||0);
              };

              var getResultLabel=function(obj){if(obj==="Leads")return "Leads";if(obj==="Followers & Likes")return "Follows/Likes";return "Results";};
              var getCostLabel=function(obj){if(obj==="Leads")return "CPL";if(obj==="Followers & Likes")return "CPF";return "CPC";};

              var rows=sel.map(function(camp){
                var obj=getObj(camp.campaignName);var result=getResult(camp,obj);var spend=parseFloat(camp.spend||0);var clicks=parseFloat(camp.clicks||0);var costPer=result>0?spend/result:0;var convRate=clicks>0&&obj==="Leads"?(parseFloat(camp.leads||0)/clicks*100):0;
                var imps=parseFloat(camp.impressions||0);var ctrVal=imps>0?(clicks/imps*100):0;var engagements=parseFloat(camp.follows||0)+parseFloat(camp.likes||0)+parseFloat(camp.pageLikes||0);if(engagements===0&&camp.platform==="Instagram"){var igEng=findIgGrowth(camp.campaignName,pages);if(igEng>0)engagements=igEng;}return{name:camp.campaignName,engagements:engagements,engCtr:imps>0?(engagements/imps*100):0,platform:camp.platform,objective:obj,spend:spend,clicks:clicks,impressions:imps,ctr:ctrVal,result:result,resultLabel:getResultLabel(obj),costPer:costPer,costLabel:getCostLabel(obj),convRate:convRate};
              });
              var platOrder={"Facebook":0,"Instagram":1,"TikTok":2,"Google Display":3,"YouTube":4};
              var objOrder={"App Store Clicks":0,"Landing Page Clicks":1,"Leads":2,"Followers & Likes":3,"Traffic":4};
              

              var objectives=["App Store Clicks","Landing Page Clicks","Leads","Followers & Likes"];
              var platList=["Facebook","Instagram","TikTok","Google Display","YouTube"];
              var groups={};objectives.forEach(function(o){
                var matched=rows.filter(function(r){return r.objective===o;});
                if(o==="Landing Page Clicks"){var tr=rows.filter(function(r){return r.objective==="Traffic";});matched=matched.concat(tr);}
                var sorted=[];
                platList.forEach(function(pl){var plRows=matched.filter(function(r){return r.platform===pl;});plRows.sort(function(a,b){return b.clicks-a.clicks;});sorted=sorted.concat(plRows);});
                groups[o]=sorted;
              });

              var objColors={"App Store Clicks":P.fb,"Landing Page Clicks":P.cyan,"Leads":P.rose,"Followers & Likes":P.tt};
              var sections=[];

              objectives.forEach(function(objName){
                var g=groups[objName];if(!g||g.length===0)return;
                var totalSpend=g.reduce(function(a,r){return a+r.spend;},0);var totalClicks=g.reduce(function(a,r){return a+r.clicks;},0);var totalResults=g.reduce(function(a,r){return a+r.result;},0);var totalCostPer=totalResults>0?totalSpend/totalResults:0;var totalConv=totalClicks>0&&objName==="Leads"?(totalResults/totalClicks*100):0;var oc=objColors[objName]||P.ember;

                sections.push(<div key={objName} style={{marginBottom:24}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}><span style={{width:12,height:12,borderRadius:"50%",background:oc}}></span><span style={{fontSize:14,fontWeight:800,color:oc,fontFamily:ff}}>{objName}</span></div>
                  <table style={{width:"100%",borderCollapse:"collapse",marginBottom:14}}>
                    <thead><tr>{["Campaign","Platform","Spend","Impressions",objName==="Followers & Likes"?"Engagements":"Clicks",g[0].resultLabel,g[0].costLabel,"CTR %"].concat(objName==="Leads"?["Conv %"]:[]).map(function(h,i){return <th key={i} style={{padding:"10px 12px",fontSize:10,fontWeight:800,textTransform:"uppercase",color:"#F96203",letterSpacing:1.5,textAlign:i===0?"left":"center",background:"rgba(249,98,3,0.15)",border:"1px solid rgba(249,98,3,0.3)",backdropFilter:"blur(8px)",fontFamily:fm,letterSpacing:1}}>{h}</th>;})}</tr></thead>
                    <tbody>{g.map(function(r,ri){return <tr key={ri} style={{background:ri%2===0?oc+"08":"transparent"}}>
                      <td style={{padding:"10px 12px",fontSize:11,fontWeight:600,color:P.txt,border:"1px solid "+P.rule,maxWidth:280,lineHeight:1.4}}><div style={{whiteSpace:"normal",wordBreak:"break-word"}}>{r.name}</div></td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontSize:11}}><span style={{background:r.platform==="Facebook"?P.fb:r.platform==="Instagram"?P.ig:r.platform==="Google Display"||r.platform==="YouTube"?P.gd:P.tt,color:"#fff",fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:10}}>{r.platform==="Facebook"?"FB":r.platform==="Instagram"?"IG":r.platform==="Google Display"?"GD":r.platform==="YouTube"?"YT":"TT"}</span></td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,color:P.txt}}>{fR(r.spend)}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,color:P.txt}}>{fmt(r.impressions)}</td><td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,color:P.txt}}>{fmt(r.objective==="Followers & Likes"?r.engagements:r.clicks)}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:13,fontWeight:900,color:oc}}>{fmt(r.result)}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:13,fontWeight:700,color:P.ember}}>{fR(r.costPer)}</td><td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,color:P.txt}}>{(r.objective==="Followers & Likes"?r.engCtr.toFixed(2):r.ctr.toFixed(2))+"%"}</td>
                      {objName==="Leads"&&<td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,color:r.convRate>0?P.orchid:P.dim}}>{r.convRate>0?r.convRate.toFixed(1)+"%":"0"}</td>}
                    </tr>;})}
                    <tr style={{background:oc+"15"}}><td style={{padding:"10px 12px",border:"1px solid "+P.rule,fontWeight:900,color:oc,fontSize:12}}>Total</td><td style={{padding:"10px 12px",border:"1px solid "+P.rule}}></td><td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:13,fontWeight:900,color:oc}}>{fR(totalSpend)}</td><td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:13,fontWeight:900,color:oc}}>{fmt(g.reduce(function(a,r){return a+r.impressions;},0))}</td><td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:13,fontWeight:900,color:oc}}>{fmt(objName==="Followers & Likes"?g.reduce(function(a,r){return a+r.engagements;},0):totalClicks)}</td><td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:14,fontWeight:900,color:oc}}>{fmt(totalResults)}</td><td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:14,fontWeight:900,color:P.ember}}>{fR(totalCostPer)}</td><td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:13,fontWeight:900,color:P.txt}}>{(function(){var tImps=g.reduce(function(a,r){return a+r.impressions;},0);var tEng=objName==="Followers & Likes"?g.reduce(function(a,r){return a+r.engagements;},0):totalClicks;return tImps>0?(tEng/tImps*100).toFixed(2)+"%":"0.00%";})()}</td>{objName==="Leads"&&<td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:13,fontWeight:900,color:P.orchid}}>{totalConv>0?totalConv.toFixed(1)+"%":"0"}</td>}</tr>
                    </tbody>
                  </table>
                  {(function(){var bestPlat="";var bestResult=0;var bestCost=Infinity;g.forEach(function(r){if(r.result>bestResult){bestResult=r.result;bestPlat=r.platform;}if(r.costPer>0&&r.costPer<bestCost){bestCost=r.costPer;}});var totalImps=g.reduce(function(a,r){return a+r.impressions;},0);var blendedCtr=totalImps>0?((objName==="Followers & Likes"?g.reduce(function(a,r){return a+r.engagements;},0):totalClicks)/totalImps*100):0;var platBreakdown=[];var platList2=["Facebook","Instagram","TikTok","Google Display"];platList2.forEach(function(pl){var plRows=g.filter(function(r){return r.platform===pl;});if(plRows.length===0)return;var plResult=plRows.reduce(function(a,r){return a+r.result;},0);var plSpend=plRows.reduce(function(a,r){return a+r.spend;},0);var plCost=plResult>0?plSpend/plResult:0;var plImps=plRows.reduce(function(a,r){return a+r.impressions;},0);var plClicks=objName==="Followers & Likes"?plRows.reduce(function(a,r){return a+r.engagements;},0):plRows.reduce(function(a,r){return a+r.clicks;},0);var plCtr=plImps>0?(plClicks/plImps*100):0;platBreakdown.push({platform:pl,result:plResult,spend:plSpend,cost:plCost,ctr:plCtr,imps:plImps});});var p=[];if(objName==="App Store Clicks"){p.push("App store click campaigns invested "+fR(totalSpend)+" to deliver "+fmt(totalResults)+" clicks to the app store at "+fR(totalCostPer)+" blended Cost Per Click, "+benchLabel(totalCostPer,benchmarks.meta.cpc)+", with a "+blendedCtr.toFixed(2)+"% Click Through Rate.");var scalePlats=platBreakdown.filter(function(pb){return pb.result>0&&pb.spend>=totalSpend*0.05&&pb.imps>=5000;});var smallPlats=platBreakdown.filter(function(pb){return pb.result>0&&(pb.spend<totalSpend*0.05||pb.imps<5000);});scalePlats.forEach(function(pb){var shareR=totalResults>0?((pb.result/totalResults)*100).toFixed(0):"0";var shareS=totalSpend>0?((pb.spend/totalSpend)*100).toFixed(0):"0";var effR=parseFloat(shareS)>0?(parseFloat(shareR)/parseFloat(shareS)).toFixed(1):"0";p.push(pb.platform+" delivered "+fmt(pb.result)+" app store clicks ("+shareR+"% of total) from "+shareS+"% of budget at "+fR(pb.cost)+" Cost Per Click with "+pb.ctr.toFixed(2)+"% CTR."+(parseFloat(effR)>=1.2?" This platform delivers "+effR+"x more results per rand than its budget share"+(parseInt(pb.result)>=10?", confirmed across "+fmt(pb.imps)+" impressions and "+fmt(pb.result)+" results.":", though with "+fmt(pb.result)+" results this trend needs further volume to confirm.")+"":parseFloat(effR)<0.7?" This platform consumes a disproportionate budget share relative to its result contribution.":""));});if(smallPlats.length>0){smallPlats.forEach(function(pb){p.push(pb.platform+" shows "+fmt(pb.result)+" app store clicks at "+fR(pb.cost)+" CPC from "+fR(pb.spend)+" spend. Volume is currently too low to draw reliable performance conclusions.");});}if(scalePlats.length>1){var cheapest=scalePlats.reduce(function(a,b){return a.cost<b.cost&&a.cost>0?a:b;});p.push("Strategy: Among platforms with proven scale, "+cheapest.platform+" delivers the most efficient Cost Per Click at "+fR(cheapest.cost)+". Increasing allocation toward "+cheapest.platform+" would maximise app store traffic within the current investment.");}}if(objName==="Landing Page Clicks"){p.push("Landing page campaigns invested "+fR(totalSpend)+" generating "+fmt(totalResults)+" qualified site visits at "+fR(totalCostPer)+" blended cost per visit, "+benchLabel(totalCostPer,benchmarks.meta.cpc)+", with "+blendedCtr.toFixed(2)+"% Click Through Rate.");var lpScale=platBreakdown.filter(function(pb){return pb.result>0&&pb.spend>=totalSpend*0.05&&pb.imps>=5000;});var lpSmall=platBreakdown.filter(function(pb){return pb.result>0&&(pb.spend<totalSpend*0.05||pb.imps<5000);});lpScale.forEach(function(pb){var shareR=totalResults>0?((pb.result/totalResults)*100).toFixed(0):"0";var shareS=totalSpend>0?((pb.spend/totalSpend)*100).toFixed(0):"0";p.push(pb.platform+" drove "+fmt(pb.result)+" landing page visits ("+shareR+"% of total) at "+fR(pb.cost)+" cost per visit with "+pb.ctr.toFixed(2)+"% CTR from "+shareS+"% of objective budget."+(pb.ctr>blendedCtr*1.2?" CTR outperforms the blended average by "+((pb.ctr/blendedCtr-1)*100).toFixed(0)+"%, confirming strong creative-audience alignment.":""));});if(lpSmall.length>0){lpSmall.forEach(function(pb){p.push(pb.platform+" contributed "+fmt(pb.result)+" visits at "+fR(pb.cost)+" from "+fR(pb.spend)+" spend. Insufficient volume to confirm sustained performance.");});}if(lpScale.length>1){var highCtr=lpScale.reduce(function(a,b){return a.ctr>b.ctr?a:b;});p.push("Strategy: Among platforms with proven delivery, "+highCtr.platform+" leads with "+highCtr.ctr.toFixed(2)+"% CTR across "+fmt(highCtr.imps)+" impressions, confirming the highest creative resonance at scale.");}}if(objName==="Leads"){var convRate=totalClicks>0?(totalResults/totalClicks*100):0;p.push("Lead generation campaigns invested "+fR(totalSpend)+" producing "+fmt(totalResults)+" qualified leads at "+fR(totalCostPer)+" Cost Per Lead, "+benchLabel(totalCostPer,benchmarks.meta.cpl)+", with a "+convRate.toFixed(1)+"% click-to-lead conversion rate.");var ldScale=platBreakdown.filter(function(pb){return pb.result>0&&pb.spend>=totalSpend*0.05;});var ldSmall=platBreakdown.filter(function(pb){return pb.result>0&&pb.spend<totalSpend*0.05;});ldScale.forEach(function(pb){var shareR=totalResults>0?((pb.result/totalResults)*100).toFixed(0):"0";var shareS=totalSpend>0?((pb.spend/totalSpend)*100).toFixed(0):"0";var effR=parseFloat(shareS)>0?(parseFloat(shareR)/parseFloat(shareS)).toFixed(1):"0";p.push(pb.platform+" generated "+fmt(pb.result)+" leads ("+shareR+"% of total) at "+fR(pb.cost)+" Cost Per Lead from "+shareS+"% of objective budget."+(parseFloat(effR)>=1.2?" Delivering "+effR+"x more leads per rand than its budget share.":parseFloat(effR)<0.7?" This platform is underdelivering relative to its budget allocation.":""));});if(ldSmall.length>0){ldSmall.forEach(function(pb){p.push(pb.platform+" produced "+fmt(pb.result)+" leads at "+fR(pb.cost)+" from "+fR(pb.spend)+" spend. Low volume means this is an early indicator, not a confirmed trend.");});}if(totalResults>0){p.push("Strategy: Each lead represents a qualified prospect who has actively shared contact information. Timely follow-up within 24-48 hours significantly increases conversion probability.");}}if(objName==="Followers & Likes"){p.push("Community growth campaigns invested "+fR(totalSpend)+" acquiring "+fmt(totalResults)+" new followers and likes at "+fR(totalCostPer)+" blended cost per acquisition, "+benchLabel(totalCostPer,benchmarks.meta.cpf)+".");var flScale=platBreakdown.filter(function(pb){return pb.result>=10&&pb.spend>=totalSpend*0.05;});var flSmall=platBreakdown.filter(function(pb){return pb.result>0&&(pb.result<10||pb.spend<totalSpend*0.05);});flScale.forEach(function(pb){var shareR=totalResults>0?((pb.result/totalResults)*100).toFixed(0):"0";var shareS=totalSpend>0?((pb.spend/totalSpend)*100).toFixed(0):"0";p.push(pb.platform+" contributed "+fmt(pb.result)+" new community members ("+shareR+"% of total) at "+fR(pb.cost)+" cost per acquisition from "+shareS+"% of community budget."+(pb.cost<totalCostPer?" This platform delivers community growth below the blended average, confirming efficient audience acquisition.":""));});if(flSmall.length>0){flSmall.forEach(function(pb){p.push(pb.platform+" added "+fmt(pb.result)+" members at "+fR(pb.cost)+" from "+fR(pb.spend)+" spend. Volume is early-stage and not yet statistically significant.");});}if(totalResults>0){p.push("Strategy: Community growth is a compounding investment. The "+fmt(totalResults)+" new members acquired will increase organic content distribution, progressively reducing paid media dependency and strengthening the brand's owned audience reach.");}}return <Insight title={objName+" Performance"} accent={oc} icon={Ic.target(oc,16)}>{p.join(" ")}</Insight>;})()}
                </div>);
              });

              if(sections.length===0)sections.push(<div key="none" style={{padding:30,textAlign:"center",color:P.dim,fontFamily:fm}}>Select campaigns to view objective performance results.</div>);

              var tLeads=rows.filter(function(r){return r.objective==="Leads";}).reduce(function(a,r){return a+r.result;},0);
              var tFollows=rows.filter(function(r){return r.objective==="Followers & Likes";}).reduce(function(a,r){return a+r.result;},0);
              
              var tApp=rows.filter(function(r){return r.objective==="App Store Clicks";}).reduce(function(a,r){return a+r.result;},0);
              var tLp=rows.filter(function(r){return r.objective==="Landing Page Clicks"||r.objective==="Traffic";}).reduce(function(a,r){return a+r.result;},0);
              var sLeads=rows.filter(function(r){return r.objective==="Leads";}).reduce(function(a,r){return a+r.spend;},0);
              var sFollows=rows.filter(function(r){return r.objective==="Followers & Likes";}).reduce(function(a,r){return a+r.spend;},0);
              
              var sApp=rows.filter(function(r){return r.objective==="App Store Clicks";}).reduce(function(a,r){return a+r.spend;},0);
              var sLp=rows.filter(function(r){return r.objective==="Landing Page Clicks"||r.objective==="Traffic";}).reduce(function(a,r){return a+r.spend;},0);
              var allSpend=rows.reduce(function(a,r){return a+r.spend;},0);
              var allClicks=rows.reduce(function(a,r){return a+r.clicks;},0);

              return <div>
                {sections}
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:16}}>
                  <Glass accent={P.fb} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>CLICKS TO APP INSTALL</div><div style={{fontSize:22,fontWeight:900,color:P.fb,fontFamily:fm}}>{fmt(tApp)}</div><div style={{fontSize:9,color:"rgba(255,255,255,0.5)",fontFamily:fm,marginTop:4}}>CPC: {fR(tApp>0?sApp/tApp:0)}</div></Glass>
                  <Glass accent={P.cyan} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>CLICKS TO LANDING PAGE</div><div style={{fontSize:22,fontWeight:900,color:P.cyan,fontFamily:fm}}>{fmt(tLp)}</div><div style={{fontSize:9,color:"rgba(255,255,255,0.5)",fontFamily:fm,marginTop:4}}>CPC: {fR(tLp>0?sLp/tLp:0)}</div></Glass>
                  <Glass accent={P.rose} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>LEADS</div><div style={{fontSize:22,fontWeight:900,color:P.rose,fontFamily:fm}}>{fmt(tLeads)}</div><div style={{fontSize:9,color:"rgba(255,255,255,0.5)",fontFamily:fm,marginTop:4}}>CPL: {fR(tLeads>0?sLeads/tLeads:0)}</div></Glass>
                  <Glass accent={P.tt} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>FOLLOWERS & LIKES</div><div style={{fontSize:22,fontWeight:900,color:P.mint,fontFamily:fm}}>{fmt(tFollows)}</div><div style={{fontSize:9,color:"rgba(255,255,255,0.5)",fontFamily:fm,marginTop:4}}>CPF: {fR(tFollows>0?sFollows/tFollows:0)}</div></Glass>
                  
                </div>
                <Insight title="Objective Performance Assessment" accent={P.rose} icon={Ic.target(P.rose,16)}>{(function(){var p=[];var pacingNote="";if(pctElapsed>0){var spendPct=allSpend>0?(allSpend/projectedSpend*100):0;if(spendPct>pctElapsed*1.15){pacingNote=" Budget pacing is running "+(spendPct-pctElapsed).toFixed(0)+"% ahead of schedule at "+pctElapsed.toFixed(0)+"% through the period, indicating potential early budget depletion if not moderated.";}else if(spendPct<pctElapsed*0.85){pacingNote=" Budget pacing is running "+(pctElapsed-spendPct).toFixed(0)+"% behind schedule, suggesting underdelivery that may require bid or audience adjustments to fully utilise the remaining budget.";}else{pacingNote=" Budget pacing is on track at "+pctElapsed.toFixed(0)+"% through the period with proportionate spend.";}}var freqNote="";if(freqStatus==="critical"){freqNote=" Meta frequency at "+m.frequency.toFixed(2)+"x has breached the 4x fatigue ceiling. Audience saturation is actively eroding engagement quality and inflating costs. Creative rotation and audience expansion are urgently needed.";}else if(freqStatus==="warning"){freqNote=" Meta frequency at "+m.frequency.toFixed(2)+"x is approaching the fatigue threshold. Proactive creative rotation within the next 48-72 hours will prevent CTR decay and CPC inflation.";}else if(freqStatus==="healthy"){freqNote=" Meta frequency at "+m.frequency.toFixed(2)+"x is within the optimal 2-3x recall window, balancing brand retention with efficient delivery.";}p.push("The campaign's objective performance layer spans "+sel.length+" active placements with "+fR(allSpend)+" total investment, generating "+fmt(allClicks)+" measurable actions."+pacingNote+freqNote);if(tApp>0){var appEff=sApp>0?(tApp/sApp*1000).toFixed(0):"0";p.push("App install campaigns delivered "+fmt(tApp)+" clicks to the app store at "+fR(sApp/tApp)+" Cost Per Click, translating to approximately "+appEff+" app store clicks per R1,000 invested. Each click represents a user driven from ad exposure to the app store listing, the final measurable touchpoint before app download. The cost efficiency at "+fR(sApp/tApp)+" per app store click confirms strong acquisition economics for the campaign period.");}if(tLp>0){p.push("Landing page campaigns generated "+fmt(tLp)+" qualified site visits at "+fR(sLp/tLp)+" cost per visit. These are high-intent users who have actively chosen to learn more, representing the warmest segment of the campaign\'s audience for remarketing and conversion optimisation.");}if(tLeads>0){var lClicks=rows.filter(function(r){return r.objective==="Leads";}).reduce(function(a,r){return a+r.clicks;},0);var convR=lClicks>0?(tLeads/lClicks*100).toFixed(1):"0";p.push("Lead generation campaigns produced "+fmt(tLeads)+" qualified leads at "+fR(sLeads/tLeads)+" cost per lead, converting "+convR+"% of "+fmt(lClicks)+" clicks into form submissions. "+(parseFloat(convR)>8?"The conversion rate exceeding 8% indicates exceptional funnel alignment, the ad creative, targeting, and landing page experience are working in concert to drive high-quality lead capture.":parseFloat(convR)>3?"The "+convR+"% conversion rate sits within healthy parameters, confirming the landing page experience is effectively converting paid traffic into actionable leads. ":"The "+convR+"% conversion rate demonstrates active lead capture from the campaign traffic.")+" Each lead represents a qualified prospect who has actively expressed interest and shared contact information, the most valuable first-party data signal in the acquisition funnel.");}if(tFollows>0){p.push("Community growth campaigns acquired "+fmt(tFollows)+" new followers and likes at "+fR(sFollows/tFollows)+" cost per acquisition. Unlike paid impressions which are transient, each community member represents a permanent organic distribution channel. Each new community member increases future organic content distribution, compounding in value over time as the brand's owned audience grows.");}return p.join(" ");})()}</Insight>
              </div>;
            })()}
          </div>



        </div>)}

        {tab==="tof"&&(<div>
          <SH icon={Ic.radar(P.ember,20)} title="Top of Funnel, Ad Serving" sub="Impressions · Reach · Frequency · Cost Per Thousand Ads Served" accent={P.ember}/>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:24}}><Metric icon={Ic.eye(P.cyan,14)} label="Impressions" value={fmt(computed.totalImps)} accent={P.cyan}/><Metric icon={Ic.users(P.orchid,14)} label="Meta Reach" value={fmt(m.reach)} accent={P.orchid}/><Metric icon={Ic.radar(P.rose,14)} label="Frequency" value={m.frequency>0?m.frequency.toFixed(2)+"x":"0"} accent={P.rose}/><Metric icon={Ic.bolt(P.mint,14)} label="Blended Cost Per Thousand Ads Served" value={fR(computed.blendedCpm)} accent={P.mint}/></div>

          <PH platform="Facebook" suffix="Campaign Performance"/>
          <Glass accent={P.fb} st={{padding:22,marginBottom:20}}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:14}}>{[{l:"Impressions",v:fmt(m.impressions)},{l:"Reach",v:fmt(m.reach)},{l:"Frequency",v:m.frequency>0?m.frequency.toFixed(2)+"x":"0"},{l:"CPM",v:fR(m.cpm)}].map(function(x,i){return<div key={i} style={{textAlign:"center"}}><div style={{fontSize:9,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:4}}>{x.l}</div><div style={{fontSize:20,fontWeight:900,color:P.fb,fontFamily:fm}}>{x.v}</div></div>;})}</div>
            {computed.metaCamps.length>0&&<table style={{width:"100%",borderCollapse:"collapse",marginBottom:14}}><thead><tr>{["Campaign","Impressions","Spend","CPC","CTR"].map(function(h,i){return<th key={i} style={{padding:"10px 14px",fontSize:10,fontWeight:800,textTransform:"uppercase",color:"#F96203",letterSpacing:1.5,textAlign:i===0?"left":"center",background:"rgba(249,98,3,0.15)",border:"1px solid rgba(249,98,3,0.3)",backdropFilter:"blur(8px)",fontFamily:fm}}>{h}</th>;})}</tr></thead><tbody>{computed.metaCamps.sort(function(a,b){return parseFloat(b.impressions)-parseFloat(a.impressions);}).map(function(c,i){return<tr key={i} style={{background:i%2===0?"rgba(240,246,251,0.04)":"transparent"}}><td style={{padding:"10px 14px",fontSize:11,fontWeight:600,color:P.txt,border:"1px solid "+P.rule}}>{c.campaignName}</td><td style={{padding:"10px 14px",fontSize:12,color:P.txt,textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm}}>{fmt(c.impressions)}</td><td style={{padding:"10px 14px",fontSize:12,color:P.txt,textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm}}>{fR(parseFloat(c.spend))}</td><td style={{padding:"10px 14px",fontSize:12,color:P.mint,textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontWeight:700}}>{fR(parseFloat(c.cpc||0))}</td><td style={{padding:"10px 14px",fontSize:12,color:P.txt,textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm}}>{pc(parseFloat(c.ctr||0))}</td></tr>;})}</tbody></table>}
            <Insight title="Meta Campaign Read" accent={P.fb} icon={Ic.bolt(P.fb,16)}>Meta has delivered <strong>{fmt(m.impressions)} impressions</strong> reaching <strong>{fmt(m.reach)} unique individuals</strong> at {m.frequency>0?m.frequency.toFixed(2)+"x":"0"} frequency and {fR(m.cpm)} Cost Per Thousand Ads Served. The {fmt(m.clicks)} clicks generated at {fR(m.cpc)} Cost Per Click with {pc(m.ctr)} CTR against {fR(m.spend)} investment confirms the algorithm has successfully identified and is consistently reaching high-intent audience pockets. The frequency level indicates the campaign is within the optimal exposure window, sufficient repetition to build recall without crossing into diminishing returns territory. The platform’s publisher breakdown capabilities are automatically optimising delivery across Facebook feed, Instagram Stories, Reels, and the Audience Network to find the lowest-cost conversion opportunities within each placement.</Insight>
          </Glass>

          <PH platform="TikTok" suffix="Campaign Performance"/>
          <Glass accent={P.tt} st={{padding:22,marginBottom:20}}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:14}}>{[{l:"Impressions",v:fmt(t.impressions)},{l:"CPM",v:fR(t.cpm)},{l:"Follows",v:fmt(t.follows)},{l:"Spend",v:fR(t.spend)}].map(function(x,i){return<div key={i} style={{textAlign:"center"}}><div style={{fontSize:9,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:4}}>{x.l}</div><div style={{fontSize:20,fontWeight:900,color:P.tt,fontFamily:fm}}>{x.v}</div></div>;})}</div>
            {computed.ttCamps.length>0&&<table style={{width:"100%",borderCollapse:"collapse",marginBottom:14}}><thead><tr>{["Campaign","Impressions","Spend","CPM"].map(function(h,i){return<th key={i} style={{padding:"10px 14px",fontSize:10,fontWeight:800,textTransform:"uppercase",color:"#F96203",letterSpacing:1.5,textAlign:i===0?"left":"center",background:"#252538",border:"1px solid #3a3a4e",fontFamily:fm}}>{h}</th>;})}</tr></thead><tbody>{computed.ttCamps.sort(function(a,b){return parseFloat(b.impressions)-parseFloat(a.impressions);}).map(function(c,i){return<tr key={i} style={{background:i%2===0?"#1e1e2e":"#252538"}}><td style={{padding:"10px 14px",fontSize:11,fontWeight:600,color:"#fff",border:"1px solid #3a3a4e"}}>{c.campaignName}</td><td style={{padding:"10px 14px",fontSize:12,color:"#fff",textAlign:"center",border:"1px solid #3a3a4e",fontFamily:fm}}>{fmt(c.impressions)}</td><td style={{padding:"10px 14px",fontSize:12,color:"#ccc",textAlign:"center",border:"1px solid #3a3a4e",fontFamily:fm}}>{fR(parseFloat(c.spend))}</td><td style={{padding:"10px 14px",fontSize:12,color:P.tt,textAlign:"center",border:"1px solid #3a3a4e",fontFamily:fm,fontWeight:700}}>{fR(parseFloat(c.cpm||0))}</td></tr>;})}</tbody></table>}
            <Insight title="TikTok Campaign Read" accent={P.tt} icon={Ic.bolt(P.tt,16)}>TikTok has delivered <strong>{fmt(t.impressions)} impressions</strong> at <strong>{fR(t.cpm)} CPM</strong> with {fmt(t.follows)} followers and {fmt(t.likes)} engagements against {fR(t.spend)} investment. The platform’s content-first algorithm is rewarding the campaign creative with favourable auction positioning, evidenced by the below-market Cost Per Thousand Ads Served. TikTok’s unique strength lies in its ability to drive simultaneous paid and organic amplification, when paid creative resonates, TikTok’s recommendation engine extends its distribution beyond the paid audience, effectively delivering bonus organic impressions at zero marginal cost. The follower acquisition is particularly valuable: each new follow creates a persistent organic distribution channel that reduces future paid media dependency.</Insight>
          </Glass>

          <Glass st={{padding:22}}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>{Ic.chart(P.ember,16)}<span style={{fontSize:10,fontWeight:800,color:P.ember,letterSpacing:3,fontFamily:fm,textTransform:"uppercase"}}>Impression Volume</span></div><ResponsiveContainer width="100%" height={200}><BarChart data={[{name:"Meta",Impressions:m.impressions},{name:"TikTok",Impressions:t.impressions}]} barSize={60}><CartesianGrid strokeDasharray="3 3" stroke={P.rule}/><XAxis dataKey="name" tick={{fontSize:12,fill:"rgba(255,255,255,0.85)",fontFamily:fm}} stroke="transparent"/><YAxis tick={{fontSize:10,fill:"rgba(255,255,255,0.6)",fontFamily:fm}} stroke="transparent" tickFormatter={function(v){return fmt(v);}}/><Tooltip content={<Tip/>} wrapperStyle={{outline:"none"}} cursor={{fill:"rgba(255,255,255,0.05)"}}/><Bar dataKey="Impressions" radius={[12,12,0,0]}><Cell fill={P.fb}/><Cell fill={P.tt}/></Bar></BarChart></ResponsiveContainer></Glass>
        </div>)}

        {/* ENGAGEMENT */}
        {tab==="mof"&&(<div>
          <SH icon={Ic.pulse(P.mint,20)} title="Middle of Funnel, Engagement" sub="Clicks · CTR · CPC · Top Campaigns" accent={P.mint}/>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:24}}><Metric icon={Ic.pulse(P.mint,14)} label="Total Clicks" value={fmt(computed.totalClicks)} accent={P.mint}/><Metric icon={Ic.bolt(P.solar,14)} label="Meta Cost Per Click" value={fR(m.cpc)} accent={P.solar}/><Metric icon={Ic.eye(P.cyan,14)} label="Meta Click Through Rate" value={pc(m.ctr)} accent={P.cyan}/><Metric icon={Ic.users(P.fuchsia,14)} label="TT Follows" value={fmt(t.follows)} accent={P.fuchsia}/></div>

          <PH platform="Facebook" suffix="Top Campaigns by Clicks"/>
          <Glass accent={P.fb} st={{padding:22,marginBottom:20}}>
            {computed.metaCamps.sort(function(a,b){return parseFloat(b.clicks||0)-parseFloat(a.clicks||0);}).slice(0,8).map(function(c,i){var best=i===0;return<div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",marginBottom:4,background:i%2===0?P.orchid+"06":"transparent",borderRadius:10,borderLeft:"3px solid "+(best?P.solar:P.fb)}}>
              <div style={{width:28,height:28,borderRadius:8,background:best?P.solar+"15":P.fb+"10",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:900,color:best?P.solar:P.fb,fontFamily:fm,flexShrink:0}}>#{i+1}</div>
              <div style={{flex:1,minWidth:0}}><div style={{fontSize:11,fontWeight:700,color:P.txt,whiteSpace:"normal",wordBreak:"break-word",lineHeight:1.4}}>{c.campaignName}</div><div style={{display:"flex",gap:6,marginTop:3}}><Pill name={c.accountName} color={P.orchid}/>{best&&<span style={{background:gFire,color:"#fff",fontSize:8,fontWeight:900,padding:"2px 8px",borderRadius:6,fontFamily:fm}}>BEST</span>}</div></div>
              <div style={{textAlign:"right",minWidth:60}}><div style={{fontSize:14,fontWeight:900,color:P.txt,fontFamily:fm}}>{fmt(parseFloat(c.clicks||0))}</div><div style={{fontSize:8,color:P.dim,fontFamily:fm}}>clicks</div></div>
              <div style={{textAlign:"right",minWidth:55}}><div style={{fontSize:13,fontWeight:800,color:P.mint,fontFamily:fm}}>{fR(parseFloat(c.cpc||0))}</div><div style={{fontSize:8,color:P.dim,fontFamily:fm}}>CPC</div></div>
              <div style={{textAlign:"right",minWidth:50}}><div style={{fontSize:13,fontWeight:700,color:P.sub,fontFamily:fm}}>{pc(parseFloat(c.ctr||0))}</div><div style={{fontSize:8,color:P.dim,fontFamily:fm}}>CTR</div></div>
              <div style={{textAlign:"right",minWidth:60}}><div style={{fontSize:13,fontWeight:700,color:P.ember,fontFamily:fm}}>{fR(parseFloat(c.spend||0))}</div><div style={{fontSize:8,color:P.dim,fontFamily:fm}}>spend</div></div>
            </div>;})}
            <Insight title="Engagement Analysis" accent={P.mint} icon={Ic.fire(P.mint,16)}>Meta has generated <strong>{fmt(m.clicks)} clicks</strong> at <strong>{fR(m.cpc)} CPC</strong> with {pc(m.ctr)} Click Through Rate, each click represents a deliberate intent signal from a user who has moved beyond passive awareness into active consideration. The CPC level indicates the campaign is winning competitive auctions efficiently, securing high-quality placements without overpaying for attention. TikTok contributed {fmt(t.clicks)} clicks alongside {fmt(t.follows)} new followers and {fmt(t.likes)} engagements, on TikTok, engagement metrics carry amplification weight as the algorithm promotes content with strong interaction signals. The combined click volume of <strong>{fmt(computed.totalClicks)}</strong> across both platforms confirms the creative messaging is resonating at scale, with each platform contributing its unique engagement character: Meta for measured, intentional interaction and TikTok for volume-driven social proof.</Insight>
          </Glass>
        </div>)}

        {/* OBJECTIVES */}
        {tab==="bof"&&(<div>
          <SH icon={Ic.target(P.rose,20)} title="Bottom of Funnel, Objective Results" sub="Results · Cost Per Result · Community Growth" accent={P.rose}/>

          <PH platform="Facebook" suffix="Objective Results"/>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14,marginBottom:24}}>
            {[{l:"IMPRESSIONS",v:fmt(m.impressions),s1l:"CPM",s1v:fR(m.cpm),s1c:P.fb,s2l:"SPEND",s2v:fR(m.spend)},{l:"CLICKS",v:fmt(m.clicks),s1l:"CPC",s1v:fR(m.cpc),s1c:P.fb,s2l:"CTR",s2v:pc(m.ctr)},{l:"REACH",v:fmt(m.reach),s1l:"FREQUENCY",s1v:m.frequency>0?m.frequency.toFixed(2)+"x":"0",s1c:P.fb}].map(function(x,i){return<Glass key={i} accent={P.fb} hv={true} st={{padding:20}}><div style={{fontSize:9,fontWeight:700,color:P.sub,fontFamily:fm,letterSpacing:2,marginBottom:12}}>{x.l}</div><div style={{fontSize:26,fontWeight:900,color:P.txt,fontFamily:fm}}>{x.v}</div><div style={{display:"flex",justifyContent:"space-between",paddingTop:10,borderTop:"1px solid "+P.rule,marginTop:10}}><div><div style={{fontSize:8,color:P.dim,fontFamily:fm}}>{x.s1l}</div><div style={{fontSize:15,fontWeight:800,color:x.s1c,fontFamily:fm}}>{x.s1v}</div></div>{x.s2l&&<div style={{textAlign:"right"}}><div style={{fontSize:8,color:P.dim,fontFamily:fm}}>{x.s2l}</div><div style={{fontSize:13,fontWeight:700,color:P.sub,fontFamily:fm}}>{x.s2v}</div></div>}</div></Glass>;})}
          </div>

          <PH platform="TikTok" suffix="Objective Results"/>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14,marginBottom:24}}>
            {[{l:"IMPRESSIONS",v:fmt(t.impressions),s1l:"CPM",s1v:fR(t.cpm),s1c:P.tt,s2l:"SPEND",s2v:fR(t.spend)},{l:"CLICKS",v:fmt(t.clicks),s1l:"CPC",s1v:t.clicks>0?fR(t.spend/t.clicks):"0",s1c:P.tt},{l:"COMMUNITY",v:fmt(t.follows),s1l:"LIKES",s1v:fmt(t.likes),s1c:P.tt}].map(function(x,i){return<Glass key={i} accent={P.tt} hv={true} st={{padding:20}}><div style={{fontSize:9,fontWeight:700,color:P.sub,fontFamily:fm,letterSpacing:2,marginBottom:12}}>{x.l}</div><div style={{fontSize:26,fontWeight:900,color:i===2?P.mint:P.txt,fontFamily:fm}}>{x.v}</div><div style={{paddingTop:10,borderTop:"1px solid "+P.rule,marginTop:10}}><div style={{fontSize:8,color:P.dim,fontFamily:fm}}>{x.s1l}</div><div style={{fontSize:15,fontWeight:800,color:x.s1c,fontFamily:fm}}>{x.s1v}</div></div>{x.s2l&&<div style={{marginTop:8}}><div style={{fontSize:8,color:P.dim,fontFamily:fm}}>{x.s2l}</div><div style={{fontSize:13,fontWeight:700,color:P.sub,fontFamily:fm}}>{x.s2v}</div></div>}</Glass>;})}
          </div>

          <Glass accent={P.ember} st={{padding:26,background:"linear-gradient(135deg,"+P.lava+"05,"+P.ember+"05,"+P.solar+"05)"}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:22}}>{Ic.users(P.ember,18)}<span style={{fontSize:10,fontWeight:800,color:P.ember,letterSpacing:3,fontFamily:fm,textTransform:"uppercase"}}>Combined Results</span></div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:18}}>
              <div><div style={{fontSize:9,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:6}}>IMPRESSIONS</div><div style={{fontSize:30,fontWeight:900,fontFamily:ff,lineHeight:1,color:P.ember}}>{fmt(computed.totalImps)}</div></div>
              <div style={{borderLeft:"1px solid "+P.rule,paddingLeft:16}}><div style={{fontSize:9,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:6}}>SPEND</div><div style={{fontSize:22,fontWeight:900,color:P.solar,fontFamily:fm}}>{fR(computed.totalSpend)}</div></div>
              <div style={{borderLeft:"1px solid "+P.rule,paddingLeft:16}}><div style={{fontSize:9,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:6}}>CLICKS</div><div style={{fontSize:22,fontWeight:900,color:P.mint,fontFamily:fm}}>{fmt(computed.totalClicks)}</div></div>
              <div style={{borderLeft:"1px solid "+P.rule,paddingLeft:16}}><div style={{fontSize:9,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:6}}>TT FOLLOWS</div><div style={{fontSize:22,fontWeight:900,color:P.tt,fontFamily:fm}}>{fmt(t.follows)}</div></div>
            </div>
            <Insight title="Combined Campaign Read" icon={Ic.crown(P.ember,16)} accent={P.ember}>The selected campaigns have delivered <strong>{fmt(computed.totalImps)} total impressions</strong> across Meta, TikTok, and Google Display against a combined investment of <strong>{fR(computed.totalSpend)}</strong>, achieving a blended Cost Per Thousand Ads Served of {fR(computed.blendedCpm)}, representing exceptional media value in the paid social market. Meta reached <strong>{fmt(m.reach)} unique individuals</strong> at {m.frequency>0?m.frequency.toFixed(2)+"x":"0"} frequency, generating {fmt(m.clicks)} clicks at {fR(m.cpc)} Cost Per Click with {pc(m.ctr)} Click Through Rate. TikTok delivered {fmt(t.impressions)} impressions at {fR(t.cpm)} CPM with {fmt(t.follows)} followers earned, building an owned audience asset that compounds in value with every campaign cycle. The multi-platform architecture is delivering its intended strategic outcome: TikTok provides the mass awareness foundation and cost-efficient community growth, whilst Meta converts that awareness into measurable, attributable engagement actions. This complementary approach ensures neither platform’s limitations constrain overall campaign performance, each amplifies the other’s strengths.</Insight>
          </Glass>
        </div>)}

        {/* OPTIMISATION */}

        
        {tab==="targeting"&&(<div>
          <SH icon={Ic.radar(P.solar,20)} title="Targeting Performance" sub={df+" to "+dt+" \u00b7 Adset-Level Analysis by Objective"} accent={P.solar}/>
          {(function(){
            var selCamps=campaigns.filter(function(x){return selected.indexOf(x.campaignId)>=0;});
            var selIds=selCamps.map(function(x){return x.rawCampaignId||x.campaignId.replace(/_facebook$/,"").replace(/_instagram$/,"");});
            var selNames=selCamps.map(function(x){return x.campaignName;});
            var filtered=adsets.filter(function(a){
              for(var si=0;si<selIds.length;si++){if(a.campaignId===selIds[si])return true;}
              for(var sn=0;sn<selNames.length;sn++){if(a.campaignName===selNames[sn])return true;}
              return false;
            }).filter(function(a){return parseFloat(a.impressions||0)>0||parseFloat(a.spend||0)>0;});
            if(filtered.length===0)return <div style={{padding:30,textAlign:"center",color:P.dim,fontFamily:fm}}>Select campaigns to view adset targeting performance.</div>;

            var allRows=filtered.map(function(a){
              var getObj2=function(name){var n=(name||"").toLowerCase();if(n.indexOf("appinstal")>=0||n.indexOf("app install")>=0)return "App Store Clicks";if(n.indexOf("follower")>=0)return "Followers & Likes";if(n.indexOf("page like")>=0||n.indexOf("pagelikes")>=0||n.indexOf("_like_")>=0||n.indexOf("_like ")>=0||n.indexOf("paidsocial_like")>=0||n.indexOf("like_facebook")>=0||n.indexOf("like_instagram")>=0)return "Followers & Likes";if(n.indexOf("lead")>=0||n.indexOf("pos")>=0)return "Leads";if(n.indexOf("homeloan")>=0||n.indexOf("traffic")>=0||n.indexOf("paidsearch")>=0)return "Landing Page Clicks";return "Traffic";};
              var obj=getObj2(a.campaignName);
              var result=obj==="Leads"?parseFloat(a.leads||0):obj==="Followers & Likes"?parseFloat(a.follows||0)+parseFloat(a.pageLikes||0):parseFloat(a.clicks||0);
              var spend=parseFloat(a.spend||0);var clicks=parseFloat(a.clicks||0);var imps=parseFloat(a.impressions||0);
              var ctr=imps>0?(clicks/imps*100):0;var cpc=clicks>0?spend/clicks:0;var costPer=result>0?spend/result:0;
              return{adsetName:a.adsetName,campaignName:a.campaignName,platform:a.platform,objective:obj,spend:spend,clicks:clicks,impressions:imps,reach:parseFloat(a.reach||0),ctr:ctr,cpc:cpc,result:result,costPer:costPer,follows:parseFloat(a.follows||0),pageLikes:parseFloat(a.pageLikes||0),leads:parseFloat(a.leads||0)};
            });

            var totalSpend=allRows.reduce(function(a,r){return a+r.spend;},0);
            var totalImps=allRows.reduce(function(a,r){return a+r.impressions;},0);
            var totalClicks=allRows.reduce(function(a,r){return a+r.clicks;},0);
            var totalReach=allRows.reduce(function(a,r){return a+r.reach;},0);
            var blendedCtr=totalImps>0?(totalClicks/totalImps*100):0;
            var blendedCpc=totalClicks>0?totalSpend/totalClicks:0;

            var platforms=["Facebook","Instagram","TikTok"];
            var platColors={"Facebook":P.fb,"Instagram":P.ig,"TikTok":P.tt};
            var platBadge={"Facebook":"FB","Instagram":"IG","TikTok":"TT"};

            var adsetFlags=[];

            var platList3=["Facebook","Instagram","TikTok","Google Display"];
            var platCol3={"Facebook":P.fb,"Instagram":P.ig,"TikTok":P.tt,"Google Display":P.gd};
            var platBdg3={"Facebook":"FB","Instagram":"IG","TikTok":"TT","Google Display":"GD"};
            var objList3=["App Store Clicks","Landing Page Clicks","Leads","Followers & Likes"];
            var objCol3={"App Store Clicks":P.fb,"Landing Page Clicks":P.cyan,"Leads":P.rose,"Followers & Likes":P.tt};
            var objRL3={"App Store Clicks":"App Clicks","Landing Page Clicks":"LP Clicks","Leads":"Leads","Followers & Likes":"Follows/Likes"};
            var objCL3={"App Store Clicks":"CPC","Landing Page Clicks":"CPC","Leads":"CPL","Followers & Likes":"CPF"};
            var platOrd3={"Facebook":0,"Instagram":1,"TikTok":2,"Google Display":3};

            var adsetTip=function(props){if(!props.active||!props.payload||!props.payload[0])return null;var d=props.payload[0].payload;return <div style={{background:"rgba(6,2,14,0.95)",border:"1px solid "+P.rule,borderRadius:10,padding:"10px 14px",maxWidth:360}}><div style={{fontSize:12,fontWeight:700,color:P.txt,marginBottom:6,whiteSpace:"normal",wordBreak:"break-word",lineHeight:1.5}}>{d.fullName||d.name}</div><div style={{fontSize:10,color:P.sub,marginBottom:2}}>{d.platform||""}</div>{props.payload.map(function(p,i){return <div key={i} style={{fontSize:11,color:P.ember,fontFamily:fm,fontWeight:700}}>{p.name}: {typeof p.value==="number"&&p.name.indexOf("CTR")>=0?p.value.toFixed(2)+"%":typeof p.value==="number"&&(p.name==="Results"||p.name==="Clicks")?fmt(p.value):typeof p.value==="number"?fR(p.value):p.value}</div>;})}</div>;};

            var platSections=[];
            objList3.forEach(function(objName){
              var objRows=allRows.filter(function(r){return r.objective===objName;});
              if(objName==="Landing Page Clicks"){objRows=objRows.concat(allRows.filter(function(r){return r.objective==="Traffic";}));}
              if(objRows.length===0)return;
              var oc=objCol3[objName];
              var sorted6=objRows.slice().sort(function(a,b){var po=(platOrd3[a.platform]||9)-(platOrd3[b.platform]||9);if(po!==0)return po;return b.result-a.result;});
              var oSpend=sorted6.reduce(function(a,r){return a+r.spend;},0);
              var oClicks=sorted6.reduce(function(a,r){return a+r.clicks;},0);
              var oResults=sorted6.reduce(function(a,r){return a+r.result;},0);
              var oImps=sorted6.reduce(function(a,r){return a+r.impressions;},0);
              var oCtr=oImps>0?(oClicks/oImps*100):0;
              var oCpc=oClicks>0?oSpend/oClicks:0;
              var oCostPer=oResults>0?oSpend/oResults:0;
              var qualifiedAds=sorted6.filter(function(r){return r.result>=10&&r.costPer>0&&r.spend>=oSpend*0.03;});
              var bestAd=qualifiedAds.length>0?qualifiedAds.reduce(function(a,r){var aScore=a.result>0?(a.result/a.spend):0;var rScore=r.result>0?(r.result/r.spend):0;return rScore>aScore?r:a;}):sorted6.reduce(function(a,r){return r.result>a.result?r:a;},{result:0,adsetName:"",platform:"",costPer:0,ctr:0,spend:0});
              var chartD=sorted6.slice().sort(function(a,b){return b.result-a.result;}).map(function(r){var platTag=r.platform==="Facebook"?"FB":r.platform==="Instagram"?"IG":r.platform==="TikTok"?"TT":"GD";return{name:platTag+" | "+r.adsetName,fullName:r.adsetName,platform:r.platform,Results:r.result,CostPer:r.costPer,CTR:r.ctr};});

              var platGrp={};sorted6.forEach(function(r){if(!platGrp[r.platform])platGrp[r.platform]={rows:[],spend:0,clicks:0,imps:0,results:0};platGrp[r.platform].rows.push(r);platGrp[r.platform].spend+=r.spend;platGrp[r.platform].clicks+=r.clicks;platGrp[r.platform].imps+=r.impressions;platGrp[r.platform].results+=r.result;});

              platSections.push(<div key={objName} style={{background:P.glass,borderRadius:18,padding:"6px 24px 24px",marginBottom:28,border:"1px solid "+P.rule}}>
                <div style={{display:"flex",alignItems:"center",gap:10,padding:"18px 0 16px"}}><span style={{width:16,height:16,borderRadius:"50%",background:oc}}></span><span style={{fontSize:20,fontWeight:900,color:oc,fontFamily:ff,letterSpacing:1}}>{objName.toUpperCase()}</span><span style={{fontSize:11,color:P.sub,fontFamily:fm,marginLeft:8}}>{sorted6.length} adsets across {Object.keys(platGrp).length} platform{Object.keys(platGrp).length>1?"s":""}</span></div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12,marginBottom:20}}>
                  <Glass accent={oc} hv={true} st={{padding:14,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>SPEND</div><div style={{fontSize:18,fontWeight:900,color:oc,fontFamily:fm}}>{fR(oSpend)}</div></Glass>
                  <Glass accent={oc} hv={true} st={{padding:14,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>IMPRESSIONS</div><div style={{fontSize:18,fontWeight:900,color:P.txt,fontFamily:fm}}>{fmt(oImps)}</div></Glass>
                  <Glass accent={oc} hv={true} st={{padding:14,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>{objRL3[objName]||"RESULTS"}</div><div style={{fontSize:18,fontWeight:900,color:oc,fontFamily:fm}}>{fmt(oResults)}</div></Glass>
                  <Glass accent={oc} hv={true} st={{padding:14,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>{objCL3[objName]||"COST PER"}</div><div style={{fontSize:18,fontWeight:900,color:P.ember,fontFamily:fm}}>{oResults>0?fR(oCostPer):"-"}</div></Glass>
                  <Glass accent={oc} hv={true} st={{padding:14,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>CPC</div><div style={{fontSize:18,fontWeight:900,color:oCpc<2?P.mint:oCpc<5?P.txt:P.ember,fontFamily:fm}}>{fR(oCpc)}</div></Glass>
                </div>
                <table style={{width:"100%",borderCollapse:"collapse",marginBottom:14}}>
                  <thead><tr>{["Adset (Targeting)","Platform","Spend","Impressions","Clicks",objRL3[objName]||"Results",objCL3[objName]||"Cost Per","CTR %","CPC"].map(function(h,hi){return <th key={hi} style={{padding:"10px 12px",fontSize:9,fontWeight:800,textTransform:"uppercase",color:"#F96203",letterSpacing:1,textAlign:hi===0?"left":"center",background:"rgba(249,98,3,0.15)",border:"1px solid rgba(249,98,3,0.3)",fontFamily:fm}}>{h}</th>;})}</tr></thead>
                  <tbody>{sorted6.map(function(r,ri){
                    var pc=platCol3[r.platform]||P.ember;
                    var isBest=false;if(r.result>=10&&r.costPer>0&&r.spend>=oSpend*0.03){
                        var platRows2=sorted6.filter(function(x){return x.platform===r.platform&&x.result>=10;});
                        if(platRows2.length>0){
                          var platBestCost=platRows2.reduce(function(a2,x2){return x2.costPer>0&&x2.costPer<a2?x2.costPer:a2;},Infinity);
                          if(r.costPer<=platBestCost*1.05){
                            var alreadyBest=false;for(var bi=0;bi<ri;bi++){if(sorted6[bi].platform===r.platform){var prevR=sorted6[bi];if(prevR.result>=10&&prevR.costPer>0&&prevR.costPer<=platBestCost*1.05){alreadyBest=true;break;}}}
                            if(!alreadyBest)isBest=true;
                          }
                        }
                      }
                    return <tr key={ri} style={{background:ri%2===0?pc+"06":"transparent",borderTop:ri>0&&r.platform!==sorted6[ri-1].platform?"3px solid "+pc+"30":"none"}}>
                      <td title={r.adsetName} style={{padding:"10px 12px",fontSize:11,fontWeight:600,color:P.txt,border:"1px solid "+P.rule,maxWidth:300,lineHeight:1.4}}><div style={{whiteSpace:"normal",wordBreak:"break-word"}}>{r.adsetName}</div>{isBest&&<span style={{background:P.mint,color:"#fff",fontSize:7,fontWeight:900,padding:"2px 6px",borderRadius:6,marginTop:3,display:"inline-block"}}>BEST</span>}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule}}><span style={{background:pc,color:"#fff",fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:10}}>{platBdg3[r.platform]||"?"}</span></td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:11,fontWeight:700,color:P.txt}}>{fR(r.spend)}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:11,color:P.txt}}>{fmt(r.impressions)}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:11,color:P.txt}}>{fmt(r.clicks)}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,fontWeight:900,color:r.result>0?oc:P.dim}}>{fmt(r.result)}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,fontWeight:700,color:r.costPer>0?P.ember:P.dim}}>{r.costPer>0?fR(r.costPer):"-"}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:11,fontWeight:700,color:r.ctr>2?P.mint:r.ctr>1?P.txt:r.ctr>0?P.warning:P.dim}}>{r.ctr.toFixed(2)+"%"}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:11,fontWeight:700,color:r.cpc>0&&r.cpc<2?P.mint:r.cpc>0?P.txt:P.dim}}>{r.cpc>0?fR(r.cpc):"-"}</td>
                    </tr>;})}</tbody>
                </table>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:14}}>
                  <div style={{background:"rgba(0,0,0,0.12)",borderRadius:10,padding:16}}><div style={{fontSize:9,fontWeight:800,color:"rgba(255,255,255,0.5)",letterSpacing:3,fontFamily:fm,textTransform:"uppercase",marginBottom:10}}>Results by Adset</div><ResponsiveContainer width="100%" height={Math.max(160,chartD.length*52)}><BarChart data={chartD} layout="vertical" barSize={14}><CartesianGrid strokeDasharray="3 3" stroke={P.rule}/><XAxis type="number" tick={{fontSize:9,fill:"rgba(255,255,255,0.6)",fontFamily:fm}} stroke="transparent" tickFormatter={function(v){return fmt(v);}}/><YAxis type="category" dataKey="name" width={220} tick={function(props){var lines=[];var txt=props.payload.value||"";var maxW=28;for(var si=0;si<txt.length;si+=maxW){lines.push(txt.substring(si,si+maxW));}return <g transform={"translate("+props.x+","+props.y+")"}>{lines.map(function(ln,li){return <text key={li} x={-4} y={li*13-((lines.length-1)*6)} textAnchor="end" fill="rgba(255,255,255,0.85)" fontSize={9} fontFamily="'JetBrains Mono',monospace">{ln}</text>;})}</g>;}} stroke="transparent"/><Tooltip content={adsetTip} cursor={{fill:"rgba(255,255,255,0.05)"}}/><Bar dataKey="Results" fill={oc} radius={[0,6,6,0]}/></BarChart></ResponsiveContainer></div>
                  <div style={{background:"rgba(0,0,0,0.12)",borderRadius:10,padding:16}}><div style={{fontSize:9,fontWeight:800,color:"rgba(255,255,255,0.5)",letterSpacing:3,fontFamily:fm,textTransform:"uppercase",marginBottom:10}}>Cost Per Result</div><ResponsiveContainer width="100%" height={Math.max(160,chartD.filter(function(x){return x.CostPer>0;}).length*52)}><BarChart data={chartD.filter(function(x){return x.CostPer>0;}).sort(function(a,b){return a.CostPer-b.CostPer;})} layout="vertical" barSize={14}><CartesianGrid strokeDasharray="3 3" stroke={P.rule}/><XAxis type="number" tick={{fontSize:9,fill:"rgba(255,255,255,0.6)",fontFamily:fm}} stroke="transparent" tickFormatter={function(v){return fR(v);}}/><YAxis type="category" dataKey="name" width={220} tick={function(props){var lines=[];var txt=props.payload.value||"";var maxW=28;for(var si=0;si<txt.length;si+=maxW){lines.push(txt.substring(si,si+maxW));}return <g transform={"translate("+props.x+","+props.y+")"}>{lines.map(function(ln,li){return <text key={li} x={-4} y={li*13-((lines.length-1)*6)} textAnchor="end" fill="rgba(255,255,255,0.85)" fontSize={9} fontFamily="'JetBrains Mono',monospace">{ln}</text>;})}</g>;}} stroke="transparent"/><Tooltip content={adsetTip} cursor={{fill:"rgba(255,255,255,0.05)"}}/><Bar dataKey="CostPer" fill={P.ember} radius={[0,6,6,0]}/></BarChart></ResponsiveContainer></div>
                </div>
                <Insight title={objName+" Targeting Assessment"} accent={oc} icon={Ic.radar(oc,16)}>{(function(){var p=[];var objBench=objName==="App Store Clicks"||objName==="Landing Page Clicks"?benchmarks.meta.cpc:objName==="Leads"?benchmarks.meta.cpl:benchmarks.meta.cpf;var benchNote=oCostPer>0?" This is "+benchLabel(oCostPer,objBench)+".":"";p.push(objName+" targeting operates "+sorted6.length+" adsets across "+Object.keys(platGrp).join(", ")+" with "+fR(oSpend)+" total investment delivering "+fmt(oResults)+" results"+(oResults>0?" at "+fR(oCostPer)+" blended cost per result":"")+" and "+oCtr.toFixed(2)+"% Click Through Rate."+benchNote);Object.keys(platGrp).sort(function(a,b){return (platOrd3[a]||9)-(platOrd3[b]||9);}).forEach(function(plat){var pg=platGrp[plat];var pgCtr=pg.imps>0?(pg.clicks/pg.imps*100):0;var pgCost=pg.results>0?pg.spend/pg.results:0;var pgShareR=oResults>0?((pg.results/oResults)*100).toFixed(0):"0";var pgShareS=oSpend>0?((pg.spend/oSpend)*100).toFixed(0):"0";var pgEff=parseFloat(pgShareS)>0?(parseFloat(pgShareR)/parseFloat(pgShareS)).toFixed(1):"0";var pgHasScale=pg.spend>=oSpend*0.05&&pg.imps>=5000&&pg.results>=3;p.push(plat+" contributes "+fmt(pg.results)+" results ("+pgShareR+"%) from "+pgShareS+"% of objective budget"+(pg.results>0?" at "+fR(pgCost)+" cost per result":"")+" and "+pgCtr.toFixed(2)+"% CTR.");if(pgHasScale&&parseFloat(pgEff)>=1.3){p.push(plat+" delivers "+pgEff+"x more results per rand than its budget share, confirmed across "+fmt(pg.imps)+" impressions.");}else if(pgHasScale&&parseFloat(pgEff)<0.7){p.push(plat+" is underdelivering at "+pgEff+"x efficiency ratio across "+fmt(pg.imps)+" impressions, consuming more budget than its result contribution warrants.");}else if(!pgHasScale&&pg.results>0){p.push(plat+" results are from limited volume ("+fR(pg.spend)+" spend, "+fmt(pg.imps)+" impressions). Insufficient data to confirm whether this efficiency is sustainable at scale.");}if(pgHasScale&&pg.rows.length>1){var pBest=pg.rows.reduce(function(a,r){return r.result>a.result?r:a;},{result:0});var pBestShare=pg.results>0?((pBest.result/pg.results)*100).toFixed(0):"0";if(pBest.result>0&&pBest.spend>=pg.spend*0.1){p.push("The strongest "+plat+" adset is "+pBest.adsetName+" delivering "+pBestShare+"% of "+plat+" results"+(pBest.costPer>0?" at "+fR(pBest.costPer)+" cost per result":"")+".");}}});if(bestAd.result>=10&&bestAd.spend>=oSpend*0.05&&bestAd.impressions>=5000){p.push("Overall top performer with proven scale: "+bestAd.adsetName+" on "+bestAd.platform+" with "+fmt(bestAd.result)+" results"+(bestAd.costPer>0?" at "+fR(bestAd.costPer)+" cost per result":"")+" across "+fmt(bestAd.impressions)+" impressions.");}else if(bestAd.result>=3){p.push("Highest result count is "+bestAd.adsetName+" on "+bestAd.platform+" with "+fmt(bestAd.result)+" results at "+fR(bestAd.costPer)+" cost per result. "+(bestAd.result<10?"Volume is below the 10-result threshold for a confirmed performance read.":""));}else if(bestAd.result>0){p.push("No adset has yet reached the 10-result minimum required for a confirmed performance assessment. The highest count is "+fmt(bestAd.result)+" from "+bestAd.adsetName+" on "+bestAd.platform+".");}if(freqStatus==="critical"||freqStatus==="warning"){var freqAdsets=sorted6.filter(function(r){return r.platform==="Facebook"||r.platform==="Instagram";});if(freqAdsets.length>0){p.push("Note: Meta frequency is at "+m.frequency.toFixed(2)+"x"+(freqStatus==="critical"?" which has breached the fatigue ceiling. Performance of Meta adsets in this objective may be suppressed by audience saturation.":" and approaching the fatigue threshold. Monitor Meta adset CTR closely for signs of diminishing returns."));}}var zeroSpend=sorted6.filter(function(r){return r.spend>200&&r.result===0;});if(zeroSpend.length>0){var zeroTotal=zeroSpend.reduce(function(a,r){return a+r.spend;},0);p.push(zeroSpend.length+" adset"+(zeroSpend.length>1?"s have":" has")+" invested "+fR(zeroTotal)+" without producing results. This represents "+((zeroTotal/oSpend)*100).toFixed(1)+"% of objective budget with zero return.");}return p.join(" ");})()}</Insight>
              </div>);
            });

            var combinedChartData=allRows.slice().sort(function(a,b){return b.spend-a.spend;}).slice(0,10).map(function(r){
              var short=r.adsetName.length>20?r.adsetName.substring(0,17)+"...":r.adsetName;
              return{name:short,Clicks:r.clicks,CTR:r.ctr,Spend:r.spend,Platform:r.platform};
            });

            return <div>
              <div style={{background:P.glass,borderRadius:18,padding:"6px 24px 24px",marginBottom:28,border:"1px solid "+P.rule}}>
                <div style={{textAlign:"center",padding:"18px 0 16px"}}><span style={{fontSize:18,fontWeight:900,color:P.txt,fontFamily:ff,letterSpacing:1}}>ADSET PERFORMANCE BY OBJECTIVE</span><div style={{fontSize:10,color:P.sub,fontFamily:fm,marginTop:4,letterSpacing:3}}>TARGETING ANALYSIS</div></div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:24}}>
                  <Glass accent={P.solar} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>ACTIVE ADSETS</div><div style={{fontSize:22,fontWeight:900,color:P.solar,fontFamily:fm}}>{allRows.length}</div></Glass>
                  <Glass accent={P.mint} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>TOTAL CLICKS</div><div style={{fontSize:22,fontWeight:900,color:P.mint,fontFamily:fm}}>{fmt(totalClicks)}</div><div style={{fontSize:9,color:"rgba(255,255,255,0.5)",fontFamily:fm,marginTop:4}}>CTR: {blendedCtr.toFixed(2)+"%"}</div></Glass>
                  <Glass accent={P.ember} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>BLENDED CPC</div><div style={{fontSize:22,fontWeight:900,color:P.ember,fontFamily:fm}}>{fR(blendedCpc)}</div><div style={{fontSize:9,color:"rgba(255,255,255,0.5)",fontFamily:fm,marginTop:4}}>{fR(totalSpend)} invested</div></Glass>
                  <Glass accent={P.cyan} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>TOTAL REACH</div><div style={{fontSize:22,fontWeight:900,color:P.cyan,fontFamily:fm}}>{fmt(totalReach)}</div></Glass>
                </div>
                {platSections}
              </div>
              <div style={{background:P.glass,borderRadius:18,padding:"6px 24px 24px",marginBottom:28,border:"1px solid "+P.rule}}>
                <div style={{textAlign:"center",padding:"18px 0 16px"}}><span style={{fontSize:18,fontWeight:900,color:P.txt,fontFamily:ff,letterSpacing:1}}>TARGETING HEALTH SCORECARD</span><div style={{fontSize:10,color:P.sub,fontFamily:fm,marginTop:4,letterSpacing:3}}>ALL ADSETS RANKED BY PERFORMANCE</div></div>
                <div style={{display:"flex",gap:16,marginBottom:16,justifyContent:"center"}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{width:12,height:12,borderRadius:"50%",background:"#22c55e"}}></span><span style={{fontSize:10,color:P.sub,fontFamily:fm}}>Strong performer</span></div>
                  <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{width:12,height:12,borderRadius:"50%",background:"#f59e0b"}}></span><span style={{fontSize:10,color:P.sub,fontFamily:fm}}>Average / Monitor</span></div>
                  <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{width:12,height:12,borderRadius:"50%",background:"#ef4444"}}></span><span style={{fontSize:10,color:P.sub,fontFamily:fm}}>Underperforming / Action needed</span></div>
                </div>
                {(function(){
                  var scored=allRows.map(function(r){
                    var score=0;var assessment="";
                    var objPeers=allRows.filter(function(x){return x.objective===r.objective;});
                    var objWithResults=objPeers.filter(function(x){return x.result>0&&x.costPer>0;});
                    var objAvgCost=objWithResults.length>0?objWithResults.reduce(function(a,x){return a+x.costPer;},0)/objWithResults.length:0;
                    var objBestCost=objWithResults.length>0?objWithResults.reduce(function(a,x){return x.costPer<a?x.costPer:a;},Infinity):0;
                    var objTotalResults=objPeers.reduce(function(a,x){return a+x.result;},0);
                    var objTotalSpend=objPeers.reduce(function(a,x){return a+x.spend;},0);
                    var resultShare=objTotalResults>0?((r.result/objTotalResults)*100):0;
                    var spendShare=objTotalSpend>0?((r.spend/objTotalSpend)*100):0;
                    var efficiencyRatio=spendShare>0?(resultShare/spendShare):0;
                    var convRate=r.impressions>0?((r.result/r.impressions)*100):0;
                    var platPeers=objPeers.filter(function(x){return x.platform===r.platform&&x.result>0&&x.costPer>0;});
                    var platAvgCost=platPeers.length>0?platPeers.reduce(function(a,x){return a+x.costPer;},0)/platPeers.length:0;
                    var isTopInPlatform=platPeers.length>0&&r.costPer>0&&r.costPer<=platPeers.reduce(function(a,x){return x.costPer<a?x.costPer:a;},Infinity)*1.05;
                    var a=[];
                    if(r.spend>300&&r.result===0){
                      score=-3;
                      a.push("Zero results from "+fR(r.spend)+" spend ("+spendShare.toFixed(1)+"% of "+r.objective.toLowerCase()+" budget).");
                      a.push("This audience consumed budget without converting.");
                      if(r.ctr<0.5&&r.impressions>3000){a.push("CTR at "+r.ctr.toFixed(2)+"% confirms the creative is not resonating with this targeting segment.");}
                      else if(r.clicks>0){a.push(fmt(r.clicks)+" clicks generated but none converted, suggesting a landing page or offer disconnect.");}
                    }
                    else if(r.result===0&&r.spend>0){
                      score=-1;
                      a.push("In learning phase: "+fR(r.spend)+" spent, "+fmt(r.clicks)+" clicks, no conversions yet.");
                      a.push("Insufficient data to assess. Allow 48-72 hours of additional delivery.");
                    }
                    else if(r.result>0){
                      var hasScale=spendShare>=5&&r.impressions>=5000&&r.result>=10;
                      var hasSomeScale=spendShare>=2&&r.impressions>=2000&&r.result>=3;
                      if(hasScale&&efficiencyRatio>=1.5&&r.result>=10){
                        score=3;
                        a.push("Proven efficiency leader at scale: delivers "+resultShare.toFixed(0)+"% of results from "+spendShare.toFixed(0)+"% of budget ("+efficiencyRatio.toFixed(1)+"x return ratio) across "+fmt(r.impressions)+" impressions.");
                        a.push(fR(r.costPer)+" cost per result"+(objAvgCost>0?" vs "+fR(objAvgCost)+" objective average ("+((1-r.costPer/objAvgCost)*100).toFixed(0)+"% more efficient).":"."));
                        if(isTopInPlatform){a.push("Best performer on "+r.platform+".");}
                      }
                      else if(hasScale&&efficiencyRatio>=1.0&&r.result>=5){
                        score=2;
                        a.push("Strong performer at scale: "+resultShare.toFixed(0)+"% of results from "+spendShare.toFixed(0)+"% of budget across "+fmt(r.impressions)+" impressions.");
                        a.push(fmt(r.result)+" results at "+fR(r.costPer)+(objAvgCost>0?" ("+Math.abs(((1-r.costPer/objAvgCost)*100)).toFixed(0)+"% "+(r.costPer<objAvgCost?"below":"above")+" the "+fR(objAvgCost)+" average).":"."));
                        if(r.ctr>2){a.push("Strong "+r.ctr.toFixed(2)+"% CTR confirms audience-creative alignment.");}
                      }
                      else if(!hasSomeScale&&efficiencyRatio>=1.0){
                        score=1;
                        a.push("Early signal only: "+fmt(r.result)+" result"+(r.result>1?"s":"")+" at "+fR(r.costPer)+" from "+fR(r.spend)+" spend ("+spendShare.toFixed(1)+"% of objective budget). Not statistically meaningful.");
                        a.push("Insufficient volume to confirm performance. Needs more delivery before scaling, currently only "+fmt(r.impressions)+" impressions.");
                      }
                      else if(hasSomeScale&&efficiencyRatio>=1.0&&r.result>=3){
                        score=2;
                        a.push("Above average: "+resultShare.toFixed(0)+"% of results from "+spendShare.toFixed(0)+"% of budget.");
                        a.push(fmt(r.result)+" results at "+fR(r.costPer)+(objAvgCost>0?" ("+Math.abs(((1-r.costPer/objAvgCost)*100)).toFixed(0)+"% "+(r.costPer<objAvgCost?"below":"above")+" the "+fR(objAvgCost)+" average).":"."));
                      }
                      else if(hasSomeScale&&efficiencyRatio>=0.7){
                        score=1;
                        a.push("Average efficiency: "+resultShare.toFixed(0)+"% of results from "+spendShare.toFixed(0)+"% of budget.");
                        a.push(fR(r.costPer)+" cost per result"+(objAvgCost>0?" vs "+fR(objAvgCost)+" average.":"."));
                        if(r.ctr<1&&r.impressions>5000){a.push("CTR at "+r.ctr.toFixed(2)+"% across "+fmt(r.impressions)+" impressions suggests creative fatigue or audience mismatch.");}
                      }
                      else if(!hasSomeScale&&efficiencyRatio<1.0){
                        score=0;
                        a.push("Low volume: "+fmt(r.result)+" results from "+fR(r.spend)+" spend ("+spendShare.toFixed(1)+"% of objective budget).");
                        a.push("Sample too small to draw conclusions. "+fmt(r.impressions)+" impressions is insufficient for a reliable performance read.");
                      }
                      else{
                        score=-1;
                        a.push("Below average at scale: consuming "+spendShare.toFixed(0)+"% of budget but only delivering "+resultShare.toFixed(0)+"% of results ("+efficiencyRatio.toFixed(1)+"x ratio).");
                        a.push(fR(r.costPer)+" cost per result is "+(objAvgCost>0?(((r.costPer-objAvgCost)/objAvgCost)*100).toFixed(0)+"% above the "+fR(objAvgCost)+" average.":"above average."));
                        if(r.ctr<0.5&&r.impressions>5000){a.push("Low "+r.ctr.toFixed(2)+"% CTR across "+fmt(r.impressions)+" impressions confirms poor audience-creative fit.");}
                      }
                    }
                    else{score=0;a.push(fR(r.spend)+" invested, "+fmt(r.clicks)+" clicks at "+r.ctr.toFixed(2)+"% CTR. Conversion tracking pending.");}
                    var status=score>=2?"strong":score>=0?"average":"weak";
                    if(r.result>0&&r.result<3&&r.costPer>0&&objAvgCost>0&&r.costPer>objAvgCost*3){status="weak";statusColor="#ef4444";statusLabel="Action";assessment="Only "+fmt(r.result)+" result"+(r.result>1?"s":"")+" at "+fR(r.costPer)+" cost per result, which is "+((r.costPer/objAvgCost)).toFixed(0)+"x the "+fR(objAvgCost)+" objective average. Insufficient volume at excessive cost.";}
                    if(r.result>=1&&r.result<3&&r.spend>500){status=status==="strong"?"average":status;if(status!=="weak"){statusColor="#f59e0b";statusLabel="Monitor";assessment="Only "+fmt(r.result)+" result"+(r.result>1?"s":"")+" from "+fR(r.spend)+" spend. Sample size too small to validate performance. Requires more data before drawing conclusions.";}}
                    var statusColor=score>=2?"#22c55e":score>=0?"#f59e0b":"#ef4444";
                    var statusLabel=score>=2?"Performing":score>=0?"Monitor":"Action";
                    return{row:r,score:score,status:status,statusColor:statusColor,statusLabel:statusLabel,assessment:a.join(" ")};
                  });
                  scored.sort(function(a,b){var po=(platOrd3[a.row.platform]||9)-(platOrd3[b.row.platform]||9);if(po!==0)return po;return b.row.result-a.row.result;});

                  return <div>
                    <table style={{width:"100%",borderCollapse:"collapse",marginBottom:16}}>
                      <thead><tr>{["Status","Adset (Targeting)","Platform","Objective","Spend","Results","Cost Per","CTR %","Assessment"].map(function(h,hi){return <th key={hi} style={{padding:"10px 12px",fontSize:9,fontWeight:800,textTransform:"uppercase",color:"#F96203",letterSpacing:1,textAlign:hi===1?"left":"center",background:"rgba(249,98,3,0.15)",border:"1px solid rgba(249,98,3,0.3)",fontFamily:fm}}>{h}</th>;})}</tr></thead>
                      <tbody>{scored.map(function(s,si){
                        var r=s.row;var pc4=platCol3[r.platform]||P.ember;
                        return <tr key={si} style={{background:pc4+"08",borderTop:si>0&&scored[si-1].row.platform!==r.platform?"3px solid "+pc4+"40":"none"}}>
                          <td style={{padding:"10px 8px",textAlign:"center",border:"1px solid "+P.rule}}><span style={{background:s.statusColor,color:"#fff",fontSize:9,fontWeight:900,padding:"4px 10px",borderRadius:5,textTransform:"uppercase"}}>{s.statusLabel}</span></td>
                          <td title={r.adsetName} style={{padding:"10px 12px",fontSize:11,fontWeight:600,color:P.txt,border:"1px solid "+P.rule,maxWidth:260,lineHeight:1.4}}><div style={{whiteSpace:"normal",wordBreak:"break-word"}}>{r.adsetName}</div></td>
                          <td style={{padding:"10px 8px",textAlign:"center",border:"1px solid "+P.rule}}><span style={{background:pc4,color:"#fff",fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:10}}>{platBdg3[r.platform]||"?"}</span></td>
                          <td style={{padding:"10px 8px",textAlign:"center",border:"1px solid "+P.rule,fontSize:10,color:P.sub}}>{r.objective}</td>
                          <td style={{padding:"10px 8px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:11,fontWeight:700,color:P.txt}}>{fR(r.spend)}</td>
                          <td style={{padding:"10px 8px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,fontWeight:900,color:r.result>0?s.statusColor:P.dim}}>{fmt(r.result)}</td>
                          <td style={{padding:"10px 8px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:11,fontWeight:700,color:r.costPer>0?P.ember:P.dim}}>{r.costPer>0?fR(r.costPer):"-"}</td>
                          <td style={{padding:"10px 8px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:11,fontWeight:700,color:r.ctr>2?P.mint:r.ctr>1?P.txt:r.ctr>0?P.warning:P.dim}}>{r.ctr.toFixed(2)+"%"}</td>
                          <td style={{padding:"10px 10px",border:"1px solid "+P.rule,fontSize:10,color:P.sub,lineHeight:1.5,maxWidth:220}}>{s.assessment}</td>
                        </tr>;})}</tbody>
                    </table>
                    <Insight title="Targeting Health Summary" accent={P.solar} icon={Ic.radar(P.solar,16)}>{(function(){var strong=scored.filter(function(s){return s.status==="strong";});var avg=scored.filter(function(s){return s.status==="average";});var weak=scored.filter(function(s){return s.status==="weak";});var p=[];p.push("Across "+scored.length+" active adsets: "+strong.length+" are performing strongly (green), "+avg.length+" require monitoring (orange), and "+weak.length+" need immediate attention (red).");if(strong.length>0){p.push("Top performers include "+strong.slice(0,2).map(function(s){return s.row.adsetName+" on "+s.row.platform+" ("+fmt(s.row.result)+" results at "+fR(s.row.costPer)+")";}).join(" and ")+". These adsets demonstrate strong audience-creative alignment and should be considered for increased budget allocation.");}if(weak.length>0){var weakSpend=weak.reduce(function(a,s){return a+s.row.spend;},0);p.push(weak.length+" adset"+(weak.length>1?"s":"")+" flagged for action represent"+( weakSpend>0?" "+fR(weakSpend)+" of potentially misallocated budget.":". ")+" "+(weak.length>0?"The primary issues are: "+weak.slice(0,2).map(function(s){return s.row.adsetName+" on "+s.row.platform;}).join("; ")+".":""));}if(strong.length>0&&weak.length>0){p.push("Reallocating budget from underperforming (red) adsets to proven (green) performers would improve overall campaign Return On Investment without increasing total media spend.");}if(freqStatus==="critical"||freqStatus==="warning"){p.push("Meta frequency at "+m.frequency.toFixed(2)+"x is "+(freqStatus==="critical"?"above the 4x saturation ceiling":"approaching the 3x fatigue threshold")+". This compounds the underperformance of weaker adsets, making reallocation and creative refresh more urgent.");}return p.join(" ");})()}</Insight>
                  </div>;
                })()}
              </div>
            </div>;
          })()}
        </div>)}        {tab==="community"&&(<div>
          <SH icon={Ic.users(P.mint,20)} title="Community Growth" sub={df+" to "+dt+" \u00b7 Followers & Likes by Platform"} accent={P.mint}/>
          <div style={{background:P.glass,borderRadius:18,padding:"6px 24px 24px",marginBottom:28,border:"1px solid "+P.rule}}>
            <div style={{textAlign:"center",padding:"18px 0 16px"}}><span style={{fontSize:18,fontWeight:900,color:P.txt,fontFamily:ff,letterSpacing:1}}>COMMUNITY GROWTH</span><div style={{fontSize:10,color:P.sub,fontFamily:fm,marginTop:4,letterSpacing:3}}>TOTAL COMMUNITY & PERIOD GROWTH</div></div>
            {(function(){
              var sel=campaigns.filter(function(x){return selected.indexOf(x.campaignId)>=0;});
              var fbEarned=0;var ttEarned=0;var igEarned=0;
              var fbSpend=0;var ttSpend=0;var igSpend=0;
              sel.forEach(function(camp){
                var n=(camp.campaignName||"").toLowerCase();
                var isFollowLike=n.indexOf("follower")>=0||n.indexOf("_like_")>=0||n.indexOf("_like ")>=0||n.indexOf("paidsocial_like")>=0||n.indexOf("page like")>=0||n.indexOf("pagelikes")>=0||n.indexOf("like_facebook")>=0||n.indexOf("like_instagram")>=0;
                if(isFollowLike){
                  if(camp.platform==="Facebook"){fbEarned+=parseFloat(camp.pageLikes||0)+parseFloat(camp.follows||0);fbSpend+=parseFloat(camp.spend||0);}
                  if(camp.platform==="Instagram"){var igG=findIgGrowth(camp.campaignName,pages);igEarned+=igG>0?igG:0;igSpend+=parseFloat(camp.spend||0);}
                  if(camp.platform==="TikTok"){ttEarned+=parseFloat(camp.follows||0);ttSpend+=parseFloat(camp.spend||0);}
                }
              });
              var totalEarned=fbEarned+igEarned+ttEarned;
              var totalSpend=fbSpend+igSpend+ttSpend;
              var fbPage=null;var igAccount=null;
              var bestScore3=0;
              var matchedPages2=[];var matchedIds2={};
              for(var s=0;s<sel.length;s++){
                var bestPg=null;var bestSc=0;
                for(var p=0;p<pages.length;p++){
                  var pg=pages[p];
                  var sc3=autoMatchPage(sel[s].campaignName,pg.name);
                  if(sc3>bestSc){bestSc=sc3;bestPg=pg;}
                }
                if(bestSc<2){
                  var cn2=(sel[s].campaignName||"").toLowerCase();
                  for(var oi2=0;oi2<pageOverrides.length;oi2++){
                    if(cn2.indexOf(pageOverrides[oi2].campaign)>=0){
                      for(var p2=0;p2<pages.length;p2++){
                        if((pages[p2].name||"").toLowerCase().indexOf(pageOverrides[oi2].page)>=0){bestPg=pages[p2];bestSc=10;break;}
                      }
                    }
                  }
                }
                if(bestPg&&bestSc>=2&&matchedIds2[bestPg.id]!==true){matchedPages2.push(bestPg);matchedIds2[bestPg.id]=true;}
              }
              var fbTotal=0;var igTotal=0;
              if(matchedPages2.length>0){
                matchedPages2.forEach(function(mp){fbTotal+=mp.followers_count||mp.fan_count||0;if(mp.instagram_business_account){igTotal+=mp.instagram_business_account.followers_count||0;}});
                fbPage=matchedPages2[0];
                if(fbPage.instagram_business_account){igAccount=fbPage.instagram_business_account;}
              }
              var ttTotal=(function(){var selNames2=sel.map(function(x){return x.campaignName;}).join(" ");return getTtTotal(selNames2,ttEarned);})();var grandTotal=fbTotal+igTotal+ttTotal;
              return <div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16,marginBottom:24}}>
                  <Glass accent={P.fb} hv={true} st={{padding:22}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,marginBottom:14}}><span style={{width:10,height:10,borderRadius:"50%",background:P.fb}}></span><span style={{fontSize:11,fontWeight:700,color:P.fb,fontFamily:fm}}>FACEBOOK</span></div>
                    <div style={{textAlign:"center",marginBottom:14}}><div style={{fontSize:9,color:"rgba(255,255,255,0.6)",fontFamily:fm,letterSpacing:2,marginBottom:4}}>TOTAL FOLLOWERS</div><div style={{fontSize:36,fontWeight:900,color:P.fb,fontFamily:fm}}>{fmt(fbTotal)}</div></div>
                    <div style={{borderTop:"1px solid "+P.rule,paddingTop:12,display:"flex",justifyContent:"space-between"}}><div style={{textAlign:"center",flex:1}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:1,marginBottom:2}}>EARNED THIS PERIOD</div><div style={{fontSize:18,fontWeight:900,color:P.mint,fontFamily:fm}}>+{fmt(fbEarned)}</div></div><div style={{textAlign:"center",flex:1}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:1,marginBottom:2}}>COST PER FOLLOWER</div><div style={{fontSize:14,fontWeight:700,color:P.ember,fontFamily:fm}}>{fbEarned>0?fR(fbSpend/fbEarned):"-"}</div></div></div>
                  </Glass>
                  <Glass accent={P.ig} hv={true} st={{padding:22}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,marginBottom:14}}><span style={{width:10,height:10,borderRadius:"50%",background:P.ig}}></span><span style={{fontSize:11,fontWeight:700,color:P.ig,fontFamily:fm}}>INSTAGRAM</span></div>
                    <div style={{textAlign:"center",marginBottom:14}}><div style={{fontSize:9,color:"rgba(255,255,255,0.6)",fontFamily:fm,letterSpacing:2,marginBottom:4}}>TOTAL FOLLOWERS</div><div style={{fontSize:36,fontWeight:900,color:P.ig,fontFamily:fm}}>{fmt(igTotal)}</div></div>
                    <div style={{borderTop:"1px solid "+P.rule,paddingTop:12,display:"flex",justifyContent:"space-between"}}><div style={{textAlign:"center",flex:1}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:1,marginBottom:2}}>EARNED THIS PERIOD</div><div style={{fontSize:18,fontWeight:900,color:P.mint,fontFamily:fm}}>+{fmt(igEarned)}</div></div><div style={{textAlign:"center",flex:1}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:1,marginBottom:2}}>COST PER FOLLOW</div><div style={{fontSize:14,fontWeight:700,color:P.ember,fontFamily:fm}}>{igEarned>0?fR(igSpend/igEarned):"-"}</div></div></div>
                  </Glass>
                  <Glass accent={P.tt} hv={true} st={{padding:22}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,marginBottom:14}}><span style={{width:10,height:10,borderRadius:"50%",background:P.tt}}></span><span style={{fontSize:11,fontWeight:700,color:P.tt,fontFamily:fm}}>TIKTOK</span></div>
                    <div style={{textAlign:"center",marginBottom:14}}><div style={{fontSize:9,color:"rgba(255,255,255,0.6)",fontFamily:fm,letterSpacing:2,marginBottom:4}}>TOTAL FOLLOWERS</div><div style={{fontSize:36,fontWeight:900,color:P.tt,fontFamily:fm}}>{fmt((function(){var selNames=sel.map(function(x){return x.campaignName;}).join(" ");return getTtTotal(selNames,ttEarned);})())}</div></div>
                    <div style={{borderTop:"1px solid "+P.rule,paddingTop:12,display:"flex",justifyContent:"space-between"}}><div style={{textAlign:"center",flex:1}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:1,marginBottom:2}}>EARNED THIS PERIOD</div><div style={{fontSize:18,fontWeight:900,color:P.mint,fontFamily:fm}}>+{fmt(ttEarned)}</div></div><div style={{textAlign:"center",flex:1}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:1,marginBottom:2}}>COST PER FOLLOW</div><div style={{fontSize:14,fontWeight:700,color:P.ember,fontFamily:fm}}>{ttEarned>0?fR(ttSpend/ttEarned):"-"}</div></div></div>
                  </Glass>
                </div>
                <div style={{background:"rgba(0,0,0,0.15)",borderRadius:12,padding:20,marginBottom:20}}>
                  <div style={{fontSize:10,fontWeight:800,color:P.sub,letterSpacing:3,fontFamily:fm,textTransform:"uppercase",marginBottom:14}}>Period Growth by Platform</div>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={[{name:"FB Likes",value:fbEarned},{name:"IG Followers",value:igEarned},{name:"TT Follows",value:ttEarned}]} barSize={50}>
                      <CartesianGrid strokeDasharray="3 3" stroke={P.rule}/>
                      <XAxis dataKey="name" tick={{fontSize:11,fill:"rgba(255,255,255,0.85)",fontFamily:fm}} stroke="transparent"/>
                      <YAxis tick={{fontSize:10,fill:"rgba(255,255,255,0.6)",fontFamily:fm}} stroke="transparent" tickFormatter={function(v){return fmt(v);}}/>
                      <Tooltip content={<Tip/>} wrapperStyle={{outline:"none"}} cursor={{fill:"rgba(255,255,255,0.05)"}}/>
                      <Bar dataKey="value" name="Earned" radius={[6,6,0,0]}><Cell fill={P.fb}/><Cell fill={P.ig}/><Cell fill={P.tt}/></Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
                  <Glass accent={P.mint} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>TOTAL COMMUNITY</div><div style={{fontSize:22,fontWeight:900,color:P.mint,fontFamily:fm}}>{fmt(grandTotal)}</div></Glass>
                  <Glass accent={P.ember} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>EARNED THIS PERIOD</div><div style={{fontSize:22,fontWeight:900,color:P.ember,fontFamily:fm}}>+{fmt(totalEarned)}</div></Glass>
                  <Glass accent={P.orchid} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>GROWTH RATE</div><div style={{fontSize:22,fontWeight:900,color:P.orchid,fontFamily:fm}}>{grandTotal>0?(totalEarned/grandTotal*100).toFixed(1)+"%":"-"}</div></Glass>
                  <Glass accent={P.solar} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>COST PER MEMBER</div><div style={{fontSize:22,fontWeight:900,color:P.solar,fontFamily:fm}}>{totalEarned>0?fR(totalSpend/totalEarned):"-"}</div></Glass>
                </div>
                <Insight title="Community Growth Analysis" accent={P.mint} icon={Ic.users(P.mint,16)}>{(function(){var p=[];if(totalEarned===0&&grandTotal===0){return "No community data available for the selected campaigns.";}if(grandTotal>0){p.push("The brand\'s total social community stands at "+fmt(grandTotal)+" members across Facebook, Instagram, and TikTok.");}if(totalEarned>0){p.push("During the selected period, the community grew by "+fmt(totalEarned)+" new members with "+fR(totalSpend)+" invested at a blended cost of "+fR(totalSpend/totalEarned)+" per new member.");}if(fbTotal>0){p.push("Facebook leads with "+fmt(fbTotal)+" total page likes"+(fbEarned>0?", adding "+fmt(fbEarned)+" new likes at "+fR(fbSpend/fbEarned)+" cost per follower during this period":"")+". Each page like permanently increases organic News Feed distribution.");}if(igTotal>0){p.push("Instagram has "+fmt(igTotal)+" total followers"+(igEarned>0?", growing by "+fmt(igEarned)+" followers during this period":"")+". Instagram followers directly increase Stories, Reels, and Feed visibility.");}if(ttEarned>0){p.push("TikTok has "+fmt(ttTotal)+" total followers, growing by "+fmt(ttEarned)+" new follows this period at "+fR(ttSpend/ttEarned)+" cost per follow. Each TikTok follower feeds into the For You page recommendation engine, amplifying organic reach.");}return p.join(" ");})()}</Insight>
              </div>;
            })()}
          </div>
        </div>)}

        {tab==="deepdive"&&(<div>
          <SH icon={Ic.eye(P.cyan,20)} title="Deep Dive" sub="Demographics, Creative Performance & Placement Analysis" accent={P.cyan}/>
          <Glass accent={P.cyan} st={{padding:"36px 32px",marginBottom:24}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,marginBottom:28}}>
              <div style={{padding:24,background:P.fb+"08",border:"1px solid "+P.fb+"20",borderRadius:14,textAlign:"center"}}><div style={{fontSize:9,fontWeight:700,color:P.fb,letterSpacing:2,fontFamily:fm,marginBottom:8}}>DEMOGRAPHICS</div><div style={{fontSize:14,fontWeight:700,color:P.txt,marginBottom:4}}>Age, Gender, Location</div><div style={{fontSize:11,color:P.sub}}>Audience composition breakdown</div></div>
              <div style={{padding:24,background:P.tt+"08",border:"1px solid "+P.tt+"20",borderRadius:14,textAlign:"center"}}><div style={{fontSize:9,fontWeight:700,color:P.tt,letterSpacing:2,fontFamily:fm,marginBottom:8}}>CREATIVE</div><div style={{fontSize:14,fontWeight:700,color:P.txt,marginBottom:4}}>Ad Thumbnails & Performance</div><div style={{fontSize:11,color:P.sub}}>Visual creative ranking with metrics</div></div>
              <div style={{padding:24,background:P.orchid+"08",border:"1px solid "+P.orchid+"20",borderRadius:14,textAlign:"center"}}><div style={{fontSize:9,fontWeight:700,color:P.orchid,letterSpacing:2,fontFamily:fm,marginBottom:8}}>PLACEMENTS</div><div style={{fontSize:14,fontWeight:700,color:P.txt,marginBottom:4}}>Feed, Stories, Reels, Network</div><div style={{fontSize:11,color:P.sub}}>Delivery by placement type</div></div>
              <div style={{padding:24,background:P.mint+"08",border:"1px solid "+P.mint+"20",borderRadius:14,textAlign:"center"}}><div style={{fontSize:9,fontWeight:700,color:P.mint,letterSpacing:2,fontFamily:fm,marginBottom:8}}>OBJECTIVE RESULTS</div><div style={{fontSize:14,fontWeight:700,color:P.txt,marginBottom:4}}>Results by Campaign Objective</div><div style={{fontSize:11,color:P.sub}}>Objective-level performance data</div></div>
            </div>
            <div style={{textAlign:"center"}}><button onClick={function(){var r=findLookerUrl(campaigns,selected);if(r.url){window.open(r.url,"_blank");}else{alert("No Looker report configured for '"+r.client+"' yet.");}}} style={{background:gEmber,border:"none",borderRadius:14,padding:"16px 48px",color:"#fff",fontSize:15,fontWeight:800,fontFamily:ff,cursor:"pointer",boxShadow:"0 4px 24px "+P.ember+"40",display:"inline-flex",alignItems:"center",gap:10}}>Open Interactive Report {Ic.share("#fff",18)}</button><div style={{fontSize:11,color:P.dim,fontFamily:fm,marginTop:14}}>Opens Looker Studio in a new tab with full interactive drill-down analysis</div></div>
          </Glass>
          <Insight title="Deep Dive Analysis" accent={P.cyan} icon={Ic.eye(P.cyan,16)}>The Looker Studio report provides granular campaign analysis that complements the dashboard metrics above. It includes audience demographic breakdowns by age, gender, and geographic region, individual ad creative performance with visual thumbnails ranked by key metrics, placement-level delivery analysis across Feed, Stories, Reels, and Audience Network, and device-level performance data showing mobile versus desktop engagement patterns. Use the interactive filters within the report to drill into specific campaigns, date ranges, and audience segments.</Insight>
        </div>)}

        {tab==="optimise"&&!isClient&&(<div>
          <SH icon={Ic.flag(P.warning,20)} title="Optimisation, Flags & Recommendations" sub={flags.length+" flags · "+openFlags+" open · Auto-generated"} accent={P.warning}/>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:24}}>
            {[{l:"CRITICAL",c:P.critical},{l:"WARNING",c:P.warning},{l:"INFO",c:P.info},{l:"POSITIVE",c:P.positive}].map(function(x){return<Glass key={x.l} accent={x.c} st={{padding:"18px 16px",textAlign:"center"}}><div style={{fontSize:9,fontWeight:700,color:x.c,letterSpacing:2,fontFamily:fm,marginBottom:6}}>{x.l}</div><div style={{fontSize:28,fontWeight:900,color:x.c,fontFamily:fm}}>{flags.filter(function(f){return f.severity===x.l.toLowerCase();}).length}</div></Glass>;})}
          </div>

          {flags.length===0&&<div style={{padding:40,textAlign:"center",color:P.dim,fontFamily:fm}}>No flags. Select campaigns and refresh.</div>}
          {flags.map(function(f){
            var c={critical:P.critical,warning:P.warning,info:P.info,positive:P.positive}[f.severity]||P.info;
            return<div key={f.id} style={{padding:"18px 22px",marginBottom:10,background:P.glass,border:"1px solid "+P.rule,borderLeft:"4px solid "+c,borderRadius:"0 12px 12px 0"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}><SevBadge s={f.severity}/><Pill name={f.platform} color={f.platform==="TikTok"?P.tt:f.platform==="Cross-platform"?P.orchid:P.fb}/></div>
                <div style={{display:"flex",gap:6}}>
                  {f.status==="open"&&<button onClick={function(){ack(f.id);}} style={{background:P.glass,border:"1px solid "+P.rule,borderRadius:8,padding:"5px 12px",color:P.sub,fontSize:10,fontWeight:700,fontFamily:fm,cursor:"pointer"}}>Acknowledge</button>}
                  {(f.status==="open"||f.status==="acknowledged")&&<button onClick={function(){resolve(f.id);}} style={{background:P.mint+"15",border:"1px solid "+P.mint+"30",borderRadius:8,padding:"5px 12px",color:P.mint,fontSize:10,fontWeight:700,fontFamily:fm,cursor:"pointer"}}>Resolve</button>}
                  {f.status==="resolved"&&<span style={{fontSize:10,color:P.mint,fontFamily:fm,fontWeight:700}}>Resolved</span>}
                </div>
              </div>
              <div style={{fontSize:13,fontWeight:700,color:P.txt,marginBottom:6}}>{f.metric}: {f.currentValue} {f.severity!=="positive"?"exceeds":"beats"} {f.threshold} threshold</div>
              <div style={{fontSize:12,color:P.sub,lineHeight:1.8}}>{f.message}</div>
              <div style={{fontSize:12,color:c,marginTop:8}}><strong>Recommendation:</strong> {f.recommendation}</div>
            </div>;
          })}

          <Insight title="Optimisation Summary" accent={P.warning} icon={Ic.alert(P.warning,16)}>{flags.length} flags generated from selected campaign data. {openFlags} require attention. Review recommendations and take action to maintain optimal performance. Flags refresh when you change dates or campaign selection.</Insight>
        </div>)}

        </>)}
      </div>
    </div>

    <footer style={{borderTop:"1px solid "+P.rule,background:"rgba(6,2,14,0.95)",padding:"20px 28px"}}><div style={{maxWidth:1400,margin:"0 auto",display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={{display:"flex",alignItems:"center",gap:10}}><div style={{width:26,height:26,borderRadius:"50%",overflow:"hidden"}}><img src="/GAS_LOGO_EMBLEM_GAS_Primary_Gradient.png" alt="GAS" style={{width:"100%",height:"100%",objectFit:"cover"}}/></div><span style={{fontSize:11,fontWeight:800,color:P.sub,fontFamily:fm,letterSpacing:2}}>MEDIA ON GAS</span><span style={{fontSize:9,color:P.dim}}>Powered by GAS Marketing Automation</span></div><div style={{fontSize:9,color:P.dim,fontFamily:fm,textAlign:"right",lineHeight:1.8}}>Live data · All figures in ZAR · Confidential · grow@gasmarketing.co.za</div></div></footer>
  </div>);
}
