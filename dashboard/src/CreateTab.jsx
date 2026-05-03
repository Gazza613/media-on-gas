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

import { useState, useEffect, useLayoutEffect, useRef } from "react";

var TOKEN_KEY = "gas_create_token";
var TOKEN_EXP_KEY = "gas_create_token_exp";
var DRAFT_KEY = "gas_create_draft";
var STEP_KEY = "gas_create_step";
var MAX_DAILY_RAND = 5000;

// Draft persistence: stash to sessionStorage on every change so a token
// expiry / accidental reload / re-auth doesn't blow away N minutes of
// wizard work. The image preview data URL is stripped before saving — it
// can be megabytes and sessionStorage is capped around 5MB. The hash/id
// references survive so the user keeps their actual upload, only losing
// the preview thumbnail until they re-upload.
function stripDraftForPersist(d) {
  if (!d || !d.creative) return d;
  var creative = Object.assign({}, d.creative, { previewDataUrl: null });
  return Object.assign({}, d, { creative: creative });
}
function readSavedDraft(fallback) {
  try {
    var raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return fallback;
    var parsed = JSON.parse(raw);
    return Object.assign({}, fallback, parsed);
  } catch (_) { return fallback; }
}
function readSavedStep() {
  try {
    var s = parseInt(sessionStorage.getItem(STEP_KEY) || "0", 10);
    return isFinite(s) && s >= 0 && s <= 6 ? s : 0;
  } catch (_) { return 0; }
}
function clearSavedDraft() {
  try { sessionStorage.removeItem(DRAFT_KEY); sessionStorage.removeItem(STEP_KEY); } catch (_) {}
}

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

