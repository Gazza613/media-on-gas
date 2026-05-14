// Create tab, PIN gate + 7-step Meta campaign wizard.
//
// Naming, budget, audience and creative authoring are all shaped by the
// agency's house standard:
//
//   Campaign:  {Client}_{Objective}_{Funding}_{Period}_{Variant}
//   Ad Set:    {Audience}_{Geo}_{Demo}_{Placement}
//   Ad:        {Format}_{Concept}_{Version}
//
// Most parts auto-derive from wizard state (objective code, funding source,
// period, demo, placement, format) so the team only types the differentiating
// bits (client code, variant, audience label, concept, version).
//
// State lives in this component. On submit, the wizard POSTs to
// /api/create/campaign and renders a success screen with the campaign id +
// Ads Manager link. Server is the authority on PAUSED + budget ceiling +
// allowlist; the UI mirrors those for nice errors.

import { useState, useEffect, useLayoutEffect, useRef } from "react";

var TOKEN_KEY = "gas_create_token";
var TOKEN_EXP_KEY = "gas_create_token_exp";
var DRAFT_KEY = "gas_create_draft_v2";
var STEP_KEY = "gas_create_step_v2";
var MAX_DAILY_RAND = 5000;

// Draft persistence: stash to sessionStorage on every change so a token
// expiry / accidental reload / re-auth doesn't blow away N minutes of
// wizard work. Image preview data URLs are stripped before saving (they
// can be megabytes). Hash/id references survive so the user keeps their
// actual upload, only losing the preview thumbnail until they re-upload.
function stripDraftForPersist(d) {
  if (!d || !Array.isArray(d.creatives)) return d;
  var creatives = d.creatives.map(function(c){
    return Object.assign({}, c, { previewDataUrl: null });
  });
  return Object.assign({}, d, { creatives: creatives });
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

// `naming` is the human-readable token that flows into the Meta
// campaign / ad-set / ad name. Stays separate from `code` so the
// internal short-form (LDS / ENG / TRF) is still available wherever
// the dashboard needs a compact identifier.
var OBJECTIVES = [
  { id: "OUTCOME_TRAFFIC",        label: "Traffic",        sub: "Drive clicks to a landing page",   code: "TRF", naming: "Traffic" },
  { id: "OUTCOME_ENGAGEMENT",     label: "Engagement",     sub: "Likes, comments, post engagement", code: "ENG", naming: "Like&Follow" },
  { id: "OUTCOME_LEADS",          label: "Leads",          sub: "Lead form or landing page leads",  code: "LDS", naming: "Leads" },
  { id: "OUTCOME_AWARENESS",      label: "Awareness",      sub: "Reach + impression coverage",      code: "AWR", naming: "Awareness" },
  { id: "OUTCOME_SALES",          label: "Sales",          sub: "Pixel conversions, requires pixel",code: "SLS", naming: "Sales" },
  { id: "OUTCOME_APP_PROMOTION",  label: "App Promotion",  sub: "App installs, requires app store URL", code: "APP", naming: "AppInstall" }
];

var CTAS = [
  "LEARN_MORE","SHOP_NOW","SIGN_UP","SUBSCRIBE","DOWNLOAD","BOOK_TRAVEL",
  "CONTACT_US","GET_QUOTE","GET_OFFER","APPLY_NOW","ORDER_NOW","WATCH_MORE"
];

export default function CreateTab(props) {
  var P = props.P, ff = props.ff, fm = props.fm;
  var Ic = props.Ic, Glass = props.Glass, SH = props.SH, gFire = props.gFire, gEmber = props.gEmber;
  var apiBase = props.apiBase || "";

  var ts = useState(null);
  var token = ts[0], setToken = ts[1];
  var expS = useState(0);
  var exp = expS[0], setExp = expS[1];

  // One-time cleanup of any leftover legacy create-tab tokens or v1 drafts.
  useEffect(function(){
    try {
      sessionStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(TOKEN_EXP_KEY);
      sessionStorage.removeItem("gas_create_draft"); sessionStorage.removeItem("gas_create_step");
    } catch (_) {}
  }, []);

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
  "Review & Launch"
];

function Wizard(props) {
  var P = props.P, ff = props.ff, fm = props.fm, Ic = props.Ic, Glass = props.Glass, SH = props.SH;
  var apiBase = props.apiBase, token = props.token;

  var subS = useState(false), submitting = subS[0], setSubmitting = subS[1];
  var resS = useState(null), result = resS[0], setResult = resS[1];
  var errS = useState(null), submitErr = errS[0], setSubmitErr = errS[1];
  // Pre-flight (validate-only) state. Distinct from submit/submitErr
  // so the team can validate, fix, validate again without losing the
  // success banner from a prior real submit.
  var valS = useState({ loading: false, ok: null, message: "", errors: [] }), validateState = valS[0], setValidateState = valS[1];

  // -------- Wizard state ---------------------------------------------------
  var initial = {
    accountId: "", accountName: "",
    objective: "OUTCOME_TRAFFIC",
    specialAdCategories: [],

    // Naming convention parts
    clientCode: "", variant: "",

    platformMode: "fb_ig",
    pageId: "", pageName: "", instagramId: "",

    audience: {
      locations: {
        geographies: [{ key: "ZA", type: "country", name: "South Africa", countryCode: "ZA", countryName: "South Africa" }],
        customLocations: []
      },
      ageMin: 18, ageMax: 65, genders: [], advantageAudience: false,
      targetingItems: [], flexibleSpec: null,
      savedAudienceIds: [], customAudienceIds: [],
      targetCommunity: { fans: false, igFollowers: false },
      audienceLabel: ""
    },

    placement: {
      mode: "advantage",
      platforms: ["facebook","instagram"],
      facebookPositions: ["feed"],
      instagramPositions: ["stream","story","reels"],
      devicePlatforms: ["mobile","desktop"]
    },

    // Creative is now an array. creativeMode = "single" | "multi" | "carousel"
    creativeMode: "single",
    multiAdvertiserAds: false,
    creatives: [emptyCreative()],
    // When 2+ distinct ratios are uploaded in the same batch, the team
    // can opt into one campaign per ratio (cleaner per-format
    // reporting + better Meta optimization). Default off so existing
    // single-campaign behaviour is preserved.
    autoSplitByRatio: false,

    // Budget
    funding: "ABO",       // CBO | ABO
    budgetMode: "daily",
    dailyBudgetRand: 200, lifetimeBudgetRand: 5000,

    startDate: todayIso(), endDate: addDaysIso(7),
    pixelId: "", conversionEvent: "PURCHASE", urlTags: ""
  };
  var ds = useState(function(){ return readSavedDraft(initial); }), draft = ds[0], setDraft = ds[1];
  var ss = useState(function(){ return readSavedStep(); }), step = ss[0], setStep = ss[1];
  var update = function(patch){ setDraft(function(d){ return Object.assign({}, d, patch); }); };
  var updateNested = function(key, patch){ setDraft(function(d){ var v = Object.assign({}, d[key], patch); var out = {}; out[key] = v; return Object.assign({}, d, out); }); };
  var updateCreative = function(idx, patch){
    setDraft(function(d){
      var arr = (d.creatives || []).slice();
      arr[idx] = Object.assign({}, arr[idx] || emptyCreative(), patch);
      return Object.assign({}, d, { creatives: arr });
    });
  };

  useEffect(function(){
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(stripDraftForPersist(draft))); } catch (_) {}
  }, [draft]);
  useEffect(function(){
    try { sessionStorage.setItem(STEP_KEY, String(step)); } catch (_) {}
    // Scroll the page back to the top whenever the step changes so the team
    // lands on the new step's heading instead of being mid-way down the
    // previous step's form. Smooth-scroll for a less jarring transition.
    try {
      window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
    } catch (_) {
      window.scrollTo(0, 0);
    }
  }, [step]);

  // -------- Reference data (fetched per-account) ---------------------------
  var accS = useState({ loading: true, items: [], error: "" }), accounts = accS[0], setAccounts = accS[1];
  var pgS = useState({ loading: false, items: [], error: "" }), pages = pgS[0], setPages = pgS[1];
  var igS = useState({ loading: false, items: [], error: "" }), instagrams = igS[0], setInstagrams = igS[1];
  var pxS = useState({ loading: false, items: [], error: "" }), pixels = pxS[0], setPixels = pxS[1];
  var saS = useState({ loading: false, items: [], error: "" }), savedAudiences = saS[0], setSavedAudiences = saS[1];

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
    setSavedAudiences({ loading: true, items: [], error: "" });

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

    authedFetch("/api/create/saved-audiences?accountId=" + encodeURIComponent(draft.accountId))
      .then(function(r){ return r.json(); })
      .then(function(d){ setSavedAudiences({ loading: false, items: d.items || [], error: d.error || "" }); })
      .catch(function(){ setSavedAudiences({ loading: false, items: [], error: "Network error" }); });
  }, [draft.accountId]);

  // Sync pageName when pageId changes (used in name generation as a fallback)
  useEffect(function(){
    if (!draft.pageId) return;
    var match = (pages.items || []).find(function(p){ return p.pageId === draft.pageId; });
    if (match && match.name && match.name !== draft.pageName) update({ pageName: match.name });
  }, [draft.pageId, pages.items]);

  // -------- Generated names (live preview + submit payload) ----------------
  var generatedCampaignName = composeCampaignName(draft);
  var generatedAdsetName = composeAdsetName(draft);

  // -------- Per-step validation gates --------------------------------------
  var canAdvance = (function(){
    if (step === 0) {
      return !!draft.accountId && !!draft.objective && !!draft.platformMode &&
             draft.clientCode.trim().length >= 2 && generatedCampaignName.length >= 6;
    }
    if (step === 1) {
      var demoOk = draft.audience.ageMin >= 13 && draft.audience.ageMax <= 65 && draft.audience.ageMin < draft.audience.ageMax;
      return demoOk && draft.audience.audienceLabel.trim().length >= 2;
    }
    if (step === 2) return draft.placement.mode === "advantage" || ((draft.placement.platforms || []).length > 0);
    if (step === 3) {
      var igRequired = draft.platformMode === "fb_ig" || draft.platformMode === "ig_only";
      if (!draft.pageId) return false;
      if (igRequired && !draft.instagramId) return false;
      var creatives = draft.creatives || [];
      if (creatives.length === 0) return false;
      if (draft.creativeMode === "carousel" && creatives.length < 2) return false;
      // Each creative needs an uploaded asset + headline + primary text + URL
      // + the name parts that drive composeAdName. Under the new naming
      // convention the required parts are assetName and productAction; the
      // legacy concept/version fields are still accepted as fallbacks.
      // Carousel cards share primaryText (creatives[0]) but each card needs
      // image_hash + headline + URL.
      for (var i = 0; i < creatives.length; i++) {
        var c = creatives[i];
        if (!(c.imageHash || c.videoId)) return false;
        if (!c.headline.trim()) return false;
        if (!c.linkUrl.trim()) return false;
        var assetOk = (c.assetName && c.assetName.trim()) || (c.concept && c.concept.trim());
        var actionOk = (c.productAction && c.productAction.trim()) || (c.concept && c.concept.trim());
        if (!assetOk || !actionOk) return false;
        if (draft.creativeMode !== "carousel" && !c.primaryText.trim()) return false;
      }
      // Single-mode carousel/single use creatives[0].primaryText as the text.
      if (draft.creativeMode === "carousel" && !creatives[0].primaryText.trim()) return false;
      return true;
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
  // Builds a payload for a given subset of creatives + an optional
  // ratio suffix on the productName. When the suffix is set the
  // campaign/ad-set names are rebuilt off a draft snapshot whose
  // productName has the ratio appended, e.g. "MoMoDeals-9x16".
  // Returns { payload, campaignName, adsetName, nameErrors }.
  var buildPayloadForBucket = function(bucketCreatives, ratioSuffix){
    var bucketDraft = draft;
    if (ratioSuffix) {
      var origProduct = draft.productName || draft.variant || "";
      bucketDraft = Object.assign({}, draft, {
        productName: origProduct + "-" + ratioSuffix,
        creatives: bucketCreatives
      });
    } else {
      bucketDraft = Object.assign({}, draft, { creatives: bucketCreatives });
    }
    var cName = composeCampaignName(bucketDraft);
    var aName = composeAdsetName(bucketDraft);
    var nameErrors = validateNamingConvention(bucketDraft, cName, aName, bucketCreatives);

    var creativesPayload = bucketCreatives.map(function(c, idx){
      var adName = composeAdName(c, idx, bucketDraft);
      return {
        imageHash: c.imageHash || null,
        videoId: c.videoId || null,
        headline: c.headline,
        primaryText: c.primaryText,
        description: c.description,
        linkUrl: c.linkUrl,
        callToAction: c.callToAction,
        adName: adName
      };
    });

    var payload = {
      accountId: draft.accountId,
      accountName: draft.accountName,
      objective: draft.objective,
      specialAdCategories: draft.specialAdCategories,
      campaignName: cName,
      adsetName: aName,
      platformMode: draft.platformMode,
      pageId: draft.pageId,
      instagramId: draft.instagramId || null,
      audience: draft.audience,
      placement: draft.placement,
      creativeMode: draft.creativeMode,
      multiAdvertiserAds: draft.multiAdvertiserAds === true,
      creatives: creativesPayload,
      funding: draft.funding,
      budgetMode: draft.budgetMode,
      dailyBudgetCents: draft.budgetMode === "daily" ? Math.round(draft.dailyBudgetRand * 100) : 0,
      lifetimeBudgetCents: draft.budgetMode === "lifetime" ? Math.round(draft.lifetimeBudgetRand * 100) : 0,
      startDate: draft.startDate,
      endDate: draft.endDate || null,
      pixelId: draft.pixelId || null,
      conversionEvent: draft.conversionEvent || null,
      urlTags: draft.urlTags || null
    };
    return { payload: payload, campaignName: cName, adsetName: aName, nameErrors: nameErrors };
  };

  var postCampaign = function(payload){
    return fetch(apiBase + "/api/create/campaign", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
      body: JSON.stringify(payload)
    }).then(function(r){ return r.json().then(function(d){ return { ok: r.ok, status: r.status, data: d }; }); });
  };

  // Pre-flight validate-only. Runs the naming-convention regex first
  // (cheap, local), then asks Meta to validate just the campaign-level
  // configuration via execution_options=["validate_only"]. Reach +
  // audience targeting are covered separately by the ReachPreview panel
  // (delivery_estimate) on the same Step 6 screen.
  var validate = function(){
    if (validateState.loading) return;

    var creativesAll = (draft.creatives || []);
    var buckets = ratioBuckets(creativesAll);
    var bucketRatios = Object.keys(buckets).filter(function(r){ return r && buckets[r].length > 0; });
    var doSplit = draft.autoSplitByRatio && bucketRatios.length >= 2 && draft.creativeMode !== "carousel";
    var jobs = doSplit
      ? bucketRatios.sort().map(function(r){ return Object.assign({ ratio: r }, buildPayloadForBucket(buckets[r], r)); })
      : [Object.assign({ ratio: null }, buildPayloadForBucket(creativesAll, null))];

    var nameErrors = [];
    jobs.forEach(function(j){
      (j.nameErrors || []).forEach(function(e){
        nameErrors.push((j.ratio ? "[" + j.ratio + "] " : "") + e);
      });
    });
    if (nameErrors.length > 0) {
      setValidateState({ loading: false, ok: false, message: "Naming convention violations", errors: nameErrors });
      return;
    }

    setValidateState({ loading: true, ok: null, message: "", errors: [] });
    // Validate each bucket sequentially; first failure stops the run.
    var idx = 0;
    var firstFail = null;
    var oks = [];
    var runNext = function(){
      if (idx >= jobs.length || firstFail) {
        if (firstFail) {
          setValidateState({ loading: false, ok: false, message: "Meta rejected the configuration", errors: firstFail.errors });
          return;
        }
        var msg = doSplit
          ? "All " + jobs.length + " ratio buckets validated by Meta — safe to launch."
          : "Validated by Meta — safe to launch.";
        setValidateState({ loading: false, ok: true, message: msg, errors: [] });
        return;
      }
      var p = jobs[idx].payload;
      fetch(apiBase + "/api/create/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
        body: JSON.stringify(p)
      })
        .then(function(r){ return r.json().then(function(d){ return { ok: r.ok, data: d }; }); })
        .then(function(x){
          if (!x.ok) { firstFail = { errors: [(x.data && x.data.error) || "Validate failed"] }; idx = jobs.length; runNext(); return; }
          if (x.data && x.data.ok === false) {
            var errs = x.data.errors || ["Meta returned an error"];
            firstFail = { errors: (jobs[idx].ratio ? errs.map(function(e){ return "[" + jobs[idx].ratio + "] " + e; }) : errs) };
            idx = jobs.length; runNext(); return;
          }
          oks.push(jobs[idx].ratio || "single");
          idx++; runNext();
        })
        .catch(function(){ firstFail = { errors: ["Network error during validate"] }; idx = jobs.length; runNext(); });
    };
    runNext();
  };

  var submit = function(){
    if (submitting) return;

    var creativesAll = (draft.creatives || []);
    var buckets = ratioBuckets(creativesAll);
    var bucketRatios = Object.keys(buckets).filter(function(r){ return r && buckets[r].length > 0; });
    var doSplit = draft.autoSplitByRatio && bucketRatios.length >= 2 && draft.creativeMode !== "carousel";

    // Build all payloads first so we can run the naming gate across
    // every campaign/ad-set/ad in the run before firing any network.
    var jobs = doSplit
      ? bucketRatios.sort().map(function(r){ return Object.assign({ ratio: r }, buildPayloadForBucket(buckets[r], r)); })
      : [Object.assign({ ratio: null }, buildPayloadForBucket(creativesAll, null))];

    var allNameErrors = [];
    jobs.forEach(function(j){
      (j.nameErrors || []).forEach(function(e){
        allNameErrors.push((j.ratio ? "[" + j.ratio + "] " : "") + e);
      });
    });
    if (allNameErrors.length > 0) {
      setSubmitErr({ status: 0, body: { error: "Naming convention violations", details: allNameErrors } });
      return;
    }

    setSubmitting(true); setSubmitErr(null);

    // Sequential so partial-failure state is clear: if job #3 fails,
    // jobs #1 and #2 are already live in Meta. Backend create endpoint
    // already leaves partial state PAUSED on failure for recovery.
    var idx = 0;
    var collected = [];
    var failed = null;
    var runNext = function(){
      if (idx >= jobs.length) {
        setSubmitting(false);
        if (failed) {
          setSubmitErr({
            status: failed.status,
            body: Object.assign({}, failed.data || {}, {
              error: failed.data && failed.data.error ? failed.data.error : "Submit failed",
              details: collected.length > 0
                ? ["Succeeded: " + collected.map(function(s){ return s.campaignName; }).join(", ")].concat(failed.data && failed.data.details ? failed.data.details : [])
                : undefined
            })
          });
          return;
        }
        clearSavedDraft();
        // For split, surface a combined result; otherwise pass through
        // the single-call response shape so the existing success UI
        // works unchanged.
        if (doSplit) {
          setResult({
            split: true,
            ratios: bucketRatios,
            campaigns: collected
          });
        } else {
          setResult(collected[0].data);
        }
        return;
      }
      var job = jobs[idx];
      postCampaign(job.payload).then(function(x){
        if (x.status === 401) { setSubmitting(false); props.onLogout(); return; }
        if (!x.ok) {
          failed = { status: x.status, data: x.data, ratio: job.ratio };
          idx = jobs.length; // stop further attempts
          runNext();
          return;
        }
        collected.push({ ratio: job.ratio, campaignName: job.campaignName, data: x.data });
        idx++;
        runNext();
      }).catch(function(){
        failed = { status: 0, data: { error: "Network error. Try again." }, ratio: job.ratio };
        idx = jobs.length;
        runNext();
      });
    };
    runNext();
  };

  // -------- Result screen --------------------------------------------------
  if (result) return <SuccessScreen P={P} ff={ff} fm={fm} Ic={Ic} Glass={Glass} result={result}
    onAnother={function(){ clearSavedDraft(); setResult(null); setStep(0); setDraft(initial); setSubmitErr(null); }}/>;

  // -------- Render ---------------------------------------------------------
  return <div>
    <SH icon={Ic.fire(P.ember,20)} title="Create Campaign" sub={"Step " + (step+1) + " of 7, " + STEP_LABELS[step] + ", PIN-gated, R5,000/day max, all campaigns paused"} accent={P.ember}/>

    <Stepper P={P} fm={fm} Ic={Ic} step={step} onJump={function(target){
      if (target <= step) setStep(target);
    }}/>

    <div style={{marginTop:20}}>
      {step === 0 && <Step0 P={P} ff={ff} fm={fm} Ic={Ic} Glass={Glass}
        apiBase={apiBase} token={token}
        draft={draft} update={update} accounts={accounts}
        generatedCampaignName={generatedCampaignName}/>}
      {step === 1 && <Step1 P={P} ff={ff} fm={fm} Ic={Ic} Glass={Glass}
        apiBase={apiBase} token={token}
        draft={draft} update={update} updateNested={updateNested}
        savedAudiences={savedAudiences} pages={pages} instagrams={instagrams}
        generatedAdsetName={generatedAdsetName}/>}
      {step === 2 && <Step2 P={P} ff={ff} fm={fm} Glass={Glass}
        draft={draft} updateNested={updateNested}
        generatedAdsetName={generatedAdsetName}/>}
      {step === 3 && <Step3 P={P} ff={ff} fm={fm} Ic={Ic} Glass={Glass}
        apiBase={apiBase} token={token} draft={draft} update={update}
        updateNested={updateNested} updateCreative={updateCreative}
        pages={pages} instagrams={instagrams}/>}
      {step === 4 && <Step4 P={P} ff={ff} fm={fm} Ic={Ic} Glass={Glass}
        draft={draft} update={update}
        generatedCampaignName={generatedCampaignName}
        generatedAdsetName={generatedAdsetName}/>}
      {step === 5 && <Step5 P={P} ff={ff} fm={fm} Glass={Glass}
        apiBase={apiBase} token={token}
        draft={draft} update={update} pixels={pixels}/>}
      {step === 6 && <Step6 P={P} ff={ff} fm={fm} Ic={Ic} Glass={Glass}
        apiBase={apiBase} token={token}
        draft={draft} accounts={accounts} pages={pages} instagrams={instagrams} pixels={pixels}
        savedAudiences={savedAudiences}
        generatedCampaignName={generatedCampaignName}
        generatedAdsetName={generatedAdsetName}/>}
    </div>

    {submitErr && <div style={{marginTop:18,padding:"14px 18px",background:(P.critical||"#ef4444")+"12",border:"1px solid "+(P.critical||"#ef4444")+"40",borderRadius:10,color:P.critical||"#ef4444",fontSize:12,fontFamily:fm,lineHeight:1.6}}>
      <div style={{fontWeight:800,letterSpacing:1.5,textTransform:"uppercase",fontSize:10,marginBottom:8}}>{submitErr.status > 0 ? ("Create failed (HTTP " + submitErr.status + ")") : "Submit blocked"}</div>
      <div style={{color:P.txt,marginBottom:8}}>{submitErr.body && submitErr.body.error}</div>
      {submitErr.body && Array.isArray(submitErr.body.details) && submitErr.body.details.length > 0 && <ul style={{margin:"0 0 10px",padding:"0 0 0 18px",color:P.txt}}>
        {submitErr.body.details.map(function(d, i){
          return <li key={i} style={{margin:"4px 0",fontSize:11,fontFamily:fm,color:P.txt}}>{d}</li>;
        })}
      </ul>}
      {submitErr.body && submitErr.body.partial && <div style={{color:P.warning||"#fbbf24",marginBottom:8,fontSize:11}}>
        Partial state created and left PAUSED: {Object.keys(submitErr.body.partial).map(function(k){return k+"="+JSON.stringify(submitErr.body.partial[k]);}).join(", ")}
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
          style={{background:canAdvance?"linear-gradient(135deg,#FF3D00,#FF6B00)":P.dim,border:"none",borderRadius:10,padding:"10px 26px",color:"#fff",fontSize:12,fontWeight:800,fontFamily:fm,letterSpacing:2,cursor:canAdvance?"pointer":"default",boxShadow:canAdvance?"0 6px 20px rgba(249,98,3,0.35)":"none"}}>
          Next →
        </button>}
        {step === 6 && <button onClick={validate} disabled={validateState.loading || submitting}
          style={{background:"transparent",border:"1px solid "+P.cyan,borderRadius:10,padding:"10px 22px",color:P.cyan,fontSize:11,fontWeight:800,fontFamily:fm,letterSpacing:2,cursor:(validateState.loading||submitting)?"default":"pointer",textTransform:"uppercase"}}>
          {validateState.loading ? "Validating…" : "Validate first"}
        </button>}
        {step === 6 && <button onClick={submit} disabled={submitting}
          style={{background:submitting?P.dim:"linear-gradient(135deg,#FF3D00,#FF6B00)",border:"none",borderRadius:10,padding:"10px 26px",color:"#fff",fontSize:12,fontWeight:800,fontFamily:fm,letterSpacing:2,cursor:submitting?"default":"pointer",boxShadow:submitting?"none":"0 6px 20px rgba(249,98,3,0.35)"}}>
          {submitting ? "Creating..." : "🚀 Create campaign (PAUSED)"}
        </button>}
      </div>
    </div>
    {step === 6 && (validateState.ok === true || validateState.ok === false) && <div style={{marginTop:14,padding:"12px 16px",background:validateState.ok?(P.mint+"15"):(P.critical||"#ef4444")+"15",border:"1px solid "+(validateState.ok?(P.mint+"40"):(P.critical||"#ef4444")+"40"),borderLeft:"3px solid "+(validateState.ok?P.mint:(P.critical||"#ef4444")),borderRadius:"0 10px 10px 0"}}>
      <div style={{fontSize:11,fontWeight:800,color:validateState.ok?P.mint:(P.critical||"#ef4444"),fontFamily:fm,letterSpacing:1.5,textTransform:"uppercase",marginBottom:6}}>{validateState.ok ? "Validated" : "Validation failed"}</div>
      <div style={{fontSize:12,color:P.txt,fontFamily:fm,lineHeight:1.6}}>{validateState.message}</div>
      {validateState.errors && validateState.errors.length > 0 && <ul style={{margin:"8px 0 0",padding:"0 0 0 18px",color:P.txt}}>
        {validateState.errors.map(function(e, i){ return <li key={i} style={{fontSize:11,fontFamily:fm,margin:"3px 0"}}>{e}</li>; })}
      </ul>}
    </div>}
  </div>;
}

// ---------------------------------------------------------------------------
// Stepper, with numbered icons + glow on active step. Click jumps backward
// only (forward is gated by validation in the wizard).

function Stepper(props) {
  var P = props.P, fm = props.fm, Ic = props.Ic, step = props.step;
  return <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
    {STEP_LABELS.map(function(label, i){
      var done = i < step, active = i === step;
      var bg = active ? "linear-gradient(135deg,#FF3D00,#FF6B00)" : (done ? P.ember + "20" : "transparent");
      var border = active ? "1px solid " + P.ember : (done ? "1px solid " + P.ember + "50" : "1px solid " + P.rule);
      var color = active ? "#fff" : (done ? P.ember : (P.label || P.sub));
      var clickable = i <= step;
      return <div key={label}
        onClick={function(){ if (clickable && props.onJump) props.onJump(i); }}
        style={{
          flex:1,minWidth:140,padding:"12px 12px",
          background:bg,border:border,borderRadius:10,
          fontSize:11,fontWeight:800,color:color,fontFamily:fm,
          letterSpacing:1.5,textTransform:"uppercase",textAlign:"center",
          cursor: clickable ? "pointer" : "default",
          boxShadow: active ? "0 6px 22px rgba(249,98,3,0.35)" : "none",
          display:"flex",alignItems:"center",justifyContent:"center",gap:8,
          transition:"all 0.18s ease"
        }}>
        <span style={{
          width:20,height:20,borderRadius:"50%",
          background: active ? "rgba(255,255,255,0.22)" : (done ? P.ember+"35" : "transparent"),
          border: done ? "1px solid "+P.ember+"60" : (active ? "1px solid rgba(255,255,255,0.35)" : "1px solid "+P.rule),
          display:"flex",alignItems:"center",justifyContent:"center",
          fontSize:10,fontWeight:900,letterSpacing:0
        }}>{done ? "✓" : (i + 1)}</span>
        <span>{label}</span>
      </div>;
    })}
  </div>;
}

// ---------------------------------------------------------------------------
// Live name preview, used at the top of the steps that influence naming.

function NamePreview(props) {
  var P = props.P, fm = props.fm;
  var accent = props.accent || P.ember;
  return <div style={{padding:"12px 16px",background:accent+"08",border:"1px solid "+accent+"30",borderLeft:"3px solid "+accent,borderRadius:"0 12px 12px 0",marginBottom:18}}>
    <div style={{fontSize:9,fontWeight:800,color:accent,letterSpacing:2,fontFamily:fm,textTransform:"uppercase",marginBottom:5}}>
      {props.label || "Generated name"}
    </div>
    <div style={{fontSize:14,fontWeight:800,color:P.txt,fontFamily:fm,letterSpacing:0.5,wordBreak:"break-all"}}>
      {props.name || <span style={{color:P.label||P.sub,fontWeight:500}}>(fill in fields below)</span>}
    </div>
    {props.parts && <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:8}}>
      {props.parts.map(function(part, i){
        return <span key={i} style={{padding:"3px 8px",background:"rgba(20,12,30,0.6)",border:"1px dashed "+P.rule,borderRadius:6,fontSize:10,color:part.value?P.txt:(P.dim||P.label),fontFamily:fm,letterSpacing:1}}>
          <span style={{color:accent,fontWeight:800}}>{part.label}:</span> {part.value || "—"}
        </span>;
      })}
    </div>}
  </div>;
}

