import { useState, useEffect, useMemo } from "react";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

var P={void:"#06020e",cosmos:"#0d0618",nebula:"#150b24",glass:"rgba(30,18,50,0.65)",ember:"#FF6B00",blaze:"#FF3D00",solar:"#FFAA00",lava:"#E8231A",orchid:"#A855F7",violet:"#7C3AED",fuchsia:"#D946EF",rose:"#F43F5E",cyan:"#22D3EE",mint:"#34D399",fb:"#4599FF",ig:"#E1306C",tt:"#00F2EA",txt:"#EDE9F5",sub:"#8B7FA3",dim:"#4A3D60",rule:"rgba(168,85,247,0.12)",critical:"#ef4444",warning:"#fbbf24",info:"#60a5fa",positive:"#4ade80"};
var gFire="linear-gradient(135deg,#E8231A,#FF6B00,#FFAA00)",gEmber="linear-gradient(135deg,#FF3D00,#FF6B00)";
var ff="Outfit,Segoe UI,Trebuchet MS,sans-serif",fm="Consolas,Lucida Console,Courier New,monospace";
var API=window.location.origin;
var fmt=function(n){var v=parseFloat(n);if(isNaN(v))return"0";if(v>=1e6)return(v/1e6).toFixed(2)+"M";if(v>=1e3)return(v/1e3).toFixed(1)+"K";return Math.round(v).toLocaleString();};
var fR=function(n){var v=parseFloat(n);return isNaN(v)?"R0.00":"R"+v.toLocaleString("en-ZA",{minimumFractionDigits:2,maximumFractionDigits:2});};
var pc=function(n){var v=parseFloat(n);return isNaN(v)?"0.00%":v.toFixed(2)+"%";};

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
function Metric(props){return(<Glass accent={props.accent} hv={true} st={{padding:"20px 18px"}}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>{props.icon}<span style={{fontSize:10,fontWeight:700,color:P.sub,letterSpacing:2.5,textTransform:"uppercase",fontFamily:fm}}>{props.label}</span></div><div style={{fontSize:24,fontWeight:900,fontFamily:ff,lineHeight:1,color:props.accent}}>{props.value}</div>{props.sub&&<div style={{fontSize:10,color:P.dim,marginTop:8,fontFamily:fm,lineHeight:1.6}}>{props.sub}</div>}</Glass>);}
function SH(props){var a=props.accent||P.ember;return(<div style={{marginBottom:28}}><div style={{display:"flex",alignItems:"center",gap:14}}><div style={{width:40,height:40,borderRadius:12,background:"linear-gradient(135deg,"+a+"20,"+a+"08)",border:"1px solid "+a+"30",display:"flex",alignItems:"center",justifyContent:"center"}}>{props.icon}</div><div><h2 style={{margin:0,fontSize:22,fontWeight:900,color:P.txt,fontFamily:ff}}>{props.title}</h2>{props.sub&&<p style={{margin:"2px 0 0",fontSize:11,color:P.sub,fontFamily:fm}}>{props.sub}</p>}</div></div><div style={{height:1,marginTop:16,background:"linear-gradient(90deg,"+a+"50,"+a+"15,transparent 80%)"}}/></div>);}
function Pill(props){return(<span style={{display:"inline-flex",alignItems:"center",gap:5,background:props.color+"12",border:"1px solid "+props.color+"30",borderRadius:20,padding:"3px 10px",fontSize:9,fontWeight:700,color:props.color,fontFamily:fm,textTransform:"uppercase"}}><span style={{width:6,height:6,borderRadius:"50%",background:props.color}}/>{props.name}</span>);}
function Tip(props){if(!props.active||!props.payload||!props.payload.length)return null;return(<div style={{background:"rgba(22,12,38,0.95)",border:"1px solid "+P.rule,borderRadius:12,padding:"10px 14px"}}><div style={{fontSize:11,fontWeight:800,color:P.txt,fontFamily:fm,marginBottom:4}}>{props.label}</div>{props.payload.map(function(p,i){return<div key={i} style={{fontSize:11,color:p.color||P.sub,fontFamily:fm,lineHeight:1.8}}>{p.name}: {typeof p.value==="number"?p.value.toLocaleString():p.value}</div>;})}</div>);}
function PH(props){var bg=props.platform==="Facebook"?P.fb:props.platform==="Instagram"?"linear-gradient(135deg,#e1306c,#833ab4)":props.platform==="TikTok"?"#1e1e2e":P.ember;return(<div style={{background:bg,padding:"12px 22px",borderRadius:10,marginBottom:16}}><span style={{fontSize:14,fontWeight:800,color:"#fff",fontFamily:ff}}>{props.platform}{props.suffix?" \u00B7 "+props.suffix:""}</span></div>);}
function Insight(props){var a=props.accent||P.ember;return(<div style={{marginTop:20,padding:"18px 22px",background:"linear-gradient(135deg,"+a+"06,"+a+"02)",border:"1px solid "+a+"18",borderLeft:"4px solid "+a,borderRadius:"0 12px 12px 0"}}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>{props.icon||Ic.bolt(a,16)}<span style={{fontSize:10,fontWeight:800,color:a,letterSpacing:3,fontFamily:fm,textTransform:"uppercase"}}>{props.title||"Campaign Read"}</span></div><div style={{fontSize:13,color:P.txt,lineHeight:2,fontFamily:ff}}>{props.children}</div></div>);}
function SevBadge(props){var c={critical:P.critical,warning:P.warning,info:P.info,positive:P.positive}[props.s]||P.info;return(<span style={{display:"inline-flex",alignItems:"center",gap:5,background:c+"18",border:"1px solid "+c+"40",borderRadius:6,padding:"3px 10px",fontSize:10,fontWeight:800,color:c,fontFamily:fm,textTransform:"uppercase"}}><span style={{width:7,height:7,borderRadius:"50%",background:c}}/>{props.s}</span>);}

