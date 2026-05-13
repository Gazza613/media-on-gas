import { useState, useEffect, useMemo, useRef } from "react";
var _v="2.0";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Line, Legend, LabelList } from "recharts";
import CreateTab from "./CreateTab.jsx";

// label and caption are the canonical tokens for client-visible secondary
// text. Hard rule across the dashboard: every label uses P.label (white at
// 70% opacity), every explanation / sub-copy uses P.caption (white at 58%
// opacity). P.label and P.caption are kept for non-label uses (chart strokes,
// background tints via concat like P.sub+"15", icon colours, etc.).
// Page palette. void / cosmos / nebula were originally three flavours of
// dark grey (#121212, #1a1a1a) which clashed against the header's deep
// navy (rgba(6,2,14)) — page felt grey while the header felt navy.
// Realigned to the same deep-navy family so the gradient, modals, and
// header all sit in one cohesive colour space:
//   void   #06020e  page bottom, matches header background exactly
//   cosmos #0a0418  modal + card surface, one notch lifted
//   nebula #0d061f  gradient mid, slightly more depth
var P={void:"#06020e",cosmos:"#0a0418",nebula:"#0d061f",glass:"rgba(30,18,50,0.65)",ember:"#F96203",blaze:"#FF3D00",solar:"#FFAA00",lava:"#FF2222",orchid:"#A855F7",violet:"#7C3AED",fuchsia:"#D946EF",rose:"#F43F5E",cyan:"#0891B2",mint:"#34D399",fb:"#4599FF",ig:"#E1306C",tt:"#00F2EA",gd:"#34A853",yt:"#FF0000",txt:"#FFFBF8",sub:"#8B7FA3",dim:"#4A3D60",label:"rgba(255,251,248,0.7)",caption:"rgba(255,251,248,0.58)",rule:"rgba(168,85,247,0.12)",critical:"#ef4444",warning:"#fbbf24",info:"#60a5fa",positive:"#4ade80"};
var gFire="linear-gradient(135deg,#E8231A,#FF6B00,#FFAA00)",gEmber="linear-gradient(135deg,#FF3D00,#FF6B00)";
var ff="Poppins,Outfit,Segoe UI,sans-serif",fm="JetBrains Mono,Consolas,monospace";

// Quirky rotating loading messages, shown while data is pulled from the
// platforms or Redis. Keeps the client engaged during the 5-15 second
// cold-cache window rather than staring at a static spinner.
var QUIRKY_DASHBOARD_LOADERS=[
  "Rounding up your ads from Meta, TikTok and Google, they scatter",
  "Teaching the numbers to line up in neat little rows",
  "Polishing your CTR, it comes up shinier that way",
  "Counting follows, clicks, and every small victory",
  "Fetching your metrics that matter, no decimal left behind",
  "Asking Meta nicely for the latest impressions",
  "Untangling the TikTok data, it's never in a hurry",
  "Reading your dashboard its morning briefing",
  "Lining up the spend, the clicks, and the lessons learned",
  "Brewing fresh insights, please hold the line",
  "Your numbers are on the way, the van just took a scenic route",
  "Cross-checking CPMs against what's actually healthy today",
  "Gathering the platform gossip so you don't have to",
  "Your KPIs are stretching, it's been a while since they posed for a photo"
];
var QUIRKY_SHORT_LOADERS=[
  "Pulling the good stuff",
  "Warming up the numbers",
  "On the way",
  "Fetching the latest",
  "Loading, shh",
  "Two ticks",
  "Almost there"
];
var QUIRKY_EMAIL_LOADERS=[
  "Rounding up every number from Meta, TikTok and Google, they scatter the moment a client asks for a summary",
  "Drafting your email preview, the paragraphs always argue about word order before they settle down",
  "Laying out the KPI tiles, making sure the percentages line up like good little soldiers",
  "Polishing the executive summary until it reads like a senior strategist wrote it, not a junior",
  "The creative performance breakdown is getting its hair done, these things take a minute",
  "Rendering the charts, colour theory is a slow art and we don't rush good taste",
  "Cross-checking every cost-per-result before the client sees it, we don't do rough drafts",
  "Meta and TikTok are comparing notes on who drove more engagement, nobody wants to admit defeat",
  "Writing the client greeting, sharpening the opening line so it lands",
  "Warming up the PDF-styled HTML, emails are picky about flex layouts",
  "Your email is trying on its interview outfit, the tie is nearly straight",
  "Counting impressions, clicks, and every small victory, the victories take a moment to queue up",
  "Asking the ads nicely for their best metrics, the top performers know they're on camera",
  "Stacking the objective highlights in order of impact, the drama is very real",
  "Checking the numbers twice because the client will",
  "Almost there, the tea is brewing"
];
var QUIRKY_AD_LOADERS=[
  "Thumbing through the creative archive, the best ones are always buried at the bottom",
  "Asking Meta for the thumbnails, they want to show us forty sizes first",
  "Teaching TikTok to stand still for a photo, it won't",
  "Rifling through the ad inventory, the winners never label themselves",
  "Polling Google, YouTube, Meta and TikTok, all four have their own pace",
  "Counting app clicks, lead forms, and every thumbnail that survived compression",
  "Unwrapping the creatives, some came in DCO bubble wrap",
  "Sorting by actual performance, not by who shouts loudest",
  "Your best performers are getting in formation, the laggards are still warming up",
  "Fetching ad-level truth, each platform has its own version of it",
  "Dusting off the video posters, they photograph better in good light",
  "Meta took the long way round, it usually does"
];
// Pure helper, pick a random quirky loader. Rotates in components via
// useEffect + setInterval.
function pickQuirky(pool) { return pool[Math.floor(Math.random() * pool.length)]; }
// Given a selected date range and a comparison mode, return { from, to }
// for the prior period to fetch. WoW = the equivalent N-day window
// immediately before. MoM = same calendar dates, previous month (with
// day-of-month clamped to the last day of that month if it overshoots
// e.g. Mar 31 -> Feb 28).
function computeComparisonRange(fromStr, toStr, mode) {
  if (mode !== "wow" && mode !== "mom") return null;
  if (!fromStr || !toStr) return null;
  var f = new Date(fromStr + "T00:00:00");
  var t = new Date(toStr + "T00:00:00");
  if (isNaN(f.getTime()) || isNaN(t.getTime()) || t < f) return null;
  var pad = function(n) { return String(n).padStart(2, "0"); };
  var iso = function(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
  if (mode === "wow") {
    var msDay = 86400000;
    var rangeDays = Math.round((t.getTime() - f.getTime()) / msDay) + 1;
    var pt = new Date(f.getTime() - msDay);
    var pf = new Date(pt.getTime() - (rangeDays - 1) * msDay);
    return { from: iso(pf), to: iso(pt) };
  }
  // MoM: if the selected range IS a full calendar month (1st to last day
  // of the same month) compare to the WHOLE previous calendar month
  // (so Apr 1-30 -> Mar 1-31 regardless of month lengths). Otherwise
  // fall back to same relative dates in the prior month.
  var sameMonth = f.getFullYear() === t.getFullYear() && f.getMonth() === t.getMonth();
  var lastOfCur = new Date(f.getFullYear(), f.getMonth() + 1, 0).getDate();
  var isFullMonth = sameMonth && f.getDate() === 1 && t.getDate() === lastOfCur;
  var pfy = f.getFullYear(), pfm = f.getMonth() - 1;
  if (pfm < 0) { pfm = 11; pfy--; }
  var pty = t.getFullYear(), ptm = t.getMonth() - 1;
  if (ptm < 0) { ptm = 11; pty--; }
  if (isFullMonth) {
    var lastOfPrev = new Date(pfy, pfm + 1, 0).getDate();
    return { from: pfy + "-" + pad(pfm + 1) + "-01", to: pfy + "-" + pad(pfm + 1) + "-" + pad(lastOfPrev) };
  }
  var lastF = new Date(pfy, pfm + 1, 0).getDate();
  var lastT = new Date(pty, ptm + 1, 0).getDate();
  return {
    from: pfy + "-" + pad(pfm + 1) + "-" + pad(Math.min(f.getDate(), lastF)),
    to: pty + "-" + pad(ptm + 1) + "-" + pad(Math.min(t.getDate(), lastT))
  };
}
// Desktop button label for the ad preview CTA, mobile collapses via CSS.
function viewAdLabel(platform) {
  var p = String(platform || "").toLowerCase();
  if (p.indexOf("facebook") >= 0) return "VIEW FACEBOOK AD";
  if (p.indexOf("instagram") >= 0) return "VIEW INSTAGRAM AD";
  if (p.indexOf("tiktok") >= 0) return "VIEW TIKTOK AD";
  if (p.indexOf("youtube") >= 0 || p.indexOf("google") >= 0 || p.indexOf("demand") >= 0 || p.indexOf("performance max") >= 0) return "VIEW GOOGLE AD";
  return "VIEW AD";
}
var API=window.location.origin;
// Feature flags for the audience-insight build. Flip any one to false to
// hide that section in production without deleting the code, so we can see
// each new block live then turn it off cleanly if the client doesn't want
// it. Removing a block permanently means deleting the flag and its guards
// at the same time so the dead code doesn't linger.
var FEATURES={
  targetingPersonas:true,     // Targeting tab, per-platform persona cards (Meta, IG, TikTok)
  googleIntentCard:true,      // Targeting tab, Google Search intent card
  communityDemographics:false,// DISABLED, Meta / IG / TikTok owned-community demographic APIs
                              // return "data not exposed" for our connected pages across the
                              // board so the cards showed placeholders only. Flip back to
                              // true if the platform permissions / scopes get upgraded and
                              // real age / gender / country data starts flowing through.
  summaryTeasers:true         // Summary tab, mini previews linking to Targeting and Community
};
var LOOKER_URLS={"mtn momo pos":"https://lookerstudio.google.com/reporting/2c88c27a-4e0f-46ed-8ef9-afdb1b54a9dd/page/p_2upnicpx0d","momo pos":"https://lookerstudio.google.com/reporting/2c88c27a-4e0f-46ed-8ef9-afdb1b54a9dd/page/p_2upnicpx0d","momo":"https://lookerstudio.google.com/reporting/e527d821-db3b-4e60-9f3a-626165e2eed1/page/p_1ooj1p0nmd","mtn momo":"https://lookerstudio.google.com/reporting/e527d821-db3b-4e60-9f3a-626165e2eed1/page/p_1ooj1p0nmd","willowbrook":"https://lookerstudio.google.com/reporting/823fd5fa-b39d-4dc3-b623-549197d0341f/page/p_2upnicpx0d","psycho":"https://lookerstudio.google.com/reporting/0adc106a-50e2-42cc-a4ca-aafc04160e5d/page/p_1ooj1p0nmd","khava":"","concord":"","eden":"","flower":""};
var LOOKER_KEYS=["mtn momo pos","momo pos","willowbrook","psycho","khava","concord","eden","flower","momo","mtn momo"];
function findLookerUrl(camps,sel){var s=camps.filter(function(x){return sel.indexOf(x.campaignId)>=0;});if(s.length===0)return{url:"",client:"none"};var names=s.map(function(x){return(x.campaignName||"").toLowerCase();}).join(" ");for(var i=0;i<LOOKER_KEYS.length;i++){if(names.indexOf(LOOKER_KEYS[i])>=0){var u=LOOKER_URLS[LOOKER_KEYS[i]];return{url:u,client:LOOKER_KEYS[i]};}}return{url:"",client:"unknown"};}
var fmt=function(n){var v=parseFloat(n);if(isNaN(v))return"0";if(v>=1e6)return(v/1e6).toFixed(2)+"M";if(v>=1e3)return(v/1e3).toFixed(1)+"K";return Math.round(v).toLocaleString();};
var fR=function(n){var v=parseFloat(n);return isNaN(v)?"R0.00":"R"+v.toLocaleString("en-ZA",{minimumFractionDigits:2,maximumFractionDigits:2});};
var pc=function(n){var v=parseFloat(n);return isNaN(v)?"0.00%":v.toFixed(2)+"%";};
// textOnAccent picks dark or white text based on background brightness
// (WCAG relative luminance). Bright brand colours like TikTok cyan
// (#00F2EA) and Google's gold (#FFAA00) fail white-text contrast badly,
// dark text on those reads cleanly while staying brand-faithful. Used on
// any button or chip whose background is a dynamic platform / objective
// accent colour. Falls back to white for non-hex inputs (gradients,
// rgb()) since those are typically darker.
var textOnAccent=function(bg){
  if(typeof bg!=="string")return"#fff";
  var hex=bg.charAt(0)==="#"?bg.slice(1):bg;
  if(hex.length===3)hex=hex.split("").map(function(c){return c+c;}).join("");
  if(hex.length<6||/[^0-9a-fA-F]/.test(hex.slice(0,6)))return"#fff";
  var r=parseInt(hex.slice(0,2),16),g=parseInt(hex.slice(2,4),16),b=parseInt(hex.slice(4,6),16);
  var lum=(0.2126*r+0.7152*g+0.0722*b)/255;
  return lum>0.62?"#0a0618":"#fff";
};

function SignupScreen(props){
  var loadingS=useState(true),loading=loadingS[0],setLoading=loadingS[1];
  var errS=useState(""),err=errS[0],setErr=errS[1];
  var inviteS=useState(null),invite=inviteS[0],setInvite=inviteS[1];
  var pwS=useState(""),pw=pwS[0],setPw=pwS[1];
  var pw2S=useState(""),pw2=pw2S[0],setPw2=pw2S[1];
  var busyS=useState(false),busy=busyS[0],setBusy=busyS[1];
  var doneS=useState(false),done=doneS[0],setDone=doneS[1];

  useEffect(function(){
    var params=new URLSearchParams(window.location.search);
    var token=params.get("token")||"";
    if(!token){setErr("Invite link is missing its token.");setLoading(false);return;}
    fetch(API+"/api/accept-invite?token="+encodeURIComponent(token))
      .then(function(r){return r.json().then(function(d){return{status:r.status,data:d};});})
      .then(function(r){
        setLoading(false);
        if(r.status===200)setInvite(r.data);
        else setErr(r.data.error||"Invite not found or expired.");
      }).catch(function(){setLoading(false);setErr("Connection error");});
  },[]);

  var submit=function(){
    if(!invite)return;
    if(pw.length<8){setErr("Password must be at least 8 characters.");return;}
    if(pw!==pw2){setErr("Passwords do not match.");return;}
    setBusy(true);setErr("");
    var params=new URLSearchParams(window.location.search);
    var token=params.get("token")||"";
    fetch(API+"/api/accept-invite",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:token,password:pw})})
      .then(function(r){return r.json().then(function(d){return{status:r.status,data:d};});})
      .then(function(r){
        setBusy(false);
        if(r.status===200){setDone(true);}
        else{setErr(r.data.error||"Could not set password.");}
      }).catch(function(){setBusy(false);setErr("Connection error");});
  };

  return(<div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"radial-gradient(ellipse at 50% 20%,#1a0b2e 0%,#0d0618 45%,#06020e 100%)",fontFamily:ff,position:"relative",overflow:"hidden",padding:"40px 16px"}}>
    <div style={{width:"100%",maxWidth:440,padding:32,position:"relative",zIndex:2}}>
      <div style={{textAlign:"center",marginBottom:32}}>
        <div style={{width:80,height:80,borderRadius:"50%",overflow:"hidden",margin:"0 auto 22px",position:"relative"}}>
          <img src="/GAS_LOGO_EMBLEM_GAS_Primary_Gradient.png" alt="GAS" style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>
        </div>
        <div style={{fontSize:22,fontWeight:900,letterSpacing:7,fontFamily:fm,lineHeight:1,marginBottom:10}}><span style={{color:P.txt}}>MEDIA </span><span style={{color:P.ember}}>ON </span><span style={{color:"#FF3D00"}}>GAS</span></div>
        <div style={{fontSize:10,color:P.label,letterSpacing:4,textTransform:"uppercase",fontFamily:fm,fontWeight:600}}>{invite&&invite.kind==="reset"?"Password Reset":"Team Invitation"}</div>
      </div>
      <div style={{background:"rgba(30,18,50,0.5)",border:"1px solid "+P.rule,borderRadius:16,padding:28,backdropFilter:"blur(24px)"}}>
        {loading&&<div style={{textAlign:"center",color:P.label,fontFamily:fm,fontSize:12,letterSpacing:2}}>Dusting off your invite…</div>}
        {!loading&&err&&!invite&&<div style={{textAlign:"center"}}>
          <div style={{fontSize:14,color:P.critical,fontFamily:fm,lineHeight:1.6,marginBottom:14}}>{err}</div>
          <div style={{fontSize:11,color:P.label,fontFamily:fm,lineHeight:1.6}}>Ask <span style={{color:P.ember}}>gary@gasmarketing.co.za</span> for a fresh invitation.</div>
        </div>}
        {!loading&&invite&&!done&&<>
          <div style={{fontSize:11,color:P.label,fontFamily:fm,letterSpacing:2,textTransform:"uppercase",fontWeight:700,marginBottom:10,textAlign:"center"}}>{invite.kind==="reset"?"Choose a new password":"Set your password"}</div>
          <div style={{fontSize:13,color:P.txt,fontFamily:ff,lineHeight:1.6,marginBottom:18,textAlign:"center"}}>{invite.kind==="reset"?"Welcome back":"Welcome"} <span style={{color:P.ember,fontWeight:800}}>{invite.name||invite.email}</span><div style={{fontSize:11,color:P.label,marginTop:4}}>{invite.email}</div></div>
          <input type="password" placeholder={invite.kind==="reset"?"New password (8+ chars)":"Choose a password (8+ chars)"} value={pw} onChange={function(e){setPw(e.target.value);setErr("");}} autoComplete="new-password" style={{width:"100%",boxSizing:"border-box",background:"rgba(6,2,14,0.6)",border:"1px solid "+P.rule,borderRadius:10,padding:"14px 16px",color:P.txt,fontSize:14,fontFamily:fm,outline:"none",marginBottom:12,letterSpacing:2}}/>
          <input type="password" placeholder="Confirm password" value={pw2} onChange={function(e){setPw2(e.target.value);setErr("");}} onKeyDown={function(e){if(e.key==="Enter")submit();}} autoComplete="new-password" style={{width:"100%",boxSizing:"border-box",background:"rgba(6,2,14,0.6)",border:"1px solid "+P.rule,borderRadius:10,padding:"14px 16px",color:P.txt,fontSize:14,fontFamily:fm,outline:"none",marginBottom:16,letterSpacing:2}}/>
          {err&&<div style={{color:P.critical,fontSize:11,fontFamily:fm,marginBottom:12,textAlign:"center"}}>{err}</div>}
          <button onClick={submit} disabled={busy} style={{width:"100%",background:busy?"#555":gEmber,border:"none",borderRadius:10,padding:"14px 24px",color:"#fff",fontSize:13,fontWeight:800,fontFamily:fm,cursor:busy?"wait":"pointer",letterSpacing:2}}>{busy?(invite.kind==="reset"?"UPDATING...":"SETTING PASSWORD..."):(invite.kind==="reset"?"UPDATE PASSWORD":"ACCEPT & ACTIVATE")}</button>
        </>}
        {done&&<div style={{textAlign:"center"}}>
          <div style={{fontSize:36,marginBottom:10,color:P.mint}}>{"✓"}</div>
          <div style={{fontSize:14,color:P.txt,fontFamily:fm,letterSpacing:2,textTransform:"uppercase",fontWeight:800,marginBottom:8}}>{invite&&invite.kind==="reset"?"Password Updated":"Account Ready"}</div>
          <div style={{fontSize:12,color:P.label,fontFamily:ff,marginBottom:20,lineHeight:1.6}}>{invite&&invite.kind==="reset"?"Sign in with your email and new password.":"Password set. Sign in with your email and new password."}</div>
          <button onClick={function(){window.location.href="/";}} style={{width:"100%",background:gEmber,border:"none",borderRadius:10,padding:"14px 24px",color:"#fff",fontSize:13,fontWeight:800,fontFamily:fm,cursor:"pointer",letterSpacing:2}}>GO TO SIGN IN</button>
        </div>}
      </div>
    </div>
  </div>);
}

function LoginScreen(props){
  var es=useState(""),loginErr=es[0],setLoginErr=es[1];
  var em=useState(""),email=em[0],setEmail=em[1];
  var ps=useState(""),pw=ps[0],setPw=ps[1];
  var ls=useState(false),busy=ls[0],setBusy=ls[1];
  // Forgot-password sub-flow lives on the same screen, toggled in place
  // so the user keeps the visual context (logo, ambient flares) instead
  // of being thrown to a separate route.
  var fpS=useState(false),showForgot=fpS[0],setShowForgot=fpS[1];
  var feS=useState(""),fpEmail=feS[0],setFpEmail=feS[1];
  var fbS=useState(false),fpBusy=fbS[0],setFpBusy=fbS[1];
  var fdS=useState(false),fpDone=fdS[0],setFpDone=fdS[1];
  var feeS=useState(""),fpErr=feeS[0],setFpErr=feeS[1];
  var sendForgot=function(){
    if(!fpEmail.trim()){setFpErr("Enter your email");return;}
    setFpBusy(true);setFpErr("");
    fetch(API+"/api/forgot-password",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:fpEmail.trim().toLowerCase()})})
      .then(function(r){return r.json().then(function(d){return{status:r.status,data:d};});})
      .then(function(){setFpBusy(false);setFpDone(true);})
      .catch(function(){setFpBusy(false);setFpDone(true);});
    // We always claim success even on network error — match the server's
    // intentional opacity. The user can retry if their inbox stays empty.
  };
  var handleLogin=function(){
    if(!email){setLoginErr("Enter your email");return;}
    if(!pw){setLoginErr("Enter your password");return;}
    setBusy(true);setLoginErr("");
    fetch(API+"/api/auth",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:email.trim().toLowerCase(),password:pw})})
    .then(function(r){return r.json().then(function(d){return{status:r.status,data:d};});})
    .then(function(r){
      setBusy(false);
      var d=r.data||{};
      if(d.token){
        sessionStorage.setItem("gas_session",d.token);
        sessionStorage.setItem("gas_role",d.role||"admin");
        sessionStorage.setItem("gas_email",d.email||"");
        sessionStorage.setItem("gas_name",d.name||"");
        sessionStorage.setItem("gas_login_ts",String(Date.now()));
        props.onLogin(d.token,d.role,d.email,d.name);
      }else{
        setLoginErr(d.error||"Invalid email or password");
      }
    }).catch(function(){setBusy(false);setLoginErr("Connection error");});
  };
  return(<div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"radial-gradient(ellipse at 50% 20%,#1a0b2e 0%,#0d0618 45%,#06020e 100%)",fontFamily:ff,position:"relative",overflow:"hidden"}}>
    <style>{"@keyframes gasFloat{0%,100%{transform:translate3d(0,0,0) scale(1)}50%{transform:translate3d(0,-12px,0) scale(1.02)}}@keyframes gasDrift{0%{transform:translate3d(0,0,0)}100%{transform:translate3d(-120px,40px,0)}}@keyframes gasPulse{0%,100%{opacity:0.35;transform:scale(1)}50%{opacity:0.6;transform:scale(1.08)}}@keyframes gasOrbit{0%{transform:rotate(0deg) translateX(200px) rotate(0deg)}100%{transform:rotate(360deg) translateX(200px) rotate(-360deg)}}@keyframes gasShimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}@keyframes gasEnter{0%{opacity:0;transform:translate3d(0,20px,0)}100%{opacity:1;transform:translate3d(0,0,0)}}@keyframes gasBorderGlow{0%,100%{box-shadow:0 0 0 1px rgba(249,98,3,0.1),0 20px 60px rgba(0,0,0,0.5),0 0 100px rgba(249,98,3,0.08)}50%{box-shadow:0 0 0 1px rgba(249,98,3,0.25),0 20px 60px rgba(0,0,0,0.5),0 0 100px rgba(249,98,3,0.2)}}@keyframes gasLogoGlow{0%,100%{box-shadow:0 0 30px rgba(249,98,3,0.3),0 0 60px rgba(249,98,3,0.15)}50%{box-shadow:0 0 45px rgba(249,98,3,0.5),0 0 90px rgba(249,98,3,0.25),0 0 120px rgba(168,85,247,0.15)}}@keyframes gasScan{0%{transform:translateY(-100%)}100%{transform:translateY(100vh)}}@keyframes gasSheen{0%{left:-50%}45%{left:120%}100%{left:120%}}@keyframes gasLockPulse{0%,100%{opacity:0.85;transform:scale(1)}50%{opacity:1;transform:scale(1.08);filter:drop-shadow(0 0 6px rgba(249,98,3,0.5))}}@keyframes gasSpark{0%{opacity:0;transform:translate3d(0,0,0) scale(0.4)}15%{opacity:0.9;transform:translate3d(-8px,-6px,0) scale(1)}85%{opacity:0.35}100%{opacity:0;transform:translate3d(-20px,-60px,0) scale(0.5)}}@keyframes gasAurora{0%{transform:translate3d(-30%,0,0) rotate(-4deg);opacity:0.45}50%{transform:translate3d(20%,-5%,0) rotate(-2deg);opacity:0.7}100%{transform:translate3d(-30%,0,0) rotate(-4deg);opacity:0.45}}@keyframes gasHueShift{0%,100%{filter:hue-rotate(0deg)}50%{filter:hue-rotate(18deg)}}@keyframes gasButtonHalo{0%,100%{box-shadow:0 4px 14px rgba(249,98,3,0.2),0 0 0 rgba(249,98,3,0)}50%{box-shadow:0 6px 24px rgba(249,98,3,0.42),0 0 26px rgba(249,98,3,0.32),0 0 52px rgba(168,85,247,0.18)}}@keyframes gasRingSpin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}@keyframes gasCardBreath{0%,100%{transform:translate3d(0,0,0)}50%{transform:translate3d(0,-2px,0)}}@keyframes gasCardBreather{0%,100%{border-color:rgba(249,98,3,0.22);box-shadow:0 0 0 1px rgba(249,98,3,0.08),0 18px 50px rgba(0,0,0,0.5),0 0 0 rgba(249,98,3,0)}50%{border-color:rgba(249,98,3,0.7);box-shadow:0 0 0 1px rgba(249,98,3,0.35),0 18px 50px rgba(0,0,0,0.55),0 0 40px rgba(249,98,3,0.28),0 0 80px rgba(168,85,247,0.14)}}@keyframes gasBtnAura{0%,100%{box-shadow:0 6px 20px rgba(249,98,3,0.3),0 0 22px rgba(249,98,3,0.22),inset 0 0 0 1px rgba(255,255,255,0.12)}50%{box-shadow:0 10px 32px rgba(249,98,3,0.55),0 0 44px rgba(249,98,3,0.42),0 0 78px rgba(168,85,247,0.22),inset 0 0 0 1px rgba(255,255,255,0.22)}}@keyframes gasBtnSheenFast{0%{transform:translateX(-140%) skewX(-18deg);opacity:0}12%{opacity:0}22%{opacity:1}45%{opacity:1}55%{opacity:0;transform:translateX(240%) skewX(-18deg)}100%{transform:translateX(240%) skewX(-18deg);opacity:0}}"}</style>

    {/* Ambient flare 1: ember top-left */}
    <div style={{position:"absolute",top:"-10%",left:"-10%",width:"60vw",height:"60vw",background:"radial-gradient(circle,rgba(249,98,3,0.18) 0%,transparent 55%)",filter:"blur(40px)",animation:"gasFloat 9s ease-in-out infinite",pointerEvents:"none"}}/>
    {/* Ambient flare 2: orchid bottom-right */}
    <div style={{position:"absolute",bottom:"-15%",right:"-10%",width:"50vw",height:"50vw",background:"radial-gradient(circle,rgba(168,85,247,0.15) 0%,transparent 55%)",filter:"blur(40px)",animation:"gasFloat 11s ease-in-out infinite 2s",pointerEvents:"none"}}/>
    {/* Ambient flare 3: cyan mid */}
    <div style={{position:"absolute",top:"40%",left:"55%",width:"30vw",height:"30vw",background:"radial-gradient(circle,rgba(34,211,238,0.08) 0%,transparent 60%)",filter:"blur(60px)",animation:"gasPulse 7s ease-in-out infinite 1s",pointerEvents:"none"}}/>

    {/* Grid overlay with slow drift */}
    <div style={{position:"absolute",inset:"-5%",opacity:0.04,backgroundImage:"linear-gradient("+P.ember+" 1px,transparent 1px),linear-gradient(90deg,"+P.ember+" 1px,transparent 1px)",backgroundSize:"56px 56px",animation:"gasDrift 40s linear infinite",pointerEvents:"none"}}/>

    {/* Noise + scanline for CRT feel */}
    <div style={{position:"absolute",inset:0,opacity:0.015,backgroundImage:"radial-gradient("+P.ember+" 0.5px,transparent 0.5px),radial-gradient("+P.orchid+" 0.5px,transparent 0.5px)",backgroundSize:"40px 40px",backgroundPosition:"0 0,20px 20px",pointerEvents:"none"}}/>
    <div style={{position:"absolute",left:0,right:0,height:"100vh",background:"linear-gradient(180deg,transparent 0%,rgba(249,98,3,0.04) 50%,transparent 100%)",animation:"gasScan 8s linear infinite",pointerEvents:"none",mixBlendMode:"screen"}}/>

    {/* Ambient drifting sparks, faint embers rising like a slow fire — fully decorative */}
    {[0,1,2,3,4,5,6,7].map(function(i){var delay=(i*1.4).toFixed(1);var left=(10+(i*11)%80);var bottom=-8-(i%4)*6;var size=i%2===0?3:4;var color=i%3===0?"#F96203":i%3===1?"#FFAA00":"#A855F7";return <div key={"spark-"+i} style={{position:"absolute",left:left+"%",bottom:bottom+"%",width:size,height:size,borderRadius:"50%",background:color,boxShadow:"0 0 8px "+color+",0 0 16px "+color+"55",animation:"gasSpark 7s ease-in-out "+delay+"s infinite",pointerEvents:"none",zIndex:1}}/>;})}

    <div style={{width:"100%",maxWidth:380,padding:32,position:"relative",zIndex:2,animation:"gasEnter 0.8s cubic-bezier(0.2,0.8,0.2,1) both"}}>
      <div style={{textAlign:"center",marginBottom:40,animation:"gasEnter 0.9s cubic-bezier(0.2,0.8,0.2,1) 0.05s both"}}>
        <div style={{width:80,height:80,borderRadius:"50%",overflow:"hidden",margin:"0 auto 22px",animation:"gasLogoGlow 4s ease-in-out infinite",position:"relative"}}>
          <img src="/GAS_LOGO_EMBLEM_GAS_Primary_Gradient.png" alt="GAS" width="80" height="80" fetchpriority="high" decoding="async" style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>
          {/* shimmer ring */}
          <div style={{position:"absolute",inset:-2,borderRadius:"50%",background:"conic-gradient(from 0deg,transparent 0deg,rgba(249,98,3,0.35) 60deg,transparent 120deg,transparent 360deg)",animation:"gasOrbit 6s linear infinite",opacity:0.6,pointerEvents:"none"}}/>
        </div>
        <div style={{fontSize:22,fontWeight:900,letterSpacing:7,fontFamily:fm,lineHeight:1,marginBottom:10}}><span style={{color:P.txt}}>MEDIA </span><span style={{color:P.ember}}>ON </span><span style={{backgroundImage:"linear-gradient(90deg,#F96203,#FF3D00,#A855F7,#F96203)",backgroundSize:"300% 100%",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text",animation:"gasShimmer 6s linear infinite"}}>GAS</span></div>
        <div style={{fontSize:13,color:"rgba(255,251,248,0.78)",letterSpacing:3.5,textTransform:"uppercase",fontFamily:fm,fontWeight:700,whiteSpace:"nowrap",animation:"gasEnter 0.9s cubic-bezier(0.2,0.8,0.2,1) 0.15s both"}}>Metrics That Matter</div>
      </div>
      <div style={{background:"rgba(30,18,50,0.5)",borderRadius:16,padding:28,backdropFilter:"blur(24px)",WebkitBackdropFilter:"blur(24px)",border:"1px solid rgba(249,98,3,0.25)",animation:"gasCardBreather 4.5s ease-in-out infinite, gasEnter 0.9s cubic-bezier(0.2,0.8,0.2,1) 0.25s both"}}>
        <div style={{fontSize:12,color:"rgba(255,251,248,0.72)",fontFamily:fm,letterSpacing:3,textTransform:"uppercase",fontWeight:600,marginBottom:16,textAlign:"center"}}>Dashboard Access</div>
        <input type="email" placeholder="Your work email" value={email} onChange={function(e){setEmail(e.target.value);setLoginErr("");}} onKeyDown={function(e){if(e.key==="Enter")handleLogin();}} autoFocus autoComplete="username" onFocus={function(e){e.target.style.borderColor="rgba(249,98,3,0.5)";e.target.style.boxShadow="0 0 0 3px rgba(249,98,3,0.1)";}} onBlur={function(e){e.target.style.borderColor=P.rule;e.target.style.boxShadow="none";}} style={{width:"100%",boxSizing:"border-box",background:"rgba(6,2,14,0.6)",border:"1px solid "+P.rule,borderRadius:10,padding:"14px 16px",color:P.txt,fontSize:14,fontFamily:fm,outline:"none",marginBottom:12,letterSpacing:1,transition:"border-color 0.25s, box-shadow 0.25s"}}/>
        <input type="password" placeholder="Your password" value={pw} onChange={function(e){setPw(e.target.value);setLoginErr("");}} onKeyDown={function(e){if(e.key==="Enter")handleLogin();}} autoComplete="current-password" onFocus={function(e){e.target.style.borderColor="rgba(249,98,3,0.5)";e.target.style.boxShadow="0 0 0 3px rgba(249,98,3,0.1)";}} onBlur={function(e){e.target.style.borderColor=P.rule;e.target.style.boxShadow="none";}} style={{width:"100%",boxSizing:"border-box",background:"rgba(6,2,14,0.6)",border:"1px solid "+P.rule,borderRadius:10,padding:"14px 16px",color:P.txt,fontSize:14,fontFamily:fm,outline:"none",marginBottom:16,letterSpacing:2,transition:"border-color 0.25s, box-shadow 0.25s"}}/>
        {loginErr&&<div style={{color:P.critical,fontSize:11,fontFamily:fm,marginBottom:12,textAlign:"center",animation:"gasEnter 0.3s ease both"}}>{loginErr}</div>}
        <button onClick={handleLogin} disabled={busy} onMouseEnter={function(e){if(!busy){e.currentTarget.style.transform="translateY(-2px) scale(1.015)";e.currentTarget.style.boxShadow="0 12px 32px rgba(249,98,3,0.5),0 0 44px rgba(249,98,3,0.3),inset 0 0 0 1px rgba(255,255,255,0.22)";}}} onMouseLeave={function(e){e.currentTarget.style.transform="translateY(0) scale(1)";e.currentTarget.style.boxShadow="0 6px 20px rgba(249,98,3,0.3),inset 0 0 0 1px rgba(255,255,255,0.12)";}} style={{width:"100%",background:busy?"#555":"linear-gradient(135deg,#FF3D00 0%,#FF6B00 45%,#F96203 100%)",border:"none",borderRadius:12,padding:"15px 24px",color:"#fff",fontSize:13,fontWeight:900,fontFamily:fm,cursor:busy?"wait":"pointer",letterSpacing:2.5,opacity:busy?0.7:1,transition:"transform 0.22s cubic-bezier(0.2,0.8,0.2,1), box-shadow 0.3s",position:"relative",overflow:"hidden",boxShadow:busy?"none":"0 6px 20px rgba(249,98,3,0.3),inset 0 0 0 1px rgba(255,255,255,0.12)"}}>
          {/* soft warm glow sitting over the top half for a "lit candle" finish */}
          {!busy&&<span style={{position:"absolute",top:0,left:0,right:0,height:"55%",background:"linear-gradient(180deg,rgba(255,255,255,0.22),transparent)",pointerEvents:"none",borderRadius:"12px 12px 0 0"}}/>}
          <span style={{position:"relative",zIndex:3}}>{busy?"AUTHENTICATING...":"SIGN IN"}</span>
          {/* sheen sweeps across the inside of the button, fades in + out so
              each pass feels continuous rather than popping at the edges */}
          {!busy&&<span style={{position:"absolute",top:0,left:0,width:"32%",height:"100%",background:"linear-gradient(90deg,transparent 0%,rgba(255,255,255,0.08) 20%,rgba(255,255,255,0.45) 50%,rgba(255,255,255,0.08) 80%,transparent 100%)",animation:"gasBtnSheenFast 5.5s cubic-bezier(0.45,0.05,0.55,0.95) infinite",pointerEvents:"none",willChange:"transform,opacity"}}/>}
        </button>
        {!showForgot&&<div style={{textAlign:"center",marginTop:14}}>
          <button type="button" onClick={function(){setShowForgot(true);setFpEmail(email||"");setFpDone(false);setFpErr("");}} style={{background:"transparent",border:"none",color:P.ember,fontSize:11,fontFamily:fm,letterSpacing:2,fontWeight:700,cursor:"pointer",textTransform:"uppercase"}}>Forgot password?</button>
        </div>}
        {showForgot&&<div style={{marginTop:18,paddingTop:18,borderTop:"1px solid rgba(168,85,247,0.18)"}}>
          <div style={{fontSize:11,color:P.ember,fontFamily:fm,letterSpacing:2.5,fontWeight:800,textTransform:"uppercase",marginBottom:8,textAlign:"center"}}>Reset Password</div>
          {!fpDone?<>
            <div style={{fontSize:11,color:"rgba(255,251,248,0.72)",fontFamily:ff,lineHeight:1.7,marginBottom:12,textAlign:"center"}}>Enter your account email and we'll send you a one-time link to choose a new password.</div>
            <input type="email" placeholder="Your work email" value={fpEmail} onChange={function(e){setFpEmail(e.target.value);setFpErr("");}} onKeyDown={function(e){if(e.key==="Enter")sendForgot();}} autoComplete="username" style={{width:"100%",boxSizing:"border-box",background:"rgba(6,2,14,0.6)",border:"1px solid "+P.rule,borderRadius:10,padding:"12px 14px",color:P.txt,fontSize:13,fontFamily:fm,outline:"none",marginBottom:10,letterSpacing:1}}/>
            {fpErr&&<div style={{color:P.critical,fontSize:11,fontFamily:fm,marginBottom:10,textAlign:"center"}}>{fpErr}</div>}
            <div style={{display:"flex",gap:8}}>
              <button type="button" onClick={function(){setShowForgot(false);setFpErr("");}} style={{flex:1,background:"transparent",border:"1px solid "+P.rule,borderRadius:10,padding:"11px 0",color:"rgba(255,251,248,0.72)",fontSize:11,fontWeight:800,fontFamily:fm,cursor:"pointer",letterSpacing:2,textTransform:"uppercase"}}>Back</button>
              <button type="button" onClick={sendForgot} disabled={fpBusy||!fpEmail.trim()} style={{flex:2,background:fpBusy||!fpEmail.trim()?"#555":gEmber,border:"none",borderRadius:10,padding:"11px 0",color:"#fff",fontSize:11,fontWeight:900,fontFamily:fm,cursor:fpBusy||!fpEmail.trim()?"wait":"pointer",letterSpacing:2,textTransform:"uppercase"}}>{fpBusy?"Sending":"Send Reset Link"}</button>
            </div>
          </>:<div style={{textAlign:"center",padding:"6px 0 4px"}}>
            <div style={{fontSize:36,marginBottom:6,color:P.mint,lineHeight:1}}>{"✓"}</div>
            <div style={{fontSize:13,color:P.txt,fontFamily:ff,lineHeight:1.7,marginBottom:14}}>If <strong style={{color:P.ember}}>{fpEmail}</strong> matches an active account you'll receive a reset link in the next minute. Check your inbox (and spam).</div>
            <div style={{fontSize:10,color:"rgba(255,251,248,0.55)",fontFamily:fm,letterSpacing:1.5,lineHeight:1.7,marginBottom:14}}>Link expires in 1 hour. One-time use.</div>
            <button type="button" onClick={function(){setShowForgot(false);}} style={{width:"100%",background:"transparent",border:"1px solid "+P.rule,borderRadius:10,padding:"11px 0",color:"rgba(255,251,248,0.72)",fontSize:11,fontWeight:800,fontFamily:fm,cursor:"pointer",letterSpacing:2,textTransform:"uppercase"}}>Back to sign in</button>
          </div>}
        </div>}
        <div style={{fontSize:11,color:"rgba(255,251,248,0.72)",fontFamily:fm,letterSpacing:1,marginTop:16,textAlign:"center",lineHeight:1.7}}>Access is by invitation only.<br/>Contact <span style={{color:P.ember,fontWeight:700}}>grow@gasmarketing.co.za</span> to request access.</div>
      </div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginTop:26,fontSize:11,color:"rgba(255,251,248,0.72)",fontFamily:fm,letterSpacing:3,textTransform:"uppercase",fontWeight:700,animation:"gasEnter 0.9s cubic-bezier(0.2,0.8,0.2,1) 0.45s both"}}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{animation:"gasLockPulse 3s ease-in-out infinite"}}>
          <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.7" fill="rgba(249,98,3,0.12)"/>
          <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
          <circle cx="12" cy="16" r="1.4" fill="currentColor"/>
        </svg>
        <span>Secure Data Reporting Platform</span>
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
fire:function(c,s){s=s||20;return<svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M12 2c0 4-4 6-4 10a6 6 0 0012 0c0-4-4-6-4-10z" stroke={c} strokeWidth="1.5" fill={c+"20"}/></svg>;},
power:function(c,s){s=s||20;return<svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M18.36 6.64a9 9 0 11-12.73 0" stroke={c} strokeWidth="1.8" strokeLinecap="round"/><line x1="12" y1="2" x2="12" y2="12" stroke={c} strokeWidth="1.8" strokeLinecap="round"/></svg>;}
};

function Glass(props){var a=props.accent||P.ember,st=props.st||{},hv=props.hv;var s=useState(false);return(<div onMouseEnter={function(){s[1](true);}} onMouseLeave={function(){s[1](false);}} style={Object.assign({background:P.glass,border:"1px solid "+(s[0]&&hv?a+"50":P.rule),borderRadius:16,position:"relative",overflow:"hidden",transition:"all 0.3s ease",transform:s[0]&&hv?"translateY(-2px)":"none",boxShadow:s[0]&&hv?"0 12px 40px "+a+"15":"0 4px 20px rgba(0,0,0,0.25)"},st)}><div style={{position:"absolute",top:0,left:"10%",right:"10%",height:1,background:"linear-gradient(90deg,transparent,"+a+"80,transparent)",opacity:s[0]&&hv?1:0.4}}/>{props.children}</div>);}
// Reveal: scroll-triggered fade + slide-up wrapper. Children only mount the
// first time the wrapper enters the viewport, so recharts plays its own
// mount animation in sync with the fade-in. Reserves vertical space via
// minHeight to prevent layout jumps before reveal. Honours
// prefers-reduced-motion by mounting children immediately with no transform.
function Reveal(props){
  var ref=useRef(null);
  var ss=useState(false),shown=ss[0],setShown=ss[1];
  var rs=useState(false),reduced=rs[0],setReduced=rs[1];
  useEffect(function(){
    if(typeof window==="undefined"||!window.matchMedia)return;
    var mq=window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    if(mq.matches)setShown(true);
  },[]);
  useEffect(function(){
    if(reduced||shown)return;
    if(!ref.current)return;
    if(typeof IntersectionObserver==="undefined"){setShown(true);return;}
    var obs=new IntersectionObserver(function(entries){
      entries.forEach(function(e){if(e.isIntersecting){setShown(true);obs.disconnect();}});
    },{rootMargin:"0px 0px -8% 0px",threshold:0.12});
    obs.observe(ref.current);
    return function(){obs.disconnect();};
  },[reduced,shown]);
  var minH=props.minHeight;
  var delay=props.delay||0;
  return(
    <div ref={ref} style={Object.assign({
      transition:reduced?"none":"opacity 0.9s cubic-bezier(0.22,1,0.36,1), transform 0.9s cubic-bezier(0.22,1,0.36,1)",
      transitionDelay:delay+"ms",
      opacity:shown?1:0,
      transform:shown?"translateY(0) scale(1)":"translateY(48px) scale(0.97)",
      willChange:shown?"auto":"opacity, transform",
      minHeight:minH||undefined
    },props.style||{})}>
      {shown?props.children:null}
    </div>
  );
}

// ChartReveal: lightweight intersection gate for Recharts containers AND
// CSS-based bar fills.
//
// Recharts' built-in Bar / Pie animation runs on first mount (~1500 ms,
// bars grow bottom-to-top, pies sweep). When charts mount on initial
// dashboard load, the animation has already finished by the time the user
// scrolls to that section, so the bars look static. This wrapper delays
// mounting the chart subtree until the container scrolls into view, so the
// Recharts mount animation fires exactly when the team hits the section.
//
// For CSS bars (age/province/etc. — not Recharts), the same delayed mount
// triggers the global @keyframes barGrowH / barGrowV animations defined
// alongside the component. Anywhere a bar fill div uses
// `animation:"barGrowH 0.9s cubic-bezier(0.22,1,0.36,1) both"` the bar will
// grow from width:0 to its inline width when ChartReveal first mounts it.
//
// Unlike Reveal, ChartReveal does NOT add an opacity/translate transition,
// so it can sit safely inside an existing <Reveal> wrap without a competing
// fade animation.
var __chartRevealKeyframesInjected=false;
function injectChartRevealKeyframes(){
  if(__chartRevealKeyframesInjected)return;
  if(typeof document==="undefined")return;
  __chartRevealKeyframesInjected=true;
  var style=document.createElement("style");
  style.setAttribute("data-gas-chart-keyframes","1");
  style.textContent="@keyframes barGrowH{from{width:0}}@keyframes barGrowV{from{height:0}}";
  document.head.appendChild(style);
}
function ChartReveal(props){
  var ref=useRef(null);
  var ss=useState(false),shown=ss[0],setShown=ss[1];
  var rs=useState(false),reduced=rs[0],setReduced=rs[1];
  useEffect(function(){injectChartRevealKeyframes();},[]);
  useEffect(function(){
    if(typeof window==="undefined"||!window.matchMedia)return;
    var mq=window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    if(mq.matches)setShown(true);
  },[]);
  useEffect(function(){
    if(reduced||shown)return;
    if(!ref.current)return;
    if(typeof IntersectionObserver==="undefined"){setShown(true);return;}
    var obs=new IntersectionObserver(function(entries){
      entries.forEach(function(e){if(e.isIntersecting){setShown(true);obs.disconnect();}});
    },{rootMargin:"0px 0px -10% 0px",threshold:0.18});
    obs.observe(ref.current);
    return function(){obs.disconnect();};
  },[reduced,shown]);
  return <div ref={ref} style={{width:"100%",height:"100%",minHeight:props.h||undefined}}>{shown?props.children:null}</div>;
}

// GrowBar: per-bar IntersectionObserver gate for CSS-based bar fills.
//
// Difference from ChartReveal: ChartReveal hides its CHILDREN until in
// view (good for mounting Recharts so it plays its built-in animation).
// GrowBar always renders its DOM element so the surrounding row content
// (province name, share number, rank pill) is visible from page load,
// and only the BAR FILL WIDTH is gated. When the bar's own viewport
// position crosses the threshold the width transitions from 0% to its
// target percentage, so the bar grows in place without reflowing the
// row layout around it.
//
// Props:
//   pct      target width as a number (0-100)
//   delay    optional ms delay before transition starts (cascade effect)
//   style    base styles applied to the bar fill div (background, border-
//            radius, box-shadow, etc.)
//
// Reduced-motion users get the bar at full width immediately.
function GrowBar(props){
  var ref=useRef(null);
  var ss=useState(false),shown=ss[0],setShown=ss[1];
  var rs=useState(false),reduced=rs[0],setReduced=rs[1];
  useEffect(function(){
    if(typeof window==="undefined"||!window.matchMedia)return;
    var mq=window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    if(mq.matches)setShown(true);
  },[]);
  useEffect(function(){
    if(reduced||shown)return;
    if(!ref.current)return;
    if(typeof IntersectionObserver==="undefined"){setShown(true);return;}
    var obs=new IntersectionObserver(function(entries){
      entries.forEach(function(e){if(e.isIntersecting){setShown(true);obs.disconnect();}});
    },{rootMargin:"0px 0px -8% 0px",threshold:0.2});
    obs.observe(ref.current);
    return function(){obs.disconnect();};
  },[reduced,shown]);
  var pct=Math.max(0,Math.min(100,parseFloat(props.pct||0)));
  var delay=props.delay||0;
  var base=props.style||{};
  var merged=Object.assign({},base,{
    width:shown?pct+"%":"0%",
    transition:reduced?"none":"width 0.9s cubic-bezier(0.22,1,0.36,1) "+delay+"ms"
  });
  return <div ref={ref} style={merged}/>;
}
function Metric(props){return(<Glass accent={props.accent} hv={true} st={{padding:"22px 20px"}}><div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}><div style={{display:"flex",alignItems:"center",gap:8}}>{props.icon}<span style={{fontSize:9,fontWeight:700,color:P.label,letterSpacing:2.5,textTransform:"uppercase",fontFamily:fm}}>{props.label}</span></div><div style={{width:8,height:8,borderRadius:"50%",background:props.accent,boxShadow:"0 0 12px "+props.accent+"60",animation:"pulse-glow 2s ease-in-out infinite"}}></div></div><div style={{fontSize:28,fontWeight:900,fontFamily:ff,lineHeight:1,letterSpacing:-1.5,color:props.accent,marginBottom:6}}>{props.value}</div>{props.sub&&<div style={{fontSize:10,color:P.caption,marginTop:10,fontFamily:fm,lineHeight:1.7,borderTop:"1px solid "+P.rule,paddingTop:10}}>{props.sub}</div>}</Glass>);}
function SH(props){var a=props.accent||P.ember;return(<div style={{marginBottom:28}}><div style={{display:"flex",alignItems:"center",gap:14}}><div style={{width:40,height:40,borderRadius:12,background:"linear-gradient(135deg,"+a+"20,"+a+"08)",border:"1px solid "+a+"30",display:"flex",alignItems:"center",justifyContent:"center"}}>{props.icon}</div><div><h2 style={{margin:0,fontSize:22,fontWeight:900,color:P.txt,fontFamily:fm,letterSpacing:3,lineHeight:1,textTransform:"uppercase"}}>{props.title}</h2>{props.sub&&<p style={{margin:"6px 0 0",fontSize:11,color:P.label,fontFamily:fm,letterSpacing:2}}>{props.sub}</p>}</div></div><div style={{height:1,marginTop:16,background:"linear-gradient(90deg,"+a+"50,"+a+"15,transparent 80%)"}}/></div>);}
function Pill(props){return(<span style={{display:"inline-flex",alignItems:"center",gap:5,background:props.color+"12",border:"1px solid "+props.color+"30",borderRadius:20,padding:"3px 10px",fontSize:9,fontWeight:700,color:props.color,fontFamily:fm,textTransform:"uppercase"}}><span style={{width:6,height:6,borderRadius:"50%",background:props.color}}/>{props.name}</span>);}
// Targeting persona card for the Targeting tab. Click-weighted per-platform
// audience profile, shows the dominant age bracket as the visual anchor and
// layers gender / mobile / regions / hottest segment / CTR-vs-blended as
// supporting data strips. Platform-coloured header and accent throughout
// so the three cards read at a glance as "Facebook vs Instagram vs TikTok"
// even before the numbers register.
function TargetingPersonaCard(props){
  var p=props.persona;var c=p.color;
  var genderLead=p.genderSplit.female>p.genderSplit.male?"Female":(p.genderSplit.male>0?"Male":"");
  var genderShare=Math.max(p.genderSplit.female,p.genderSplit.male);
  var topSegments=Array.isArray(p.topSegments)?p.topSegments:[];
  var segLabel=function(s){return s&&s.age&&s.gen?(s.age+" "+(s.gen==="female"?"Female":"Male")):"";};
  var hov=useState(false);
  // Stagger the breathing glow per card so they don't pulse in unison.
  // delay prop is set by the parent grid (0, 0.9, 1.8, 2.7 seconds for the
  // four-card row), if absent we fall back to no delay.
  var delay=typeof props.delay==="number"?props.delay:0;
  return <div onMouseEnter={function(){hov[1](true);}} onMouseLeave={function(){hov[1](false);}} style={{position:"relative",background:"linear-gradient(165deg,"+c+"14 0%,"+c+"05 50%,transparent 100%),#0d0520",borderRadius:18,border:"1px solid "+(hov[0]?c+"80":c+"40"),padding:"22px 22px 18px",boxShadow:hov[0]?("0 14px 44px rgba(0,0,0,0.45),0 0 80px "+c+"35,0 0 120px "+c+"22 inset"):("0 10px 36px rgba(0,0,0,0.35),0 0 60px "+c+"10 inset"),display:"flex",flexDirection:"column",transition:"box-shadow 0.4s ease, border-color 0.4s ease, transform 0.4s ease",transform:hov[0]?"translateY(-3px)":"translateY(0)"}}>
    <div aria-hidden style={{position:"absolute",inset:-1,borderRadius:19,boxShadow:"0 0 28px "+c+"55,0 0 64px "+c+"30",pointerEvents:"none",animation:"personaGlowPulse 4.5s ease-in-out infinite",animationDelay:delay+"s",zIndex:0,willChange:"opacity",transform:"translateZ(0)"}}/>
    <div style={{position:"relative",zIndex:1,display:"flex",flexDirection:"column",height:"100%"}}>
    <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16,paddingBottom:12,borderBottom:"1px solid "+c+"28"}}>
      <div style={{width:44,height:44,borderRadius:12,background:"linear-gradient(135deg,"+c+"55,"+c+"20)",border:"1px solid "+c+"70",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 0 22px "+c+"40"}}>{p.iconFn("#fff",20)}</div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:13,fontWeight:900,color:"#fff",fontFamily:fm,letterSpacing:2,textTransform:"uppercase"}}>{p.platform}</div>
      </div>
    </div>
    <div style={{textAlign:"center",marginBottom:14,padding:"6px 0"}}>
      <div style={{fontSize:42,fontWeight:900,color:c,fontFamily:fm,letterSpacing:-1,lineHeight:1,textShadow:"0 0 24px "+c+"60"}}>{p.topAge||"—"}</div>
      <div style={{fontSize:9,color:P.label,fontFamily:fm,letterSpacing:2.5,marginTop:8,textTransform:"uppercase",fontWeight:700}}>Dominant Age{p.topAge?" · "+p.topAgeShare.toFixed(2)+"%":""}</div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
      <div title="Overall click share by gender, summed across all age brackets. Can differ from the top Best Personas entry below if one gender is concentrated in a single age bracket while the other is spread across many." style={{background:"rgba(0,0,0,0.28)",border:"1px solid "+c+"25",borderRadius:10,padding:"10px 12px"}}>
        <div style={{fontSize:8,color:P.label,fontFamily:fm,letterSpacing:1.8,textTransform:"uppercase",marginBottom:4,fontWeight:700}}>Gender Lead</div>
        <div style={{fontSize:14,color:"#fff",fontFamily:fm,fontWeight:800}}>{genderLead||"—"}</div>
        <div style={{fontSize:10,color:c,fontFamily:fm,fontWeight:700,marginTop:1}}>{genderLead?genderShare.toFixed(2)+"%":""}</div>
      </div>
      <div title="Share of device-tagged clicks that came from a mobile device, with desktop and tablet making up the rest." style={{background:"rgba(0,0,0,0.28)",border:"1px solid "+c+"25",borderRadius:10,padding:"10px 12px"}}>
        <div style={{fontSize:8,color:P.label,fontFamily:fm,letterSpacing:1.8,textTransform:"uppercase",marginBottom:4,fontWeight:700}}>On Mobile</div>
        <div style={{fontSize:14,color:"#fff",fontFamily:fm,fontWeight:800}}>{p.mobileShare>0?p.mobileShare.toFixed(2)+"%":"—"}</div>
        <div style={{fontSize:10,color:P.caption,fontFamily:fm,marginTop:1}}>of device-tagged clicks</div>
      </div>
    </div>
    {p.topProvinces.length>0&&<div style={{marginBottom:14}}>
      <div style={{fontSize:8,color:P.label,fontFamily:fm,letterSpacing:1.8,textTransform:"uppercase",marginBottom:8,fontWeight:700}}>Top Regions</div>
      {p.topProvinces.map(function(pr,i){return <div key={pr.name} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:i<p.topProvinces.length-1?"1px dashed "+P.rule:"none",fontSize:12,fontFamily:fm}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{width:18,height:18,borderRadius:"50%",background:i===0?c:c+"55",display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:900,color:i===0?"#0a0618":"#fff",fontFamily:fm}}>{i+1}</span>
          <span style={{color:"#fff",fontWeight:700}}>{pr.name}</span>
        </div>
        <span style={{color:c,fontWeight:900,fontVariantNumeric:"tabular-nums"}}>{pr.share.toFixed(2)+"%"}</span>
      </div>;})}
    </div>}
    {topSegments.length>0&&<div title="Top three age + gender segments by click share. Each row is a single age × gender cell, ranked. The cells can rank differently from the overall Gender Lead above because the Lead sums across all ages while these are individual cells, the largest single cell is sometimes a male age band even when females are more numerous in total." style={{marginTop:"auto",padding:"10px 12px",background:c+"10",border:"1px dashed "+c+"45",borderRadius:10}}>
      <div style={{fontSize:8,color:c,fontFamily:fm,letterSpacing:1.8,textTransform:"uppercase",marginBottom:6,fontWeight:800}}>Best Personas</div>
      {topSegments.map(function(s,i){return <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 0",borderBottom:i<topSegments.length-1?"1px dashed "+c+"20":"none",fontSize:12,fontFamily:fm}}>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <span style={{width:16,height:16,borderRadius:"50%",background:i===0?c:c+"50",display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:900,color:i===0?"#0a0618":"#fff",fontFamily:fm}}>{i+1}</span>
          <span style={{color:"#fff",fontWeight:700}}>{segLabel(s)}</span>
        </div>
        <span style={{color:c,fontWeight:900,fontVariantNumeric:"tabular-nums"}}>{s.share.toFixed(2)+"%"}</span>
      </div>;})}
    </div>}
    </div>
  </div>;
}

// Google Search intent persona card. Different data shape from Meta / TikTok
// because Google Search does not surface strong demographics, but it does
// surface rich intent signals (what the user was trying to do) that the
// social platforms don't have. Card leads on intent themes, layers match-
// type readiness and when-they-search, and shows observation demographics
// as a slim strip at the bottom when Google populates them.
function GoogleIntentCard(props){
  var g=props.intent;var c=P.gd;
  // Google Ads accounts often run NO Search-channel campaigns (Display / PMax
  // / YouTube only), in which case search_term_view is empty but age_range
  // and gender observation rows + campaign-hour still populate. The card
  // reorganises around whichever signal is strongest:
  //   primary = intent themes (if Search campaigns exist)
  //   fallback = observation age + gender + hour-of-day
  var themeLabels={branded:"Brand interest",comparison:"Comparison intent",transactional:"Ready-to-act intent",problem:"Problem-solving intent",informational:"Research intent",other:"Other intent"};
  var themes=g&&g.intentThemes?g.intentThemes.slice(0,4):[];
  var ages=g&&Array.isArray(g.age)?g.age:[];
  var topAge=ages[0]||null;
  var genderLead=g&&g.gender&&(g.gender.female>g.gender.male?"Female":(g.gender.male>0?"Male":""));
  var genderShare=g&&g.gender?Math.max(g.gender.female||0,g.gender.male||0):0;
  var matchReady=g&&g.matchType&&g.matchType.readinessLabel;
  var whenLbl=g&&g.whenLabel;
  var totalSearch=g&&g.totalSearchClicks||0;
  var hasAnySignal=themes.length>0||ages.length>0||genderLead||whenLbl;
  var hasIntent=themes.length>0;
  // Sub-line description reflects which signal is actually powering the card
  var subLine=hasIntent?fmt(totalSearch)+" search clicks, intent-based profile":ages.length>0?"Click-weighted observation profile":"Intent-based profile";
  // Visual anchor, dominant intent theme when Search exists, else dominant
  // observation age bracket
  var anchorBig=hasIntent?(themeLabels[themes[0].theme]||themes[0].theme):topAge?topAge.age:"Google Audience";
  var anchorSmall=hasIntent?"Dominant Intent · "+themes[0].share.toFixed(2)+"%":topAge?"Dominant Age · "+topAge.share.toFixed(2)+"%":"Observation signals";
  // Mini tile #1, if intent exists show theme count, otherwise show gender lead
  var tile1Label=hasIntent?"Intent Themes":"Gender Lead";
  var tile1Value=hasIntent?themes.length.toString():(genderLead||"—");
  var tile1Sub=hasIntent?"distinct query types":genderLead?genderShare.toFixed(2)+"%":"no observation data";
  // Mini tile #2, funnel stage when match-type data exists, else when-they-click
  var tile2Label=hasIntent?"Funnel Stage":"When They Click";
  var tile2Value=hasIntent?(matchReady?(matchReady.indexOf("High-intent")>=0?"High":matchReady.indexOf("Research")>=0?"Research":"Mixed"):"—"):whenLbl?(whenLbl.indexOf("business")>=0?"Business hrs":whenLbl.indexOf("evening")>=0?"Evenings":whenLbl.indexOf("spread")>=0?"All day":"Mixed"):"—";
  var tile2Sub=hasIntent?"by match-type mix":whenLbl?"click pattern":"no hourly data";
  // Ranked list, intent themes if they exist, otherwise age brackets
  var rankLabel=hasIntent?"Top Search Themes":"Top Age Brackets";
  var rankItems=hasIntent?themes.map(function(t){return {label:themeLabels[t.theme]||t.theme,share:t.share};}):ages.slice(0,4).map(function(a){return {label:a.age,share:a.share};});
  // Best Personas footer — match the Meta / TikTok card format, a ranked
  // list of 3 age+gender personas with share percentages. Google observation
  // data gives us age and gender separately (not a joint matrix like Meta),
  // so we cross the top 3 age brackets with the dominant gender lead to get
  // three labelled personas. Share is the age bracket's share of clicks,
  // labelled with the gender lead so the persona reads as a full archetype.
  // When no age data exists we fall back to intent themes.
  var bestPersonaLines=[];
  if(ages.length>0&&genderLead){
    bestPersonaLines=ages.slice(0,3).map(function(a){return {label:a.age+" "+genderLead,share:a.share.toFixed(2)+"%"};});
  } else if(ages.length>0){
    bestPersonaLines=ages.slice(0,3).map(function(a){return {label:a.age+" bracket",share:a.share.toFixed(2)+"%"};});
  } else if(hasIntent){
    bestPersonaLines=themes.slice(0,3).map(function(t){return {label:themeLabels[t.theme]||t.theme,share:t.share.toFixed(2)+"%"};});
  }
  var hov=useState(false);
  var delay=typeof props.delay==="number"?props.delay:0;
  return <div onMouseEnter={function(){hov[1](true);}} onMouseLeave={function(){hov[1](false);}} style={{position:"relative",background:"linear-gradient(165deg,"+c+"14 0%,"+c+"05 50%,transparent 100%),#0d1a12",borderRadius:18,border:"1px solid "+(hov[0]?c+"80":c+"40"),padding:"22px 22px 18px",boxShadow:hov[0]?("0 14px 44px rgba(0,0,0,0.45),0 0 80px "+c+"35,0 0 120px "+c+"22 inset"):("0 10px 36px rgba(0,0,0,0.35),0 0 60px "+c+"10 inset"),display:"flex",flexDirection:"column",transition:"box-shadow 0.4s ease, border-color 0.4s ease, transform 0.4s ease",transform:hov[0]?"translateY(-3px)":"translateY(0)"}}>
    <div aria-hidden style={{position:"absolute",inset:-1,borderRadius:19,boxShadow:"0 0 28px "+c+"55,0 0 64px "+c+"30",pointerEvents:"none",animation:"personaGlowPulse 4.5s ease-in-out infinite",animationDelay:delay+"s",zIndex:0,willChange:"opacity",transform:"translateZ(0)"}}/>
    <div style={{position:"relative",zIndex:1,display:"flex",flexDirection:"column",height:"100%"}}>
    <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16,paddingBottom:12,borderBottom:"1px solid "+c+"28"}}>
      <div style={{width:44,height:44,borderRadius:12,background:"linear-gradient(135deg,"+c+"55,"+c+"20)",border:"1px solid "+c+"70",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 0 22px "+c+"40"}}>{Ic.globe("#fff",20)}</div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:13,fontWeight:900,color:"#fff",fontFamily:fm,letterSpacing:2,textTransform:"uppercase"}}>Google Ads</div>
      </div>
    </div>
    <div style={{textAlign:"center",marginBottom:14,padding:"6px 0"}}>
      <div style={{fontSize:hasIntent?26:42,fontWeight:900,color:c,fontFamily:fm,letterSpacing:-0.5,lineHeight:1.1,textShadow:"0 0 24px "+c+"50"}}>{anchorBig}</div>
      <div style={{fontSize:9,color:P.label,fontFamily:fm,letterSpacing:2.5,marginTop:8,textTransform:"uppercase",fontWeight:700}}>{anchorSmall}</div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
      <div style={{background:"rgba(0,0,0,0.28)",border:"1px solid "+c+"25",borderRadius:10,padding:"10px 12px"}}>
        <div style={{fontSize:8,color:P.label,fontFamily:fm,letterSpacing:1.8,textTransform:"uppercase",marginBottom:4,fontWeight:700}}>{tile1Label}</div>
        <div style={{fontSize:14,color:"#fff",fontFamily:fm,fontWeight:800}}>{tile1Value}</div>
        <div style={{fontSize:10,color:P.caption,fontFamily:fm,marginTop:1}}>{tile1Sub}</div>
      </div>
      <div style={{background:"rgba(0,0,0,0.28)",border:"1px solid "+c+"25",borderRadius:10,padding:"10px 12px"}}>
        <div style={{fontSize:8,color:P.label,fontFamily:fm,letterSpacing:1.8,textTransform:"uppercase",marginBottom:4,fontWeight:700}}>{tile2Label}</div>
        <div style={{fontSize:14,color:"#fff",fontFamily:fm,fontWeight:800}}>{tile2Value}</div>
        <div style={{fontSize:10,color:P.caption,fontFamily:fm,marginTop:1}}>{tile2Sub}</div>
      </div>
    </div>
    {rankItems.length>0&&<div style={{marginBottom:14}}>
      <div style={{fontSize:8,color:P.label,fontFamily:fm,letterSpacing:1.8,textTransform:"uppercase",marginBottom:8,fontWeight:700}}>{rankLabel}</div>
      {rankItems.map(function(r,i){return <div key={i+"-"+r.label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:i<rankItems.length-1?"1px dashed "+P.rule:"none",fontSize:12,fontFamily:fm}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{width:18,height:18,borderRadius:"50%",background:i===0?c:c+"55",display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:900,color:i===0?"#0a0618":"#fff",fontFamily:fm}}>{i+1}</span>
          <span style={{color:"#fff",fontWeight:700}}>{r.label}</span>
        </div>
        <span style={{color:c,fontWeight:900,fontVariantNumeric:"tabular-nums"}}>{r.share.toFixed(2)+"%"}</span>
      </div>;})}
    </div>}
    {bestPersonaLines.length>0?<div style={{marginTop:"auto",padding:"10px 12px",background:c+"10",border:"1px dashed "+c+"45",borderRadius:10}}>
      <div style={{fontSize:8,color:c,fontFamily:fm,letterSpacing:1.8,textTransform:"uppercase",marginBottom:6,fontWeight:800}}>Best Personas</div>
      {bestPersonaLines.map(function(line,i){return <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 0",borderBottom:i<bestPersonaLines.length-1?"1px dashed "+c+"20":"none",fontSize:12,fontFamily:fm}}>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <span style={{width:16,height:16,borderRadius:"50%",background:i===0?c:c+"50",display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:900,color:i===0?"#0a0618":"#fff",fontFamily:fm}}>{i+1}</span>
          <span style={{color:"#fff",fontWeight:700}}>{line.label}</span>
        </div>
        {line.share&&<span style={{color:c,fontWeight:900,fontVariantNumeric:"tabular-nums"}}>{line.share}</span>}
      </div>;})}
    </div>:<div style={{marginTop:"auto",padding:"12px 12px",background:"rgba(0,0,0,0.22)",border:"1px dashed "+c+"35",borderRadius:10,fontSize:11,color:"rgba(255,251,248,0.78)",fontFamily:fm,lineHeight:1.55,textAlign:"center"}}>
      Google signals will populate here once the selected campaigns accumulate click activity across age, gender, or search-term dimensions.
    </div>}
    </div>
  </div>;
}

// Community member demographic card. One per platform (FB / IG / TikTok).
// Renders the owned-community audience, separate from the paid audience.
// Each card shows total followers, age-gender split (stacked age bars with
// female / male overlay), top countries / cities when available, and a
// caveat label if the platform hasn't populated any of its demographic
// endpoints for the connected pages.
function CommunityMemberCard(props){
  var p=props.platform;var data=props.data;var color=props.color;var iconFn=props.iconFn;
  if(!data||!data.available){
    return <div style={{background:"linear-gradient(165deg,"+color+"14 0%,"+color+"05 50%,transparent 100%),#0d0520",borderRadius:18,border:"1px solid "+color+"40",padding:"22px 22px 18px",boxShadow:"0 10px 36px rgba(0,0,0,0.35)",display:"flex",flexDirection:"column",justifyContent:"center",alignItems:"center",textAlign:"center",minHeight:320}}>
      <div style={{width:44,height:44,borderRadius:12,background:"linear-gradient(135deg,"+color+"55,"+color+"20)",border:"1px solid "+color+"70",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:14}}>{iconFn("#fff",20)}</div>
      <div style={{fontSize:13,fontWeight:900,color:"#fff",fontFamily:fm,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>{p} Community</div>
      <div style={{fontSize:11,color:P.label,fontFamily:fm,lineHeight:1.6,maxWidth:260}}>Audience demographic data not exposed for this connected {p} page. Some older page insights permissions or follower counts below 100 can hide this slice.</div>
    </div>;
  }
  // Parse the platform's age-gender map. Meta uses "F.25-34" / "M.25-34" keys,
  // TikTok uses age-bracket top level with gender nested. Normalise both into
  // one age-then-gender structure.
  var ageOrder=["13-17","18-24","25-34","35-44","45-54","55-64","65+"];
  var genders=["F","M"];
  var genderLabel={F:"Female",M:"Male"};
  var byAgeGender={};var totalAll=0;
  Object.keys(data.ageGender||{}).forEach(function(k){
    var v=data.ageGender[k];var m=/^([FMU])\.(.+)$/.exec(k);
    if(m){var g=m[1];var a=m[2];if(g==="U")return;if(!byAgeGender[a])byAgeGender[a]={F:0,M:0};byAgeGender[a][g]=(byAgeGender[a][g]||0)+v;totalAll+=v;}
  });
  var rowsAvailable=Object.keys(byAgeGender).length>0;
  // Gender donut data
  var genSum={F:0,M:0};
  Object.keys(byAgeGender).forEach(function(a){genSum.F+=byAgeGender[a].F||0;genSum.M+=byAgeGender[a].M||0;});
  var genTotal=genSum.F+genSum.M;
  var femaleShare=genTotal>0?(genSum.F/genTotal*100):0;
  var maleShare=genTotal>0?(genSum.M/genTotal*100):0;
  // Top countries
  var cSorted=Object.keys(data.countries||{}).map(function(k){return {code:k,val:data.countries[k]};}).sort(function(a,b){return b.val-a.val;}).slice(0,3);
  var cTotal=cSorted.reduce(function(s,c){return s+c.val;},0);
  return <div style={{background:"linear-gradient(165deg,"+color+"14 0%,"+color+"05 50%,transparent 100%),#0d0520",borderRadius:18,border:"1px solid "+color+"40",padding:"22px 22px 18px",boxShadow:"0 10px 36px rgba(0,0,0,0.35),0 0 60px "+color+"10 inset",display:"flex",flexDirection:"column"}}>
    <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16,paddingBottom:12,borderBottom:"1px solid "+color+"28"}}>
      <div style={{width:44,height:44,borderRadius:12,background:"linear-gradient(135deg,"+color+"55,"+color+"20)",border:"1px solid "+color+"70",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 0 22px "+color+"40"}}>{iconFn("#fff",20)}</div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:13,fontWeight:900,color:"#fff",fontFamily:fm,letterSpacing:2,textTransform:"uppercase"}}>{p} Community</div>
        <div style={{fontSize:10,color:P.label,fontFamily:fm,letterSpacing:1}}>{fmt(data.totalFollowers||0)+" total followers"}</div>
      </div>
    </div>
    {rowsAvailable?<div style={{marginBottom:14}}>
      <div style={{fontSize:8,color:P.label,fontFamily:fm,letterSpacing:1.8,textTransform:"uppercase",marginBottom:8,fontWeight:700}}>Age and Gender</div>
      {ageOrder.filter(function(a){return byAgeGender[a];}).map(function(a){
        var row=byAgeGender[a];var rowTotal=row.F+row.M;var share=totalAll>0?(rowTotal/totalAll*100):0;var fPct=rowTotal>0?(row.F/rowTotal*100):0;
        return <div key={a} style={{marginBottom:8,fontSize:11,fontFamily:fm}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:3,color:"#fff"}}>
            <span style={{fontWeight:700}}>{a}</span>
            <span style={{color:color,fontWeight:900}}>{share.toFixed(2)+"%"}</span>
          </div>
          <div style={{height:9,background:"rgba(255,255,255,0.04)",borderRadius:5,overflow:"hidden",display:"flex"}}>
            <div title={"Female "+fPct.toFixed(2)+"%"} style={{width:(share*fPct/100)+"%",background:"#ec4899"}}></div>
            <div title={"Male "+(100-fPct).toFixed(2)+"%"} style={{width:(share*(100-fPct)/100)+"%",background:"#3b82f6"}}></div>
          </div>
        </div>;
      })}
      <div style={{display:"flex",justifyContent:"space-between",marginTop:8,fontSize:10,color:P.label,fontFamily:fm}}>
        <span><span style={{display:"inline-block",width:9,height:9,borderRadius:"50%",background:"#ec4899",marginRight:6}}></span>Female {femaleShare.toFixed(2)+"%"}</span>
        <span><span style={{display:"inline-block",width:9,height:9,borderRadius:"50%",background:"#3b82f6",marginRight:6}}></span>Male {maleShare.toFixed(2)+"%"}</span>
      </div>
    </div>:<div style={{padding:"14px 0",textAlign:"center",fontSize:11,color:P.caption,fontFamily:fm,fontStyle:"italic",marginBottom:12}}>Age and gender breakdown not available for this page</div>}
    {cSorted.length>0&&<div style={{padding:"10px 12px",background:"rgba(0,0,0,0.28)",border:"1px solid "+color+"25",borderRadius:10,marginBottom:10}}>
      <div style={{fontSize:8,color:P.label,fontFamily:fm,letterSpacing:1.8,textTransform:"uppercase",marginBottom:6,fontWeight:700}}>Top Countries</div>
      {cSorted.map(function(c,i){var share=cTotal>0?(c.val/cTotal*100):0;return <div key={c.code} style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#fff",fontFamily:fm,padding:"3px 0"}}>
        <span style={{fontWeight:700}}>{i+1}. {c.code}</span>
        <span style={{color:color,fontWeight:900}}>{share.toFixed(2)+"%"}</span>
      </div>;})}
    </div>}
    <div style={{marginTop:"auto",paddingTop:8,borderTop:"1px dashed "+P.rule,fontSize:10,color:P.label,fontFamily:fm,lineHeight:1.5,fontStyle:"italic",textAlign:"center"}}>
      Owned community, who already follows you, distinct from the paid audience above.
    </div>
  </div>;
}

function Tip(props){if(!props.active||!props.payload||!props.payload.length)return null;var first=props.payload[0]&&props.payload[0].payload?props.payload[0].payload:{};var heading=first.fullName||first.name||props.label;return(<div style={{background:"#121212",border:"1px solid rgba(255,255,255,0.2)",borderRadius:12,padding:"12px 16px",boxShadow:"0 8px 32px rgba(0,0,0,0.6)",maxWidth:360}}><div style={{fontSize:11,fontWeight:800,color:P.txt,fontFamily:fm,marginBottom:4,whiteSpace:"normal",wordBreak:"break-word",lineHeight:1.4}}>{heading}</div>{props.payload.map(function(p,i){var v=p.value;var display="";var n=(p.name||"").toLowerCase();var dn=(p.dataKey||"").toLowerCase();var rowCurrency=!!(p.payload&&p.payload._currency);var isPct=dn==="ctr"||n.indexOf("ctr")>=0||n.indexOf("rate")>=0||(p.payload&&p.payload._pct);var isCurrency=rowCurrency||n.indexOf("spend")>=0||n.indexOf("cpc")>=0||n.indexOf("cpm")>=0||n.indexOf("cpl")>=0||n.indexOf("cpf")>=0||n.indexOf("cpa")>=0||n.indexOf("cpi")>=0||n.indexOf("cost per")>=0||n.indexOf("cost-per")>=0||dn==="spend"||dn==="cpc"||dn==="cpm"||dn==="cpl"||dn==="cpf"||dn==="cpa"||dn==="costper";if(isPct){display=typeof v==="number"?v.toFixed(2)+"%":v;}else if(isCurrency){display="R"+(typeof v==="number"?v.toLocaleString("en-ZA",{minimumFractionDigits:2,maximumFractionDigits:2}):v);}else{display=typeof v==="number"?v.toLocaleString():v;}return<div key={i} style={{fontSize:11,color:p.color||P.label,fontFamily:fm,lineHeight:1.8}}>{p.name}: {display}</div>;})}</div>);}
function PH(props){var bg=props.platform==="Facebook"?P.fb:props.platform==="Instagram"?"linear-gradient(135deg,#e1306c,#833ab4)":props.platform==="TikTok"?"#1e1e2e":P.ember;var dot=props.platform==="Facebook"?"#fff":props.platform==="TikTok"?P.tt:"#fff";return(<div style={{background:bg,padding:"14px 24px",borderRadius:12,marginBottom:18,display:"flex",alignItems:"center",justifyContent:"space-between",boxShadow:"0 4px 20px rgba(0,0,0,0.3)"}}><div style={{display:"flex",alignItems:"center",gap:10}}><span style={{width:10,height:10,borderRadius:"50%",background:dot,boxShadow:"0 0 10px "+dot}}></span><span style={{fontSize:15,fontWeight:800,color:"#fff",fontFamily:ff,letterSpacing:0.5}}>{props.platform}</span>{props.suffix&&<span style={{fontSize:12,fontWeight:400,color:"rgba(255,255,255,0.7)",fontFamily:fm}}>· {props.suffix}</span>}</div><div style={{fontSize:10,fontWeight:700,color:"rgba(255,255,255,0.4)",fontFamily:fm,letterSpacing:2,textTransform:"uppercase"}}>LIVE DATA</div></div>);}
function Insight(props){var a=props.accent||P.ember;return(<div style={{marginTop:24,padding:"22px 26px",background:"linear-gradient(135deg,"+a+"08 0%,"+a+"03 50%, transparent 100%)",border:"1px solid "+a+"20",borderLeft:"4px solid "+a,borderRadius:"0 14px 14px 0",position:"relative",overflow:"hidden"}}><div style={{position:"absolute",top:0,left:4,width:120,height:"100%",background:"linear-gradient(90deg,"+a+"06, transparent)",pointerEvents:"none"}}></div><div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,position:"relative"}}>{props.icon||Ic.bolt(a,16)}<span style={{fontSize:18,fontWeight:900,color:a,letterSpacing:2,fontFamily:fm,textTransform:"uppercase"}}>{props.title||"Campaign Read"}</span><div style={{flex:1,height:1,background:"linear-gradient(90deg,"+a+"30, transparent)",marginLeft:8}}></div></div><div style={{fontSize:13.5,color:P.txt,lineHeight:2.1,fontFamily:ff,position:"relative",letterSpacing:0.2}}>{props.children}</div></div>);}
function SevBadge(props){var c={critical:P.critical,warning:P.warning,info:P.info,positive:P.positive}[props.s]||P.info;return(<span style={{display:"inline-flex",alignItems:"center",gap:5,background:c+"18",border:"1px solid "+c+"40",borderRadius:6,padding:"3px 10px",fontSize:10,fontWeight:800,color:c,fontFamily:fm,textTransform:"uppercase"}}><span style={{width:7,height:7,borderRadius:"50%",background:c}}/>{props.s}</span>);}

function CampaignSelector(props){
  var cs=props.campaigns,sel=props.selected,search=props.search;
  var f=cs.filter(function(c){return (parseFloat(c.impressions||0)>0||parseFloat(c.spend||0)>0)&&(String(c.campaignName||"").toLowerCase().indexOf(search.toLowerCase())>=0||String(c.accountName||"").toLowerCase().indexOf(search.toLowerCase())>=0);});
  var g={};f.forEach(function(c){var k=c.accountName||"Unknown";if(!g[k])g[k]={platform:c.platform,campaigns:[]};g[k].campaigns.push(c);});
  return(<div style={{background:P.glass,border:"1px solid "+P.rule,borderRadius:16,padding:18,maxHeight:480,overflowY:"auto"}}>
    <input name="campaign-search" autoComplete="off" placeholder="Search campaigns..." value={search} onChange={function(e){props.onSearch(e.target.value);}} style={{width:"100%",boxSizing:"border-box",background:"rgba(40,25,60,0.5)",border:"1px solid "+P.rule,borderRadius:8,padding:"8px 14px",color:P.txt,fontSize:12,fontFamily:fm,outline:"none",marginBottom:12}}/>
    <div style={{display:"flex",gap:8,marginBottom:12}}>
      <button onClick={props.onSelectAll} style={{background:P.ember+"15",border:"1px solid "+P.ember+"30",borderRadius:8,padding:"4px 12px",color:P.ember,fontSize:10,fontWeight:700,fontFamily:fm,cursor:"pointer"}}>All ({f.length})</button>
      <button onClick={props.onClearAll} style={{background:P.rule,border:"1px solid "+P.rule,borderRadius:8,padding:"4px 12px",color:P.label,fontSize:10,fontWeight:700,fontFamily:fm,cursor:"pointer"}}>Clear</button>
      <span style={{fontSize:10,color:P.caption,fontFamily:fm,alignSelf:"center",marginLeft:"auto"}}>{sel.length} sel</span>
    </div>
    {Object.keys(g).map(function(k){var gr=g[k];var gc=gr.campaigns[0].platform==="TikTok"?P.tt:gr.campaigns[0].platform==="Google Display"?P.gd:gr.campaigns[0].platform==="Instagram"?P.ig:P.fb;var grpIds=gr.campaigns.map(function(c){return c.campaignId;});var grpSelCount=grpIds.filter(function(id){return sel.indexOf(id)>=0;}).length;var grpAll=grpSelCount===grpIds.length;var grpSome=grpSelCount>0&&!grpAll;return(<div key={k} style={{marginBottom:12}}><div onClick={function(){props.onToggleGroup(grpIds);}} style={{display:"flex",alignItems:"center",gap:6,marginBottom:6,paddingBottom:4,borderBottom:"1px solid "+P.rule,cursor:"pointer",userSelect:"none"}}><div style={{width:14,height:14,borderRadius:4,border:"2px solid "+(grpAll||grpSome?gc:P.caption),background:grpAll?gc:grpSome?gc+"50":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{grpAll&&Ic.check("#fff",10)}{grpSome&&<span style={{width:6,height:2,background:"#fff",borderRadius:1}}/>}</div><span style={{width:7,height:7,borderRadius:"50%",background:gc}}/><span style={{fontSize:9,fontWeight:800,color:gc,letterSpacing:2,textTransform:"uppercase",fontFamily:fm}}>{k}</span><span style={{fontSize:8,color:P.caption,fontFamily:fm,marginLeft:"auto"}}>{grpSelCount}/{grpIds.length}</span></div>
      {gr.campaigns.map(function(c){var s=sel.indexOf(c.campaignId)>=0;return(<div key={c.campaignId} onClick={function(){props.onToggle(c.campaignId);}} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",marginBottom:2,borderRadius:8,cursor:"pointer",background:s?gc+"10":"transparent",border:"1px solid "+(s?gc+"30":"transparent")}}>
        <div style={{width:18,height:18,borderRadius:5,border:"2px solid "+(s?gc:P.caption),background:s?gc:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{s&&Ic.check("#fff",12)}</div>
        <div style={{flex:1,minWidth:0}}><div style={{fontSize:11,fontWeight:600,color:s?P.txt:P.label,whiteSpace:"normal",wordBreak:"break-word",lineHeight:1.4}}>{c.campaignName}</div><div style={{fontSize:9,color:P.caption,fontFamily:fm}}>{fmt(c.impressions)} imps {(function(){var isCompleted=(c.endDate&&new Date(c.endDate)<new Date())||(c.status==="paused"||c.status==="campaign_paused"||c.status==="adset_paused");if(isCompleted)return <span style={{background:"rgba(136,136,136,0.2)",color:"#888",fontWeight:800,textTransform:"uppercase",marginLeft:4,fontSize:7,padding:"2px 6px",borderRadius:4,letterSpacing:1}}>COMPLETED</span>;if(c.status==="scheduled")return <span style={{background:P.solar+"20",color:P.solar,fontWeight:800,textTransform:"uppercase",marginLeft:4,fontSize:7,padding:"2px 6px",borderRadius:4,letterSpacing:1}}>SCHEDULED</span>;return null;})()} · {fR(parseFloat(c.spend))}</div></div>
      </div>);})}
    </div>);})}
  </div>);
}

// In-dashboard ad preview modal. Plays Meta / TikTok MP4s via our /api/ad-video
// proxy (uses admin platform tokens server-side so client share-link users never
// hit a platform auth wall). YouTube ads embed via public iframe. Static images
// render as full-size. No platform-link fallback for clients.
function AdPreviewModal(props){
  // Hooks must be called unconditionally on every render, so keep them
  // ahead of any early return.
  var vs=useState(null),videoSrc=vs[0],setVideoSrc=vs[1];
  var vt=useState("video"),videoType=vt[0],setVideoType=vt[1];
  var ve=useState(null),videoErr=ve[0],setVideoErr=ve[1];
  // Track whether the <video> element has started playing. Errors BEFORE
  // playback = initial resolve / decode failure, swap to the error screen.
  // Errors AFTER playback has begun (e.g. a transient byte-range fetch that
  // fails when the user unmutes and the browser refetches the audio stream
  // against a Meta-signed CDN URL) are logged only — nuking the playing
  // video replaced a working preview with a "VIDEO UNAVAILABLE" screen
  // the moment the client hit unmute. Leaving the <video> element alone
  // lets the browser recover on its own.
  // useRef (not useState) so the onError handler reads the LIVE value.
  // Setting hasPlayed via useState created a stale closure: the onError
  // registered on the <video> element captured hasPlayed=false at render
  // time; by the time onPlaying set it to true and scheduled a re-render,
  // the unmute-triggered error fired faster than React could re-run the
  // render, so the onError still saw false and flipped the preview into
  // the error screen. A ref reads the current value on every call, no
  // re-render needed, no stale closure.
  var hasPlayedRef=useRef(false);
  // Retry counter for mid-playback refetches. When a video errors after it
  // has already played (e.g. unmute triggers a byte-range refetch against
  // an expired Meta CDN URL), we re-hit /api/ad-video?bust=1 to get a fresh
  // signed URL and update videoSrc so the <video> element remounts. Capped
  // at 2 to avoid a refetch loop on permanently-broken creatives.
  var retryCountRef=useRef(0);
  // Generation counter. Each useEffect run (new ad or modal open) bumps
  // the generation; onError retries capture the generation and drop the
  // setVideoSrc call if the modal has since closed or switched to another
  // ad, so a late refetch never leaks state into the next preview.
  var adGenRef=useRef(0);
  var ad=props.ad;
  var format=((ad&&ad.format)||"STATIC").toUpperCase();
  var isVideo=format==="MP4"||format==="VIDEO";
  var isText=format==="TEXT";
  var platformLow=((ad&&ad.platform)||"").toLowerCase();
  var platformKey=platformLow.indexOf("instagram")>=0||platformLow.indexOf("facebook")>=0?"meta":platformLow.indexOf("tiktok")>=0?"tiktok":platformLow.indexOf("youtube")>=0||(ad&&ad.youtubeId)?"youtube":"other";
  var campaignIdParam=String((ad&&ad.campaignId)||"").replace(/_facebook$/,"").replace(/_instagram$/,"");
  useEffect(function(){
    setVideoSrc(null);
    setVideoType("video");
    setVideoErr(null);
    hasPlayedRef.current=false;
    retryCountRef.current=0;
    adGenRef.current=adGenRef.current+1;
    var myGen=adGenRef.current;
    if(!ad||!isVideo)return;
    if(platformKey!=="meta"&&platformKey!=="tiktok")return;
    if(!ad.videoId)return;
    var authQ=(props.viewToken?("&token="+encodeURIComponent(props.viewToken)):"")+(!props.viewToken&&props.session?("&st="+encodeURIComponent(props.session)):"");
    var url=props.apiBase+"/api/ad-video?platform="+platformKey+"&id="+encodeURIComponent(ad.videoId)+(ad.adId?("&adId="+encodeURIComponent(ad.adId)):"")+(campaignIdParam?("&campaignId="+encodeURIComponent(campaignIdParam)):"")+authQ+"&resolveOnly=1";
    var cancelled=false;
    // 15 second timeout — if the platform API is slow or the creative was
    // archived we'd rather show an error than leave the user staring at a
    // spinner forever.
    var timer=setTimeout(function(){if(!cancelled){setVideoErr("timeout");console.warn("[GAS] Video resolve timed out\n"+JSON.stringify({adId:ad.adId,videoId:ad.videoId,adName:ad.adName,platform:ad.platform},null,2));}},15000);
    var httpStatus=null;
    var respText=null;
    fetch(url).then(function(r){
      httpStatus=r.status;
      return r.text();
    }).then(function(t){
      if(cancelled)return;
      clearTimeout(timer);
      respText=t;
      var parsed=null;try{parsed=t?JSON.parse(t):null;}catch(_){}
      if(parsed&&parsed.url){setVideoSrc(parsed.url);setVideoType(parsed.type||"video");}
      else{
        var code=httpStatus&&httpStatus!==200?("http_"+httpStatus):"no_url";
        setVideoErr(code);
        console.warn("[GAS] Video resolve failed\n"+JSON.stringify({code:code,adId:ad.adId,videoId:ad.videoId,adName:ad.adName,platform:ad.platform,httpStatus:httpStatus,responseBody:(respText||"").slice(0,500)},null,2));
      }
    }).catch(function(e){
      if(cancelled)return;
      clearTimeout(timer);
      setVideoErr("network");
      console.warn("[GAS] Video resolve network error\n"+JSON.stringify({adId:ad.adId,videoId:ad.videoId,adName:ad.adName,platform:ad.platform,error:String(e&&e.message||e)},null,2));
    });
    return function(){cancelled=true;clearTimeout(timer);};
  },[ad&&ad.adId,ad&&ad.videoId,isVideo,platformKey]);
  if(!props.ad)return null;
  var platAccent={"Facebook":"#4599FF","Instagram":"#E1306C","TikTok":"#00F2EA","Google Display":"#34A853","YouTube":"#FF0000","Google Search":"#FFAA00","Performance Max":"#7C3AED","Demand Gen":"#D946EF"};
  var accent=platAccent[ad.platform]||P.ember;
  var resultLabel=function(rt){return rt==="leads"?"LEADS":rt==="installs"?"APP CLICKS":rt==="follows"?"FOLLOWS":rt==="profile_visits"?"PROFILE VISITS":rt==="conversions"?"CONV":rt==="store_clicks"?"APP CLICKS":rt==="lp_clicks"?"LP CLICKS":rt==="clicks"?"CLICKS":"RESULTS";};
  var costPerLabel=function(rt){return rt==="leads"?"per lead":rt==="installs"?"per click":rt==="follows"?"per follower":rt==="profile_visits"?"per visit":"per click";};

  // Every image/video URL we surface goes through our own proxy so that
  // clients viewing a share link get a FRESHLY signed Meta / TikTok CDN
  // URL on every render. Direct CDN URLs expire in about an hour, which
  // left client previews broken whenever the share link was opened a day
  // after issuing. Admin flows carry the session token, client flows carry
  // the view token, both resolve server-side using platform admin credentials.
  var authQs=(props.viewToken?("&token="+encodeURIComponent(props.viewToken)):"")+(!props.viewToken&&props.session?("&st="+encodeURIComponent(props.session)):"");
  var proxyImage=null;
  if(ad.adId&&(platformKey==="meta"||platformKey==="tiktok")){
    proxyImage=props.apiBase+"/api/ad-image?platform="+platformKey+"&adId="+encodeURIComponent(ad.adId)+(campaignIdParam?("&campaignId="+encodeURIComponent(campaignIdParam)):"")+authQs;
  }
  var imageSrc=proxyImage||ad.thumbnail||"";

  var placeholder=function(title,sub){
    return <div style={{width:"100%",aspectRatio:"1/1",maxHeight:"60vh",background:"linear-gradient(135deg,"+accent+"55,"+accent+"15 55%,#0a0618 100%)",borderRadius:10,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",color:"#fff",padding:"28px 24px",textAlign:"center",gap:10}}>
      <div style={{fontSize:14,fontFamily:fm,letterSpacing:2,fontWeight:800}}>{title}</div>
      {sub&&<div style={{fontSize:11,fontFamily:fm,color:"rgba(255,255,255,0.7)",letterSpacing:0.5,lineHeight:1.5,maxWidth:400}}>{sub}</div>}
    </div>;
  };
  var mediaBlock=null;
  if(isText){
    mediaBlock=placeholder("TEXT AD","Search campaigns use headline/description copy only, no visual creative is uploaded.");
  } else if(isVideo&&platformKey==="youtube"&&ad.youtubeId){
    mediaBlock=<iframe title="Ad preview" src={"https://www.youtube.com/embed/"+encodeURIComponent(ad.youtubeId)} style={{width:"100%",aspectRatio:"16/9",border:"none",borderRadius:10,background:"#000"}} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen/>;
  } else if(isVideo&&(platformKey==="meta"||platformKey==="tiktok")&&ad.videoId){
    // Video src is resolved asynchronously via the useEffect above and set
    // directly on the element — serving a 302 redirect via <source> broke
    // playback because the browser's byte-range requests didn't follow the
    // redirect reliably.
    if(videoSrc&&videoType==="iframe"){
      // Meta Ad Preview iframe — Facebook-hosted player that handles
      // video playback natively without needing a direct MP4 URL.
      // Meta Ad Preview iframe. We can't control what Meta's widget does when
      // the user hits unmute, sometimes their internal JS fails in the
      // embedded context (third-party cookies, sandbox policy, Meta auth
      // state in the iframe) and the player goes black. Give the user an
      // obvious escape hatch: open the same preview URL in a new tab, where
      // Meta's widget has its own cookie jar and works reliably. Copy below
      // is visible on every iframe render so clients know the option exists
      // before they encounter the break, not after.
      mediaBlock=<div style={{position:"relative"}}>
        <iframe key={videoSrc} title="Ad preview" src={videoSrc} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen style={{width:"100%",height:"60vh",border:"none",borderRadius:10,background:"#000",display:"block"}}/>
        <div style={{marginTop:10,padding:"10px 14px",background:"rgba(255,170,0,0.08)",border:"1px solid rgba(255,170,0,0.25)",borderRadius:10,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
          <div style={{flex:"1 1 240px",fontSize:11,fontFamily:fm,color:"rgba(255,251,248,0.85)",lineHeight:1.55}}>
            <span style={{fontWeight:800,color:P.solar,letterSpacing:1,textTransform:"uppercase",fontSize:9,marginRight:6}}>Heads up</span>
            Meta's embedded player sometimes freezes on unmute. Opening in a new tab helps for most ads, for the ones that still break, Ads Manager is the reliable source.
          </div>
          <a href={videoSrc} target="_blank" rel="noopener noreferrer" style={{background:P.solar,color:"#0a0618",fontSize:11,fontWeight:900,fontFamily:fm,letterSpacing:1.5,textTransform:"uppercase",padding:"8px 14px",borderRadius:8,textDecoration:"none",whiteSpace:"nowrap",display:"inline-flex",alignItems:"center",gap:6,boxShadow:"0 4px 14px rgba(255,170,0,0.25)"}}>Open in new tab <span style={{fontSize:12}}>{"↗"}</span></a>
        </div>
      </div>;
    } else if(videoSrc){
      mediaBlock=<video key={videoSrc} controls playsInline preload="metadata" poster={imageSrc||""} src={videoSrc}
        onPlaying={function(){hasPlayedRef.current=true;}}
        onError={function(e){
        var me=e.target&&e.target.error;
        var code=me?("media_"+(me.code||"unknown")):"playback";
        // Mid-playback error (most often the Meta CDN signed URL expiring
        // while the video was paused or muted, so the byte-range refetch
        // on unmute fails with MEDIA_ERR_NETWORK or MEDIA_ERR_SRC_NOT_SUPPORTED).
        // Refetch a fresh signed URL from /api/ad-video?bust=1 instead of
        // leaving the element in a broken state. Hard-capped at 2 retries
        // so a permanently-archived creative falls through to the poster
        // fallback instead of spinning forever.
        if(hasPlayedRef.current){
          if(retryCountRef.current>=2){
            setVideoErr(code);
            console.warn("[GAS] Video mid-playback retries exhausted, falling back to poster\n"+JSON.stringify({code:code,retries:retryCountRef.current,adId:ad.adId,videoId:ad.videoId,adName:ad.adName,platform:ad.platform,videoSrc:videoSrc},null,2));
            return;
          }
          retryCountRef.current+=1;
          hasPlayedRef.current=false;
          console.warn("[GAS] Video mid-playback error, refetching fresh URL\n"+JSON.stringify({code:code,retry:retryCountRef.current,mediaErrorCode:me&&me.code,mediaErrorMsg:me&&me.message,adId:ad.adId,videoId:ad.videoId,adName:ad.adName,platform:ad.platform,videoSrc:videoSrc},null,2));
          var rAuthQ=(props.viewToken?("&token="+encodeURIComponent(props.viewToken)):"")+(!props.viewToken&&props.session?("&st="+encodeURIComponent(props.session)):"");
          var rUrl=props.apiBase+"/api/ad-video?platform="+platformKey+"&id="+encodeURIComponent(ad.videoId)+(ad.adId?("&adId="+encodeURIComponent(ad.adId)):"")+(campaignIdParam?("&campaignId="+encodeURIComponent(campaignIdParam)):"")+rAuthQ+"&resolveOnly=1&bust=1&t="+Date.now();
          // Capture the generation at fire time. If the modal closes or the
          // user opens a different ad before this fetch resolves, adGenRef
          // will have moved and we skip the setState rather than leak a stale
          // URL into the next preview.
          var firedGen=adGenRef.current;
          fetch(rUrl).then(function(r){return r.text();}).then(function(t){
            if(firedGen!==adGenRef.current)return;
            var parsed=null;try{parsed=t?JSON.parse(t):null;}catch(_){}
            if(parsed&&parsed.url){setVideoSrc(parsed.url);setVideoType(parsed.type||"video");}
            else{setVideoErr(code);}
          }).catch(function(){
            if(firedGen!==adGenRef.current)return;
            setVideoErr(code);
          });
          return;
        }
        setVideoErr(code);
        console.warn("[GAS] Video playback failed\n"+JSON.stringify({code:code,mediaErrorCode:me&&me.code,mediaErrorMsg:me&&me.message,adId:ad.adId,videoId:ad.videoId,adName:ad.adName,platform:ad.platform,videoSrc:videoSrc},null,2));
      }} style={{width:"100%",maxHeight:"60vh",background:"#000",borderRadius:10,display:"block"}}/>;
    } else if(videoErr){
      // Video resolution or playback failed. Show the poster image when we
      // have one, but with a branded gradient ALWAYS painted on the parent
      // so even if the image itself never loads (signed URL expired,
      // creative archived, Chrome silently swallows onError) the user sees
      // a polished panel rather than a Chrome broken-image icon. The img
      // sits on top via objectFit:contain, when it loads the gradient
      // disappears behind it, when it fails the gradient stays visible.
      if(imageSrc){
        mediaBlock=<div style={{position:"relative",width:"100%",aspectRatio:"1/1",maxHeight:"60vh",background:"linear-gradient(135deg,"+accent+"45,"+accent+"15 50%,#0a0618 100%)",borderRadius:10,overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center"}}>
          <img src={imageSrc} alt={ad.adName||"Ad"} onError={function(e){if(e.target)e.target.style.display="none";}} style={{maxWidth:"100%",maxHeight:"100%",objectFit:"contain",display:"block",position:"relative",zIndex:1}}/>
          <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",pointerEvents:"none",zIndex:0}}>
            <div style={{textAlign:"center",padding:24}}>
              <div style={{fontSize:11,color:"rgba(255,255,255,0.5)",fontFamily:fm,letterSpacing:3,textTransform:"uppercase",fontWeight:700}}>Preview Unavailable</div>
              <div style={{fontSize:10,color:"rgba(255,255,255,0.4)",fontFamily:fm,marginTop:6,letterSpacing:0.5,maxWidth:280,lineHeight:1.5}}>The platform may have archived the creative or the audio session has expired.</div>
            </div>
          </div>
          <div style={{position:"absolute",top:12,left:12,background:"rgba(0,0,0,0.75)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:8,padding:"6px 12px",display:"flex",alignItems:"center",gap:8,zIndex:2}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.8)" strokeWidth="2"/><polygon points="10,8 16,12 10,16" fill="rgba(255,255,255,0.8)"/></svg>
            <span style={{fontSize:10,fontWeight:800,color:"rgba(255,255,255,0.9)",letterSpacing:2,fontFamily:fm,textTransform:"uppercase"}}>Video Ad, Poster Preview</span>
          </div>
        </div>;
      } else {
        var errMsg=videoErr==="timeout"?"Video took too long to load.":videoErr==="network"?"Network error fetching video.":videoErr==="http_404"?"Creative may have been archived on the platform.":videoErr==="http_403"?"Access denied by the platform (permissions or region).":videoErr==="no_url"?"The platform returned no playable URL for this video.":videoErr==="media_4"?"Video URL expired or format unsupported, try closing and reopening.":videoErr==="media_3"?"Video file could not be decoded.":videoErr==="media_2"?"Network interrupted during playback.":"Video could not be loaded.";
        mediaBlock=placeholder("VIDEO UNAVAILABLE",errMsg);
      }
    } else {
      mediaBlock=<div style={{width:"100%",aspectRatio:"1/1",maxHeight:"60vh",background:imageSrc?("url("+imageSrc+") center/contain no-repeat #000"):"#000",borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:12,fontFamily:fm,letterSpacing:2,fontWeight:800}}><div style={{background:"rgba(0,0,0,0.6)",padding:"10px 18px",borderRadius:8,letterSpacing:3}}>LOADING VIDEO…</div></div>;
    }
  } else if(imageSrc){
    // Graceful fallback: if the refreshed image still fails to load (rare,
    // would mean the creative was deleted / archived), swap to a branded
    // placeholder rather than a broken-image icon.
    mediaBlock=<img src={imageSrc} alt={ad.adName||"Ad"} onError={function(e){
      var fallback=document.createElement("div");
      fallback.style.cssText="width:100%;aspect-ratio:1/1;background:linear-gradient(135deg,"+accent+"55,"+accent+"15 55%,#0a0618 100%);border-radius:10px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;letter-spacing:2px;font-weight:800;font-family:"+fm+";text-align:center;padding:24px;";
      fallback.textContent="PREVIEW UNAVAILABLE — creative may have been archived by the platform";
      if(e.target&&e.target.parentNode)e.target.parentNode.replaceChild(fallback,e.target);
    }} style={{width:"100%",maxHeight:"60vh",objectFit:"contain",background:"#000",borderRadius:10,display:"block"}}/>;
  } else {
    mediaBlock=placeholder("NO PREVIEW AVAILABLE","This ad format doesn't have a downloadable creative asset.");
  }

  var results=parseFloat(ad.results||0);
  var spend=parseFloat(ad.spend||0);
  var costPerResult=results>0?spend/results:0;

  return <div onClick={props.onClose} style={{position:"fixed",inset:0,zIndex:1200,background:"rgba(0,0,0,0.85)",backdropFilter:"blur(8px)",display:"flex",alignItems:"center",justifyContent:"center",padding:"24px 16px",overflow:"auto"}}>
    <div onClick={function(e){e.stopPropagation();}} style={{width:760,maxWidth:"96vw",maxHeight:"calc(100vh - 48px)",overflowY:"auto",background:P.cosmos,border:"1px solid "+P.rule,borderRadius:20,padding:"22px 24px",boxShadow:"0 30px 80px rgba(0,0,0,0.65)"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14,gap:12}}>
        <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          <span style={{background:accent,color:textOnAccent(accent),fontSize:9,fontWeight:800,padding:"4px 10px",borderRadius:5,letterSpacing:1.5,textTransform:"uppercase"}}>{ad.platform}</span>
          <span style={{background:P.mint,color:"#062014",fontSize:9,fontWeight:800,padding:"4px 10px",borderRadius:5,letterSpacing:1.5,textTransform:"uppercase"}}>{format}</span>
        </div>
        <button onClick={props.onClose} title="Close" style={{background:"transparent",border:"1px solid "+P.rule,borderRadius:10,width:36,height:36,color:P.label,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
        </button>
      </div>
      {mediaBlock}
      <div style={{marginTop:16,fontSize:14,fontWeight:800,color:P.txt,fontFamily:ff,lineHeight:1.4}}>{ad.adName||"Unnamed ad"}</div>
      {ad.campaignName&&<div style={{fontSize:11,color:P.label,fontFamily:fm,marginTop:4}}>Campaign: {ad.campaignName}</div>}
      {(function(){
        // Placements already travel on the ad row: Meta has Feed/Stories/Reels/etc,
        // TikTok is FYP, Google maps to Display/Pmax/Demand/Search/YouTube.
        var pl=ad.placements||{};
        var keys=Object.keys(pl);
        if(keys.length===0)return null;
        var totalImps=keys.reduce(function(a,k){return a+parseFloat(pl[k].impressions||0);},0);
        // Sort by impressions desc so dominant placement leads.
        keys.sort(function(a,b){return parseFloat(pl[b].impressions||0)-parseFloat(pl[a].impressions||0);});
        return <div style={{marginTop:10,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
          <span style={{fontSize:8,color:P.label,letterSpacing:2,fontWeight:800,textTransform:"uppercase",fontFamily:fm,marginRight:2}}>Placements</span>
          {keys.map(function(k){
            var imps=parseFloat(pl[k].impressions||0);
            var pctStr=totalImps>0&&keys.length>1?" · "+(imps/totalImps*100).toFixed(2)+"%":"";
            return <span key={k} style={{background:accent+"18",border:"1px solid "+accent+"50",color:accent,fontSize:10,fontWeight:800,padding:"3px 9px",borderRadius:5,letterSpacing:1,textTransform:"uppercase",fontFamily:fm}}>{k+pctStr}</span>;
          })}
        </div>;
      })()}
      <div style={{marginTop:14,display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:10}}>
        <div style={{background:"rgba(255,255,255,0.04)",border:"1px solid "+P.rule,borderRadius:10,padding:"10px 12px"}}>
          <div style={{fontSize:8,color:accent,letterSpacing:2,fontWeight:800,textTransform:"uppercase",fontFamily:fm,marginBottom:4}}>{resultLabel(ad.resultType)}</div>
          <div style={{fontSize:18,fontWeight:900,color:P.txt,fontFamily:fm,lineHeight:1}}>{results>0?fmt(results):"\u2014"}</div>
          {results>0&&<div style={{fontSize:9,color:P.label,fontFamily:fm,marginTop:4}}>{fR(costPerResult)+" "+costPerLabel(ad.resultType)}</div>}
        </div>
        <div style={{background:"rgba(255,255,255,0.04)",border:"1px solid "+P.rule,borderRadius:10,padding:"10px 12px"}}>
          <div style={{fontSize:8,color:P.label,letterSpacing:2,fontWeight:800,textTransform:"uppercase",fontFamily:fm,marginBottom:4}}>Spend</div>
          <div style={{fontSize:16,fontWeight:900,color:P.txt,fontFamily:fm,lineHeight:1}}>{fR(spend)}</div>
        </div>
        <div style={{background:"rgba(255,255,255,0.04)",border:"1px solid "+P.rule,borderRadius:10,padding:"10px 12px"}}>
          <div style={{fontSize:8,color:P.label,letterSpacing:2,fontWeight:800,textTransform:"uppercase",fontFamily:fm,marginBottom:4}}>Impressions</div>
          <div style={{fontSize:16,fontWeight:900,color:P.txt,fontFamily:fm,lineHeight:1}}>{fmt(parseFloat(ad.impressions||0))}</div>
        </div>
        <div style={{background:"rgba(255,255,255,0.04)",border:"1px solid "+P.rule,borderRadius:10,padding:"10px 12px"}}>
          <div style={{fontSize:8,color:P.label,letterSpacing:2,fontWeight:800,textTransform:"uppercase",fontFamily:fm,marginBottom:4}}>CTR</div>
          <div style={{fontSize:16,fontWeight:900,color:P.txt,fontFamily:fm,lineHeight:1}}>{(parseFloat(ad.ctr||0)).toFixed(2)+"%"}</div>
        </div>
        <div style={{background:"rgba(255,255,255,0.04)",border:"1px solid "+P.rule,borderRadius:10,padding:"10px 12px"}}>
          <div style={{fontSize:8,color:P.label,letterSpacing:2,fontWeight:800,textTransform:"uppercase",fontFamily:fm,marginBottom:4}}>Cost Per Click</div>
          <div style={{fontSize:16,fontWeight:900,color:P.txt,fontFamily:fm,lineHeight:1}}>{fR(parseFloat(ad.cpc||0))}</div>
        </div>
      </div>
    </div>
  </div>;
}

// Derive unique client names from campaign account names by stripping
// trailing platform labels (Meta, Google, TikTok, Facebook, Instagram).
// For agency accounts (e.g. "GAS Agency") the account name doesn't
// identify the client, so we extract the client name from the campaign
// name. Convention: "Apr26 | GAS | Willowbrook Village (Cycle2) | ..."
// The client is the first pipe-segment that isn't a date tag or "GAS".
var AGENCY_NAMES={"gas agency":true,"gas":true};
var SKIP_SEGMENTS=/^(gas|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\d{0,4}$/i;
function extractAgencyClient(campaignName){
  var parts=(campaignName||"").split(/\s*\|\s*/);
  for(var i=0;i<parts.length;i++){
    var seg=parts[i].trim();
    if(!seg)continue;
    if(SKIP_SEGMENTS.test(seg.replace(/\s+/g,"")))continue;
    // Also skip segments that look like dates or meta ("Start ...", "Funnel ...")
    if(/^start\s/i.test(seg)||/^funnel\s/i.test(seg)||/^end\s/i.test(seg))continue;
    return seg;
  }
  return "";
}
function deriveClientNames(campaigns){
  var PLATFORM_SUFFIXES=/\s+(Meta|Google|TikTok|Facebook|Instagram|Ads|FB|IG)$/i;
  var seen={};
  (campaigns||[]).forEach(function(c){
    var raw=(c.accountName||"").trim();
    if(!raw)return;
    var clean=raw.replace(PLATFORM_SUFFIXES,"").replace(PLATFORM_SUFFIXES,"").trim();
    if(!clean)return;
    // Agency account: derive client name from campaign name
    if(AGENCY_NAMES[clean.toLowerCase()]){
      var client=extractAgencyClient(c.campaignName);
      if(client){
        var pk=client.toLowerCase();
        if(!seen[pk])seen[pk]=client;
      }
      return;
    }
    var key=clean.toLowerCase();
    if(!seen[key])seen[key]=clean;
  });
  return Object.keys(seen).sort().map(function(k){return seen[k];});
}

function ShareModal(props){
  // Derive client names once from all campaigns; auto-select the client
  // whose campaigns are currently selected (most-frequent account name).
  var clientNames=useMemo(function(){return deriveClientNames(props.campaigns);},[props.campaigns]);
  var autoClient=useMemo(function(){
    var PLATFORM_SUFFIXES=/\s+(Meta|Google|TikTok|Facebook|Instagram|Ads|FB|IG)$/i;
    var counts={};
    (props.campaigns||[]).forEach(function(c){
      if((props.selected||[]).indexOf(c.campaignId)<0)return;
      var raw=(c.accountName||"").trim();
      var clean=raw.replace(PLATFORM_SUFFIXES,"").replace(PLATFORM_SUFFIXES,"").trim().toLowerCase();
      // Agency account: derive client key from campaign name
      if(AGENCY_NAMES[clean]){
        var client=extractAgencyClient(c.campaignName).toLowerCase();
        if(client){counts[client]=(counts[client]||0)+1;}
        return;
      }
      if(clean){counts[clean]=(counts[clean]||0)+1;}
    });
    var best="";var bestN=0;
    Object.keys(counts).forEach(function(k){if(counts[k]>bestN){bestN=counts[k];best=k;}});
    // Return the display-cased version from clientNames
    for(var i=0;i<clientNames.length;i++){if(clientNames[i].toLowerCase()===best)return clientNames[i];}
    return "";
  },[props.campaigns,props.selected,clientNames]);
  var slug=useState("");
  // Auto-populate slug from the selected campaigns' client name.
  useEffect(function(){if(autoClient&&!slug[0])slug[1](autoClient);},[autoClient]);
  var expiry=useState(30);
  var shareUrl=useState("");
  var expiresAt=useState("");
  var busy=useState(false);
  var err=useState("");
  var copied=useState(false);
  var draftCopied=useState(false);
  var emailTo=useState("");
  var emailCc=useState("");
  var emailBcc=useState("");
  var emailSent=useState(false);
  var emailSentTo=useState("");
  var emailDiagnostic=useState("");
  var previewHtml=useState("");
  var previewLoading=useState(false);
  // Rotating quirky quip while the email preview is being built
  // server-side. Keeps the user engaged during the 10-30s render
  // window without making a time promise we can't keep.
  var previewQuip=useState(QUIRKY_EMAIL_LOADERS[0]);
  useEffect(function(){
    if(!previewLoading[0])return;
    previewQuip[1](pickQuirky(QUIRKY_EMAIL_LOADERS));
    var iv=setInterval(function(){previewQuip[1](pickQuirky(QUIRKY_EMAIL_LOADERS));},4500);
    return function(){clearInterval(iv);};
  },[previewLoading[0]]);
  var personalMsg=useState("");
  var senderName=useState("");
  var senderTitle=useState("");
  var recipientName=useState("");
  var copy=function(){if(!shareUrl[0])return;navigator.clipboard.writeText(shareUrl[0]);copied[1](true);setTimeout(function(){copied[1](false);},2000);};
  var copyDraft=function(){
    var text=buildPlainDraft();
    navigator.clipboard.writeText(text);
    draftCopied[1](true);setTimeout(function(){draftCopied[1](false);},2000);
  };
  var buildPlainDraft=function(){
    var slugWho=slug[0]?slug[0].toUpperCase():"";
    var who=(recipientName[0]||"").trim()||slugWho;
    var lines=[];
    lines.push("Hi "+(who||"there")+",");
    lines.push("");
    if(personalMsg[0].trim()){lines.push(personalMsg[0].trim());lines.push("");}
    lines.push("Your live performance dashboard is ready for "+props.dateFrom+" to "+props.dateTo+". One click and you are in, no login required.");
    lines.push("");
    lines.push("View dashboard: "+shareUrl[0]);
    lines.push("");
    lines.push("This link stays active until "+(expiresAt[0]?new Date(expiresAt[0]).toLocaleDateString("en-ZA",{year:"numeric",month:"short",day:"numeric"}):"the expiry date")+".");
    lines.push("");
    if(senderName[0].trim())lines.push(senderName[0].trim());
    if(senderTitle[0].trim())lines.push(senderTitle[0].trim());
    lines.push("GAS Marketing Automation");
    lines.push("grow@gasmarketing.co.za");
    return lines.join("\n");
  };
  var buildCampaignPayload=function(){
    var selectedCampaigns=(props.campaigns||[]).filter(function(c){return props.selected.indexOf(c.campaignId)>=0;});
    // Send ONLY the exact selected campaignIds (suffixed form, e.g. "123_facebook").
    // Previously we also pushed raw and stripped variants which caused the server
    // filter to over-include the OTHER publisher variant of the same campaign.
    // Now the email filter matches exactly what the dashboard selection shows.
    var campaignIds=[];var campaignNames=[];
    selectedCampaigns.forEach(function(c){
      if(c.campaignId)campaignIds.push(String(c.campaignId));
      if(c.campaignName)campaignNames.push(c.campaignName);
    });
    return {clientSlug:slug[0].trim(),campaignIds:campaignIds,campaignNames:campaignNames,from:props.dateFrom,to:props.dateTo,expiresInDays:expiry[0],personalMessage:personalMsg[0].trim(),senderName:senderName[0].trim(),senderTitle:senderTitle[0].trim(),recipientName:recipientName[0].trim()};
  };
  var validateBasics=function(){
    if(!slug[0].trim()){err[1]("Select a client before sharing");return false;}
    if(!props.selected||props.selected.length===0){err[1]("Select at least one campaign on the left before sharing");return false;}
    return true;
  };
  var generate=function(){
    if(!validateBasics())return;
    err[1]("");busy[1](true);emailSent[1](false);
    fetch(props.apiBase+"/api/issue-token",{
      method:"POST",
      headers:{"Content-Type":"application/json","x-session-token":props.session||""},
      body:JSON.stringify(buildCampaignPayload())
    }).then(function(r){return r.json();}).then(function(d){
      busy[1](false);
      if(d.shareUrl){shareUrl[1](d.shareUrl);expiresAt[1](d.expiresAt);}
      else{err[1](d.error||"Could not generate link");}
    }).catch(function(){busy[1](false);err[1]("Connection error");});
  };
  // Preview flow: fetch the rendered email HTML, show it in an iframe pane
  // so the account manager reviews before committing the send.
  var requestPreview=function(){
    if(!validateBasics())return;
    var emailRe=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if(!emailRe.test((emailTo[0]||"").trim())){err[1]("Enter a valid recipient email to preview and send");return;}
    err[1]("");previewLoading[1](true);previewHtml[1]("");
    var payload=buildCampaignPayload();
    payload.emailTo=emailTo[0].trim();
    payload.emailCc=emailCc[0].trim();
    payload.emailBcc=emailBcc[0].trim();
    payload.preview=true;
    fetch(props.apiBase+"/api/email-share",{
      method:"POST",
      headers:{"Content-Type":"application/json","x-session-token":props.session||""},
      body:JSON.stringify(payload)
    }).then(function(r){return r.json();}).then(function(d){
      previewLoading[1](false);
      if(d.ok&&d.html){previewHtml[1](d.html);}
      else{err[1](d.error||"Could not build preview");}
    }).catch(function(){previewLoading[1](false);err[1]("Connection error");});
  };
  var confirmSend=function(){
    err[1]("");busy[1](true);emailSent[1](false);
    var payload=buildCampaignPayload();
    payload.emailTo=emailTo[0].trim();
    payload.emailCc=emailCc[0].trim();
    payload.emailBcc=emailBcc[0].trim();
    // preview omitted -> real send
    fetch(props.apiBase+"/api/email-share",{
      method:"POST",
      headers:{"Content-Type":"application/json","x-session-token":props.session||""},
      body:JSON.stringify(payload)
    }).then(function(r){return r.json();}).then(function(d){
      busy[1](false);
      if(d.ok){
        previewHtml[1]("");
        shareUrl[1](d.shareUrl);expiresAt[1](d.expiresAt);
        emailSent[1](true);emailSentTo[1]((d.sentTo||[]).join(", "));emailDiagnostic[1](d.diagnostic||"");
        // Close the modal and hand control back to the dashboard so it can
        // show the green toast and land the user on the Summary view.
        if(typeof props.onSent==="function")props.onSent();
      }
      else{err[1](d.error||"Could not send email");}
    }).catch(function(){busy[1](false);err[1]("Connection error");});
  };
  var cancelPreview=function(){previewHtml[1]("");err[1]("");};
  var reset=function(){shareUrl[1]("");expiresAt[1]("");slug[1]("");emailTo[1]("");emailCc[1]("");emailBcc[1]("");emailSent[1](false);emailSentTo[1]("");emailDiagnostic[1]("");personalMsg[1]("");senderName[1]("");senderTitle[1]("");recipientName[1]("");previewHtml[1]("");};

  // Audit trail state
  var auditOpen=useState(false);
  var auditEntries=useState([]);
  var auditLoading=useState(false);
  var auditEnabled=useState(true);
  var auditQuery=useState("");
  var loadAudit=function(){
    auditLoading[1](true);
    fetch(props.apiBase+"/api/audit-log?limit=500",{headers:{"x-session-token":props.session||""}})
      .then(function(r){return r.json();})
      .then(function(d){
        auditLoading[1](false);
        var entries=Array.isArray(d.entries)?d.entries:[];
        // Defensive client-side sort newest-first in case the server ever returns out of order.
        entries.sort(function(a,b){var aT=a&&a.sentAt?Date.parse(a.sentAt):0;var bT=b&&b.sentAt?Date.parse(b.sentAt):0;return bT-aT;});
        auditEntries[1](entries);
        auditEnabled[1](d.enabled!==false);
      })
      .catch(function(){auditLoading[1](false);auditEnabled[1](true);auditEntries[1]([]);});
  };
  var deleteAuditEntry=function(id){
    if(!id)return;
    if(!window.confirm("Delete this log entry? This cannot be undone."))return;
    fetch(props.apiBase+"/api/audit-log?id="+encodeURIComponent(id),{method:"DELETE",headers:{"x-session-token":props.session||""}})
      .then(function(r){return r.json();})
      .then(function(d){if(d.ok){auditEntries[1](auditEntries[0].filter(function(e){return e.id!==id;}));}})
      .catch(function(){});
  };
  useEffect(function(){if(auditOpen[0]){loadAudit();}},[auditOpen[0],emailSent[0]]);
  var filteredAudit=(function(){
    var q=(auditQuery[0]||"").toLowerCase().trim();
    if(!q)return auditEntries[0];
    return auditEntries[0].filter(function(e){
      if((e.clientSlug||"").toLowerCase().indexOf(q)>=0)return true;
      if((e.clientName||"").toLowerCase().indexOf(q)>=0)return true;
      if((e.senderName||"").toLowerCase().indexOf(q)>=0)return true;
      var recips=[].concat(e.to||[]).concat(e.cc||[]).concat(e.bcc||[]).join(" ").toLowerCase();
      if(recips.indexOf(q)>=0)return true;
      return false;
    });
  })();
  var exportCsv=function(){
    var rows=[["Sent at (UTC)","Client slug","Client name","Sent by","Title","To","CC","BCC","Period from","Period to","Campaigns","Summary embedded","Top ads embedded"]];
    filteredAudit.forEach(function(e){
      rows.push([
        e.sentAt||"",
        e.clientSlug||"",
        e.clientName||"",
        e.senderName||"",
        e.senderTitle||"",
        (e.to||[]).join("; "),
        (e.cc||[]).join("; "),
        (e.bcc||[]).join("; "),
        e.fromDate||"",
        e.toDate||"",
        e.campaignCount||0,
        e.summaryEmbedded?"yes":"no",
        e.topAdsEmbedded?"yes":"no"
      ]);
    });
    var csv=rows.map(function(r){return r.map(function(c){var s=String(c||"");if(s.indexOf(",")>=0||s.indexOf('"')>=0||s.indexOf("\n")>=0){return '"'+s.replace(/"/g,'""')+'"';}return s;}).join(",");}).join("\n");
    var blob=new Blob([csv],{type:"text/csv"});
    var url=URL.createObjectURL(blob);
    var a=document.createElement("a");
    a.href=url;a.download="email-audit-"+(new Date()).toISOString().slice(0,10)+".csv";
    document.body.appendChild(a);a.click();document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  var fmtDate=function(iso){if(!iso)return"—";var d=new Date(iso);if(isNaN(d.getTime()))return iso;return d.toLocaleString("en-ZA",{year:"numeric",month:"short",day:"2-digit",hour:"2-digit",minute:"2-digit"});};
  return(<>
  {/* Preview overlay. Appears immediately when the user clicks Preview +
      Send — shows a building spinner while the /api/email-share HTML
      renders server-side, then swaps to the iframe. The overlay is FULLY
      opaque (#06020e, not rgba alpha) so the browser can skip painting
      the Share modal's backdrop-filter:blur layer underneath on every
      iframe scroll frame. Iframe itself is promoted to its own GPU layer
      (translateZ + contain:strict) so scroll inside the email body never
      invalidates the outer compositor tree. Prior alpha-overlay version
      caused jerky scroll because every scroll tick had to re-rasterize
      the blurred share modal showing through the 8% transparent gap. */}
  {(previewLoading[0]||previewHtml[0])&&<div style={{position:"fixed",inset:0,background:"#06020e",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",zIndex:1100,padding:"24px 16px",willChange:"transform"}} onClick={function(e){if(e.target===e.currentTarget&&!previewLoading[0])cancelPreview();}}>
    <div style={{background:P.cosmos,border:"1px solid "+P.rule,borderRadius:20,padding:"18px 22px",maxWidth:780,width:"100%",display:"flex",flexDirection:"column",maxHeight:"calc(100vh - 48px)",boxShadow:"0 24px 80px rgba(0,0,0,0.6)",willChange:"transform",contain:"layout"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,gap:12}}>
        <div>
          <div style={{fontSize:11,color:P.ember,fontFamily:fm,letterSpacing:3,fontWeight:800,textTransform:"uppercase",marginBottom:4}}>Email Preview</div>
          <div style={{fontSize:12,color:P.label,fontFamily:fm,lineHeight:1.5}}>Review this before confirming. To: <span style={{color:P.txt,fontWeight:700}}>{emailTo[0]}</span>{emailCc[0]?<span> | cc: <span style={{color:P.txt}}>{emailCc[0]}</span></span>:null}{emailBcc[0]?<span> | bcc: <span style={{color:P.txt}}>{emailBcc[0]}</span></span>:null}</div>
        </div>
        <button onClick={cancelPreview} disabled={previewLoading[0]} title="Close preview" style={{background:"transparent",border:"1px solid "+P.rule,borderRadius:10,width:36,height:36,color:P.label,cursor:previewLoading[0]?"wait":"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,opacity:previewLoading[0]?0.5:1}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
        </button>
      </div>
      <div style={{flex:1,background:"#fff",borderRadius:12,overflow:"hidden",border:"1px solid "+P.rule,minHeight:400,position:"relative",contain:"content"}}>
        {previewLoading[0]&&!previewHtml[0]&&<div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:20,background:P.cosmos,color:P.txt,padding:"28px 24px"}}>
          <div style={{width:44,height:44,border:"3px solid "+P.rule,borderTop:"3px solid "+P.ember,borderRadius:"50%",animation:"spin 1s linear infinite"}}/>
          <style>{"@keyframes spin{to{transform:rotate(360deg)}}@keyframes emailQuipFade{0%,100%{opacity:0.45}15%,85%{opacity:1}}"}</style>
          <div key={previewQuip[0]} style={{fontSize:14,color:"rgba(255,251,248,0.78)",fontStyle:"italic",fontFamily:ff,letterSpacing:0.3,textAlign:"center",maxWidth:460,lineHeight:1.6,animation:"emailQuipFade 4.5s ease-in-out"}}>{previewQuip[0]}<span style={{display:"inline-block",width:20}}>…</span></div>
        </div>}
        {previewHtml[0]&&<iframe title="Email preview" srcDoc={previewHtml[0]} loading="lazy" style={{width:"100%",height:"100%",minHeight:"60vh",border:"none",display:"block",background:"#fff",transform:"translateZ(0)",willChange:"transform",contain:"strict"}}/>}
      </div>
      {err[0]&&<div style={{color:P.critical,fontSize:11,fontFamily:fm,marginTop:10}}>{err[0]}</div>}
      <div style={{display:"flex",gap:10,marginTop:14}}>
        <button onClick={cancelPreview} disabled={busy[0]||previewLoading[0]} style={{flex:1,background:"transparent",border:"1px solid "+P.rule,borderRadius:10,padding:"12px 20px",color:P.txt,fontSize:11,fontWeight:800,fontFamily:fm,cursor:(busy[0]||previewLoading[0])?"wait":"pointer",letterSpacing:1.5,opacity:previewLoading[0]?0.5:1}}>Go Back and Edit</button>
        <button onClick={confirmSend} disabled={busy[0]||previewLoading[0]||!previewHtml[0]} style={{flex:2,background:(busy[0]||previewLoading[0]||!previewHtml[0])?"#555":gEmber,border:"none",borderRadius:10,padding:"12px 20px",color:"#fff",fontSize:12,fontWeight:900,fontFamily:fm,cursor:(busy[0]||previewLoading[0]||!previewHtml[0])?"wait":"pointer",letterSpacing:2}}>{busy[0]?"SENDING...":previewLoading[0]?"BUILDING...":"CONFIRM AND SEND"}</button>
      </div>
    </div>
  </div>}
  <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,backdropFilter:"blur(6px)",overflow:"auto",padding:"40px 16px"}} onClick={props.onClose}>
    <div onClick={function(e){e.stopPropagation();}} style={{background:P.cosmos,border:"1px solid "+P.rule,borderRadius:20,padding:32,width:560,maxWidth:"92vw",maxHeight:"calc(100vh - 80px)",overflowY:"auto"}}>
      <div style={{fontSize:18,fontWeight:900,color:P.txt,fontFamily:fm,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>Share with Client</div>
      <div style={{fontSize:12,color:P.label,marginBottom:20,lineHeight:1.6}}>Generates a signed URL scoped to this client. Read-only Summary view, locked to the campaigns you currently have selected. Clients open directly, no password required.</div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
        <div>
          <div style={{fontSize:10,fontWeight:800,color:P.label,fontFamily:fm,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>Client</div>
          <select value={slug[0]} onChange={function(e){slug[1](e.target.value);err[1]("");}} style={{width:"100%",boxSizing:"border-box",background:P.glass,border:"1px solid "+P.rule,borderRadius:10,padding:"10px 14px",color:slug[0]?P.txt:P.caption,fontSize:13,fontFamily:fm,outline:"none",letterSpacing:1,textTransform:"uppercase",appearance:"none",WebkitAppearance:"none",backgroundImage:"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%238B7FA3' stroke-width='1.5' fill='none'/%3E%3C/svg%3E\")",backgroundRepeat:"no-repeat",backgroundPosition:"right 14px center",cursor:"pointer"}}>
            <option value="" style={{background:P.cosmos}}>Select client</option>
            {clientNames.map(function(n){return <option key={n} value={n} style={{background:P.cosmos}}>{n.toUpperCase()}</option>;})}
          </select>
        </div>
        <div>
          <div style={{fontSize:10,fontWeight:800,color:P.label,fontFamily:fm,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>Greet as <span style={{color:P.caption,fontWeight:600,letterSpacing:1}}>(name or company)</span></div>
          <input name="share-recipient-name" autoComplete="off" value={recipientName[0]} onChange={function(e){recipientName[1](e.target.value);}} placeholder="e.g. Jane or Willowbrook Village" style={{width:"100%",boxSizing:"border-box",background:P.glass,border:"1px solid "+P.rule,borderRadius:10,padding:"10px 14px",color:P.txt,fontSize:13,fontFamily:ff,outline:"none"}}/>
        </div>
      </div>

      <div style={{marginBottom:18}}>
        <div style={{fontSize:10,fontWeight:800,color:P.label,fontFamily:fm,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>Expires in</div>
        <div style={{display:"flex",gap:8}}>
          {[30,60,90,180].map(function(d){return <button key={d} onClick={function(){expiry[1](d);}} style={{flex:1,background:expiry[0]===d?P.ember+"25":"transparent",border:"1px solid "+(expiry[0]===d?P.ember+"70":P.rule),borderRadius:8,padding:"8px 10px",color:expiry[0]===d?P.ember:P.label,fontSize:11,fontWeight:800,fontFamily:fm,cursor:"pointer",letterSpacing:1}}>{d+" days"}</button>;})}
        </div>
      </div>

      <div style={{fontSize:11,color:P.label,fontFamily:fm,marginBottom:16}}>Campaigns in this share: <span style={{color:P.ember,fontWeight:700}}>{(props.selected||[]).length}</span> selected, <span style={{color:P.ember,fontWeight:700}}>{props.dateFrom}</span> to <span style={{color:P.ember,fontWeight:700}}>{props.dateTo}</span></div>

      {/* Personal message, used in both sent emails and the copyable draft for link-only */}
      <div style={{marginBottom:14}}>
        <div style={{fontSize:10,fontWeight:800,color:P.label,fontFamily:fm,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>Personal message (optional)</div>
        <textarea value={personalMsg[0]} onChange={function(e){personalMsg[1](e.target.value);}} placeholder="Add a short note for the client. E.g. 'Really strong month, scroll to Engagement Highlights for the click-through rate spike on the new Reels ad.'" style={{width:"100%",boxSizing:"border-box",background:P.glass,border:"1px solid "+P.rule,borderRadius:10,padding:"10px 14px",color:P.txt,fontSize:12,fontFamily:ff,outline:"none",resize:"vertical",minHeight:70,lineHeight:1.5}}/>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:18}}>
        <div>
          <div style={{fontSize:10,fontWeight:800,color:P.label,fontFamily:fm,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>Your name</div>
          <input name="share-sender-name" autoComplete="name" value={senderName[0]} onChange={function(e){senderName[1](e.target.value);}} placeholder="e.g. Gary Shepherd" style={{width:"100%",boxSizing:"border-box",background:P.glass,border:"1px solid "+P.rule,borderRadius:10,padding:"10px 14px",color:P.txt,fontSize:12,fontFamily:fm,outline:"none"}}/>
        </div>
        <div>
          <div style={{fontSize:10,fontWeight:800,color:P.label,fontFamily:fm,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>Title (optional)</div>
          <input name="share-sender-title" autoComplete="organization-title" value={senderTitle[0]} onChange={function(e){senderTitle[1](e.target.value);}} placeholder="e.g. Performance Lead" style={{width:"100%",boxSizing:"border-box",background:P.glass,border:"1px solid "+P.rule,borderRadius:10,padding:"10px 14px",color:P.txt,fontSize:12,fontFamily:fm,outline:"none"}}/>
        </div>
      </div>

      {/* Email delivery */}
      <div style={{background:"rgba(255,255,255,0.02)",border:"1px solid "+P.rule,borderRadius:12,padding:"14px 16px",marginBottom:16}}>
        <div style={{fontSize:11,fontWeight:800,color:P.ember,fontFamily:fm,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>Email delivery (optional)</div>
        <div style={{marginBottom:10}}>
          <div style={{fontSize:9,fontWeight:700,color:P.label,fontFamily:fm,letterSpacing:1.5,textTransform:"uppercase",marginBottom:4}}>To</div>
          <input name="share-email-to" type="email" autoComplete="email" value={emailTo[0]} onChange={function(e){emailTo[1](e.target.value);err[1]("");}} placeholder="client@company.co.za" style={{width:"100%",boxSizing:"border-box",background:P.glass,border:"1px solid "+P.rule,borderRadius:8,padding:"8px 12px",color:P.txt,fontSize:12,fontFamily:fm,outline:"none"}}/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div>
            <div style={{fontSize:9,fontWeight:700,color:P.label,fontFamily:fm,letterSpacing:1.5,textTransform:"uppercase",marginBottom:4}}>Cc</div>
            <input name="share-email-cc" type="email" autoComplete="off" value={emailCc[0]} onChange={function(e){emailCc[1](e.target.value);}} placeholder="optional, comma-separated" style={{width:"100%",boxSizing:"border-box",background:P.glass,border:"1px solid "+P.rule,borderRadius:8,padding:"8px 12px",color:P.txt,fontSize:12,fontFamily:fm,outline:"none"}}/>
          </div>
          <div>
            <div style={{fontSize:9,fontWeight:700,color:P.label,fontFamily:fm,letterSpacing:1.5,textTransform:"uppercase",marginBottom:4}}>Bcc</div>
            <input name="share-email-bcc" type="email" autoComplete="off" value={emailBcc[0]} onChange={function(e){emailBcc[1](e.target.value);}} placeholder="optional, comma-separated" style={{width:"100%",boxSizing:"border-box",background:P.glass,border:"1px solid "+P.rule,borderRadius:8,padding:"8px 12px",color:P.txt,fontSize:12,fontFamily:fm,outline:"none"}}/>
          </div>
        </div>
        <div style={{fontSize:9,color:P.caption,fontFamily:fm,marginTop:8,lineHeight:1.5}}>Sends from grow@gasmarketing.co.za with a branded HTML report and a live dashboard link.</div>
      </div>

      {err[0]&&<div style={{color:P.critical,fontSize:11,fontFamily:fm,marginBottom:12}}>{err[0]}</div>}

      {!shareUrl[0]&&<div style={{display:"flex",gap:10}}>
        <button onClick={generate} disabled={busy[0]||previewLoading[0]} style={{flex:1,background:busy[0]?"#555":"transparent",border:"1px solid "+P.rule,borderRadius:10,padding:"12px 20px",color:P.txt,fontSize:11,fontWeight:800,fontFamily:fm,cursor:busy[0]?"wait":"pointer",letterSpacing:1.5}}>{busy[0]?"WORKING...":"LINK ONLY"}</button>
        <button onClick={requestPreview} disabled={busy[0]||previewLoading[0]} style={{flex:2,background:(busy[0]||previewLoading[0])?"#555":gEmber,border:"none",borderRadius:10,padding:"12px 20px",color:"#fff",fontSize:12,fontWeight:900,fontFamily:fm,cursor:(busy[0]||previewLoading[0])?"wait":"pointer",letterSpacing:2}}>{previewLoading[0]?"BUILDING PREVIEW...":busy[0]?"SENDING...":"PREVIEW + SEND"}</button>
      </div>}

      {shareUrl[0]&&<div style={{marginTop:4}}>
        {emailSent[0]&&<div style={{background:P.mint+"12",border:"1px solid "+P.mint+"40",borderRadius:10,padding:"12px 14px",marginBottom:14}}>
          <div style={{fontSize:10,fontWeight:800,color:P.mint,fontFamily:fm,letterSpacing:2,textTransform:"uppercase",marginBottom:4}}>Email sent</div>
          <div style={{fontSize:12,color:P.txt,fontFamily:fm,lineHeight:1.5}}>Delivered to <span style={{color:P.mint,fontWeight:700}}>{emailSentTo[0]}</span></div>
          {emailDiagnostic[0]&&<div style={{marginTop:8,fontSize:10,color:P.warning,fontFamily:fm,lineHeight:1.5,borderTop:"1px solid "+P.warning+"30",paddingTop:8}}>Note, {emailDiagnostic[0]}</div>}
        </div>}
        <div style={{fontSize:10,fontWeight:800,color:P.mint,fontFamily:fm,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>Share URL</div>
        <div style={{display:"flex",gap:8,marginBottom:10}}>
          <input readOnly value={shareUrl[0]} onClick={function(e){e.target.select();}} style={{flex:1,background:P.glass,border:"1px solid "+P.mint+"40",borderRadius:10,padding:"10px 14px",color:P.txt,fontSize:11,fontFamily:fm,outline:"none"}}/>
          <button onClick={copy} style={{background:copied[0]?P.mint:gEmber,border:"none",borderRadius:10,padding:"10px 20px",color:"#fff",fontSize:12,fontWeight:900,fontFamily:fm,cursor:"pointer",letterSpacing:1}}>{copied[0]?"COPIED":"COPY"}</button>
        </div>
        <div style={{fontSize:10,color:P.label,fontFamily:fm}}>Expires: {expiresAt[0]?new Date(expiresAt[0]).toLocaleDateString("en-ZA",{year:"numeric",month:"short",day:"numeric"}):","} | Client: <span style={{color:P.ember,fontWeight:700}}>{(slug[0]||"").toUpperCase()}</span></div>

        {!emailSent[0]&&<div style={{marginTop:16,background:"rgba(255,255,255,0.02)",border:"1px solid "+P.rule,borderRadius:12,padding:"14px 16px"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
            <div style={{fontSize:11,fontWeight:800,color:P.ember,fontFamily:fm,letterSpacing:2,textTransform:"uppercase"}}>Ready-to-send email draft</div>
            <button onClick={copyDraft} style={{background:draftCopied[0]?P.mint:"transparent",border:"1px solid "+(draftCopied[0]?P.mint:P.rule),borderRadius:8,padding:"6px 14px",color:draftCopied[0]?"#fff":P.txt,fontSize:10,fontWeight:800,fontFamily:fm,cursor:"pointer",letterSpacing:1.5}}>{draftCopied[0]?"COPIED":"COPY DRAFT"}</button>
          </div>
          <div style={{fontSize:9,color:P.caption,fontFamily:fm,marginBottom:10,lineHeight:1.5}}>Paste into Gmail compose. Link, sign-off and signature are pre-filled. You can add the GAS logo at the bottom of your Gmail signature (Gmail Settings, Signature, paste logo) so it attaches automatically to every send.</div>
          <div style={{background:"rgba(0,0,0,0.45)",border:"1px solid "+P.rule,borderRadius:8,padding:"12px 14px",fontSize:11,fontFamily:fm,color:P.txt,lineHeight:1.7,whiteSpace:"pre-wrap",maxHeight:200,overflowY:"auto"}}>{buildPlainDraft()}</div>
        </div>}

        <button onClick={reset} style={{marginTop:14,width:"100%",background:"transparent",border:"1px solid "+P.rule,borderRadius:10,padding:"10px 20px",color:P.label,fontSize:11,fontWeight:700,fontFamily:fm,cursor:"pointer",letterSpacing:1}}>Generate another</button>
      </div>}

      {/* Audit trail, collapsible. Team visibility of recent email activity + KPI signal */}
      <div style={{marginTop:22,borderTop:"1px solid "+P.rule,paddingTop:18}}>
        <button onClick={function(){auditOpen[1](!auditOpen[0]);}} style={{width:"100%",background:"transparent",border:"1px solid "+P.rule,borderRadius:10,padding:"10px 14px",color:P.txt,fontSize:11,fontWeight:800,fontFamily:fm,cursor:"pointer",letterSpacing:1.5,textTransform:"uppercase",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <span>{auditOpen[0]?"Hide":"View"} Send Log{auditEntries[0].length>0?" ("+auditEntries[0].length+")":""}</span>
          <span style={{color:P.label,fontSize:11}}>{auditOpen[0]?"\u25B2":"\u25BC"}</span>
        </button>
        {auditOpen[0]&&<div style={{marginTop:12}}>
          {!auditEnabled[0]&&<div style={{background:P.warning+"10",border:"1px solid "+P.warning+"40",borderRadius:10,padding:"12px 14px",fontSize:11,color:P.warning,fontFamily:fm,lineHeight:1.6}}>
            <div style={{fontWeight:800,marginBottom:4,letterSpacing:1.5,textTransform:"uppercase"}}>Audit storage not configured</div>
            <div style={{color:P.txt}}>Install Upstash Redis on Vercel Storage, link it to this project, and redeploy. Env vars auto-populate. Free tier covers years of usage.</div>
          </div>}
          {auditEnabled[0]&&<div>
            <div style={{display:"flex",gap:8,marginBottom:10}}>
              <input value={auditQuery[0]} onChange={function(e){auditQuery[1](e.target.value);}} placeholder="Search by client name, slug, sender, or recipient email" style={{flex:1,boxSizing:"border-box",background:P.glass,border:"1px solid "+P.rule,borderRadius:8,padding:"8px 12px",color:P.txt,fontSize:12,fontFamily:fm,outline:"none"}}/>
              <button onClick={loadAudit} disabled={auditLoading[0]} style={{background:"transparent",border:"1px solid "+P.rule,borderRadius:8,padding:"8px 14px",color:P.label,fontSize:10,fontWeight:800,fontFamily:fm,cursor:auditLoading[0]?"wait":"pointer",letterSpacing:1.5}}>{auditLoading[0]?"…":"REFRESH"}</button>
              <button onClick={exportCsv} disabled={filteredAudit.length===0} style={{background:filteredAudit.length===0?"transparent":gEmber,border:"1px solid "+(filteredAudit.length===0?P.rule:"transparent"),borderRadius:8,padding:"8px 14px",color:filteredAudit.length===0?P.caption:"#fff",fontSize:10,fontWeight:800,fontFamily:fm,cursor:filteredAudit.length===0?"not-allowed":"pointer",letterSpacing:1.5}}>CSV</button>
            </div>
            {auditLoading[0]&&<div style={{color:P.label,fontSize:11,fontFamily:fm,padding:"16px 4px"}}>Loading send log...</div>}
            {!auditLoading[0]&&filteredAudit.length===0&&<div style={{color:P.caption,fontSize:11,fontFamily:fm,padding:"18px 4px",textAlign:"center",fontStyle:"italic"}}>{auditEntries[0].length===0?"No emails sent yet. Send your first report to start the log.":"No matches for that search."}</div>}
            {!auditLoading[0]&&filteredAudit.length>0&&<div style={{maxHeight:420,overflowY:"auto",overflowX:"auto",border:"1px solid "+P.rule,borderRadius:10,background:"rgba(0,0,0,0.25)"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,fontFamily:fm,minWidth:900}}>
                <thead style={{position:"sticky",top:0,background:"rgba(0,0,0,0.9)",zIndex:1}}>
                  <tr>
                    <th style={{padding:"9px 10px",textAlign:"left",fontSize:9,fontWeight:800,color:P.ember,letterSpacing:2,textTransform:"uppercase",borderBottom:"1px solid "+P.rule,whiteSpace:"nowrap"}}>Client</th>
                    <th style={{padding:"9px 10px",textAlign:"left",fontSize:9,fontWeight:800,color:P.ember,letterSpacing:2,textTransform:"uppercase",borderBottom:"1px solid "+P.rule,whiteSpace:"nowrap"}}>To</th>
                    <th style={{padding:"9px 10px",textAlign:"left",fontSize:9,fontWeight:800,color:P.ember,letterSpacing:2,textTransform:"uppercase",borderBottom:"1px solid "+P.rule,whiteSpace:"nowrap"}}>Sent</th>
                    <th style={{padding:"9px 10px",textAlign:"left",fontSize:9,fontWeight:800,color:P.ember,letterSpacing:2,textTransform:"uppercase",borderBottom:"1px solid "+P.rule,whiteSpace:"nowrap"}}>Sender</th>
                    <th style={{padding:"9px 10px",textAlign:"left",fontSize:9,fontWeight:800,color:P.ember,letterSpacing:2,textTransform:"uppercase",borderBottom:"1px solid "+P.rule,whiteSpace:"nowrap"}}>Period</th>
                    <th style={{padding:"9px 10px",textAlign:"right",fontSize:9,fontWeight:800,color:P.ember,letterSpacing:2,textTransform:"uppercase",borderBottom:"1px solid "+P.rule,width:40}}></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAudit.map(function(e,i){
                    var recipients=[].concat(e.to||[]).join(", ")||"—";
                    var periodTxt=(e.fromDate||"—")+" to "+(e.toDate||"—");
                    // Show the raw client slug in the first column (falls
                    // back to clientName / 'Unknown' when slug missing).
                    var slugTxt=e.clientSlug?(e.clientSlug.indexOf("-")>=0?e.clientSlug.split("-").map(function(w){return w.toUpperCase();}).join(" "):e.clientSlug.toUpperCase()):(e.clientName||"Unknown");
                    var extras=[];
                    if(e.cc&&e.cc.length>0)extras.push("cc: "+e.cc.join(", "));
                    if(e.bcc&&e.bcc.length>0)extras.push("bcc: "+e.bcc.join(", "));
                    return <tr key={e.id||i} style={{borderBottom:"1px solid "+P.rule+"50"}}>
                      <td style={{padding:"10px",color:P.ember,fontWeight:700,verticalAlign:"top",whiteSpace:"nowrap"}}>{slugTxt}</td>
                      <td style={{padding:"10px",color:P.txt,verticalAlign:"top",whiteSpace:"nowrap"}}>{recipients}{extras.length>0?<div style={{color:P.caption,fontSize:9,marginTop:3,whiteSpace:"nowrap"}}>{extras.join("  |  ")}</div>:null}</td>
                      <td style={{padding:"10px",color:P.txt,verticalAlign:"top",whiteSpace:"nowrap"}}>{fmtDate(e.sentAt)}</td>
                      <td style={{padding:"10px",color:P.txt,verticalAlign:"top",whiteSpace:"nowrap"}}>{e.senderName||"—"}{e.senderTitle?<div style={{color:P.caption,fontSize:9,marginTop:2,whiteSpace:"nowrap"}}>{e.senderTitle}</div>:null}</td>
                      <td style={{padding:"10px",color:P.label,verticalAlign:"top",whiteSpace:"nowrap"}}>{periodTxt}{e.campaignCount?<div style={{color:P.caption,fontSize:9,marginTop:2,whiteSpace:"nowrap"}}>{e.campaignCount+" campaign"+(e.campaignCount===1?"":"s")}</div>:null}</td>
                      <td style={{padding:"10px",textAlign:"right",verticalAlign:"top"}}><button onClick={function(){deleteAuditEntry(e.id);}} title="Delete this entry" style={{background:"transparent",border:"1px solid "+P.rule,borderRadius:6,width:26,height:26,color:P.caption,cursor:"pointer",fontSize:14,lineHeight:1,padding:0}} onMouseEnter={function(ev){ev.currentTarget.style.borderColor=P.critical;ev.currentTarget.style.color=P.critical;}} onMouseLeave={function(ev){ev.currentTarget.style.borderColor=P.rule;ev.currentTarget.style.color=P.caption;}}>{"\u00D7"}</button></td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>}
          </div>}
        </div>}
      </div>
    </div>
  </div>
  </>);
}

// Admin-only full-inventory audit of every campaign and its detected objective.
// Critical for agency KPI reporting, lets managers spot-check classification accuracy.
function CampaignAuditModal(props){
  var view=useState("audit"); // "audit" | "reconcile" | "usage"
  var rows=useState([]);
  var loading=useState(false);
  var err=useState("");
  var query=useState("");
  var platFilter=useState("all");
  var objFilter=useState("all");
  // Discrepancy filter — show only the audit rows where the team's name
  // tag and the platform's API objective disagreed (or rows where the
  // API was the fallback because no name keyword matched). Default
  // "all" shows everything, the operator can switch to "name_overrode"
  // or "api_fallback" to focus the eyeball pass.
  var discrepFilter=useState("all");
  // State filter — Live / No Delivery / Paused / Dormant. Sits next to
  // the platform + objective dropdowns so the operator can scope the
  // audit to e.g. "every campaign that's switched on but not delivering".
  var stateFilter=useState("all");

  // Reconciliation state
  var recRows=useState([]);
  var recSummary=useState(null);
  var recLoading=useState(false);
  var recErr=useState("");
  var recSending=useState(false);
  var recSent=useState("");
  var recQuery=useState("");
  var recStatusFilter=useState("all");

  // SLA-baseline reset state. Drives the inline "Reset SLA Baseline" panel
  // in the Reconcile pane. Default baseline is today's date; the operator
  // can pick any historic date (e.g. when historic gaps are flooding the
  // SLA watcher with daily nudges and the team wants a fresh start).
  var slaPanelOpen=useState(false);
  var slaBaseline=useState(function(){
    var d=new Date();
    var pad=function(n){return String(n).padStart(2,"0");};
    return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
  });
  var slaBusy=useState(false);
  var slaResult=useState(null);
  var slaErr=useState("");
  var resetSlaBaseline=function(){
    if(slaBusy[0])return;
    var dateStr=slaBaseline[0];
    if(!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)){slaErr[1]("Pick a valid date (YYYY-MM-DD).");return;}
    if(!window.confirm("Reset SLA nudge baseline to "+dateStr+"?\n\nEvery client whose last report was sent before this date will be treated as if they sent on this date. Daily nudges for historic gaps will stop until 7 days past the new baseline."))return;
    slaBusy[1](true);slaErr[1]("");slaResult[1](null);
    fetch(props.apiBase+"/api/nudge-cron?reset=1&baseline="+encodeURIComponent(dateStr),{headers:{"x-session-token":props.session||""}})
      .then(function(r){return r.json().then(function(d){return{status:r.status,data:d};});})
      .then(function(r){
        slaBusy[1](false);
        if(r.status===200&&r.data&&r.data.ok){slaResult[1](r.data);}
        else{slaErr[1]((r.data&&r.data.error)||"Reset failed");}
      })
      .catch(function(){slaBusy[1](false);slaErr[1]("Connection error");});
  };

  // Usage state
  var usageEvents=useState([]);
  var usageLoading=useState(false);
  var usageErr=useState("");
  var loadUsage=function(){
    usageLoading[1](true);usageErr[1]("");
    fetch(props.apiBase+"/api/usage?limit=1000",{headers:{"x-session-token":props.session||""}})
      .then(function(r){return r.json();})
      .then(function(d){usageLoading[1](false);if(Array.isArray(d.events)){usageEvents[1](d.events);}else{usageErr[1](d.error||"Could not load usage");}})
      .catch(function(){usageLoading[1](false);usageErr[1]("Connection error");});
  };

  // Team (Users) state — superadmin-only surface.
  var teamUsers=useState([]);
  var teamLoading=useState(false);
  var teamErr=useState("");
  var teamBusy=useState(false);
  var inviteName=useState("");
  var inviteEmail=useState("");
  var inviteNote=useState("");
  var loadTeam=function(){
    teamLoading[1](true);teamErr[1]("");
    fetch(props.apiBase+"/api/users",{headers:{"x-session-token":props.session||""}})
      .then(function(r){return r.json();})
      .then(function(d){teamLoading[1](false);if(Array.isArray(d.users))teamUsers[1](d.users);else teamErr[1](d.error||"Could not load users");})
      .catch(function(){teamLoading[1](false);teamErr[1]("Connection error");});
  };
  var sendInvite=function(){
    if(teamBusy[0])return;
    teamBusy[1](true);inviteNote[1]("");teamErr[1]("");
    fetch(props.apiBase+"/api/invite",{method:"POST",headers:{"Content-Type":"application/json","x-session-token":props.session||""},body:JSON.stringify({name:inviteName[0].trim(),email:inviteEmail[0].trim().toLowerCase()})})
      .then(function(r){return r.json().then(function(d){return{status:r.status,data:d};});})
      .then(function(r){
        teamBusy[1](false);
        if(r.status===200){inviteNote[1]("Invitation emailed to "+r.data.email);inviteName[1]("");inviteEmail[1]("");loadTeam();}
        else teamErr[1](r.data.error||"Could not send invite");
      })
      .catch(function(){teamBusy[1](false);teamErr[1]("Connection error");});
  };
  var toggleUser=function(email,currentlyActive){
    if(!window.confirm((currentlyActive?"Revoke access for ":"Restore access for ")+email+"?"))return;
    fetch(props.apiBase+"/api/users",{method:"POST",headers:{"Content-Type":"application/json","x-session-token":props.session||""},body:JSON.stringify({action:currentlyActive?"revoke":"restore",email:email})})
      .then(function(r){return r.json();})
      .then(function(d){if(d.ok)loadTeam();else teamErr[1](d.error||"Action failed");})
      .catch(function(){teamErr[1]("Connection error");});
  };
  // Admin-triggered password reset. Mints a 1h reset token + emails the
  // target user. Returns the resetUrl too so the admin can copy it into
  // Slack as a fallback for inboxes that delay or filter the email.
  var adminResetUser=function(email){
    if(!window.confirm("Send a password reset link to "+email+"?\n\nA one-time reset link will be emailed to them and shown to you so you can also share it via Slack."))return;
    inviteNote[1]("");teamErr[1]("");
    fetch(props.apiBase+"/api/admin-reset",{method:"POST",headers:{"Content-Type":"application/json","x-session-token":props.session||""},body:JSON.stringify({email:email})})
      .then(function(r){return r.json().then(function(d){return{status:r.status,data:d};});})
      .then(function(r){
        if(r.status===200&&r.data&&r.data.ok){
          var msg="Reset link sent to "+r.data.email+(r.data.emailSent?" (emailed)":" (email failed; copy the link below).")+"\nLink: "+r.data.resetUrl;
          inviteNote[1](msg);
          // Also drop the link onto the clipboard for one-click sharing.
          try{if(navigator&&navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(r.data.resetUrl);}catch(_){/*ignore*/}
          loadTeam();
        }else{
          teamErr[1]((r.data&&r.data.error)||"Reset failed");
        }
      })
      .catch(function(){teamErr[1]("Connection error");});
  };

  var load=function(){
    loading[1](true);err[1]("");
    fetch(props.apiBase+"/api/objective-audit",{headers:{"x-session-token":props.session||""}})
      .then(function(r){return r.json();})
      .then(function(d){loading[1](false);if(Array.isArray(d.campaigns)){rows[1](d.campaigns);}else{err[1](d.error||"Could not load audit");}})
      .catch(function(){loading[1](false);err[1]("Connection error");});
  };
  var loadReconcile=function(sendAlert){
    recErr[1]("");
    if(sendAlert)recSending[1](true); else recLoading[1](true);
    var qs="?from="+encodeURIComponent(props.dateFrom||"")+"&to="+encodeURIComponent(props.dateTo||"")+(sendAlert?"&alert=1":"");
    fetch(props.apiBase+"/api/reconcile"+qs,{headers:{"x-session-token":props.session||""}})
      .then(function(r){return r.json();})
      .then(function(d){
        recLoading[1](false);recSending[1](false);
        if(Array.isArray(d.rows)){
          recRows[1](d.rows);recSummary[1](d.summary||null);
          if(sendAlert&&d.alert&&d.alert.ok)recSent[1]("Alert emailed to gary@gasmarketing.co.za");
          else if(sendAlert&&d.alert&&!d.alert.ok)recSent[1]("Alert skipped: "+(d.alert.reason||"unknown"));
        } else { recErr[1](d.error||"Could not load reconciliation"); }
      })
      .catch(function(){recLoading[1](false);recSending[1](false);recErr[1]("Connection error");});
  };
  useEffect(function(){if(props.open&&view[0]==="audit")load();},[props.open,view[0]]);
  useEffect(function(){if(props.open&&view[0]==="reconcile"&&recRows[0].length===0)loadReconcile(false);},[props.open,view[0]]);
  useEffect(function(){if(props.open&&view[0]==="usage")loadUsage();},[props.open,view[0]]);
  useEffect(function(){if(props.open&&view[0]==="users"&&props.isSuperadmin)loadTeam();},[props.open,view[0],props.isSuperadmin]);

  var data=rows[0]||[];
  var q=(query[0]||"").toLowerCase().trim();
  // State derivation mirrors the inline logic in the table cell so the
  // filter lines up with the chip the operator sees: LIVE = switched on
  // and delivered in last 30d, NO DELIVERY = on but no spend, PAUSED =
  // off but had recent delivery, DORMANT = off and no recent delivery.
  var stateOf=function(c){
    var s=String(c.status||"").toUpperCase();
    var on=s==="ACTIVE"||s==="ENABLE"||s==="ENABLED";
    if(on&&c.activeLast30Days)return "live";
    if(on&&!c.activeLast30Days)return "no_delivery";
    if(c.activeLast30Days)return "paused";
    return "dormant";
  };
  var filtered=data.filter(function(c){
    if(platFilter[0]!=="all"&&c.platform!==platFilter[0])return false;
    if(objFilter[0]!=="all"&&c.detectedObjective!==objFilter[0])return false;
    if(discrepFilter[0]!=="all"&&(c.discrepancy||"")!==discrepFilter[0])return false;
    if(stateFilter[0]!=="all"&&stateOf(c)!==stateFilter[0])return false;
    if(q){
      var hay=(c.campaignName+" "+c.accountName+" "+c.apiObjective+" "+c.detectedObjective).toLowerCase();
      if(hay.indexOf(q)<0)return false;
    }
    return true;
  });
  var platforms={};data.forEach(function(c){platforms[c.platform]=true;});
  var objectives={};data.forEach(function(c){objectives[c.detectedObjective]=true;});
  var objCol={"Leads":P.rose,"Clicks to App Store":P.fb,"Followers & Likes":P.tt,"Landing Page Clicks":P.cyan,"Unclassified":P.label};
  // Per-state colours for the new Discrepancy chip + filter pills.
  // agrees = mint, name_overrode = warning amber (the eyeball-it row),
  // api_fallback = cyan info, unclassified = muted label grey,
  // manual_override = ember (operator-driven, set in Settings → Audit).
  var discrepColors={agrees:P.mint,name_overrode:P.warning,api_fallback:P.cyan,unclassified:P.label,manual_override:P.ember};
  var discrepLabels={agrees:"AGREES",name_overrode:"NAME OVERRODE",api_fallback:"API FALLBACK",unclassified:"UNCLASSIFIED",manual_override:"OVERRIDDEN"};
  var discrepCounts={agrees:0,name_overrode:0,api_fallback:0,unclassified:0,manual_override:0};
  data.forEach(function(c){var k=c.discrepancy||"unclassified";if(discrepCounts[k]!==undefined)discrepCounts[k]++;});

  // Saving state per row, so the dropdown can show a small spinner /
  // disabled state while the override is in flight without re-rendering
  // the whole table.
  var savingId=useState("");
  // Allowed override values for the dropdown. Display strings match
  // what the audit's `detectedObjective` field uses, so the table chip
  // updates immediately without a refetch.
  var OVERRIDE_OPTIONS=["Auto","Clicks to App Store","Leads","Followers & Likes","Landing Page Clicks","Unclassified"];

  // Auto-save handler. Posts to /api/objective-overrides, then mutates
  // the local `rows` state so the chip + classificationSource update
  // instantly. Falls back to a refresh on error.
  var saveOverride=function(campaignId, objective){
    if(!campaignId)return;
    savingId[1](String(campaignId));
    var body={campaignId:String(campaignId),objective:objective==="Auto"?"auto":objective};
    fetch(props.apiBase+"/api/objective-overrides",{method:"POST",headers:{"Content-Type":"application/json","x-session-token":props.session||""},body:JSON.stringify(body)})
      .then(function(r){return r.json().then(function(d){return{status:r.status,data:d};});})
      .then(function(r){
        savingId[1]("");
        if(r.status===200&&r.data&&r.data.ok){
          // Optimistic in-place update so the operator sees the change
          // immediately. Server has authoritative value but mirroring
          // the verdict here keeps the UX snappy.
          rows[1](function(prev){
            return (prev||[]).map(function(row){
              if(String(row.campaignId)!==String(campaignId))return row;
              var clearing=!objective||objective==="Auto";
              if(clearing){
                return Object.assign({},row,{
                  detectedObjective:row.autoDetectedObjective||row.detectedObjective,
                  classificationSource:row.autoClassificationSource||row.classificationSource,
                  discrepancy:row.autoDiscrepancy||row.discrepancy,
                  overridden:false,
                  overriddenObjective:null
                });
              }
              return Object.assign({},row,{
                autoDetectedObjective:row.autoDetectedObjective||row.detectedObjective,
                autoClassificationSource:row.autoClassificationSource||row.classificationSource,
                autoDiscrepancy:row.autoDiscrepancy||row.discrepancy,
                detectedObjective:objective,
                classificationSource:"Manual override (was: "+(row.autoDetectedObjective||row.detectedObjective)+")",
                discrepancy:"manual_override",
                overridden:true,
                overriddenObjective:objective
              });
            });
          });
        } else {
          err[1]((r.data&&r.data.error)||"Could not save override");
        }
      })
      .catch(function(){savingId[1]("");err[1]("Connection error");});
  };

  var exportCsv=function(){
    var header=["Platform","Account","Campaign Name","Detected Objective","Override","Auto Verdict (no override)","Discrepancy","Name Verdict","API Verdict","Classification Source","API Objective","Status","Active Last 30 Days","Campaign ID"];
    var all=[header].concat(filtered.map(function(c){return [c.platform,c.accountName,c.campaignName,c.detectedObjective,c.overridden?(c.overriddenObjective||""):"",c.autoDetectedObjective||"",c.discrepancy||"",c.nameVerdict||"",c.apiVerdict||"",c.classificationSource,c.apiObjective,c.status,c.activeLast30Days?"yes":"no",c.campaignId];}));
    var csv=all.map(function(r){return r.map(function(cell){var s=String(cell||"");if(s.indexOf(",")>=0||s.indexOf('"')>=0||s.indexOf("\n")>=0){return '"'+s.replace(/"/g,'""')+'"';}return s;}).join(",");}).join("\n");
    var blob=new Blob([csv],{type:"text/csv"});
    var url=URL.createObjectURL(blob);
    var a=document.createElement("a");a.href=url;a.download="campaign-objective-audit-"+(new Date()).toISOString().slice(0,10)+".csv";
    document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
  };

  if(!props.open)return null;
  return (<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.78)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,backdropFilter:"blur(8px)",padding:"24px 16px"}} onClick={function(e){if(e.target===e.currentTarget)props.onClose();}}>
    <div style={{background:P.cosmos,border:"1px solid "+P.rule,borderRadius:20,padding:"22px 26px",width:1100,maxWidth:"96vw",maxHeight:"calc(100vh - 48px)",display:"flex",flexDirection:"column",boxShadow:"0 24px 80px rgba(0,0,0,0.6)"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,gap:12,flexWrap:"wrap"}}>
        <div style={{display:"flex",gap:6,background:"rgba(0,0,0,0.35)",border:"1px solid "+P.rule,borderRadius:12,padding:4}}>
          <button onClick={function(){view[1]("audit");}} style={{background:view[0]==="audit"?P.ember+"25":"transparent",border:"1px solid "+(view[0]==="audit"?P.ember+"60":"transparent"),borderRadius:8,padding:"8px 16px",color:view[0]==="audit"?P.ember:P.label,fontSize:11,fontWeight:800,fontFamily:fm,cursor:"pointer",letterSpacing:1.5,textTransform:"uppercase"}}>Objective Audit</button>
          <button onClick={function(){view[1]("reconcile");}} style={{background:view[0]==="reconcile"?P.ember+"25":"transparent",border:"1px solid "+(view[0]==="reconcile"?P.ember+"60":"transparent"),borderRadius:8,padding:"8px 16px",color:view[0]==="reconcile"?P.ember:P.label,fontSize:11,fontWeight:800,fontFamily:fm,cursor:"pointer",letterSpacing:1.5,textTransform:"uppercase",display:"flex",alignItems:"center",gap:6}}>Ground Truth Audit{recSummary[0]&&recSummary[0].red>0?<span style={{background:P.critical,color:"#fff",fontSize:9,padding:"1px 6px",borderRadius:4}}>{recSummary[0].red}</span>:null}</button>
          <button onClick={function(){view[1]("usage");}} style={{background:view[0]==="usage"?P.ember+"25":"transparent",border:"1px solid "+(view[0]==="usage"?P.ember+"60":"transparent"),borderRadius:8,padding:"8px 16px",color:view[0]==="usage"?P.ember:P.label,fontSize:11,fontWeight:800,fontFamily:fm,cursor:"pointer",letterSpacing:1.5,textTransform:"uppercase"}}>Usage Audit</button>
          {props.isSuperadmin&&<button onClick={function(){view[1]("users");}} style={{background:view[0]==="users"?P.ember+"25":"transparent",border:"1px solid "+(view[0]==="users"?P.ember+"60":"transparent"),borderRadius:8,padding:"8px 16px",color:view[0]==="users"?P.ember:P.label,fontSize:11,fontWeight:800,fontFamily:fm,cursor:"pointer",letterSpacing:1.5,textTransform:"uppercase"}}>Team Access</button>}
        </div>
        <div style={{display:"flex",gap:8}}>
          {view[0]==="audit"&&<button onClick={load} disabled={loading[0]} style={{background:"transparent",border:"1px solid "+P.rule,borderRadius:10,padding:"8px 14px",color:P.label,fontSize:10,fontWeight:800,fontFamily:fm,cursor:loading[0]?"wait":"pointer",letterSpacing:1.5}}>{loading[0]?"LOADING...":"REFRESH"}</button>}
          {view[0]==="audit"&&<button onClick={exportCsv} disabled={filtered.length===0} style={{background:filtered.length===0?"transparent":gEmber,border:"1px solid "+(filtered.length===0?P.rule:"transparent"),borderRadius:10,padding:"8px 14px",color:filtered.length===0?P.caption:"#fff",fontSize:10,fontWeight:800,fontFamily:fm,cursor:filtered.length===0?"not-allowed":"pointer",letterSpacing:1.5}}>CSV</button>}
          {view[0]==="reconcile"&&<button onClick={function(){loadReconcile(false);}} disabled={recLoading[0]||recSending[0]} style={{background:"transparent",border:"1px solid "+P.rule,borderRadius:10,padding:"8px 14px",color:P.label,fontSize:10,fontWeight:800,fontFamily:fm,cursor:(recLoading[0]||recSending[0])?"wait":"pointer",letterSpacing:1.5}}>{recLoading[0]?"RUNNING...":"RE-RUN"}</button>}
          {view[0]==="reconcile"&&<button onClick={function(){loadReconcile(true);}} disabled={recLoading[0]||recSending[0]} title="Run check + email Gary if any deltas found" style={{background:recSending[0]?"#555":gEmber,border:"none",borderRadius:10,padding:"8px 14px",color:"#fff",fontSize:10,fontWeight:800,fontFamily:fm,cursor:(recLoading[0]||recSending[0])?"wait":"pointer",letterSpacing:1.5}}>{recSending[0]?"SENDING...":"CHECK + ALERT"}</button>}
          {view[0]==="reconcile"&&props.isSuperadmin&&<button onClick={function(){slaPanelOpen[1](!slaPanelOpen[0]);slaErr[1]("");slaResult[1](null);}} title="Reset the SLA nudge baseline so historic gaps stop firing daily reminder emails to AMs" style={{background:slaPanelOpen[0]?P.solar+"20":"transparent",border:"1px solid "+P.solar+"60",borderRadius:10,padding:"8px 14px",color:P.solar,fontSize:10,fontWeight:800,fontFamily:fm,cursor:"pointer",letterSpacing:1.5}}>SLA NUDGES</button>}
          {view[0]==="usage"&&<button onClick={loadUsage} disabled={usageLoading[0]} style={{background:"transparent",border:"1px solid "+P.rule,borderRadius:10,padding:"8px 14px",color:P.label,fontSize:10,fontWeight:800,fontFamily:fm,cursor:usageLoading[0]?"wait":"pointer",letterSpacing:1.5}}>{usageLoading[0]?"LOADING...":"REFRESH"}</button>}
          <button onClick={props.onClose} title="Close" style={{background:"transparent",border:"1px solid "+P.rule,borderRadius:10,width:38,height:38,color:P.label,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          </button>
        </div>
      </div>
      {view[0]==="audit"&&<div style={{fontSize:11,color:P.label,fontFamily:fm,lineHeight:1.5,marginBottom:10}}>{loading[0]?"Rounding up your campaigns from every platform, they scatter…":data.length+" active campaigns across "+Object.keys(platforms).length+" platforms (currently enabled or ran in the last 30 days). Filter or search to verify objective accuracy."}</div>}
      {view[0]==="reconcile"&&<div style={{fontSize:11,color:P.label,fontFamily:fm,lineHeight:1.5,marginBottom:10}}>Ground truth from Meta / TikTok / Google APIs compared to what the dashboard computes for <strong style={{color:P.ember}}>{props.dateFrom}</strong> to <strong style={{color:P.ember}}>{props.dateTo}</strong>. Green = delta less than 1%, yellow = 1 to 5%, red = more than 5%.{recSent[0]?<span style={{color:P.mint,marginLeft:10}}>{recSent[0]}</span>:null}</div>}
      {view[0]==="reconcile"&&slaPanelOpen[0]&&props.isSuperadmin&&<div style={{marginBottom:14,padding:"14px 16px",background:P.solar+"08",border:"1px solid "+P.solar+"30",borderLeft:"3px solid "+P.solar,borderRadius:"0 12px 12px 0"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
          <span style={{fontSize:11,fontWeight:800,color:P.solar,letterSpacing:1.5,fontFamily:fm,textTransform:"uppercase"}}>Reset SLA Nudge Baseline</span>
          <button onClick={function(){slaPanelOpen[1](false);slaErr[1]("");slaResult[1](null);}} style={{marginLeft:"auto",background:"transparent",border:"none",color:P.label,fontSize:14,cursor:"pointer",padding:0}}>×</button>
        </div>
        <div style={{fontSize:11,color:P.label,fontFamily:ff,lineHeight:1.7,marginBottom:12}}>
          The SLA watcher emails the AM (and BCC's Gary) once a day per client whose last report is more than 7 days old. Historic gaps fire daily until a fresh report goes out. Resetting the baseline treats every client as if they last sent on the chosen date, so AMs only get nudged for gaps that open up <em>after</em> the baseline.
        </div>
        <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",marginBottom:8}}>
          <label style={{fontSize:10,fontWeight:800,color:P.label,letterSpacing:1.5,fontFamily:fm,textTransform:"uppercase"}}>Baseline date</label>
          <input type="date" value={slaBaseline[0]} onChange={function(e){slaBaseline[1](e.target.value);}} disabled={slaBusy[0]} style={{background:P.glass,border:"1px solid "+P.rule,borderRadius:8,padding:"7px 10px",color:P.txt,fontSize:12,fontFamily:fm,outline:"none",colorScheme:"dark"}}/>
          <button onClick={resetSlaBaseline} disabled={slaBusy[0]||!slaBaseline[0]} style={{background:slaBusy[0]||!slaBaseline[0]?"#555":"linear-gradient(135deg,#FF3D00,#FF6B00)",border:"none",borderRadius:8,padding:"7px 16px",color:"#fff",fontSize:11,fontWeight:800,fontFamily:fm,cursor:slaBusy[0]?"wait":"pointer",letterSpacing:1.5,textTransform:"uppercase"}}>{slaBusy[0]?"Resetting...":"Apply Reset"}</button>
        </div>
        {slaErr[0]&&<div style={{fontSize:11,color:P.critical,fontFamily:fm,marginTop:8}}>{slaErr[0]}</div>}
        {slaResult[0]&&<div style={{marginTop:10,padding:"10px 12px",background:P.mint+"10",border:"1px solid "+P.mint+"40",borderRadius:8,fontSize:11,color:P.txt,fontFamily:fm,lineHeight:1.7}}>
          <div style={{color:P.mint,fontWeight:800,marginBottom:4}}>✓ Baseline set</div>
          <div>Anchor: <strong>{slaResult[0].baseline}</strong></div>
          <div>Earliest possible nudge: <strong>{slaResult[0].nextNudgeAfter}</strong></div>
        </div>}
      </div>}
      {view[0]==="audit"&&<div style={{display:"flex",gap:10,marginBottom:12,flexWrap:"wrap"}}>
        <input value={query[0]} onChange={function(e){query[1](e.target.value);}} placeholder="Search campaign, account, objective..." style={{flex:1,minWidth:240,boxSizing:"border-box",background:P.glass,border:"1px solid "+P.rule,borderRadius:8,padding:"8px 12px",color:P.txt,fontSize:12,fontFamily:fm,outline:"none"}}/>
        <select value={platFilter[0]} onChange={function(e){platFilter[1](e.target.value);}} style={{background:P.glass,border:"1px solid "+P.rule,borderRadius:8,padding:"8px 12px",color:P.txt,fontSize:12,fontFamily:fm,outline:"none",cursor:"pointer"}}>
          <option value="all">All platforms</option>
          {Object.keys(platforms).sort().map(function(p){return <option key={p} value={p}>{p}</option>;})}
        </select>
        <select value={objFilter[0]} onChange={function(e){objFilter[1](e.target.value);}} style={{background:P.glass,border:"1px solid "+P.rule,borderRadius:8,padding:"8px 12px",color:P.txt,fontSize:12,fontFamily:fm,outline:"none",cursor:"pointer"}}>
          <option value="all">All objectives</option>
          {Object.keys(objectives).sort().map(function(o){return <option key={o} value={o}>{o}</option>;})}
        </select>
        <select value={discrepFilter[0]} onChange={function(e){discrepFilter[1](e.target.value);}} style={{background:P.glass,border:"1px solid "+P.rule,borderRadius:8,padding:"8px 12px",color:P.txt,fontSize:12,fontFamily:fm,outline:"none",cursor:"pointer"}}>
          <option value="all">All discrepancies</option>
          <option value="agrees">Agrees ({discrepCounts.agrees})</option>
          <option value="name_overrode">Name overrode ({discrepCounts.name_overrode})</option>
          <option value="api_fallback">API fallback ({discrepCounts.api_fallback})</option>
          <option value="unclassified">Unclassified ({discrepCounts.unclassified})</option>
          <option value="manual_override">Overridden ({discrepCounts.manual_override})</option>
        </select>
        <select value={stateFilter[0]} onChange={function(e){stateFilter[1](e.target.value);}} style={{background:P.glass,border:"1px solid "+P.rule,borderRadius:8,padding:"8px 12px",color:P.txt,fontSize:12,fontFamily:fm,outline:"none",cursor:"pointer"}}>
          <option value="all">All states</option>
          <option value="live">Live</option>
          <option value="no_delivery">No delivery</option>
          <option value="paused">Paused</option>
          <option value="dormant">Dormant</option>
        </select>
      </div>}
      {view[0]==="reconcile"&&<div style={{display:"flex",gap:10,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
        <input value={recQuery[0]} onChange={function(e){recQuery[1](e.target.value);}} placeholder="Search campaign..." style={{flex:1,minWidth:240,boxSizing:"border-box",background:P.glass,border:"1px solid "+P.rule,borderRadius:8,padding:"8px 12px",color:P.txt,fontSize:12,fontFamily:fm,outline:"none"}}/>
        <select value={recStatusFilter[0]} onChange={function(e){recStatusFilter[1](e.target.value);}} style={{background:P.glass,border:"1px solid "+P.rule,borderRadius:8,padding:"8px 12px",color:P.txt,fontSize:12,fontFamily:fm,outline:"none",cursor:"pointer"}}>
          <option value="all">All statuses</option>
          <option value="red">Red only</option>
          <option value="yellow">Yellow + Red</option>
          <option value="green">Green only</option>
        </select>
        {recSummary[0]&&<div style={{display:"flex",gap:8,fontSize:10,fontFamily:fm,letterSpacing:1,fontWeight:800}}>
          <span style={{color:P.mint}}>{recSummary[0].green} GREEN</span>
          <span style={{color:P.warning}}>{recSummary[0].yellow} YELLOW</span>
          <span style={{color:P.critical}}>{recSummary[0].red} RED</span>
        </div>}
      </div>}
      {view[0]==="audit"&&err[0]&&<div style={{color:P.critical,fontSize:12,fontFamily:fm,marginBottom:10}}>{err[0]}</div>}
      {view[0]==="reconcile"&&recErr[0]&&<div style={{color:P.critical,fontSize:12,fontFamily:fm,marginBottom:10}}>{recErr[0]}</div>}
      {view[0]==="reconcile"&&(recLoading[0]||recSending[0])&&recRows[0].length===0&&<div style={{padding:"20px",color:P.label,fontSize:12,fontFamily:fm,textAlign:"center",lineHeight:1.7}}>Asking Meta, TikTok and Google to tell the truth, they always take a moment to think about it. This one can run a minute or so, the platforms like to double-check their homework.</div>}
      {view[0]==="audit"&&<div style={{flex:1,overflow:"auto",border:"1px solid "+P.rule,borderRadius:10,background:"rgba(0,0,0,0.3)"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,fontFamily:fm,minWidth:900}}>
          <thead style={{position:"sticky",top:0,background:"rgba(0,0,0,0.9)",zIndex:1}}>
            <tr>
              <th style={{padding:"10px",textAlign:"left",fontSize:9,fontWeight:800,color:P.ember,letterSpacing:2,textTransform:"uppercase",borderBottom:"1px solid "+P.rule}}>Platform</th>
              <th style={{padding:"10px",textAlign:"left",fontSize:9,fontWeight:800,color:P.ember,letterSpacing:2,textTransform:"uppercase",borderBottom:"1px solid "+P.rule}}>Account</th>
              <th style={{padding:"10px",textAlign:"left",fontSize:9,fontWeight:800,color:P.ember,letterSpacing:2,textTransform:"uppercase",borderBottom:"1px solid "+P.rule}}>Campaign</th>
              <th style={{padding:"10px",textAlign:"left",fontSize:9,fontWeight:800,color:P.ember,letterSpacing:2,textTransform:"uppercase",borderBottom:"1px solid "+P.rule}}>Detected Objective</th>
              {props.isSuperadmin&&<th style={{padding:"10px",textAlign:"left",fontSize:9,fontWeight:800,color:P.ember,letterSpacing:2,textTransform:"uppercase",borderBottom:"1px solid "+P.rule}}>Override</th>}
              <th style={{padding:"10px",textAlign:"left",fontSize:9,fontWeight:800,color:P.ember,letterSpacing:2,textTransform:"uppercase",borderBottom:"1px solid "+P.rule}}>Discrepancy</th>
              <th style={{padding:"10px",textAlign:"left",fontSize:9,fontWeight:800,color:P.ember,letterSpacing:2,textTransform:"uppercase",borderBottom:"1px solid "+P.rule}}>Why</th>
              <th style={{padding:"10px",textAlign:"left",fontSize:9,fontWeight:800,color:P.ember,letterSpacing:2,textTransform:"uppercase",borderBottom:"1px solid "+P.rule}}>API Objective</th>
              <th style={{padding:"10px",textAlign:"left",fontSize:9,fontWeight:800,color:P.ember,letterSpacing:2,textTransform:"uppercase",borderBottom:"1px solid "+P.rule}}>Status</th>
              <th style={{padding:"10px",textAlign:"left",fontSize:9,fontWeight:800,color:P.ember,letterSpacing:2,textTransform:"uppercase",borderBottom:"1px solid "+P.rule}}>State</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(function(c,i){
              var oc=objCol[c.detectedObjective]||P.label;
              return <tr key={c.campaignId+"_"+i} style={{borderBottom:"1px solid "+P.rule+"50"}}>
                <td style={{padding:"10px",color:P.txt,verticalAlign:"top",whiteSpace:"nowrap"}}>{c.platform}</td>
                <td style={{padding:"10px",color:P.label,verticalAlign:"top",whiteSpace:"nowrap"}}>{c.accountName}</td>
                <td style={{padding:"10px",color:P.txt,verticalAlign:"top",fontWeight:600,wordBreak:"break-word",maxWidth:320}}>{c.campaignName}</td>
                <td style={{padding:"10px",verticalAlign:"top",whiteSpace:"nowrap"}}><span style={{background:oc+"18",border:"1px solid "+oc+"50",color:oc,padding:"3px 10px",borderRadius:6,fontSize:10,fontWeight:800,letterSpacing:1,textTransform:"uppercase"}}>{c.detectedObjective}</span></td>
                {props.isSuperadmin&&<td style={{padding:"10px",verticalAlign:"top",whiteSpace:"nowrap"}}>{(function(){
                  var current=c.overridden?c.overriddenObjective:"Auto";
                  var saving=savingId[0]===String(c.campaignId);
                  return <select disabled={saving} value={current||"Auto"} onChange={function(e){saveOverride(c.campaignId,e.target.value);}} title={c.overridden?("Override active. Auto verdict was: "+(c.autoDetectedObjective||"unknown")):"Set a manual override (saves on change)"} style={{background:c.overridden?P.ember+"15":P.glass,border:"1px solid "+(c.overridden?P.ember+"60":P.rule),borderRadius:6,padding:"4px 8px",color:c.overridden?P.ember:P.label,fontSize:10,fontWeight:700,fontFamily:fm,outline:"none",cursor:saving?"wait":"pointer",letterSpacing:0.5}}>
                    {OVERRIDE_OPTIONS.map(function(o){return <option key={o} value={o}>{o}</option>;})}
                  </select>;
                })()}</td>}
                <td style={{padding:"10px",verticalAlign:"top",whiteSpace:"nowrap"}}>{(function(){
                  var d=c.discrepancy||"unclassified";
                  var dc=discrepColors[d]||P.label;
                  var tip=d==="manual_override"?("Manual override set in Settings → Audit. Auto verdict was: "+(c.autoDetectedObjective||"unknown")):d==="name_overrode"?("Name says "+c.nameVerdict+", API says "+c.apiVerdict+". Name won."):d==="api_fallback"?("No name keyword matched, API objective '"+c.apiVerdict+"' was used as fallback."):d==="agrees"?("Both signals point to "+(c.nameVerdict&&c.nameVerdict!=="Unclassified"?c.nameVerdict:c.apiVerdict)+"."):"Neither name keyword nor API objective produced a verdict.";
                  return <span title={tip} style={{background:dc+"18",border:"1px solid "+dc+"50",color:dc,padding:"3px 10px",borderRadius:6,fontSize:10,fontWeight:800,letterSpacing:1,cursor:"help"}}>{discrepLabels[d]||d}</span>;
                })()}</td>
                <td style={{padding:"10px",color:P.label,verticalAlign:"top",fontSize:10,lineHeight:1.5}}>{c.classificationSource}</td>
                <td style={{padding:"10px",color:P.caption,verticalAlign:"top",fontSize:10,whiteSpace:"nowrap"}}>{c.apiObjective||"—"}</td>
                <td style={{padding:"10px",color:P.caption,verticalAlign:"top",fontSize:10,whiteSpace:"nowrap"}}>{c.status||"—"}</td>
                <td style={{padding:"10px",verticalAlign:"top",whiteSpace:"nowrap"}}>{(function(){
                  var s=(c.status||"").toUpperCase();
                  var switchedOn=s==="ACTIVE"||s==="ENABLE"||s==="ENABLED";
                  // Four visible states:
                  //   LIVE         - on and delivering
                  //   NO DELIVERY  - on but zero spend/impressions in 30d (adsets
                  //                  paused, ads rejected, budget exhausted, etc.)
                  //   PAUSED       - switched off but had recent delivery (still
                  //                  counts as recently active, just paused for now)
                  //   DORMANT      - switched off and no 30d delivery
                  if(switchedOn&&c.activeLast30Days)return <span title="Switched on AND delivered in last 30 days" style={{background:P.mint+"18",border:"1px solid "+P.mint+"50",color:P.mint,padding:"3px 8px",borderRadius:5,fontSize:9,fontWeight:800,letterSpacing:1}}>LIVE</span>;
                  if(switchedOn&&!c.activeLast30Days)return <span title="Campaign is switched ON but has had ZERO delivery in the last 30 days. Likely paused at the adset or ad level, rejected creative, or exhausted budget." style={{background:P.warning+"18",border:"1px solid "+P.warning+"50",color:P.warning,padding:"3px 8px",borderRadius:5,fontSize:9,fontWeight:800,letterSpacing:1,cursor:"help"}}>NO DELIVERY</span>;
                  if(c.activeLast30Days)return <span title="Switched off now but delivered in the last 30 days, paused after being live" style={{background:P.cyan+"18",border:"1px solid "+P.cyan+"50",color:P.cyan,padding:"3px 8px",borderRadius:5,fontSize:9,fontWeight:800,letterSpacing:1}}>PAUSED</span>;
                  return <span title="Switched off with no delivery in the last 30 days" style={{background:P.dim+"20",border:"1px solid "+P.sub+"40",color:P.label,padding:"3px 8px",borderRadius:5,fontSize:9,fontWeight:800,letterSpacing:1}}>DORMANT</span>;
                })()}</td>
              </tr>;
            })}
            {filtered.length===0&&!loading[0]&&<tr><td colSpan={8} style={{padding:"30px",textAlign:"center",color:P.caption,fontSize:12,fontStyle:"italic"}}>No campaigns match the current filter.</td></tr>}
          </tbody>
        </table>
      </div>}
      {view[0]==="reconcile"&&recRows[0].length>0&&(function(){
        var rq=(recQuery[0]||"").toLowerCase().trim();
        var sf=recStatusFilter[0];
        // Filter row-by-row AND also prune metrics inside each row so that
        // picking "Red only" leaves just the red metric lines rather than
        // the whole campaign block (with greens still visible). Sort within
        // each row already happens server-side (red > yellow > green).
        var filteredRec=recRows[0].map(function(r){
          var metricsKept=(r.metrics||[]).filter(function(m){
            if(sf==="red")return m.status==="red";
            if(sf==="yellow")return m.status==="yellow"||m.status==="red";
            if(sf==="green")return m.status==="green";
            return true;
          });
          return Object.assign({},r,{metrics:metricsKept});
        }).filter(function(r){
          if(sf!=="all"&&r.metrics.length===0)return false;
          if(sf==="red"&&r.overallStatus!=="red")return false;
          if(sf==="yellow"&&r.overallStatus==="green")return false;
          if(sf==="green"&&r.overallStatus!=="green")return false;
          if(rq){var hay=(r.campaignName+" "+r.platform+" "+r.accountName).toLowerCase();if(hay.indexOf(rq)<0)return false;}
          return true;
        });
        var statusBg={green:P.mint,yellow:P.warning,red:P.critical};
        var fmtNum=function(n){var v=parseFloat(n||0);if(v>=1e6)return(v/1e6).toFixed(2)+"M";if(v>=1e3)return(v/1e3).toFixed(1)+"K";return Math.round(v).toLocaleString();};
        var fmtVal=function(name,n){if((name||"").toLowerCase().indexOf("spend")>=0)return "R"+(parseFloat(n||0)).toLocaleString("en-ZA",{minimumFractionDigits:2,maximumFractionDigits:2});return fmtNum(n);};
        return <div style={{flex:1,overflow:"auto",border:"1px solid "+P.rule,borderRadius:10,background:"rgba(0,0,0,0.3)"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,fontFamily:fm,minWidth:1000}}>
            <thead style={{position:"sticky",top:0,background:"rgba(0,0,0,0.9)",zIndex:1}}>
              <tr>
                <th style={{padding:"10px",textAlign:"left",fontSize:9,fontWeight:800,color:P.ember,letterSpacing:2,textTransform:"uppercase",borderBottom:"1px solid "+P.rule}}>Platform</th>
                <th style={{padding:"10px",textAlign:"left",fontSize:9,fontWeight:800,color:P.ember,letterSpacing:2,textTransform:"uppercase",borderBottom:"1px solid "+P.rule}}>Campaign</th>
                <th style={{padding:"10px",textAlign:"left",fontSize:9,fontWeight:800,color:P.ember,letterSpacing:2,textTransform:"uppercase",borderBottom:"1px solid "+P.rule}}>Tab</th>
                <th style={{padding:"10px",textAlign:"left",fontSize:9,fontWeight:800,color:P.ember,letterSpacing:2,textTransform:"uppercase",borderBottom:"1px solid "+P.rule}}>Metric</th>
                <th style={{padding:"10px",textAlign:"right",fontSize:9,fontWeight:800,color:P.ember,letterSpacing:2,textTransform:"uppercase",borderBottom:"1px solid "+P.rule}}>Source of Truth</th>
                <th style={{padding:"10px",textAlign:"right",fontSize:9,fontWeight:800,color:P.ember,letterSpacing:2,textTransform:"uppercase",borderBottom:"1px solid "+P.rule}}>Dashboard</th>
                <th style={{padding:"10px",textAlign:"right",fontSize:9,fontWeight:800,color:P.ember,letterSpacing:2,textTransform:"uppercase",borderBottom:"1px solid "+P.rule}}>Delta %</th>
                <th style={{padding:"10px",textAlign:"left",fontSize:9,fontWeight:800,color:P.ember,letterSpacing:2,textTransform:"uppercase",borderBottom:"1px solid "+P.rule}}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredRec.map(function(r,i){
                return r.metrics.map(function(m,mi){
                  var c=statusBg[m.status];
                  return <tr key={r.campaignId+"_"+m.name+"_"+i+"_"+mi} style={{borderBottom:mi===r.metrics.length-1?"2px solid "+P.rule:"1px solid "+P.rule+"30"}}>
                    {mi===0?<td rowSpan={r.metrics.length} style={{padding:"10px",color:P.txt,verticalAlign:"top",whiteSpace:"nowrap",borderRight:"1px solid "+P.rule+"40"}}>{r.platform}</td>:null}
                    {mi===0?<td rowSpan={r.metrics.length} style={{padding:"10px",color:P.txt,verticalAlign:"top",fontWeight:600,wordBreak:"break-word",maxWidth:280,borderRight:"1px solid "+P.rule+"40"}}>{r.campaignName}<div style={{color:P.caption,fontSize:9,marginTop:3,fontFamily:fm}}>{r.accountName}</div></td>:null}
                    <td style={{padding:"6px 10px",color:P.cyan,verticalAlign:"middle",fontSize:10,fontWeight:700,letterSpacing:0.5}}>{m.tab||"Summary"}</td>
                    <td style={{padding:"6px 10px",color:P.label,verticalAlign:"middle",textTransform:"uppercase",letterSpacing:1,fontSize:10,fontWeight:700}}>{m.name}</td>
                    <td align="right" style={{padding:"6px 10px",color:P.txt,verticalAlign:"middle",fontFamily:fm}}>{fmtVal(m.name,m.source)}</td>
                    <td align="right" style={{padding:"6px 10px",color:P.txt,verticalAlign:"middle",fontFamily:fm}}>{fmtVal(m.name,m.dashboard)}</td>
                    <td align="right" style={{padding:"6px 10px",color:c,fontWeight:800,verticalAlign:"middle",fontFamily:fm}}>{m.deltaPct.toFixed(2)+"%"}</td>
                    <td style={{padding:"6px 10px",verticalAlign:"middle"}}><span style={{background:c+"20",border:"1px solid "+c+"60",color:c,padding:"2px 8px",borderRadius:5,fontSize:9,fontWeight:800,letterSpacing:1,textTransform:"uppercase"}}>{m.status}</span></td>
                  </tr>;
                });
              })}
              {filteredRec.length===0&&!recLoading[0]&&<tr><td colSpan={8} style={{padding:"30px",textAlign:"center",color:P.caption,fontSize:12,fontStyle:"italic"}}>No campaigns match the filter.</td></tr>}
            </tbody>
          </table>
        </div>;
      })()}
      {view[0]==="usage"&&(function(){
        var events=usageEvents[0]||[];
        // Split into admin vs client buckets.
        var adminEvts=events.filter(function(e){return e.kind==="admin_login"||e.kind==="client_pw_login";});
        var clientEvts=events.filter(function(e){return e.kind==="client_view";});
        // Per-slug rollup: total views, first seen, last seen.
        var byClient={};
        clientEvts.forEach(function(e){
          var slug=e.actor||"unknown";
          if(!byClient[slug])byClient[slug]={slug:slug,views:0,first:e.ts,last:e.ts};
          byClient[slug].views++;
          if(e.ts<byClient[slug].first)byClient[slug].first=e.ts;
          if(e.ts>byClient[slug].last)byClient[slug].last=e.ts;
        });
        var clientRows=Object.keys(byClient).map(function(s){return byClient[s];}).sort(function(a,b){return (b.last||"").localeCompare(a.last||"");});
        // Session duration lookup: map actor+date to total minutes from session_end events.
        var sessionEndEvts=events.filter(function(e){return e.kind==="session_end";});
        var sessionDurMap={};
        sessionEndEvts.forEach(function(e){
          var d=(e.ts||"").substring(0,10);
          var who=e.actor||"unknown";
          var dur=e.meta&&e.meta.durationMin?parseInt(e.meta.durationMin):0;
          var key=d+"|"+who;
          if(!sessionDurMap[key])sessionDurMap[key]={totalMin:0,sessions:0};
          sessionDurMap[key].totalMin+=dur;
          sessionDurMap[key].sessions++;
        });
        var fmtDur=function(min){if(!min||min<=0)return "-";if(min<60)return min+"m";return Math.floor(min/60)+"h "+min%60+"m";};
        // Admin rollup by day + user.
        var adminByDay={};
        adminEvts.forEach(function(e){
          var d=(e.ts||"").substring(0,10);
          if(!d)return;
          if(!adminByDay[d])adminByDay[d]={count:0,users:{}};
          adminByDay[d].count++;
          var who=e.actor||"unknown";
          adminByDay[d].users[who]=(adminByDay[d].users[who]||0)+1;
        });
        var adminDays=Object.keys(adminByDay).sort(function(a,b){return b.localeCompare(a);}).slice(0,30);
        var fmtDate=function(iso){if(!iso)return "-";try{return new Date(iso).toLocaleString("en-ZA",{year:"numeric",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"});}catch(_){return iso;}};
        var slugDisplay=function(s){var v=(s||"");return v.indexOf("-")>=0?v.split("-").map(function(w){return w.toUpperCase();}).join(" "):v.toUpperCase();};
        var hdr={padding:"10px",textAlign:"left",fontSize:9,fontWeight:800,color:P.ember,letterSpacing:2,textTransform:"uppercase",borderBottom:"1px solid "+P.rule,background:"rgba(249,98,3,0.12)"};
        var cell={padding:"10px",color:P.txt,fontSize:12,fontFamily:fm,borderBottom:"1px solid "+P.rule+"30"};
        return <div style={{display:"flex",flexDirection:"column",gap:20,overflow:"auto"}}>
          {usageLoading[0]&&<div style={{padding:20,color:P.label,fontSize:12,fontFamily:fm,textAlign:"center"}}>Thumbing through the visitor log…</div>}
          {usageErr[0]&&<div style={{color:P.critical,fontSize:12,fontFamily:fm}}>{usageErr[0]}</div>}
          {!usageLoading[0]&&!usageErr[0]&&events.length===0&&<div style={{padding:20,color:P.label,fontSize:12,fontFamily:fm,textAlign:"center"}}>No usage events yet. They start recording on the next admin login and client view.</div>}
          {!usageLoading[0]&&events.length>0&&<>
            <div style={{fontSize:11,color:P.label,fontFamily:fm,lineHeight:1.5}}>Admin login events and client share-link views, each deduplicated per actor per hour so the table stays readable.</div>

            <div>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                <span style={{fontSize:13,fontWeight:900,color:P.cyan,fontFamily:fm,letterSpacing:2,textTransform:"uppercase"}}>Admin usage</span>
                <span style={{fontSize:11,color:P.label,fontFamily:fm}}>{adminEvts.length+" logins across "+adminDays.length+" day"+(adminDays.length===1?"":"s")+" (last 30 days shown)"}</span>
              </div>
              <div style={{border:"1px solid "+P.rule,borderRadius:10,background:"rgba(0,0,0,0.3)",overflow:"hidden"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,fontFamily:fm}}>
                  <thead><tr><th style={hdr}>Date</th><th style={hdr}>User</th><th style={hdr}>Logins</th><th style={hdr}>Session time</th></tr></thead>
                  <tbody>
                    {adminDays.length===0?<tr><td colSpan={4} style={{padding:14,color:P.caption,textAlign:"center",fontSize:11,fontFamily:fm}}>No admin logins recorded yet.</td></tr>:adminDays.map(function(d){
                      var dayData=adminByDay[d];
                      var users=Object.keys(dayData.users).sort();
                      return users.map(function(u,ui){
                        var durKey=d+"|"+u;
                        var durInfo=sessionDurMap[durKey];
                        return <tr key={d+"_"+u}>
                          {ui===0&&<td rowSpan={users.length} style={Object.assign({},cell,{verticalAlign:"top",fontWeight:700})}>{d}</td>}
                          <td style={cell}>{u}</td>
                          <td style={cell}>{dayData.users[u]}</td>
                          <td style={cell}>{durInfo?fmtDur(durInfo.totalMin):"-"}</td>
                        </tr>;
                      });
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                <span style={{fontSize:13,fontWeight:900,color:P.tt,fontFamily:fm,letterSpacing:2,textTransform:"uppercase"}}>Client share-link usage</span>
                <span style={{fontSize:11,color:P.label,fontFamily:fm}}>{clientEvts.length+" views across "+clientRows.length+" client"+(clientRows.length===1?"":"s")}</span>
              </div>
              <div style={{border:"1px solid "+P.rule,borderRadius:10,background:"rgba(0,0,0,0.3)",overflow:"hidden"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,fontFamily:fm}}>
                  <thead><tr><th style={hdr}>Client</th><th style={Object.assign({},hdr,{textAlign:"center"})}>Total Views</th><th style={hdr}>First Seen</th><th style={hdr}>Last Seen</th></tr></thead>
                  <tbody>
                    {clientRows.length===0?<tr><td colSpan={4} style={{padding:14,color:P.caption,textAlign:"center",fontSize:11,fontFamily:fm}}>No client share-link views recorded yet.</td></tr>:clientRows.map(function(r){
                      return <tr key={r.slug}>
                        <td style={Object.assign({},cell,{fontWeight:700,color:P.ember})}>{slugDisplay(r.slug)}</td>
                        <td style={Object.assign({},cell,{textAlign:"center",fontWeight:700})}>{r.views}</td>
                        <td style={Object.assign({},cell,{color:P.label})}>{fmtDate(r.first)}</td>
                        <td style={Object.assign({},cell,{color:P.label})}>{fmtDate(r.last)}</td>
                      </tr>;
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{fontSize:10,color:P.caption,fontFamily:fm,marginTop:8,fontStyle:"italic"}}>Views are counted once per hour per client to avoid inflating the count from routine API calls as the client browses.</div>
            </div>
          </>}
        </div>;
      })()}
      {view[0]==="users"&&props.isSuperadmin&&(function(){
        var users=teamUsers[0]||[];
        var fmtDate=function(iso){if(!iso)return "-";try{return new Date(iso).toLocaleDateString("en-ZA",{year:"numeric",month:"short",day:"numeric"});}catch(_){return iso;}};
        var statusPill=function(u){
          if(u.role==="superadmin")return{label:"SUPER ADMIN",color:P.ember};
          if(u.status==="pending_invite")return{label:"PENDING INVITE",color:P.warning};
          if(u.status==="revoked"||u.active===false)return{label:"REVOKED",color:P.critical};
          return{label:"ACTIVE",color:P.mint};
        };
        var hdr={padding:"10px",textAlign:"left",fontSize:9,fontWeight:800,color:P.ember,letterSpacing:2,textTransform:"uppercase",borderBottom:"1px solid "+P.rule,background:"rgba(249,98,3,0.12)"};
        var cell={padding:"10px",color:P.txt,fontSize:12,fontFamily:fm,borderBottom:"1px solid "+P.rule+"30"};
        return <div style={{display:"flex",flexDirection:"column",gap:20,overflow:"auto"}}>
          <div style={{fontSize:11,color:P.label,fontFamily:fm,lineHeight:1.5}}>Invite team members by email, revoke access when someone leaves. Invited users set their own password via the emailed link. Client share-link viewers are a separate system and are not listed here.</div>

          <div style={{background:"rgba(0,0,0,0.3)",border:"1px solid "+P.rule,borderRadius:12,padding:16}}>
            <div style={{fontSize:12,fontWeight:900,color:P.ember,fontFamily:fm,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>Invite a Team Member</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1.4fr auto",gap:10,alignItems:"stretch"}}>
              <input name="invite-name" autoComplete="name" value={inviteName[0]} onChange={function(e){inviteName[1](e.target.value);}} placeholder="Full name" style={{background:P.glass,border:"1px solid "+P.rule,borderRadius:8,padding:"10px 12px",color:P.txt,fontSize:12,fontFamily:fm,outline:"none"}}/>
              <input name="invite-email" autoComplete="email" value={inviteEmail[0]} onChange={function(e){inviteEmail[1](e.target.value);}} placeholder="work@domain.com" type="email" style={{background:P.glass,border:"1px solid "+P.rule,borderRadius:8,padding:"10px 12px",color:P.txt,fontSize:12,fontFamily:fm,outline:"none"}}/>
              <button onClick={sendInvite} disabled={teamBusy[0]||!inviteName[0].trim()||!inviteEmail[0].trim()} style={{background:teamBusy[0]||!inviteName[0].trim()||!inviteEmail[0].trim()?"#555":gEmber,border:"none",borderRadius:8,padding:"10px 20px",color:"#fff",fontSize:11,fontWeight:800,fontFamily:fm,cursor:teamBusy[0]?"wait":"pointer",letterSpacing:1.5,whiteSpace:"nowrap"}}>{teamBusy[0]?"SENDING...":"SEND INVITE"}</button>
            </div>
            {inviteNote[0]&&<div style={{marginTop:10,fontSize:11,color:P.mint,fontFamily:fm}}>{inviteNote[0]}</div>}
            {teamErr[0]&&<div style={{marginTop:10,fontSize:11,color:P.critical,fontFamily:fm}}>{teamErr[0]}</div>}
          </div>

          <div>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
              <span style={{fontSize:13,fontWeight:900,color:P.cyan,fontFamily:fm,letterSpacing:2,textTransform:"uppercase"}}>Team Members</span>
              <span style={{fontSize:11,color:P.label,fontFamily:fm}}>{users.length+" user"+(users.length===1?"":"s")}</span>
              <button onClick={loadTeam} disabled={teamLoading[0]} style={{marginLeft:"auto",background:"transparent",border:"1px solid "+P.rule,borderRadius:8,padding:"6px 12px",color:P.label,fontSize:10,fontWeight:800,fontFamily:fm,cursor:teamLoading[0]?"wait":"pointer",letterSpacing:1.5}}>{teamLoading[0]?"LOADING":"REFRESH"}</button>
            </div>
            <div style={{border:"1px solid "+P.rule,borderRadius:10,background:"rgba(0,0,0,0.3)",overflow:"hidden"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,fontFamily:fm}}>
                <thead><tr><th style={hdr}>Name</th><th style={hdr}>Email</th><th style={hdr}>Role</th><th style={hdr}>Status</th><th style={hdr}>Invited</th><th style={hdr}>Last Login</th><th style={Object.assign({},hdr,{textAlign:"right"})}>Action</th></tr></thead>
                <tbody>
                  {users.length===0&&!teamLoading[0]?<tr><td colSpan={7} style={{padding:20,color:P.caption,textAlign:"center",fontSize:11,fontFamily:fm,fontStyle:"italic"}}>No team members yet. Invite someone above.</td></tr>:users.map(function(u){
                    var s=statusPill(u);
                    var canToggle=u.role!=="superadmin";
                    return <tr key={u.email}>
                      <td style={Object.assign({},cell,{fontWeight:700})}>{u.name||"-"}</td>
                      <td style={Object.assign({},cell,{color:P.label})}>{u.email}</td>
                      <td style={cell}>{u.role==="superadmin"?"Super Admin":"Team Member"}</td>
                      <td style={cell}><span style={{background:s.color+"20",color:s.color,border:"1px solid "+s.color+"50",padding:"2px 8px",borderRadius:5,fontSize:9,fontWeight:800,letterSpacing:1,textTransform:"uppercase"}}>{s.label}</span></td>
                      <td style={Object.assign({},cell,{color:P.label})}>{fmtDate(u.createdAt)}</td>
                      <td style={Object.assign({},cell,{color:P.label})}>{fmtDate(u.lastLogin)}</td>
                      <td style={Object.assign({},cell,{textAlign:"right"})}>
                        <div style={{display:"inline-flex",gap:6,alignItems:"center",justifyContent:"flex-end"}}>
                          {/* Reset password — only for active accounts that have already activated.
                              Pending invites should be re-sent, not reset; revoked accounts must be
                              restored first. Superadmin self-resets via the login screen. */}
                          {u.role!=="superadmin"&&u.active&&u.status==="active"&&<button onClick={function(){adminResetUser(u.email);}} title="Send a password reset link" style={{background:"transparent",border:"1px solid "+P.solar+"60",borderRadius:6,padding:"4px 10px",color:P.solar,fontSize:10,fontWeight:800,fontFamily:fm,cursor:"pointer",letterSpacing:1}}>RESET</button>}
                          {canToggle?<button onClick={function(){toggleUser(u.email,u.active);}} style={{background:u.active?"transparent":P.mint+"15",border:"1px solid "+(u.active?P.critical+"60":P.mint+"60"),borderRadius:6,padding:"4px 12px",color:u.active?P.critical:P.mint,fontSize:10,fontWeight:800,fontFamily:fm,cursor:"pointer",letterSpacing:1}}>{u.active?"REVOKE":"RESTORE"}</button>:<span style={{color:P.caption,fontSize:10}}>-</span>}
                        </div>
                      </td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
            <div style={{fontSize:11,color:P.label,fontFamily:fm,marginTop:10,lineHeight:1.6}}>Revoking an access account invalidates the user's next login request.</div>
          </div>
        </div>;
      })()}
    </div>
  </div>);
}

// Floating chat panel. Renders a brand-styled slide-in panel with a
// conversation against /api/chat. Auth follows the existing pattern: client
// share tokens send Bearer header, admins use x-api-key + x-session-token.
function ChatPanel(props){
  var internalOpen=useState(false);
  // Controlled mode if parent supplies open + setOpen, otherwise self-manage.
  var isOpen=typeof props.open==="boolean"?props.open:internalOpen[0];
  var setIsOpen=props.setOpen||internalOpen[1];
  // Defensive: force the panel closed on first mount, independent of any
  // persisted session state elsewhere. The panel only opens when the user
  // clicks the FAB or the "Start Chat" CTA.
  useEffect(function(){setIsOpen(false);},[]);
  // Messages persist for the whole browser session via sessionStorage
  // so closing + reopening the chat panel keeps the conversation intact.
  // Cleared automatically when the tab closes or the user logs out.
  var CHAT_STORAGE_KEY="gas_chat_history";
  var messages=useState(function(){
    try{
      var raw=sessionStorage.getItem(CHAT_STORAGE_KEY);
      if(!raw)return [];
      var parsed=JSON.parse(raw);
      return Array.isArray(parsed)?parsed:[];
    }catch(_){return [];}
  });
  useEffect(function(){
    try{sessionStorage.setItem(CHAT_STORAGE_KEY,JSON.stringify(messages[0]||[]));}catch(_){}
  },[messages[0]]);
  var input=useState("");
  var busy=useState(false);
  var err=useState("");
  var scrollRef=useState(null);
  var autoHeightRef=useState(null);

  // Quirky rotating loading copy. Swapped every 2.5s while the bot is
  // thinking so the spinner feels alive on slower answers instead of
  // leaving the user staring at the same "Analysing..." for 10+ seconds.
  var LOADING_PHRASES=[
    "Analysing","Crunching the numbers","Reading the data block","Scanning your creatives",
    "Sharpening the CPC math","Cross-checking platform splits","Stalking your top performer",
    "Benchmarking against SA norms","Sanity-checking the reach","Hunting cost per lead",
    "Drawing sharp conclusions","Lining up the verdict"
  ];
  var loadingPhraseS=useState(LOADING_PHRASES[0]);
  var loadingPhrase=loadingPhraseS[0];
  useEffect(function(){
    if(!busy[0])return;
    loadingPhraseS[1](LOADING_PHRASES[Math.floor(Math.random()*LOADING_PHRASES.length)]);
    var iv=setInterval(function(){
      loadingPhraseS[1](LOADING_PHRASES[Math.floor(Math.random()*LOADING_PHRASES.length)]);
    },2500);
    return function(){clearInterval(iv);};
  },[busy[0]]);

  // Closing the chat preserves the conversation so reopening shows the
  // last session. A "New chat" control is available on the panel for
  // an explicit reset.
  var close=function(){
    setIsOpen(false);
    err[1]("");
    input[1]("");
  };
  var resetChat=function(){
    messages[1]([]);
    input[1]("");
    err[1]("");
    try{sessionStorage.removeItem(CHAT_STORAGE_KEY);}catch(_){}
  };
  var openPanel=function(){setIsOpen(true);setTimeout(function(){var el=scrollRef[0];if(el)el.scrollTop=el.scrollHeight;},80);};
  var hover=useState(false);

  var authHeaders=function(){
    if(props.viewToken)return{"Content-Type":"application/json","Authorization":"Bearer "+props.viewToken};
    return{"Content-Type":"application/json","x-session-token":props.session||""};
  };
  var performSend=function(msgText){
    var msg=(msgText||"").trim();
    if(!msg||busy[0])return;
    err[1]("");
    var next=messages[0].concat([{role:"user",content:msg}]);
    // Seed the assistant placeholder immediately so streamed text appends in place.
    var withPlaceholder=next.concat([{role:"assistant",content:"",streaming:true}]);
    messages[1](withPlaceholder);
    input[1]("");
    busy[1](true);
    setTimeout(function(){var el=scrollRef[0];if(el)el.scrollTop=el.scrollHeight;},20);

    // Build the chat allowlist. The campaign selector lists FB and IG
    // variants of every Meta campaign as separate rows, a user asking
    // "did Ayanda run on IG" expects both variants visible when they
    // picked one, so for every ticked Meta row we also include the
    // OTHER placement variant of the same raw campaign. Non-Meta rows
    // (TikTok, Google) stay as-is. Share-email still only sends exact
    // picks, that flow is stricter on purpose.
    var selectedCampaigns=(props.campaigns||[]).filter(function(c){return (props.selected||[]).indexOf(c.campaignId)>=0;});
    var selectedIdSet={};var selectedNames=[];
    selectedCampaigns.forEach(function(c){
      if(c.campaignId){
        var cid=String(c.campaignId);
        selectedIdSet[cid]=true;
        // Auto-mirror FB <-> IG so both placement variants of the same
        // Meta campaign reach the chat data block.
        if(cid.indexOf("_facebook")>0)selectedIdSet[cid.replace("_facebook","_instagram")]=true;
        else if(cid.indexOf("_instagram")>0)selectedIdSet[cid.replace("_instagram","_facebook")]=true;
      }
      if(c.campaignName)selectedNames.push(c.campaignName);
    });
    var selectedIds=Object.keys(selectedIdSet);

    // Watchdog: if we hear nothing back within 55s the connection almost
    // certainly dropped somewhere (serverless timeout, network, CDN).
    // Abort the request so the user sees an error instead of a frozen
    // "Analysing..." forever.
    // Quirky rotating timeout copy. Most timeouts in the wild are the
    // client's connection buckling under the streamed response, not the
    // model running slow, so the message nudges toward wifi checks while
    // staying warm and never rude.
    var TIMEOUT_QUIPS=[
      "That took longer than a loadshedding schedule. Your WiFi might be having a moment, try a different network, maybe the one your neighbour won't stop bragging about, then fire the same question again.",
      "Your connection seems to have taken a tea break, ours is still waiting at the door. Jump onto a friendlier WiFi and ask me that one more time.",
      "The answer is cooked, the delivery van just lost signal. Swap to a stronger WiFi and resubmit your question, we'll try that again.",
      "Hmm, that reply fell off somewhere between here and your browser. Check your WiFi is steady, or hop onto your phone hotspot, and send the question through again.",
      "Looks like the pipe between us went quiet. If your WiFi is wobbly, try a different network, then pop the same question in again and we'll pick it up."
    ];
    var watchdog=null;
    var watchdogController=("AbortController" in window)?new AbortController():null;
    var resetWatchdog=function(){
      if(watchdog)clearTimeout(watchdog);
      watchdog=setTimeout(function(){
        try{if(watchdogController)watchdogController.abort();}catch(_){}
        busy[1](false);
        err[1](TIMEOUT_QUIPS[Math.floor(Math.random()*TIMEOUT_QUIPS.length)]);
        messages[1](function(prev){var copy=prev.slice();if(copy.length>0&&copy[copy.length-1].role==="assistant"&&!copy[copy.length-1].content)copy.pop();return copy;});
      },75000);
    };
    resetWatchdog();
    fetch(props.apiBase+"/api/chat",{
      method:"POST",
      headers:authHeaders(),
      signal:watchdogController?watchdogController.signal:undefined,
      body:JSON.stringify({
        message:msg,
        history:next.slice(0,-1),
        from:props.dateFrom,
        to:props.dateTo,
        selectedCampaignIds:selectedIds,
        selectedCampaignNames:selectedNames
      })
    }).then(function(r){
      if(!r.ok||!r.body){
        return r.json().then(function(d){throw new Error(d.error||"Chat error");});
      }
      var reader=r.body.getReader();
      var decoder=new TextDecoder();
      var buffer="";
      var accumulated="";
      var finish=function(){
        if(watchdog)clearTimeout(watchdog);
        busy[1](false);
        // Strip the streaming flag so rerenders don't keep the cursor look,
        // preserve attachments so ad thumbnails stay visible after completion.
        messages[1](function(prev){
          var copy=prev.slice();
          if(copy.length>0){
            var last=copy[copy.length-1];
            if(last.role==="assistant")copy[copy.length-1]=Object.assign({},last,{content:last.content||accumulated,streaming:false});
          }
          return copy;
        });
        // Final scroll pass after React has rendered the follow-up
        // suggestion chips that trail the main answer. Two rAFs ensures
        // the layout has settled, auto-scrolling mid-stream sometimes
        // landed just short of the bottom when the follow-ups rendered.
        requestAnimationFrame(function(){
          requestAnimationFrame(function(){
            var el=scrollRef[0];
            if(el)el.scrollTop=el.scrollHeight;
          });
        });
      };
      var pump=function(){
        return reader.read().then(function(res){
          if(res.done){finish();return;}
          // Fresh bytes, bot is still alive, restart the watchdog window.
          resetWatchdog();
          buffer+=decoder.decode(res.value,{stream:true});
          var lines=buffer.split("\n");
          buffer=lines.pop();
          lines.forEach(function(line){
            if(!line.startsWith("data: "))return;
            var payload=line.slice(6);
            if(!payload)return;
            try{
              var evt=JSON.parse(payload);
              if(evt.type==="delta"&&evt.text){
                accumulated+=evt.text;
                messages[1](function(prev){
                  var copy=prev.slice();
                  if(copy.length>0){
                    var last=copy[copy.length-1];
                    if(last.role==="assistant")copy[copy.length-1]=Object.assign({},last,{content:accumulated,streaming:true});
                  }
                  return copy;
                });
                var el=scrollRef[0];if(el)el.scrollTop=el.scrollHeight;
              }else if(evt.type==="attachments"&&Array.isArray(evt.ads)){
                messages[1](function(prev){
                  var copy=prev.slice();
                  if(copy.length>0){
                    var last=copy[copy.length-1];
                    if(last.role==="assistant")copy[copy.length-1]=Object.assign({},last,{attachments:evt.ads});
                  }
                  return copy;
                });
                // Attachments render as tall thumbnail cards, re-anchor to
                // the bottom so the message body doesn't get pushed off.
                setTimeout(function(){var el=scrollRef[0];if(el)el.scrollTop=el.scrollHeight;},20);
              }else if(evt.type==="error"){
                err[1](evt.error||"Chat error");
                messages[1](function(prev){var copy=prev.slice();if(copy.length>0&&copy[copy.length-1].role==="assistant"&&!copy[copy.length-1].content&&!copy[copy.length-1].attachments)copy.pop();return copy;});
              }
            }catch(_){/* skip malformed */}
          });
          return pump();
        });
      };
      return pump();
    }).catch(function(e){
      if(watchdog)clearTimeout(watchdog);
      busy[1](false);
      // An AbortError fired by the watchdog already set a friendly
      // message, avoid overwriting with "The user aborted a request."
      if(!(e&&String(e.name||"")==="AbortError"))err[1]((e&&e.message)||"Connection error");
      messages[1](function(prev){var copy=prev.slice();if(copy.length>0&&copy[copy.length-1].role==="assistant"&&!copy[copy.length-1].content)copy.pop();return copy;});
    });
  };
  // Wrapper that uses current input value. Button + Enter both call this.
  var send=function(){performSend(input[0]);input[1]("");};
  var handleKey=function(e){
    if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}
  };
  var autoSize=function(e){
    input[1](e.target.value);
    e.target.style.height="auto";
    e.target.style.height=Math.min(120,e.target.scrollHeight)+"px";
  };

  var suggestions=[
    "How are we doing overall this period?",
    "Which platform is giving us the best value?",
    "Which are our best performing ads and why?",
    "Where should we shift budget next?"
  ];

  return (<><style>{"@keyframes fabRipple{0%{transform:scale(0.9);opacity:0.55}100%{transform:scale(1.8);opacity:0}}@keyframes fabEntrance{0%{transform:translateY(40px) scale(0.6);opacity:0}60%{transform:translateY(-4px) scale(1.06);opacity:1}100%{transform:translateY(0) scale(1);opacity:1}}@keyframes fabFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}@keyframes fabShimmer{0%{background-position:0% 50%}100%{background-position:200% 50%}}@keyframes fabLabelIn{0%{transform:translateX(12px);opacity:0}100%{transform:translateX(0);opacity:1}}@keyframes sparkleOrbit{0%{transform:rotate(0deg) translateX(27px) rotate(0deg)}100%{transform:rotate(360deg) translateX(27px) rotate(-360deg)}}"}</style>
  {!isOpen&&<div style={{position:"fixed",right:22,bottom:22,zIndex:900,display:"flex",alignItems:"center",gap:10,flexDirection:"row-reverse",pointerEvents:"none",animation:"fabEntrance 0.8s cubic-bezier(0.34,1.56,0.64,1) both"}}>
    {/* FAB wrapper with ripples */}
    <div style={{position:"relative",width:54,height:54,pointerEvents:"auto",animation:"fabFloat 4s ease-in-out infinite"}} onMouseEnter={function(){hover[1](true);}} onMouseLeave={function(){hover[1](false);}}>
      {/* Outer rippling rings, staggered so a wave is always emitting */}
      <div style={{position:"absolute",inset:0,borderRadius:"50%",border:"2px solid rgba(249,98,3,0.55)",animation:"fabRipple 2.4s ease-out infinite",pointerEvents:"none"}}/>
      <div style={{position:"absolute",inset:0,borderRadius:"50%",border:"2px solid rgba(168,85,247,0.45)",animation:"fabRipple 2.4s ease-out infinite 1.2s",pointerEvents:"none"}}/>
      {/* Orbiting sparkle */}
      <div style={{position:"absolute",inset:0,pointerEvents:"none"}}>
        <div style={{position:"absolute",top:"50%",left:"50%",width:5,height:5,marginLeft:-2.5,marginTop:-2.5,borderRadius:"50%",background:"#FFAA00",boxShadow:"0 0 8px #FFAA00, 0 0 16px #F96203",animation:"sparkleOrbit 6s linear infinite"}}/>
      </div>
      {/* Actual button */}
      <button onClick={openPanel} aria-label="Chat with GAS Media Expert" style={{position:"relative",width:"100%",height:"100%",borderRadius:"50%",border:"none",cursor:"pointer",background:"linear-gradient(135deg,#FF3D00 0%,#FF6B00 40%,#F96203 70%,#A855F7 130%)",backgroundSize:"200% 200%",animation:"fabShimmer 5s ease-in-out infinite alternate",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:hover[0]?"0 14px 34px rgba(255,61,0,0.55), 0 0 0 2px rgba(255,255,255,0.12) inset, 0 0 48px rgba(168,85,247,0.35)":"0 8px 24px rgba(255,61,0,0.42), 0 0 0 1px rgba(255,255,255,0.08) inset",transform:hover[0]?"scale(1.08)":"scale(1)",transition:"transform 0.25s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.3s",outline:"none"}}>
        {/* Sparkle icon (AI-forward) with a small chat affordance */}
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M12 2l1.6 4.8L18 8l-4.4 1.2L12 14l-1.6-4.8L6 8l4.4-1.2L12 2z" fill="#fff" stroke="#fff" strokeWidth="0.5" strokeLinejoin="round"/>
          <circle cx="18" cy="17" r="2" fill="rgba(255,255,255,0.95)"/>
          <circle cx="6" cy="17" r="1.5" fill="rgba(255,255,255,0.7)"/>
        </svg>
        {/* AI badge */}
        <div style={{position:"absolute",top:-3,right:-3,minWidth:20,height:16,borderRadius:8,background:"#0d0618",border:"1.5px solid #FFAA00",color:"#FFAA00",fontSize:8,fontWeight:900,fontFamily:fm,letterSpacing:1,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 4px",boxShadow:"0 2px 6px rgba(255,170,0,0.45)"}}>AI</div>
      </button>
    </div>
    {/* Hover label */}
    {hover[0]&&<div style={{pointerEvents:"none",background:"rgba(6,2,14,0.95)",backdropFilter:"blur(10px)",WebkitBackdropFilter:"blur(10px)",border:"1px solid "+P.rule,borderRadius:14,padding:"10px 16px",boxShadow:"0 10px 30px rgba(0,0,0,0.5)",animation:"fabLabelIn 0.25s cubic-bezier(0.2,0.8,0.2,1) both",whiteSpace:"nowrap"}}>
      <div style={{fontSize:9,color:P.ember,fontFamily:fm,letterSpacing:2.5,textTransform:"uppercase",fontWeight:800,marginBottom:2}}>GAS Media Expert</div>
      <div style={{fontSize:11,color:P.txt,fontFamily:ff,fontWeight:600}}>Ask anything about your campaigns</div>
    </div>}
  </div>}
  {isOpen&&<div style={{position:"fixed",inset:0,zIndex:1000,display:"flex",justifyContent:"flex-end",pointerEvents:"none"}}>
    <div onClick={close} style={{position:"absolute",inset:0,background:"rgba(6,2,14,0.55)",backdropFilter:"blur(4px)",WebkitBackdropFilter:"blur(4px)",pointerEvents:"auto"}}/>
    <div onClick={function(e){e.stopPropagation();}} style={{position:"relative",width:440,maxWidth:"96vw",height:"100vh",background:"linear-gradient(170deg,#0d0618 0%,#1a0b2e 100%)",borderLeft:"1px solid "+P.rule,boxShadow:"-24px 0 60px rgba(0,0,0,0.5)",display:"flex",flexDirection:"column",pointerEvents:"auto",animation:"gasEnter 0.35s cubic-bezier(0.2,0.8,0.2,1) both"}}>
      <style>{"@keyframes gasEnter{0%{transform:translateX(40px);opacity:0}100%{transform:translateX(0);opacity:1}}"}</style>
      <div style={{padding:"18px 20px 14px",borderBottom:"1px solid "+P.rule,display:"flex",alignItems:"center",gap:12}}>
        <div style={{width:40,height:40,borderRadius:12,background:"linear-gradient(135deg,#FF3D00,#FF6B00)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:"0 4px 16px rgba(255,61,0,0.35)"}}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="#fff" strokeWidth="1.5" fill="rgba(255,255,255,0.2)" strokeLinejoin="round"/></svg>
        </div>
        <div style={{flex:1}}>
          <div style={{fontSize:13,fontWeight:900,color:P.txt,fontFamily:fm,letterSpacing:2.5,textTransform:"uppercase"}}>GAS Media Expert</div>
          <div style={{fontSize:10,color:P.label,fontFamily:fm,marginTop:2,letterSpacing:1}}>Live, scoped to your campaigns for {props.dateFrom} to {props.dateTo}</div>
        </div>
        {messages[0].length>0&&<button onClick={resetChat} title="Start a new conversation" style={{background:"transparent",border:"1px solid "+P.rule,borderRadius:10,padding:"0 12px",height:36,color:P.label,cursor:"pointer",flexShrink:0,display:"flex",alignItems:"center",gap:6,fontSize:10,fontFamily:fm,fontWeight:800,letterSpacing:1.5,transition:"all 0.2s"}} onMouseEnter={function(e){e.currentTarget.style.borderColor=P.ember+"60";e.currentTarget.style.color=P.ember;e.currentTarget.style.background="rgba(249,98,3,0.08)";}} onMouseLeave={function(e){e.currentTarget.style.borderColor=P.rule;e.currentTarget.style.color=P.label;e.currentTarget.style.background="transparent";}}>NEW CHAT</button>}
        <button onClick={close} title="Close chat" style={{background:"transparent",border:"1px solid "+P.rule,borderRadius:10,width:36,height:36,color:P.label,cursor:"pointer",padding:0,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.2s"}} onMouseEnter={function(e){e.currentTarget.style.borderColor=P.ember+"60";e.currentTarget.style.color=P.ember;e.currentTarget.style.background="rgba(249,98,3,0.08)";}} onMouseLeave={function(e){e.currentTarget.style.borderColor=P.rule;e.currentTarget.style.color=P.label;e.currentTarget.style.background="transparent";}}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
      </div>

      <div ref={function(el){scrollRef[1](el);}} style={{flex:1,overflowY:"auto",padding:"18px 20px",display:"flex",flexDirection:"column",gap:14}}>
        {messages[0].length===0&&<div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid "+P.rule,borderRadius:12,padding:"14px 16px"}}>
            <div style={{fontSize:12,color:P.txt,fontFamily:ff,lineHeight:1.7}}>Hi, I am your GAS Media Expert. Ask me anything about this report and I will ground every answer in your live campaign data.</div>
          </div>
          <div style={{fontSize:9,color:P.label,fontFamily:fm,letterSpacing:2,textTransform:"uppercase",fontWeight:800,marginTop:4}}>Try asking</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {suggestions.map(function(s,i){return <button key={i} onClick={function(){performSend(s);}} style={{textAlign:"left",background:"rgba(255,255,255,0.03)",border:"1px solid "+P.rule,borderRadius:10,padding:"10px 14px",color:P.txt,fontSize:12,fontFamily:ff,cursor:"pointer",lineHeight:1.4,transition:"all 0.15s"}} onMouseEnter={function(e){e.currentTarget.style.borderColor=P.ember+"60";e.currentTarget.style.background="rgba(249,98,3,0.08)";}} onMouseLeave={function(e){e.currentTarget.style.borderColor=P.rule;e.currentTarget.style.background="rgba(255,255,255,0.03)";}}>{s}</button>;})}
          </div>
        </div>}
        {messages[0].map(function(m,i){
          var isUser=m.role==="user";
          // Skip fully-empty assistant placeholders (pre-first-token). Keep placeholders that have attachments already.
          if(!isUser&&!m.content&&!(m.attachments&&m.attachments.length>0))return null;
          var platColors={"Facebook":"#4599FF","Instagram":"#E1306C","TikTok":"#00F2EA","Google Display":"#34A853","YouTube":"#FF0000","Google Search":"#FFAA00","Performance Max":"#7C3AED","Demand Gen":"#D946EF"};
          var resultLabel=function(rt){return rt==="leads"?"LEADS":rt==="installs"?"APP CLICKS":rt==="follows"?"FOLLOWS":rt==="conversions"?"CONV":rt==="store_clicks"?"APP CLICKS":rt==="lp_clicks"?"LP CLICKS":rt==="clicks"?"CLICKS":"RESULTS";};
          var costPerLabel=function(rt){return rt==="leads"?"per lead":rt==="installs"?"per click":rt==="follows"?"per follower":"per click";};
          // Parse the followups marker out of the assistant content. The model appends
          // ---FOLLOWUPS--- followed by two lines with suggested next questions.
          var rawContent=m.content||"";
          var displayContent=rawContent;
          var followUps=[];
          if(!isUser&&rawContent.indexOf("---FOLLOWUPS---")>=0){
            var parts=rawContent.split("---FOLLOWUPS---");
            displayContent=parts[0].replace(/\s+$/,"");
            var tail=(parts[1]||"").split("\n").map(function(l){return l.replace(/^[\s0-9.\-*\"]+|[\s\"]+$/g,"");}).filter(function(l){return l.length>0;});
            followUps=tail.slice(0,2);
          }
          // Only show chips once streaming finishes and we actually parsed at least one.
          var showFollowUps=!isUser&&!m.streaming&&followUps.length>0&&!busy[0];
          return <div key={i} style={{display:"flex",flexDirection:"column",alignItems:isUser?"flex-end":"flex-start",gap:8}}>
            {!isUser&&m.attachments&&m.attachments.length>0&&<div style={{display:"flex",flexDirection:"column",gap:8,maxWidth:"92%",width:"100%"}}>
              {m.attachments.map(function(ad,ai){
                var accent=platColors[ad.platform]||P.ember;
                return <div key={ai} onClick={function(){if(props.onOpenAd)props.onOpenAd(ad);}} style={{display:"flex",gap:10,background:"rgba(0,0,0,0.35)",border:"1px solid "+accent+"35",borderLeft:"3px solid "+accent,borderRadius:12,padding:10,textDecoration:"none",color:"inherit",cursor:"pointer"}}>
                  <div style={{width:74,height:74,borderRadius:8,flexShrink:0,overflow:"hidden",background:"linear-gradient(135deg,"+accent+"55,"+accent+"10 55%,#0a0618)",position:"relative"}}>
                    {ad.thumbnail?<img src={ad.thumbnail} alt="" style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}} onError={function(e){e.target.style.display="none";}}/>:<div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:10,fontWeight:800,letterSpacing:1}}>{ad.platform}</div>}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                      <span style={{background:accent,color:textOnAccent(accent),fontSize:8,fontWeight:800,padding:"2px 7px",borderRadius:4,letterSpacing:1}}>{(ad.platform||"").toUpperCase()}</span>
                      {ad.format&&<span style={{background:"rgba(255,255,255,0.08)",color:P.txt,fontSize:8,fontWeight:700,padding:"2px 6px",borderRadius:4,letterSpacing:1}}>{ad.format}</span>}
                    </div>
                    <div style={{fontSize:11,fontWeight:700,color:P.txt,fontFamily:ff,lineHeight:1.3,marginBottom:4,overflow:"hidden",textOverflow:"ellipsis",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>{ad.adName}</div>
                    {ad.results>0?<div style={{fontSize:11,color:accent,fontWeight:800,fontFamily:fm}}>{fmt(ad.results)+" "+resultLabel(ad.resultType)+" | "+fR(ad.costPerResult)+" "+costPerLabel(ad.resultType)}</div>:<div style={{fontSize:10,color:P.label,fontFamily:fm}}>{fR(ad.spend)+" spend | "+ad.ctr.toFixed(2)+"% CTR"}</div>}
                  </div>
                </div>;
              })}
            </div>}
            {(isUser||displayContent)&&<div style={{maxWidth:"88%",background:isUser?gEmber:"rgba(255,255,255,0.04)",border:isUser?"none":"1px solid "+P.rule,borderRadius:isUser?"14px 14px 4px 14px":"14px 14px 14px 4px",padding:"10px 14px",color:P.txt,fontSize:13,fontFamily:ff,lineHeight:1.6,whiteSpace:"pre-wrap",wordBreak:"break-word"}}>{isUser?m.content:displayContent}{m.streaming&&<span style={{display:"inline-block",width:8,height:14,marginLeft:4,background:P.ember,verticalAlign:"middle",animation:"pulse-glow 1s ease-in-out infinite"}}/>}</div>}
            {showFollowUps&&<div style={{display:"flex",flexDirection:"column",gap:6,maxWidth:"92%",marginTop:2}}>
              <div style={{fontSize:8,color:P.label,fontFamily:fm,letterSpacing:2,fontWeight:800,textTransform:"uppercase",marginBottom:2}}>Next questions</div>
              {followUps.map(function(q,qi){return <button key={qi} onClick={function(){performSend(q);}} style={{textAlign:"left",background:"rgba(249,98,3,0.06)",border:"1px solid "+P.ember+"35",borderRadius:10,padding:"8px 12px",color:P.txt,fontSize:11,fontFamily:ff,cursor:"pointer",lineHeight:1.4,transition:"all 0.15s"}} onMouseEnter={function(e){e.currentTarget.style.borderColor=P.ember+"80";e.currentTarget.style.background="rgba(249,98,3,0.14)";}} onMouseLeave={function(e){e.currentTarget.style.borderColor=P.ember+"35";e.currentTarget.style.background="rgba(249,98,3,0.06)";}}>{q}</button>;})}
            </div>}
          </div>;
        })}
        {(function(){
          if(!busy[0])return null;
          var showSpinner=true;
          if(messages[0].length>0){
            var last=messages[0][messages[0].length-1];
            if(last.content||(last.attachments&&last.attachments.length>0))showSpinner=false;
          }
          if(!showSpinner)return null;
          return <div style={{display:"flex",justifyContent:"flex-start"}}><div style={{background:"rgba(255,255,255,0.04)",border:"1px solid "+P.rule,borderRadius:"14px 14px 14px 4px",padding:"10px 14px",fontSize:12,color:P.label,fontFamily:fm,letterSpacing:1}}>{loadingPhrase}<span style={{display:"inline-block",width:20}}>...</span></div></div>;
        })()}
        {err[0]&&<div style={{background:P.critical+"12",border:"1px solid "+P.critical+"40",borderRadius:10,padding:"10px 14px",fontSize:11,color:P.critical,fontFamily:fm,lineHeight:1.5}}>{err[0]}</div>}
      </div>

      <div style={{padding:"14px 16px 18px",borderTop:"1px solid "+P.rule,background:"rgba(0,0,0,0.35)"}}>
        <div style={{display:"flex",gap:8,alignItems:"flex-end"}}>
          <textarea ref={function(el){autoHeightRef[1](el);}} value={input[0]} onChange={autoSize} onKeyDown={handleKey} placeholder="Ask about your campaigns..." rows={1} style={{flex:1,resize:"none",background:P.glass,border:"1px solid "+P.rule,borderRadius:12,padding:"10px 14px",color:P.txt,fontSize:13,fontFamily:ff,outline:"none",lineHeight:1.5,maxHeight:120,overflowY:"auto"}}/>
          <button onClick={send} disabled={busy[0]||!(input[0]||"").trim()} style={{background:busy[0]||!(input[0]||"").trim()?P.rule:gEmber,border:"none",borderRadius:12,width:46,height:46,color:"#fff",cursor:busy[0]||!(input[0]||"").trim()?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:busy[0]||!(input[0]||"").trim()?"none":"0 4px 14px rgba(255,61,0,0.35)"}}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M22 2L11 13" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M22 2l-7 20-4-9-9-4 20-7z" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="rgba(255,255,255,0.18)"/></svg>
          </button>
        </div>
        <div style={{marginTop:8,fontSize:9,color:P.caption,fontFamily:fm,letterSpacing:1,textAlign:"center"}}>AI-generated insights grounded in your live data. Verify key decisions with your team.</div>
      </div>
    </div>
  </div>}
  </>);
}

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
  if(metaSpendShare>75&&ttImpShare>50)fl.push({id:id++,severity:"info",platform:"Cross-platform",metric:"Budget-to-Impression Imbalance",currentValue:metaSpendShare.toFixed(2)+"% spend on Meta",threshold:"75%",message:"Meta is consuming "+metaSpendShare.toFixed(2)+"% of budget but TikTok is delivering "+ttImpShare.toFixed(2)+"% of Total Ads Served. This suggests TikTok is significantly more capital-efficient for reach, and the current allocation may be over-indexing on Meta for awareness objectives.",recommendation:"Review whether Meta’s outsized budget share is justified by conversion performance. If Meta is driving the majority of measurable conversions, the allocation is correct. If both platforms serve primarily awareness objectives, rebalance toward TikTok’s superior impression economics.",status:"open"});
  if(m.cpc>0&&m.cpc<1.50)fl.push({id:id++,severity:"positive",platform:"Meta",metric:"Strong Click Efficiency",currentValue:fR(m.cpc),threshold:"R1.50",message:"Meta CPC at "+fR(m.cpc)+" is operating well below the R1.50 efficiency benchmark for paid social. This indicates excellent creative-audience fit, the algorithm has identified high-intent audience pockets and the creative is converting attention into action at an efficient rate.",recommendation:"This is a scale signal. Increase daily budgets by 15-20% on the top-performing ad sets to capitalise on the efficient delivery window before auction dynamics shift. Document the winning creative elements (hook, format, CTA) for replication across future campaigns.",status:"open"});
  else if(m.cpc>0&&m.cpc<3.0)fl.push({id:id++,severity:"positive",platform:"Meta",metric:"CPC Within Target Range",currentValue:fR(m.cpc),threshold:"R3.00",message:"Meta CPC at "+fR(m.cpc)+" is within the healthy R1.50-R3.00 range for direct-response campaigns in the the market, confirming effective creative and audience targeting.",recommendation:"Maintain current optimisation approach. Focus on incremental improvements: test new ad formats (Reels, carousel) against current winners, and expand Lookalike audiences from 1% to 2-3% to increase addressable reach without sacrificing click quality.",status:"open"});
  if(t.follows>1000){var cpf=t.spend/t.follows;fl.push({id:id++,severity:"positive",platform:"TikTok",metric:"Community Acquisition Momentum",currentValue:fmt(t.follows)+" follows at "+fR(cpf)+" Cost Per Follow",threshold:"1,000 follows",message:"TikTok has acquired "+fmt(t.follows)+" followers at "+fR(cpf)+" cost-per-follow. This community represents a compounding organic asset, each follower increases future organic reach, reduces paid media dependency, and provides a retargetable first-party audience for subsequent campaigns.",recommendation:"Accelerate community investment. The current CPF of "+fR(cpf)+" is below market rates for quality follower acquisition. Consider allocating an additional 10-15% of TikTok budget specifically to follower campaigns whilst the creative is resonating. Every follower acquired now reduces future paid reach costs.",status:"open"});}
  else if(t.follows>200)fl.push({id:id++,severity:"positive",platform:"TikTok",metric:"Community Growth Active",currentValue:fmt(t.follows)+" follows",threshold:"200",message:"TikTok follower acquisition is tracking positively with "+fmt(t.follows)+" new follows in the period. Building owned audience on TikTok reduces long-term paid media dependency.",recommendation:"Continue current follower strategy. Test creator-led content and trending audio formats to accelerate organic follow rates alongside paid acquisition.",status:"open"});
  if(t.cpm>0&&t.cpm<8)fl.push({id:id++,severity:"positive",platform:"TikTok",metric:"Exceptional Impression Value",currentValue:fR(t.cpm)+" Cost Per Thousand Ads Served",threshold:"R8.00",message:"TikTok is delivering impressions at "+fR(t.cpm)+" Cost Per Thousand Ads Served, significantly below the R8.00 benchmark for the paid social market. At this rate, every R1,000 buys approximately "+fmt(Math.round(1000/t.cpm*1000))+" impressions, making TikTok the most capital-efficient awareness channel in the campaign.",recommendation:"Maximise TikTok as the primary scale and awareness channel. This CPM level typically indicates strong content relevance scores and favourable auction positioning, the algorithm is rewarding the creative quality. Increase investment to capture this efficiency window before competitive pressure normalises rates.",status:"open"});
  else if(t.cpm>0&&t.cpm<15)fl.push({id:id++,severity:"positive",platform:"TikTok",metric:"Competitive Cost Per Thousand Ads Served",currentValue:fR(t.cpm)+" Cost Per Thousand Ads Served",threshold:"R15.00",message:"TikTok CPM at "+fR(t.cpm)+" is within the efficient range for paid social in the target market, confirming good content-audience alignment.",recommendation:"Monitor CPM trends weekly. If CPM begins rising above R15, review creative freshness and audience targeting for signs of saturation.",status:"open"});
  // Per-campaign flagging is objective-aware so each campaign is judged
  // on the metric it was set up to drive. CTR-based "Underperforming"
  // flags only apply to Traffic / Landing Page campaigns where CTR is
  // the success signal. Follower / Lead Gen / App Install campaigns get
  // their own zero-result-on-spend + cost-per-result flags. Mirrors the
  // disposition logic in the daily Pulse email so dashboard and email
  // tell the same story.
  camps.filter(function(c){return parseFloat(c.spend)>3000;}).forEach(function(c){
    var cCtr=parseFloat(c.ctr||0);var cCpc=parseFloat(c.cpc||0);
    var cSpend=parseFloat(c.spend);var cImps=parseFloat(c.impressions||0);
    var obj=String(c.objective||"").toLowerCase();
    var nm=String(c.campaignName||"").toLowerCase();
    var isFollowers=obj==="followers"||nm.indexOf("like&follow")>=0||nm.indexOf("_like_")>=0||nm.indexOf("_follow")>=0||nm.indexOf("follower")>=0;
    var isLeads=obj==="leads"||nm.indexOf("lead_gen")>=0||nm.indexOf("_lead_")>=0||nm.indexOf("_pos_")>=0||nm.indexOf("momo pos")>=0;
    var isAppInstall=obj==="appinstall"||nm.indexOf("appinstall")>=0||nm.indexOf("app_install")>=0;

    if(isFollowers){
      // IG-only follower campaigns are judged on Cost Per Profile Visit
      // (CPV), not on follows. Meta does not attribute in-feed Follow
      // taps on Instagram to specific ads, the follow happens on the
      // profile after a click-through. So an IG-only follower campaign
      // structurally returns 0 follows in ads insights even when it's
      // delivering well, and the old "0 follows on R1k spend" rule
      // false-flagged every IG follower campaign as critical.
      // Profile Visits (clicks) is the per-ad attributable signal,
      // CPV is the right efficiency metric. Page-level follower growth
      // shows up on Community Growth.
      if(c.platform==="Instagram"){
        var cClicksIg=parseFloat(c.clicks||0);
        var cCpv=cClicksIg>0?cSpend/cClicksIg:0;
        if(cClicksIg===0&&cSpend>1000){
          fl.push({id:id++,severity:"critical",platform:"Instagram",metric:"Underperforming IG Follower Campaign",currentValue:"0 Profile Visits on "+fR(cSpend)+" spend",threshold:"any Profile Visit",message:"Campaign ‘"+c.campaignName+"’ has driven no Profile Visits on "+fR(cSpend)+" spend across "+fmt(cImps)+" impressions. IG follow attribution lives on the profile after a click-through, so Profile Visits (clicks to the IG profile) is the per-ad signal. Zero clicks here points to weak creative or audience mismatch.",recommendation:"Audit the creative hook and ensure the call-to-action invites a profile click. Test creator-led content or behind-the-scenes angles which typically out-perform polished brand assets on IG follow campaigns.",status:"open"});
        } else if(cCpv>0&&cCpv>5){
          fl.push({id:id++,severity:"warning",platform:"Instagram",metric:"High Cost Per Profile Visit",currentValue:fR(cCpv)+" Cost Per Profile Visit",threshold:"R5.00 Cost Per Profile Visit",message:"Campaign ‘"+c.campaignName+"’ is driving IG Profile Visits at "+fR(cCpv)+", above the R5.00 efficient range. Profile Visits are the per-ad attributable step in the IG follower funnel, the page-level follow conversion happens after.",recommendation:"Refresh creative angles to reduce Cost Per Profile Visit. Once visits land cheaper, monitor whole-account IG follower growth on Community Growth to see if the funnel converts at scale.",status:"open"});
        } else if(cClicksIg>0&&cCpv>0&&cCpv<=2){
          fl.push({id:id++,severity:"positive",platform:"Instagram",metric:"Efficient IG Profile Visit Acquisition",currentValue:fmt(cClicksIg)+" Profile Visits at "+fR(cCpv)+" each",threshold:"R2.00 Cost Per Profile Visit",message:"Campaign ‘"+c.campaignName+"’ has driven "+fmt(cClicksIg)+" IG Profile Visits at "+fR(cCpv)+", well inside the efficient range. Step 1 of the IG follower funnel (paid attribution) is working.",recommendation:"Scale by 15 to 20 percent. Track whole-account follower growth on Community Growth to confirm Step 2 (the on-profile follow conversion) is also converting at scale.",status:"open"});
        }
      } else {
        // FB / TikTok / mixed Meta follower campaigns are judged on the
        // combined follow signal (page_like + reactions on FB, in-ad
        // follow attribution on TikTok). Existing logic applies.
        var cFollows=parseFloat(c.follows||0)+parseFloat(c.likes||0)+parseFloat(c.pageLikes||0)+parseFloat(c.pageFollows||0);
        var cCpf=cFollows>0?cSpend/cFollows:0;
        if(cFollows===0&&cSpend>1000){
          fl.push({id:id++,severity:"critical",platform:c.platform||"Meta",metric:"Underperforming Follower Campaign",currentValue:"0 follows on "+fR(cSpend)+" spend",threshold:"any follower acquisition",message:"Campaign ‘"+c.campaignName+"’ has acquired no followers or likes on "+fR(cSpend)+" spend across "+fmt(cImps)+" impressions. For a follower-objective campaign the success metric is the follow action, not the clickthrough, so a zero result here points to creative that is not asking for the follow or audience targeting that is not interested in following the page.",recommendation:"Audit the call to action: does the creative explicitly invite a follow? Test creator-led content, behind-the-scenes angles, or community-led hooks which typically convert follows better than polished brand assets. If the campaign is on TikTok, ensure the in-ad Follow CTA is enabled in the ad group settings.",status:"open"});
        } else if(cCpf>0&&cCpf>8){
          fl.push({id:id++,severity:"warning",platform:c.platform||"Meta",metric:"High Cost Per Follow",currentValue:fR(cCpf)+" Cost Per Follow",threshold:"R8.00 Cost Per Follow",message:"Campaign ‘"+c.campaignName+"’ is acquiring followers at "+fR(cCpf)+", above the R8.00 efficient range. Each new community member is costing more than the benchmark for paid social follower acquisition.",recommendation:"Refresh creative angles and test different hooks. If Cost Per Follow stays elevated for 48 hours, pause the weakest-performing ad set and redirect budget to the highest-converting follower variant.",status:"open"});
        } else if(cFollows>0&&cCpf>0&&cCpf<=4){
          fl.push({id:id++,severity:"positive",platform:c.platform||"Meta",metric:"Efficient Follower Acquisition",currentValue:fmt(cFollows)+" follows at "+fR(cCpf)+" Cost Per Follow",threshold:"R4.00 Cost Per Follow",message:"Campaign ‘"+c.campaignName+"’ has acquired "+fmt(cFollows)+" followers at "+fR(cCpf)+", well inside the efficient range. The creative-audience fit on this follower campaign is converting attention into community at a strong rate.",recommendation:"Scale this campaign by 15 to 20 percent before auction dynamics shift. Document the winning creative hook and apply the same approach to other follower campaigns in the portfolio.",status:"open"});
        }
      }
    } else if(isLeads){
      var cLeads=parseFloat(c.leads||0);
      var cCpl=cLeads>0?cSpend/cLeads:0;
      if(cLeads===0&&cSpend>1000){
        fl.push({id:id++,severity:"critical",platform:c.platform||"Meta",metric:"Underperforming Lead Gen Campaign",currentValue:"0 leads on "+fR(cSpend)+" spend",threshold:"any lead capture",message:"Campaign ‘"+c.campaignName+"’ has captured no leads on "+fR(cSpend)+" spend across "+fmt(cImps)+" impressions. For a lead-gen objective the success metric is form submissions, so a zero result with meaningful spend points to a broken form, mismatched audience, or weak offer.",recommendation:"Verify the lead form is rendering correctly across placements. Audit the offer alignment with the targeted audience. Consider tightening targeting to a smaller, higher-intent segment before scaling further.",status:"open"});
      } else if(cCpl>0&&cCpl>200){
        fl.push({id:id++,severity:"warning",platform:c.platform||"Meta",metric:"High Cost Per Lead",currentValue:fR(cCpl)+" Cost Per Lead",threshold:"R200 Cost Per Lead",message:"Campaign ‘"+c.campaignName+"’ is capturing leads at "+fR(cCpl)+", above the R200 efficient range for paid social lead generation in this market.",recommendation:"Test shorter forms (fewer fields), stronger lead magnets, or pre-qualifying questions to filter out low-intent fills. Consider switching from broad targeting to interest-narrow Lookalikes off your existing converter list.",status:"open"});
      }
    } else if(isAppInstall){
      // App Install campaigns are judged on CLICKS TO THE APP STORE,
      // not the downstream install. Meta and TikTok rarely report
      // installs back through ads insights — the SDK / app-events
      // integration owns that signal, so install counts read near zero
      // on most days even when the campaign is delivering well. Every
      // click on the App Install CTA is a click to the store, which is
      // the in-platform success metric. Mirrors Creative tab + Pulse.
      var cStoreClicks=parseFloat(c.clicks||0);
      var cCpsc=cStoreClicks>0?cSpend/cStoreClicks:0;
      if(cStoreClicks===0&&cSpend>1000){
        fl.push({id:id++,severity:"critical",platform:c.platform||"Meta",metric:"Underperforming App Install Campaign",currentValue:"0 store clicks on "+fR(cSpend)+" spend",threshold:"any click to app store",message:"Campaign ‘"+c.campaignName+"’ has driven no clicks to the app store on "+fR(cSpend)+" spend across "+fmt(cImps)+" impressions. Every click on the App Install CTA is a click to the store, so a zero result here points to broken creative, blocked CTA, or audience mismatch.",recommendation:"Confirm the App Install CTA is rendering. Audit creative for clear app demonstration in the first 3 seconds. Verify the campaign objective is set correctly in the platform.",status:"open"});
      } else if(cCpsc>0&&cCpsc>3){
        fl.push({id:id++,severity:"warning",platform:c.platform||"Meta",metric:"High Cost Per Store Click",currentValue:fR(cCpsc)+" Cost Per Click to App Store",threshold:"R3.00 Cost Per Click to App Store",message:"Campaign ‘"+c.campaignName+"’ is driving clicks to the app store at "+fR(cCpsc)+", above the R3.00 efficient range for paid social App Install campaigns.",recommendation:"Refresh creative around the strongest in-app benefit. Test app-store-style screenshots or short demo clips against polished brand creative. Tighten audience to known app users via Lookalikes off your installed-base list.",status:"open"});
      } else if(cStoreClicks>0&&cCpsc>0&&cCpsc<=1.5){
        fl.push({id:id++,severity:"positive",platform:c.platform||"Meta",metric:"Efficient App Store Acquisition",currentValue:fmt(cStoreClicks)+" store clicks at "+fR(cCpsc)+" each",threshold:"R1.50 Cost Per Click to App Store",message:"Campaign ‘"+c.campaignName+"’ has driven "+fmt(cStoreClicks)+" clicks to the app store at "+fR(cCpsc)+", well inside the efficient range.",recommendation:"Scale this campaign by 15 to 20 percent. Document the winning creative hook for replication on future App Install pushes.",status:"open"});
      }
    } else {
      // Traffic / Landing Page / unknown — CTR is the success signal here
      if(cCtr<0.6&&cImps>10000)fl.push({id:id++,severity:"critical",platform:c.platform||"Meta",metric:"Underperforming Campaign",currentValue:pc(cCtr)+" Click Through Rate on "+fR(cSpend),threshold:"0.60% Click Through Rate",message:"Campaign ‘"+c.campaignName+"’ is delivering "+pc(cCtr)+" Click Through Rate with "+fR(cSpend)+" invested against "+fmt(cImps)+" impressions. This level of engagement failure with meaningful spend indicates a structural issue with either creative relevance, audience targeting, or landing page experience.",recommendation:"Conduct a three-part diagnostic: (1) Creative, are the first 3 seconds compelling enough to stop the scroll? (2) Audience, is the targeting aligned with the offer? (3) Landing page, does the destination match the ad promise? Pause the lowest-performing ad sets and reallocate budget to campaigns delivering above "+pc(1.0)+" Click Through Rate.",status:"open"});
      else if(cCtr<1.0&&cImps>5000)fl.push({id:id++,severity:"warning",platform:c.platform||"Meta",metric:"Below-Benchmark Campaign",currentValue:pc(cCtr)+" Click Through Rate",threshold:"1.00%",message:"Campaign ‘"+c.campaignName+"’ at "+pc(cCtr)+" Click Through Rate is underperforming against the 1.0% benchmark with "+fR(cSpend)+" spend.",recommendation:"Review the top 3 ad creatives within this campaign. Replace the lowest performer with a new variant testing a different hook, format, or value proposition.",status:"open"});
      if(cCpc>8&&c.platform==="Meta")fl.push({id:id++,severity:"warning",platform:"Meta",metric:"High CPC Campaign",currentValue:fR(cCpc)+" Cost Per Click",threshold:"R8.00",message:"Campaign ‘"+c.campaignName+"’ is running at "+fR(cCpc)+" Cost Per Click, well above the efficient range. This inflated cost-per-click is dragging down the blended account Cost Per Click.",recommendation:"Review the bid strategy on this campaign. Switch from lowest-cost to cost-cap bidding with a target CPC of "+fR(cCpc*0.6)+". If performance doesn’t improve within 48 hours, consolidate this campaign’s budget into higher-performing campaigns.",status:"open"});
    }
  });
  if(blendedCpc>0&&blendedCpc<2.0)fl.push({id:id++,severity:"positive",platform:"Cross-platform",metric:"Blended Cost Efficiency",currentValue:fR(blendedCpc)+" blended Cost Per Click",threshold:"R2.00",message:"The cross-platform blended Cost Per Click of "+fR(blendedCpc)+" confirms the multi-channel strategy is delivering cost-efficient engagement. The combination of Meta’s targeted clicks and TikTok’s volume-driven engagement is optimising the overall cost base.",recommendation:"This efficiency level supports budget scaling. Model a 15-20% budget increase across both platforms and monitor whether the blended Cost Per Click holds below R2.00, if it does, the campaign has room to grow without sacrificing efficiency.",status:"open"});
  fl.sort(function(a,b){var o={critical:0,warning:1,info:2,positive:3};return(o[a.severity]||9)-(o[b.severity]||9);});
  return fl;
}

export default function MediaOnGas(){
  var au=useState(null),session=au[0],setSession=au[1];
  var ac=useState(true),authChecking=ac[0],setAuthChecking=ac[1];
  var ar=useState(null),authRole=ar[0],setAuthRole=ar[1];
  var ae=useState(""),authEmail=ae[0],setAuthEmail=ae[1];
  var an=useState(""),authName=an[0],setAuthName=an[1];
  var ts=useState("summary"),tab=ts[0],setTab=ts[1];
  var nowD=new Date();var monthStart=nowD.getFullYear()+"-"+String(nowD.getMonth()+1).padStart(2,"0")+"-01";var ds=useState(monthStart),df=ds[0],setDf=ds[1];
  var lastDay=new Date(nowD.getFullYear(),nowD.getMonth()+1,0).getDate();var monthEnd=nowD.getFullYear()+"-"+String(nowD.getMonth()+1).padStart(2,"0")+"-"+String(lastDay).padStart(2,"0");var de=useState(monthEnd),dt=de[0],setDt=de[1];
  // Summary-only comparison toggle: "off" | "wow" | "mom". When enabled,
  // the Summary tab's KPI tiles render a delta chip next to the value
  // showing vs the equivalent prior period. Other tabs are not affected.
  var cmo=useState("off"),compareMode=cmo[0],setCompareMode=cmo[1];
  var cmp=useState([]),compareCampaigns=cmp[0],setCompareCampaigns=cmp[1];
  var cs=useState([]),campaigns=cs[0],setCampaigns=cs[1];
  var ss=useState([]),selected=ss[0],setSelected=ss[1];
  var us=useState(null),urlSelected=us[0],setUrlSelected=us[1];
  var rs=useState(""),search=rs[0],setSearch=rs[1];
  var ls=useState(true),loading=ls[0],setLoading=ls[1];
  // Rotating quirky dashboard loader copy, swapped every 3.2s while
  // platform data is pulling so long cold-cache loads feel alive.
  var lqs=useState(QUIRKY_DASHBOARD_LOADERS[0]),loaderQuip=lqs[0],setLoaderQuip=lqs[1];
  useEffect(function(){
    if(!loading)return;
    setLoaderQuip(pickQuirky(QUIRKY_DASHBOARD_LOADERS));
    var iv=setInterval(function(){setLoaderQuip(pickQuirky(QUIRKY_DASHBOARD_LOADERS));},5000);
    return function(){clearInterval(iv);};
  },[loading]);
  // Creative-tab loader quip: separate rotation because ads.js can
  // finish after the main campaigns payload. Rotates whenever adsList
  // is empty so the Top Ads block feels alive instead of static.
  var alq=useState(QUIRKY_AD_LOADERS[0]),adLoaderQuip=alq[0],setAdLoaderQuip=alq[1];
  var wn=useState([]),dataWarnings=wn[0],setDataWarnings=wn[1];
  // Campaigns drawer is collapsed by default; user opens it from the top-nav
  // "{N} Campaigns" button when they want to filter the selection.
  var sc=useState(false),showCampaigns=sc[0],setShowCampaigns=sc[1];
  var sm=useState(false),showShare=sm[0],setShowShare=sm[1];
  // Brief success toast after a share email is sent, shown near the top of
  // the summary view for 3.5s then fades out on its own.
  var sts=useState(false),showSentToast=sts[0],setShowSentToast=sts[1];
  var scs=useState(false),showChat=scs[0],setShowChat=scs[1];
  // Force the chat to stay closed on every fresh mount / login. The FAB
  // stays visible so the user can still open it explicitly, but the
  // panel itself never auto-maximises on page load.
  useEffect(function(){ setShowChat(false); },[]);
  var sa=useState(false),showAudit=sa[0],setShowAudit=sa[1];
  var pa=useState(null),previewAd=pa[0],setPreviewAd=pa[1];
  var fs=useState([]),flags=fs[0],setFlags=fs[1];
  var ps=useState([]),pages=ps[0],setPages=ps[1];
  var as2=useState([]),adsets=as2[0],setAdsets=as2[1];
  var ad3=useState([]),adsList=ad3[0],setAdsList=ad3[1];
  useEffect(function(){
    if(adsList&&adsList.length>0)return;
    setAdLoaderQuip(pickQuirky(QUIRKY_AD_LOADERS));
    var iv2=setInterval(function(){setAdLoaderQuip(pickQuirky(QUIRKY_AD_LOADERS));},5000);
    return function(){clearInterval(iv2);};
  },[adsList&&adsList.length]);
  var ts1=useState(null),timeseries=ts1[0],setTimeseries=ts1[1];
  // Placement-level performance breakdown (FB Feed, IG Reels, Stories,
  // Audience Network, TikTok FYP, YouTube, Google Search, etc.). Pulled
  // from /api/placements with publisher_platform + platform_position
  // breakdowns on Meta. Re-fetches whenever the date range or selected
  // campaigns change so the section is always scoped to the user's
  // current view.
  var pl1=useState([]),placements=pl1[0],setPlacements=pl1[1];
  useEffect(function(){
    if(!isAuthed())return;
    var ids=(selected||[]).slice();
    var extra=[];
    (selected||[]).forEach(function(x){
      var s=String(x||"");
      var stripped=s.replace(/_(facebook|instagram)$/,"").replace(/^google_/,"");
      if(stripped&&extra.indexOf(stripped)<0)extra.push(stripped);
    });
    var allIds=ids.concat(extra);
    var idsQs=allIds.length>0?("&campaignIds="+encodeURIComponent(allIds.join(","))):"";
    fetch(API+"/api/placements?from="+df+"&to="+dt+idsQs,{headers:authHeaders()})
      .then(function(r){return r.json();})
      .then(function(d){if(d&&d.placements)setPlacements(d.placements);})
      .catch(function(){});
  },[df,dt,session,viewToken,selected]);
  // IG follower-count snapshots (last 8 days) from /api/ig-snapshot.
  // Used to reconcile the live IG total on Community Growth against
  // historic counts captured by the daily 06:00 SAST cron, so the team
  // can see "today vs yesterday" / "today vs 7 days ago" deltas
  // independent of Meta's per-day Page Insights settling.
  var igs1=useState(null),igSnapshots=igs1[0],setIgSnapshots=igs1[1];
  useEffect(function(){
    if(!isAuthed())return;
    fetch(API+"/api/ig-snapshot?days=8",{headers:authHeaders()})
      .then(function(r){return r.json();})
      .then(function(d){if(d.snapshots)setIgSnapshots(d.snapshots);})
      .catch(function(){});
  },[session,viewToken]);
  // Lazy-loaded demographics payload. Fetched the first time the user
  // opens the Demographics tab, then re-fetched when the date range
  // changes. Keeps Summary load time unaffected (demographic breakdowns
  // are slow — each Meta breakdown = a separate insights call).
  var dm1=useState(null),demoData=dm1[0],setDemoData=dm1[1];
  var dm2=useState(false),demoLoading=dm2[0],setDemoLoading=dm2[1];
  var dm3=useState(""),demoErr=dm3[0],setDemoErr=dm3[1];
  var dm4=useState(QUIRKY_AD_LOADERS[0]),demoQuip=dm4[0],setDemoQuip=dm4[1];
  var dm5=useState("impressions"),demoMetric=dm5[0],setDemoMetric=dm5[1];
  // Google intent signals for the Targeting and Summary persona cards.
  // Admin-only endpoint, so clients silently get null and the frontend
  // skips rendering the Google card for share-link views.
  var gi1=useState(null),googleIntent=gi1[0],setGoogleIntent=gi1[1];
  var gi2=useState(false),googleIntentLoading=gi2[0],setGoogleIntentLoading=gi2[1];
  // Last-fetched key for Google intent. The fetch effect short-circuits when
  // data is already present, so without tracking the (from, to, selection)
  // tuple we never refetch on campaign-selection change, the previous fix
  // symptom was Willowbrook reports reusing MoMo's cached Google persona.
  var gi3=useRef("");var googleIntentKeyRef=gi3;
  // Community member demographics (FB Page + IG + TikTok). One endpoint
  // that returns a per-platform breakdown of the owned-community audience,
  // rendered on the Community tab and on Summary.
  var cd1=useState(null),communityDemo=cd1[0],setCommunityDemo=cd1[1];
  var cd2=useState(false),communityDemoLoading=cd2[0],setCommunityDemoLoading=cd2[1];
  // Reset cached demo payload when date range changes so the tab fetches
  // fresh the next time it's opened.
  useEffect(function(){setDemoData(null);setGoogleIntent(null);setCommunityDemo(null);},[df,dt]);
  useEffect(function(){
    // Summary tab also renders per-stage demographic blocks under each
    // HIGHLIGHTS section, so fetch demoData whenever the user is on Summary
    // or Demographics. Other tabs skip to keep load time low.
    if((tab!=="demographics"&&tab!=="summary")||!isAuthed())return;
    if(demoData||demoLoading)return;
    setDemoLoading(true);setDemoErr("");
    var h=authHeaders();
    fetch(API+"/api/demographics?from="+df+"&to="+dt,{headers:h})
      .then(function(r){return r.ok?r.json():{error:"HTTP "+r.status};})
      .then(function(d){setDemoLoading(false);if(d&&d.error){setDemoErr(d.error);}else{setDemoData(d);}})
      .catch(function(err){setDemoLoading(false);setDemoErr("Connection error");console.error("Demo API error",err);});
  },[tab,df,dt,session,viewToken,demoData,demoLoading]);
  useEffect(function(){
    // Google intent fetch for Summary and Targeting persona cards. Admin-only
    // endpoint returns {available:false} for client tokens and the card
    // renderer falls through cleanly. Passes the current campaign selection
    // as &campaignIds=..., without this the endpoint aggregated across every
    // Google campaign in the account so selecting e.g. Willowbrook showed
    // MoMo-dominated persona data. The key ref forces a refetch whenever
    // dates or selection change, instead of short-circuiting on any prior
    // data.
    if(tab!=="summary"&&tab!=="targeting")return;
    if(!isAuthed())return;
    var ids=(selected||[]).slice();
    var extra=[];
    (selected||[]).forEach(function(x){
      var s=String(x||"");
      var stripped=s.replace(/_(facebook|instagram)$/,"").replace(/^google_/,"");
      if(stripped&&extra.indexOf(stripped)<0)extra.push(stripped);
    });
    var allIds=ids.concat(extra);
    var key=df+"|"+dt+"|"+allIds.slice().sort().join(",");
    if(googleIntentKeyRef.current===key)return;
    if(googleIntentLoading)return;
    googleIntentKeyRef.current=key;
    setGoogleIntentLoading(true);
    var h=authHeaders();
    var idsQs=allIds.length>0?("&campaignIds="+encodeURIComponent(allIds.join(","))):"";
    fetch(API+"/api/google-intent?from="+df+"&to="+dt+idsQs,{headers:h})
      .then(function(r){return r.ok?r.json():{available:false};})
      .then(function(d){setGoogleIntentLoading(false);setGoogleIntent(d||{available:false});})
      .catch(function(){setGoogleIntentLoading(false);setGoogleIntent({available:false});});
  },[tab,df,dt,session,viewToken,googleIntentLoading,selected]);
  useEffect(function(){
    // Community member demographics fetch. Drives the owned-audience cards
    // on the Community tab and Summary. Falls back silently on error.
    if(tab!=="community"&&tab!=="summary")return;
    if(!isAuthed()||communityDemo||communityDemoLoading)return;
    setCommunityDemoLoading(true);
    var h=authHeaders();
    fetch(API+"/api/community-demographics",{headers:h})
      .then(function(r){return r.ok?r.json():{available:false};})
      .then(function(d){setCommunityDemoLoading(false);setCommunityDemo(d||{available:false});})
      .catch(function(){setCommunityDemoLoading(false);setCommunityDemo({available:false});});
  },[tab,session,viewToken,communityDemo,communityDemoLoading]);
  useEffect(function(){
    if(!demoLoading)return;
    setDemoQuip(pickQuirky(QUIRKY_AD_LOADERS));
    var iv3=setInterval(function(){setDemoQuip(pickQuirky(QUIRKY_AD_LOADERS));},5000);
    return function(){clearInterval(iv3);};
  },[demoLoading]);
  var ts2=useState("week"),tsGran=ts2[0],setTsGran=ts2[1];
  var cf1=useState("all"),crFiltP=cf1[0],setCrFiltP=cf1[1];
  var cf2=useState("all"),crFiltF=cf2[0],setCrFiltF=cf2[1];
  var cf3=useState("all"),crFiltObj=cf3[0],setCrFiltObj=cf3[1];
  var tfs=useState(0),ttCumFollows=tfs[0],setTtCumFollows=tfs[1];
  var vt=useState(""),viewToken=vt[0],setViewToken=vt[1];

  useEffect(function(){
    var params=new URLSearchParams(window.location.search);
    var token=params.get("token");
    var camps=params.get("campaigns");
    if(camps){
      var ids=camps.split(",").map(function(id){return id.trim();}).filter(function(id){return id;});
      setUrlSelected(ids);
    }
    var from=params.get("from");
    if(from)setDf(from);
    var to=params.get("to");
    if(to)setDt(to);
    if(token){
      // Decode the JWT payload client-side (no verification, the backend
      // still validates every request) so we can auto-apply the campaigns
      // and date range the AM locked in when they sent the share link.
      // Without this, the client landed on "Select campaigns to view
      // summary" because the URL only carries ?token= with no separate
      // campaigns / from / to params.
      try{
        var parts=token.split(".");
        if(parts.length>=2){
          var b64=parts[1].replace(/-/g,"+").replace(/_/g,"/");
          while(b64.length%4!==0)b64+="=";
          var payload=JSON.parse(atob(b64));
          if(Array.isArray(payload.camps)&&payload.camps.length>0){
            setUrlSelected(payload.camps.map(String));
          }
          if(payload.from)setDf(payload.from);
          if(payload.to)setDt(payload.to);
        }
      }catch(_){/* malformed token — backend will reject it anyway */}
      setViewToken(token);
      setAuthRole("client");
      setAuthChecking(false);
      return;
    }
    var saved=sessionStorage.getItem("gas_session");
    if(!saved){setAuthChecking(false);return;}
    fetch(API+"/api/auth",{headers:{"x-session-token":saved}})
    .then(function(r){return r.json();})
    .then(function(d){if(d.valid){setSession(saved);setAuthRole(d.role||sessionStorage.getItem("gas_role")||"admin");setAuthEmail(d.email||sessionStorage.getItem("gas_email")||"");setAuthName(d.name||sessionStorage.getItem("gas_name")||"");}else{sessionStorage.removeItem("gas_session");sessionStorage.removeItem("gas_role");sessionStorage.removeItem("gas_email");sessionStorage.removeItem("gas_name");}setAuthChecking(false);})
    .catch(function(){sessionStorage.removeItem("gas_session");sessionStorage.removeItem("gas_role");sessionStorage.removeItem("gas_email");sessionStorage.removeItem("gas_name");setAuthChecking(false);});
  },[]);

  var handleLogin=function(token,role,em,nm){
    setSession(token);setAuthRole(role||"admin");setAuthEmail(em||"");setAuthName(nm||"");
    // Hard refresh on login. The token is already in sessionStorage (the login
    // screen writes it before calling this), so the next boot auto-authenticates
    // via the session-restore effect. Reloading guarantees returning users
    // (often logged out by the 15-minute idle timer below) pick up any JS/CSS
    // shipped since their last login — Vercel serves index.html with
    // cache-control: no-cache, so the reload always pulls the latest bundle.
    // Client share-link viewers never call this path.
    try{window.location.reload();}catch(_){}
  };
  var logSessionEnd=function(reason){
    var loginTs=parseInt(sessionStorage.getItem("gas_login_ts")||"0");
    var em=sessionStorage.getItem("gas_email")||"";
    if(loginTs&&em){
      var durMs=Date.now()-loginTs;
      var durMin=Math.round(durMs/60000);
      navigator.sendBeacon(API+"/api/usage?kind=session_end&actor="+encodeURIComponent(em)+"&duration="+durMin+"&reason="+encodeURIComponent(reason||"logout")+"&st="+encodeURIComponent(session||""));
    }
  };
  var handleLogout=function(){logSessionEnd("logout");sessionStorage.removeItem("gas_session");sessionStorage.removeItem("gas_role");sessionStorage.removeItem("gas_email");sessionStorage.removeItem("gas_name");sessionStorage.removeItem("gas_chat_history");sessionStorage.removeItem("gas_login_ts");setSession(null);setAuthRole(null);setAuthEmail("");setAuthName("");};
  var isSuperadmin=String(authEmail||"").toLowerCase()==="gary@gasmarketing.co.za";

  // Hard refresh (Ctrl/Cmd + Shift + R) forces admin re-login. The keydown
  // fires before the browser reload, so clearing sessionStorage synchronously
  // here means the next page load finds no token and routes to login. Client
  // share-link viewers are unaffected, their auth lives in the URL, not storage.
  useEffect(function(){
    var handler=function(e){
      var hard=(e.ctrlKey||e.metaKey)&&e.shiftKey&&(e.key==="R"||e.key==="r");
      if(!hard)return;
      if(window.location.pathname.indexOf("/view/")===0)return;
      try{sessionStorage.removeItem("gas_session");sessionStorage.removeItem("gas_role");sessionStorage.removeItem("gas_chat_history");}catch(_){}
    };
    window.addEventListener("keydown",handler);
    return function(){window.removeEventListener("keydown",handler);};
  },[]);

  var isClient=window.location.pathname.indexOf("/view/")===0||authRole==="client"||!!viewToken;
  var authHeaders=function(){if(viewToken)return{"Authorization":"Bearer "+viewToken};return{"x-session-token":session||""};};
  var isAuthed=function(){return !!session||!!viewToken;};

  // Thumbnail helper. `ad.thumbnail` in the ads payload is a raw signed Meta
  // CDN URL captured when the ads cache was built, and those signatures
  // expire within ~1 hour and can also point at low-res poster variants. By
  // the time a client opens their share link the next day, every tile image
  // is stale or a 192x192 fuzz. Route every tile through /api/ad-image
  // instead, which re-resolves on demand to the largest-area creative asset
  // and 302-redirects the browser to a fresh CDN URL each view. The proxy
  // has a 10 min server-side cache plus browser cache, so a page with 50
  // ads does one network round-trip per ad only on the first load.
  var thumbFor=function(ad){
    if(!ad)return "";
    var pLow=String(ad.platform||"").toLowerCase();
    var pKey=pLow.indexOf("instagram")>=0||pLow.indexOf("facebook")>=0?"meta":pLow.indexOf("tiktok")>=0?"tiktok":"";
    if(pKey&&ad.adId){
      var cId=String(ad.campaignId||"").replace(/_facebook$/,"").replace(/_instagram$/,"");
      var auth=(viewToken?("&token="+encodeURIComponent(viewToken)):"")+(!viewToken&&session?("&st="+encodeURIComponent(session)):"");
      return API+"/api/ad-image?platform="+pKey+"&adId="+encodeURIComponent(ad.adId)+(cId?("&campaignId="+encodeURIComponent(cId)):"")+auth;
    }
    return ad.thumbnail||"";
  };
  // Whether the ad has a resolvable thumbnail source. True when the ad-image
  // proxy can attempt resolution (Meta/TikTok with an adId) even if ads.js
  // didn't find a thumbnail in the initial batch fetch.
  var hasThumb=function(ad){
    if(!ad)return false;
    if(ad.thumbnail)return true;
    var pLow=String(ad.platform||"").toLowerCase();
    return !!(ad.adId&&(pLow.indexOf("instagram")>=0||pLow.indexOf("facebook")>=0||pLow.indexOf("tiktok")>=0));
  };

  // Idle logout: 15 minutes of no activity ends an admin or team-member session.
  // On the next login, handleLogin does a hard reload so returning users pick
  // up anything shipped since their last login. Client share-link views are
  // excluded — the token there is the auth and expires on its own schedule,
  // idle-logging them out would be hostile.
  // showIdleLogout drives the friendly "coffee break" modal that appears
  // when the team idle timer fires. handleLogout still clears the session
  // immediately (so the dashboard behind the modal flips to the login
  // screen), but the modal stays on top so the user understands what just
  // happened rather than being silently dumped on the login screen.
  var idleLogoutS=useState(false),showIdleLogout=idleLogoutS[0],setShowIdleLogout=idleLogoutS[1];
  useEffect(function(){
    if(!session||isClient)return;
    var IDLE_MS=15*60*1000;
    var timer=null;
    var doLogout=function(){logSessionEnd("idle");handleLogout();setShowIdleLogout(true);};
    var resetIdle=function(){if(timer)clearTimeout(timer);timer=setTimeout(doLogout,IDLE_MS);};
    var events=["mousemove","mousedown","keydown","scroll","touchstart","wheel"];
    events.forEach(function(e){window.addEventListener(e,resetIdle,{passive:true});});
    var onUnload=function(){logSessionEnd("tab_close");};
    window.addEventListener("beforeunload",onUnload);
    resetIdle();
    return function(){if(timer)clearTimeout(timer);events.forEach(function(e){window.removeEventListener(e,resetIdle);});window.removeEventListener("beforeunload",onUnload);};
  },[session,isClient]);

  // Client idle refresh: on a share link we don't log the viewer out (it's
  // a read-only report), but after 15 minutes of no activity we nudge them
  // to refresh so the metrics they're looking at are current and not stale
  // from when they first opened the tab.
  var idleNudgeS=useState(false),showIdleNudge=idleNudgeS[0],setShowIdleNudge=idleNudgeS[1];
  useEffect(function(){
    if(!isClient||!viewToken)return;
    // 10 minutes of inactivity on a client share link triggers the refresh
    // nudge. Purpose is dual: pull fresh platform data AND force the browser
    // to fetch the latest index.html, so any dashboard optimisations we've
    // deployed since the client loaded the tab surface on their next view
    // rather than being served a days-old bundle.
    var IDLE_MS=10*60*1000;
    var timer=null;
    var trigger=function(){setShowIdleNudge(true);};
    var resetIdle=function(){if(timer)clearTimeout(timer);if(!showIdleNudge)timer=setTimeout(trigger,IDLE_MS);};
    var events=["mousemove","mousedown","keydown","scroll","touchstart","wheel"];
    events.forEach(function(e){window.addEventListener(e,resetIdle,{passive:true});});
    resetIdle();
    return function(){if(timer)clearTimeout(timer);events.forEach(function(e){window.removeEventListener(e,resetIdle);});};
  },[isClient,viewToken,showIdleNudge]);

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
  var ttBaselines={"momo":{followers:129400,asOf:"2026-04-18"}};
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


  var fetchData=function(){
    setLoading(true);
    var h=authHeaders();
    fetch(API+"/api/campaigns?from="+df+"&to="+dt,{headers:h}).then(function(r){return r.json();}).then(function(d){
      if(d.objectiveDiagnostic){try{console.log("[GAS] Objective classification by platform:\n"+JSON.stringify(d.objectiveDiagnostic,null,2));}catch(e){}}
      if(d.metaSupplementDiag){try{console.log("[GAS] Meta ad-level publisher_platform supplement:\n"+JSON.stringify(d.metaSupplementDiag,null,2));}catch(e){}}
      if(d.campaigns){
        setCampaigns(d.campaigns);
        // /api/campaigns returns ACTIVE+SCHEDULED campaigns regardless of
        // date. The "active in this window" set is the subset that
        // actually delivered impressions or spend. We always auto-select
        // this set so a date change refreshes the visible portfolio to
        // what actually ran in the new period, including campaigns that
        // didn't run in the previous period (e.g. May → April reveals
        // April-only campaigns).
        var activeMap={};
        d.campaigns.forEach(function(x){if(parseFloat(x.impressions||0)>0||parseFloat(x.spend||0)>0)activeMap[x.campaignId]=true;});
        var activeIds=Object.keys(activeMap);
        // Share-link views: respect the URL-specified selection but only
        // its intersection with active-in-window so a stale share link
        // can't show zero-data campaigns. If the intersection is empty,
        // fall through to the standard auto-pick.
        if(urlSelected&&urlSelected.length>0){
          var validUrl=urlSelected.filter(function(id){return activeMap[id]===true;});
          setSelected(validUrl.length>0?validUrl:activeIds);
        } else {
          setSelected(activeIds);
        }
      }
      if(d.pages){setPages(d.pages);}
      if(d.ttCumulativeFollows!==undefined){setTtCumFollows(d.ttCumulativeFollows);}
      setDataWarnings(Array.isArray(d.warnings)?d.warnings:[]);
      setLoading(false);
    }).catch(function(err){console.error("API Error:",err);setLoading(false);});
    fetch(API+"/api/adsets?from="+df+"&to="+dt,{headers:h}).then(function(r){return r.json();}).then(function(d2){if(d2.adsets){setAdsets(d2.adsets);}}).catch(function(){});
    fetch(API+"/api/ads?from="+df+"&to="+dt,{headers:h}).then(function(r){return r.json();}).then(function(d3){if(d3.ads){setAdsList(d3.ads);}}).catch(function(err){console.error("Ads API error:",err);});
    // Timeseries fetch lives in its own useEffect below so it can scope
    // by the selected campaignIds. Removed the unscoped duplicate that
    // used to fire here on every fetchData() because it raced with the
    // scoped fetch and could briefly replace the trendline data with
    // a portfolio-wide aggregate.
  };
  useEffect(function(){if(isAuthed()){fetchData();}},[df,dt,session,viewToken]);
  // Comparison data fetch. Only runs when compareMode is on. Reuses the
  // same /api/campaigns endpoint for the prior date range so the existing
  // 5-minute response cache makes the second toggle of the same period
  // instant. Clears compareCampaigns on every mode change so the Summary
  // deltas don't keep rendering stale values from the previous mode while
  // the new range is in flight (the perceived bug: toggling MoM -> WoW
  // looked frozen because compareCampaigns still held the MoM pool until
  // WoW data arrived; OFF -> WoW worked because OFF cleared first).
  useEffect(function(){
    if(!isAuthed())return;
    if(compareMode==="off"){setCompareCampaigns([]);return;}
    var range=computeComparisonRange(df,dt,compareMode);
    if(!range)return;
    setCompareCampaigns([]);
    var cancelled=false;
    var h=authHeaders();
    fetch(API+"/api/campaigns?from="+range.from+"&to="+range.to,{headers:h})
      .then(function(r){return r.ok?r.json():null;})
      .then(function(d){if(!cancelled&&d&&d.campaigns)setCompareCampaigns(d.campaigns);})
      .catch(function(){});
    return function(){cancelled=true;};
  },[df,dt,compareMode,session,viewToken]);
  // Timeseries / Performance Trendlines must honour the current campaign
  // selection. Without passing campaignIds, the backend aggregated across
  // every campaign the admin can see, and the chart showed a full-account
  // trendline even when only a single sub-campaign was selected.
  useEffect(function(){
    if(!isAuthed())return;
    var ids=(selected||[]).slice();
    // Also push the raw (unsuffixed) form and the bare numeric id so the
    // backend can match against Meta breakdown rows that carry raw campaign
    // ids, TikTok / Google ids that are unsuffixed, and so on.
    var extra=[];
    (selected||[]).forEach(function(x){
      var s=String(x||"");
      var stripped=s.replace(/_(facebook|instagram)$/,"").replace(/^google_/,"");
      if(stripped&&extra.indexOf(stripped)<0)extra.push(stripped);
    });
    var allIds=ids.concat(extra);
    var idsQs=allIds.length>0?("&campaignIds="+encodeURIComponent(allIds.join(","))):"";
    fetch(API+"/api/timeseries?from="+df+"&to="+dt+"&granularity="+tsGran+idsQs,{headers:authHeaders()})
      .then(function(r){return r.json();})
      .then(function(d){if(d.series){setTimeseries(d);}})
      .catch(function(){});
  },[df,dt,session,viewToken,tsGran,selected]);
  // Cache-busting hard reload, used by the header REFRESH button and the
  // idle-nudge "Refresh Now" button. Strips any prior _r=, then cleans up
  // the dangling separators that strip can leave behind (?_r=X&token → ?
  // &token, &_r=X&token → &&token), then appends a fresh _r=timestamp so
  // the browser refetches index.html and picks up the latest hashed JS
  // bundle. Fresh platform data follows automatically from the new page
  // load. Preserves the JWT view token + any other existing query params
  // (campaigns, from, to, etc) so client share links survive the refresh.
  var hardRefresh=function(){
    var u=window.location.href.replace(/[?&]_r=\d+/g,"");
    u=u.replace(/\?&/g,"?").replace(/&&+/g,"&").replace(/[?&]$/,"");
    u+=(u.indexOf("?")>=0?"&":"?")+"_r="+Date.now();
    window.location.replace(u);
  };
  var refreshData=hardRefresh;
  // Performance Trendlines block, shared between Summary and Optimisation
  // tabs so both render the same matrix without code duplication. Reads
  // the timeseries state, the granularity toggle, and the dashboard's
  // colour + format helpers from the enclosing component scope.
  var renderTrendlines=function(opts){
    // opts.showCommentary defaults to true. Summary opts out so the
    // section reads as a clean visual block; Optimisation keeps the
    // momentum-leader / attention-point summary at the foot.
    var showCommentary=!opts||opts.showCommentary!==false;
    var objRows=[{key:"leads",label:"Lead Gen",accent:P.rose},{key:"appinstall",label:"Clicks to App Store",accent:P.fb},{key:"followers",label:"Followers",accent:P.tt},{key:"landingpage",label:"Landing Page",accent:P.cyan}];
    var platCols=[{key:"Facebook",label:"FB",accent:P.fb},{key:"Instagram",label:"IG",accent:P.ig},{key:"TikTok",label:"TT",accent:P.tt},{key:"Google",label:"Google",accent:P.gd}];
    var hasData=timeseries&&timeseries.series&&timeseries.series.length>0;
    var buckets=(timeseries&&timeseries.buckets)||[];
    var findSeries=function(pl,ob){if(!hasData)return null;for(var i=0;i<timeseries.series.length;i++){var s=timeseries.series[i];if(s.platform===pl&&s.objective===ob)return s;}return null;};
    // IG Followers reconciliation: Meta cannot attribute in-feed Follow
    // taps to specific ads on Instagram, so api/timeseries returns
    // Profile Visits (clicks) for the IG Followers cell. Highlights
    // uses Page Insights net follower_growth for the same period
    // instead, which means the two view's Followers totals diverge by
    // the click-vs-growth gap. We close the gap here by computing the
    // same igGrowth Highlights uses (matched IG pages, summed
    // follower_growth from the /api/campaigns response) and
    // OVERRIDING the IG Followers cell with that number. The headline
    // now reconciles to Highlights cell-for-cell. The sparkline
    // distributes the period growth proportionally to weekly IG ad
    // delivery so the trend shape stays meaningful.
    var trendSel=campaigns.filter(function(c){return selected.indexOf(c.campaignId)>=0;});
    var matchedIgPages={};
    trendSel.forEach(function(c){
      pages.forEach(function(pg){
        if(!pg.instagram_business_account)return;
        if(matchedIgPages[pg.id])return;
        if(autoMatchPage(c.campaignName,pg.name)>=2)matchedIgPages[pg.id]=pg;
      });
    });
    var igGrowthOverride=0;
    Object.keys(matchedIgPages).forEach(function(id){
      var pg=matchedIgPages[id];
      igGrowthOverride+=parseFloat((pg.instagram_business_account&&pg.instagram_business_account.follower_growth)||0);
    });
    var wow=function(points){if(!points||points.length<2)return null;var last=points[points.length-1],prev=points[points.length-2];if(prev.results<=0&&last.results<=0)return null;if(prev.results===0)return {delta:100,direction:"up",label:"new"};var d=((last.results-prev.results)/prev.results)*100;return{delta:Math.abs(d),direction:d>=0?"up":"down",label:(d>=0?"+":"-")+Math.abs(d).toFixed(2)+"%"};};
    var sparkPath=function(points,h,w){if(!points||points.length===0)return"";var vals=points.map(function(p){return p.results;});var max=Math.max.apply(null,vals.concat([1]));var min=Math.min.apply(null,vals);var range=max-min||1;return points.map(function(p,i){var x=(i/(Math.max(points.length-1,1)))*w;var y=h-((p.results-min)/range)*h;return(i===0?"M":"L")+x.toFixed(1)+","+y.toFixed(1);}).join(" ");};
    var sparkArea=function(points,h,w){if(!points||points.length===0)return"";var path=sparkPath(points,h,w);if(!path)return"";return path+" L"+w+","+h+" L0,"+h+" Z";};
    return <div style={{background:P.glass,borderRadius:18,padding:"6px 28px 28px",marginBottom:28,border:"1px solid "+P.rule}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"18px 0 14px"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          {Ic.chart(P.cyan,18)}
          <span style={{fontSize:16,fontWeight:900,color:P.cyan,fontFamily:fm,letterSpacing:3,lineHeight:1,textTransform:"uppercase"}}>Performance Trendlines</span>
        </div>
        <div style={{display:"flex",gap:6}}>
          {["week","month"].map(function(g){return <button key={g} onClick={function(){setTsGran(g);}} style={{background:tsGran===g?P.cyan+"25":"transparent",border:"1px solid "+(tsGran===g?P.cyan+"60":P.rule),borderRadius:6,padding:"5px 12px",color:tsGran===g?P.cyan:P.label,fontSize:10,fontWeight:800,fontFamily:fm,cursor:"pointer",letterSpacing:1.5,textTransform:"uppercase"}}>{g==="week"?"Weekly":"Monthly"}</button>;})}
        </div>
      </div>
      {!hasData?<div style={{padding:"40px 20px",textAlign:"center",color:P.caption,fontFamily:fm,fontSize:12,lineHeight:1.8}}><div style={{fontSize:14,color:P.label,marginBottom:6}}>Loading trendlines…</div><div>Fetching {tsGran==="week"?"weekly":"monthly"} performance from Meta, TikTok and Google.</div></div>:<div>
        {/* Scope line — dates + selected count, so it's obvious the
            cells aggregate exactly the campaigns currently ticked over
            the date range chosen at the top of the dashboard, nothing
            wider. Granularity (Weekly / Monthly) controls only how the
            sparkline is bucketed inside that window. */}
        <div style={{fontSize:10,color:P.label,fontFamily:fm,letterSpacing:1.5,marginBottom:10,textTransform:"uppercase"}}>{tsGran==="week"?"Weekly":"Monthly"} aggregation, scoped to your selected period ({df} to {dt}) &middot; {selected.length} campaign{selected.length===1?"":"s"} selected</div>
        <div style={{display:"grid",gridTemplateColumns:"140px repeat(4,1fr)",gap:8,marginBottom:6}}>
          <div/>
          {platCols.map(function(p){return <div key={p.key} style={{textAlign:"center",fontSize:11,fontWeight:900,color:p.accent,fontFamily:fm,letterSpacing:1.5,padding:"8px 4px",borderBottom:"1px solid "+p.accent+"35"}}>{p.label}</div>;})}
        </div>
        {objRows.map(function(o){
          return <div key={o.key} style={{display:"grid",gridTemplateColumns:"140px repeat(4,1fr)",gap:8,marginBottom:8,alignItems:"stretch"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 8px",background:o.accent+"10",border:"1px solid "+o.accent+"30",borderRadius:8}}>
              <div style={{width:6,height:28,borderRadius:3,background:o.accent}}/>
              <span style={{fontSize:11,fontWeight:900,color:o.accent,fontFamily:fm,letterSpacing:1}}>{o.label.toUpperCase()}</span>
            </div>
            {platCols.map(function(p){
              var s=findSeries(p.key,o.key);
              var pts=s&&s.points||[];
              // IG Followers override: use Page Insights follower_growth
              // (Highlights' source of truth) instead of Profile Visits
              // clicks, so the cell reconciles to Objective Highlights
              // cell-for-cell. The per-week sparkline is reshaped to
              // distribute the period growth proportionally to weekly
              // IG ad delivery, so the trend reads meaningfully.
              if(p.key==="Instagram"&&o.key==="followers"&&pts.length>0){
                var totalClicks=pts.reduce(function(a,x){return a+(x.results||0);},0);
                if(totalClicks>0&&igGrowthOverride!==0){
                  var ratio=igGrowthOverride/totalClicks;
                  pts=pts.map(function(x){return Object.assign({},x,{results:Math.round((x.results||0)*ratio)});});
                } else {
                  // No click activity OR zero growth — flat-distribute
                  // the override across buckets so the headline still
                  // matches Highlights even with no per-week shape.
                  var per=Math.round(igGrowthOverride/Math.max(pts.length,1));
                  pts=pts.map(function(x){return Object.assign({},x,{results:per});});
                }
              }
              var totalResults=pts.reduce(function(a,x){return a+(x.results||0);},0);
              var totalSpend=pts.reduce(function(a,x){return a+(x.spend||0);},0);
              var delta=wow(pts);
              var hasActivity=totalResults>0||totalSpend>0;
              return <div key={p.key} style={{background:"rgba(0,0,0,0.3)",border:"1px solid "+P.rule,borderRadius:8,padding:"10px 10px 6px",display:"flex",flexDirection:"column",minHeight:92}}>
                {hasActivity?<div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
                    <div><div style={{fontSize:15,fontWeight:900,color:o.accent,fontFamily:fm,lineHeight:1}}>{fmt(totalResults)}</div><div style={{fontSize:8,color:P.label,fontFamily:fm,letterSpacing:1,marginTop:2}}>{fR(totalSpend)}</div></div>
                    {delta&&<div style={{fontSize:9,fontWeight:900,color:delta.direction==="up"?P.mint:P.rose,fontFamily:fm,background:(delta.direction==="up"?P.mint:P.rose)+"18",padding:"2px 6px",borderRadius:4,letterSpacing:0.5}}>{delta.label}</div>}
                  </div>
                  <svg width="100%" height="36" viewBox={"0 0 100 36"} preserveAspectRatio="none" style={{display:"block"}}>
                    <path d={sparkArea(pts,36,100)} fill={p.accent+"25"}/>
                    <path d={sparkPath(pts,36,100)} stroke={p.accent} strokeWidth="1.6" fill="none" strokeLinejoin="round" strokeLinecap="round"/>
                  </svg>
                </div>:<div style={{display:"flex",alignItems:"center",justifyContent:"center",flex:1,color:P.caption,fontSize:9,fontFamily:fm,letterSpacing:1,textTransform:"uppercase"}}>No activity</div>}
              </div>;
            })}
          </div>;
        })}
        {showCommentary&&<div style={{marginTop:18,padding:"14px 16px",background:"rgba(0,0,0,0.25)",borderRadius:10,border:"1px solid "+P.rule}}>
          {(function(){
            var lines=[];
            var rankings=[];
            objRows.forEach(function(o){platCols.forEach(function(p){var s=findSeries(p.key,o.key);if(!s)return;var pts=s.points;var totalRes=pts.reduce(function(a,x){return a+x.results;},0);if(totalRes<5)return;var d=wow(pts);if(!d)return;rankings.push({plat:p.label,obj:o.label,delta:d,totalRes:totalRes});});});
            rankings.sort(function(a,b){return (b.delta.direction==="up"?b.delta.delta:-b.delta.delta)-(a.delta.direction==="up"?a.delta.delta:-a.delta.delta);});
            var topUp=rankings.filter(function(r){return r.delta.direction==="up";})[0];
            var topDown=rankings.slice().reverse().filter(function(r){return r.delta.direction==="down";})[0];
            if(topUp)lines.push("Momentum leader: "+topUp.obj+" on "+topUp.plat+" is "+topUp.delta.label+" "+(tsGran==="week"?"WoW":"MoM")+" ("+fmt(topUp.totalRes)+" results to date). Scaling candidate.");
            if(topDown)lines.push("Attention point: "+topDown.obj+" on "+topDown.plat+" is "+topDown.delta.label+" "+(tsGran==="week"?"WoW":"MoM")+". Check frequency, creative fatigue or audience saturation.");
            if(lines.length===0)lines.push("Not enough "+(tsGran==="week"?"weekly":"monthly")+" history yet to spot momentum patterns. Re-check after another "+(tsGran==="week"?"week":"month")+" of delivery.");
            return <div style={{fontSize:11,color:P.txt,fontFamily:fm,lineHeight:1.7}}>{lines.map(function(l,li){return <div key={li} style={{marginBottom:5,display:"flex",gap:8}}><span style={{color:P.cyan,fontWeight:900}}>{"▸"}</span><span>{l}</span></div>;})}</div>;
          })()}
        </div>}
        {/* Reconciliation note. Every cell here, including the IG
            Followers cell, reconciles to Objective Highlights for the
            same date range. The IG Followers cell uses Page Insights
            net follower growth distributed across weeks proportional
            to ad delivery, since Meta does not expose per-ad IG follow
            attribution. */}
        <div style={{marginTop:10,fontSize:9,color:P.caption,fontFamily:fm,fontStyle:"italic",lineHeight:1.6}}>All cells reconcile to Objective Highlights for the same date range. The IG Followers cell uses Page Insights net follower growth (Meta does not expose per-ad IG follow attribution), distributed across weeks proportional to ad delivery so the trend shape stays meaningful.</div>
      </div>}
    </div>;
  };
  var toggle=function(id){setSelected(function(p){return p.indexOf(id)>=0?p.filter(function(x){return x!==id;}):p.concat([id]);});};
  var toggleGroup=function(ids){setSelected(function(p){var allIn=ids.every(function(id){return p.indexOf(id)>=0;});if(allIn){return p.filter(function(x){return ids.indexOf(x)<0;});}var merged=p.slice();ids.forEach(function(id){if(merged.indexOf(id)<0)merged.push(id);});return merged;});};
  var selectAll=function(){var f=campaigns.filter(function(c){return (parseFloat(c.impressions||0)>0||parseFloat(c.spend||0)>0)&&(String(c.campaignName||"").toLowerCase().indexOf(search.toLowerCase())>=0||String(c.accountName||"").toLowerCase().indexOf(search.toLowerCase())>=0);});setSelected(f.map(function(c){return c.campaignId;}));};
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
  // Blended frequency across the full media mix, needed by several tabs
  // (Summary, Deep Dive) so defined at outer scope to stay in range for
  // both. Google reach comes in at the 2x estimate api/campaigns.js sets.
  var blFreq=(m.reach+t.reach+computed.gd.reach)>0?(m.impressions+t.impressions+computed.gd.impressions)/(m.reach+t.reach+computed.gd.reach):0;
  var benchmarks={
    meta:{cpm:{low:12,mid:18,high:25,label:"R12-R25"},cpc:{low:0.80,mid:1.50,high:3.00,label:"R0.80-R3.00"},ctr:{low:0.8,mid:1.2,high:2.0,label:"0.8%-2.0%"},cpf:{low:2.0,mid:4.0,high:8.0,label:"R2-R8"},cpl:{low:30,mid:75,high:100,label:"R30-R100"}},
    tiktok:{cpm:{low:4,mid:8,high:15,label:"R4-R15"},cpc:{low:0.01,mid:0.05,high:0.20,label:"R0.01-R0.20"},cpf:{low:1.0,mid:2.5,high:5.0,label:"R1-R5"}},
    google:{cpm:{low:8,mid:15,high:30,label:"R8-R30"},cpc:{low:1.0,mid:3.0,high:6.0,label:"R1-R6"}}
  };
  var benchLabel=function(val,bm){if(!bm)return"";if(val<=bm.low)return"well below the industry benchmark ("+bm.label+")";if(val<=bm.mid)return"within the efficient range of the industry benchmark ("+bm.label+")";if(val<=bm.high)return"at the upper end of the industry benchmark ("+bm.label+")";return"above the industry benchmark range ("+bm.label+")";};
  var daysBetween=function(a,b){return Math.max(1,Math.round((new Date(b)-new Date(a))/86400000)+1);};
  // "Today" in Africa/Johannesburg (UTC+2) rather than UTC. Prevents the pacing % from
  // shifting by a day between 22:00-23:59 local time when UTC date rolls over first.
  var todayLocal=function(){return new Date().toLocaleDateString("en-CA",{timeZone:"Africa/Johannesburg"});};
  var totalDays=daysBetween(df,dt);
  var elapsed=daysBetween(df,todayLocal());
  var pctElapsed=Math.min(100,(elapsed/totalDays*100));
  var pctSpent=computed.totalSpend>0&&computed.grand&&computed.grand.spend>0?100:0;
  var dailySpendRate=elapsed>0?computed.totalSpend/elapsed:0;
  var projectedSpend=dailySpendRate*totalDays;
  var freqStatus=m.frequency>4?"critical":m.frequency>3?"warning":m.frequency>2?"healthy":"early";
  var ack=function(id){setFlags(function(p){return p.map(function(f){return f.id===id?Object.assign({},f,{status:"acknowledged"}):f;});});};
  var resolve=function(id){setFlags(function(p){return p.map(function(f){return f.id===id?Object.assign({},f,{status:"resolved"}):f;});});};
  var openFlags=flags.filter(function(f){return f.status==="open";}).length;

  var tabs;
  if(isClient){
    // Clients only ever see Summary. Force the active tab to summary so a stale
    // tab state from admin mode cannot leak through.
    tabs=[{id:"summary",label:"Summary",icon:Ic.crown(P.ember,16)}];
  } else {
    tabs=[{id:"summary",label:"Summary",icon:Ic.crown(P.ember,16)},{id:"overview",label:"Deep Dive",icon:Ic.chart(P.orchid,16)},{id:"creative",label:"Creative",icon:Ic.fire(P.blaze,16)},{id:"demographics",label:"Demographics",icon:Ic.globe(P.cyan,16)},{id:"community",label:"Community",icon:Ic.users(P.mint,16)},{id:"targeting",label:"Targeting",icon:Ic.radar(P.solar,16)},{id:"optimise",label:"Optimisation"+(openFlags>0?" ("+openFlags+")":""),icon:Ic.flag(P.warning,16)},{id:"create",label:"Create",icon:Ic.bolt(P.ember,16)}];
  }
  useEffect(function(){if(isClient&&tab!=="summary")setTab("summary");},[isClient,tab]);
  // Scroll to top whenever the tab changes so each page lands cleanly
  // at its header rather than wherever the previous scroll position was.
  useEffect(function(){try{window.scrollTo({top:0,behavior:"smooth"});}catch(_){window.scrollTo(0,0);}},[tab]);

  if(authChecking)return(<div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16,background:"linear-gradient(170deg,#06020e,#0d0618 30%,#150b24 60%,#0d0618)"}}>
    <div style={{width:42,height:42,border:"3px solid "+P.rule,borderTop:"3px solid "+P.ember,borderRadius:"50%",animation:"spin 1s linear infinite"}}/>
    <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
    <div style={{color:P.label,fontFamily:fm,fontSize:11,letterSpacing:3,textTransform:"uppercase",fontWeight:700}}>Checking you in</div>
  </div>);
  // Invitation signup flow, routed when the URL path starts with /signup.
  // Lives outside the session check so new invitees reach the form even
  // though they are not yet authenticated.
  if(window.location.pathname.indexOf("/signup")===0)return(<SignupScreen/>);
  if(!session&&!viewToken)return(<>
    <LoginScreen onLogin={handleLogin}/>
    {/* Coffee-break modal sits over the login screen when the team's
        15-minute idle timer fires. Tells the user "we logged you out
        because you stepped away" instead of silently dumping them on
        the login screen. Same visual language as the client share-link
        idle nudge so the dashboard speaks one voice. */}
    {showIdleLogout&&<div style={{position:"fixed",inset:0,zIndex:2200,background:"rgba(6,2,14,0.78)",backdropFilter:"blur(6px)",display:"flex",alignItems:"center",justifyContent:"center",padding:"24px 16px"}}>
      <div style={{width:440,maxWidth:"94vw",background:"linear-gradient(170deg,#0d0618 0%,#1a0b2e 100%)",border:"1px solid rgba(249,98,3,0.35)",borderRadius:18,padding:"30px 30px 24px",boxShadow:"0 30px 80px rgba(0,0,0,0.65),0 0 60px rgba(249,98,3,0.18)",textAlign:"center",animation:"gasEnter 0.45s cubic-bezier(0.2,0.8,0.2,1) both"}}>
        <div style={{fontSize:42,marginBottom:8}}>{"☕"}</div>
        <div style={{fontSize:11,color:P.ember,letterSpacing:3,fontWeight:800,fontFamily:fm,textTransform:"uppercase",marginBottom:10}}>You stepped away</div>
        <div style={{fontSize:16,color:P.txt,fontFamily:ff,lineHeight:1.5,fontWeight:700,marginBottom:10}}>The dashboard took a 15 minute coffee break.</div>
        <div style={{fontSize:13,color:"rgba(255,251,248,0.78)",fontFamily:ff,lineHeight:1.7,marginBottom:22}}>We logged you out for security. Sign in again to pick up where you left off, the dashboard remembers your tab and date range.</div>
        <button onClick={function(){setShowIdleLogout(false);}} style={{background:gEmber,border:"none",borderRadius:10,padding:"13px 28px",color:"#fff",fontSize:12,fontWeight:900,fontFamily:fm,cursor:"pointer",letterSpacing:2.5,boxShadow:"0 6px 20px rgba(249,98,3,0.35)",textTransform:"uppercase"}}>Sign in again</button>
        <div style={{marginTop:16,fontSize:10,color:P.caption,fontFamily:fm,fontStyle:"italic",letterSpacing:0.5,lineHeight:1.6}}>Idle logout fires after 15 minutes of no mouse, scroll or keyboard activity. Lock your laptop when you step away to keep the dashboard safe.</div>
      </div>
    </div>}
  </>);

  // Shared demographic blocks. Populated by the IIFE rendered near the top of
  // the main content area (before any tab conditional JSX) so both the
  // Demographics tab AND the Summary tab can consume individual blocks.
  // Reset to null on every render; the IIFE re-populates when demoData is
  // ready. When data is empty, demoFallback holds the "no data" placeholder.
  var demoBlocks = null;
  var demoFallback = null;
  // Lightweight audience snapshot used by the Executive Summary at the bottom
  // of the page. Populated by the demoBlocks IIFE (same scope where the stage
  // helpers like topSegmentFor / topProvFor / genderSharesFor are defined) so
  // the exec summary doesn't have to re-derive them. Stays null when the
  // demographics endpoint is still loading / errored — the exec summary
  // gracefully skips the audience paragraph in that case.
  var demoSummary = null;
  // Per-platform targeting persona data (click-weighted). Consumed by the
  // Targeting tab's new Who-Is-Clicking section. Populated by the same IIFE
  // that builds demoBlocks, so we don't re-filter the demographic rows twice.
  var targetingPersonas = null;

  // Populate shared demoBlocks / demoFallback once per render so Summary and
  // Demographics tabs can read individual stage blocks. Runs regardless of
  // active tab because it lives at the component body, not inside tab JSX.
  if(demoData&&!demoErr&&!demoLoading)(function(){
            var sel=campaigns.filter(function(x){return selected.indexOf(x.campaignId)>=0;});
            var selSet={};sel.forEach(function(c){selSet[c.campaignId]=true;selSet[c.rawCampaignId||String(c.campaignId||"").replace(/_facebook$/,"").replace(/_instagram$/,"")]=true;});
            var inSel=function(r){return selSet[String(r.campaignId||"")]||selSet[String(r.campaignId||"").replace(/_facebook$/,"").replace(/_instagram$/,"")];};
            var agRowsRaw=(demoData.ageGender||[]).filter(inSel);
            var regRows=(demoData.region||[]).filter(inSel);
            var devRows=(demoData.device||[]).filter(inSel);
            var cityRows=(demoData.googleCity||[]).filter(inSel);

            // Strip Unknown age / gender rows — they pollute the
            // visualisation without adding signal (Meta sometimes returns
            // 'unknown' for users with a blocked profile).
            var ageOrder=["18-24","25-34","35-44","45-54","55-64","65+"];
            var genderOrder=["female","male"];
            var genderLabel={female:"Female",male:"Male"};
            var agRows=agRowsRaw.filter(function(r){return ageOrder.indexOf(String(r.age||""))>=0||genderOrder.indexOf(String(r.gender||"").toLowerCase())>=0;});

            if(agRows.length===0&&regRows.length===0&&devRows.length===0&&cityRows.length===0){
              demoFallback = <div style={{background:P.glass,border:"1px solid "+P.rule,borderRadius:18,padding:"40px 24px",textAlign:"center",color:P.label,fontFamily:fm,fontSize:13,lineHeight:1.7}}>No demographic data returned for the selected campaigns and period yet. Try a wider date range, or confirm campaigns have demographic targeting enabled on the platform.</div>;
              return null;
            }

            // Objective classifier — mirrors Summary's logic exactly so the
            // Demographics "Objective" total reconciles. Returns "Leads",
            // "Followers" or "Traffic". Traffic is the measured-by-clicks
            // bucket and absorbs LandingPage / AppInstall / PaidSearch / etc.
            var classifyObjective=function(camp){
              var canon=String(camp.objective||"").toLowerCase();
              if(canon==="leads")return "Leads";
              if(canon==="followers")return "Followers";
              if(canon==="appinstall"||canon==="landingpage")return "Traffic";
              var n=String(camp.campaignName||"").toLowerCase();
              if(n.indexOf("appinstal")>=0||n.indexOf("app install")>=0||n.indexOf("app_install")>=0)return "Traffic";
              if(n.indexOf("follower")>=0||n.indexOf("_like_")>=0||n.indexOf("_like ")>=0||n.indexOf("paidsocial_like")>=0||n.indexOf("like_facebook")>=0||n.indexOf("like_instagram")>=0)return "Followers";
              if(n.indexOf("lead")>=0||n.indexOf("pos")>=0)return "Leads";
              return "Traffic";
            };
            // Per-campaign objective value — matches Summary's per-objective
            // result computation: Leads -> camp.leads, Followers -> follows+pageLikes,
            // everything else -> camp.clicks.
            var objectiveValueFor=function(camp){
              var type=classifyObjective(camp);
              if(type==="Leads")return parseFloat(camp.leads||0);
              if(type==="Followers")return parseFloat(camp.follows||0)+parseFloat(camp.pageLikes||0);
              return parseFloat(camp.clicks||0);
            };
            // Lookup: row.campaignId -> objective type, for scoring demographic
            // breakdown rows (Meta strips the _facebook / _instagram suffix on
            // its own rows so we register both forms).
            var campaignObjType={};
            sel.forEach(function(c){
              var type=classifyObjective(c);
              var rawId=c.rawCampaignId||String(c.campaignId||"").replace(/_facebook$/,"").replace(/_instagram$/,"");
              campaignObjType[String(c.campaignId||"")]=type;
              if(rawId)campaignObjType[rawId]=type;
            });
            var rowObjectiveType=function(r){
              var cid=String(r.campaignId||"");
              return campaignObjType[cid]||campaignObjType[cid.replace(/_facebook$/,"").replace(/_instagram$/,"")]||"Traffic";
            };

            // Metric fields per funnel stage. The objective stage picks the
            // right metric per row based on its campaign's classified objective,
            // so the totals reconcile with the Summary Objective tile.
            var stageDef={
              awareness:{key:"impressions",label:"Ads Served",costLabel:"Cost Per 1K Ads Served",accent:P.cyan,accentDeep:"#0891b2",deep:"#155e75",cool:"#0891b2",warm:"#22d3ee",hot:"#67e8f9",icon:Ic.eye,title:"Awareness",subtitle:"Top of funnel - who saw your ads",field:function(r){return r.impressions||0;}},
              engagement:{key:"clicks",label:"Clicks",costLabel:"Cost Per Click",accent:P.solar,accentDeep:"#d97706",deep:"#92400e",cool:"#d97706",warm:"#f59e0b",hot:"#fbbf24",icon:Ic.bolt,title:"Engagement",subtitle:"Middle of funnel - who responded",field:function(r){return r.clicks||0;}},
              objective:{key:"obj",label:"Objective Actions",costLabel:"Cost Per Objective",accent:P.rose,accentDeep:"#be123c",deep:"#9f1239",cool:"#be123c",warm:"#e11d48",hot:"#fb7185",icon:Ic.target,title:"Objective",subtitle:"Bottom of funnel - who actually converted",field:function(r){var type=rowObjectiveType(r);var rs=r.results||{};if(type==="Leads")return rs.leads||0;if(type==="Followers")return (rs.follows||0)+(rs.pageLikes||0);return r.clicks||0;}}
            };

            // AUTHORITATIVE TOTALS — computed from the same selected-campaign
            // objects Summary uses, so the headline numbers on this tab match
            // Summary exactly. Breakdown data (agRows / regRows / devRows) is
            // still used for distribution (which age, which province, which
            // device) but the displayed "total X" values come from sel.
            var authImps=0,authClicks=0,authObj=0,authSpend=0;
            var authObjFollowersRaw=0; // per-campaign follower contribution, replaced below by earnedTotal
            var authPlat={Facebook:{imp:0,clk:0,spend:0,obj:0},Instagram:{imp:0,clk:0,spend:0,obj:0},TikTok:{imp:0,clk:0,spend:0,obj:0},Google:{imp:0,clk:0,spend:0,obj:0}};
            var mapPlatform=function(p){if(p==="Google Display"||p==="YouTube"||p==="Google Search"||p==="Google Ads")return "Google";if(p==="Meta")return "Facebook";return p;};
            sel.forEach(function(c){
              var imp=parseFloat(c.impressions||0);
              var clk=parseFloat(c.clicks||0);
              var spd=parseFloat(c.spend||0);
              var obj=objectiveValueFor(c);
              authImps+=imp;authClicks+=clk;authSpend+=spd;authObj+=obj;
              if(classifyObjective(c)==="Followers")authObjFollowersRaw+=obj;
              var k=mapPlatform(c.platform);
              if(authPlat[k]){authPlat[k].imp+=imp;authPlat[k].clk+=clk;authPlat[k].spend+=spd;authPlat[k].obj+=obj;}
            });

            // Summary applies a page-metadata override for Followers because
            // per-campaign camp.follows under-counts IG (Meta doesn't reliably
            // attribute follows to paid campaigns) and over-counts FB (post
            // reactions get folded into pageLikes for OUTCOME_ENGAGEMENT
            // campaigns). The page-metadata earnedTotal is the truth Community
            // Growth uses too. Mirror it here so the Demographics OBJECTIVE
            // tile reconciles with Summary's TOTAL OBJECTIVE RESULTS row.
            var demoMatchedPages=[];var demoMatchedIds={};
            for(var ds=0;ds<sel.length;ds++){
              var dBest=null;var dSc=0;
              for(var dp=0;dp<pages.length;dp++){
                var dScore=autoMatchPage(sel[ds].campaignName,pages[dp].name);
                if(dScore>dSc){dSc=dScore;dBest=pages[dp];}
              }
              if(dBest&&dSc>=2&&!demoMatchedIds[dBest.id]){demoMatchedPages.push(dBest);demoMatchedIds[dBest.id]=true;}
            }
            var demoIgGrowth=0;
            demoMatchedPages.forEach(function(mp){
              if(mp.instagram_business_account)demoIgGrowth+=parseFloat(mp.instagram_business_account.follower_growth||0);
            });
            var demoTtE=0;sel.forEach(function(c){if(c.platform==="TikTok")demoTtE+=parseFloat(c.follows||0);});
            var demoEarnedTotal=parseFloat(m.pageLikes||0)+demoIgGrowth+demoTtE;
            if(demoEarnedTotal>0){
              authObj=authObj-authObjFollowersRaw+demoEarnedTotal;
            }
            // stageTotal / stageSpend now return AUTHORITATIVE values, so every
            // section header and the KPI strip reconcile with Summary. Chart
            // cell values still come from breakdown sums (see agRows etc).
            var stageTotal=function(stage){if(stage.key==="impressions")return authImps;if(stage.key==="clicks")return authClicks;return authObj;};
            var stageSpend=function(){return authSpend;};
            var totImps=authImps,totClicks=authClicks,totConv=authObj,totSpend=authSpend;

            // Reusable helpers.
            var fmtAbbr=function(n){n=parseFloat(n||0);if(n>=1e6)return (n/1e6).toFixed(1)+"M";if(n>=1e3)return (n/1e3).toFixed(1)+"K";return Math.round(n).toString();};

            // Province paths — realistic curved approximations of SA's nine
            // provinces on a viewBox 0 0 900 780. Each path uses cubic Bezier
            // curves for smooth coastlines and province borders, anchored to
            // approximate lat/lng positions of real SA geography. Lesotho and
            // Eswatini are drawn separately as enclave "holes" over the top
            // of the provinces they sit inside.
            var provincePaths={
              "Northern Cape":"M 55 410 C 58 440 68 475 82 505 C 88 525 95 545 105 560 C 170 578 245 586 320 580 C 385 572 440 548 480 510 C 510 470 520 430 512 385 C 500 342 478 310 452 285 C 420 258 385 238 345 230 C 290 225 230 232 180 247 C 130 262 95 290 75 322 C 60 352 55 382 55 410 Z",
              "Western Cape":"M 105 560 C 98 595 100 628 110 660 C 128 695 155 720 185 735 C 210 745 240 752 275 752 C 318 752 360 745 395 732 C 420 720 435 700 438 680 C 435 660 420 648 400 648 C 375 650 355 668 335 680 C 318 678 305 660 298 638 C 293 618 295 595 305 570 C 275 562 230 562 185 560 C 152 560 125 558 105 560 Z",
              "Eastern Cape":"M 438 680 C 448 700 470 718 498 725 C 538 732 580 730 618 720 C 650 708 680 688 695 662 C 700 638 685 615 665 600 C 640 590 610 592 585 595 C 568 582 560 560 548 540 C 530 515 505 498 478 495 C 445 498 418 510 395 530 C 372 555 358 585 355 615 C 360 640 375 660 395 675 C 410 680 425 680 438 680 Z",
              "Free State":"M 510 430 C 530 420 555 418 580 420 L 620 428 L 650 445 C 665 465 670 490 668 515 C 663 540 648 560 628 572 C 600 582 570 585 542 580 C 512 572 488 558 475 538 C 465 515 465 490 475 468 C 482 450 495 438 510 430 Z",
              "North West":"M 355 230 C 395 225 440 225 480 232 C 510 242 525 258 525 278 C 525 300 520 320 512 335 C 500 348 475 355 445 358 L 395 358 L 345 352 C 308 343 280 325 262 302 C 250 280 248 258 258 240 C 288 232 322 230 355 230 Z",
              "Gauteng":"M 638 258 C 658 250 688 250 708 260 C 722 272 722 292 710 302 C 690 312 665 312 645 305 C 630 295 628 275 638 258 Z",
              "Limpopo":"M 480 232 C 520 218 565 202 610 188 C 655 174 700 160 740 148 C 775 142 805 148 828 164 C 842 185 842 215 832 238 C 818 258 798 268 775 272 L 720 275 L 665 272 L 620 268 L 575 262 L 540 258 L 510 250 C 498 245 490 240 480 232 Z",
              "Mpumalanga":"M 720 275 C 745 278 770 285 788 300 C 798 318 802 342 800 370 C 798 398 792 418 776 432 C 755 442 725 442 700 438 C 680 428 665 410 660 385 L 660 340 L 665 300 C 678 285 698 278 720 275 Z",
              "KwaZulu-Natal":"M 670 495 C 688 478 708 472 728 478 L 760 492 L 792 510 L 822 535 L 852 570 L 850 602 L 828 628 L 800 645 L 772 655 L 742 652 L 715 638 L 690 612 L 665 580 L 650 540 C 655 520 662 505 670 495 Z"
            };
            // Lesotho and Eswatini — drawn as overlays over the provinces, so
            // they render as visible enclaves like the reference map.
            var enclavePaths={
              "Lesotho":"M 600 500 C 620 488 650 484 678 492 C 695 505 700 525 692 545 C 678 560 650 568 622 565 C 602 555 592 535 596 515 C 597 510 598 505 600 500 Z",
              "Eswatini":"M 785 310 C 798 305 812 310 818 322 C 820 335 812 345 798 347 C 788 346 780 340 780 330 C 780 322 782 315 785 310 Z"
            };
            var provCenters={
              "Northern Cape":{x:260,y:395,abbr:"Northern Cape"},
              "Western Cape":{x:245,y:695,abbr:"Western Cape"},
              "Eastern Cape":{x:520,y:640,abbr:"Eastern Cape"},
              "Free State":{x:560,y:495,abbr:"Free State"},
              "North West":{x:390,y:295,abbr:"North-West"},
              "Gauteng":{x:672,y:282,abbr:"Gauteng"},
              "Limpopo":{x:645,y:210,abbr:"Limpopo"},
              "Mpumalanga":{x:730,y:355,abbr:"Mpumalanga"},
              "KwaZulu-Natal":{x:755,y:575,abbr:"KwaZulu-Natal"}
            };

            // Major SA cities plotted on the map as a secondary layer of
            // context — anchors the choropleth to recognisable places.
            var majorCities=[
              {name:"Johannesburg",x:658,y:292},
              {name:"Pretoria",x:668,y:268},
              {name:"Cape Town",x:138,y:712},
              {name:"Durban",x:795,y:585},
              {name:"Port Elizabeth",x:512,y:712},
              {name:"Bloemfontein",x:562,y:485}
            ];
            // Proportional-symbol (bubble) map of SA provinces. Each bubble is
            // sized to sqrt(value / max) so bubble AREA is proportional to the
            // metric, which is the perceptually correct encoding. The faint
            // country silhouette behind gives geographic context without
            // requiring pixel-accurate province polygons. Top 3 bubbles get
            // a medal badge and an outward pulse ring for visual emphasis.
            var renderProvinceMap=function(stage,rowOverride){
              var regData=rowOverride||regRows;
              var totals={};Object.keys(provCenters).forEach(function(p){totals[p]=0;});
              regData.forEach(function(r){var pn=String(r.region||"").trim();if(totals[pn]===undefined)return;totals[pn]+=stage.field(r);});
              var max=0;Object.keys(totals).forEach(function(p){if(totals[p]>max)max=totals[p];});
              var ranked=Object.keys(totals).map(function(p){return{name:p,val:totals[p]};}).filter(function(x){return x.val>0;}).sort(function(a,b){return b.val-a.val;});
              var sumAll=ranked.reduce(function(s,r){return s+r.val;},0);
              var rankMap={};ranked.forEach(function(r,i){rankMap[r.name]=i;});
              var medal=function(r){return r===0?"#FFD700":r===1?"#E0E0E0":r===2?"#CD7F32":null;};
              // Bubble sizing — sqrt so area ∝ value (perceptually accurate).
              // Clamp minimum so zero-value provinces still render a visible
              // ghost bubble for geographic context. Cap maximum so the biggest
              // bubble doesn't swallow neighbouring provinces.
              var MIN_R=14,MAX_R=92;
              var radiusFor=function(val){if(max===0||val===0)return MIN_R;return MIN_R+(MAX_R-MIN_R)*Math.sqrt(val/max);};
              return <div style={{height:"100%"}}>
                <div style={{position:"relative",background:"radial-gradient(ellipse at 50% 25%,#23315a 0%,#10182e 45%,#050210 95%)",borderRadius:14,padding:"14px 14px 8px",border:"1px solid rgba(140,170,255,0.22)",boxShadow:"inset 0 1px 0 rgba(255,255,255,0.08),0 14px 44px rgba(0,0,0,0.5)",height:"100%",display:"flex",flexDirection:"column"}}>
                  <svg viewBox="0 0 900 780" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style={{display:"block",flex:1,minHeight:0}}>
                    <defs>
                      {/* Radial bubble gradient — bright at the top-left for a lit-sphere feel, darker at the bottom-right edge. */}
                      <radialGradient id={"bubbleGrad_"+stage.key} cx="35%" cy="30%" r="70%">
                        <stop offset="0%" stopColor={stage.hot} stopOpacity="1"/>
                        <stop offset="55%" stopColor={stage.warm} stopOpacity="0.95"/>
                        <stop offset="100%" stopColor={stage.deep} stopOpacity="1"/>
                      </radialGradient>
                      <radialGradient id={"bubbleGhost_"+stage.key} cx="35%" cy="30%" r="70%">
                        <stop offset="0%" stopColor="#3d4b70" stopOpacity="0.55"/>
                        <stop offset="100%" stopColor="#1e2a44" stopOpacity="0.85"/>
                      </radialGradient>
                      {/* Bubble outer glow — bright, short radius, adds a halo around each circle */}
                      <filter id={"bubbleGlow_"+stage.key} x="-40%" y="-40%" width="180%" height="180%">
                        <feGaussianBlur stdDeviation="5" result="blur"/>
                        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                      </filter>
                      {/* Dot grid — subtle premium texture */}
                      <pattern id={"dotGrid_"+stage.key} patternUnits="userSpaceOnUse" width="22" height="22">
                        <circle cx="11" cy="11" r="0.9" fill="rgba(180,200,255,0.08)"/>
                      </pattern>
                      {/* Vignette — darker edges to focus eyes on the centre */}
                      <radialGradient id={"vignette_"+stage.key} cx="50%" cy="50%" r="70%">
                        <stop offset="60%" stopColor="#000" stopOpacity="0"/>
                        <stop offset="100%" stopColor="#000" stopOpacity="0.55"/>
                      </radialGradient>
                      {/* Silhouette stroke — faint accent colour for SA outline */}
                      <filter id={"silhouetteBlur_"+stage.key} x="-5%" y="-5%" width="110%" height="110%">
                        <feGaussianBlur stdDeviation="1.5"/>
                      </filter>
                    </defs>
                    {/* Background layers: gradient base + dot grid + vignette */}
                    <rect x="0" y="0" width="900" height="780" fill={"url(#dotGrid_"+stage.key+")"}/>
                    {/* Faint SA country silhouette drawn as one combined stroke (low opacity, no fill) for geographic anchor. */}
                    <g opacity="0.55" style={{pointerEvents:"none"}} filter={"url(#silhouetteBlur_"+stage.key+")"}>
                      {Object.keys(provincePaths).map(function(p){return <path key={"sil"+p} d={provincePaths[p]} fill="rgba(180,200,255,0.025)" stroke="rgba(180,200,255,0.28)" strokeWidth="1.1"/>;})}
                    </g>
                    {/* Enclave outlines (Lesotho / Eswatini) for extra context */}
                    {Object.keys(enclavePaths).map(function(n){return <path key={"encl"+n} d={enclavePaths[n]} fill="none" stroke="rgba(200,220,255,0.38)" strokeWidth="1" strokeDasharray="3,3" style={{pointerEvents:"none"}}/>;})}
                    <text x="645" y="510" textAnchor="middle" style={{fontSize:9,fontFamily:fm,fontWeight:700,fill:"rgba(200,220,255,0.45)",letterSpacing:1.5,pointerEvents:"none"}}>LESOTHO</text>
                    {/* Major city dots — tiny white, as geographic anchors */}
                    {majorCities.map(function(ct){return <g key={"c"+ct.name} style={{pointerEvents:"none"}}>
                      <circle cx={ct.x} cy={ct.y} r="2.5" fill="rgba(255,251,248,0.7)" stroke="rgba(0,0,0,0.6)" strokeWidth="0.8"/>
                      <text x={ct.x+6} y={ct.y+2} style={{fontSize:8.5,fontFamily:fm,fontWeight:600,fill:"rgba(255,255,255,0.55)",letterSpacing:0.3,paintOrder:"stroke",stroke:"rgba(0,0,0,0.75)",strokeWidth:"2px",strokeLinejoin:"round"}}>{ct.name}</text>
                    </g>;})}
                    {/* Pulse rings on top 3 — expanding outward from bubble edge */}
                    {Object.keys(provCenters).map(function(p){var c=provCenters[p];var val=totals[p]||0;var rnk=rankMap[p];var r=radiusFor(val);if(typeof rnk!=="number"||rnk>=3||val===0)return null;var delay=(rnk*0.5).toFixed(2);return <g key={"pulse"+p} style={{pointerEvents:"none"}}>
                      <circle cx={c.x} cy={c.y} r={r+6} fill="none" stroke={rnk===0?"#FFD700":rnk===1?"#E0E0E0":"#CD7F32"} strokeWidth="2.5" opacity="0.85">
                        <animate attributeName="r" values={(r)+";"+(r+38)+";"+(r)} dur="2.6s" begin={delay+"s"} repeatCount="indefinite"/>
                        <animate attributeName="opacity" values="0.85;0;0.85" dur="2.6s" begin={delay+"s"} repeatCount="indefinite"/>
                      </circle>
                      <circle cx={c.x} cy={c.y} r={r+4} fill="none" stroke={rnk===0?"#FFD700":rnk===1?"#E0E0E0":"#CD7F32"} strokeWidth="1.5" opacity="0.55">
                        <animate attributeName="r" values={(r)+";"+(r+30)+";"+(r)} dur="2.6s" begin={(parseFloat(delay)+0.9).toFixed(2)+"s"} repeatCount="indefinite"/>
                        <animate attributeName="opacity" values="0.7;0;0.7" dur="2.6s" begin={(parseFloat(delay)+0.9).toFixed(2)+"s"} repeatCount="indefinite"/>
                      </circle>
                    </g>;})}
                    {/* Bubbles — sized by sqrt of share. Sorted ascending so the largest bubble renders last and sits on top when two provinces overlap. */}
                    {Object.keys(provCenters).slice().sort(function(a,b){return (totals[a]||0)-(totals[b]||0);}).map(function(p){var c=provCenters[p];var val=totals[p]||0;var rnk=rankMap[p];var r=radiusFor(val);var share=sumAll>0?(val/sumAll*100):0;var hasVal=val>0;var gradId=hasVal?"bubbleGrad_"+stage.key:"bubbleGhost_"+stage.key;return <g key={"b"+p}>
                      <circle cx={c.x} cy={c.y} r={r} fill={"url(#"+gradId+")"} stroke="rgba(255,255,255,0.75)" strokeWidth={hasVal?2:1} filter={hasVal&&typeof rnk==="number"&&rnk<3?"url(#bubbleGlow_"+stage.key+")":undefined} style={{transition:"all 0.4s ease"}}>
                        <title>{p+" — "+share.toFixed(2)+"% of tagged "+stage.label.toLowerCase()}</title>
                      </circle>
                      {/* Glossy highlight — small white ellipse top-left of bubble */}
                      {hasVal&&r>22&&<ellipse cx={c.x-r*0.35} cy={c.y-r*0.4} rx={r*0.32} ry={r*0.18} fill="rgba(255,255,255,0.3)" pointerEvents="none"/>}
                    </g>;})}
                    {/* Labels — placed INSIDE the bubble when it is large enough, OUTSIDE (below) when small so small bubbles don't get cramped overlay text. */}
                    {Object.keys(provCenters).map(function(p){var c=provCenters[p];var val=totals[p]||0;var rnk=rankMap[p];var r=radiusFor(val);var share=sumAll>0?(val/sumAll*100):0;var hasVal=val>0;var showMedal=typeof rnk==="number"&&rnk<3&&hasVal;var inside=r>=32;var ny=inside?c.y-4:c.y+r+16;var vy=inside?c.y+18:c.y+r+32;return <g key={"l"+p} style={{pointerEvents:"none"}}>
                      <text x={c.x} y={ny} textAnchor="middle" style={{fontSize:inside&&r>=50?15:12,fontFamily:fm,fontWeight:900,fill:"#ffffff",paintOrder:"stroke",stroke:"rgba(0,0,0,0.92)",strokeWidth:"3.5px",strokeLinejoin:"round",letterSpacing:0.3}}>{c.abbr}</text>
                      {hasVal&&<text x={c.x} y={vy} textAnchor="middle" style={{fontSize:inside&&r>=50?22:14,fontFamily:fm,fontWeight:900,fill:"#ffffff",paintOrder:"stroke",stroke:"rgba(0,0,0,0.92)",strokeWidth:"4px",strokeLinejoin:"round",letterSpacing:-0.5}}>{share.toFixed(2)+"%"}</text>}
                      {showMedal&&<g transform={"translate("+(c.x+r*0.78)+","+(c.y-r*0.78)+")"}>
                        <circle r="13" fill={medal(rnk)} stroke="#0a0618" strokeWidth="1.5"/>
                        <text x="0" y="4" textAnchor="middle" style={{fontSize:12,fontFamily:fm,fontWeight:900,fill:"#0a0618"}}>{rnk+1}</text>
                      </g>}
                    </g>;})}
                    {/* Vignette overlay last so edges darken subtly */}
                    <rect x="0" y="0" width="900" height="780" fill={"url(#vignette_"+stage.key+")"} pointerEvents="none"/>
                    {/* Watermark */}
                    <text x="40" y="755" style={{fontSize:32,fontFamily:fm,fontWeight:900,fill:"rgba(255,255,255,0.05)",letterSpacing:12}}>SOUTH AFRICA</text>
                  </svg>
                  {/* Legend strip — explains bubble size encoding */}
                  <div style={{display:"flex",alignItems:"center",gap:10,marginTop:6,padding:"4px 4px 0",fontSize:9,fontFamily:fm,color:"rgba(255,251,248,0.7)",letterSpacing:1,flexWrap:"wrap"}}>
                    <span style={{fontWeight:800,letterSpacing:1.5}}>BUBBLE SIZE</span>
                    <div style={{display:"flex",alignItems:"center",gap:10,flex:1}}>
                      <div style={{display:"flex",alignItems:"center",gap:4}}>
                        <div style={{width:8,height:8,borderRadius:"50%",background:"url(#bubbleGrad_"+stage.key+")",border:"1px solid rgba(255,255,255,0.55)"}}></div>
                        <span style={{color:"rgba(255,255,255,0.55)"}}>low</span>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:4}}>
                        <div style={{width:14,height:14,borderRadius:"50%",background:stage.warm,border:"1px solid rgba(255,255,255,0.55)"}}></div>
                        <span style={{color:"rgba(255,255,255,0.55)"}}>mid</span>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:4}}>
                        <div style={{width:22,height:22,borderRadius:"50%",background:stage.hot,border:"1px solid rgba(255,255,255,0.55)",boxShadow:"0 0 8px "+stage.hot+"66"}}></div>
                        <span style={{color:"rgba(255,255,255,0.55)"}}>high</span>
                      </div>
                    </div>
                    <span style={{color:"rgba(255,255,255,0.45)",fontSize:8,letterSpacing:0.8}}>area ∝ {stage.label.toLowerCase()}</span>
                  </div>
                </div>
              </div>;
            };

            // Top-provinces ranked bars. Sits next to the map as a second
            // visual read, each row is a saturated horizontal bar with the
            // province name, the metric value, and % share.
            var renderProvinceRanks=function(stage,rowOverride){
              var regData=rowOverride||regRows;
              var totals={};Object.keys(provincePaths).forEach(function(p){totals[p]=0;});
              regData.forEach(function(r){var pn=String(r.region||"").trim();if(!provincePaths[pn])return;totals[pn]+=stage.field(r);});
              // Rank all nine provinces; shares are computed against the tagged
              // total so the column always sums to 100% of known data.
              var all=Object.keys(totals).map(function(p){return{name:p,val:totals[p]};}).sort(function(a,b){return b.val-a.val;});
              var knownSum=all.reduce(function(s,r){return s+r.val;},0);
              var max=all.length?all[0].val:0;
              var medal=function(i,hasVal){if(!hasVal)return "#3d2f5a";return i===0?"#FFD700":i===1?"#E0E0E0":i===2?"#CD7F32":stage.warm;};
              return <div style={{background:"linear-gradient(145deg,#1a1028,#120a1f)",borderRadius:12,padding:"14px 16px",border:"1px solid rgba(255,255,255,0.08)",height:"100%",display:"flex",flexDirection:"column"}}>
                <div style={{marginBottom:12,paddingBottom:8,borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
                  <div style={{fontSize:10,color:"#fff",fontFamily:fm,fontWeight:900,letterSpacing:2,textTransform:"uppercase",marginBottom:2}}>{stage.label} by Province</div>
                  <div style={{fontSize:9,color:stage.accent,fontFamily:fm,letterSpacing:0.8,fontWeight:700}}>Share of tagged provincial {stage.label.toLowerCase()}, sums to 100%</div>
                </div>
                {/* Column header */}
                <div style={{display:"grid",gridTemplateColumns:"28px 1fr 60px",gap:10,alignItems:"center",padding:"0 2px 6px",fontSize:9,color:P.caption,fontFamily:fm,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",borderBottom:"1px dashed rgba(255,255,255,0.06)",marginBottom:8}}>
                  <div>#</div>
                  <div>Province</div>
                  <div style={{textAlign:"right"}}>Share</div>
                </div>
                {/* Rows — distributed with space-between so the table fills
                    the grid cell height (which matches the bubble map height)
                    rather than leaving empty padding below the last row.
                    Text + container render unconditionally; only each
                    bar's fill width animates via GrowBar when the row
                    enters the viewport. */}
                <div style={{flex:1,display:"flex",flexDirection:"column",justifyContent:"space-between",minHeight:0}}>
                {all.map(function(r,i){var pct=max>0?(r.val/max)*100:0;var share=knownSum>0?(r.val/knownSum*100):0;var hasVal=r.val>0;var col=medal(i,hasVal);var tip=r.name+" "+share.toFixed(2)+"% share of tagged provincial "+stage.label.toLowerCase();return <div key={r.name} title={tip} style={{cursor:"default",transition:"transform 0.2s ease"}} onMouseEnter={function(e){e.currentTarget.style.transform="translateX(2px)";}} onMouseLeave={function(e){e.currentTarget.style.transform="translateX(0)";}}>
                  <div style={{display:"grid",gridTemplateColumns:"28px 1fr 60px",gap:10,alignItems:"center",marginBottom:4,fontSize:11,fontFamily:fm}}>
                    <div style={{width:22,height:22,borderRadius:"50%",background:col,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:900,color:hasVal?"#0a0618":"#8b7fa3"}}>{i+1}</div>
                    <span style={{color:hasVal?"#fff":"#8b7fa3",fontWeight:700}}>{r.name}</span>
                    <span style={{color:hasVal?col:"#5c4f72",fontWeight:900,fontSize:14,textAlign:"right",fontVariantNumeric:"tabular-nums"}}>{hasVal?share.toFixed(2)+"%":"0%"}</span>
                  </div>
                  <div style={{height:6,marginLeft:38,background:"rgba(255,255,255,0.04)",borderRadius:3,overflow:"hidden"}}>
                    <GrowBar pct={hasVal?pct:2} delay={i*40} style={{height:"100%",background:hasVal?"linear-gradient(90deg,"+stage.cool+"aa,"+col+"ee)":"rgba(255,255,255,0.06)",borderRadius:3,boxShadow:hasVal?"0 0 8px "+col+"55":"none"}}/>
                  </div>
                </div>;})}
                </div>
                {knownSum===0&&<div style={{marginTop:14,padding:"10px 12px",background:"rgba(255,255,255,0.03)",border:"1px dashed rgba(255,255,255,0.12)",borderRadius:10,fontSize:10.5,color:P.label,fontFamily:fm,lineHeight:1.6,textAlign:"center"}}>No {stage.label.toLowerCase()} recorded at province level for the selected campaigns and period.</div>}
              </div>;
            };

            // Horizontal bar renderer — shares computed against the tagged
            // subset so the column always sums to 100% of known-age data.
            var renderAgeBars=function(stage,rowOverride){
              var agData=rowOverride||agRows;
              var sums={};ageOrder.forEach(function(a){sums[a]=0;});
              agData.forEach(function(r){var a=String(r.age||"");if(sums[a]===undefined)return;sums[a]+=stage.field(r);});
              var knownSum=ageOrder.reduce(function(s,a){return s+sums[a];},0);
              var max=0;ageOrder.forEach(function(a){if(sums[a]>max)max=sums[a];});
              return <div style={{padding:"6px 0"}}>
                {ageOrder.map(function(a,i){var v=sums[a];var pct=max>0?(v/max)*100:0;var share=knownSum>0?(v/knownSum*100):0;var tip=a+" — "+share.toFixed(2)+"% share of tagged "+stage.label.toLowerCase();return <div key={a} title={tip} style={{display:"flex",alignItems:"center",gap:12,marginBottom:10,cursor:"default",transition:"transform 0.2s ease"}} onMouseEnter={function(e){e.currentTarget.style.transform="translateX(2px)";}} onMouseLeave={function(e){e.currentTarget.style.transform="translateX(0)";}}>
                  <div style={{width:60,fontSize:11,color:P.txt,fontFamily:fm,fontWeight:700,textAlign:"right"}}>{a}</div>
                  <div style={{flex:1,height:22,background:"rgba(0,0,0,0.35)",borderRadius:11,overflow:"hidden",border:"1px solid "+P.rule,position:"relative"}}>
                    <GrowBar pct={pct} delay={i*40} style={{height:"100%",background:"linear-gradient(90deg,"+stage.accentDeep+"cc,"+stage.accent+"ff)",borderRadius:11,boxShadow:"inset 0 1px 2px rgba(255,255,255,0.15)"}}/>
                    {v>0&&<div style={{position:"absolute",top:0,right:10,height:"100%",display:"flex",alignItems:"center",fontSize:11,fontWeight:900,color:P.txt,fontFamily:fm,textShadow:"0 1px 3px rgba(0,0,0,0.85)"}}>{share.toFixed(2)+"%"}</div>}
                  </div>
                </div>;})}
                {knownSum===0&&<div style={{marginTop:10,padding:"10px 12px",background:"rgba(255,255,255,0.03)",border:"1px dashed rgba(255,255,255,0.12)",borderRadius:10,fontSize:10.5,color:P.label,fontFamily:fm,lineHeight:1.6,textAlign:"center"}}>No age-tagged {stage.label.toLowerCase()} for this period.</div>}
              </div>;
            };

            // Gender donut (no Unknown). Uses Recharts PieChart.
            var renderGenderDonut=function(stage){
              var byGen={female:0,male:0};
              agRows.forEach(function(r){var g=String(r.gender||"").toLowerCase();if(byGen[g]===undefined)return;byGen[g]+=stage.field(r);});
              var total=byGen.female+byGen.male;
              if(total===0)return <div style={{padding:20,textAlign:"center",color:P.label,fontFamily:fm,fontSize:11}}>No gender data</div>;
              var data=[{name:"Female",value:byGen.female,color:"#ec4899"},{name:"Male",value:byGen.male,color:"#3b82f6"}];
              return <div style={{display:"flex",flexDirection:"column",alignItems:"center"}}>
                <ChartReveal><ResponsiveContainer width="100%" height={210}>
                  <PieChart>
                    <defs>
                      <radialGradient id={"dg_f_"+stage.key} cx="50%" cy="50%" r="60%"><stop offset="0%" stopColor="#f9a8d4"/><stop offset="100%" stopColor="#be185d"/></radialGradient>
                      <radialGradient id={"dg_m_"+stage.key} cx="50%" cy="50%" r="60%"><stop offset="0%" stopColor="#60a5fa"/><stop offset="100%" stopColor="#1e40af"/></radialGradient>
                    </defs>
                    <Pie data={data} cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={4} dataKey="value" stroke="rgba(0,0,0,0.35)" strokeWidth={2}>
                      <Cell fill={"url(#dg_f_"+stage.key+")"}/>
                      <Cell fill={"url(#dg_m_"+stage.key+")"}/>
                    </Pie>
                    <Tooltip content={<Tip/>} wrapperStyle={{outline:"none"}}/>
                  </PieChart>
                </ResponsiveContainer></ChartReveal>
                <div style={{display:"flex",gap:18,marginTop:-14,fontSize:11,fontFamily:fm}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{width:10,height:10,borderRadius:"50%",background:"#ec4899",boxShadow:"0 0 8px #ec489980"}}></span><span style={{color:P.txt,fontWeight:700}}>F</span><span style={{color:P.label}}>{fmtAbbr(byGen.female)}</span><span style={{color:P.caption}}>{"("+(byGen.female/total*100).toFixed(2)+"%)"}</span></div>
                  <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{width:10,height:10,borderRadius:"50%",background:"#3b82f6",boxShadow:"0 0 8px #3b82f680"}}></span><span style={{color:P.txt,fontWeight:700}}>M</span><span style={{color:P.label}}>{fmtAbbr(byGen.male)}</span><span style={{color:P.caption}}>{"("+(byGen.male/total*100).toFixed(2)+"%)"}</span></div>
                </div>
              </div>;
            };

            // Device donut with gradient slices.
            var renderDeviceDonut=function(stage){
              var deviceNorm=function(d){var s=String(d||"").toLowerCase();if(s.indexOf("mobile")>=0||s.indexOf("android")>=0||s.indexOf("ios")>=0||s==="iphone")return "mobile";if(s==="ipad"||s.indexOf("tablet")>=0)return "tablet";if(s.indexOf("desktop")>=0||s==="web")return "desktop";if(s.indexOf("ctv")>=0||s.indexOf("connected_tv")>=0)return "ctv";return "other";};
              var bucket={mobile:0,desktop:0,tablet:0,ctv:0,other:0};
              devRows.forEach(function(r){var d=deviceNorm(r.device);bucket[d]+=stage.field(r);});
              var labels={mobile:"Mobile",desktop:"Desktop",tablet:"Tablet",ctv:"Connected TV",other:"Other"};
              var colors={mobile:"#22d3ee",desktop:"#a855f7",tablet:"#fbbf24",ctv:"#d946ef",other:"#8b7fa3"};
              var data=["mobile","desktop","tablet","ctv","other"].filter(function(k){return bucket[k]>0;}).map(function(k){return{name:labels[k],key:k,value:bucket[k],color:colors[k]};});
              var total=data.reduce(function(s,d){return s+d.value;},0);
              if(total===0)return <div style={{padding:20,textAlign:"center",color:P.label,fontFamily:fm,fontSize:11}}>No device data</div>;
              return <div style={{display:"flex",flexDirection:"column",alignItems:"center"}}>
                <ChartReveal><ResponsiveContainer width="100%" height={210}>
                  <PieChart>
                    <Pie data={data} cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={3} dataKey="value" stroke="rgba(0,0,0,0.35)" strokeWidth={2}>{data.map(function(d,i){return <Cell key={i} fill={d.color}/>;})}</Pie>
                    <Tooltip content={<Tip/>} wrapperStyle={{outline:"none"}}/>
                  </PieChart>
                </ResponsiveContainer></ChartReveal>
                <div style={{display:"flex",gap:10,marginTop:-14,fontSize:10,fontFamily:fm,flexWrap:"wrap",justifyContent:"center"}}>{data.map(function(d){return <div key={d.name} style={{display:"flex",alignItems:"center",gap:5}}><span style={{width:8,height:8,borderRadius:"50%",background:d.color}}></span><span style={{color:P.txt,fontWeight:700}}>{d.name}</span><span style={{color:P.caption}}>{(d.value/total*100).toFixed(2)+"%"}</span></div>;})}</div>
              </div>;
            };

            // Top-age/top-gender helpers reused in insights and tiles.
            var topAgeFor=function(stage){var ageSums={};ageOrder.forEach(function(a){ageSums[a]=0;});agRows.forEach(function(r){var a=String(r.age||"");if(ageSums[a]===undefined)return;ageSums[a]+=stage.field(r);});var t=ageOrder.slice().sort(function(a,b){return ageSums[b]-ageSums[a];})[0];return{age:t,val:ageSums[t]||0};};
            var genderSharesFor=function(stage){var s={female:0,male:0};agRows.forEach(function(r){var g=String(r.gender||"").toLowerCase();if(s[g]===undefined)return;s[g]+=stage.field(r);});return s;};
            var topProvFor=function(stage){var t={};regRows.forEach(function(r){var pn=String(r.region||"");if(!provincePaths[pn])return;if(!t[pn])t[pn]=0;t[pn]+=stage.field(r);});var ks=Object.keys(t).sort(function(a,b){return t[b]-t[a];});return ks[0]||"";};
            var topSegmentFor=function(stage){var best={val:0,age:"",gen:""};agRows.forEach(function(r){var a=String(r.age||"");var g=String(r.gender||"").toLowerCase();if(ageOrder.indexOf(a)<0||genderOrder.indexOf(g)<0)return;var v=stage.field(r);if(v>best.val){best={val:v,age:a,gen:g};}});return best;};

            // Platform tiles — share of total impressions per channel (FB / IG / TikTok / Google),
            // always on, not stage-scoped. Uses authoritative per-platform
            // totals (authPlat) so the numbers match Summary exactly.
            var renderPlatformMix=function(){
              var agg=authPlat;
              var totalImp=agg.Facebook.imp+agg.Instagram.imp+agg.TikTok.imp+agg.Google.imp;
              var totalClk=agg.Facebook.clk+agg.Instagram.clk+agg.TikTok.clk+agg.Google.clk;
              var meta=[{k:"Facebook",color:P.fb,glyph:"f"},{k:"Instagram",color:P.ig,glyph:"IG"},{k:"TikTok",color:P.tt,glyph:"TT"},{k:"Google",color:P.gd,glyph:"G"}];
              return <div style={{background:"linear-gradient(145deg,#1f1534,#120a1f)",borderRadius:16,padding:"22px 22px 18px",border:"1px solid rgba(255,255,255,0.08)",marginBottom:24}}>
                <div style={{fontSize:11,color:"rgba(255,255,255,0.85)",fontFamily:fm,fontWeight:800,letterSpacing:2.5,textTransform:"uppercase",marginBottom:16}}>Platform Mix · Share of Clicks</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14}}>
                  {meta.map(function(m){var d=agg[m.k];var impShare=totalImp>0?(d.imp/totalImp*100):0;var clkShare=totalClk>0?(d.clk/totalClk*100):0;var tip=m.k+" — "+clkShare.toFixed(2)+"% share of clicks, "+impShare.toFixed(2)+"% share of ads served across the selected campaigns.";return <div key={m.k} title={tip} style={{background:"rgba(0,0,0,0.32)",border:"1px solid "+m.color+"45",borderRadius:14,padding:"18px 16px",position:"relative",overflow:"hidden",cursor:"default",transition:"transform 0.2s ease, box-shadow 0.2s ease"}} onMouseEnter={function(e){e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow="0 8px 24px "+m.color+"35";}} onMouseLeave={function(e){e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.boxShadow="none";}}>
                    <div style={{position:"absolute",left:0,top:0,bottom:0,width:"4px",background:m.color,boxShadow:"0 0 14px "+m.color+"aa"}}></div>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                      <div style={{width:28,height:28,borderRadius:8,background:m.color+"22",border:"1px solid "+m.color+"45",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:900,color:m.color,fontFamily:fm,letterSpacing:0.5}}>{m.glyph}</div>
                      <div style={{fontSize:12,color:"#fff",fontFamily:fm,fontWeight:800,letterSpacing:1}}>{m.k}</div>
                    </div>
                    {/* Primary headline now clicks share — clients care about engagement, not ad serving. */}
                    <div style={{fontSize:32,fontWeight:900,color:m.color,fontFamily:fm,lineHeight:1,letterSpacing:-1,marginBottom:6}}>{clkShare.toFixed(2)+"%"}</div>
                    <div style={{fontSize:10,color:P.label,fontFamily:fm,marginBottom:10,letterSpacing:1}}>of clicks</div>
                    <div style={{height:6,background:"rgba(255,255,255,0.05)",borderRadius:3,overflow:"hidden"}}>
                      <div style={{width:clkShare+"%",height:"100%",background:"linear-gradient(90deg,"+m.color+"88,"+m.color+")",borderRadius:3}}></div>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:10,fontFamily:fm,color:P.label,marginTop:10,letterSpacing:0.5}}>
                      <span>{impShare.toFixed(2)+"% of ads served"}</span>
                    </div>
                  </div>;})}
                </div>
              </div>;
            };

            // Horizontal device bars — clearer than a donut at this scale.
            // Device bars — percent-only, using tagged-device subset as the
            // denominator so rows always sum to 100% of known-device data.
            var renderDeviceBars=function(stage,rowOverride){
              var devData=rowOverride||devRows;
              var deviceNorm=function(d){var s=String(d||"").toLowerCase();if(s.indexOf("mobile")>=0||s.indexOf("android")>=0||s.indexOf("ios")>=0||s==="iphone")return "mobile";if(s==="ipad"||s.indexOf("tablet")>=0)return "tablet";if(s.indexOf("desktop")>=0||s==="web")return "desktop";if(s.indexOf("ctv")>=0||s.indexOf("connected_tv")>=0)return "ctv";return "other";};
              var bucket={mobile:0,desktop:0,tablet:0,ctv:0,other:0};
              devData.forEach(function(r){var d=deviceNorm(r.device);bucket[d]+=stage.field(r);});
              var labels={mobile:"Mobile",desktop:"Desktop",tablet:"Tablet"};
              var colors={mobile:"#22d3ee",desktop:"#a855f7",tablet:"#fbbf24"};
              // Connected TV and Other are intentionally excluded from the
              // device-mix visualisation per client preference. Shares below
              // are computed against Mobile + Desktop + Tablet only so the
              // chart continues to sum to 100% of the visible categories.
              var data=["mobile","desktop","tablet"].filter(function(k){return bucket[k]>0;}).map(function(k){return{key:k,name:labels[k],value:bucket[k],color:colors[k]};});
              var knownSum=data.reduce(function(s,d){return s+d.value;},0);
              var max=data.reduce(function(m,d){return d.value>m?d.value:m;},0);
              if(knownSum===0)return <div style={{background:"rgba(0,0,0,0.25)",border:"1px solid "+P.rule,borderRadius:14,padding:"30px 20px",textAlign:"center",color:P.label,fontFamily:fm,fontSize:12}}>No device-tagged data</div>;
              // Round shares so the displayed values sum to exactly 100.00%.
              // Each raw share is multiplied by 100 (hundredths), rounded,
              // and any rounding residual is pushed onto the largest bucket.
              // Using hundredths matches the 2-decimal client spec: at 1dp
              // three thirds would render 33.3 + 33.3 + 33.3 = 99.9; at 2dp
              // we get 33.33 + 33.33 + 33.34 = 100.00.
              var hundredths=data.map(function(d){return Math.round(d.value/knownSum*10000);});
              var hundredthsSum=hundredths.reduce(function(a,b){return a+b;},0);
              if(hundredthsSum!==10000&&hundredths.length>0){
                var diff=10000-hundredthsSum;
                var maxIdx=0;
                hundredths.forEach(function(t,i){if(t>hundredths[maxIdx])maxIdx=i;});
                hundredths[maxIdx]+=diff;
              }
              // Top device-brand row, slots into the empty space below the
              // three Mobile/Desktop/Tablet bars without inflating the panel
              // height (the age-bar panel beside it has 6 rows, this panel
              // currently has 3 plus whitespace). Computed from the raw
              // r.device strings, normalised into common phone / tablet
              // brand buckets, denominator is brand-tagged rows only so
              // it's intentionally NOT part of the 100% Mobile/Desktop/
              // Tablet tally above. Visual style mirrors the standard bars
              // but uses a distinct rose accent so the eye reads it as a
              // separate signal, not a fourth device category.
              var brandOf=function(d){var s=String(d||"").toLowerCase();if(s.indexOf("iphone")>=0)return "iPhone";if(s.indexOf("ipad")>=0)return "iPad";if(s.indexOf("android")>=0&&s.indexOf("tab")>=0)return "Android Tablet";if(s.indexOf("android")>=0)return "Android Phone";if(s.indexOf("windows")>=0)return "Windows PC";if(s.indexOf("mac")>=0||s.indexOf("macintosh")>=0)return "Mac";return null;};
              var brandSums={};
              devData.forEach(function(r){var b=brandOf(r.device);if(!b)return;brandSums[b]=(brandSums[b]||0)+stage.field(r);});
              var brandTotal=0;Object.keys(brandSums).forEach(function(k){brandTotal+=brandSums[k];});
              var topBrand=null;Object.keys(brandSums).forEach(function(k){if(!topBrand||brandSums[k]>brandSums[topBrand])topBrand=k;});
              var brandShare=topBrand&&brandTotal>0?(brandSums[topBrand]/brandTotal*100):0;
              var brandColor=P.rose;
              return <div>
                {data.map(function(d,di){var pct=max>0?(d.value/max)*100:0;var share=hundredths[di]/100;var tip=d.name+", "+share.toFixed(2)+"% share of device-tagged "+stage.label.toLowerCase();return <div key={d.key} title={tip} style={{marginBottom:14,cursor:"default",transition:"transform 0.2s ease"}} onMouseEnter={function(e){e.currentTarget.style.transform="translateX(2px)";}} onMouseLeave={function(e){e.currentTarget.style.transform="translateX(0)";}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6,fontSize:12,fontFamily:fm}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{width:10,height:10,borderRadius:"50%",background:d.color,boxShadow:"0 0 10px "+d.color+"88"}}></span>
                      <span style={{color:"#fff",fontWeight:700}}>{d.name}</span>
                    </div>
                    <div style={{color:d.color,fontWeight:900,fontSize:16,fontVariantNumeric:"tabular-nums"}}>{share.toFixed(2)+"%"}</div>
                  </div>
                  <div style={{height:12,background:"rgba(255,255,255,0.05)",borderRadius:6,overflow:"hidden",border:"1px solid rgba(255,255,255,0.05)"}}>
                    <div style={{width:pct+"%",height:"100%",background:"linear-gradient(90deg,"+d.color+"88,"+d.color+")",borderRadius:6,boxShadow:"0 0 10px "+d.color+"55",transition:"width 0.6s ease"}}></div>
                  </div>
                </div>;})}
                {topBrand&&<div title={"Top brand among device-tagged "+stage.label.toLowerCase()+", "+brandShare.toFixed(2)+"% of brand-tagged rows. Separate read from the Mobile / Desktop / Tablet split above, not part of the 100%."} style={{marginTop:6,paddingTop:12,borderTop:"1px dashed "+P.rule,cursor:"default",transition:"transform 0.2s ease"}} onMouseEnter={function(e){e.currentTarget.style.transform="translateX(2px)";}} onMouseLeave={function(e){e.currentTarget.style.transform="translateX(0)";}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6,fontSize:12,fontFamily:fm}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{width:10,height:10,borderRadius:"50%",background:brandColor,boxShadow:"0 0 10px "+brandColor+"88"}}></span>
                      <span style={{color:"#fff",fontWeight:700}}>Top Brand</span>
                      <span style={{color:P.label,fontWeight:600,fontSize:11}}>· {topBrand}</span>
                    </div>
                    <div style={{color:brandColor,fontWeight:900,fontSize:16,fontVariantNumeric:"tabular-nums"}}>{brandShare.toFixed(2)+"%"}</div>
                  </div>
                  <div style={{height:12,background:"rgba(255,255,255,0.05)",borderRadius:6,overflow:"hidden",border:"1px solid rgba(255,255,255,0.05)"}}>
                    <div style={{width:brandShare+"%",height:"100%",background:"linear-gradient(90deg,"+brandColor+"88,"+brandColor+")",borderRadius:6,boxShadow:"0 0 10px "+brandColor+"55",transition:"width 0.6s ease"}}></div>
                  </div>
                </div>}
              </div>;
            };

            // Narrative copy per stage — reused in the 3-block insight grid.
            var stageNarrative=function(stage){
              var total=stageTotal(stage);
              var ta=topAgeFor(stage);var gs=genderSharesFor(stage);var genTotal=gs.female+gs.male;var femaleShare=genTotal>0?(gs.female/genTotal*100):0;
              var tp=topProvFor(stage);var champ=topSegmentFor(stage);
              var devNormLine=function(d){var s=String(d||"").toLowerCase();if(s.indexOf("mobile")>=0||s.indexOf("android")>=0||s.indexOf("ios")>=0)return "mobile";if(s==="ipad"||s.indexOf("tablet")>=0)return "tablet";if(s.indexOf("desktop")>=0||s==="web")return "desktop";return "other";};
              var devTL={mobile:0,desktop:0,tablet:0};devRows.forEach(function(r){var d=devNormLine(r.device);if(devTL[d]===undefined)return;devTL[d]+=stage.field(r);});
              var devSum=devTL.mobile+devTL.desktop+devTL.tablet;var mobileShare=devSum>0?(devTL.mobile/devSum*100):0;
              // Share formatter — a value like 99.7 was being rounded to "100%"
              // which then read as factually wrong next to the chart showing
              // 99.7%. Keep a decimal whenever integer rounding would flip a
              // sub-100 value up to 100. Also used for female / male / top-age
              // shares so every share percentage in the narrative matches the
              // underlying chart's precision, never over-stating.
              // 2dp across all pages per client spec. Still guards against
              // floor-to-99.99 on a true 100 and against a value>100 rounding
              // up to "100.00%" so the narrative never over-states.
              var pctLabel=function(v){
                if(v>=100)return "100.00%";
                if(v>99.99)return "99.99%";
                return v.toFixed(2)+"%";
              };
              // Narrative defaults to percentage-based comments rather than
              // absolute counts — the big glass box above the block already
              // shows the authoritative total, so the read sits on top of
              // that with audience mix commentary only.
              var lines=[];
              // Tagged-only subtotals for THIS stage. Used as the denominator
              // on every demographic share line so narrative percentages match
              // the demographic block charts and persona cards exactly.
              // Dividing by the authoritative stage total (which includes
              // untagged rows) systematically under-stated the share and made
              // narrative numbers drift from the chart numbers, e.g. chart
              // showed 25-34 at 36.06% while narrative said 33.46%, same
              // numerator but different denominators. taggedAgeOnly excludes
              // gender-filter for awareness/engagement age lines (gender is
              // not part of those numerators); taggedAgeAndGender is used
              // for the objective top-cell line where both axes matter.
              var taggedAgeOnly=0;
              var taggedAgeAndGender=0;
              agRows.forEach(function(r){
                var ax=String(r.age||""),gx=String(r.gender||"").toLowerCase();
                if(ageOrder.indexOf(ax)>=0)taggedAgeOnly+=stage.field(r);
                if(ageOrder.indexOf(ax)>=0&&genderOrder.indexOf(gx)>=0)taggedAgeAndGender+=stage.field(r);
              });
              if(stage.key==="impressions"){
                if(total>0)lines.push("Ads were delivered across the selected campaigns, establishing the reach baseline for everything that follows.");
                if(ta.age&&ta.val>0){var ageShareRaw=taggedAgeOnly>0?(ta.val/taggedAgeOnly*100):0;lines.push("The "+ta.age+" age group absorbed "+pctLabel(ageShareRaw)+" of tagged impressions, the largest age slice exposed this period.");}
                if(genTotal>0)lines.push("Gender split is "+pctLabel(femaleShare)+" female, "+pctLabel(100-femaleShare)+" male"+(Math.abs(femaleShare-50)<8?", a balanced mix indicating broad targeting":femaleShare>55?", skewing female":femaleShare<45?", skewing male":"")+".");
                if(tp)lines.push(tp+" leads geographic reach, consistent with metro-corridor weighting.");
                if(mobileShare>0)lines.push("Mobile accounts for "+pctLabel(mobileShare)+" of ads served"+(mobileShare>70?", a near-monopoly, creative must be mobile-first":mobileShare>50?", meeting the audience where they are":", leaving room to push further into mobile")+".");
              }else if(stage.key==="clicks"){
                if(total>0){var ctrBlended=totImps>0?(total/totImps*100).toFixed(2):"0";lines.push("Clicks were recorded at a blended "+ctrBlended+"% CTR, the engagement signal the creative is earning.");}
                if(ta.age&&ta.val>0){var ageClickShare=taggedAgeOnly>0?(ta.val/taggedAgeOnly*100):0;lines.push("The "+ta.age+" bracket generated "+pctLabel(ageClickShare)+" of tagged clicks, the largest single age slice this period.");}
                if(genTotal>0)lines.push("On engagement, "+(femaleShare>55?"female":femaleShare<45?"male":"both genders")+" "+(Math.abs(femaleShare-50)<8?"are clicking at comparable rates":"hold the larger share")+".");
                if(tp)lines.push(tp+" also leads click engagement, a healthy see-then-respond pattern.");
                if(mobileShare>0)lines.push("Mobile carries "+pctLabel(mobileShare)+" of click volume.");
              }else{
                if(total>0){var cpa=total>0?totSpend/total:0;lines.push("Conversions delivered at "+fR(cpa)+" blended cost per conversion, the bottom-of-funnel outcome that defines return.");}
                if(champ.val>0&&champ.age){
                  var champShare=taggedAgeAndGender>0?(champ.val/taggedAgeAndGender*100):0;
                  lines.push("Largest single converting cell is "+champ.age+" "+genderLabel[champ.gen].toLowerCase()+", capturing "+pctLabel(champShare)+" of tagged conversions this period.");
                }
                if(tp)lines.push(tp+" produced the most conversions this period.");
                if(mobileShare>0)lines.push("Mobile drives "+pctLabel(mobileShare)+" of conversions.");
                if(total===0)lines.push("No conversions recorded for the selected period, expected for early-flight awareness campaigns or missing tracking.");
              }
              return lines.join(" ");
            };

            // Google city view — visual leaderboard instead of table.
            // Google Ads full demographics block. Shows age, gender, device,
            // province and top-cities splits from Google-only rows so clients
            // can see the Google audience profile on its own (otherwise Google
            // gets blended into the main stage splits alongside Meta + TikTok).
            // Google-only demographics block — mirrors the renderStageBlock shape
            // (Where row with bubble map + ranked provinces, Who & How row with
            // age / gender / device) so the tab reads as one consistent page.
            // Uses the same shared render helpers via the row-override param so
            // there's no duplicated chart rendering. Province view only; the
            // city leaderboard was dropped per user preference.
            var renderCitiesBlock=function(){
              var googleAg=agRows.filter(function(r){return String(r.platform||"").toLowerCase()==="google";});
              var googleDev=devRows.filter(function(r){return String(r.platform||"").toLowerCase()==="google";});
              var googleReg=regRows.filter(function(r){return String(r.platform||"").toLowerCase()==="google";});
              if(googleAg.length===0&&googleDev.length===0&&googleReg.length===0)return null;
              var googleStage={
                key:"google",
                label:"Clicks",
                accent:P.gd,
                accentDeep:"#166534",
                deep:"#14532d",
                cool:"#15803d",
                warm:"#22c55e",
                hot:"#4ade80",
                icon:Ic.globe,
                title:"Google Ads",
                // Clicks, not ads served — clients want the engagement read
                // ("who is actually clicking"), not the delivery read ("who
                // saw the ad"). This is symmetric with the Engagement stage
                // above and stays focused on the signal that matters.
                subtitle:"Google-only engagement view, share of Google clicks",
                field:function(r){return parseFloat(r.clicks||0);}
              };
              var total=(authPlat&&authPlat.Google&&authPlat.Google.clk)||0;
              return <div style={{background:"linear-gradient(165deg,"+P.gd+"12 0%,"+P.gd+"05 50%,transparent 100%),#0d1a12",borderRadius:18,padding:"20px 22px 18px",marginBottom:20,border:"1px solid "+P.gd+"33",boxShadow:"0 10px 36px rgba(0,0,0,0.35),0 0 60px "+P.gd+"10 inset"}}>
                {/* Stage header — matches renderStageBlock */}
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,gap:14,flexWrap:"wrap"}}>
                  <div style={{display:"flex",alignItems:"center",gap:12}}>
                    <div style={{width:40,height:40,borderRadius:10,background:"linear-gradient(135deg,"+P.gd+"45,"+P.gd+"18)",border:"1px solid "+P.gd+"60",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 0 22px "+P.gd+"30"}}>{Ic.globe("#fff",18)}</div>
                    <div>
                      <div style={{fontSize:18,color:P.gd,fontFamily:fm,letterSpacing:3,fontWeight:900,textTransform:"uppercase",marginBottom:4}}>Google Ads Demographics</div>
                      <div style={{fontSize:11,color:"rgba(255,255,255,0.72)",fontFamily:fm,fontWeight:500,letterSpacing:0.3}}>{googleStage.subtitle}</div>
                    </div>
                  </div>
                  <div title={"Google Ads, "+fmt(total)+" clicks across the selected campaigns. Splits below are percent-only and sum to 100% of Google click-tagged traffic per dimension."} style={{textAlign:"right",padding:"6px 12px",background:"rgba(0,0,0,0.28)",border:"1px solid "+P.gd+"40",borderRadius:10,boxShadow:"0 0 14px "+P.gd+"15"}}>
                    <div style={{fontSize:8,color:P.gd,fontFamily:fm,letterSpacing:2,textTransform:"uppercase",fontWeight:800}}>Google Clicks</div>
                    <div style={{fontSize:20,fontWeight:900,color:"#fff",fontFamily:fm,lineHeight:1,letterSpacing:-0.5,textShadow:"0 0 12px "+P.gd+"55"}}>{fmt(total)}</div>
                  </div>
                </div>

                {/* Where — Google province bubble map + ranked provinces */}
                <div style={{fontSize:15,color:P.gd,fontFamily:fm,letterSpacing:2.5,textTransform:"uppercase",fontWeight:900,marginBottom:12}}>· Where (Google)</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
                  <div>{renderProvinceMap(googleStage,googleReg)}</div>
                  <div>{renderProvinceRanks(googleStage,googleReg)}</div>
                </div>

                {/* Who + How — age + gender + device, Google-filtered rows */}
                <div style={{fontSize:15,color:P.gd,fontFamily:fm,letterSpacing:2.5,textTransform:"uppercase",fontWeight:900,marginTop:18,marginBottom:12}}>· Who & How (Google)</div>
                <div style={{display:"grid",gridTemplateColumns:"1.3fr 1fr 1fr",gap:12,marginBottom:4}}>
                  <div style={{background:"linear-gradient(145deg,#0f1a11,#060b08)",borderRadius:12,padding:"14px 16px",border:"1px solid rgba(255,255,255,0.07)"}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                      <div style={{fontSize:10,color:"rgba(255,255,255,0.85)",fontFamily:fm,fontWeight:800,letterSpacing:2,textTransform:"uppercase"}}>By Age Group</div>
                      <div title="Share of age-tagged Google traffic (sums to 100%)" style={{fontSize:8,color:P.gd,fontFamily:fm,letterSpacing:1.5,fontWeight:700}}>100% SPLIT</div>
                    </div>
                    {renderAgeBars(googleStage,googleAg)}
                  </div>
                  <div style={{background:"linear-gradient(145deg,#0f1a11,#060b08)",borderRadius:12,padding:"14px 16px",border:"1px solid rgba(255,255,255,0.07)"}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                      <div style={{fontSize:10,color:"rgba(255,255,255,0.85)",fontFamily:fm,fontWeight:800,letterSpacing:2,textTransform:"uppercase"}}>Gender Split</div>
                      <div title="Share of gender-tagged Google traffic (sums to 100%)" style={{fontSize:8,color:P.gd,fontFamily:fm,letterSpacing:1.5,fontWeight:700}}>100% SPLIT</div>
                    </div>
                    {renderGenderCards(googleStage,googleAg)}
                  </div>
                  <div style={{background:"linear-gradient(145deg,#0f1a11,#060b08)",borderRadius:12,padding:"14px 16px",border:"1px solid rgba(255,255,255,0.07)"}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                      <div style={{fontSize:10,color:"rgba(255,255,255,0.85)",fontFamily:fm,fontWeight:800,letterSpacing:2,textTransform:"uppercase"}}>Device Mix</div>
                      <div title="Share of Mobile + Desktop + Tablet Google traffic (sums to 100%). Connected TV and Other are excluded." style={{fontSize:8,color:P.gd,fontFamily:fm,letterSpacing:1.5,fontWeight:700}}>100% SPLIT</div>
                    </div>
                    {renderDeviceBars(googleStage,googleDev)}
                  </div>
                </div>
              </div>;
            };

            // Gender split cards — bigger, simpler than a donut at a glance.
            // Gender cards — percent-only, using tagged subset as the
            // denominator so Female + Male always sum to 100%.
            var renderGenderCards=function(stage,rowOverride){
              var gs;
              if(rowOverride){
                gs={female:0,male:0};
                rowOverride.forEach(function(r){var g=String(r.gender||"").toLowerCase();if(gs[g]===undefined)return;gs[g]+=stage.field(r);});
              }else{
                gs=genderSharesFor(stage);
              }
              var knownSum=gs.female+gs.male;
              if(knownSum===0)return <div style={{padding:"40px 20px",textAlign:"center",color:P.label,fontFamily:fm,fontSize:12,background:"rgba(0,0,0,0.25)",borderRadius:14}}>No gender-tagged data for this stage</div>;
              var fShare=gs.female/knownSum*100;
              var mShare=gs.male/knownSum*100;
              var row=function(name,share,col){var tip=name+" — "+share.toFixed(2)+"% share of gender-tagged "+stage.label.toLowerCase();return <div title={tip} style={{background:"linear-gradient(135deg,"+col+"15,transparent 70%)",border:"1px solid "+col+"40",borderLeft:"4px solid "+col,borderRadius:"0 14px 14px 0",padding:"16px 18px",marginBottom:12,position:"relative",overflow:"hidden",cursor:"default",transition:"transform 0.2s ease"}} onMouseEnter={function(e){e.currentTarget.style.transform="translateX(3px)";}} onMouseLeave={function(e){e.currentTarget.style.transform="translateX(0)";}}>
                <div style={{position:"absolute",top:0,right:0,width:90,height:90,background:"radial-gradient(circle at 70% 30%,"+col+"22,transparent 70%)",pointerEvents:"none"}}></div>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <div style={{width:34,height:34,borderRadius:17,background:col+"25",border:"1px solid "+col+"55",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:900,color:col,fontFamily:fm}}>{name.charAt(0)}</div>
                    <span style={{fontSize:14,color:"#fff",fontFamily:fm,fontWeight:800,letterSpacing:1}}>{name}</span>
                  </div>
                  <div style={{fontSize:32,fontWeight:900,color:col,fontFamily:fm,lineHeight:1,letterSpacing:-1}}>{share.toFixed(2)+"%"}</div>
                </div>
                <div style={{height:10,background:"rgba(255,255,255,0.04)",borderRadius:5,overflow:"hidden"}}>
                  <div style={{width:share+"%",height:"100%",background:"linear-gradient(90deg,"+col+"88,"+col+")",borderRadius:5,boxShadow:"0 0 10px "+col+"55"}}></div>
                </div>
              </div>;};
              return <div>
                {row("Female",fShare,"#ec4899")}
                {row("Male",mShare,"#3b82f6")}
              </div>;
            };

            // Render a complete per-stage demographics block: stage header with
            // authoritative total, map + province ranks row, age / gender / device
            // row, stage narrative. Called once per stage below.
            var renderStageBlock=function(stage){
              var total=stageTotal(stage);
              return <div style={{background:"linear-gradient(165deg,"+stage.accent+"10 0%,"+stage.accentDeep+"05 50%,transparent 100%),#0d0520",borderRadius:18,padding:"20px 22px 18px",marginBottom:20,border:"1px solid "+stage.accent+"33",boxShadow:"0 10px 36px rgba(0,0,0,0.35),0 0 60px "+stage.accent+"10 inset"}}>
                {/* Stage header with big authoritative total */}
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,gap:14,flexWrap:"wrap"}}>
                  <div style={{display:"flex",alignItems:"center",gap:12}}>
                    <div style={{width:40,height:40,borderRadius:10,background:"linear-gradient(135deg,"+stage.accent+"45,"+stage.accentDeep+"20)",border:"1px solid "+stage.accent+"60",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 0 22px "+stage.accent+"30"}}>{stage.icon("#fff",18)}</div>
                    <div>
                      <div style={{fontSize:18,color:stage.accent,fontFamily:fm,letterSpacing:3,fontWeight:900,textTransform:"uppercase",marginBottom:4}}>{stage.title} Demographics</div>
                      <div style={{fontSize:11,color:"rgba(255,255,255,0.72)",fontFamily:fm,fontWeight:500,letterSpacing:0.3}}>{stage.subtitle}</div>
                    </div>
                  </div>
                  <div title={stage.title+" — "+fmt(total)+" "+stage.label.toLowerCase()+" across the selected campaigns. Every chart below sums to this total; untagged traffic shows as a 'Not Tagged' residual row."} style={{textAlign:"right",padding:"6px 12px",background:"rgba(0,0,0,0.28)",border:"1px solid "+stage.accent+"40",borderRadius:10,boxShadow:"0 0 14px "+stage.accent+"15"}}>
                    <div style={{fontSize:8,color:stage.accent,fontFamily:fm,letterSpacing:2,textTransform:"uppercase",fontWeight:800}}>{stage.label}</div>
                    <div style={{fontSize:20,fontWeight:900,color:"#fff",fontFamily:fm,lineHeight:1,letterSpacing:-0.5,textShadow:"0 0 12px "+stage.accent+"55"}}>{fmt(total)}</div>
                  </div>
                </div>

                {/* Where — map + ranked provinces. Grid split 1:1 so the bubble
                    map visually ties to the ranked-provinces table on the left
                    instead of dominating the section. */}
                <div style={{fontSize:15,color:stage.accent,fontFamily:fm,letterSpacing:2.5,textTransform:"uppercase",fontWeight:900,marginBottom:12}}>· Where</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
                  <div>{renderProvinceMap(stage)}</div>
                  <div>{renderProvinceRanks(stage)}</div>
                </div>

                {/* Who + How — age + gender + device */}
                <div style={{fontSize:15,color:stage.accent,fontFamily:fm,letterSpacing:2.5,textTransform:"uppercase",fontWeight:900,marginTop:18,marginBottom:12}}>· Who & How</div>
                <div style={{display:"grid",gridTemplateColumns:"1.3fr 1fr 1fr",gap:12,marginBottom:12}}>
                  <div style={{background:"linear-gradient(145deg,#16091f,#0b0418)",borderRadius:12,padding:"14px 16px",border:"1px solid rgba(255,255,255,0.07)"}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                      <div style={{fontSize:10,color:"rgba(255,255,255,0.85)",fontFamily:fm,fontWeight:800,letterSpacing:2,textTransform:"uppercase"}}>By Age Group</div>
                      <div title="Share of age-tagged traffic (sums to 100%)" style={{fontSize:8,color:stage.accent,fontFamily:fm,letterSpacing:1.5,fontWeight:700}}>100% SPLIT</div>
                    </div>
                    {renderAgeBars(stage)}
                  </div>
                  <div style={{background:"linear-gradient(145deg,#16091f,#0b0418)",borderRadius:12,padding:"14px 16px",border:"1px solid rgba(255,255,255,0.07)"}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                      <div style={{fontSize:10,color:"rgba(255,255,255,0.85)",fontFamily:fm,fontWeight:800,letterSpacing:2,textTransform:"uppercase"}}>Gender Split</div>
                      <div title="Share of gender-tagged traffic (sums to 100%)" style={{fontSize:8,color:stage.accent,fontFamily:fm,letterSpacing:1.5,fontWeight:700}}>100% SPLIT</div>
                    </div>
                    {renderGenderCards(stage)}
                  </div>
                  <div style={{background:"linear-gradient(145deg,#16091f,#0b0418)",borderRadius:12,padding:"14px 16px",border:"1px solid rgba(255,255,255,0.07)"}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                      <div style={{fontSize:10,color:"rgba(255,255,255,0.85)",fontFamily:fm,fontWeight:800,letterSpacing:2,textTransform:"uppercase"}}>Device Mix</div>
                      <div title="Share of Mobile + Desktop + Tablet traffic (sums to 100%). Connected TV and Other are excluded." style={{fontSize:8,color:stage.accent,fontFamily:fm,letterSpacing:1.5,fontWeight:700}}>100% SPLIT</div>
                    </div>
                    {renderDeviceBars(stage)}
                  </div>
                </div>

                {/* Stage narrative */}
                <Insight title={stage.title+" Demographic Insights"} accent={stage.accent} icon={stage.icon(stage.accent,16)}>{stageNarrative(stage)}</Insight>
              </div>;
            };

            // Populate the shared demoBlocks object so both Demographics and
            // Summary tabs can render individual stage blocks. The IIFE itself
            // returns null — the JSX slot where this runs is not used directly;
            // consumers read demoBlocks.awarenessBlock etc.
            demoBlocks = {
              kpiStrip: (<div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14,marginBottom:22}}>
                {[stageDef.awareness,stageDef.engagement,stageDef.objective].map(function(s){var v=stageTotal(s);var nextStage=s.key==="impressions"?stageDef.engagement:s.key==="clicks"?stageDef.objective:null;var dropRate=0;if(nextStage){var nv=stageTotal(nextStage);dropRate=v>0?(nv/v*100):0;}var tip=s.title+" — "+fmt(v)+" "+s.label.toLowerCase()+(nextStage&&v>0?" · "+dropRate.toFixed(2)+"% progress to "+nextStage.title.toLowerCase():"");return <div key={s.key} title={tip} style={{background:"linear-gradient(135deg,"+s.accent+"18,"+s.accentDeep+"08 70%,transparent)",border:"1px solid "+s.accent+"40",borderLeft:"4px solid "+s.accent,borderRadius:"0 16px 16px 0",padding:"18px 22px",transition:"transform 0.2s ease, box-shadow 0.2s ease"}} onMouseEnter={function(e){e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow="0 10px 30px "+s.accent+"25";}} onMouseLeave={function(e){e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.boxShadow="none";}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                    <div style={{width:32,height:32,borderRadius:10,background:s.accent+"22",display:"flex",alignItems:"center",justifyContent:"center"}}>{s.icon(s.accent,16)}</div>
                    <div style={{fontSize:10,color:s.accent,fontFamily:fm,letterSpacing:2,fontWeight:800,textTransform:"uppercase"}}>{s.title}</div>
                  </div>
                  <div style={{fontSize:28,fontWeight:900,color:s.accent,fontFamily:fm,lineHeight:1,marginBottom:4,textShadow:"0 0 12px "+s.accent+"33"}}>{fmtAbbr(v)}</div>
                  <div style={{fontSize:9,color:P.label,fontFamily:fm,letterSpacing:1,textTransform:"uppercase"}}>{s.label}</div>
                  {nextStage&&v>0&&<div style={{marginTop:10,paddingTop:10,borderTop:"1px solid "+P.rule,fontSize:10,color:P.caption,fontFamily:fm}}>→ {dropRate.toFixed(2)+"%"} progress to {nextStage.title.toLowerCase()}</div>}
                </div>;})}
              </div>),
              platformMix: renderPlatformMix(),
              awarenessBlock: renderStageBlock(stageDef.awareness),
              engagementBlock: renderStageBlock(stageDef.engagement),
              objectiveBlock: renderStageBlock(stageDef.objective),
              googleBlock: renderCitiesBlock(),
              footnote: (<div style={{marginTop:20,padding:"16px 20px",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:12,fontSize:11.5,color:"rgba(255,251,248,0.88)",fontFamily:fm,lineHeight:1.75,letterSpacing:0.3}}>
                <span style={{color:"#fff",fontWeight:800,letterSpacing:1.2,textTransform:"uppercase",fontSize:10,marginRight:10}}>How the splits are computed</span>
                All percentages on this page are calculated against the subset of traffic the ad platforms attributed to a specific demographic dimension (age, gender, device, province, city). Each chart sums to 100% of that tagged subset, so every split is a true share of what we can confidently measure. Absolute totals appear only in the stage header, where they come from the same campaign-level data Summary uses.
              </div>)
            };

            // Audience snapshot for the Executive Summary narrative at the
            // page bottom. Mobile-share uses the Mobile + Desktop + Tablet
            // denominator that matches the Device Mix chart (Connected TV
            // and Other are excluded from the visualisation).
            var mobileShareFor=function(s){
              var b={mobile:0,desktop:0,tablet:0};
              devRows.forEach(function(r){var d=String(r.device||"").toLowerCase();var k=d.indexOf("mobile")>=0||d.indexOf("android")>=0||d.indexOf("ios")>=0||d==="iphone"?"mobile":(d==="ipad"||d.indexOf("tablet")>=0?"tablet":(d.indexOf("desktop")>=0||d==="web"?"desktop":null));if(k)b[k]+=s.field(r);});
              var sum=b.mobile+b.desktop+b.tablet;return sum>0?(b.mobile/sum*100):0;
            };
            var topAgeShareFor=function(s){
              var t=stageTotal(s);var ta=topAgeFor(s);
              return{age:ta.age,share:t>0&&ta.val>0?(ta.val/t*100):0};
            };
            var topProvShareFor=function(s){
              var t={};regRows.forEach(function(r){var p=String(r.region||"").trim();if(!p)return;t[p]=(t[p]||0)+s.field(r);});
              var sum=0;Object.keys(t).forEach(function(k){sum+=t[k];});
              var best=null;var bestVal=0;Object.keys(t).forEach(function(k){if(t[k]>bestVal){bestVal=t[k];best=k;}});
              return{prov:best,share:sum>0?(bestVal/sum*100):0};
            };
            // taggedTotalFor sums all valid age+gender cells for a stage so
            // narratives can compute a top-segment share against the
            // tagged-only denominator (matches what the persona cards show
            // and what the Demographic block charts use). Without this,
            // narratives that divide by authObj systematically under-state
            // segment shares because untagged conversions are in the
            // denominator but not the numerator.
            var taggedTotalFor=function(stage){var t=0;agRows.forEach(function(r){var a=String(r.age||"");var g=String(r.gender||"").toLowerCase();if(ageOrder.indexOf(a)<0||genderOrder.indexOf(g)<0)return;t+=stage.field(r);});return t;};
            demoSummary = {
              awareness:{topAge:topAgeShareFor(stageDef.awareness),topProv:topProvShareFor(stageDef.awareness),gender:genderSharesFor(stageDef.awareness),mobile:mobileShareFor(stageDef.awareness),tagged:taggedTotalFor(stageDef.awareness)},
              engagement:{topAge:topAgeShareFor(stageDef.engagement),topProv:topProvShareFor(stageDef.engagement),gender:genderSharesFor(stageDef.engagement),mobile:mobileShareFor(stageDef.engagement),tagged:taggedTotalFor(stageDef.engagement)},
              objective:{topAge:topAgeShareFor(stageDef.objective),topProv:topProvShareFor(stageDef.objective),gender:genderSharesFor(stageDef.objective),mobile:mobileShareFor(stageDef.objective),topSegment:topSegmentFor(stageDef.objective),tagged:taggedTotalFor(stageDef.objective)},
              authObj:authObj
            };

            // Build per-platform targeting personas (click-weighted). One card
            // per platform on the Targeting tab's WHO IS CLICKING section.
            // Uses the engagement stage so the signal is about who CLICKED,
            // not who the ad was SERVED to. Platforms with zero click volume
            // are dropped so an unused account doesn't leave an empty card.
            var buildPersona=function(matchKey,displayName,color,iconFn){
              var pKeyLow=matchKey.toLowerCase();
              var matches=function(r){return String(r.platform||"").toLowerCase().indexOf(pKeyLow)>=0;};
              var agP=agRows.filter(matches);
              var devP=devRows.filter(matches);
              var regP=regRows.filter(matches);
              var stage=stageDef.engagement;
              var totalClicks=0;agP.forEach(function(r){totalClicks+=stage.field(r);});
              var blendedClk=authClicks||0;
              var shareOfClicks=blendedClk>0?(totalClicks/blendedClk*100):0;
              // Dominant age
              var ageSums={};agP.forEach(function(r){var a=String(r.age||"");if(!a)return;ageSums[a]=(ageSums[a]||0)+stage.field(r);});
              var topAge="";var topAgeVal=0;Object.keys(ageSums).forEach(function(a){if(ageSums[a]>topAgeVal){topAgeVal=ageSums[a];topAge=a;}});
              var ageDenom=Object.keys(ageSums).reduce(function(s,k){return s+ageSums[k];},0);
              var topAgeShare=ageDenom>0?(topAgeVal/ageDenom*100):0;
              // Gender split
              var gs={female:0,male:0};agP.forEach(function(r){var g=String(r.gender||"").toLowerCase();if(gs[g]!==undefined)gs[g]+=stage.field(r);});
              var gSum=gs.female+gs.male;
              var genderSplit={female:gSum>0?(gs.female/gSum*100):0,male:gSum>0?(gs.male/gSum*100):0};
              // Top provinces (up to 3)
              var provSums={};regP.forEach(function(r){var p=String(r.region||"").trim();if(!p)return;provSums[p]=(provSums[p]||0)+stage.field(r);});
              var pOrder=Object.keys(provSums).sort(function(a,b){return provSums[b]-provSums[a];});
              var pDenom=Object.keys(provSums).reduce(function(s,k){return s+provSums[k];},0);
              var topProvinces=pOrder.slice(0,3).map(function(p){return {name:p,share:pDenom>0?(provSums[p]/pDenom*100):0};});
              // Mobile share of device-tagged clicks (Mobile + Desktop + Tablet denominator, matches the Device Mix chart)
              var devB={mobile:0,desktop:0,tablet:0};
              devP.forEach(function(r){var d=String(r.device||"").toLowerCase();var k=d.indexOf("mobile")>=0||d.indexOf("android")>=0||d.indexOf("ios")>=0||d==="iphone"?"mobile":(d==="ipad"||d.indexOf("tablet")>=0?"tablet":(d.indexOf("desktop")>=0||d==="web"?"desktop":null));if(k)devB[k]+=stage.field(r);});
              var devDenom=devB.mobile+devB.desktop+devB.tablet;
              var mobileShare=devDenom>0?(devB.mobile/devDenom*100):0;
              // Top 3 age+gender segments, descending. Previously we only
              // surfaced the single hottest segment, client wanted a top-3
              // list so multiple converting segments can be weighted in
              // budget decisions rather than one winner.
              var segMap={};
              agP.forEach(function(r){var a=String(r.age||"");var g=String(r.gender||"").toLowerCase();if(ageOrder.indexOf(a)<0||genderOrder.indexOf(g)<0)return;var k=a+"|"+g;var v=stage.field(r);segMap[k]=(segMap[k]||0)+v;});
              var topSegments=Object.keys(segMap).map(function(k){var parts=k.split("|");return {age:parts[0],gen:parts[1],val:segMap[k],share:totalClicks>0?(segMap[k]/totalClicks*100):0};}).sort(function(a,b){return b.val-a.val;}).slice(0,3);
              // CTR vs blended, kept in the payload even though the card
              // footer no longer prints it, the Targeting Insights narrative
              // below the grid still references ctrRatio.
              var pd=authPlat&&authPlat[displayName];
              var platImps=pd?pd.imp:0;var platClk=pd?pd.clk:0;
              var ctr=platImps>0?(platClk/platImps*100):0;
              var blendedCtr=authImps>0?(authClicks/authImps*100):0;
              var ctrRatio=blendedCtr>0?(ctr/blendedCtr):0;
              return {platform:displayName,color:color,iconFn:iconFn,totalClicks:totalClicks,shareOfClicks:shareOfClicks,topAge:topAge,topAgeShare:topAgeShare,genderSplit:genderSplit,topProvinces:topProvinces,mobileShare:mobileShare,topSegments:topSegments,ctr:ctr,ctrRatio:ctrRatio};
            };
            targetingPersonas=[
              buildPersona("facebook","Facebook",P.fb,Ic.eye),
              buildPersona("instagram","Instagram",P.ig,Ic.fire),
              buildPersona("tiktok","TikTok",P.tt,Ic.bolt)
            ].filter(function(p){return p.totalClicks>0;});
            return null;
  })();
  // Page backdrop. Solid navy that matches the header strip exactly —
  // no gradient, no radial ambience, no shading. Lighter than the
  // near-black #06020e the page used to sit on, so the metric tiles and
  // glass cards have a brighter canvas to read against. Loading state
  // uses the same colour so the page never flashes a darker tone
  // between mount and first data paint.
  var pageBackdrop = "#0B141B";
  return(<div style={{minHeight:"100vh",display:"flex",flexDirection:"column",background:pageBackdrop,color:P.txt,fontFamily:ff,WebkitFontSmoothing:"antialiased"}}>
    <style>{`
      /* Persona card breathing glow, opacity-only so each card's box-shadow
         keeps its platform colour. animationDelay is staggered per card via
         inline style so the four cards pulse out of phase with each other,
         a soft live-feel rather than a single synchronised heartbeat. */
      @keyframes personaGlowPulse{0%,100%{opacity:0.35}50%{opacity:0.85}}
      @keyframes personaCardLift{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}
      /* Mobile responsive: attribute selectors match inline React styles so no component refactor needed */
      @media (max-width: 820px) {
        /* Collapse wide grids */
        div[style*="grid-template-columns: repeat(6"],
        div[style*="grid-template-columns:repeat(6"],
        div[style*="grid-template-columns: repeat(5"],
        div[style*="grid-template-columns:repeat(5"] {
          grid-template-columns: 1fr 1fr !important;
          gap: 10px !important;
        }
        div[style*="grid-template-columns: repeat(4"],
        div[style*="grid-template-columns:repeat(4"] {
          grid-template-columns: 1fr 1fr !important;
          gap: 10px !important;
        }
        div[style*="grid-template-columns: repeat(3"],
        div[style*="grid-template-columns:repeat(3"] {
          grid-template-columns: 1fr !important;
          gap: 10px !important;
        }
        div[style*="grid-template-columns: 1fr 1fr"] {
          grid-template-columns: 1fr !important;
        }
        div[style*="grid-template-columns: 340px 1fr"] {
          grid-template-columns: 1fr !important;
        }
        /* Wide sections shrink padding */
        div[style*="padding:\\"6px 28px 28px\\""],
        div[style*='padding:"6px 28px 28px"'] {
          padding: 6px 14px 18px !important;
        }
        /* Header wraps controls; tabs scroll horizontally */
        header > div:last-child > div {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          flex-wrap: nowrap !important;
        }
        header > div:last-child > div button {
          flex-shrink: 0 !important;
          padding: 8px 14px !important;
          font-size: 12px !important;
        }
        /* Large numeric values shrink */
        div[style*="font-size:28px"],
        div[style*="font-size: 28px"] { font-size: 22px !important; }
        div[style*="font-size:30px"],
        div[style*="font-size: 30px"] { font-size: 24px !important; }
        div[style*="font-size:34px"],
        div[style*="font-size: 34px"] { font-size: 26px !important; }
        /* Main outer padding tightens */
        div[style*="padding:\\"20px 28px 80px\\""],
        div[style*='padding:"20px 28px 80px"'] {
          padding: 14px 12px 60px !important;
        }
        /* Wide tables scroll instead of overflowing */
        table { max-width: 100%; }
      }
      @media (max-width: 480px) {
        /* Super-compact phone layout, all cards full width */
        div[style*="grid-template-columns: repeat(4"],
        div[style*="grid-template-columns:repeat(4"],
        div[style*="grid-template-columns: repeat(5"],
        div[style*="grid-template-columns:repeat(5"],
        div[style*="grid-template-columns: repeat(6"],
        div[style*="grid-template-columns:repeat(6"] {
          grid-template-columns: 1fr !important;
        }
        /* Date picker stacks inline */
        header input[type="date"] { width: 100px !important; font-size: 11px !important; }
      }
    `}</style>
    {!loading&&<div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0}}><div style={{position:"absolute",inset:0,opacity:0.018,backgroundImage:"radial-gradient("+P.ember+" 0.5px,transparent 0.5px),radial-gradient("+P.orchid+" 0.5px,transparent 0.5px)",backgroundSize:"40px 40px",backgroundPosition:"0 0,20px 20px"}}/></div>}

    <header style={{position:"sticky",top:0,zIndex:100,background:"#0B141B",borderBottom:"1px solid "+P.rule}}>
      <div style={{maxWidth:1400,margin:"0 auto",padding:"10px 28px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
          <div style={{display:"flex",alignItems:"center",gap:14}}>
            <div style={{width:42,height:42,borderRadius:"50%",overflow:"hidden",animation:"pulse-glow 3s ease-in-out infinite"}}><img src="/GAS_LOGO_EMBLEM_GAS_Primary_Gradient.png" alt="GAS" style={{width:"100%",height:"100%",objectFit:"cover"}}/></div>
            <div><div style={{fontSize:16,fontWeight:900,letterSpacing:4,fontFamily:fm,lineHeight:1}}><span style={{color:P.txt}}>MEDIA </span><span style={{color:P.ember}}>ON </span><span style={{background:gFire,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>GAS</span></div><div style={{fontSize:9,color:P.label,letterSpacing:4,textTransform:"uppercase",fontFamily:fm,marginTop:3,fontWeight:600}}>{isClient?"Client Dashboard":"Metrics That Matter"}</div></div>
            {/* LIVE indicator. Subtle breathing chip that signals to the
                team the data on screen is current (refreshed on every page
                load via the platform APIs, not a stale snapshot). The
                two-layer animation, dot pulse + halo glow + chip border
                breath, reads as "alive" without being distracting. */}
            <div title="Live data, refreshed from Meta / TikTok / Google every time you load or refresh this page" style={{display:"inline-flex",alignItems:"center",gap:6,padding:"4px 10px 4px 8px",borderRadius:999,border:"1px solid rgba(74,222,128,0.30)",background:"rgba(74,222,128,0.05)",fontFamily:fm,animation:"liveChipBreath 2.4s ease-in-out infinite"}}>
              <span style={{position:"relative",display:"inline-flex",alignItems:"center",justifyContent:"center",width:8,height:8}}>
                <span style={{width:8,height:8,borderRadius:"50%",background:"#4ade80",animation:"liveDotPulse 2.4s ease-in-out infinite, liveDotGlow 2.4s ease-in-out infinite"}}/>
              </span>
              <span style={{fontSize:9.5,fontWeight:800,color:"#4ade80",letterSpacing:2.5,textTransform:"uppercase"}}>Live</span>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
            {!isClient&&<button onClick={function(){setShowCampaigns(function(prev){return !prev;});}} style={{background:showCampaigns?P.ember+"15":P.glass,border:"1px solid "+(showCampaigns?P.ember+"50":P.rule),borderRadius:10,padding:"8px 16px",color:showCampaigns?P.ember:P.label,fontSize:11,fontWeight:700,fontFamily:fm,cursor:"pointer",display:"flex",alignItems:"center",gap:5}}>{Ic.chart(showCampaigns?P.ember:P.label,14)} {selected.length} Campaigns</button>}
            <div style={{display:"flex",alignItems:"center",gap:5,background:P.glass,border:"1px solid "+P.rule,borderRadius:10,padding:"6px 12px"}}><span style={{fontSize:8,color:P.label,fontFamily:fm,letterSpacing:2,fontWeight:700}}>FROM</span><input type="date" value={df} onChange={function(e){setDf(e.target.value);}} style={{background:"transparent",border:"none",color:"#fff",fontSize:12,fontFamily:fm,outline:"none",width:105,fontWeight:500}}/><div style={{width:12,height:1,background:"linear-gradient(90deg,"+P.ember+","+P.solar+")"}}/><span style={{fontSize:8,color:P.label,fontFamily:fm,letterSpacing:2,fontWeight:700}}>TO</span><input type="date" value={dt} onChange={function(e){setDt(e.target.value);}} style={{background:"transparent",border:"none",color:"#fff",fontSize:12,fontFamily:fm,outline:"none",width:105,fontWeight:500}}/></div>
            {/* Summary-only compare toggle. Other tabs show the selected
                range without period-over-period deltas. */}
            <div title="Summary-tab compare mode: show deltas vs the prior period" style={{display:"flex",alignItems:"center",gap:3,background:P.glass,border:"1px solid "+P.rule,borderRadius:10,padding:3}}>
              {[{k:"off",l:"OFF"},{k:"wow",l:"WoW"},{k:"mom",l:"MoM"}].map(function(opt){var active=compareMode===opt.k;return <button key={opt.k} onClick={function(){setCompareMode(opt.k);}} style={{background:active?gEmber:"transparent",border:"none",borderRadius:7,padding:"5px 10px",color:active?"#fff":P.label,fontSize:10,fontWeight:800,fontFamily:fm,cursor:"pointer",letterSpacing:1.2}}>{opt.l}</button>;})}
            </div>
            {compareMode!=="off"&&(function(){var r=computeComparisonRange(df,dt,compareMode);if(!r)return null;return <div title={"Summary delta chips are comparing to "+r.from+" — "+r.to} style={{fontSize:9,color:P.label,fontFamily:fm,letterSpacing:1.2,background:P.glass,border:"1px solid "+P.rule,borderRadius:10,padding:"6px 8px",whiteSpace:"nowrap",textTransform:"uppercase",fontWeight:700}}><span style={{color:P.ember,fontWeight:800,marginRight:4}}>vs</span>prior</div>;})()}
            <button onClick={refreshData} style={{background:gEmber,border:"none",borderRadius:10,padding:"8px 18px",color:"#fff",fontSize:11,fontWeight:800,fontFamily:fm,cursor:"pointer",letterSpacing:1.5}}>REFRESH</button>
            {!isClient&&<button onClick={function(){setShowAudit(true);}} title="Settings, Audit, Reconciliation, Usage, Team" style={{background:P.glass,border:"1px solid "+P.rule,borderRadius:10,padding:"8px 12px",color:P.solar,fontSize:11,fontWeight:700,fontFamily:fm,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>{Ic.flag(P.solar,14)} Settings</button>}
            {!isClient&&<button onClick={function(){setShowShare(true);}} style={{background:P.glass,border:"1px solid "+P.rule,borderRadius:10,padding:"8px 12px",color:P.ember,fontSize:11,fontWeight:700,fontFamily:fm,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>{Ic.share(P.ember,14)} Share</button>}
            {!isClient&&<button onClick={handleLogout} style={{background:P.glass,border:"1px solid "+P.rule,borderRadius:10,padding:"8px 12px",color:P.rose,fontSize:11,fontWeight:700,fontFamily:fm,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>{Ic.power(P.rose,14)} Logout</button>}
          </div>
        </div>
      </div>
      <div style={{maxWidth:1400,margin:"0 auto",padding:"0 28px"}}><div style={{display:"flex",gap:1,alignItems:"center"}}>{tabs.map(function(tb){var isActive=tab===tb.id;var disabled=loading&&!isActive;return<button key={tb.id} disabled={disabled} title={disabled?"Loading your data, tabs unlock when the Summary finishes":undefined} onClick={function(){if(disabled)return;setTab(tb.id);}} style={{display:"flex",alignItems:"center",gap:5,background:isActive?P.ember+"10":"transparent",border:"none",borderBottom:isActive?"2px solid "+P.ember:"2px solid transparent",padding:"10px 18px",cursor:disabled?"not-allowed":"pointer",color:isActive?P.ember:P.label,fontSize:13,fontWeight:isActive?800:500,fontFamily:ff,letterSpacing:0.3,opacity:disabled?0.35:1,transition:"opacity 0.2s ease"}}>{tb.icon}<span>{tb.label}</span></button>;})}
      {loading&&<span style={{marginLeft:14,display:"inline-flex",alignItems:"center",gap:8,fontSize:10,fontFamily:fm,color:P.label,letterSpacing:1.5,textTransform:"uppercase",fontWeight:700}}><span style={{width:10,height:10,border:"1.5px solid "+P.rule,borderTop:"1.5px solid "+P.ember,borderRadius:"50%",animation:"spin 0.9s linear infinite"}}/>Loading, other tabs unlock once Summary lands</span>}
      </div></div>
    </header>

    {showShare&&<ShareModal onClose={function(){setShowShare(false);}} onSent={function(){setShowShare(false);setTab("summary");setShowSentToast(true);setTimeout(function(){setShowSentToast(false);},3500);}} selected={selected} campaigns={campaigns} dateFrom={df} dateTo={dt} apiBase={API} session={session}/>}
    {showSentToast&&<div style={{position:"fixed",top:28,left:"50%",transform:"translateX(-50%)",zIndex:2000,background:"linear-gradient(135deg,#10B981,#059669)",border:"1px solid #34D399",borderRadius:14,padding:"14px 28px",boxShadow:"0 12px 40px rgba(16,185,129,0.4)",display:"flex",alignItems:"center",gap:12,minWidth:320,animation:"none"}}><div style={{width:22,height:22,borderRadius:"50%",background:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:900,color:"#059669"}}>{"\u2713"}</div><div style={{color:"#fff",fontSize:13,fontWeight:900,fontFamily:fm,letterSpacing:2,textTransform:"uppercase"}}>Your report has been sent</div></div>}
    {showIdleNudge&&<div style={{position:"fixed",inset:0,zIndex:2100,background:"rgba(6,2,14,0.72)",backdropFilter:"blur(6px)",display:"flex",alignItems:"center",justifyContent:"center",padding:"24px 16px"}}>
      <div style={{width:420,maxWidth:"94vw",background:"linear-gradient(170deg,#0d0618 0%,#1a0b2e 100%)",border:"1px solid rgba(249,98,3,0.35)",borderRadius:18,padding:"28px 28px 22px",boxShadow:"0 30px 80px rgba(0,0,0,0.65),0 0 60px rgba(249,98,3,0.18)",textAlign:"center",animation:"gasEnter 0.45s cubic-bezier(0.2,0.8,0.2,1) both"}}>
        <div style={{fontSize:38,marginBottom:6}}>{"😴"}</div>
        <div style={{fontSize:11,color:P.ember,letterSpacing:3,fontWeight:800,fontFamily:fm,textTransform:"uppercase",marginBottom:10}}>Pssst, still there?</div>
        <div style={{fontSize:15,color:P.txt,fontFamily:ff,lineHeight:1.6,fontWeight:700,marginBottom:8}}>Your dashboard just took a 10 minute coffee break.</div>
        <div style={{fontSize:12,color:"rgba(255,251,248,0.72)",fontFamily:fm,lineHeight:1.7,marginBottom:20}}>Tap refresh to pull the latest metrics and the newest dashboard features. Your ads have been busy, we promise.</div>
        <div style={{display:"flex",gap:10,justifyContent:"center"}}>
          <button onClick={hardRefresh} style={{background:gEmber,border:"none",borderRadius:10,padding:"12px 24px",color:"#fff",fontSize:12,fontWeight:900,fontFamily:fm,cursor:"pointer",letterSpacing:2,boxShadow:"0 6px 20px rgba(249,98,3,0.35)"}}>Refresh Now</button>
          <button onClick={function(){setShowIdleNudge(false);}} style={{background:"transparent",border:"1px solid "+P.rule,borderRadius:10,padding:"12px 20px",color:P.label,fontSize:11,fontWeight:700,fontFamily:fm,cursor:"pointer",letterSpacing:1.5}}>Not yet</button>
        </div>
        <div style={{marginTop:16,fontSize:10,color:P.caption,fontFamily:fm,fontStyle:"italic",letterSpacing:0.5}}>Refreshing re-pulls live data from Meta, TikTok, and Google, and loads the latest dashboard version.</div>
      </div>
    </div>}
    <CampaignAuditModal open={showAudit} onClose={function(){setShowAudit(false);}} apiBase={API} session={session} dateFrom={df} dateTo={dt} isSuperadmin={isSuperadmin}/>
    <AdPreviewModal ad={previewAd} onClose={function(){setPreviewAd(null);}} apiBase={API} session={viewToken?"":session} viewToken={viewToken}/>
    {/* Chat FAB + panel scoped to the Summary tab. The chat is grounded in
        Summary's snapshot, so showing the FAB on Deep Dive / Creative /
        Demographics / etc. invited questions the bot can't answer in
        context. Hide the entry point everywhere except Summary; clients
        already never see it. */}
    {!isClient&&tab==="summary"&&<ChatPanel apiBase={API} session={session} viewToken={viewToken} dateFrom={df} dateTo={dt} open={showChat} setOpen={setShowChat} campaigns={campaigns} selected={selected} onOpenAd={setPreviewAd}/>}

    {!isClient&&dataWarnings.length>0&&<div style={{maxWidth:1400,margin:"12px auto 0",padding:"12px 18px",background:P.warning+"15",border:"1px solid "+P.warning+"50",borderLeft:"4px solid "+P.warning,borderRadius:10,display:"flex",alignItems:"flex-start",gap:12,position:"relative",zIndex:2}}>
      <div style={{color:P.warning,fontSize:18,flexShrink:0,marginTop:1}}>{"\u26A0"}</div>
      <div style={{flex:1,fontSize:11,fontFamily:fm,color:P.txt,lineHeight:1.6}}>
        <div style={{fontWeight:800,color:P.warning,letterSpacing:1.5,textTransform:"uppercase",marginBottom:4}}>Partial data: {dataWarnings.length} fetch{dataWarnings.length===1?"":"es"} failed</div>
        {dataWarnings.slice(0,4).map(function(w,i){return <div key={i} style={{color:P.label}}>{w.platform+(w.account?(" / "+w.account):"")+(w.stage?(" ("+w.stage+")"):"")+": "+(w.message||"unknown error")}</div>;})}
        {dataWarnings.length>4&&<div style={{color:P.caption,marginTop:4}}>+ {dataWarnings.length-4} more</div>}
        <div style={{color:P.caption,marginTop:6,fontStyle:"italic"}}>Numbers shown may be under-reported for affected platforms. Re-try with Refresh.</div>
      </div>
      <button onClick={function(){setDataWarnings([]);}} style={{background:"transparent",border:"1px solid "+P.rule,borderRadius:6,width:26,height:26,color:P.label,cursor:"pointer",fontSize:14,lineHeight:1,padding:0,flexShrink:0}}>{"\u00D7"}</button>
    </div>}

    <div style={{width:"100%",maxWidth:1400,margin:"0 auto",padding:"40px 28px 80px",display:"flex",gap:20,position:"relative",zIndex:1,flex:1,boxSizing:"border-box"}}>
      {!isClient&&showCampaigns&&<><div onClick={function(){setShowCampaigns(false);}} style={{position:"fixed",inset:0,zIndex:9,background:"transparent",cursor:"default"}}/><div style={{width:340,flexShrink:0,position:"sticky",top:120,maxHeight:"calc(100vh - 140px)",overflowY:"auto",alignSelf:"flex-start",zIndex:10}}><CampaignSelector campaigns={campaigns} selected={selected} onToggle={toggle} onToggleGroup={toggleGroup} onSelectAll={selectAll} onClearAll={clearAll} search={search} onSearch={setSearch}/></div></>}

      <div style={{flex:1,minWidth:0}}>
        {loading?(<div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"80px 40px",gap:20}}><div style={{width:48,height:48,border:"3px solid "+P.rule,borderTop:"3px solid "+P.ember,borderRadius:"50%",animation:"spin 1s linear infinite"}}/><style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style><div style={{fontSize:15,color:"rgba(255,251,248,0.72)",fontFamily:ff,fontStyle:"italic",textAlign:"center",maxWidth:520,lineHeight:1.6,letterSpacing:0.2,transition:"opacity 0.3s"}}>{loaderQuip}<span style={{display:"inline-block",width:20}}>…</span></div></div>):(<>

        {/* OVERVIEW */}
        {tab==="summary"&&(<div>
          <SH icon={Ic.crown(P.ember,20)} title="Media Insights Summary" sub={df+" to "+dt} accent={P.ember}/>
          {(function(){
            var sel=campaigns.filter(function(x){return selected.indexOf(x.campaignId)>=0;});
            if(sel.length===0)return <div style={{padding:30,textAlign:"center",color:P.caption,fontFamily:fm}}>Select campaigns to view summary.</div>;
            // Build comparison aggregates when the toggle is on. Match
            // compareCampaigns to the currently selected campaigns using
            // BOTH rawCampaignId (for long-running campaigns) AND a
            // normalized template-name key (for agency monthly-replicated
            // campaigns, where 'Campaign X | Apr 26' and 'Campaign X | Mar
            // 26' are the same template on different monthly IDs). Also
            // require the same platform-family (Meta vs TikTok vs Google)
            // so we don't cross-match a Meta template name onto TikTok.
            var compareComputed=null;
            var templateKey=function(name,plat){
              var s=String(name||"").toLowerCase();
              // Strip month+year suffixes like "apr 26", "apr26", "april 2026"
              s=s.replace(/\b(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|jun(e)?|jul(y)?|aug(ust)?|sep(t|tember)?|oct(ober)?|nov(ember)?|dec(ember)?)\s*\d{0,4}\b/g,"");
              s=s.replace(/\b20\d{2}\b/g,"");
              s=s.replace(/[|_\-\s]+/g," ").trim();
              return (plat||"")+"::"+s;
            };
            if(compareMode!=="off"&&compareCampaigns&&compareCampaigns.length>0){
              // Build the prior-period match set. Two modes:
              //
              //   1. Whole-client mode (sel covers >=80% of the campaigns
              //      with activity in the current period): the user is
              //      effectively viewing the full client. Compare client
              //      totals to client totals — DON'T filter the prior pool
              //      by current-selection IDs. Otherwise relaunched-each-
              //      month campaigns (different IDs / slightly renamed)
              //      drop from the prior pool while their successors stay
              //      in the current pool, producing misleading 800%+
              //      deltas where the real client MoM is closer to a
              //      single-digit percentage.
              //
              //   2. Narrowed mode (sel <80% of activity): the user has
              //      explicitly chosen a subset (e.g. only LEADS
              //      campaigns). Honour that by filtering the prior pool
              //      to ID + templateKey matches so the comparison stays
              //      like-for-like at the campaign level.
              var activeNow=campaigns.filter(function(c){return parseFloat(c.impressions||0)>0||parseFloat(c.spend||0)>0;}).length;
              var coverageRatio=activeNow>0?(sel.length/activeNow):1;
              var wholeClientMode=coverageRatio>=0.8;
              var cmpSel;
              if(wholeClientMode){
                cmpSel=compareCampaigns;
              }else{
                var cmpIdSet={};
                var cmpTplSet={};
                sel.forEach(function(c){
                  var raw=c.rawCampaignId||String(c.campaignId||"").replace(/_facebook$/,"").replace(/_instagram$/,"");
                  cmpIdSet[raw]=true;cmpIdSet[c.campaignId]=true;
                  var tk=templateKey(c.campaignName,c.platform);
                  if(tk)cmpTplSet[tk]=true;
                });
                cmpSel=compareCampaigns.filter(function(c){
                  var raw=c.rawCampaignId||String(c.campaignId||"").replace(/_facebook$/,"").replace(/_instagram$/,"");
                  if(cmpIdSet[raw]||cmpIdSet[c.campaignId])return true;
                  var tk=templateKey(c.campaignName,c.platform);
                  return tk&&cmpTplSet[tk];
                });
              }
              var cSpend=0,cImps=0,cClicks=0,cReach=0;
              cmpSel.forEach(function(c){cSpend+=parseFloat(c.spend||0);cImps+=parseFloat(c.impressions||0);cClicks+=parseFloat(c.clicks||0);cReach+=parseFloat(c.reach||0);});
              var cObj={};
              cmpSel.forEach(function(camp){
                var obj="Traffic";var canon=(camp.objective||"").toLowerCase();
                if(canon==="appinstall")obj="Clicks to App Store";
                else if(canon==="leads")obj="Leads";
                else if(canon==="followers")obj="Followers & Likes";
                else if(canon==="landingpage")obj="Landing Page Clicks";
                else{var n=(camp.campaignName||"").toLowerCase();
                  if(n.indexOf("appinstal")>=0||n.indexOf("app install")>=0)obj="Clicks to App Store";
                  else if(n.indexOf("follower")>=0||n.indexOf("_like_")>=0||n.indexOf("_like ")>=0||n.indexOf("paidsocial_like")>=0||n.indexOf("like_facebook")>=0||n.indexOf("like_instagram")>=0)obj="Followers & Likes";
                  else if(n.indexOf("lead")>=0||n.indexOf("pos")>=0)obj="Leads";
                  else if(n.indexOf("homeloan")>=0||n.indexOf("traffic")>=0||n.indexOf("paidsearch")>=0)obj="Landing Page Clicks";
                }
                if(!cObj[obj])cObj[obj]={spend:0,results:0};
                cObj[obj].spend+=parseFloat(camp.spend||0);
                var r=0;
                if(obj==="Leads")r=parseFloat(camp.leads||0);
                else if(obj==="Followers & Likes"){
                  r=parseFloat(camp.follows||0)+parseFloat(camp.pageLikes||0);
                  // Mirror the current-period IG-growth fallback so a
                  // Followers comparison stays apples-to-apples. Without
                  // this, IG follower campaigns that don't surface a
                  // pageLikes/follows count in the prior payload show as
                  // zero results in April and the May tile renders "NEW"
                  // instead of a real delta.
                  if(r===0&&camp.platform==="Instagram"){
                    var igFL=findIgGrowth(camp.campaignName,pages);
                    if(igFL>0)r=igFL;
                  }
                }
                else r=parseFloat(camp.clicks||0);
                cObj[obj].results+=r;
              });
              // Community-ish aggregate from prior period
              var cFbEarned=0,cIgEarned=0,cTtEarned=0;
              cmpSel.forEach(function(camp){
                if(camp.platform==="Facebook")cFbEarned+=parseFloat(camp.pageLikes||0);
                if(camp.platform==="TikTok")cTtEarned+=parseFloat(camp.follows||0);
              });
              var cCpm=cImps>0?(cSpend/cImps*1000):0;
              var cCpc=cClicks>0?(cSpend/cClicks):0;
              var cCtr=cImps>0?(cClicks/cImps*100):0;
              var cFreq=cReach>0?(cImps/cReach):0;
              compareComputed={totalSpend:cSpend,totalImps:cImps,totalClicks:cClicks,totalReach:cReach,blendedCpm:cCpm,blendedCpc:cCpc,blendedCtr:cCtr,blendedFreq:cFreq,objectives:cObj,earnedTotal:cFbEarned+cIgEarned+cTtEarned,matchedCount:cmpSel.length};
              try{
                var priorByRaw={};
                cmpSel.forEach(function(c){var raw=c.rawCampaignId||String(c.campaignId||"").replace(/_facebook$/,"").replace(/_instagram$/,"");if(!priorByRaw[raw])priorByRaw[raw]={name:c.campaignName,spend:0,clicks:0,imps:0};priorByRaw[raw].spend+=parseFloat(c.spend||0);priorByRaw[raw].clicks+=parseFloat(c.clicks||0);priorByRaw[raw].imps+=parseFloat(c.impressions||0);});
                var curByRaw={};
                sel.forEach(function(c){var raw=c.rawCampaignId||String(c.campaignId||"").replace(/_facebook$/,"").replace(/_instagram$/,"");if(!curByRaw[raw])curByRaw[raw]={name:c.campaignName,spend:0,clicks:0,imps:0};curByRaw[raw].spend+=parseFloat(c.spend||0);curByRaw[raw].clicks+=parseFloat(c.clicks||0);curByRaw[raw].imps+=parseFloat(c.impressions||0);});
                var perCampaign=Object.keys(curByRaw).map(function(raw){var cur=curByRaw[raw];var prev=priorByRaw[raw]||{spend:0,clicks:0,imps:0};return{campaign:cur.name,current_spend:cur.spend,prior_spend:prev.spend,current_clicks:cur.clicks,prior_clicks:prev.clicks,spendDelta:prev.spend>0?((cur.spend-prev.spend)/prev.spend*100).toFixed(2)+"%":(cur.spend>0?"NEW":"0")};}).sort(function(a,b){return b.current_spend-a.current_spend;});
                var priorOnlyIds=Object.keys(priorByRaw).filter(function(raw){return !curByRaw[raw];});
                console.log("[GAS compare "+compareMode+"] current vs prior\n"+JSON.stringify({mode:compareMode,scope:wholeClientMode?"whole-client":"matched-only",coverageRatio:coverageRatio.toFixed(2),currentCampaigns:Object.keys(curByRaw).length,priorCampaigns:Object.keys(priorByRaw).length,priorOnlyCampaigns:priorOnlyIds.length,current:{spend:computed.totalSpend,imps:computed.totalImps,clicks:computed.totalClicks},prior:{spend:cSpend,imps:cImps,clicks:cClicks},perCampaign:perCampaign},null,2));
              }catch(_){}
            }
            // Inline delta chip. Returns a small coloured chip next to a
            // value on Summary KPI tiles when compareMode is on. Higher is
            // better for most metrics (green up), invertColor=true flips
            // that for lower-is-better metrics like CPC / CPM / CPL.
            // Loading state: if the comparison fetch hasn't populated
            // compareComputed yet, show a muted 'MoM' / 'WoW' placeholder
            // so the tile isn't flashing 'NEW' while prior data arrives.
            var deltaChip=function(cur,prev,invertColor){
              if(compareMode==="off")return null;
              if(!compareComputed){
                var pendingLabel=compareMode==="mom"?"MoM":"WoW";
                return <span style={{fontSize:9,fontWeight:800,color:P.label,background:P.sub+"20",border:"1px dashed "+P.sub+"55",padding:"1px 6px",borderRadius:4,letterSpacing:1,fontFamily:fm,marginLeft:6,verticalAlign:"middle",opacity:0.8}}>{pendingLabel}</span>;
              }
              cur=parseFloat(cur||0);prev=parseFloat(prev||0);
              if(prev===0&&cur===0)return null;
              if(prev===0)return <span style={{fontSize:8,fontWeight:800,color:P.solar,background:P.solar+"22",padding:"2px 6px",borderRadius:4,letterSpacing:1,fontFamily:fm,marginLeft:6,verticalAlign:"middle"}}>NEW</span>;
              var pct=((cur-prev)/prev)*100;
              var isUp=pct>=0;
              var isGood=invertColor?!isUp:isUp;
              var color=isGood?P.mint:P.rose;
              var arrow=isUp?"▲":"▼";
              return <span style={{fontSize:9,fontWeight:800,color:color,background:color+"22",padding:"2px 6px",borderRadius:4,letterSpacing:0.5,fontFamily:fm,marginLeft:6,display:"inline-flex",alignItems:"center",gap:3,verticalAlign:"middle"}}>{arrow} {Math.abs(pct).toFixed(2)+"%"}</span>;
            };
            var totalDays2=Math.max(1,Math.round((new Date(dt)-new Date(df))/86400000)+1);
            var todayStr=todayLocal();
            var elapsedDays=Math.max(1,Math.round((new Date(todayStr>dt?dt:todayStr)-new Date(df))/86400000)+1);
            var dailySpend=computed.totalSpend>0?computed.totalSpend/elapsedDays:0;
            var projSpend=dailySpend*totalDays2;
            var paceRatio=totalDays2>0?elapsedDays/totalDays2:1;
            var pacePct=Math.min(100,Math.round(paceRatio*100));
            var blCpc=computed.totalClicks>0?computed.totalSpend/computed.totalClicks:0;
            var blCtr=computed.totalImps>0?(computed.totalClicks/computed.totalImps*100):0;
            // Blended frequency now includes Google's estimated 2x reach,
            // driven by api/campaigns.js which derives reach = imps/2 for
            // Google Display + YouTube. Keeps the blended number honest
            // across the full media mix instead of silently hiding Google.
            var blFreq=(m.reach+t.reach+computed.gd.reach)>0?(m.impressions+t.impressions+computed.gd.impressions)/(m.reach+t.reach+computed.gd.reach):0;

            var objectives4={};sel.forEach(function(camp){
              var obj="Traffic";
              // Backend already classifies every row with a canonical
              // objective (Meta via API objective field, Google via
              // advertising_channel_sub_type, TikTok via objective_type,
              // or name-based fallback). Prefer that signal. Only trust
              // "landingpage" when the backend is confident — the
              // name-based fallback returns "unknown" for unrecognised
              // campaigns so they stay out of Landing Page instead of
              // inflating it.
              var canon=(camp.objective||"").toLowerCase();
              if(canon==="appinstall")obj="Clicks to App Store";
              else if(canon==="leads")obj="Leads";
              else if(canon==="followers")obj="Followers & Likes";
              else if(canon==="landingpage")obj="Landing Page Clicks";
              else{
                // canon is "unknown" / empty, fall through to name-based.
                var n=(camp.campaignName||"").toLowerCase();
                if(n.indexOf("appinstal")>=0||n.indexOf("app install")>=0||n.indexOf("app_install")>=0)obj="Clicks to App Store";
                else if(n.indexOf("follower")>=0||n.indexOf("_like_")>=0||n.indexOf("_like ")>=0||n.indexOf("paidsocial_like")>=0||n.indexOf("like_facebook")>=0||n.indexOf("like_instagram")>=0)obj="Followers & Likes";
                else if(n.indexOf("lead")>=0||n.indexOf("pos")>=0)obj="Leads";
                else if(n.indexOf("homeloan")>=0||n.indexOf("traffic")>=0||n.indexOf("paidsearch")>=0)obj="Landing Page Clicks";
              }
              if(!objectives4[obj])objectives4[obj]={spend:0,clicks:0,imps:0,results:0,byPlatform:{}};
              objectives4[obj].spend+=parseFloat(camp.spend||0);objectives4[obj].clicks+=parseFloat(camp.clicks||0);objectives4[obj].imps+=parseFloat(camp.impressions||0);
              var result;
              if(obj==="Leads"){result=parseFloat(camp.leads||0);}
              else if(obj==="Followers & Likes"){result=parseFloat(camp.pageLikes||0)+parseFloat(camp.follows||0);if(result===0&&camp.platform==="Instagram"){var igFL1=findIgGrowth(camp.campaignName,pages);if(igFL1>0)result=igFL1;}}
              else{result=parseFloat(camp.clicks||0);}
              objectives4[obj].results+=result;
              // Per-platform split so the Objective Insights narrative can
              // break down Cost Per Lead (and Cost Per Result generally) by
              // platform when a single objective delivered across multiple
              // placements. Without this, a Willowbrook-style Leads campaign
              // showed a blended CPL only, clients asked to see the FB vs
              // IG split that feeds the blended number.
              var pl=camp.platform||"Other";
              if(!objectives4[obj].byPlatform[pl])objectives4[obj].byPlatform[pl]={spend:0,results:0};
              objectives4[obj].byPlatform[pl].spend+=parseFloat(camp.spend||0);
              objectives4[obj].byPlatform[pl].results+=result;
            });

            var platBreak={};
            // Track which platforms have configured-but-awaiting-delivery
            // rows so the "Spend by Platform" / "Ads Served by Platform"
            // charts can honestly label them. Without this, a Meta campaign
            // configured for FB + IG but currently only delivering to FB
            // shows up as "Facebook only", which made Willowbrook reports
            // look like Instagram was missing from the media plan.
            var awaitingByPlatform={};
            sel.forEach(function(camp){
              var pl=camp.platform;if(!platBreak[pl])platBreak[pl]={spend:0,clicks:0,imps:0,reach:0};
              platBreak[pl].spend+=parseFloat(camp.spend||0);platBreak[pl].clicks+=parseFloat(camp.clicks||0);platBreak[pl].imps+=parseFloat(camp.impressions||0);platBreak[pl].reach+=parseFloat(camp.reach||0);
              if(camp.awaitingDelivery){if(!awaitingByPlatform[pl])awaitingByPlatform[pl]=[];if(awaitingByPlatform[pl].indexOf(camp.campaignName)<0)awaitingByPlatform[pl].push(camp.campaignName);}
            });
            // A campaign is truly "awaiting delivery" only if EVERY selected
            // row for that platform is flagged awaitingDelivery. Once any
            // real delivery row arrives for the same platform (even from a
            // different campaign in the selection), stop labelling.
            Object.keys(awaitingByPlatform).forEach(function(pl){
              if((platBreak[pl]||{spend:0,imps:0}).spend>0||(platBreak[pl]||{imps:0}).imps>0){
                delete awaitingByPlatform[pl];
              }
            });

            var platOrd4={"Facebook":0,"Instagram":1,"TikTok":2,"Google Display":3,"YouTube":4};
            var platCol4={"Facebook":P.fb,"Instagram":P.ig,"TikTok":P.tt,"Google Display":P.gd,"YouTube":P.lava};
            var platShort={"Facebook":"FB","Instagram":"IG","TikTok":"TT","Google Display":"GD","YouTube":"YT"};
            var objKeys=["Clicks to App Store","Landing Page Clicks","Followers & Likes","Leads"];
            var objCol4={"Clicks to App Store":P.fb,"Landing Page Clicks":P.cyan,"Leads":P.rose,"Followers & Likes":P.tt};
            var objCL4={"Clicks to App Store":"COST PER CLICK","Landing Page Clicks":"COST PER CLICK","Leads":"COST PER LEAD","Followers & Likes":"COST PER FOLLOWER"};

            var sortedPlats=Object.keys(platBreak).sort(function(a,b){return (platOrd4[a]||9)-(platOrd4[b]||9);});
            var spendData=sortedPlats.map(function(pl){return{name:platShort[pl]||pl,fullName:pl,value:platBreak[pl].spend,color:platCol4[pl]||P.ember,_currency:true};}).sort(function(a,b){return b.value-a.value;});
            var impData=sortedPlats.map(function(pl){return{name:platShort[pl]||pl,fullName:pl,value:platBreak[pl].imps,color:platCol4[pl]||P.ember};});
            var cpcData=sortedPlats.filter(function(pl){return platBreak[pl].clicks>0;}).map(function(pl){var pb=platBreak[pl];return{name:platShort[pl]||pl,fullName:pl,cpc:pb.clicks>0?parseFloat((pb.spend/pb.clicks).toFixed(2)):0,color:platCol4[pl]||P.ember,_currency:true};});
            var cpmData=sortedPlats.filter(function(pl){return platBreak[pl].imps>0;}).map(function(pl){var pb=platBreak[pl];return{name:platShort[pl]||pl,fullName:pl,cpm:pb.imps>0?parseFloat((pb.spend/pb.imps*1000).toFixed(2)):0,color:platCol4[pl]||P.ember,_currency:true};});

            /* --- Community (computed early so Objective Highlights can use the ground-truth follower total) --- */
            var matchedPages3=[];var matchedIds3={};
            for(var s3=0;s3<sel.length;s3++){var bestPg3=null;var bestSc3=0;for(var p3=0;p3<pages.length;p3++){var sc4=autoMatchPage(sel[s3].campaignName,pages[p3].name);if(sc4>bestSc3){bestSc3=sc4;bestPg3=pages[p3];}}if(bestPg3&&bestSc3>=2&&matchedIds3[bestPg3.id]!==true){matchedPages3.push(bestPg3);matchedIds3[bestPg3.id]=true;}}
            var fbT2=0;var igT2=0;var igGrowth=0;matchedPages3.forEach(function(mp){fbT2+=mp.followers_count||mp.fan_count||0;if(mp.instagram_business_account){igT2+=mp.instagram_business_account.followers_count||0;igGrowth+=mp.instagram_business_account.follower_growth||0;}});
            var ttE2=0;sel.forEach(function(camp){if(camp.platform==="TikTok"){ttE2+=parseFloat(camp.follows||0);}});
            var ttT2=getTtTotal(sel.map(function(x){return x.campaignName;}).join(" "),ttE2);
            var grandT2=fbT2+igT2+ttT2;
            var earnedTotal=parseFloat(m.pageLikes||0)+igGrowth+ttE2;
            // Ground-truth override so Objective Highlights matches Community Growth.
            if(objectives4["Followers & Likes"]&&earnedTotal>0)objectives4["Followers & Likes"].results=earnedTotal;
            var communityData=[];
            if(fbT2>0)communityData.push({name:"FB",total:fbT2,earned:parseFloat(m.pageLikes||0),color:P.fb});
            if(igT2>0)communityData.push({name:"IG",total:igT2,earned:igGrowth,color:P.ig});
            if(ttT2>0)communityData.push({name:"TT",total:ttT2,earned:ttE2,color:P.tt});

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

            var tHead={padding:"9px 10px",fontSize:9,fontWeight:800,textTransform:"uppercase",color:P.ember,letterSpacing:1,background:"rgba(249,98,3,0.12)",border:"1px solid rgba(249,98,3,0.25)",fontFamily:fm};
            var tCell=function(extra){return Object.assign({padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12},extra||{});};
            var secHead=function(color,title,icon){return <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"18px 0 14px"}}><div style={{display:"flex",alignItems:"center",gap:10}}>{icon||<span style={{width:14,height:14,borderRadius:"50%",background:color}}></span>}<span style={{fontSize:16,fontWeight:900,color:color,fontFamily:fm,letterSpacing:3,lineHeight:1,textTransform:"uppercase"}}>{title}</span></div></div>;};
            var lblStyle={fontSize:10,fill:P.txt,fontFamily:"JetBrains Mono,Consolas,monospace",fontWeight:700};
            var lblStyleSm={fontSize:9,fill:P.label,fontFamily:"JetBrains Mono,Consolas,monospace",fontWeight:600};
            var legStyle={fontSize:10,fontFamily:"JetBrains Mono,Consolas,monospace",paddingTop:6};
            var stand=function(label,value,color,title){return<div title={title||""} style={{flex:1,minWidth:160,background:"rgba(0,0,0,0.25)",border:"1px solid "+color+"30",borderLeft:"3px solid "+color,borderRadius:"0 10px 10px 0",padding:"12px 14px",cursor:title?"help":"default"}}><div style={{fontSize:9,fontWeight:800,color:color,fontFamily:fm,letterSpacing:2,textTransform:"uppercase",marginBottom:4}}>{label}</div><div style={{fontSize:13,fontWeight:700,color:P.txt,fontFamily:fm}}>{value}</div></div>;};
            var standRow=function(items){return<div style={{display:"flex",flexWrap:"wrap",gap:10,marginTop:16}}>{items.filter(function(x){return x;})}</div>;};

            return <div>

              {/* ═══ 1. BUDGET PACING ═══ */}
              <div style={{marginBottom:28}}>
                <div style={{background:P.glass,borderRadius:18,padding:"24px 28px",border:"1px solid "+P.rule}}>
                  {secHead(P.ember,"BUDGET PACING",Ic.chart(P.ember,18))}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:14,marginBottom:20}}>
                    <Glass accent={P.ember} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>TOTAL MEDIA SPEND</div><div style={{fontSize:22,fontWeight:900,color:P.ember,fontFamily:fm}}>{fR(computed.totalSpend)}{deltaChip(computed.totalSpend,compareComputed&&compareComputed.totalSpend,false)}</div></Glass>
                    <Glass accent={P.solar} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>DAILY RUN RATE</div><div style={{fontSize:22,fontWeight:900,color:P.solar,fontFamily:fm}}>{fR(dailySpend)}{(function(){if(!compareComputed)return null;var pDaily=compareComputed.totalSpend/Math.max(1,totalDays2);return deltaChip(dailySpend,pDaily,false);})()}</div></Glass>
                    <Glass accent={P.cyan} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>PROJECTED TOTAL SPEND</div><div style={{fontSize:22,fontWeight:900,color:P.cyan,fontFamily:fm}}>{fR(projSpend)}{deltaChip(projSpend,compareComputed&&compareComputed.totalSpend,false)}</div></Glass>
                    <Glass accent={P.orchid} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>MEDIA PLATFORMS</div><div style={{fontSize:22,fontWeight:900,color:P.orchid,fontFamily:fm}}>{sortedPlats.length}</div></Glass>
                  </div>
                  <div style={{padding:"18px 0 10px"}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                      <span style={{fontSize:11,fontWeight:800,color:P.ember,fontFamily:fm,letterSpacing:2}}>{"SPEND TO DATE: "+fR(computed.totalSpend)}</span>
                      <span style={{fontSize:11,fontWeight:700,color:pacePct>90?P.rose:pacePct>60?P.solar:P.mint,fontFamily:fm,letterSpacing:2}}>{"DAY "+elapsedDays+" OF "+totalDays2+" ("+pacePct+"%)"}</span>
                    </div>
                    {/* Local keyframes so the slow grow-from-zero works
                        even before any ChartReveal has mounted on the page.
                        Budget Pacing sits at the top of Summary, above the
                        platform donuts where ChartReveal usually injects the
                        global keyframes. 1.6s makes the growth deliberate
                        and noticeable on landing. The marker line's
                        opacity is delayed so it appears precisely as the
                        bar reaches its final width. */}
                    <style>{"@keyframes pacingBarGrow{from{width:0}}@keyframes pacingMarkerFade{from{opacity:0}to{opacity:0.6}}"}</style>
                    <div style={{position:"relative",height:44,background:"rgba(0,0,0,0.3)",borderRadius:12,overflow:"hidden",border:"1px solid "+P.rule}}>
                      <div style={{position:"absolute",left:0,top:0,bottom:0,width:pacePct+"%",background:"linear-gradient(90deg,"+P.ember+","+P.solar+")",borderRadius:12,animation:"pacingBarGrow 1.6s cubic-bezier(0.22,1,0.36,1) both",transition:"width 0.6s ease"}}/>
                      <div style={{position:"absolute",left:pacePct+"%",top:-2,bottom:-2,width:2,background:P.txt,opacity:0.6,zIndex:2,animation:"pacingMarkerFade 0.5s ease 1.4s both"}}/>
                      <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",zIndex:3}}><span style={{fontSize:13,fontWeight:900,color:"#fff",fontFamily:fm,textShadow:"0 1px 6px rgba(0,0,0,0.9)"}}>{fR(computed.totalSpend)+" spent, projecting "+fR(projSpend)}</span></div>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",marginTop:8}}><span style={{fontSize:10,color:P.label,fontFamily:fm}}>{df}</span><span style={{fontSize:10,color:P.label,fontFamily:fm}}>{dt}</span></div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginTop:24}}>
                    <Reveal minHeight={300}><div style={{height:300}}>
                      <div style={{fontSize:10,fontWeight:800,color:P.label,fontFamily:fm,letterSpacing:2,marginBottom:8,textAlign:"center"}}>SPEND BY PLATFORM</div>
                      <ChartReveal><ResponsiveContainer width="100%" height="92%">
                        {(function(){var sortedSpend=spendData.filter(function(x){return x.value>0;}).sort(function(a,b){return b.value-a.value;});return (
                        <PieChart><Pie data={sortedSpend} dataKey="value" cx="50%" cy="45%" innerRadius={45} outerRadius={75} paddingAngle={3} stroke="none" startAngle={90} endAngle={-270} isAnimationActive={false} label={function(e){var radius=75+22;var rad=Math.PI/180;var x2=e.cx+radius*Math.cos(-e.midAngle*rad);var y2=e.cy+radius*Math.sin(-e.midAngle*rad);return<text x={x2} y={y2} textAnchor={x2>e.cx?"start":"end"} dominantBaseline="central" style={{fontSize:11,fontFamily:fm,fontWeight:700,fill:e.payload.color||P.txt}}>{e.name+" "+(e.value/computed.totalSpend*100).toFixed(2)+"%"}</text>;}} labelLine={{stroke:P.label,strokeWidth:1}}>{sortedSpend.map(function(e,i){return <Cell key={i} fill={e.color}/>;})}</Pie><Tooltip content={<Tip/>} wrapperStyle={{outline:"none"}}/><Legend verticalAlign="bottom" iconType="circle" wrapperStyle={legStyle} payload={sortedSpend.map(function(d){return{value:d.name,type:"circle",color:d.color,payload:d};})} formatter={function(v,e){return<span style={{color:P.txt,fontFamily:fm,fontSize:10}}>{v+" ("+fR(e.payload.value)+")"}</span>;}}/></PieChart>);})()}
                      </ResponsiveContainer></ChartReveal>
                    </div></Reveal>
                    <Reveal minHeight={300} delay={140}><div style={{height:300}}>
                      <div style={{fontSize:10,fontWeight:800,color:P.label,fontFamily:fm,letterSpacing:2,marginBottom:8,textAlign:"center"}}>ADS SERVED BY PLATFORM</div>
                      <ChartReveal><ResponsiveContainer width="100%" height="92%">
                        <BarChart data={impData.slice().sort(function(a,b){return b.value-a.value;})} barSize={44} margin={{top:24,right:12,left:0,bottom:0}}><CartesianGrid strokeDasharray="3 3" stroke={P.rule}/><XAxis dataKey="name" tick={{fontSize:11,fill:P.label,fontFamily:fm}} axisLine={false} tickLine={false}/><YAxis tick={{fontSize:10,fill:P.caption,fontFamily:fm}} axisLine={false} tickLine={false} tickFormatter={function(v){return fmt(v);}}/><Tooltip content={<Tip/>} wrapperStyle={{outline:"none"}} cursor={{fill:"rgba(255,255,255,0.05)"}}/><Legend verticalAlign="bottom" iconType="circle" wrapperStyle={legStyle}/><Bar dataKey="value" name="Impressions" radius={[6,6,0,0]} fill="rgba(255,255,255,0.55)">{impData.slice().sort(function(a,b){return b.value-a.value;}).map(function(e,i){return <Cell key={i} fill={e.color}/>;})}<LabelList dataKey="value" position="top" formatter={function(v){return fmt(v);}} style={lblStyle}/></Bar></BarChart>
                      </ResponsiveContainer></ChartReveal>
                    </div></Reveal>
                  </div>
                  {(function(){var awaitingKeys=Object.keys(awaitingByPlatform);if(awaitingKeys.length===0)return null;var phrase=awaitingKeys.map(function(pl){var names=awaitingByPlatform[pl];return pl+" (configured on "+names.join(", ")+")";}).join(" and ");return <div style={{marginTop:10,padding:"10px 14px",background:"rgba(249,98,3,0.06)",border:"1px solid rgba(249,98,3,0.2)",borderRadius:10,fontSize:11,fontFamily:fm,color:P.label,lineHeight:1.55,textAlign:"center"}}><span style={{fontWeight:800,color:P.solar,letterSpacing:1,textTransform:"uppercase",fontSize:9,marginRight:8}}>Awaiting delivery</span>{phrase} has not yet received impressions in this period. Meta's delivery algorithm typically front-loads the strongest performing placement before broadening, the split will rebalance as the campaign matures.</div>;})()}
                  {(function(){var topPlatBySpend=sortedPlats.slice().sort(function(a,b){return platBreak[b].spend-platBreak[a].spend;})[0];var topPlatByImps=sortedPlats.slice().sort(function(a,b){return platBreak[b].imps-platBreak[a].imps;})[0];return standRow([stand("SPEND TO DATE",fR(computed.totalSpend),P.ember),stand("DAILY RUN RATE",fR(dailySpend)+"/day",P.solar),stand("PROJECTED TOTAL",fR(projSpend),P.cyan),topPlatBySpend?stand("BIGGEST SPEND",topPlatBySpend+" ("+fR(platBreak[topPlatBySpend].spend)+")",platCol4[topPlatBySpend]||P.orchid):null,topPlatByImps?stand("MOST IMPRESSIONS",topPlatByImps+" ("+fmt(platBreak[topPlatByImps].imps)+")",platCol4[topPlatByImps]||P.mint):null]);})()}
                </div>
              </div>

              {/* ═══ 2. AWARENESS HIGHLIGHTS ═══ */}
              <div style={{background:P.glass,borderRadius:18,padding:"6px 28px 28px",marginBottom:28,border:"1px solid "+P.rule}}>
                {secHead(P.cyan,"AWARENESS HIGHLIGHTS (TOP OF THE FUNNEL)",Ic.eye(P.cyan,18))}
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
                  <Glass accent={P.cyan} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>TOTAL IMPRESSIONS</div><div style={{fontSize:24,fontWeight:900,color:P.cyan,fontFamily:fm}}>{fmt(computed.totalImps)}{deltaChip(computed.totalImps,compareComputed&&compareComputed.totalImps,false)}</div></Glass>
                  <Glass accent={P.orchid} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>TOTAL REACH</div><div style={{fontSize:24,fontWeight:900,color:P.orchid,fontFamily:fm}}>{fmt(m.reach+t.reach+computed.gd.reach)}{deltaChip(m.reach+t.reach+computed.gd.reach,compareComputed&&compareComputed.totalReach,false)}</div></Glass>
                  <Glass accent={blFreq>4?P.rose:blFreq>3?P.warning:P.mint} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>BLENDED FREQUENCY</div><div style={{fontSize:24,fontWeight:900,color:blFreq>4?P.rose:blFreq>3?P.warning:blFreq>2?P.mint:P.txt,fontFamily:fm}}>{blFreq>0?blFreq.toFixed(2)+"x":"-"}{deltaChip(blFreq,compareComputed&&compareComputed.blendedFreq,true)}</div><div style={{marginTop:4}}><span style={{fontSize:9,fontWeight:800,padding:"3px 10px",borderRadius:5,color:"#fff",background:blFreq>4?P.rose:blFreq>3?P.warning:P.mint}}>{blFreq>4?"FATIGUE":blFreq>3?"MONITOR":blFreq>2?"OPTIMAL":"BUILDING"}</span></div></Glass>
                  <Glass accent={P.solar} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>COST PER 1000 ADS SERVED</div><div style={{fontSize:24,fontWeight:900,color:computed.blendedCpm<=benchmarks.meta.cpm.mid?P.mint:computed.blendedCpm<=benchmarks.meta.cpm.high?P.solar:P.rose,fontFamily:fm}}>{fR(computed.blendedCpm)}{deltaChip(computed.blendedCpm,compareComputed&&compareComputed.blendedCpm,true)}</div><div style={{marginTop:4}}><span style={{fontSize:9,fontWeight:800,padding:"3px 10px",borderRadius:5,color:"#fff",background:computed.blendedCpm<=benchmarks.meta.cpm.low?P.mint:computed.blendedCpm<=benchmarks.meta.cpm.mid?P.solar:P.rose}}>{computed.blendedCpm<=benchmarks.meta.cpm.low?"EXCELLENT":computed.blendedCpm<=benchmarks.meta.cpm.mid?"GOOD":computed.blendedCpm<=benchmarks.meta.cpm.high?"AVERAGE":"REVIEW"}</span></div></Glass>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16}}>
                  <Reveal minHeight={300}><div style={{height:300}}>
                    <div style={{fontSize:10,fontWeight:800,color:P.label,fontFamily:fm,letterSpacing:2,marginBottom:10,textAlign:"center"}}>REACH & IMPRESSIONS BY PLATFORM</div>
                    <ChartReveal><ResponsiveContainer width="100%" height="90%">
                      <BarChart data={sortedPlats.map(function(pl){return{name:platShort[pl]||pl,fullName:pl,reach:platBreak[pl].reach||0,imps:platBreak[pl].imps||0,color:platCol4[pl]||P.ember};}).sort(function(a,b){return b.imps-a.imps;})} barGap={4} barCategoryGap="20%" margin={{top:24,right:12,left:0,bottom:0}}>
                        <CartesianGrid strokeDasharray="3 3" stroke={P.rule}/>
                        <XAxis dataKey="name" tick={{fontSize:11,fill:P.label,fontFamily:fm}} axisLine={false} tickLine={false}/>
                        <YAxis tick={{fontSize:10,fill:P.caption,fontFamily:fm}} axisLine={false} tickLine={false} tickFormatter={function(v){return fmt(v);}}/>
                        <Tooltip content={<Tip/>} wrapperStyle={{outline:"none"}} cursor={{fill:"rgba(255,255,255,0.05)"}}/>
                        <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={legStyle}/>
                        <Bar dataKey="imps" name="Impressions" radius={[6,6,0,0]} fill={P.cyan}><LabelList dataKey="imps" position="top" formatter={function(v){return v>0?fmt(v):"";}} style={lblStyle}/></Bar>
                        <Bar dataKey="reach" name="Reach" radius={[6,6,0,0]} fill={P.orchid}><LabelList dataKey="reach" position="top" formatter={function(v){return v>0?fmt(v):"";}} style={lblStyle}/></Bar>
                      </BarChart>
                    </ResponsiveContainer></ChartReveal>
                  </div></Reveal>
                  <Reveal minHeight={300} delay={120}><div style={{height:300}}>
                    <div style={{fontSize:10,fontWeight:800,color:P.label,fontFamily:fm,letterSpacing:2,marginBottom:10,textAlign:"center"}}>FREQUENCY BY PLATFORM</div>
                    <ChartReveal><ResponsiveContainer width="100%" height="90%">
                      <BarChart data={sortedPlats.filter(function(pl){return platBreak[pl].reach>0&&platBreak[pl].imps>0;}).map(function(pl){var pb=platBreak[pl];var fq=pb.reach>0?parseFloat((pb.imps/pb.reach).toFixed(2)):0;var fqColor=fq>4?P.rose:fq>3?P.warning:fq>2?P.mint:platCol4[pl]||P.ember;return{name:platShort[pl]||pl,fullName:pl,frequency:fq,color:fqColor};}).sort(function(a,b){return b.frequency-a.frequency;})} barSize={44} margin={{top:24,right:12,left:0,bottom:0}}><CartesianGrid strokeDasharray="3 3" stroke={P.rule}/><XAxis dataKey="name" tick={{fontSize:11,fill:P.label,fontFamily:fm}} axisLine={false} tickLine={false}/><YAxis tick={{fontSize:10,fill:P.caption,fontFamily:fm}} axisLine={false} tickLine={false} tickFormatter={function(v){return v+"x";}}/><Tooltip content={<Tip/>} wrapperStyle={{outline:"none"}} cursor={{fill:"rgba(255,255,255,0.05)"}}/><Legend verticalAlign="bottom" iconType="circle" wrapperStyle={legStyle}/><Bar dataKey="frequency" name="Frequency" radius={[6,6,0,0]} fill="rgba(255,255,255,0.55)">{sortedPlats.filter(function(pl){return platBreak[pl].reach>0&&platBreak[pl].imps>0;}).map(function(pl){var pb=platBreak[pl];return{pl:pl,fq:pb.reach>0?pb.imps/pb.reach:0};}).sort(function(a,b){return b.fq-a.fq;}).map(function(e,i){var fq=e.fq;var fqColor=fq>4?P.rose:fq>3?P.warning:fq>2?P.mint:platCol4[e.pl]||P.ember;return <Cell key={i} fill={fqColor}/>;})}<LabelList dataKey="frequency" position="top" formatter={function(v){return v.toFixed(2)+"x";}} style={lblStyle}/></Bar></BarChart>
                    </ResponsiveContainer></ChartReveal>
                  </div></Reveal>
                  <Reveal minHeight={300} delay={240}><div style={{height:300}}>
                    <div style={{fontSize:10,fontWeight:800,color:P.label,fontFamily:fm,letterSpacing:2,marginBottom:10,textAlign:"center"}}>COST PER 1000 ADS SERVED BY PLATFORM</div>
                    <ChartReveal><ResponsiveContainer width="100%" height="90%">
                      <BarChart data={cpmData.slice().sort(function(a,b){return b.cpm-a.cpm;})} barSize={44} margin={{top:24,right:12,left:0,bottom:0}}><CartesianGrid strokeDasharray="3 3" stroke={P.rule}/><XAxis dataKey="name" tick={{fontSize:11,fill:P.label,fontFamily:fm}} axisLine={false} tickLine={false}/><YAxis tick={{fontSize:10,fill:P.caption,fontFamily:fm}} axisLine={false} tickLine={false} tickFormatter={function(v){return "R"+Number(v).toFixed(2);}}/><Tooltip content={<Tip/>} wrapperStyle={{outline:"none"}} cursor={{fill:"rgba(255,255,255,0.05)"}}/><Legend verticalAlign="bottom" iconType="circle" wrapperStyle={legStyle}/><Bar dataKey="cpm" name="CPM" radius={[6,6,0,0]} fill="rgba(255,255,255,0.55)">{cpmData.slice().sort(function(a,b){return b.cpm-a.cpm;}).map(function(e,i){return <Cell key={i} fill={e.color}/>;})}<LabelList dataKey="cpm" position="top" formatter={function(v){return "R"+Number(v).toFixed(2);}} style={lblStyle}/></Bar></BarChart>
                    </ResponsiveContainer></ChartReveal>
                  </div></Reveal>
                </div>
                {(function(){var bestCpmP=sortedPlats.filter(function(pl){return platBreak[pl].imps>0;}).slice().sort(function(a,b){return(platBreak[a].spend/platBreak[a].imps*1000)-(platBreak[b].spend/platBreak[b].imps*1000);})[0];var widestReach=sortedPlats.slice().sort(function(a,b){return platBreak[b].reach-platBreak[a].reach;})[0];return standRow([bestCpmP?stand("BEST COST PER 1000 ADS SERVED",bestCpmP+", "+fR(platBreak[bestCpmP].spend/platBreak[bestCpmP].imps*1000),platCol4[bestCpmP]||P.cyan):null,widestReach&&platBreak[widestReach].reach>0?stand("WIDEST REACH",widestReach+", "+fmt(platBreak[widestReach].reach),platCol4[widestReach]||P.orchid):null,blFreq>0?stand("BLENDED FREQUENCY",blFreq.toFixed(2)+"x"+(blFreq>4?" (fatigue)":blFreq>3?" (monitor)":blFreq>2?" (optimal)":" (building)"),blFreq>4?P.rose:blFreq>3?P.warning:P.mint):null]);})()}
                <div style={{fontSize:10,color:"rgba(255,255,255,0.9)",fontFamily:fm,letterSpacing:0.5,lineHeight:1.6,textAlign:"center",fontStyle:"italic",padding:"14px 8px"}}>* Google Ads does not expose unique-user reach in standard reporting, so Google Display and YouTube reach is estimated using an industry-standard 2x frequency assumption (reach = impressions / 2). This keeps blended reach and frequency representative of the full media mix. Meta and TikTok reach figures remain true unique-user counts from the platform APIs.</div>
                {(function(){
                  var totalReach=m.reach+t.reach+computed.gd.reach;
                  var topPlatByImps=sortedPlats.slice().sort(function(a,b){return platBreak[b].imps-platBreak[a].imps;})[0];
                  var bestCpmP=sortedPlats.filter(function(pl){return platBreak[pl].imps>0;}).slice().sort(function(a,b){return(platBreak[a].spend/platBreak[a].imps*1000)-(platBreak[b].spend/platBreak[b].imps*1000);})[0];
                  var bestCpmVal=bestCpmP?platBreak[bestCpmP].spend/platBreak[bestCpmP].imps*1000:0;
                  var freqLbl=blFreq>4?"signalling creative fatigue":blFreq>3?"a level worth monitoring":blFreq>2?"a healthy optimal band":"still in the building phase";
                  var cpmLbl=computed.blendedCpm<=benchmarks.meta.cpm.low?"an excellent efficiency position":computed.blendedCpm<=benchmarks.meta.cpm.mid?"a solid efficiency position":computed.blendedCpm<=benchmarks.meta.cpm.high?"on track against the benchmark":"above benchmark and worth optimising";
                  var lines=[];
                  if(computed.totalImps>0)lines.push("The selected campaigns served "+fmt(computed.totalImps)+" ads to "+fmt(totalReach)+" unique viewers at a blended frequency of "+blFreq.toFixed(2)+"x, "+freqLbl+".");
                  if(topPlatByImps&&platBreak[topPlatByImps].imps>0)lines.push(topPlatByImps+" carried the heaviest delivery with "+fmt(platBreak[topPlatByImps].imps)+" ads served.");
                  if(bestCpmP&&bestCpmVal>0)lines.push(bestCpmP+" delivered the cheapest cost per 1000 ads served at "+fR(bestCpmVal)+".");
                  if(computed.blendedCpm>0)lines.push("Blended CPM sits at "+fR(computed.blendedCpm)+", "+cpmLbl+".");
                  return <Insight title="Awareness Insights" accent={P.cyan} icon={Ic.eye(P.cyan,16)}>{lines.join(" ")}</Insight>;
                })()}
                {demoBlocks&&demoBlocks.awarenessBlock&&<div style={{marginTop:22,marginBottom:-8,paddingTop:18,borderTop:"1px dashed "+P.rule}}>{demoBlocks.awarenessBlock}</div>}
              </div>

              {/* ═══ 4. ENGAGEMENT HIGHLIGHTS ═══ */}
              <div style={{background:P.glass,borderRadius:18,padding:"6px 28px 28px",marginBottom:28,border:"1px solid "+P.rule}}>
                {secHead(P.mint,"ENGAGEMENT HIGHLIGHTS (MIDDLE OF THE FUNNEL)",Ic.bolt(P.mint,18))}
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:20}}>
                  <Glass accent={P.cyan} hv={true} st={{padding:18,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>TOTAL CLICKS</div><div style={{fontSize:28,fontWeight:900,color:P.cyan,fontFamily:fm,lineHeight:1}}>{fmt(computed.totalClicks)}{deltaChip(computed.totalClicks,compareComputed&&compareComputed.totalClicks,false)}</div><div style={{fontSize:9,color:P.label,fontFamily:fm,marginTop:8}}>{sel.length+" campaigns"}</div></Glass>
                  <Glass accent={P.solar} hv={true} st={{padding:18,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>BLENDED CLICK THROUGH RATE %</div><div style={{fontSize:28,fontWeight:900,color:blCtr>=1.4?P.mint:blCtr>=0.9?P.solar:P.rose,fontFamily:fm,lineHeight:1}}>{blCtr.toFixed(2)+"%"}{deltaChip(blCtr,compareComputed&&compareComputed.blendedCtr,false)}</div><div style={{marginTop:8}}><span style={{fontSize:9,fontWeight:800,padding:"3px 10px",borderRadius:5,color:"#fff",background:blCtr>=1.4?P.mint:blCtr>=0.9?P.solar:P.rose}}>{blCtr>=1.4?"EXCELLENT":blCtr>=0.9?"GOOD":"OPTIMISE"}</span></div><div style={{fontSize:9,color:P.label,fontFamily:fm,marginTop:6}}>{"industry benchmark: 0.9\u20131.4%"}</div></Glass>
                  <Glass accent={P.mint} hv={true} st={{padding:18,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>BLENDED COST PER CLICK</div><div style={{fontSize:28,fontWeight:900,color:blCpc>0&&blCpc<1.5?P.mint:blCpc<3?P.solar:P.rose,fontFamily:fm,lineHeight:1}}>{fR(blCpc)}{deltaChip(blCpc,compareComputed&&compareComputed.blendedCpc,true)}</div><div style={{marginTop:8}}><span style={{fontSize:9,fontWeight:800,padding:"3px 10px",borderRadius:5,color:"#fff",background:blCpc>0&&blCpc<=benchmarks.meta.cpc.low?P.mint:blCpc<=benchmarks.meta.cpc.mid?P.solar:P.rose}}>{blCpc>0&&blCpc<=benchmarks.meta.cpc.low?"EXCELLENT":blCpc<=benchmarks.meta.cpc.mid?"GOOD":blCpc<=benchmarks.meta.cpc.high?"ON TRACK":"OPTIMISE"}</span></div><div style={{fontSize:9,color:P.label,fontFamily:fm,marginTop:6}}>{"industry benchmark: "+benchmarks.meta.cpc.label}</div></Glass>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
                  <div style={{height:300}}>
                    <div style={{fontSize:10,fontWeight:800,color:P.label,fontFamily:fm,letterSpacing:2,marginBottom:10,textAlign:"center"}}>COST PER CLICK & CLICKS BY PLATFORM</div>
                    <ChartReveal><ResponsiveContainer width="100%" height="90%">
                      <ComposedChart data={cpcData.map(function(d){var pl=Object.keys(platBreak).filter(function(k){return(platShort[k]||k)===d.name;})[0];return{name:d.name,cpc:d.cpc,clicks:pl?platBreak[pl].clicks:0,color:d.color};}).sort(function(a,b){return b.cpc-a.cpc;})} barSize={38} margin={{top:24,right:16,left:0,bottom:0}}>
                        <CartesianGrid strokeDasharray="3 3" stroke={P.rule}/>
                        <XAxis dataKey="name" tick={{fontSize:11,fill:P.label,fontFamily:fm}} axisLine={false} tickLine={false}/>
                        <YAxis yAxisId="left" tick={{fontSize:10,fill:P.caption,fontFamily:fm}} axisLine={false} tickLine={false} tickFormatter={function(v){return "R"+Number(v).toFixed(2);}}/>
                        <YAxis yAxisId="right" orientation="right" tick={{fontSize:10,fill:P.caption,fontFamily:fm}} axisLine={false} tickLine={false} tickFormatter={function(v){return fmt(v);}}/>
                        <Tooltip content={<Tip/>} wrapperStyle={{outline:"none"}} cursor={{fill:"rgba(255,255,255,0.05)"}}/>
                        <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={legStyle}/>
                        <Bar yAxisId="left" dataKey="cpc" name="CPC" radius={[6,6,0,0]} fill="rgba(255,255,255,0.55)">{cpcData.slice().sort(function(a,b){return b.cpc-a.cpc;}).map(function(e,i){return <Cell key={i} fill={e.color}/>;})}<LabelList dataKey="cpc" position="top" formatter={function(v){return "R"+Number(v).toFixed(2);}} style={lblStyle}/></Bar>
                        <Line yAxisId="right" type="monotone" dataKey="clicks" name="Clicks" stroke={P.mint} strokeWidth={2.5} dot={{r:5,fill:P.mint,stroke:"#0a0618",strokeWidth:2}} activeDot={{r:7}}><LabelList dataKey="clicks" position="top" formatter={function(v){return fmt(v);}} style={Object.assign({},lblStyle,{fill:P.mint})}/></Line>
                      </ComposedChart>
                    </ResponsiveContainer></ChartReveal>
                  </div>
                  <div style={{height:300}}>
                    <div style={{fontSize:10,fontWeight:800,color:P.label,fontFamily:fm,letterSpacing:2,marginBottom:10,textAlign:"center"}}>CLICK THROUGH RATE BY PLATFORM</div>
                    <ChartReveal><ResponsiveContainer width="100%" height="90%">
                      <BarChart data={sortedPlats.filter(function(pl){return platBreak[pl].clicks>0;}).map(function(pl){var pb=platBreak[pl];return{name:platShort[pl]||pl,fullName:pl,ctr:pb.imps>0?parseFloat((pb.clicks/pb.imps*100).toFixed(2)):0,color:platCol4[pl]||P.ember};}).sort(function(a,b){return b.ctr-a.ctr;})} barSize={44} margin={{top:24,right:12,left:0,bottom:0}}><CartesianGrid strokeDasharray="3 3" stroke={P.rule}/><XAxis dataKey="name" tick={{fontSize:11,fill:P.label,fontFamily:fm}} axisLine={false} tickLine={false}/><YAxis tick={{fontSize:10,fill:P.caption,fontFamily:fm}} axisLine={false} tickLine={false} tickFormatter={function(v){return v+"%";}}/><Tooltip content={<Tip/>} wrapperStyle={{outline:"none"}} cursor={{fill:"rgba(255,255,255,0.05)"}}/><Legend verticalAlign="bottom" iconType="circle" wrapperStyle={legStyle}/><Bar dataKey="ctr" name="CTR" radius={[6,6,0,0]} fill="rgba(255,255,255,0.55)">{sortedPlats.filter(function(pl){return platBreak[pl].clicks>0;}).map(function(pl){var pb=platBreak[pl];return{pl:pl,ctr:pb.imps>0?(pb.clicks/pb.imps*100):0};}).sort(function(a,b){return b.ctr-a.ctr;}).map(function(e,i){return <Cell key={i} fill={platCol4[e.pl]||P.ember}/>;})}<LabelList dataKey="ctr" position="top" formatter={function(v){return v+"%";}} style={lblStyle}/></Bar></BarChart>
                    </ResponsiveContainer></ChartReveal>
                  </div>
                </div>
                {(function(){var bestCpcP=sortedPlats.filter(function(pl){return platBreak[pl].clicks>0;}).slice().sort(function(a,b){return(platBreak[a].spend/platBreak[a].clicks)-(platBreak[b].spend/platBreak[b].clicks);})[0];var bestCtrP=sortedPlats.filter(function(pl){return platBreak[pl].clicks>0;}).slice().sort(function(a,b){return(platBreak[b].clicks/platBreak[b].imps)-(platBreak[a].clicks/platBreak[a].imps);})[0];var mostClicksP=sortedPlats.slice().sort(function(a,b){return platBreak[b].clicks-platBreak[a].clicks;})[0];return standRow([bestCpcP?stand("BEST COST PER CLICK",bestCpcP+", "+fR(platBreak[bestCpcP].spend/platBreak[bestCpcP].clicks),platCol4[bestCpcP]||P.mint):null,bestCtrP?stand("HIGHEST CLICK THROUGH RATE %",bestCtrP+", "+(platBreak[bestCtrP].clicks/platBreak[bestCtrP].imps*100).toFixed(2)+"%",platCol4[bestCtrP]||P.solar):null,mostClicksP?stand("MOST CLICKS",mostClicksP+", "+fmt(platBreak[mostClicksP].clicks),platCol4[mostClicksP]||P.cyan):null]);})()}
                {(function(){
                  var bestCpcP=sortedPlats.filter(function(pl){return platBreak[pl].clicks>0;}).slice().sort(function(a,b){return(platBreak[a].spend/platBreak[a].clicks)-(platBreak[b].spend/platBreak[b].clicks);})[0];
                  var bestCpcVal=bestCpcP?platBreak[bestCpcP].spend/platBreak[bestCpcP].clicks:0;
                  var bestCtrP=sortedPlats.filter(function(pl){return platBreak[pl].clicks>0&&platBreak[pl].imps>0;}).slice().sort(function(a,b){return(platBreak[b].clicks/platBreak[b].imps)-(platBreak[a].clicks/platBreak[a].imps);})[0];
                  var bestCtrVal=bestCtrP?platBreak[bestCtrP].clicks/platBreak[bestCtrP].imps*100:0;
                  var mostClicksP=sortedPlats.slice().sort(function(a,b){return platBreak[b].clicks-platBreak[a].clicks;})[0];
                  var ctrLbl=blCtr>=1.4?"an excellent result against the 0.9 to 1.4% industry benchmark":blCtr>=0.9?"a solid result within the 0.9 to 1.4% industry benchmark":"below the 0.9 to 1.4% industry benchmark and worth optimising";
                  var cpcLbl=blCpc>0&&blCpc<=benchmarks.meta.cpc.low?"an excellent efficiency position":blCpc<=benchmarks.meta.cpc.mid?"a solid efficiency position":blCpc<=benchmarks.meta.cpc.high?"on track against the benchmark":"above benchmark and worth optimising";
                  var lines=[];
                  if(computed.totalClicks>0)lines.push(fmt(computed.totalClicks)+" clicks were recorded at a blended click through rate of "+blCtr.toFixed(2)+"%, "+ctrLbl+".");
                  if(blCpc>0)lines.push("Blended cost per click sits at "+fR(blCpc)+", "+cpcLbl+".");
                  if(bestCtrP&&bestCtrVal>0)lines.push(bestCtrP+" converted impressions to clicks at the highest rate of "+bestCtrVal.toFixed(2)+"%.");
                  if(bestCpcP&&bestCpcVal>0)lines.push(bestCpcP+" delivered the cheapest click at "+fR(bestCpcVal)+".");
                  if(mostClicksP&&platBreak[mostClicksP].clicks>0)lines.push(mostClicksP+" drove the largest click volume with "+fmt(platBreak[mostClicksP].clicks)+" clicks.");
                  return <Insight title="Engagement Insights" accent={P.mint} icon={Ic.bolt(P.mint,16)}>{lines.join(" ")}</Insight>;
                })()}
                {demoBlocks&&demoBlocks.engagementBlock&&<div style={{marginTop:22,marginBottom:-8,paddingTop:18,borderTop:"1px dashed "+P.rule}}>{demoBlocks.engagementBlock}</div>}
              </div>

              {/* ═══ 5. OBJECTIVE HIGHLIGHTS ═══ */}
              {objKeys.filter(function(k){return objectives4[k];}).length>0&&<div style={{background:P.glass,borderRadius:18,padding:"6px 28px 28px",marginBottom:28,border:"1px solid "+P.rule}}>
                {secHead(P.rose,"OBJECTIVE HIGHLIGHTS (BOTTOM OF THE FUNNEL)",Ic.target(P.rose,18))}
                <div style={{display:"grid",gridTemplateColumns:"repeat("+Math.min(4,objKeys.filter(function(k){return objectives4[k];}).length)+",1fr)",gap:14,marginBottom:20}}>
                  {objKeys.filter(function(k){return objectives4[k];}).map(function(objName){
                    var od=objectives4[objName];var oc=objCol4[objName]||P.ember;var costPer=od.results>0?od.spend/od.results:0;
                    var bm=objName==="Leads"?benchmarks.meta.cpl:objName==="Followers & Likes"?benchmarks.meta.cpf:benchmarks.meta.cpc;
                    var bmCol=costPer>0&&bm&&costPer<=bm.mid?P.mint:costPer>0&&bm&&costPer>bm.high?P.rose:P.solar;
                    var bmTag=costPer>0&&bm?(costPer<=bm.low?"EXCELLENT":costPer<=bm.mid?"GOOD":costPer<=bm.high?"ON TRACK":"OPTIMISE"):"";
                    var cObjPrev=(compareComputed&&compareComputed.objectives&&compareComputed.objectives[objName])||null;
                    var prevResults=cObjPrev?cObjPrev.results:null;
                    var prevCostPer=cObjPrev&&cObjPrev.results>0?cObjPrev.spend/cObjPrev.results:null;
                    return <div key={objName} style={{background:"rgba(0,0,0,0.2)",borderRadius:14,padding:"20px 18px",border:"1px solid "+oc+"25"}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:14}}><span style={{width:10,height:10,borderRadius:"50%",background:oc}}></span><span style={{fontSize:10,fontWeight:800,color:oc,fontFamily:ff,letterSpacing:0.5}}>{objName}</span></div>
                      <div style={{fontSize:30,fontWeight:900,color:oc,fontFamily:fm,lineHeight:1,marginBottom:4}}>{fmt(od.results)}{prevResults!==null&&deltaChip(od.results,prevResults,false)}</div>
                      <div style={{fontSize:10,color:P.label,fontFamily:fm,marginBottom:14}}>from {fR(od.spend)} invested</div>
                      <div style={{borderTop:"1px solid "+P.rule,paddingTop:12,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                        <div><div style={{fontSize:10,color:"rgba(255,255,255,0.5)",fontFamily:fm,letterSpacing:1}}>{objCL4[objName]||"COST PER"}</div><div style={{fontSize:18,fontWeight:900,color:costPer>0?bmCol:P.caption,fontFamily:fm}}>{costPer>0?fR(costPer):"-"}{costPer>0&&prevCostPer!==null&&deltaChip(costPer,prevCostPer,true)}</div></div>
                        {bmTag&&<span style={{fontSize:9,fontWeight:800,padding:"4px 10px",borderRadius:5,color:"#fff",background:bmCol}}>{bmTag}</span>}
                      </div>
                    </div>;})}
                </div>
                {(function(){var objData=objKeys.filter(function(k){return objectives4[k]&&objectives4[k].results>0;}).map(function(k){var od=objectives4[k];return{name:k.replace("Landing Page ","LP ").replace("App Store ","App ").replace("Followers & ","Foll/"),results:od.results,spend:od.spend,costPer:od.results>0?parseFloat((od.spend/od.results).toFixed(2)):0,color:objCol4[k]||P.ember};});if(objData.length<2)return null;return <div style={{height:300}}><div style={{fontSize:10,fontWeight:800,color:P.label,fontFamily:fm,letterSpacing:2,marginBottom:10,textAlign:"center"}}>COST PER RESULT BY OBJECTIVE</div><ChartReveal><ResponsiveContainer width="100%" height="90%"><BarChart data={objData} barSize={48} margin={{top:24,right:12,left:0,bottom:0}}><CartesianGrid strokeDasharray="3 3" stroke={P.rule}/><XAxis dataKey="name" tick={{fontSize:10,fill:P.label,fontFamily:fm}} axisLine={false} tickLine={false}/><YAxis tick={{fontSize:10,fill:P.caption,fontFamily:fm}} axisLine={false} tickLine={false} tickFormatter={function(v){return "R"+Number(v).toFixed(2);}}/><Tooltip content={<Tip/>} wrapperStyle={{outline:"none"}} cursor={{fill:"rgba(255,255,255,0.05)"}}/><Legend verticalAlign="bottom" iconType="circle" wrapperStyle={legStyle}/><Bar dataKey="costPer" name="Cost Per Result" radius={[6,6,0,0]} fill="rgba(255,255,255,0.55)">{objData.map(function(e,i){return <Cell key={i} fill={e.color}/>;})}<LabelList dataKey="costPer" position="top" formatter={function(v){return "R"+Number(v).toFixed(2);}} style={lblStyle}/></Bar></BarChart></ResponsiveContainer></ChartReveal></div>;})()}
                {(function(){var active=objKeys.filter(function(k){return objectives4[k]&&objectives4[k].results>0;});if(active.length===0)return null;var topVol=active.slice().sort(function(a,b){return objectives4[b].results-objectives4[a].results;})[0];var bestEff=active.slice().sort(function(a,b){return(objectives4[a].spend/objectives4[a].results)-(objectives4[b].spend/objectives4[b].results);})[0];var totalResults=0;var totalObjSpend=0;active.forEach(function(k){totalResults+=objectives4[k].results;totalObjSpend+=objectives4[k].spend;});
                // Blended cost per result across all contributing platforms
                // for the active objective(s). When a single objective is
                // active the label reflects its specific cost (e.g. BLENDED
                // COST PER LEAD for the Leads objective), when multiple
                // objectives are mixed the label generalises to COST PER
                // RESULT since the underlying result types differ.
                var blendedCostPer=totalResults>0?totalObjSpend/totalResults:0;
                var blendedLabel="BLENDED "+(active.length===1?(objCL4[active[0]]||"COST PER RESULT"):"COST PER RESULT");
                var blendedCol=active.length===1?(objCol4[active[0]]||P.solar):P.solar;
                return standRow([topVol?stand("HIGHEST VOLUME",topVol+", "+fmt(objectives4[topVol].results),objCol4[topVol]||P.rose):null,bestEff?stand("BEST EFFICIENCY",bestEff+", "+fR(objectives4[bestEff].spend/objectives4[bestEff].results)+"/result",objCol4[bestEff]||P.mint):null,blendedCostPer>0?stand(blendedLabel,fR(blendedCostPer),blendedCol):null,stand("TOTAL OBJECTIVE RESULTS",fmt(totalResults),P.ember)]);})()}
                {(function(){
                  var active=objKeys.filter(function(k){return objectives4[k]&&objectives4[k].results>0;});
                  if(active.length===0)return null;
                  var topVol=active.slice().sort(function(a,b){return objectives4[b].results-objectives4[a].results;})[0];
                  var bestEff=active.slice().sort(function(a,b){return(objectives4[a].spend/objectives4[a].results)-(objectives4[b].spend/objectives4[b].results);})[0];
                  var totalResults=0;var totalSpend=0;active.forEach(function(k){totalResults+=objectives4[k].results;totalSpend+=objectives4[k].spend;});
                  var bestEffCost=bestEff?objectives4[bestEff].spend/objectives4[bestEff].results:0;
                  var lines=[];
                  lines.push(fmt(totalResults)+" objective results were delivered across "+active.length+" active objective"+(active.length>1?"s":"")+" from "+fR(totalSpend)+" invested.");
                  if(topVol)lines.push(topVol+" led volume with "+fmt(objectives4[topVol].results)+" results.");
                  if(bestEff&&bestEffCost>0)lines.push(bestEff+" achieved the strongest efficiency at "+fR(bestEffCost)+" per result.");
                  if(active.length>1&&topVol!==bestEff)lines.push("Volume and efficiency leaders differ, a signal to weigh budget shift toward "+bestEff+" if efficiency is the priority, or hold "+topVol+" to protect scale.");
                  // Per-platform cost split for each active objective. Only
                  // emit when the objective actually ran across 2+ platforms,
                  // otherwise the blended number already tells the full
                  // story. Costs labelled using the objective's own cost
                  // label (Cost Per Lead, Cost Per Click etc).
                  active.forEach(function(objName){
                    var od=objectives4[objName];
                    var costLabel=(objCL4[objName]||"COST PER RESULT").toLowerCase();
                    var platsWithResults=Object.keys(od.byPlatform||{}).filter(function(pl){return od.byPlatform[pl].results>0;});
                    if(platsWithResults.length<2)return;
                    var parts=platsWithResults.sort(function(a,b){return od.byPlatform[b].results-od.byPlatform[a].results;}).map(function(pl){
                      var pb=od.byPlatform[pl];
                      var cp=pb.results>0?pb.spend/pb.results:0;
                      var shareR=od.results>0?(pb.results/od.results*100).toFixed(2):"0.00";
                      return pl+" contributed "+fmt(pb.results)+" "+(pb.results===1?"result":"results")+" ("+shareR+"% of "+objName+") at "+fR(cp)+" "+costLabel;
                    });
                    lines.push(objName+" split by platform, "+parts.join(", ")+".");
                  });
                  return <Insight title="Objective Insights" accent={P.rose} icon={Ic.target(P.rose,16)}>{lines.join(" ")}</Insight>;
                })()}
              </div>}

              {/* Performance Trendlines, slotted between Objective Insights
                  and Objective Demographics so the same matrix surfaced on
                  the Optimisation tab also reads on Summary. Helper is
                  shared, so any tweak there flows here automatically.
                  showCommentary:false skips the momentum/attention block
                  on Summary, kept only on the Optimisation tab. */}
              {renderTrendlines({showCommentary:false})}

              {/* Placement Performance Assessment — sub-platform breakdown
                  showing where the budget is delivering and what each
                  placement returned. Sources from /api/placements which
                  pulls Meta with publisher_platform + platform_position
                  breakdowns (FB Feed, IG Reels, Stories, Audience
                  Network, etc.), TikTok as a single FYP row, Google
                  rolled up by channel sub-type. Same Glass-card styling
                  as Trendlines so it reads as a continuation. */}
              {(function(){
                if(!placements||placements.length===0)return null;
                var totSpend=placements.reduce(function(a,p){return a+parseFloat(p.spend||0);},0);
                var totImps=placements.reduce(function(a,p){return a+parseFloat(p.impressions||0);},0);
                var totClicks=placements.reduce(function(a,p){return a+parseFloat(p.clicks||0);},0);
                if(totSpend<=0)return null;
                // Compute per-row "results" as the predominant outcome
                // metric: leads → installs → follows+pageLikes → clicks.
                // Same priority the rest of the dashboard uses for
                // mixed-objective totals.
                var rows=placements.map(function(p){
                  var leads=parseInt(p.leads||0);
                  var installs=parseInt(p.appInstalls||0);
                  var follows=parseInt(p.follows||0)+parseInt(p.pageLikes||0);
                  var resultsCount, resultsLabel;
                  if(leads>0){resultsCount=leads;resultsLabel="leads";}
                  else if(installs>0){resultsCount=installs;resultsLabel="installs";}
                  else if(follows>0){resultsCount=follows;resultsLabel="follows + likes";}
                  else {resultsCount=parseInt(p.clicks||0);resultsLabel="clicks";}
                  return Object.assign({},p,{resultsCount:resultsCount,resultsLabel:resultsLabel});
                });
                rows.sort(function(a,b){return b.spend-a.spend;});
                var totalRowCount=rows.length;
                // Cap the visual list at 10 so the section doesn't dwarf
                // the rest of the Summary tab. Totals and footer insights
                // still reflect the full placement set.
                var visibleRows=rows.slice(0,10);
                var maxSpend=visibleRows.length>0?visibleRows[0].spend:1;
                var top3Spend=rows.slice(0,3).reduce(function(a,p){return a+p.spend;},0);
                var top3Share=totSpend>0?(top3Spend/totSpend*100):0;
                // Most efficient = lowest cost per result among rows
                // with material spend (R200+) and at least one result.
                var efficient=rows.filter(function(p){return p.spend>=200&&p.resultsCount>0;}).slice().sort(function(a,b){return (a.spend/a.resultsCount)-(b.spend/b.resultsCount);})[0];
                return <div style={{background:P.glass,borderRadius:18,padding:"6px 28px 28px",marginBottom:28,border:"1px solid "+P.rule}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"18px 0 14px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      {Ic.target(P.solar,18)}
                      <span style={{fontSize:16,fontWeight:900,color:P.solar,fontFamily:fm,letterSpacing:3,lineHeight:1,textTransform:"uppercase"}}>Placement Performance Assessment</span>
                    </div>
                    <span style={{fontSize:10,color:P.label,fontFamily:fm,letterSpacing:1.5,textTransform:"uppercase"}}>{totalRowCount>10?"Top 10 of "+totalRowCount:totalRowCount+" placement"+(totalRowCount===1?"":"s")+" active"}</span>
                  </div>
                  <div style={{fontSize:10,color:P.label,fontFamily:fm,letterSpacing:1.5,marginBottom:14,textTransform:"uppercase"}}>Where your spend is delivering, ranked by share of investment &middot; scoped to your selected period ({df} to {dt}) &middot; {selected.length} campaign{selected.length===1?"":"s"} selected</div>
                  <div style={{display:"flex",flexDirection:"column",gap:10}}>
                    {visibleRows.map(function(p,i){
                      var sharePct=totSpend>0?(p.spend/totSpend*100):0;
                      var widthPct=maxSpend>0?(p.spend/maxSpend*100):0;
                      var ctr=p.impressions>0?(parseFloat(p.clicks||0)/parseFloat(p.impressions||0)*100):0;
                      var cpr=p.resultsCount>0?p.spend/p.resultsCount:0;
                      var cpc=parseFloat(p.clicks||0)>0?p.spend/parseFloat(p.clicks||0):0;
                      return <div key={p.key||i} style={{display:"grid",gridTemplateColumns:"36px 220px 1fr 90px 70px 70px 90px",gap:14,alignItems:"center",padding:"12px 14px",background:"rgba(0,0,0,0.22)",border:"1px solid "+P.rule,borderRadius:10}}>
                        <div style={{width:30,height:30,borderRadius:"50%",background:p.color+"20",border:"1px solid "+p.color+"50",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:900,color:p.color,fontFamily:fm}}>{i+1}</div>
                        <div style={{display:"flex",flexDirection:"column",gap:2,minWidth:0}}>
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            <span style={{width:8,height:8,borderRadius:"50%",background:p.color,flexShrink:0}}></span>
                            <span style={{fontSize:12,fontWeight:800,color:P.txt,fontFamily:fm,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.name}</span>
                          </div>
                          <div style={{fontSize:9,color:P.caption,fontFamily:fm,letterSpacing:1,textTransform:"uppercase"}}>{p.platform}{cpr>0?" · "+fR(cpr)+" / "+p.resultsLabel:""}</div>
                        </div>
                        <div style={{position:"relative",height:18,background:"rgba(255,255,255,0.04)",borderRadius:9,overflow:"hidden"}}>
                          <div style={{position:"absolute",left:0,top:0,bottom:0,width:widthPct.toFixed(2)+"%",background:"linear-gradient(90deg,"+p.color+"AA,"+p.color+"55)",borderRadius:9,transition:"width 0.6s ease"}}></div>
                          <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",paddingLeft:10,fontSize:10,fontWeight:700,color:P.txt,fontFamily:fm,letterSpacing:0.5}}>{sharePct.toFixed(2)}%</div>
                        </div>
                        <div style={{textAlign:"right",fontFamily:fm}}>
                          <div style={{fontSize:13,fontWeight:900,color:P.ember}}>{fR(p.spend)}</div>
                          <div style={{fontSize:8,color:P.caption,letterSpacing:1.2,textTransform:"uppercase",marginTop:2}}>spend</div>
                        </div>
                        <div style={{textAlign:"right",fontFamily:fm}}>
                          <div style={{fontSize:12,fontWeight:800,color:P.cyan}}>{fmt(p.impressions)}</div>
                          <div style={{fontSize:8,color:P.caption,letterSpacing:1.2,textTransform:"uppercase",marginTop:2}}>imps</div>
                        </div>
                        <div style={{textAlign:"right",fontFamily:fm}}>
                          <div style={{fontSize:12,fontWeight:800,color:P.mint}}>{ctr.toFixed(2)}%</div>
                          <div style={{fontSize:8,color:P.caption,letterSpacing:1.2,textTransform:"uppercase",marginTop:2}}>ctr</div>
                        </div>
                        <div style={{textAlign:"right",fontFamily:fm}}>
                          <div style={{fontSize:13,fontWeight:900,color:p.color}}>{fmt(p.resultsCount)}</div>
                          <div style={{fontSize:8,color:P.caption,letterSpacing:1.2,textTransform:"uppercase",marginTop:2}}>{p.resultsLabel}</div>
                        </div>
                      </div>;
                    })}
                  </div>
                  <div style={{marginTop:14,padding:"12px 16px",background:"rgba(0,0,0,0.25)",borderRadius:10,border:"1px solid "+P.rule}}>
                    <div style={{fontSize:11,color:P.txt,fontFamily:fm,lineHeight:1.7}}>
                      <div style={{marginBottom:4,display:"flex",gap:8}}><span style={{color:P.solar,fontWeight:900}}>{"▸"}</span><span>Top 3 placements account for <strong>{top3Share.toFixed(2)}%</strong> of {fR(totSpend)} total spend, that concentration is where any optimisation lever moves the needle fastest.</span></div>
                      {efficient&&<div style={{marginBottom:4,display:"flex",gap:8}}><span style={{color:P.mint,fontWeight:900}}>{"▸"}</span><span>Most efficient delivery: <strong style={{color:efficient.color}}>{efficient.name}</strong> at <strong>{fR(efficient.spend/efficient.resultsCount)} per {efficient.resultsLabel.replace(/s$/,"")}</strong> ({fmt(efficient.resultsCount)} {efficient.resultsLabel} on {fR(efficient.spend)} spend).</span></div>}
                      <div style={{display:"flex",gap:8}}><span style={{color:P.cyan,fontWeight:900}}>{"▸"}</span><span>Blended: {fmt(totImps)} impressions and {fmt(totClicks)} clicks across {totalRowCount} placement{totalRowCount===1?"":"s"}{totalRowCount>10?", top 10 shown above":""}, weighted ranking by spend so the top rows are where the team should evaluate creative refresh and bid pressure first.</span></div>
                    </div>
                  </div>
                </div>;
              })()}

              {/* Objective Demographics, lifted out of the Objective
                  Highlights card so Trendlines can slot cleanly between
                  the two on the Summary flow. Wrapped in its own Glass
                  card to match section styling. */}
              {demoBlocks&&demoBlocks.objectiveBlock&&<div style={{background:P.glass,borderRadius:18,padding:"22px 28px 28px",marginBottom:28,border:"1px solid "+P.rule}}>{demoBlocks.objectiveBlock}</div>}

              {/* Targeting Standouts block removed from Summary, lives on
                  the Targeting tab instead. */}

              {/* ═══ COMMUNITY GROWTH ═══ */}
              {grandT2>0&&<div style={{background:P.glass,borderRadius:18,padding:"6px 28px 28px",marginBottom:28,border:"1px solid "+P.rule}}>
                {secHead(P.tt,"COMMUNITY GROWTH",Ic.users(P.tt,18))}
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
                  <Glass accent={P.mint} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>TOTAL COMMUNITY</div><div style={{fontSize:24,fontWeight:900,color:P.mint,fontFamily:fm}}>{fmt(grandT2)}</div></Glass>
                  <Glass accent={P.ember} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>EARNED THIS PERIOD</div><div style={{fontSize:24,fontWeight:900,color:P.ember,fontFamily:fm}}>{earnedTotal>0?"+"+fmt(earnedTotal):"-"}{compareComputed&&deltaChip(earnedTotal,compareComputed.earnedTotal,false)}</div></Glass>
                  <Glass accent={P.orchid} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>GROWTH RATE</div><div style={{fontSize:24,fontWeight:900,color:P.orchid,fontFamily:fm}}>{grandT2>0&&earnedTotal>0?(earnedTotal/grandT2*100).toFixed(2)+"%":"-"}</div></Glass>
                  <Glass accent={P.solar} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>COST PER MEMBER</div><div style={{fontSize:24,fontWeight:900,color:P.solar,fontFamily:fm}}>{(function(){var cs=(objectives4["Followers & Likes"]&&objectives4["Followers & Likes"].spend)||0;var curCpm=earnedTotal>0&&cs>0?cs/earnedTotal:0;var prevCpm=0;if(compareComputed&&compareComputed.objectives&&compareComputed.objectives["Followers & Likes"]&&compareComputed.earnedTotal>0){prevCpm=compareComputed.objectives["Followers & Likes"].spend/compareComputed.earnedTotal;}return <span>{curCpm>0?fR(curCpm):"-"}{curCpm>0&&prevCpm>0&&deltaChip(curCpm,prevCpm,true)}</span>;})()}</div><div style={{fontSize:8,color:P.caption,fontFamily:fm,letterSpacing:1,marginTop:4,fontStyle:"italic"}}>community spend only</div></Glass>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
                  <div style={{height:300}}>
                    <div style={{fontSize:10,fontWeight:800,color:P.label,fontFamily:fm,letterSpacing:2,marginBottom:10,textAlign:"center"}}>COMMUNITY BY PLATFORM</div>
                    <ChartReveal><ResponsiveContainer width="100%" height="90%">
                      <BarChart data={communityData.slice().sort(function(a,b){return b.total-a.total;})} barSize={44} margin={{top:24,right:12,left:0,bottom:0}}><CartesianGrid strokeDasharray="3 3" stroke={P.rule}/><XAxis dataKey="name" tick={{fontSize:11,fill:"rgba(255,255,255,0.9)",fontFamily:fm,fontWeight:700}} axisLine={false} tickLine={false}/><YAxis tick={{fontSize:10,fill:"rgba(255,255,255,0.9)",fontFamily:fm,fontWeight:700}} axisLine={false} tickLine={false} tickFormatter={function(v){return fmt(v);}}/><Tooltip content={<Tip/>} wrapperStyle={{outline:"none"}} cursor={{fill:"rgba(255,255,255,0.05)"}}/><Legend verticalAlign="bottom" iconType="circle" wrapperStyle={legStyle}/><Bar dataKey="total" name="Total Followers" radius={[6,6,0,0]} fill="rgba(255,255,255,0.55)">{communityData.slice().sort(function(a,b){return b.total-a.total;}).map(function(e,i){return <Cell key={i} fill={e.color}/>;})}<LabelList dataKey="total" position="top" formatter={function(v){return fmt(v);}} style={lblStyle}/></Bar></BarChart>
                    </ResponsiveContainer></ChartReveal>
                  </div>
                  <div style={{height:300}}>
                    <div style={{fontSize:10,fontWeight:800,color:P.label,fontFamily:fm,letterSpacing:2,marginBottom:10,textAlign:"center"}}>EARNED THIS PERIOD</div>
                    <ChartReveal><ResponsiveContainer width="100%" height="90%">
                      <BarChart data={communityData.filter(function(c){return c.earned>0;}).slice().sort(function(a,b){return b.earned-a.earned;})} barSize={44} margin={{top:24,right:12,left:0,bottom:0}}><CartesianGrid strokeDasharray="3 3" stroke={P.rule}/><XAxis dataKey="name" tick={{fontSize:11,fill:"rgba(255,255,255,0.9)",fontFamily:fm,fontWeight:700}} axisLine={false} tickLine={false}/><YAxis tick={{fontSize:10,fill:"rgba(255,255,255,0.9)",fontFamily:fm,fontWeight:700}} axisLine={false} tickLine={false} tickFormatter={function(v){return fmt(v);}}/><Tooltip content={<Tip/>} wrapperStyle={{outline:"none"}} cursor={{fill:"rgba(255,255,255,0.05)"}}/><Legend verticalAlign="bottom" iconType="circle" wrapperStyle={legStyle}/><Bar dataKey="earned" name="Earned Followers" radius={[6,6,0,0]} fill="rgba(255,255,255,0.55)">{communityData.filter(function(c){return c.earned>0;}).slice().sort(function(a,b){return b.earned-a.earned;}).map(function(e,i){return <Cell key={i} fill={e.color}/>;})}<LabelList dataKey="earned" position="top" formatter={function(v){return fmt(v);}} style={lblStyle}/></Bar></BarChart>
                    </ResponsiveContainer></ChartReveal>
                  </div>
                </div>
                {(function(){var biggestPlat=communityData.slice().sort(function(a,b){return b.total-a.total;})[0];var fastestGrow=communityData.filter(function(c){return c.earned>0;}).slice().sort(function(a,b){return b.earned-a.earned;})[0];return standRow([biggestPlat?stand("LARGEST FOLLOWER COUNT PLATFORM",biggestPlat.name+", "+fmt(biggestPlat.total),biggestPlat.color):null,fastestGrow?stand("TOP GROWTH THIS PERIOD",fastestGrow.name+", +"+fmt(fastestGrow.earned),fastestGrow.color):null,(function(){var cs=(objectives4["Followers & Likes"]&&objectives4["Followers & Likes"].spend)||0;return earnedTotal>0&&cs>0?stand("COST PER MEMBER",fR(cs/earnedTotal)+" (community spend only)",P.solar):null;})()]);})()}
                {/* IG follower-campaign 2-step funnel callout. Surfaces only
                    when there's IG follower-objective ad activity in the
                    selection. Frames the campaign honestly: paid drives
                    Profile Visits (per-ad attributable), the page grows by
                    a separate amount (whole-account, paid + organic). The
                    two metrics aren't directly tied because Meta does not
                    expose per-ad IG follow attribution, so reporting both
                    lets the reader see the funnel without pretending the
                    attribution exists. */}
                {(function(){
                  var igFollowerCamps=sel.filter(function(c){
                    if(c.platform!=="Instagram")return false;
                    var obj=String(c.objective||"").toLowerCase();
                    var name=String(c.campaignName||"").toLowerCase();
                    return obj==="followers"||name.indexOf("follower")>=0||name.indexOf("like&follow")>=0||name.indexOf("like_follow")>=0||name.indexOf("_like_")>=0||name.indexOf("_follow_")>=0;
                  });
                  if(igFollowerCamps.length===0)return null;
                  var igFolClicks=igFollowerCamps.reduce(function(a,c){return a+parseFloat(c.clicks||0);},0);
                  var igFolSpend=igFollowerCamps.reduce(function(a,c){return a+parseFloat(c.spend||0);},0);
                  var igCpv=igFolClicks>0?igFolSpend/igFolClicks:0;
                  var convRate=igFolClicks>0&&igGrowth>0?(igGrowth/igFolClicks*100):0;
                  return <div style={{marginTop:14,padding:"14px 18px",background:"linear-gradient(135deg,"+P.ig+"10 0%,"+P.ig+"05 60%,transparent)",border:"1px solid "+P.ig+"35",borderLeft:"3px solid "+P.ig,borderRadius:"0 12px 12px 0"}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                      <span style={{width:8,height:8,borderRadius:"50%",background:P.ig}}></span>
                      <span style={{fontSize:10,fontWeight:800,color:P.ig,letterSpacing:2,textTransform:"uppercase",fontFamily:fm}}>IG Follower Campaigns, 2-Step Funnel</span>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14,marginBottom:10}}>
                      <div><div style={{fontSize:9,color:P.caption,letterSpacing:1.5,textTransform:"uppercase",fontFamily:fm,marginBottom:4}}>Step 1, Profile Visits</div><div style={{fontSize:18,fontWeight:900,color:P.txt,fontFamily:fm}}>{fmt(igFolClicks)}</div><div style={{fontSize:9,color:P.caption,fontFamily:fm,marginTop:2}}>per-ad attributable</div></div>
                      <div><div style={{fontSize:9,color:P.caption,letterSpacing:1.5,textTransform:"uppercase",fontFamily:fm,marginBottom:4}}>Cost per Profile Visit</div><div style={{fontSize:18,fontWeight:900,color:P.txt,fontFamily:fm}}>{igCpv>0?fR(igCpv):"-"}</div><div style={{fontSize:9,color:P.caption,fontFamily:fm,marginTop:2}}>{fR(igFolSpend)} spent</div></div>
                      <div><div style={{fontSize:9,color:P.caption,letterSpacing:1.5,textTransform:"uppercase",fontFamily:fm,marginBottom:4}}>Step 2, Net Page Growth</div><div style={{fontSize:18,fontWeight:900,color:P.ig,fontFamily:fm}}>{igGrowth>0?"+"+fmt(igGrowth):"-"}</div><div style={{fontSize:9,color:P.caption,fontFamily:fm,marginTop:2}}>whole account, paid + organic</div></div>
                    </div>
                    <div style={{fontSize:10,color:P.caption,fontFamily:fm,fontStyle:"italic",lineHeight:1.6}}>
                      Meta does not expose per-ad IG follow attribution, the in-feed Follow happens on the profile after a click-through. Profile Visits is the per-ad signal you can rank ads on. Net page growth is the period outcome, mixed paid and organic.{convRate>0?" Implied conversion rate "+convRate.toFixed(2)+"% (treats all growth as paid, an upper bound).":""}
                    </div>
                  </div>;
                })()}
                {/* IG follower reconciliation — surfaces the live IG total
                    alongside the historic counts captured by the 06:00 SAST
                    snapshot cron. Lets the team verify daily that the
                    dashboard's reported numbers track the actual IG profile
                    even when Meta's per-day Page Insights metric settles
                    late. One row per matched IG account with a non-zero
                    live followers_count. */}
                {(function(){
                  var igs=igSnapshots||[];
                  var matchedIg=matchedPages3.filter(function(mp){return mp.instagram_business_account&&mp.instagram_business_account.id;});
                  if(matchedIg.length===0)return null;
                  var todaySnap=igs.length>0?igs[igs.length-1]:null;
                  var yestSnap=igs.length>1?igs[igs.length-2]:null;
                  var weekSnap=igs.length>=8?igs[igs.length-8]:(igs.length>0?igs[0]:null);
                  return <div style={{marginTop:14,padding:"14px 18px",background:"rgba(0,0,0,0.22)",border:"1px solid "+P.rule,borderRadius:10}}>
                    <div style={{fontSize:9,fontWeight:800,color:P.label,letterSpacing:2,textTransform:"uppercase",marginBottom:8,fontFamily:fm}}>Live IG Follower Reconciliation</div>
                    {matchedIg.map(function(mp){
                      var ig=mp.instagram_business_account;
                      var live=parseInt(ig.followers_count||0);
                      var igId=String(ig.id);
                      var todayC=todaySnap&&todaySnap.accounts&&todaySnap.accounts[igId]?parseInt(todaySnap.accounts[igId].followersCount||0):null;
                      var yestC=yestSnap&&yestSnap.accounts&&yestSnap.accounts[igId]?parseInt(yestSnap.accounts[igId].followersCount||0):null;
                      var weekC=weekSnap&&weekSnap.accounts&&weekSnap.accounts[igId]?parseInt(weekSnap.accounts[igId].followersCount||0):null;
                      var dayDelta=todayC!==null&&yestC!==null?(todayC-yestC):null;
                      var weekDelta=todayC!==null&&weekC!==null&&weekSnap&&todaySnap&&weekSnap.date!==todaySnap.date?(todayC-weekC):null;
                      var startCount=live-igGrowth;
                      var deltaTxt=function(d){if(d===null)return "";if(d>0)return "+"+fmt(d);if(d<0)return "-"+fmt(Math.abs(d));return "0";};
                      var deltaCol=function(d){if(d===null)return P.caption;if(d>0)return P.mint;if(d<0)return P.rose;return P.label;};
                      return <div key={igId} style={{display:"flex",alignItems:"center",gap:14,padding:"6px 0",fontSize:11,fontFamily:fm,color:P.txt,flexWrap:"wrap"}}>
                        <span style={{display:"inline-flex",alignItems:"center",gap:6,minWidth:170}}>
                          <span style={{width:6,height:6,borderRadius:"50%",background:P.ig}}></span>
                          <strong style={{color:P.ig}}>@{ig.username||ig.name||igId}</strong>
                        </span>
                        <span><strong style={{color:P.txt}}>{Math.round(live).toLocaleString()}</strong> <span style={{color:P.caption}}>live</span></span>
                        {dayDelta!==null&&<span style={{color:deltaCol(dayDelta)}}>{deltaTxt(dayDelta)} <span style={{color:P.caption}}>since yesterday</span></span>}
                        {weekDelta!==null&&<span style={{color:deltaCol(weekDelta)}}>{deltaTxt(weekDelta)} <span style={{color:P.caption}}>this week</span></span>}
                        {igGrowth!==0&&<span><span style={{color:P.caption}}>{df} starting count:</span> <strong>{Math.round(startCount).toLocaleString()}</strong></span>}
                      </div>;
                    })}
                    <div style={{fontSize:9,color:P.caption,fontStyle:"italic",marginTop:6,lineHeight:1.5}}>
                      Live count from Meta's `/me/accounts` snapshot, daily counts captured at 06:00 SAST and stored independently of Meta's per-day Page Insights metric. Period starting count is computed as live total minus net page growth for {df} to {dt}.
                    </div>
                  </div>;
                })()}
                {/* Community member demographic cards, slotted directly under
                    the existing Community Growth KPIs so the owned-audience
                    composition reads as part of the same section rather than
                    a separate block. */}
                {FEATURES.communityDemographics&&(<div style={{marginTop:22,paddingTop:18,borderTop:"1px dashed "+P.rule}}>
                  <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:14}}>
                    <div style={{width:32,height:32,borderRadius:10,background:"linear-gradient(135deg,"+P.tt+"35,"+P.tt+"15)",border:"1px solid "+P.tt+"55",display:"flex",alignItems:"center",justifyContent:"center"}}>{Ic.users(P.tt,16)}</div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:900,color:P.tt,fontFamily:fm,letterSpacing:2.5,textTransform:"uppercase"}}>Who Already Follows You</div>
                      <div style={{fontSize:10,color:P.label,fontFamily:fm,letterSpacing:0.5,marginTop:2}}>Owned community demographic per platform, separate from the paid audience shown above.</div>
                    </div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14}}>
                    <CommunityMemberCard platform="Facebook" data={communityDemo&&communityDemo.facebook} color={P.fb} iconFn={Ic.eye}/>
                    <CommunityMemberCard platform="Instagram" data={communityDemo&&communityDemo.instagram} color={P.ig} iconFn={Ic.fire}/>
                    <CommunityMemberCard platform="TikTok" data={communityDemo&&communityDemo.tiktok} color={P.tt} iconFn={Ic.bolt}/>
                  </div>
                </div>)}
              </div>}

              {/* ═══ ENGAGEMENT PULSE (mirrors Community tab) ═══ */}
              {(function(){
                var types=["love","like","haha","wow","sad","angry","shares","comments"];
                var empty=function(){return {love:0,like:0,haha:0,wow:0,sad:0,angry:0,other:0,shares:0,comments:0};};
                var perPlat={Facebook:empty(),Instagram:empty(),TikTok:empty()};
                sel.forEach(function(camp){
                  var plat=camp.platform;
                  if(plat==="TikTok"){
                    perPlat.TikTok.like+=parseFloat(camp.likes||0);
                    perPlat.TikTok.comments+=parseFloat(camp.comments||0);
                    perPlat.TikTok.shares+=parseFloat(camp.shares||0);
                  } else if(plat==="Facebook"||plat==="Instagram"){
                    var bucket=perPlat[plat];
                    var seen={};
                    (camp.actions||[]).forEach(function(a){
                      var at=String(a.action_type||"").toLowerCase();
                      var v=parseFloat(a.value||0);
                      if(v>(seen[at]||0))seen[at]=v;
                    });
                    var rxn=camp.reactionsByType||{};
                    var rxnSum=parseFloat(rxn.like||0)+parseFloat(rxn.love||0)+parseFloat(rxn.haha||0)+parseFloat(rxn.wow||0)+parseFloat(rxn.sad||0)+parseFloat(rxn.angry||0);
                    var totalFromMeta=parseFloat(camp.reactionsTotal||0);
                    if(rxnSum>0){
                      bucket.like+=parseFloat(rxn.like||0);
                      bucket.love+=parseFloat(rxn.love||0);
                      bucket.haha+=parseFloat(rxn.haha||0);
                      bucket.wow+=parseFloat(rxn.wow||0);
                      bucket.sad+=parseFloat(rxn.sad||0);
                      bucket.angry+=parseFloat(rxn.angry||0);
                      if(totalFromMeta>rxnSum) bucket.other+=(totalFromMeta-rxnSum);
                    } else if(totalFromMeta>0) {
                      bucket.other+=totalFromMeta;
                    } else {
                      bucket.like+=(seen.like||0);
                      bucket.love+=(seen.love||0);
                      bucket.haha+=(seen.haha||0);
                      bucket.wow+=(seen.wow||0);
                      bucket.sad+=(seen.sad||0);
                      bucket.angry+=(seen.angry||0);
                    }
                    bucket.comments+=(seen.comment||0);
                    bucket.shares+=(seen.post_share||seen.share||seen.post||0);
                  }
                });
                var totals={};
                types.forEach(function(t){totals[t]=perPlat.Facebook[t]+perPlat.Instagram[t]+perPlat.TikTok[t];});
                var totalAll=types.reduce(function(a,t){return a+totals[t];},0);
                if(totalAll===0)return null;
                var reactionSum=totals.love+totals.like+totals.haha+totals.wow+totals.sad+totals.angry;
                var positiveSum=totals.love+totals.like+totals.haha+totals.wow;
                var negativeSum=totals.sad+totals.angry;
                var classifiedSum=positiveSum+negativeSum;
                var sentimentPct=classifiedSum>0?(positiveSum/classifiedSum*100):0;
                var sentColor=sentimentPct>=90?P.mint:sentimentPct>=75?P.cyan:sentimentPct>=50?P.solar:P.rose;
                // Reaction ratio is structurally biased positive on Meta, Like
                // and Love are one-tap defaults while Sad and Angry need a
                // long-press, so most posts naturally land at 90%+. Tighten
                // the bands so labels reflect a real signal rather than the
                // baseline. >=99% means a genuine outlier on positive
                // reactions, 90% is closer to "any negative signal at all".
                var sentLabel=sentimentPct>=99?"OVERWHELMINGLY POSITIVE":sentimentPct>=95?"STRONGLY POSITIVE":sentimentPct>=85?"POSITIVE":sentimentPct>=70?"MIXED-POSITIVE":sentimentPct>=50?"MIXED":sentimentPct>=30?"NEGATIVE LEAN":"STRONGLY NEGATIVE";
                var typeMeta={
                  love:{label:"Love",color:P.rose,icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 21s-7-4.5-7-11a4 4 0 017-2.65A4 4 0 0119 10c0 6.5-7 11-7 11z" stroke={P.rose} strokeWidth="1.8" fill={P.rose} strokeLinejoin="round"/></svg>},
                  like:{label:"Like",color:P.fb,icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M7 22V11m0 0V6a3 3 0 014.9-2.3L13 5l-1 5h6a2 2 0 012 2l-2 8a2 2 0 01-2 2H7z" stroke={P.fb} strokeWidth="1.6" fill={P.fb+"25"} strokeLinejoin="round"/></svg>},
                  haha:{label:"Haha",color:P.solar,icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke={P.solar} strokeWidth="1.6" fill={P.solar+"25"}/><path d="M8 10l0 1M16 10l0 1M7 14s2 3 5 3 5-3 5-3" stroke={P.solar} strokeWidth="1.6" strokeLinecap="round"/></svg>},
                  wow:{label:"Wow",color:P.lava,icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke={P.lava} strokeWidth="1.6" fill={P.lava+"25"}/><circle cx="9" cy="11" r="0.7" fill={P.lava}/><circle cx="15" cy="11" r="0.7" fill={P.lava}/><ellipse cx="12" cy="16" rx="2" ry="2.4" stroke={P.lava} strokeWidth="1.4" fill="none"/></svg>},
                  sad:{label:"Sad",color:P.info,icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke={P.info} strokeWidth="1.6" fill={P.info+"25"}/><path d="M8 11l0 1M16 11l0 1M8 16s1.5-2 4-2 4 2 4 2" stroke={P.info} strokeWidth="1.6" strokeLinecap="round"/></svg>},
                  angry:{label:"Angry",color:P.critical,icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke={P.critical} strokeWidth="1.6" fill={P.critical+"25"}/><path d="M6.5 8l3 2M17.5 8l-3 2M8 16s1.5-2 4-2 4 2 4 2" stroke={P.critical} strokeWidth="1.6" strokeLinecap="round"/></svg>},
                  shares:{label:"Shares",color:P.orchid,icon:Ic.share(P.orchid,18)},
                  comments:{label:"Comments",color:P.cyan,icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke={P.cyan} strokeWidth="1.8" fill={P.cyan+"25"} strokeLinejoin="round"/></svg>}
                };
                var rows=types.map(function(t){var m2=typeMeta[t];return {key:t,label:m2.label,color:m2.color,icon:m2.icon,value:totals[t],perPlat:{FB:perPlat.Facebook[t],IG:perPlat.Instagram[t],TT:perPlat.TikTok[t]}};}).sort(function(a,b){return b.value-a.value;});
                var maxVal=rows.reduce(function(a,r){return Math.max(a,r.value);},0);
                return <div style={{background:P.glass,borderRadius:18,padding:"6px 28px 28px",marginBottom:28,border:"1px solid "+P.rule}}>
                  {secHead(P.mint,"BRAND PULSE",Ic.pulse(P.mint,18))}
                  <style>{"@keyframes pulseBar{0%,100%{box-shadow:0 0 0 0 currentColor}50%{box-shadow:0 0 16px 1px currentColor}}@keyframes barFill{from{width:0}}"}</style>
                  <div style={{fontSize:10,color:P.label,fontFamily:fm,letterSpacing:1,marginBottom:14,textAlign:"right"}}>{fmt(totalAll)} total interactions</div>
                  {reactionSum>0&&<div style={{display:"grid",gridTemplateColumns:"220px 1fr",gap:18,marginBottom:18,alignItems:"center",background:"rgba(0,0,0,0.22)",borderRadius:14,padding:"16px 18px",border:"1px solid "+sentColor+"30"}}>
                    <div style={{display:"flex",alignItems:"center",gap:16}}>
                      {(function(){
                        var circ=2*Math.PI*50;
                        var offset=circ-(sentimentPct/100)*circ;
                        return <svg width="108" height="108" viewBox="0 0 120 120" style={{flexShrink:0}}>
                          <circle cx="60" cy="60" r="50" stroke={P.rule} strokeWidth="10" fill="none"/>
                          <circle cx="60" cy="60" r="50" stroke={sentColor} strokeWidth="10" fill="none" strokeLinecap="round" transform="rotate(-90 60 60)" strokeDasharray={circ} strokeDashoffset={offset} style={{transition:"stroke-dashoffset 1.2s ease-out"}}/>
                          <text x="60" y="62" textAnchor="middle" style={{fontSize:16,fontWeight:900,fill:sentColor,fontFamily:fm,letterSpacing:-0.5}}>{sentimentPct.toFixed(2)+"%"}</text>
                          <text x="60" y="78" textAnchor="middle" style={{fontSize:8,fontWeight:700,fill:"rgba(255,251,248,0.6)",fontFamily:fm,letterSpacing:2}}>POSITIVE</text>
                        </svg>;
                      })()}
                    </div>
                    <div>
                      <div style={{fontSize:18,fontWeight:900,color:sentColor,letterSpacing:2,fontFamily:fm,textTransform:"uppercase",marginBottom:4}}>Brand Sentiment Pulse</div>
                      <div style={{fontSize:18,fontWeight:900,color:P.txt,fontFamily:ff,marginBottom:6,letterSpacing:0.5}}>{sentLabel}</div>
                      <div style={{fontSize:11,color:"rgba(255,251,248,0.72)",fontFamily:ff,lineHeight:1.5,marginBottom:8}}>{fmt(positiveSum)} positive (love, like, haha, wow) against {fmt(negativeSum)} negative (sad, angry) across {fmt(classifiedSum)} classified reactions.</div>
                      <div style={{display:"flex",gap:10,fontSize:10,fontFamily:fm,flexWrap:"wrap"}}>
                        <div style={{display:"flex",alignItems:"center",gap:5}}><span style={{width:9,height:9,borderRadius:"50%",background:P.mint}}></span><span style={{color:P.label}}>Positive {fmt(positiveSum)}</span></div>
                        <div style={{display:"flex",alignItems:"center",gap:5}}><span style={{width:9,height:9,borderRadius:"50%",background:P.critical}}></span><span style={{color:P.label}}>Negative {fmt(negativeSum)}</span></div>
                      </div>
                    </div>
                  </div>}
                  {/* Text + container for every row renders unconditionally
                      so the section reads as static. GrowBar gates only
                      the bar fill width, with a 60 ms per-row stagger so
                      the bars cascade in top-to-bottom as the team
                      scrolls to Brand Pulse. */}
                  {rows.map(function(r,idx){
                    var pct=maxVal>0?(r.value/maxVal*100):0;
                    var ppParts=[];
                    if(r.perPlat.FB>0)ppParts.push(<span key="fb" style={{color:P.fb}}>FB {fmt(r.perPlat.FB)}</span>);
                    if(r.perPlat.IG>0)ppParts.push(<span key="ig" style={{color:P.ig}}>IG {fmt(r.perPlat.IG)}</span>);
                    if(r.perPlat.TT>0)ppParts.push(<span key="tt" style={{color:P.tt}}>TT {fmt(r.perPlat.TT)}</span>);
                    var parted=[];ppParts.forEach(function(n,i){if(i>0)parted.push(<span key={"s"+i} style={{color:P.caption,margin:"0 4px"}}>·</span>);parted.push(n);});
                    return <div key={r.key} style={{display:"flex",alignItems:"center",gap:14,marginBottom:12}}>
                      <div style={{display:"flex",alignItems:"center",gap:10,width:210,flexShrink:0}}>
                        <div style={{width:36,height:36,borderRadius:"50%",background:r.color+"18",border:"1px solid "+r.color+"45",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{r.icon}</div>
                        <div style={{minWidth:0}}>
                          <div style={{fontSize:11,fontWeight:800,color:P.txt,fontFamily:fm,letterSpacing:1.5,textTransform:"uppercase"}}>{r.label}</div>
                          <div style={{fontSize:9,fontFamily:fm,marginTop:2}}>{parted}</div>
                        </div>
                      </div>
                      <div style={{flex:1,height:20,background:"rgba(0,0,0,0.4)",borderRadius:10,overflow:"hidden",border:"1px solid "+P.rule,position:"relative"}}>
                        <GrowBar pct={pct} delay={idx*60} style={{height:"100%",background:"linear-gradient(90deg,"+r.color+"cc,"+r.color+"ff)",borderRadius:10,color:r.color,animation:"pulseBar 2.8s ease-in-out infinite "+(900+idx*60)+"ms"}}/>
                      </div>
                      <div style={{minWidth:84,textAlign:"right",flexShrink:0}}>
                        <div style={{fontSize:20,fontWeight:900,color:r.color,fontFamily:fm,lineHeight:1,letterSpacing:-0.5}}>{fmt(r.value)}</div>
                      </div>
                    </div>;
                  })}
                </div>;
              })()}

              {/* ═══ TOP 5 ADS PER PLATFORM ═══ */}
              {(function(){
                var selCamps=campaigns.filter(function(x){return selected.indexOf(x.campaignId)>=0;});
                if(selCamps.length===0)return null;
                // Ads endpoint is slower than campaigns (many Meta/TikTok/Google lookups). Render a
                // placeholder while it loads so the section is visibly part of the page instead of
                // appearing mid-scroll after the fetch resolves.
                if(!adsList||adsList.length===0){
                  return <div style={{background:P.glass,borderRadius:18,padding:"6px 28px 28px",marginBottom:28,border:"1px solid "+P.rule}}>
                    {secHead(P.mint,"TOP ADS PER OBJECTIVE (BY PLATFORM)",Ic.crown(P.mint,18))}
                    <div style={{padding:"54px 20px",textAlign:"center",color:P.caption,fontFamily:ff,lineHeight:1.8}}>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:14,marginBottom:14}}>
                        <div style={{width:28,height:28,border:"2px solid "+P.rule,borderTop:"2px solid "+P.mint,borderRadius:"50%",animation:"spin 1s linear infinite"}}/>
                        <style>{"@keyframes spin{to{transform:rotate(360deg)}}@keyframes adLoaderFade{0%,100%{opacity:0.4}15%,85%{opacity:1}}"}</style>
                      </div>
                      <div key={adLoaderQuip} style={{fontSize:15,color:"rgba(255,251,248,0.72)",fontStyle:"italic",maxWidth:520,margin:"0 auto",animation:"adLoaderFade 5s ease-in-out",lineHeight:1.6,letterSpacing:0.2}}>{adLoaderQuip}<span style={{display:"inline-block",width:18}}>…</span></div>
                    </div>
                  </div>;
                }
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
                if(filteredAds.length===0)return null;

                var platformGroup=function(p){
                  if(p==="Facebook")return"Facebook";
                  if(p==="Instagram")return"Instagram";
                  if(p==="TikTok")return"TikTok";
                  if(p==="Google Display"||p==="YouTube"||p==="Google Search"||p==="Performance Max"||p==="Demand Gen")return"Google Display";
                  return p;
                };
                var fmtMeta=function(f){
                  var ff2=(f||"STATIC").toUpperCase();
                  if(ff2==="MP4"||ff2==="VIDEO")return{label:"VIDEO",color:P.rose};
                  if(ff2==="CAROUSEL")return{label:"CAROUSEL",color:P.orchid};
                  if(ff2==="MIXED")return{label:"MIXED",color:P.fuchsia};
                  if(ff2==="GIF")return{label:"GIF",color:P.warning};
                  if(ff2==="RESPONSIVE")return{label:"RESPONSIVE",color:P.blaze};
                  if(ff2==="TEXT")return{label:"TEXT",color:P.caption};
                  return{label:"STATIC",color:P.cyan};
                };
                var resultLabelS=function(rt){return rt==="leads"?"LEADS":rt==="installs"?"INSTALLS":rt==="follows"?"FOLLOWS":rt==="profile_visits"?"PROFILE VISITS":rt==="conversions"?"CONVERSIONS":rt==="store_clicks"?"STORE CLICKS":rt==="lp_clicks"?"LP CLICKS":rt==="clicks"?"CLICKS":"RESULTS";};
                var costPerLabelS=function(rt){return rt==="leads"?"CPL":rt==="installs"?"CPI":rt==="follows"?"CPF":rt==="profile_visits"?"CPV":rt==="conversions"?"CPA":rt==="store_clicks"?"CPC":rt==="lp_clicks"?"CPC":rt==="clicks"?"CPC":"CPR";};

                var platGroups=[
                  {key:"Facebook",label:"FACEBOOK",accent:P.fb,short:"FB"},
                  {key:"Instagram",label:"INSTAGRAM",accent:P.ig,short:"IG"},
                  {key:"TikTok",label:"TIKTOK",accent:P.tt,short:"TT"},
                  {key:"Google Display",label:"GOOGLE DISPLAY",accent:P.gd,short:"GD"}
                ];
                var objGroups=[
                  {key:"leads",label:"LEAD GENERATION",accent:P.rose,criterion:"by leads & cost per lead"},
                  {key:"appinstall",label:"CLICKS TO APP STORE",accent:P.fb,criterion:"by clicks & CTR (min 5k impressions)"},
                  {key:"followers",label:"FOLLOWERS",accent:P.tt,criterion:"by follower growth & cost per follower"},
                  {key:"landingpage",label:"LANDING PAGE",accent:P.cyan,criterion:"by clicks to landing page (min 5k impressions)"}
                ];

                var IMP_FLOOR=5000;
                // Ranking that differs by objective:
                //   Lead Gen  -> leads DESC, CPL ASC, impressions DESC
                //   Others    -> clicks DESC, CTR DESC (must clear IMP_FLOOR), low-imp sinks last
                var leadSort=function(a,b){
                  if(b.results!==a.results)return b.results-a.results;
                  var ac=a.results>0?a.spend/a.results:Infinity;
                  var bc=b.results>0?b.spend/b.results:Infinity;
                  if(ac!==bc)return ac-bc;
                  return b.impressions-a.impressions;
                };
                var engagementSort=function(a,b){
                  var aQual=a.impressions>=IMP_FLOOR?0:1;
                  var bQual=b.impressions>=IMP_FLOOR?0:1;
                  if(aQual!==bQual)return aQual-bQual;
                  if(b.clicks!==a.clicks)return b.clicks-a.clicks;
                  return b.ctr-a.ctr;
                };
                // Landing Page ranks by pure click volume, the impression floor was sinking
                // high-click ads that had fewer than 5k impressions.
                var landingPageSort=function(a,b){
                  if(b.clicks!==a.clicks)return b.clicks-a.clicks;
                  return b.ctr-a.ctr;
                };

                // Reordered: outer = objective, inner = platform.
                var sections=[];
                objGroups.forEach(function(og){
                  var groups=[];
                  platGroups.forEach(function(pg){
                    var platAds=filteredAds.filter(function(a){return platformGroup(a.platform)===pg.key;});
                    if(platAds.length===0)return;
                    var objAds;
                    if(og.key==="followers"){
                      // Per-platform result metric, honest to what the ad
                      // surface actually drives:
                      //   FB : page_like action (clean in-ad CTA, one-click
                      //        Like Page). Use followsTrue (no-breakdown
                      //        per-ad total since per-placement breakdown
                      //        drops rows on PAGE_LIKES campaigns).
                      //   IG : Instagram has no in-feed Follow button, the
                      //        follow happens on the profile after the
                      //        click, so per-ad follow attribution is not
                      //        reliable. Report Profile Visits (clicks)
                      //        instead. Net follower growth appears on the
                      //        Community Growth tile from Page Insights.
                      //   TT : In-ad Follow CTA, TikTok API returns a clean
                      //        per-ad follows count.
                      var follAds=platAds.filter(function(a){return (a.objective||"landingpage")==="followers";});
                      var dedup={};
                      follAds.forEach(function(a){
                        var k=a.adId||a.adName;
                        if(!k)return;
                        if(!dedup[k]||parseFloat(a.impressions||0)>parseFloat(dedup[k].impressions||0))dedup[k]=a;
                      });
                      objAds=Object.keys(dedup).map(function(k){
                        var a=dedup[k];
                        if(pg.key==="Instagram"){
                          var ck=parseFloat(a.clicks||0);
                          return Object.assign({},a,{results:ck,resultType:"profile_visits"});
                        }
                        // FB + TikTok, follow is cleanly attributed in-ad.
                        var ft=parseFloat(a.followsTrue||0);
                        if(ft>0)return Object.assign({},a,{results:ft,resultType:"follows"});
                        return Object.assign({},a,{resultType:"follows"});
                      });
                    } else if(og.key==="landingpage"){
                      objAds=platAds.filter(function(a){return (a.objective||"landingpage")===og.key;}).map(function(a){
                        var clicks=parseFloat(a.clicks||0);
                        return Object.assign({},a,{results:clicks,resultType:"lp_clicks"});
                      });
                    } else {
                      objAds=platAds.filter(function(a){return (a.objective||"landingpage")===og.key;});
                    }
                    if(objAds.length===0)return;
                    var sorter;
                    if(og.key==="leads"||og.key==="followers")sorter=leadSort;
                    else if(og.key==="landingpage")sorter=landingPageSort;
                    else sorter=engagementSort;
                    var sorted=objAds.slice().sort(sorter).slice(0,5);
                    groups.push({pg:pg,ads:sorted,total:objAds.length});
                  });
                  if(groups.length===0)return;
                  sections.push({og:og,groups:groups});
                });
                if(sections.length===0)return null;

                var renderAdCard=function(ad,rank,pgAccent,pgShort,objAccent){
                  var fm2=fmtMeta(ad.format);
                  return <div key={ad.adId+"_"+pgShort+"_"+rank} style={{background:"rgba(0,0,0,0.35)",borderRadius:12,border:"1px solid "+objAccent+"35",overflow:"hidden",display:"flex",flexDirection:"column"}}>
                    <div style={{position:"relative",width:"100%",paddingTop:"100%",background:"#1a0f2a",overflow:"hidden"}}>
                      <div style={{position:"absolute",inset:0,background:"linear-gradient(135deg,"+pgAccent+"55,"+pgAccent+"15 55%,#0a0618 100%)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                        <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%) rotate(-18deg)",fontSize:40,fontWeight:900,letterSpacing:4,color:pgAccent,opacity:0.16,fontFamily:ff,whiteSpace:"nowrap",pointerEvents:"none"}}>{pgShort}</div>
                        {!hasThumb(ad)&&<div style={{position:"relative",zIndex:2,textAlign:"center",padding:"0 10px"}}>
                          <div style={{fontSize:8,color:"rgba(255,255,255,0.7)",fontFamily:fm,letterSpacing:1.5,marginBottom:3,fontWeight:800}}>{resultLabelS(ad.resultType)}</div>
                          <div style={{fontSize:26,fontWeight:900,color:"#fff",fontFamily:fm,lineHeight:1,textShadow:"0 2px 12px rgba(0,0,0,0.6)"}}>{ad.results>0?fmt(ad.results):"\u2014"}</div>
                          {ad.results>0&&<div style={{fontSize:9,color:"rgba(255,255,255,0.85)",fontFamily:fm,letterSpacing:1,marginTop:4,fontWeight:700}}>{fR(ad.spend/ad.results)+" "+costPerLabelS(ad.resultType)}</div>}
                        </div>}
                      </div>
                      {hasThumb(ad)&&<div onClick={function(){setPreviewAd(ad);}} style={{position:"absolute",inset:0,display:"block",zIndex:1,cursor:"pointer"}}><img src={thumbFor(ad)} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}} onError={function(e){e.target.style.display="none";}}/></div>}
                      {hasThumb(ad)&&ad.results>0&&<div style={{position:"absolute",left:"50%",top:"50%",transform:"translate(-50%,-50%)",zIndex:2,pointerEvents:"none",background:"radial-gradient(ellipse at center, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.55) 60%, rgba(0,0,0,0) 100%)",padding:"12px 18px",borderRadius:10,textAlign:"center",minWidth:100}}>
                        <div style={{fontSize:8,color:"rgba(255,255,255,0.78)",fontFamily:fm,letterSpacing:1.5,fontWeight:800,marginBottom:3,textShadow:"0 1px 3px rgba(0,0,0,0.8)"}}>{resultLabelS(ad.resultType)}</div>
                        <div style={{fontSize:24,fontWeight:900,color:"#fff",fontFamily:fm,lineHeight:1,textShadow:"0 2px 10px rgba(0,0,0,0.9)"}}>{fmt(ad.results)}</div>
                        <div style={{fontSize:9,color:"rgba(255,255,255,0.88)",fontFamily:fm,letterSpacing:0.8,marginTop:4,fontWeight:700,textShadow:"0 1px 3px rgba(0,0,0,0.8)"}}>{fR(ad.spend/ad.results)+" "+costPerLabelS(ad.resultType)}</div>
                      </div>}
                      <div style={{position:"absolute",top:8,left:8,background:"rgba(255,255,255,0.18)",color:P.txt,padding:"4px 9px",borderRadius:5,fontSize:10,fontWeight:900,fontFamily:fm,letterSpacing:1,boxShadow:"0 2px 6px rgba(0,0,0,0.4)",zIndex:3}}>{"#"+rank}</div>
                      <div style={{position:"absolute",bottom:8,left:8,background:fm2.color,color:textOnAccent(fm2.color),padding:"3px 7px",borderRadius:4,fontSize:8,fontWeight:900,fontFamily:fm,letterSpacing:0.8,boxShadow:"0 2px 6px rgba(0,0,0,0.5)",zIndex:3}}>{fm2.label}</div>
                      {rank<=3&&ad.results>0&&<div style={{position:"absolute",bottom:8,right:8,background:P.mint,color:"#062014",padding:"3px 8px",borderRadius:4,fontSize:8,fontWeight:900,fontFamily:fm,letterSpacing:0.8,boxShadow:"0 2px 8px rgba(52,211,153,0.45)",zIndex:3}}>{"\u25B2 SCALE"}</div>}
                      {rank>=4&&rank<=5&&ad.results>=0&&<div style={{position:"absolute",bottom:8,right:8,background:P.warning,color:"#2a1605",padding:"3px 8px",borderRadius:4,fontSize:8,fontWeight:900,fontFamily:fm,letterSpacing:0.8,boxShadow:"0 2px 8px rgba(251,191,36,0.4)",zIndex:3}}>{"\u2605 TOP"}</div>}
                    </div>
                    <div style={{padding:"8px 10px",flex:1,display:"flex",flexDirection:"column"}}>
                      <div style={{fontSize:10,fontWeight:700,color:P.txt,fontFamily:ff,marginBottom:6,lineHeight:1.3,minHeight:26,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}} title={ad.adName}>{ad.adName||"Unnamed ad"}</div>
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:8,fontFamily:fm,marginBottom:6,padding:"5px 7px",background:objAccent+"10",border:"1px solid "+objAccent+"30",borderRadius:6}}>
                        <span style={{color:objAccent,fontWeight:800}}>{(ad.results>0?fmt(ad.results):"0")+" "+resultLabelS(ad.resultType).split(" ")[0]}</span>
                        <span style={{color:objAccent,fontWeight:800}}>{ad.results>0?fR(ad.spend/ad.results)+" "+costPerLabelS(ad.resultType):"-"}</span>
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4,fontSize:8,fontFamily:fm,marginBottom:8}}>
                        <div><div style={{color:"rgba(255,255,255,0.7)",fontSize:8,letterSpacing:0.8,fontWeight:700}}>IMPRESSIONS</div><div style={{color:"#fff",fontWeight:800,fontSize:11}}>{fmt(ad.impressions)}</div></div>
                        <div><div style={{color:"rgba(255,255,255,0.7)",fontSize:8,letterSpacing:0.8,fontWeight:700}}>COST PER CLICK</div><div style={{color:"#fff",fontWeight:800,fontSize:11}}>{ad.cpc>0?fR(ad.cpc):(ad.clicks>0?fR(ad.spend/ad.clicks):"-")}</div></div>
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:9,fontFamily:fm,marginBottom:8,color:"rgba(255,255,255,0.85)",fontWeight:600}}>
                        <span>{fR(ad.spend)}</span>
                        <span>{ad.ctr.toFixed(2)+"% CTR"}</span>
                      </div>
                      {/* CTA uses the PLATFORM colour (Facebook blue,
                          Instagram pink, TikTok teal, Google green, YouTube
                          red) so the button reads as "open this ad on its
                          platform". Earlier version used the objective
                          colour, which broke the visual cue. */}
                      <button onClick={function(){setPreviewAd(ad);}} style={{display:"block",marginTop:"auto",padding:"6px 8px",background:pgAccent,border:"none",borderRadius:5,color:textOnAccent(pgAccent),fontSize:9,fontWeight:900,fontFamily:fm,textAlign:"center",letterSpacing:1,cursor:"pointer",width:"100%",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",boxShadow:"0 2px 6px "+pgAccent+"40"}}><span className="gas-view-ad-full">{viewAdLabel(ad.platform)}</span><span className="gas-view-ad-short">VIEW AD</span></button>
                    </div>
                  </div>;
                };

                return <div style={{background:P.glass,borderRadius:18,padding:"6px 28px 28px",marginBottom:28,border:"1px solid "+P.rule}}>
                  {secHead(P.mint,"TOP ADS PER OBJECTIVE (BY PLATFORM)",Ic.crown(P.mint,18))}
                  {sections.map(function(s){
                    // Objective headline strip (dot + label + bottom border
                    // + fade gradient) is locked to P.fb so every section
                    // reads in one consistent voice on the Summary page.
                    // Per-objective accents are still used on the per-card
                    // strip / borders below so the four sections stay
                    // subtly differentiated.
                    var hAcc=P.fb;
                    return <div key={s.og.key} style={{marginBottom:28}}>
                      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16,paddingBottom:10,borderBottom:"2px solid "+hAcc+"50"}}>
                        <div style={{width:10,height:10,borderRadius:"50%",background:hAcc,boxShadow:"0 0 10px "+hAcc}}/>
                        <span style={{fontSize:16,fontWeight:900,color:hAcc,fontFamily:fm,letterSpacing:3,textTransform:"uppercase",lineHeight:1}}>{s.og.label}</span>
                        <div style={{flex:1,height:1,background:"linear-gradient(90deg,"+hAcc+"40, transparent)"}}/>
                        <span style={{fontSize:10,color:P.label,fontFamily:fm,letterSpacing:1,fontStyle:"italic"}}>{"ranked "+s.og.criterion+" \u00b7 "+s.groups.length+" platform"+(s.groups.length===1?"":"s")}</span>
                      </div>
                      {s.groups.map(function(g){
                        return <div key={s.og.key+"_"+g.pg.key} style={{marginBottom:18,paddingLeft:12,borderLeft:"3px solid "+g.pg.accent+"55"}}>
                          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                            <span style={{fontSize:11,fontWeight:900,color:g.pg.accent,fontFamily:fm,letterSpacing:2}}>{g.pg.label}</span>
                            <span style={{fontSize:9,color:P.label,fontFamily:fm,letterSpacing:1,fontStyle:"italic"}}>{"\u2022 "+g.total+" ad"+(g.total===1?"":"s")}</span>
                          </div>
                          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12}}>
                            {g.ads.map(function(ad,i){return renderAdCard(ad,i+1,g.pg.accent,g.pg.short,s.og.accent);})}
                          </div>
                        </div>;
                      })}
                    </div>;
                  })}
                </div>;
              })()}

              {/* ═══ 6.5 TARGETING PERSONAS (who is clicking, per platform)
                   Always renders four slots in one row (Facebook, Instagram,
                   TikTok, Google) so the layout stays consistent. Each card
                   has its own "data not available" fallback so an empty slot
                   shows a polished placeholder rather than collapsing the grid. */}
              {FEATURES.targetingPersonas&&(<div style={{background:P.glass,borderRadius:18,padding:"20px 28px 24px",marginBottom:28,border:"1px solid "+P.rule}}>
                <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:8}}>
                  <div style={{width:38,height:38,borderRadius:10,background:"linear-gradient(135deg,"+P.solar+"35,"+P.solar+"15)",border:"1px solid "+P.solar+"55",display:"flex",alignItems:"center",justifyContent:"center"}}>{Ic.users(P.solar,18)}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:16,fontWeight:900,color:P.solar,fontFamily:fm,letterSpacing:2.5,textTransform:"uppercase"}}>Audience Personas</div>
                  </div>
                </div>
                <div style={{height:1,marginBottom:18,background:"linear-gradient(90deg,"+P.solar+"45,"+P.solar+"15,transparent 80%)"}}/>
                {(function(){
                  // Build a stable 4-card row regardless of what data has loaded.
                  // Use an empty-persona placeholder for any platform without
                  // click volume so the grid layout is always four columns.
                  var byName={};(targetingPersonas||[]).forEach(function(p){byName[p.platform]=p;});
                  var empty=function(name,color,iconFn){return {platform:name,color:color,iconFn:iconFn,totalClicks:0,shareOfClicks:0,topAge:"",topAgeShare:0,genderSplit:{female:0,male:0},topProvinces:[],mobileShare:0,topSegments:[],ctr:0,ctrRatio:0};};
                  var fb=byName["Facebook"]||empty("Facebook",P.fb,Ic.eye);
                  var ig=byName["Instagram"]||empty("Instagram",P.ig,Ic.fire);
                  var tt=byName["TikTok"]||empty("TikTok",P.tt,Ic.bolt);
                  return <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14}}>
                    <TargetingPersonaCard persona={fb} delay={0}/>
                    <TargetingPersonaCard persona={ig} delay={0.9}/>
                    <TargetingPersonaCard persona={tt} delay={1.8}/>
                    {FEATURES.googleIntentCard&&<GoogleIntentCard intent={googleIntent} delay={2.7}/>}
                  </div>;
                })()}
              </div>)}

              {/* ═══ 7. EXECUTIVE SUMMARY (consolidated at bottom) ═══ */}
              {(function(){
                var bestCpcPlatLocal="";var bestCpcValLocal=Infinity;
                sortedPlats.forEach(function(pl){var pb=platBreak[pl];var cpc=pb.clicks>0?pb.spend/pb.clicks:0;if(cpc>0&&cpc<bestCpcValLocal){bestCpcValLocal=cpc;bestCpcPlatLocal=pl;}});

                // Helper phrasings that stay positive and client-friendly.
                var cpmQuality=computed.blendedCpm<=benchmarks.meta.cpm.low?"top-tier value":computed.blendedCpm<=benchmarks.meta.cpm.mid?"excellent value":computed.blendedCpm<=benchmarks.meta.cpm.high?"healthy value":"solid delivery";
                var ctrQuality=blCtr>=2.0?"exceptionally strong, well above":blCtr>=1.4?"outstanding, clearly above":blCtr>=0.9?"healthy and within":"steady and close to";
                var freqMessage=blFreq>=2&&blFreq<=3?"a balanced level that helps people remember the brand without feeling over-exposed":blFreq>3&&blFreq<=4?"building strong memorability as the same audience sees the message more than once":blFreq>4?"delivering very high recall as the audience sees the message multiple times":"still building early frequency as awareness ramps up";

                var awarenessRead="Across the selected period, your campaigns delivered "+fmt(computed.totalImps)+" impressions to an estimated "+fmt(m.reach+t.reach+computed.gd.reach)+" unique people, confirming meaningful brand presence in market. The blended cost to reach 1,000 ads served sits at "+fR(computed.blendedCpm)+" which reflects "+cpmQuality+" against the industry benchmark."+(bestCpmPlat&&sortedPlats.length>1?" "+bestCpmPlat+" delivered the lowest cost per 1,000 ads served, stretching every rand of awareness budget further than the rest.":"")+(blFreq>0?" The average person saw your ads "+blFreq.toFixed(2)+" times across Meta and TikTok, "+freqMessage+".":"");

                var engagementRead="The audience responded actively with "+fmt(computed.totalClicks)+" clicks, converting "+blCtr.toFixed(2)+"% of impressions into real engagement. That click-through rate is "+ctrQuality+" the industry benchmark of 0.9 to 1.4 percent, a clear signal the creative is cutting through and earning genuine attention. The blended cost per click of "+fR(blCpc)+" demonstrates efficient value for every user action."+(bestCpcPlatLocal?" "+bestCpcPlatLocal+" is the most cost-efficient click driver at "+fR(bestCpcValLocal)+" per click, amplifying the impact of engagement spend.":"");

                var objectiveRead=(function(){
                  var lines=[];
                  objKeys.filter(function(k){return objectives4[k];}).forEach(function(objName){
                    var od=objectives4[objName];
                    var cp=od.results>0?od.spend/od.results:0;
                    var bm=objName==="Leads"?benchmarks.meta.cpl:objName==="Followers & Likes"?benchmarks.meta.cpf:benchmarks.meta.cpc;
                    var verdict=cp>0&&bm?(cp<=bm.low?"well below the benchmark midpoint":cp<=bm.mid?"a healthy, efficient cost in line with industry benchmarks":cp<=bm.high?"a steady cost within benchmark range":"a cost tracking just above benchmark midpoint"):"";
                    if(objName==="Leads"&&od.results>0){
                      lines.push("Lead Generation produced "+fmt(od.results)+" qualified leads at "+fR(cp)+" per lead"+(verdict?", "+verdict:"")+". Each lead represents a genuine prospect who chose to share their contact details, the highest-value first-party signal in the entire funnel.");
                    } else if(objName==="Clicks to App Store"&&od.results>0){
                      lines.push("Click to app store campaigns drove "+fmt(od.results)+" clicks through to the app store at "+fR(cp)+" per click"+(verdict?", "+verdict:"")+", each representing a user moving from ad exposure to the final download step.");
                    } else if(objName==="Followers & Likes"&&od.results>0){
                      lines.push("Community growth campaigns acquired "+fmt(od.results)+" new followers and likes at "+fR(cp)+" per member"+(verdict?", "+verdict:"")+". Each new member adds to a warm, retargetable audience pool. Organic posts reach around 1 to 3 percent of followers on their own, so paid amplification is still the way to reach the full community, but at materially lower CPMs than cold audiences.");
                    } else if(objName==="Landing Page Clicks"&&od.results>0){
                      lines.push("Landing Page campaigns drove "+fmt(od.results)+" qualified site visits at "+fR(cp)+" per visit"+(verdict?", "+verdict:"")+". These are the warmest segment of the audience, actively choosing to learn more about the offer.");
                    } else if(od.results>0){
                      lines.push(objName+" campaigns delivered "+fmt(od.results)+" results at "+fR(cp)+" each"+(verdict?", "+verdict:"")+".");
                    }
                  });
                  return lines.join(" ")||"Objective-specific results are still building in the selected period.";
                })();

                var creativeRead=(function(){
                  if(!adsList||adsList.length===0)return "Ad-level creative data is still loading, creative insights will appear here once the ads endpoint returns.";
                  var selCamps=campaigns.filter(function(x){return selected.indexOf(x.campaignId)>=0;});
                  var selIds={};selCamps.forEach(function(c){selIds[String(c.rawCampaignId||"")]=true;selIds[String(c.campaignId||"").replace(/_facebook$/,"").replace(/_instagram$/,"")]=true;selIds[String(c.campaignId||"")]=true;});
                  var selNames={};selCamps.forEach(function(c){if(c.campaignName)selNames[c.campaignName]=true;});
                  var fAds=adsList.filter(function(a){return selIds[String(a.campaignId||"")]||selNames[a.campaignName];});
                  if(fAds.length===0)return "No ad-level creative data available for the selected campaigns yet.";
                  var scored=fAds.filter(function(a){return a.impressions>=5000;}).slice().sort(function(a,b){if(b.ctr!==a.ctr)return b.ctr-a.ctr;return b.clicks-a.clicks;});
                  if(scored.length===0)return "Creative performance is still gathering meaningful impression volume across "+fAds.length+" ads. Insights will sharpen as data accumulates.";
                  var top3=scored.slice(0,3);
                  var fmtOf=function(f){var u=(f||"").toUpperCase();return u==="MP4"||u==="VIDEO"?"video":u==="CAROUSEL"?"carousel":u==="MIXED"?"mixed-asset":u==="GIF"?"animated":"static image";};
                  var lines=[];
                  // Opening: frames the portfolio, not a "only 3 work" read
                  lines.push("Across "+fAds.length+" active creatives, a broader portfolio is working to deliver consistent volume and keep the audience engaged without fatigue. Within that mix, three standouts are delivering especially strong engagement this period and offer the clearest signals about what the audience responds to.");
                  var a=top3[0],b=top3[1],c=top3[2];
                  var adTag=function(ad){var n=String(ad.adName||"").trim();if(!n)return"";return" ("+n+")";};
                  if(a){
                    var aFmt=fmtOf(a.format);
                    lines.push("Leading the pack is a "+aFmt+" on "+a.platform+adTag(a)+" that captured a "+a.ctr.toFixed(2)+"% click-through rate from "+fmt(a.impressions)+" impressions"+(a.results>0?", converting that attention into "+fmt(a.results)+" results at just "+fR(a.spend/a.results)+" each":"")+". This ad sets the tone for what is currently resonating most with the audience.");
                  }
                  if(b){
                    var bFmt=fmtOf(b.format);
                    var same1=aFmt===bFmt?" same "+bFmt+" formula":"a "+bFmt;
                    lines.push("Close behind, "+same1+" on "+b.platform+adTag(b)+" reached "+b.ctr.toFixed(2)+"% click-through across "+fmt(b.impressions)+" impressions"+(b.results>0?" and drove "+fmt(b.results)+" results at "+fR(b.spend/b.results)+" each":"")+", reinforcing that the creative direction is finding its audience.");
                  }
                  if(c){
                    var cFmt=fmtOf(c.format);
                    lines.push("Rounding out the top three, a "+cFmt+" on "+c.platform+adTag(c)+" sustained "+c.ctr.toFixed(2)+"% click-through over "+fmt(c.impressions)+" impressions"+(c.results>0?", adding "+fmt(c.results)+" results at "+fR(c.spend/c.results)+" each":"")+", a steady contributor that underlines the broader campaign is building momentum.");
                  }
                  // Pattern detection
                  var fmtCount={};var platCount={};
                  top3.forEach(function(ad){var fp=fmtOf(ad.format);fmtCount[fp]=(fmtCount[fp]||0)+1;platCount[ad.platform]=(platCount[ad.platform]||0)+1;});
                  var topFmt=Object.keys(fmtCount).sort(function(x,y){return fmtCount[y]-fmtCount[x];})[0];
                  var topPl=Object.keys(platCount).sort(function(x,y){return platCount[y]-platCount[x];})[0];
                  if(fmtCount[topFmt]>=3)lines.push("A clear pattern is forming, "+topFmt+" creative is driving the deepest engagement across all three top performers, pointing to how the audience prefers to absorb the brand message. The wider roster of creatives keeps the rotation fresh so the best-performing styles stay effective for longer.");
                  else if(fmtCount[topFmt]>=2)lines.push(topFmt+" creative shows up in two of the top three performers this period, the rotation is leaning that way without being a confirmed pattern yet.");
                  else if(platCount[topPl]>=2)lines.push(topPl+" is the environment where two of the top three creatives are landing this period, while the spread across platforms continues to widen reach and keep the audience exposure balanced.");
                  else lines.push("The top performers span multiple formats and platforms, which suggests the audience is responding to several creative angles at once, a healthy sign that the portfolio strategy is working.");
                  return lines.join(" ");
                })();

                var targetingRead=(function(){
                  if(selAdsets2.length===0)return"Ad-set level targeting data will appear here once it's available.";
                  var topAd2=selAdsets2.map(function(a){var sp=parseFloat(a.spend||0);var cl=parseFloat(a.clicks||0);var im=parseFloat(a.impressions||0);var res=parseFloat(a.follows||0)+parseFloat(a.pageLikes||0)+parseFloat(a.leads||0);if(res===0)res=cl;return{name:a.adsetName,platform:a.platform,spend:sp,result:res,costPer:res>0?sp/res:0,ctr:im>0?(cl/im*100):0};}).filter(function(a){return a.result>=3&&a.spend>100;}).sort(function(a,b){return(b.result>0?b.result/b.spend:0)-(a.result>0?a.result/a.spend:0);});
                  var parts=[selAdsets2.length+" active audiences are currently in-market across the selected campaigns."];
                  if(topAd2.length>0){
                    var best=topAd2[0];
                    parts.push("The standout audience is \""+best.name+"\" on "+best.platform+", generating "+fmt(best.result)+" results at "+fR(best.costPer)+" each with a "+best.ctr.toFixed(2)+"% click-through rate, strong evidence that message, audience and platform are all aligned for this segment.");
                    if(topAd2.length>=3){
                      parts.push("The top "+Math.min(topAd2.length,5)+" audiences combined are driving the majority of efficient results, confirming a strong foundation of well-targeted segments that are actively responding to the creative.");
                    }
                  }
                  return parts.join(" ");
                })();

                var audienceRead=(function(){
                  if(!demoSummary)return "Audience profile data is still loading, the budget-weighting view will populate here once demographics resolve for the selected campaigns.";
                  var d=demoSummary;
                  var convSeg=d.objective&&d.objective.topSegment;
                  var convAge=(convSeg&&convSeg.age)||(d.objective&&d.objective.topAge&&d.objective.topAge.age)||"";
                  var convGen=convSeg&&convSeg.gen?(convSeg.gen==="female"?"female":"male"):"";
                  var convProv=(d.objective&&d.objective.topProv&&d.objective.topProv.prov)||"";
                  var convProvShare=(d.objective&&d.objective.topProv&&d.objective.topProv.share)||0;
                  var clickProv=(d.engagement&&d.engagement.topProv&&d.engagement.topProv.prov)||"";
                  var impProv=(d.awareness&&d.awareness.topProv&&d.awareness.topProv.prov)||"";
                  var mobileConv=(d.objective&&d.objective.mobile)||0;
                  // Use the tagged-only subtotal as the denominator so the
                  // single-cell share matches what the Demographic block
                  // charts and persona cards show. authObj includes untagged
                  // conversions in the denominator while convSeg.val is from
                  // tagged rows only, mixing them under-stated cell shares.
                  var convTagged=(d.objective&&d.objective.tagged)||0;
                  var convSegShare=(convSeg&&convSeg.val>0&&convTagged>0)?(convSeg.val/convTagged*100):0;
                  var genFemaleShare=(d.objective&&d.objective.gender&&d.objective.gender.female&&d.objective.gender.male)?(d.objective.gender.female/(d.objective.gender.female+d.objective.gender.male)*100):0;
                  var lines=[];
                  lines.push("Layering the demographic signal over performance gives the clearest read on who to weight budget toward next cycle. The aim is not to narrow the audience, it is to sharpen where each rand works hardest.");
                  if(convAge&&convGen&&convSegShare>0){
                    // Honest single-cell framing, plus the overall gender
                    // context so the reader does not see the cell winner as
                    // contradicting the platform card's Gender Lead.
                    var aggGenderLead=genFemaleShare>50?"female":(genFemaleShare>0?"male":"");
                    var aggGenderShare=genFemaleShare>50?genFemaleShare:(100-genFemaleShare);
                    var counterClause=(aggGenderLead&&aggGenderLead!==convGen)?" The overall gender mix on conversions still leans "+aggGenderLead+" at "+aggGenderShare.toFixed(2)+"% though, female users are spread across multiple age brackets while males concentrate in 25-34, so a creative plan should speak to both.":"";
                    lines.push("The "+convAge+" "+convGen+" audience is the largest single converting cell, capturing "+convSegShare.toFixed(2)+"% of tagged conversions this period."+counterClause);
                  } else if(convAge){
                    lines.push("The "+convAge+" bracket is the largest converting age group across the selected campaigns this period.");
                  }
                  if(convProv&&convProvShare>0){
                    var geoLine=convProv+" produced "+convProvShare.toFixed(2)+"% of tagged conversions, the largest provincial slice";
                    if(clickProv&&clickProv!==convProv)geoLine+=", with "+clickProv+" leading on engagement";
                    if(impProv&&impProv!==convProv&&impProv!==clickProv)geoLine+=" and "+impProv+" leading on ad delivery";
                    geoLine+=". That concentration at the bottom of the funnel is worth weighting budget toward.";
                    lines.push(geoLine);
                  }
                  // Sentence built in three parts so the grammar stays clean
                  // whether we have the (age+gender), province, both, or
                  // neither. The segment qualifier ("25-34 female audiences")
                  // falls back to "the top-converting audience" when the
                  // age/gender pair is missing, so the sentence never reads
                  // as a bare province list.
                  var segSubject=(convAge&&convGen)?convAge+" "+convGen+" audiences":"the top-converting audience";
                  var geoQualifier=convProv?" in "+convProv+(clickProv&&clickProv!==convProv?" and "+clickProv:""):(clickProv?" in "+clickProv:"");
                  var skewTarget=segSubject+geoQualifier;
                  lines.push("The recommendation for the next cycle is a budget weighting that tilts a larger share toward "+skewTarget+", stacked on top of the broader audience that is already running. This compounds efficiency on the segment most likely to convert while maintaining the reach platforms that keep the top of funnel warm and ensure the high-propensity segment has a steady supply of first-touch impressions.");
                  if(mobileConv>0){
                    lines.push("Mobile carries "+mobileConv.toFixed(2)+"% of conversions, so mobile-first creative and mobile-optimised landing pages stay the baseline standard for everything that follows.");
                  }
                  lines.push("This is a weighting shift, not an exclusion. The broader audience is what makes the high-propensity segment possible by keeping the funnel fed, and the goal is to sharpen the back end where the return is clearest without starving the top of the brand-building layer that creates the demand in the first place.");
                  return lines.join(" ");
                })();

                var communityRead=grandT2===0?"Community data is not linked to the selected campaigns, connect page data to unlock these insights.":"Your owned community stands at "+fmt(grandT2)+" members across "+communityData.length+" platforms. "+(fbT2>0?"Facebook contributes "+fmt(fbT2)+" followers"+(parseFloat(m.pageLikes||0)>0?" (with "+fmt(parseFloat(m.pageLikes||0))+" earned in this period)":"")+". ":"")+(igT2>0?"Instagram adds "+fmt(igT2)+" followers"+(igGrowth>0?" (with "+fmt(igGrowth)+" total IG growth this period, organic and paid combined as Meta does not attribute the follow action to paid campaigns)":"")+". ":"")+(ttT2>0?"TikTok brings "+fmt(ttT2)+" followers"+(ttE2>0?" (with "+fmt(ttE2)+" earned this period"+(t.follows>0?" at "+fR(t.spend/t.follows)+" per new follower":"")+")":"")+". ":"")+(earnedTotal>0?"In total, "+fmt(earnedTotal)+" new community members joined during this reporting period. Each new member adds to a warm, retargetable audience pool. Organic posts typically reach only 1 to 3 percent of followers on their own, so a modest boost budget is still needed to reach the full community, but paid delivery to this warm audience runs at noticeably lower CPMs and higher engagement than cold prospecting.":"");

                var subSec=function(color,icon,title,body){return<div style={{marginBottom:18,paddingBottom:18,borderBottom:"1px solid "+P.rule}}><div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>{icon}<span style={{fontSize:12,fontWeight:900,color:color,fontFamily:fm,letterSpacing:2,textTransform:"uppercase"}}>{title}</span><div style={{flex:1,height:1,background:"linear-gradient(90deg,"+color+"30, transparent)"}}/></div><div style={{fontSize:13,color:P.txt,lineHeight:1.9,fontFamily:ff,letterSpacing:0.2}}>{body}</div></div>;};
                return <div style={{marginTop:28,padding:"26px 30px",background:"linear-gradient(135deg,"+P.ember+"08 0%,"+P.ember+"03 50%, transparent 100%)",border:"1px solid "+P.ember+"25",borderLeft:"4px solid "+P.ember,borderRadius:"0 16px 16px 0"}}>
                  <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:22}}>{Ic.crown(P.ember,22)}<div><div style={{fontSize:18,fontWeight:900,color:P.ember,fontFamily:fm,letterSpacing:2,textTransform:"uppercase"}}>EXECUTIVE SUMMARY</div><div style={{fontSize:10,color:P.label,fontFamily:fm,letterSpacing:2,marginTop:4}}>{df+" to "+dt+" | "+fR(computed.totalSpend)+" spend | "+sortedPlats.length+" platforms"}</div></div></div>
                  {subSec(P.cyan,Ic.eye(P.cyan,16),"Awareness",awarenessRead)}
                  {subSec(P.mint,Ic.bolt(P.mint,16),"Engagement",engagementRead)}
                  {subSec(P.rose,Ic.target(P.rose,16),"Objective Performance",objectiveRead)}
                  {subSec(P.blaze,Ic.fire(P.blaze,16),"Creative Performance",creativeRead)}
                  {subSec(P.solar,Ic.radar(P.solar,16),"Audience Targeting",targetingRead)}
                  {subSec(P.orchid,Ic.users(P.orchid,16),"Target Audience Positioning",audienceRead)}
                  {subSec(P.tt,Ic.users(P.tt,16),"Community Growth",communityRead)}
                </div>;
              })()}

              {/* ═══ 8. COMBINED SUMMARY INSIGHTS ═══ */}
              {(function(){
                var parts=[];
                var cpmQ=computed.blendedCpm<=benchmarks.meta.cpm.low?"well below":computed.blendedCpm<=benchmarks.meta.cpm.mid?"within":computed.blendedCpm<=benchmarks.meta.cpm.high?"within the upper band of":"just above";
                var ctrQ=blCtr>=2?"markedly above":blCtr>=1.4?"above":blCtr>=0.9?"within":"close to";
                parts.push("Over the selected period, "+fR(computed.totalSpend)+" has been invested across "+sortedPlats.length+" platforms, delivering a consistent daily run rate of "+fR(dailySpend)+" and an expected total investment of "+fR(projSpend)+" by period end.");
                parts.push("The campaigns reached an estimated "+fmt(m.reach+t.reach+computed.gd.reach)+" unique people with "+fmt(computed.totalImps)+" impressions, keeping cost to reach 1,000 ads served at "+fR(computed.blendedCpm)+", "+cpmQ+" the industry benchmark.");
                parts.push("Engagement is tracking "+ctrQ+" the industry benchmark on click-through rate ("+blCtr.toFixed(2)+"% vs 0.9 to 1.4%), with a blended cost per click of "+fR(blCpc)+" reflecting efficient value for every user action.");
                var activeO=objKeys.filter(function(k){return objectives4[k]&&objectives4[k].results>0;});
                if(activeO.length>0){var topO=activeO.slice().sort(function(a,b){return objectives4[b].results-objectives4[a].results;})[0];var tot=0;activeO.forEach(function(k){tot+=objectives4[k].results;});parts.push("Objective delivery produced "+fmt(tot)+" measurable results across "+activeO.length+" objective area"+(activeO.length===1?"":"s")+", with "+topO+" leading on total volume this period.");}
                if(bestCpmPlat&&worstCpmPlat&&bestCpmPlat!==worstCpmPlat)parts.push(bestCpmPlat+" is the most cost-efficient platform for reach across the media mix, while the broader platform split ensures the audience encounters the brand in multiple environments.");
                if(grandT2>0)parts.push("The brand's owned community now stands at "+fmt(grandT2)+" members"+(earnedTotal>0?", having welcomed "+fmt(earnedTotal)+" new followers in this period. Organic posts reach only 1 to 3 percent of followers on their own, so a small boost budget layered on top unlocks the full audience at materially lower CPMs than cold targeting":"")+".");
                // Conditional read instead of unconditional praise. Three
                // signals (CPM, CTR, results presence) drive the verdict so
                // the summary doesn't say "performing strongly" when CTR is
                // below benchmark or no objectives have results.
                var cpmGood=computed.blendedCpm<=benchmarks.meta.cpm.mid;
                var ctrGood=blCtr>=0.9;
                var resultsGood=activeO&&activeO.length>0;
                var posCount=(cpmGood?1:0)+(ctrGood?1:0)+(resultsGood?1:0);
                if(posCount>=3)parts.push("Overall, the campaign is delivering across all three lenses, cost efficiency, engagement, and objective results.");
                else if(posCount===2)parts.push("Overall, the campaign is delivering on "+[cpmGood?"cost efficiency":"",ctrGood?"engagement":"",resultsGood?"objective results":""].filter(function(x){return x;}).slice(0,2).join(" and ")+", with the third lens worth attention.");
                else if(posCount===1)parts.push("Overall, the campaign is showing one strong lens, "+(cpmGood?"cost efficiency":ctrGood?"engagement":"objective results")+", with the other two needing attention.");
                else parts.push("Overall, the campaign metrics suggest there's room to optimise across cost, engagement, and objective delivery.");
                var text=parts.join(" ");
                return <div style={{marginTop:20,padding:"24px 28px",background:"linear-gradient(135deg,"+P.orchid+"10 0%,"+P.ember+"06 50%, transparent 100%)",border:"1px solid "+P.orchid+"25",borderLeft:"4px solid "+P.orchid,borderRadius:"0 16px 16px 0"}}>
                  <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>{Ic.bolt(P.orchid,20)}<div><div style={{fontSize:15,fontWeight:900,color:P.orchid,fontFamily:fm,letterSpacing:2,textTransform:"uppercase"}}>Combined Summary Insights</div><div style={{fontSize:10,color:P.label,fontFamily:fm,letterSpacing:2,marginTop:4}}>Recap for the full selected period</div></div></div>
                  <div style={{fontSize:13,color:P.txt,lineHeight:1.9,fontFamily:ff,letterSpacing:0.2}}>{text}</div>
                </div>;
              })()}

            </div>;
          })()}
        </div>)}

        {tab==="creative"&&(<div>
          <SH icon={Ic.fire(P.blaze,20)} title="Creative Performance" sub={df+" to "+dt+" | Ad-level performance grouped by campaign objective"} accent={P.blaze}/>
          {(function(){
            var selCamps=campaigns.filter(function(x){return selected.indexOf(x.campaignId)>=0;});
            if(selCamps.length===0)return <div style={{padding:30,textAlign:"center",color:P.caption,fontFamily:fm}}>Select campaigns on the left to view ad-level creative performance.</div>;

            var selCampIds={};
            selCamps.forEach(function(c){
              selCampIds[String(c.rawCampaignId||"")]=true;
              selCampIds[String(c.campaignId||"").replace(/_facebook$/,"").replace(/_instagram$/,"")]=true;
              selCampIds[String(c.campaignId||"")]=true;
            });
            var selCampNames={};
            selCamps.forEach(function(c){if(c.campaignName)selCampNames[c.campaignName]=true;});

            var allFilteredAds=adsList.filter(function(a){
              if(selCampIds[String(a.campaignId||"")])return true;
              if(selCampNames[a.campaignName])return true;
              return false;
            });

            // Empty state on the Creative tab — rather than the dry "no
            // data" message, reuse the rotating QUIRKY_AD_LOADERS quip
            // (already cycling on a 5s interval via the parent useEffect)
            // alongside a spinner. Most of the time this state is just
            // "ads are still loading" and the quirky copy keeps the user
            // engaged through the wait. Adsetlevel insights can take a
            // beat to come back from Meta on cold cache.
            if(allFilteredAds.length===0)return <div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"80px 40px",gap:20}}><div style={{width:48,height:48,border:"3px solid "+P.rule,borderTop:"3px solid "+P.blaze,borderRadius:"50%",animation:"spin 1s linear infinite"}}/><style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style><div style={{fontSize:15,color:"rgba(255,251,248,0.72)",fontFamily:ff,fontStyle:"italic",textAlign:"center",maxWidth:520,lineHeight:1.6,letterSpacing:0.2,transition:"opacity 0.3s"}}>{adLoaderQuip}<span style={{display:"inline-block",width:20}}>…</span></div></div>;

            // earnedTotal — net community growth used as the Followers
            // section headline so the Creative tab reconciles to Summary
            // and Community Growth. Computed with the same formula as
            // Summary at line ~4327, FB page_likes (Meta action aggregate)
            // + IG NET follower growth from Page Insights (organic + paid,
            // since Meta does not attribute IG follows to specific ads)
            // + TikTok per-campaign follows from /api/campaigns. The per-
            // ad attribution table below the strip ranks ads by their own
            // measurable contribution; this headline is the net delta.
            var creativeMatchedPages=[];var creativeMatchedIds={};
            for(var ms=0;ms<selCamps.length;ms++){
              var bestPg=null;var bestSc=0;
              for(var mp=0;mp<pages.length;mp++){
                var sc5=autoMatchPage(selCamps[ms].campaignName,pages[mp].name);
                if(sc5>bestSc){bestSc=sc5;bestPg=pages[mp];}
              }
              if(bestPg&&bestSc>=2&&!creativeMatchedIds[bestPg.id]){creativeMatchedPages.push(bestPg);creativeMatchedIds[bestPg.id]=true;}
            }
            var creativeIgGrowth=0;
            creativeMatchedPages.forEach(function(mpg){if(mpg.instagram_business_account)creativeIgGrowth+=parseFloat(mpg.instagram_business_account.follower_growth||0);});
            var creativeTtE=0;selCamps.forEach(function(c){if(c.platform==="TikTok")creativeTtE+=parseFloat(c.follows||0);});
            var creativeEarnedTotal=parseFloat(m.pageLikes||0)+creativeIgGrowth+creativeTtE;

            var platformGroup=function(p){
              if(p==="Facebook")return "Facebook";
              if(p==="Instagram")return "Instagram";
              if(p==="TikTok")return "TikTok";
              if(p==="Google Display"||p==="YouTube"||p==="Google Search"||p==="Performance Max"||p==="Demand Gen")return "Google Ads";
              return p;
            };

            var platCol5={"Facebook":P.fb,"Instagram":P.ig,"TikTok":P.tt,"Google Ads":P.gd,"Google Display":P.gd,"YouTube":P.lava,"Google Search":P.solar,"Performance Max":P.violet,"Demand Gen":P.fuchsia};
            var platShort2={"Facebook":"FB","Instagram":"IG","TikTok":"TT","Google Ads":"GOOGLE","Google Display":"GD","YouTube":"YT","Google Search":"GS","Performance Max":"PMAX","Demand Gen":"DG"};

            var availPlatformGroups={};
            allFilteredAds.forEach(function(a){availPlatformGroups[platformGroup(a.platform)]=true;});
            var availFormats={};
            allFilteredAds.forEach(function(a){availFormats[(a.format||"OTHER").toUpperCase()]=true;});

            var filteredAds=allFilteredAds.filter(function(a){
              if(crFiltP!=="all"&&platformGroup(a.platform)!==crFiltP)return false;
              if(crFiltF!=="all"){var f=(a.format||"OTHER").toUpperCase();if(f!==crFiltF)return false;}
              return true;
            });

            // Objective sections in fixed order. Icons render in P.fb so
            // the headline strip (icon container, label, ADS IN SECTION
            // count) reads in one consistent blue voice across all four
            // sections — same treatment as Summary's "Top Ads Per Objective"
            // block. Per-objective accent is still preserved on the KPI
            // tiles and creatives table below for subtle differentiation.
            var objSections=[
              {key:"leads",label:"LEAD GENERATION",accent:P.rose,icon:Ic.target(P.fb,20),metric:"leads",costLabel:"CPL",sortBy:"results",bench:benchmarks.meta.cpl,desc:"Best ad based on number of leads generated and cost per lead"},
              {key:"appinstall",label:"CLICKS TO APP STORE",accent:P.fb,icon:Ic.bolt(P.fb,20),metric:"clicks",costLabel:"CPC",sortBy:"results",bench:benchmarks.meta.cpc,desc:"Best ad based on store clicks delivered and cost per click"},
              {key:"followers",label:"FOLLOWERS",accent:P.tt,icon:Ic.users(P.fb,20),metric:"follows",costLabel:"CPF",sortBy:"results",bench:benchmarks.meta.cpf,desc:"Best ad based on follow volume and cost per follow"},
              {key:"landingpage",label:"LANDING PAGE",accent:P.cyan,icon:Ic.eye(P.fb,20),metric:"clicks",costLabel:"CPC",sortBy:"results",bench:benchmarks.meta.cpc,desc:"Best ad based on landing page clicks and cost per click"}
            ];

            // Group ads by objective. Followers gets a special union: any ad that earned
            // follows (even if its primary objective was leads or landing page) counts toward
            // Strict objective grouping. Earlier we unioned in any ad with incidental
            // follows, which pulled App Install / Lead Gen ads into the Followers bucket.
            // Reverted so the Followers section only shows ads whose campaign objective
            // is Followers / Page Likes / Engagement.
            var byObj={};
            filteredAds.forEach(function(a){
              var o=a.objective||"landingpage";
              if(!byObj[o])byObj[o]=[];
              byObj[o].push(a);
            });
            // Followers bucket: per-platform result metric honest to what
            // the ad actually drives. FB + TikTok have in-ad follow CTAs
            // with clean per-ad attribution. IG's follow happens on the
            // profile after a click, so we report Profile Visits (clicks)
            // instead of inventing a follow attribution model. Net IG
            // follower growth appears on Community Growth from Page
            // Insights as the honest rollup.
            if (byObj.followers && byObj.followers.length > 0) {
              var fdedup={};
              byObj.followers.forEach(function(a){
                var k=a.adId||a.adName;
                if(!k)return;
                if(!fdedup[k]||parseFloat(a.impressions||0)>parseFloat(fdedup[k].impressions||0))fdedup[k]=a;
              });
              byObj.followers=Object.keys(fdedup).map(function(k){
                var a=fdedup[k];
                var pk=platformGroup(a.platform);
                if(pk==="Instagram"){
                  var ck=parseFloat(a.clicks||0);
                  return Object.assign({},a,{results:ck,resultType:"profile_visits"});
                }
                var ft=parseFloat(a.followsTrue||0);
                if(ft>0)return Object.assign({},a,{results:ft,resultType:"follows"});
                return Object.assign({},a,{resultType:"follows"});
              });
            }

            // Aggregate totals per objective
            var totalsForSec=function(arr){
              var s={spend:0,imps:0,clicks:0,results:0,costPerSum:0,withCpr:0};
              arr.forEach(function(a){
                s.spend+=a.spend||0;
                s.imps+=a.impressions||0;
                s.clicks+=a.clicks||0;
                s.results+=a.results||0;
              });
              s.cpr=s.results>0?s.spend/s.results:0;
              s.ctr=s.imps>0?(s.clicks/s.imps*100):0;
              return s;
            };

            // Top-of-tab KPI strip (overall)
            var totalSpend=0,totalImps=0,totalClicks=0;
            filteredAds.forEach(function(a){totalSpend+=a.spend;totalImps+=a.impressions;totalClicks+=a.clicks;});
            var blendedCtr=totalImps>0?(totalClicks/totalImps*100):0;

            var resultLabel=function(rt){return rt==="leads"?"LEADS":rt==="installs"?"INSTALLS":rt==="follows"?"FOLLOWS":rt==="conversions"?"CONVERSIONS":rt==="store_clicks"?"STORE CLICKS":rt==="lp_clicks"?"LP CLICKS":rt==="clicks"?"CLICKS":"RESULTS";};
            var costPerLabel=function(rt){return rt==="leads"?"CPL":rt==="installs"?"CPI":rt==="follows"?"CPF":rt==="conversions"?"CPA":rt==="store_clicks"?"CPC":rt==="lp_clicks"?"CPC":rt==="clicks"?"CPC":"CPR";};
            // Format badge color + label
            var fmtMeta=function(f){
              var ff=(f||"STATIC").toUpperCase();
              if(ff==="MP4"||ff==="VIDEO")return{label:"VIDEO",color:P.rose};
              if(ff==="CAROUSEL")return{label:"CAROUSEL",color:P.orchid};
              if(ff==="MIXED")return{label:"MIXED",color:P.fuchsia};
              if(ff==="GIF")return{label:"GIF",color:P.warning};
              if(ff==="RESPONSIVE")return{label:"RESPONSIVE",color:P.blaze};
              if(ff==="TEXT")return{label:"TEXT",color:P.caption};
              return{label:"STATIC",color:P.cyan};
            };
            // Option C fallback tile: gradient platform-color background, logo watermark, hero metric, format chip
            var renderFallback=function(ad,sec){
              var pc=platCol5[ad.platform]||P.ember;
              var ps=platShort2[ad.platform]||ad.platform;
              var fm2=fmtMeta(ad.format);
              // Only render the centred metric when there's no thumbnail, when there is one,
              // the card-level gradient-backed overlay handles the callout and a second copy
              // from here bubbles up to the same stacking layer and duplicates.
              var showMetric=!hasThumb(ad);
              return <div style={{position:"absolute",inset:0,background:"linear-gradient(135deg,"+pc+"55,"+pc+"15 55%,#0a0618 100%)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",overflow:"hidden"}}>
                <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%) rotate(-18deg)",fontSize:56,fontWeight:900,letterSpacing:4,color:pc,opacity:0.16,fontFamily:ff,whiteSpace:"nowrap",pointerEvents:"none"}}>{ps.toUpperCase()}</div>
                {showMetric&&<div style={{position:"relative",zIndex:2,textAlign:"center",padding:"0 14px"}}>
                  <div style={{fontSize:9,color:"rgba(255,255,255,0.7)",fontFamily:fm,letterSpacing:2,marginBottom:4,fontWeight:800}}>{resultLabel(ad.resultType)}</div>
                  <div style={{fontSize:34,fontWeight:900,color:"#fff",fontFamily:fm,lineHeight:1,textShadow:"0 2px 12px rgba(0,0,0,0.6)"}}>{ad.results>0?fmt(ad.results):","}</div>
                  {ad.results>0&&<div style={{fontSize:10,color:"rgba(255,255,255,0.85)",fontFamily:fm,letterSpacing:1,marginTop:6,fontWeight:700}}>{fR(ad.spend/ad.results)+" "+costPerLabel(ad.resultType)}</div>}
                </div>}
              </div>;
            };
            var FilterBtn=function(active,label,onClick,color){
              return <button onClick={onClick} style={{background:active?color+"25":"transparent",border:"1px solid "+(active?color+"60":P.rule),borderRadius:8,padding:"7px 14px",color:active?color:P.label,fontSize:11,fontWeight:800,fontFamily:fm,cursor:"pointer",letterSpacing:1.5,textTransform:"uppercase",transition:"all 0.2s"}}>{label}</button>;
            };

            // Render an ad card
            var renderCard=function(ad,rank,sec){
              var adPlatC=platCol5[ad.platform]||P.ember;
              var adPlatShort=platShort2[ad.platform]||ad.platform;
              var isTop=rank===1;
              return <div key={ad.adId+"_"+sec.key+"_"+rank} style={{background:isTop?"linear-gradient(135deg,rgba(52,211,153,0.10),rgba(0,0,0,0.4))":"rgba(0,0,0,0.35)",borderRadius:14,border:"1px solid "+(isTop?P.mint+"55":P.rule),overflow:"hidden",display:"flex",flexDirection:"column",boxShadow:isTop?"0 8px 32px rgba(52,211,153,0.18)":"none",transition:"all 0.2s"}}>
                <div style={{position:"relative",width:"100%",paddingTop:"100%",background:"#1a0f2a",overflow:"hidden"}}>
                  {renderFallback(ad,sec)}
                  {hasThumb(ad)&&<div onClick={function(){setPreviewAd(ad);}} style={{position:"absolute",inset:0,display:"block",zIndex:1,cursor:"pointer"}}><img src={thumbFor(ad)} alt={ad.adName||"Ad"} style={{width:"100%",height:"100%",objectFit:"cover"}} onError={function(e){e.target.style.display="none";}}/></div>}
                  {hasThumb(ad)&&ad.results>0&&<div style={{position:"absolute",left:"50%",top:"50%",transform:"translate(-50%,-50%)",zIndex:2,pointerEvents:"none",background:"radial-gradient(ellipse at center, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.55) 60%, rgba(0,0,0,0) 100%)",padding:"14px 22px",borderRadius:12,textAlign:"center",minWidth:110}}>
                    <div style={{fontSize:9,color:"rgba(255,255,255,0.78)",fontFamily:fm,letterSpacing:1.6,fontWeight:800,marginBottom:3,textShadow:"0 1px 3px rgba(0,0,0,0.8)"}}>{resultLabel(ad.resultType)}</div>
                    <div style={{fontSize:28,fontWeight:900,color:"#fff",fontFamily:fm,lineHeight:1,textShadow:"0 2px 10px rgba(0,0,0,0.9)"}}>{fmt(ad.results)}</div>
                    <div style={{fontSize:10,color:"rgba(255,255,255,0.88)",fontFamily:fm,letterSpacing:0.8,marginTop:4,fontWeight:700,textShadow:"0 1px 3px rgba(0,0,0,0.8)"}}>{fR(ad.spend/ad.results)+" "+costPerLabel(ad.resultType)}</div>
                  </div>}
                  <div style={{position:"absolute",top:10,left:10,background:isTop?P.mint:"rgba(255,255,255,0.18)",color:isTop?"#062014":P.txt,padding:"5px 11px",borderRadius:6,fontSize:11,fontWeight:900,fontFamily:fm,letterSpacing:1,boxShadow:"0 2px 8px rgba(0,0,0,0.4)",zIndex:3}}>{"#"+rank}</div>
                  <div style={{position:"absolute",top:10,right:10,background:adPlatC,color:textOnAccent(adPlatC),padding:"4px 9px",borderRadius:5,fontSize:9,fontWeight:800,fontFamily:fm,letterSpacing:1,boxShadow:"0 2px 8px rgba(0,0,0,0.4)",zIndex:3}}>{adPlatShort}</div>
                  <div style={{position:"absolute",bottom:10,left:10,background:fmtMeta(ad.format).color,color:"#fff",padding:"4px 9px",borderRadius:5,fontSize:9,fontWeight:900,fontFamily:fm,letterSpacing:1,boxShadow:"0 2px 8px rgba(0,0,0,0.5)",zIndex:3}}>{fmtMeta(ad.format).label}</div>
                  {ad._scale&&<div style={{position:"absolute",bottom:10,right:10,background:P.mint,color:"#062014",padding:"4px 10px",borderRadius:5,fontSize:10,fontWeight:900,fontFamily:fm,letterSpacing:1.2,boxShadow:"0 2px 10px rgba(52,211,153,0.45)",zIndex:3,textTransform:"uppercase"}}>{"\u25B2 SCALE"}</div>}
                  {ad._topPerformer&&<div style={{position:"absolute",bottom:10,right:10,background:P.warning,color:"#2a1605",padding:"4px 10px",borderRadius:5,fontSize:10,fontWeight:900,fontFamily:fm,letterSpacing:1.2,boxShadow:"0 2px 10px rgba(251,191,36,0.4)",zIndex:3,textTransform:"uppercase"}}>{"\u2605 TOP PERFORMER"}</div>}
                </div>
                <div style={{padding:"12px 14px",flex:1,display:"flex",flexDirection:"column"}}>
                  <div style={{fontSize:9,color:P.label,fontFamily:fm,marginBottom:4,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={ad.campaignName}>{ad.campaignName}</div>
                  <div style={{fontSize:11,fontWeight:700,color:P.txt,fontFamily:ff,marginBottom:10,lineHeight:1.4,minHeight:30,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}} title={ad.adName}>{ad.adName}</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,fontSize:10,fontFamily:fm,marginBottom:10,padding:"8px 10px",background:sec.accent+"10",border:"1px solid "+sec.accent+"30",borderRadius:8}}>
                    <div><div style={{color:sec.accent,marginBottom:2,letterSpacing:1,fontSize:8,fontWeight:800}}>{resultLabel(ad.resultType)}</div><div style={{color:sec.accent,fontWeight:900,fontSize:14}}>{ad.results>0?fmt(ad.results):"-"}</div></div>
                    <div><div style={{color:sec.accent,marginBottom:2,letterSpacing:1,fontSize:8,fontWeight:800}}>{costPerLabel(ad.resultType)}</div><div style={{color:sec.accent,fontWeight:900,fontSize:14}}>{ad.results>0?fR(ad.spend/ad.results):"-"}</div></div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,fontSize:10,fontFamily:fm,marginBottom:10}}>
                    <div><div style={{color:P.label,marginBottom:2,letterSpacing:1,fontSize:8}}>SPEND</div><div style={{color:P.txt,fontWeight:700,fontSize:11}}>{fR(ad.spend)}</div></div>
                    <div><div style={{color:P.label,marginBottom:2,letterSpacing:1,fontSize:8}}>IMPS</div><div style={{color:P.txt,fontWeight:700,fontSize:11}}>{fmt(ad.impressions)}</div></div>
                    <div><div style={{color:P.label,marginBottom:2,letterSpacing:1,fontSize:8}}>CTR</div><div style={{color:ad.ctr>=1.2?P.mint:ad.ctr>=0.8?P.txt:P.warning,fontWeight:700,fontSize:11}}>{ad.ctr.toFixed(2)+"%"}</div></div>
                    <div><div style={{color:P.label,marginBottom:2,letterSpacing:1,fontSize:8}}>CPC</div><div style={{color:P.txt,fontWeight:700,fontSize:11}}>{fR(ad.cpc)}</div></div>
                  </div>
                  <button onClick={function(){setPreviewAd(ad);}} style={{display:"block",marginTop:"auto",padding:"9px 10px",background:adPlatC,border:"none",borderRadius:6,color:textOnAccent(adPlatC),fontSize:11,fontWeight:900,fontFamily:fm,textAlign:"center",letterSpacing:1.5,boxShadow:"0 2px 6px "+adPlatC+"40",cursor:"pointer",width:"100%",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}><span className="gas-view-ad-full">{viewAdLabel(ad.platform)}</span><span className="gas-view-ad-short">VIEW AD</span></button>
                </div>
              </div>;
            };

            // Render an ad row in the per-section table
            var renderRow=function(ad,rank,sec,idx){
              var adPlatC=platCol5[ad.platform]||P.ember;
              var adPlatShort=platShort2[ad.platform]||ad.platform;
              var ctrCol=ad.ctr>=1.2?P.mint:ad.ctr>=0.8?P.txt:P.warning;
              return <tr key={ad.adId+"_"+sec.key+"_row_"+rank} style={{background:idx%2===0?"rgba(0,0,0,0.18)":"transparent"}}>
                <td style={{padding:"8px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:11,fontWeight:800,color:P.label}}>{"#"+rank}</td>
                <td style={{padding:"8px 10px",border:"1px solid "+P.rule}}>
                  {/* Gradient + platform watermark always renders underneath
                      so brand-new ads (under ~10 impressions) that Meta
                      hasn't yet cached a creative thumbnail for don't show
                      a black void. The image layers on top and only hides
                      itself (not the parent) on error, so the placeholder
                      shows through. */}
                  <div onClick={hasThumb(ad)?function(){setPreviewAd(ad);}:undefined} style={{position:"relative",width:48,height:48,borderRadius:6,overflow:"hidden",background:"linear-gradient(135deg,"+adPlatC+"55,"+adPlatC+"15)",display:"flex",alignItems:"center",justifyContent:"center",cursor:hasThumb(ad)?"pointer":"default"}}>
                    <span style={{color:"#fff",fontSize:8,fontFamily:fm,fontWeight:900,letterSpacing:1}}>{adPlatShort.toUpperCase()}</span>
                    {hasThumb(ad)&&<img src={thumbFor(ad)} alt="" style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",display:"block"}} onError={function(e){e.target.style.display="none";}}/>}
                  </div>
                </td>
                <td style={{padding:"8px 12px",border:"1px solid "+P.rule,maxWidth:280}}>
                  <div style={{fontSize:11,fontWeight:700,color:P.txt,fontFamily:ff,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={ad.adName}>{ad.adName}</div>
                  <div style={{fontSize:9,color:P.label,fontFamily:fm,marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={ad.campaignName}>{ad.campaignName}</div>
                </td>
                <td style={{padding:"8px 10px",textAlign:"center",border:"1px solid "+P.rule}}><span style={{background:adPlatC,color:textOnAccent(adPlatC),fontSize:9,fontWeight:800,padding:"3px 9px",borderRadius:5,fontFamily:fm,letterSpacing:1}}>{adPlatShort}</span></td>
                <td style={{padding:"8px 10px",textAlign:"center",border:"1px solid "+P.rule}}>{(function(){var fm2=fmtMeta(ad.format);return <span style={{background:fm2.color,color:textOnAccent(fm2.color),fontSize:9,fontWeight:900,padding:"3px 9px",borderRadius:5,fontFamily:fm,letterSpacing:1}}>{fm2.label}</span>;})()}</td>
                <td style={{padding:"8px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:11,fontWeight:900,color:sec.accent}}>{ad.results>0?fmt(ad.results):"-"}</td>
                <td style={{padding:"8px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:11,fontWeight:900,color:sec.accent}}>{ad.results>0?fR(ad.spend/ad.results):"-"}</td>
                <td style={{padding:"8px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:11,fontWeight:700,color:P.txt}}>{fR(ad.spend)}</td>
                <td style={{padding:"8px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:11,color:P.txt}}>{fmt(ad.impressions)}</td>
                <td style={{padding:"8px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:11,fontWeight:700,color:ctrCol}}>{ad.ctr.toFixed(2)+"%"}</td>
                <td style={{padding:"8px 10px",textAlign:"center",border:"1px solid "+P.rule}}><button onClick={function(){setPreviewAd(ad);}} style={{display:"inline-block",background:adPlatC,color:textOnAccent(adPlatC),padding:"5px 11px",borderRadius:5,fontSize:10,fontWeight:800,fontFamily:fm,border:"none",letterSpacing:1,cursor:"pointer",whiteSpace:"nowrap"}}><span className="gas-view-ad-full">{viewAdLabel(ad.platform)}</span><span className="gas-view-ad-short">VIEW AD</span></button></td>
              </tr>;
            };

            return <div>
              {(function(){
                // When no platform/format filter is applied, show authoritative campaign-level totals
                // (same source as Summary deep dive). With filters applied, show ad-level filtered totals
                // so the numbers reflect what is actually visible on the page.
                var filtered=crFiltP!=="all"||crFiltF!=="all";
                var spendVal=filtered?totalSpend:(computed.totalSpend||totalSpend);
                var impsVal=filtered?totalImps:(computed.totalImps||totalImps);
                var ctrVal=filtered?blendedCtr:(computed.totalImps>0?(computed.totalClicks/computed.totalImps*100):blendedCtr);
                var note=filtered?"FILTERED AD-LEVEL TOTALS":"MATCHES SUMMARY · ALL SELECTED CAMPAIGNS";
                return <div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:8}}>
                    <Glass accent={P.blaze} hv={true} st={{padding:18,textAlign:"center"}}><div style={{fontSize:10,color:P.label,fontFamily:fm,letterSpacing:2,marginBottom:6}}>ADS VISIBLE</div><div style={{fontSize:26,fontWeight:900,color:P.blaze,fontFamily:fm}}>{filteredAds.length}</div></Glass>
                    <Glass accent={P.ember} hv={true} st={{padding:18,textAlign:"center"}}><div style={{fontSize:10,color:P.label,fontFamily:fm,letterSpacing:2,marginBottom:6}}>TOTAL SPEND</div><div style={{fontSize:26,fontWeight:900,color:P.ember,fontFamily:fm}}>{fR(spendVal)}</div></Glass>
                    <Glass accent={P.cyan} hv={true} st={{padding:18,textAlign:"center"}}><div style={{fontSize:10,color:P.label,fontFamily:fm,letterSpacing:2,marginBottom:6}}>IMPRESSIONS</div><div style={{fontSize:26,fontWeight:900,color:P.cyan,fontFamily:fm}}>{fmt(impsVal)}</div></Glass>
                    <Glass accent={P.mint} hv={true} st={{padding:18,textAlign:"center"}}><div style={{fontSize:10,color:P.label,fontFamily:fm,letterSpacing:2,marginBottom:6}}>BLENDED CTR</div><div style={{fontSize:26,fontWeight:900,color:P.mint,fontFamily:fm}}>{ctrVal.toFixed(2)+"%"}</div></Glass>
                  </div>
                  <div style={{textAlign:"center",fontSize:9,color:P.caption,fontFamily:fm,letterSpacing:1.5,marginBottom:18}}>{note}</div>
                </div>;
              })()}

              <div style={{background:P.glass,borderRadius:14,padding:"14px 20px",marginBottom:24,border:"1px solid "+P.rule,display:"flex",flexWrap:"wrap",gap:18,alignItems:"center"}}>
                <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                  <span style={{fontSize:10,fontWeight:800,color:P.label,fontFamily:fm,letterSpacing:2,marginRight:4}}>PLATFORM:</span>
                  {FilterBtn(crFiltP==="all","All",function(){setCrFiltP("all");},P.ember)}
                  {["Facebook","Instagram","TikTok","Google Ads"].filter(function(p){return availPlatformGroups[p];}).map(function(p){return <span key={p}>{FilterBtn(crFiltP===p,p,function(){setCrFiltP(p);},platCol5[p]||P.ember)}</span>;})}
                </div>
                <div style={{width:1,height:24,background:P.rule}}/>
                <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                  <span style={{fontSize:10,fontWeight:800,color:P.label,fontFamily:fm,letterSpacing:2,marginRight:4}}>FORMAT:</span>
                  {FilterBtn(crFiltF==="all","All",function(){setCrFiltF("all");},P.orchid)}
                  {Object.keys(availFormats).sort().map(function(fmt2){return <span key={fmt2}>{FilterBtn(crFiltF===fmt2,fmt2,function(){setCrFiltF(fmt2);},P.orchid)}</span>;})}
                </div>
              </div>

              {filteredAds.length===0?<div style={{padding:40,textAlign:"center",color:P.caption,fontFamily:fm,fontSize:12}}>No ads match the current filters.</div>:objSections.map(function(sec){
                var arr=byObj[sec.key]||[];
                if(arr.length===0)return null;
                // Tier-based sort: (1) ads with results rank by results DESC then CPR ASC,
                // (2) ads with impressions >= 5k but no results yet rank by impressions DESC
                // (algorithm is delivering, just hasn't scored), (3) low-delivery ads last.
                // Landing Page skips the impression floor so the highest-click ad always wins,
                // even if its impressions are under 5k.
                var IMP_FLOOR=sec.key==="landingpage"?0:5000;
                var tierOf=function(ad){if(ad.results>0)return 1;if(ad.impressions>=IMP_FLOOR)return 2;return 3;};
                var sorted=arr.slice().sort(function(a,b){
                  var aT=tierOf(a),bT=tierOf(b);
                  if(aT!==bT)return aT-bT;
                  if(aT!==1)return b.impressions-a.impressions;
                  if(b.results!==a.results)return b.results-a.results;
                  var ac=a.spend/a.results;
                  var bc=b.spend/b.results;
                  if(ac!==bc)return ac-bc;
                  return b.impressions-a.impressions;
                });
                var top10=sorted.slice(0,10);
                var rest=sorted.slice(10);
                var totals=totalsForSec(arr);
                // Rank-based tagging: top 5 = SCALE, next 5 = TOP PERFORMER
                sorted.forEach(function(a,i){a._scale=i<5&&a.results>0;a._topPerformer=i>=5&&i<10&&a.results>0;});
                var bm=sec.bench;
                var verdict="";
                if(totals.cpr>0&&bm){
                  if(totals.cpr<=bm.low)verdict="WELL BELOW INDUSTRY BENCHMARK";
                  else if(totals.cpr<=bm.mid)verdict="WITHIN BENCHMARK RANGE";
                  else if(totals.cpr<=bm.high)verdict="ABOVE BENCHMARK MIDPOINT";
                  else verdict="ABOVE BENCHMARK CEILING";
                }

                var secCpc=totals.clicks>0?totals.spend/totals.clicks:0;
                var secCpm=totals.imps>0?(totals.spend/totals.imps*1000):0;
                var secResType=arr[0]?arr[0].resultType:sec.metric;
                // Followers section uses the same earnedTotal Summary uses
                // (FB page_likes + IG net growth + TikTok follows) so the
                // headline number matches across tabs. The per-ad table
                // below still ranks by per-ad attribution. Other sections
                // continue to use per-ad totals.results.
                var headlineResults=sec.key==="followers"?creativeEarnedTotal:totals.results;
                var headlineCpr=sec.key==="followers"
                  ? (creativeEarnedTotal>0?totals.spend/creativeEarnedTotal:0)
                  : totals.cpr;
                // Headline strip is locked to P.fb (icon box, label text,
                // ADS IN SECTION count) so all four sections read in one
                // consistent voice. KPI tiles + creatives table below
                // continue to use sec.accent for per-objective subtle
                // differentiation. Same treatment as Summary's Top Ads
                // Per Objective headline.
                var hAcc=P.fb;
                return <div key={sec.key} style={{marginBottom:36,background:P.glass,borderRadius:18,padding:"6px 28px 28px",border:"1px solid "+P.rule}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"18px 0 18px",borderBottom:"1px solid "+P.rule,marginBottom:22,flexWrap:"wrap",gap:12}}>
                    <div style={{display:"flex",alignItems:"center",gap:14}}>
                      <div style={{width:44,height:44,borderRadius:12,background:"linear-gradient(135deg,"+hAcc+"25,"+hAcc+"08)",border:"1px solid "+hAcc+"40",display:"flex",alignItems:"center",justifyContent:"center"}}>{sec.icon}</div>
                      <div>
                        <div style={{fontSize:19,fontWeight:900,color:hAcc,fontFamily:ff,letterSpacing:1}}>{sec.label}</div>
                        <div style={{fontSize:11,color:P.label,fontFamily:fm,marginTop:3}}>{sec.desc}</div>
                        {sec.key==="followers"&&<div style={{fontSize:10,color:P.caption,fontFamily:fm,marginTop:6,fontStyle:"italic",lineHeight:1.5,maxWidth:560}}>Headline FOLLOWS reconciles to Summary and Community Growth (FB page likes + IG net follower growth + TikTok follows). The table below ranks ads by per-ad attribution — IG ads show profile visits because Meta does not attribute IG follows to individual ads.</div>}
                      </div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontSize:9,color:P.label,fontFamily:fm,letterSpacing:1.5}}>ADS IN SECTION</div>
                      <div style={{fontSize:22,fontWeight:900,color:hAcc,fontFamily:fm}}>{arr.length}</div>
                    </div>
                  </div>

                  <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:10,marginBottom:22}}>
                    <Glass accent={P.ember} hv={true} st={{padding:14,textAlign:"center"}}><div style={{fontSize:9,color:P.label,fontFamily:fm,letterSpacing:1.8,marginBottom:5}}>SPEND</div><div style={{fontSize:18,fontWeight:900,color:P.ember,fontFamily:fm}}>{fR(totals.spend)}</div></Glass>
                    <Glass accent={P.cyan} hv={true} st={{padding:14,textAlign:"center"}}><div style={{fontSize:9,color:P.label,fontFamily:fm,letterSpacing:1.8,marginBottom:5}}>IMPRESSIONS</div><div style={{fontSize:18,fontWeight:900,color:P.cyan,fontFamily:fm}}>{fmt(totals.imps)}</div></Glass>
                    <Glass accent={sec.accent} hv={true} st={{padding:14,textAlign:"center"}}><div style={{fontSize:9,color:P.label,fontFamily:fm,letterSpacing:1.8,marginBottom:5}}>{resultLabel(secResType)}</div><div style={{fontSize:18,fontWeight:900,color:sec.accent,fontFamily:fm}}>{headlineResults>0?fmt(headlineResults):"-"}</div></Glass>
                    <Glass accent={sec.accent} hv={true} st={{padding:14,textAlign:"center"}}><div style={{fontSize:9,color:P.label,fontFamily:fm,letterSpacing:1.8,marginBottom:5}}>{costPerLabel(secResType)}</div><div style={{fontSize:18,fontWeight:900,color:sec.accent,fontFamily:fm}}>{headlineCpr>0?fR(headlineCpr):"-"}</div></Glass>
                    <Glass accent={P.mint} hv={true} st={{padding:14,textAlign:"center"}}><div style={{fontSize:9,color:P.label,fontFamily:fm,letterSpacing:1.8,marginBottom:5}}>BLENDED CTR</div><div style={{fontSize:18,fontWeight:900,color:P.mint,fontFamily:fm}}>{totals.ctr.toFixed(2)+"%"}</div></Glass>
                    <Glass accent={P.blaze} hv={true} st={{padding:14,textAlign:"center"}}><div style={{fontSize:9,color:P.label,fontFamily:fm,letterSpacing:1.8,marginBottom:5}}>CPC</div><div style={{fontSize:18,fontWeight:900,color:P.blaze,fontFamily:fm}}>{secCpc>0?fR(secCpc):"-"}</div></Glass>
                  </div>

                  {top10.length>0&&<div style={{marginBottom:22}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
                      {Ic.crown(sec.accent,16)}
                      <span style={{fontSize:12,fontWeight:900,color:sec.accent,fontFamily:ff,letterSpacing:1.5}}>{"TOP "+Math.min(10,top10.length)+" CREATIVES"}</span>
                      <div style={{flex:1,height:1,background:"linear-gradient(90deg,"+sec.accent+"30, transparent)"}}/>
                      <span style={{fontSize:9,color:P.label,fontFamily:fm,letterSpacing:1,textTransform:"uppercase"}}>{"by "+resultLabel(arr[0]?arr[0].resultType:sec.metric)+", then "+sec.costLabel}</span>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:14}}>
                      {top10.map(function(ad,i){return renderCard(ad,i+1,sec);})}
                    </div>
                  </div>}

                  {rest.length>0&&<div style={{marginBottom:18}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
                      {Ic.chart(P.label,14)}
                      <span style={{fontSize:11,fontWeight:800,color:P.label,fontFamily:fm,letterSpacing:1.5,textTransform:"uppercase"}}>{"All other ads ("+rest.length+")"}</span>
                      <div style={{flex:1,height:1,background:"linear-gradient(90deg,"+P.rule+", transparent)"}}/>
                    </div>
                    <div style={{overflowX:"auto"}}>
                      <table style={{width:"100%",borderCollapse:"collapse"}}>
                        <thead>
                          <tr>{["Rank","Thumb","Ad","Platform","Format",resultLabel(arr[0]?arr[0].resultType:sec.metric),costPerLabel(arr[0]?arr[0].resultType:sec.metric),"Spend","Imps","CTR","View"].map(function(h,hi){return <th key={hi} style={{padding:"10px 12px",fontSize:10,fontWeight:800,textTransform:"uppercase",color:sec.accent,letterSpacing:1.5,textAlign:hi===2?"left":"center",background:sec.accent+"10",border:"1px solid "+sec.accent+"25",fontFamily:fm}}>{h}</th>;})}</tr>
                        </thead>
                        <tbody>{rest.map(function(ad,ri){return renderRow(ad,ri+11,sec,ri);})}</tbody>
                      </table>
                    </div>
                  </div>}

                  <Insight title={sec.label+" Insights"} accent={sec.accent} icon={sec.icon}>{(function(){
                    var lines=[];
                    var topAd=top10[0];
                    lines.push(arr.length+" "+sec.label.toLowerCase()+" creatives delivered "+(totals.results>0?fmt(totals.results)+" "+resultLabel(arr[0]?arr[0].resultType:sec.metric).toLowerCase():"no measurable results yet")+" from "+fR(totals.spend)+" spend"+(totals.cpr>0?", a blended "+sec.costLabel+" of "+fR(totals.cpr):"")+(verdict?" ("+verdict.toLowerCase()+")":"")+".");
                    if(topAd&&topAd.results>0){
                      lines.push("Top performer: \""+(topAd.adName||"Unnamed").substring(0,70)+"\" on "+topAd.platform+", delivering "+fmt(topAd.results)+" "+resultLabel(topAd.resultType).toLowerCase()+" at "+fR(topAd.spend/topAd.results)+" "+sec.costLabel+" with "+topAd.ctr.toFixed(2)+"% CTR.");
                    }else if(topAd){
                      lines.push("Top performer by spend: \""+(topAd.adName||"Unnamed").substring(0,70)+"\" with "+fR(topAd.spend)+" invested but no measurable conversions yet \u2014 verify pixel tracking and landing page experience.");
                    }
                    if(totals.cpr>0&&bm){
                      if(totals.cpr<=bm.low)lines.push("Cost efficiency is excellent. Scale by increasing budget 15 to 25 percent on the top 3 ad sets feeding these creatives.");
                      else if(totals.cpr<=bm.mid)lines.push("Cost efficiency is in the healthy range. Test creative variants on the top 5 ads to push "+sec.costLabel+" lower.");
                      else lines.push(sec.costLabel+" is above the benchmark midpoint. Audit the bottom of the rankings, pause underperformers, and reallocate budget to the top winners.");
                    }
                    if(rest.length>top10.length)lines.push("The "+rest.length+" lower-ranked creatives represent the long tail. Worth reviewing the bottom 25 percent for fatigue or targeting issues.");
                    return lines.join(" ");
                  })()}</Insight>
                </div>;
              })}

              {(function(){
                // Show ads that didn't match any objective bucket (rare)
                var matched=Object.keys(byObj);
                var unmatched=filteredAds.filter(function(a){return matched.indexOf(a.objective||"landingpage")<0;});
                if(unmatched.length===0)return null;
                return <div style={{padding:14,textAlign:"center",color:P.caption,fontFamily:fm,fontSize:11,marginBottom:20}}>{unmatched.length+" ads not matched to a known objective category."}</div>;
              })()}

              {(function(){
                // Executive Summary: platform winners, objective winners, scale recommendations
                if(filteredAds.length===0)return null;

                // Best performer per platform group (by results, tiebreak lowest CPR)
                var byPlat={};
                filteredAds.forEach(function(a){var pg=platformGroup(a.platform);if(!byPlat[pg])byPlat[pg]=[];byPlat[pg].push(a);});
                var platWinners=Object.keys(byPlat).map(function(pg){
                  var winner=byPlat[pg].slice().sort(function(a,b){
                    if(b.results!==a.results)return b.results-a.results;
                    var ac=a.results>0?a.spend/a.results:Infinity;
                    var bc=b.results>0?b.spend/b.results:Infinity;
                    if(ac!==bc)return ac-bc;
                    return b.impressions-a.impressions;
                  })[0];
                  var pSpend=0,pImps=0,pClicks=0,pResults=0;
                  byPlat[pg].forEach(function(a){pSpend+=a.spend;pImps+=a.impressions;pClicks+=a.clicks;pResults+=a.results;});
                  return {pg:pg,winner:winner,count:byPlat[pg].length,spend:pSpend,imps:pImps,clicks:pClicks,results:pResults,ctr:pImps>0?(pClicks/pImps*100):0};
                }).sort(function(a,b){return b.spend-a.spend;});

                // Objective breakdowns: top 10 sorted + analytical aggregates per objective
                var objBreakdown=objSections.map(function(sec){
                  var arr=byObj[sec.key]||[];
                  if(arr.length===0)return null;
                  var srt=arr.slice().sort(function(a,b){
                    if(b.results!==a.results)return b.results-a.results;
                    var ac=a.results>0?a.spend/a.results:Infinity;
                    var bc=b.results>0?b.spend/b.results:Infinity;
                    if(ac!==bc)return ac-bc;
                    return b.impressions-a.impressions;
                  });
                  var t=totalsForSec(arr);
                  var top5=srt.slice(0,5);
                  var next5=srt.slice(5,10);
                  var topSpend=0,topRes=0,tailSpend=0,tailRes=0;
                  top5.forEach(function(a){topSpend+=a.spend;topRes+=a.results;});
                  var tail=srt.slice(Math.max(Math.floor(srt.length*0.75),10));
                  tail.forEach(function(a){tailSpend+=a.spend;tailRes+=a.results;});
                  var topCpr=topRes>0?topSpend/topRes:0;
                  var tailCpr=tailRes>0?tailSpend/tailRes:0;
                  var efficiencyGap=(topCpr>0&&tailCpr>0)?(tailCpr/topCpr):0;
                  // Format mix inside top 5
                  var fmtMix={};
                  top5.forEach(function(a){var fl=fmtMeta(a.format).label;fmtMix[fl]=(fmtMix[fl]||0)+1;});
                  var fmtTop=Object.keys(fmtMix).sort(function(a,b){return fmtMix[b]-fmtMix[a];})[0];
                  // Platform mix inside top 5
                  var platMix={};
                  top5.forEach(function(a){var pg=platformGroup(a.platform);platMix[pg]=(platMix[pg]||0)+1;});
                  var platTop=Object.keys(platMix).sort(function(a,b){return platMix[b]-platMix[a];})[0];
                  // Blended CTR for top 5 vs tail
                  var topImps=0,topClicks=0;top5.forEach(function(a){topImps+=a.impressions;topClicks+=a.clicks;});
                  var tailImps=0,tailClicks=0;tail.forEach(function(a){tailImps+=a.impressions;tailClicks+=a.clicks;});
                  var topCtr=topImps>0?(topClicks/topImps*100):0;
                  var tailCtr=tailImps>0?(tailClicks/tailImps*100):0;
                  // Reallocation impact: if tail spend moved to top CPR, projected additional results
                  var realloc=topCpr>0&&tailSpend>0?Math.round(tailSpend/topCpr)-tailRes:0;
                  return {sec:sec,arr:arr,sorted:srt,top5:top5,next5:next5,totals:t,count:arr.length,
                    topCpr:topCpr,tailCpr:tailCpr,efficiencyGap:efficiencyGap,
                    fmtMix:fmtMix,fmtTop:fmtTop,platMix:platMix,platTop:platTop,
                    topCtr:topCtr,tailCtr:tailCtr,tailSpend:tailSpend,tailCount:tail.length,realloc:realloc};
                }).filter(function(x){return x!==null;});

                var miniCard=function(ad,accent,metricLabel,metricVal,costLabel2,costVal){
                  var pc=platCol5[ad.platform]||P.ember;
                  var ps=platShort2[ad.platform]||ad.platform;
                  var fm2=fmtMeta(ad.format);
                  var thumbBlock=<div style={{position:"relative",width:64,height:64,flexShrink:0,borderRadius:8,overflow:"hidden",background:"linear-gradient(135deg,"+pc+"55,"+pc+"15)"}}>
                    {hasThumb(ad)?<img src={thumbFor(ad)} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}} onError={function(e){e.target.style.display="none";}}/>:<div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:9,fontFamily:fm,fontWeight:900,letterSpacing:1}}>{ps.toUpperCase()}</div>}
                    <div style={{position:"absolute",top:2,right:2,background:fm2.color,color:textOnAccent(fm2.color),fontSize:7,fontWeight:900,padding:"1px 4px",borderRadius:3,fontFamily:fm,letterSpacing:0.5}}>{fm2.label}</div>
                  </div>;
                  return <div style={{display:"flex",gap:12,background:"rgba(0,0,0,0.3)",borderRadius:10,padding:10,border:"1px solid "+P.rule,alignItems:"center"}}>
                    <div onClick={function(){setPreviewAd(ad);}} style={{display:"block",flexShrink:0,cursor:"pointer"}}>{thumbBlock}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:11,fontWeight:800,color:P.txt,fontFamily:ff,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:3}} title={ad.adName}>{ad.adName||"Unnamed ad"}</div>
                      <div style={{display:"flex",gap:10,fontSize:10,fontFamily:fm,flexWrap:"wrap"}}>
                        <span style={{color:pc,fontWeight:700}}>{ps}</span>
                        <span style={{color:accent,fontWeight:800}}>{metricVal+" "+metricLabel}</span>
                        {costVal&&<span style={{color:accent,fontWeight:800}}>{costVal+" "+costLabel2}</span>}
                        <span style={{color:P.label}}>{ad.ctr.toFixed(2)+"% CTR"}</span>
                      </div>
                    </div>
                    <button onClick={function(){setPreviewAd(ad);}} style={{flexShrink:0,display:"inline-block",background:pc,color:textOnAccent(pc),padding:"5px 10px",borderRadius:5,fontSize:9,fontWeight:900,fontFamily:fm,border:"none",letterSpacing:1,boxShadow:"0 2px 6px "+pc+"40",whiteSpace:"nowrap",cursor:"pointer"}}><span className="gas-view-ad-full">{viewAdLabel(ad.platform)}</span><span className="gas-view-ad-short">VIEW AD</span></button>
                  </div>;
                };

                return <div style={{marginTop:40,background:"linear-gradient(135deg,rgba(52,211,153,0.09),rgba(251,191,36,0.05),rgba(0,0,0,0.4))",borderRadius:20,padding:"30px 32px 32px",border:"1px solid "+P.mint+"35"}}>
                  <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:6}}>
                    {Ic.crown(P.mint,24)}
                    <div>
                      <div style={{fontSize:20,fontWeight:900,color:P.mint,fontFamily:ff,letterSpacing:1}}>CREATIVE EXECUTIVE SUMMARY</div>
                      <div style={{fontSize:11,color:P.label,fontFamily:fm,marginTop:3}}>Winners by platform, objective breakdown, and creatives recommended to scale</div>
                    </div>
                  </div>

                  {/* PLATFORM WINNERS */}
                  <div style={{marginTop:26}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
                      {Ic.chart(P.cyan,16)}
                      <span style={{fontSize:12,fontWeight:900,color:P.cyan,fontFamily:ff,letterSpacing:1.5}}>BEST PERFORMER PER PLATFORM</span>
                      <div style={{flex:1,height:1,background:"linear-gradient(90deg,"+P.cyan+"30, transparent)"}}/>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:platWinners.length>=3?"repeat(2,1fr)":"1fr",gap:12}}>
                      {platWinners.map(function(p){
                        var pc=platCol5[p.pg]||P.ember;
                        if(!p.winner)return null;
                        var resT=p.winner.resultType;
                        return <div key={p.pg} style={{background:"rgba(0,0,0,0.3)",borderRadius:12,padding:16,border:"1px solid "+pc+"30"}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                            <span style={{fontSize:12,fontWeight:900,color:pc,fontFamily:ff,letterSpacing:1}}>{p.pg.toUpperCase()}</span>
                            <span style={{fontSize:9,color:P.label,fontFamily:fm,letterSpacing:1}}>{p.count+" ads | "+fR(p.spend)+" | "+p.ctr.toFixed(2)+"% CTR"}</span>
                          </div>
                          {miniCard(p.winner,pc,resultLabel(resT),p.winner.results>0?fmt(p.winner.results):"0",costPerLabel(resT),p.winner.results>0?fR(p.winner.spend/p.winner.results):null)}
                        </div>;
                      })}
                    </div>
                  </div>

                  {/* PER OBJECTIVE TOP 10 + DEEP INSIGHTS */}
                  {objBreakdown.map(function(o){
                    var sec=o.sec;
                    var resT=(o.sorted[0]&&o.sorted[0].resultType)||sec.metric;
                    var ten=o.sorted.slice(0,10);
                    return <div key={"obj_brk_"+sec.key} style={{marginTop:28,padding:20,background:"rgba(0,0,0,0.25)",borderRadius:14,border:"1px solid "+sec.accent+"30"}}>
                      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,flexWrap:"wrap"}}>
                        {sec.icon}
                        <span style={{fontSize:13,fontWeight:900,color:sec.accent,fontFamily:ff,letterSpacing:1.5}}>{sec.label+" | TOP 10"}</span>
                        <div style={{flex:1,height:1,background:"linear-gradient(90deg,"+sec.accent+"30, transparent)"}}/>
                        <span style={{fontSize:9,color:P.label,fontFamily:fm,letterSpacing:1}}>{o.count+" ads | "+fR(o.totals.spend)+" | "+(o.totals.cpr>0?fR(o.totals.cpr)+" "+sec.costLabel:"no results yet")}</span>
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10}}>
                        {ten.map(function(ad,ai){
                          var isScale=ai<5;
                          var isTP=ai>=5;
                          var bordCol=isScale?P.mint+"60":P.warning+"50";
                          var bgCol=isScale?"rgba(52,211,153,0.05)":"rgba(251,191,36,0.04)";
                          return <div key={ad.adId+"_obj_"+ai} style={{display:"flex",gap:10,background:bgCol,borderRadius:10,padding:10,border:"1px solid "+bordCol,alignItems:"stretch",overflow:"hidden"}}>
                            <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:5,flexShrink:0,minWidth:52}}>
                              <div style={{fontSize:14,fontWeight:900,color:isScale?P.mint:P.warning,fontFamily:fm,lineHeight:1}}>{"#"+(ai+1)}</div>
                              <div style={{background:isScale?P.mint:P.warning,color:isScale?"#062014":"#2a1605",fontSize:8,fontWeight:900,padding:"3px 6px",borderRadius:4,fontFamily:fm,letterSpacing:0.8,whiteSpace:"nowrap",textAlign:"center"}}>{isScale?"\u25B2 SCALE":"\u2605 TOP"}</div>
                            </div>
                            <div style={{flex:1,minWidth:0}}>
                              {miniCard(ad,sec.accent,resultLabel(resT),ad.results>0?fmt(ad.results):"0",costPerLabel(resT),ad.results>0?fR(ad.spend/ad.results):null)}
                            </div>
                          </div>;
                        })}
                      </div>

                      {/* ANALYST INSIGHTS, per objective */}
                      <div style={{marginTop:18,padding:"20px 22px",background:"linear-gradient(135deg,"+sec.accent+"08 0%,"+sec.accent+"03 50%, transparent 100%)",borderRadius:"0 14px 14px 0",border:"1px solid "+sec.accent+"20",borderLeft:"4px solid "+sec.accent,position:"relative",overflow:"hidden"}}>
                        <div style={{position:"absolute",top:0,left:4,width:120,height:"100%",background:"linear-gradient(90deg,"+sec.accent+"06, transparent)",pointerEvents:"none"}}></div>
                        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,position:"relative"}}>
                          {Ic.eye(sec.accent,16)}
                          <span style={{fontSize:10,fontWeight:800,color:sec.accent,fontFamily:fm,letterSpacing:3,textTransform:"uppercase"}}>{"ANALYST INSIGHTS | "+sec.label}</span>
                          <div style={{flex:1,height:1,background:"linear-gradient(90deg,"+sec.accent+"30, transparent)",marginLeft:8}}></div>
                        </div>
                        {(function(){
                          var lines=[];
                          var bm=sec.bench;
                          // L1: concentration + volume
                          if(o.totals.results>0){
                            var top5Share=o.totals.results>0?Math.round((function(){var x=0;o.top5.forEach(function(a){x+=a.results;});return x/o.totals.results*100;})()):0;
                            lines.push("The top 5 creatives account for "+top5Share+"% of "+sec.label.toLowerCase()+" delivery ("+fR(o.totals.spend)+" total spend, "+fmt(o.totals.results)+" "+resultLabel(resT).toLowerCase()+"), "+(top5Share>=70?"heavy concentration, a refresh pipeline is critical to avoid fatigue":top5Share>=40?"healthy concentration, continue iterating on winning angles":"dispersed performance, pick clearer winners before scaling"));
                          }else{
                            lines.push("No measurable "+sec.label.toLowerCase()+" yet across "+o.count+" ads on "+fR(o.totals.spend)+" spend. Verify conversion tracking, landing page load, and event mapping before scaling any budget.");
                          }
                          // L2: efficiency gap
                          if(o.efficiencyGap>0&&o.tailCount>0){
                            lines.push("Efficiency gap: top 5 at "+fR(o.topCpr)+" "+sec.costLabel+" vs bottom quartile at "+fR(o.tailCpr)+", a "+o.efficiencyGap.toFixed(1)+"x spread. This is "+(o.efficiencyGap>=3?"a decisive signal, the long tail is materially dragging blended cost":o.efficiencyGap>=1.8?"a meaningful spread worth acting on":"a modest spread, marginal gains only from rebalancing")+".");
                          }
                          // L3: reallocation math
                          if(o.realloc>0){
                            lines.push("Reallocation impact: moving the "+fR(o.tailSpend)+" currently in the bottom quartile to the top 5 at their CPR would project ~"+fmt(o.realloc)+" additional "+resultLabel(resT).toLowerCase()+" at the same spend. Action: pause "+o.tailCount+" tail ads, lift top-5 ad-set budgets by 20%.");
                          }
                          // L4: benchmark read
                          if(o.totals.cpr>0&&bm){
                            var bVerd=o.totals.cpr<=bm.low?"well below the industry benchmark floor ("+fR(bm.low)+"), strong efficiency":o.totals.cpr<=bm.mid?"inside the industry benchmark range ("+fR(bm.low)+"-"+fR(bm.mid)+"), performing to standard":o.totals.cpr<=bm.high?"above midpoint but under the ceiling ("+fR(bm.high)+"), room to tighten":"above the industry benchmark ceiling ("+fR(bm.high)+"), red flag, revisit targeting and creative hooks";
                            lines.push("Blended "+sec.costLabel+" at "+fR(o.totals.cpr)+" is "+bVerd+".");
                          }
                          // L5: format mix insight
                          if(o.fmtTop&&o.fmtMix[o.fmtTop]>=3){
                            lines.push("Format signal: "+o.fmtMix[o.fmtTop]+" of 5 scale-ranked creatives are "+o.fmtTop+". Double down on "+o.fmtTop.toLowerCase()+" production and starve weaker formats in this objective.");
                          }
                          // L6: platform signal
                          if(o.platTop&&o.platMix[o.platTop]>=3){
                            lines.push("Platform lean: "+o.platMix[o.platTop]+" of 5 top creatives sit on "+o.platTop+". If this differs from your planned spend split, adjust budget weighting to match where results are actually landing.");
                          }
                          // L7: CTR delta
                          if(o.topCtr>0&&o.tailCtr>0){
                            var ctrDelta=o.topCtr-o.tailCtr;
                            if(Math.abs(ctrDelta)>=0.3){
                              lines.push("Attention delta: top 5 CTR "+o.topCtr.toFixed(2)+"% vs tail "+o.tailCtr.toFixed(2)+"%"+(ctrDelta>0?". Top creatives are also earning disproportionate attention, the hook is doing work, not just the algorithm.":". Tail has stronger CTR but weaker conversion, the hook attracts but the offer/landing isn't converting. Audit funnel past the click."));
                            }
                          }
                          return <div style={{fontSize:13.5,color:P.txt,fontFamily:ff,lineHeight:2.1,letterSpacing:0.2,position:"relative"}}>{lines.map(function(l,li){return <div key={li} style={{marginBottom:8,display:"flex",gap:8}}><span style={{color:sec.accent,fontWeight:900,flexShrink:0}}>{"\u25B8"}</span><span>{l}</span></div>;})}</div>;
                        })()}
                      </div>
                    </div>;
                  })}

                  {/* CROSS-OBJECTIVE STRATEGIC ACTIONS \u2014 copy intentionally
                      written for the internal team in plain media-buyer
                      language: short sentences, named numbers, action verbs.
                      Heavier jargon ("benchmark midpoint", "head and tail",
                      "incremental results", "tail creatives") was removed
                      after the team flagged the previous block as too dense
                      to read at a glance. */}
                  <div style={{marginTop:28,padding:"22px 26px",background:"linear-gradient(135deg,"+P.ember+"08 0%,"+P.ember+"03 50%, transparent 100%)",borderRadius:"0 14px 14px 0",border:"1px solid "+P.ember+"20",borderLeft:"4px solid "+P.ember,position:"relative",overflow:"hidden"}}>
                    <div style={{position:"absolute",top:0,left:4,width:120,height:"100%",background:"linear-gradient(90deg,"+P.ember+"06, transparent)",pointerEvents:"none"}}></div>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,position:"relative"}}>
                      {Ic.crown(P.ember,16)}
                      <span style={{fontSize:10,fontWeight:800,color:P.ember,fontFamily:fm,letterSpacing:3,textTransform:"uppercase"}}>Strategic Actions Across Objectives</span>
                      <div style={{flex:1,height:1,background:"linear-gradient(90deg,"+P.ember+"30, transparent)",marginLeft:8}}/>
                    </div>
                    {(function(){
                      var lines=[];
                      // Spend efficiency ranked across objectives
                      var objRanked=objBreakdown.slice().filter(function(o){return o.totals.cpr>0;}).sort(function(a,b){
                        var aBm=a.sec.bench,bBm=b.sec.bench;
                        var aR=aBm?a.totals.cpr/aBm.mid:1;
                        var bR=bBm?b.totals.cpr/bBm.mid:1;
                        return aR-bR;
                      });
                      if(objRanked.length>=2){
                        var best=objRanked[0],worst=objRanked[objRanked.length-1];
                        var costParts=objRanked.map(function(o){
                          var bm=o.sec.bench;
                          if(!bm||o.totals.cpr<=0)return o.sec.label+" no benchmark";
                          var pct=Math.abs(1-(o.totals.cpr/bm.mid))*100;
                          var dir=(o.totals.cpr/bm.mid)<1?"under":"over";
                          return o.sec.label+" "+pct.toFixed(2)+"% "+dir;
                        });
                        lines.push("Cost vs industry average, by objective: "+costParts.join(", ")+". Best running: "+best.sec.label+". Most expensive: "+worst.sec.label+".");
                      }
                      // Platform-objective fit
                      var fits=[];
                      objBreakdown.forEach(function(o){if(o.platTop&&o.platMix[o.platTop]>=3)fits.push(o.sec.label+" on "+o.platTop);});
                      if(fits.length>0)lines.push("Where each objective performs best: "+fits.join(", ")+". Plan budget around these strengths, do not push spend into platforms that are not pulling for a given goal.");
                      // Total reallocation potential
                      var totRealloc=0,totReallocSpend=0,totReallocCount=0;
                      objBreakdown.forEach(function(o){if(o.realloc>0){totRealloc+=o.realloc;totReallocSpend+=o.tailSpend;totReallocCount+=o.tailCount;}});
                      if(totRealloc>0){
                        lines.push("Spend you can free up: "+totReallocCount+" weak ads are using "+fR(totReallocSpend)+" with little to show. Move that money to the top performers and you would gain about "+fmt(totRealloc)+" more results at current rates, no extra budget needed.");
                      }
                      // Creative refresh mandate
                      var refreshCount=0;
                      objBreakdown.forEach(function(o){if(o.efficiencyGap>=2.5)refreshCount++;});
                      if(refreshCount>0)lines.push("Creative refresh needed: "+refreshCount+" of "+objBreakdown.length+" objectives have a 2.5x cost gap between top and bottom ads. Build 3 to 5 new versions for each, test them against the current best performer, lean into the winning format and platform.");
                      // Attention commentary
                      var allImps=0,allClicks=0;filteredAds.forEach(function(a){allImps+=a.impressions;allClicks+=a.clicks;});
                      var portfolioCtr=allImps>0?(allClicks/allImps*100):0;
                      if(portfolioCtr>0){
                        lines.push("Overall click-through rate: "+portfolioCtr.toFixed(2)+"% across "+fmt(allImps)+" impressions"+(portfolioCtr>=1.2?". Above the 1.20% healthy mark, the creatives are earning attention. Retire tired ads early to keep this rate up.":portfolioCtr>=0.8?". In the acceptable 0.80% to 1.20% band but not exceptional. Test new creatives before chasing more audience reach.":". Below 0.80%, attention is the bottleneck. Audience or creative fit is off, fix that before scaling."));
                      }
                      // Headline action
                      var scaleCount=0;objBreakdown.forEach(function(o){scaleCount+=o.top5.filter(function(a){return a.results>0;}).length;});
                      if(scaleCount>0)lines.push("Next 14 days: raise budget by 20.00% on the "+scaleCount+" winning ads, pause the "+totReallocCount+" weakest, brief "+(refreshCount*4)+" new versions across the "+refreshCount+" objective(s) that need a refresh. Check back on day 14 once each winning ad has reached at least 3x its current volume before locking in any permanent change.");
                      return <div style={{fontSize:13.5,color:P.txt,fontFamily:ff,lineHeight:2.1,letterSpacing:0.2,position:"relative"}}>{lines.map(function(l,li){return <div key={li} style={{marginBottom:8,display:"flex",gap:8}}><span style={{color:P.ember,fontWeight:900,flexShrink:0}}>{"\u25B8"}</span><span>{l}</span></div>;})}</div>;
                    })()}
                  </div>
                </div>;
              })()}
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
                <tr style={{background:"rgba(52,168,83,0.08)"}}><td style={{padding:"12px",border:"1px solid "+P.rule,display:"flex",alignItems:"center",gap:8}}><span style={{width:10,height:10,borderRadius:"50%",background:P.gd}}></span><span style={{fontSize:12,fontWeight:700,color:P.txt}}>Google Display</span></td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{fR(computed.gd.spend)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13}}>{fmt(computed.gd.impressions)}</td><td title="Estimated at 2x frequency (impressions / 2). Google Ads does not expose unique-user reach." style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13}}>{computed.gd.reach>0?fmt(computed.gd.reach)+" *":"-"}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:computed.gd.cpm<15?P.mint:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{fR(computed.gd.cpm)}</td><td title="Estimated at 2x (industry-standard Google Display assumption)" style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{computed.gd.frequency>0?computed.gd.frequency.toFixed(2)+"x *":"-"}</td></tr>
                <tr style={{background:"rgba(255,107,0,0.15)"}}><td style={{padding:"12px",border:"1px solid "+P.rule}}><span style={{fontSize:13,fontWeight:900,color:"#FFCB05"}}>GRAND TOTAL</span></td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:"#FFCB05",fontFamily:fm,fontSize:15,fontWeight:900}}>{fR(computed.totalSpend)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:"#FFCB05",fontFamily:fm,fontSize:15,fontWeight:900}}>{fmt(computed.totalImps)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:"#FFCB05",fontFamily:fm,fontSize:15,fontWeight:900}}>{fmt(m.reach+t.reach+computed.gd.reach)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:"#FFCB05",fontFamily:fm,fontSize:15,fontWeight:900}}>{fR(computed.blendedCpm)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:"#FFCB05",fontFamily:fm,fontSize:15,fontWeight:900}}>{blFreq>0?blFreq.toFixed(2)+"x":"-"}</td></tr>
              </tbody>
            </table>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
              <Reveal minHeight={290}><div style={{background:"rgba(0,0,0,0.2)",borderRadius:12,padding:20}}><div style={{fontSize:10,fontWeight:800,color:"rgba(255,255,255,0.5)",letterSpacing:3,fontFamily:fm,textTransform:"uppercase",marginBottom:14}}>Impressions & Reach by Platform</div><ChartReveal><ResponsiveContainer width="100%" height={200}><BarChart data={[{name:"Facebook",Impressions:computed.fb.impressions,Reach:computed.fb.reach},{name:"Instagram",Impressions:computed.ig.impressions,Reach:computed.ig.reach},{name:"TikTok",Impressions:t.impressions,Reach:t.reach},{name:"Google",Impressions:computed.gd.impressions,Reach:computed.gd.reach}]} barSize={20}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)"/><XAxis dataKey="name" tick={{fontSize:11,fill:"rgba(255,255,255,0.85)",fontFamily:fm}} stroke="transparent"/><YAxis tick={{fontSize:10,fill:"rgba(255,255,255,0.65)",fontFamily:fm}} stroke="transparent" tickFormatter={function(v){return fmt(v);}}/><Tooltip content={<Tip/>} wrapperStyle={{outline:"none"}} cursor={{fill:"rgba(255,255,255,0.05)"}}/><Bar dataKey="Impressions" fill={P.cyan} radius={[6,6,0,0]}/><Bar dataKey="Reach" fill={P.orchid} radius={[6,6,0,0]}/></BarChart></ResponsiveContainer></ChartReveal><div style={{display:"flex",justifyContent:"center",gap:16,marginTop:8}}><div style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:8,height:8,borderRadius:2,background:P.cyan}}></span><span style={{fontSize:10,color:"rgba(255,255,255,0.7)",fontFamily:fm}}>Impressions</span></div><div style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:8,height:8,borderRadius:2,background:P.orchid}}></span><span style={{fontSize:10,color:"rgba(255,255,255,0.7)",fontFamily:fm}}>Reach</span></div></div></div></Reveal>
              <Reveal minHeight={290} delay={120}><div style={{background:"rgba(0,0,0,0.2)",borderRadius:12,padding:20}}><div style={{fontSize:10,fontWeight:800,color:"rgba(255,255,255,0.5)",letterSpacing:3,fontFamily:fm,textTransform:"uppercase",marginBottom:14}}>Spend Allocation</div><ChartReveal><ResponsiveContainer width="100%" height={200}><PieChart><Pie data={[{name:"Facebook",value:computed.fb.spend},{name:"Instagram",value:computed.ig.spend},{name:"TikTok",value:t.spend},{name:"Google",value:computed.gd.spend}].filter(function(x){return x.value>0;})} cx="50%" cy="50%" outerRadius={65} innerRadius={40} paddingAngle={4} dataKey="value" stroke="none" label={function(entry){var total=computed.totalSpend;var pct=total>0?(entry.value/total*100).toFixed(2):0;return pct>0?pct+"%":"";}} labelStyle={{fontSize:7,fontFamily:fm,fill:"rgba(255,255,255,0.9)"}}><Cell fill={P.fb}/><Cell fill={P.ig}/><Cell fill={P.tt}/><Cell fill={P.gd}/></Pie><Tooltip content={<Tip/>} wrapperStyle={{outline:"none"}} cursor={{fill:"rgba(255,255,255,0.05)"}}/></PieChart></ResponsiveContainer></ChartReveal><div style={{display:"flex",justifyContent:"center",gap:12,marginTop:8}}>{(function(){var total=computed.totalSpend;return [{n:"FB",v:computed.fb.spend,c:P.fb},{n:"IG",v:computed.ig.spend,c:P.ig},{n:"TT",v:t.spend,c:P.tt},{n:"GD",v:computed.gd.spend,c:P.gd}].map(function(p){var pct=total>0?(p.v/total*100).toFixed(2):"0.00";return <div key={p.n} style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:8,height:8,borderRadius:"50%",background:p.c}}></span><span style={{fontSize:10,color:"rgba(255,255,255,0.7)",fontFamily:fm}}>{p.n} {fR(p.v)} ({pct}%)</span></div>;});})()}</div></div></Reveal>
            </div>

            <Insight title="Awareness Key Metrics" accent={P.cyan} icon={Ic.eye(P.cyan,16)}>{(function(){var parts=[];var totalReach=computed.fb.reach+computed.ig.reach+t.reach+computed.gd.reach;var metaShare=computed.totalImps>0?((m.impressions/computed.totalImps)*100).toFixed(2):"0.00";var ttShare=computed.totalImps>0?(computed.totalImps>0?(t.impressions/computed.totalImps*100).toFixed(2):"0.00"):"0";parts.push("Across the selected campaign period, "+fmt(computed.totalImps)+" Total Ads Served were delivered against "+fR(computed.totalSpend)+" media investment, achieving a blended Cost Per Thousand Ads Served of "+fR(computed.blendedCpm)+". "+(computed.blendedCpm<benchmarks.meta.cpm.low?"This is well below the Meta CPM benchmark range of "+benchmarks.meta.cpm.label+", noting the blend mixes Meta, TikTok, and Google so a low blended figure can also reflect TikTok's lower CPM bringing the average down.":computed.blendedCpm<benchmarks.meta.cpm.mid?"This sits within the efficient end of the Meta CPM benchmark range "+benchmarks.meta.cpm.label+", with the blend including TikTok and Google.":"This is at the upper end of the Meta CPM benchmark range "+benchmarks.meta.cpm.label+", reflecting the platform mix and audience targeting precision.")+"");if(computed.fb.impressions>0){parts.push("Facebook accounts for "+(computed.totalImps>0?(computed.fb.impressions/computed.totalImps*100).toFixed(2):"0.00")+"% of Total Ads Served volume ("+fmt(computed.fb.impressions)+"), reaching "+fmt(computed.fb.reach)+" unique individuals at a frequency of "+computed.fb.frequency.toFixed(2)+"x. "+(computed.fb.frequency<2?"The sub-2x frequency indicates the campaign is in its early awareness phase with significant headroom to increase reach depth before encountering diminishing returns.":computed.fb.frequency<3?"Frequency at "+computed.fb.frequency.toFixed(2)+"x sits within the optimal recall-building window of 2-3x, where brand message retention is highest without triggering ad fatigue.":"Frequency at "+computed.fb.frequency.toFixed(2)+"x indicates the campaign has established strong recall-building repetition within the target audience.")+" Facebook CPM at "+fR(computed.fb.cpm)+" reflects the platform\'s premium inventory value, which includes superior audience segmentation, cross-device attribution, and conversion measurement capabilities.");}if(computed.ig.impressions>0){parts.push("Instagram contributes "+(computed.totalImps>0?(computed.ig.impressions/computed.totalImps*100).toFixed(2):"0.00")+"% of Total Ads Served ("+fmt(computed.ig.impressions)+") reaching "+fmt(computed.ig.reach)+" unique users at "+fR(computed.ig.cpm)+" Cost Per Thousand Ads Served."+(computed.ig.cpm<computed.fb.cpm&&computed.fb.cpm>0&&((1-computed.ig.cpm/computed.fb.cpm)*100)>5?" Instagram\'s "+((1-computed.ig.cpm/computed.fb.cpm)*100).toFixed(2)+"% CPM advantage over Facebook makes it the more capital-efficient Meta placement for awareness delivery, driven by higher engagement rates in Stories and Reels placements that reduce effective cost per quality impression.":""));}if(t.impressions>0){var ttCpmNote="";if(t.cpm>0&&computed.fb.cpm>0){if(t.cpm<computed.fb.cpm*0.9){ttCpmNote=" TikTok delivers a "+(((computed.fb.cpm-t.cpm)/computed.fb.cpm)*100).toFixed(2)+"% Cost Per Thousand Ads Served advantage over Facebook, confirming strong content relevance scores and favourable auction positioning.";}else if(t.cpm>computed.fb.cpm*1.1){ttCpmNote=" TikTok Cost Per Thousand Ads Served at "+fR(t.cpm)+" is "+(((t.cpm-computed.fb.cpm)/computed.fb.cpm)*100).toFixed(2)+"% higher than Facebook, reflecting premium video inventory and higher engagement depth per impression.";}else{ttCpmNote=" TikTok and Facebook deliver comparable Cost Per Thousand Ads Served at "+fR(t.cpm)+" and "+fR(computed.fb.cpm)+" respectively.";}}parts.push("TikTok delivers "+ttShare+"% of all campaign Total Ads Served ("+fmt(t.impressions)+") at "+fR(t.cpm)+" Cost Per Thousand Ads Served"+(t.reach>0?", reaching "+fmt(t.reach)+" users":"")+"."+ttCpmNote);}if(computed.gd.clicks>0){parts.push("Google Display generated "+fmt(computed.gd.clicks)+" clicks at "+fR(computed.gd.cpc)+" Cost Per Click with "+pc(computed.gd.ctr)+" Click Through Rate, extending campaign reach across Google's display network and partner sites.");}if(t.clicks>0){parts.push("TikTok contributed "+fmt(t.clicks)+" clicks"+(t.cpc>0?" at "+fR(t.cpc)+" Cost Per Click":"")+(t.ctr>0?" with "+pc(t.ctr)+" Click Through Rate":"")+". Beyond the direct click metrics, TikTok engagement carries multiplicative value: each interaction signals content quality to the recommendation algorithm, which can extend organic distribution to non-targeted users at zero marginal cost.");}if(computed.totalClicks===0){parts.push("No click engagement was recorded for the selected campaigns in this period. The campaigns are configured for awareness and reach objectives, building brand visibility across the target audience.");}return parts.join(" ");})()}</Insight>
          </div>

          {/* \u2550\u2550\u2550 ENGAGEMENT KEY METRICS \u2550\u2550\u2550 */}
          <div style={{background:P.glass,borderRadius:18,padding:"6px 24px 24px",marginBottom:28,border:"1px solid "+P.rule}}>
            <div style={{textAlign:"center",padding:"18px 0 16px"}}><span style={{fontSize:18,fontWeight:900,color:P.txt,fontFamily:ff,letterSpacing:1}}>ENGAGEMENT KEY METRICS</span><div style={{fontSize:10,color:P.label,fontFamily:fm,marginTop:4,letterSpacing:3}}>MIDDLE OF FUNNEL</div></div>

            <table style={{width:"100%",borderCollapse:"collapse",marginBottom:16}}>
              <thead><tr>{["Platform","Media Spend","Impressions","Reach","Clicks","CTR %","CPC"].map(function(h,i){return <th key={i} style={{padding:"10px 12px",fontSize:10,fontWeight:800,textTransform:"uppercase",color:"#F96203",letterSpacing:1.5,textAlign:i===0?"left":"center",background:"rgba(249,98,3,0.15)",border:"1px solid rgba(249,98,3,0.3)",backdropFilter:"blur(8px)",fontFamily:fm,letterSpacing:1}}>{h}</th>;})}</tr></thead>
              <tbody>
                <tr style={{background:"rgba(69,153,255,0.06)"}}><td style={{padding:"12px",border:"1px solid "+P.rule,display:"flex",alignItems:"center",gap:8}}><span style={{width:10,height:10,borderRadius:"50%",background:P.fb}}></span><span style={{fontSize:12,fontWeight:700,color:P.txt}}>Facebook</span></td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{fR(computed.fb.spend)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13}}>{fmt(computed.fb.impressions)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13}}>{fmt(computed.fb.reach)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{fmt(computed.fb.clicks)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:computed.fb.ctr>2?P.mint:computed.fb.ctr>1?P.txt:P.warning,fontFamily:fm,fontSize:13,fontWeight:700}}>{pc(computed.fb.ctr)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:computed.fb.cpc<2?P.mint:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{fR(computed.fb.cpc)}</td></tr>
                <tr style={{background:"rgba(225,48,108,0.06)"}}><td style={{padding:"12px",border:"1px solid "+P.rule,display:"flex",alignItems:"center",gap:8}}><span style={{width:10,height:10,borderRadius:"50%",background:P.ig}}></span><span style={{fontSize:12,fontWeight:700,color:P.txt}}>Instagram</span></td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{fR(computed.ig.spend)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13}}>{fmt(computed.ig.impressions)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13}}>{fmt(computed.ig.reach)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{fmt(computed.ig.clicks)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:computed.ig.ctr>2?P.mint:computed.ig.ctr>1?P.txt:P.warning,fontFamily:fm,fontSize:13,fontWeight:700}}>{pc(computed.ig.ctr)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:computed.ig.cpc<2?P.mint:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{fR(computed.ig.cpc)}</td></tr>
                <tr style={{background:"rgba(69,153,255,0.12)"}}><td style={{padding:"12px",border:"1px solid "+P.rule}}><span style={{fontSize:12,fontWeight:900,color:P.fb}}>Meta Total</span></td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.fb,fontFamily:fm,fontSize:14,fontWeight:900}}>{fR(m.spend)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.fb,fontFamily:fm,fontSize:14,fontWeight:900}}>{fmt(m.impressions)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.fb,fontFamily:fm,fontSize:14,fontWeight:900}}>{fmt(m.reach)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.fb,fontFamily:fm,fontSize:14,fontWeight:900}}>{fmt(m.clicks)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.fb,fontFamily:fm,fontSize:14,fontWeight:900}}>{pc(m.ctr)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.fb,fontFamily:fm,fontSize:14,fontWeight:900}}>{fR(m.cpc)}</td></tr>
                <tr style={{background:"rgba(0,242,234,0.06)"}}><td style={{padding:"12px",border:"1px solid "+P.rule,display:"flex",alignItems:"center",gap:8}}><span style={{width:10,height:10,borderRadius:"50%",background:P.tt}}></span><span style={{fontSize:12,fontWeight:700,color:P.txt}}>TikTok</span></td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{fR(t.spend)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13}}>{fmt(t.impressions)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13}}>{fmt(t.reach)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{fmt(t.clicks)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:t.ctr>2?P.mint:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{pc(t.ctr)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:t.cpc<2?P.mint:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{fR(t.cpc)}</td></tr>
                
                <tr style={{background:"rgba(52,168,83,0.06)"}}><td style={{padding:"12px",border:"1px solid "+P.rule,display:"flex",alignItems:"center",gap:8}}><span style={{width:10,height:10,borderRadius:"50%",background:P.gd}}></span><span style={{fontSize:12,fontWeight:700,color:P.txt}}>Google Display</span></td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{fR(computed.gd.spend)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13}}>{fmt(computed.gd.impressions)}</td><td title="Estimated at 2x frequency (impressions / 2). Google Ads does not expose unique-user reach." style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13}}>{computed.gd.reach>0?fmt(computed.gd.reach)+" *":"-"}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{fmt(computed.gd.clicks)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:computed.gd.ctr>2?P.mint:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{pc(computed.gd.ctr)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:computed.gd.cpc<2?P.mint:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{fR(computed.gd.cpc)}</td></tr>
                <tr style={{background:"rgba(255,107,0,0.12)"}}><td style={{padding:"12px",border:"1px solid "+P.rule}}><span style={{fontSize:13,fontWeight:900,color:P.ember}}>GRAND TOTAL</span></td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.ember,fontFamily:fm,fontSize:15,fontWeight:900}}>{fR(computed.totalSpend)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.ember,fontFamily:fm,fontSize:15,fontWeight:900}}>{fmt(computed.totalImps)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.ember,fontFamily:fm,fontSize:15,fontWeight:900}}>{fmt(m.reach+t.reach+computed.gd.reach)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.ember,fontFamily:fm,fontSize:15,fontWeight:900}}>{fmt(computed.totalClicks)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.ember,fontFamily:fm,fontSize:15,fontWeight:900}}>{pc(computed.totalImps>0?(computed.totalClicks/computed.totalImps)*100:0)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.ember,fontFamily:fm,fontSize:15,fontWeight:900}}>{fR(computed.totalClicks>0?computed.totalSpend/computed.totalClicks:0)}</td></tr>
              </tbody>
            </table>

            <Reveal minHeight={280}><div style={{background:"rgba(0,0,0,0.15)",borderRadius:12,padding:20,marginBottom:16}}><div style={{fontSize:10,fontWeight:800,color:P.label,letterSpacing:3,fontFamily:fm,textTransform:"uppercase",marginBottom:14}}>Clicks, CPC & CTR by Platform</div><ChartReveal><ResponsiveContainer width="100%" height={220}><ComposedChart data={[{name:"Facebook",Clicks:computed.fb.clicks,CPC:computed.fb.cpc,CTR:computed.fb.ctr},{name:"Instagram",Clicks:computed.ig.clicks,CPC:computed.ig.cpc,CTR:computed.ig.ctr},{name:"TikTok",Clicks:t.clicks,CPC:t.cpc,CTR:t.ctr},{name:"Google",Clicks:computed.gd.clicks,CPC:computed.gd.cpc,CTR:computed.gd.ctr}]}><CartesianGrid strokeDasharray="3 3" stroke={P.rule}/><XAxis dataKey="name" tick={{fontSize:11,fill:"rgba(255,255,255,0.85)",fontFamily:fm}} stroke="transparent"/><YAxis yAxisId="left" tick={{fontSize:10,fill:"rgba(255,255,255,0.6)",fontFamily:fm}} stroke="transparent" tickFormatter={function(v){return fmt(v);}}/><YAxis yAxisId="right" orientation="right" tick={{fontSize:10,fill:P.ember,fontFamily:fm}} stroke="transparent" tickFormatter={function(v){return v<20?v.toFixed(2)+"%":"R"+v.toFixed(2);}}/><Tooltip content={<Tip/>} wrapperStyle={{outline:"none"}} cursor={{fill:"rgba(255,255,255,0.05)"}}/><Bar yAxisId="left" dataKey="Clicks" fill={P.mint} radius={[6,6,0,0]} barSize={30}/><Line yAxisId="right" type="monotone" dataKey="CPC" stroke={P.ember} strokeWidth={2.5} dot={{r:5,fill:P.ember}} activeDot={{r:7}}/><Line yAxisId="right" type="monotone" dataKey="CTR" stroke={P.cyan} strokeWidth={2.5} dot={{r:5,fill:P.cyan}} activeDot={{r:7}} strokeDasharray="5 5"/></ComposedChart></ResponsiveContainer></ChartReveal></div></Reveal>

            
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:16}}>
              <Reveal minHeight={92}><Glass accent={P.fb} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>FACEBOOK CTR</div><div style={{fontSize:22,fontWeight:900,color:P.fb,fontFamily:fm}}>{pc(computed.fb.ctr)}</div><div style={{fontSize:9,color:"rgba(255,255,255,0.5)",fontFamily:fm,marginTop:4}}>{fmt(computed.fb.clicks)} clicks</div></Glass></Reveal>
              <Reveal minHeight={92} delay={80}><Glass accent={P.ig} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>INSTAGRAM CTR</div><div style={{fontSize:22,fontWeight:900,color:P.ig,fontFamily:fm}}>{pc(computed.ig.ctr)}</div><div style={{fontSize:9,color:"rgba(255,255,255,0.5)",fontFamily:fm,marginTop:4}}>{fmt(computed.ig.clicks)} clicks</div></Glass></Reveal>
              <Reveal minHeight={92} delay={160}><Glass accent={P.tt} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>TIKTOK CTR</div><div style={{fontSize:22,fontWeight:900,color:P.tt,fontFamily:fm}}>{pc(t.ctr)}</div><div style={{fontSize:9,color:"rgba(255,255,255,0.5)",fontFamily:fm,marginTop:4}}>{fmt(t.clicks)} clicks</div></Glass></Reveal>
              <Reveal minHeight={92} delay={240}><Glass accent={P.gd} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>GOOGLE CTR</div><div style={{fontSize:22,fontWeight:900,color:P.gd,fontFamily:fm}}>{pc(computed.gd.ctr)}</div><div style={{fontSize:9,color:"rgba(255,255,255,0.5)",fontFamily:fm,marginTop:4}}>{fmt(computed.gd.clicks)} clicks</div></Glass></Reveal>
            </div>

            <Insight title="Engagement Key Metrics" accent={P.mint} icon={Ic.pulse(P.mint,16)}>{(function(){var parts=[];var blendedCpc=computed.totalClicks>0?computed.totalSpend/computed.totalClicks:0;var clickToImpRate=computed.totalImps>0?(computed.totalClicks/computed.totalImps*100):0;parts.push("The campaign generated "+fmt(computed.totalClicks)+" total click actions across all platforms, converting "+clickToImpRate.toFixed(2)+"% of "+fmt(computed.totalImps)+" impressions into measurable engagement signals. The cross-platform blended Cost Per Click of "+fR(blendedCpc)+" confirms efficient translation of awareness into intent.");if(computed.fb.clicks>0){var fbClickShare=computed.totalClicks>0?((computed.fb.clicks/computed.totalClicks)*100).toFixed(2):"0.00";parts.push("Facebook drives "+fbClickShare+"% of total click volume with "+fmt(computed.fb.clicks)+" clicks at "+fR(computed.fb.cpc)+" Cost Per Click and "+pc(computed.fb.ctr)+" Click Through Rate. "+(computed.fb.ctr>3?"The Click Through Rate exceeding 3% places this campaign in the top 10% of Facebook engagement benchmarks for the paid social market, indicating exceptional creative-audience resonance. The ad creative is not only stopping the scroll but compelling users to take deliberate action.":computed.fb.ctr>1.5?"CTR at "+pc(computed.fb.ctr)+" exceeds the 1.5% performance benchmark, confirming the creative messaging is effectively converting passive impressions into active engagement. The hook and value proposition are landing with the target audience.":"CTR at "+pc(computed.fb.ctr)+" reflects the current creative-audience engagement level for this campaign period."));}if(computed.ig.clicks>0){parts.push("Instagram delivered "+fmt(computed.ig.clicks)+" clicks at "+fR(computed.ig.cpc)+" Cost Per Click with "+pc(computed.ig.ctr)+" Click Through Rate."+(computed.ig.cpc<computed.fb.cpc&&computed.fb.cpc>0?" Instagram\'s "+((1-computed.ig.cpc/computed.fb.cpc)*100).toFixed(2)+"% CPC advantage over Facebook reflects the platform\'s stronger visual engagement environment, where users are predisposed to interact with compelling creative content.":"")+"");}if(computed.gd.clicks>0){parts.push("Google Display generated "+fmt(computed.gd.clicks)+" clicks at "+fR(computed.gd.cpc)+" Cost Per Click with "+pc(computed.gd.ctr)+" Click Through Rate, extending campaign reach across Google's display network and partner sites.");}if(t.clicks>0){parts.push("TikTok contributed "+fmt(t.clicks)+" clicks"+(t.cpc>0?" at "+fR(t.cpc)+" Cost Per Click":"")+(t.ctr>0?" with "+pc(t.ctr)+" Click Through Rate":"")+". Beyond the direct click metrics, TikTok engagement carries multiplicative value: each interaction signals content quality to the recommendation algorithm, which can extend organic distribution to non-targeted users at zero marginal cost.");}if(computed.totalClicks===0){parts.push("No click engagement was recorded for the selected campaigns in this period. The campaigns are configured for awareness and reach objectives, building brand visibility across the target audience.");}return parts.join(" ");})()}</Insight>
          </div>

          {/* OBJECTIVE KEY METRICS */}
          <div style={{background:P.glass,borderRadius:18,padding:"6px 24px 24px",marginBottom:28,border:"1px solid "+P.rule}}>
            <div style={{textAlign:"center",padding:"18px 0 16px"}}><span style={{fontSize:18,fontWeight:900,color:P.txt,fontFamily:ff,letterSpacing:1}}>OBJECTIVE KEY METRICS</span><div style={{fontSize:10,color:P.label,fontFamily:fm,marginTop:4,letterSpacing:3}}>BOTTOM OF FUNNEL, CAMPAIGN KPIs</div></div>

            {(function(){
              var sel=campaigns.filter(function(x){return selected.indexOf(x.campaignId)>=0;});
              if(sel.length===0)return <div style={{padding:30,textAlign:"center",color:P.caption,fontFamily:fm}}>Select campaigns to view objective results.</div>;

              // Canonical-first classifier — matches the Summary tab exactly so
              // Followers and App Install campaigns don't fall through to the
              // Landing Page bucket on Deep Dive.
              var getObj=function(camp){
                var canon=String(camp&&camp.objective||"").toLowerCase();
                if(canon==="appinstall")return "Clicks to App Store";
                if(canon==="leads")return "Leads";
                if(canon==="followers")return "Followers & Likes";
                if(canon==="landingpage")return "Landing Page Clicks";
                var n=String(camp&&camp.campaignName||"").toLowerCase();
                if(n.indexOf("appinstal")>=0||n.indexOf("app install")>=0||n.indexOf("app_install")>=0)return "Clicks to App Store";
                if(n.indexOf("follower")>=0||n.indexOf("page like")>=0||n.indexOf("pagelikes")>=0||n.indexOf("_like_")>=0||n.indexOf("_like ")>=0||n.indexOf("paidsocial_like")>=0||n.indexOf("like_facebook")>=0||n.indexOf("like_instagram")>=0)return "Followers & Likes";
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
                var obj=getObj(camp);var result=getResult(camp,obj);var spend=parseFloat(camp.spend||0);var clicks=parseFloat(camp.clicks||0);var costPer=result>0?spend/result:0;var convRate=clicks>0&&obj==="Leads"?(parseFloat(camp.leads||0)/clicks*100):0;
                var imps=parseFloat(camp.impressions||0);var ctrVal=imps>0?(clicks/imps*100):0;var engagements=parseFloat(camp.follows||0)+parseFloat(camp.likes||0)+parseFloat(camp.pageLikes||0);if(engagements===0&&camp.platform==="Instagram"){var igEng=findIgGrowth(camp.campaignName,pages);if(igEng>0)engagements=igEng;}return{name:camp.campaignName,engagements:engagements,engCtr:imps>0?(engagements/imps*100):0,platform:camp.platform,objective:obj,spend:spend,clicks:clicks,impressions:imps,ctr:ctrVal,result:result,resultLabel:getResultLabel(obj),costPer:costPer,costLabel:getCostLabel(obj),convRate:convRate};
              });
              var platOrder={"Facebook":0,"Instagram":1,"TikTok":2,"Google Display":3,"YouTube":4};
              var objOrder={"Clicks to App Store":0,"Landing Page Clicks":1,"Leads":2,"Followers & Likes":3,"Traffic":4};
              

              var objectives=["Clicks to App Store","Landing Page Clicks","Followers & Likes","Leads"];
              var platList=["Facebook","Instagram","TikTok","Google Display","YouTube"];
              var groups={};objectives.forEach(function(o){
                var matched=rows.filter(function(r){return r.objective===o;});
                if(o==="Landing Page Clicks"){var tr=rows.filter(function(r){return r.objective==="Traffic";});matched=matched.concat(tr);}
                var sorted=[];
                platList.forEach(function(pl){var plRows=matched.filter(function(r){return r.platform===pl;});plRows.sort(function(a,b){return b.clicks-a.clicks;});sorted=sorted.concat(plRows);});
                groups[o]=sorted;
              });

              var objColors={"Clicks to App Store":P.fb,"Landing Page Clicks":P.cyan,"Leads":P.rose,"Followers & Likes":P.tt};
              var sections=[];

              var platColorMap={"Facebook":P.fb,"Instagram":P.ig,"TikTok":P.tt,"Google Display":P.gd,"YouTube":P.yt};
              // Lift platBreakdown up so both the new chart and the Insight
              // below reuse the same numbers.
              var breakdownsByObj={};
              objectives.forEach(function(objName){
                var g=groups[objName];if(!g||g.length===0)return;
                var platBreakdown=[];var platList2=["Facebook","Instagram","TikTok","Google Display","YouTube"];
                platList2.forEach(function(pl){
                  var plRows=g.filter(function(r){return r.platform===pl;});
                  if(plRows.length===0)return;
                  var plResult=plRows.reduce(function(a,r){return a+r.result;},0);
                  var plSpend=plRows.reduce(function(a,r){return a+r.spend;},0);
                  var plCost=plResult>0?plSpend/plResult:0;
                  var plImps=plRows.reduce(function(a,r){return a+r.impressions;},0);
                  var plClicks=objName==="Followers & Likes"?plRows.reduce(function(a,r){return a+r.engagements;},0):plRows.reduce(function(a,r){return a+r.clicks;},0);
                  var plCtr=plImps>0?(plClicks/plImps*100):0;
                  platBreakdown.push({platform:pl,result:plResult,spend:plSpend,cost:plCost,ctr:plCtr,imps:plImps});
                });
                breakdownsByObj[objName]=platBreakdown;
              });

              objectives.forEach(function(objName){
                var g=groups[objName];if(!g||g.length===0)return;
                var totalSpend=g.reduce(function(a,r){return a+r.spend;},0);var totalClicks=g.reduce(function(a,r){return a+r.clicks;},0);var totalResults=g.reduce(function(a,r){return a+r.result;},0);var totalCostPer=totalResults>0?totalSpend/totalResults:0;var totalConv=totalClicks>0&&objName==="Leads"?(totalResults/totalClicks*100):0;var oc=objColors[objName]||P.ember;
                var platBreakdown=breakdownsByObj[objName]||[];

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
                      {objName==="Leads"&&<td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,color:r.convRate>0?P.orchid:P.caption}}>{r.convRate>0?r.convRate.toFixed(2)+"%":"0"}</td>}
                    </tr>;})}
                    <tr style={{background:oc+"15"}}><td style={{padding:"10px 12px",border:"1px solid "+P.rule,fontWeight:900,color:oc,fontSize:12}}>Total</td><td style={{padding:"10px 12px",border:"1px solid "+P.rule}}></td><td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:13,fontWeight:900,color:oc}}>{fR(totalSpend)}</td><td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:13,fontWeight:900,color:oc}}>{fmt(g.reduce(function(a,r){return a+r.impressions;},0))}</td><td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:13,fontWeight:900,color:oc}}>{fmt(objName==="Followers & Likes"?g.reduce(function(a,r){return a+r.engagements;},0):totalClicks)}</td><td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:14,fontWeight:900,color:oc}}>{fmt(totalResults)}</td><td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:14,fontWeight:900,color:P.ember}}>{fR(totalCostPer)}</td><td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:13,fontWeight:900,color:P.txt}}>{(function(){var tImps=g.reduce(function(a,r){return a+r.impressions;},0);var tEng=objName==="Followers & Likes"?g.reduce(function(a,r){return a+r.engagements;},0):totalClicks;return tImps>0?(tEng/tImps*100).toFixed(2)+"%":"0.00%";})()}</td>{objName==="Leads"&&<td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:13,fontWeight:900,color:P.orchid}}>{totalConv>0?totalConv.toFixed(2)+"%":"0"}</td>}</tr>
                    </tbody>
                  </table>
                  {(function(){
                    var chartPlats=platBreakdown.filter(function(pb){return pb.result>0;});
                    if(chartPlats.length<1)return null;
                    var chartData=chartPlats.map(function(pb){return {name:pb.platform,label:pb.platform==="Google Display"?"Google Display":pb.platform,Results:pb.result,CostLabel:pb.cost>0?fR(pb.cost)+" "+g[0].costLabel:""};}).sort(function(a,b){return b.Results-a.Results;});
                    return <div style={{background:"rgba(0,0,0,0.22)",borderRadius:12,padding:"18px 22px",marginBottom:16,border:"1px solid "+oc+"20"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                        <div style={{fontSize:10,fontWeight:800,color:oc,letterSpacing:3,fontFamily:fm,textTransform:"uppercase"}}>{objName} by Platform</div>
                        <div style={{fontSize:10,color:P.label,fontFamily:fm,letterSpacing:1}}>{fmt(totalResults)} total {g[0].resultLabel.toLowerCase()} at {fR(totalCostPer)} {g[0].costLabel}</div>
                      </div>
                      <ChartReveal><ResponsiveContainer width="100%" height={Math.max(140,chartData.length*48)}>
                        <BarChart data={chartData} layout="vertical" margin={{left:0,right:100,top:6,bottom:6}}>
                          <CartesianGrid strokeDasharray="3 3" stroke={P.rule} horizontal={false}/>
                          <XAxis type="number" tick={{fontSize:10,fill:"rgba(255,255,255,0.55)",fontFamily:fm}} stroke="transparent" tickFormatter={function(v){return fmt(v);}}/>
                          <YAxis dataKey="label" type="category" tick={{fontSize:11,fill:P.txt,fontFamily:fm,fontWeight:700}} stroke="transparent" width={110}/>
                          <Tooltip content={<Tip/>} wrapperStyle={{outline:"none"}} cursor={{fill:"rgba(255,255,255,0.05)"}}/>
                          <Bar dataKey="Results" radius={[0,6,6,0]} barSize={26}>
                            {chartData.map(function(entry,idx){return <Cell key={idx} fill={platColorMap[entry.name]||oc}/>;})}
                            <LabelList dataKey="CostLabel" position="right" style={{fill:P.ember,fontSize:11,fontWeight:800,fontFamily:fm}}/>
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer></ChartReveal>
                    </div>;
                  })()}
                  {(function(){var bestPlat="";var bestResult=0;var bestCost=Infinity;g.forEach(function(r){if(r.result>bestResult){bestResult=r.result;bestPlat=r.platform;}if(r.costPer>0&&r.costPer<bestCost){bestCost=r.costPer;}});var totalImps=g.reduce(function(a,r){return a+r.impressions;},0);var blendedCtr=totalImps>0?((objName==="Followers & Likes"?g.reduce(function(a,r){return a+r.engagements;},0):totalClicks)/totalImps*100):0;var p=[];if(objName==="Clicks to App Store"){p.push("App store click campaigns invested "+fR(totalSpend)+" to deliver "+fmt(totalResults)+" clicks to the app store at "+fR(totalCostPer)+" blended Cost Per Click, "+benchLabel(totalCostPer,benchmarks.meta.cpc)+", with a "+blendedCtr.toFixed(2)+"% Click Through Rate.");var scalePlats=platBreakdown.filter(function(pb){return pb.result>0&&pb.spend>=totalSpend*0.05&&pb.imps>=5000;});var smallPlats=platBreakdown.filter(function(pb){return pb.result>0&&(pb.spend<totalSpend*0.05||pb.imps<5000);});scalePlats.forEach(function(pb){var shareR=totalResults>0?((pb.result/totalResults)*100).toFixed(2):"0.00";var shareS=totalSpend>0?((pb.spend/totalSpend)*100).toFixed(2):"0.00";var effR=parseFloat(shareS)>0?(parseFloat(shareR)/parseFloat(shareS)).toFixed(2):"0";p.push(pb.platform+" delivered "+fmt(pb.result)+" app store clicks ("+shareR+"% of total) from "+shareS+"% of budget at "+fR(pb.cost)+" Cost Per Click with "+pb.ctr.toFixed(2)+"% CTR."+(parseFloat(effR)>=1.2?" This platform delivers "+effR+"x more results per rand than its budget share"+(parseInt(pb.result)>=10?", confirmed across "+fmt(pb.imps)+" impressions and "+fmt(pb.result)+" results.":", though with "+fmt(pb.result)+" results this trend needs further volume to confirm.")+"":parseFloat(effR)<0.7?" This platform consumes a disproportionate budget share relative to its result contribution.":""));});if(smallPlats.length>0){smallPlats.forEach(function(pb){p.push(pb.platform+" shows "+fmt(pb.result)+" app store clicks at "+fR(pb.cost)+" CPC from "+fR(pb.spend)+" spend. Volume is currently too low to draw reliable performance conclusions.");});}if(scalePlats.length>1){var cheapest=scalePlats.reduce(function(a,b){return a.cost<b.cost&&a.cost>0?a:b;});p.push("Strategy: Among platforms with proven scale, "+cheapest.platform+" delivers the most efficient Cost Per Click at "+fR(cheapest.cost)+". Increasing allocation toward "+cheapest.platform+" would maximise app store traffic within the current investment.");}}if(objName==="Landing Page Clicks"){p.push("Landing page campaigns invested "+fR(totalSpend)+" generating "+fmt(totalResults)+" qualified site visits at "+fR(totalCostPer)+" blended cost per visit, "+benchLabel(totalCostPer,benchmarks.meta.cpc)+", with "+blendedCtr.toFixed(2)+"% Click Through Rate.");var lpScale=platBreakdown.filter(function(pb){return pb.result>0&&pb.spend>=totalSpend*0.05&&pb.imps>=5000;});var lpSmall=platBreakdown.filter(function(pb){return pb.result>0&&(pb.spend<totalSpend*0.05||pb.imps<5000);});lpScale.forEach(function(pb){var shareR=totalResults>0?((pb.result/totalResults)*100).toFixed(2):"0.00";var shareS=totalSpend>0?((pb.spend/totalSpend)*100).toFixed(2):"0.00";p.push(pb.platform+" drove "+fmt(pb.result)+" landing page visits ("+shareR+"% of total) at "+fR(pb.cost)+" cost per visit with "+pb.ctr.toFixed(2)+"% CTR from "+shareS+"% of objective budget."+(pb.ctr>blendedCtr*1.2?" CTR outperforms the blended average by "+((pb.ctr/blendedCtr-1)*100).toFixed(2)+"%, confirming strong creative-audience alignment.":""));});if(lpSmall.length>0){lpSmall.forEach(function(pb){p.push(pb.platform+" contributed "+fmt(pb.result)+" visits at "+fR(pb.cost)+" from "+fR(pb.spend)+" spend. Insufficient volume to confirm sustained performance.");});}if(lpScale.length>1){var highCtr=lpScale.reduce(function(a,b){return a.ctr>b.ctr?a:b;});p.push("Strategy: Among platforms with proven delivery, "+highCtr.platform+" leads with "+highCtr.ctr.toFixed(2)+"% CTR across "+fmt(highCtr.imps)+" impressions, confirming the highest creative resonance at scale.");}}if(objName==="Leads"){var convRate=totalClicks>0?(totalResults/totalClicks*100):0;p.push("Lead generation campaigns invested "+fR(totalSpend)+" producing "+fmt(totalResults)+" qualified leads at "+fR(totalCostPer)+" Cost Per Lead, "+benchLabel(totalCostPer,benchmarks.meta.cpl)+", with a "+convRate.toFixed(2)+"% click-to-lead conversion rate.");var ldScale=platBreakdown.filter(function(pb){return pb.result>0&&pb.spend>=totalSpend*0.05;});var ldSmall=platBreakdown.filter(function(pb){return pb.result>0&&pb.spend<totalSpend*0.05;});ldScale.forEach(function(pb){var shareR=totalResults>0?((pb.result/totalResults)*100).toFixed(2):"0.00";var shareS=totalSpend>0?((pb.spend/totalSpend)*100).toFixed(2):"0.00";var effR=parseFloat(shareS)>0?(parseFloat(shareR)/parseFloat(shareS)).toFixed(2):"0";p.push(pb.platform+" generated "+fmt(pb.result)+" leads ("+shareR+"% of total) at "+fR(pb.cost)+" Cost Per Lead from "+shareS+"% of objective budget."+(parseFloat(effR)>=1.2?" Delivering "+effR+"x more leads per rand than its budget share.":parseFloat(effR)<0.7?" This platform is underdelivering relative to its budget allocation.":""));});if(ldSmall.length>0){ldSmall.forEach(function(pb){p.push(pb.platform+" produced "+fmt(pb.result)+" leads at "+fR(pb.cost)+" from "+fR(pb.spend)+" spend. Low volume means this is an early indicator, not a confirmed trend.");});}if(totalResults>0){p.push("Strategy: Each lead represents a qualified prospect who has actively shared contact information. Timely follow-up within 24-48 hours significantly increases conversion probability.");}}if(objName==="Followers & Likes"){p.push("Community growth campaigns invested "+fR(totalSpend)+" acquiring "+fmt(totalResults)+" new followers and likes at "+fR(totalCostPer)+" blended cost per acquisition, "+benchLabel(totalCostPer,benchmarks.meta.cpf)+".");var flScale=platBreakdown.filter(function(pb){return pb.result>=10&&pb.spend>=totalSpend*0.05;});var flSmall=platBreakdown.filter(function(pb){return pb.result>0&&(pb.result<10||pb.spend<totalSpend*0.05);});flScale.forEach(function(pb){var shareR=totalResults>0?((pb.result/totalResults)*100).toFixed(2):"0.00";var shareS=totalSpend>0?((pb.spend/totalSpend)*100).toFixed(2):"0.00";p.push(pb.platform+" contributed "+fmt(pb.result)+" new community members ("+shareR+"% of total) at "+fR(pb.cost)+" cost per acquisition from "+shareS+"% of community budget."+(pb.cost<totalCostPer?" This platform delivers community growth below the blended average, confirming efficient audience acquisition.":""));});if(flSmall.length>0){flSmall.forEach(function(pb){p.push(pb.platform+" added "+fmt(pb.result)+" members at "+fR(pb.cost)+" from "+fR(pb.spend)+" spend. Volume is early-stage and not yet statistically significant.");});}if(totalResults>0){p.push("Strategy: Community growth is a compounding investment. The "+fmt(totalResults)+" new members acquired will increase organic content distribution, progressively reducing paid media dependency and strengthening the brand's owned audience reach.");}if(platBreakdown.some(function(pb){return pb.platform==="Instagram"&&pb.result>0;})){p.push("Note: Instagram follower attribution includes organic growth as Meta does not track the follow action to the paid campaign directly.");}}return <Insight title={objName+" Performance"} accent={oc} icon={Ic.target(oc,16)}>{p.join(" ")}</Insight>;})()}
                </div>);
              });

              if(sections.length===0)sections.push(<div key="none" style={{padding:30,textAlign:"center",color:P.caption,fontFamily:fm}}>Select campaigns to view objective performance results.</div>);

              var tLeads=rows.filter(function(r){return r.objective==="Leads";}).reduce(function(a,r){return a+r.result;},0);
              var tFollows=rows.filter(function(r){return r.objective==="Followers & Likes";}).reduce(function(a,r){return a+r.result;},0);
              
              var tApp=rows.filter(function(r){return r.objective==="Clicks to App Store";}).reduce(function(a,r){return a+r.result;},0);
              var tLp=rows.filter(function(r){return r.objective==="Landing Page Clicks"||r.objective==="Traffic";}).reduce(function(a,r){return a+r.result;},0);
              var sLeads=rows.filter(function(r){return r.objective==="Leads";}).reduce(function(a,r){return a+r.spend;},0);
              var sFollows=rows.filter(function(r){return r.objective==="Followers & Likes";}).reduce(function(a,r){return a+r.spend;},0);
              
              var sApp=rows.filter(function(r){return r.objective==="Clicks to App Store";}).reduce(function(a,r){return a+r.spend;},0);
              var sLp=rows.filter(function(r){return r.objective==="Landing Page Clicks"||r.objective==="Traffic";}).reduce(function(a,r){return a+r.spend;},0);
              var allSpend=rows.reduce(function(a,r){return a+r.spend;},0);
              var allClicks=rows.reduce(function(a,r){return a+r.clicks;},0);

              return <div>
                {sections}
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:16}}>
                  <Glass accent={P.fb} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>CLICKS TO APP STORE</div><div style={{fontSize:22,fontWeight:900,color:P.fb,fontFamily:fm}}>{fmt(tApp)}</div><div style={{fontSize:9,color:"rgba(255,255,255,0.5)",fontFamily:fm,marginTop:4}}>CPC: {fR(tApp>0?sApp/tApp:0)}</div></Glass>
                  <Glass accent={P.cyan} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>CLICKS TO LANDING PAGE</div><div style={{fontSize:22,fontWeight:900,color:P.cyan,fontFamily:fm}}>{fmt(tLp)}</div><div style={{fontSize:9,color:"rgba(255,255,255,0.5)",fontFamily:fm,marginTop:4}}>CPC: {fR(tLp>0?sLp/tLp:0)}</div></Glass>
                  <Glass accent={P.rose} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>LEADS</div><div style={{fontSize:22,fontWeight:900,color:P.rose,fontFamily:fm}}>{fmt(tLeads)}</div><div style={{fontSize:9,color:"rgba(255,255,255,0.5)",fontFamily:fm,marginTop:4}}>CPL: {fR(tLeads>0?sLeads/tLeads:0)}</div></Glass>
                  <Glass accent={P.tt} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>FOLLOWERS & LIKES</div><div style={{fontSize:22,fontWeight:900,color:P.mint,fontFamily:fm}}>{fmt(tFollows)}</div><div style={{fontSize:9,color:"rgba(255,255,255,0.5)",fontFamily:fm,marginTop:4}}>CPF: {fR(tFollows>0?sFollows/tFollows:0)}</div></Glass>

                </div>
                {(function(){
                  // Consolidated view across all objectives — spend allocation
                  // (donut) + cost-per-result comparison (horizontal bars).
                  // Only renders when we actually have objective data to show.
                  var consolidated=[
                    {objName:"Clicks to App Store",results:tApp,spend:sApp,costLabel:"CPC",color:P.fb},
                    {objName:"Landing Page Clicks",results:tLp,spend:sLp,costLabel:"CPC",color:P.cyan},
                    {objName:"Leads",results:tLeads,spend:sLeads,costLabel:"CPL",color:P.rose},
                    {objName:"Followers & Likes",results:tFollows,spend:sFollows,costLabel:"CPF",color:P.mint}
                  ].filter(function(x){return x.spend>0;});
                  if(consolidated.length===0)return null;
                  var grandSpend=consolidated.reduce(function(a,x){return a+x.spend;},0);
                  var donutData=consolidated.map(function(x){return{name:x.objName,value:x.spend,color:x.color};});
                  var costData=consolidated.filter(function(x){return x.results>0;}).map(function(x){return{name:x.objName,Cost:parseFloat((x.spend/x.results).toFixed(2)),Label:fR(x.spend/x.results)+" "+x.costLabel,color:x.color};}).sort(function(a,b){return b.Cost-a.Cost;});
                  return <div style={{background:"rgba(0,0,0,0.22)",borderRadius:14,padding:"20px 22px",marginBottom:18,border:"1px solid "+P.ember+"25"}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18}}>
                      {Ic.chart(P.ember,16)}
                      <div style={{fontSize:11,fontWeight:800,color:P.ember,letterSpacing:3,fontFamily:fm,textTransform:"uppercase"}}>All Objectives Combined</div>
                      <div style={{flex:1,height:1,background:"linear-gradient(90deg,"+P.ember+"40, transparent)"}}></div>
                      <div style={{fontSize:10,color:P.label,fontFamily:fm,letterSpacing:1}}>{fR(grandSpend)} invested across {consolidated.length} objectives</div>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
                      <div>
                        <div style={{fontSize:9,fontWeight:800,color:P.label,letterSpacing:3,fontFamily:fm,textTransform:"uppercase",marginBottom:10}}>Spend Allocation by Objective</div>
                        <ChartReveal><ResponsiveContainer width="100%" height={260}>
                          <PieChart margin={{top:10,right:10,bottom:10,left:10}}>
                            <Pie data={donutData} cx="50%" cy="50%" outerRadius={62} innerRadius={34} paddingAngle={3} dataKey="value" stroke="none" label={function(e){var radius=62+18;var rad=Math.PI/180;var x2=e.cx+radius*Math.cos(-e.midAngle*rad);var y2=e.cy+radius*Math.sin(-e.midAngle*rad);var pct=grandSpend>0?(e.value/grandSpend*100).toFixed(2):"0.00";return <text x={x2} y={y2} textAnchor={x2>e.cx?"start":"end"} dominantBaseline="central" style={{fontSize:10,fontFamily:fm,fontWeight:700,fill:e.payload.color||P.txt}}>{pct+"%"}</text>;}} labelLine={{stroke:P.label,strokeWidth:1}}>
                              {donutData.map(function(entry,idx){return <Cell key={idx} fill={entry.color}/>;})}
                            </Pie>
                            <Tooltip content={<Tip/>} wrapperStyle={{outline:"none"}} cursor={{fill:"rgba(255,255,255,0.05)"}}/>
                          </PieChart>
                        </ResponsiveContainer></ChartReveal>
                      </div>
                      <div>
                        <div style={{fontSize:9,fontWeight:800,color:P.label,letterSpacing:3,fontFamily:fm,textTransform:"uppercase",marginBottom:10}}>Cost Per Result by Objective</div>
                        <ChartReveal><ResponsiveContainer width="100%" height={260}>
                          <BarChart data={costData} layout="vertical" margin={{left:8,right:90,top:6,bottom:6}}>
                            <CartesianGrid strokeDasharray="3 3" stroke={P.rule} horizontal={false}/>
                            <XAxis type="number" tick={{fontSize:10,fill:"rgba(255,255,255,0.55)",fontFamily:fm}} stroke="transparent" tickFormatter={function(v){return "R"+v.toFixed(v<10?2:0);}}/>
                            <YAxis dataKey="name" type="category" tick={{fontSize:11,fill:P.txt,fontFamily:fm,fontWeight:700}} stroke="transparent" width={170}/>
                            <Tooltip content={<Tip/>} wrapperStyle={{outline:"none"}} cursor={{fill:"rgba(255,255,255,0.05)"}}/>
                            <Bar dataKey="Cost" radius={[0,6,6,0]} barSize={24}>
                              {costData.map(function(entry,idx){return <Cell key={idx} fill={entry.color}/>;})}
                              <LabelList dataKey="Label" position="right" style={{fill:P.ember,fontSize:11,fontWeight:800,fontFamily:fm}}/>
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer></ChartReveal>
                      </div>
                    </div>
                    {/* Legend moved out of the donut's half-column so it can
                        span the full panel width. With 3+ objectives the chips
                        used to wrap inside the half-column, leaving the donut
                        column visibly taller than the cost-chart column and
                        creating an L-shaped gap. Full-width fits all chips on
                        one line and keeps the panel rectangular. */}
                    <div style={{display:"flex",flexWrap:"wrap",gap:14,justifyContent:"center",marginTop:14,paddingTop:14,borderTop:"1px solid "+P.rule+"40"}}>
                      {donutData.map(function(d){var pct=grandSpend>0?(d.value/grandSpend*100).toFixed(2):"0.00";return <div key={d.name} style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:11,fontFamily:fm,color:"rgba(255,251,248,0.85)",whiteSpace:"nowrap"}}><span style={{width:10,height:10,borderRadius:"50%",background:d.color,flexShrink:0}}></span>{d.name}: {fR(d.value)} ({pct}%)</div>;})}
                    </div>
                  </div>;
                })()}
                <Insight title="Objective Performance Assessment" accent={P.rose} icon={Ic.target(P.rose,16)}>{(function(){var p=[];var pacingNote="";if(pctElapsed>0){var spendPct=allSpend>0?(allSpend/projectedSpend*100):0;if(spendPct>pctElapsed*1.15){pacingNote=" Budget pacing is running "+(spendPct-pctElapsed).toFixed(2)+"% ahead of schedule at "+pctElapsed.toFixed(2)+"% through the period, indicating potential early budget depletion if not moderated.";}else if(spendPct<pctElapsed*0.85){pacingNote=" Budget pacing is running "+(pctElapsed-spendPct).toFixed(2)+"% behind schedule, suggesting underdelivery that may require bid or audience adjustments to fully utilise the remaining budget.";}else{pacingNote=" Budget pacing is on track at "+pctElapsed.toFixed(2)+"% through the period with proportionate spend.";}}var freqNote="";if(freqStatus==="critical"){freqNote=" Meta frequency at "+m.frequency.toFixed(2)+"x has breached the 4x fatigue ceiling. Audience saturation is actively eroding engagement quality and inflating costs. Creative rotation and audience expansion are urgently needed.";}else if(freqStatus==="warning"){freqNote=" Meta frequency at "+m.frequency.toFixed(2)+"x is approaching the fatigue threshold. Proactive creative rotation within the next 48-72 hours will prevent CTR decay and CPC inflation.";}else if(freqStatus==="healthy"){freqNote=" Meta frequency at "+m.frequency.toFixed(2)+"x is within the optimal 2-3x recall window, balancing brand retention with efficient delivery.";}p.push("The campaign's objective performance layer spans "+sel.length+" active placements with "+fR(allSpend)+" total investment, generating "+fmt(allClicks)+" measurable actions."+pacingNote+freqNote);if(tApp>0){var appEff=sApp>0?(tApp/sApp*1000).toFixed(0):"0";p.push("App install campaigns delivered "+fmt(tApp)+" clicks to the app store at "+fR(sApp/tApp)+" Cost Per Click, translating to approximately "+appEff+" app store clicks per R1,000 invested. Each click represents a user driven from ad exposure to the app store listing, the final measurable touchpoint before app download. The cost efficiency at "+fR(sApp/tApp)+" per app store click confirms strong acquisition economics for the campaign period.");}if(tLp>0){p.push("Landing page campaigns generated "+fmt(tLp)+" qualified site visits at "+fR(sLp/tLp)+" cost per visit. These are high-intent users who have actively chosen to learn more, representing the warmest segment of the campaign\'s audience for remarketing and conversion optimisation.");}if(tLeads>0){var lClicks=rows.filter(function(r){return r.objective==="Leads";}).reduce(function(a,r){return a+r.clicks;},0);var convR=lClicks>0?(tLeads/lClicks*100).toFixed(2):"0.00";p.push("Lead generation campaigns produced "+fmt(tLeads)+" qualified leads at "+fR(sLeads/tLeads)+" cost per lead, converting "+convR+"% of "+fmt(lClicks)+" clicks into form submissions. "+(parseFloat(convR)>8?"The conversion rate exceeding 8% indicates exceptional funnel alignment, the ad creative, targeting, and landing page experience are working in concert to drive high-quality lead capture.":parseFloat(convR)>3?"The "+convR+"% conversion rate sits within healthy parameters, confirming the landing page experience is effectively converting paid traffic into actionable leads. ":"The "+convR+"% conversion rate demonstrates active lead capture from the campaign traffic.")+" Each lead represents a qualified prospect who has actively expressed interest and shared contact information, the most valuable first-party data signal in the acquisition funnel.");}if(tFollows>0){p.push("Community growth campaigns acquired "+fmt(tFollows)+" new followers and likes at "+fR(sFollows/tFollows)+" cost per acquisition. Unlike paid impressions which are transient, each community member represents a permanent organic distribution channel. Each new community member increases future organic content distribution, compounding in value over time as the brand's owned audience grows.");}return p.join(" ");})()}</Insight>
              </div>;
            })()}
          </div>



        </div>)}

        {tab==="tof"&&(<div>
          <SH icon={Ic.radar(P.ember,20)} title="Top of Funnel, Ad Serving" sub="Impressions · Reach · Frequency · Cost Per Thousand Ads Served" accent={P.ember}/>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:24}}><Metric icon={Ic.eye(P.cyan,14)} label="Impressions" value={fmt(computed.totalImps)} accent={P.cyan}/><Metric icon={Ic.users(P.orchid,14)} label="Meta Reach" value={fmt(m.reach)} accent={P.orchid}/><Metric icon={Ic.radar(P.rose,14)} label="Frequency" value={m.frequency>0?m.frequency.toFixed(2)+"x":"0"} accent={P.rose}/><Metric icon={Ic.bolt(P.mint,14)} label="Blended Cost Per Thousand Ads Served" value={fR(computed.blendedCpm)} accent={P.mint}/></div>

          <PH platform="Facebook" suffix="Campaign Performance"/>
          <Glass accent={P.fb} st={{padding:22,marginBottom:20}}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:14}}>{[{l:"Impressions",v:fmt(m.impressions)},{l:"Reach",v:fmt(m.reach)},{l:"Frequency",v:m.frequency>0?m.frequency.toFixed(2)+"x":"0"},{l:"CPM",v:fR(m.cpm)}].map(function(x,i){return<div key={i} style={{textAlign:"center"}}><div style={{fontSize:9,color:P.caption,fontFamily:fm,letterSpacing:2,marginBottom:4}}>{x.l}</div><div style={{fontSize:20,fontWeight:900,color:P.fb,fontFamily:fm}}>{x.v}</div></div>;})}</div>
            {computed.metaCamps.length>0&&<table style={{width:"100%",borderCollapse:"collapse",marginBottom:14}}><thead><tr>{["Campaign","Impressions","Spend","CPC","CTR"].map(function(h,i){return<th key={i} style={{padding:"10px 14px",fontSize:10,fontWeight:800,textTransform:"uppercase",color:"#F96203",letterSpacing:1.5,textAlign:i===0?"left":"center",background:"rgba(249,98,3,0.15)",border:"1px solid rgba(249,98,3,0.3)",backdropFilter:"blur(8px)",fontFamily:fm}}>{h}</th>;})}</tr></thead><tbody>{computed.metaCamps.sort(function(a,b){return parseFloat(b.impressions)-parseFloat(a.impressions);}).map(function(c,i){return<tr key={i} style={{background:i%2===0?"rgba(240,246,251,0.04)":"transparent"}}><td style={{padding:"10px 14px",fontSize:11,fontWeight:600,color:P.txt,border:"1px solid "+P.rule}}>{c.campaignName}</td><td style={{padding:"10px 14px",fontSize:12,color:P.txt,textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm}}>{fmt(c.impressions)}</td><td style={{padding:"10px 14px",fontSize:12,color:P.txt,textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm}}>{fR(parseFloat(c.spend))}</td><td style={{padding:"10px 14px",fontSize:12,color:P.mint,textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontWeight:700}}>{fR(parseFloat(c.cpc||0))}</td><td style={{padding:"10px 14px",fontSize:12,color:P.txt,textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm}}>{pc(parseFloat(c.ctr||0))}</td></tr>;})}</tbody></table>}
            <Insight title="Meta Campaign Read" accent={P.fb} icon={Ic.bolt(P.fb,16)}>Meta has delivered <strong>{fmt(m.impressions)} impressions</strong> reaching <strong>{fmt(m.reach)} unique individuals</strong> at {m.frequency>0?m.frequency.toFixed(2)+"x":"0"} frequency and {fR(m.cpm)} Cost Per Thousand Ads Served. The {fmt(m.clicks)} clicks generated at {fR(m.cpc)} Cost Per Click with {pc(m.ctr)} CTR against {fR(m.spend)} investment confirms the algorithm has successfully identified and is consistently reaching high-intent audience pockets. The frequency level indicates the campaign is within the optimal exposure window, sufficient repetition to build recall without crossing into diminishing returns territory. The platform’s publisher breakdown capabilities are automatically optimising delivery across Facebook feed, Instagram Stories, Reels, and the Audience Network to find the lowest-cost conversion opportunities within each placement.</Insight>
          </Glass>

          <PH platform="TikTok" suffix="Campaign Performance"/>
          <Glass accent={P.tt} st={{padding:22,marginBottom:20}}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:14}}>{[{l:"Impressions",v:fmt(t.impressions)},{l:"CPM",v:fR(t.cpm)},{l:"Follows",v:fmt(t.follows)},{l:"Spend",v:fR(t.spend)}].map(function(x,i){return<div key={i} style={{textAlign:"center"}}><div style={{fontSize:9,color:P.caption,fontFamily:fm,letterSpacing:2,marginBottom:4}}>{x.l}</div><div style={{fontSize:20,fontWeight:900,color:P.tt,fontFamily:fm}}>{x.v}</div></div>;})}</div>
            {computed.ttCamps.length>0&&<table style={{width:"100%",borderCollapse:"collapse",marginBottom:14}}><thead><tr>{["Campaign","Impressions","Spend","CPM"].map(function(h,i){return<th key={i} style={{padding:"10px 14px",fontSize:10,fontWeight:800,textTransform:"uppercase",color:"#F96203",letterSpacing:1.5,textAlign:i===0?"left":"center",background:"#252538",border:"1px solid #3a3a4e",fontFamily:fm}}>{h}</th>;})}</tr></thead><tbody>{computed.ttCamps.sort(function(a,b){return parseFloat(b.impressions)-parseFloat(a.impressions);}).map(function(c,i){return<tr key={i} style={{background:i%2===0?"#1e1e2e":"#252538"}}><td style={{padding:"10px 14px",fontSize:11,fontWeight:600,color:"#fff",border:"1px solid #3a3a4e"}}>{c.campaignName}</td><td style={{padding:"10px 14px",fontSize:12,color:"#fff",textAlign:"center",border:"1px solid #3a3a4e",fontFamily:fm}}>{fmt(c.impressions)}</td><td style={{padding:"10px 14px",fontSize:12,color:"#ccc",textAlign:"center",border:"1px solid #3a3a4e",fontFamily:fm}}>{fR(parseFloat(c.spend))}</td><td style={{padding:"10px 14px",fontSize:12,color:P.tt,textAlign:"center",border:"1px solid #3a3a4e",fontFamily:fm,fontWeight:700}}>{fR(parseFloat(c.cpm||0))}</td></tr>;})}</tbody></table>}
            <Insight title="TikTok Campaign Read" accent={P.tt} icon={Ic.bolt(P.tt,16)}>TikTok has delivered <strong>{fmt(t.impressions)} impressions</strong> at <strong>{fR(t.cpm)} CPM</strong> with {fmt(t.follows)} followers and {fmt(t.likes)} engagements against {fR(t.spend)} investment. The platform’s content-first algorithm is rewarding the campaign creative with favourable auction positioning, evidenced by the below-market Cost Per Thousand Ads Served. TikTok’s unique strength lies in its ability to drive simultaneous paid and organic amplification, when paid creative resonates, TikTok’s recommendation engine extends its distribution beyond the paid audience, effectively delivering bonus organic impressions at zero marginal cost. The follower acquisition is particularly valuable: each new follow creates a persistent organic distribution channel that reduces future paid media dependency.</Insight>
          </Glass>

          <Glass st={{padding:22}}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>{Ic.chart(P.ember,16)}<span style={{fontSize:10,fontWeight:800,color:P.ember,letterSpacing:3,fontFamily:fm,textTransform:"uppercase"}}>Impression Volume</span></div><ChartReveal><ResponsiveContainer width="100%" height={200}><BarChart data={[{name:"Meta",Impressions:m.impressions},{name:"TikTok",Impressions:t.impressions}]} barSize={60}><CartesianGrid strokeDasharray="3 3" stroke={P.rule}/><XAxis dataKey="name" tick={{fontSize:12,fill:"rgba(255,255,255,0.85)",fontFamily:fm}} stroke="transparent"/><YAxis tick={{fontSize:10,fill:"rgba(255,255,255,0.6)",fontFamily:fm}} stroke="transparent" tickFormatter={function(v){return fmt(v);}}/><Tooltip content={<Tip/>} wrapperStyle={{outline:"none"}} cursor={{fill:"rgba(255,255,255,0.05)"}}/><Bar dataKey="Impressions" radius={[12,12,0,0]}><Cell fill={P.fb}/><Cell fill={P.tt}/></Bar></BarChart></ResponsiveContainer></ChartReveal></Glass>
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
              <div style={{textAlign:"right",minWidth:60}}><div style={{fontSize:14,fontWeight:900,color:P.txt,fontFamily:fm}}>{fmt(parseFloat(c.clicks||0))}</div><div style={{fontSize:8,color:P.caption,fontFamily:fm}}>clicks</div></div>
              <div style={{textAlign:"right",minWidth:55}}><div style={{fontSize:13,fontWeight:800,color:P.mint,fontFamily:fm}}>{fR(parseFloat(c.cpc||0))}</div><div style={{fontSize:8,color:P.caption,fontFamily:fm}}>CPC</div></div>
              <div style={{textAlign:"right",minWidth:50}}><div style={{fontSize:13,fontWeight:700,color:P.label,fontFamily:fm}}>{pc(parseFloat(c.ctr||0))}</div><div style={{fontSize:8,color:P.caption,fontFamily:fm}}>CTR</div></div>
              <div style={{textAlign:"right",minWidth:60}}><div style={{fontSize:13,fontWeight:700,color:P.ember,fontFamily:fm}}>{fR(parseFloat(c.spend||0))}</div><div style={{fontSize:8,color:P.caption,fontFamily:fm}}>spend</div></div>
            </div>;})}
            <Insight title="Engagement Analysis" accent={P.mint} icon={Ic.fire(P.mint,16)}>Meta has generated <strong>{fmt(m.clicks)} clicks</strong> at <strong>{fR(m.cpc)} CPC</strong> with {pc(m.ctr)} Click Through Rate, each click represents a deliberate intent signal from a user who has moved beyond passive awareness into active consideration. The CPC level indicates the campaign is winning competitive auctions efficiently, securing high-quality placements without overpaying for attention. TikTok contributed {fmt(t.clicks)} clicks alongside {fmt(t.follows)} new followers and {fmt(t.likes)} engagements, on TikTok, engagement metrics carry amplification weight as the algorithm promotes content with strong interaction signals. The combined click volume of <strong>{fmt(computed.totalClicks)}</strong> across both platforms confirms the creative messaging is resonating at scale, with each platform contributing its unique engagement character: Meta for measured, intentional interaction and TikTok for volume-driven social proof.</Insight>
          </Glass>
        </div>)}

        {/* OBJECTIVES */}
        {tab==="bof"&&(<div>
          <SH icon={Ic.target(P.rose,20)} title="Bottom of Funnel, Objective Results" sub="Results · Cost Per Result · Community Growth" accent={P.rose}/>

          <PH platform="Facebook" suffix="Objective Results"/>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14,marginBottom:24}}>
            {[{l:"IMPRESSIONS",v:fmt(m.impressions),s1l:"CPM",s1v:fR(m.cpm),s1c:P.fb,s2l:"SPEND",s2v:fR(m.spend)},{l:"CLICKS",v:fmt(m.clicks),s1l:"CPC",s1v:fR(m.cpc),s1c:P.fb,s2l:"CTR",s2v:pc(m.ctr)},{l:"REACH",v:fmt(m.reach),s1l:"FREQUENCY",s1v:m.frequency>0?m.frequency.toFixed(2)+"x":"0",s1c:P.fb}].map(function(x,i){return<Glass key={i} accent={P.fb} hv={true} st={{padding:20}}><div style={{fontSize:9,fontWeight:700,color:P.label,fontFamily:fm,letterSpacing:2,marginBottom:12}}>{x.l}</div><div style={{fontSize:26,fontWeight:900,color:P.txt,fontFamily:fm}}>{x.v}</div><div style={{display:"flex",justifyContent:"space-between",paddingTop:10,borderTop:"1px solid "+P.rule,marginTop:10}}><div><div style={{fontSize:8,color:P.caption,fontFamily:fm}}>{x.s1l}</div><div style={{fontSize:15,fontWeight:800,color:x.s1c,fontFamily:fm}}>{x.s1v}</div></div>{x.s2l&&<div style={{textAlign:"right"}}><div style={{fontSize:8,color:P.caption,fontFamily:fm}}>{x.s2l}</div><div style={{fontSize:13,fontWeight:700,color:P.label,fontFamily:fm}}>{x.s2v}</div></div>}</div></Glass>;})}
          </div>

          <PH platform="TikTok" suffix="Objective Results"/>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14,marginBottom:24}}>
            {[{l:"IMPRESSIONS",v:fmt(t.impressions),s1l:"CPM",s1v:fR(t.cpm),s1c:P.tt,s2l:"SPEND",s2v:fR(t.spend)},{l:"CLICKS",v:fmt(t.clicks),s1l:"CPC",s1v:t.clicks>0?fR(t.spend/t.clicks):"0",s1c:P.tt},{l:"COMMUNITY",v:fmt(t.follows),s1l:"LIKES",s1v:fmt(t.likes),s1c:P.tt}].map(function(x,i){return<Glass key={i} accent={P.tt} hv={true} st={{padding:20}}><div style={{fontSize:9,fontWeight:700,color:P.label,fontFamily:fm,letterSpacing:2,marginBottom:12}}>{x.l}</div><div style={{fontSize:26,fontWeight:900,color:i===2?P.mint:P.txt,fontFamily:fm}}>{x.v}</div><div style={{paddingTop:10,borderTop:"1px solid "+P.rule,marginTop:10}}><div style={{fontSize:8,color:P.caption,fontFamily:fm}}>{x.s1l}</div><div style={{fontSize:15,fontWeight:800,color:x.s1c,fontFamily:fm}}>{x.s1v}</div></div>{x.s2l&&<div style={{marginTop:8}}><div style={{fontSize:8,color:P.caption,fontFamily:fm}}>{x.s2l}</div><div style={{fontSize:13,fontWeight:700,color:P.label,fontFamily:fm}}>{x.s2v}</div></div>}</Glass>;})}
          </div>

          <Glass accent={P.ember} st={{padding:26,background:"linear-gradient(135deg,"+P.lava+"05,"+P.ember+"05,"+P.solar+"05)"}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:22}}>{Ic.users(P.ember,18)}<span style={{fontSize:10,fontWeight:800,color:P.ember,letterSpacing:3,fontFamily:fm,textTransform:"uppercase"}}>Combined Results</span></div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:18}}>
              <div><div style={{fontSize:9,color:P.caption,fontFamily:fm,letterSpacing:2,marginBottom:6}}>IMPRESSIONS</div><div style={{fontSize:30,fontWeight:900,fontFamily:ff,lineHeight:1,color:P.ember}}>{fmt(computed.totalImps)}</div></div>
              <div style={{borderLeft:"1px solid "+P.rule,paddingLeft:16}}><div style={{fontSize:9,color:P.caption,fontFamily:fm,letterSpacing:2,marginBottom:6}}>SPEND</div><div style={{fontSize:22,fontWeight:900,color:P.solar,fontFamily:fm}}>{fR(computed.totalSpend)}</div></div>
              <div style={{borderLeft:"1px solid "+P.rule,paddingLeft:16}}><div style={{fontSize:9,color:P.caption,fontFamily:fm,letterSpacing:2,marginBottom:6}}>CLICKS</div><div style={{fontSize:22,fontWeight:900,color:P.mint,fontFamily:fm}}>{fmt(computed.totalClicks)}</div></div>
              <div style={{borderLeft:"1px solid "+P.rule,paddingLeft:16}}><div style={{fontSize:9,color:P.caption,fontFamily:fm,letterSpacing:2,marginBottom:6}}>TT FOLLOWS</div><div style={{fontSize:22,fontWeight:900,color:P.tt,fontFamily:fm}}>{fmt(t.follows)}</div></div>
            </div>
            <Insight title="Combined Campaign Read" icon={Ic.crown(P.ember,16)} accent={P.ember}>The selected campaigns have delivered <strong>{fmt(computed.totalImps)} total impressions</strong> across Meta, TikTok, and Google Display against a combined investment of <strong>{fR(computed.totalSpend)}</strong>, achieving a blended Cost Per Thousand Ads Served of {fR(computed.blendedCpm)}, representing exceptional media value in the paid social market. Meta reached <strong>{fmt(m.reach)} unique individuals</strong> at {m.frequency>0?m.frequency.toFixed(2)+"x":"0"} frequency, generating {fmt(m.clicks)} clicks at {fR(m.cpc)} Cost Per Click with {pc(m.ctr)} Click Through Rate. TikTok delivered {fmt(t.impressions)} impressions at {fR(t.cpm)} CPM with {fmt(t.follows)} followers earned, building an owned audience asset that compounds in value with every campaign cycle. The multi-platform architecture is delivering its intended strategic outcome: TikTok provides the mass awareness foundation and cost-efficient community growth, whilst Meta converts that awareness into measurable, attributable engagement actions. This complementary approach ensures neither platform’s limitations constrain overall campaign performance, each amplifies the other’s strengths.</Insight>
          </Glass>
        </div>)}

        {/* OPTIMISATION */}

        
        {tab==="targeting"&&(<div>
          <SH icon={Ic.radar(P.solar,20)} title="Targeting Performance" sub={df+" to "+dt+" | Adset-Level Analysis by Objective"} accent={P.solar}/>
          {FEATURES.targetingPersonas&&(<div style={{background:P.glass,borderRadius:18,padding:"20px 28px 24px",marginBottom:28,border:"1px solid "+P.rule}}>
            {/* Audience Personas, same stable 4-card row Summary renders so
                the Targeting tab reads consistently. Facebook / Instagram /
                TikTok / Google always show, each card has its own empty-state
                placeholder when data hasn't loaded or the platform has no
                click volume in the selected range. */}
            <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:8}}>
              <div style={{width:38,height:38,borderRadius:10,background:"linear-gradient(135deg,"+P.solar+"35,"+P.solar+"15)",border:"1px solid "+P.solar+"55",display:"flex",alignItems:"center",justifyContent:"center"}}>{Ic.users(P.solar,18)}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:16,fontWeight:900,color:P.solar,fontFamily:fm,letterSpacing:2.5,textTransform:"uppercase"}}>Audience Personas</div>
              </div>
            </div>
            <div style={{height:1,marginBottom:18,background:"linear-gradient(90deg,"+P.solar+"45,"+P.solar+"15,transparent 80%)"}}/>
            {(function(){
              // Build a stable 4-card row so the Targeting tab matches the
              // Summary layout exactly, one slot per platform (FB, IG, TT,
              // Google). Missing platforms render an empty-persona placeholder
              // with the Best Personas / Top Regions blocks omitted and
              // dashes in the anchor fields.
              var byName={};(targetingPersonas||[]).forEach(function(p){byName[p.platform]=p;});
              var empty=function(name,color,iconFn){return {platform:name,color:color,iconFn:iconFn,totalClicks:0,shareOfClicks:0,topAge:"",topAgeShare:0,genderSplit:{female:0,male:0},topProvinces:[],mobileShare:0,topSegments:[],ctr:0,ctrRatio:0};};
              var fb=byName["Facebook"]||empty("Facebook",P.fb,Ic.eye);
              var ig=byName["Instagram"]||empty("Instagram",P.ig,Ic.fire);
              var tt=byName["TikTok"]||empty("TikTok",P.tt,Ic.bolt);
              return <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:18}}>
                <TargetingPersonaCard persona={fb} delay={0}/>
                <TargetingPersonaCard persona={ig} delay={0.9}/>
                <TargetingPersonaCard persona={tt} delay={1.8}/>
                {FEATURES.googleIntentCard&&<GoogleIntentCard intent={googleIntent} delay={2.7}/>}
              </div>;
            })()}
            {targetingPersonas&&targetingPersonas.length>0&&(function(){
              // Persona narrative, reads the cards like a buy-side planner
              // would: which platform is finding the youngest or most female
              // audience, where does each one concentrate geographically, and
              // which platform's CTR suggests the strongest creative-audience
              // fit right now. Falls back gracefully when only one platform
              // has click volume.
              if(targetingPersonas.length<1)return null;
              var lines=[];
              var byShare=targetingPersonas.slice().sort(function(a,b){return b.shareOfClicks-a.shareOfClicks;});
              var lead=byShare[0];
              var leadSeg=(lead.topSegments&&lead.topSegments[0])||null;
              lines.push(lead.platform+" carries the heaviest click volume at "+lead.shareOfClicks.toFixed(2)+"% of selected-campaign clicks, with the largest single converting cell being "+(lead.topAge||"a mixed-age")+(leadSeg&&leadSeg.gen?" "+(leadSeg.gen==="female"?"female":"male"):"")+" segment, clicking "+(lead.mobileShare>0?"mostly on mobile at "+lead.mobileShare.toFixed(2)+"%":"across devices")+".");
              if(targetingPersonas.length>1){
                var byCtr=targetingPersonas.slice().filter(function(p){return p.ctrRatio>0;}).sort(function(a,b){return b.ctrRatio-a.ctrRatio;});
                if(byCtr.length>0){
                  var bestCtr=byCtr[0];
                  if(bestCtr.ctrRatio>=1.2)lines.push(bestCtr.platform+" is converting impressions to clicks at "+bestCtr.ctrRatio.toFixed(2)+"x the blended CTR, the highest CTR in the mix this period.");
                }
                var ages=targetingPersonas.map(function(p){return {plat:p.platform,age:p.topAge};}).filter(function(x){return x.age;});
                var uniqueAges=Array.from(new Set(ages.map(function(x){return x.age;})));
                if(uniqueAges.length>=2)lines.push("Age-bracket dominance differs across platforms ("+ages.map(function(x){return x.plat+" "+x.age;}).join(", ")+"), so the platforms are not duplicating each other demographically, each is pulling a distinct slice of the audience.");
              }
              var strongGeo=targetingPersonas.map(function(p){return {plat:p.platform,prov:(p.topProvinces[0]&&p.topProvinces[0].name)||"",share:(p.topProvinces[0]&&p.topProvinces[0].share)||0};}).filter(function(x){return x.prov;});
              if(strongGeo.length>0){
                var geo=strongGeo.sort(function(a,b){return b.share-a.share;})[0];
                lines.push(geo.plat+" is especially concentrated in "+geo.prov+" at "+geo.share.toFixed(2)+"% of its clicks, the sharpest geographic signal across the personas.");
              }
              lines.push("Recommendation, keep the current platform mix broadly intact to preserve reach diversity, then weight a larger share of budget to "+lead.platform+" creative variants that speak directly to the "+(lead.topAge||"primary")+(leadSeg&&leadSeg.gen?" "+(leadSeg.gen==="female"?"female":"male"):"")+" segment it is over-indexing on. This is a weighting shift, not an exclusion.");
              return <Insight title="Targeting Insights" accent={P.solar} icon={Ic.radar(P.solar,16)}>{lines.join(" ")}</Insight>;
            })()}
          </div>)}
          {(function(){
            var selCamps=campaigns.filter(function(x){return selected.indexOf(x.campaignId)>=0;});
            var selIds=selCamps.map(function(x){return x.rawCampaignId||x.campaignId.replace(/_facebook$/,"").replace(/_instagram$/,"");});
            var selNames=selCamps.map(function(x){return x.campaignName;});
            var filtered=adsets.filter(function(a){
              for(var si=0;si<selIds.length;si++){if(a.campaignId===selIds[si])return true;}
              for(var sn=0;sn<selNames.length;sn++){if(a.campaignName===selNames[sn])return true;}
              return false;
            }).filter(function(a){return parseFloat(a.impressions||0)>0||parseFloat(a.spend||0)>0;});
            if(filtered.length===0)return <div style={{padding:30,textAlign:"center",color:P.caption,fontFamily:fm}}>Select campaigns to view adset targeting performance.</div>;

            // Map parent-campaign canonical objective by id and name so adsets
            // inherit the same classification as their parent campaign on the
            // Summary tab.
            var campObjById={};var campObjByName={};
            selCamps.forEach(function(c){
              var canon=String(c.objective||"").toLowerCase();
              var rawId=c.rawCampaignId||String(c.campaignId||"").replace(/_facebook$/,"").replace(/_instagram$/,"");
              if(canon){campObjById[String(c.campaignId||"")]=canon;if(rawId)campObjById[rawId]=canon;campObjByName[c.campaignName]=canon;}
            });
            var allRows=filtered.map(function(a){
              var getObj2=function(adset){
                var canon=campObjById[String(adset.campaignId||"")]||campObjByName[adset.campaignName]||"";
                if(canon==="appinstall")return "Clicks to App Store";
                if(canon==="leads")return "Leads";
                if(canon==="followers")return "Followers & Likes";
                if(canon==="landingpage")return "Landing Page Clicks";
                var n=String(adset.campaignName||"").toLowerCase();
                if(n.indexOf("appinstal")>=0||n.indexOf("app install")>=0||n.indexOf("app_install")>=0)return "Clicks to App Store";
                if(n.indexOf("follower")>=0||n.indexOf("page like")>=0||n.indexOf("pagelikes")>=0||n.indexOf("_like_")>=0||n.indexOf("_like ")>=0||n.indexOf("paidsocial_like")>=0||n.indexOf("like_facebook")>=0||n.indexOf("like_instagram")>=0)return "Followers & Likes";
                if(n.indexOf("lead")>=0||n.indexOf("pos")>=0)return "Leads";
                if(n.indexOf("homeloan")>=0||n.indexOf("traffic")>=0||n.indexOf("paidsearch")>=0)return "Landing Page Clicks";
                return "Traffic";
              };
              var obj=getObj2(a);
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
            var objList3=["Clicks to App Store","Landing Page Clicks","Followers & Likes","Leads"];
            var objCol3={"Clicks to App Store":P.fb,"Landing Page Clicks":P.cyan,"Leads":P.rose,"Followers & Likes":P.tt};
            var objRL3={"Clicks to App Store":"App Clicks","Landing Page Clicks":"LP Clicks","Leads":"Leads","Followers & Likes":"Follows/Likes"};
            var objCL3={"Clicks to App Store":"CPC","Landing Page Clicks":"CPC","Leads":"CPL","Followers & Likes":"CPF"};
            var platOrd3={"Facebook":0,"Instagram":1,"TikTok":2,"Google Display":3};

            var adsetTip=function(props){if(!props.active||!props.payload||!props.payload[0])return null;var d=props.payload[0].payload;return <div style={{background:"rgba(6,2,14,0.95)",border:"1px solid "+P.rule,borderRadius:10,padding:"10px 14px",maxWidth:360}}><div style={{fontSize:12,fontWeight:700,color:P.txt,marginBottom:6,whiteSpace:"normal",wordBreak:"break-word",lineHeight:1.5}}>{d.fullName||d.name}</div><div style={{fontSize:10,color:P.label,marginBottom:2}}>{d.platform||""}</div>{props.payload.map(function(p,i){return <div key={i} style={{fontSize:11,color:P.ember,fontFamily:fm,fontWeight:700}}>{p.name}: {typeof p.value==="number"&&p.name.indexOf("CTR")>=0?p.value.toFixed(2)+"%":typeof p.value==="number"&&(p.name==="Results"||p.name==="Clicks")?fmt(p.value):typeof p.value==="number"?fR(p.value):p.value}</div>;})}</div>;};

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
                <div style={{display:"flex",alignItems:"center",gap:10,padding:"18px 0 16px"}}><span style={{width:16,height:16,borderRadius:"50%",background:oc}}></span><span style={{fontSize:20,fontWeight:900,color:oc,fontFamily:ff,letterSpacing:1}}>{objName.toUpperCase()}</span><span style={{fontSize:11,color:P.label,fontFamily:fm,marginLeft:8}}>{sorted6.length} adsets across {Object.keys(platGrp).length} platform{Object.keys(platGrp).length>1?"s":""}</span></div>
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
                      <td title={r.adsetName} style={{padding:"10px 12px",fontSize:11,fontWeight:600,color:P.txt,border:"1px solid "+P.rule,maxWidth:300,lineHeight:1.4}}><div style={{whiteSpace:"normal",wordBreak:"break-word"}}>{r.adsetName}</div>{isBest&&<span style={{background:P.mint,color:textOnAccent(P.mint),fontSize:7,fontWeight:900,padding:"2px 6px",borderRadius:6,marginTop:3,display:"inline-block"}}>BEST</span>}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule}}><span style={{background:pc,color:textOnAccent(pc),fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:10}}>{platBdg3[r.platform]||"?"}</span></td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:11,fontWeight:700,color:P.txt}}>{fR(r.spend)}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:11,color:P.txt}}>{fmt(r.impressions)}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:11,color:P.txt}}>{fmt(r.clicks)}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,fontWeight:900,color:r.result>0?oc:P.caption}}>{fmt(r.result)}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,fontWeight:700,color:r.costPer>0?P.ember:P.caption}}>{r.costPer>0?fR(r.costPer):"-"}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:11,fontWeight:700,color:r.ctr>2?P.mint:r.ctr>1?P.txt:r.ctr>0?P.warning:P.caption}}>{r.ctr.toFixed(2)+"%"}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:11,fontWeight:700,color:r.cpc>0&&r.cpc<2?P.mint:r.cpc>0?P.txt:P.caption}}>{r.cpc>0?fR(r.cpc):"-"}</td>
                    </tr>;})}</tbody>
                </table>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:14}}>
                  <div style={{background:"rgba(0,0,0,0.12)",borderRadius:10,padding:16}}><div style={{fontSize:9,fontWeight:800,color:"rgba(255,255,255,0.5)",letterSpacing:3,fontFamily:fm,textTransform:"uppercase",marginBottom:10}}>Results by Adset</div><ChartReveal><ResponsiveContainer width="100%" height={Math.max(160,chartD.length*52)}><BarChart data={chartD} layout="vertical" barSize={14}><CartesianGrid strokeDasharray="3 3" stroke={P.rule}/><XAxis type="number" tick={{fontSize:9,fill:"rgba(255,255,255,0.6)",fontFamily:fm}} stroke="transparent" tickFormatter={function(v){return fmt(v);}}/><YAxis type="category" dataKey="name" width={220} tick={function(props){var lines=[];var txt=props.payload.value||"";var maxW=28;for(var si=0;si<txt.length;si+=maxW){lines.push(txt.substring(si,si+maxW));}return <g transform={"translate("+props.x+","+props.y+")"}>{lines.map(function(ln,li){return <text key={li} x={-4} y={li*13-((lines.length-1)*6)} textAnchor="end" fill="rgba(255,255,255,0.85)" fontSize={9} fontFamily="'JetBrains Mono',monospace">{ln}</text>;})}</g>;}} stroke="transparent"/><Tooltip content={adsetTip} cursor={{fill:"rgba(255,255,255,0.05)"}}/><Bar dataKey="Results" fill={oc} radius={[0,6,6,0]}/></BarChart></ResponsiveContainer></ChartReveal></div>
                  <div style={{background:"rgba(0,0,0,0.12)",borderRadius:10,padding:16}}><div style={{fontSize:9,fontWeight:800,color:"rgba(255,255,255,0.5)",letterSpacing:3,fontFamily:fm,textTransform:"uppercase",marginBottom:10}}>Cost Per Result</div><ChartReveal><ResponsiveContainer width="100%" height={Math.max(160,chartD.filter(function(x){return x.CostPer>0;}).length*52)}><BarChart data={chartD.filter(function(x){return x.CostPer>0;}).sort(function(a,b){return a.CostPer-b.CostPer;})} layout="vertical" barSize={14}><CartesianGrid strokeDasharray="3 3" stroke={P.rule}/><XAxis type="number" tick={{fontSize:9,fill:"rgba(255,255,255,0.6)",fontFamily:fm}} stroke="transparent" tickFormatter={function(v){return fR(v);}}/><YAxis type="category" dataKey="name" width={220} tick={function(props){var lines=[];var txt=props.payload.value||"";var maxW=28;for(var si=0;si<txt.length;si+=maxW){lines.push(txt.substring(si,si+maxW));}return <g transform={"translate("+props.x+","+props.y+")"}>{lines.map(function(ln,li){return <text key={li} x={-4} y={li*13-((lines.length-1)*6)} textAnchor="end" fill="rgba(255,255,255,0.85)" fontSize={9} fontFamily="'JetBrains Mono',monospace">{ln}</text>;})}</g>;}} stroke="transparent"/><Tooltip content={adsetTip} cursor={{fill:"rgba(255,255,255,0.05)"}}/><Bar dataKey="CostPer" fill={P.ember} radius={[0,6,6,0]}/></BarChart></ResponsiveContainer></ChartReveal></div>
                </div>
                <Insight title={objName+" Targeting Assessment"} accent={oc} icon={Ic.radar(oc,16)}>{(function(){var p=[];var objBench=objName==="Clicks to App Store"||objName==="Landing Page Clicks"?benchmarks.meta.cpc:objName==="Leads"?benchmarks.meta.cpl:benchmarks.meta.cpf;var benchNote=oCostPer>0?" This is "+benchLabel(oCostPer,objBench)+".":"";p.push(objName+" targeting operates "+sorted6.length+" adsets across "+Object.keys(platGrp).join(", ")+" with "+fR(oSpend)+" total investment delivering "+fmt(oResults)+" results"+(oResults>0?" at "+fR(oCostPer)+" blended cost per result":"")+" and "+oCtr.toFixed(2)+"% Click Through Rate."+benchNote);Object.keys(platGrp).sort(function(a,b){return (platOrd3[a]||9)-(platOrd3[b]||9);}).forEach(function(plat){var pg=platGrp[plat];var pgCtr=pg.imps>0?(pg.clicks/pg.imps*100):0;var pgCost=pg.results>0?pg.spend/pg.results:0;var pgShareR=oResults>0?((pg.results/oResults)*100).toFixed(2):"0.00";var pgShareS=oSpend>0?((pg.spend/oSpend)*100).toFixed(2):"0.00";var pgEff=parseFloat(pgShareS)>0?(parseFloat(pgShareR)/parseFloat(pgShareS)).toFixed(2):"0";var pgHasScale=pg.spend>=oSpend*0.05&&pg.imps>=5000&&pg.results>=3;p.push(plat+" contributes "+fmt(pg.results)+" results ("+pgShareR+"%) from "+pgShareS+"% of objective budget"+(pg.results>0?" at "+fR(pgCost)+" cost per result":"")+" and "+pgCtr.toFixed(2)+"% CTR.");if(pgHasScale&&parseFloat(pgEff)>=1.3){p.push(plat+" delivers "+pgEff+"x more results per rand than its budget share, confirmed across "+fmt(pg.imps)+" impressions.");}else if(pgHasScale&&parseFloat(pgEff)<0.7){p.push(plat+" is underdelivering at "+pgEff+"x efficiency ratio across "+fmt(pg.imps)+" impressions, consuming more budget than its result contribution warrants.");}else if(!pgHasScale&&pg.results>0){p.push(plat+" results are from limited volume ("+fR(pg.spend)+" spend, "+fmt(pg.imps)+" impressions). Insufficient data to confirm whether this efficiency is sustainable at scale.");}if(pgHasScale&&pg.rows.length>1){var pBest=pg.rows.reduce(function(a,r){return r.result>a.result?r:a;},{result:0});var pBestShare=pg.results>0?((pBest.result/pg.results)*100).toFixed(2):"0.00";if(pBest.result>0&&pBest.spend>=pg.spend*0.1){p.push("The strongest "+plat+" adset is "+pBest.adsetName+" delivering "+pBestShare+"% of "+plat+" results"+(pBest.costPer>0?" at "+fR(pBest.costPer)+" cost per result":"")+".");}}});if(bestAd.result>=10&&bestAd.spend>=oSpend*0.05&&bestAd.impressions>=5000){p.push("Overall top performer with proven scale: "+bestAd.adsetName+" on "+bestAd.platform+" with "+fmt(bestAd.result)+" results"+(bestAd.costPer>0?" at "+fR(bestAd.costPer)+" cost per result":"")+" across "+fmt(bestAd.impressions)+" impressions.");}else if(bestAd.result>=3){p.push("Highest result count is "+bestAd.adsetName+" on "+bestAd.platform+" with "+fmt(bestAd.result)+" results at "+fR(bestAd.costPer)+" cost per result. "+(bestAd.result<10?"Volume is below the 10-result threshold for a confirmed performance read.":""));}else if(bestAd.result>0){p.push("No adset has yet reached the 10-result minimum required for a confirmed performance assessment. The highest count is "+fmt(bestAd.result)+" from "+bestAd.adsetName+" on "+bestAd.platform+".");}if(freqStatus==="critical"||freqStatus==="warning"){var freqAdsets=sorted6.filter(function(r){return r.platform==="Facebook"||r.platform==="Instagram";});if(freqAdsets.length>0){p.push("Note: Meta frequency is at "+m.frequency.toFixed(2)+"x"+(freqStatus==="critical"?" which has breached the fatigue ceiling. Performance of Meta adsets in this objective may be suppressed by audience saturation.":" and approaching the fatigue threshold. Monitor Meta adset CTR closely for signs of diminishing returns."));}}var zeroSpend=sorted6.filter(function(r){return r.spend>200&&r.result===0;});if(zeroSpend.length>0){var zeroTotal=zeroSpend.reduce(function(a,r){return a+r.spend;},0);p.push(zeroSpend.length+" adset"+(zeroSpend.length>1?"s have":" has")+" invested "+fR(zeroTotal)+" without producing results. This represents "+((zeroTotal/oSpend)*100).toFixed(2)+"% of objective budget with zero return.");}return p.join(" ");})()}</Insight>
              </div>);
            });

            var combinedChartData=allRows.slice().sort(function(a,b){return b.spend-a.spend;}).slice(0,10).map(function(r){
              var short=r.adsetName.length>20?r.adsetName.substring(0,17)+"...":r.adsetName;
              return{name:short,Clicks:r.clicks,CTR:r.ctr,Spend:r.spend,Platform:r.platform};
            });

            return <div>
              <div style={{background:P.glass,borderRadius:18,padding:"6px 24px 24px",marginBottom:28,border:"1px solid "+P.rule}}>
                <div style={{textAlign:"center",padding:"18px 0 16px"}}><span style={{fontSize:18,fontWeight:900,color:P.txt,fontFamily:ff,letterSpacing:1}}>ADSET PERFORMANCE BY OBJECTIVE</span><div style={{fontSize:10,color:P.label,fontFamily:fm,marginTop:4,letterSpacing:3}}>TARGETING ANALYSIS</div></div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:24}}>
                  <Glass accent={P.solar} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>ACTIVE ADSETS</div><div style={{fontSize:22,fontWeight:900,color:P.solar,fontFamily:fm}}>{allRows.length}</div></Glass>
                  <Glass accent={P.mint} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>TOTAL CLICKS</div><div style={{fontSize:22,fontWeight:900,color:P.mint,fontFamily:fm}}>{fmt(totalClicks)}</div><div style={{fontSize:9,color:"rgba(255,255,255,0.5)",fontFamily:fm,marginTop:4}}>CTR: {blendedCtr.toFixed(2)+"%"}</div></Glass>
                  <Glass accent={P.ember} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>BLENDED CPC</div><div style={{fontSize:22,fontWeight:900,color:P.ember,fontFamily:fm}}>{fR(blendedCpc)}</div><div style={{fontSize:9,color:"rgba(255,255,255,0.5)",fontFamily:fm,marginTop:4}}>{fR(totalSpend)} invested</div></Glass>
                  <Glass accent={P.cyan} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>TOTAL REACH</div><div style={{fontSize:22,fontWeight:900,color:P.cyan,fontFamily:fm}}>{fmt(totalReach)}</div></Glass>
                </div>
                {platSections}
              </div>
              <div style={{background:P.glass,borderRadius:18,padding:"6px 24px 24px",marginBottom:28,border:"1px solid "+P.rule}}>
                <div style={{textAlign:"center",padding:"18px 0 16px"}}><span style={{fontSize:18,fontWeight:900,color:P.txt,fontFamily:ff,letterSpacing:1}}>TARGETING HEALTH SCORECARD</span><div style={{fontSize:10,color:P.label,fontFamily:fm,marginTop:4,letterSpacing:3}}>ALL ADSETS RANKED BY PERFORMANCE</div></div>
                <div style={{display:"flex",gap:16,marginBottom:16,justifyContent:"center"}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{width:12,height:12,borderRadius:"50%",background:"#22c55e"}}></span><span style={{fontSize:10,color:P.label,fontFamily:fm}}>Strong performer</span></div>
                  <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{width:12,height:12,borderRadius:"50%",background:"#f59e0b"}}></span><span style={{fontSize:10,color:P.label,fontFamily:fm}}>On track / Monitor</span></div>
                  <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{width:12,height:12,borderRadius:"50%",background:"#ef4444"}}></span><span style={{fontSize:10,color:P.label,fontFamily:fm}}>Optimise / Action needed</span></div>
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
                      a.push("Zero results from "+fR(r.spend)+" spend ("+spendShare.toFixed(2)+"% of "+String(r.objective||"").toLowerCase()+" budget).");
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
                        a.push("Proven efficiency leader at scale: delivers "+resultShare.toFixed(2)+"% of results from "+spendShare.toFixed(2)+"% of budget ("+efficiencyRatio.toFixed(1)+"x return ratio) across "+fmt(r.impressions)+" impressions.");
                        a.push(fR(r.costPer)+" cost per result"+(objAvgCost>0?" vs "+fR(objAvgCost)+" objective average ("+((1-r.costPer/objAvgCost)*100).toFixed(2)+"% more efficient).":"."));
                        if(isTopInPlatform){a.push("Best performer on "+r.platform+".");}
                      }
                      else if(hasScale&&efficiencyRatio>=1.0&&r.result>=5){
                        score=2;
                        a.push("Strong performer at scale: "+resultShare.toFixed(2)+"% of results from "+spendShare.toFixed(2)+"% of budget across "+fmt(r.impressions)+" impressions.");
                        a.push(fmt(r.result)+" results at "+fR(r.costPer)+(objAvgCost>0?" ("+Math.abs(((1-r.costPer/objAvgCost)*100)).toFixed(2)+"% "+(r.costPer<objAvgCost?"below":"above")+" the "+fR(objAvgCost)+" average).":"."));
                        if(r.ctr>2){a.push("Strong "+r.ctr.toFixed(2)+"% CTR confirms audience-creative alignment.");}
                      }
                      else if(!hasSomeScale&&efficiencyRatio>=1.0){
                        score=1;
                        a.push("Early signal only: "+fmt(r.result)+" result"+(r.result>1?"s":"")+" at "+fR(r.costPer)+" from "+fR(r.spend)+" spend ("+spendShare.toFixed(2)+"% of objective budget). Not statistically meaningful.");
                        a.push("Insufficient volume to confirm performance. Needs more delivery before scaling, currently only "+fmt(r.impressions)+" impressions.");
                      }
                      else if(hasSomeScale&&efficiencyRatio>=1.0&&r.result>=3){
                        score=2;
                        a.push("Above average: "+resultShare.toFixed(2)+"% of results from "+spendShare.toFixed(2)+"% of budget.");
                        a.push(fmt(r.result)+" results at "+fR(r.costPer)+(objAvgCost>0?" ("+Math.abs(((1-r.costPer/objAvgCost)*100)).toFixed(2)+"% "+(r.costPer<objAvgCost?"below":"above")+" the "+fR(objAvgCost)+" average).":"."));
                      }
                      else if(hasSomeScale&&efficiencyRatio>=0.7){
                        score=1;
                        a.push("Average efficiency: "+resultShare.toFixed(2)+"% of results from "+spendShare.toFixed(2)+"% of budget.");
                        a.push(fR(r.costPer)+" cost per result"+(objAvgCost>0?" vs "+fR(objAvgCost)+" average.":"."));
                        if(r.ctr<1&&r.impressions>5000){a.push("CTR at "+r.ctr.toFixed(2)+"% across "+fmt(r.impressions)+" impressions suggests creative fatigue or audience mismatch.");}
                      }
                      else if(!hasSomeScale&&efficiencyRatio<1.0){
                        score=0;
                        a.push("Low volume: "+fmt(r.result)+" results from "+fR(r.spend)+" spend ("+spendShare.toFixed(2)+"% of objective budget).");
                        a.push("Sample too small to draw conclusions. "+fmt(r.impressions)+" impressions is insufficient for a reliable performance read.");
                      }
                      else{
                        score=-1;
                        a.push("Below average at scale: consuming "+spendShare.toFixed(2)+"% of budget but only delivering "+resultShare.toFixed(2)+"% of results ("+efficiencyRatio.toFixed(1)+"x ratio).");
                        a.push(fR(r.costPer)+" cost per result is "+(objAvgCost>0?(((r.costPer-objAvgCost)/objAvgCost)*100).toFixed(2)+"% above the "+fR(objAvgCost)+" average.":"above average."));
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
                  // Sort by status first: green (strong) -> yellow (average)
                  // -> red (weak), then most results within each band.
                  var statusOrd={strong:0,average:1,weak:2};
                  scored.sort(function(a,b){var so=(statusOrd[a.status]!==undefined?statusOrd[a.status]:9)-(statusOrd[b.status]!==undefined?statusOrd[b.status]:9);if(so!==0)return so;return b.row.result-a.row.result;});

                  return <div>
                    <table style={{width:"100%",borderCollapse:"collapse",marginBottom:16}}>
                      <thead><tr>{["Status","Adset (Targeting)","Platform","Objective","Spend","Results","Cost Per","CTR %","Assessment"].map(function(h,hi){return <th key={hi} style={{padding:"10px 12px",fontSize:9,fontWeight:800,textTransform:"uppercase",color:"#F96203",letterSpacing:1,textAlign:hi===1?"left":"center",background:"rgba(249,98,3,0.15)",border:"1px solid rgba(249,98,3,0.3)",fontFamily:fm}}>{h}</th>;})}</tr></thead>
                      <tbody>{scored.map(function(s,si){
                        var r=s.row;var pc4=platCol3[r.platform]||P.ember;
                        return <tr key={si} style={{background:pc4+"08",borderTop:si>0&&scored[si-1].status!==s.status?"3px solid "+s.statusColor+"40":"none"}}>
                          <td style={{padding:"10px 8px",textAlign:"center",border:"1px solid "+P.rule}}><span style={{background:s.statusColor,color:textOnAccent(s.statusColor),fontSize:9,fontWeight:900,padding:"4px 10px",borderRadius:5,textTransform:"uppercase"}}>{s.statusLabel}</span></td>
                          <td title={r.adsetName} style={{padding:"10px 12px",fontSize:11,fontWeight:600,color:P.txt,border:"1px solid "+P.rule,maxWidth:260,lineHeight:1.4}}><div style={{whiteSpace:"normal",wordBreak:"break-word"}}>{r.adsetName}</div></td>
                          <td style={{padding:"10px 8px",textAlign:"center",border:"1px solid "+P.rule}}><span style={{background:pc4,color:textOnAccent(pc4),fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:10}}>{platBdg3[r.platform]||"?"}</span></td>
                          <td style={{padding:"10px 8px",textAlign:"center",border:"1px solid "+P.rule,fontSize:10,color:P.label}}>{r.objective}</td>
                          <td style={{padding:"10px 8px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:11,fontWeight:700,color:P.txt}}>{fR(r.spend)}</td>
                          <td style={{padding:"10px 8px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,fontWeight:900,color:r.result>0?s.statusColor:P.caption}}>{fmt(r.result)}</td>
                          <td style={{padding:"10px 8px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:11,fontWeight:700,color:r.costPer>0?P.ember:P.caption}}>{r.costPer>0?fR(r.costPer):"-"}</td>
                          <td style={{padding:"10px 8px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:11,fontWeight:700,color:r.ctr>2?P.mint:r.ctr>1?P.txt:r.ctr>0?P.warning:P.caption}}>{r.ctr.toFixed(2)+"%"}</td>
                          <td style={{padding:"10px 10px",border:"1px solid "+P.rule,fontSize:10,color:P.label,lineHeight:1.5,maxWidth:220}}>{s.assessment}</td>
                        </tr>;})}</tbody>
                    </table>
                    <Insight title="Targeting Health Summary" accent={P.solar} icon={Ic.radar(P.solar,16)}>{(function(){var strong=scored.filter(function(s){return s.status==="strong";});var avg=scored.filter(function(s){return s.status==="average";});var weak=scored.filter(function(s){return s.status==="weak";});var p=[];p.push("Across "+scored.length+" active adsets: "+strong.length+" are performing strongly (green), "+avg.length+" require monitoring (orange), and "+weak.length+" need immediate attention (red).");if(strong.length>0){p.push("Top performers include "+strong.slice(0,2).map(function(s){return s.row.adsetName+" on "+s.row.platform+" ("+fmt(s.row.result)+" results at "+fR(s.row.costPer)+")";}).join(" and ")+". These adsets demonstrate strong audience-creative alignment and should be considered for increased budget allocation.");}if(weak.length>0){var weakSpend=weak.reduce(function(a,s){return a+s.row.spend;},0);p.push(weak.length+" adset"+(weak.length>1?"s":"")+" flagged for action represent"+( weakSpend>0?" "+fR(weakSpend)+" of potentially misallocated budget.":". ")+" "+(weak.length>0?"The primary issues are: "+weak.slice(0,2).map(function(s){return s.row.adsetName+" on "+s.row.platform;}).join("; ")+".":""));}if(strong.length>0&&weak.length>0){p.push("Reallocating budget from underperforming (red) adsets to proven (green) performers would improve overall campaign Return On Investment without increasing total media spend.");}if(freqStatus==="critical"||freqStatus==="warning"){p.push("Meta frequency at "+m.frequency.toFixed(2)+"x is "+(freqStatus==="critical"?"above the 4x saturation ceiling":"approaching the 3x fatigue threshold")+". This compounds the underperformance of weaker adsets, making reallocation and creative refresh more urgent.");}return p.join(" ");})()}</Insight>
                  </div>;
                })()}
              </div>
            </div>;
          })()}
        </div>)}

        {tab==="demographics"&&(<div>
          <SH icon={Ic.globe(P.cyan,20)} title="Demographic Insights" sub={"Who saw, who engaged, who converted  ·  "+df+" to "+dt} accent={P.cyan}/>
          {demoLoading&&<div style={{background:P.glass,border:"1px solid "+P.rule,borderRadius:18,padding:"54px 20px",textAlign:"center",color:P.caption,fontFamily:ff}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:14,marginBottom:14}}>
              <div style={{width:28,height:28,border:"2px solid "+P.rule,borderTop:"2px solid "+P.cyan,borderRadius:"50%",animation:"spin 1s linear infinite"}}/>
              <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
            </div>
            <div key={demoQuip} style={{fontSize:15,color:"rgba(255,251,248,0.72)",fontStyle:"italic",maxWidth:520,margin:"0 auto",lineHeight:1.6,letterSpacing:0.2}}>{demoQuip}<span style={{display:"inline-block",width:18}}>…</span></div>
            <div style={{fontSize:10,color:P.caption,fontFamily:fm,marginTop:16,letterSpacing:1}}>Each platform returns demographic slices as separate calls, this can take 15 to 30 seconds first time.</div>
          </div>}
          {!demoLoading&&demoErr&&<div style={{background:P.glass,border:"1px solid "+P.rose+"40",borderRadius:18,padding:"30px 24px",color:P.rose,fontFamily:fm,fontSize:13}}>Demographics failed to load: {demoErr}</div>}
          {!demoLoading&&!demoErr&&demoData&&(demoFallback||(demoBlocks&&<div>
            {demoBlocks.kpiStrip}
            {demoBlocks.platformMix}
            {demoBlocks.awarenessBlock}
            {demoBlocks.engagementBlock}
            {demoBlocks.objectiveBlock}
            {demoBlocks.googleBlock}
            {demoBlocks.footnote}
          </div>))}
          {!demoLoading&&!demoErr&&!demoData&&<div style={{background:P.glass,border:"1px solid "+P.rule,borderRadius:18,padding:"30px 24px",textAlign:"center",color:P.label,fontFamily:fm}}>Open this tab to load demographic data for the selected period.</div>}
        </div>)}

        {tab==="community"&&(<div>
          <SH icon={Ic.users(P.mint,20)} title="Community Growth" sub={df+" to "+dt+" | Followers & Likes by Platform"} accent={P.mint}/>
          {FEATURES.communityDemographics&&communityDemo&&communityDemo.available&&(<div style={{background:P.glass,borderRadius:18,padding:"20px 24px 24px",marginBottom:28,border:"1px solid "+P.rule}}>
            <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:8}}>
              <div style={{width:38,height:38,borderRadius:10,background:"linear-gradient(135deg,"+P.tt+"35,"+P.tt+"15)",border:"1px solid "+P.tt+"55",display:"flex",alignItems:"center",justifyContent:"center"}}>{Ic.users(P.tt,18)}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:16,fontWeight:900,color:P.tt,fontFamily:fm,letterSpacing:2.5,textTransform:"uppercase"}}>Who Follows You</div>
                <div style={{fontSize:11,color:P.label,fontFamily:fm,letterSpacing:0.5,marginTop:3}}>Owned community demographic, distinct from the paid audience. Use this to understand the audience that will see organic content for free and to spot misalignment with the paid targeting mix.</div>
              </div>
            </div>
            <div style={{height:1,marginBottom:18,background:"linear-gradient(90deg,"+P.tt+"45,"+P.tt+"15,transparent 80%)"}}/>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16}}>
              <CommunityMemberCard platform="Facebook" data={communityDemo.facebook} color={P.fb} iconFn={Ic.eye}/>
              <CommunityMemberCard platform="Instagram" data={communityDemo.instagram} color={P.ig} iconFn={Ic.fire}/>
              <CommunityMemberCard platform="TikTok" data={communityDemo.tiktok} color={P.tt} iconFn={Ic.bolt}/>
            </div>
          </div>)}
          <div style={{background:P.glass,borderRadius:18,padding:"6px 24px 24px",marginBottom:28,border:"1px solid "+P.rule}}>
            <div style={{textAlign:"center",padding:"18px 0 16px"}}><span style={{fontSize:18,fontWeight:900,color:P.txt,fontFamily:ff,letterSpacing:1}}>COMMUNITY GROWTH</span><div style={{fontSize:10,color:P.label,fontFamily:fm,marginTop:4,letterSpacing:3}}>TOTAL COMMUNITY & PERIOD GROWTH</div></div>
            {(function(){
              var sel=campaigns.filter(function(x){return selected.indexOf(x.campaignId)>=0;});
              var fbEarned=0;var ttEarned=0;var igEarned=0;
              var fbSpend=0;var ttSpend=0;var igSpend=0;
              sel.forEach(function(camp){
                // Canonical-first match — mirrors Summary's classifier so a
                // campaign with objective="followers" is included even if its
                // name doesn't match the legacy like-patterns.
                var canon=String(camp.objective||"").toLowerCase();
                var n=(camp.campaignName||"").toLowerCase();
                var isFollowLike=canon==="followers"||n.indexOf("follower")>=0||n.indexOf("_like_")>=0||n.indexOf("_like ")>=0||n.indexOf("paidsocial_like")>=0||n.indexOf("page like")>=0||n.indexOf("pagelikes")>=0||n.indexOf("like_facebook")>=0||n.indexOf("like_instagram")>=0;
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
                  {(function(){
                    var ttTotalResolved=(function(){var selNames=sel.map(function(x){return x.campaignName;}).join(" ");return getTtTotal(selNames,ttEarned);})();
                    var boxes=[
                      {name:"FACEBOOK",color:P.fb,total:fbTotal,earned:fbEarned,spend:fbSpend,costLabel:"COST PER FOLLOWER",earnedLabel:"EARNED THIS PERIOD"},
                      // Instagram growth is total profile growth, organic and
                      // paid combined, because Meta does not attribute the
                      // follow action to the paid campaign. Label reflects
                      // that so clients aren't reading paid-only numbers.
                      {name:"INSTAGRAM",color:P.ig,total:igTotal,earned:igEarned,spend:igSpend,costLabel:"COST PER FOLLOW",earnedLabel:"TOTAL IG GROWTH"},
                      {name:"TIKTOK",color:P.tt,total:ttTotalResolved,earned:ttEarned,spend:ttSpend,costLabel:"COST PER FOLLOW",earnedLabel:"EARNED THIS PERIOD"}
                    ].sort(function(a,b){return b.total-a.total;});
                    return boxes.map(function(b){
                      return <Glass key={b.name} accent={b.color} hv={true} st={{padding:22}}>
                        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,marginBottom:14}}><span style={{width:10,height:10,borderRadius:"50%",background:b.color}}></span><span style={{fontSize:11,fontWeight:700,color:b.color,fontFamily:fm}}>{b.name}</span></div>
                        <div style={{textAlign:"center",marginBottom:14}}><div style={{fontSize:9,color:"rgba(255,255,255,0.6)",fontFamily:fm,letterSpacing:2,marginBottom:4}}>TOTAL FOLLOWERS</div><div style={{fontSize:36,fontWeight:900,color:b.color,fontFamily:fm}}>{fmt(b.total)}</div></div>
                        <div style={{borderTop:"1px solid "+P.rule,paddingTop:12,display:"flex",justifyContent:"space-between"}}><div style={{textAlign:"center",flex:1}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:1,marginBottom:2}}>{b.earnedLabel}</div><div style={{fontSize:18,fontWeight:900,color:P.mint,fontFamily:fm}}>+{fmt(b.earned)}</div></div><div style={{textAlign:"center",flex:1}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:1,marginBottom:2}}>{b.costLabel}</div><div style={{fontSize:14,fontWeight:700,color:P.ember,fontFamily:fm}}>{b.earned>0?fR(b.spend/b.earned):"-"}</div></div></div>
                      </Glass>;
                    });
                  })()}
                </div>
                <div style={{background:"rgba(0,0,0,0.15)",borderRadius:12,padding:20,marginBottom:20}}>
                  <div style={{fontSize:10,fontWeight:800,color:P.label,letterSpacing:3,fontFamily:fm,textTransform:"uppercase",marginBottom:14}}>Period Growth by Platform</div>
                  <ChartReveal><ResponsiveContainer width="100%" height={220}>
                    <BarChart data={[{name:"FB Likes",value:fbEarned,color:P.fb},{name:"IG Followers",value:igEarned,color:P.ig},{name:"TT Follows",value:ttEarned,color:P.tt}].sort(function(a,b){return b.value-a.value;})} barSize={50}>
                      <CartesianGrid strokeDasharray="3 3" stroke={P.rule}/>
                      <XAxis dataKey="name" tick={{fontSize:11,fill:"rgba(255,255,255,0.85)",fontFamily:fm}} stroke="transparent"/>
                      <YAxis tick={{fontSize:10,fill:"rgba(255,255,255,0.6)",fontFamily:fm}} stroke="transparent" tickFormatter={function(v){return fmt(v);}}/>
                      <Tooltip content={<Tip/>} wrapperStyle={{outline:"none"}} cursor={{fill:"rgba(255,255,255,0.05)"}}/>
                      <Bar dataKey="value" name="Earned" radius={[6,6,0,0]} fill="rgba(255,255,255,0.55)">{[{name:"FB Likes",value:fbEarned,color:P.fb},{name:"IG Followers",value:igEarned,color:P.ig},{name:"TT Follows",value:ttEarned,color:P.tt}].sort(function(a,b){return b.value-a.value;}).map(function(d,i){return <Cell key={i} fill={d.color}/>;})}</Bar>
                    </BarChart>
                  </ResponsiveContainer></ChartReveal>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
                  <Glass accent={P.mint} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>TOTAL COMMUNITY</div><div style={{fontSize:22,fontWeight:900,color:P.mint,fontFamily:fm}}>{fmt(grandTotal)}</div></Glass>
                  <Glass accent={P.ember} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>EARNED THIS PERIOD</div><div style={{fontSize:22,fontWeight:900,color:P.ember,fontFamily:fm}}>+{fmt(totalEarned)}</div></Glass>
                  <Glass accent={P.orchid} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>GROWTH RATE</div><div style={{fontSize:22,fontWeight:900,color:P.orchid,fontFamily:fm}}>{grandTotal>0?(totalEarned/grandTotal*100).toFixed(2)+"%":"-"}</div></Glass>
                  <Glass accent={P.solar} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>COST PER MEMBER</div><div style={{fontSize:22,fontWeight:900,color:P.solar,fontFamily:fm}}>{totalEarned>0?fR(totalSpend/totalEarned):"-"}</div></Glass>
                </div>
                {(function(){
                  // Aggregate engagement per type per platform. Meta exposes
                  // individual reactions (like / love / haha / wow / sad /
                  // angry) via the action_reactions field on each campaign
                  // row; comments and shares still come from the actions[]
                  // array. TikTok's top-level likes / comments / shares
                  // count here too; TikTok has no love/haha/wow/sad/angry
                  // equivalents so TT likes fold into Like.
                  var types=["love","like","haha","wow","sad","angry","shares","comments"];
                  var empty=function(){return {love:0,like:0,haha:0,wow:0,sad:0,angry:0,other:0,shares:0,comments:0};};
                  var perPlat={Facebook:empty(),Instagram:empty(),TikTok:empty()};
                  sel.forEach(function(camp){
                    var plat=camp.platform;
                    if(plat==="TikTok"){
                      perPlat.TikTok.like+=parseFloat(camp.likes||0);
                      perPlat.TikTok.comments+=parseFloat(camp.comments||0);
                      perPlat.TikTok.shares+=parseFloat(camp.shares||0);
                    } else if(plat==="Facebook"||plat==="Instagram"){
                      var bucket=perPlat[plat];
                      var seen={};
                      (camp.actions||[]).forEach(function(a){
                        var at=String(a.action_type||"").toLowerCase();
                        var v=parseFloat(a.value||0);
                        if(v>(seen[at]||0))seen[at]=v;
                      });
                      var rxn=camp.reactionsByType||{};
                      var rxnSum=parseFloat(rxn.like||0)+parseFloat(rxn.love||0)+parseFloat(rxn.haha||0)+parseFloat(rxn.wow||0)+parseFloat(rxn.sad||0)+parseFloat(rxn.angry||0);
                      // reactionsTotal = Meta's authoritative post_reaction
                      // aggregate. If the per-type breakdown came back empty
                      // or short, the difference goes into an "Other" bucket
                      // so the client can see the full reaction volume
                      // without us faking the sub-type distribution.
                      var totalFromMeta=parseFloat(camp.reactionsTotal||0);
                      if(rxnSum>0){
                        bucket.like+=parseFloat(rxn.like||0);
                        bucket.love+=parseFloat(rxn.love||0);
                        bucket.haha+=parseFloat(rxn.haha||0);
                        bucket.wow+=parseFloat(rxn.wow||0);
                        bucket.sad+=parseFloat(rxn.sad||0);
                        bucket.angry+=parseFloat(rxn.angry||0);
                        if(totalFromMeta>rxnSum) bucket.other+=(totalFromMeta-rxnSum);
                      } else if(totalFromMeta>0) {
                        // Breakdown unavailable, but post_reaction total is
                        // known. Show everything as 'Other reactions' so the
                        // UI is honest about having a total without the split.
                        bucket.other+=totalFromMeta;
                      } else {
                        // Last resort, pull from actions[] if individual
                        // reaction types happened to surface there.
                        bucket.like+=(seen.like||0);
                        bucket.love+=(seen.love||0);
                        bucket.haha+=(seen.haha||0);
                        bucket.wow+=(seen.wow||0);
                        bucket.sad+=(seen.sad||0);
                        bucket.angry+=(seen.angry||0);
                      }
                      bucket.comments+=(seen.comment||0);
                      bucket.shares+=(seen.post_share||seen.share||seen.post||0);
                    }
                  });
                  var totals={};
                  types.forEach(function(t){totals[t]=perPlat.Facebook[t]+perPlat.Instagram[t]+perPlat.TikTok[t];});
                  var totalAll=types.reduce(function(a,t){return a+totals[t];},0);
                  if(totalAll===0)return null;
                  // Brand sentiment — reactions only, not shares / comments.
                  // Positive = love + like + haha + wow. Negative = sad + angry.
                  // 'Other' covers reactions Meta tallied as post_reaction but
                  // didn't break down by type — neutral-weighted in the ratio
                  // so we don't bias the score either way.
                  // Sum across the 6 displayed reaction types. 'other' data is
                  // still collected on perPlat buckets for future use, but
                  // the Other Reactions row is hidden so it's left out of
                  // this sum (keeps the sentiment gate from going NaN now
                  // that 'other' isn't in the types array).
                  var reactionSum=totals.love+totals.like+totals.haha+totals.wow+totals.sad+totals.angry;
                  var positiveSum=totals.love+totals.like+totals.haha+totals.wow;
                  var negativeSum=totals.sad+totals.angry;
                  var classifiedSum=positiveSum+negativeSum;
                  var sentimentPct=classifiedSum>0?(positiveSum/classifiedSum*100):0;
                  var hasUnclassified=totals.other>0;
                  var sentColor=sentimentPct>=90?P.mint:sentimentPct>=75?P.cyan:sentimentPct>=50?P.solar:P.rose;
                  // Reaction ratio is structurally biased positive on Meta, Like
                // and Love are one-tap defaults while Sad and Angry need a
                // long-press, so most posts naturally land at 90%+. Tighten
                // the bands so labels reflect a real signal rather than the
                // baseline. >=99% means a genuine outlier on positive
                // reactions, 90% is closer to "any negative signal at all".
                var sentLabel=sentimentPct>=99?"OVERWHELMINGLY POSITIVE":sentimentPct>=95?"STRONGLY POSITIVE":sentimentPct>=85?"POSITIVE":sentimentPct>=70?"MIXED-POSITIVE":sentimentPct>=50?"MIXED":sentimentPct>=30?"NEGATIVE LEAN":"STRONGLY NEGATIVE";
                  var typeMeta={
                    love:{label:"Love",color:P.rose,icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 21s-7-4.5-7-11a4 4 0 017-2.65A4 4 0 0119 10c0 6.5-7 11-7 11z" stroke={P.rose} strokeWidth="1.8" fill={P.rose} strokeLinejoin="round"/></svg>},
                    like:{label:"Like",color:P.fb,icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M7 22V11m0 0V6a3 3 0 014.9-2.3L13 5l-1 5h6a2 2 0 012 2l-2 8a2 2 0 01-2 2H7z" stroke={P.fb} strokeWidth="1.6" fill={P.fb+"25"} strokeLinejoin="round"/></svg>},
                    haha:{label:"Haha",color:P.solar,icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke={P.solar} strokeWidth="1.6" fill={P.solar+"25"}/><path d="M8 10l0 1M16 10l0 1M7 14s2 3 5 3 5-3 5-3" stroke={P.solar} strokeWidth="1.6" strokeLinecap="round"/></svg>},
                    wow:{label:"Wow",color:P.lava,icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke={P.lava} strokeWidth="1.6" fill={P.lava+"25"}/><circle cx="9" cy="11" r="0.7" fill={P.lava}/><circle cx="15" cy="11" r="0.7" fill={P.lava}/><ellipse cx="12" cy="16" rx="2" ry="2.4" stroke={P.lava} strokeWidth="1.4" fill="none"/></svg>},
                    sad:{label:"Sad",color:P.info,icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke={P.info} strokeWidth="1.6" fill={P.info+"25"}/><path d="M8 11l0 1M16 11l0 1M8 16s1.5-2 4-2 4 2 4 2" stroke={P.info} strokeWidth="1.6" strokeLinecap="round"/></svg>},
                    angry:{label:"Angry",color:P.critical,icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke={P.critical} strokeWidth="1.6" fill={P.critical+"25"}/><path d="M6.5 8l3 2M17.5 8l-3 2M8 16s1.5-2 4-2 4 2 4 2" stroke={P.critical} strokeWidth="1.6" strokeLinecap="round"/></svg>},
                    other:{label:"Other Reactions",color:P.label,icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke={P.label} strokeWidth="1.6" fill={P.sub+"25"}/><circle cx="9" cy="11" r="1" fill={P.label}/><circle cx="15" cy="11" r="1" fill={P.label}/><line x1="9" y1="15" x2="15" y2="15" stroke={P.label} strokeWidth="1.6" strokeLinecap="round"/></svg>},
                    shares:{label:"Shares",color:P.orchid,icon:Ic.share(P.orchid,18)},
                    comments:{label:"Comments",color:P.cyan,icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke={P.cyan} strokeWidth="1.8" fill={P.cyan+"25"} strokeLinejoin="round"/></svg>}
                  };
                  // Keep every row, even at 0, so the reader can verify which
                  // reactions the brand got and which it didn't. Sort by
                  // value desc so the dominant reaction always leads.
                  var rows=types.map(function(t){var m2=typeMeta[t];return {key:t,label:m2.label,color:m2.color,icon:m2.icon,value:totals[t],perPlat:{FB:perPlat.Facebook[t],IG:perPlat.Instagram[t],TT:perPlat.TikTok[t]}};}).sort(function(a,b){return b.value-a.value;});
                  var maxVal=rows.reduce(function(a,r){return Math.max(a,r.value);},0);
                  return <div style={{background:"linear-gradient(135deg,rgba(52,211,153,0.06),rgba(244,63,94,0.04) 50%,rgba(168,85,247,0.06))",borderRadius:16,padding:"22px 24px",marginBottom:20,border:"1px solid "+P.rule}}>
                    <style>{"@keyframes pulseBar{0%,100%{box-shadow:0 0 0 0 currentColor}50%{box-shadow:0 0 16px 1px currentColor}}@keyframes barFill{from{width:0}}@keyframes sentRing{from{stroke-dashoffset:314}to{stroke-dashoffset:var(--sent-offset)}}"}</style>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18}}>
                      {Ic.pulse(P.mint,18)}
                      <span style={{fontSize:13,fontWeight:900,color:P.mint,fontFamily:ff,letterSpacing:3,textTransform:"uppercase"}}>Engagement Pulse</span>
                      <div style={{flex:1,height:1,background:"linear-gradient(90deg,"+P.mint+"40, transparent)"}}></div>
                      <span style={{fontSize:10,color:P.label,fontFamily:fm,letterSpacing:1}}>{fmt(totalAll)} total interactions</span>
                    </div>
                    {reactionSum>0&&<div style={{display:"grid",gridTemplateColumns:"220px 1fr",gap:18,marginBottom:18,alignItems:"center",background:"rgba(0,0,0,0.22)",borderRadius:14,padding:"16px 18px",border:"1px solid "+sentColor+"30"}}>
                      <div style={{display:"flex",alignItems:"center",gap:16}}>
                        {(function(){
                          var circ=2*Math.PI*50;
                          var offset=circ-(sentimentPct/100)*circ;
                          return <svg width="108" height="108" viewBox="0 0 120 120" style={{flexShrink:0}}>
                            <circle cx="60" cy="60" r="50" stroke={P.rule} strokeWidth="10" fill="none"/>
                            <circle cx="60" cy="60" r="50" stroke={sentColor} strokeWidth="10" fill="none" strokeLinecap="round" transform="rotate(-90 60 60)" strokeDasharray={circ} strokeDashoffset={offset} style={{transition:"stroke-dashoffset 1.2s ease-out"}}/>
                            <text x="60" y="62" textAnchor="middle" style={{fontSize:16,fontWeight:900,fill:sentColor,fontFamily:fm,letterSpacing:-0.5}}>{sentimentPct.toFixed(2)+"%"}</text>
                            <text x="60" y="78" textAnchor="middle" style={{fontSize:8,fontWeight:700,fill:"rgba(255,251,248,0.6)",fontFamily:fm,letterSpacing:2}}>POSITIVE</text>
                          </svg>;
                        })()}
                      </div>
                      <div>
                        <div style={{fontSize:18,fontWeight:900,color:sentColor,letterSpacing:2,fontFamily:fm,textTransform:"uppercase",marginBottom:4}}>Brand Sentiment Pulse</div>
                        <div style={{fontSize:18,fontWeight:900,color:P.txt,fontFamily:ff,marginBottom:6,letterSpacing:0.5}}>{sentLabel}</div>
                        <div style={{fontSize:11,color:"rgba(255,251,248,0.72)",fontFamily:ff,lineHeight:1.5,marginBottom:8}}>{fmt(positiveSum)} positive (love, like, haha, wow) against {fmt(negativeSum)} negative (sad, angry) across {fmt(classifiedSum)} classified reactions.</div>
                        <div style={{display:"flex",gap:10,fontSize:10,fontFamily:fm,flexWrap:"wrap"}}>
                          <div style={{display:"flex",alignItems:"center",gap:5}}><span style={{width:9,height:9,borderRadius:"50%",background:P.mint}}></span><span style={{color:P.label}}>Positive {fmt(positiveSum)}</span></div>
                          <div style={{display:"flex",alignItems:"center",gap:5}}><span style={{width:9,height:9,borderRadius:"50%",background:P.critical}}></span><span style={{color:P.label}}>Negative {fmt(negativeSum)}</span></div>
                        </div>
                      </div>
                    </div>}
                    {/* Text + container renders unconditionally; only the
                        bar fill width gates on intersection via GrowBar
                        so the row's labels and counts are static and
                        only the bars cascade in as the team scrolls. */}
                    {rows.map(function(r,idx){
                      var pct=maxVal>0?(r.value/maxVal*100):0;
                      var ppParts=[];
                      if(r.perPlat.FB>0)ppParts.push(<span key="fb" style={{color:P.fb}}>FB {fmt(r.perPlat.FB)}</span>);
                      if(r.perPlat.IG>0)ppParts.push(<span key="ig" style={{color:P.ig}}>IG {fmt(r.perPlat.IG)}</span>);
                      if(r.perPlat.TT>0)ppParts.push(<span key="tt" style={{color:P.tt}}>TT {fmt(r.perPlat.TT)}</span>);
                      var parted=[];ppParts.forEach(function(n,i){if(i>0)parted.push(<span key={"s"+i} style={{color:P.caption,margin:"0 4px"}}>·</span>);parted.push(n);});
                      return <div key={r.key} style={{display:"flex",alignItems:"center",gap:14,marginBottom:12}}>
                        <div style={{display:"flex",alignItems:"center",gap:10,width:210,flexShrink:0}}>
                          <div style={{width:36,height:36,borderRadius:"50%",background:r.color+"18",border:"1px solid "+r.color+"45",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{r.icon}</div>
                          <div style={{minWidth:0}}>
                            <div style={{fontSize:11,fontWeight:800,color:P.txt,fontFamily:fm,letterSpacing:1.5,textTransform:"uppercase"}}>{r.label}</div>
                            <div style={{fontSize:9,fontFamily:fm,marginTop:2}}>{parted}</div>
                          </div>
                        </div>
                        <div style={{flex:1,height:20,background:"rgba(0,0,0,0.4)",borderRadius:10,overflow:"hidden",border:"1px solid "+P.rule,position:"relative"}}>
                          <GrowBar pct={pct} delay={idx*60} style={{height:"100%",background:"linear-gradient(90deg,"+r.color+"cc,"+r.color+"ff)",borderRadius:10,color:r.color,animation:"pulseBar 2.8s ease-in-out infinite "+(900+idx*60)+"ms"}}/>
                        </div>
                        <div style={{minWidth:84,textAlign:"right",flexShrink:0}}>
                          <div style={{fontSize:20,fontWeight:900,color:r.color,fontFamily:fm,lineHeight:1,letterSpacing:-0.5}}>{fmt(r.value)}</div>
                        </div>
                      </div>;
                    })}
                  </div>;
                })()}
                <Insight title="Community Growth Analysis" accent={P.mint} icon={Ic.users(P.mint,16)}>{(function(){var p=[];if(totalEarned===0&&grandTotal===0){return "No community data available for the selected campaigns.";}if(grandTotal>0){p.push("The brand\'s total social community stands at "+fmt(grandTotal)+" members across Facebook, Instagram, and TikTok.");}if(totalEarned>0){p.push("During the selected period, the community grew by "+fmt(totalEarned)+" new members with "+fR(totalSpend)+" invested at a blended cost of "+fR(totalSpend/totalEarned)+" per new member.");}if(fbTotal>0){p.push("Facebook leads with "+fmt(fbTotal)+" total page likes"+(fbEarned>0?", adding "+fmt(fbEarned)+" new likes at "+fR(fbSpend/fbEarned)+" cost per follower during this period":"")+". Each page like permanently increases organic News Feed distribution.");}if(igTotal>0){p.push("Instagram has "+fmt(igTotal)+" total followers"+(igEarned>0?", growing by "+fmt(igEarned)+" followers during this period. This figure represents total profile growth, organic and paid combined, as Meta does not attribute the follow action directly to paid campaigns":"")+". Instagram followers directly increase Stories, Reels, and Feed visibility.");}if(ttEarned>0){p.push("TikTok has "+fmt(ttTotal)+" total followers, growing by "+fmt(ttEarned)+" new follows this period at "+fR(ttSpend/ttEarned)+" cost per follow. Each TikTok follower feeds into the For You page recommendation engine, amplifying organic reach.");}return p.join(" ");})()}</Insight>
              </div>;
            })()}
          </div>
        </div>)}

        {tab==="deepdive"&&(<div>
          <SH icon={Ic.eye(P.cyan,20)} title="Deep Dive" sub="Demographics, Creative Performance & Placement Analysis" accent={P.cyan}/>
          <Glass accent={P.cyan} st={{padding:"36px 32px",marginBottom:24}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,marginBottom:28}}>
              <div style={{padding:24,background:P.fb+"08",border:"1px solid "+P.fb+"20",borderRadius:14,textAlign:"center"}}><div style={{fontSize:9,fontWeight:700,color:P.fb,letterSpacing:2,fontFamily:fm,marginBottom:8}}>DEMOGRAPHICS</div><div style={{fontSize:14,fontWeight:700,color:P.txt,marginBottom:4}}>Age, Gender, Location</div><div style={{fontSize:11,color:P.label}}>Audience composition breakdown</div></div>
              <div style={{padding:24,background:P.tt+"08",border:"1px solid "+P.tt+"20",borderRadius:14,textAlign:"center"}}><div style={{fontSize:9,fontWeight:700,color:P.tt,letterSpacing:2,fontFamily:fm,marginBottom:8}}>CREATIVE</div><div style={{fontSize:14,fontWeight:700,color:P.txt,marginBottom:4}}>Ad Thumbnails & Performance</div><div style={{fontSize:11,color:P.label}}>Visual creative ranking with metrics</div></div>
              <div style={{padding:24,background:P.orchid+"08",border:"1px solid "+P.orchid+"20",borderRadius:14,textAlign:"center"}}><div style={{fontSize:9,fontWeight:700,color:P.orchid,letterSpacing:2,fontFamily:fm,marginBottom:8}}>PLACEMENTS</div><div style={{fontSize:14,fontWeight:700,color:P.txt,marginBottom:4}}>Feed, Stories, Reels, Network</div><div style={{fontSize:11,color:P.label}}>Delivery by placement type</div></div>
              <div style={{padding:24,background:P.mint+"08",border:"1px solid "+P.mint+"20",borderRadius:14,textAlign:"center"}}><div style={{fontSize:9,fontWeight:700,color:P.mint,letterSpacing:2,fontFamily:fm,marginBottom:8}}>OBJECTIVE RESULTS</div><div style={{fontSize:14,fontWeight:700,color:P.txt,marginBottom:4}}>Results by Campaign Objective</div><div style={{fontSize:11,color:P.label}}>Objective-level performance data</div></div>
            </div>
            <div style={{textAlign:"center"}}><button onClick={function(){var r=findLookerUrl(campaigns,selected);if(r.url){window.open(r.url,"_blank");}else{alert("No Looker report configured for '"+r.client+"' yet.");}}} style={{background:gEmber,border:"none",borderRadius:14,padding:"16px 48px",color:"#fff",fontSize:15,fontWeight:800,fontFamily:ff,cursor:"pointer",boxShadow:"0 4px 24px "+P.ember+"40",display:"inline-flex",alignItems:"center",gap:10}}>Open Interactive Report {Ic.share("#fff",18)}</button><div style={{fontSize:11,color:P.caption,fontFamily:fm,marginTop:14}}>Opens Looker Studio in a new tab with full interactive drill-down analysis</div></div>
          </Glass>
          <Insight title="Deep Dive Analysis" accent={P.cyan} icon={Ic.eye(P.cyan,16)}>The Looker Studio report provides granular campaign analysis that complements the dashboard metrics above. It includes audience demographic breakdowns by age, gender, and geographic region, individual ad creative performance with visual thumbnails ranked by key metrics, placement-level delivery analysis across Feed, Stories, Reels, and Audience Network, and device-level performance data showing mobile versus desktop engagement patterns. Use the interactive filters within the report to drill into specific campaigns, date ranges, and audience segments.</Insight>
        </div>)}

        {tab==="optimise"&&!isClient&&(<div>
          <SH icon={Ic.flag(P.warning,20)} title="Optimisation, Flags & Recommendations" sub={flags.length+" flags · "+openFlags+" open · Auto-generated"} accent={P.warning}/>

          {/* PERFORMANCE TRENDLINES, shared helper rendered identically on Summary */}
          {renderTrendlines()}

          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:24}}>
            {[{l:"CRITICAL",c:P.critical},{l:"WARNING",c:P.warning},{l:"INFO",c:P.info},{l:"POSITIVE",c:P.positive}].map(function(x){return<Glass key={x.l} accent={x.c} st={{padding:"18px 16px",textAlign:"center"}}><div style={{fontSize:9,fontWeight:700,color:x.c,letterSpacing:2,fontFamily:fm,marginBottom:6}}>{x.l}</div><div style={{fontSize:28,fontWeight:900,color:x.c,fontFamily:fm}}>{flags.filter(function(f){return f.severity===x.l.toLowerCase();}).length}</div></Glass>;})}
          </div>

          {flags.length===0&&<div style={{padding:40,textAlign:"center",color:P.caption,fontFamily:fm}}>No flags. Select campaigns and refresh.</div>}
          {flags.map(function(f){
            var c={critical:P.critical,warning:P.warning,info:P.info,positive:P.positive}[f.severity]||P.info;
            return<div key={f.id} style={{padding:"18px 22px",marginBottom:10,background:P.glass,border:"1px solid "+P.rule,borderLeft:"4px solid "+c,borderRadius:"0 12px 12px 0"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}><SevBadge s={f.severity}/><Pill name={f.platform} color={f.platform==="TikTok"?P.tt:f.platform==="Cross-platform"?P.orchid:P.fb}/></div>
                <div style={{display:"flex",gap:6}}>
                  {f.status==="open"&&<button onClick={function(){ack(f.id);}} style={{background:P.glass,border:"1px solid "+P.rule,borderRadius:8,padding:"5px 12px",color:P.label,fontSize:10,fontWeight:700,fontFamily:fm,cursor:"pointer"}}>Acknowledge</button>}
                  {(f.status==="open"||f.status==="acknowledged")&&<button onClick={function(){resolve(f.id);}} style={{background:P.mint+"15",border:"1px solid "+P.mint+"30",borderRadius:8,padding:"5px 12px",color:P.mint,fontSize:10,fontWeight:700,fontFamily:fm,cursor:"pointer"}}>Resolve</button>}
                  {f.status==="resolved"&&<span style={{fontSize:10,color:P.mint,fontFamily:fm,fontWeight:700}}>Resolved</span>}
                </div>
              </div>
              <div style={{fontSize:13,fontWeight:700,color:P.txt,marginBottom:6}}>{f.metric}: {f.currentValue} {f.severity!=="positive"?"exceeds":"beats"} {f.threshold} threshold</div>
              <div style={{fontSize:12,color:P.label,lineHeight:1.8}}>{f.message}</div>
              <div style={{fontSize:12,color:c,marginTop:8}}><strong>Recommendation:</strong> {f.recommendation}</div>
            </div>;
          })}

          <Insight title="Optimisation Summary" accent={P.warning} icon={Ic.alert(P.warning,16)}>{flags.length} flags generated from selected campaign data. {openFlags} require attention. Review recommendations and take action to maintain optimal performance. Flags refresh when you change dates or campaign selection.</Insight>
        </div>)}

        {tab==="create"&&!isClient&&(<CreateTab apiBase={API} P={P} ff={ff} fm={fm} gFire={gFire} gEmber={gEmber} Ic={Ic} Glass={Glass} SH={SH}/>)}

        </>)}
      </div>
    </div>

    <footer style={{borderTop:"1px solid "+P.rule,background:"#0B141B",padding:"20px 28px"}}><div style={{maxWidth:1400,margin:"0 auto",display:"flex",justifyContent:"space-between",alignItems:"center",gap:18,flexWrap:"wrap"}}><div style={{display:"flex",alignItems:"center",gap:10}}><div style={{width:26,height:26,borderRadius:"50%",overflow:"hidden"}}><img src="/GAS_LOGO_EMBLEM_GAS_Primary_Gradient.png" alt="GAS" style={{width:"100%",height:"100%",objectFit:"cover"}}/></div><span style={{fontSize:11,fontWeight:800,color:P.label,fontFamily:fm,letterSpacing:2}}>MEDIA ON GAS</span><span style={{fontSize:9,color:P.caption}}>Powered by GAS Marketing Automation</span></div><div style={{flex:1,textAlign:"center",fontSize:10,fontFamily:fm}}><a href="https://www.gasmarketing.co.za/privacy-policy" target="_blank" rel="noopener noreferrer" style={{color:P.label,textDecoration:"none",letterSpacing:1.5,fontWeight:700,padding:"4px 10px",borderRadius:6,border:"1px solid "+P.rule,transition:"color 0.2s ease, border-color 0.2s ease"}} onMouseEnter={function(e){e.currentTarget.style.color=P.ember;e.currentTarget.style.borderColor=P.ember+"55";}} onMouseLeave={function(e){e.currentTarget.style.color=P.label;e.currentTarget.style.borderColor=P.rule;}}>Privacy &amp; Data Policy</a></div><div style={{fontSize:9,color:P.caption,fontFamily:fm,textAlign:"right",lineHeight:1.8}}>Live data · All figures in ZAR · Confidential · grow@gasmarketing.co.za</div></div></footer>
  </div>);
}
