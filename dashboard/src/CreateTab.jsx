// Create tab — PIN gate + 7-step Meta campaign wizard.
//
// Self-contained module: takes palette/font/icon helpers as props from App.jsx
// rather than re-importing them, since App.jsx defines those inline. This
// keeps App.jsx's giant single-file structure intact and means a future
// re-skin only needs to edit App.jsx's P object.
//
// All state lives in this component. On submit, the wizard POSTs to
// /api/create/campaign and renders a success screen with the campaign id +
// Ads Manager link. Server is the authority on PAUSED + budget ceiling +
// allowlist; the UI only mirrors those for nice errors.

import { useState, useEffect, useRef } from "react";

var TOKEN_KEY = "gas_create_token";
var TOKEN_EXP_KEY = "gas_create_token_exp";
var MAX_DAILY_RAND = 5000;

var OBJECTIVES = [
  { id: "OUTCOME_TRAFFIC",        label: "Traffic",        sub: "Drive clicks to a landing page" },
  { id: "OUTCOME_ENGAGEMENT",     label: "Engagement",     sub: "Likes, comments, post engagement" },
  { id: "OUTCOME_LEADS",          label: "Leads",          sub: "Lead form or landing page leads" },
  { id: "OUTCOME_AWARENESS",      label: "Awareness",      sub: "Reach + impression coverage" },
  { id: "OUTCOME_SALES",          label: "Sales",          sub: "Pixel conversions, requires pixel" },
  { id: "OUTCOME_APP_PROMOTION",  label: "App Promotion",  sub: "App installs, requires app store URL" }
];

var CTAS = [
  "LEARN_MORE","SHOP_NOW","SIGN_UP","SUBSCRIBE","DOWNLOAD","BOOK_TRAVEL",
  "CONTACT_US","GET_QUOTE","GET_OFFER","APPLY_NOW","ORDER_NOW","WATCH_MORE"
];

function readSavedToken() {
  try {
    var t = sessionStorage.getItem(TOKEN_KEY);
    var e = parseInt(sessionStorage.getItem(TOKEN_EXP_KEY) || "0", 10);
    if (!t) return null;
    if (e && Date.now() / 1000 >= e) {
      sessionStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(TOKEN_EXP_KEY);
      return null;
    }
    return t;
  } catch (_) { return null; }
}

export default function CreateTab(props) {
  var P = props.P, ff = props.ff, fm = props.fm;
  var Ic = props.Ic, Glass = props.Glass, SH = props.SH, gFire = props.gFire, gEmber = props.gEmber;
  var apiBase = props.apiBase || "";

  var ts = useState(readSavedToken());
  var token = ts[0], setToken = ts[1];

  // Auto-evict the token when its 15-min TTL expires while the tab is open.
  useEffect(function(){
    if (!token) return;
    var exp = parseInt(sessionStorage.getItem(TOKEN_EXP_KEY) || "0", 10);
    if (!exp) return;
    var msLeft = (exp * 1000) - Date.now();
    if (msLeft <= 0) { setToken(null); return; }
    var timer = setTimeout(function(){ setToken(null); }, msLeft + 250);
    return function(){ clearTimeout(timer); };
  }, [token]);

  if (!token) return <PinGate P={P} ff={ff} fm={fm} Ic={Ic} Glass={Glass} apiBase={apiBase}
    onAuthed={function(t, ttlSec){
      sessionStorage.setItem(TOKEN_KEY, t);
      sessionStorage.setItem(TOKEN_EXP_KEY, String(Math.floor(Date.now() / 1000) + (ttlSec || 900)));
      setToken(t);
    }}/>;

  return <Wizard P={P} ff={ff} fm={fm} Ic={Ic} Glass={Glass} SH={SH} gFire={gFire} gEmber={gEmber}
    apiBase={apiBase} token={token}
    onLogout={function(){ sessionStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(TOKEN_EXP_KEY); setToken(null); }}/>;
}

// ---------------------------------------------------------------------------
// PIN gate

