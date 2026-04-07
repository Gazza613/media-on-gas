import { useState, useEffect, useMemo } from "react";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const P = {
  void:"#06020e",cosmos:"#0d0618",nebula:"#150b24",
  panel:"rgba(22,12,38,0.85)",glass:"rgba(30,18,50,0.65)",
  ember:"#FF6B00",blaze:"#FF3D00",solar:"#FFAA00",lava:"#E8231A",
  orchid:"#A855F7",violet:"#7C3AED",fuchsia:"#D946EF",rose:"#F43F5E",
  cyan:"#22D3EE",mint:"#34D399",
  fb:"#4599FF",ig:"#E1306C",tt:"#00F2EA",
  txt:"#EDE9F5",sub:"#8B7FA3",dim:"#4A3D60",
  rule:"rgba(168,85,247,0.12)",
};
const gFire = "linear-gradient(135deg,#E8231A,#FF6B00,#FFAA00)";
const gEmber = "linear-gradient(135deg,#FF3D00,#FF6B00)";
const ff = "Outfit,Segoe UI,Trebuchet MS,sans-serif";
const fm = "Consolas,Lucida Console,Courier New,monospace";
const API = window.location.origin;

const fmt = n => { const v = parseFloat(n); if(isNaN(v)) return "0"; if(v>=1e6) return(v/1e6).toFixed(2)+"M"; if(v>=1e3) return(v/1e3).toFixed(1)+"K"; return Math.round(v).toLocaleString(); };
const fR = n => { const v = parseFloat(n); return isNaN(v) ? "R0.00" : "R"+v.toLocaleString("en-ZA",{minimumFractionDigits:2,maximumFractionDigits:2}); };
const pc = n => { const v = parseFloat(n); return isNaN(v) ? "0.00%" : v.toFixed(2)+"%"; };

const Ic = {
  chart:(c,s=20)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none"><rect x="3" y="12" width="4" height="9" rx="1" stroke={c} strokeWidth="1.5" fill={c+"15"}/><rect x="10" y="6" width="4" height="15" rx="1" stroke={c} strokeWidth="1.5" fill={c+"15"}/><rect x="17" y="2" width="4" height="19" rx="1" stroke={c} strokeWidth="1.5" fill={c+"15"}/></svg>,
  radar:(c,s=20)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke={c} strokeWidth="1.5" opacity="0.3"/><circle cx="12" cy="12" r="6" stroke={c} strokeWidth="1.5" opacity="0.5"/><circle cx="12" cy="12" r="2" fill={c}/></svg>,
  pulse:(c,s=20)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M2 12h4l3-8 4 16 3-8h6" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  target:(c,s=20)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke={c} strokeWidth="1.5"/><circle cx="12" cy="12" r="6" stroke={c} strokeWidth="1.5"/><circle cx="12" cy="12" r="2" fill={c}/></svg>,
  bolt:(c,s=20)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke={c} strokeWidth="1.5" fill={c+"15"} strokeLinejoin="round"/></svg>,
  eye:(c,s=20)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" stroke={c} strokeWidth="1.5"/><circle cx="12" cy="12" r="3" stroke={c} strokeWidth="1.5"/></svg>,
  crown:(c,s=20)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M2 20h20L19 8l-4 5-3-7-3 7-4-5L2 20z" stroke={c} strokeWidth="1.5" fill={c+"15"} strokeLinejoin="round"/></svg>,
  users:(c,s=20)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none"><circle cx="9" cy="7" r="3" stroke={c} strokeWidth="1.5"/><path d="M2 21v-2a5 5 0 0110 0v2" stroke={c} strokeWidth="1.5"/></svg>,
  globe:(c,s=20)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke={c} strokeWidth="1.5"/><path d="M2 12h20" stroke={c} strokeWidth="1" opacity="0.3"/></svg>,
  share:(c,s=20)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none"><circle cx="18" cy="5" r="3" stroke={c} strokeWidth="1.5"/><circle cx="6" cy="12" r="3" stroke={c} strokeWidth="1.5"/><circle cx="18" cy="19" r="3" stroke={c} strokeWidth="1.5"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" stroke={c} strokeWidth="1.5"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" stroke={c} strokeWidth="1.5"/></svg>,
  search:(c,s=20)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="8" stroke={c} strokeWidth="1.5"/><line x1="21" y1="21" x2="16.65" y2="16.65" stroke={c} strokeWidth="1.5"/></svg>,
  check:(c,s=20)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
};

