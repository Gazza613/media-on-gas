with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# The Recharts tooltip has a default white background we need to override
# Replace the Tip component entirely
old_tip = 'function Tip(props){if(!props.active||!props.payload||!props.payload.length)return null;return(<div style={{background:"#121212",border:"1px solid rgba(255,255,255,0.15)",borderRadius:12,padding:"10px 14px"}}><div style={{fontSize:11,fontWeight:800,color:P.txt,fontFamily:fm,marginBottom:4}}>{props.label}</div>{props.payload.map(function(p,i){return<div key={i} style={{fontSize:11,color:p.color||P.sub,fontFamily:fm,lineHeight:1.8}}>{p.name}: {typeof p.value==="number"?p.value.toLocaleString():p.value}</div>;})}</div>);}'

new_tip = 'function Tip(props){if(!props.active||!props.payload||!props.payload.length)return null;return(<div style={{background:"#121212",border:"1px solid rgba(255,255,255,0.2)",borderRadius:12,padding:"12px 16px",boxShadow:"0 8px 32px rgba(0,0,0,0.6)"}}><div style={{fontSize:11,fontWeight:800,color:P.txt,fontFamily:fm,marginBottom:4}}>{props.label}</div>{props.payload.map(function(p,i){return<div key={i} style={{fontSize:11,color:p.color||P.sub,fontFamily:fm,lineHeight:1.8}}>{p.name}: {typeof p.value==="number"?p.value.toLocaleString():p.value}</div>;})}</div>);}'

c = c.replace(old_tip, new_tip)

# Also add cursor style to remove white hover bar on charts
c = c.replace('<Tooltip content={Tip}/>', '<Tooltip content={Tip} cursor={{fill:"rgba(255,255,255,0.05)"}}/>')

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - tooltips fixed, cursor darkened")
print("cursor count:", c.count('cursor={{fill'))
