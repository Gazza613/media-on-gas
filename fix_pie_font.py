with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Fix pie chart label font size
c = c.replace(
    'label={function(entry){var total=computed.fb.spend+computed.ig.spend+t.spend;var pct=total>0?(entry.value/total*100).toFixed(0):0;return pct>0?pct+"%":"";}}',
    'label={function(entry){var total=computed.fb.spend+computed.ig.spend+t.spend;var pct=total>0?(entry.value/total*100).toFixed(0):0;return pct>0?pct+"%":"";}} labelStyle={{fontSize:11,fontFamily:fm,fill:"#fff"}}'
)

# Fix tooltip to show currency for spend values
old_tip = 'function Tip(props){if(!props.active||!props.payload||!props.payload.length)return null;return(<div style={{background:"#121212",border:"1px solid rgba(255,255,255,0.2)",borderRadius:12,padding:"12px 16px",boxShadow:"0 8px 32px rgba(0,0,0,0.6)"}}><div style={{fontSize:11,fontWeight:800,color:P.txt,fontFamily:fm,marginBottom:4}}>{props.label}</div>{props.payload.map(function(p,i){return<div key={i} style={{fontSize:11,color:p.color||P.sub,fontFamily:fm,lineHeight:1.8}}>{p.name}: {typeof p.value==="number"?p.value.toLocaleString():p.value}</div>;})}</div>);}'

new_tip = 'function Tip(props){if(!props.active||!props.payload||!props.payload.length)return null;return(<div style={{background:"#121212",border:"1px solid rgba(255,255,255,0.2)",borderRadius:12,padding:"12px 16px",boxShadow:"0 8px 32px rgba(0,0,0,0.6)"}}><div style={{fontSize:11,fontWeight:800,color:P.txt,fontFamily:fm,marginBottom:4}}>{props.label}</div>{props.payload.map(function(p,i){var v=p.value;var display="";var n=(p.name||"").toLowerCase();if(n.indexOf("spend")>=0||n.indexOf("cpc")>=0||n.indexOf("cpm")>=0||n.indexOf("cpl")>=0||n.indexOf("cpf")>=0||n.indexOf("cost")>=0){display="R"+(typeof v==="number"?v.toLocaleString("en-ZA",{minimumFractionDigits:2,maximumFractionDigits:2}):v);}else{display=typeof v==="number"?v.toLocaleString():v;}return<div key={i} style={{fontSize:11,color:p.color||P.sub,fontFamily:fm,lineHeight:1.8}}>{p.name}: {display}</div>;})}</div>);}'

c = c.replace(old_tip, new_tip)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - pie font + tooltip currency fixed")