function PinGate(props) {
  var P = props.P, ff = props.ff, fm = props.fm, Ic = props.Ic, apiBase = props.apiBase;
  var ps = useState(""), pin = ps[0], setPin = ps[1];
  var es = useState(""), err = es[0], setErr = es[1];
  var ls = useState(false), loading = ls[0], setLoading = ls[1];

  var submit = function(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (loading) return;
    if (!pin) { setErr("Enter your PIN."); return; }
    setLoading(true); setErr("");
    fetch(apiBase + "/api/create/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: pin })
    })
      .then(function(r){ return r.json().then(function(d){ return { ok: r.ok, data: d }; }); })
      .then(function(x){
        if (!x.ok || !x.data || !x.data.token) {
          setErr((x.data && x.data.error) || "Invalid PIN.");
          setLoading(false); return;
        }
        setLoading(false);
        props.onAuthed(x.data.token, x.data.expiresIn);
      })
      .catch(function(){ setErr("Network error. Try again."); setLoading(false); });
  };

  return <div style={{display:"flex",justifyContent:"center",padding:"40px 20px"}}>
    <div style={{maxWidth:440,width:"100%",background:P.glass,border:"1px solid "+P.rule,borderRadius:18,padding:"34px 32px"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
        {Ic.bolt(P.ember,18)}
        <span style={{fontSize:11,fontWeight:800,color:P.ember,letterSpacing:3,fontFamily:fm,textTransform:"uppercase"}}>Create Tab</span>
      </div>
      <div style={{fontSize:18,fontWeight:900,color:P.txt,fontFamily:ff,marginBottom:6}}>Restricted area</div>
      <div style={{fontSize:12,color:P.label||P.sub,fontFamily:ff,lineHeight:1.7,marginBottom:22}}>
        Campaign creation requires a PIN. All campaigns built here are created PAUSED and capped at R5,000/day.
      </div>
      <form onSubmit={submit}>
        <input
          type="password"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={pin}
          onChange={function(e){ setPin(e.target.value); }}
          placeholder="Enter PIN"
          style={{width:"100%",boxSizing:"border-box",background:"rgba(40,25,60,0.5)",border:"1px solid "+P.rule,borderRadius:10,padding:"12px 16px",color:P.txt,fontSize:16,fontFamily:fm,letterSpacing:6,outline:"none",marginBottom:14,textAlign:"center"}}
        />
        {err && <div style={{fontSize:11,color:P.critical||"#ef4444",fontFamily:fm,marginBottom:12}}>{err}</div>}
        <button type="submit" disabled={loading} style={{width:"100%",background:loading?P.dim:"linear-gradient(135deg,#FF3D00,#FF6B00)",border:"none",borderRadius:10,padding:"12px 0",color:"#fff",fontSize:12,fontWeight:800,fontFamily:fm,letterSpacing:2,cursor:loading?"default":"pointer"}}>
          {loading ? "Checking..." : "Unlock"}
        </button>
      </form>
    </div>
  </div>;
}

// ---------------------------------------------------------------------------
// Wizard

var STEP_LABELS = [
  "Account & Objective",
  "Audience",
  "Placement",
  "Creative",
  "Budget & Schedule",
  "Tracking",
  "Review & Create"
];

function Wizard(props) {
  var P = props.P, ff = props.ff, fm = props.fm, Ic = props.Ic, Glass = props.Glass, SH = props.SH;
  var apiBase = props.apiBase, token = props.token;

  var ss = useState(0), step = ss[0], setStep = ss[1];
  var subS = useState(false), submitting = subS[0], setSubmitting = subS[1];
  var resS = useState(null), result = resS[0], setResult = resS[1];
  var errS = useState(null), submitErr = errS[0], setSubmitErr = errS[1];

  // -------- Wizard state ---------------------------------------------------
  var initial = {
    accountId: "", accountName: "",
    objective: "OUTCOME_TRAFFIC",
    specialAdCategories: [],
    campaignName: "",
    platformMode: "fb_ig",
    pageId: "", instagramId: "",
    audience: { countries: ["ZA"], ageMin: 18, ageMax: 65, genders: [], advantageAudience: false, targetingItems: [], flexibleSpec: null },
    placement: { mode: "advantage", platforms: ["facebook","instagram"], facebookPositions: ["feed"], instagramPositions: ["stream","story","reels"], devicePlatforms: ["mobile","desktop"] },
    creative: { kind: "image", imageHash: null, videoId: null, headline: "", primaryText: "", description: "", linkUrl: "", callToAction: "LEARN_MORE", filename: null, previewDataUrl: null },
    budgetMode: "daily",
    dailyBudgetRand: 200, lifetimeBudgetRand: 5000,
    startDate: todayIso(), endDate: addDaysIso(7),
    pixelId: "", conversionEvent: "PURCHASE", urlTags: ""
  };
  var ds = useState(initial), draft = ds[0], setDraft = ds[1];
  var update = function(patch){ setDraft(function(d){ return Object.assign({}, d, patch); }); };
  var updateNested = function(key, patch){ setDraft(function(d){ var v = Object.assign({}, d[key], patch); var out = {}; out[key] = v; return Object.assign({}, d, out); }); };

  // -------- Reference data (fetched per-account) ---------------------------
  var accS = useState({ loading: true, items: [], error: "" }), accounts = accS[0], setAccounts = accS[1];
  var pgS = useState({ loading: false, items: [], error: "" }), pages = pgS[0], setPages = pgS[1];
  var igS = useState({ loading: false, items: [], error: "" }), instagrams = igS[0], setInstagrams = igS[1];
  var pxS = useState({ loading: false, items: [], error: "" }), pixels = pxS[0], setPixels = pxS[1];

  var authedFetch = useRef(function(path, opts){
    opts = opts || {};
    var headers = Object.assign({ "Authorization": "Bearer " + token }, opts.headers || {});
    return fetch(apiBase + path, Object.assign({}, opts, { headers: headers }));
  }).current;

  useEffect(function(){
    setAccounts({ loading: true, items: [], error: "" });
    authedFetch("/api/create/accounts")
      .then(function(r){ return r.json().then(function(d){ return { ok: r.ok, status: r.status, data: d }; }); })
      .then(function(x){
        if (x.status === 401) { props.onLogout(); return; }
        if (!x.ok) { setAccounts({ loading: false, items: [], error: (x.data && x.data.error) || "Failed to load accounts" }); return; }
        setAccounts({ loading: false, items: x.data.accounts || [], error: "" });
      })
      .catch(function(){ setAccounts({ loading: false, items: [], error: "Network error loading accounts" }); });
  }, []);

  useEffect(function(){
    if (!draft.accountId) return;
    setPages({ loading: true, items: [], error: "" });
    setInstagrams({ loading: true, items: [], error: "" });
    setPixels({ loading: true, items: [], error: "" });

    authedFetch("/api/create/pages?accountId=" + encodeURIComponent(draft.accountId))
      .then(function(r){ return r.json(); })
      .then(function(d){ setPages({ loading: false, items: d.pages || [], error: d.error || "" }); })
      .catch(function(){ setPages({ loading: false, items: [], error: "Network error" }); });

    authedFetch("/api/create/instagram?accountId=" + encodeURIComponent(draft.accountId))
      .then(function(r){ return r.json(); })
      .then(function(d){ setInstagrams({ loading: false, items: d.instagram || [], error: d.error || "" }); })
      .catch(function(){ setInstagrams({ loading: false, items: [], error: "Network error" }); });

    authedFetch("/api/create/pixels?accountId=" + encodeURIComponent(draft.accountId))
      .then(function(r){ return r.json(); })
      .then(function(d){ setPixels({ loading: false, items: d.pixels || [], error: d.error || "" }); })
      .catch(function(){ setPixels({ loading: false, items: [], error: "Network error" }); });
  }, [draft.accountId]);

  // -------- Per-step validation gates --------------------------------------
  var canAdvance = (function(){
    if (step === 0) return !!draft.accountId && !!draft.objective && draft.campaignName.trim().length >= 3 && !!draft.platformMode;
    if (step === 1) return draft.audience.ageMin >= 13 && draft.audience.ageMax <= 65 && draft.audience.ageMin < draft.audience.ageMax;
    if (step === 2) return draft.placement.mode === "advantage" || ((draft.placement.platforms || []).length > 0);
    if (step === 3) {
      var igRequired = draft.platformMode === "fb_ig" || draft.platformMode === "ig_only";
      return !!(draft.creative.imageHash || draft.creative.videoId) &&
             draft.creative.headline.trim() &&
             draft.creative.primaryText.trim() &&
             draft.creative.linkUrl.trim() &&
             !!draft.pageId &&
             (!igRequired || !!draft.instagramId);
    }
    if (step === 4) {
      if (!draft.startDate) return false;
      if (draft.budgetMode === "lifetime") {
        if (!draft.endDate) return false;
        var days = lifetimeDays(draft.startDate, draft.endDate);
        return draft.lifetimeBudgetRand > 0 && draft.lifetimeBudgetRand <= MAX_DAILY_RAND * days;
      }
      return draft.dailyBudgetRand > 0 && draft.dailyBudgetRand <= MAX_DAILY_RAND;
    }
    if (step === 5) return true;
    return true;
  })();

  // -------- Submit ---------------------------------------------------------
  var submit = function(){
    if (submitting) return;
    setSubmitting(true); setSubmitErr(null);
    var payload = {
      accountId: draft.accountId,
      accountName: draft.accountName,
      objective: draft.objective,
      specialAdCategories: draft.specialAdCategories,
      campaignName: draft.campaignName.trim(),
      platformMode: draft.platformMode,
      pageId: draft.pageId,
      instagramId: draft.instagramId || null,
      audience: draft.audience,
      placement: draft.placement,
      creative: {
        imageHash: draft.creative.imageHash,
        videoId: draft.creative.videoId,
        headline: draft.creative.headline,
        primaryText: draft.creative.primaryText,
        description: draft.creative.description,
        linkUrl: draft.creative.linkUrl,
        callToAction: draft.creative.callToAction
      },
      budgetMode: draft.budgetMode,
      dailyBudgetCents: draft.budgetMode === "daily" ? Math.round(draft.dailyBudgetRand * 100) : 0,
      lifetimeBudgetCents: draft.budgetMode === "lifetime" ? Math.round(draft.lifetimeBudgetRand * 100) : 0,
      startDate: draft.startDate,
      endDate: draft.endDate || null,
      pixelId: draft.pixelId || null,
      conversionEvent: draft.conversionEvent || null,
      urlTags: draft.urlTags || null
    };
    fetch(apiBase + "/api/create/campaign", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
      body: JSON.stringify(payload)
    })
      .then(function(r){ return r.json().then(function(d){ return { ok: r.ok, status: r.status, data: d }; }); })
      .then(function(x){
        setSubmitting(false);
        if (x.status === 401) { props.onLogout(); return; }
        if (!x.ok) { setSubmitErr({ status: x.status, body: x.data || { error: "Submit failed" } }); return; }
        setResult(x.data);
      })
      .catch(function(){ setSubmitting(false); setSubmitErr({ status: 0, body: { error: "Network error. Try again." } }); });
  };

  // -------- Result screen --------------------------------------------------
  if (result) return <SuccessScreen P={P} ff={ff} fm={fm} Ic={Ic} Glass={Glass} result={result}
    onAnother={function(){ setResult(null); setStep(0); setDraft(initial); setSubmitErr(null); }}/>;

  // -------- Render ---------------------------------------------------------
  return <div>
    <SH icon={Ic.fire(P.ember,20)} title="Create Campaign" sub={"Step " + (step+1) + " of 7 · " + STEP_LABELS[step] + " · PIN-gated, R5,000/day max, all campaigns paused"} accent={P.ember}/>

    <Stepper P={P} fm={fm} step={step}/>

    <div style={{marginTop:20}}>
      {step === 0 && <Step0 P={P} ff={ff} fm={fm} Ic={Ic} Glass={Glass}
        draft={draft} update={update} accounts={accounts}/>}
      {step === 1 && <Step1 P={P} ff={ff} fm={fm} Glass={Glass}
        apiBase={apiBase} token={token}
        draft={draft} updateNested={updateNested}/>}
      {step === 2 && <Step2 P={P} ff={ff} fm={fm} Glass={Glass}
        draft={draft} updateNested={updateNested}/>}
      {step === 3 && <Step3 P={P} ff={ff} fm={fm} Ic={Ic} Glass={Glass}
        apiBase={apiBase} token={token} draft={draft} update={update} updateNested={updateNested}
        pages={pages} instagrams={instagrams}/>}
      {step === 4 && <Step4 P={P} ff={ff} fm={fm} Glass={Glass}
        draft={draft} update={update}/>}
      {step === 5 && <Step5 P={P} ff={ff} fm={fm} Glass={Glass}
        draft={draft} update={update} pixels={pixels}/>}
      {step === 6 && <Step6 P={P} ff={ff} fm={fm} Ic={Ic} Glass={Glass}
        draft={draft} accounts={accounts} pages={pages} instagrams={instagrams} pixels={pixels}/>}
    </div>

    {submitErr && <div style={{marginTop:18,padding:"14px 18px",background:(P.critical||"#ef4444")+"12",border:"1px solid "+(P.critical||"#ef4444")+"40",borderRadius:10,color:P.critical||"#ef4444",fontSize:12,fontFamily:fm,lineHeight:1.6}}>
      <div style={{fontWeight:800,letterSpacing:1.5,textTransform:"uppercase",fontSize:10,marginBottom:8}}>Create failed (HTTP {submitErr.status})</div>
      <div style={{color:P.txt,marginBottom:8}}>{submitErr.body && submitErr.body.error}</div>
      {submitErr.body && submitErr.body.partial && <div style={{color:P.warning||"#fbbf24",marginBottom:8,fontSize:11}}>
        Partial state created and left PAUSED: {Object.keys(submitErr.body.partial).map(function(k){return k+"="+submitErr.body.partial[k];}).join(", ")}
      </div>}
      {submitErr.body && submitErr.body.meta && <pre style={{margin:"0 0 8px",padding:"10px 12px",background:"rgba(0,0,0,0.4)",border:"1px solid "+P.rule,borderRadius:8,color:P.label||P.sub,fontSize:11,fontFamily:fm,whiteSpace:"pre-wrap",wordBreak:"break-word",maxHeight:240,overflow:"auto"}}>
{JSON.stringify(submitErr.body.meta, null, 2)}
      </pre>}
      {submitErr.body && submitErr.body.sent && <details style={{marginTop:6}}>
        <summary style={{fontSize:10,color:P.label||P.sub,cursor:"pointer",letterSpacing:1.5,textTransform:"uppercase",fontWeight:700,fontFamily:fm}}>Sent payload</summary>
        <pre style={{margin:"6px 0 0",padding:"10px 12px",background:"rgba(0,0,0,0.4)",border:"1px solid "+P.rule,borderRadius:8,color:P.label||P.sub,fontSize:11,fontFamily:fm,whiteSpace:"pre-wrap",wordBreak:"break-word",maxHeight:240,overflow:"auto"}}>
{JSON.stringify(submitErr.body.sent, null, 2)}
        </pre>
      </details>}
    </div>}

    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:24,padding:"16px 0",borderTop:"1px solid "+P.rule}}>
      <button onClick={function(){ if (step > 0) setStep(step - 1); }} disabled={step === 0}
        style={{background:"transparent",border:"1px solid "+P.rule,borderRadius:10,padding:"10px 22px",color:step===0?P.dim:(P.label||P.sub),fontSize:11,fontWeight:700,fontFamily:fm,cursor:step===0?"default":"pointer",letterSpacing:2}}>
        Back
      </button>
      <div style={{display:"flex",gap:10}}>
        <button onClick={props.onLogout} style={{background:"transparent",border:"1px solid "+P.rule,borderRadius:10,padding:"10px 16px",color:P.dim,fontSize:11,fontWeight:700,fontFamily:fm,cursor:"pointer",letterSpacing:2}}>
          Lock
        </button>
        {step < 6 && <button onClick={function(){ if (canAdvance) setStep(step + 1); }} disabled={!canAdvance}
          style={{background:canAdvance?"linear-gradient(135deg,#FF3D00,#FF6B00)":P.dim,border:"none",borderRadius:10,padding:"10px 26px",color:"#fff",fontSize:12,fontWeight:800,fontFamily:fm,letterSpacing:2,cursor:canAdvance?"pointer":"default"}}>
          Next
        </button>}
        {step === 6 && <button onClick={submit} disabled={submitting}
          style={{background:submitting?P.dim:"linear-gradient(135deg,#FF3D00,#FF6B00)",border:"none",borderRadius:10,padding:"10px 26px",color:"#fff",fontSize:12,fontWeight:800,fontFamily:fm,letterSpacing:2,cursor:submitting?"default":"pointer"}}>
          {submitting ? "Creating..." : "Create campaign (PAUSED)"}
        </button>}
      </div>
    </div>
  </div>;
}