export default function CreateTab(props) {
  var P = props.P, ff = props.ff, fm = props.fm;
  var Ic = props.Ic, Glass = props.Glass, SH = props.SH, gFire = props.gFire, gEmber = props.gEmber;
  var apiBase = props.apiBase || "";

  // The create-tab JWT lives ONLY in React state — never persisted to
  // sessionStorage. This forces the PIN gate every single time the user
  // navigates to the Create tab, since the App.jsx tab system unmounts
  // and remounts CreateTab on every visit. Slightly more PIN-typing for
  // the operator, but the PIN is the last line of defence against
  // someone walking up to a logged-in dashboard and creating campaigns.
  // The wizard DRAFT is still persisted (sessionStorage) so re-PINning
  // resumes the campaign work where it was left.
  var ts = useState(null);
  var token = ts[0], setToken = ts[1];
  var expS = useState(0);
  var exp = expS[0], setExp = expS[1];

  // One-time cleanup: zap any leftover create-tab tokens from the previous
  // (sessionStorage-backed) implementation. Anyone with a tab still open
  // from before this deploy would otherwise carry a stale token.
  useEffect(function(){
    try { sessionStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(TOKEN_EXP_KEY); } catch (_) {}
  }, []);

  // TTL countdown — kicks the user back to the PIN gate when the token's
  // server-set TTL elapses while they're still on the Create tab.
  useEffect(function(){
    if (!token || !exp) return;
    var msLeft = (exp * 1000) - Date.now();
    if (msLeft <= 0) { setToken(null); setExp(0); return; }
    var timer = setTimeout(function(){ setToken(null); setExp(0); }, msLeft + 250);
    return function(){ clearTimeout(timer); };
  }, [token, exp]);

  if (!token) return <PinGate P={P} ff={ff} fm={fm} Ic={Ic} Glass={Glass} apiBase={apiBase}
    onAuthed={function(t, ttlSec){
      setToken(t);
      setExp(Math.floor(Date.now() / 1000) + (ttlSec || 7200));
    }}/>;

  return <Wizard P={P} ff={ff} fm={fm} Ic={Ic} Glass={Glass} SH={SH} gFire={gFire} gEmber={gEmber}
    apiBase={apiBase} token={token}
    onLogout={function(){ setToken(null); setExp(0); }}/>;
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
    audience: {
      locations: {
        geographies: [{ key: "ZA", type: "country", name: "South Africa", countryCode: "ZA", countryName: "South Africa" }],
        customLocations: []
      },
      ageMin: 18, ageMax: 65, genders: [], advantageAudience: false, targetingItems: [], flexibleSpec: null
    },
    placement: { mode: "advantage", platforms: ["facebook","instagram"], facebookPositions: ["feed"], instagramPositions: ["stream","story","reels"], devicePlatforms: ["mobile","desktop"] },
    creative: { kind: "image", imageHash: null, videoId: null, headline: "", primaryText: "", description: "", linkUrl: "", callToAction: "LEARN_MORE", filename: null, previewDataUrl: null },
    budgetMode: "daily",
    dailyBudgetRand: 200, lifetimeBudgetRand: 5000,
    startDate: todayIso(), endDate: addDaysIso(7),
    pixelId: "", conversionEvent: "PURCHASE", urlTags: ""
  };
  // useState lazy initialiser so we only read sessionStorage once on mount.
  // Restored drafts are merged onto `initial` so any new top-level fields
  // added after a draft was saved still get sensible defaults.
  var ds = useState(function(){ return readSavedDraft(initial); }), draft = ds[0], setDraft = ds[1];
  var ss = useState(function(){ return readSavedStep(); }), step = ss[0], setStep = ss[1];
  var update = function(patch){ setDraft(function(d){ return Object.assign({}, d, patch); }); };
  var updateNested = function(key, patch){ setDraft(function(d){ var v = Object.assign({}, d[key], patch); var out = {}; out[key] = v; return Object.assign({}, d, out); }); };

  // Persist draft + step on every change so re-auth (or accidental reload)
  // resumes exactly where the user left off. Stripped of the preview data
  // URL so we don't blow past sessionStorage's ~5 MB cap on large uploads.
  useEffect(function(){
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(stripDraftForPersist(draft))); } catch (_) {}
  }, [draft]);
  useEffect(function(){
    try { sessionStorage.setItem(STEP_KEY, String(step)); } catch (_) {}
  }, [step]);

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
        clearSavedDraft();
        setResult(x.data);
      })
      .catch(function(){ setSubmitting(false); setSubmitErr({ status: 0, body: { error: "Network error. Try again." } }); });
  };

  // -------- Result screen --------------------------------------------------
  if (result) return <SuccessScreen P={P} ff={ff} fm={fm} Ic={Ic} Glass={Glass} result={result}
    onAnother={function(){ clearSavedDraft(); setResult(null); setStep(0); setDraft(initial); setSubmitErr(null); }}/>;

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
      return <div key={label} style={{flex:1,padding:"12px 12px",background:bg,border:border,borderRadius:10,fontSize:11,fontWeight:800,color:color,fontFamily:fm,letterSpacing:1.5,textTransform:"uppercase",textAlign:"center"}}>
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
    <Glass accent={P.ember} st={{padding:26,marginBottom:18}}>
      <Field label="Ad account" fm={fm} P={P} hint="The Meta ad account to bill and run this campaign on. Only allowlisted accounts appear here.">
        {accounts.loading && <div style={{fontSize:13,color:P.label||P.sub,fontFamily:fm}}>Loading accounts...</div>}
        {accounts.error && <div style={{fontSize:13,color:P.critical||"#ef4444",fontFamily:fm}}>{accounts.error}</div>}
        {!accounts.loading && !accounts.error && <Select P={P} fm={fm}
          value={draft.accountId}
          placeholder="— Choose account —"
          options={accounts.items.map(function(a){ return { value: a.accountId, label: a.name, sub: a.currency || "" }; })}
          onChange={function(id){
            var match = accounts.items.find(function(a){ return a.accountId === id; });
            update({ accountId: id, accountName: match ? match.name : "" });
          }}/>}
      </Field>
      <Field label="Campaign name" fm={fm} P={P} hint="Internal name. Suggestion: include client + objective + month, e.g. MoMo · Leads · May 2026.">
        <input value={draft.campaignName} onChange={function(e){ update({ campaignName: e.target.value }); }}
          placeholder="MoMo · Leads · May 2026"
          style={inputStyle(P, fm)}/>
      </Field>
    </Glass>

    <Glass accent={P.orchid} st={{padding:26,marginBottom:18}}>
      <div style={{fontSize:13,fontWeight:800,color:P.orchid,letterSpacing:2,fontFamily:fm,marginBottom:6,textTransform:"uppercase"}}>Objective</div>
      <div style={{fontSize:12,color:P.caption||P.sub,fontFamily:ff,lineHeight:1.6,marginBottom:14}}>What outcome do you want Meta to optimise toward?</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12}}>
        {OBJECTIVES.map(function(o){
          var on = draft.objective === o.id;
          return <div key={o.id} onClick={function(){ update({ objective: o.id }); }} style={{padding:"16px 18px",border:"1px solid "+(on?P.orchid:P.rule),background:on?P.orchid+"15":"rgba(20,12,30,0.4)",borderRadius:12,cursor:"pointer",transition:"all 0.15s ease"}}>
            <div style={{fontSize:14,fontWeight:800,color:on?P.orchid:P.txt,fontFamily:ff}}>{o.label}</div>
            <div style={{fontSize:12,color:P.label||P.sub,fontFamily:ff,marginTop:4,lineHeight:1.5}}>{o.sub}</div>
          </div>;
        })}
      </div>
      <div style={{marginTop:18,fontSize:12,color:P.caption||P.sub,fontFamily:ff,lineHeight:1.7}}>
        Phase 1 supports standard objectives only. Advantage+ Shopping (ASC) and App Campaigns (AAC) were removed in Meta API v25.0+ and will be re-added when Meta releases the v26 replacements.
      </div>
    </Glass>

    <Glass accent={P.fb} st={{padding:26}}>
      <div style={{fontSize:13,fontWeight:800,color:P.fb,letterSpacing:2,fontFamily:fm,marginBottom:6,textTransform:"uppercase"}}>Platform</div>
      <div style={{fontSize:12,color:P.caption||P.sub,fontFamily:ff,lineHeight:1.6,marginBottom:14}}>Where should the ad appear?</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
        {[
          { k: "fb_only", n: "Facebook only", sub: "Feed, Stories, Reels, Marketplace" },
          { k: "fb_ig", n: "Facebook + Instagram", sub: "Both platforms, optimised by Meta" },
          { k: "ig_only", n: "Instagram only", sub: "Feed, Stories, Reels, Explore" }
        ].map(function(o){
          var on = draft.platformMode === o.k;
          return <div key={o.k} onClick={function(){ update({ platformMode: o.k }); }} style={{padding:"16px 18px",border:"1px solid "+(on?P.fb:P.rule),background:on?P.fb+"15":"rgba(20,12,30,0.4)",borderRadius:12,cursor:"pointer"}}>
            <div style={{fontSize:14,fontWeight:800,color:on?P.fb:P.txt,fontFamily:ff}}>{o.n}</div>
            <div style={{fontSize:12,color:P.label||P.sub,fontFamily:ff,marginTop:4,lineHeight:1.5}}>{o.sub}</div>
          </div>;
        })}
      </div>
      <div style={{marginTop:14,fontSize:12,color:P.caption||P.sub,fontFamily:ff,lineHeight:1.7}}>
        Instagram-only ads still need a Facebook Page — Meta uses it as the actor identity even when nothing serves on FB. You'll pick the Page in the Creative step.
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
  return <Glass accent={P.cyan} st={{padding:26}}>
    <Field label="Where to advertise" fm={fm} P={P} hint="Pick countries, regions, cities, suburbs or postal codes. Add proximity pins (15 km from this address etc.) for store-radius campaigns. Mix freely — Meta unions everything you add.">
      <LocationPicker P={P} ff={ff} fm={fm}
        apiBase={apiBase} token={token} accountId={draft.accountId}
        locations={a.locations || { geographies: [], customLocations: [] }}
        onChange={function(next){ updateNested("audience", { locations: next }); }}/>
    </Field>

    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14,marginBottom:8}}>
      <Field label="Age min" fm={fm} P={P}>
        <Select P={P} fm={fm}
          value={String(a.ageMin)}
          options={rangeOptions(13, 65)}
          onChange={function(v){ updateNested("audience", { ageMin: parseInt(v, 10) }); }}/>
      </Field>
      <Field label="Age max" fm={fm} P={P}>
        <Select P={P} fm={fm}
          value={String(a.ageMax)}
          options={rangeOptions(13, 65)}
          onChange={function(v){ updateNested("audience", { ageMax: parseInt(v, 10) }); }}/>
      </Field>
      <Field label="Gender" fm={fm} P={P}>
        <div style={{display:"flex",gap:8,marginTop:2}}>
          {[{k:1,n:"Male"},{k:2,n:"Female"}].map(function(g){
            var on = a.genders.indexOf(g.k) >= 0;
            return <div key={g.k} onClick={function(){ toggleGender(g.k); }} style={{flex:1,padding:"12px 8px",textAlign:"center",border:"1px solid "+(on?P.cyan:P.rule),background:on?P.cyan+"15":"rgba(20,12,30,0.6)",borderRadius:10,cursor:"pointer",color:on?P.cyan:(P.label||P.sub),fontSize:13,fontWeight:700,fontFamily:fm}}>
              {g.n}
            </div>;
          })}
        </div>
        {a.genders.length === 0 && <div style={{fontSize:11,color:P.caption||P.sub,fontFamily:fm,marginTop:6}}>None selected = all genders</div>}
      </Field>
    </div>

    <Field label="Describe your ideal customer (optional, AI-assisted)" fm={fm} P={P}
      hint="Type a plain-English description and we'll suggest matching Meta interests, behaviors and demographics. You can accept or ignore each suggestion.">
      <AudienceSuggester P={P} ff={ff} fm={fm}
        apiBase={apiBase} token={token} accountId={draft.accountId}
        ageMin={a.ageMin} ageMax={a.ageMax}
        countries={a.countries}
        existingItems={a.targetingItems || []}
        onAdd={addItem}/>
    </Field>

    <Field label="Detailed targeting (interests, behaviors, demographics)" fm={fm} P={P}
      hint="Search Meta's targeting taxonomy directly. Items inside one type are OR'd; types are AND'd together. Selected items appear as removable chips below.">
      <TargetingPicker P={P} ff={ff} fm={fm}
        apiBase={apiBase} token={token} accountId={draft.accountId}
        items={a.targetingItems || []} onAdd={addItem} onRemove={removeItem}/>
    </Field>

    <details style={{marginTop:18,padding:"14px 16px",background:"rgba(20,12,30,0.4)",border:"1px solid "+P.rule,borderRadius:10}}>
      <summary style={{fontSize:11,color:P.label||P.sub,cursor:"pointer",letterSpacing:1.5,textTransform:"uppercase",fontWeight:800,fontFamily:fm}}>For developers: raw flexible_spec JSON</summary>
      <div style={{fontSize:12,color:P.caption||P.sub,fontFamily:ff,lineHeight:1.7,marginTop:10,marginBottom:8}}>
        For power users only. If you paste a valid Meta <code style={{background:"rgba(0,0,0,0.4)",padding:"1px 6px",borderRadius:4,fontFamily:fm}}>flexible_spec</code> array here it overrides the picker selections above. Useful for advanced AND/OR groupings (multiple flexible_spec entries) that the picker can't express.
      </div>
      <textarea value={a.flexibleSpec ? JSON.stringify(a.flexibleSpec, null, 2) : ""} onChange={function(e){
        var v = e.target.value.trim();
        if (!v) { updateNested("audience", { flexibleSpec: null }); return; }
        try { updateNested("audience", { flexibleSpec: JSON.parse(v) }); } catch (_) { /* ignore until valid */ }
      }} placeholder='[{"interests":[{"id":"6003107902433","name":"Online shopping"}]}]' style={Object.assign({}, inputStyle(P, fm), { minHeight: 100, fontFamily: fm, fontSize: 12 })}/>
    </details>

    <div style={{marginTop:18,padding:"14px 16px",background:P.info+"10",border:"1px solid "+P.info+"30",borderLeft:"3px solid "+P.info,borderRadius:"0 10px 10px 0"}}>
      <div style={{fontSize:11,fontWeight:800,color:P.info,letterSpacing:1.5,textTransform:"uppercase",fontFamily:fm,marginBottom:6}}>Heads-up: Meta interest consolidation, 6 Jan 2026</div>
      <div style={{fontSize:12,color:P.label||P.sub,fontFamily:ff,lineHeight:1.7}}>
        Meta merged many overlapping interest options into broader combined ones. If a previously-used interest no longer appears in search, it's been folded into a parent — search the parent term and Meta will surface the right replacement. Audience reach estimates also went up across the board because the combined interests pool more users.
      </div>
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
  return <Glass accent={P.fb} st={{padding:26}}>
    <div style={{fontSize:13,fontWeight:800,color:P.fb,letterSpacing:2,fontFamily:fm,marginBottom:6,textTransform:"uppercase"}}>Placement strategy</div>
    <div style={{fontSize:12,color:P.caption||P.sub,fontFamily:ff,lineHeight:1.6,marginBottom:16}}>
      Advantage+ lets Meta decide which feeds, Reels and Stories to serve in. Manual gives you control.
    </div>
    <div style={{display:"flex",gap:10,marginBottom:18}}>
      {["advantage","manual"].map(function(m){
        var on = pl.mode === m;
        return <div key={m} onClick={function(){ updateNested("placement", { mode: m }); }} style={{flex:1,padding:"14px 18px",textAlign:"center",border:"1px solid "+(on?P.fb:P.rule),background:on?P.fb+"15":"rgba(20,12,30,0.4)",borderRadius:12,cursor:"pointer",fontSize:13,fontWeight:800,color:on?P.fb:(P.label||P.sub),fontFamily:fm,letterSpacing:1.5,textTransform:"uppercase"}}>
          {m === "advantage" ? "Advantage+" : "Manual"}
        </div>;
      })}
    </div>

    {pl.mode === "advantage" && <div style={{padding:"18px 22px",background:P.fb+"10",border:"1px solid "+P.fb+"30",borderLeft:"3px solid "+P.fb,borderRadius:"0 12px 12px 0"}}>
      <div style={{fontSize:11,fontWeight:800,color:P.fb,letterSpacing:1.5,textTransform:"uppercase",fontFamily:fm,marginBottom:8}}>How Advantage+ works</div>
      <div style={{fontSize:13,color:P.txt,fontFamily:ff,lineHeight:1.8}}>
        Meta auto-distributes spend across Feeds, Stories, Reels, Audience Network and Messenger, picking the placements that deliver best for your objective. Your creative gets auto-cropped to fit each placement, but for best quality upload square (1:1) and vertical (9:16) versions of your asset. Phase 3 will let you do that in the wizard.
      </div>
    </div>}

    {pl.mode === "manual" && <div>
      <Pillgrid label="Platforms" P={P} fm={fm}
        options={[{k:"facebook",n:"Facebook"},{k:"instagram",n:"Instagram"},{k:"audience_network",n:"Audience Network"},{k:"messenger",n:"Messenger"}]}
        selected={pl.platforms || []} onToggle={function(v){ toggle("platforms", v); }}/>
      <Pillgrid label="Facebook positions" P={P} fm={fm}
        options={[{k:"feed",n:"Feed"},{k:"facebook_reels",n:"Reels"},{k:"story",n:"Stories"},{k:"marketplace",n:"Marketplace"}]}
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

  // Asset kind picker — three tabs above the file input. Determines what the
  // browser file picker accepts (image/*, image/gif, video/*) and what label
  // we show for the upload state.
  var kindTabs = [
    { k: "image", n: "Image", accept: "image/png,image/jpeg,image/webp", hint: "PNG / JPG / WebP, square 1080×1080 ideal" },
    { k: "gif", n: "GIF", accept: "image/gif", hint: "GIF, max ~3 MB. Auto-converts to MP4 for Reels." },
    { k: "video", n: "Video", accept: "video/mp4,video/quicktime", hint: "MP4 / MOV. 9:16 vertical for Reels & Stories." }
  ];
  var activeKind = draft.creative.kind || "image";
  var activeAccept = (kindTabs.find(function(k){ return k.k === activeKind; }) || kindTabs[0]).accept;
  var activeHint = (kindTabs.find(function(k){ return k.k === activeKind; }) || kindTabs[0]).hint;

  return <Glass accent={P.fuchsia} st={{padding:26}}>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
      <Field label={fbHidden ? "Facebook page (Meta requires it as actor identity)" : "Facebook page"} fm={fm} P={P}>
        <Select P={P} fm={fm}
          value={draft.pageId}
          placeholder={pages.loading ? "Loading..." : "— Choose page —"}
          options={(pages.items || []).map(function(p){ return { value: p.pageId, label: p.name }; })}
          onChange={function(v){ update({ pageId: v }); }}/>
      </Field>
      <Field label={igRequired ? "Instagram account (required)" : "Instagram account (optional)"} fm={fm} P={P}>
        <Select P={P} fm={fm}
          value={draft.instagramId}
          placeholder={instagrams.loading ? "Loading..." : (igRequired ? "— Choose Instagram —" : "— None / FB-only —")}
          options={[{ value: "", label: "— None —" }].concat((instagrams.items || []).map(function(i){ return { value: i.instagramId, label: "@" + i.username }; }))}
          onChange={function(v){ update({ instagramId: v }); }}/>
      </Field>
    </div>

    <Field label="Creative type" fm={fm} P={P}>
      <div style={{display:"flex",gap:8}}>
        {kindTabs.map(function(t){
          var on = activeKind === t.k;
          return <div key={t.k} onClick={function(){ updateNested("creative", { kind: t.k, imageHash: null, videoId: null, filename: null, previewDataUrl: null }); setUploadState({ uploading: false, error: "" }); }}
            style={{flex:1,padding:"14px 16px",textAlign:"center",border:"1px solid "+(on?P.fuchsia:P.rule),background:on?P.fuchsia+"15":"rgba(20,12,30,0.6)",borderRadius:10,cursor:"pointer",color:on?P.fuchsia:(P.label||P.sub),fontSize:13,fontWeight:800,fontFamily:fm,letterSpacing:1.2,textTransform:"uppercase"}}>
            {t.n}
          </div>;
        })}
      </div>
    </Field>

    <Field label="Upload asset" fm={fm} P={P} hint={activeHint + " · Max ~3 MB. Larger video uploads coming in Phase 3."}>
      <input ref={fileRef} type="file" accept={activeAccept} onChange={onFile} disabled={!draft.accountId || uploadState.uploading}
        style={Object.assign({}, inputStyle(P, fm), { padding: "12px 14px", fontSize: 13 })}/>
      {uploadState.uploading && <div style={{fontSize:12,color:P.label||P.sub,fontFamily:fm,marginTop:8}}>Uploading to Meta...</div>}
      {uploadState.error && <div style={{fontSize:12,color:P.critical||"#ef4444",fontFamily:fm,marginTop:8}}>{uploadState.error}</div>}
      {(draft.creative.imageHash || draft.creative.videoId) && <div style={{marginTop:12,padding:"12px 16px",background:P.mint+"12",border:"1px solid "+P.mint+"40",borderRadius:10,fontSize:12,color:P.mint,fontFamily:fm}}>
        ✓ Uploaded: {draft.creative.filename}
      </div>}
      {draft.creative.previewDataUrl && <img src={draft.creative.previewDataUrl} alt="" style={{marginTop:12,maxWidth:280,borderRadius:10,border:"1px solid "+P.rule}}/>}
    </Field>

    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
      <Field label="Headline" fm={fm} P={P} hint="The bold line above your primary text. Max 200 characters.">
        <input value={draft.creative.headline} onChange={function(e){ updateNested("creative", { headline: e.target.value }); }} maxLength={200} style={inputStyle(P, fm)}/>
      </Field>
      <Field label="Call to action button" fm={fm} P={P}>
        <Select P={P} fm={fm}
          value={draft.creative.callToAction}
          options={CTAS.map(function(c){ return { value: c, label: c.replace(/_/g," ") }; })}
          onChange={function(v){ updateNested("creative", { callToAction: v }); }}/>
      </Field>
    </div>

    <Field label="Primary text" fm={fm} P={P} hint="The main body of the ad. Max 1,500 characters. First 125 show before 'See more' on most placements.">
      <textarea value={draft.creative.primaryText} onChange={function(e){ updateNested("creative", { primaryText: e.target.value }); }} maxLength={1500} style={Object.assign({}, inputStyle(P, fm), { minHeight: 110 })}/>
    </Field>

    <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:14}}>
      <Field label="Destination URL" fm={fm} P={P} hint="Where users land when they click the CTA. Include https://">
        <input value={draft.creative.linkUrl} onChange={function(e){ updateNested("creative", { linkUrl: e.target.value }); }} placeholder="https://..." style={inputStyle(P, fm)}/>
      </Field>
      <Field label="Description (optional)" fm={fm} P={P} hint="Sub-line under the headline on some placements.">
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
  return <Glass accent={P.mint} st={{padding:26}}>
    <Field label="Pixel" fm={fm} P={P} hint="Optional. Required only for the Sales objective. The pixel measures conversions on your site.">
      <Select P={P} fm={fm}
        value={draft.pixelId}
        placeholder={pixels.loading ? "Loading..." : "— No pixel —"}
        options={[{ value: "", label: "— No pixel —" }].concat((pixels.items || []).map(function(p){ return { value: p.pixelId, label: p.name }; }))}
        onChange={function(v){ update({ pixelId: v }); }}/>
    </Field>
    {draft.objective === "OUTCOME_SALES" && <Field label="Conversion event" fm={fm} P={P} hint="Which event Meta optimizes toward. Should match an event your pixel actually fires.">
      <Select P={P} fm={fm}
        value={draft.conversionEvent}
        options={["PURCHASE","ADD_TO_CART","INITIATE_CHECKOUT","LEAD","COMPLETE_REGISTRATION","ADD_PAYMENT_INFO"].map(function(c){ return { value: c, label: c.replace(/_/g," ") }; })}
        onChange={function(v){ update({ conversionEvent: v }); }}/>
    </Field>}
    <Field label="URL parameters" fm={fm} P={P} hint="Optional. Appended to the destination URL so you can track in Google Analytics or similar. No leading ? — we'll add it.">
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
    ["Audience", "Age " + draft.audience.ageMin + "-" + draft.audience.ageMax + (draft.audience.genders.length ? (", " + draft.audience.genders.map(function(g){return g===1?"M":"F";}).join("/")) : ", all genders")],
    ["Locations", (function(){
      var loc = draft.audience.locations || {};
      var includeParts = [], excludeParts = [];
      (loc.geographies || []).forEach(function(g){
        var s = g.name + (g.region ? " (" + g.region + ")" : "");
        (g.exclude ? excludeParts : includeParts).push(s);
      });
      (loc.customLocations || []).forEach(function(p){
        var s = (p.exclude ? "🚫 " : "📍 ") + (p.label || p.addressString) + " (" + p.radius + " km)";
        (p.exclude ? excludeParts : includeParts).push(s);
      });
      var out = includeParts.length ? includeParts.join(", ") : "(none)";
      if (excludeParts.length) out += "  ·  EXCLUDED: " + excludeParts.join(", ");
      return out;
    })()],
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
    <div style={{marginTop:22,padding:"16px 18px",background:P.mint+"12",border:"1px solid "+P.mint+"40",borderLeft:"3px solid "+P.mint,borderRadius:"0 12px 12px 0"}}>
      <div style={{fontSize:11,color:P.mint,fontFamily:fm,fontWeight:800,letterSpacing:1.5,marginBottom:10,textTransform:"uppercase"}}>Safe by default</div>
      <ul style={{margin:0,padding:"0 0 0 20px",fontSize:13,color:P.txt,fontFamily:ff,lineHeight:1.9}}>
        <li>Every campaign is created <strong>paused</strong>. Nothing serves until you review and unpause in Ads Manager.</li>
        <li>Daily budgets are capped at <strong>R{MAX_DAILY_RAND.toLocaleString()}/day</strong>. Lifetime budgets are capped at R{MAX_DAILY_RAND.toLocaleString()} × campaign duration. The cap is enforced server-side, not just in the UI.</li>
        <li>Only allowlisted ad accounts can be used to create campaigns from this tab.</li>
        <li>An email summary is drafted in Gary's Gmail inbox (when Gmail OAuth is configured) so the team has a record of every campaign created.</li>
      </ul>
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
  return <div style={{marginBottom:18}}>
    <div style={{fontSize:11,fontWeight:700,color:props.P.label||props.P.sub,letterSpacing:1.5,fontFamily:props.fm,textTransform:"uppercase",marginBottom:8}}>{props.label}</div>
    {props.children}
    {props.hint && <div style={{fontSize:11,color:props.P.caption||props.P.sub,fontFamily:props.fm,marginTop:6,lineHeight:1.5}}>{props.hint}</div>}
  </div>;
}
function inputStyle(P, fm, extra) {
  return Object.assign({
    boxSizing: "border-box", width: "100%",
    background: "rgba(20,12,30,0.6)", border: "1px solid " + P.rule,
    borderRadius: 10, padding: "12px 16px", color: P.txt,
    fontSize: 14, fontFamily: fm, outline: "none"
  }, extra || {});
}
function selectStyle(P, fm) { return Object.assign({}, inputStyle(P, fm), { padding: "12px 14px" }); }

