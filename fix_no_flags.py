with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Remove optimisation language from awareness insight
c = c.replace(
    '"Frequency has reached "+computed.fb.frequency.toFixed(2)+"x, approaching the upper threshold of effective repetition. Monitor engagement rates closely for early signs of creative fatigue."',
    '"Frequency at "+computed.fb.frequency.toFixed(2)+"x indicates the campaign has established strong recall-building repetition within the target audience."'
)

# Remove optimisation language from engagement insight
c = c.replace(
    '"CTR at "+pc(computed.fb.ctr)+" indicates room for creative optimisation. Testing stronger opening hooks, more direct value propositions, and clearer calls-to-action could materially improve click efficiency."',
    '"CTR at "+pc(computed.fb.ctr)+" reflects the current creative-audience engagement level for this campaign period."'
)

# Remove optimisation language from objective insight - conversion rate suggestions
c = c.replace(
    '"The "+convR+"% conversion rate suggests a disconnect between ad promise and landing page delivery. Prioritise landing page experience testing: simplify the form, strengthen the value proposition above the fold, and add social proof or trust signals to reduce friction."',
    '"The "+convR+"% conversion rate reflects the current funnel performance for this campaign period."'
)

c = c.replace(
    'Incremental A/B testing on form placement, copy, and social proof elements could push this above 5%.',
    ''
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - removed all flags/optimisations from insights")
