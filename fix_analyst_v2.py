with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Add SA industry benchmarks and pacing calc after var m=computed.meta
old_m = 'var m=computed.meta,t=computed.tt;'
new_m = """var m=computed.meta,t=computed.tt;
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
  var freqStatus=m.frequency>4?"critical":m.frequency>3?"warning":m.frequency>2?"healthy":"early";"""

c = c.replace(old_m, new_m)
print("Added benchmarks, pacing, frequency status")

# Now enhance the Reporting tab per-objective insights
# Add benchmark context to App Store Clicks
old_app_start = 'if(objName==="App Store Clicks"){p.push("App store click campaigns invested "+fR(totalSpend)+" to deliver "+fmt(totalResults)+" clicks to the app store at "+fR(totalCostPer)+" blended Cost Per Click with a "+blendedCtr.toFixed(2)+"% Click Through Rate.")'
new_app_start = 'if(objName==="App Store Clicks"){p.push("App store click campaigns invested "+fR(totalSpend)+" to deliver "+fmt(totalResults)+" clicks to the app store at "+fR(totalCostPer)+" blended Cost Per Click, "+benchLabel(totalCostPer,benchmarks.meta.cpc)+", with a "+blendedCtr.toFixed(2)+"% Click Through Rate.")'
c = c.replace(old_app_start, new_app_start)
print("App Store: added benchmark")

# Add benchmark to Landing Page
old_lp_start = 'if(objName==="Landing Page Clicks"){p.push("Landing page campaigns invested "+fR(totalSpend)+" generating "+fmt(totalResults)+" qualified site visits at "+fR(totalCostPer)+" blended cost per visit with "+blendedCtr.toFixed(2)+"% Click Through Rate.")'
new_lp_start = 'if(objName==="Landing Page Clicks"){p.push("Landing page campaigns invested "+fR(totalSpend)+" generating "+fmt(totalResults)+" qualified site visits at "+fR(totalCostPer)+" blended cost per visit, "+benchLabel(totalCostPer,benchmarks.meta.cpc)+", with "+blendedCtr.toFixed(2)+"% Click Through Rate.")'
c = c.replace(old_lp_start, new_lp_start)
print("Landing Page: added benchmark")

# Add benchmark to Leads
old_leads_start = 'if(objName==="Leads"){var convRate=totalClicks>0?(totalResults/totalClicks*100):0;p.push("Lead generation campaigns invested "+fR(totalSpend)+" producing "+fmt(totalResults)+" qualified leads at "+fR(totalCostPer)+" Cost Per Lead with a "+convRate.toFixed(1)+"% click-to-lead conversion rate.")'
new_leads_start = 'if(objName==="Leads"){var convRate=totalClicks>0?(totalResults/totalClicks*100):0;p.push("Lead generation campaigns invested "+fR(totalSpend)+" producing "+fmt(totalResults)+" qualified leads at "+fR(totalCostPer)+" Cost Per Lead, "+benchLabel(totalCostPer,benchmarks.meta.cpl)+", with a "+convRate.toFixed(1)+"% click-to-lead conversion rate.")'
c = c.replace(old_leads_start, new_leads_start)
print("Leads: added benchmark")

# Add benchmark to Followers
old_fol_start = 'if(objName==="Followers & Likes"){p.push("Community growth campaigns invested "+fR(totalSpend)+" acquiring "+fmt(totalResults)+" new followers and likes at "+fR(totalCostPer)+" blended cost per acquisition.")'
new_fol_start = 'if(objName==="Followers & Likes"){p.push("Community growth campaigns invested "+fR(totalSpend)+" acquiring "+fmt(totalResults)+" new followers and likes at "+fR(totalCostPer)+" blended cost per acquisition, "+benchLabel(totalCostPer,benchmarks.meta.cpf)+".")'
c = c.replace(old_fol_start, new_fol_start)
print("Followers: added benchmark")

# Add frequency + pacing context to the main Objective Performance Assessment (line 370)
old_obj_assess = """p.push("The campaign\\'s bottom-of-funnel performance represents the critical conversion layer where media investment translates into measurable business outcomes. Across "+sel.length+" active placements with "+fR(allSpend)+" total investment, the campaign generated "+fmt(allClicks)+" measurable actions.");"""

new_obj_assess = """var pacingNote="";if(pctElapsed>0){var spendPct=allSpend>0?(allSpend/projectedSpend*100):0;if(spendPct>pctElapsed*1.15){pacingNote=" Budget pacing is running "+(spendPct-pctElapsed).toFixed(0)+"% ahead of schedule at "+pctElapsed.toFixed(0)+"% through the period, indicating potential early budget depletion if not moderated.";}else if(spendPct<pctElapsed*0.85){pacingNote=" Budget pacing is running "+(pctElapsed-spendPct).toFixed(0)+"% behind schedule, suggesting underdelivery that may require bid or audience adjustments to fully utilise the remaining budget.";}else{pacingNote=" Budget pacing is on track at "+pctElapsed.toFixed(0)+"% through the period with proportionate spend.";}}var freqNote="";if(freqStatus==="critical"){freqNote=" Meta frequency at "+m.frequency.toFixed(2)+"x has breached the 4x fatigue ceiling. Audience saturation is actively eroding engagement quality and inflating costs. Creative rotation and audience expansion are urgently needed.";}else if(freqStatus==="warning"){freqNote=" Meta frequency at "+m.frequency.toFixed(2)+"x is approaching the fatigue threshold. Proactive creative rotation within the next 48-72 hours will prevent CTR decay and CPC inflation.";}else if(freqStatus==="healthy"){freqNote=" Meta frequency at "+m.frequency.toFixed(2)+"x is within the optimal 2-3x recall window, balancing brand retention with efficient delivery.";}p.push("The campaign's objective performance layer spans "+sel.length+" active placements with "+fR(allSpend)+" total investment, generating "+fmt(allClicks)+" measurable actions."+pacingNote+freqNote);"""

