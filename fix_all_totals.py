with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Check all places where we add m + t but miss gd

# 1. Awareness insight - total reach
c = c.replace(
    'var totalReach=computed.fb.reach+computed.ig.reach+t.reach;',
    'var totalReach=computed.fb.reach+computed.ig.reach+t.reach+computed.gd.reach;'
)

# 2. Awareness insight - platforms listed
c = c.replace(
    '+(t.impressions>0?" and TikTok":"")',
    '+(t.impressions>0?" TikTok":"")+(computed.gd.impressions>0?" and Google Display":"")'
)

# 3. Awareness grand total reach in table
c = c.replace(
    '{fmt(m.reach+t.reach+computed.gd.reach)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid #002a40"',
    '{fmt(m.reach+t.reach+computed.gd.reach)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid #002a40"'
)

# 4. Awareness grand total frequency - include Google
c = c.replace(
    '{(m.reach+t.reach)>0?((m.impressions+t.impressions)/(m.reach+t.reach)).toFixed(2)+"x":"0"}',
    '{(m.reach+t.reach+computed.gd.reach)>0?((m.impressions+t.impressions+computed.gd.impressions)/(m.reach+t.reach+computed.gd.reach)).toFixed(2)+"x":"0"}'
)

# 5. Engagement grand total reach
c = c.replace(
    'fmt(m.reach+t.reach+computed.gd.reach)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.ember,fontFamily:fm,fontSize:15,fontWeight:900}}>{fmt(computed.totalClicks)}',
    'fmt(m.reach+t.reach+computed.gd.reach)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.ember,fontFamily:fm,fontSize:15,fontWeight:900}}>{fmt(computed.totalClicks)}'
)

# 6. Engagement grand total CTR - use totalClicks/totalImps
c = c.replace(
    '{pc(computed.totalImps>0?((m.clicks+t.clicks)/computed.totalImps)*100:0)}',
    '{pc(computed.totalImps>0?(computed.totalClicks/computed.totalImps)*100:0)}'
)

# 7. Engagement grand total CPC
c = c.replace(
    '{fR((m.clicks+t.clicks)>0?computed.totalSpend/(m.clicks+t.clicks):0)}',
    '{fR(computed.totalClicks>0?computed.totalSpend/computed.totalClicks:0)}'
)

# 8. Community growth section - check if it references m+t without gd
# This is fine since community growth is only FB likes, IG follows, TT follows - Google doesn't have these

# 9. Check engagement insight references Google
if 'computed.gd.clicks>0' not in c.split('Engagement')[1].split('</Insight>')[0] if 'Engagement' in c else True:
    # Add Google Display to engagement insight
    old_tt_engage = 'if(t.clicks>0){parts.push("TikTok contributed "+fmt(t.clicks)+" clicks"'
    new_tt_engage = 'if(computed.gd.clicks>0){parts.push("Google Display generated "+fmt(computed.gd.clicks)+" clicks at "+fR(computed.gd.cpc)+" CPC with "+pc(computed.gd.ctr)+" CTR, extending campaign reach across Google\'s display network and partner sites.");}if(t.clicks>0){parts.push("TikTok contributed "+fmt(t.clicks)+" clicks"'
    c = c.replace(old_tt_engage, new_tt_engage)

# 10. Awareness insight - add Google Display mention
old_tt_aware = 'if(t.impressions>0){var ttShare'
new_tt_aware = 'if(computed.gd.impressions>0){var gdShare=computed.totalImps>0?((computed.gd.impressions/computed.totalImps)*100).toFixed(1):"0";parts.push("Google Display delivers "+gdShare+"% of campaign impressions ("+fmt(computed.gd.impressions)+") at "+fR(computed.gd.cpm)+" CPM, extending brand presence across Google\'s display network and premium publisher inventory.");}if(t.impressions>0){var ttShare'
c = c.replace(old_tt_aware, new_tt_aware)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - all totals and insights include Google Display")
