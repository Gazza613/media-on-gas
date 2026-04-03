import { useState, useEffect } from "react";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Line, Area } from "recharts";

const P = {
  void:"#06020e",cosmos:"#0d0618",nebula:"#150b24",
  panel:"rgba(22,12,38,0.85)",glass:"rgba(30,18,50,0.65)",
  ember:"#FF6B00",blaze:"#FF3D00",solar:"#FFAA00",lava:"#E8231A",
  orchid:"#A855F7",violet:"#7C3AED",fuchsia:"#D946EF",rose:"#F43F5E",
  cyan:"#22D3EE",mint:"#34D399",lime:"#84CC16",
  fb:"#4599FF",ig:"#E1306C",tt:"#00F2EA",
  txt:"#EDE9F5",sub:"#8B7FA3",dim:"#4A3D60",
  rule:"rgba(168,85,247,0.12)",
};
const gFire=`linear-gradient(135deg,${P.lava},${P.ember},${P.solar})`;
const gEmber=`linear-gradient(135deg,${P.blaze},${P.ember})`;
const ff="Outfit,Trebuchet MS,sans-serif";
const fm="'Courier New',Courier,monospace";

const Ic={
  radar:(c=P.ember,s=20)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke={c} strokeWidth="1.5" opacity="0.3"/><circle cx="12" cy="12" r="6" stroke={c} strokeWidth="1.5" opacity="0.5"/><circle cx="12" cy="12" r="2" fill={c}/><line x1="12" y1="2" x2="12" y2="12" stroke={c} strokeWidth="1.5"/></svg>,
  pulse:(c=P.mint,s=20)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M2 12h4l3-8 4 16 3-8h6" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  target:(c=P.rose,s=20)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke={c} strokeWidth="1.5"/><circle cx="12" cy="12" r="6" stroke={c} strokeWidth="1.5"/><circle cx="12" cy="12" r="2" fill={c}/><path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke={c} strokeWidth="1.5"/></svg>,
  fire:(c=P.ember,s=20)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M12 2c0 4-4 6-4 10a6 6 0 0012 0c0-4-4-6-4-10z" stroke={c} strokeWidth="1.5" fill={c+"20"}/><path d="M12 14c0 1.5-1.5 2.5-1.5 4a2.5 2.5 0 005 0c0-1.5-1.5-2.5-1.5-4" stroke={c} strokeWidth="1.5"/></svg>,
  eye:(c=P.cyan,s=20)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" stroke={c} strokeWidth="1.5"/><circle cx="12" cy="12" r="3" stroke={c} strokeWidth="1.5" fill={c+"15"}/></svg>,
  crown:(c=P.solar,s=20)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M2 20h20L19 8l-4 5-3-7-3 7-4-5L2 20z" stroke={c} strokeWidth="1.5" fill={c+"15"} strokeLinejoin="round"/></svg>,
  bolt:(c=P.solar,s=20)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke={c} strokeWidth="1.5" fill={c+"15"} strokeLinejoin="round"/></svg>,
  users:(c=P.fuchsia,s=20)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none"><circle cx="9" cy="7" r="3" stroke={c} strokeWidth="1.5"/><circle cx="17" cy="7" r="2.5" stroke={c} strokeWidth="1.5" opacity="0.6"/><path d="M2 21v-2a5 5 0 0110 0v2" stroke={c} strokeWidth="1.5"/><path d="M16 21v-1.5a4 4 0 014 0V21" stroke={c} strokeWidth="1.5" opacity="0.6"/></svg>,
  chart:(c=P.orchid,s=20)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none"><rect x="3" y="12" width="4" height="9" rx="1" stroke={c} strokeWidth="1.5" fill={c+"15"}/><rect x="10" y="6" width="4" height="15" rx="1" stroke={c} strokeWidth="1.5" fill={c+"15"}/><rect x="17" y="2" width="4" height="19" rx="1" stroke={c} strokeWidth="1.5" fill={c+"15"}/></svg>,
  globe:(c=P.cyan,s=20)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke={c} strokeWidth="1.5"/><ellipse cx="12" cy="12" rx="4" ry="10" stroke={c} strokeWidth="1" opacity="0.4"/><path d="M2 12h20M3 7h18M3 17h18" stroke={c} strokeWidth="1" opacity="0.3"/></svg>,
};

const D={
  client:"MTN MoMo",campaign:"March 2026 Paid Social",range:"1 – 24 March 2026",
  budget:165000,spent:123913,days:24,total:31,
  tof:{imp:12274969,reach:1621000,freq:2.89,cpm:10.10,
    p:[{n:"Facebook",imp:3538025,reach:1301126,freq:2.72,cpm:17.03,spend:60255,sh:28.8,c:P.fb},
       {n:"Instagram",imp:1142009,reach:319871,freq:3.57,cpm:13.61,spend:15541,sh:9.3,c:P.ig},
       {n:"TikTok",imp:7594935,reach:null,freq:null,cpm:6.34,spend:48117,sh:61.9,c:P.tt}]},
  mof:{p:[{n:"Facebook",clicks:61455,ctr:1.74,cpc:0.98,c:P.fb},
          {n:"Instagram",clicks:6467,ctr:1.15,cpc:1.20,c:P.ig},
          {n:"TikTok",clicks:3597624,ctr:null,cpc:0.009,views:7023845,vr:92.5,c:P.tt}],
    ads:[{name:"GIF – Scroll & Chill Bundles",pl:"Facebook",set:"Cold Interest",r:7671,cpc:0.67,ctr:2.36,best:true},
         {name:"Static 4 – Rent to Own Honor",pl:"Facebook",set:"Lookalike",r:5838,cpc:0.77,ctr:1.49},
         {name:"MP4 – Kabelo Handset RTO",pl:"Instagram",set:"IG Follower",r:4449,cpc:1.30,ctr:1.15},
         {name:"Ayanda – R59/R69 Deals",pl:"TikTok",set:"Follower",r:3249,cpc:1.28,bestAll:true},
         {name:"MP4 – Ayanda R59 R69",pl:"Facebook",set:"Cold Interest",r:1844,cpc:0.70,ctr:1.90}]},
  bof:{objs:[{n:"App Install Clicks",p:"Facebook",r:36751,s:27053,cpr:0.74,c:P.fb},
             {n:"App Install Clicks",p:"Instagram",r:6467,s:7735,cpr:1.20,c:P.ig},
             {n:"App Store Visibility",p:"TikTok",r:3597624,s:33419,cpr:0.009,c:P.tt},
             {n:"Page Likes",p:"Facebook",r:5902,s:27477,cpr:4.66,c:P.fb},
             {n:"Followers",p:"Instagram",r:5754,s:7805,cpr:1.36,c:P.ig},
             {n:"Follows",p:"TikTok",r:7558,s:14698,cpr:1.94,c:P.tt},
             {n:"Landing Page Views",p:"Facebook",r:2830,s:5725,cpr:2.02,c:P.fb}],
    comm:{total:19214,spend:49980,cpf:2.60}},
  wk:[{w:"Wk 1",daily:2153,cpc:1.35,spend:20318},{w:"Wk 2",daily:2358,cpc:1.31,spend:21610},
      {w:"Wk 3",daily:2552,cpc:1.30,spend:23319},{w:"Wk 4",daily:2751,cpc:1.28,spend:10549}],
};