c = c.replace(old_obj_assess, new_obj_assess)
print("Objective assessment: added pacing + frequency")

# Add benchmarks to Targeting tab per-objective insights
old_target_intro = 'p.push(objName+" targeting operates "+sorted6.length+" adsets across "+Object.keys(platGrp).join(", ")+" with "+fR(oSpend)+" total investment delivering "+fmt(oResults)+" results"+(oResults>0?" at "+fR(oCostPer)+" blended cost per result":"")+" and "+oCtr.toFixed(2)+"% Click Through Rate.");'

new_target_intro = 'var objBench=objName==="App Store Clicks"||objName==="Landing Page Clicks"?benchmarks.meta.cpc:objName==="Leads"?benchmarks.meta.cpl:benchmarks.meta.cpf;var benchNote=oCostPer>0?" This is "+benchLabel(oCostPer,objBench)+".":"";p.push(objName+" targeting operates "+sorted6.length+" adsets across "+Object.keys(platGrp).join(", ")+" with "+fR(oSpend)+" total investment delivering "+fmt(oResults)+" results"+(oResults>0?" at "+fR(oCostPer)+" blended cost per result":"")+" and "+oCtr.toFixed(2)+"% Click Through Rate."+benchNote);'

c = c.replace(old_target_intro, new_target_intro)
print("Targeting insights: added benchmarks")

# Add frequency context to targeting when relevant
old_target_zero = 'var zeroSpend=sorted6.filter(function(r){return r.spend>200&&r.result===0;});'
new_target_zero = 'if(freqStatus==="critical"||freqStatus==="warning"){var freqAdsets=sorted6.filter(function(r){return r.platform==="Facebook"||r.platform==="Instagram";});if(freqAdsets.length>0){p.push("Note: Meta frequency is at "+m.frequency.toFixed(2)+"x"+(freqStatus==="critical"?" which has breached the fatigue ceiling. Performance of Meta adsets in this objective may be suppressed by audience saturation.":" and approaching the fatigue threshold. Monitor Meta adset CTR closely for signs of diminishing returns."));}}var zeroSpend=sorted6.filter(function(r){return r.spend>200&&r.result===0;});'
c = c.replace(old_target_zero, new_target_zero)
print("Targeting insights: added frequency warning")

# Add benchmark context to the Targeting Health Scorecard insight
old_health_top = 'p.push("Top performers include "+strong.slice(0,2).map(function(s){return s.row.adsetName+" on "+s.row.platform+" ("+fmt(s.row.result)+" results at "+fR(s.row.costPer)+")"}).join(" and ")+". These adsets demonstrate strong audience-creative alignment and should be considered for increased budget allocation.")'
new_health_top = 'p.push("Top performers include "+strong.slice(0,2).map(function(s){var sb=s.row.platform==="TikTok"?benchmarks.tiktok.cpc:s.row.platform==="Google Display"?benchmarks.google.cpc:benchmarks.meta.cpc;return s.row.adsetName+" on "+s.row.platform+" ("+fmt(s.row.result)+" results at "+fR(s.row.costPer)+", "+benchLabel(s.row.costPer,sb)+")"}).join(" and ")+". These adsets demonstrate strong audience-creative alignment at proven scale and should be considered for increased budget allocation.")'
c = c.replace(old_health_top, new_health_top)
print("Health scorecard: added benchmarks to top performers")

# Add pacing to scorecard insight
old_health_realloc = 'if(strong.length>0&&weak.length>0){p.push("Reallocating budget from underperforming (red) adsets to proven (green) performers would improve overall campaign Return On Investment without increasing total media spend.");}'
new_health_realloc = 'if(strong.length>0&&weak.length>0){p.push("Reallocating budget from underperforming (red) adsets to proven (green) performers would improve overall campaign Return On Investment without increasing total media spend.");}if(freqStatus==="critical"||freqStatus==="warning"){p.push("Meta frequency at "+m.frequency.toFixed(2)+"x is "+(freqStatus==="critical"?"above the 4x saturation ceiling":"approaching the 3x fatigue threshold")+". This compounds the underperformance of weaker adsets, making reallocation and creative refresh more urgent.");}'
c = c.replace(old_health_realloc, new_health_realloc)
print("Health scorecard: added frequency context")

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("All analyst v2 fixes applied")