// ---------------------------------------------------------------------------
// Step 0: Account & Objective + Campaign-name parts (Client + Variant).

// Saved-templates panel. Sits above the rest of Step 0 so the team
// can either load a preset for a recurring client (e.g. "MTN MoMo
// Lead Gen Standard") or start fresh. Loading a template merges the
// snapshot's whitelisted fields into the current draft via the
// standard `update()` patcher — uploaded creatives, start/end dates
// and the live Step state are preserved.
function TemplatesPanel(props) {
  var P = props.P, fm = props.fm, ff = props.ff, Glass = props.Glass;
  var apiBase = props.apiBase, token = props.token;
  var draft = props.draft, applyTemplate = props.applyTemplate;
  var ts = useState({ loading: true, items: [], error: "" }), tplState = ts[0], setTplState = ts[1];
  var ns = useState(""), saveName = ns[0], setSaveName = ns[1];
  var bs = useState(false), busy = bs[0], setBusy = bs[1];
  var es = useState(""), err = es[0], setErr = es[1];
  var ms = useState(""), msg = ms[0], setMsg = ms[1];
  var pS = useState(false), panelOpen = pS[0], setPanelOpen = pS[1];

  var loadList = function(){
    if (!token) { setTplState({ loading: false, items: [], error: "Not authenticated" }); return; }
    setTplState({ loading: true, items: [], error: "" });
    fetch(apiBase + "/api/create/templates", { headers: { "Authorization": "Bearer " + token } })
      .then(function(r){ return r.json().then(function(d){ return { ok: r.ok, data: d }; }); })
      .then(function(x){
        if (!x.ok) { setTplState({ loading: false, items: [], error: (x.data && x.data.error) || "Failed to load" }); return; }
        setTplState({ loading: false, items: (x.data && x.data.templates) || [], error: "" });
      })
      .catch(function(){ setTplState({ loading: false, items: [], error: "Network error" }); });
  };
  useEffect(loadList, [token]);

  var doSave = function(){
    if (!saveName.trim()) { setErr("Give the template a short name first."); return; }
    if (busy) return;
    setBusy(true); setErr(""); setMsg("");
    fetch(apiBase + "/api/create/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
      body: JSON.stringify({ name: saveName.trim(), draft: draft })
    })
      .then(function(r){ return r.json().then(function(d){ return { ok: r.ok, data: d }; }); })
      .then(function(x){
        setBusy(false);
        if (!x.ok) { setErr((x.data && x.data.error) || "Save failed"); return; }
        setSaveName(""); setMsg("Saved.");
        setTimeout(function(){ setMsg(""); }, 1800);
        loadList();
      })
      .catch(function(){ setBusy(false); setErr("Network error"); });
  };

  var doDelete = function(id, name){
    if (!window.confirm("Delete template '" + name + "'?")) return;
    setBusy(true); setErr(""); setMsg("");
    fetch(apiBase + "/api/create/templates?id=" + encodeURIComponent(id), {
      method: "DELETE",
      headers: { "Authorization": "Bearer " + token }
    })
      .then(function(r){ return r.json().then(function(d){ return { ok: r.ok, data: d }; }); })
      .then(function(x){
        setBusy(false);
        if (!x.ok) { setErr((x.data && x.data.error) || "Delete failed"); return; }
        setMsg("Deleted.");
        setTimeout(function(){ setMsg(""); }, 1500);
        loadList();
      })
      .catch(function(){ setBusy(false); setErr("Network error"); });
  };

  var doLoad = function(tpl){
    if (!tpl || !tpl.draft) return;
    applyTemplate(tpl);
    setMsg("Loaded '" + tpl.name + "'.");
    setTimeout(function(){ setMsg(""); }, 1800);
  };

  return <Glass accent={P.orchid} st={{padding:22,marginBottom:18}}>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer"}}
      onClick={function(){ setPanelOpen(!panelOpen); }}>
      <div>
        <div style={{fontSize:13,fontWeight:800,color:P.orchid,letterSpacing:2,fontFamily:fm,textTransform:"uppercase"}}>Templates</div>
        <div style={{fontSize:11,color:P.label||P.sub,fontFamily:ff,marginTop:4}}>
          Snapshot the wizard state for repeat clients. Load a preset to fill the next 80% in one click. {tplState.items.length > 0 && <span style={{color:P.orchid,fontWeight:700}}>· {tplState.items.length} saved</span>}
        </div>
      </div>
      <div style={{fontSize:11,color:P.orchid,fontFamily:fm,fontWeight:800,letterSpacing:1.5}}>{panelOpen ? "− HIDE" : "+ SHOW"}</div>
    </div>

    {panelOpen && <div style={{marginTop:18}}>
      {tplState.loading && <div style={{fontSize:12,color:P.label||P.sub,fontFamily:fm}}>Loading saved templates…</div>}
      {tplState.error && <div style={{fontSize:12,color:P.critical||"#ef4444",fontFamily:fm}}>{tplState.error}</div>}

      {!tplState.loading && tplState.items.length === 0 && <div style={{fontSize:12,color:P.caption||P.sub,fontFamily:ff,padding:"10px 0"}}>
        No templates yet. Fill in Step 0–4 the way you want them, then come back here and save as a named template.
      </div>}

      {!tplState.loading && tplState.items.length > 0 && <div style={{marginBottom:14}}>
        <div style={{fontSize:10,fontWeight:800,color:P.label||P.sub,letterSpacing:1.5,fontFamily:fm,textTransform:"uppercase",marginBottom:6}}>Load a template</div>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {tplState.items.map(function(tpl){
            return <div key={tpl.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,padding:"10px 12px",background:"rgba(20,12,30,0.5)",border:"1px solid "+P.rule,borderRadius:10}}>
              <div style={{flex:1,minWidth:0,overflow:"hidden"}}>
                <div style={{fontSize:13,color:P.txt,fontFamily:fm,fontWeight:700,letterSpacing:0.5,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{tpl.name}</div>
                <div style={{fontSize:10,color:P.caption||P.sub,fontFamily:fm,marginTop:3,letterSpacing:0.5}}>
                  {tpl.draft && tpl.draft.accountName ? tpl.draft.accountName + " · " : ""}
                  {tpl.draft && tpl.draft.objective ? tpl.draft.objective.replace(/^OUTCOME_/, "") : ""}
                  {tpl.savedBy ? " · " + tpl.savedBy : ""}
                </div>
              </div>
              <div style={{display:"flex",gap:6,flexShrink:0}}>
                <button onClick={function(){ doLoad(tpl); }} disabled={busy} style={{background:P.orchid+"20",border:"1px solid "+P.orchid+"60",borderRadius:8,padding:"6px 12px",color:P.orchid,fontSize:10,fontWeight:800,fontFamily:fm,cursor:"pointer",letterSpacing:1.5,textTransform:"uppercase"}}>Load</button>
                <button onClick={function(){ doDelete(tpl.id, tpl.name); }} disabled={busy} style={{background:"transparent",border:"1px solid "+(P.critical||"#ef4444")+"40",borderRadius:8,padding:"6px 10px",color:P.critical||"#ef4444",fontSize:10,fontWeight:800,fontFamily:fm,cursor:"pointer",letterSpacing:1.5,textTransform:"uppercase"}}>Del</button>
              </div>
            </div>;
          })}
        </div>
      </div>}

      <div style={{display:"flex",gap:10,alignItems:"flex-end"}}>
        <div style={{flex:1}}>
          <div style={{fontSize:10,fontWeight:800,color:P.label||P.sub,letterSpacing:1.5,fontFamily:fm,textTransform:"uppercase",marginBottom:6}}>Save current draft as template</div>
          <input value={saveName} onChange={function(e){ setSaveName(e.target.value); }} placeholder="e.g. MTN MoMo Lead Gen Standard"
            style={Object.assign({}, inputStyle(P, fm))}/>
        </div>
        <button onClick={doSave} disabled={busy || !saveName.trim()} style={{background:busy?P.dim:"linear-gradient(135deg,#A855F7,#7C3AED)",border:"none",borderRadius:10,padding:"11px 18px",color:"#fff",fontSize:11,fontWeight:800,fontFamily:fm,cursor:busy?"wait":"pointer",letterSpacing:1.5,textTransform:"uppercase",whiteSpace:"nowrap"}}>{busy ? "Saving…" : "Save"}</button>
      </div>

      {msg && <div style={{marginTop:10,fontSize:11,color:P.mint,fontFamily:fm,fontWeight:700}}>{msg}</div>}
      {err && <div style={{marginTop:10,fontSize:11,color:P.critical||"#ef4444",fontFamily:fm}}>{err}</div>}
    </div>}
  </Glass>;
}