function Glass({children,accent=P.ember,hv=false,st={}}){
  const[h,sH]=useState(false);
  return(<div onMouseEnter={()=>sH(true)} onMouseLeave={()=>sH(false)} style={{background:P.glass,border:"1px solid "+(h&&hv?accent+"50":P.rule),borderRadius:16,position:"relative",overflow:"hidden",transition:"all 0.3s ease",transform:h&&hv?"translateY(-2px)":"none",boxShadow:h&&hv?"0 12px 40px "+accent+"15":"0 4px 20px rgba(0,0,0,0.25)",...st}}>
    <div style={{position:"absolute",top:0,left:"10%",right:"10%",height:1,background:"linear-gradient(90deg, transparent, "+accent+"80, transparent)",opacity:h&&hv?1:0.4,transition:"opacity 0.4s"}}/>{children}</div>);
}
function Metric({icon,label,value,sub,accent=P.ember}){
  return(<Glass accent={accent} hv st={{padding:"22px 20px"}}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>{icon}<span style={{fontSize:10,fontWeight:700,color:P.sub,letterSpacing:2.5,textTransform:"uppercase",fontFamily:fm}}>{label}</span></div><div style={{fontSize:26,fontWeight:900,fontFamily:ff,lineHeight:1,letterSpacing:-1,color:accent}}>{value}</div>{sub&&<div style={{fontSize:10,color:P.dim,marginTop:10,fontFamily:fm,lineHeight:1.6}}>{sub}</div>}</Glass>);
}
function Insight({title,children,accent=P.ember,icon}){
  return(<div style={{marginTop:24,padding:"22px 26px",background:"linear-gradient(135deg, "+accent+"06 0%, "+accent+"02 100%)",border:"1px solid "+accent+"18",borderLeft:"4px solid "+accent,borderRadius:"0 16px 16px 0"}}><div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>{icon||Ic.bolt(accent,18)}<span style={{fontSize:10,fontWeight:800,color:accent,letterSpacing:3,fontFamily:fm,textTransform:"uppercase"}}>{title||"Material Insight"}</span></div><div style={{fontSize:13.5,color:P.txt,lineHeight:2,fontFamily:ff}}>{children}</div></div>);
}
function SectionHead({icon,title,sub,accent=P.ember}){
  return(<div style={{marginBottom:32}}><div style={{display:"flex",alignItems:"center",gap:14}}><div style={{width:44,height:44,borderRadius:14,background:"linear-gradient(135deg, "+accent+"20, "+accent+"08)",border:"1px solid "+accent+"30",display:"flex",alignItems:"center",justifyContent:"center"}}>{icon}</div><div><h2 style={{margin:0,fontSize:24,fontWeight:900,color:P.txt,fontFamily:ff}}>{title}</h2>{sub&&<p style={{margin:"2px 0 0",fontSize:12,color:P.sub,fontFamily:fm}}>{sub}</p>}</div></div><div style={{height:1,marginTop:18,background:"linear-gradient(90deg, "+accent+"50, "+accent+"15, transparent 80%)"}}/></div>);
}
function Pill({name,color}){
  return(<span style={{display:"inline-flex",alignItems:"center",gap:5,background:color+"12",border:"1px solid "+color+"30",borderRadius:20,padding:"3px 12px",fontSize:9,fontWeight:700,color,fontFamily:fm,letterSpacing:0.8,textTransform:"uppercase"}}><span style={{width:6,height:6,borderRadius:"50%",background:color}}/>{name}</span>);
}
function Tip({active,payload,label}){
  if(!active||!payload?.length)return null;
  return(<div style={{background:"rgba(22,12,38,0.95)",border:"1px solid "+P.rule,borderRadius:12,padding:"10px 14px"}}><div style={{fontSize:11,fontWeight:800,color:P.txt,fontFamily:fm,marginBottom:4}}>{label}</div>{payload.map((p,i)=>(<div key={i} style={{fontSize:11,color:p.color||P.sub,fontFamily:fm,lineHeight:1.8}}>{p.name}: {typeof p.value==="number"?p.value.toLocaleString():p.value}</div>))}</div>);
}