// Compute a fixed-position popover anchored to a trigger element. The
// popover escapes any ancestor with overflow:hidden (notably the Glass card
// which clipped the dropdown before this fix), and auto-flips upward when
// there isn't enough space below. Returns a style object to spread onto
// the popover div, or null until the first measurement lands.
//
// IMPORTANT: this hook measures ONCE on open and on window resize — not on
// every scroll. Re-measuring on scroll causes flicker / jitter because each
// measurement is a React re-render. Instead, when the page scrolls outside
// the popover we close it (standard native <select> behaviour). Scroll
// events that originate INSIDE the popover (the user paging through a long
// list) are ignored via the data-popover attribute.
function useAnchoredPopover(triggerRef, open, opts) {
  opts = opts || {};
  var posS = useState(null), pos = posS[0], setPos = posS[1];
  var gap = (typeof opts.gap === "number") ? opts.gap : 6;
  var onClose = opts.onClose;
  useLayoutEffect(function(){
    if (!open) { setPos(null); return; }
    var measure = function(){
      if (!triggerRef.current) return;
      var rect = triggerRef.current.getBoundingClientRect();
      var spaceBelow = window.innerHeight - rect.bottom - 20;
      var spaceAbove = rect.top - 20;
      var openUp = spaceBelow < 220 && spaceAbove > spaceBelow;
      var maxH = Math.max(200, Math.min(480, openUp ? spaceAbove : spaceBelow));
      setPos({
        position: "fixed",
        left: rect.left,
        top: openUp ? null : rect.bottom + gap,
        bottom: openUp ? (window.innerHeight - rect.top + gap) : null,
        width: rect.width,
        maxHeight: maxH
      });
    };
    measure();
    var onResize = function(){ measure(); };
    var onOuterScroll = function(e){
      // Scrolls inside the popover itself shouldn't close it. The popover
      // div carries data-popover="true" so we can detect & ignore them.
      var t = e.target;
      if (t && t.closest && t.closest && t.closest('[data-popover="true"]')) return;
      if (onClose) onClose();
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onOuterScroll, true);
    return function(){
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onOuterScroll, true);
    };
  }, [open]);
  return pos;
}