// ---------------------------------------------------------------------------
// Stepper

function Stepper(props) {
  var P = props.P, fm = props.fm, step = props.step;
  return <div style={{display:"flex",gap:6}}>
    {STEP_LABELS.map(function(label, i){
      var done = i < step, active = i === step;
      var bg = active ? "linear-gradient(135deg,#FF3D00,#FF6B00)" : (done ? P.ember + "25" : "transparent");
      var border = active ? "1px solid " + P.ember : (done ? "1px solid " + P.ember + "50" : "1px solid " + P.rule);
      var color = active ? "#fff" : (done ? P.ember : (P.label || P.sub));
      return <div key={label} style={{flex:1,padding:"8px 10px",background:bg,border:border,borderRadius:8,fontSize:9,fontWeight:800,color:color,fontFamily:fm,letterSpacing:1.2,textTransform:"uppercase",textAlign:"center"}}>
        {(i+1) + ". " + label}
      </div>;
    })}
  </div>;
}

// ---------------------------------------------------------------------------
// Step 0: Account & Objective

function Step0(props) {
  var P = props.P, ff = props.ff, fm = props.fm, Glass = props.Glass;
  var draft = props.draft, update = props.update, accounts = props.accounts;

  return <div>
    <Glass accent={P.ember} st={{padding:22,marginBottom:16}}>
      <Field label="Ad account" fm={fm} P={P}>
        {accounts.loading && <div style={{fontSize:12,color:P.label||P.sub,fontFamily:fm}}>Loading accounts...</div>}
        {accounts.error && <div style={{fontSize:12,color:P.critical||"#ef4444",fontFamily:fm}}>{accounts.error}</div>}
        {!accounts.loading && !accounts.error && <select value={draft.accountId} onChange={function(e){
          var id = e.target.value;
          var match = accounts.items.find(function(a){ return a.accountId === id; });
          update({ accountId: id, accountName: match ? match.name : "" });
        }} style={selectStyle(P, fm)}>
          <option value="">— Choose account —</option>
          {accounts.items.map(function(a){
            return <option key={a.accountId} value={a.accountId}>{a.name} ({a.currency || "?"})</option>;
          })}
        </select>}
      </Field>
      <Field label="Campaign name" fm={fm} P={P}>
        <input value={draft.campaignName} onChange={function(e){ update({ campaignName: e.target.value }); }}
          placeholder="e.g. MoMo / IG Reels / May Awareness"
          style={inputStyle(P, fm)}/>
      </Field>
    </Glass>

    <Glass accent={P.orchid} st={{padding:22}}>
      <div style={{fontSize:10,fontWeight:800,color:P.orchid,letterSpacing:2,fontFamily:fm,marginBottom:12,textTransform:"uppercase"}}>Objective</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10}}>
        {OBJECTIVES.map(function(o){
          var on = draft.objective === o.id;
          return <div key={o.id} onClick={function(){ update({ objective: o.id }); }} style={{padding:"14px 16px",border:"1px solid "+(on?P.orchid:P.rule),background:on?P.orchid+"12":"transparent",borderRadius:10,cursor:"pointer"}}>
            <div style={{fontSize:13,fontWeight:800,color:on?P.orchid:P.txt,fontFamily:ff}}>{o.label}</div>
            <div style={{fontSize:11,color:P.label||P.sub,fontFamily:fm,marginTop:3}}>{o.sub}</div>
          </div>;
        })}
      </div>
      <div style={{marginTop:16,fontSize:11,color:P.label||P.sub,fontFamily:fm,lineHeight:1.6}}>
        Phase 1 only supports standard objectives. Advantage+ Shopping (ASC) and App Campaigns (AAC) are removed in Meta API v25.0+.
      </div>
    </Glass>

    <Glass accent={P.fb} st={{padding:22,marginTop:16}}>
      <div style={{fontSize:10,fontWeight:800,color:P.fb,letterSpacing:2,fontFamily:fm,marginBottom:12,textTransform:"uppercase"}}>Platform</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
        {[
          { k: "fb_only", n: "Facebook only", sub: "FB feed, stories, reels" },
          { k: "fb_ig", n: "Facebook + Instagram", sub: "Cross-platform delivery" },
          { k: "ig_only", n: "Instagram only", sub: "IG feed, stories, reels" }
        ].map(function(o){
          var on = draft.platformMode === o.k;
          return <div key={o.k} onClick={function(){ update({ platformMode: o.k }); }} style={{padding:"14px 16px",border:"1px solid "+(on?P.fb:P.rule),background:on?P.fb+"15":"transparent",borderRadius:10,cursor:"pointer"}}>
            <div style={{fontSize:13,fontWeight:800,color:on?P.fb:P.txt,fontFamily:ff}}>{o.n}</div>
            <div style={{fontSize:11,color:P.label||P.sub,fontFamily:fm,marginTop:3}}>{o.sub}</div>
          </div>;
        })}
      </div>
      <div style={{marginTop:14,fontSize:11,color:P.label||P.sub,fontFamily:fm,lineHeight:1.6}}>
        Even Instagram-only ads need a Facebook Page (Meta uses it as the actor identity). Pick the page in the Creative step.
      </div>
    </Glass>
  </div>;
}

