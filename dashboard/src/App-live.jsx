import { useState, useEffect, useMemo } from "react";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Line, Area } from "recharts";

// ─── BRAND ───────────────────────────────────────────────────────────
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
const ff = "Outfit,Trebuchet MS,sans-serif";
const fm = "Consolas,Courier New,monospace";

// ─── API BASE ────────────────────────────────────────────────────────
const API = window.location.origin;

// ─── CLIENTS CONFIG ──────────────────────────────────────────────────
const CLIENTS = [
  { slug:"mtn-momo", name:"MTN MoMo", brandColour:"#004F71", brandAccent:"#FFCB05", platforms:["Facebook","Instagram","TikTok"] },
];

// ─── ICONS ───────────────────────────────────────────────────────────
const Ic = {
  radar:(c=P.ember,s=20)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke={c} strokeWidth="1.5" opacity="0.3"/><circle cx="12" cy="12" r="6" stroke={c} strokeWidth="1.5" opacity="0.5"/><circle cx="12" cy="12" r="2" fill={c}/><line x1="12" y1="2" x2="12" y2="12" stroke={c} strokeWidth="1.5"/></svg>,
  pulse:(c=P.mint,s=20)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M2 12h4l3-8 4 16 3-8h6" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  target:(c=P.rose,s=20)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke={c} strokeWidth="1.5"/><circle cx="12" cy="12" r="6" stroke={c} strokeWidth="1.5"/><circle cx="12" cy="12" r="2" fill={c}/><path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke={c} strokeWidth="1.5"/></svg>,
  bolt:(c=P.solar,s=20)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke={c} strokeWidth="1.5" fill={c+"15"} strokeLinejoin="round"/></svg>,
  eye:(c=P.cyan,s=20)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" stroke={c} strokeWidth="1.5"/><circle cx="12" cy="12" r="3" stroke={c} strokeWidth="1.5" fill={c+"15"}/></svg>,
  crown:(c=P.solar,s=20)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M2 20h20L19 8l-4 5-3-7-3 7-4-5L2 20z" stroke={c} strokeWidth="1.5" fill={c+"15"} strokeLinejoin="round"/></svg>,
  users:(c=P.fuchsia,s=20)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none"><circle cx="9" cy="7" r="3" stroke={c} strokeWidth="1.5"/><circle cx="17" cy="7" r="2.5" stroke={c} strokeWidth="1.5" opacity="0.6"/><path d="M2 21v-2a5 5 0 0110 0v2" stroke={c} strokeWidth="1.5"/></svg>,
  chart:(c=P.orchid,s=20)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none"><rect x="3" y="12" width="4" height="9" rx="1" stroke={c} strokeWidth="1.5" fill={c+"15"}/><rect x="10" y="6" width="4" height="15" rx="1" stroke={c} strokeWidth="1.5" fill={c+"15"}/><rect x="17" y="2" width="4" height="19" rx="1" stroke={c} strokeWidth="1.5" fill={c+"15"}/></svg>,
  globe:(c=P.cyan,s=20)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke={c} strokeWidth="1.5"/><ellipse cx="12" cy="12" rx="4" ry="10" stroke={c} strokeWidth="1" opacity="0.4"/><path d="M2 12h20M3 7h18M3 17h18" stroke={c} strokeWidth="1" opacity="0.3"/></svg>,
  share:(c=P.ember,s=20)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none"><circle cx="18" cy="5" r="3" stroke={c} strokeWidth="1.5"/><circle cx="6" cy="12" r="3" stroke={c} strokeWidth="1.5"/><circle cx="18" cy="19" r="3" stroke={c} strokeWidth="1.5"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" stroke={c} strokeWidth="1.5"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" stroke={c} strokeWidth="1.5"/></svg>,
  fire:(c=P.ember,s=20)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M12 2c0 4-4 6-4 10a6 6 0 0012 0c0-4-4-6-4-10z" stroke={c} strokeWidth="1.5" fill={c+"20"}/></svg>,
  load:(c=P.ember,s=20)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke={c} strokeWidth="1.5" opacity="0.3" strokeDasharray="4 4"/><path d="M12 2a10 10 0 019 5.5" stroke={c} strokeWidth="2" strokeLinecap="round"/></svg>,
};

// ─── HELPERS ─────────────────────────────────────────────────────────
const fmt = n => { const v = parseFloat(n); if(isNaN(v)) return "0"; if(v>=1e6) return(v/1e6).toFixed(2)+"M"; if(v>=1e3) return(v/1e3).toFixed(1)+"K"; return v.toLocaleString(); };
const fR = n => { const v = parseFloat(n); return isNaN(v) ? "R0.00" : "R"+v.toLocaleString("en-ZA",{minimumFractionDigits:2,maximumFractionDigits:2}); };
const pc = n => { const v = parseFloat(n); return isNaN(v) ? "0.00%" : v.toFixed(2)+"%"; };

// ─── UI COMPONENTS ───────────────────────────────────────────────────
function Glass({children,accent=P.ember,hv=false,st={}}){
  const[h,sH]=useState(false);
  return(<div onMouseEnter={()=>sH(true)} onMouseLeave={()=>sH(false)} style={{background:P.glass,border:"1px solid "+(h&&hv?accent+"50":P.rule),borderRadius:16,position:"relative",overflow:"hidden",transition:"all 0.4s cubic-bezier(0.16,1,0.3,1)",transform:h&&hv?"translateY(-2px)":"none",boxShadow:h&&hv?"0 12px 40px "+accent+"15":"0 4px 20px rgba(0,0,0,0.25)",...st}}>
    <div style={{position:"absolute",top:0,left:"10%",right:"10%",height:1,background:"linear-gradient(90deg, transparent, "+accent+"80, transparent)",opacity:h&&hv?1:0.4,transition:"opacity 0.4s"}}/>
    {children}
  </div>);
}

function Metric({icon,label,value,sub,accent=P.ember}){
  return(<Glass accent={accent} hv st={{padding:"24px 22px"}}>
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>{icon}<span style={{fontSize:9,fontWeight:700,color:P.sub,letterSpacing:3,textTransform:"uppercase",fontFamily:fm}}>{label}</span></div>
    <div style={{fontSize:28,fontWeight:900,fontFamily:ff,lineHeight:1,letterSpacing:-1.5,color:accent}}>{value}</div>
    {sub&&<div style={{fontSize:10,color:P.dim,marginTop:10,fontFamily:fm,lineHeight:1.6}}>{sub}</div>}
  </Glass>);
}

