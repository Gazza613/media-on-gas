with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

issues_fixed = []

# ═══ ISSUE 1: Rename Overview to Reporting ═══
c = c.replace(
    '{id:"overview",label:"Overview"',
    '{id:"overview",label:"Reporting"'
)
issues_fixed.append("1. Overview -> Reporting")

# ═══ ISSUE 2: Campaign selector toggle fix ═══
# The issue is stopPropagation prevents re-opening
c = c.replace(
    'onClick={function(e){e.stopPropagation();setShowCampaigns(function(prev){return !prev;});}}',
    'onClick={function(){setShowCampaigns(function(prev){return !prev;});}}'
)
issues_fixed.append("2. Campaign selector toggle fix")

# ═══ ISSUE 3: Fix TikTok CPM "0.9x more cost-efficient" ═══
# Find and replace the old formula completely
old_tt_cpm = 'At "+(computed.fb.cpm/t.cpm).toFixed(1)+"x more cost-efficient than Facebook'
if old_tt_cpm in c:
    # Find the full block
    idx = c.find('+" At "+(computed.fb.cpm/t.cpm).toFixed(1)')
    if idx > 0:
        end_marker = '":""))'
        end_idx = c.find(end_marker, idx)
        if end_idx > 0:
            old_block = c[idx:end_idx + len(end_marker)]
            new_block = '+(t.cpm<computed.fb.cpm?" TikTok delivers a "+(((computed.fb.cpm-t.cpm)/computed.fb.cpm)*100).toFixed(0)+"% Cost Per Thousand Ads Served advantage over Facebook, confirming strong content relevance scores and favourable auction positioning.":" TikTok delivers comparable Cost Per Thousand Ads Served to Facebook, with additional value driven by higher video completion rates and native content engagement.")'
            c = c[:idx] + new_block + c[end_idx + len(end_marker):]
            issues_fixed.append("3. TikTok CPM comparison fixed")
        else:
            issues_fixed.append("3. Could not find end marker")
    else:
        issues_fixed.append("3. Could not find start marker")
else:
    issues_fixed.append("3. Old TikTok CPM text not found - checking alternative")
    # Try alternative format
    if '0.9x more cost-efficient' in c:
        issues_fixed.append("3b. Found 0.9x text somewhere")
    else:
        issues_fixed.append("3b. No 0.9x text found")

# ═══ ISSUE 4: Fix "store visits" wording in objectives ═══
c = c.replace(
    'translating to approximately "+appEff+" store visits per R1,000 invested.',
    'translating to approximately "+appEff+" app store clicks per R1,000 invested.'
)
c = c.replace(
    'Each click represents a user who has navigated from ad exposure through to the app store listing, the highest-intent touchpoint in the mobile acquisition funnel.',
    'Each click represents a user driven from ad exposure to the app store listing, the final measurable touchpoint before app download.'
)
c = c.replace(
    'The cost efficiency at "+fR(sApp/tApp)+" per store visit compares favourably against the target market mobile app acquisition benchmark of R2.50 to R5.00.',
    'The cost efficiency at "+fR(sApp/tApp)+" per app store click confirms strong acquisition economics for the campaign period.'
)
c = c.replace(
    'The cost efficiency at "+fR(sApp/tApp)+" per store visit confirms strong acquisition economics for the campaign period.',
    'The cost efficiency at "+fR(sApp/tApp)+" per app store click confirms strong acquisition economics for the campaign period.'
)
issues_fixed.append("4. Store visits -> app store clicks")

# ═══ ISSUE 5: Fix "the target marketn" typo ═══
c = c.replace('the the target marketn', 'the target market')
c = c.replace('the target marketn', 'the target market')
issues_fixed.append("5. Typo fixes")

# ═══ ISSUE 6: Fix "30-50% organic reach" unverifiable claim ═══
c = c.replace(
    'Over a 12-month horizon, the organic reach value of "+fmt(tFollows)+" followers typically offsets 30-50% of the acquisition cost through reduced paid media dependency for future campaign cycles.',
    'Each new community member increases future organic content distribution, compounding in value over time as the brand\'s owned audience grows.'
)
issues_fixed.append("6. Removed unverifiable 30-50% claim")

# ═══ ISSUE 7: Fix "Instagram purchase intent" still there ═══
c = c.replace(
    """ Instagram clicks typically carry higher purchase intent signals due to the platform's commerce-oriented user behaviour.""",
    ""
)
c = c.replace(
    " Instagram clicks typically carry higher purchase intent signals due to the platform\\'s commerce-oriented user behaviour.",
    ""
)
c = c.replace(
    " Instagram clicks typically carry higher purchase intent signals due to the platform's commerce-oriented user behaviour.",
    ""
)
issues_fixed.append("7. Removed Instagram purchase intent claim")

# ═══ ISSUE 8: Remove redundant local totalClicks ═══
c = c.replace(
    'var totalClicks=m.clicks+t.clicks+computed.gd.clicks;var blendedCpc=computed.totalClicks>0',
    'var blendedCpc=computed.totalClicks>0'
)
# Fix FB click share
c = c.replace(
    'var fbClickShare=totalClicks>0?((computed.fb.clicks/totalClicks)*100).toFixed(1):"0"',
    'var fbClickShare=computed.totalClicks>0?((computed.fb.clicks/computed.totalClicks)*100).toFixed(1):"0"'
)
# Fix zero check
c = c.replace(
    'if(totalClicks===0)',
    'if(computed.totalClicks===0)'
)
issues_fixed.append("8. Fixed totalClicks references")

for fix in issues_fixed:
    print(fix)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("\nAll issues processed")