// ---------------------------------------------------------------------------
// Step 1: Audience

function Step1(props) {
  var P = props.P, ff = props.ff, fm = props.fm, Glass = props.Glass;
  var draft = props.draft, updateNested = props.updateNested;
  var apiBase = props.apiBase, token = props.token;
  var a = draft.audience;
  var toggleGender = function(g){
    var arr = a.genders.indexOf(g) >= 0 ? a.genders.filter(function(x){return x!==g;}) : a.genders.concat([g]);
    updateNested("audience", { genders: arr });
  };
  var addItem = function(item){
    var existing = a.targetingItems || [];
    if (existing.some(function(x){ return x.id === item.id && x.type === item.type; })) return;
    updateNested("audience", { targetingItems: existing.concat([item]) });
  };
  var removeItem = function(id, type){
    var existing = a.targetingItems || [];
    updateNested("audience", { targetingItems: existing.filter(function(x){ return !(x.id === id && x.type === type); }) });
  };
  return <Glass accent={P.cyan} st={{padding:22}}>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
      <Field label="Countries (comma-separated, ISO codes)" fm={fm} P={P}>
        <input value={a.countries.join(",")} onChange={function(e){
          updateNested("audience", { countries: e.target.value.split(",").map(function(s){return s.trim().toUpperCase();}).filter(Boolean) });
        }} placeholder="ZA" style={inputStyle(P, fm)}/>
      </Field>
      <Field label="Age range" fm={fm} P={P}>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <input type="number" min={13} max={65} value={a.ageMin} onChange={function(e){ updateNested("audience", { ageMin: parseInt(e.target.value, 10) || 13 }); }} style={inputStyle(P, fm, { width: 80 })}/>
          <span style={{color:P.label||P.sub,fontSize:11}}>to</span>
          <input type="number" min={13} max={65} value={a.ageMax} onChange={function(e){ updateNested("audience", { ageMax: parseInt(e.target.value, 10) || 65 }); }} style={inputStyle(P, fm, { width: 80 })}/>
        </div>
      </Field>
    </div>

    <Field label="Gender" fm={fm} P={P}>
      <div style={{display:"flex",gap:8}}>
        {[{k:1,n:"Male"},{k:2,n:"Female"}].map(function(g){
          var on = a.genders.indexOf(g.k) >= 0;
          return <div key={g.k} onClick={function(){ toggleGender(g.k); }} style={{padding:"8px 16px",border:"1px solid "+(on?P.cyan:P.rule),background:on?P.cyan+"15":"transparent",borderRadius:8,cursor:"pointer",color:on?P.cyan:(P.label||P.sub),fontSize:11,fontWeight:700,fontFamily:fm}}>
            {g.n}
          </div>;
        })}
        {a.genders.length === 0 && <span style={{fontSize:10,color:P.label||P.sub,fontFamily:fm,alignSelf:"center"}}>(none selected = all genders)</span>}
      </div>
    </Field>

    <Field label="Detailed targeting (interests, behaviors, demographics)" fm={fm} P={P}>
      <TargetingPicker P={P} ff={ff} fm={fm}
        apiBase={apiBase} token={token} accountId={draft.accountId}
        items={a.targetingItems || []} onAdd={addItem} onRemove={removeItem}/>
    </Field>

    <details style={{marginTop:14}}>
      <summary style={{fontSize:10,color:P.label||P.sub,cursor:"pointer",letterSpacing:1.5,textTransform:"uppercase",fontWeight:700,fontFamily:fm}}>Advanced: raw flexible_spec JSON</summary>
      <textarea value={a.flexibleSpec ? JSON.stringify(a.flexibleSpec, null, 2) : ""} onChange={function(e){
        var v = e.target.value.trim();
        if (!v) { updateNested("audience", { flexibleSpec: null }); return; }
        try { updateNested("audience", { flexibleSpec: JSON.parse(v) }); } catch (_) { /* ignore until valid */ }
      }} placeholder='[{"interests":[{"id":"6003107902433","name":"Online shopping"}]}]' style={Object.assign({}, inputStyle(P, fm), { minHeight: 90, fontFamily: fm, fontSize: 11, marginTop: 8 })}/>
      <div style={{fontSize:10,color:P.label||P.sub,fontFamily:fm,marginTop:4}}>
        If set, this overrides the picker selections above. For power users hand-crafting exotic targeting trees.
      </div>
    </details>

    <div style={{marginTop:14,fontSize:11,color:P.label||P.sub,fontFamily:fm,lineHeight:1.6}}>
      Note: detailed-targeting interest consolidation took effect 6 Jan 2026. New combined interest options replace many legacy ones.
    </div>
  </Glass>;
}

// ---------------------------------------------------------------------------
// Step 2: Placement