function CampaignSelector({campaigns,selected,onToggle,onSelectAll,onClearAll,search,onSearch}){
  const filtered = campaigns.filter(c => c.campaignName.toLowerCase().includes(search.toLowerCase()) || c.accountName.toLowerCase().includes(search.toLowerCase()));
  const grouped = {};
  filtered.forEach(c => { if(!grouped[c.accountName]) grouped[c.accountName]=[]; grouped[c.accountName].push(c); });
  return(<div style={{background:P.glass,border:"1px solid "+P.rule,borderRadius:16,padding:20,maxHeight:480,overflowY:"auto"}}>
    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>{Ic.search(P.sub,16)}<input placeholder="Search campaigns..." value={search} onChange={e=>onSearch(e.target.value)} style={{flex:1,background:"rgba(40,25,60,0.5)",border:"1px solid "+P.rule,borderRadius:8,padding:"8px 14px",color:P.txt,fontSize:12,fontFamily:fm,outline:"none"}}/></div>
    <div style={{display:"flex",gap:8,marginBottom:14}}>
      <button onClick={onSelectAll} style={{background:P.ember+"15",border:"1px solid "+P.ember+"30",borderRadius:8,padding:"5px 14px",color:P.ember,fontSize:10,fontWeight:700,fontFamily:fm,cursor:"pointer"}}>Select All ({filtered.length})</button>
      <button onClick={onClearAll} style={{background:P.rule,border:"1px solid "+P.rule,borderRadius:8,padding:"5px 14px",color:P.sub,fontSize:10,fontWeight:700,fontFamily:fm,cursor:"pointer"}}>Clear</button>
      <span style={{fontSize:10,color:P.dim,fontFamily:fm,alignSelf:"center",marginLeft:"auto"}}>{selected.length} selected</span>
    </div>
    {Object.entries(grouped).map(([account,cmps])=>(<div key={account} style={{marginBottom:14}}>
      <div style={{fontSize:10,fontWeight:800,color:P.orchid,letterSpacing:2,textTransform:"uppercase",fontFamily:fm,marginBottom:8,paddingBottom:4,borderBottom:"1px solid "+P.rule}}>{account}</div>
      {cmps.map(c=>{const sel=selected.includes(c.campaignId);return(<div key={c.campaignId} onClick={()=>onToggle(c.campaignId)} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",marginBottom:3,borderRadius:10,cursor:"pointer",background:sel?P.ember+"10":"transparent",border:"1px solid "+(sel?P.ember+"30":"transparent")}}>
        <div style={{width:20,height:20,borderRadius:6,border:"2px solid "+(sel?P.ember:P.dim),background:sel?P.ember:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{sel&&Ic.check("#fff",14)}</div>
        <div style={{flex:1,minWidth:0}}><div style={{fontSize:12,fontWeight:600,color:sel?P.txt:P.sub,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.campaignName}</div><div style={{fontSize:10,color:P.dim,fontFamily:fm}}>{fmt(c.impressions)} imps {fR(parseFloat(c.spend))}</div></div>
      </div>);})}
    </div>))}
  </div>);
}

function ShareModal({onClose,selectedNames}){
  const shareUrl=window.location.href;const[copied,setCopied]=useState(false);
  const copy=()=>{navigator.clipboard.writeText(shareUrl);setCopied(true);setTimeout(()=>setCopied(false),2000);};
  return(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000}} onClick={onClose}><div onClick={e=>e.stopPropagation()} style={{background:P.cosmos,border:"1px solid "+P.rule,borderRadius:20,padding:36,width:500,maxWidth:"90vw"}}><div style={{fontSize:18,fontWeight:900,color:P.txt,fontFamily:ff,marginBottom:8}}>Share Dashboard</div><div style={{fontSize:12,color:P.sub,marginBottom:16}}>Share a read-only view. Client can toggle dates but cannot see other campaigns.</div><div style={{display:"flex",gap:8}}><input readOnly value={shareUrl} style={{flex:1,background:P.glass,border:"1px solid "+P.rule,borderRadius:10,padding:"12px 16px",color:P.txt,fontSize:12,fontFamily:fm,outline:"none"}}/><button onClick={copy} style={{background:copied?P.mint:gEmber,border:"none",borderRadius:10,padding:"12px 24px",color:"#fff",fontSize:12,fontWeight:800,fontFamily:fm,cursor:"pointer",minWidth:80}}>{copied?"Copied!":"Copy"}</button></div></div></div>);
}

export default function MediaOnGas(){
  const[tab,setTab]=useState("overview");
  const[df,setDf]=useState("2026-04-01");
  const[dt,setDt]=useState("2026-04-07");
  const[campaigns,setCampaigns]=useState([]);
  const[tiktokData,setTiktokData]=useState(null);
  const[selected,setSelected]=useState([]);
  const[search,setSearch]=useState("");
  const[loading,setLoading]=useState(true);
  const[showCampaigns,setShowCampaigns]=useState(false);
  const[showShare,setShowShare]=useState(false);

  const fetchData=async()=>{
    setLoading(true);
    try{
      const[metaRes,ttRes]=await Promise.all([fetch(API+"/api/campaigns?from="+df+"&to="+dt),fetch(API+"/api/tiktok?from="+df+"&to="+dt)]);
      const metaJson=await metaRes.json();const ttJson=await ttRes.json();
      if(metaJson.campaigns){setCampaigns(metaJson.campaigns);if(selected.length===0)setSelected(metaJson.campaigns.map(c=>c.campaignId));}
      if(ttJson.data&&ttJson.data.list){
        const t=ttJson.data.list.filter(c=>parseFloat(c.metrics.impressions)>0).reduce((a,c)=>({impressions:a.impressions+parseFloat(c.metrics.impressions||0),spend:a.spend+parseFloat(c.metrics.spend||0),clicks:a.clicks+parseFloat(c.metrics.clicks||0),follows:a.follows+parseFloat(c.metrics.follows||0),likes:a.likes+parseFloat(c.metrics.likes||0),views:a.views+parseFloat(c.metrics.video_views_p100||0)}),{impressions:0,spend:0,clicks:0,follows:0,likes:0,views:0});
        t.cpm=t.impressions>0?(t.spend/t.impressions)*1000:0;setTiktokData(t);
      }
    }catch(e){console.error(e);}
    setLoading(false);
  };

  useEffect(()=>{fetchData();},[]);
  const refreshData=()=>{setSelected([]);fetchData();};
  const toggle=id=>setSelected(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id]);
  const selectAll=()=>{const f=campaigns.filter(c=>c.campaignName.toLowerCase().includes(search.toLowerCase())||c.accountName.toLowerCase().includes(search.toLowerCase()));setSelected(f.map(c=>c.campaignId));};
  const clearAll=()=>setSelected([]);

  const meta=useMemo(()=>{
    const sel=campaigns.filter(c=>selected.includes(c.campaignId));
    const t=sel.reduce((a,c)=>({impressions:a.impressions+parseFloat(c.impressions||0),reach:a.reach+parseFloat(c.reach||0),spend:a.spend+parseFloat(c.spend||0),clicks:a.clicks+parseFloat(c.clicks||0)}),{impressions:0,reach:0,spend:0,clicks:0});
    t.cpm=t.impressions>0?(t.spend/t.impressions)*1000:0;t.cpc=t.clicks>0?t.spend/t.clicks:0;t.ctr=t.impressions>0?(t.clicks/t.impressions)*100:0;t.frequency=t.reach>0?t.impressions/t.reach:0;
    return{campaigns:sel,totals:t};
  },[campaigns,selected]);

  const tt=tiktokData||{impressions:0,spend:0,clicks:0,follows:0,likes:0,views:0,cpm:0};
  const totalImps=meta.totals.impressions+tt.impressions;
  const totalSpend=meta.totals.spend+tt.spend;
  const totalClicks=meta.totals.clicks+tt.clicks;
  const blendedCpm=totalImps>0?(totalSpend/totalImps)*1000:0;
  const selectedNames=campaigns.filter(c=>selected.includes(c.campaignId)).map(c=>c.campaignName);

  const tabs=[{id:"overview",label:"Overview",icon:Ic.chart(P.orchid,18)},{id:"tof",label:"Ad Serving",icon:Ic.radar(P.ember,18)},{id:"mof",label:"Engagement",icon:Ic.pulse(P.mint,18)},{id:"bof",label:"Objectives",icon:Ic.target(P.rose,18)}];

  return(<div style={{minHeight:"100vh",background:"linear-gradient(170deg, "+P.void+" 0%, "+P.cosmos+" 30%, "+P.nebula+" 60%, "+P.cosmos+" 100%)",color:P.txt,fontFamily:ff,WebkitFontSmoothing:"antialiased"}}>
    <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0}}><div style={{position:"absolute",inset:0,opacity:0.018,backgroundImage:"radial-gradient("+P.ember+" 0.5px, transparent 0.5px), radial-gradient("+P.orchid+" 0.5px, transparent 0.5px)",backgroundSize:"40px 40px",backgroundPosition:"0 0, 20px 20px"}}/></div>
    <header style={{position:"sticky",top:0,zIndex:100,background:"rgba(6,2,14,0.92)",backdropFilter:"blur(24px)",borderBottom:"1px solid "+P.rule}}>
      <div style={{maxWidth:1400,margin:"0 auto",padding:"12px 32px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
          <div style={{display:"flex",alignItems:"center",gap:16}}>
            <div style={{width:44,height:44,borderRadius:"50%",background:gFire,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 0 25px "+P.ember+"50"}}><span style={{fontSize:11,fontWeight:900,color:"#fff",fontFamily:fm}}>GAS</span></div>
            <div><div style={{fontSize:17,fontWeight:900,letterSpacing:4,fontFamily:fm,lineHeight:1}}><span style={{color:P.txt}}>MEDIA </span><span style={{color:P.ember}}>ON </span><span style={{background:gFire,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>GAS</span></div><div style={{fontSize:8,color:P.dim,letterSpacing:5,textTransform:"uppercase",fontFamily:fm,marginTop:2}}>Digital Performance Intelligence</div></div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            <button onClick={()=>setShowCampaigns(!showCampaigns)} style={{background:showCampaigns?P.ember+"15":P.glass,border:"1px solid "+(showCampaigns?P.ember+"50":P.rule),borderRadius:10,padding:"9px 18px",color:showCampaigns?P.ember:P.sub,fontSize:11,fontWeight:700,fontFamily:fm,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>{Ic.chart(showCampaigns?P.ember:P.sub,14)} {selected.length} Campaign{selected.length!==1?"s":""}</button>
            <div style={{display:"flex",alignItems:"center",gap:6,background:P.glass,border:"1px solid "+P.rule,borderRadius:10,padding:"7px 14px"}}><span style={{fontSize:8,color:P.dim,fontFamily:fm,letterSpacing:2}}>FROM</span><input type="date" value={df} onChange={e=>setDf(e.target.value)} style={{background:"transparent",border:"none",color:P.txt,fontSize:11,fontFamily:fm,outline:"none",width:110}}/><div style={{width:14,height:1,background:"linear-gradient(90deg,"+P.ember+","+P.solar+")"}}/><span style={{fontSize:8,color:P.dim,fontFamily:fm,letterSpacing:2}}>TO</span><input type="date" value={dt} onChange={e=>setDt(e.target.value)} style={{background:"transparent",border:"none",color:P.txt,fontSize:11,fontFamily:fm,outline:"none",width:110}}/></div>
            <button onClick={refreshData} style={{background:gEmber,border:"none",borderRadius:10,padding:"9px 20px",color:"#fff",fontSize:11,fontWeight:800,fontFamily:fm,cursor:"pointer",letterSpacing:1.5}}>REFRESH</button>
            <button onClick={()=>setShowShare(true)} style={{background:P.glass,border:"1px solid "+P.rule,borderRadius:10,padding:"9px 14px",color:P.ember,fontSize:11,fontWeight:700,fontFamily:fm,cursor:"pointer",display:"flex",alignItems:"center",gap:5}}>{Ic.share(P.ember,14)} Share</button>
          </div>
        </div>
      </div>
      <div style={{maxWidth:1400,margin:"0 auto",padding:"0 32px"}}><div style={{display:"flex",gap:2}}>{tabs.map(t=>(<button key={t.id} onClick={()=>setTab(t.id)} style={{display:"flex",alignItems:"center",gap:6,background:tab===t.id?P.ember+"10":"transparent",border:"none",borderBottom:tab===t.id?"2px solid "+P.ember:"2px solid transparent",padding:"11px 22px",cursor:"pointer",color:tab===t.id?P.ember:P.sub,fontSize:11,fontWeight:tab===t.id?800:500,fontFamily:fm}}>{t.icon}<span>{t.label}</span></button>))}</div></div>
    </header>
    {showShare&&<ShareModal onClose={()=>setShowShare(false)} selectedNames={selectedNames}/>}
    <div style={{maxWidth:1400,margin:"0 auto",padding:"24px 32px 100px",display:"flex",gap:24,position:"relative",zIndex:1}}>
      {showCampaigns&&<div style={{width:360,flexShrink:0}}><CampaignSelector campaigns={campaigns} selected={selected} onToggle={toggle} onSelectAll={selectAll} onClearAll={clearAll} search={search} onSearch={setSearch}/></div>}
      <div style={{flex:1,minWidth:0}}>
        {loading?(<div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"80px 40px",gap:20}}><div style={{width:48,height:48,border:"3px solid "+P.rule,borderTop:"3px solid "+P.ember,borderRadius:"50%",animation:"spin 1s linear infinite"}}/><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style><div style={{fontSize:14,color:P.sub,fontFamily:fm}}>Pulling live data...</div></div>):(<>
        {tab==="overview"&&(<div>
          <SectionHead icon={Ic.chart(P.orchid,22)} title="Campaign Overview" sub={df+" to "+dt+" \u00B7 "+selected.length+" campaigns selected \u00B7 Live data"} accent={P.orchid}/>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:28}}>
            <Metric icon={Ic.eye(P.cyan,16)} label="Impressions" value={fmt(totalImps)} accent={P.cyan} sub={"Meta "+fmt(meta.totals.impressions)+" + TikTok "+fmt(tt.impressions)}/>
            <Metric icon={Ic.bolt(P.solar,16)} label="Spend" value={fR(totalSpend)} accent={P.solar} sub={"Meta "+fR(meta.totals.spend)+" + TikTok "+fR(tt.spend)}/>
            <Metric icon={Ic.globe(P.mint,16)} label="Blended CPM" value={fR(blendedCpm)} accent={P.mint} sub="Per 1,000 impressions"/>
            <Metric icon={Ic.users(P.fuchsia,16)} label="Clicks" value={fmt(totalClicks)} accent={P.fuchsia} sub={"Meta "+fmt(meta.totals.clicks)+" + TikTok "+fmt(tt.clicks)}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18,marginBottom:28}}>
            <Glass accent={P.orchid} st={{padding:24}}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:18}}>{Ic.eye(P.orchid,16)}<span style={{fontSize:10,fontWeight:800,color:P.orchid,letterSpacing:3,fontFamily:fm,textTransform:"uppercase"}}>Impression Share</span></div><ResponsiveContainer width="100%" height={200}><PieChart><Pie data={[{name:"Meta",value:meta.totals.impressions,color:P.fb},{name:"TikTok",value:tt.impressions,color:P.tt}]} cx="50%" cy="50%" outerRadius={78} innerRadius={48} paddingAngle={5} dataKey="value" stroke="none"><Cell fill={P.fb}/><Cell fill={P.tt}/></Pie><Tooltip content={Tip}/></PieChart></ResponsiveContainer><div style={{display:"flex",justifyContent:"center",gap:20,marginTop:8}}>{[{n:"Meta",v:meta.totals.impressions,c:P.fb},{n:"TikTok",v:tt.impressions,c:P.tt}].map(p=><div key={p.n} style={{display:"flex",alignItems:"center",gap:5}}><span style={{width:8,height:8,borderRadius:"50%",background:p.c}}/><span style={{fontSize:10,color:P.sub,fontFamily:fm}}>{p.n} {totalImps>0?((p.v/totalImps)*100).toFixed(1)+"%":"0%"}</span></div>)}</div></Glass>
            <Glass accent={P.fuchsia} st={{padding:24}}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:18}}>{Ic.bolt(P.fuchsia,16)}<span style={{fontSize:10,fontWeight:800,color:P.fuchsia,letterSpacing:3,fontFamily:fm,textTransform:"uppercase"}}>Spend Allocation</span></div><ResponsiveContainer width="100%" height={200}><PieChart><Pie data={[{name:"Meta",value:meta.totals.spend,color:P.fb},{name:"TikTok",value:tt.spend,color:P.tt}]} cx="50%" cy="50%" outerRadius={78} innerRadius={48} paddingAngle={5} dataKey="value" stroke="none"><Cell fill={P.fb}/><Cell fill={P.tt}/></Pie><Tooltip content={Tip}/></PieChart></ResponsiveContainer><div style={{display:"flex",justifyContent:"center",gap:20,marginTop:8}}>{[{n:"Meta",v:meta.totals.spend,c:P.fb},{n:"TikTok",v:tt.spend,c:P.tt}].map(p=><div key={p.n} style={{display:"flex",alignItems:"center",gap:5}}><span style={{width:8,height:8,borderRadius:"50%",background:p.c}}/><span style={{fontSize:10,color:P.sub,fontFamily:fm}}>{p.n} {fR(p.v)}</span></div>)}</div></Glass>
          </div>
          <Glass accent={P.orchid} st={{padding:24}}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:18}}>{Ic.globe(P.orchid,18)}<span style={{fontSize:10,fontWeight:800,color:P.orchid,letterSpacing:3,fontFamily:fm,textTransform:"uppercase"}}>Platform CPM</span></div><ResponsiveContainer width="100%" height={120}><BarChart data={[{name:"Meta",CPM:meta.totals.cpm,fill:P.fb},{name:"TikTok",CPM:tt.cpm,fill:P.tt},{name:"Blended",CPM:blendedCpm,fill:P.ember}]} layout="vertical" barSize={24}><CartesianGrid strokeDasharray="3 3" stroke={P.rule} horizontal={false}/><XAxis type="number" tick={{fontSize:10,fill:P.dim,fontFamily:fm}} stroke="transparent" tickFormatter={v=>"R"+v.toFixed(0)}/><YAxis type="category" dataKey="name" tick={{fontSize:12,fill:P.txt,fontFamily:fm,fontWeight:700}} stroke="transparent" width={70}/><Tooltip content={Tip}/><Bar dataKey="CPM" radius={[0,10,10,0]}><Cell fill={P.fb}/><Cell fill={P.tt}/><Cell fill={P.ember}/></Bar></BarChart></ResponsiveContainer>
          <Insight title="CPM Analysis" accent={P.orchid} icon={Ic.crown(P.orchid,16)}>{tt.cpm>0&&meta.totals.cpm>0?(<>Meta delivers impressions at <strong>{fR(meta.totals.cpm)} CPM</strong> whilst TikTok achieves <strong>{fR(tt.cpm)} CPM</strong>. The blended CPM of <strong>{fR(blendedCpm)}</strong> represents strong cross-platform value.</>):"Select campaigns and adjust dates to see CPM comparison."}</Insight></Glass>
        </div>)}
        {tab==="tof"&&(<div>
          <SectionHead icon={Ic.radar(P.ember,22)} title="Top of Funnel \u2014 Ad Serving" sub="Impressions \u00B7 Reach \u00B7 Frequency \u00B7 CPM" accent={P.ember}/>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:28}}><Metric icon={Ic.eye(P.cyan,16)} label="Impressions" value={fmt(totalImps)} accent={P.cyan}/><Metric icon={Ic.users(P.orchid,16)} label="Meta Reach" value={fmt(meta.totals.reach)} accent={P.orchid}/><Metric icon={Ic.radar(P.rose,16)} label="Frequency" value={meta.totals.frequency>0?meta.totals.frequency.toFixed(2)+"x":"N/A"} accent={P.rose}/><Metric icon={Ic.bolt(P.mint,16)} label="Blended CPM" value={fR(blendedCpm)} accent={P.mint}/></div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18,marginBottom:28}}>
            <Glass accent={P.fb} hv st={{padding:24}}><div style={{fontSize:17,fontWeight:900,color:P.fb,fontFamily:ff,marginBottom:18}}>Meta</div>{[{l:"Impressions",v:fmt(meta.totals.impressions)},{l:"Reach",v:fmt(meta.totals.reach)},{l:"Frequency",v:meta.totals.frequency>0?meta.totals.frequency.toFixed(2)+"x":"N/A"},{l:"CPM",v:fR(meta.totals.cpm),c:P.fb},{l:"Spend",v:fR(meta.totals.spend),c:P.ember}].map((m,i)=>(<div key={i} style={{display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:"1px solid "+P.rule}}><span style={{fontSize:10,color:P.dim,fontFamily:fm,letterSpacing:2,textTransform:"uppercase"}}>{m.l}</span><span style={{fontSize:17,fontWeight:800,color:m.c||P.txt,fontFamily:fm}}>{m.v}</span></div>))}</Glass>
            <Glass accent={P.tt} hv st={{padding:24}}><div style={{fontSize:17,fontWeight:900,color:P.tt,fontFamily:ff,marginBottom:18}}>TikTok</div>{[{l:"Impressions",v:fmt(tt.impressions)},{l:"CPM",v:fR(tt.cpm),c:P.tt},{l:"Clicks",v:fmt(tt.clicks)},{l:"Follows",v:fmt(tt.follows),c:P.mint},{l:"Spend",v:fR(tt.spend),c:P.ember}].map((m,i)=>(<div key={i} style={{display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:"1px solid "+P.rule}}><span style={{fontSize:10,color:P.dim,fontFamily:fm,letterSpacing:2,textTransform:"uppercase"}}>{m.l}</span><span style={{fontSize:17,fontWeight:800,color:m.c||P.txt,fontFamily:fm}}>{m.v}</span></div>))}</Glass>
          </div>
          <Glass st={{padding:24}}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:18}}>{Ic.chart(P.ember,18)}<span style={{fontSize:10,fontWeight:800,color:P.ember,letterSpacing:3,fontFamily:fm,textTransform:"uppercase"}}>Impression Volume</span></div><ResponsiveContainer width="100%" height={200}><BarChart data={[{name:"Meta",Impressions:meta.totals.impressions,fill:P.fb},{name:"TikTok",Impressions:tt.impressions,fill:P.tt}]} barSize={60}><CartesianGrid strokeDasharray="3 3" stroke={P.rule}/><XAxis dataKey="name" tick={{fontSize:12,fill:P.txt,fontFamily:fm}} stroke="transparent"/><YAxis tick={{fontSize:10,fill:P.dim,fontFamily:fm}} stroke="transparent" tickFormatter={v=>fmt(v)}/><Tooltip content={Tip}/><Bar dataKey="Impressions" radius={[12,12,0,0]}><Cell fill={P.fb}/><Cell fill={P.tt}/></Bar></BarChart></ResponsiveContainer></Glass>
        </div>)}
        {tab==="mof"&&(<div>
          <SectionHead icon={Ic.pulse(P.mint,22)} title="Middle of Funnel \u2014 Engagement" sub="Clicks \u00B7 CTR \u00B7 CPC \u00B7 Campaigns" accent={P.mint}/>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:28}}><Metric icon={Ic.pulse(P.mint,16)} label="Total Clicks" value={fmt(totalClicks)} accent={P.mint}/><Metric icon={Ic.bolt(P.solar,16)} label="Meta CPC" value={fR(meta.totals.cpc)} accent={P.solar}/><Metric icon={Ic.eye(P.cyan,16)} label="Meta CTR" value={pc(meta.totals.ctr)} accent={P.cyan}/><Metric icon={Ic.users(P.fuchsia,16)} label="TT Follows" value={fmt(tt.follows)} accent={P.fuchsia}/></div>
          <Glass accent={P.orchid} st={{padding:24}}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:18}}>{Ic.crown(P.solar,18)}<span style={{fontSize:10,fontWeight:800,color:P.solar,letterSpacing:3,fontFamily:fm,textTransform:"uppercase"}}>Campaign Performance</span></div>
          {meta.campaigns.sort((a,b)=>parseFloat(b.clicks||0)-parseFloat(a.clicks||0)).slice(0,8).map((c,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:14,padding:"12px 16px",marginBottom:4,background:i%2===0?P.orchid+"06":"transparent",borderRadius:10,borderLeft:"3px solid "+(i===0?P.solar:P.fb)}}>
            <div style={{width:28,height:28,borderRadius:8,background:i===0?P.solar+"15":P.fb+"10",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:900,color:i===0?P.solar:P.fb,fontFamily:fm}}>#{i+1}</div>
            <div style={{flex:1,minWidth:0}}><div style={{fontSize:11,fontWeight:700,color:P.txt,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.campaignName}</div><Pill name={c.accountName} color={P.orchid}/></div>
            <div style={{textAlign:"right",minWidth:65}}><div style={{fontSize:15,fontWeight:900,color:P.txt,fontFamily:fm}}>{fmt(parseFloat(c.clicks||0))}</div><div style={{fontSize:8,color:P.dim,fontFamily:fm}}>clicks</div></div>
            <div style={{textAlign:"right",minWidth:60}}><div style={{fontSize:13,fontWeight:800,color:P.mint,fontFamily:fm}}>{fR(parseFloat(c.cpc||0))}</div><div style={{fontSize:8,color:P.dim,fontFamily:fm}}>CPC</div></div>
            <div style={{textAlign:"right",minWidth:50}}><div style={{fontSize:13,fontWeight:700,color:P.sub,fontFamily:fm}}>{pc(parseFloat(c.ctr||0))}</div><div style={{fontSize:8,color:P.dim,fontFamily:fm}}>CTR</div></div>
            <div style={{textAlign:"right",minWidth:65}}><div style={{fontSize:13,fontWeight:700,color:P.ember,fontFamily:fm}}>{fR(parseFloat(c.spend||0))}</div><div style={{fontSize:8,color:P.dim,fontFamily:fm}}>spend</div></div>
          </div>))}</Glass>
        </div>)}
        {tab==="bof"&&(<div>
          <SectionHead icon={Ic.target(P.rose,22)} title="Bottom of Funnel \u2014 Results" sub="Objective Results \u00B7 Cost Per Result \u00B7 Platform Totals" accent={P.rose}/>
          <Glass accent={P.ember} st={{padding:28,background:"linear-gradient(135deg, "+P.lava+"05, "+P.ember+"05, "+P.solar+"05)"}}><div style={{display:"flex",alignItems:"center",gap:10,marginBottom:24}}>{Ic.users(P.ember,20)}<span style={{fontSize:10,fontWeight:800,color:P.ember,letterSpacing:3,fontFamily:fm,textTransform:"uppercase"}}>Combined Results</span></div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:20}}>
              <div><div style={{fontSize:9,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:6}}>IMPRESSIONS</div><div style={{fontSize:32,fontWeight:900,fontFamily:ff,lineHeight:1,color:P.ember}}>{fmt(totalImps)}</div></div>
              <div style={{borderLeft:"1px solid "+P.rule,paddingLeft:18}}><div style={{fontSize:9,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:6}}>SPEND</div><div style={{fontSize:24,fontWeight:900,color:P.solar,fontFamily:fm,lineHeight:1}}>{fR(totalSpend)}</div></div>
              <div style={{borderLeft:"1px solid "+P.rule,paddingLeft:18}}><div style={{fontSize:9,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:6}}>CLICKS</div><div style={{fontSize:24,fontWeight:900,color:P.mint,fontFamily:fm,lineHeight:1}}>{fmt(totalClicks)}</div></div>
              <div style={{borderLeft:"1px solid "+P.rule,paddingLeft:18}}><div style={{fontSize:9,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:6}}>TT FOLLOWS</div><div style={{fontSize:24,fontWeight:900,color:P.tt,fontFamily:fm,lineHeight:1}}>{fmt(tt.follows)}</div></div>
            </div>
            <Insight title="Performance Summary" icon={Ic.crown(P.ember,16)} accent={P.ember}>The selected campaigns delivered <strong>{fmt(totalImps)} impressions</strong> across Meta and TikTok against <strong>{fR(totalSpend)}</strong> investment at a blended CPM of {fR(blendedCpm)}. Meta reached {fmt(meta.totals.reach)} unique people generating {fmt(meta.totals.clicks)} clicks at {fR(meta.totals.cpc)} CPC. TikTok delivered {fmt(tt.impressions)} impressions at {fR(tt.cpm)} CPM with {fmt(tt.follows)} new followers.</Insight>
          </Glass>
        </div>)}
        </>)}
      </div>
    </div>
    <footer style={{borderTop:"1px solid "+P.rule,background:"rgba(6,2,14,0.95)",padding:"24px 32px"}}><div style={{maxWidth:1400,margin:"0 auto",display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={{display:"flex",alignItems:"center",gap:12}}><div style={{width:28,height:28,borderRadius:"50%",background:gFire,display:"flex",alignItems:"center",justifyContent:"center",fontSize:7,fontWeight:900,color:"#fff",fontFamily:fm}}>GAS</div><span style={{fontSize:11,fontWeight:800,color:P.sub,fontFamily:fm,letterSpacing:2}}>MEDIA ON GAS</span><span style={{fontSize:9,color:P.dim}}>Powered by GAS Response Marketing</span></div><div style={{fontSize:9,color:P.dim,fontFamily:fm,textAlign:"right",lineHeight:1.8}}>Live data \u00B7 All figures in ZAR \u00B7 Confidential \u00B7 grow@gasmarketing.co.za</div></div></footer>
  </div>);
}