// Custom Select dropdown — replaces native <select> so we can style the open
// state (native dropdowns inherit OS chrome and ignore most of our CSS, which
// is where the muddy grey came from). Uses fixed positioning so the popover
// can extend past Glass card boundaries; auto-flips upward when needed.
function Select(props) {
  var P = props.P, fm = props.fm;
  var openS = useState(false), open = openS[0], setOpen = openS[1];
  var triggerRef = useRef(null);
  var pos = useAnchoredPopover(triggerRef, open, { gap: 6, onClose: function(){ setOpen(false); } });
  var current = (props.options || []).find(function(o){ return o.value === props.value; });
  var label = current ? current.label : (props.placeholder || "— Choose —");
  var popoverStyle = pos ? Object.assign({}, pos, {
    background: "rgba(15,8,22,0.98)", border: "1px solid " + P.rule,
    borderRadius: 10, overflowY: "auto", zIndex: 1000,
    boxShadow: "0 12px 40px rgba(0,0,0,0.6)"
  }) : null;
  return <div style={{position:"relative"}}>
    <div ref={triggerRef} onClick={function(){ if (!props.disabled) setOpen(!open); }}
      style={Object.assign({}, inputStyle(P, fm), {
        cursor: props.disabled ? "not-allowed" : "pointer",
        opacity: props.disabled ? 0.5 : 1,
        display: "flex", alignItems: "center", justifyContent: "space-between"
      })}>
      <span style={{color: current ? P.txt : (P.label || P.sub), whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>{label}</span>
      <span style={{color: P.label || P.sub, marginLeft: 8, fontSize: 11}}>{open ? "▲" : "▼"}</span>
    </div>
    {open && popoverStyle && <div data-popover="true" style={popoverStyle}>
      {(props.options || []).length === 0 && <div style={{padding:14,fontSize:12,color:P.label||P.sub,fontFamily:fm}}>{props.emptyText || "No options"}</div>}
      {(props.options || []).map(function(o){
        var on = o.value === props.value;
        return <div key={o.value} onClick={function(){ props.onChange(o.value); setOpen(false); }}
          style={{padding:"10px 16px",cursor:"pointer",borderBottom:"1px solid "+P.rule,background:on?P.ember+"15":"transparent",color:on?P.ember:P.txt,fontSize:13,fontFamily:fm,display:"flex",alignItems:"baseline",gap:10}}>
          <div style={{fontWeight:on?800:500,flex:1,minWidth:0,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{o.label}</div>
          {o.sub && <div style={{fontSize:11,color:P.label||P.sub,whiteSpace:"nowrap"}}>{o.sub}</div>}
        </div>;
      })}
    </div>}
    {open && <div onClick={function(){ setOpen(false); }} style={{position:"fixed",inset:0,zIndex:999}}/>}
  </div>;
}

// Custom MultiSelect with optional search — used for countries (where the
// list is long and search-by-name is essential). Selected items render as
// chips above the input. Click chip × to remove.
function MultiSelect(props) {
  var P = props.P, fm = props.fm;
  var openS = useState(false), open = openS[0], setOpen = openS[1];
  var qS = useState(""), q = qS[0], setQ = qS[1];
  var triggerRef = useRef(null);
  var pos = useAnchoredPopover(triggerRef, open, { gap: 6, onClose: function(){ setOpen(false); } });
  var values = props.value || [];
  var options = props.options || [];
  var filtered = q.trim() ? options.filter(function(o){
    return o.label.toLowerCase().indexOf(q.toLowerCase()) >= 0 || o.value.toLowerCase().indexOf(q.toLowerCase()) >= 0;
  }) : options;
  var toggle = function(v){
    var next = values.indexOf(v) >= 0 ? values.filter(function(x){ return x !== v; }) : values.concat([v]);
    props.onChange(next);
  };
  var labelFor = function(v){ var o = options.find(function(x){ return x.value === v; }); return o ? o.label : v; };
  var popoverStyle = pos ? Object.assign({}, pos, {
    background: "rgba(15,8,22,0.98)", border: "1px solid " + P.rule,
    borderRadius: 10, overflowY: "auto", zIndex: 1000,
    boxShadow: "0 12px 40px rgba(0,0,0,0.6)"
  }) : null;
  return <div style={{position:"relative"}}>
    <div ref={triggerRef} onClick={function(){ if (!props.disabled) setOpen(!open); }}
      style={Object.assign({}, inputStyle(P, fm), {
        cursor: props.disabled ? "not-allowed" : "pointer",
        minHeight: 48, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center"
      })}>
      {values.length === 0 && <span style={{color:P.label||P.sub}}>{props.placeholder || "— Choose —"}</span>}
      {values.map(function(v){
        return <span key={v} onClick={function(e){ e.stopPropagation(); toggle(v); }} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"4px 10px",background:P.ember+"20",border:"1px solid "+P.ember+"50",borderRadius:6,fontSize:12,color:P.txt,fontFamily:fm,cursor:"pointer"}}>
          {labelFor(v)} <span style={{color:P.ember,fontWeight:900}}>×</span>
        </span>;
      })}
      <span style={{marginLeft:"auto",color:P.label||P.sub,fontSize:11}}>{open ? "▲" : "▼"}</span>
    </div>
    {open && popoverStyle && <div data-popover="true" style={popoverStyle}>
      {props.searchable && <input value={q} onChange={function(e){ setQ(e.target.value); }} placeholder="Search..." style={Object.assign({}, inputStyle(P, fm), { borderRadius: 0, borderTop: 0, borderLeft: 0, borderRight: 0, borderBottom: "1px solid " + P.rule, position: "sticky", top: 0, zIndex: 1 })}/>}
      {filtered.length === 0 && <div style={{padding:14,fontSize:12,color:P.label||P.sub,fontFamily:fm}}>No matches.</div>}
      {filtered.map(function(o){
        var on = values.indexOf(o.value) >= 0;
        return <div key={o.value} onClick={function(){ toggle(o.value); }}
          style={{padding:"10px 16px",cursor:"pointer",borderBottom:"1px solid "+P.rule,background:on?P.ember+"15":"transparent",color:on?P.ember:P.txt,fontSize:13,fontFamily:fm,display:"flex",justifyContent:"space-between",gap:10}}>
          <span style={{fontWeight:on?700:500}}>{o.label}</span>
          {on && <span style={{color:P.ember,fontWeight:900}}>✓</span>}
        </div>;
      })}
    </div>}
    {open && <div onClick={function(){ setOpen(false); }} style={{position:"fixed",inset:0,zIndex:999}}/>}
  </div>;
}

// ISO 3166-1 alpha-2 country list, alphabetical by name. Used by the country
// MultiSelect on Step 1. Subset of common Meta-supported markets — Meta accepts
// most but a few (sanctioned regions etc.) are excluded server-side anyway.
var COUNTRIES = [
  { value: "AF", label: "Afghanistan" }, { value: "AL", label: "Albania" }, { value: "DZ", label: "Algeria" },
  { value: "AR", label: "Argentina" }, { value: "AU", label: "Australia" }, { value: "AT", label: "Austria" },
  { value: "BD", label: "Bangladesh" }, { value: "BE", label: "Belgium" }, { value: "BR", label: "Brazil" },
  { value: "BG", label: "Bulgaria" }, { value: "CA", label: "Canada" }, { value: "CL", label: "Chile" },
  { value: "CN", label: "China" }, { value: "CO", label: "Colombia" }, { value: "HR", label: "Croatia" },
  { value: "CZ", label: "Czechia" }, { value: "DK", label: "Denmark" }, { value: "EG", label: "Egypt" },
  { value: "EE", label: "Estonia" }, { value: "ET", label: "Ethiopia" }, { value: "FI", label: "Finland" },
  { value: "FR", label: "France" }, { value: "DE", label: "Germany" }, { value: "GH", label: "Ghana" },
  { value: "GR", label: "Greece" }, { value: "HK", label: "Hong Kong" }, { value: "HU", label: "Hungary" },
  { value: "IS", label: "Iceland" }, { value: "IN", label: "India" }, { value: "ID", label: "Indonesia" },
  { value: "IE", label: "Ireland" }, { value: "IL", label: "Israel" }, { value: "IT", label: "Italy" },
  { value: "JP", label: "Japan" }, { value: "KE", label: "Kenya" }, { value: "KR", label: "Korea, South" },
  { value: "LV", label: "Latvia" }, { value: "LT", label: "Lithuania" }, { value: "LU", label: "Luxembourg" },
  { value: "MY", label: "Malaysia" }, { value: "MX", label: "Mexico" }, { value: "MA", label: "Morocco" },
  { value: "MZ", label: "Mozambique" }, { value: "NA", label: "Namibia" }, { value: "NL", label: "Netherlands" },
  { value: "NZ", label: "New Zealand" }, { value: "NG", label: "Nigeria" }, { value: "NO", label: "Norway" },
  { value: "PK", label: "Pakistan" }, { value: "PE", label: "Peru" }, { value: "PH", label: "Philippines" },
  { value: "PL", label: "Poland" }, { value: "PT", label: "Portugal" }, { value: "RO", label: "Romania" },
  { value: "SA", label: "Saudi Arabia" }, { value: "SG", label: "Singapore" }, { value: "SK", label: "Slovakia" },
  { value: "SI", label: "Slovenia" }, { value: "ZA", label: "South Africa" }, { value: "ES", label: "Spain" },
  { value: "SE", label: "Sweden" }, { value: "CH", label: "Switzerland" }, { value: "TW", label: "Taiwan" },
  { value: "TZ", label: "Tanzania" }, { value: "TH", label: "Thailand" }, { value: "TR", label: "Türkiye" },
  { value: "UG", label: "Uganda" }, { value: "UA", label: "Ukraine" }, { value: "AE", label: "United Arab Emirates" },
  { value: "GB", label: "United Kingdom" }, { value: "US", label: "United States" }, { value: "VN", label: "Vietnam" },
  { value: "ZM", label: "Zambia" }, { value: "ZW", label: "Zimbabwe" }
];

// Range helper for age dropdowns (13–65, Meta's hard limits)
function rangeOptions(min, max) {
  var out = [];
  for (var i = min; i <= max; i++) out.push({ value: String(i), label: String(i) });
  return out;
}

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

    {items.length > 0 && <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:14,padding:"14px 16px",background:"rgba(20,12,30,0.4)",border:"1px solid "+P.rule,borderRadius:10,minHeight:80,maxHeight:280,overflowY:"auto"}}>
      {items.map(function(item){
        var color = TARGETING_TYPE_COLORS[item.type] || P.label;
        return <span key={item.type + ":" + item.id} style={{display:"inline-flex",alignItems:"center",gap:8,padding:"6px 12px",border:"1px solid "+color+"50",background:color+"15",borderRadius:8,fontSize:12,color:P.txt,fontFamily:fm}}>
          <span style={{fontSize:9,fontWeight:800,color:color,letterSpacing:1,textTransform:"uppercase"}}>{item.type.replace(/_/g," ")}</span>
          <span>{item.name}</span>
          <span onClick={function(){ props.onRemove(item.id, item.type); }} style={{cursor:"pointer",color:P.label||P.sub,fontWeight:900,marginLeft:2,fontSize:14}}>×</span>
        </span>;
      })}
    </div>}

    {open && <div onClick={function(){ setOpen(false); }} style={{position:"fixed",inset:0,zIndex:40}}/>}
  </div>;
}