function Step2(props) {
  var P = props.P, ff = props.ff, fm = props.fm, Glass = props.Glass;
  var draft = props.draft, updateNested = props.updateNested;
  var pl = draft.placement;
  var toggle = function(field, value){
    var arr = pl[field] || [];
    var next = arr.indexOf(value) >= 0 ? arr.filter(function(x){return x!==value;}) : arr.concat([value]);
    var patch = {}; patch[field] = next; updateNested("placement", patch);
  };
  return <Glass accent={P.fb} st={{padding:22}}>
    <div style={{display:"flex",gap:8,marginBottom:18}}>
      {["advantage","manual"].map(function(m){
        var on = pl.mode === m;
        return <div key={m} onClick={function(){ updateNested("placement", { mode: m }); }} style={{padding:"10px 18px",border:"1px solid "+(on?P.fb:P.rule),background:on?P.fb+"15":"transparent",borderRadius:10,cursor:"pointer",fontSize:11,fontWeight:800,color:on?P.fb:(P.label||P.sub),fontFamily:fm,letterSpacing:1.5,textTransform:"uppercase"}}>
          {m === "advantage" ? "Advantage+ placements" : "Manual"}
        </div>;
      })}
    </div>

    {pl.mode === "advantage" && <div style={{padding:"18px 20px",background:P.fb+"08",border:"1px solid "+P.fb+"30",borderRadius:10,fontSize:12,color:P.txt,fontFamily:ff,lineHeight:1.7}}>
      Meta will auto-allocate placements across Facebook + Instagram + Audience Network + Messenger to optimise the chosen objective. This is the recommended default.
    </div>}

    {pl.mode === "manual" && <div>
      <Pillgrid label="Platforms" P={P} fm={fm}
        options={[{k:"facebook",n:"Facebook"},{k:"instagram",n:"Instagram"},{k:"audience_network",n:"Audience Network"},{k:"messenger",n:"Messenger"}]}
        selected={pl.platforms || []} onToggle={function(v){ toggle("platforms", v); }}/>
      <Pillgrid label="Facebook positions" P={P} fm={fm}
        options={[{k:"feed",n:"Feed"},{k:"facebook_reels",n:"Reels"},{k:"video_feeds",n:"Video Feeds"},{k:"story",n:"Stories"},{k:"marketplace",n:"Marketplace"}]}
        selected={pl.facebookPositions || []} onToggle={function(v){ toggle("facebookPositions", v); }}/>
      <Pillgrid label="Instagram positions" P={P} fm={fm}
        options={[{k:"stream",n:"Feed"},{k:"story",n:"Stories"},{k:"reels",n:"Reels"},{k:"explore",n:"Explore"}]}
        selected={pl.instagramPositions || []} onToggle={function(v){ toggle("instagramPositions", v); }}/>
      <Pillgrid label="Devices" P={P} fm={fm}
        options={[{k:"mobile",n:"Mobile"},{k:"desktop",n:"Desktop"}]}
        selected={pl.devicePlatforms || []} onToggle={function(v){ toggle("devicePlatforms", v); }}/>
    </div>}
  </Glass>;
}

// ---------------------------------------------------------------------------
// Step 3: Creative

function Step3(props) {
  var P = props.P, ff = props.ff, fm = props.fm, Ic = props.Ic, Glass = props.Glass;
  var apiBase = props.apiBase, token = props.token, draft = props.draft, update = props.update, updateNested = props.updateNested;
  var pages = props.pages, instagrams = props.instagrams;

  var fileRef = useRef(null);
  var upS = useState({ uploading: false, error: "" }), uploadState = upS[0], setUploadState = upS[1];

  var onFile = function(e){
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var kind = file.type.indexOf("video") === 0 ? "video" : "image";
    setUploadState({ uploading: true, error: "" });

    var rdr = new FileReader();
    rdr.onload = function(){
      var dataUrl = rdr.result;
      var b64 = String(dataUrl).split(",")[1] || "";
      fetch(apiBase + "/api/create/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
        body: JSON.stringify({ kind: kind, accountId: draft.accountId, filename: file.name, mimeType: file.type, dataB64: b64 })
      })
        .then(function(r){ return r.json().then(function(d){ return { ok: r.ok, data: d }; }); })
        .then(function(x){
          if (!x.ok) {
            setUploadState({ uploading: false, error: (x.data && x.data.error) || "Upload failed" });
            return;
          }
          updateNested("creative", {
            kind: x.data.kind,
            imageHash: x.data.imageHash || null,
            videoId: x.data.videoId || null,
            filename: file.name,
            previewDataUrl: kind === "image" ? dataUrl : null
          });
          setUploadState({ uploading: false, error: "" });
        })
        .catch(function(){ setUploadState({ uploading: false, error: "Network error" }); });
    };
    rdr.readAsDataURL(file);
  };

  var igRequired = draft.platformMode === "fb_ig" || draft.platformMode === "ig_only";
  var fbHidden = draft.platformMode === "ig_only"; // page still needed under the hood, but make UI less confusing

  return <Glass accent={P.fuchsia} st={{padding:22}}>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
      <Field label={fbHidden ? "Facebook page (required by Meta as actor identity)" : "Facebook page"} fm={fm} P={P}>
        <select value={draft.pageId} onChange={function(e){ update({ pageId: e.target.value }); }} style={selectStyle(P, fm)}>
          <option value="">{pages.loading ? "Loading..." : "— Choose page —"}</option>
          {(pages.items || []).map(function(p){ return <option key={p.pageId} value={p.pageId}>{p.name}</option>; })}
        </select>
      </Field>
      <Field label={igRequired ? "Instagram account (required)" : "Instagram account (optional)"} fm={fm} P={P}>
        <select value={draft.instagramId} onChange={function(e){ update({ instagramId: e.target.value }); }} style={selectStyle(P, fm)}>
          <option value="">{instagrams.loading ? "Loading..." : (igRequired ? "— Choose Instagram —" : "— None / FB-only —")}</option>
          {(instagrams.items || []).map(function(i){ return <option key={i.instagramId} value={i.instagramId}>@{i.username}</option>; })}
        </select>
      </Field>
    </div>

    <Field label="Asset (image or video, max ~3MB)" fm={fm} P={P}>
      <input ref={fileRef} type="file" accept="image/*,video/*" onChange={onFile} disabled={!draft.accountId || uploadState.uploading} style={Object.assign({}, inputStyle(P, fm), { padding: "10px 12px" })}/>
      {uploadState.uploading && <div style={{fontSize:11,color:P.label||P.sub,fontFamily:fm,marginTop:6}}>Uploading to Meta...</div>}
      {uploadState.error && <div style={{fontSize:11,color:P.critical||"#ef4444",fontFamily:fm,marginTop:6}}>{uploadState.error}</div>}
      {(draft.creative.imageHash || draft.creative.videoId) && <div style={{marginTop:10,padding:"10px 14px",background:P.mint+"10",border:"1px solid "+P.mint+"40",borderRadius:8,fontSize:11,color:P.mint,fontFamily:fm}}>
        Uploaded: {draft.creative.filename} ({draft.creative.kind === "image" ? ("hash " + (draft.creative.imageHash||"").slice(0,12) + "...") : ("video " + draft.creative.videoId)})
      </div>}
      {draft.creative.previewDataUrl && <img src={draft.creative.previewDataUrl} alt="" style={{marginTop:10,maxWidth:240,borderRadius:8,border:"1px solid "+P.rule}}/>}
    </Field>

    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
      <Field label="Headline" fm={fm} P={P}>
        <input value={draft.creative.headline} onChange={function(e){ updateNested("creative", { headline: e.target.value }); }} maxLength={200} style={inputStyle(P, fm)}/>
      </Field>
      <Field label="Call to action" fm={fm} P={P}>
        <select value={draft.creative.callToAction} onChange={function(e){ updateNested("creative", { callToAction: e.target.value }); }} style={selectStyle(P, fm)}>
          {CTAS.map(function(c){ return <option key={c} value={c}>{c.replace(/_/g," ")}</option>; })}
        </select>
      </Field>
    </div>

    <Field label="Primary text" fm={fm} P={P}>
      <textarea value={draft.creative.primaryText} onChange={function(e){ updateNested("creative", { primaryText: e.target.value }); }} maxLength={1500} style={Object.assign({}, inputStyle(P, fm), { minHeight: 90 })}/>
    </Field>

    <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:14}}>
      <Field label="Destination URL" fm={fm} P={P}>
        <input value={draft.creative.linkUrl} onChange={function(e){ updateNested("creative", { linkUrl: e.target.value }); }} placeholder="https://..." style={inputStyle(P, fm)}/>
      </Field>
      <Field label="Description (optional)" fm={fm} P={P}>
        <input value={draft.creative.description} onChange={function(e){ updateNested("creative", { description: e.target.value }); }} maxLength={200} style={inputStyle(P, fm)}/>
      </Field>
    </div>
  </Glass>;
}