function Step0(props) {
  var P = props.P, ff = props.ff, fm = props.fm, Ic = props.Ic, Glass = props.Glass;
  var draft = props.draft, update = props.update, accounts = props.accounts;
  var apiBase = props.apiBase, token = props.token;

  // Apply a loaded template — merge whitelisted fields onto the current
  // draft. Uploaded creatives and date fields are intentionally NOT
  // touched so the team can build a fresh campaign on top of a preset.
  var applyTemplate = function(tpl){
    if (!tpl || !tpl.draft) return;
    update(tpl.draft);
  };

  var objMatch = OBJECTIVES.find(function(o){ return o.id === draft.objective; });
  // Live-preview chips for the new naming convention:
  //   Client-Name _ Platform _ Objective _ Product-Name _ MonthYear
  var nameParts = [
    { label: "Client",     value: draft.clientCode || "" },
    { label: "Platform",   value: platformNamingForCampaign() },
    { label: "Objective",  value: objMatch ? objMatch.naming : "" },
    { label: "Product",    value: draft.productName || draft.variant || "" },
    { label: "MonthYear",  value: monthYearFromDate(draft.startDate) }
  ];

  return <div>
    <NamePreview P={P} fm={fm} accent={P.ember} label="Campaign name (live preview)"
      name={props.generatedCampaignName} parts={nameParts}/>

    <TemplatesPanel P={P} fm={fm} ff={ff} Glass={Glass}
      apiBase={apiBase} token={token}
      draft={draft} applyTemplate={applyTemplate}/>

    <Glass accent={P.ember} st={{padding:26,marginBottom:18}}>
      <div style={{fontSize:13,fontWeight:800,color:P.ember,letterSpacing:2,fontFamily:fm,marginBottom:14,textTransform:"uppercase"}}>1. Pick your account</div>
      <Field label="Ad account" fm={fm} P={P} hint="Only allowlisted Meta ad accounts appear here.">
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
    </Glass>

    <Glass accent={P.ember} st={{padding:26,marginBottom:18}}>
      <div style={{fontSize:13,fontWeight:800,color:P.ember,letterSpacing:2,fontFamily:fm,marginBottom:6,textTransform:"uppercase"}}>2. Name your campaign</div>
      <div style={{fontSize:12,color:P.caption||P.sub,fontFamily:ff,lineHeight:1.6,marginBottom:14}}>
        Naming convention: <strong style={{color:P.txt}}>Client-Name_Platform_Objective_Product-Name_MonthYear</strong>.<br/>
        Example: <span style={{color:P.ember,fontFamily:fm}}>MTN-MoMo_META_Like&amp;Follow_MoMoDeals_May2026</span>.<br/>
        Platform, Objective and MonthYear auto-fill from your other choices below.
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
        <Field label="Client name" fm={fm} P={P} hint="Use the agency form with hyphens. E.g. MTN-MoMo, GAS-Marketing, Willowbrook.">
          <input value={draft.clientCode} onChange={function(e){ update({ clientCode: sanitiseLoose(e.target.value, 20) }); }}
            placeholder="MTN-MoMo"
            style={Object.assign({}, inputStyle(P, fm), { letterSpacing: 0.5 })}/>
        </Field>
        <Field label="Product name" fm={fm} P={P} hint="The product or campaign theme. Hyphens fine. E.g. MoMoDeals, Electricity-Advance, HomeLoan-Promo.">
          <input value={draft.productName || ""} onChange={function(e){ update({ productName: sanitiseLoose(e.target.value, 40) }); }}
            placeholder="MoMoDeals"
            style={Object.assign({}, inputStyle(P, fm), { letterSpacing: 0.5 })}/>
        </Field>
      </div>
    </Glass>

    <Glass accent={P.orchid} st={{padding:26,marginBottom:18}}>
      <div style={{fontSize:13,fontWeight:800,color:P.orchid,letterSpacing:2,fontFamily:fm,marginBottom:6,textTransform:"uppercase"}}>3. Objective</div>
      <div style={{fontSize:12,color:P.caption||P.sub,fontFamily:ff,lineHeight:1.6,marginBottom:14}}>What outcome do you want Meta to optimise toward?</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12}}>
        {OBJECTIVES.map(function(o){
          var on = draft.objective === o.id;
          return <div key={o.id} onClick={function(){ update({ objective: o.id }); }} style={{padding:"16px 18px",border:"1px solid "+(on?P.orchid:P.rule),background:on?P.orchid+"15":"rgba(20,12,30,0.4)",borderRadius:12,cursor:"pointer",transition:"all 0.15s ease",position:"relative",overflow:"hidden"}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
              <span style={{padding:"2px 8px",background:on?P.orchid+"30":"rgba(20,12,30,0.6)",border:"1px solid "+(on?P.orchid:P.rule),borderRadius:6,fontSize:10,fontWeight:900,color:on?P.orchid:P.txt,fontFamily:fm,letterSpacing:1.5}}>{o.code}</span>
              <div style={{fontSize:14,fontWeight:800,color:on?P.orchid:P.txt,fontFamily:ff}}>{o.label}</div>
            </div>
            <div style={{fontSize:12,color:P.label||P.sub,fontFamily:ff,marginTop:4,lineHeight:1.5}}>{o.sub}</div>
          </div>;
        })}
      </div>
    </Glass>

    <Glass accent={P.fb} st={{padding:26}}>
      <div style={{fontSize:13,fontWeight:800,color:P.fb,letterSpacing:2,fontFamily:fm,marginBottom:6,textTransform:"uppercase"}}>4. Platform</div>
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
        Instagram-only ads still need a Facebook Page, Meta uses it as the actor identity even when nothing serves on FB.
      </div>
    </Glass>
  </div>;
}

// ---------------------------------------------------------------------------
// Step 1: Audience.

function Step1(props) {
  var P = props.P, ff = props.ff, fm = props.fm, Glass = props.Glass;
  var draft = props.draft, updateNested = props.updateNested;
  var apiBase = props.apiBase, token = props.token;
  var savedAudiences = props.savedAudiences || { items: [], loading: false, error: "" };
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

  var objMatchAS = OBJECTIVES.find(function(o){ return o.id === draft.objective; });
  // Ad-set live-preview chips per the agency naming convention:
  //   Client-Name _ Platform _ Objective _ Product-Name _ Target-Audience _ MonthYear
  var nameParts = [
    { label: "Client",     value: draft.clientCode || "" },
    { label: "Platform",   value: platformNamingForAdLevel(draft.platformMode) },
    { label: "Objective",  value: objMatchAS ? objMatchAS.naming : "" },
    { label: "Product",    value: draft.productName || draft.variant || "" },
    { label: "Audience",   value: a.audienceLabel || "" },
    { label: "MonthYear",  value: monthYearFromDate(draft.startDate) }
  ];

  return <div>
    <NamePreview P={P} fm={fm} accent={P.cyan} label="Ad set name (live preview)"
      name={props.generatedAdsetName} parts={nameParts}/>

    <Glass accent={P.cyan} st={{padding:26,marginBottom:18}}>
      <div style={{fontSize:13,fontWeight:800,color:P.cyan,letterSpacing:2,fontFamily:fm,marginBottom:6,textTransform:"uppercase"}}>Target audience</div>
      <div style={{fontSize:12,color:P.caption||P.sub,fontFamily:ff,lineHeight:1.6,marginBottom:14}}>
        Naming convention: <strong style={{color:P.txt}}>Client-Name_Platform_Objective_Product-Name_Target-Audience_MonthYear</strong>.<br/>
        Example: <span style={{color:P.cyan,fontFamily:fm}}>MTN-MoMo_Facebook_Like&amp;Follow_Electricity-Advance_Cold-Audience_May2026</span>
      </div>
      <Field label="Audience label" fm={fm} P={P} hint='Use hyphenated agency form. E.g. Cold-Audience, Warm-Audience, LAL1-Audience, Page-Fans, Retargeting-CartAbandon.'>
        <input value={a.audienceLabel} onChange={function(e){ updateNested("audience", { audienceLabel: sanitiseLoose(e.target.value, 32) }); }}
          placeholder="Cold-Audience"
          style={Object.assign({}, inputStyle(P, fm), { letterSpacing: 0.5 })}/>
      </Field>
    </Glass>

    <Glass accent={P.cyan} st={{padding:26,marginBottom:18}}>
      <Field label="Where to advertise" fm={fm} P={P} hint="Pick countries, regions, cities, suburbs or postal codes. Add proximity pins (15 km from this address etc.) for store-radius campaigns. Mix freely, Meta unions everything you add.">
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
    </Glass>

    <Glass accent={P.mint} st={{padding:26,marginBottom:18}}>
      <div style={{fontSize:13,fontWeight:800,color:P.mint,letterSpacing:2,fontFamily:fm,marginBottom:6,textTransform:"uppercase"}}>Saved &amp; custom audiences</div>
      <div style={{fontSize:12,color:P.caption||P.sub,fontFamily:ff,lineHeight:1.6,marginBottom:14}}>
        Pick audiences you've already built in Ads Manager. Custom audiences (real people) and saved audiences (reusable targeting configs) both surface here. Multi-select, Meta unions them.
      </div>
      <SavedAudiencePicker P={P} ff={ff} fm={fm} savedAudiences={savedAudiences}
        selectedSaved={a.savedAudienceIds || []} selectedCustom={a.customAudienceIds || []}
        onChange={function(saved, custom){ updateNested("audience", { savedAudienceIds: saved, customAudienceIds: custom }); }}/>
    </Glass>

    <Glass accent={P.fb} st={{padding:26,marginBottom:18}}>
      <div style={{fontSize:13,fontWeight:800,color:P.fb,letterSpacing:2,fontFamily:fm,marginBottom:6,textTransform:"uppercase"}}>Engaged community (page fans &amp; followers)</div>
      <div style={{fontSize:12,color:P.caption||P.sub,fontFamily:ff,lineHeight:1.6,marginBottom:14}}>
        Both targeting paths now go through Custom Audiences. Build them once in Ads Manager and they'll surface in the Saved &amp; custom audiences picker above.
      </div>
      <div style={{padding:"12px 14px",background:(P.warning||"#fbbf24")+"10",border:"1px solid "+(P.warning||"#fbbf24")+"30",borderLeft:"3px solid "+(P.warning||"#fbbf24"),borderRadius:"0 10px 10px 0",marginBottom:12}}>
        <div style={{fontSize:11,fontWeight:800,color:P.warning||"#fbbf24",letterSpacing:1.5,textTransform:"uppercase",fontFamily:fm,marginBottom:6}}>Heads-up: Meta deprecated direct page-fans targeting (Jan 2026)</div>
        <div style={{fontSize:11,color:P.label||P.sub,fontFamily:ff,lineHeight:1.7}}>
          Connection-based targeting (the old "people who like your Page" filter) was removed by Meta. Submitting a campaign with it now fails with error 1870088.
        </div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <ToggleRow P={P} fm={fm} accent={P.fb}
          on={false} disabled={true}
          title="Target Facebook page fans (now via Custom Audience)"
          sub="In Ads Manager → Audiences → Create custom audience → Facebook Page → People who engaged with your Page (or visited your Page). Once created, it appears in the Saved &amp; custom audiences picker above."/>
        <ToggleRow P={P} fm={fm} accent={P.ig}
          on={false} disabled={true}
          title="Target Instagram followers (via Custom Audience)"
          sub="In Ads Manager → Audiences → Create custom audience → Instagram account → People who follow your professional account. Once created, it appears in the Saved &amp; custom audiences picker above."/>
      </div>
    </Glass>

    <Glass accent={P.cyan} st={{padding:26,marginBottom:18}}>
      <Field label="Describe your ideal customer (optional, AI-assisted)" fm={fm} P={P}
        hint="Type a plain-English description and we'll suggest matching Meta interests, behaviors and demographics. Accept or ignore each suggestion.">
        <AudienceSuggester P={P} ff={ff} fm={fm}
          apiBase={apiBase} token={token} accountId={draft.accountId}
          ageMin={a.ageMin} ageMax={a.ageMax}
          countries={a.countries}
          existingItems={a.targetingItems || []}
          onAdd={addItem}/>
      </Field>

      <Field label="Detailed targeting (interests, behaviors, demographics)" fm={fm} P={P}
        hint="Search Meta's targeting taxonomy directly. Items inside one type are OR'd; types are AND'd together.">
        <TargetingPicker P={P} ff={ff} fm={fm}
          apiBase={apiBase} token={token} accountId={draft.accountId}
          items={a.targetingItems || []} onAdd={addItem} onRemove={removeItem}/>
      </Field>

      <details style={{marginTop:18,padding:"14px 16px",background:"rgba(20,12,30,0.4)",border:"1px solid "+P.rule,borderRadius:10}}>
        <summary style={{fontSize:11,color:P.label||P.sub,cursor:"pointer",letterSpacing:1.5,textTransform:"uppercase",fontWeight:800,fontFamily:fm}}>For developers: raw flexible_spec JSON</summary>
        <div style={{fontSize:12,color:P.caption||P.sub,fontFamily:ff,lineHeight:1.7,marginTop:10,marginBottom:8}}>
          Power users only. A valid Meta <code style={{background:"rgba(0,0,0,0.4)",padding:"1px 6px",borderRadius:4,fontFamily:fm}}>flexible_spec</code> array pasted here overrides the picker selections above.
        </div>
        <textarea value={a.flexibleSpec ? JSON.stringify(a.flexibleSpec, null, 2) : ""} onChange={function(e){
          var v = e.target.value.trim();
          if (!v) { updateNested("audience", { flexibleSpec: null }); return; }
          try { updateNested("audience", { flexibleSpec: JSON.parse(v) }); } catch (_) { /* ignore until valid */ }
        }} placeholder='[{"interests":[{"id":"6003107902433","name":"Online shopping"}]}]' style={Object.assign({}, inputStyle(P, fm), { minHeight: 100, fontFamily: fm, fontSize: 12 })}/>
      </details>
    </Glass>

    <div style={{padding:"14px 16px",background:P.info+"10",border:"1px solid "+P.info+"30",borderLeft:"3px solid "+P.info,borderRadius:"0 10px 10px 0"}}>
      <div style={{fontSize:11,fontWeight:800,color:P.info,letterSpacing:1.5,textTransform:"uppercase",fontFamily:fm,marginBottom:6}}>Heads-up: Meta interest consolidation, 6 Jan 2026</div>
      <div style={{fontSize:12,color:P.label||P.sub,fontFamily:ff,lineHeight:1.7}}>
        Meta merged many overlapping interest options into broader combined ones. If a previously-used interest no longer appears in search, it's been folded into a parent, search the parent term and Meta will surface the right replacement.
      </div>
    </div>
  </div>;
}

// ---------------------------------------------------------------------------
// Step 2: Placement.

function Step2(props) {
  var P = props.P, ff = props.ff, fm = props.fm, Glass = props.Glass;
  var draft = props.draft, updateNested = props.updateNested;
  var pl = draft.placement;
  var toggle = function(field, value){
    var arr = pl[field] || [];
    var next = arr.indexOf(value) >= 0 ? arr.filter(function(x){return x!==value;}) : arr.concat([value]);
    var patch = {}; patch[field] = next; updateNested("placement", patch);
  };

  // Detect image-only creative + AN combination so we can warn about rewarded
  // video placement (which requires a video).
  var anyVideoCreative = (draft.creatives || []).some(function(c){ return !!c.videoId; });
  var anSelected = pl.mode === "manual" && (pl.platforms || []).indexOf("audience_network") >= 0;
  var showRewardedWarning = anSelected && !anyVideoCreative;

  return <div>
    <NamePreview P={P} fm={fm} accent={P.cyan} label="Ad set name (live preview)"
      name={props.generatedAdsetName}/>

    <Glass accent={P.fb} st={{padding:26}}>
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
          Meta auto-distributes spend across Feeds, Stories, Reels, Audience Network and Messenger, picking the placements that deliver best for your objective. Your creative gets auto-cropped to fit each placement, but for best quality upload square (1:1) and vertical (9:16) versions of your asset.
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

      {showRewardedWarning && <div style={{marginTop:18,padding:"14px 16px",background:(P.warning||"#fbbf24")+"12",border:"1px solid "+(P.warning||"#fbbf24")+"40",borderLeft:"3px solid "+(P.warning||"#fbbf24"),borderRadius:"0 12px 12px 0"}}>
        <div style={{fontSize:11,fontWeight:800,color:P.warning||"#fbbf24",letterSpacing:1.5,textTransform:"uppercase",fontFamily:fm,marginBottom:6}}>Audience Network rewarded video</div>
        <div style={{fontSize:12,color:P.txt,fontFamily:ff,lineHeight:1.7}}>
          You've selected Audience Network with image-only creatives. Meta won't deliver to AN rewarded video without a video asset. We'll auto-exclude rewarded video for you so the rest of AN serves normally. To unlock that placement, upload a video on Step 4.
        </div>
      </div>}
    </Glass>
  </div>;
}