function CampaignSelector(props){
  var cs=props.campaigns,sel=props.selected,search=props.search;
  var f=cs.filter(function(c){return c.campaignName.toLowerCase().indexOf(search.toLowerCase())>=0||c.accountName.toLowerCase().indexOf(search.toLowerCase())>=0;});
  var g={};f.forEach(function(c){var k=c.platform+"\u2014"+c.accountName;if(!g[k])g[k]={platform:c.platform,campaigns:[]};g[k].campaigns.push(c);});
  return(<div style={{background:P.glass,border:"1px solid "+P.rule,borderRadius:16,padding:18,maxHeight:480,overflowY:"auto"}}>
    <input placeholder="Search campaigns..." value={search} onChange={function(e){props.onSearch(e.target.value);}} style={{width:"100%",boxSizing:"border-box",background:"rgba(40,25,60,0.5)",border:"1px solid "+P.rule,borderRadius:8,padding:"8px 14px",color:P.txt,fontSize:12,fontFamily:fm,outline:"none",marginBottom:12}}/>
    <div style={{display:"flex",gap:8,marginBottom:12}}>
      <button onClick={props.onSelectAll} style={{background:P.ember+"15",border:"1px solid "+P.ember+"30",borderRadius:8,padding:"4px 12px",color:P.ember,fontSize:10,fontWeight:700,fontFamily:fm,cursor:"pointer"}}>All ({f.length})</button>
      <button onClick={props.onClearAll} style={{background:P.rule,border:"1px solid "+P.rule,borderRadius:8,padding:"4px 12px",color:P.sub,fontSize:10,fontWeight:700,fontFamily:fm,cursor:"pointer"}}>Clear</button>
      <span style={{fontSize:10,color:P.dim,fontFamily:fm,alignSelf:"center",marginLeft:"auto"}}>{sel.length} sel</span>
    </div>
    {Object.keys(g).map(function(k){var gr=g[k];var gc=gr.platform==="TikTok"?P.tt:P.fb;return(<div key={k} style={{marginBottom:12}}><div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6,paddingBottom:4,borderBottom:"1px solid "+P.rule}}><span style={{width:7,height:7,borderRadius:"50%",background:gc}}/><span style={{fontSize:9,fontWeight:800,color:gc,letterSpacing:2,textTransform:"uppercase",fontFamily:fm}}>{k}</span></div>
      {gr.campaigns.map(function(c){var s=sel.indexOf(c.campaignId)>=0;return(<div key={c.campaignId} onClick={function(){props.onToggle(c.campaignId);}} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",marginBottom:2,borderRadius:8,cursor:"pointer",background:s?gc+"10":"transparent",border:"1px solid "+(s?gc+"30":"transparent")}}>
        <div style={{width:18,height:18,borderRadius:5,border:"2px solid "+(s?gc:P.dim),background:s?gc:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{s&&Ic.check("#fff",12)}</div>
        <div style={{flex:1,minWidth:0}}><div style={{fontSize:11,fontWeight:600,color:s?P.txt:P.sub,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.campaignName}</div><div style={{fontSize:9,color:P.dim,fontFamily:fm}}>{fmt(c.impressions)} imps \u00B7 {fR(parseFloat(c.spend))}</div></div>
      </div>);})}
    </div>);})}
  </div>);
}

function ShareModal(props){var cs=useState(false);var copy=function(){navigator.clipboard.writeText(window.location.href);cs[1](true);setTimeout(function(){cs[1](false);},2000);};return(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000}} onClick={props.onClose}><div onClick={function(e){e.stopPropagation();}} style={{background:P.cosmos,border:"1px solid "+P.rule,borderRadius:20,padding:32,width:480,maxWidth:"90vw"}}><div style={{fontSize:18,fontWeight:900,color:P.txt,fontFamily:ff,marginBottom:6}}>Share with Client</div><div style={{fontSize:12,color:P.sub,marginBottom:16}}>Client gets read-only access with date toggles. No campaign selector, no optimisation tab.</div><div style={{display:"flex",gap:8}}><input readOnly value={window.location.href} style={{flex:1,background:P.glass,border:"1px solid "+P.rule,borderRadius:10,padding:"10px 14px",color:P.txt,fontSize:12,fontFamily:fm,outline:"none"}}/><button onClick={copy} style={{background:cs[0]?P.mint:gEmber,border:"none",borderRadius:10,padding:"10px 20px",color:"#fff",fontSize:12,fontWeight:800,fontFamily:fm,cursor:"pointer"}}>{cs[0]?"Copied!":"Copy"}</button></div></div></div>);}

function genFlags(m,t,camps){
  var fl=[],id=1;
  if(m.frequency>3.0)fl.push({id:id++,severity:m.frequency>4?"critical":"warning",platform:"Meta",metric:"Frequency",currentValue:m.frequency.toFixed(2)+"x",threshold:"3.0x",message:"Meta ad frequency has exceeded the optimal threshold. Audiences are seeing ads too often which can lead to ad fatigue.",recommendation:"Refresh creative assets or expand target audience to reduce repetition.",status:"open"});
  if(m.ctr>0&&m.ctr<1.0)fl.push({id:id++,severity:"warning",platform:"Meta",metric:"CTR",currentValue:pc(m.ctr),threshold:"1.00%",message:"Click-through rate is below the 1% benchmark indicating creative or targeting may not be resonating.",recommendation:"Test new ad creatives, headlines or audience segments. Consider A/B testing.",status:"open"});
  if(t.cpm>0&&m.cpm>0&&m.cpm/t.cpm>2.5)fl.push({id:id++,severity:"info",platform:"Cross-platform",metric:"CPM Delta",currentValue:(m.cpm/t.cpm).toFixed(1)+"x",threshold:"2.5x",message:"Meta CPM ("+fR(m.cpm)+") is significantly higher than TikTok ("+fR(t.cpm)+"). Evaluate budget allocation.",recommendation:"Consider shifting budget to TikTok for cost-efficient reach whilst maintaining Meta for precision targeting.",status:"open"});
  if(m.cpc>0&&m.cpc<2.0)fl.push({id:id++,severity:"positive",platform:"Meta",metric:"CPC",currentValue:fR(m.cpc),threshold:"R2.00",message:"Meta cost-per-click is below the R2.00 benchmark indicating strong creative efficiency.",recommendation:"Maintain current strategy and consider scaling budget on top ad sets.",status:"open"});
  if(t.follows>500)fl.push({id:id++,severity:"positive",platform:"TikTok",metric:"Community Growth",currentValue:fmt(t.follows)+" follows",threshold:"500",message:"TikTok follower acquisition is exceeding targets with strong audience resonance.",recommendation:"Continue current follower strategy and produce similar creative formats.",status:"open"});
  if(t.cpm>0&&t.cpm<10)fl.push({id:id++,severity:"positive",platform:"TikTok",metric:"CPM Efficiency",currentValue:fR(t.cpm),threshold:"R10.00",message:"TikTok delivering impressions at exceptional value below R10 CPM benchmark.",recommendation:"Maximise TikTok as primary scale channel.",status:"open"});
  camps.filter(function(c){return parseFloat(c.spend)>5000&&parseFloat(c.ctr||0)<0.8;}).forEach(function(c){fl.push({id:id++,severity:"warning",platform:c.platform||"Meta",metric:"Campaign CTR",currentValue:pc(parseFloat(c.ctr||0)),threshold:"0.80%",message:"Campaign '"+c.campaignName+"' has low CTR despite "+fR(parseFloat(c.spend))+" spend.",recommendation:"Review creative assets and targeting. Consider pausing underperforming ad sets.",status:"open"});});
  fl.sort(function(a,b){var o={critical:0,warning:1,info:2,positive:3};return(o[a.severity]||9)-(o[b.severity]||9);});
  return fl;
}