// ---------------------------------------------------------------------------
// Step 4: Budget & Schedule

function Step4(props) {
  var P = props.P, ff = props.ff, fm = props.fm, Glass = props.Glass;
  var draft = props.draft, update = props.update;
  var isLifetime = draft.budgetMode === "lifetime";
  var days = isLifetime ? lifetimeDays(draft.startDate, draft.endDate) : 0;
  var lifetimeCap = MAX_DAILY_RAND * (days || 1);
  var dailyOver = draft.dailyBudgetRand > MAX_DAILY_RAND;
  var lifetimeOver = draft.lifetimeBudgetRand > lifetimeCap;

  return <Glass accent={P.solar} st={{padding:22}}>
    <div style={{fontSize:9,fontWeight:700,color:P.label||P.sub,letterSpacing:1.5,fontFamily:fm,textTransform:"uppercase",marginBottom:8}}>Budget type</div>
    <div style={{display:"flex",gap:8,marginBottom:18}}>
      {[{k:"daily",n:"Daily budget"},{k:"lifetime",n:"Lifetime budget"}].map(function(b){
        var on = draft.budgetMode === b.k;
        return <div key={b.k} onClick={function(){ update({ budgetMode: b.k }); }} style={{padding:"10px 18px",border:"1px solid "+(on?P.solar:P.rule),background:on?P.solar+"15":"transparent",borderRadius:10,cursor:"pointer",fontSize:11,fontWeight:800,color:on?P.solar:(P.label||P.sub),fontFamily:fm,letterSpacing:1.5,textTransform:"uppercase"}}>
          {b.n}
        </div>;
      })}
    </div>

    {!isLifetime && <Field label={"Daily budget (ZAR, max R" + MAX_DAILY_RAND.toLocaleString() + ")"} fm={fm} P={P}>
      <input type="number" min={1} max={MAX_DAILY_RAND} step={50}
        value={draft.dailyBudgetRand}
        onChange={function(e){ var v = parseInt(e.target.value, 10); if (!isFinite(v)) v = 0; update({ dailyBudgetRand: Math.max(0, Math.min(MAX_DAILY_RAND, v)) }); }}
        style={Object.assign({}, inputStyle(P, fm), dailyOver ? { borderColor: P.critical || "#ef4444" } : {})}/>
      {dailyOver && <div style={{fontSize:11,color:P.critical||"#ef4444",fontFamily:fm,marginTop:6}}>Daily budget cannot exceed R{MAX_DAILY_RAND.toLocaleString()} — server will reject this.</div>}
    </Field>}

    {isLifetime && <Field label={"Lifetime budget (ZAR, max R" + lifetimeCap.toLocaleString() + (days ? " over " + days + " days" : "") + ")"} fm={fm} P={P}>
      <input type="number" min={1} step={100}
        value={draft.lifetimeBudgetRand}
        onChange={function(e){ var v = parseInt(e.target.value, 10); if (!isFinite(v)) v = 0; update({ lifetimeBudgetRand: Math.max(0, v) }); }}
        style={Object.assign({}, inputStyle(P, fm), lifetimeOver ? { borderColor: P.critical || "#ef4444" } : {})}/>
      {!draft.endDate && <div style={{fontSize:11,color:P.warning||"#fbbf24",fontFamily:fm,marginTop:6}}>End date required for a lifetime budget — set one below.</div>}
      {lifetimeOver && <div style={{fontSize:11,color:P.critical||"#ef4444",fontFamily:fm,marginTop:6}}>Lifetime budget cannot exceed R{lifetimeCap.toLocaleString()} (R{MAX_DAILY_RAND.toLocaleString()} × {days} days).</div>}
    </Field>}

    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
      <Field label="Start date (SAST)" fm={fm} P={P}>
        <input type="date" value={draft.startDate} onChange={function(e){ update({ startDate: e.target.value }); }} style={inputStyle(P, fm)}/>
      </Field>
      <Field label={isLifetime ? "End date (SAST, required)" : "End date (SAST, optional, blank = open ended)"} fm={fm} P={P}>
        <input type="date" value={draft.endDate} onChange={function(e){ update({ endDate: e.target.value }); }} style={inputStyle(P, fm)}/>
      </Field>
    </div>
    <div style={{marginTop:10,fontSize:10,color:P.label||P.sub,fontFamily:fm,lineHeight:1.6}}>
      Times are interpreted in South African Standard Time (UTC+2). Campaigns starting today auto-bump to "now + 15 min" if the picked time has already passed.
    </div>
  </Glass>;
}

// ---------------------------------------------------------------------------
// Step 5: Tracking

function Step5(props) {
  var P = props.P, ff = props.ff, fm = props.fm, Glass = props.Glass;
  var draft = props.draft, update = props.update, pixels = props.pixels;
  return <Glass accent={P.mint} st={{padding:22}}>
    <Field label="Pixel (optional, required for OUTCOME_SALES)" fm={fm} P={P}>
      <select value={draft.pixelId} onChange={function(e){ update({ pixelId: e.target.value }); }} style={selectStyle(P, fm)}>
        <option value="">{pixels.loading ? "Loading..." : "— No pixel —"}</option>
        {(pixels.items || []).map(function(p){ return <option key={p.pixelId} value={p.pixelId}>{p.name}</option>; })}
      </select>
    </Field>
    {draft.objective === "OUTCOME_SALES" && <Field label="Conversion event" fm={fm} P={P}>
      <select value={draft.conversionEvent} onChange={function(e){ update({ conversionEvent: e.target.value }); }} style={selectStyle(P, fm)}>
        {["PURCHASE","ADD_TO_CART","INITIATE_CHECKOUT","LEAD","COMPLETE_REGISTRATION","ADD_PAYMENT_INFO"].map(function(c){
          return <option key={c} value={c}>{c.replace(/_/g," ")}</option>;
        })}
      </select>
    </Field>}
    <Field label="URL parameters (optional, e.g. utm_source=fb)" fm={fm} P={P}>
      <input value={draft.urlTags} onChange={function(e){ update({ urlTags: e.target.value }); }} placeholder="utm_source=fb&utm_medium=paid&utm_campaign=may26" style={inputStyle(P, fm)}/>
    </Field>
  </Glass>;
}

// ---------------------------------------------------------------------------
// Step 6: Review