const fmt=n=>{if(n>=1e6)return(n/1e6).toFixed(2)+"M";if(n>=1e3)return(n/1e3).toFixed(1)+"K";return n?.toLocaleString()??"—";};
const fR=n=>typeof n==="number"?"R"+n.toLocaleString("en-ZA",{minimumFractionDigits:2,maximumFractionDigits:2}):"—";
const pc=n=>typeof n==="number"?n.toFixed(2)+"%":"—";
const clr=p=>p==="Facebook"?P.fb:p==="Instagram"?P.ig:P.tt;

function Glass({children,accent=P.ember,hv=false,st={}}){
  const[h,sH]=useState(false);
  return(<div onMouseEnter={()=>sH(true)} onMouseLeave={()=>sH(false)} style={{
    background:P.glass,border:"1px solid "+(h&&hv?accent+"50":P.rule),
    borderRadius:16,position:"relative",overflow:"hidden",
    transition:"all 0.4s cubic-bezier(0.16,1,0.3,1)",
    transform:h&&hv?"translateY(-2px)":"none",
    boxShadow:h&&hv?"0 12px 40px "+accent+"15, 0 0 0 1px "+accent+"20":"0 4px 20px rgba(0,0,0,0.25)",...st}}>
    <div style={{position:"absolute",top:0,left:"10%",right:"10%",height:1,background:"linear-gradient(90deg, transparent, "+accent+"80, transparent)",opacity:h&&hv?1:0.4,transition:"opacity 0.4s"}}/>
    <div style={{position:"absolute",top:0,right:0,width:60,height:60,background:"radial-gradient(circle at 100% 0%, "+accent+"08, transparent 70%)"}}/>
    {children}
  </div>);
}

function Metric({icon,label,value,sub,accent=P.ember,prefix="",suffix=""}){
  return(<Glass accent={accent} hv st={{padding:"24px 22px"}}>
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
      {icon}
      <span style={{fontSize:9,fontWeight:700,color:P.sub,letterSpacing:3,textTransform:"uppercase",fontFamily:fm}}>{label}</span>
    </div>
    <div style={{fontSize:30,fontWeight:900,fontFamily:ff,lineHeight:1,letterSpacing:-1.5,color:accent}}>
      {prefix}{typeof value==="number"?fmt(value):value}{suffix}
    </div>
    {sub&&<div style={{fontSize:10,color:P.dim,marginTop:10,fontFamily:fm,lineHeight:1.6}}>{sub}</div>}
  </Glass>);
}

function Insight({title,children,accent=P.ember,icon}){
  return(<div style={{marginTop:24,padding:"24px 28px",background:"linear-gradient(135deg, "+accent+"06 0%, "+accent+"02 100%)",border:"1px solid "+accent+"18",borderLeft:"4px solid "+accent,borderRadius:"0 16px 16px 0",position:"relative"}}>
    <div style={{position:"absolute",top:0,left:4,width:80,height:"100%",background:"linear-gradient(180deg, "+accent+"08, transparent)",pointerEvents:"none"}}/>
    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
      {icon||Ic.bolt(accent,18)}
      <span style={{fontSize:10,fontWeight:800,color:accent,letterSpacing:3,fontFamily:fm,textTransform:"uppercase"}}>{title||"Material Insight"}</span>
    </div>
    <div style={{fontSize:13.5,color:P.txt,lineHeight:2,fontFamily:ff}}>{children}</div>
  </div>);
}

