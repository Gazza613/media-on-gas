with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    lines = f.readlines()

fixes = 0
for i in range(len(lines)):
    # Only fix lines 530+ (targeting tab area)
    if i >= 448:
        # Fix r.ctr.toFixed
        if 'r.ctr.toFixed(' in lines[i] and 'parseFloat' not in lines[i].split('r.ctr.toFixed')[0][-20:]:
            lines[i] = lines[i].replace('r.ctr.toFixed(', '(parseFloat(r.ctr)||0).toFixed(')
            fixes += 1
        # Fix r.cpc.toFixed
        if 'r.cpc.toFixed(' in lines[i]:
            lines[i] = lines[i].replace('r.cpc.toFixed(', '(parseFloat(r.cpc)||0).toFixed(')
            fixes += 1
        # Fix b.ctr-a.ctr sort
        if 'return b.ctr-a.ctr;' in lines[i]:
            lines[i] = lines[i].replace('return b.ctr-a.ctr;', 'return (parseFloat(b.ctr)||0)-(parseFloat(a.ctr)||0);')
            fixes += 1
        # Fix highCtr[0].ctr comparison
        if 'highCtr[0].ctr>blendedCtr' in lines[i] and 'parseFloat' not in lines[i].split('highCtr[0].ctr')[0][-15:]:
            lines[i] = lines[i].replace('highCtr[0].ctr>blendedCtr', '(parseFloat(highCtr[0].ctr)||0)>blendedCtr')
            fixes += 1
        # Fix r.ctr>2 comparisons in targeting
        if 'r.ctr>2?P.mint:r.ctr>1?P.txt:r.ctr>0?P.warning' in lines[i]:
            lines[i] = lines[i].replace(
                'r.ctr>2?P.mint:r.ctr>1?P.txt:r.ctr>0?P.warning',
                '(parseFloat(r.ctr)||0)>2?P.mint:(parseFloat(r.ctr)||0)>1?P.txt:(parseFloat(r.ctr)||0)>0?P.warning'
            )
            fixes += 1
        # Fix r.cpc<2 in targeting
        if 'r.cpc<2?P.mint' in lines[i] and i > 500:
            lines[i] = lines[i].replace('r.cpc<2?P.mint', '(parseFloat(r.cpc)||0)<2?P.mint')
            fixes += 1

print("Fixed", fixes, "targeting-specific parseFloat issues")

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.writelines(lines)