function Step6(props) {
  var P = props.P, ff = props.ff, fm = props.fm, Ic = props.Ic, Glass = props.Glass;
  var draft = props.draft, accounts = props.accounts, pages = props.pages, instagrams = props.instagrams, pixels = props.pixels;

  var accName = (accounts.items.find(function(a){return a.accountId===draft.accountId;}) || {}).name || draft.accountId;
  var pageName = (pages.items.find(function(p){return p.pageId===draft.pageId;}) || {}).name || draft.pageId;
  var igName = draft.instagramId ? "@" + ((instagrams.items.find(function(i){return i.instagramId===draft.instagramId;}) || {}).username || "?") : "(none)";
  var pxName = draft.pixelId ? ((pixels.items.find(function(p){return p.pixelId===draft.pixelId;}) || {}).name || draft.pixelId) : "(none)";

  var platformLabel = { fb_only: "Facebook only", fb_ig: "Facebook + Instagram", ig_only: "Instagram only" }[draft.platformMode] || draft.platformMode;
  var budgetRow = draft.budgetMode === "lifetime"
    ? ["Lifetime budget", "R" + draft.lifetimeBudgetRand.toLocaleString() + " over " + lifetimeDays(draft.startDate, draft.endDate) + " days"]
    : ["Daily budget", "R" + draft.dailyBudgetRand.toLocaleString() + (draft.dailyBudgetRand >= MAX_DAILY_RAND ? " (at ceiling)" : "")];

  var rows = [
    ["Account", accName],
    ["Objective", draft.objective],
    ["Campaign name", draft.campaignName],
    ["Platform", platformLabel],
    ["Page", pageName],
    ["Instagram", igName],
    ["Audience", "Age " + draft.audience.ageMin + "-" + draft.audience.ageMax + ", " + draft.audience.countries.join(",") + (draft.audience.genders.length ? (", " + draft.audience.genders.map(function(g){return g===1?"M":"F";}).join("/")) : ", all genders")],
    ["Detailed targeting", (draft.audience.targetingItems && draft.audience.targetingItems.length > 0)
      ? draft.audience.targetingItems.map(function(t){ return t.name + " (" + t.type.replace(/_/g," ") + ")"; }).join(", ")
      : (draft.audience.flexibleSpec ? "(custom JSON)" : "(none)")],
    ["Placement", draft.placement.mode === "advantage" ? "Advantage+" : ("Manual: " + (draft.placement.platforms || []).join(", "))],
    ["Creative", (draft.creative.kind === "image" ? "Image" : "Video") + " — " + draft.creative.headline],
    ["CTA → URL", draft.creative.callToAction.replace(/_/g," ") + " → " + draft.creative.linkUrl],
    budgetRow,
    ["Schedule (SAST)", draft.startDate + (draft.endDate ? (" → " + draft.endDate) : " (open-ended)")],
    ["Pixel", pxName],
    ["URL params", draft.urlTags || "(none)"]
  ];

  return <Glass accent={P.ember} st={{padding:22}}>
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
      {Ic.bolt(P.ember,16)}
      <span style={{fontSize:11,fontWeight:800,color:P.ember,letterSpacing:2,fontFamily:fm,textTransform:"uppercase"}}>Review and create</span>
    </div>
    <div style={{borderTop:"1px solid "+P.rule}}>
      {rows.map(function(r, i){
        return <div key={i} style={{display:"grid",gridTemplateColumns:"170px 1fr",gap:10,padding:"10px 4px",borderBottom:"1px solid "+P.rule}}>
          <div style={{fontSize:10,fontWeight:700,color:P.label||P.sub,letterSpacing:1.5,fontFamily:fm,textTransform:"uppercase"}}>{r[0]}</div>
          <div style={{fontSize:12,color:P.txt,fontFamily:ff,lineHeight:1.5,wordBreak:"break-word"}}>{r[1]}</div>
        </div>;
      })}
    </div>
    <div style={{marginTop:18,padding:"14px 16px",background:P.warning+"15",border:"1px solid "+P.warning+"40",borderRadius:10}}>
      <div style={{fontSize:11,color:P.warning,fontFamily:fm,fontWeight:800,letterSpacing:2,marginBottom:6,textTransform:"uppercase"}}>Server enforcement</div>
      <div style={{fontSize:12,color:P.txt,fontFamily:ff,lineHeight:1.7}}>
        On submit the server forces status:PAUSED at all three levels (campaign, ad set, ad), validates account allowlist, and rejects any daily budget above R{MAX_DAILY_RAND.toLocaleString()}. A draft email is added to Gary's Gmail inbox if Gmail OAuth is configured.
      </div>
    </div>
  </Glass>;
}

// ---------------------------------------------------------------------------
// Success screen