// ---------------------------------------------------------------------------
// Step 3: Creative. Multi-creative manager + carousel + naming convention.

function Step3(props) {
  var P = props.P, ff = props.ff, fm = props.fm, Glass = props.Glass;
  var apiBase = props.apiBase, token = props.token, draft = props.draft;
  var update = props.update, updateCreative = props.updateCreative;
  var pages = props.pages, instagrams = props.instagrams;

  var igRequired = draft.platformMode === "fb_ig" || draft.platformMode === "ig_only";
  var fbHidden = draft.platformMode === "ig_only";

  var modeTabs = [
    { k: "single",   n: "Single ad",  sub: "1 image or video, 1 ad" },
    { k: "multi",    n: "Multiple ads", sub: "N creatives, N ads in one ad set, Meta rotates" },
    { k: "carousel", n: "Carousel",   sub: "1 ad with 2-10 swipeable cards" }
  ];
  var creatives = draft.creatives || [];

  var addCreative = function(){
    update({ creatives: creatives.concat([emptyCreative()]) });
  };
  var removeCreative = function(idx){
    if (creatives.length <= 1) return;
    var arr = creatives.slice(); arr.splice(idx, 1);
    update({ creatives: arr });
  };

  var changeMode = function(m){
    var nextCreatives = creatives.slice();
    if (m === "single" && nextCreatives.length > 1) nextCreatives = [nextCreatives[0]];
    if (m === "carousel" && nextCreatives.length < 2) {
      while (nextCreatives.length < 2) nextCreatives.push(emptyCreative());
    }
    update({ creativeMode: m, creatives: nextCreatives });
  };

  return <Glass accent={P.fuchsia} st={{padding:26}}>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:18}}>
      <Field label={fbHidden ? "Facebook page (Meta requires it as actor identity)" : "Facebook page"} fm={fm} P={P}>
        <Select P={P} fm={fm}
          value={draft.pageId}
          placeholder={pages.loading ? "Loading..." : "— Choose page —"}
          options={(pages.items || []).map(function(p){ return { value: p.pageId, label: p.name }; })}
          onChange={function(v){ var match = (pages.items || []).find(function(x){return x.pageId===v;}); update({ pageId: v, pageName: match ? match.name : "" }); }}/>
      </Field>
      <Field label={igRequired ? "Instagram account (required)" : "Instagram account (optional)"} fm={fm} P={P}>
        <Select P={P} fm={fm}
          value={draft.instagramId}
          placeholder={instagrams.loading ? "Loading..." : (igRequired ? "— Choose Instagram —" : "— None / FB-only —")}
          options={[{ value: "", label: "— None —" }].concat((instagrams.items || []).map(function(i){ return { value: i.instagramId, label: "@" + i.username }; }))}
          onChange={function(v){ update({ instagramId: v }); }}/>
      </Field>
    </div>

    <Field label="Ad layout" fm={fm} P={P} hint="Single = one ad. Multiple = N independent ads in this set. Carousel = one ad with multiple swipeable cards.">
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
        {modeTabs.map(function(t){
          var on = draft.creativeMode === t.k;
          return <div key={t.k} onClick={function(){ changeMode(t.k); }} style={{padding:"14px 16px",border:"1px solid "+(on?P.fuchsia:P.rule),background:on?P.fuchsia+"15":"rgba(20,12,30,0.6)",borderRadius:10,cursor:"pointer",color:on?P.fuchsia:P.txt,fontFamily:fm}}>
            <div style={{fontSize:13,fontWeight:800,letterSpacing:1.5,textTransform:"uppercase"}}>{t.n}</div>
            <div style={{fontSize:11,marginTop:4,color:P.label||P.sub}}>{t.sub}</div>
          </div>;
        })}
      </div>
    </Field>

    {/* Multi-advertiser ads — explicit OFF reminder, with override */}
    <div style={{margin:"6px 0 18px",padding:"12px 14px",background:"rgba(20,12,30,0.4)",border:"1px solid "+P.rule,borderRadius:10,display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
      <div>
        <div style={{fontSize:11,fontWeight:800,color:P.txt,fontFamily:fm,letterSpacing:1.5,textTransform:"uppercase"}}>Multi-advertiser ads</div>
        <div style={{fontSize:11,color:P.label||P.sub,fontFamily:ff,marginTop:3,lineHeight:1.5}}>OFF by default. Keeps your client's ad from being grouped with other advertisers in Reels/Feed carousels. Toggle ON only for low-cost reach plays.</div>
      </div>
      <div onClick={function(){ update({ multiAdvertiserAds: !draft.multiAdvertiserAds }); }}
        style={{width:46,height:24,borderRadius:12,background:draft.multiAdvertiserAds?"linear-gradient(135deg,#FF3D00,#FF6B00)":P.dim,position:"relative",cursor:"pointer",flexShrink:0,transition:"background 0.2s"}}>
        <div style={{position:"absolute",top:2,left:draft.multiAdvertiserAds?24:2,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left 0.2s"}}/>
      </div>
    </div>

    {/* Bulk drop-zone — drag many files in one go from a synced Drive folder
        or local disk. Disabled for carousel mode (cards there are managed
        as a single ad, not one-ad-per-file). */}
    {draft.creativeMode !== "carousel" && <BulkDropzone
      P={P} fm={fm} apiBase={apiBase} token={token}
      accountId={draft.accountId}
      creatives={creatives}
      onBatch={function(newCreatives){
        // Replace any empty placeholder creatives (no asset uploaded yet)
        // with the new uploads so the team isn't left with dangling rows.
        var trimmed = creatives.filter(function(c){ return c.imageHash || c.videoId; });
        var combined = trimmed.concat(newCreatives);
        update({ creativeMode: combined.length > 1 ? "multi" : draft.creativeMode, creatives: combined });
      }}/>}

    {/* Auto-split toggle — only when the current batch contains 2+
        distinct ratios. Splits the submit into N campaigns (one per
        ratio) which gives cleaner per-format reporting and lets
        Meta's optimization compound within ratio-homogeneous sets. */}
    {(function(){
      var buckets = ratioBuckets(creatives);
      var ratios = Object.keys(buckets).filter(function(r){ return r && buckets[r].length > 0; });
      if (ratios.length < 2 || draft.creativeMode === "carousel") return null;
      return <div style={{margin:"-4px 0 16px",padding:"12px 16px",background:P.cyan+"10",border:"1px solid "+P.cyan+"40",borderLeft:"3px solid "+P.cyan,borderRadius:"0 10px 10px 0",display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
        <div>
          <div style={{fontSize:11,fontWeight:800,color:P.cyan,fontFamily:fm,letterSpacing:1.5,textTransform:"uppercase"}}>Auto-split by ratio detected: {ratios.join(", ")}</div>
          <div style={{fontSize:11,color:P.label||P.sub,fontFamily:ff,marginTop:4,lineHeight:1.55}}>
            Toggle ON to create <strong style={{color:P.txt}}>{ratios.length} campaigns</strong> instead of one — each ratio gets its own campaign + ad set with a <code style={{color:P.cyan}}>-{ratios[0]}</code>-style suffix on the Product segment so Meta's algorithm optimizes per-format.
          </div>
        </div>
        <div onClick={function(){ update({ autoSplitByRatio: !draft.autoSplitByRatio }); }}
          style={{width:46,height:24,borderRadius:12,background:draft.autoSplitByRatio?P.cyan:P.dim,position:"relative",cursor:"pointer",flexShrink:0,transition:"background 0.2s"}}>
          <div style={{position:"absolute",top:2,left:draft.autoSplitByRatio?24:2,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left 0.2s"}}/>
        </div>
      </div>;
    })()}

    {/* Per-creative cards */}
    {creatives.map(function(c, idx){
      var adName = composeAdName(c, idx, draft);
      // Apply-to-all copies one field's value from card #0 to every
      // other card in the list. Only meaningful when there are 2+
      // cards and only exposed on card #0. Returns the count of cards
      // changed so the UI can flash "applied to N cards".
      var applyToAll = function(field, value){
        var next = creatives.map(function(other, i){
          if (i === 0) return other;
          var patch = {}; patch[field] = value;
          return Object.assign({}, other, patch);
        });
        update({ creatives: next });
        return creatives.length - 1;
      };
      // Context passed into Sami so the suggestions match this run.
      var objMatchS3 = OBJECTIVES.find(function(o){ return o.id === draft.objective; });
      var samiContext = {
        clientName: draft.clientCode || "",
        productName: draft.productName || draft.variant || "",
        productAction: c.productAction || c.concept || "",
        audienceLabel: (draft.audience && draft.audience.audienceLabel) || "",
        objective: objMatchS3 ? objMatchS3.naming : draft.objective
      };
      return <CreativeCard key={idx} idx={idx} creative={c} P={P} ff={ff} fm={fm}
        creativeMode={draft.creativeMode}
        accountId={draft.accountId} apiBase={apiBase} token={token}
        adName={adName}
        onChange={function(patch){ updateCreative(idx, patch); }}
        onRemove={creatives.length > 1 ? function(){ removeCreative(idx); } : null}
        siblingCount={creatives.length - 1}
        onApplyToAll={idx === 0 && creatives.length > 1 ? applyToAll : null}
        samiContext={samiContext}
        sharedPrimaryText={draft.creativeMode === "carousel" && idx > 0 ? creatives[0].primaryText : null}/>;
    })}

    {(draft.creativeMode === "multi" || draft.creativeMode === "carousel") && creatives.length < (draft.creativeMode === "carousel" ? 10 : 6) && <button onClick={addCreative}
      style={{width:"100%",marginTop:6,background:"transparent",border:"1px dashed "+P.fuchsia+"60",borderRadius:10,padding:"14px 0",color:P.fuchsia,fontSize:12,fontWeight:800,fontFamily:fm,letterSpacing:2,cursor:"pointer",textTransform:"uppercase"}}>
      + Add another {draft.creativeMode === "carousel" ? "card" : "creative"}
    </button>}
  </Glass>;
}

// Bulk-upload dropzone. Sits above the per-creative cards in Step 3 and
// turns a drag-and-drop of many files (or a multi-file picker click) into
// pre-filled creative cards — one per file, with assetName, ratioSize,
// dimensions and uploaded imageHash/videoId all auto-populated. Each file
// is read locally to detect dimensions and classify aspect ratio, then
// streamed to /api/create/upload exactly like the single-file path so the
// downstream submit flow doesn't care which input route was used.
//
// Concurrency caps at three parallel uploads. Meta's /adimages and
// /advideos endpoints tolerate more, but most agency networks throttle
// outbound POSTs over a certain size; three keeps the dashboard
// responsive without piling on the bandwidth.
function BulkDropzone(props) {
  var P = props.P, fm = props.fm;
  var apiBase = props.apiBase, token = props.token;
  var accountId = props.accountId, creatives = props.creatives, onBatch = props.onBatch;
  var fileRef = useRef(null);
  var ds = useState(false), dragOver = ds[0], setDragOver = ds[1];
  var psS = useState([]), progressItems = psS[0], setProgressItems = psS[1];
  var bS = useState(false), busy = bS[0], setBusy = bS[1];

  var disabled = !accountId || busy;

  var uploadOne = function(file, runningList) {
    return readDataUrl(file).then(function(dataUrl){
      return readDimensions(file, dataUrl).then(function(dims){
        var b64 = String(dataUrl).split(",")[1] || "";
        var kind = classifyKind(file);
        var uploadKind = kind === "video" ? "video" : "image"; // GIF posts as image
        return fetch(apiBase + "/api/create/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
          body: JSON.stringify({ kind: uploadKind, accountId: accountId, filename: file.name, mimeType: file.type, dataB64: b64 })
        })
          .then(function(r){ return r.json().then(function(d){ return { ok: r.ok, data: d }; }); })
          .then(function(x){
            if (!x.ok) throw new Error((x.data && x.data.error) || "Upload failed");
            return creativeFromUpload({
              file: file, uploadResult: x.data, dataUrl: dataUrl, dims: dims,
              existingCreatives: runningList
            });
          });
      });
    });
  };

  var handleFiles = function(files) {
    if (disabled) return;
    var arr = Array.prototype.slice.call(files || []);
    if (arr.length === 0) return;
    setBusy(true);
    var items = arr.map(function(f){ return { name: f.name, status: "queued", error: "" }; });
    setProgressItems(items);

    var POOL = 3;
    var nextIndex = 0;
    var runningList = creatives.slice(); // mutated as new creatives land so asset names stay unique
    var collected = [];
    var inFlight = 0;
    var finishedCount = 0;

    return new Promise(function(resolve){
      var tick = function(){
        while (inFlight < POOL && nextIndex < arr.length) {
          (function(i){
            inFlight++;
            items[i].status = "uploading";
            setProgressItems(items.slice());
            uploadOne(arr[i], runningList)
              .then(function(creative){
                runningList.push(creative);
                collected.push(creative);
                items[i].status = "done";
              })
              .catch(function(err){
                items[i].status = "error";
                items[i].error = String(err && err.message || err);
              })
              .then(function(){
                inFlight--;
                finishedCount++;
                setProgressItems(items.slice());
                if (finishedCount === arr.length) {
                  setBusy(false);
                  if (collected.length > 0) onBatch(collected);
                  resolve();
                } else {
                  tick();
                }
              });
          })(nextIndex);
          nextIndex++;
        }
      };
      tick();
    });
  };

  var onDrop = function(e){
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    handleFiles(e.dataTransfer && e.dataTransfer.files);
  };
  var onDragOver = function(e){
    e.preventDefault();
    if (!disabled) setDragOver(true);
  };
  var onDragLeave = function(){ setDragOver(false); };
  var onPick = function(e){
    handleFiles(e.target.files);
    e.target.value = ""; // allow re-picking the same file later
  };

  var borderColor = disabled ? P.rule : (dragOver ? P.fuchsia : P.fuchsia + "60");
  var bg = dragOver ? P.fuchsia + "12" : "rgba(20,12,30,0.4)";

  return <div style={{marginBottom:16}}>
    <div onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}
      onClick={function(){ if (!disabled && fileRef.current) fileRef.current.click(); }}
      style={{padding:"22px 24px",border:"2px dashed "+borderColor,background:bg,borderRadius:14,cursor:disabled?"not-allowed":"pointer",transition:"background 0.15s, border-color 0.15s",textAlign:"center"}}>
      <div style={{fontSize:11,fontWeight:900,color:P.fuchsia,fontFamily:fm,letterSpacing:2.5,textTransform:"uppercase",marginBottom:8}}>
        Bulk drop — multiple files at once
      </div>
      <div style={{fontSize:13,color:P.txt,fontFamily:fm,fontWeight:700,marginBottom:6}}>
        Drag a folder of mixed creatives here, or click to pick many files
      </div>
      <div style={{fontSize:11,color:P.label||P.sub,fontFamily:fm,lineHeight:1.6}}>
        Each file becomes one ad. Aspect ratio (9x16, 1x1, 16x9, etc.) and asset name (Static1, Video2…) auto-fill from the file dimensions. Meta serves each ad on the placements its ratio fits (9x16 → Reels + Stories, 1x1 → Feed, 16x9 → In-Stream).
      </div>
      {!accountId && <div style={{marginTop:10,fontSize:11,color:P.warning||"#fbbf24",fontFamily:fm}}>Pick an ad account on Step 0 first.</div>}
      <input ref={fileRef} type="file" multiple style={{display:"none"}}
        accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/quicktime"
        onChange={onPick}/>
    </div>

    {progressItems.length > 0 && <div style={{marginTop:10,padding:"12px 14px",background:"rgba(0,0,0,0.25)",border:"1px solid "+P.rule,borderRadius:10}}>
      <div style={{fontSize:10,fontWeight:800,color:P.label||P.sub,fontFamily:fm,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>
        Bulk upload progress
      </div>
      {progressItems.map(function(it, i){
        var col = it.status === "done" ? P.mint : (it.status === "error" ? (P.critical || "#ef4444") : (it.status === "uploading" ? P.fuchsia : (P.label || P.sub)));
        var label = it.status === "done" ? "✓ done" : (it.status === "error" ? ("× " + (it.error || "failed")) : (it.status === "uploading" ? "uploading…" : "queued"));
        return <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:11,fontFamily:fm,padding:"3px 0",color:P.label||P.sub}}>
          <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginRight:12}}>{it.name}</span>
          <span style={{color:col,fontWeight:700,letterSpacing:0.5,whiteSpace:"nowrap"}}>{label}</span>
        </div>;
      })}
    </div>}
  </div>;
}

function CreativeCard(props) {
  var P = props.P, ff = props.ff, fm = props.fm, c = props.creative;
  var idx = props.idx, creativeMode = props.creativeMode;
  var apiBase = props.apiBase, token = props.token, accountId = props.accountId;
  var fileRef = useRef(null);
  // Sami copy-assist state, scoped per card so two cards can hold
  // separate suggestion panels open if the team wants to compare.
  var samiS = useState({ open: false, loading: false, error: "", headlines: [], primaryTexts: [] }), sami = samiS[0], setSami = samiS[1];
  var fetchSami = function(){
    if (sami.loading) return;
    setSami(Object.assign({}, sami, { loading: true, error: "", open: true }));
    fetch(apiBase + "/api/create/copy-assist", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
      body: JSON.stringify(props.samiContext || {})
    })
      .then(function(r){ return r.json().then(function(d){ return { ok: r.ok, data: d }; }); })
      .then(function(x){
        if (!x.ok) { setSami({ open: true, loading: false, error: (x.data && x.data.error) || "Sami failed", headlines: [], primaryTexts: [] }); return; }
        setSami({ open: true, loading: false, error: "", headlines: x.data.headlines || [], primaryTexts: x.data.primaryTexts || [] });
      })
      .catch(function(){ setSami({ open: true, loading: false, error: "Network error", headlines: [], primaryTexts: [] }); });
  };
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
        body: JSON.stringify({ kind: kind, accountId: accountId, filename: file.name, mimeType: file.type, dataB64: b64 })
      })
        .then(function(r){ return r.json().then(function(d){ return { ok: r.ok, data: d }; }); })
        .then(function(x){
          if (!x.ok) {
            setUploadState({ uploading: false, error: (x.data && x.data.error) || "Upload failed" });
            return;
          }
          props.onChange({
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

  var carouselCard = creativeMode === "carousel";
  var hidePrimary = carouselCard && idx > 0; // carousel cards 2..N don't have their own primary text

  // What we'll push to Meta as the asset format. For carousel, only image_hash is allowed at the card level.
  var allowedAccept = carouselCard ? "image/png,image/jpeg,image/webp" : "image/png,image/jpeg,image/webp,image/gif,video/mp4,video/quicktime";

  return <div style={{padding:"18px 20px",background:"rgba(20,12,30,0.4)",border:"1px solid "+P.rule,borderRadius:14,marginBottom:14,position:"relative"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <span style={{padding:"4px 12px",background:P.fuchsia+"25",border:"1px solid "+P.fuchsia+"50",borderRadius:8,fontSize:10,fontWeight:900,color:P.fuchsia,fontFamily:fm,letterSpacing:2}}>
          {carouselCard ? "CARD #" + (idx + 1) : "AD #" + (idx + 1)}
        </span>
        <span style={{fontSize:12,color:P.label||P.sub,fontFamily:fm,letterSpacing:0.5}}>
          → <span style={{color:P.txt,fontWeight:700}}>{props.adName}</span>
        </span>
      </div>
      <div style={{display:"flex",gap:6,alignItems:"center"}}>
        <button onClick={fetchSami} disabled={sami.loading} style={{background:sami.loading?P.dim:P.orchid+"20",border:"1px solid "+P.orchid+"60",borderRadius:8,padding:"4px 10px",color:P.orchid,fontSize:10,fontWeight:800,fontFamily:fm,cursor:sami.loading?"wait":"pointer",letterSpacing:1.5,textTransform:"uppercase"}}>
          {sami.loading ? "Sami…" : "✨ Sami copy"}
        </button>
        {props.onRemove && <button onClick={props.onRemove} style={{background:"transparent",border:"1px solid "+(P.critical||"#ef4444")+"40",borderRadius:8,padding:"4px 10px",color:P.critical||"#ef4444",fontSize:10,fontWeight:800,fontFamily:fm,cursor:"pointer",letterSpacing:1.5,textTransform:"uppercase"}}>
          Remove
        </button>}
      </div>
    </div>

    {sami.open && <div style={{padding:"12px 14px",background:P.orchid+"10",border:"1px solid "+P.orchid+"40",borderLeft:"3px solid "+P.orchid,borderRadius:"0 10px 10px 0",marginBottom:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <span style={{fontSize:10,fontWeight:800,color:P.orchid,fontFamily:fm,letterSpacing:1.5,textTransform:"uppercase"}}>Sami suggestions {sami.loading ? "· loading…" : ""}</span>
        <button onClick={function(){ setSami(Object.assign({}, sami, { open: false })); }} style={{background:"transparent",border:"none",color:P.label||P.sub,fontSize:11,fontWeight:700,fontFamily:fm,cursor:"pointer",letterSpacing:1.2}}>close</button>
      </div>
      {sami.error && <div style={{fontSize:11,color:P.critical||"#ef4444",fontFamily:fm,marginBottom:8}}>{sami.error}</div>}
      {sami.headlines.length > 0 && <div style={{marginBottom:10}}>
        <div style={{fontSize:9,fontWeight:800,color:P.label||P.sub,letterSpacing:1.5,fontFamily:fm,textTransform:"uppercase",marginBottom:6}}>Headlines · click to apply</div>
        {sami.headlines.map(function(h, i){
          return <div key={"h"+i} onClick={function(){ props.onChange({ headline: h }); }} style={{padding:"7px 10px",background:"rgba(20,12,30,0.5)",border:"1px solid "+P.rule,borderRadius:8,marginBottom:5,fontSize:12,color:P.txt,fontFamily:fm,cursor:"pointer",lineHeight:1.4}}>{h}</div>;
        })}
      </div>}
      {sami.primaryTexts.length > 0 && <div>
        <div style={{fontSize:9,fontWeight:800,color:P.label||P.sub,letterSpacing:1.5,fontFamily:fm,textTransform:"uppercase",marginBottom:6}}>Primary texts · click to apply</div>
        {sami.primaryTexts.map(function(t, i){
          return <div key={"t"+i} onClick={function(){ props.onChange({ primaryText: t }); }} style={{padding:"8px 11px",background:"rgba(20,12,30,0.5)",border:"1px solid "+P.rule,borderRadius:8,marginBottom:5,fontSize:12,color:P.txt,fontFamily:ff,cursor:"pointer",lineHeight:1.55}}>{t}</div>;
        })}
      </div>}
    </div>}

    <Field label="Upload asset" fm={fm} P={P} hint={carouselCard ? "Image only for carousel cards. PNG / JPG / WebP, square 1080×1080 ideal." : "Image (PNG/JPG/WebP/GIF) or Video (MP4/MOV). Max ~3 MB."}>
      <input ref={fileRef} type="file" accept={allowedAccept} onChange={onFile} disabled={!accountId || uploadState.uploading}
        style={Object.assign({}, inputStyle(P, fm), { padding: "12px 14px", fontSize: 13 })}/>
      {uploadState.uploading && <div style={{fontSize:12,color:P.label||P.sub,fontFamily:fm,marginTop:8}}>Uploading to Meta...</div>}
      {uploadState.error && <div style={{fontSize:12,color:P.critical||"#ef4444",fontFamily:fm,marginTop:8}}>{uploadState.error}</div>}
      {(c.imageHash || c.videoId) && <div style={{marginTop:12,padding:"10px 14px",background:P.mint+"12",border:"1px solid "+P.mint+"40",borderRadius:10,fontSize:12,color:P.mint,fontFamily:fm}}>
        ✓ Uploaded: {c.filename} ({c.videoId ? "video" : "image"})
      </div>}
      {c.previewDataUrl && <img src={c.previewDataUrl} alt="" style={{marginTop:12,maxWidth:240,borderRadius:10,border:"1px solid "+P.rule}}/>}
    </Field>

    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
      <Field label="Headline" fm={fm} P={P} hint="Bold line above primary text. Max 200 chars."
        actionBtn={<ApplyAllBtn P={P} fm={fm} siblingCount={props.siblingCount||0}
          onApply={props.onApplyToAll ? function(){ props.onApplyToAll("headline", c.headline); } : null}/>}>
        <input value={c.headline} onChange={function(e){ props.onChange({ headline: e.target.value }); }} maxLength={200} style={inputStyle(P, fm)}/>
      </Field>
      <Field label="Call to action button" fm={fm} P={P}
        actionBtn={<ApplyAllBtn P={P} fm={fm} siblingCount={props.siblingCount||0}
          onApply={props.onApplyToAll ? function(){ props.onApplyToAll("callToAction", c.callToAction); } : null}/>}>
        <Select P={P} fm={fm}
          value={c.callToAction}
          options={CTAS.map(function(x){ return { value: x, label: x.replace(/_/g," ") }; })}
          onChange={function(v){ props.onChange({ callToAction: v }); }}/>
      </Field>
    </div>

    {!hidePrimary && <Field label={carouselCard ? "Primary text (used for the whole carousel)" : "Primary text"} fm={fm} P={P} hint="Main body of the ad. Max 1,500 chars. First 125 show before 'See more' on most placements."
      actionBtn={<ApplyAllBtn P={P} fm={fm} siblingCount={props.siblingCount||0}
        onApply={props.onApplyToAll ? function(){ props.onApplyToAll("primaryText", c.primaryText); } : null}/>}>
      <textarea value={c.primaryText} onChange={function(e){ props.onChange({ primaryText: e.target.value }); }} maxLength={1500} style={Object.assign({}, inputStyle(P, fm), { minHeight: 90 })}/>
    </Field>}
    {hidePrimary && <div style={{padding:"10px 14px",background:"rgba(20,12,30,0.6)",border:"1px solid "+P.rule,borderRadius:10,fontSize:11,color:P.label||P.sub,fontFamily:ff,lineHeight:1.6,marginBottom:18}}>
      Carousel ads share one primary text across all cards (set on card #1 above).
    </div>}

    <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:14}}>
      <Field label="Destination URL" fm={fm} P={P} hint="Where users land when they tap the CTA. Include https://"
        actionBtn={<ApplyAllBtn P={P} fm={fm} siblingCount={props.siblingCount||0}
          onApply={props.onApplyToAll ? function(){ props.onApplyToAll("linkUrl", c.linkUrl); } : null}/>}>
        <input value={c.linkUrl} onChange={function(e){ props.onChange({ linkUrl: e.target.value }); }} placeholder="https://..." style={inputStyle(P, fm)}/>
      </Field>
      <Field label="Description (optional)" fm={fm} P={P} hint="Sub-line under the headline on some placements."
        actionBtn={<ApplyAllBtn P={P} fm={fm} siblingCount={props.siblingCount||0}
          onApply={props.onApplyToAll ? function(){ props.onApplyToAll("description", c.description); } : null}/>}>
        <input value={c.description} onChange={function(e){ props.onChange({ description: e.target.value }); }} maxLength={200} style={inputStyle(P, fm)}/>
      </Field>
    </div>

    <div style={{marginTop:14,padding:"12px 14px",background:P.fuchsia+"08",border:"1px solid "+P.fuchsia+"30",borderRadius:10}}>
      <div style={{fontSize:10,fontWeight:800,color:P.fuchsia,fontFamily:fm,letterSpacing:1.5,textTransform:"uppercase",marginBottom:6}}>Ad name parts</div>
      <div style={{fontSize:11,color:P.caption||P.sub,fontFamily:"inherit",lineHeight:1.6,marginBottom:10}}>
        Naming: <strong style={{color:P.txt}}>Platform_AssetName_RatioSize_Product&amp;Action_MonthYear</strong>.<br/>
        Example: <span style={{color:P.fuchsia,fontFamily:fm}}>Facebook_Static1_9x16_AyandaUGC-ElectricityAdvance_May2026</span>.
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
        <Field label="Asset name" fm={fm} P={P} hint='E.g. Static1, Video2, GIF1. Asset type and number for tracking.'>
          <input value={c.assetName || c.concept || ""} onChange={function(e){ props.onChange({ assetName: sanitiseLoose(e.target.value, 24) }); }}
            placeholder="Static1"
            style={Object.assign({}, inputStyle(P, fm), { letterSpacing: 0.5 })}/>
        </Field>
        <Field label="Ratio / Size" fm={fm} P={P} hint='E.g. 9x16 (Reels/Stories), 1x1 (Feed), 16x9 (Wide). Auto-detects from upload when possible.'>
          <input value={c.ratioSize || ""} onChange={function(e){ props.onChange({ ratioSize: sanitiseLoose(String(e.target.value).replace(/[:/]/g,"x"), 8) }); }}
            placeholder="9x16"
            style={Object.assign({}, inputStyle(P, fm), { letterSpacing: 0.5 })}/>
        </Field>
        <Field label="Product &amp; Action" fm={fm} P={P} hint='Talent-or-concept-plus-product. E.g. AyandaUGC-ElectricityAdvance, OfferHero-MoMoDeals.'
          actionBtn={<ApplyAllBtn P={P} fm={fm} siblingCount={props.siblingCount||0}
            onApply={props.onApplyToAll ? function(){ props.onApplyToAll("productAction", c.productAction || c.concept || ""); } : null}/>}>
          <input value={c.productAction || c.concept || ""} onChange={function(e){ props.onChange({ productAction: sanitiseLoose(e.target.value, 40) }); }}
            placeholder="AyandaUGC-ElectricityAdvance"
            style={Object.assign({}, inputStyle(P, fm), { letterSpacing: 0.5 })}/>
        </Field>
      </div>
    </div>
  </div>;
}

// ---------------------------------------------------------------------------
// Step 4: Budget & Schedule, with CBO/ABO toggle.

function Step4(props) {
  var P = props.P, ff = props.ff, fm = props.fm, Glass = props.Glass;
  var draft = props.draft, update = props.update;
  var isLifetime = draft.budgetMode === "lifetime";
  var days = isLifetime ? lifetimeDays(draft.startDate, draft.endDate) : 0;
  var lifetimeCap = MAX_DAILY_RAND * (days || 1);
  var dailyOver = draft.dailyBudgetRand > MAX_DAILY_RAND;
  var lifetimeOver = draft.lifetimeBudgetRand > lifetimeCap;

  return <div>
    <NamePreview P={P} fm={fm} accent={P.solar} label="Name preview"
      name={props.generatedCampaignName + "  ·  " + props.generatedAdsetName}/>

    <Glass accent={P.solar} st={{padding:24,marginBottom:18}}>
      <div style={{fontSize:13,fontWeight:800,color:P.solar,letterSpacing:2,fontFamily:fm,marginBottom:8,textTransform:"uppercase"}}>Where the budget lives</div>
      <div style={{fontSize:12,color:P.caption||P.sub,fontFamily:ff,lineHeight:1.6,marginBottom:14}}>
        CBO holds the budget at campaign level and shares it across ad sets, Meta auto-redistributes spend toward the best performers. ABO holds budget per ad set, locking spend to that audience.
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:18}}>
        {[
          { k: "ABO", n: "ABO", sub: "Ad set budget, fixed spend per audience" },
          { k: "CBO", n: "CBO", sub: "Campaign budget, Meta optimises across ad sets" }
        ].map(function(o){
          var on = draft.funding === o.k;
          return <div key={o.k} onClick={function(){ update({ funding: o.k }); }} style={{padding:"16px 18px",border:"1px solid "+(on?P.solar:P.rule),background:on?P.solar+"15":"rgba(20,12,30,0.4)",borderRadius:12,cursor:"pointer"}}>
            <div style={{fontSize:18,fontWeight:900,color:on?P.solar:P.txt,fontFamily:fm,letterSpacing:2}}>{o.n}</div>
            <div style={{fontSize:12,color:P.label||P.sub,fontFamily:ff,marginTop:4,lineHeight:1.5}}>{o.sub}</div>
          </div>;
        })}
      </div>

      <div style={{fontSize:9,fontWeight:700,color:P.label||P.sub,letterSpacing:1.5,fontFamily:fm,textTransform:"uppercase",marginBottom:8}}>Budget type</div>
      <div style={{display:"flex",gap:8,marginBottom:18}}>
        {[{k:"daily",n:"Daily budget"},{k:"lifetime",n:"Lifetime budget"}].map(function(b){
          var on = draft.budgetMode === b.k;
          return <div key={b.k} onClick={function(){ update({ budgetMode: b.k }); }} style={{padding:"10px 18px",border:"1px solid "+(on?P.solar:P.rule),background:on?P.solar+"15":"transparent",borderRadius:10,cursor:"pointer",fontSize:11,fontWeight:800,color:on?P.solar:(P.label||P.sub),fontFamily:fm,letterSpacing:1.5,textTransform:"uppercase"}}>
            {b.n}
          </div>;
        })}
      </div>

      {!isLifetime && <Field label={"Daily budget (ZAR, max R" + MAX_DAILY_RAND.toLocaleString() + ")"} fm={fm} P={P}
        hint={draft.funding === "CBO" ? "Spent at campaign level, Meta routes to ad sets." : "Spent at ad-set level, fixed for this audience."}>
        <input type="number" min={1} max={MAX_DAILY_RAND} step={50}
          value={draft.dailyBudgetRand}
          onChange={function(e){ var v = parseInt(e.target.value, 10); if (!isFinite(v)) v = 0; update({ dailyBudgetRand: Math.max(0, Math.min(MAX_DAILY_RAND, v)) }); }}
          style={Object.assign({}, inputStyle(P, fm), dailyOver ? { borderColor: P.critical || "#ef4444" } : {})}/>
        {dailyOver && <div style={{fontSize:11,color:P.critical||"#ef4444",fontFamily:fm,marginTop:6}}>Daily budget cannot exceed R{MAX_DAILY_RAND.toLocaleString()}, server will reject this.</div>}
      </Field>}

      {isLifetime && <Field label={"Lifetime budget (ZAR, max R" + lifetimeCap.toLocaleString() + (days ? " over " + days + " days" : "") + ")"} fm={fm} P={P}>
        <input type="number" min={1} step={100}
          value={draft.lifetimeBudgetRand}
          onChange={function(e){ var v = parseInt(e.target.value, 10); if (!isFinite(v)) v = 0; update({ lifetimeBudgetRand: Math.max(0, v) }); }}
          style={Object.assign({}, inputStyle(P, fm), lifetimeOver ? { borderColor: P.critical || "#ef4444" } : {})}/>
        {!draft.endDate && <div style={{fontSize:11,color:P.warning||"#fbbf24",fontFamily:fm,marginTop:6}}>End date required for a lifetime budget.</div>}
        {lifetimeOver && <div style={{fontSize:11,color:P.critical||"#ef4444",fontFamily:fm,marginTop:6}}>Lifetime budget cannot exceed R{lifetimeCap.toLocaleString()} (R{MAX_DAILY_RAND.toLocaleString()} × {days} days).</div>}
      </Field>}
    </Glass>

    <Glass accent={P.solar} st={{padding:24}}>
      <div style={{fontSize:13,fontWeight:800,color:P.solar,letterSpacing:2,fontFamily:fm,marginBottom:14,textTransform:"uppercase"}}>Schedule</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
        <Field label="Start date (SAST, 08:00 launch)" fm={fm} P={P} hint="All campaigns launch at 08:00 SAST on the chosen date.">
          <input type="date" value={draft.startDate} onChange={function(e){ update({ startDate: e.target.value }); }} style={inputStyle(P, fm)}/>
        </Field>
        <Field label={isLifetime ? "End date (SAST, required)" : "End date (SAST, optional, blank = open ended)"} fm={fm} P={P}>
          <input type="date" value={draft.endDate} onChange={function(e){ update({ endDate: e.target.value }); }} style={inputStyle(P, fm)}/>
        </Field>
      </div>
      <div style={{marginTop:12,padding:"10px 14px",background:P.solar+"08",border:"1px solid "+P.solar+"30",borderLeft:"3px solid "+P.solar,borderRadius:"0 10px 10px 0",fontSize:11,color:P.label||P.sub,fontFamily:fm,lineHeight:1.7}}>
        Hard launch time: <strong style={{color:P.txt}}>08:00 SAST</strong> on {draft.startDate || "—"}. If 08:00 has already passed today the start auto-bumps to "now + 15 min".
      </div>
    </Glass>
  </div>;
}

// ---------------------------------------------------------------------------
// Step 5: Tracking.

// Per-pixel health check. Fires when a pixel is chosen + the
// objective expects pixel signal (Leads or Sales). Surfaces a
// HEALTHY / THIN / STALE chip and the 7-day event count for the
// target event so the team doesn't run paid traffic into a pixel
// that's not firing.
function PixelHealth(props) {
  var P = props.P, fm = props.fm;
  var apiBase = props.apiBase, token = props.token;
  var pixelId = props.pixelId, targetEvent = props.targetEvent;
  var ss = useState({ loading: false, data: null, error: "" }), state = ss[0], setState = ss[1];

  useEffect(function(){
    if (!pixelId || !token) { setState({ loading: false, data: null, error: "" }); return; }
    setState({ loading: true, data: null, error: "" });
    var qs = "?pixelId=" + encodeURIComponent(pixelId) + (targetEvent ? "&event=" + encodeURIComponent(targetEvent) : "");
    fetch(apiBase + "/api/create/pixel-verify" + qs, { headers: { "Authorization": "Bearer " + token } })
      .then(function(r){ return r.json().then(function(d){ return { ok: r.ok, data: d }; }); })
      .then(function(x){
        if (!x.ok) { setState({ loading: false, data: null, error: (x.data && x.data.error) || "Health check failed" }); return; }
        setState({ loading: false, data: x.data, error: "" });
      })
      .catch(function(){ setState({ loading: false, data: null, error: "Network error" }); });
  }, [pixelId, targetEvent]);

  if (!pixelId) return null;
  var data = state.data;
  var verdict = data && data.verdict;
  var col = verdict === "HEALTHY" ? P.mint : (verdict === "THIN" ? (P.amber||"#FBBF24") : (P.critical||"#ef4444"));
  var label = verdict === "HEALTHY" ? "Healthy" : (verdict === "THIN" ? "Thin signal" : (verdict === "STALE" ? "No signal" : (verdict === "UNKNOWN" ? "Couldn't check" : "Checking…")));
  var subline = "";
  if (data && data.ok) {
    var event = targetEvent || "all events";
    subline = data.compareCount + " " + event + " in last 7 days. Pixel total: " + data.total + ".";
    if (verdict === "STALE") subline += " Campaign won't optimize without signal — verify pixel + CAPI before launch.";
    else if (verdict === "THIN") subline += " Optimization may be slow until volume builds.";
  } else if (data && data.message) {
    subline = data.message;
  } else if (state.error) {
    subline = state.error;
  } else if (state.loading) {
    subline = "Asking Meta…";
  }

  return <div style={{marginTop:10,padding:"10px 13px",background:col+"15",border:"1px solid "+col+"40",borderLeft:"3px solid "+col,borderRadius:"0 10px 10px 0"}}>
    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
      <span style={{fontSize:10,fontWeight:800,color:col,letterSpacing:1.5,fontFamily:fm,textTransform:"uppercase"}}>Pixel health · {label}</span>
    </div>
    {subline && <div style={{fontSize:11,color:P.label||P.sub,fontFamily:fm,lineHeight:1.55}}>{subline}</div>}
  </div>;
}

function Step5(props) {
  var P = props.P, ff = props.ff, fm = props.fm, Glass = props.Glass;
  var apiBase = props.apiBase, token = props.token;
  var draft = props.draft, update = props.update, pixels = props.pixels;
  var needsPixelCheck = draft.objective === "OUTCOME_SALES" || draft.objective === "OUTCOME_LEADS";
  var targetEvent = draft.objective === "OUTCOME_LEADS" ? "Lead" : (draft.objective === "OUTCOME_SALES" ? (draft.conversionEvent || "Purchase") : "");
  return <Glass accent={P.mint} st={{padding:26}}>
    <Field label="Pixel" fm={fm} P={P} hint="Optional. Required for Sales and Leads optimization.">
      <Select P={P} fm={fm}
        value={draft.pixelId}
        placeholder={pixels.loading ? "Loading..." : "— No pixel —"}
        options={[{ value: "", label: "— No pixel —" }].concat((pixels.items || []).map(function(p){ return { value: p.pixelId, label: p.name }; }))}
        onChange={function(v){ update({ pixelId: v }); }}/>
      {needsPixelCheck && draft.pixelId && <PixelHealth P={P} fm={fm} apiBase={apiBase} token={token} pixelId={draft.pixelId} targetEvent={targetEvent}/>}
    </Field>
    {draft.objective === "OUTCOME_SALES" && <Field label="Conversion event" fm={fm} P={P} hint="Should match an event your pixel actually fires.">
      <Select P={P} fm={fm}
        value={draft.conversionEvent}
        options={["PURCHASE","ADD_TO_CART","INITIATE_CHECKOUT","LEAD","COMPLETE_REGISTRATION","ADD_PAYMENT_INFO"].map(function(c){ return { value: c, label: c.replace(/_/g," ") }; })}
        onChange={function(v){ update({ conversionEvent: v }); }}/>
    </Field>}
    <Field label="URL parameters" fm={fm} P={P} hint="Optional. Appended to the destination URL. No leading ? — we'll add it.">
      <input value={draft.urlTags} onChange={function(e){ update({ urlTags: e.target.value }); }} placeholder="utm_source=fb&utm_medium=paid&utm_campaign=may26" style={inputStyle(P, fm)}/>
    </Field>
  </Glass>;
}

// ---------------------------------------------------------------------------
// Step 6: Review.

// Reach + delivery preview. Auto-fires on Step6 mount and on draft
// changes so the team always sees the up-to-date estimate before
// hitting "Launch". Caches the last response while a new one is in
// flight so the panel doesn't flicker to "loading…" between paints.
function ReachPreview(props) {
  var P = props.P, fm = props.fm, ff = props.ff;
  var apiBase = props.apiBase, token = props.token, draft = props.draft;
  var ss = useState({ loading: false, data: null, error: "" }), state = ss[0], setState = ss[1];

  // Reset when account / objective / audience / budget meaningfully change.
  var depKey = JSON.stringify({
    accountId: draft.accountId, objective: draft.objective,
    platformMode: draft.platformMode, placement: draft.placement,
    audience: draft.audience,
    dailyBudgetRand: draft.dailyBudgetRand, budgetMode: draft.budgetMode,
    lifetimeBudgetRand: draft.lifetimeBudgetRand
  });

  useEffect(function(){
    if (!token || !draft.accountId) return;
    setState(function(s){ return Object.assign({}, s, { loading: true, error: "" }); });
    fetch(apiBase + "/api/create/preflight", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
      body: JSON.stringify({
        accountId: draft.accountId,
        objective: draft.objective,
        audience: draft.audience,
        placement: draft.placement,
        platformMode: draft.platformMode,
        budgetMode: draft.budgetMode,
        dailyBudgetRand: draft.dailyBudgetRand,
        lifetimeBudgetRand: draft.lifetimeBudgetRand,
        lifetimeDays: draft.endDate && draft.startDate ? Math.max(1, Math.round((Date.parse(draft.endDate) - Date.parse(draft.startDate)) / 86400000)) : 7
      })
    })
      .then(function(r){ return r.json().then(function(d){ return { ok: r.ok, data: d }; }); })
      .then(function(x){
        if (!x.ok) { setState({ loading: false, data: null, error: (x.data && x.data.error) || "Preflight failed" }); return; }
        setState({ loading: false, data: x.data, error: "" });
      })
      .catch(function(){ setState({ loading: false, data: null, error: "Network error" }); });
  }, [depKey]);

  // Friendly number formatter for audience-size buckets.
  var fmtN = function(n){ if (n == null) return "—"; var v = parseFloat(n); if (!isFinite(v)) return "—"; if (v >= 1e6) return (v / 1e6).toFixed(2) + "M"; if (v >= 1e3) return Math.round(v / 100) / 10 + "K"; return Math.round(v).toString(); };
  var data = state.data;

  // Audience-size assessment: too narrow (< 25K), tight (25K-200K),
  // healthy (200K-2M), broad (2M+). Drives the colour of the chip.
  var sizeAssessment = (function(){
    if (!data || !data.audience) return null;
    var lower = parseFloat(data.audience.estimateDau || 0);
    var upper = parseFloat(data.audience.estimateMau || 0);
    var mid = upper > 0 ? upper : lower;
    if (!mid) return null;
    if (mid < 25000) return { color: P.lava||"#FF2222", text: "Narrow audience, projected delivery may be slow" };
    if (mid < 200000) return { color: P.amber||"#FBBF24", text: "Tight audience, watch frequency" };
    if (mid < 2000000) return { color: P.mint||"#34D399", text: "Healthy audience size for steady delivery" };
    return { color: P.cyan||"#22D3EE", text: "Broad audience, consider tightening for efficiency" };
  })();

  return <Glass accent={P.cyan} st={{padding:22,marginBottom:18}}>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <span style={{fontSize:11,fontWeight:800,color:P.cyan,letterSpacing:2,fontFamily:fm,textTransform:"uppercase"}}>Reach &amp; delivery estimate</span>
        {state.loading && <span style={{fontSize:10,color:P.label||P.sub,fontFamily:fm,letterSpacing:1}}>refreshing…</span>}
      </div>
      {sizeAssessment && <span style={{padding:"3px 9px",background:sizeAssessment.color+"25",border:"1px solid "+sizeAssessment.color+"60",color:sizeAssessment.color,fontSize:9,fontWeight:900,letterSpacing:1.5,textTransform:"uppercase",borderRadius:6,fontFamily:fm}}>{sizeAssessment.text}</span>}
    </div>

    {state.error && <div style={{fontSize:12,color:P.critical||"#ef4444",fontFamily:fm}}>{state.error}</div>}

    {data && data.ok && data.audience && <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14,marginTop:6}}>
      <div>
        <div style={{fontSize:9,fontWeight:800,color:P.caption||P.sub,letterSpacing:2,fontFamily:fm,textTransform:"uppercase",marginBottom:4}}>Daily active in audience</div>
        <div style={{fontSize:22,fontWeight:900,color:P.txt,fontFamily:fm}}>{fmtN(data.audience.estimateDau)}</div>
      </div>
      <div>
        <div style={{fontSize:9,fontWeight:800,color:P.caption||P.sub,letterSpacing:2,fontFamily:fm,textTransform:"uppercase",marginBottom:4}}>Monthly active in audience</div>
        <div style={{fontSize:22,fontWeight:900,color:P.txt,fontFamily:fm}}>{fmtN(data.audience.estimateMau)}</div>
      </div>
      <div>
        <div style={{fontSize:9,fontWeight:800,color:P.caption||P.sub,letterSpacing:2,fontFamily:fm,textTransform:"uppercase",marginBottom:4}}>Optimization goal</div>
        <div style={{fontSize:13,fontWeight:800,color:P.cyan,fontFamily:fm,letterSpacing:0.5}}>{data.optimizationGoal}</div>
      </div>
    </div>}

    {data && data.ok && data.dailyOutcomes && Array.isArray(data.dailyOutcomes) && data.dailyOutcomes.length > 0 && <div style={{marginTop:14,padding:"10px 12px",background:"rgba(0,0,0,0.25)",border:"1px solid "+P.rule,borderRadius:8}}>
      <div style={{fontSize:9,fontWeight:800,color:P.caption||P.sub,letterSpacing:2,fontFamily:fm,textTransform:"uppercase",marginBottom:6}}>Projected daily delivery at current budget</div>
      <pre style={{margin:0,fontSize:11,color:P.label||P.sub,fontFamily:fm,whiteSpace:"pre-wrap"}}>{JSON.stringify(data.dailyOutcomes, null, 2)}</pre>
    </div>}

    {data && data.warnings && data.warnings.length > 0 && <div style={{marginTop:12,padding:"10px 12px",background:(P.amber||"#FBBF24")+"15",border:"1px solid "+(P.amber||"#FBBF24")+"40",borderLeft:"3px solid "+(P.amber||"#FBBF24"),borderRadius:"0 8px 8px 0"}}>
      <div style={{fontSize:10,fontWeight:800,color:P.amber||"#FBBF24",letterSpacing:1.5,fontFamily:fm,textTransform:"uppercase",marginBottom:6}}>Meta returned</div>
      {data.warnings.map(function(w, i){
        return <div key={i} style={{fontSize:12,color:P.txt,fontFamily:ff,marginBottom:4}}>{w}</div>;
      })}
    </div>}

    {!data && !state.loading && !state.error && <div style={{fontSize:12,color:P.caption||P.sub,fontFamily:ff}}>Waiting for account + audience config…</div>}
  </Glass>;
}

function Step6(props) {
  var P = props.P, ff = props.ff, fm = props.fm, Ic = props.Ic, Glass = props.Glass;
  var apiBase = props.apiBase, token = props.token;
  var draft = props.draft, accounts = props.accounts, pages = props.pages, instagrams = props.instagrams, pixels = props.pixels;
  var savedAudiences = props.savedAudiences || { items: [] };

  var accName = (accounts.items.find(function(a){return a.accountId===draft.accountId;}) || {}).name || draft.accountId;
  var pageName = (pages.items.find(function(p){return p.pageId===draft.pageId;}) || {}).name || draft.pageId;
  var igName = draft.instagramId ? "@" + ((instagrams.items.find(function(i){return i.instagramId===draft.instagramId;}) || {}).username || "?") : "(none)";
  var pxName = draft.pixelId ? ((pixels.items.find(function(p){return p.pixelId===draft.pixelId;}) || {}).name || draft.pixelId) : "(none)";

  var platformLabel = { fb_only: "Facebook only", fb_ig: "Facebook + Instagram", ig_only: "Instagram only" }[draft.platformMode] || draft.platformMode;
  var budgetLabel = draft.budgetMode === "lifetime"
    ? "R" + draft.lifetimeBudgetRand.toLocaleString() + " lifetime over " + lifetimeDays(draft.startDate, draft.endDate) + " days (" + draft.funding + ")"
    : "R" + draft.dailyBudgetRand.toLocaleString() + "/day (" + draft.funding + ")" + (draft.dailyBudgetRand >= MAX_DAILY_RAND ? " (at ceiling)" : "");

  var savedNames = (draft.audience.savedAudienceIds || []).concat(draft.audience.customAudienceIds || []).map(function(id){
    var match = (savedAudiences.items || []).find(function(x){ return x.id === id; });
    return match ? (match.kind === "custom" ? "[CA] " : "[SA] ") + match.name : id;
  });

  var rows = [
    ["Account", accName],
    ["Campaign name", props.generatedCampaignName],
    ["Ad set name", props.generatedAdsetName],
    ["Objective", draft.objective + " (" + ((OBJECTIVES.find(function(o){return o.id===draft.objective;})||{}).code || "?") + ")"],
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
    ["Saved / custom audiences", savedNames.length ? savedNames.join(", ") : "(none)"],
    ["Engaged community", "via Custom Audience picker (Meta deprecated direct connections)"],
    ["Detailed targeting", (draft.audience.targetingItems && draft.audience.targetingItems.length > 0)
      ? draft.audience.targetingItems.map(function(t){ return t.name + " (" + t.type.replace(/_/g," ") + ")"; }).join(", ")
      : (draft.audience.flexibleSpec ? "(custom JSON)" : "(none)")],
    ["Placement", draft.placement.mode === "advantage" ? "Advantage+" : ("Manual: " + (draft.placement.platforms || []).join(", "))],
    ["Creative mode", draft.creativeMode],
    ["Multi-advertiser ads", draft.multiAdvertiserAds ? "ON (opt-in)" : "OFF"]
  ];

  // Per-ad rows
  (draft.creatives || []).forEach(function(c, i){
    var adName = composeAdName(c, i, draft);
    rows.push([
      "Ad #" + (i + 1),
      adName + "  ·  " + (c.videoId ? "video" : "image") + "  ·  " + c.callToAction.replace(/_/g," ") + " → " + c.linkUrl
    ]);
  });

  rows.push(["Budget", budgetLabel]);
  rows.push(["Schedule (SAST 08:00)", draft.startDate + (draft.endDate ? (" → " + draft.endDate) : " (open-ended)")]);
  rows.push(["Pixel", pxName]);
  rows.push(["URL params", draft.urlTags || "(none)"]);

  return <div>
    <ReachPreview P={P} fm={fm} ff={ff} apiBase={apiBase} token={token} draft={draft}/>
    <Glass accent={P.ember} st={{padding:22}}>
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
      {Ic.bolt(P.ember,16)}
      <span style={{fontSize:11,fontWeight:800,color:P.ember,letterSpacing:2,fontFamily:fm,textTransform:"uppercase"}}>Review and launch</span>
    </div>
    <div style={{borderTop:"1px solid "+P.rule}}>
      {rows.map(function(r, i){
        return <div key={i} style={{display:"grid",gridTemplateColumns:"190px 1fr",gap:10,padding:"10px 4px",borderBottom:"1px solid "+P.rule}}>
          <div style={{fontSize:10,fontWeight:700,color:P.label||P.sub,letterSpacing:1.5,fontFamily:fm,textTransform:"uppercase"}}>{r[0]}</div>
          <div style={{fontSize:12,color:P.txt,fontFamily:ff,lineHeight:1.5,wordBreak:"break-word"}}>{r[1]}</div>
        </div>;
      })}
    </div>
    <div style={{marginTop:22,padding:"16px 18px",background:P.mint+"12",border:"1px solid "+P.mint+"40",borderLeft:"3px solid "+P.mint,borderRadius:"0 12px 12px 0"}}>
      <div style={{fontSize:11,color:P.mint,fontFamily:fm,fontWeight:800,letterSpacing:1.5,marginBottom:10,textTransform:"uppercase"}}>Safe by default</div>
      <ul style={{margin:0,padding:"0 0 0 20px",fontSize:13,color:P.txt,fontFamily:ff,lineHeight:1.9}}>
        <li>Every campaign is created <strong>paused</strong>. Nothing serves until you review and unpause in Ads Manager.</li>
        <li>Daily budgets are capped at <strong>R{MAX_DAILY_RAND.toLocaleString()}/day</strong>. Lifetime budgets at R{MAX_DAILY_RAND.toLocaleString()} × campaign duration. Enforced server-side.</li>
        <li>Only allowlisted ad accounts can be used to create campaigns from this tab.</li>
        <li>An email summary is drafted in Gary's Gmail inbox so the team has a record of every campaign created.</li>
      </ul>
    </div>
  </Glass>
  </div>;
}

// ---------------------------------------------------------------------------
// Success screen

function SuccessScreen(props) {
  var P = props.P, ff = props.ff, fm = props.fm, Ic = props.Ic, Glass = props.Glass, result = props.result;

  // Split-result shape (one campaign per ratio bucket). Renders one card
  // per campaign so the team can verify each id + jump to Ads Manager.
  if (result && result.split) {
    return <div>
      <Glass accent={P.mint} st={{padding:28}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
          {Ic.check(P.mint,22)}
          <span style={{fontSize:14,fontWeight:900,color:P.mint,letterSpacing:2,fontFamily:fm,textTransform:"uppercase"}}>{result.campaigns.length} campaigns created (PAUSED)</span>
        </div>
        <div style={{fontSize:13,color:P.txt,fontFamily:ff,lineHeight:1.7,marginBottom:18}}>
          One campaign per ratio bucket: {result.ratios.join(", ")}. Each created paused so you can review in Ads Manager and unpause when ready.
        </div>
        {result.campaigns.map(function(c, i){
          var r = c.data || {};
          var ads = r.ads || (r.adId ? [{ adId: r.adId, name: "Ad" }] : []);
          return <div key={i} style={{padding:"14px 16px",background:"rgba(0,0,0,0.25)",border:"1px solid "+P.rule,borderRadius:10,marginBottom:10}}>
            <div style={{fontSize:11,fontWeight:800,color:P.cyan,fontFamily:fm,letterSpacing:1.5,textTransform:"uppercase",marginBottom:8}}>
              {c.ratio} &middot; {c.campaignName}
            </div>
            <div style={{fontFamily:fm,fontSize:11,color:P.label||P.sub,lineHeight:1.9}}>
              <div>campaign_id: <span style={{color:P.txt}}>{r.campaignId}</span></div>
              <div>adset_id: <span style={{color:P.txt}}>{r.adsetId}</span></div>
              {ads.map(function(a, j){
                return <div key={j}>ad #{j+1} ({a.name}): <span style={{color:P.txt}}>{a.adId}</span></div>;
              })}
            </div>
            {r.adsManagerUrl && <a href={r.adsManagerUrl} target="_blank" rel="noreferrer" style={{display:"inline-block",marginTop:10,fontSize:10,color:P.cyan,textDecoration:"none",fontWeight:800,letterSpacing:1.5,textTransform:"uppercase",fontFamily:fm}}>Open in Ads Manager &rarr;</a>}
          </div>;
        })}
        <div style={{marginTop:12}}>
          <button onClick={props.onAnother} style={{background:"transparent",border:"1px solid "+P.rule,borderRadius:10,padding:"10px 22px",color:P.label||P.sub,fontSize:11,fontWeight:700,fontFamily:fm,letterSpacing:2,cursor:"pointer"}}>
            Create another
          </button>
        </div>
      </Glass>
    </div>;
  }

  // Single-campaign result (the original shape).
  var ads = result.ads || (result.adId ? [{ adId: result.adId, name: "Ad" }] : []);
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
        {ads.map(function(a, i){
          return <div key={i}>ad #{i+1} ({a.name}): <span style={{color:P.txt}}>{a.adId}</span></div>;
        })}
        <div>email_draft: <span style={{color:P.txt}}>{result.emailDraft && result.emailDraft.ok ? ("created (" + result.emailDraft.draftId + ")") : ("skipped, " + ((result.emailDraft && result.emailDraft.reason) || "unknown"))}</span></div>
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
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8,gap:8}}>
      <span style={{fontSize:11,fontWeight:700,color:props.P.label||props.P.sub,letterSpacing:1.5,fontFamily:props.fm,textTransform:"uppercase"}}>{props.label}</span>
      {props.actionBtn}
    </div>
    {props.children}
    {props.hint && <div style={{fontSize:11,color:props.P.caption||props.P.sub,fontFamily:props.fm,marginTop:6,lineHeight:1.5}}>{props.hint}</div>}
  </div>;
}

// Small "→ apply to all N cards" pill shown next to a Field label on
// creative card #0 when there are siblings. Onclick copies the field's
// current value to every other card and flashes "Applied to N" for
// ~1.4s so the user sees the result.
function ApplyAllBtn(props) {
  var P = props.P, fm = props.fm;
  var ts = useState(0), tick = ts[0], setTick = ts[1];
  if (!props.onApply || props.siblingCount <= 0) return null;
  var label = tick > 0 ? "✓ applied to " + props.siblingCount : "→ apply to all";
  return <button type="button" onClick={function(){
    props.onApply();
    setTick(Date.now());
    setTimeout(function(){ setTick(0); }, 1400);
  }} style={{background:"transparent",border:"1px solid "+P.fuchsia+"50",color:P.fuchsia,fontSize:9,fontWeight:800,letterSpacing:1.5,textTransform:"uppercase",padding:"3px 9px",borderRadius:6,cursor:"pointer",fontFamily:fm,whiteSpace:"nowrap"}}>{label}</button>;
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

// Compute a fixed-position popover anchored to a trigger element.
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

// Toggle row — used for Engaged Community switches.
function ToggleRow(props) {
  var P = props.P, fm = props.fm, accent = props.accent || P.ember;
  var on = !!props.on, disabled = !!props.disabled;
  return <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:14,padding:"12px 14px",background:"rgba(20,12,30,0.5)",border:"1px solid "+(on?accent+"50":P.rule),borderRadius:10,opacity:disabled?0.7:1}}>
    <div style={{flex:1,minWidth:0}}>
      <div style={{fontSize:12,fontWeight:800,color:P.txt,fontFamily:fm,letterSpacing:0.5,marginBottom:4}}>{props.title}</div>
      <div style={{fontSize:11,color:P.label||P.sub,fontFamily:"inherit",lineHeight:1.6}}>{props.sub}</div>
    </div>
    <div onClick={function(){ if (!disabled && props.onToggle) props.onToggle(); }}
      style={{width:46,height:24,borderRadius:12,background:on?"linear-gradient(135deg,"+accent+","+accent+"99)":P.dim,position:"relative",cursor:disabled?"not-allowed":"pointer",flexShrink:0,transition:"background 0.2s"}}>
      <div style={{position:"absolute",top:2,left:on?24:2,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left 0.2s"}}/>
    </div>
  </div>;
}

// Saved + custom audiences picker. Lists everything for the account in two
// groups, click a row to toggle. Multi-select.
function SavedAudiencePicker(props) {
  var P = props.P, ff = props.ff, fm = props.fm;
  var sa = props.savedAudiences;
  var saved = props.selectedSaved || [], custom = props.selectedCustom || [];

  var openS = useState(false), open = openS[0], setOpen = openS[1];
  var qS = useState(""), q = qS[0], setQ = qS[1];
  var triggerRef = useRef(null);
  var pos = useAnchoredPopover(triggerRef, open, { gap: 6, onClose: function(){ setOpen(false); } });

  if (sa.loading) return <div style={{fontSize:12,color:P.label||P.sub,fontFamily:fm}}>Loading audiences...</div>;
  if (sa.error) return <div style={{fontSize:12,color:P.critical||"#ef4444",fontFamily:fm}}>{sa.error}</div>;
  if (!sa.items || sa.items.length === 0) return <div style={{fontSize:12,color:P.label||P.sub,fontFamily:fm,padding:"10px 14px",background:"rgba(20,12,30,0.5)",border:"1px solid "+P.rule,borderRadius:10}}>No saved or custom audiences for this account yet. Build them in Ads Manager → Audiences and they'll appear here.</div>;

  var toggle = function(id, kind){
    if (kind === "custom") {
      var next = custom.indexOf(id) >= 0 ? custom.filter(function(x){ return x !== id; }) : custom.concat([id]);
      props.onChange(saved, next);
    } else {
      var next2 = saved.indexOf(id) >= 0 ? saved.filter(function(x){ return x !== id; }) : saved.concat([id]);
      props.onChange(next2, custom);
    }
  };
  var clearAll = function(){ props.onChange([], []); };

  var fmtSize = function(item){
    if (!item.sizeLower && !item.sizeUpper) return "";
    var lo = item.sizeLower || 0, hi = item.sizeUpper || 0;
    var fmt = function(n){ if (n >= 1e6) return (n/1e6).toFixed(1) + "M"; if (n >= 1e3) return (n/1e3).toFixed(0) + "K"; return String(n); };
    if (lo && hi) return fmt(lo) + "–" + fmt(hi);
    return "~" + fmt(hi || lo);
  };

  var totalSelected = saved.length + custom.length;
  var selectedItems = sa.items.filter(function(x){
    return (x.kind === "custom" ? custom : saved).indexOf(x.id) >= 0;
  });

  var query = q.trim().toLowerCase();
  var matches = sa.items.filter(function(x){
    if (!query) return true;
    return (x.name || "").toLowerCase().indexOf(query) >= 0 ||
           (x.sentence || "").toLowerCase().indexOf(query) >= 0 ||
           (x.subtype || "").toLowerCase().indexOf(query) >= 0;
  });
  var custItems = matches.filter(function(x){ return x.kind === "custom"; });
  var savedItems = matches.filter(function(x){ return x.kind === "saved"; });

  var popoverStyle = pos ? Object.assign({}, pos, {
    background: "rgba(15,8,22,0.98)", border: "1px solid " + P.rule,
    borderRadius: 10, overflowY: "auto", zIndex: 1000,
    boxShadow: "0 12px 40px rgba(0,0,0,0.6)"
  }) : null;

  var renderRow = function(item){
    var on = (item.kind === "custom" ? custom : saved).indexOf(item.id) >= 0;
    var color = item.kind === "custom" ? P.mint : P.cyan;
    return <div key={item.kind + ":" + item.id}
      style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,padding:"10px 14px",borderBottom:"1px solid "+P.rule,background:on?color+"10":"transparent"}}>
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2}}>
          <span style={{fontSize:9,fontWeight:800,color:color,letterSpacing:1.2,textTransform:"uppercase",fontFamily:fm}}>{item.kind === "custom" ? (item.subtype || "CUSTOM") : "SAVED"}</span>
          <span style={{fontSize:13,fontWeight:700,color:P.txt,fontFamily:ff,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{item.name}</span>
        </div>
        {item.sentence && <div style={{fontSize:10,color:P.caption||P.sub,fontFamily:ff,lineHeight:1.5,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{item.sentence}</div>}
        {fmtSize(item) && <div style={{fontSize:10,color:P.label||P.sub,fontFamily:fm,marginTop:2}}>{fmtSize(item)} people</div>}
      </div>
      <button onClick={function(e){ e.stopPropagation(); toggle(item.id, item.kind); }}
        style={{flexShrink:0,background:on?color+"25":"transparent",border:"1px solid "+(on?color+"60":P.rule),borderRadius:8,padding:"6px 14px",color:on?color:(P.label||P.sub),fontSize:11,fontWeight:800,fontFamily:fm,cursor:"pointer",letterSpacing:1.2,textTransform:"uppercase",whiteSpace:"nowrap"}}>
        {on ? "Selected ✓" : "Select"}
      </button>
    </div>;
  };

  return <div style={{position:"relative"}}>
    {/* Trigger */}
    <div ref={triggerRef} onClick={function(){ setOpen(!open); }}
      style={Object.assign({}, inputStyle(P, fm), {
        cursor: "pointer", display: "flex", alignItems: "center",
        justifyContent: "space-between", minHeight: 48
      })}>
      <span style={{color: totalSelected > 0 ? P.txt : (P.label || P.sub), whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>
        {totalSelected === 0
          ? "— Pick saved or custom audiences —"
          : totalSelected + " audience" + (totalSelected === 1 ? "" : "s") + " selected"}
      </span>
      <span style={{color: P.label || P.sub, marginLeft: 8, fontSize: 11}}>{open ? "▲" : "▼"}</span>
    </div>

    {/* Selected chips, shown below the trigger when any selection exists */}
    {selectedItems.length > 0 && <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:10}}>
      {selectedItems.map(function(item){
        var color = item.kind === "custom" ? P.mint : P.cyan;
        return <span key={item.kind + ":" + item.id} style={{display:"inline-flex",alignItems:"center",gap:8,padding:"5px 10px",border:"1px solid "+color+"50",background:color+"15",borderRadius:8,fontSize:12,color:P.txt,fontFamily:fm}}>
          <span style={{fontSize:9,fontWeight:800,color:color,letterSpacing:1,textTransform:"uppercase"}}>{item.kind === "custom" ? "CA" : "SA"}</span>
          <span style={{maxWidth:240,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{item.name}</span>
          <span onClick={function(e){ e.stopPropagation(); toggle(item.id, item.kind); }}
            style={{cursor:"pointer",color:P.label||P.sub,fontWeight:900,marginLeft:2,fontSize:14}}>×</span>
        </span>;
      })}
      {totalSelected > 1 && <span onClick={clearAll}
        style={{display:"inline-flex",alignItems:"center",padding:"5px 10px",border:"1px dashed "+(P.critical||"#ef4444")+"60",borderRadius:8,fontSize:11,color:P.critical||"#ef4444",fontFamily:fm,fontWeight:800,letterSpacing:1.2,textTransform:"uppercase",cursor:"pointer"}}>
        Clear all
      </span>}
    </div>}

    {/* Popover */}
    {open && popoverStyle && <div data-popover="true" style={popoverStyle}>
      <input value={q} onChange={function(e){ setQ(e.target.value); }}
        placeholder="Search audiences..." autoFocus
        style={{boxSizing:"border-box",width:"100%",background:"rgba(20,12,30,0.85)",border:"none",borderBottom:"1px solid "+P.rule,padding:"12px 16px",color:P.txt,fontSize:13,fontFamily:fm,outline:"none",position:"sticky",top:0,zIndex:1}}/>
      {matches.length === 0 && <div style={{padding:14,fontSize:12,color:P.label||P.sub,fontFamily:fm}}>No matches.</div>}
      {custItems.length > 0 && <div>
        <div style={{padding:"10px 14px 6px",fontSize:9,fontWeight:800,color:P.mint,letterSpacing:1.5,fontFamily:fm,textTransform:"uppercase",position:"sticky",top:42,background:"rgba(15,8,22,0.98)",zIndex:1}}>
          Custom audiences ({custItems.length})
        </div>
        {custItems.map(renderRow)}
      </div>}
      {savedItems.length > 0 && <div>
        <div style={{padding:"10px 14px 6px",fontSize:9,fontWeight:800,color:P.cyan,letterSpacing:1.5,fontFamily:fm,textTransform:"uppercase",position:"sticky",top:42,background:"rgba(15,8,22,0.98)",zIndex:1}}>
          Saved audiences ({savedItems.length})
        </div>
        {savedItems.map(renderRow)}
      </div>}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",borderTop:"1px solid "+P.rule,background:"rgba(20,12,30,0.85)",position:"sticky",bottom:0}}>
        <span style={{fontSize:11,color:P.label||P.sub,fontFamily:fm}}>{totalSelected} selected</span>
        <button onClick={function(){ setOpen(false); }}
          style={{background:"linear-gradient(135deg,#FF3D00,#FF6B00)",border:"none",borderRadius:8,padding:"6px 16px",color:"#fff",fontSize:11,fontWeight:800,fontFamily:fm,cursor:"pointer",letterSpacing:1.5,textTransform:"uppercase"}}>
          Done
        </button>
      </div>
    </div>}
    {open && <div onClick={function(){ setOpen(false); }} style={{position:"fixed",inset:0,zIndex:999}}/>}
  </div>;
}

// ISO 3166-1 country list — kept for compatibility with any consumers that
// import the COUNTRIES symbol; the wizard itself uses location-search instead.
var COUNTRIES = [];

function rangeOptions(min, max) {
  var out = [];
  for (var i = min; i <= max; i++) out.push({ value: String(i), label: String(i) });
  return out;
}

// ---------------------------------------------------------------------------
// TargetingPicker

var TARGETING_TYPE_COLORS = {
  interests: "#A855F7", behaviors: "#34D399", demographics: "#22D3EE",
  work_positions: "#FFAA00", work_employers: "#FFAA00",
  education_majors: "#FF6B00", education_schools: "#FF6B00",
  family_statuses: "#F43F5E", life_events: "#D946EF", income: "#34D399"
};

function TargetingPicker(props) {
  var P = props.P, ff = props.ff, fm = props.fm;
  var apiBase = props.apiBase, token = props.token, accountId = props.accountId;
  var items = props.items || [];

  var qS = useState(""), q = qS[0], setQ = qS[1];
  var rS = useState({ loading: false, items: [], error: "" }), results = rS[0], setResults = rS[1];
  var openS = useState(false), open = openS[0], setOpen = openS[1];
  var classS = useState(""), cls = classS[0], setCls = classS[1];

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

// LocationPicker
function LocationPicker(props) {
  var P = props.P, ff = props.ff, fm = props.fm;
  var apiBase = props.apiBase, token = props.token, accountId = props.accountId;
  var locations = props.locations || { geographies: [], customLocations: [] };

  var addGeography = function(item, asExclude){
    var existing = locations.geographies || [];
    var idx = existing.findIndex(function(x){ return x.key === item.key && x.type === item.type; });
    if (idx >= 0) {
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
      hint={(includeGeos.some(function(g){ return g.type === "country"; }) && (locations.customLocations || []).filter(function(p){ return !p.exclude; }).length > 0)
        ? "Tip: a country plus a proximity radius pin overlap. Meta will reject the country and serve only inside your pin's radius, remove the country chip if you want country-wide reach to be your fallback."
        : null}
      placeholder="Search countries, regions, cities, suburbs, postal codes..."
      geographies={includeGeos}
      onAdd={function(item){ addGeography(item, false); }}
      onRemove={removeGeography}/>
    <ProximityPinPicker P={P} ff={ff} fm={fm} apiBase={apiBase} token={token}
      pins={locations.customLocations || []} onAdd={addCustom} onRemove={removeCustom} onToggleExclude={toggleCustomExclude}/>
    <GeoSearcher P={P} ff={ff} fm={fm} apiBase={apiBase} token={token} accountId={accountId}
      mode="exclude"
      title="Exclude these locations"
      hint="Carve out low-value or off-strategy areas from the include set above."
      placeholder="Search areas to EXCLUDE, suburbs, postal codes, regions..."
      geographies={excludeGeos}
      onAdd={function(item){ addGeography(item, true); }}
      onRemove={removeGeography}/>
  </div>;
}

var GEO_TYPE_COLORS = {
  country: "#34D399", region: "#22D3EE", city: "#A855F7", subcity: "#D946EF",
  neighborhood: "#FF6B00", zip: "#FFAA00", country_group: "#34D399",
  geo_market: "#22D3EE", electoral_district: "#7C3AED"
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
      Type a store address, suburb, or "latitude, longitude" coordinates. Pick a result, set the radius, click Add. Each pin is independent, Meta serves in any of the radii you add.
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
// Naming convention helpers

function emptyCreative() {
  return {
    kind: "image",
    imageHash: null, videoId: null,
    headline: "", primaryText: "", description: "",
    linkUrl: "", callToAction: "LEARN_MORE",
    filename: null, previewDataUrl: null,
    concept: "", version: "V01"
  };
}

// ============================================================================
// Bulk-upload helpers — detect each file's dimensions client-side, classify
// into the agency's standard ratios, and slot the result into the
// {Platform}_{AssetName}_{RatioSize}_… naming. Static images are read with
// Image(); videos via a hidden <video> element's metadata. GIFs are
// classified as their own asset type because Meta serves them as image_hash
// but reporting treats them distinctly.
// ============================================================================
function classifyKind(file) {
  if (!file || !file.type) return "image";
  if (file.type.indexOf("video") === 0) return "video";
  if (/\.gif$/i.test(file.name || "") || file.type === "image/gif") return "gif";
  return "image";
}

function readDataUrl(file) {
  return new Promise(function(resolve, reject){
    var rdr = new FileReader();
    rdr.onload = function(){ resolve(String(rdr.result || "")); };
    rdr.onerror = function(){ reject(new Error("Could not read " + file.name)); };
    rdr.readAsDataURL(file);
  });
}

function readDimensions(file, dataUrl) {
  var kind = classifyKind(file);
  return new Promise(function(resolve){
    if (kind === "video") {
      var v = document.createElement("video");
      v.preload = "metadata";
      v.muted = true;
      v.onloadedmetadata = function(){ resolve({ width: v.videoWidth || 0, height: v.videoHeight || 0 }); };
      v.onerror = function(){ resolve({ width: 0, height: 0 }); };
      v.src = dataUrl;
    } else {
      var img = new Image();
      img.onload = function(){ resolve({ width: img.naturalWidth || 0, height: img.naturalHeight || 0 }); };
      img.onerror = function(){ resolve({ width: 0, height: 0 }); };
      img.src = dataUrl;
    }
  });
}

// Map raw width/height to the agency's preferred ratio token. Tolerances
// keep "near-square" assets out of the 9x16 bucket and vice versa.
function classifyRatio(w, h) {
  if (!w || !h) return "";
  var r = w / h;
  if (r >= 1.85) return "1.91x1";
  if (r >= 1.55) return "16x9";
  if (r >= 1.10) return "1.91x1"; // landscape-ish rounds toward 1.91x1
  if (r >= 0.90) return "1x1";
  if (r >= 0.74) return "4x5";
  return "9x16"; // anything taller than ~3:4 lands in the vertical bucket
}

function assetTypeFromKind(kind) {
  if (kind === "video") return "Video";
  if (kind === "gif") return "GIF";
  return "Static";
}

// Compute a unique asset name within the current creatives list. e.g.
// existing has Static1 + Static2 → new static becomes Static3. Numbering
// is per asset-type so videos and statics get their own counters.
function nextAssetName(existingCreatives, kind) {
  var assetType = assetTypeFromKind(kind);
  var pattern = new RegExp("^" + assetType + "(\\d+)$");
  var maxN = 0;
  (existingCreatives || []).forEach(function(c){
    var name = c.assetName || "";
    var m = name.match(pattern);
    if (m) {
      var n = parseInt(m[1], 10);
      if (n > maxN) maxN = n;
    }
  });
  return assetType + (maxN + 1);
}

// Build a creative object from an uploaded file. Each call should be
// passed the running creatives list so asset names stay unique across
// the batch. Returns the new creative; the caller appends it.
function creativeFromUpload(args) {
  var file = args.file;
  var uploadResult = args.uploadResult; // { kind, imageHash, videoId }
  var dataUrl = args.dataUrl;
  var dims = args.dims; // { width, height }
  var existingCreatives = args.existingCreatives || [];
  var kind = classifyKind(file);
  return {
    kind: uploadResult.kind || kind,
    imageHash: uploadResult.imageHash || null,
    videoId: uploadResult.videoId || null,
    headline: "", primaryText: "", description: "",
    linkUrl: "", callToAction: "LEARN_MORE",
    filename: file.name,
    previewDataUrl: kind === "video" ? null : dataUrl,
    width: dims.width || 0,
    height: dims.height || 0,
    ratioSize: classifyRatio(dims.width, dims.height),
    assetName: nextAssetName(existingCreatives, kind),
    productAction: "",
    concept: "", version: "V01"
  };
}

// Sanitise a single name part: uppercase, allow only A-Z 0-9 dash, strip
// underscores so they don't confuse the joiner, trim length.
// Legacy sanitiser — uppercase + alphanum-and-hyphen only. Kept around
// for any field that still wants the compact uppercase form.
function sanitiseNamePart(s, maxLen) {
  s = String(s || "").replace(/[^a-zA-Z0-9-]/g, "").toUpperCase();
  if (typeof maxLen === "number") s = s.slice(0, maxLen);
  return s;
}

// New naming-convention sanitiser. Preserves the case the user typed,
// allows hyphens and the ampersand (e.g. "MTN-MoMo", "Like&Follow",
// "AyandaUGC-ElectricityAdvance"), strips spaces (we use underscores
// to separate name parts, so spaces inside a part create ambiguous
// segments). Strips other punctuation and control chars.
function sanitiseLoose(s, maxLen) {
  s = String(s || "").replace(/[^a-zA-Z0-9\-&]/g, "");
  if (typeof maxLen === "number") s = s.slice(0, maxLen);
  return s;
}

// Compact "YYYYMM" form. Retained for any code path that still needs
// the numeric period (audit lookups, historic comparison keys).
function ymCodeFromDate(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  return iso.slice(0, 4) + iso.slice(5, 7);
}

// MonthYear naming form: "May2026", "Jan2026", etc. This is the form
// that ships in the new campaign/ad-set/ad names.
var MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function monthYearFromDate(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  var mm = parseInt(iso.slice(5, 7), 10);
  if (!mm || mm < 1 || mm > 12) return "";
  return MONTH_NAMES[mm - 1] + iso.slice(0, 4);
}

// Platform token per naming-convention level:
//   Campaign  -> "META" (umbrella, this Create tab is Meta-only)
//   Ad set / Ad -> "Facebook" | "Instagram" | "Facebook&Instagram"
//                  derived from the team's placement choice
function platformNamingForCampaign() { return "META"; }
function platformNamingForAdLevel(platformMode) {
  if (platformMode === "ig_only") return "Instagram";
  if (platformMode === "fb_only") return "Facebook";
  return "Facebook&Instagram";
}

// Asset format → "Static" / "Video" / "GIF" / "Carousel" for the ad
// name's first creative segment.
function assetTypeNaming(creative, draft) {
  if (draft.creativeMode === "carousel") return "Carousel";
  if (creative.videoId) return "Video";
  if (creative.imageHash && creative.filename && /\.gif$/i.test(creative.filename)) return "GIF";
  return "Static";
}

// Ratio string for the ad name (e.g. "9x16", "1x1", "16x9"). Derives
// from the creative's known dimensions when available; falls back to
// the user-typed ratioSize field.
function ratioNaming(creative) {
  if (creative.ratioSize) return sanitiseLoose(String(creative.ratioSize).replace(/[:/]/g, "x"), 8);
  if (creative.width && creative.height) {
    // Reduce w:h to common ad-creative ratios.
    var w = parseInt(creative.width, 10), h = parseInt(creative.height, 10);
    if (!w || !h) return "";
    var ratio = w / h;
    if (ratio > 1.6) return "16x9";
    if (ratio > 1.1) return "1.91x1";
    if (ratio > 0.9) return "1x1";
    if (ratio > 0.7) return "4x5";
    return "9x16";
  }
  return "";
}

// Geo code derived from the include locations. Picks the most specific
// non-country bucket (city/suburb beats region beats country). For pure
// country picks, returns ZA (or 1st country code). For radius pins,
// returns RADIUS{km}KM. For a mix, returns MULTI.
function geoCodeFromLocations(loc) {
  if (!loc) return "";
  var includeGeos = (loc.geographies || []).filter(function(g){ return !g.exclude; });
  var includePins = (loc.customLocations || []).filter(function(p){ return !p.exclude; });

  var cities = includeGeos.filter(function(g){ return g.type === "city" || g.type === "subcity" || g.type === "neighborhood"; });
  var regions = includeGeos.filter(function(g){ return g.type === "region"; });
  var countries = includeGeos.filter(function(g){ return g.type === "country"; });
  var totalIncludes = includeGeos.length + includePins.length;

  if (totalIncludes === 0) return "";
  if (totalIncludes > 1 && (cities.length + regions.length + includePins.length) > 1) return "MULTI";

  if (cities.length === 1 && regions.length + countries.length + includePins.length === 0) {
    return shortCity(cities[0].name);
  }
  if (regions.length === 1 && cities.length + countries.length + includePins.length === 0) {
    return sanitiseNamePart(regions[0].name, 8);
  }
  if (countries.length === 1 && cities.length + regions.length + includePins.length === 0) {
    return countries[0].key || "";
  }
  if (includePins.length === 1 && cities.length + regions.length + countries.length === 0) {
    return "RADIUS" + Math.round(includePins[0].radius || 0) + "KM";
  }
  return "MULTI";
}

// Map common ZA city names to 3-letter codes for naming convention. Anything
// not on this list falls back to the first 4 letters uppercased.
function shortCity(name) {
  var s = String(name || "").trim();
  var map = {
    "Johannesburg": "JHB", "Sandton": "JHB", "Randburg": "JHB", "Roodepoort": "JHB",
    "Cape Town": "CPT", "Bellville": "CPT", "Stellenbosch": "STB",
    "Durban": "DBN", "Umhlanga": "DBN",
    "Pretoria": "PTA", "Centurion": "PTA",
    "Port Elizabeth": "PE", "Gqeberha": "PE",
    "Bloemfontein": "BFN", "East London": "EL"
  };
  if (map[s]) return map[s];
  return sanitiseNamePart(s, 6);
}

function demoCode(ageMin, ageMax, genders) {
  var g = (!genders || genders.length === 0 || genders.length === 2) ? "A" : (genders[0] === 1 ? "M" : "F");
  return (ageMin || 18) + "-" + (ageMax || 65) + g;
}

function placementCode(platformMode, placement) {
  if (!placement || placement.mode === "advantage") return "ADV";
  if (platformMode === "fb_only") return "FB";
  if (platformMode === "ig_only") return "IG";
  if (platformMode === "fb_ig") return "FBIG";
  return "MANUAL";
}

function formatCode(c) {
  if (c.videoId) return "VID";
  if (c.imageHash && c.filename && /\.gif$/i.test(c.filename)) return "GIF";
  return "IMG";
}

// Group creatives by their detected ratioSize. Returns a map of
// { "9x16": [creative,…], "1x1": [creative,…] }. Creatives without a
// ratio (e.g. legacy drafts) bucket under "" and are usually displayed
// as a single bucket so the team can intervene before submitting.
function ratioBuckets(creatives) {
  var out = {};
  (creatives || []).forEach(function(c){
    if (!c.imageHash && !c.videoId) return; // skip placeholders
    var r = c.ratioSize || "";
    if (!out[r]) out[r] = [];
    out[r].push(c);
  });
  return out;
}

// Naming-convention validators. Each level has a regex that requires
// exactly the expected segment count joined by underscores, with each
// segment populated. If any name fails, submit is blocked at the
// frontend and the team sees the specific reason. Mirrors what the
// dashboard would otherwise have to detect from the audit-log /
// objective-classification pipeline downstream.
//
//   Campaign: Client_Platform_Objective_Product_MonthYear        (5 segments)
//   Ad set:   Client_Platform_Objective_Product_Audience_MonthYear (6 segments)
//   Ad:       Platform_Asset_Ratio_ProductAction_MonthYear        (5 segments)
//
// MonthYear is the only segment with a fixed form (e.g. "May2026").
// Other segments accept alphanum + hyphen + ampersand. Empty segments
// (i.e. two underscores in a row) fail validation.
var NAME_SEGMENT_RE = "[A-Za-z0-9][A-Za-z0-9\\-&]*";
var MONTH_YEAR_RE = "(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\\d{4}";
var CAMPAIGN_NAME_RE = new RegExp("^" + NAME_SEGMENT_RE + "_" + NAME_SEGMENT_RE + "_" + NAME_SEGMENT_RE + "_" + NAME_SEGMENT_RE + "_" + MONTH_YEAR_RE + "$");
var ADSET_NAME_RE    = new RegExp("^" + NAME_SEGMENT_RE + "_" + NAME_SEGMENT_RE + "_" + NAME_SEGMENT_RE + "_" + NAME_SEGMENT_RE + "_" + NAME_SEGMENT_RE + "_" + MONTH_YEAR_RE + "$");
var AD_NAME_RE       = new RegExp("^" + NAME_SEGMENT_RE + "_" + NAME_SEGMENT_RE + "_" + NAME_SEGMENT_RE + "_" + NAME_SEGMENT_RE + "_" + MONTH_YEAR_RE + "$");

function validateNamingConvention(draft, campaignName, adsetName, creatives) {
  var errors = [];
  if (!CAMPAIGN_NAME_RE.test(campaignName)) {
    errors.push("Campaign name does not match Client_Platform_Objective_Product_MonthYear: " + (campaignName || "(empty)"));
  }
  if (!ADSET_NAME_RE.test(adsetName)) {
    errors.push("Ad-set name does not match Client_Platform_Objective_Product_Audience_MonthYear: " + (adsetName || "(empty)"));
  }
  (creatives || []).forEach(function(c, idx){
    var adName = composeAdName(c, idx, draft);
    if (!AD_NAME_RE.test(adName)) {
      errors.push("Ad #" + (idx + 1) + " name does not match Platform_Asset_Ratio_ProductAction_MonthYear: " + (adName || "(empty)"));
    }
  });
  return errors;
}

// Compose campaign name per agency naming convention:
//   Client-Name_Platform_Objective_Product-Name_MonthYear
//   e.g. MTN-MoMo_META_Like&Follow_MoMoDeals_May2026
function composeCampaignName(draft) {
  var obj = OBJECTIVES.find(function(o){ return o.id === draft.objective; });
  // productName is the new field; fall back to legacy `variant` on
  // older drafts so half-finished work doesn't break.
  var product = sanitiseLoose(draft.productName || draft.variant || "", 40);
  var parts = [
    sanitiseLoose(draft.clientCode, 20),
    platformNamingForCampaign(),
    obj ? obj.naming : "",
    product,
    monthYearFromDate(draft.startDate)
  ].filter(Boolean);
  return parts.join("_");
}

// Compose ad-set name per agency naming convention:
//   Client-Name_Platform_Objective_Product-Name_Target-Audience_MonthYear
//   e.g. MTN-MoMo_Facebook_Like&Follow_Electricity-Advance_Cold-Audience_May2026
function composeAdsetName(draft) {
  var obj = OBJECTIVES.find(function(o){ return o.id === draft.objective; });
  var a = draft.audience || {};
  var product = sanitiseLoose(draft.productName || draft.variant || "", 40);
  var audience = sanitiseLoose(a.audienceLabel || "", 32);
  var parts = [
    sanitiseLoose(draft.clientCode, 20),
    platformNamingForAdLevel(draft.platformMode),
    obj ? obj.naming : "",
    product,
    audience,
    monthYearFromDate(draft.startDate)
  ].filter(Boolean);
  return parts.join("_");
}

// Compose ad name per agency naming convention:
//   Platform_AssetName_RatioSize_Product-Name&Action_MonthYear
//   e.g. Facebook_Static1_9x16_AyandaUGC-ElectricityAdvance_May2026
//
// The creative's `assetName` (e.g. "Static1") + `productAction` (e.g.
// "AyandaUGC-ElectricityAdvance") drive the middle segments. Falls back
// to legacy `concept` / `version` fields so half-finished drafts still
// produce something sensible.
function composeAdName(creative, idx, draft) {
  var assetType = assetTypeNaming(creative, draft);
  var assetIndex = creative.assetIndex || (idx + 1);
  var assetName = creative.assetName ? sanitiseLoose(creative.assetName, 24) : (assetType + assetIndex);
  var ratio = ratioNaming(creative);
  var productAction = sanitiseLoose(creative.productAction || creative.concept || draft.productName || "", 40);
  var parts = [
    platformNamingForAdLevel(draft.platformMode),
    assetName,
    ratio,
    productAction,
    monthYearFromDate(draft.startDate)
  ].filter(Boolean);
  return parts.join("_");
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
