import { rateLimit } from "./_rateLimit.js";
import { checkAuth, filterPagesForPrincipal } from "./_auth.js";
import { validateDates } from "./_validate.js";
var metaAccounts = [
  { name: "MTN MoMo", id: "act_8159212987434597" },
  { name: "MTN Khava", id: "act_3600654450252189" },
  { name: "Concord College", id: "act_825253026181227" },
  { name: "Eden College", id: "act_1187886635852303" },
  { name: "Psycho Bunny ZA", id: "act_9001636663181231" },
  { name: "GAS Agency", id: "act_542990539806888" }
];

// Shared name-based objective fallback for cross-platform rows (TikTok,
// Google, scheduled-but-no-metrics). Mirrors api/ads.js detectObjective.
function objectiveFromName(name) {
  var n = (name || "").toLowerCase();
  if (n.indexOf("appinstal") >= 0 || n.indexOf("app install") >= 0 || n.indexOf("app_install") >= 0
      || n.indexOf("app-install") >= 0 || n.indexOf("app_campaign") >= 0 || n.indexOf("app campaign") >= 0
      || n.indexOf("appcampaign") >= 0 || n.indexOf("app_promo") >= 0 || n.indexOf("app promo") >= 0
      || n.indexOf("appprom") >= 0 || n.indexOf("app_promotion") >= 0 || n.indexOf("app promotion") >= 0
      || n.indexOf("app_download") >= 0 || n.indexOf("app download") >= 0 || n.indexOf("uac") >= 0
      || n.indexOf("googleapp") >= 0 || n.indexOf("google_app") >= 0 || n.indexOf("google app") >= 0) return "appinstall";
  if (n.indexOf("follower") >= 0 || n.indexOf("_like_") >= 0 || n.indexOf("_like ") >= 0 || n.indexOf("paidsocial_like") >= 0 || n.indexOf("like_facebook") >= 0 || n.indexOf("like_instagram") >= 0) return "followers";
  if (n.indexOf("lead") >= 0 || n.indexOf("pos") >= 0) return "leads";
  if (n.indexOf("homeloan") >= 0 || n.indexOf("traffic") >= 0 || n.indexOf("paidsearch") >= 0) return "landingpage";
  // "unknown" is distinct from "landingpage" so the frontend can drop
  // it from Objective Highlights rather than inflating Landing Page.
  return "unknown";
}


// Whole-response cache. /api/ads already does this, /api/campaigns did
// not, so every email-share preview re-fetched Meta + TikTok + Google
// even though the admin dashboard had just loaded the same data seconds
// earlier. A 5-minute TTL is the same window share-email preview +
// confirm-and-send + reconcile run happens in, covering them all.
var campaignsResponseCache = {};
var CAMPAIGNS_RESPONSE_TTL_MS = 5 * 60 * 1000;
// Bump this when the classification logic changes so any pre-existing
// cache entries on warm function instances are treated as stale.
var CAMPAIGNS_CACHE_VERSION = "v13-supplement-diag";

// Budget helpers.
//   budgetMode = "lifetime" | "daily_inferred" | "daily_ongoing" | "infinite" | "unset"
//   budgetAmount = number in ZAR, null for daily_ongoing / infinite / unset
// For a daily-budget flight with a defined end date, we infer the total
// commit as daily × number of flight days. For ongoing daily budgets
// (no stop date) we don't fake a total, just surface the daily rate so
// the UI can say "Rxxx/day, ongoing".
function flightDays(startIso, endIso) {
  if (!startIso) return 0;
  var s = new Date(startIso).getTime();
  var e = endIso ? new Date(endIso).getTime() : Date.now();
  if (isNaN(s) || isNaN(e) || e <= s) return 0;
  return Math.max(1, Math.round((e - s) / (24 * 60 * 60 * 1000)));
}
function buildBudget(opts) {
  // opts: { lifetimeBudget, dailyBudget, spendCap, startTime, stopTime, currencyRate }
  // All amount inputs expected in ZAR already (callers divide cents/micros before passing).
  var rate = opts.currencyRate || 1;
  var life = parseFloat(opts.lifetimeBudget || 0);
  var daily = parseFloat(opts.dailyBudget || 0);
  var cap = parseFloat(opts.spendCap || 0);
  if (life > 0) return { budgetMode: "lifetime", budgetAmount: +(life * rate).toFixed(2), budgetDaily: null };
  if (cap > 0) return { budgetMode: "lifetime", budgetAmount: +(cap * rate).toFixed(2), budgetDaily: null };
  if (daily > 0) {
    var days = flightDays(opts.startTime, opts.stopTime);
    if (days > 0 && opts.stopTime) {
      return { budgetMode: "daily_inferred", budgetAmount: +(daily * rate * days).toFixed(2), budgetDaily: +(daily * rate).toFixed(2), budgetFlightDays: days };
    }
    return { budgetMode: "daily_ongoing", budgetAmount: null, budgetDaily: +(daily * rate).toFixed(2) };
  }
  return { budgetMode: "unset", budgetAmount: null, budgetDaily: null };
}