function Insight({title,children,accent=P.ember,icon}){
  return(<div style={{marginTop:24,padding:"24px 28px",background:"linear-gradient(135deg, "+accent+"06 0%, "+accent+"02 100%)",border:"1px solid "+accent+"18",borderLeft:"4px solid "+accent,borderRadius:"0 16px 16px 0",position:"relative"}}>
    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>{icon||Ic.bolt(accent,18)}<span style={{fontSize:10,fontWeight:800,color:accent,letterSpacing:3,fontFamily:fm,textTransform:"uppercase"}}>{title||"Material Insight"}</span></div>
    <div style={{fontSize:13.5,color:P.txt,lineHeight:2,fontFamily:ff}}>{children}</div>
  </div>);
}

function SectionHead({icon,title,sub,accent=P.ember}){
  return(<div style={{marginBottom:32}}>
    <div style={{display:"flex",alignItems:"center",gap:14}}>
      <div style={{width:44,height:44,borderRadius:14,background:"linear-gradient(135deg, "+accent+"20, "+accent+"08)",border:"1px solid "+accent+"30",display:"flex",alignItems:"center",justifyContent:"center"}}>{icon}</div>
      <div><h2 style={{margin:0,fontSize:26,fontWeight:900,color:P.txt,fontFamily:ff}}>{title}</h2>{sub&&<p style={{margin:"2px 0 0",fontSize:12,color:P.sub,fontFamily:fm}}>{sub}</p>}</div>
    </div>
    <div style={{height:1,marginTop:18,background:"linear-gradient(90deg, "+accent+"50, "+accent+"15, transparent 80%)"}}/>
  </div>);
}

function Pill({name,color}){
  return(<span style={{display:"inline-flex",alignItems:"center",gap:6,background:color+"12",border:"1px solid "+color+"30",borderRadius:20,padding:"4px 14px",fontSize:10,fontWeight:700,color,fontFamily:fm,letterSpacing:0.8,textTransform:"uppercase"}}>
    <span style={{width:7,height:7,borderRadius:"50%",background:color,boxShadow:"0 0 8px "+color+"80"}}/>{name}
  </span>);
}

function Tip({active,payload,label}){
  if(!active||!payload?.length)return null;
  return(<div style={{background:"rgba(22,12,38,0.95)",border:"1px solid "+P.rule,borderRadius:12,padding:"12px 16px",boxShadow:"0 12px 48px rgba(0,0,0,0.6)"}}>
    <div style={{fontSize:11,fontWeight:800,color:P.txt,fontFamily:fm,marginBottom:6}}>{label}</div>
    {payload.map((p,i)=>(<div key={i} style={{fontSize:11,color:p.color||P.sub,fontFamily:fm,lineHeight:1.8}}>{p.name}: {typeof p.value==="number"?p.value.toLocaleString():p.value}</div>))}
  </div>);
}

// ─── LOADING SPINNER ─────────────────────────────────────────────────
function Loading({message="Pulling live data..."}){
  return(<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"80px 40px",gap:20}}>
    <div style={{width:48,height:48,border:"3px solid "+P.rule,borderTop:"3px solid "+P.ember,borderRadius:"50%",animation:"spin 1s linear infinite"}}/>
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    <div style={{fontSize:14,color:P.sub,fontFamily:fm}}>{message}</div>
  </div>);
}

// ─── SHARE MODAL ─────────────────────────────────────────────────────
function ShareModal({client,onClose}){
  const shareUrl = window.location.origin + "/view/" + client.slug;
  const[copied,setCopied]=useState(false);
  const copy = () => { navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(()=>setCopied(false),2000); };
  return(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000}} onClick={onClose}>
    <div onClick={e=>e.stopPropagation()} style={{background:P.cosmos,border:"1px solid "+P.rule,borderRadius:20,padding:36,width:480,maxWidth:"90vw"}}>
      <div style={{fontSize:18,fontWeight:900,color:P.txt,fontFamily:ff,marginBottom:8}}>Share with {client.name}</div>
      <div style={{fontSize:12,color:P.sub,marginBottom:24}}>This link gives read-only access to {client.name}'s campaign dashboard. They can toggle dates but cannot see other clients or team controls.</div>
      <div style={{display:"flex",gap:8}}>
        <input readOnly value={shareUrl} style={{flex:1,background:P.glass,border:"1px solid "+P.rule,borderRadius:10,padding:"12px 16px",color:P.txt,fontSize:13,fontFamily:fm,outline:"none"}}/>
        <button onClick={copy} style={{background:copied?P.mint:gEmber,border:"none",borderRadius:10,padding:"12px 24px",color:"#fff",fontSize:12,fontWeight:800,fontFamily:fm,cursor:"pointer",minWidth:80}}>{copied?"Copied!":"Copy"}</button>
      </div>
    </div>
  </div>);
}

// ─── DATA PROCESSING ─────────────────────────────────────────────────
function processMetaData(raw) {
  if (!raw || !raw.data) return { campaigns: [], totals: { impressions:0, reach:0, spend:0, clicks:0, frequency:0, cpm:0, cpc:0, ctr:0 }, byPlatform: {} };
  const campaigns = raw.data.map(c => ({
    name: c.campaign_name,
    impressions: parseFloat(c.impressions || 0),
    reach: parseFloat(c.reach || 0),
    frequency: parseFloat(c.frequency || 0),
    spend: parseFloat(c.spend || 0),
    cpm: parseFloat(c.cpm || 0),
    cpc: parseFloat(c.cpc || 0),
    ctr: parseFloat(c.ctr || 0),
    clicks: parseFloat(c.clicks || 0),
    actions: c.actions || [],
    platform: "Meta",
  }));
  const totals = campaigns.reduce((acc, c) => ({
    impressions: acc.impressions + c.impressions,
    reach: acc.reach + c.reach,
    spend: acc.spend + c.spend,
    clicks: acc.clicks + c.clicks,
    frequency: 0,
    cpm: 0, cpc: 0, ctr: 0,
  }), { impressions:0, reach:0, spend:0, clicks:0, frequency:0, cpm:0, cpc:0, ctr:0 });
  if (totals.impressions > 0) {
    totals.cpm = (totals.spend / totals.impressions) * 1000;
    totals.ctr = (totals.clicks / totals.impressions) * 100;
  }
  if (totals.clicks > 0) totals.cpc = totals.spend / totals.clicks;
  if (totals.reach > 0) totals.frequency = totals.impressions / totals.reach;
  return { campaigns, totals };
}