// LocationPicker: rich location targeting. Two parallel pickers stacked:
//   - Geographic locations: search-as-you-type across countries, regions,
//     cities, suburbs (subcities), neighborhoods, postal codes. Multi-select
//     chips with country flag prefix where useful.
//   - Proximity radius pins: type an address (or "lat, lng" coordinates),
//     resolve via /api/create/geocode, set a radius (1-80 km), add as a
//     pin. Multiple pins supported — Meta unions them at the adset level.
//
// The combined output is { geographies: [...], customLocations: [...] }
// which the campaign endpoint converts to Meta's geo_locations shape.
function LocationPicker(props) {
  var P = props.P, ff = props.ff, fm = props.fm;
  var apiBase = props.apiBase, token = props.token, accountId = props.accountId;
  var locations = props.locations || { geographies: [], customLocations: [] };

  var addGeography = function(item, asExclude){
    var existing = locations.geographies || [];
    var idx = existing.findIndex(function(x){ return x.key === item.key && x.type === item.type; });
    if (idx >= 0) {
      // Already in the list — flip its exclude flag if the user is adding
      // it from the opposite section (handles the "I want to flip Sandton
      // from include to exclude" workflow without forcing remove + re-add).
      if (existing[idx].exclude !== asExclude) {
        var next = existing.slice();
        next[idx] = Object.assign({}, next[idx], { exclude: asExclude });
        props.onChange({ geographies: next, customLocations: locations.customLocations || [] });
      }
      return;
    }
    props.onChange({
      geographies: existing.concat([Object.assign({}, item, { exclude: !!asExclude })]),
      customLocations: locations.customLocations || []
    });
  };
  var removeGeography = function(key, type){
    props.onChange({
      geographies: (locations.geographies || []).filter(function(x){ return !(x.key === key && x.type === type); }),
      customLocations: locations.customLocations || []
    });
  };
  var addCustom = function(pin){
    props.onChange({
      geographies: locations.geographies || [],
      customLocations: (locations.customLocations || []).concat([Object.assign({}, pin, { exclude: false })])
    });
  };
  var toggleCustomExclude = function(idx){
    var arr = (locations.customLocations || []).map(function(p, i){
      return i === idx ? Object.assign({}, p, { exclude: !p.exclude }) : p;
    });
    props.onChange({ geographies: locations.geographies || [], customLocations: arr });
  };
  var removeCustom = function(idx){
    var arr = (locations.customLocations || []).slice();
    arr.splice(idx, 1);
    props.onChange({
      geographies: locations.geographies || [],
      customLocations: arr
    });
  };

  var includeGeos = (locations.geographies || []).filter(function(g){ return !g.exclude; });
  var excludeGeos = (locations.geographies || []).filter(function(g){ return !!g.exclude; });

  return <div style={{display:"flex",flexDirection:"column",gap:22}}>
    <GeoSearcher P={P} ff={ff} fm={fm} apiBase={apiBase} token={token} accountId={accountId}
      mode="include"
      title="Include these locations"
      placeholder="Search countries, regions, cities, suburbs, postal codes..."
      geographies={includeGeos}
      onAdd={function(item){ addGeography(item, false); }}
      onRemove={removeGeography}/>
    <ProximityPinPicker P={P} ff={ff} fm={fm} apiBase={apiBase} token={token}
      pins={locations.customLocations || []} onAdd={addCustom} onRemove={removeCustom} onToggleExclude={toggleCustomExclude}/>
    <GeoSearcher P={P} ff={ff} fm={fm} apiBase={apiBase} token={token} accountId={accountId}
      mode="exclude"
      title="Exclude these locations"
      hint="Carve out low-value or off-strategy areas from the include set above. Common use: 15 km proximity pin around a store, then exclude two adjacent low-value suburbs from that radius."
      placeholder="Search areas to EXCLUDE — suburbs, postal codes, regions..."
      geographies={excludeGeos}
      onAdd={function(item){ addGeography(item, true); }}
      onRemove={removeGeography}/>
  </div>;
}