export default async function handler(req, res) {
  if (!rateLimit(req, res)) return;
  if (!(await checkAuth(req, res))) return;
  if (!validateDates(req, res)) return;
  var metaToken = process.env.META_ACCESS_TOKEN;
  var ttToken = process.env.TIKTOK_ACCESS_TOKEN;
  var ttAdvId = process.env.TIKTOK_ADVERTISER_ID;
  var from = req.query.from || "2026-04-01";
  var to = req.query.to || "2026-04-07";

  var cacheKey = CAMPAIGNS_CACHE_VERSION + "|" + from + "|" + to;
  var cached = req.query.fresh === "1" ? null : campaignsResponseCache[cacheKey];
  if (cached && Date.now() - cached.ts < CAMPAIGNS_RESPONSE_TTL_MS) {
    var pCached = req.authPrincipal || { role: "admin" };
    if (pCached.role === "client") {
      // Strict exact-match on suffixed campaignId only. No raw-ID fallback
      // (which pulled the other publisher variant) and no name fallback
      // (which could cross-match same-named campaigns across clients).
      // Tokens are issued with suffixed IDs so this is lossless.
      var cIdSet = {}; (pCached.allowedCampaignIds || []).forEach(function(x) { cIdSet[String(x)] = true; });
      var filtered = (cached.data.campaigns || []).filter(function(c) {
        return cIdSet[String(c.campaignId || "")] === true;
      });
      res.status(200).json({ totalCampaigns: filtered.length, dateFrom: cached.data.dateFrom, dateTo: cached.data.dateTo, campaigns: filtered, pages: filterPagesForPrincipal(cached.data.pages, pCached), warnings: cached.data.warnings });
    } else {
      res.status(200).json(cached.data);
    }
    return;
  }

  var allCampaigns = [];
  var seenIds = {};
  // Surface per-platform fetch failures so the dashboard can show a banner
  // instead of silently rendering zeros.
  var warnings = [];
  // Diagnostic array for the ad-level publisher_platform supplement.
  // Populated per Meta account, exposed on the API response so admin
  // callers can verify whether Meta actually returned IG rows at the ad
  // level without having to dig through Vercel logs.
  var supplementDiag = [];
  var now = new Date();
  var thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  for (var i = 0; i < metaAccounts.length; i++) {
    var account = metaAccounts[i];
    var campaignInfo = {};

    try {
      // daily_budget / lifetime_budget / spend_cap come back in account
      // currency CENTS (Meta's convention), so divide by 100 before use.
      var listUrl = "https://graph.facebook.com/v25.0/" + account.id + "/campaigns?fields=name,id,objective,effective_status,created_time,start_time,stop_time,daily_budget,lifetime_budget,spend_cap,budget_remaining&filtering=[{\"field\":\"effective_status\",\"operator\":\"IN\",\"value\":[\"ACTIVE\",\"SCHEDULED\"]}]&limit=100&access_token=" + metaToken;
      var listRes = await fetch(listUrl);
      var listData = await listRes.json();
      if (listData.data) {
        for (var k = 0; k < listData.data.length; k++) {
          var camp = listData.data[k];
          var dailyB = parseFloat(camp.daily_budget || 0) / 100;
          var lifetimeB = parseFloat(camp.lifetime_budget || 0) / 100;
          var spendCapB = parseFloat(camp.spend_cap || 0) / 100;
          var budget = buildBudget({ lifetimeBudget: lifetimeB, dailyBudget: dailyB, spendCap: spendCapB, startTime: camp.start_time, stopTime: camp.stop_time });
          campaignInfo[camp.id] = {
            name: camp.name, status: camp.effective_status, objective: camp.objective || "",
            created: new Date(camp.created_time),
            startTime: camp.start_time || null, stopTime: camp.stop_time || null,
            budgetMode: budget.budgetMode, budgetAmount: budget.budgetAmount,
            budgetDaily: budget.budgetDaily, budgetFlightDays: budget.budgetFlightDays || null
          };
        }
      }
    } catch (err) { console.error("Meta campaign list error for", account.name, err); warnings.push({ platform: "Meta", account: account.name, stage: "campaign-list", message: String(err && err.message || err) }); }

    // Fetch adset-level placement CONFIGURATION, separate from the insights
    // delivery fetch below. Insights only surface placements that actually
    // received spend, so a brand-new Meta campaign where the algorithm has
    // front-loaded Facebook delivery shows up as "Facebook only" even when
    // Instagram is configured on every adset. The Willowbrook report made
    // this visible: the client knew IG was configured, but the report hid it
    // entirely. This block collects targeting.publisher_platforms per
    // campaign, later in the merge step we synthesise zero-delivery rows
    // for any configured placement that didn't get an insights row.
    var configuredPlacements = {};
    try {
      var adsetsCfgUrl = "https://graph.facebook.com/v25.0/" + account.id + "/adsets?fields=campaign_id,effective_status,targeting{publisher_platforms}&limit=500&access_token=" + metaToken;
      var adsetsCfgNext = adsetsCfgUrl;
      var adsetsCfgGuard = 0;
      while (adsetsCfgNext && adsetsCfgGuard < 10) {
        adsetsCfgGuard++;
        var adsetsCfgRes = await fetch(adsetsCfgNext);
        if (!adsetsCfgRes.ok) break;
        var adsetsCfgJson = await adsetsCfgRes.json();
        (adsetsCfgJson.data || []).forEach(function(a) {
          var cid = String(a.campaign_id || "");
          if (!cid) return;
          var status = String(a.effective_status || "").toUpperCase();
          // Ignore deleted / archived adsets, they do not represent the
          // current configuration clients are paying against.
          if (status === "DELETED" || status === "ARCHIVED") return;
          var pubs = a.targeting && a.targeting.publisher_platforms;
          // A null publisher_platforms means Meta chooses automatically
          // across every available placement, which includes both FB and
          // IG on Advantage+ campaigns. Treat it as both-configured so we
          // do not undercount IG on algorithm-managed campaigns.
          if (!pubs || pubs.length === 0) pubs = ["facebook", "instagram"];
          if (!configuredPlacements[cid]) configuredPlacements[cid] = {};
          pubs.forEach(function(p) {
            var norm = String(p).toLowerCase();
            if (norm === "facebook" || norm === "audience_network" || norm === "messenger" || norm === "oculus") configuredPlacements[cid]["Facebook"] = true;
            if (norm === "instagram" || norm === "threads") configuredPlacements[cid]["Instagram"] = true;
          });
        });
        adsetsCfgNext = adsetsCfgJson.paging && adsetsCfgJson.paging.next ? adsetsCfgJson.paging.next : null;
      }
    } catch (cfgErr) {
      console.warn("[campaigns] adset placement fetch failed", account.name, cfgErr && cfgErr.message);
    }

    try {
      var timeRange = JSON.stringify({since: from, until: to});
      var url = "https://graph.facebook.com/v25.0/" + account.id + "/insights?fields=campaign_name,campaign_id,impressions,reach,frequency,spend,cpm,cpc,ctr,clicks,actions&time_range=" + timeRange + "&level=campaign&breakdowns=publisher_platform&limit=500&access_token=" + metaToken;
      // Follow paging.next to capture all rows, not just the first 500.
      var allMetaRows = [];
      var nextUrl = url;
      var pageGuard = 0;
      while (nextUrl && pageGuard < 10) {
        pageGuard++;
        var pageRes = await fetch(nextUrl);
        var pageData = await pageRes.json();
        if (pageData.data) allMetaRows = allMetaRows.concat(pageData.data);
        nextUrl = pageData.paging && pageData.paging.next ? pageData.paging.next : null;
      }

      // Authoritative campaign-level reach (no breakdowns). Meta dedupes reach across
      // placements at the campaign level; summing or maxing the publisher rows isn't
      // the same number as what Ads Manager reports in its default "campaign reach"
      // view. We fetch it once here and apportion it to the merged FB / IG rows below
      // so the dashboard total matches the source of truth.
      // Authoritative campaign-level totals. Meta's publisher_platform
      // breakdown sums to slightly different numbers than the unbroken
      // campaign-level insights (~1-3% drift, documented Meta behaviour),
      // which made the Ground Truth Audit flag Summary spend as yellow.
      // Pulling spend / impressions / clicks alongside reach here and
      // apportioning back to the FB / IG rows guarantees the dashboard
      // totals match Meta's own campaign-level numbers.
      var reachMap = {};
      var spendMap = {};
      var impsMap = {};
      var clicksMap = {};
      try {
        var reachUrl = "https://graph.facebook.com/v25.0/" + account.id + "/insights?fields=campaign_id,reach,spend,impressions,clicks&time_range=" + timeRange + "&level=campaign&limit=500&access_token=" + metaToken;
        var rAll = [];
        var rNext = reachUrl;
        var rGuard = 0;
        while (rNext && rGuard < 10) {
          rGuard++;
          var rRes = await fetch(rNext);
          if (!rRes.ok) break;
          var rJson = await rRes.json();
          if (rJson.data) rAll = rAll.concat(rJson.data);
          rNext = rJson.paging && rJson.paging.next ? rJson.paging.next : null;
        }
        rAll.forEach(function(row) {
          var cid = String(row.campaign_id);
          reachMap[cid] = parseInt(row.reach || 0);
          spendMap[cid] = parseFloat(row.spend || 0);
          impsMap[cid] = parseInt(row.impressions || 0);
          clicksMap[cid] = parseInt(row.clicks || 0);
        });
      } catch (_) { /* non-fatal */ }

      // Merge publisher rows into one row per (campaign_id, platform family).
      // audience_network + messenger + oculus collapse into Facebook. threads into
      // Instagram. This matches Meta Ads Manager's default "Facebook" view (which is
      // inclusive of AN + Messenger) and stops those placements from being silently dropped.
      var mapPubToPlat = function(pub) {
        var p = (pub || "facebook").toLowerCase();
        if (p === "instagram" || p === "threads") return "Instagram";
        if (p === "facebook" || p === "audience_network" || p === "messenger" || p === "oculus") return "Facebook";
        return null;
      };
      var rowMap = {};

      // Diagnostic, every publisher_platform value Meta returned for this
      // account, with impression / spend totals. Lets us verify that IG
      // delivery is actually absent (algorithm not yet allocating) vs being
      // silently dropped because Meta returned a string our mapPubToPlat
      // does not recognise (e.g. a new placement key like "instagram_reels").
      var pubDiag = {};
      var unknownPubs = {};

      if (allMetaRows.length > 0) {
        for (var j = 0; j < allMetaRows.length; j++) {
          var c = allMetaRows[j];
          var rawPub = String(c.publisher_platform || "facebook").toLowerCase();
          var cidForDiag = String(c.campaign_id || "");
          if (!pubDiag[cidForDiag]) pubDiag[cidForDiag] = {};
          if (!pubDiag[cidForDiag][rawPub]) pubDiag[cidForDiag][rawPub] = { imps: 0, spend: 0 };
          pubDiag[cidForDiag][rawPub].imps += parseFloat(c.impressions || 0);
          pubDiag[cidForDiag][rawPub].spend += parseFloat(c.spend || 0);
          if (!(parseFloat(c.impressions) > 0 || parseFloat(c.spend) > 0)) continue;
          var platName = mapPubToPlat(c.publisher_platform || "facebook");
          if (!platName) {
            // Track unknown placement strings so we notice if Meta introduces
            // a new one. Last-observed-wins on the value pointer so we still
            // log the imp/spend magnitude getting dropped.
            if (!unknownPubs[rawPub]) unknownPubs[rawPub] = { imps: 0, spend: 0, campaigns: {} };
            unknownPubs[rawPub].imps += parseFloat(c.impressions || 0);
            unknownPubs[rawPub].spend += parseFloat(c.spend || 0);
            unknownPubs[rawPub].campaigns[cidForDiag] = (c.campaign_name || "").slice(0, 60);
            continue;
          }
          var uniqueId = c.campaign_id + "_" + platName.toLowerCase();
          seenIds[c.campaign_id] = true;

          // Raw Meta objective string + canonical key. Exposing `objective`
          // on each row lets downstream consumers (email-share aggregation,
          // chat, etc.) scope outcome counts by objective without re-doing
          // name detection.
          var rawMetaObj = String((campaignInfo[c.campaign_id] || {}).objective || "").toUpperCase();
          var isFbPlacement = platName === "Facebook";
          var canonObj = (function() {
            var o = rawMetaObj;
            if (o.indexOf("APP_INSTALL") >= 0 || o.indexOf("APP_PROMOTION") >= 0) return "appinstall";
            if (o === "LEAD_GENERATION" || o === "OUTCOME_LEADS") return "leads";
            if (o === "PAGE_LIKES" || o === "POST_ENGAGEMENT" || o === "OUTCOME_ENGAGEMENT" || o === "EVENT_RESPONSES") return "followers";
            if (o === "LINK_CLICKS" || o === "OUTCOME_TRAFFIC" || o === "REACH" || o === "BRAND_AWARENESS" || o === "OUTCOME_AWARENESS" || o === "VIDEO_VIEWS") return "landingpage";
            if (o === "CONVERSIONS" || o === "OUTCOME_SALES" || o === "PRODUCT_CATALOG_SALES") return "leads";
            // Name-based fallback mirrors ads.js detectObjective().
            return objectiveFromName(c.campaign_name || "");
          })();

          var leads = 0, appInstalls = 0, landingPageViews = 0, pageLikes = 0, reactionLikes = 0, pageFollows = 0, reactionsTotal = 0;
          if (c.actions) {
            for (var a = 0; a < c.actions.length; a++) {
              var act = c.actions[a];
              if (act.action_type === "lead" || act.action_type === "onsite_web_lead" || act.action_type === "offsite_conversion.fb_pixel_lead" || act.action_type === "onsite_conversion.lead_grouped" || act.action_type === "offsite_complete_registration_add_meta_leads") {
                leads = Math.max(leads, parseInt(act.value));
              }
              if (act.action_type === "app_custom_event.fb_mobile_activate_app" || act.action_type === "app_install" || act.action_type === "mobile_app_install" || act.action_type === "omni_app_install") {
                appInstalls = Math.max(appInstalls, parseInt(act.value));
              }
              if (act.action_type === "landing_page_view" || act.action_type === "omni_landing_page_view") {
                landingPageViews = Math.max(landingPageViews, parseInt(act.value));
              }
              // "page_like" is the unambiguous page-like action. "like" is
              // POST REACTIONS (hearts/likes on the post itself) for all
              // non-follower campaigns, counting those as page likes would
              // wildly inflate follower counts on engagement-heavy creative.
              if (act.action_type === "page_like") pageLikes = Math.max(pageLikes, parseInt(act.value));
              if (act.action_type === "like") reactionLikes = Math.max(reactionLikes, parseInt(act.value));
              if (act.action_type === "page_engagement") pageFollows = Math.max(pageFollows, parseInt(act.value));
              // Authoritative total post reactions (all types combined).
              // Used as a confidence check against the per-type breakdown
              // from the action_reactions secondary call.
              if (act.action_type === "post_reaction") reactionsTotal = Math.max(reactionsTotal, parseInt(act.value));
            }
          }
          // Fold reactions into page likes for any follower-family campaign
          // on an FB placement. Covers strict PAGE_LIKES and the modern
          // OUTCOME_ENGAGEMENT objective (ODAX consolidated these in 2022+).
          // The placement check keeps IG post hearts out of the count on
          // broader engagement-family campaigns that run on IG too.
          if (canonObj === "followers" && isFbPlacement && reactionLikes > pageLikes) pageLikes = reactionLikes;

          if (!rowMap[uniqueId]) {
            rowMap[uniqueId] = {
              platform: platName,
              metaPlatform: platName.toLowerCase(),
              accountName: account.name + (account.name.indexOf("Meta")<0&&account.name.indexOf("meta")<0?" Meta":""),
              accountId: account.id,
              campaignId: uniqueId,
              rawCampaignId: c.campaign_id,
              campaignName: c.campaign_name,
              objective: canonObj,
              _sumImpressions: 0, _sumSpend: 0, _sumClicks: 0, _sumReachPublisher: 0,
              leads: 0, appInstalls: 0, landingPageViews: 0, pageLikes: 0, pageFollows: 0,
              actions: [],
              reactionsByType: { like: 0, love: 0, haha: 0, wow: 0, sad: 0, angry: 0 },
              reactionsTotal: 0
            };
          }
          var row = rowMap[uniqueId];
          row._sumImpressions += parseFloat(c.impressions || 0);
          row._sumSpend += parseFloat(c.spend || 0);
          row._sumClicks += parseFloat(c.clicks || 0);
          row._sumReachPublisher += parseFloat(c.reach || 0);
          row.leads = Math.max(row.leads, leads);
          row.appInstalls = Math.max(row.appInstalls, appInstalls);
          row.landingPageViews = Math.max(row.landingPageViews, landingPageViews);
          row.pageLikes = Math.max(row.pageLikes, pageLikes);
          row.pageFollows = Math.max(row.pageFollows, pageFollows);
          row.reactionsTotal += reactionsTotal;
          if (c.actions) row.actions = row.actions.concat(c.actions);
        }
      }

      // Secondary insights call for action_reactions breakdown only. Isolating
      // this keeps the main campaign query reliable — early deploys mixed
      // action_reactions into the main fields list and caused Meta to drop
      // campaign rows from certain accounts.
      try {
        var rxnUrl = "https://graph.facebook.com/v25.0/" + account.id + "/insights?fields=campaign_id,action_reactions&time_range=" + timeRange + "&level=campaign&breakdowns=publisher_platform&limit=500&access_token=" + metaToken;
        var rxnRows = [];
        var rxnNext = rxnUrl;
        var rxnGuard = 0;
        while (rxnNext && rxnGuard < 10) {
          rxnGuard++;
          var rxnPageRes = await fetch(rxnNext);
          if (!rxnPageRes.ok) {
            var errText = await rxnPageRes.text();
            console.warn("[action_reactions] non-ok response", account.name, rxnPageRes.status, errText.substring(0, 300));
            break;
          }
          var rxnPageData = await rxnPageRes.json();
          if (rxnPageData.data) rxnRows = rxnRows.concat(rxnPageData.data);
          rxnNext = rxnPageData.paging && rxnPageData.paging.next ? rxnPageData.paging.next : null;
        }
        // Log a sample so we can verify Meta is returning the full reaction
        // breakdown (like, love, haha, wow, sad, angry) and not just 'like'.
        if (rxnRows.length > 0) {
          var sample = rxnRows.find(function(r) { return r.action_reactions && r.action_reactions.length > 0; });
          if (sample) console.log("[action_reactions] sample from " + account.name + ":", JSON.stringify(sample.action_reactions));
          else console.log("[action_reactions] " + account.name + ": " + rxnRows.length + " rows but none had action_reactions populated");
        }
        rxnRows.forEach(function(rr) {
          if (!rr.action_reactions || !Array.isArray(rr.action_reactions)) return;
          var rawPub = String(rr.publisher_platform || "facebook").toLowerCase();
          var pub;
          if (rawPub === "instagram" || rawPub === "threads") pub = "instagram";
          else if (rawPub === "facebook" || rawPub === "audience_network" || rawPub === "messenger" || rawPub === "oculus") pub = "facebook";
          else return;
          var uniqueIdRx = rr.campaign_id + "_" + pub;
          var row = rowMap[uniqueIdRx];
          if (!row) return;
          rr.action_reactions.forEach(function(ar) {
            var rt = String(ar.action_type || "").toLowerCase();
            if (row.reactionsByType[rt] !== undefined) row.reactionsByType[rt] += parseInt(ar.value || 0, 10);
          });
        });
      } catch (rxnErr) { console.error("Meta action_reactions breakdown error", account.name, rxnErr); }

      // Ad-level publisher_platform SUPPLEMENT. Meta's campaign-level
      // publisher_platform breakdown sometimes silently drops a publisher
      // row for certain objectives / attribution models (confirmed on
      // Willowbrook, campaign-level returned Facebook only while ad-level
      // clearly showed Instagram delivery with leads). The /api/ads
      // endpoint already uses level=ad + publisher_platform and produces
      // correct IG rows, the Creative tab's Best Performers proves this.
      // We rerun the same breakdown here at ad level and, for any
      // (campaign, publisher) combination missing from rowMap, synthesise
      // the row from the aggregated ad data. Rows that ARE present at
      // campaign level stay untouched so the authoritative-total
      // reconciliation below keeps working.
      try {
        var adSuppUrl = "https://graph.facebook.com/v25.0/" + account.id + "/insights?fields=ad_id,campaign_id,campaign_name,impressions,reach,spend,clicks,actions&time_range=" + timeRange + "&level=ad&breakdowns=publisher_platform&limit=500&access_token=" + metaToken;
        var adSuppRows = [];
        var adSuppNext = adSuppUrl;
        var adSuppGuard = 0;
        while (adSuppNext && adSuppGuard < 10) {
          adSuppGuard++;
          var adSuppRes = await fetch(adSuppNext);
          if (!adSuppRes.ok) break;
          var adSuppJson = await adSuppRes.json();
          if (adSuppJson.data) adSuppRows = adSuppRows.concat(adSuppJson.data);
          adSuppNext = adSuppJson.paging && adSuppJson.paging.next ? adSuppJson.paging.next : null;
        }
        // Aggregate ad rows to (campaign_id, publisher_family).
        var adAgg = {};
        adSuppRows.forEach(function(r) {
          var rawPub = String(r.publisher_platform || "facebook").toLowerCase();
          var platName = mapPubToPlat(r.publisher_platform || "facebook");
          if (!platName) return;
          if (!(parseFloat(r.impressions) > 0 || parseFloat(r.spend) > 0)) return;
          var k = r.campaign_id + "_" + platName.toLowerCase();
          if (!adAgg[k]) {
            adAgg[k] = {
              campaign_id: r.campaign_id,
              campaign_name: r.campaign_name,
              platform: platName,
              impressions: 0, reach: 0, spend: 0, clicks: 0,
              leads: 0, appInstalls: 0, landingPageViews: 0, pageLikes: 0, reactionLikes: 0, pageFollows: 0, reactionsTotal: 0,
              actions: []
            };
          }
          var a = adAgg[k];
          a.impressions += parseFloat(r.impressions || 0);
          a.reach += parseFloat(r.reach || 0);
          a.spend += parseFloat(r.spend || 0);
          a.clicks += parseFloat(r.clicks || 0);
          if (r.actions) {
            r.actions.forEach(function(act) {
              var v = parseInt(act.value || 0, 10);
              if (act.action_type === "lead" || act.action_type === "onsite_web_lead" || act.action_type === "offsite_conversion.fb_pixel_lead" || act.action_type === "onsite_conversion.lead_grouped" || act.action_type === "offsite_complete_registration_add_meta_leads") a.leads += v;
              if (act.action_type === "app_custom_event.fb_mobile_activate_app" || act.action_type === "app_install" || act.action_type === "mobile_app_install" || act.action_type === "omni_app_install") a.appInstalls += v;
              if (act.action_type === "landing_page_view" || act.action_type === "omni_landing_page_view") a.landingPageViews += v;
              if (act.action_type === "page_like") a.pageLikes += v;
              if (act.action_type === "like") a.reactionLikes += v;
              if (act.action_type === "page_engagement") a.pageFollows += v;
              if (act.action_type === "post_reaction") a.reactionsTotal += v;
              a.actions.push(act);
            });
          }
        });
        // For any (campaign, publisher) missing from rowMap but present in
        // adAgg, create the rowMap entry from the aggregated ad data. These
        // are real-delivery rows, so DO NOT set awaitingDelivery.
        var supplementedKeys = [];
        Object.keys(adAgg).forEach(function(k) {
          if (rowMap[k]) return;
          var a = adAgg[k];
          var info = campaignInfo[a.campaign_id];
          if (!info) return; // skip campaigns not in this account's active list
          var rawMetaObj = String(info.objective || "").toUpperCase();
          var isFbPlacement = a.platform === "Facebook";
          var canonObj = (function() {
            var o = rawMetaObj;
            if (o.indexOf("APP_INSTALL") >= 0 || o.indexOf("APP_PROMOTION") >= 0) return "appinstall";
            if (o === "LEAD_GENERATION" || o === "OUTCOME_LEADS") return "leads";
            if (o === "PAGE_LIKES" || o === "POST_ENGAGEMENT" || o === "OUTCOME_ENGAGEMENT" || o === "EVENT_RESPONSES") return "followers";
            if (o === "LINK_CLICKS" || o === "OUTCOME_TRAFFIC" || o === "REACH" || o === "BRAND_AWARENESS" || o === "OUTCOME_AWARENESS" || o === "VIDEO_VIEWS") return "landingpage";
            if (o === "CONVERSIONS" || o === "OUTCOME_SALES" || o === "PRODUCT_CATALOG_SALES") return "leads";
            return objectiveFromName(a.campaign_name || "");
          })();
          var pageLikes = a.pageLikes;
          if (canonObj === "followers" && isFbPlacement && a.reactionLikes > pageLikes) pageLikes = a.reactionLikes;
          seenIds[a.campaign_id] = true;
          rowMap[k] = {
            platform: a.platform,
            metaPlatform: a.platform.toLowerCase(),
            accountName: account.name + (account.name.indexOf("Meta")<0 && account.name.indexOf("meta")<0 ? " Meta" : ""),
            accountId: account.id,
            campaignId: k,
            rawCampaignId: a.campaign_id,
            campaignName: a.campaign_name,
            objective: canonObj,
            _sumImpressions: a.impressions,
            _sumSpend: a.spend,
            _sumClicks: a.clicks,
            _sumReachPublisher: a.reach,
            leads: a.leads,
            appInstalls: a.appInstalls,
            landingPageViews: a.landingPageViews,
            pageLikes: pageLikes,
            pageFollows: a.pageFollows,
            actions: a.actions,
            reactionsByType: { like: 0, love: 0, haha: 0, wow: 0, sad: 0, angry: 0 },
            reactionsTotal: a.reactionsTotal
          };
          supplementedKeys.push(k);
        });
        // Always log the supplement's result so we can reason about empty
        // findings (algorithm genuinely not delivering to IG at any level)
        // vs silent failures. Extended with a per-key raw-number summary so
        // the log is self-sufficient for triage without needing to correlate
        // against the insights dump.
        var adAggSummary = Object.keys(adAgg).map(function(k) {
          var a = adAgg[k];
          return k + " imps=" + Math.round(a.impressions) + " spend=" + a.spend.toFixed(2) + " leads=" + a.leads;
        });
        console.log("[campaigns] " + account.name + " ad-level supplement ran, " +
          "adLevelRowCount=" + adSuppRows.length + ", " +
          "adAggKeys=" + Object.keys(adAgg).length + ", " +
          "supplementedKeys=" + supplementedKeys.length,
          { adAggSummary: adAggSummary, supplemented: supplementedKeys }
        );
        // Stash on the account-scoped diag so the final response can carry
        // the findings back to the dashboard for admin inspection.
        if (typeof supplementDiag !== "undefined") {
          supplementDiag.push({
            account: account.name,
            adLevelRowCount: adSuppRows.length,
            adAggKeys: Object.keys(adAgg),
            supplementedKeys: supplementedKeys
          });
        }
      } catch (adSuppErr) {
        console.warn("[campaigns] ad-level publisher_platform supplement failed", account.name, adSuppErr && adSuppErr.message);
      }

      // Synthesise zero-delivery rows for configured-but-undelivered
      // placements. Every configured Facebook / Instagram placement gets a
      // row even when Meta's delivery algorithm has not allocated any spend
      // to it in the requested window. Without this, a Willowbrook-style
      // campaign that runs on both FB and IG but has only delivered to FB
      // so far shows up in the report as "Facebook only", which looked like
      // we were hiding data. The awaitingDelivery flag lets the dashboard
      // surface "IG is configured, 0 delivery in this period" honestly.
      Object.keys(configuredPlacements).forEach(function(cid) {
        var info = campaignInfo[cid];
        if (!info) return; // only synthesise for campaigns in this account's active list
        var configured = configuredPlacements[cid];
        ["Facebook", "Instagram"].forEach(function(platName) {
          if (!configured[platName]) return;
          var uniqueId = cid + "_" + platName.toLowerCase();
          if (rowMap[uniqueId]) return; // already have real delivery data
          seenIds[cid] = true;
          rowMap[uniqueId] = {
            platform: platName,
            metaPlatform: platName.toLowerCase(),
            accountName: account.name + (account.name.indexOf("Meta")<0 && account.name.indexOf("meta")<0 ? " Meta" : ""),
            accountId: account.id,
            campaignId: uniqueId,
            rawCampaignId: cid,
            campaignName: info.name || ("Campaign " + cid),
            objective: objectiveFromName(info.name || ""),
            _sumImpressions: 0, _sumSpend: 0, _sumClicks: 0, _sumReachPublisher: 0,
            leads: 0, appInstalls: 0, landingPageViews: 0, pageLikes: 0, pageFollows: 0,
            actions: [],
            reactionsByType: { like: 0, love: 0, haha: 0, wow: 0, sad: 0, angry: 0 },
            reactionsTotal: 0,
            awaitingDelivery: true
          };
        });
      });

      // Diagnostic log, so we can verify in Vercel logs what Meta returned
      // for each campaign's publisher_platform breakdown vs what adsets
      // actually have configured. Fires once per account so log volume stays
      // manageable.
      try {
        console.log("[campaigns] " + account.name + " publisher_platform diagnostics", {
          campaigns: Object.keys(pubDiag).map(function(cid) {
            var info = campaignInfo[cid] || {};
            var pubs = pubDiag[cid];
            var pubSummary = Object.keys(pubs).map(function(p) {
              return p + " imps=" + Math.round(pubs[p].imps) + " spend=" + pubs[p].spend.toFixed(2);
            }).join(" | ");
            var configured = configuredPlacements[cid] ? Object.keys(configuredPlacements[cid]).join("+") : "(unknown)";
            return (info.name || cid) + " [configured=" + configured + "] " + pubSummary;
          }),
          unknownPlacements: Object.keys(unknownPubs).length > 0 ? unknownPubs : "(none)"
        });
      } catch (diagErr) { /* non-fatal */ }

      // Apportion authoritative campaign-level totals (reach, spend,
      // impressions, clicks) across merged FB / IG rows by that row's
      // publisher-split share so the dashboard totals match what Meta
      // reports at the campaign level. Without this, reconcile flags
      // ~1-3% yellow deltas on spend because the publisher_platform
      // breakdown rounds differently than the campaign-level aggregate.
      var campTotalImps = {};
      var campTotalSpendPub = {};
      var campTotalClicksPub = {};
      Object.keys(rowMap).forEach(function(k) {
        var r = rowMap[k];
        campTotalImps[r.rawCampaignId] = (campTotalImps[r.rawCampaignId] || 0) + r._sumImpressions;
        campTotalSpendPub[r.rawCampaignId] = (campTotalSpendPub[r.rawCampaignId] || 0) + r._sumSpend;
        campTotalClicksPub[r.rawCampaignId] = (campTotalClicksPub[r.rawCampaignId] || 0) + r._sumClicks;
      });

      Object.keys(rowMap).forEach(function(k) {
        var r = rowMap[k];
        var cidStr = String(r.rawCampaignId);
        var authReach = reachMap[cidStr];
        var authSpend = spendMap[cidStr];
        var authImps = impsMap[cidStr];
        var authClicks = clicksMap[cidStr];
        var totalImps = campTotalImps[r.rawCampaignId] || 0;
        var totalSpendPub = campTotalSpendPub[r.rawCampaignId] || 0;
        var totalClicksPub = campTotalClicksPub[r.rawCampaignId] || 0;
        var reachForRow;
        if (authReach && totalImps > 0) {
          reachForRow = Math.round(authReach * (r._sumImpressions / totalImps));
        } else {
          reachForRow = r._sumReachPublisher;
        }
        // Scale spend / imps / clicks to match campaign-level authoritative.
        // Keep the publisher split proportional to the raw publisher rows.
        var spendForRow = r._sumSpend;
        var impsForRow = r._sumImpressions;
        var clicksForRow = r._sumClicks;
        if (authSpend && totalSpendPub > 0) spendForRow = authSpend * (r._sumSpend / totalSpendPub);
        if (authImps && totalImps > 0) impsForRow = Math.round(authImps * (r._sumImpressions / totalImps));
        if (authClicks && totalClicksPub > 0) clicksForRow = Math.round(authClicks * (r._sumClicks / totalClicksPub));
        var impsStr = impsForRow.toString();
        var spendStr = spendForRow.toFixed(2);
        var clicksStr = clicksForRow.toString();
        var reachStr = reachForRow.toString();
        var cpm = impsForRow > 0 ? ((spendForRow / impsForRow) * 1000).toFixed(2) : "0";
        var cpc = clicksForRow > 0 ? (spendForRow / clicksForRow).toFixed(2) : "0";
        var ctr = impsForRow > 0 ? ((clicksForRow / impsForRow) * 100).toFixed(2) : "0";
        var freq = reachForRow > 0 ? (impsForRow / reachForRow).toFixed(2) : "0";
        var _info = campaignInfo[r.rawCampaignId] || {};
        allCampaigns.push({
          platform: r.platform,
          metaPlatform: r.metaPlatform,
          accountName: r.accountName,
          accountId: r.accountId,
          campaignId: r.campaignId,
          rawCampaignId: r.rawCampaignId,
          campaignName: r.campaignName,
          objective: r.objective || "unknown",
          impressions: impsStr,
          reach: reachStr,
          frequency: freq,
          spend: spendStr,
          cpm: cpm,
          cpc: cpc,
          ctr: ctr,
          clicks: clicksStr,
          leads: r.leads.toString(),
          appInstalls: r.appInstalls.toString(),
          landingPageViews: r.landingPageViews.toString(),
          pageLikes: r.pageLikes.toString(),
          pageFollows: r.pageFollows.toString(),
          costPerLead: r.leads > 0 ? (spendForRow / r.leads).toFixed(2) : "0",
          costPerInstall: r.appInstalls > 0 ? (spendForRow / r.appInstalls).toFixed(2) : "0",
          actions: r.actions || [],
          reactionsByType: r.reactionsByType || { like: 0, love: 0, haha: 0, wow: 0, sad: 0, angry: 0 },
          reactionsTotal: r.reactionsTotal || 0,
          startDate: _info.startTime ? _info.startTime.substring(0,10) : "",
          endDate: _info.stopTime ? _info.stopTime.substring(0,10) : "",
          status: _info.status ? _info.status.toLowerCase().replace('campaign_paused','paused').replace('adset_paused','paused') : "active",
          // Budget fields are campaign-level, the same value appears on
          // both the FB and IG variant rows of a Meta campaign. Dashboard
          // sums budget deduped by rawCampaignId to avoid double-count.
          budgetAmount: _info.budgetAmount || null,
          budgetDaily: _info.budgetDaily || null,
          budgetMode: _info.budgetMode || "unset",
          budgetFlightDays: _info.budgetFlightDays || null,
          // Flag zero-delivery rows synthesised from adset placement config
          // so the dashboard can label them "awaiting delivery" instead of
          // presenting them as active placements.
          awaitingDelivery: r.awaitingDelivery === true
        });
      });
    } catch (err) { console.error("Meta insights error for", account.name, err); warnings.push({ platform: "Meta", account: account.name, stage: "insights", message: String(err && err.message || err) }); }

    Object.keys(campaignInfo).forEach(function(cid) {
      if (!seenIds[cid] && campaignInfo[cid] && campaignInfo[cid].status === "SCHEDULED") {
        var si = campaignInfo[cid];
        allCampaigns.push({ platform: "Facebook", metaPlatform: "facebook", accountName: account.name + (account.name.indexOf("Meta")<0&&account.name.indexOf("meta")<0?" Meta":""), accountId: account.id, campaignId: cid + "_facebook", rawCampaignId: cid, campaignName: si.name, objective: objectiveFromName(si.name), impressions: "0", reach: "0", frequency: "0", spend: "0", cpm: "0", cpc: "0", ctr: "0", clicks: "0", leads: "0", appInstalls: "0", landingPageViews: "0", pageLikes: "0", costPerLead: "0", costPerInstall: "0", actions: [], status: "scheduled", budgetAmount: si.budgetAmount || null, budgetDaily: si.budgetDaily || null, budgetMode: si.budgetMode || "unset", budgetFlightDays: si.budgetFlightDays || null });
      }
    });
  }

  try {
    var ttNames = {};
    var ttStatuses = {};
    var ttObjectives = {};
    var ttBudgets = {};
    // TikTok budget + scheduling fields. TikTok amounts are already in
    // the account currency unit (ZAR), no conversion needed.
    // objective_type is the definitive App Install signal on TikTok.
    // schedule_type + schedule_start_time + schedule_end_time are adgroup-
    // level fields on TikTok (the API rejects the whole request if you
    // request them at campaign level), so flight dates can't be read
    // from campaign/get/. Budget mode still drives pacing logic —
    // ongoing vs lifetime — just without day counting.
    var ttCampFields = encodeURIComponent(JSON.stringify(["campaign_id","campaign_name","operation_status","objective_type","budget","budget_mode"]));
    var ttListUrl = "https://business-api.tiktok.com/open_api/v1.3/campaign/get/?advertiser_id=" + ttAdvId + "&page_size=500&fields=" + ttCampFields;
    var ttListRes = await fetch(ttListUrl, {headers: {"Access-Token": ttToken}});
    var ttListData = await ttListRes.json();
    if (ttListData && ttListData.code && ttListData.code !== 0) {
      console.error("TikTok campaign/get error", ttListData.code, ttListData.message);
      warnings.push({ platform: "TikTok", stage: "campaign-list", message: "code " + ttListData.code + ": " + (ttListData.message || "unknown") });
    }
    if (ttListData.data && ttListData.data.list) {
      for (var l = 0; l < ttListData.data.list.length; l++) {
        var ttCamp = ttListData.data.list[l];
        ttNames[ttCamp.campaign_id] = ttCamp.campaign_name;
        ttStatuses[ttCamp.campaign_id] = ttCamp.operation_status;
        var ttObj = String(ttCamp.objective_type || "").toUpperCase();
        var ttCanonObj;
        if (ttObj === "APP_PROMOTION" || ttObj === "APP_INSTALL" || ttObj.indexOf("APP") >= 0) ttCanonObj = "appinstall";
        else if (ttObj === "LEAD_GENERATION") ttCanonObj = "leads";
        else if (ttObj === "ENGAGEMENT" || ttObj === "COMMUNITY_INTERACTION" || ttObj === "VIDEO_VIEWS") ttCanonObj = "followers";
        else if (ttObj === "TRAFFIC" || ttObj === "REACH" || ttObj === "WEB_CONVERSIONS") ttCanonObj = "landingpage";
        else ttCanonObj = objectiveFromName(ttCamp.campaign_name || "");
        ttObjectives[ttCamp.campaign_id] = ttCanonObj;
        var ttMode = String(ttCamp.budget_mode || "").toUpperCase();
        var ttRawBudget = parseFloat(ttCamp.budget || 0);
        var ttBudgetCalc;
        if (ttMode === "BUDGET_MODE_INFINITE") {
          ttBudgetCalc = { budgetMode: "infinite", budgetAmount: null, budgetDaily: null };
        } else if (ttMode === "BUDGET_MODE_TOTAL") {
          ttBudgetCalc = buildBudget({ lifetimeBudget: ttRawBudget });
        } else if (ttMode === "BUDGET_MODE_DAY" || ttMode === "BUDGET_MODE_DYNAMIC_DAILY_BUDGET") {
          ttBudgetCalc = buildBudget({ dailyBudget: ttRawBudget });
        } else {
          ttBudgetCalc = { budgetMode: "unset", budgetAmount: null, budgetDaily: null };
        }
        ttBudgets[ttCamp.campaign_id] = ttBudgetCalc;
      }
    }

    var dims = encodeURIComponent(JSON.stringify(["campaign_id"]));
    var metrics = encodeURIComponent(JSON.stringify(["spend","impressions","reach","clicks","cpm","cpc","ctr","follows","likes","comments","shares"]));
    // Match ads.js's proven report URL shape (no `page` param).
    var ttUrl = "https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/?advertiser_id=" + ttAdvId + "&report_type=BASIC&data_level=AUCTION_CAMPAIGN&dimensions=" + dims + "&metrics=" + metrics + "&start_date=" + from + "&end_date=" + to + "&page_size=500";
    var ttRes = await fetch(ttUrl, {headers: {"Access-Token": ttToken}});
    var ttRaw = await ttRes.text();
    var ttSeenIds = {};

    try {
      var ttData = JSON.parse(ttRaw);
      if (ttData.data && ttData.data.list) {
        for (var n = 0; n < ttData.data.list.length; n++) {
          var tc = ttData.data.list[n];
          var tm = tc.metrics;
          if (parseFloat(tm.impressions) > 0 || parseFloat(tm.spend) > 0) {
            ttSeenIds[tc.dimensions.campaign_id] = true;
            var ttStatus = ttStatuses[tc.dimensions.campaign_id] === "ENABLE" ? "active" : ttStatuses[tc.dimensions.campaign_id] === "DISABLE" ? "paused" : "completed";
            var ttB = ttBudgets[tc.dimensions.campaign_id] || {};
            allCampaigns.push({ platform: "TikTok", metaPlatform: "tiktok", accountName: "MTN MoMo TikTok", accountId: ttAdvId, campaignId: tc.dimensions.campaign_id, rawCampaignId: tc.dimensions.campaign_id, campaignName: ttNames[tc.dimensions.campaign_id] || "TikTok Campaign " + tc.dimensions.campaign_id, objective: ttObjectives[tc.dimensions.campaign_id] || objectiveFromName(ttNames[tc.dimensions.campaign_id] || ""), impressions: tm.impressions, reach: tm.reach || "0", frequency: (parseFloat(tm.reach||0)>0?(parseFloat(tm.impressions)/parseFloat(tm.reach)).toFixed(2):"0"), spend: tm.spend, cpm: tm.cpm || "0", cpc: tm.cpc || "0", ctr: (parseFloat(tm.impressions||0)>0?(parseFloat(tm.clicks||0)/parseFloat(tm.impressions)*100).toFixed(2):"0"), clicks: tm.clicks, follows: tm.follows || "0", likes: tm.likes || "0", leads: "0", appInstalls: "0", landingPageViews: "0", pageLikes: "0", costPerLead: "0", costPerInstall: "0", startDate: "", endDate: "", status: ttStatus, budgetAmount: ttB.budgetAmount || null, budgetDaily: ttB.budgetDaily || null, budgetMode: ttB.budgetMode || "unset", budgetFlightDays: ttB.budgetFlightDays || null });
          }
        }
      }
    } catch (parseErr) { console.error("TikTok parse error", parseErr); }

    Object.keys(ttNames).forEach(function(tid) {
      if (!ttSeenIds[tid]) {
        var ttB2 = ttBudgets[tid] || {};
        allCampaigns.push({ platform: "TikTok", metaPlatform: "tiktok", accountName: "MTN MoMo TikTok", accountId: ttAdvId, campaignId: tid, rawCampaignId: tid, campaignName: ttNames[tid], objective: ttObjectives[tid] || objectiveFromName(ttNames[tid]), impressions: "0", reach: "0", frequency: "0", spend: "0", cpm: "0", cpc: "0", ctr: "0", clicks: "0", follows: "0", likes: "0", leads: "0", appInstalls: "0", landingPageViews: "0", pageLikes: "0", costPerLead: "0", costPerInstall: "0", status: "active", startDate: "", endDate: "", budgetAmount: ttB2.budgetAmount || null, budgetDaily: ttB2.budgetDaily || null, budgetMode: ttB2.budgetMode || "unset", budgetFlightDays: ttB2.budgetFlightDays || null });
      }
    });
  } catch (ttErr) { console.error("TikTok campaigns error", ttErr); warnings.push({ platform: "TikTok", stage: "campaigns", message: String(ttErr && ttErr.message || ttErr) }); }

  // Google Ads
  try {
    var gClientId = process.env.GOOGLE_ADS_CLIENT_ID;
    var gClientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
    var gRefreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
    var gDevToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    var gManagerId = process.env.GOOGLE_ADS_MANAGER_ID;
    var gCustomerId = "9587382256";
    if (gClientId && gRefreshToken && gDevToken) {
      var gTokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {"Content-Type": "application/x-www-form-urlencoded"},
        body: "client_id=" + gClientId + "&client_secret=" + gClientSecret + "&refresh_token=" + gRefreshToken + "&grant_type=refresh_token"
      });
      var gTokenData = await gTokenRes.json();
      if (gTokenData.access_token) {
        // campaign_budget.* joins on the campaign through Google's automatic
        // relation. amount_micros -> ZAR via /1,000,000. period = DAILY / CUSTOM
        // (CUSTOM with an end_date acts like a lifetime cap).
        var gQuery = "SELECT campaign.name, campaign.id, campaign.status, campaign.start_date, campaign.end_date, campaign.advertising_channel_type, campaign.advertising_channel_sub_type, campaign_budget.amount_micros, campaign_budget.period, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.ctr, metrics.conversions FROM campaign WHERE segments.date BETWEEN '" + from + "' AND '" + to + "' AND campaign.status != 'REMOVED' ORDER BY metrics.cost_micros DESC";
        var gRes = await fetch("https://googleads.googleapis.com/v21/customers/" + gCustomerId + "/googleAds:search", {
          method: "POST",
          headers: {
            "Authorization": "Bearer " + gTokenData.access_token,
            "developer-token": gDevToken,
            "login-customer-id": gManagerId,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({query: gQuery})
        });
        if (gRes.status === 200) {
          var gData = await gRes.json();
          var gResults = gData.results || [];
          for (var g = 0; g < gResults.length; g++) {
            var gr = gResults[g];
            var gc = gr.campaign;
            var gm = gr.metrics;
            var gSpend = parseFloat(gm.costMicros || 0) / 1000000;
            var gClicks = parseInt(gm.clicks || 0);
            var gImps = parseInt(gm.impressions || 0);
            var gConv = parseFloat(gm.conversions || 0);
            if (gImps > 0 || gSpend > 0) {
              var gPlatform = "Google Display";
              var gName = gc.name || "";
              if (gName.toLowerCase().indexOf("youtube") >= 0) gPlatform = "YouTube";
              // Classify the Google campaign BEFORE pushing so we can scope
              // conversions -> leads only when it's actually a lead-gen
              // campaign. For a traffic / landing-page Google campaign,
              // Google "conversions" are typically page-engagement events
              // (button clicks, page views) not real leads, counting them
              // as leads misleads the chat bot and email reports.
              // Google's advertising_channel_sub_type is the definitive
              // App Campaign signal — any UAC / App campaign surfaces as
              // "APP_CAMPAIGN" regardless of how the campaign is named.
              // Fall through to name-based detection for everything else.
              var gSubType = String((gc.advertisingChannelSubType || gc.advertising_channel_sub_type || "")).toUpperCase();
              var gChanType = String((gc.advertisingChannelType || gc.advertising_channel_type || "")).toUpperCase();
              var gObjective = (gSubType.indexOf("APP_CAMPAIGN") >= 0 || gChanType === "MULTI_CHANNEL") ? "appinstall" : objectiveFromName(gName);
              var gIsLeadsCampaign = gObjective === "leads";
              // Google budgets: CUSTOM period with an end_date means the
              // account-level budget is a total/lifetime figure, treat it
              // as the lifetime cap. DAILY is the common case — infer total
              // as daily × flight length if end_date is known, otherwise
              // show as ongoing daily. No end_date → we fall back to an
              // ongoing read.
              var gPeriod = String((gr.campaignBudget && gr.campaignBudget.period) || "").toUpperCase();
              var gBudgetAmt = gr.campaignBudget && gr.campaignBudget.amountMicros ? parseFloat(gr.campaignBudget.amountMicros) / 1000000 : 0;
              var gStart = gc.startDate || null;
              var gEnd = gc.endDate && gc.endDate !== "2037-12-30" ? gc.endDate : null; // Google sentinel end
              var gBudget;
              if (gBudgetAmt <= 0) gBudget = { budgetMode: "unset", budgetAmount: null, budgetDaily: null };
              else if (gPeriod === "CUSTOM") gBudget = buildBudget({ lifetimeBudget: gBudgetAmt, startTime: gStart, stopTime: gEnd });
              else gBudget = buildBudget({ dailyBudget: gBudgetAmt, startTime: gStart, stopTime: gEnd });
              allCampaigns.push({
                platform: gPlatform,
                metaPlatform: "google",
                accountName: "MTN MoMo Google",
                accountId: gCustomerId,
                campaignId: "google_" + gc.id,
                rawCampaignId: gc.id,
                campaignName: gName,
                objective: gObjective,
                impressions: gImps.toString(),
                // Google Ads does NOT expose unique-user reach. To keep the
                // blended frequency meaningful across the media mix we apply
                // a conservative industry-standard estimate of 2x frequency
                // on Google Display + YouTube, deriving reach as impressions / 2.
                // Every surface that consumes this row (charts, grand totals,
                // blended frequency) inherits the estimate automatically.
                reach: gImps > 0 ? Math.round(gImps / 2).toString() : "0",
                frequency: gImps > 0 ? "2.00" : "0",
                spend: gSpend.toFixed(2),
                cpm: gImps > 0 ? ((gSpend / gImps) * 1000).toFixed(2) : "0",
                cpc: gClicks > 0 ? (gSpend / gClicks).toFixed(2) : "0",
                ctr: gImps > 0 ? ((gClicks / gImps) * 100).toFixed(2) : "0",
                clicks: gClicks.toString(),
                conversions: gConv.toFixed(0),
                // Leads come from Google conversions ONLY on lead-gen
                // campaigns. Traffic / landing-page campaigns often have
                // non-lead conversions (engagement, page views) that must
                // not be reported as leads.
                leads: (gIsLeadsCampaign && gConv > 0) ? Math.round(gConv).toString() : "0",
                appInstalls: "0",
                landingPageViews: "0",
                pageLikes: "0",
                follows: "0",
                likes: "0",
                costPerLead: (gIsLeadsCampaign && gConv > 0) ? (gSpend / gConv).toFixed(2) : "0",
                costPerInstall: "0",
                actions: [],
                startDate: gStart || "", endDate: gEnd || "",
                status: gc.status === "ENABLED" ? "active" : "paused",
                budgetAmount: gBudget.budgetAmount || null,
                budgetDaily: gBudget.budgetDaily || null,
                budgetMode: gBudget.budgetMode || "unset",
                budgetFlightDays: gBudget.budgetFlightDays || null
              });
            }
          }
        }
      }
    }
  } catch (gErr) { console.error("Google Ads error", gErr); warnings.push({ platform: "Google", stage: "ads", message: String(gErr && gErr.message || gErr) }); }

  allCampaigns.sort(function(a, b) { return parseFloat(b.spend) - parseFloat(a.spend); });

  // Fetch page follower data
  var pageData = [];
  try {
    var pagesRes = await fetch("https://graph.facebook.com/v25.0/me/accounts?fields=name,id,fan_count,followers_count,access_token,instagram_business_account{id,username,followers_count}&limit=50&access_token=" + metaToken);
    var pagesJson = await pagesRes.json();
    if (pagesJson.data) {
      for (var pi = 0; pi < pagesJson.data.length; pi++) {
        var pg = pagesJson.data[pi];
        var pgToken = pg.access_token || metaToken;
        if (pg.instagram_business_account) {
          // Always initialize follower_growth so the field is present on the
          // response. Any failure path below leaves it at 0 rather than
          // undefined, so the dashboard's `|| 0` fallback can't mask a
          // silent IG insights failure as genuine zero growth.
          pg.instagram_business_account.follower_growth = 0;
          try {
            var igId = pg.instagram_business_account.id;
            var since = Math.floor(new Date(from).getTime() / 1000);
            var until = Math.floor(new Date(to + "T23:59:59").getTime() / 1000);
            var igUrl = "https://graph.facebook.com/v25.0/" + igId + "/insights?metric=follower_count&period=day&since=" + since + "&until=" + until + "&access_token=" + pgToken;
            var igRes = await fetch(igUrl);
            if (igRes.status === 200) {
              var igData = await igRes.json();
              if (igData.data && igData.data[0] && igData.data[0].values) {
                var totalGrowth = 0;
                for (var v = 0; v < igData.data[0].values.length; v++) { totalGrowth += igData.data[0].values[v].value; }
                pg.instagram_business_account.follower_growth = totalGrowth;
              }
            }
          } catch (igErr) { console.error("IG insights error", igErr); }
        }
        delete pg.access_token;
      }
      pageData = pagesJson.data;
    }
  } catch (pgErr) { console.error("Pages error", pgErr); }


  // Build the full (unfiltered) response once, cache it keyed by date
  // range so dashboard + email preview + reconcile within the next 5 min
  // all reuse the same upstream data instead of re-fetching Meta +
  // TikTok + Google. Client-scoped filtering happens on read so admin
  // and client callers share one cache entry safely.
  // Diagnostic: per-platform objective breakdown so we can verify the
  // Summary-tab bucketing matches what the Objective Results Audit reports.
  // Surfaces classification drift (e.g. a TikTok APP_PROMOTION row
  // accidentally tagged 'unknown') immediately.
  var _objDiag = {};
  allCampaigns.forEach(function(c) {
    var plat = c.platform || "unknown";
    var obj = (c.objective || "unknown").toLowerCase();
    if (!_objDiag[plat]) _objDiag[plat] = {};
    if (!_objDiag[plat][obj]) _objDiag[plat][obj] = { count: 0, clicks: 0, spend: 0, names: [] };
    _objDiag[plat][obj].count++;
    _objDiag[plat][obj].clicks += parseFloat(c.clicks || 0);
    _objDiag[plat][obj].spend += parseFloat(c.spend || 0);
    if (_objDiag[plat][obj].names.length < 8) _objDiag[plat][obj].names.push(c.campaignName);
  });
  var fullResponse = { totalCampaigns: allCampaigns.length, dateFrom: from, dateTo: to, campaigns: allCampaigns, pages: pageData, warnings: warnings, objectiveDiagnostic: _objDiag, metaSupplementDiag: supplementDiag };
  campaignsResponseCache[cacheKey] = { data: fullResponse, ts: Date.now() };

  var principal = req.authPrincipal || { role: "admin" };
  if (principal.role === "client") {
    var idSet = {}; (principal.allowedCampaignIds || []).forEach(function(x) { idSet[String(x)] = true; });
    var filteredCamps = allCampaigns.filter(function(c) {
      return idSet[String(c.campaignId || "")] === true;
    });
    res.status(200).json({ totalCampaigns: filteredCamps.length, dateFrom: from, dateTo: to, campaigns: filteredCamps, pages: filterPagesForPrincipal(pageData, principal), warnings: warnings });
    return;
  }
  res.status(200).json(fullResponse);
}