export default function MediaOnGas(){
  var ts=useState("overview"),tab=ts[0],setTab=ts[1];
  var ds=useState("2026-04-01"),df=ds[0],setDf=ds[1];
  var de=useState("2026-04-07"),dt=de[0],setDt=de[1];
  var cs=useState([]),campaigns=cs[0],setCampaigns=cs[1];
  var ss=useState([]),selected=ss[0],setSelected=ss[1];
  var rs=useState(""),search=rs[0],setSearch=rs[1];
  var ls=useState(true),loading=ls[0],setLoading=ls[1];
  var sc=useState(false),showCampaigns=sc[0],setShowCampaigns=sc[1];
  var sm=useState(false),showShare=sm[0],setShowShare=sm[1];
  var fs=useState([]),flags=fs[0],setFlags=fs[1];
  var isClient=window.location.pathname.indexOf("/view/")===0;

  var fetchData=function(){setLoading(true);fetch(API+"/api/campaigns?from="+df+"&to="+dt).then(function(r){return r.json();}).then(function(d){if(d.campaigns){setCampaigns(d.campaigns);setSelected(d.campaigns.map(function(c){return c.campaignId;}));}setLoading(false);}).catch(function(){setLoading(false);});};
  useEffect(function(){fetchData();},[]);
  var refreshData=function(){fetchData();};
  var toggle=function(id){setSelected(function(p){return p.indexOf(id)>=0?p.filter(function(x){return x!==id;}):p.concat([id]);});};
  var selectAll=function(){var f=campaigns.filter(function(c){return c.campaignName.toLowerCase().indexOf(search.toLowerCase())>=0||c.accountName.toLowerCase().indexOf(search.toLowerCase())>=0;});setSelected(f.map(function(c){return c.campaignId;}));};
  var clearAll=function(){setSelected([]);};

  var computed=useMemo(function(){
    if(selected.length===0)return{metaCamps:[],ttCamps:[],meta:{impressions:0,reach:0,spend:0,clicks:0,cpm:0,cpc:0,ctr:0,frequency:0},tt:{impressions:0,spend:0,clicks:0,follows:0,likes:0,cpm:0},totalImps:0,totalSpend:0,totalClicks:0,blendedCpm:0,allSelected:[]};
    var sel=campaigns.filter(function(c){return selected.indexOf(c.campaignId)>=0;});
    var mc=sel.filter(function(c){return c.platform==="Meta";});
    var tc=sel.filter(function(c){return c.platform==="TikTok";});
    var mt=mc.reduce(function(a,c){return{impressions:a.impressions+parseFloat(c.impressions||0),reach:a.reach+parseFloat(c.reach||0),spend:a.spend+parseFloat(c.spend||0),clicks:a.clicks+parseFloat(c.clicks||0)};},{impressions:0,reach:0,spend:0,clicks:0});
    mt.cpm=mt.impressions>0?(mt.spend/mt.impressions)*1000:0;mt.cpc=mt.clicks>0?mt.spend/mt.clicks:0;mt.ctr=mt.impressions>0?(mt.clicks/mt.impressions)*100:0;mt.frequency=mt.reach>0?mt.impressions/mt.reach:0;
    var tt=tc.reduce(function(a,c){return{impressions:a.impressions+parseFloat(c.impressions||0),spend:a.spend+parseFloat(c.spend||0),clicks:a.clicks+parseFloat(c.clicks||0),follows:a.follows+parseFloat(c.follows||0),likes:a.likes+parseFloat(c.likes||0)};},{impressions:0,spend:0,clicks:0,follows:0,likes:0});
    tt.cpm=tt.impressions>0?(tt.spend/tt.impressions)*1000:0;
    var ti=mt.impressions+tt.impressions,ts2=mt.spend+tt.spend,tc2=mt.clicks+tt.clicks;
    return{metaCamps:mc,ttCamps:tc,meta:mt,tt:tt,totalImps:ti,totalSpend:ts2,totalClicks:tc2,blendedCpm:ti>0?(ts2/ti)*1000:0,allSelected:sel};
  },[campaigns,selected]);

  useEffect(function(){if(computed.meta)setFlags(genFlags(computed.meta,computed.tt,computed.allSelected||[]));},[computed]);

  var m=computed.meta,t=computed.tt;
  var ack=function(id){setFlags(function(p){return p.map(function(f){return f.id===id?Object.assign({},f,{status:"acknowledged"}):f;});});};
  var resolve=function(id){setFlags(function(p){return p.map(function(f){return f.id===id?Object.assign({},f,{status:"resolved"}):f;});});};
  var openFlags=flags.filter(function(f){return f.status==="open";}).length;

  var tabs=[{id:"overview",label:"Overview",icon:Ic.chart(P.orchid,16)},{id:"tof",label:"Ad Serving",icon:Ic.radar(P.ember,16)},{id:"mof",label:"Engagement",icon:Ic.pulse(P.mint,16)},{id:"bof",label:"Objectives",icon:Ic.target(P.rose,16)}];
  if(!isClient)tabs.push({id:"optimise",label:"Optimisation"+(openFlags>0?" ("+openFlags+")":""),icon:Ic.flag(P.warning,16)});

  return(<div style={{minHeight:"100vh",background:"linear-gradient(170deg,"+P.void+","+P.cosmos+" 30%,"+P.nebula+" 60%,"+P.cosmos+")",color:P.txt,fontFamily:ff,WebkitFontSmoothing:"antialiased"}}>
    <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0}}><div style={{position:"absolute",inset:0,opacity:0.018,backgroundImage:"radial-gradient("+P.ember+" 0.5px,transparent 0.5px),radial-gradient("+P.orchid+" 0.5px,transparent 0.5px)",backgroundSize:"40px 40px",backgroundPosition:"0 0,20px 20px"}}/></div>

    <header style={{position:"sticky",top:0,zIndex:100,background:"rgba(6,2,14,0.92)",backdropFilter:"blur(24px)",borderBottom:"1px solid "+P.rule}}>
      <div style={{maxWidth:1400,margin:"0 auto",padding:"10px 28px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
          <div style={{display:"flex",alignItems:"center",gap:14}}>
            <div style={{width:42,height:42,borderRadius:"50%",background:gFire,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 0 20px "+P.ember+"50"}}><span style={{fontSize:10,fontWeight:900,color:"#fff",fontFamily:fm}}>GAS</span></div>
            <div><div style={{fontSize:16,fontWeight:900,letterSpacing:4,fontFamily:fm,lineHeight:1}}><span style={{color:P.txt}}>MEDIA </span><span style={{color:P.ember}}>ON </span><span style={{background:gFire,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>GAS</span></div><div style={{fontSize:7,color:P.dim,letterSpacing:5,textTransform:"uppercase",fontFamily:fm,marginTop:2}}>{isClient?"Client Dashboard":"Digital Performance Intelligence"}</div></div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
            {!isClient&&<button onClick={function(){setShowCampaigns(!showCampaigns);}} style={{background:showCampaigns?P.ember+"15":P.glass,border:"1px solid "+(showCampaigns?P.ember+"50":P.rule),borderRadius:10,padding:"8px 16px",color:showCampaigns?P.ember:P.sub,fontSize:11,fontWeight:700,fontFamily:fm,cursor:"pointer",display:"flex",alignItems:"center",gap:5}}>{Ic.chart(showCampaigns?P.ember:P.sub,14)} {selected.length} Campaigns</button>}
            <div style={{display:"flex",alignItems:"center",gap:5,background:P.glass,border:"1px solid "+P.rule,borderRadius:10,padding:"6px 12px"}}><span style={{fontSize:7,color:P.dim,fontFamily:fm,letterSpacing:2}}>FROM</span><input type="date" value={df} onChange={function(e){setDf(e.target.value);}} style={{background:"transparent",border:"none",color:P.txt,fontSize:11,fontFamily:fm,outline:"none",width:105}}/><div style={{width:12,height:1,background:"linear-gradient(90deg,"+P.ember+","+P.solar+")"}}/><span style={{fontSize:7,color:P.dim,fontFamily:fm,letterSpacing:2}}>TO</span><input type="date" value={dt} onChange={function(e){setDt(e.target.value);}} style={{background:"transparent",border:"none",color:P.txt,fontSize:11,fontFamily:fm,outline:"none",width:105}}/></div>
            <button onClick={refreshData} style={{background:gEmber,border:"none",borderRadius:10,padding:"8px 18px",color:"#fff",fontSize:11,fontWeight:800,fontFamily:fm,cursor:"pointer",letterSpacing:1.5}}>REFRESH</button>
            {!isClient&&<button onClick={function(){setShowShare(true);}} style={{background:P.glass,border:"1px solid "+P.rule,borderRadius:10,padding:"8px 12px",color:P.ember,fontSize:11,fontWeight:700,fontFamily:fm,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>{Ic.share(P.ember,14)} Share</button>}
          </div>
        </div>
      </div>
      <div style={{maxWidth:1400,margin:"0 auto",padding:"0 28px"}}><div style={{display:"flex",gap:1}}>{tabs.map(function(tb){return<button key={tb.id} onClick={function(){setTab(tb.id);}} style={{display:"flex",alignItems:"center",gap:5,background:tab===tb.id?P.ember+"10":"transparent",border:"none",borderBottom:tab===tb.id?"2px solid "+P.ember:"2px solid transparent",padding:"10px 18px",cursor:"pointer",color:tab===tb.id?P.ember:P.sub,fontSize:11,fontWeight:tab===tb.id?800:500,fontFamily:fm}}>{tb.icon}<span>{tb.label}</span></button>;})}</div></div>
    </header>

    {showShare&&<ShareModal onClose={function(){setShowShare(false);}}/>}

    <div style={{maxWidth:1400,margin:"0 auto",padding:"20px 28px 80px",display:"flex",gap:20,position:"relative",zIndex:1}}>
      {showCampaigns&&<div style={{width:340,flexShrink:0}}><CampaignSelector campaigns={campaigns} selected={selected} onToggle={toggle} onSelectAll={selectAll} onClearAll={clearAll} search={search} onSearch={setSearch}/></div>}

      <div style={{flex:1,minWidth:0}}>
        {loading?(<div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"80px 40px",gap:20}}><div style={{width:48,height:48,border:"3px solid "+P.rule,borderTop:"3px solid "+P.ember,borderRadius:"50%",animation:"spin 1s linear infinite"}}/><style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style><div style={{fontSize:14,color:P.sub,fontFamily:fm}}>Pulling live data from Meta and TikTok...</div></div>):(<>

        {/* OVERVIEW */}
        {tab==="overview"&&(<div>
          <SH icon={Ic.chart(P.orchid,20)} title="Campaign Overview" sub={df+" to "+dt+" \u00B7 "+selected.length+" campaigns \u00B7 Live data"} accent={P.orchid}/>
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12,marginBottom:24}}>
            <Metric icon={Ic.eye(P.cyan,14)} label="Impressions" value={fmt(computed.totalImps)} accent={P.cyan}/>
            <Metric icon={Ic.bolt(P.solar,14)} label="Spend" value={fR(computed.totalSpend)} accent={P.solar}/>
            <Metric icon={Ic.globe(P.mint,14)} label="Blended CPM" value={fR(computed.blendedCpm)} accent={P.mint}/>
            <Metric icon={Ic.pulse(P.fuchsia,14)} label="Clicks" value={fmt(computed.totalClicks)} accent={P.fuchsia}/>
            <Metric icon={Ic.users(P.orchid,14)} label="Meta Reach" value={fmt(m.reach)} accent={P.orchid}/>
          </div>

          <Glass accent={P.ember} st={{padding:"20px 24px",marginBottom:24}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:12}}><div><div style={{fontSize:10,fontWeight:700,color:P.sub,letterSpacing:3,fontFamily:fm,textTransform:"uppercase",marginBottom:4}}>Budget Pacing</div></div><div style={{textAlign:"right"}}><span style={{fontSize:20,fontWeight:900,color:P.ember,fontFamily:fm}}>{fR(computed.totalSpend)}</span><span style={{fontSize:12,color:P.sub,marginLeft:6}}>total</span></div></div>
            <div style={{background:"rgba(40,25,60,0.5)",borderRadius:10,height:16,overflow:"hidden",border:"1px solid "+P.rule}}><div style={{width:Math.min(100,computed.totalSpend>0?100:0)+"%",height:"100%",background:gFire,borderRadius:10}}/></div>
          </Glass>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:24}}>
            <Glass accent={P.orchid} st={{padding:22}}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>{Ic.eye(P.orchid,14)}<span style={{fontSize:10,fontWeight:800,color:P.orchid,letterSpacing:3,fontFamily:fm,textTransform:"uppercase"}}>Impression Share</span></div><ResponsiveContainer width="100%" height={180}><PieChart><Pie data={[{name:"Meta",value:m.impressions},{name:"TikTok",value:t.impressions}]} cx="50%" cy="50%" outerRadius={70} innerRadius={42} paddingAngle={5} dataKey="value" stroke="none"><Cell fill={P.fb}/><Cell fill={P.tt}/></Pie><Tooltip content={Tip}/></PieChart></ResponsiveContainer><div style={{display:"flex",justifyContent:"center",gap:16,marginTop:6}}>{[{n:"Meta",v:m.impressions,c:P.fb},{n:"TikTok",v:t.impressions,c:P.tt}].map(function(p){return<div key={p.n} style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:7,height:7,borderRadius:"50%",background:p.c}}/><span style={{fontSize:10,color:P.sub,fontFamily:fm}}>{p.n} {computed.totalImps>0?((p.v/computed.totalImps)*100).toFixed(1)+"%":"0%"}</span></div>;})}</div></Glass>
            <Glass accent={P.fuchsia} st={{padding:22}}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>{Ic.bolt(P.fuchsia,14)}<span style={{fontSize:10,fontWeight:800,color:P.fuchsia,letterSpacing:3,fontFamily:fm,textTransform:"uppercase"}}>Spend Allocation</span></div><ResponsiveContainer width="100%" height={180}><PieChart><Pie data={[{name:"Meta",value:m.spend},{name:"TikTok",value:t.spend}]} cx="50%" cy="50%" outerRadius={70} innerRadius={42} paddingAngle={5} dataKey="value" stroke="none"><Cell fill={P.fb}/><Cell fill={P.tt}/></Pie><Tooltip content={Tip}/></PieChart></ResponsiveContainer><div style={{display:"flex",justifyContent:"center",gap:16,marginTop:6}}>{[{n:"Meta",v:m.spend,c:P.fb},{n:"TikTok",v:t.spend,c:P.tt}].map(function(p){return<div key={p.n} style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:7,height:7,borderRadius:"50%",background:p.c}}/><span style={{fontSize:10,color:P.sub,fontFamily:fm}}>{p.n} {fR(p.v)}</span></div>;})}</div></Glass>
          </div>

          <Glass accent={P.orchid} st={{padding:22,marginBottom:24}}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>{Ic.globe(P.orchid,16)}<span style={{fontSize:10,fontWeight:800,color:P.orchid,letterSpacing:3,fontFamily:fm,textTransform:"uppercase"}}>Platform CPM</span></div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14}}>{[{n:"Meta",v:m.cpm,c:P.fb},{n:"TikTok",v:t.cpm,c:P.tt},{n:"Blended",v:computed.blendedCpm,c:P.ember}].map(function(p){return<div key={p.n} style={{textAlign:"center",padding:14,background:p.c+"08",border:"1px solid "+p.c+"20",borderRadius:10}}><div style={{fontSize:9,fontWeight:700,color:p.c,letterSpacing:2,fontFamily:fm,marginBottom:4}}>{p.n}</div><div style={{fontSize:22,fontWeight:900,color:p.c,fontFamily:fm}}>{fR(p.v)}</div></div>;})}</div>
            <Insight title="CPM Analysis" accent={P.orchid} icon={Ic.crown(P.orchid,16)}>{t.cpm>0&&m.cpm>0?<span>Meta delivers at <strong>{fR(m.cpm)} CPM</strong> whilst TikTok achieves <strong>{fR(t.cpm)} CPM</strong> \u2014 {(m.cpm/t.cpm).toFixed(1)}x more efficient. Blended CPM of <strong>{fR(computed.blendedCpm)}</strong> represents strong value.</span>:"Select campaigns to see CPM comparison."}</Insight>
          </Glass>

          <div style={{background:"#004F71",borderRadius:16,padding:"24px 24px 16px"}}>
            <div style={{fontSize:10,fontWeight:800,letterSpacing:4,textTransform:"uppercase",color:"rgba(255,255,255,0.5)",fontFamily:fm,marginBottom:18}}>Key Campaign Insights</div>
            {[{t:"Cross-Platform Delivery",b:"Delivered "+fmt(computed.totalImps)+" impressions across Meta and TikTok against "+fR(computed.totalSpend)+" investment at "+fR(computed.blendedCpm)+" blended CPM."},{t:"Meta Engagement",b:"Meta generated "+fmt(m.clicks)+" clicks at "+fR(m.cpc)+" CPC with "+pc(m.ctr)+" CTR, reaching "+fmt(m.reach)+" unique people."},{t:"TikTok Scale",b:"TikTok delivered "+fmt(t.impressions)+" impressions at "+fR(t.cpm)+" CPM with "+fmt(t.follows)+" new followers earned."},{t:"Combined Strategy",b:"TikTok provides cost-efficient scale and community growth. Meta delivers precision targeting and measurable engagement."}].map(function(ins,i){return<div key={i} style={{marginBottom:8,padding:"14px 16px",border:"1px solid rgba(255,255,255,0.15)",borderRadius:10,borderLeft:"4px solid #FFCB05"}}><div style={{fontSize:13,fontWeight:800,color:"#fff",marginBottom:4,fontFamily:ff}}>{ins.t}</div><div style={{fontSize:12,color:"rgba(255,255,255,0.85)",lineHeight:1.8,fontFamily:ff}}>{ins.b}</div></div>;})}
          </div>
        </div>)}

        {/* AD SERVING */}
        {tab==="tof"&&(<div>
          <SH icon={Ic.radar(P.ember,20)} title="Top of Funnel \u2014 Ad Serving" sub="Impressions \u00B7 Reach \u00B7 Frequency \u00B7 CPM" accent={P.ember}/>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:24}}><Metric icon={Ic.eye(P.cyan,14)} label="Impressions" value={fmt(computed.totalImps)} accent={P.cyan}/><Metric icon={Ic.users(P.orchid,14)} label="Meta Reach" value={fmt(m.reach)} accent={P.orchid}/><Metric icon={Ic.radar(P.rose,14)} label="Frequency" value={m.frequency>0?m.frequency.toFixed(2)+"x":"N/A"} accent={P.rose}/><Metric icon={Ic.bolt(P.mint,14)} label="Blended CPM" value={fR(computed.blendedCpm)} accent={P.mint}/></div>

          <PH platform="Facebook" suffix="Campaign Performance"/>
          <Glass accent={P.fb} st={{padding:22,marginBottom:20}}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:14}}>{[{l:"Impressions",v:fmt(m.impressions)},{l:"Reach",v:fmt(m.reach)},{l:"Frequency",v:m.frequency>0?m.frequency.toFixed(2)+"x":"N/A"},{l:"CPM",v:fR(m.cpm)}].map(function(x,i){return<div key={i} style={{textAlign:"center"}}><div style={{fontSize:9,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:4}}>{x.l}</div><div style={{fontSize:20,fontWeight:900,color:P.fb,fontFamily:fm}}>{x.v}</div></div>;})}</div>
            {computed.metaCamps.length>0&&<table style={{width:"100%",borderCollapse:"collapse",marginBottom:14}}><thead><tr>{["Campaign","Impressions","Spend","CPC","CTR"].map(function(h,i){return<th key={i} style={{padding:"10px 14px",fontSize:9,fontWeight:700,textTransform:"uppercase",color:"#FFCB05",textAlign:i===0?"left":"center",background:"#004F71",border:"1px solid #003a55",fontFamily:fm}}>{h}</th>;})}</tr></thead><tbody>{computed.metaCamps.sort(function(a,b){return parseFloat(b.impressions)-parseFloat(a.impressions);}).map(function(c,i){return<tr key={i} style={{background:i%2===0?"rgba(240,246,251,0.04)":"transparent"}}><td style={{padding:"10px 14px",fontSize:11,fontWeight:600,color:P.txt,border:"1px solid "+P.rule}}>{c.campaignName}</td><td style={{padding:"10px 14px",fontSize:12,color:P.txt,textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm}}>{fmt(c.impressions)}</td><td style={{padding:"10px 14px",fontSize:12,color:P.txt,textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm}}>{fR(parseFloat(c.spend))}</td><td style={{padding:"10px 14px",fontSize:12,color:P.mint,textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontWeight:700}}>{fR(parseFloat(c.cpc||0))}</td><td style={{padding:"10px 14px",fontSize:12,color:P.txt,textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm}}>{pc(parseFloat(c.ctr||0))}</td></tr>;})}</tbody></table>}
            <Insight title="Meta Campaign Read" accent={P.fb} icon={Ic.bolt(P.fb,16)}>Meta delivered {fmt(m.impressions)} impressions reaching {fmt(m.reach)} unique people at {m.frequency>0?m.frequency.toFixed(2)+"x":"N/A"} frequency and {fR(m.cpm)} CPM. The {fmt(m.clicks)} clicks at {fR(m.cpc)} CPC and {pc(m.ctr)} CTR confirm strong engagement with {fR(m.spend)} total investment.</Insight>
          </Glass>

          <PH platform="TikTok" suffix="Campaign Performance"/>
          <Glass accent={P.tt} st={{padding:22,marginBottom:20}}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:14}}>{[{l:"Impressions",v:fmt(t.impressions)},{l:"CPM",v:fR(t.cpm)},{l:"Follows",v:fmt(t.follows)},{l:"Spend",v:fR(t.spend)}].map(function(x,i){return<div key={i} style={{textAlign:"center"}}><div style={{fontSize:9,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:4}}>{x.l}</div><div style={{fontSize:20,fontWeight:900,color:P.tt,fontFamily:fm}}>{x.v}</div></div>;})}</div>
            {computed.ttCamps.length>0&&<table style={{width:"100%",borderCollapse:"collapse",marginBottom:14}}><thead><tr>{["Campaign","Impressions","Spend","CPM"].map(function(h,i){return<th key={i} style={{padding:"10px 14px",fontSize:9,fontWeight:700,textTransform:"uppercase",color:"#fff",textAlign:i===0?"left":"center",background:"#252538",border:"1px solid #3a3a4e",fontFamily:fm}}>{h}</th>;})}</tr></thead><tbody>{computed.ttCamps.sort(function(a,b){return parseFloat(b.impressions)-parseFloat(a.impressions);}).map(function(c,i){return<tr key={i} style={{background:i%2===0?"#1e1e2e":"#252538"}}><td style={{padding:"10px 14px",fontSize:11,fontWeight:600,color:"#fff",border:"1px solid #3a3a4e"}}>{c.campaignName}</td><td style={{padding:"10px 14px",fontSize:12,color:"#fff",textAlign:"center",border:"1px solid #3a3a4e",fontFamily:fm}}>{fmt(c.impressions)}</td><td style={{padding:"10px 14px",fontSize:12,color:"#ccc",textAlign:"center",border:"1px solid #3a3a4e",fontFamily:fm}}>{fR(parseFloat(c.spend))}</td><td style={{padding:"10px 14px",fontSize:12,color:P.tt,textAlign:"center",border:"1px solid #3a3a4e",fontFamily:fm,fontWeight:700}}>{fR(parseFloat(c.cpm||0))}</td></tr>;})}</tbody></table>}
            <Insight title="TikTok Campaign Read" accent={P.tt} icon={Ic.bolt(P.tt,16)}>TikTok delivered {fmt(t.impressions)} impressions at {fR(t.cpm)} CPM with {fmt(t.follows)} followers and {fmt(t.likes)} engagements at {fR(t.spend)} spend.</Insight>
          </Glass>

          <Glass st={{padding:22}}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>{Ic.chart(P.ember,16)}<span style={{fontSize:10,fontWeight:800,color:P.ember,letterSpacing:3,fontFamily:fm,textTransform:"uppercase"}}>Impression Volume</span></div><ResponsiveContainer width="100%" height={200}><BarChart data={[{name:"Meta",Impressions:m.impressions},{name:"TikTok",Impressions:t.impressions}]} barSize={60}><CartesianGrid strokeDasharray="3 3" stroke={P.rule}/><XAxis dataKey="name" tick={{fontSize:12,fill:P.txt,fontFamily:fm}} stroke="transparent"/><YAxis tick={{fontSize:10,fill:P.dim,fontFamily:fm}} stroke="transparent" tickFormatter={function(v){return fmt(v);}}/><Tooltip content={Tip}/><Bar dataKey="Impressions" radius={[12,12,0,0]}><Cell fill={P.fb}/><Cell fill={P.tt}/></Bar></BarChart></ResponsiveContainer></Glass>
        </div>)}

        {/* ENGAGEMENT */}
        {tab==="mof"&&(<div>
          <SH icon={Ic.pulse(P.mint,20)} title="Middle of Funnel \u2014 Engagement" sub="Clicks \u00B7 CTR \u00B7 CPC \u00B7 Top Campaigns" accent={P.mint}/>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:24}}><Metric icon={Ic.pulse(P.mint,14)} label="Total Clicks" value={fmt(computed.totalClicks)} accent={P.mint}/><Metric icon={Ic.bolt(P.solar,14)} label="Meta CPC" value={fR(m.cpc)} accent={P.solar}/><Metric icon={Ic.eye(P.cyan,14)} label="Meta CTR" value={pc(m.ctr)} accent={P.cyan}/><Metric icon={Ic.users(P.fuchsia,14)} label="TT Follows" value={fmt(t.follows)} accent={P.fuchsia}/></div>

          <PH platform="Facebook" suffix="Top Campaigns by Clicks"/>
          <Glass accent={P.fb} st={{padding:22,marginBottom:20}}>
            {computed.metaCamps.sort(function(a,b){return parseFloat(b.clicks||0)-parseFloat(a.clicks||0);}).slice(0,8).map(function(c,i){var best=i===0;return<div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",marginBottom:4,background:i%2===0?P.orchid+"06":"transparent",borderRadius:10,borderLeft:"3px solid "+(best?P.solar:P.fb)}}>
              <div style={{width:28,height:28,borderRadius:8,background:best?P.solar+"15":P.fb+"10",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:900,color:best?P.solar:P.fb,fontFamily:fm,flexShrink:0}}>#{i+1}</div>
              <div style={{flex:1,minWidth:0}}><div style={{fontSize:11,fontWeight:700,color:P.txt,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.campaignName}</div><div style={{display:"flex",gap:6,marginTop:3}}><Pill name={c.accountName} color={P.orchid}/>{best&&<span style={{background:gFire,color:"#fff",fontSize:8,fontWeight:900,padding:"2px 8px",borderRadius:6,fontFamily:fm}}>BEST</span>}</div></div>
              <div style={{textAlign:"right",minWidth:60}}><div style={{fontSize:14,fontWeight:900,color:P.txt,fontFamily:fm}}>{fmt(parseFloat(c.clicks||0))}</div><div style={{fontSize:8,color:P.dim,fontFamily:fm}}>clicks</div></div>
              <div style={{textAlign:"right",minWidth:55}}><div style={{fontSize:13,fontWeight:800,color:P.mint,fontFamily:fm}}>{fR(parseFloat(c.cpc||0))}</div><div style={{fontSize:8,color:P.dim,fontFamily:fm}}>CPC</div></div>
              <div style={{textAlign:"right",minWidth:50}}><div style={{fontSize:13,fontWeight:700,color:P.sub,fontFamily:fm}}>{pc(parseFloat(c.ctr||0))}</div><div style={{fontSize:8,color:P.dim,fontFamily:fm}}>CTR</div></div>
              <div style={{textAlign:"right",minWidth:60}}><div style={{fontSize:13,fontWeight:700,color:P.ember,fontFamily:fm}}>{fR(parseFloat(c.spend||0))}</div><div style={{fontSize:8,color:P.dim,fontFamily:fm}}>spend</div></div>
            </div>;})}
            <Insight title="Engagement Analysis" accent={P.mint} icon={Ic.fire(P.mint,16)}>Meta generated <strong>{fmt(m.clicks)} clicks</strong> at <strong>{fR(m.cpc)} CPC</strong> and {pc(m.ctr)} CTR. TikTok contributed {fmt(t.clicks)} clicks with {fmt(t.follows)} followers and {fmt(t.likes)} engagements. Combined click volume of {fmt(computed.totalClicks)} confirms strong audience receptivity.</Insight>
          </Glass>
        </div>)}

        {/* OBJECTIVES */}
        {tab==="bof"&&(<div>
          <SH icon={Ic.target(P.rose,20)} title="Bottom of Funnel \u2014 Objective Results" sub="Results \u00B7 Cost Per Result \u00B7 Community Growth" accent={P.rose}/>

          <PH platform="Facebook" suffix="Objective Results"/>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14,marginBottom:24}}>
            {[{l:"IMPRESSIONS",v:fmt(m.impressions),s1l:"CPM",s1v:fR(m.cpm),s1c:P.fb,s2l:"SPEND",s2v:fR(m.spend)},{l:"CLICKS",v:fmt(m.clicks),s1l:"CPC",s1v:fR(m.cpc),s1c:P.fb,s2l:"CTR",s2v:pc(m.ctr)},{l:"REACH",v:fmt(m.reach),s1l:"FREQUENCY",s1v:m.frequency>0?m.frequency.toFixed(2)+"x":"N/A",s1c:P.fb}].map(function(x,i){return<Glass key={i} accent={P.fb} hv={true} st={{padding:20}}><div style={{fontSize:9,fontWeight:700,color:P.sub,fontFamily:fm,letterSpacing:2,marginBottom:12}}>{x.l}</div><div style={{fontSize:26,fontWeight:900,color:P.txt,fontFamily:fm}}>{x.v}</div><div style={{display:"flex",justifyContent:"space-between",paddingTop:10,borderTop:"1px solid "+P.rule,marginTop:10}}><div><div style={{fontSize:8,color:P.dim,fontFamily:fm}}>{x.s1l}</div><div style={{fontSize:15,fontWeight:800,color:x.s1c,fontFamily:fm}}>{x.s1v}</div></div>{x.s2l&&<div style={{textAlign:"right"}}><div style={{fontSize:8,color:P.dim,fontFamily:fm}}>{x.s2l}</div><div style={{fontSize:13,fontWeight:700,color:P.sub,fontFamily:fm}}>{x.s2v}</div></div>}</div></Glass>;})}
          </div>

          <PH platform="TikTok" suffix="Objective Results"/>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14,marginBottom:24}}>
            {[{l:"IMPRESSIONS",v:fmt(t.impressions),s1l:"CPM",s1v:fR(t.cpm),s1c:P.tt,s2l:"SPEND",s2v:fR(t.spend)},{l:"CLICKS",v:fmt(t.clicks),s1l:"CPC",s1v:t.clicks>0?fR(t.spend/t.clicks):"N/A",s1c:P.tt},{l:"COMMUNITY",v:fmt(t.follows),s1l:"LIKES",s1v:fmt(t.likes),s1c:P.tt}].map(function(x,i){return<Glass key={i} accent={P.tt} hv={true} st={{padding:20}}><div style={{fontSize:9,fontWeight:700,color:P.sub,fontFamily:fm,letterSpacing:2,marginBottom:12}}>{x.l}</div><div style={{fontSize:26,fontWeight:900,color:i===2?P.mint:P.txt,fontFamily:fm}}>{x.v}</div><div style={{paddingTop:10,borderTop:"1px solid "+P.rule,marginTop:10}}><div style={{fontSize:8,color:P.dim,fontFamily:fm}}>{x.s1l}</div><div style={{fontSize:15,fontWeight:800,color:x.s1c,fontFamily:fm}}>{x.s1v}</div></div>{x.s2l&&<div style={{marginTop:8}}><div style={{fontSize:8,color:P.dim,fontFamily:fm}}>{x.s2l}</div><div style={{fontSize:13,fontWeight:700,color:P.sub,fontFamily:fm}}>{x.s2v}</div></div>}</Glass>;})}
          </div>

          <Glass accent={P.ember} st={{padding:26,background:"linear-gradient(135deg,"+P.lava+"05,"+P.ember+"05,"+P.solar+"05)"}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:22}}>{Ic.users(P.ember,18)}<span style={{fontSize:10,fontWeight:800,color:P.ember,letterSpacing:3,fontFamily:fm,textTransform:"uppercase"}}>Combined Results</span></div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:18}}>
              <div><div style={{fontSize:9,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:6}}>IMPRESSIONS</div><div style={{fontSize:30,fontWeight:900,fontFamily:ff,lineHeight:1,color:P.ember}}>{fmt(computed.totalImps)}</div></div>
              <div style={{borderLeft:"1px solid "+P.rule,paddingLeft:16}}><div style={{fontSize:9,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:6}}>SPEND</div><div style={{fontSize:22,fontWeight:900,color:P.solar,fontFamily:fm}}>{fR(computed.totalSpend)}</div></div>
              <div style={{borderLeft:"1px solid "+P.rule,paddingLeft:16}}><div style={{fontSize:9,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:6}}>CLICKS</div><div style={{fontSize:22,fontWeight:900,color:P.mint,fontFamily:fm}}>{fmt(computed.totalClicks)}</div></div>
              <div style={{borderLeft:"1px solid "+P.rule,paddingLeft:16}}><div style={{fontSize:9,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:6}}>TT FOLLOWS</div><div style={{fontSize:22,fontWeight:900,color:P.tt,fontFamily:fm}}>{fmt(t.follows)}</div></div>
            </div>
            <Insight title="Combined Campaign Read" icon={Ic.crown(P.ember,16)} accent={P.ember}>Selected campaigns delivered <strong>{fmt(computed.totalImps)} impressions</strong> against <strong>{fR(computed.totalSpend)}</strong> at {fR(computed.blendedCpm)} blended CPM. Meta reached {fmt(m.reach)} people generating {fmt(m.clicks)} clicks at {fR(m.cpc)} CPC. TikTok delivered {fmt(t.impressions)} impressions at {fR(t.cpm)} CPM with {fmt(t.follows)} followers. The two-platform strategy delivers TikTok for scale, Meta for precision.</Insight>
          </Glass>
        </div>)}

        {/* OPTIMISATION */}
        {tab==="optimise"&&!isClient&&(<div>
          <SH icon={Ic.flag(P.warning,20)} title="Optimisation \u2014 Flags & Recommendations" sub={flags.length+" flags \u00B7 "+openFlags+" open \u00B7 Auto-generated"} accent={P.warning}/>
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

    <footer style={{borderTop:"1px solid "+P.rule,background:"rgba(6,2,14,0.95)",padding:"20px 28px"}}><div style={{maxWidth:1400,margin:"0 auto",display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={{display:"flex",alignItems:"center",gap:10}}><div style={{width:26,height:26,borderRadius:"50%",background:gFire,display:"flex",alignItems:"center",justifyContent:"center",fontSize:7,fontWeight:900,color:"#fff",fontFamily:fm}}>GAS</div><span style={{fontSize:11,fontWeight:800,color:P.sub,fontFamily:fm,letterSpacing:2}}>MEDIA ON GAS</span><span style={{fontSize:9,color:P.dim}}>Powered by GAS Response Marketing</span></div><div style={{fontSize:9,color:P.dim,fontFamily:fm,textAlign:"right",lineHeight:1.8}}>Live data \u00B7 All figures in ZAR \u00B7 Confidential \u00B7 grow@gasmarketing.co.za</div></div></footer>
  </div>);
}