var GEO_TYPE_COLORS = {
  country: "#34D399",        // mint
  region: "#22D3EE",         // cyan
  city: "#A855F7",           // orchid
  subcity: "#D946EF",        // fuchsia
  neighborhood: "#FF6B00",   // ember
  zip: "#FFAA00",            // solar
  country_group: "#34D399",
  geo_market: "#22D3EE",
  electoral_district: "#7C3AED"
};
var GEO_TYPE_LABELS = {
  country: "Country", region: "Region", city: "City", subcity: "Suburb",
  neighborhood: "Neighborhood", zip: "Postal", country_group: "Region group",
  geo_market: "DMA", electoral_district: "District"
};

function GeoSearcher(props) {
  var P = props.P, ff = props.ff, fm = props.fm;
  var apiBase = props.apiBase, token = props.token, accountId = props.accountId;
  var isExclude = props.mode === "exclude";
  var sectionAccent = isExclude ? (P.critical || "#ef4444") : (P.cyan || "#22D3EE");
  var qS = useState(""), q = qS[0], setQ = qS[1];
  var rS = useState({ loading: false, items: [], error: "" }), results = rS[0], setResults = rS[1];
  var openS = useState(false), open = openS[0], setOpen = openS[1];
  var debounceRef = useRef(null);

  useEffect(function(){
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q || q.trim().length < 2) { setResults({ loading: false, items: [], error: "" }); return; }
    if (!accountId) { setResults({ loading: false, items: [], error: "Pick an ad account first" }); return; }
    debounceRef.current = setTimeout(function(){
      setResults({ loading: true, items: [], error: "" });
      fetch(apiBase + "/api/create/location-search?accountId=" + encodeURIComponent(accountId) + "&q=" + encodeURIComponent(q), {
        headers: { "Authorization": "Bearer " + token }
      })
        .then(function(r){ return r.json().then(function(d){ return { ok: r.ok, data: d }; }); })
        .then(function(x){
          if (!x.ok) { setResults({ loading: false, items: [], error: (x.data && x.data.error) || "Search failed" }); return; }
          setResults({ loading: false, items: x.data.items || [], error: "" });
        })
        .catch(function(){ setResults({ loading: false, items: [], error: "Network error" }); });
    }, 250);
    return function(){ if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [q, accountId]);

  var sectionTitle = props.title || (isExclude ? "Exclude these locations" : "Geographic locations");
  var placeholderText = props.placeholder || (accountId ? "Search countries, regions, cities, suburbs, postal codes..." : "Pick an ad account first");

  return <div style={{padding:"14px 16px",border:"1px solid "+sectionAccent+"30",background:isExclude?"rgba(239,68,68,0.04)":"rgba(34,211,238,0.04)",borderLeft:"3px solid "+sectionAccent,borderRadius:"0 12px 12px 0"}}>
    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
      <span style={{fontSize:11,fontWeight:800,color:sectionAccent,letterSpacing:1.5,fontFamily:fm,textTransform:"uppercase"}}>{isExclude ? "🚫 " : "✓ "}{sectionTitle}</span>
    </div>
    {props.hint && <div style={{fontSize:11,color:P.caption||P.sub,fontFamily:ff,lineHeight:1.6,marginBottom:10}}>{props.hint}</div>}
    <div style={{position:"relative"}}>
      <input value={q} onChange={function(e){ setQ(e.target.value); setOpen(true); }}
        onFocus={function(){ setOpen(true); }}
        placeholder={placeholderText}
        disabled={!accountId}
        style={inputStyle(P, fm)}/>
      {open && q.trim().length >= 2 && <div style={{position:"absolute",left:0,right:0,top:"100%",marginTop:4,background:"rgba(15,8,22,0.98)",border:"1px solid "+P.rule,borderRadius:10,maxHeight:280,overflowY:"auto",zIndex:50,boxShadow:"0 8px 32px rgba(0,0,0,0.5)"}}>
        {results.loading && <div style={{padding:12,fontSize:11,color:P.label||P.sub,fontFamily:fm}}>Searching...</div>}
        {results.error && <div style={{padding:12,fontSize:11,color:P.critical||"#ef4444",fontFamily:fm}}>{results.error}</div>}
        {!results.loading && !results.error && results.items.length === 0 && <div style={{padding:12,fontSize:11,color:P.label||P.sub,fontFamily:fm}}>No matches.</div>}
        {results.items.map(function(item){
          var color = GEO_TYPE_COLORS[item.type] || P.label;
          var alreadyAdded = (props.geographies || []).some(function(x){ return x.key === item.key && x.type === item.type; });
          var subParts = [GEO_TYPE_LABELS[item.type] || item.type];
          if (item.region) subParts.push(item.region);
          if (item.countryName) subParts.push(item.countryName);
          return <div key={item.type + ":" + item.key} onClick={function(){ if (!alreadyAdded) props.onAdd(item); setOpen(false); setQ(""); }}
            style={{padding:"10px 14px",borderBottom:"1px solid "+P.rule,cursor:alreadyAdded?"default":"pointer",opacity:alreadyAdded?0.5:1,display:"flex",justifyContent:"space-between",gap:10,alignItems:"center"}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:9,fontWeight:800,color:color,letterSpacing:1.5,fontFamily:fm,textTransform:"uppercase"}}>{GEO_TYPE_LABELS[item.type] || item.type}</span>
                <span style={{fontSize:13,fontWeight:700,color:P.txt,fontFamily:ff,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{item.name}</span>
              </div>
              <div style={{fontSize:10,color:P.label||P.sub,fontFamily:fm,marginTop:2}}>{subParts.join(" · ")}</div>
            </div>
            <span style={{fontSize:10,color:sectionAccent,fontFamily:fm,whiteSpace:"nowrap",fontWeight:800,textTransform:"uppercase",letterSpacing:1}}>{alreadyAdded ? "Already in section" : (isExclude ? "Add to exclude" : "Add to include")}</span>
          </div>;
        })}
      </div>}
      {open && <div onClick={function(){ setOpen(false); }} style={{position:"fixed",inset:0,zIndex:40}}/>}
    </div>
    {(props.geographies || []).length > 0 && <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:12,padding:"10px 12px",background:"rgba(20,12,30,0.4)",border:"1px solid "+P.rule,borderRadius:10,minHeight:50,maxHeight:200,overflowY:"auto"}}>
      {props.geographies.map(function(item){
        var typeColor = GEO_TYPE_COLORS[item.type] || P.label;
        var color = isExclude ? sectionAccent : typeColor;
        return <span key={item.type + ":" + item.key} style={{display:"inline-flex",alignItems:"center",gap:8,padding:"6px 12px",border:"1px solid "+color+"50",background:color+"15",borderRadius:8,fontSize:12,color:P.txt,fontFamily:fm}}>
          <span style={{fontSize:9,fontWeight:800,color:color,letterSpacing:1,textTransform:"uppercase"}}>{GEO_TYPE_LABELS[item.type] || item.type}</span>
          <span>{item.name}</span>
          {item.region && <span style={{fontSize:10,color:P.label||P.sub}}>· {item.region}</span>}
          <span onClick={function(){ props.onRemove(item.key, item.type); }} title="Remove" style={{cursor:"pointer",color:P.label||P.sub,fontWeight:900,fontSize:14,marginLeft:2}}>×</span>
        </span>;
      })}
    </div>}
  </div>;
}