function processTikTokData(raw) {
  if (!raw || !raw.data || !raw.data.list) return { campaigns: [], totals: { impressions:0, spend:0, clicks:0, cpm:0, cpc:0, ctr:0 } };
  const campaigns = raw.data.list.filter(c => parseFloat(c.metrics.impressions) > 0).map(c => ({
    id: c.dimensions.campaign_id,
    impressions: parseFloat(c.metrics.impressions || 0),
    spend: parseFloat(c.metrics.spend || 0),
    clicks: parseFloat(c.metrics.clicks || 0),
    cpm: parseFloat(c.metrics.cpm || 0),
    cpc: parseFloat(c.metrics.cpc || 0),
    ctr: parseFloat(c.metrics.ctr || 0),
    follows: parseFloat(c.metrics.follows || 0),
    likes: parseFloat(c.metrics.likes || 0),
    views: parseFloat(c.metrics.video_views_p100 || 0),
    platform: "TikTok",
  }));
  const totals = campaigns.reduce((acc, c) => ({
    impressions: acc.impressions + c.impressions,
    spend: acc.spend + c.spend,
    clicks: acc.clicks + c.clicks,
    follows: acc.follows + c.follows,
    likes: acc.likes + c.likes,
    views: acc.views + c.views,
    cpm: 0, cpc: 0, ctr: 0,
  }), { impressions:0, spend:0, clicks:0, follows:0, likes:0, views:0, cpm:0, cpc:0, ctr:0 });
  if (totals.impressions > 0) {
    totals.cpm = (totals.spend / totals.impressions) * 1000;
    totals.ctr = (totals.clicks / totals.impressions) * 100;
  }
  if (totals.clicks > 0) totals.cpc = totals.spend / totals.clicks;
  return { campaigns, totals };
}