function SuccessScreen(props) {
  var P = props.P, ff = props.ff, fm = props.fm, Ic = props.Ic, Glass = props.Glass, result = props.result;
  return <div>
    <Glass accent={P.mint} st={{padding:28}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
        {Ic.check(P.mint,22)}
        <span style={{fontSize:14,fontWeight:900,color:P.mint,letterSpacing:2,fontFamily:fm,textTransform:"uppercase"}}>Campaign created (PAUSED)</span>
      </div>
      <div style={{fontSize:13,color:P.txt,fontFamily:ff,lineHeight:1.7,marginBottom:18}}>
        Review the campaign in Ads Manager and unpause when ready. The campaign was created paused and the daily budget is held below the R{MAX_DAILY_RAND.toLocaleString()} ceiling.
      </div>
      <div style={{fontFamily:fm,fontSize:11,color:P.label||P.sub,lineHeight:2}}>
        <div>campaign_id: <span style={{color:P.txt}}>{result.campaignId}</span></div>
        <div>adset_id: <span style={{color:P.txt}}>{result.adsetId}</span></div>
        <div>ad_id: <span style={{color:P.txt}}>{result.adId}</span></div>
        <div>email_draft: <span style={{color:P.txt}}>{result.emailDraft && result.emailDraft.ok ? ("created (" + result.emailDraft.draftId + ")") : ("skipped — " + ((result.emailDraft && result.emailDraft.reason) || "unknown"))}</span></div>
      </div>
      <div style={{marginTop:20,display:"flex",gap:10}}>
        <a href={result.adsManagerUrl} target="_blank" rel="noreferrer" style={{background:"linear-gradient(135deg,#FF3D00,#FF6B00)",border:"none",borderRadius:10,padding:"10px 22px",color:"#fff",fontSize:11,fontWeight:800,fontFamily:fm,letterSpacing:2,cursor:"pointer",textDecoration:"none"}}>
          Open in Ads Manager
        </a>
        <button onClick={props.onAnother} style={{background:"transparent",border:"1px solid "+P.rule,borderRadius:10,padding:"10px 22px",color:P.label||P.sub,fontSize:11,fontWeight:700,fontFamily:fm,letterSpacing:2,cursor:"pointer"}}>
          Create another
        </button>
      </div>
    </Glass>
  </div>;
}

// ---------------------------------------------------------------------------
// Reusable form bits

function Field(props) {
  return <div style={{marginBottom:14}}>
    <div style={{fontSize:9,fontWeight:700,color:props.P.label||props.P.sub,letterSpacing:1.5,fontFamily:props.fm,textTransform:"uppercase",marginBottom:6}}>{props.label}</div>
    {props.children}
  </div>;
}
function inputStyle(P, fm, extra) {
  return Object.assign({
    boxSizing: "border-box", width: "100%",
    background: "rgba(40,25,60,0.5)", border: "1px solid " + P.rule,
    borderRadius: 8, padding: "10px 14px", color: P.txt,
    fontSize: 13, fontFamily: fm, outline: "none"
  }, extra || {});
}
function selectStyle(P, fm) { return Object.assign({}, inputStyle(P, fm), { padding: "10px 12px" }); }

// ---------------------------------------------------------------------------
// TargetingPicker: search-as-you-type from Meta's targeting taxonomy.
//
// Hits /api/create/targeting-search with a 250 ms debounce. Selected items
// render as chips in their type colour (interests / behaviors / demographics
// each get a distinct accent so the user can scan AND-vs-OR groupings at a
// glance). Audience size estimates from Meta come back per item — shown
// faded so power users can pick wider/narrower audiences with intent.

var TARGETING_TYPE_COLORS = {
  interests: "#A855F7",        // orchid
  behaviors: "#34D399",        // mint
  demographics: "#22D3EE",     // cyan
  work_positions: "#FFAA00",   // solar
  work_employers: "#FFAA00",
  education_majors: "#FF6B00", // ember
  education_schools: "#FF6B00",
  family_statuses: "#F43F5E",  // rose
  life_events: "#D946EF",      // fuchsia
  income: "#34D399"
};

function TargetingPicker(props) {
  var P = props.P, ff = props.ff, fm = props.fm;
  var apiBase = props.apiBase, token = props.token, accountId = props.accountId;
  var items = props.items || [];

  var qS = useState(""), q = qS[0], setQ = qS[1];
  var rS = useState({ loading: false, items: [], error: "" }), results = rS[0], setResults = rS[1];
  var openS = useState(false), open = openS[0], setOpen = openS[1];
  var classS = useState(""), cls = classS[0], setCls = classS[1];

  // Debounce so we don't hammer Meta's search on every keystroke. 250 ms
  // strikes the usual balance between responsiveness and request volume.
  var debounceRef = useRef(null);
  useEffect(function(){
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q || q.trim().length < 2) {
      setResults({ loading: false, items: [], error: "" });
      return;
    }
    if (!accountId) {
      setResults({ loading: false, items: [], error: "Pick an ad account in Step 1 first." });
      return;
    }
    debounceRef.current = setTimeout(function(){
      setResults({ loading: true, items: [], error: "" });
      var url = apiBase + "/api/create/targeting-search?accountId=" + encodeURIComponent(accountId) +
                "&q=" + encodeURIComponent(q) + (cls ? "&class=" + encodeURIComponent(cls) : "");
      fetch(url, { headers: { "Authorization": "Bearer " + token } })
        .then(function(r){ return r.json().then(function(d){ return { ok: r.ok, data: d }; }); })
        .then(function(x){
          if (!x.ok) { setResults({ loading: false, items: [], error: (x.data && x.data.error) || "Search failed" }); return; }
          setResults({ loading: false, items: x.data.items || [], error: "" });
        })
        .catch(function(){ setResults({ loading: false, items: [], error: "Network error" }); });
    }, 250);
    return function(){ if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [q, cls, accountId]);

  var fmtAud = function(item){
    if (!item.audienceSizeLower && !item.audienceSizeUpper) return "";
    var lo = item.audienceSizeLower || 0, hi = item.audienceSizeUpper || 0;
    var fmt = function(n){ if (n >= 1e6) return (n/1e6).toFixed(1) + "M"; if (n >= 1e3) return (n/1e3).toFixed(0) + "K"; return String(n); };
    if (lo && hi) return fmt(lo) + " – " + fmt(hi) + " people";
    return fmt(hi || lo) + " people";
  };

  var classChips = [
    { k: "", n: "All" },
    { k: "interests", n: "Interests" },
    { k: "behaviors", n: "Behaviors" },
    { k: "demographics", n: "Demographics" },
    { k: "work_positions", n: "Job titles" }
  ];

  return <div style={{position:"relative"}}>
    <div style={{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap"}}>
      {classChips.map(function(c){
        var on = cls === c.k;
        return <div key={c.k} onClick={function(){ setCls(c.k); }} style={{padding:"4px 10px",border:"1px solid "+(on?P.cyan:P.rule),background:on?P.cyan+"15":"transparent",borderRadius:6,cursor:"pointer",fontSize:10,fontWeight:700,color:on?P.cyan:(P.label||P.sub),fontFamily:fm,letterSpacing:1.2,textTransform:"uppercase"}}>
          {c.n}
        </div>;
      })}
    </div>

    <input value={q} onChange={function(e){ setQ(e.target.value); setOpen(true); }}
      onFocus={function(){ setOpen(true); }}
      placeholder={accountId ? "Type to search interests, behaviors, demographics..." : "Pick an ad account in Step 1 first"}
      disabled={!accountId}
      style={inputStyle(P, fm)}/>

    {open && q.trim().length >= 2 && <div style={{position:"absolute",left:0,right:0,top:"100%",marginTop:4,background:"rgba(20,12,30,0.98)",border:"1px solid "+P.rule,borderRadius:10,maxHeight:280,overflowY:"auto",zIndex:50,boxShadow:"0 8px 32px rgba(0,0,0,0.5)"}}>
      {results.loading && <div style={{padding:12,fontSize:11,color:P.label||P.sub,fontFamily:fm}}>Searching...</div>}
      {results.error && <div style={{padding:12,fontSize:11,color:P.critical||"#ef4444",fontFamily:fm}}>{results.error}</div>}
      {!results.loading && !results.error && results.items.length === 0 && <div style={{padding:12,fontSize:11,color:P.label||P.sub,fontFamily:fm}}>No matches.</div>}
      {results.items.map(function(item){
        var color = TARGETING_TYPE_COLORS[item.type] || P.label;
        var alreadyAdded = items.some(function(x){ return x.id === item.id && x.type === item.type; });
        return <div key={item.type + ":" + item.id} onClick={function(){ if (!alreadyAdded) props.onAdd(item); setOpen(false); setQ(""); }}
          style={{padding:"10px 14px",borderBottom:"1px solid "+P.rule,cursor:alreadyAdded?"default":"pointer",opacity:alreadyAdded?0.5:1,display:"flex",justifyContent:"space-between",gap:10,alignItems:"center"}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2}}>
              <span style={{fontSize:9,fontWeight:800,color:color,letterSpacing:1.5,fontFamily:fm,textTransform:"uppercase"}}>{item.type.replace(/_/g," ")}</span>
              <span style={{fontSize:13,fontWeight:700,color:P.txt,fontFamily:ff,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{item.name}</span>
            </div>
            {item.path && <div style={{fontSize:10,color:P.label||P.sub,fontFamily:fm,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{item.path}</div>}
          </div>
          <div style={{fontSize:10,color:P.label||P.sub,fontFamily:fm,whiteSpace:"nowrap"}}>{alreadyAdded ? "Added" : fmtAud(item)}</div>
        </div>;
      })}
    </div>}

    {items.length > 0 && <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:10}}>
      {items.map(function(item){
        var color = TARGETING_TYPE_COLORS[item.type] || P.label;
        return <span key={item.type + ":" + item.id} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"5px 10px",border:"1px solid "+color+"50",background:color+"15",borderRadius:8,fontSize:11,color:P.txt,fontFamily:fm}}>
          <span style={{fontSize:8,fontWeight:800,color:color,letterSpacing:1,textTransform:"uppercase"}}>{item.type.replace(/_/g," ")}</span>
          <span>{item.name}</span>
          <span onClick={function(){ props.onRemove(item.id, item.type); }} style={{cursor:"pointer",color:P.label||P.sub,fontWeight:900,marginLeft:2}}>×</span>
        </span>;
      })}
    </div>}

    {open && <div onClick={function(){ setOpen(false); }} style={{position:"fixed",inset:0,zIndex:40}}/>}
  </div>;
}

function Pillgrid(props) {
  var P = props.P, fm = props.fm;
  return <div style={{marginBottom:14}}>
    <div style={{fontSize:9,fontWeight:700,color:P.label||P.sub,letterSpacing:1.5,fontFamily:fm,textTransform:"uppercase",marginBottom:6}}>{props.label}</div>
    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
      {props.options.map(function(o){
        var on = props.selected.indexOf(o.k) >= 0;
        return <div key={o.k} onClick={function(){ props.onToggle(o.k); }} style={{padding:"6px 12px",border:"1px solid "+(on?P.fb:P.rule),background:on?P.fb+"15":"transparent",borderRadius:8,cursor:"pointer",color:on?P.fb:(P.label||P.sub),fontSize:11,fontWeight:700,fontFamily:fm}}>
          {o.n}
        </div>;
      })}
    </div>
  </div>;
}

// ---------------------------------------------------------------------------
// Date helpers

function todayIso() {
  var d = new Date();
  return d.getFullYear() + "-" + pad(d.getMonth()+1) + "-" + pad(d.getDate());
}
function addDaysIso(n) {
  var d = new Date(); d.setDate(d.getDate() + n);
  return d.getFullYear() + "-" + pad(d.getMonth()+1) + "-" + pad(d.getDate());
}
function pad(n) { return (n < 10 ? "0" : "") + n; }
function lifetimeDays(startIso, endIso) {
  if (!startIso || !endIso) return 0;
  var s = Date.parse(startIso + "T00:00:00+0200");
  var e = Date.parse(endIso + "T23:59:59+0200");
  if (!isFinite(s) || !isFinite(e) || e <= s) return 0;
  return Math.max(1, Math.ceil((e - s) / (24 * 60 * 60 * 1000)));
}