function ProximityPinPicker(props) {
  var P = props.P, ff = props.ff, fm = props.fm;
  var apiBase = props.apiBase, token = props.token;
  var qS = useState(""), q = qS[0], setQ = qS[1];
  var rS = useState({ loading: false, results: [], error: "" }), results = rS[0], setResults = rS[1];
  var radiusS = useState(15), radius = radiusS[0], setRadius = radiusS[1];

  var search = function(){
    var query = q.trim();
    if (!query) return;
    setResults({ loading: true, results: [], error: "" });
    // Detect "lat, lng" coordinate paste pattern and skip the geocoder.
    var coordMatch = query.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (coordMatch) {
      var lat = parseFloat(coordMatch[1]), lng = parseFloat(coordMatch[2]);
      setResults({ loading: false, results: [{ lat: lat, lng: lng, displayName: lat.toFixed(5) + ", " + lng.toFixed(5), types: ["coordinates"] }], error: "" });
      return;
    }
    fetch(apiBase + "/api/create/geocode?q=" + encodeURIComponent(query), {
      headers: { "Authorization": "Bearer " + token }
    })
      .then(function(r){ return r.json().then(function(d){ return { ok: r.ok, data: d }; }); })
      .then(function(x){
        if (!x.ok) { setResults({ loading: false, results: [], error: (x.data && x.data.error) || "Geocode failed" }); return; }
        setResults({ loading: false, results: x.data.results || [], error: "" });
      })
      .catch(function(){ setResults({ loading: false, results: [], error: "Network error" }); });
  };

  var addPin = function(r){
    props.onAdd({
      lat: r.lat, lng: r.lng,
      radius: radius, unit: "kilometer",
      addressString: r.displayName,
      label: r.displayName
    });
    setQ(""); setResults({ loading: false, results: [], error: "" });
  };

  return <div>
    <div style={{fontSize:11,fontWeight:800,color:P.label||P.sub,letterSpacing:1.5,fontFamily:fm,textTransform:"uppercase",marginBottom:8}}>Proximity radius (pins)</div>
    <div style={{fontSize:11,color:P.caption||P.sub,fontFamily:ff,lineHeight:1.6,marginBottom:10}}>
      Type a store address, suburb, or "latitude, longitude" coordinates. Pick a result, set the radius, click Add. Each pin is independent — Meta will serve in any of the radii you add.
    </div>
    <div style={{display:"flex",gap:8,marginBottom:10}}>
      <input value={q} onChange={function(e){ setQ(e.target.value); }}
        onKeyDown={function(e){ if (e.key === "Enter") { e.preventDefault(); search(); } }}
        placeholder='e.g. "47 Sandton Drive, Sandton" or "-26.1076, 28.0567"'
        style={Object.assign({}, inputStyle(P, fm), { flex: 1 })}/>
      <input type="number" min={1} max={80} value={radius}
        onChange={function(e){ var v = parseInt(e.target.value, 10); if (!isFinite(v)) v = 15; setRadius(Math.min(80, Math.max(1, v))); }}
        style={Object.assign({}, inputStyle(P, fm), { width: 80, textAlign: "center" })}/>
      <span style={{alignSelf:"center",color:P.label||P.sub,fontSize:11,fontFamily:fm}}>km</span>
      <button onClick={search} disabled={!q.trim() || results.loading}
        style={{background:!q.trim()||results.loading?P.dim:"linear-gradient(135deg,#FF3D00,#FF6B00)",border:"none",borderRadius:10,padding:"0 22px",color:"#fff",fontSize:12,fontWeight:800,fontFamily:fm,letterSpacing:1.5,cursor:!q.trim()||results.loading?"default":"pointer"}}>
        {results.loading ? "Searching..." : "Find"}
      </button>
    </div>
    {results.error && <div style={{fontSize:11,color:P.critical||"#ef4444",fontFamily:fm,marginBottom:8}}>{results.error}</div>}
    {results.results.length > 0 && <div style={{marginBottom:10,padding:"10px 12px",background:"rgba(20,12,30,0.5)",border:"1px solid "+P.rule,borderRadius:10}}>
      {results.results.map(function(r, i){
        return <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,padding:"8px 4px",borderBottom: i < results.results.length - 1 ? "1px solid " + P.rule : "none"}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:13,color:P.txt,fontFamily:ff,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{r.displayName}</div>
            <div style={{fontSize:10,color:P.label||P.sub,fontFamily:fm,marginTop:2}}>{r.lat.toFixed(5)}, {r.lng.toFixed(5)}</div>
          </div>
          <button onClick={function(){ addPin(r); }} style={{background:P.ember+"20",border:"1px solid "+P.ember+"50",borderRadius:8,padding:"6px 14px",color:P.ember,fontSize:11,fontWeight:800,fontFamily:fm,cursor:"pointer",letterSpacing:1.2,textTransform:"uppercase",whiteSpace:"nowrap"}}>
            Add {radius}km
          </button>
        </div>;
      })}
    </div>}
    {(props.pins || []).length > 0 && <div style={{display:"flex",flexDirection:"column",gap:8}}>
      {props.pins.map(function(p, idx){
        var excluded = !!p.exclude;
        var c = excluded ? (P.critical || "#ef4444") : P.ember;
        return <div key={idx} style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,padding:"10px 14px",border:"1px solid "+c+"40",background:c+"10",borderRadius:10}}>
          <div style={{flex:1,minWidth:0,textDecoration:excluded?"line-through":"none"}}>
            <div style={{fontSize:13,fontWeight:700,color:P.txt,fontFamily:ff,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{excluded ? "🚫" : "📍"} {p.label || p.addressString}</div>
            <div style={{fontSize:11,color:P.label||P.sub,fontFamily:fm,marginTop:2}}>
              {excluded ? "EXCLUDED · " : ""}{p.radius} {p.unit === "mile" ? "mi" : "km"} radius · {parseFloat(p.lat).toFixed(5)}, {parseFloat(p.lng).toFixed(5)}
            </div>
          </div>
          <span onClick={function(){ props.onToggleExclude(idx); }} title={excluded ? "Re-include" : "Exclude this radius"} style={{cursor:"pointer",color:c,fontWeight:900,fontSize:11,padding:"4px 10px",border:"1px solid "+c+"50",borderRadius:6,letterSpacing:1,textTransform:"uppercase"}}>
            {excluded ? "Include" : "Exclude"}
          </span>
          <span onClick={function(){ props.onRemove(idx); }} style={{cursor:"pointer",color:P.critical||"#ef4444",fontWeight:900,fontSize:18,padding:"0 6px"}}>×</span>
        </div>;
      })}
    </div>}
  </div>;
}