// ─── MAIN APP ────────────────────────────────────────────────────────
export default function MediaOnGas() {
  // Detect if client view
  const path = window.location.pathname;
  const viewMatch = path.match(/^\/view\/(.+)/);
  const isClientView = !!viewMatch;
  const lockedSlug = viewMatch ? viewMatch[1] : null;

  const [client, setClient] = useState(lockedSlug || CLIENTS[0].slug);
  const [tab, setTab] = useState("overview");
  const [df, setDf] = useState("2026-03-01");
  const [dt, setDt] = useState("2026-04-07");
  const [metaData, setMetaData] = useState(null);
  const [tiktokData, setTiktokData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showShare, setShowShare] = useState(false);

  const currentClient = CLIENTS.find(c => c.slug === client) || CLIENTS[0];

  // Fetch data
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [metaRes, ttRes] = await Promise.all([
        fetch(API + "/api/meta?client=" + client + "&from=" + df + "&to=" + dt),
        fetch(API + "/api/tiktok?client=" + client + "&from=" + df + "&to=" + dt),
      ]);
      const metaJson = await metaRes.json();
      const ttJson = await ttRes.json();
      setMetaData(processMetaData(metaJson));
      setTiktokData(processTikTokData(ttJson));
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [client, df, dt]);

  // Combined metrics
  const combined = useMemo(() => {
    if (!metaData || !tiktokData) return null;
    const m = metaData.totals;
    const t = tiktokData.totals;
    const totalImps = m.impressions + t.impressions;
    const totalSpend = m.spend + t.spend;
    const totalClicks = m.clicks + t.clicks;
    return {
      impressions: totalImps,
      spend: totalSpend,
      clicks: totalClicks,
      cpm: totalImps > 0 ? (totalSpend / totalImps) * 1000 : 0,
      cpc: totalClicks > 0 ? totalSpend / totalClicks : 0,
      metaImps: m.impressions,
      metaSpend: m.spend,
      metaCpm: m.cpm,
      metaCpc: m.cpc,
      metaCtr: m.ctr,
      metaReach: m.reach,
      metaFreq: m.frequency,
      metaClicks: m.clicks,
      ttImps: t.impressions,
      ttSpend: t.spend,
      ttCpm: t.cpm,
      ttCpc: t.cpc,
      ttClicks: t.clicks,
      ttFollows: t.follows || 0,
      ttLikes: t.likes || 0,
      ttViews: t.views || 0,
      impShare: [
        {name:"Meta",value:m.impressions,color:P.fb},
        {name:"TikTok",value:t.impressions,color:P.tt},
      ],
      spendShare: [
        {name:"Meta",value:m.spend,color:P.fb},
        {name:"TikTok",value:t.spend,color:P.tt},
      ],
      cpmCompare: [
        {name:"Meta",CPM:m.cpm,fill:P.fb},
        {name:"TikTok",CPM:t.cpm,fill:P.tt},
      ],
    };
  }, [metaData, tiktokData]);

  const tabs = [
    {id:"overview",label:"Overview",icon:Ic.chart(P.orchid,18)},
    {id:"tof",label:"Ad Serving",icon:Ic.radar(P.ember,18)},
    {id:"mof",label:"Engagement",icon:Ic.pulse(P.mint,18)},
    {id:"bof",label:"Objectives",icon:Ic.target(P.rose,18)},
  ];

  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(170deg, "+P.void+" 0%, "+P.cosmos+" 30%, "+P.nebula+" 60%, "+P.cosmos+" 100%)",color:P.txt,fontFamily:ff}}>
      <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0}}>
        <div style={{position:"absolute",inset:0,opacity:0.018,backgroundImage:"radial-gradient("+P.ember+" 0.5px, transparent 0.5px), radial-gradient("+P.orchid+" 0.5px, transparent 0.5px)",backgroundSize:"40px 40px",backgroundPosition:"0 0, 20px 20px"}}/>
      </div>

      {/* HEADER */}
      <header style={{position:"sticky",top:0,zIndex:100,background:"rgba(6,2,14,0.92)",backdropFilter:"blur(24px)",borderBottom:"1px solid "+P.rule}}>
        <div style={{maxWidth:1280,margin:"0 auto",padding:"14px 40px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{display:"flex",alignItems:"center",gap:18}}>
              <div style={{width:46,height:46,borderRadius:"50%",background:gFire,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 0 25px "+P.ember+"50",border:"2px solid rgba(255,255,255,0.1)"}}>
                <span style={{fontSize:12,fontWeight:900,color:"#fff",fontFamily:fm}}>GAS</span>
              </div>
              <div>
                <div style={{fontSize:18,fontWeight:900,letterSpacing:4,fontFamily:fm,lineHeight:1}}>
                  <span style={{color:P.txt}}>MEDIA </span><span style={{color:P.ember}}>ON </span><span style={{background:gFire,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>GAS</span>
                </div>
                <div style={{fontSize:8,color:P.dim,letterSpacing:5,textTransform:"uppercase",fontFamily:fm,marginTop:3}}>
                  {isClientView ? "Client Performance Dashboard" : "Digital Performance Intelligence"}
                </div>
              </div>
            </div>

            <div style={{display:"flex",alignItems:"center",gap:10}}>
              {/* Client Selector - team only */}
              {!isClientView && (
                <select value={client} onChange={e=>setClient(e.target.value)} style={{background:P.glass,border:"1px solid "+P.rule,borderRadius:10,padding:"9px 16px",color:P.txt,fontSize:12,fontFamily:fm,outline:"none",cursor:"pointer",appearance:"auto"}}>
                  {CLIENTS.map(c=>(<option key={c.slug} value={c.slug} style={{background:P.cosmos}}>{c.name}</option>))}
                </select>
              )}

              {/* Date Range */}
              <div style={{display:"flex",alignItems:"center",gap:8,background:P.glass,border:"1px solid "+P.rule,borderRadius:10,padding:"8px 16px"}}>
                <span style={{fontSize:8,color:P.dim,fontFamily:fm,letterSpacing:2}}>FROM</span>
                <input type="date" value={df} onChange={e=>setDf(e.target.value)} style={{background:"transparent",border:"none",color:P.txt,fontSize:12,fontFamily:fm,outline:"none",width:115}}/>
                <div style={{width:16,height:1,background:"linear-gradient(90deg,"+P.ember+","+P.solar+")"}}/>
                <span style={{fontSize:8,color:P.dim,fontFamily:fm,letterSpacing:2}}>TO</span>
                <input type="date" value={dt} onChange={e=>setDt(e.target.value)} style={{background:"transparent",border:"none",color:P.txt,fontSize:12,fontFamily:fm,outline:"none",width:115}}/>
              </div>

              <button onClick={fetchData} style={{background:gEmber,border:"none",borderRadius:10,padding:"10px 22px",color:"#fff",fontSize:11,fontWeight:800,fontFamily:fm,cursor:"pointer",letterSpacing:1.5,boxShadow:"0 4px 20px "+P.ember+"30"}}>REFRESH</button>

              {/* Share Button - team only */}
              {!isClientView && (
                <button onClick={()=>setShowShare(true)} style={{background:P.glass,border:"1px solid "+P.rule,borderRadius:10,padding:"10px 16px",color:P.ember,fontSize:11,fontWeight:700,fontFamily:fm,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
                  {Ic.share(P.ember,16)} Share
                </button>
              )}
            </div>
          </div>

          {/* Client Banner */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:12,padding:"10px 18px",background:P.glass,border:"1px solid "+P.rule,borderRadius:10}}>
            <div style={{display:"flex",alignItems:"center",gap:14}}>
              <div style={{background:currentClient.brandColour,borderRadius:8,padding:"5px 12px",fontSize:13,fontWeight:900,color:currentClient.brandAccent,fontFamily:fm}}>{currentClient.name.split(" ")[0]}</div>
              <span style={{fontSize:14,fontWeight:800}}>{currentClient.name}</span>
              {isClientView && <span style={{fontSize:11,color:P.sub}}>Client View</span>}
              {loading && <span style={{fontSize:10,color:P.ember,fontFamily:fm}}>Fetching live data...</span>}
            </div>
            <div style={{display:"flex",gap:6}}>
              {currentClient.platforms.map(p=>{const c=p==="Facebook"?P.fb:p==="Instagram"?P.ig:P.tt;return<Pill key={p} name={p} color={c}/>;})}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{maxWidth:1280,margin:"0 auto",padding:"0 40px"}}>
          <div style={{display:"flex",gap:2}}>
            {tabs.map(t=>(<button key={t.id} onClick={()=>setTab(t.id)} style={{display:"flex",alignItems:"center",gap:8,background:tab===t.id?P.ember+"10":"transparent",border:"none",borderBottom:tab===t.id?"2px solid "+P.ember:"2px solid transparent",padding:"12px 24px",cursor:"pointer",color:tab===t.id?P.ember:P.sub,fontSize:12,fontWeight:tab===t.id?800:500,fontFamily:fm}}>{t.icon}<span>{t.label}</span></button>))}
          </div>
        </div>
      </header>

      {/* SHARE MODAL */}
      {showShare && <ShareModal client={currentClient} onClose={()=>setShowShare(false)}/>}

      {/* CONTENT */}
      <main style={{maxWidth:1280,margin:"0 auto",padding:"40px 40px 100px",position:"relative",zIndex:1}}>
        {loading && <Loading message={"Pulling live data from Meta & TikTok for "+currentClient.name+"..."}/>}
        {error && <div style={{padding:40,textAlign:"center",color:P.rose}}>Error: {error}. Try refreshing.</div>}

        {!loading && !error && combined && (
          <>
            {/* ═══ OVERVIEW ═══ */}
            {tab==="overview"&&(<div>
              <SectionHead icon={Ic.chart(P.orchid,22)} title="Campaign Overview" sub={df+" to "+dt+" \u00B7 Live Data \u00B7 "+currentClient.name} accent={P.orchid}/>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:16,marginBottom:32}}>
                <Metric icon={Ic.eye(P.cyan,16)} label="Total Impressions" value={fmt(combined.impressions)} accent={P.cyan} sub="Combined Meta + TikTok"/>
                <Metric icon={Ic.bolt(P.solar,16)} label="Total Spend" value={fR(combined.spend)} accent={P.solar} sub="Across all platforms"/>
                <Metric icon={Ic.globe(P.mint,16)} label="Blended CPM" value={fR(combined.cpm)} accent={P.mint} sub="Per 1,000 impressions"/>
                <Metric icon={Ic.users(P.fuchsia,16)} label="Meta Reach" value={fmt(combined.metaReach)} accent={P.fuchsia} sub="Unique people reached"/>
              </div>

              {/* Pie Charts */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,marginBottom:32}}>
                <Glass accent={P.orchid} st={{padding:28}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:20}}>{Ic.eye(P.orchid,16)}<span style={{fontSize:10,fontWeight:800,color:P.orchid,letterSpacing:3,fontFamily:fm,textTransform:"uppercase"}}>Impression Share</span></div>
                  <ResponsiveContainer width="100%" height={210}>
                    <PieChart><Pie data={combined.impShare} cx="50%" cy="50%" outerRadius={82} innerRadius={50} paddingAngle={5} dataKey="value" stroke="none">
                      {combined.impShare.map((e,i)=><Cell key={i} fill={e.color}/>)}</Pie>
                      <Tooltip content={({active,payload})=>{if(!active||!payload?.length)return null;const d=payload[0].payload;return(<div style={{background:"rgba(22,12,38,0.95)",border:"1px solid "+P.rule,borderRadius:12,padding:"10px 16px"}}><div style={{fontSize:11,fontWeight:700,color:d.color,fontFamily:fm}}>{d.name}</div><div style={{fontSize:13,color:P.txt,fontFamily:fm}}>{fmt(d.value)} impressions</div><div style={{fontSize:10,color:P.sub}}>{combined.impressions>0?((d.value/combined.impressions)*100).toFixed(1)+"% of total":""}</div></div>);}}/></PieChart>
                  </ResponsiveContainer>
                  <div style={{display:"flex",justifyContent:"center",gap:20,marginTop:10}}>
                    {combined.impShare.map(p=><div key={p.name} style={{display:"flex",alignItems:"center",gap:6}}><span style={{width:8,height:8,borderRadius:"50%",background:p.color,boxShadow:"0 0 8px "+p.color}}/><span style={{fontSize:10,color:P.sub,fontFamily:fm}}>{p.name} {combined.impressions>0?((p.value/combined.impressions)*100).toFixed(1)+"%":"0%"}</span></div>)}
                  </div>
                </Glass>

                <Glass accent={P.fuchsia} st={{padding:28}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:20}}>{Ic.bolt(P.fuchsia,16)}<span style={{fontSize:10,fontWeight:800,color:P.fuchsia,letterSpacing:3,fontFamily:fm,textTransform:"uppercase"}}>Spend Allocation</span></div>
                  <ResponsiveContainer width="100%" height={210}>
                    <PieChart><Pie data={combined.spendShare} cx="50%" cy="50%" outerRadius={82} innerRadius={50} paddingAngle={5} dataKey="value" stroke="none">
                      {combined.spendShare.map((e,i)=><Cell key={i} fill={e.color}/>)}</Pie>
                      <Tooltip content={({active,payload})=>{if(!active||!payload?.length)return null;const d=payload[0].payload;return(<div style={{background:"rgba(22,12,38,0.95)",border:"1px solid "+P.rule,borderRadius:12,padding:"10px 16px"}}><div style={{fontSize:11,fontWeight:700,color:d.color,fontFamily:fm}}>{d.name}</div><div style={{fontSize:13,color:P.txt,fontFamily:fm}}>{fR(d.value)}</div></div>);}}/></PieChart>
                  </ResponsiveContainer>
                  <div style={{display:"flex",justifyContent:"center",gap:20,marginTop:10}}>
                    {combined.spendShare.map(p=><div key={p.name} style={{display:"flex",alignItems:"center",gap:6}}><span style={{width:8,height:8,borderRadius:"50%",background:p.color,boxShadow:"0 0 8px "+p.color}}/><span style={{fontSize:10,color:P.sub,fontFamily:fm}}>{p.name} {fR(p.value)}</span></div>)}
                  </div>
                </Glass>
              </div>

              {/* CPM Comparison */}
              <Glass accent={P.orchid} st={{padding:28}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:22}}>{Ic.globe(P.orchid,18)}<span style={{fontSize:10,fontWeight:800,color:P.orchid,letterSpacing:3,fontFamily:fm,textTransform:"uppercase"}}>Platform CPM Comparison</span></div>
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart data={combined.cpmCompare} layout="vertical" barSize={28}>
                    <CartesianGrid strokeDasharray="3 3" stroke={P.rule} horizontal={false}/>
                    <XAxis type="number" tick={{fontSize:10,fill:P.dim,fontFamily:fm}} stroke="transparent" tickFormatter={v=>"R"+v.toFixed(0)}/>
                    <YAxis type="category" dataKey="name" tick={{fontSize:13,fill:P.txt,fontFamily:fm,fontWeight:700}} stroke="transparent" width={80}/>
                    <Tooltip content={Tip}/>
                    <Bar dataKey="CPM" radius={[0,10,10,0]}>{combined.cpmCompare.map((e,i)=><Cell key={i} fill={e.fill}/>)}</Bar>
                  </BarChart>
                </ResponsiveContainer>
                <Insight title="CPM Analysis" icon={Ic.crown(P.orchid,16)} accent={P.orchid}>
                  {combined.ttCpm > 0 && combined.metaCpm > 0 ? (
                    <>TikTok delivers impressions at <strong>{fR(combined.ttCpm)} CPM</strong> compared to Meta's <strong>{fR(combined.metaCpm)} CPM</strong> — that's {(combined.metaCpm / combined.ttCpm).toFixed(1)}x more cost-efficient per thousand impressions. The blended campaign CPM of <strong>{fR(combined.cpm)}</strong> across both platforms represents strong value, with TikTok providing scale and Meta delivering richer audience targeting and measurement capabilities.</>
                  ) : "Insufficient data for CPM comparison in this date range."}
                </Insight>
              </Glass>
            </div>)}

            {/* ═══ TOP OF FUNNEL ═══ */}
            {tab==="tof"&&(<div>
              <SectionHead icon={Ic.radar(P.ember,22)} title="Top of Funnel \u2014 Ad Serving" sub="Impressions \u00B7 Reach \u00B7 Frequency \u00B7 CPM" accent={P.ember}/>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:16,marginBottom:32}}>
                <Metric icon={Ic.eye(P.cyan,16)} label="Total Impressions" value={fmt(combined.impressions)} accent={P.cyan} sub="All platforms combined"/>
                <Metric icon={Ic.users(P.orchid,16)} label="Meta Reach" value={fmt(combined.metaReach)} accent={P.orchid} sub="Unique people reached"/>
                <Metric icon={Ic.radar(P.rose,16)} label="Meta Frequency" value={combined.metaFreq>0?combined.metaFreq.toFixed(2)+"x":"N/A"} accent={P.rose} sub="Avg times each person saw ad"/>
                <Metric icon={Ic.bolt(P.mint,16)} label="Blended CPM" value={fR(combined.cpm)} accent={P.mint} sub="Per 1,000 impressions"/>
              </div>

              {/* Platform Cards */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18,marginBottom:32}}>
                <Glass accent={P.fb} hv st={{padding:28}}>
                  <div style={{fontSize:18,fontWeight:900,color:P.fb,fontFamily:ff,marginBottom:22}}>Meta (Facebook + Instagram)</div>
                  {[{l:"Impressions",v:fmt(combined.metaImps)},{l:"Reach",v:fmt(combined.metaReach)},{l:"Frequency",v:combined.metaFreq>0?combined.metaFreq.toFixed(2)+"x":"N/A"},{l:"CPM",v:fR(combined.metaCpm),c:P.fb},{l:"Spend",v:fR(combined.metaSpend),c:P.ember}].map((m,i)=>(
                    <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",padding:"10px 0",borderBottom:"1px solid "+P.rule}}>
                      <span style={{fontSize:10,color:P.dim,fontFamily:fm,letterSpacing:2,textTransform:"uppercase"}}>{m.l}</span>
                      <span style={{fontSize:18,fontWeight:800,color:m.c||P.txt,fontFamily:fm}}>{m.v}</span>
                    </div>
                  ))}
                </Glass>

                <Glass accent={P.tt} hv st={{padding:28}}>
                  <div style={{fontSize:18,fontWeight:900,color:P.tt,fontFamily:ff,marginBottom:22}}>TikTok</div>
                  {[{l:"Impressions",v:fmt(combined.ttImps)},{l:"CPM",v:fR(combined.ttCpm),c:P.tt},{l:"Clicks",v:fmt(combined.ttClicks)},{l:"Follows",v:fmt(combined.ttFollows),c:P.mint},{l:"Spend",v:fR(combined.ttSpend),c:P.ember}].map((m,i)=>(
                    <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",padding:"10px 0",borderBottom:"1px solid "+P.rule}}>
                      <span style={{fontSize:10,color:P.dim,fontFamily:fm,letterSpacing:2,textTransform:"uppercase"}}>{m.l}</span>
                      <span style={{fontSize:18,fontWeight:800,color:m.c||P.txt,fontFamily:fm}}>{m.v}</span>
                    </div>
                  ))}
                </Glass>
              </div>

              <Glass st={{padding:28}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:22}}>{Ic.chart(P.ember,18)}<span style={{fontSize:10,fontWeight:800,color:P.ember,letterSpacing:3,fontFamily:fm,textTransform:"uppercase"}}>Impression Volume</span></div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={[{name:"Meta",Impressions:combined.metaImps,fill:P.fb},{name:"TikTok",Impressions:combined.ttImps,fill:P.tt}]} barSize={60}>
                    <CartesianGrid strokeDasharray="3 3" stroke={P.rule}/><XAxis dataKey="name" tick={{fontSize:13,fill:P.txt,fontFamily:fm}} stroke="transparent"/><YAxis tick={{fontSize:10,fill:P.dim,fontFamily:fm}} stroke="transparent" tickFormatter={v=>fmt(v)}/><Tooltip content={Tip}/>
                    <Bar dataKey="Impressions" radius={[12,12,0,0]}>{[P.fb,P.tt].map((c,i)=><Cell key={i} fill={c}/>)}</Bar>
                  </BarChart>
                </ResponsiveContainer>
                <Insight title="Ad Serving Intelligence" icon={Ic.radar(P.cyan,16)} accent={P.cyan}>
                  {combined.ttImps > combined.metaImps ? (
                    <>TikTok is the scale engine of this campaign, delivering <strong>{fmt(combined.ttImps)} impressions</strong> ({((combined.ttImps/combined.impressions)*100).toFixed(1)}% of total) at {fR(combined.ttCpm)} CPM. Meta contributes {fmt(combined.metaImps)} impressions with richer audience data including reach-level deduplication and frequency control. The two-platform architecture delivers mass awareness through TikTok whilst Meta provides precision targeting and measurement.</>
                  ) : (
                    <>Meta is leading ad serving with <strong>{fmt(combined.metaImps)} impressions</strong> at {fR(combined.metaCpm)} CPM, reaching {fmt(combined.metaReach)} unique people at {combined.metaFreq.toFixed(2)}x frequency. TikTok contributes {fmt(combined.ttImps)} impressions at the more efficient {fR(combined.ttCpm)} CPM. Together, the two platforms have served <strong>{fmt(combined.impressions)} total impressions</strong> for a blended CPM of {fR(combined.cpm)}.</>
                  )}
                </Insight>
              </Glass>
            </div>)}

            {/* ═══ MIDDLE OF FUNNEL ═══ */}
            {tab==="mof"&&(<div>
              <SectionHead icon={Ic.pulse(P.mint,22)} title="Middle of Funnel \u2014 Engagement" sub="Clicks \u00B7 CTR \u00B7 CPC \u00B7 Top Campaigns" accent={P.mint}/>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:16,marginBottom:32}}>
                <Metric icon={Ic.pulse(P.mint,16)} label="Total Clicks" value={fmt(combined.clicks)} accent={P.mint} sub="All platforms"/>
                <Metric icon={Ic.bolt(P.solar,16)} label="Meta CPC" value={fR(combined.metaCpc)} accent={P.solar} sub="Cost per click"/>
                <Metric icon={Ic.eye(P.cyan,16)} label="Meta CTR" value={pc(combined.metaCtr)} accent={P.cyan} sub="Click-through rate"/>
                <Metric icon={Ic.fire(P.ember,16)} label="TikTok Follows" value={fmt(combined.ttFollows)} accent={P.ember} sub="New followers earned"/>
              </div>

              {/* Top Campaigns */}
              <Glass accent={P.orchid} st={{padding:28}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:22}}>{Ic.crown(P.solar,18)}<span style={{fontSize:10,fontWeight:800,color:P.solar,letterSpacing:3,fontFamily:fm,textTransform:"uppercase"}}>Meta Campaign Performance</span></div>
                {metaData && metaData.campaigns.sort((a,b)=>b.clicks-a.clicks).slice(0,5).map((c,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:16,padding:"14px 20px",marginBottom:6,background:i%2===0?P.orchid+"06":"transparent",borderRadius:12,borderLeft:"3px solid "+(i===0?P.solar:P.fb)}}>
                    <div style={{width:32,height:32,borderRadius:8,background:i===0?P.solar+"15":P.fb+"10",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:900,color:i===0?P.solar:P.fb,fontFamily:fm}}>#{i+1}</div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:12,fontWeight:700,color:P.txt}}>{c.name}</div>
                      <Pill name="Meta" color={P.fb}/>
                    </div>
                    <div style={{textAlign:"right",minWidth:80}}><div style={{fontSize:16,fontWeight:900,color:P.txt,fontFamily:fm}}>{fmt(c.clicks)}</div><div style={{fontSize:9,color:P.dim,fontFamily:fm}}>clicks</div></div>
                    <div style={{textAlign:"right",minWidth:70}}><div style={{fontSize:14,fontWeight:800,color:P.mint,fontFamily:fm}}>{fR(c.cpc)}</div><div style={{fontSize:9,color:P.dim,fontFamily:fm}}>CPC</div></div>
                    <div style={{textAlign:"right",minWidth:60}}><div style={{fontSize:14,fontWeight:700,color:P.sub,fontFamily:fm}}>{pc(c.ctr)}</div><div style={{fontSize:9,color:P.dim,fontFamily:fm}}>CTR</div></div>
                    <div style={{textAlign:"right",minWidth:80}}><div style={{fontSize:14,fontWeight:700,color:P.ember,fontFamily:fm}}>{fR(c.spend)}</div><div style={{fontSize:9,color:P.dim,fontFamily:fm}}>spend</div></div>
                  </div>
                ))}
                <Insight title="Engagement Analysis" icon={Ic.fire(P.mint,16)} accent={P.mint}>
                  Meta has generated <strong>{fmt(combined.metaClicks)} clicks</strong> at an average CPC of <strong>{fR(combined.metaCpc)}</strong> and a CTR of {pc(combined.metaCtr)}. TikTok has delivered <strong>{fmt(combined.ttClicks)} clicks</strong> through its performance network, along with {fmt(combined.ttFollows)} new followers and {fmt(combined.ttLikes)} engagements. The combined engagement across both platforms demonstrates strong audience receptivity to the campaign creative and messaging.
                </Insight>
              </Glass>
            </div>)}

            {/* ═══ BOTTOM OF FUNNEL ═══ */}
            {tab==="bof"&&(<div>
              <SectionHead icon={Ic.target(P.rose,22)} title="Bottom of Funnel \u2014 Objective Results" sub="Results \u00B7 Cost Per Result \u00B7 Platform Performance" accent={P.rose}/>

              {/* Meta Results */}
              <div style={{marginBottom:28}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
                  <span style={{width:12,height:12,borderRadius:"50%",background:P.fb,boxShadow:"0 0 10px "+P.fb}}/>
                  <span style={{fontSize:15,fontWeight:900,color:P.fb,fontFamily:ff}}>Meta (Facebook + Instagram)</span>
                  <div style={{flex:1,height:1,background:"linear-gradient(90deg, "+P.fb+"30, transparent)"}}/>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14}}>
                  <Glass accent={P.fb} hv st={{padding:22}}>
                    <div style={{fontSize:9,fontWeight:700,color:P.sub,fontFamily:fm,letterSpacing:2,marginBottom:14}}>IMPRESSIONS</div>
                    <div style={{fontSize:28,fontWeight:900,color:P.txt,fontFamily:fm}}>{fmt(combined.metaImps)}</div>
                    <div style={{display:"flex",justifyContent:"space-between",paddingTop:10,borderTop:"1px solid "+P.rule,marginTop:12}}>
                      <div><div style={{fontSize:8,color:P.dim,fontFamily:fm}}>CPM</div><div style={{fontSize:16,fontWeight:800,color:P.fb,fontFamily:fm}}>{fR(combined.metaCpm)}</div></div>
                      <div style={{textAlign:"right"}}><div style={{fontSize:8,color:P.dim,fontFamily:fm}}>SPEND</div><div style={{fontSize:14,fontWeight:700,color:P.sub,fontFamily:fm}}>{fR(combined.metaSpend)}</div></div>
                    </div>
                  </Glass>
                  <Glass accent={P.fb} hv st={{padding:22}}>
                    <div style={{fontSize:9,fontWeight:700,color:P.sub,fontFamily:fm,letterSpacing:2,marginBottom:14}}>CLICKS</div>
                    <div style={{fontSize:28,fontWeight:900,color:P.txt,fontFamily:fm}}>{fmt(combined.metaClicks)}</div>
                    <div style={{display:"flex",justifyContent:"space-between",paddingTop:10,borderTop:"1px solid "+P.rule,marginTop:12}}>
                      <div><div style={{fontSize:8,color:P.dim,fontFamily:fm}}>CPC</div><div style={{fontSize:16,fontWeight:800,color:P.fb,fontFamily:fm}}>{fR(combined.metaCpc)}</div></div>
                      <div style={{textAlign:"right"}}><div style={{fontSize:8,color:P.dim,fontFamily:fm}}>CTR</div><div style={{fontSize:14,fontWeight:700,color:P.sub,fontFamily:fm}}>{pc(combined.metaCtr)}</div></div>
                    </div>
                  </Glass>
                  <Glass accent={P.fb} hv st={{padding:22}}>
                    <div style={{fontSize:9,fontWeight:700,color:P.sub,fontFamily:fm,letterSpacing:2,marginBottom:14}}>REACH</div>
                    <div style={{fontSize:28,fontWeight:900,color:P.txt,fontFamily:fm}}>{fmt(combined.metaReach)}</div>
                    <div style={{display:"flex",justifyContent:"space-between",paddingTop:10,borderTop:"1px solid "+P.rule,marginTop:12}}>
                      <div><div style={{fontSize:8,color:P.dim,fontFamily:fm}}>FREQUENCY</div><div style={{fontSize:16,fontWeight:800,color:P.fb,fontFamily:fm}}>{combined.metaFreq>0?combined.metaFreq.toFixed(2)+"x":"N/A"}</div></div>
                    </div>
                  </Glass>
                </div>
              </div>

              {/* TikTok Results */}
              <div style={{marginBottom:28}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
                  <span style={{width:12,height:12,borderRadius:"50%",background:P.tt,boxShadow:"0 0 10px "+P.tt}}/>
                  <span style={{fontSize:15,fontWeight:900,color:P.tt,fontFamily:ff}}>TikTok</span>
                  <div style={{flex:1,height:1,background:"linear-gradient(90deg, "+P.tt+"30, transparent)"}}/>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14}}>
                  <Glass accent={P.tt} hv st={{padding:22}}>
                    <div style={{fontSize:9,fontWeight:700,color:P.sub,fontFamily:fm,letterSpacing:2,marginBottom:14}}>IMPRESSIONS</div>
                    <div style={{fontSize:28,fontWeight:900,color:P.txt,fontFamily:fm}}>{fmt(combined.ttImps)}</div>
                    <div style={{display:"flex",justifyContent:"space-between",paddingTop:10,borderTop:"1px solid "+P.rule,marginTop:12}}>
                      <div><div style={{fontSize:8,color:P.dim,fontFamily:fm}}>CPM</div><div style={{fontSize:16,fontWeight:800,color:P.tt,fontFamily:fm}}>{fR(combined.ttCpm)}</div></div>
                      <div style={{textAlign:"right"}}><div style={{fontSize:8,color:P.dim,fontFamily:fm}}>SPEND</div><div style={{fontSize:14,fontWeight:700,color:P.sub,fontFamily:fm}}>{fR(combined.ttSpend)}</div></div>
                    </div>
                  </Glass>
                  <Glass accent={P.tt} hv st={{padding:22}}>
                    <div style={{fontSize:9,fontWeight:700,color:P.sub,fontFamily:fm,letterSpacing:2,marginBottom:14}}>CLICKS</div>
                    <div style={{fontSize:28,fontWeight:900,color:P.txt,fontFamily:fm}}>{fmt(combined.ttClicks)}</div>
                    <div style={{display:"flex",justifyContent:"space-between",paddingTop:10,borderTop:"1px solid "+P.rule,marginTop:12}}>
                      <div><div style={{fontSize:8,color:P.dim,fontFamily:fm}}>CPC</div><div style={{fontSize:16,fontWeight:800,color:P.tt,fontFamily:fm}}>{combined.ttCpc>0?fR(combined.ttCpc):"Network"}</div></div>
                    </div>
                  </Glass>
                  <Glass accent={P.tt} hv st={{padding:22}}>
                    <div style={{fontSize:9,fontWeight:700,color:P.sub,fontFamily:fm,letterSpacing:2,marginBottom:14}}>COMMUNITY</div>
                    <div style={{fontSize:28,fontWeight:900,color:P.mint,fontFamily:fm}}>{fmt(combined.ttFollows)}</div>
                    <div style={{fontSize:9,color:P.dim,fontFamily:fm,marginTop:4}}>follows earned</div>
                    <div style={{display:"flex",justifyContent:"space-between",paddingTop:10,borderTop:"1px solid "+P.rule,marginTop:12}}>
                      <div><div style={{fontSize:8,color:P.dim,fontFamily:fm}}>LIKES</div><div style={{fontSize:16,fontWeight:800,color:P.tt,fontFamily:fm}}>{fmt(combined.ttLikes)}</div></div>
                    </div>
                  </Glass>
                </div>
              </div>

              {/* Combined Summary */}
              <Glass accent={P.ember} st={{padding:32,background:"linear-gradient(135deg, "+P.lava+"05, "+P.ember+"05, "+P.solar+"05)"}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:28}}>{Ic.users(P.ember,20)}<span style={{fontSize:10,fontWeight:800,color:P.ember,letterSpacing:3,fontFamily:fm,textTransform:"uppercase"}}>Combined Results \u2014 All Platforms</span></div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:24}}>
                  <div>
                    <div style={{fontSize:9,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:8}}>TOTAL IMPRESSIONS</div>
                    <div style={{fontSize:36,fontWeight:900,fontFamily:ff,lineHeight:1,color:P.ember}}>{fmt(combined.impressions)}</div>
                  </div>
                  <div style={{borderLeft:"1px solid "+P.rule,paddingLeft:20}}>
                    <div style={{fontSize:9,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:8}}>TOTAL SPEND</div>
                    <div style={{fontSize:28,fontWeight:900,color:P.solar,fontFamily:fm,lineHeight:1}}>{fR(combined.spend)}</div>
                  </div>
                  <div style={{borderLeft:"1px solid "+P.rule,paddingLeft:20}}>
                    <div style={{fontSize:9,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:8}}>TOTAL CLICKS</div>
                    <div style={{fontSize:28,fontWeight:900,color:P.mint,fontFamily:fm,lineHeight:1}}>{fmt(combined.clicks)}</div>
                  </div>
                  <div style={{borderLeft:"1px solid "+P.rule,paddingLeft:20}}>
                    <div style={{fontSize:9,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:8}}>BLENDED CPM</div>
                    <div style={{fontSize:28,fontWeight:900,color:P.orchid,fontFamily:fm,lineHeight:1}}>{fR(combined.cpm)}</div>
                  </div>
                </div>
                <Insight title="Campaign Performance Summary" icon={Ic.crown(P.ember,16)} accent={P.ember}>
                  The campaign has delivered <strong>{fmt(combined.impressions)} impressions</strong> across Meta and TikTok against a total investment of <strong>{fR(combined.spend)}</strong>, achieving a blended CPM of {fR(combined.cpm)}. Meta contributed {fmt(combined.metaImps)} impressions reaching {fmt(combined.metaReach)} unique people at {combined.metaFreq>0?combined.metaFreq.toFixed(2)+"x":"N/A"} frequency, generating {fmt(combined.metaClicks)} clicks at {fR(combined.metaCpc)} CPC. TikTok delivered {fmt(combined.ttImps)} impressions at the more efficient {fR(combined.ttCpm)} CPM, with {fmt(combined.ttFollows)} new followers earned. The two-platform strategy continues to deliver complementary value: TikTok for cost-efficient scale and community growth, Meta for precision targeting and measurable engagement.
                </Insight>
              </Glass>
            </div>)}
          </>
        )}
      </main>

      {/* FOOTER */}
      <footer style={{borderTop:"1px solid "+P.rule,background:"rgba(6,2,14,0.95)",padding:"28px 40px"}}>
        <div style={{maxWidth:1280,margin:"0 auto",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{display:"flex",alignItems:"center",gap:14}}>
            <div style={{width:32,height:32,borderRadius:"50%",background:gFire,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:900,color:"#fff",fontFamily:fm,boxShadow:"0 0 16px "+P.ember+"30"}}>GAS</div>
            <span style={{fontSize:12,fontWeight:800,color:P.sub,fontFamily:fm,letterSpacing:2}}>MEDIA ON GAS</span>
            <span style={{fontSize:10,color:P.dim}}>Powered by GAS Response Marketing</span>
          </div>
          <div style={{fontSize:9,color:P.dim,fontFamily:fm,textAlign:"right",lineHeight:1.8}}>Live data from Meta Marketing API + TikTok Business API<br/>All figures in ZAR \u00B7 Confidential \u00B7 grow@gasmarketing.co.za</div>
        </div>
      </footer>
    </div>
  );
}