function Section({icon,title,sub,accent=P.ember}){
  return(<div style={{marginBottom:32}}>
    <div style={{display:"flex",alignItems:"center",gap:14}}>
      <div style={{width:44,height:44,borderRadius:14,background:"linear-gradient(135deg, "+accent+"20, "+accent+"08)",border:"1px solid "+accent+"30",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 0 20px "+accent+"10"}}>{icon}</div>
      <div>
        <h2 style={{margin:0,fontSize:26,fontWeight:900,color:P.txt,fontFamily:ff,letterSpacing:-0.5}}>{title}</h2>
        {sub&&<p style={{margin:"2px 0 0",fontSize:12,color:P.sub,fontFamily:fm}}>{sub}</p>}
      </div>
    </div>
    <div style={{height:1,marginTop:18,background:"linear-gradient(90deg, "+accent+"50, "+accent+"15, transparent 80%)"}}/>
  </div>);
}

function Pill({name,color}){
  return(<span style={{display:"inline-flex",alignItems:"center",gap:6,background:color+"12",border:"1px solid "+color+"30",borderRadius:20,padding:"4px 14px",fontSize:10,fontWeight:700,color:color,fontFamily:fm,letterSpacing:0.8,textTransform:"uppercase"}}>
    <span style={{width:7,height:7,borderRadius:"50%",background:color,boxShadow:"0 0 8px "+color+"80"}}/>{name}
  </span>);
}

function Tip({active,payload,label,pre=""}){
  if(!active||!payload?.length)return null;
  return(<div style={{background:"rgba(22,12,38,0.95)",border:"1px solid "+P.rule,borderRadius:12,padding:"12px 16px",boxShadow:"0 12px 48px rgba(0,0,0,0.6)"}}>
    <div style={{fontSize:11,fontWeight:800,color:P.txt,fontFamily:fm,marginBottom:6}}>{label}</div>
    {payload.map((p,i)=>(<div key={i} style={{fontSize:11,color:p.color||P.sub,fontFamily:fm,lineHeight:1.8}}>{p.name}: {pre}{typeof p.value==="number"?p.value.toLocaleString():p.value}</div>))}
  </div>);
}

export default function MediaOnGas(){
  const[tab,setTab]=useState("overview");
  const[df,setDf]=useState("2026-03-01");
  const[dt,setDt]=useState("2026-03-24");
  const pp=((D.spent/D.budget)*100);
  const tp=((D.days/D.total)*100);

  const tabs=[
    {id:"overview",label:"Overview",icon:Ic.chart(P.orchid,18)},
    {id:"tof",label:"Ad Serving",icon:Ic.radar(P.ember,18)},
    {id:"mof",label:"Engagement",icon:Ic.pulse(P.mint,18)},
    {id:"bof",label:"Objectives",icon:Ic.target(P.rose,18)},
  ];

  return(
    <div style={{minHeight:"100vh",background:"linear-gradient(170deg, "+P.void+" 0%, "+P.cosmos+" 30%, "+P.nebula+" 60%, "+P.cosmos+" 100%)",color:P.txt,fontFamily:ff}}>
      {/* Ambient texture */}
      <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0}}>
        <div style={{position:"absolute",inset:0,opacity:0.018,backgroundImage:"radial-gradient("+P.ember+" 0.5px, transparent 0.5px), radial-gradient("+P.orchid+" 0.5px, transparent 0.5px)",backgroundSize:"40px 40px",backgroundPosition:"0 0, 20px 20px"}}/>
        <div style={{position:"absolute",top:"20%",left:"-10%",width:"50%",height:"50%",background:"radial-gradient(ellipse, "+P.ember+"06, transparent 70%)",filter:"blur(80px)"}}/>
        <div style={{position:"absolute",bottom:"10%",right:"-5%",width:"40%",height:"40%",background:"radial-gradient(ellipse, "+P.violet+"06, transparent 70%)",filter:"blur(80px)"}}/>
      </div>

      {/* HEADER */}
      <header style={{position:"sticky",top:0,zIndex:100,background:"rgba(6,2,14,0.88)",backdropFilter:"blur(24px)",borderBottom:"1px solid "+P.rule}}>
        <div style={{maxWidth:1280,margin:"0 auto",padding:"16px 40px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{display:"flex",alignItems:"center",gap:18}}>
              <div style={{position:"relative"}}>
                <div style={{width:50,height:50,borderRadius:"50%",background:gFire,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 0 30px "+P.ember+"50, 0 0 60px "+P.ember+"20",border:"2px solid rgba(255,255,255,0.1)"}}>
                  <span style={{fontSize:13,fontWeight:900,color:"#fff",fontFamily:fm,letterSpacing:1}}>GAS</span>
                </div>
              </div>
              <div>
                <div style={{fontSize:20,fontWeight:900,letterSpacing:4,fontFamily:fm,lineHeight:1}}>
                  <span style={{color:P.txt}}>MEDIA </span>
                  <span style={{color:P.ember}}>ON </span>
                  <span style={{background:gFire,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>GAS</span>
                </div>
                <div style={{fontSize:8,color:P.dim,letterSpacing:5,textTransform:"uppercase",fontFamily:fm,marginTop:3}}>Digital Performance Intelligence</div>
              </div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{display:"flex",alignItems:"center",gap:8,background:P.glass,border:"1px solid "+P.rule,borderRadius:12,padding:"9px 18px"}}>
                <span style={{fontSize:8,color:P.dim,fontFamily:fm,letterSpacing:2}}>FROM</span>
                <input type="date" value={df} onChange={e=>setDf(e.target.value)} style={{background:"transparent",border:"none",color:P.txt,fontSize:12,fontFamily:fm,outline:"none",width:115}}/>
                <div style={{width:16,height:1,background:"linear-gradient(90deg,"+P.ember+","+P.solar+")"}}/>
                <span style={{fontSize:8,color:P.dim,fontFamily:fm,letterSpacing:2}}>TO</span>
                <input type="date" value={dt} onChange={e=>setDt(e.target.value)} style={{background:"transparent",border:"none",color:P.txt,fontSize:12,fontFamily:fm,outline:"none",width:115}}/>
              </div>
              <button style={{background:gEmber,border:"none",borderRadius:12,padding:"11px 24px",color:"#fff",fontSize:11,fontWeight:800,fontFamily:fm,cursor:"pointer",letterSpacing:1.5,boxShadow:"0 4px 20px "+P.ember+"30"}}>REFRESH</button>
            </div>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:14,padding:"12px 20px",background:P.glass,border:"1px solid "+P.rule,borderRadius:12}}>
            <div style={{display:"flex",alignItems:"center",gap:14}}>
              <div style={{background:"#004F71",borderRadius:8,padding:"6px 14px",fontSize:14,fontWeight:900,color:"#FFCB05",fontFamily:fm}}>MTN</div>
              <span style={{fontSize:15,fontWeight:800}}>{D.client}</span>
              <span style={{width:4,height:4,borderRadius:"50%",background:P.dim}}/>
              <span style={{fontSize:12,color:P.sub}}>{D.campaign}</span>
            </div>
            <div style={{display:"flex",gap:8}}><Pill name="Facebook" color={P.fb}/><Pill name="Instagram" color={P.ig}/><Pill name="TikTok" color={P.tt}/></div>
          </div>
        </div>
        <div style={{maxWidth:1280,margin:"0 auto",padding:"0 40px"}}>
          <div style={{display:"flex",gap:2}}>
            {tabs.map(t=>(<button key={t.id} onClick={()=>setTab(t.id)} style={{display:"flex",alignItems:"center",gap:8,background:tab===t.id?P.ember+"10":"transparent",border:"none",borderBottom:tab===t.id?"2px solid "+P.ember:"2px solid transparent",padding:"13px 26px",cursor:"pointer",color:tab===t.id?P.ember:P.sub,fontSize:12,fontWeight:tab===t.id?800:500,fontFamily:fm,letterSpacing:0.5}}>{t.icon}<span>{t.label}</span></button>))}
          </div>
        </div>
      </header>

      {/* CONTENT */}
      <main style={{maxWidth:1280,margin:"0 auto",padding:"40px 40px 100px",position:"relative",zIndex:1}}>

        {tab==="overview"&&(<div>
          <Section icon={Ic.chart(P.orchid,22)} title="Campaign Overview" sub={D.range+" · 3 Platforms · 7 Campaigns"} accent={P.orchid}/>
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:16,marginBottom:32}}>
            <Metric icon={Ic.eye(P.cyan,16)} label="Impressions" value={D.tof.imp} accent={P.cyan} sub="Total ad views across Facebook, Instagram and TikTok"/>
            <Metric icon={Ic.bolt(P.solar,16)} label="Spend" value={fR(D.spent)} accent={P.solar} sub={pp.toFixed(1)+"% of R165K budget deployed"}/>
            <Metric icon={Ic.globe(P.mint,16)} label="Blended CPM" value={fR(D.tof.cpm)} accent={P.mint} sub="Avg cost per 1,000 impressions"/>
            <Metric icon={Ic.users(P.fuchsia,16)} label="Community" value={D.bof.comm.total} accent={P.fuchsia} sub="New followers, likes and follows earned"/>
            <Metric icon={Ic.fire(P.mint,16)} label="Pacing" value={pp.toFixed(1)+"%"} accent={pp<=tp?P.mint:P.solar} sub={tp.toFixed(1)+"% of time elapsed — on target"}/>
          </div>

          {/* Pacing */}
          <Glass accent={P.ember} st={{padding:"24px 28px",marginBottom:32}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:14}}>
              <div>
                <div style={{fontSize:10,fontWeight:700,color:P.sub,letterSpacing:3,fontFamily:fm,textTransform:"uppercase",marginBottom:4}}>Budget Pacing</div>
                <div style={{fontSize:13,color:P.txt}}>{D.days} of {D.total} days elapsed</div>
              </div>
              <div style={{textAlign:"right"}}>
                <span style={{fontSize:22,fontWeight:900,color:P.ember,fontFamily:fm}}>{fR(D.spent)}</span>
                <span style={{fontSize:13,color:P.sub,marginLeft:8}}>of {fR(D.budget)}</span>
              </div>
            </div>
            <div style={{background:"rgba(40,25,60,0.5)",borderRadius:12,height:20,overflow:"hidden",position:"relative",border:"1px solid "+P.rule}}>
              <div style={{width:pp+"%",height:"100%",background:gFire,borderRadius:12,boxShadow:"0 0 24px "+P.ember+"40"}}/>
              <div style={{position:"absolute",left:tp+"%",top:-2,bottom:-2,width:2,background:P.txt,opacity:0.35,borderRadius:1}}/>
            </div>
            <Insight title="Pacing Analysis" icon={Ic.bolt(P.mint,16)} accent={P.mint}>
              The campaign has consumed <strong>{pp.toFixed(1)}%</strong> of the R165,000 combined budget across {D.days} days, tracking slightly beneath the <strong>{tp.toFixed(1)}%</strong> time-elapsed benchmark. This indicates healthy budget management with sufficient runway to maintain — or even increase — delivery volume through the final week of March. Neither Meta nor TikTok are at risk of early depletion, confirming well-calibrated daily budgets across all seven active campaigns.
            </Insight>
          </Glass>

          {/* Charts */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,marginBottom:32}}>
            <Glass accent={P.orchid} st={{padding:28}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:20}}>{Ic.eye(P.orchid,16)}<span style={{fontSize:10,fontWeight:800,color:P.orchid,letterSpacing:3,fontFamily:fm,textTransform:"uppercase"}}>Impression Share</span></div>
              <ResponsiveContainer width="100%" height={210}>
                <PieChart><Pie data={D.tof.p.map(p=>({name:p.n,value:p.imp,color:p.c}))} cx="50%" cy="50%" outerRadius={82} innerRadius={50} paddingAngle={5} dataKey="value" stroke="none">
                  {D.tof.p.map((e,i)=><Cell key={i} fill={e.c}/>)}</Pie>
                  <Tooltip content={({active,payload})=>{if(!active||!payload?.length)return null;const d=payload[0].payload;return(<div style={{background:"rgba(22,12,38,0.95)",border:"1px solid "+P.rule,borderRadius:12,padding:"10px 16px"}}><div style={{fontSize:11,fontWeight:700,color:d.color,fontFamily:fm}}>{d.name}</div><div style={{fontSize:13,color:P.txt,fontFamily:fm}}>{fmt(d.value)} impressions</div><div style={{fontSize:10,color:P.sub}}>{((d.value/D.tof.imp)*100).toFixed(1)}% of total</div></div>);}}/>
                </PieChart>
              </ResponsiveContainer>
              <div style={{display:"flex",justifyContent:"center",gap:20,marginTop:10}}>
                {D.tof.p.map(p=><div key={p.n} style={{display:"flex",alignItems:"center",gap:6}}><span style={{width:8,height:8,borderRadius:"50%",background:p.c,boxShadow:"0 0 8px "+p.c}}/><span style={{fontSize:10,color:P.sub,fontFamily:fm}}>{p.n} {p.sh}%</span></div>)}
              </div>
            </Glass>
            <Glass accent={P.fuchsia} st={{padding:28}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:20}}>{Ic.bolt(P.fuchsia,16)}<span style={{fontSize:10,fontWeight:800,color:P.fuchsia,letterSpacing:3,fontFamily:fm,textTransform:"uppercase"}}>Spend Allocation</span></div>
              <ResponsiveContainer width="100%" height={210}>
                <PieChart><Pie data={D.tof.p.map(p=>({name:p.n,value:p.spend,color:p.c}))} cx="50%" cy="50%" outerRadius={82} innerRadius={50} paddingAngle={5} dataKey="value" stroke="none">
                  {D.tof.p.map((e,i)=><Cell key={i} fill={e.c}/>)}</Pie>
                  <Tooltip content={({active,payload})=>{if(!active||!payload?.length)return null;const d=payload[0].payload;return(<div style={{background:"rgba(22,12,38,0.95)",border:"1px solid "+P.rule,borderRadius:12,padding:"10px 16px"}}><div style={{fontSize:11,fontWeight:700,color:d.color,fontFamily:fm}}>{d.name}</div><div style={{fontSize:13,color:P.txt,fontFamily:fm}}>{fR(d.value)}</div></div>);}}/>
                </PieChart>
              </ResponsiveContainer>
              <div style={{display:"flex",justifyContent:"center",gap:20,marginTop:10}}>
                {D.tof.p.map(p=><div key={p.n} style={{display:"flex",alignItems:"center",gap:6}}><span style={{width:8,height:8,borderRadius:"50%",background:p.c,boxShadow:"0 0 8px "+p.c}}/><span style={{fontSize:10,color:P.sub,fontFamily:fm}}>{p.n} {fR(p.spend)}</span></div>)}
              </div>
            </Glass>
          </div>

          {/* Weekly */}
          <Glass accent={P.ember} st={{padding:28,marginBottom:32}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:22}}>{Ic.pulse(P.ember,18)}<span style={{fontSize:10,fontWeight:800,color:P.ember,letterSpacing:3,fontFamily:fm,textTransform:"uppercase"}}>Week-on-Week Momentum · Meta</span></div>
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={D.wk.map(w=>({...w,name:w.w}))}>
                <defs>
                  <linearGradient id="bG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={P.ember} stopOpacity={0.95}/><stop offset="100%" stopColor={P.lava} stopOpacity={0.5}/></linearGradient>
                  <linearGradient id="aG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={P.mint} stopOpacity={0.15}/><stop offset="100%" stopColor={P.mint} stopOpacity={0}/></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={P.rule}/>
                <XAxis dataKey="name" tick={{fontSize:11,fill:P.sub,fontFamily:fm}} stroke="transparent"/>
                <YAxis yAxisId="l" tick={{fontSize:10,fill:P.dim,fontFamily:fm}} stroke="transparent"/>
                <YAxis yAxisId="r" orientation="right" tick={{fontSize:10,fill:P.dim,fontFamily:fm}} stroke="transparent" domain={[1.2,1.4]}/>
                <Tooltip content={Tip}/>
                <Bar yAxisId="l" dataKey="daily" name="Daily Avg Results" fill="url(#bG)" radius={[10,10,0,0]} barSize={48}/>
                <Area yAxisId="r" type="monotone" dataKey="cpc" name="CPC (R)" stroke={P.mint} fill="url(#aG)" strokeWidth={3} dot={{fill:P.mint,r:6,strokeWidth:2,stroke:P.cosmos}}/>
              </ComposedChart>
            </ResponsiveContainer>
            <Insight title="Performance Trajectory" icon={Ic.fire(P.mint,16)} accent={P.mint}>
              This is a textbook optimisation curve. Meta daily output has climbed <strong>28% from 2,153 results/day in Week 1 to 2,751/day in Week 4</strong> — the highest daily volume of the entire campaign — whilst simultaneously driving cost-per-click down from R1.35 to <strong>R1.28</strong>, a 5.2% efficiency gain. This convergence of rising volume and falling cost is the hallmark of a campaign where Meta's algorithm has locked onto the right audience segments, creative fatigue is well-managed, and budget allocation is rewarding the strongest ad sets. Heading into the final 7 days, the account is positioned to deliver its highest-performing week yet.
            </Insight>
          </Glass>

          {/* CPM */}
          <Glass accent={P.orchid} st={{padding:28}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:22}}>{Ic.globe(P.orchid,18)}<span style={{fontSize:10,fontWeight:800,color:P.orchid,letterSpacing:3,fontFamily:fm,textTransform:"uppercase"}}>Platform CPM Landscape</span></div>
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={D.tof.p.map(p=>({name:p.n,CPM:p.cpm,fill:p.c}))} layout="vertical" barSize={28}>
                <CartesianGrid strokeDasharray="3 3" stroke={P.rule} horizontal={false}/>
                <XAxis type="number" tick={{fontSize:10,fill:P.dim,fontFamily:fm}} stroke="transparent" tickFormatter={v=>"R"+v}/>
                <YAxis type="category" dataKey="name" tick={{fontSize:13,fill:P.txt,fontFamily:fm,fontWeight:700}} stroke="transparent" width={95}/>
                <Tooltip content={Tip}/>
                <Bar dataKey="CPM" radius={[0,10,10,0]}>{D.tof.p.map((e,i)=><Cell key={i} fill={e.c}/>)}</Bar>
              </BarChart>
            </ResponsiveContainer>
            <Insight title="Cross-Platform Value" icon={Ic.crown(P.orchid,16)} accent={P.orchid}>
              The three-platform strategy is delivering precisely the media efficiency it was designed for. TikTok's <strong>R6.34 CPM</strong> provides unmatched scale — every R1 buys approximately <strong>158 impressions</strong>, compared to 59 on Facebook and 73 on Instagram. The blended campaign CPM of <strong>R10.10</strong> represents outstanding value in the South African paid social market. This is a media plan working exactly as intended: TikTok for reach, Meta for intent.
            </Insight>
          </Glass>
        </div>)}

        {tab==="tof"&&(<div>
          <Section icon={Ic.radar(P.ember,22)} title="Top of Funnel — Ad Serving" sub="Impressions · Reach · Frequency · Cost Per Ad Serving" accent={P.ember}/>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:16,marginBottom:32}}>
            <Metric icon={Ic.eye(P.cyan,16)} label="Total Impressions" value={D.tof.imp} accent={P.cyan} sub="Combined across all platforms"/>
            <Metric icon={Ic.users(P.orchid,16)} label="Unique Reach" value={D.tof.reach} accent={P.orchid} sub="Individual people reached (Meta)"/>
            <Metric icon={Ic.radar(P.rose,16)} label="Avg Frequency" value={D.tof.freq+"x"} accent={P.rose} sub="Times each person saw an ad"/>
            <Metric icon={Ic.bolt(P.mint,16)} label="Blended CPM" value={fR(D.tof.cpm)} accent={P.mint} sub="Per 1,000 impressions"/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:18,marginBottom:32}}>
            {D.tof.p.map(p=>(<Glass key={p.n} accent={p.c} hv st={{padding:28}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:22}}>
                <span style={{fontSize:18,fontWeight:900,color:p.c,fontFamily:ff}}>{p.n}</span>
                <span style={{fontSize:22,fontWeight:900,color:p.c,fontFamily:fm,opacity:0.15}}>{p.sh}%</span>
              </div>
              {[{l:"Impressions",v:fmt(p.imp),c:P.txt},{l:"CPM",v:fR(p.cpm),c:p.c},{l:"Reach",v:p.reach?fmt(p.reach):"Network",c:P.txt},{l:"Frequency",v:p.freq?p.freq.toFixed(2)+"x":"Network",c:P.txt}].map((m,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",padding:"10px 0",borderBottom:i<3?"1px solid "+P.rule:"none"}}>
                  <span style={{fontSize:10,color:P.dim,fontFamily:fm,letterSpacing:2,textTransform:"uppercase"}}>{m.l}</span>
                  <span style={{fontSize:18,fontWeight:800,color:m.c,fontFamily:fm}}>{m.v}</span>
                </div>
              ))}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",paddingTop:14,borderTop:"1px solid "+p.c+"30",marginTop:6}}>
                <span style={{fontSize:10,color:P.dim,fontFamily:fm,letterSpacing:2}}>SPEND</span>
                <span style={{fontSize:22,fontWeight:900,color:P.ember,fontFamily:fm}}>{fR(p.spend)}</span>
              </div>
            </Glass>))}
          </div>
          <Glass st={{padding:28}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:22}}>{Ic.chart(P.ember,18)}<span style={{fontSize:10,fontWeight:800,color:P.ember,letterSpacing:3,fontFamily:fm,textTransform:"uppercase"}}>Impression Volume</span></div>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={D.tof.p.map(p=>({name:p.n,Impressions:p.imp,fill:p.c}))} barSize={60}>
                <CartesianGrid strokeDasharray="3 3" stroke={P.rule}/><XAxis dataKey="name" tick={{fontSize:13,fill:P.txt,fontFamily:fm}} stroke="transparent"/><YAxis tick={{fontSize:10,fill:P.dim,fontFamily:fm}} stroke="transparent" tickFormatter={v=>fmt(v)}/><Tooltip content={Tip}/>
                <Bar dataKey="Impressions" radius={[12,12,0,0]}>{D.tof.p.map((e,i)=><Cell key={i} fill={e.c}/>)}</Bar>
              </BarChart>
            </ResponsiveContainer>
            <Insight title="Ad Serving Intelligence" icon={Ic.radar(P.cyan,16)} accent={P.cyan}>
              TikTok is the campaign's <strong>undisputed scale engine</strong>, delivering 7.59 million impressions — nearly 62% of all ad serving — at just R6.34 per thousand. For context, every R1 on TikTok buys <strong>158 impressions</strong>, versus 59 on Facebook. Facebook contributes the richest first-party audience data including reach-level deduplication. Instagram's R13.61 CPM makes it <strong>20% more cost-efficient than Facebook</strong> for pure impression delivery. The architecture works: TikTok for mass awareness, Facebook for precision targeting, Instagram for cost-efficient Meta reach.
            </Insight>
          </Glass>
        </div>)}

        {tab==="mof"&&(<div>
          <Section icon={Ic.pulse(P.mint,22)} title="Middle of Funnel — Engagement" sub="Clicks · CTR · CPC · Top Creatives" accent={P.mint}/>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:18,marginBottom:32}}>
            {D.mof.p.map(p=>(<Glass key={p.n} accent={p.c} hv st={{padding:28}}>
              <div style={{fontSize:18,fontWeight:900,color:p.c,fontFamily:ff,marginBottom:22}}>{p.n}</div>
              {[{l:"Clicks",v:fmt(p.clicks),c:P.txt},{l:"CPC",v:fR(p.cpc),c:p.c},{l:"CTR",v:p.ctr?pc(p.ctr):"Network",c:P.txt}].map((m,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",padding:"10px 0",borderBottom:"1px solid "+P.rule}}>
                  <span style={{fontSize:10,color:P.dim,fontFamily:fm,letterSpacing:2,textTransform:"uppercase"}}>{m.l}</span>
                  <span style={{fontSize:18,fontWeight:800,color:m.c,fontFamily:fm}}>{m.v}</span>
                </div>
              ))}
              {p.views&&<div style={{display:"flex",justifyContent:"space-between",padding:"10px 0",borderBottom:"1px solid "+P.rule}}><span style={{fontSize:10,color:P.dim,fontFamily:fm,letterSpacing:2}}>VIDEO VIEWS</span><span style={{fontSize:18,fontWeight:800,color:P.mint,fontFamily:fm}}>{fmt(p.views)}</span></div>}
              {p.vr&&<div style={{display:"flex",justifyContent:"space-between",paddingTop:14}}><span style={{fontSize:10,color:P.dim,fontFamily:fm,letterSpacing:2}}>COMPLETION</span><span style={{fontSize:24,fontWeight:900,color:P.mint,fontFamily:fm}}>{p.vr}%</span></div>}
            </Glass>))}
          </div>

          <Glass accent={P.orchid} st={{padding:28}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:22}}>{Ic.crown(P.solar,18)}<span style={{fontSize:10,fontWeight:800,color:P.solar,letterSpacing:3,fontFamily:fm,textTransform:"uppercase"}}>Top 5 Performing Creatives</span></div>
            {D.mof.ads.map((a,i)=>{const c=clr(a.pl);return(
              <div key={i} style={{display:"flex",alignItems:"center",gap:16,padding:"16px 20px",marginBottom:6,background:i%2===0?P.orchid+"06":"transparent",borderRadius:12,borderLeft:"3px solid "+(i===0?P.solar:i<3?c:P.dim)}}>
                <div style={{width:36,height:36,borderRadius:10,background:i===0?P.solar+"15":i<3?c+"10":P.dim+"10",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:900,color:i===0?P.solar:i<3?c:P.dim,fontFamily:fm,border:"1px solid "+(i===0?P.solar+"40":c+"20")}}>#{i+1}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:700,color:P.txt,marginBottom:3}}>{a.name}</div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <Pill name={a.pl} color={c}/>
                    <span style={{fontSize:10,color:P.dim,fontFamily:fm}}>{a.set}</span>
                    {(a.best||a.bestAll)&&<span style={{background:a.bestAll?gFire:c+"20",color:a.bestAll?"#fff":c,fontSize:8,fontWeight:900,padding:"3px 10px",borderRadius:6,fontFamily:fm,letterSpacing:1}}>{a.bestAll?"BEST ALL PLATFORMS":"BEST ON META"}</span>}
                  </div>
                </div>
                <div style={{textAlign:"right",minWidth:80}}><div style={{fontSize:18,fontWeight:900,color:P.txt,fontFamily:fm}}>{fmt(a.r)}</div><div style={{fontSize:10,color:P.dim,fontFamily:fm}}>results</div></div>
                <div style={{textAlign:"right",minWidth:70}}><div style={{fontSize:16,fontWeight:800,color:P.mint,fontFamily:fm}}>{fR(a.cpc)}</div><div style={{fontSize:10,color:P.dim,fontFamily:fm}}>CPC</div></div>
                <div style={{textAlign:"right",minWidth:60}}><div style={{fontSize:14,fontWeight:700,color:P.sub,fontFamily:fm}}>{a.ctr?pc(a.ctr):"—"}</div><div style={{fontSize:10,color:P.dim,fontFamily:fm}}>CTR</div></div>
              </div>);})}
            <Insight title="Creative Intelligence" icon={Ic.fire(P.solar,16)} accent={P.solar}>
              <strong>The GIF format is the standout creative discovery.</strong> Scroll &amp; Chill Bundles GIF delivered 7,671 clicks at R0.67 CPC with a 2.36% CTR — 36% above campaign average. The Showmax &amp; Mins GIF achieves an even lower R0.64 CPC with a remarkable 2.78% CTR, confirming GIF should be prioritised for all future creative production. On TikTok, <strong>Ayanda's R59/R69 Deals dominates community acquisition</strong> at R1.28 CPF — 2.4x more cost-efficient than the next-best Meta rate. This single creative is the most valuable asset in the entire three-platform campaign.
            </Insight>
          </Glass>
        </div>)}

        {tab==="bof"&&(<div>
          <Section icon={Ic.target(P.rose,22)} title="Bottom of Funnel — Objective Key Results" sub="Results · Cost Per Result · Community Growth" accent={P.rose}/>
          {[{p:"Facebook",c:P.fb},{p:"Instagram",c:P.ig},{p:"TikTok",c:P.tt}].map(g=>{const items=D.bof.objs.filter(o=>o.p===g.p);return(
            <div key={g.p} style={{marginBottom:28}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
                <span style={{width:12,height:12,borderRadius:"50%",background:g.c,boxShadow:"0 0 10px "+g.c}}/>
                <span style={{fontSize:15,fontWeight:900,color:g.c,fontFamily:ff}}>{g.p}</span>
                <div style={{flex:1,height:1,background:"linear-gradient(90deg, "+g.c+"30, transparent)"}}/>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat("+items.length+",1fr)",gap:14}}>
                {items.map((o,i)=>(<Glass key={i} accent={g.c} hv st={{padding:22}}>
                  <div style={{fontSize:9,fontWeight:700,color:P.sub,fontFamily:fm,letterSpacing:2,textTransform:"uppercase",marginBottom:16}}>{o.n}</div>
                  <div style={{fontSize:30,fontWeight:900,color:P.txt,fontFamily:fm,lineHeight:1,marginBottom:4}}>{fmt(o.r)}</div>
                  <div style={{fontSize:9,color:P.dim,fontFamily:fm,marginBottom:16}}>results delivered</div>
                  <div style={{display:"flex",justifyContent:"space-between",paddingTop:10,borderTop:"1px solid "+P.rule}}>
                    <div><div style={{fontSize:8,color:P.dim,fontFamily:fm,letterSpacing:2}}>COST/RESULT</div><div style={{fontSize:18,fontWeight:900,color:g.c,fontFamily:fm,marginTop:2}}>{fR(o.cpr)}</div></div>
                    <div style={{textAlign:"right"}}><div style={{fontSize:8,color:P.dim,fontFamily:fm,letterSpacing:2}}>SPEND</div><div style={{fontSize:14,fontWeight:700,color:P.sub,fontFamily:fm,marginTop:2}}>{fR(o.s)}</div></div>
                  </div>
                </Glass>))}
              </div>
            </div>);})}

          <Glass accent={P.ember} st={{padding:32,marginBottom:32,background:"linear-gradient(135deg, "+P.lava+"05, "+P.ember+"05, "+P.solar+"05)"}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:28}}>{Ic.users(P.ember,20)}<span style={{fontSize:10,fontWeight:800,color:P.ember,letterSpacing:3,fontFamily:fm,textTransform:"uppercase"}}>Combined Community — All Platforms</span></div>
            <div style={{display:"grid",gridTemplateColumns:"1.3fr 1fr 1fr 1fr",gap:24}}>
              <div>
                <div style={{fontSize:9,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:8}}>TOTAL COMMUNITY</div>
                <div style={{fontSize:48,fontWeight:900,fontFamily:ff,lineHeight:1,letterSpacing:-2,color:P.ember}}>{fmt(D.bof.comm.total)}</div>
                <div style={{fontSize:11,color:P.sub,fontFamily:fm,marginTop:10}}>new followers, likes &amp; follows</div>
                <div style={{fontSize:11,color:P.dim,fontFamily:fm,marginTop:4}}>Blended CPF: <span style={{color:P.solar,fontWeight:700}}>{fR(D.bof.comm.cpf)}</span></div>
              </div>
              {[{l:"Facebook\nPage Likes",v:5902,c:P.fb},{l:"Instagram\nFollowers",v:5754,c:P.ig},{l:"TikTok\nFollows",v:7558,c:P.tt}].map((x,i)=>(
                <div key={i} style={{borderLeft:"1px solid "+P.rule,paddingLeft:20}}>
                  <div style={{fontSize:9,color:P.dim,fontFamily:fm,letterSpacing:2,whiteSpace:"pre-line",lineHeight:1.6,marginBottom:8}}>{x.l}</div>
                  <div style={{fontSize:32,fontWeight:900,color:x.c,fontFamily:fm,lineHeight:1}}>{fmt(x.v)}</div>
                  <div style={{fontSize:10,color:P.sub,fontFamily:fm,marginTop:8}}>{((x.v/D.bof.comm.total)*100).toFixed(1)}% of total</div>
                </div>))}
            </div>
            <Insight title="Community Growth Assessment" icon={Ic.crown(P.ember,16)} accent={P.ember}>
              <strong>19,214 community members</strong> acquired across three platforms in 24 days — approximately <strong>800 new members per day</strong> at R2.60 blended CPF. TikTok leads volume with 7,558 follows (39.3%), driven by Ayanda's R59/R69 creative at R1.28 CPF. Instagram delivers the most efficient Meta growth at R1.36 CPF — 3.4x cheaper than Facebook page likes. Crucially, this community represents a <strong>retargetable owned audience</strong> that reduces future paid media dependency: every follower gained today lowers the cost of reaching them organically tomorrow.
            </Insight>
          </Glass>

          <Glass accent={P.rose} st={{padding:28}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:22}}>{Ic.target(P.rose,18)}<span style={{fontSize:10,fontWeight:800,color:P.rose,letterSpacing:3,fontFamily:fm,textTransform:"uppercase"}}>Cost Per Community Acquisition</span></div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={[{name:"IG Followers",value:1.36,fill:P.ig},{name:"TT Follows",value:1.94,fill:P.tt},{name:"Blended CPF",value:2.60,fill:P.ember},{name:"FB Page Likes",value:4.66,fill:P.fb}]} layout="vertical" barSize={24}>
                <CartesianGrid strokeDasharray="3 3" stroke={P.rule} horizontal={false}/><XAxis type="number" tick={{fontSize:10,fill:P.dim,fontFamily:fm}} stroke="transparent" tickFormatter={v=>"R"+v}/><YAxis type="category" dataKey="name" tick={{fontSize:11,fill:P.txt,fontFamily:fm}} stroke="transparent" width={110}/><Tooltip content={Tip}/>
                <Bar dataKey="value" name="CPF" radius={[0,10,10,0]}>{[P.ig,P.tt,P.ember,P.fb].map((c,i)=><Cell key={i} fill={c}/>)}</Bar>
              </BarChart>
            </ResponsiveContainer>
            <Insight title="Cost Efficiency Ranking" icon={Ic.bolt(P.rose,16)} accent={P.rose}>
              Instagram followers at <strong>R1.36 each</strong> are significantly below the SA industry benchmark of R2-4. TikTok's R1.94 CPF is equally competitive given higher engagement rates. Facebook's R4.66, whilst the most expensive, carries higher organic reach weighting. The <strong>blended R2.60 CPF</strong> confirms the multi-channel approach: each platform contributes its strength to build a community MoMo can activate for years to come.
            </Insight>
          </Glass>
        </div>)}
      </main>

      <footer style={{borderTop:"1px solid "+P.rule,background:"rgba(6,2,14,0.95)",padding:"28px 40px"}}>
        <div style={{maxWidth:1280,margin:"0 auto",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{display:"flex",alignItems:"center",gap:14}}>
            <div style={{width:32,height:32,borderRadius:"50%",background:gFire,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:900,color:"#fff",fontFamily:fm,boxShadow:"0 0 16px "+P.ember+"30"}}>GAS</div>
            <div><span style={{fontSize:12,fontWeight:800,color:P.sub,fontFamily:fm,letterSpacing:2}}>MEDIA ON GAS</span><span style={{fontSize:10,color:P.dim,marginLeft:10}}>Powered by GAS Response Marketing</span></div>
          </div>
          <div style={{fontSize:9,color:P.dim,fontFamily:fm,textAlign:"right",lineHeight:1.8}}>Meta: 1–24 Mar 2026 · TikTok: 1–23 Mar 2026 · All figures in ZAR<br/>Confidential · grow@gasmarketing.co.za</div>
        </div>
      </footer>
    </div>
  );
}