// AudienceSuggester: natural-language audience description → Claude generates
// candidate Meta targeting terms → server resolves each to a real Meta ID via
// targetingsearch → wizard shows suggestions with Add buttons. Eliminates the
// "I don't know what to type into the targeting search" cold start.
function AudienceSuggester(props) {
  var P = props.P, ff = props.ff, fm = props.fm;
  var apiBase = props.apiBase, token = props.token, accountId = props.accountId;
  var dS = useState(""), description = dS[0], setDescription = dS[1];
  var lS = useState(false), loading = lS[0], setLoading = lS[1];
  var sS = useState([]), suggestions = sS[0], setSuggestions = sS[1];
  var eS = useState(""), err = eS[0], setErr = eS[1];

  var run = function(){
    if (loading || !description.trim() || !accountId) return;
    setLoading(true); setErr(""); setSuggestions([]);
    fetch(apiBase + "/api/create/audience-suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
      body: JSON.stringify({
        accountId: accountId,
        description: description.trim(),
        ageMin: props.ageMin, ageMax: props.ageMax,
        countries: props.countries
      })
    })
      .then(function(r){ return r.json().then(function(d){ return { ok: r.ok, data: d }; }); })
      .then(function(x){
        setLoading(false);
        if (!x.ok) { setErr((x.data && x.data.error) || "Suggestion failed"); return; }
        setSuggestions(x.data.suggestions || []);
      })
      .catch(function(){ setLoading(false); setErr("Network error"); });
  };

  var alreadyAdded = function(s){ return (props.existingItems || []).some(function(x){ return x.id === s.id && x.type === s.type; }); };

  return <div>
    <div style={{display:"flex",gap:10}}>
      <textarea value={description} onChange={function(e){ setDescription(e.target.value); }}
        placeholder="e.g. Small business owners in Cape Town who use accounting software, decision-makers, ages 30-50"
        style={Object.assign({}, inputStyle(P, fm), { minHeight: 64, flex: 1, fontSize: 13 })}/>
      <button onClick={run} disabled={loading || !description.trim() || !accountId}
        style={{background:loading||!description.trim()||!accountId?P.dim:"linear-gradient(135deg,#A855F7,#7C3AED)",border:"none",borderRadius:10,padding:"0 24px",color:"#fff",fontSize:12,fontWeight:800,fontFamily:fm,letterSpacing:1.5,cursor:loading||!description.trim()||!accountId?"default":"pointer",whiteSpace:"nowrap"}}>
        {loading ? "Thinking..." : "Suggest targeting"}
      </button>
    </div>
    {err && <div style={{fontSize:11,color:P.critical||"#ef4444",fontFamily:fm,marginTop:8}}>{err}</div>}
    {suggestions.length > 0 && <div style={{marginTop:14,padding:"14px 16px",background:"rgba(168,85,247,0.06)",border:"1px solid "+P.orchid+"30",borderRadius:10}}>
      <div style={{fontSize:11,fontWeight:800,color:P.orchid,letterSpacing:1.5,textTransform:"uppercase",fontFamily:fm,marginBottom:10}}>{suggestions.length} suggestions</div>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {suggestions.map(function(s){
          var color = TARGETING_TYPE_COLORS[s.type] || P.label;
          var added = alreadyAdded(s);
          return <div key={s.type + ":" + s.id} style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,padding:"10px 14px",background:"rgba(15,8,22,0.6)",border:"1px solid "+P.rule,borderRadius:8}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                <span style={{fontSize:9,fontWeight:800,color:color,letterSpacing:1.2,textTransform:"uppercase",fontFamily:fm}}>{s.type.replace(/_/g," ")}</span>
                <span style={{fontSize:13,fontWeight:700,color:P.txt,fontFamily:ff}}>{s.name}</span>
              </div>
              {s.reason && <div style={{fontSize:11,color:P.label||P.sub,fontFamily:ff,lineHeight:1.5}}>{s.reason}</div>}
              {(s.audienceSizeLower || s.audienceSizeUpper) && <div style={{fontSize:10,color:P.caption||P.sub,fontFamily:fm,marginTop:3}}>
                {(function(){
                  var lo = s.audienceSizeLower || 0, hi = s.audienceSizeUpper || 0;
                  var fmt = function(n){ if (n >= 1e6) return (n/1e6).toFixed(1)+"M"; if (n >= 1e3) return (n/1e3).toFixed(0)+"K"; return String(n); };
                  return lo && hi ? (fmt(lo) + " – " + fmt(hi) + " people") : (fmt(hi || lo) + " people");
                })()}
              </div>}
            </div>
            <button onClick={function(){ if (!added) props.onAdd(s); }} disabled={added}
              style={{background:added?"transparent":P.orchid+"20",border:"1px solid "+(added?P.rule:P.orchid+"60"),borderRadius:8,padding:"6px 14px",color:added?(P.label||P.sub):P.orchid,fontSize:11,fontWeight:700,fontFamily:fm,cursor:added?"default":"pointer",letterSpacing:1.2,textTransform:"uppercase",whiteSpace:"nowrap"}}>
              {added ? "Added" : "Add"}
            </button>
          </div>;
        })}
      </div>
    </div>}
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
