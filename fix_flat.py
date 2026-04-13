with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Replace the array return + flat with a pre-computed flat array
old = """                  <tbody>{sorted3.map(function(r,ri){
                    var pc3=platColors2[r.platform]||P.ember;
                    var isBest2=r===sorted3.reduce(function(a,x){return x.result>a.result?x:a;},{result:-1})&&r.result>0;
                    var prevPlat=ri>0?sorted3[ri-1].platform:null;
                    var showDivider=ri>0&&r.platform!==prevPlat;
                    return [showDivider&&<tr key={"div"+ri}><td colSpan={9} style={{padding:0,border:"none",height:3,background:"linear-gradient(90deg,"+pc3+"40,transparent)"}}></td></tr>,
                    <tr key={ri} style={{background:ri%2===0?pc3+"06":"transparent"}}>"""

new = """                  <tbody>{(function(){var bestRow2=sorted3.reduce(function(a,x){return x.result>a.result?x:a;},{result:-1});var tableRows=[];sorted3.forEach(function(r,ri){
                    var pc3=platColors2[r.platform]||P.ember;
                    var isBest2=r===bestRow2&&r.result>0;
                    var prevPlat=ri>0?sorted3[ri-1].platform:null;
                    if(ri>0&&r.platform!==prevPlat){tableRows.push(<tr key={"div"+ri}><td colSpan={9} style={{padding:0,border:"none",height:3,background:"linear-gradient(90deg,"+pc3+"40,transparent)"}}></td></tr>);}
                    tableRows.push(<tr key={ri} style={{background:ri%2===0?pc3+"06":"transparent"}}>"""

c = c.replace(old, new)

# Fix the closing
old_close = """                    </tr>];})}.flat())}"""
new_close = """                    </tr>);});return tableRows;})()}"""

c = c.replace(old_close, new_close)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Fixed flat() issue")
