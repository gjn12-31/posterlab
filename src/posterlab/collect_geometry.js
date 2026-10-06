() => {
 const root=document.querySelector('#poster'), r=root.getBoundingClientRect();
 const rect=x=>({x:x.x-r.x,y:x.y-r.y,width:x.width,height:x.height});
 const ancestors=el=>{const a=[];for(let n=el;n;n=n.parentElement)a.push(n);return a;};
 const outside=(a,b)=>a.x<b.x-.5||a.y<b.y-.5||a.right>b.right+.5||a.bottom>b.bottom+.5;
 const inspect=el=>{
  const cs=getComputedStyle(el), nodes=[],lines=[],fonts=[],clips=[],occlusions=[];
  const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);
  while(walker.nextNode()) if(walker.currentNode.textContent.trim()) nodes.push(walker.currentNode);
  for(const node of nodes){
   const parent=node.parentElement, styles=ancestors(parent).map(x=>getComputedStyle(x));
   fonts.push(parseFloat(getComputedStyle(parent).fontSize));
   const range=document.createRange();range.selectNodeContents(node);
   for(const line of range.getClientRects()){
    if(!line.width||!line.height)continue;
    lines.push(rect(line));
    for(const anc of ancestors(parent)){
     const st=getComputedStyle(anc), box=anc.getBoundingClientRect();
     const cx=['hidden','clip','scroll','auto'].includes(st.overflowX),cy=['hidden','clip','scroll','auto'].includes(st.overflowY);
     if((cx&&(line.x<box.x-.5||line.right>box.right+.5))||(cy&&(line.y<box.y-.5||line.bottom>box.bottom+.5))) clips.push({ancestor:anc.tagName,rect:rect(box),line:rect(line)});
    }
    for(const fraction of [.2,.5,.8]){
     const top=document.elementsFromPoint(line.x+line.width*fraction,line.y+line.height/2)[0];
     if(top && !el.contains(top) && !top.contains(el))occlusions.push({tag:top.tagName,id:top.id,rect:rect(top.getBoundingClientRect())});
    }
   }
  }
  const chain=ancestors(el), styles=chain.map(x=>getComputedStyle(x));
  const hiddenDescendants=nodes.some(n=>ancestors(n.parentElement).some(a=>{const s=getComputedStyle(a);return s.display==='none'||s.visibility!=='visible'||Number(s.opacity)===0||s.color==='rgba(0, 0, 0, 0)';}));
  return {dom_text:el.textContent.trim(),rect:rect(el.getBoundingClientRect()),font_size_px:parseFloat(cs.fontSize),min_descendant_font_px:Math.min(...fonts,parseFloat(cs.fontSize)),font_family:cs.fontFamily,line_rects:lines,display:cs.display,visibility:cs.visibility,effective_opacity:styles.reduce((v,s)=>v*Number(s.opacity),1),hidden: hiddenDescendants||styles.some(s=>s.display==='none'||s.visibility!=='visible'),transform:styles.some(s=>s.transform!=='none'||s.rotate!=='none'||s.scale!=='none'),complex_effect:styles.some(s=>s.clipPath!=='none'||s.filter!=='none'||s.mixBlendMode!=='normal'),clipping_candidates:clips,occlusion_candidates:occlusions};
 };
 const texts=[],walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
 while(walker.nextNode()){
  const n=walker.currentNode;if(!n.textContent.trim()||['STYLE','SCRIPT'].includes(n.parentElement.tagName))continue;
  const range=document.createRange();range.selectNodeContents(n);const b=range.getBoundingClientRect();
  const visible=b.width>0&&b.height>0&&!outside(b,r)&&ancestors(n.parentElement).every(x=>{const s=getComputedStyle(x);return s.display!=='none'&&s.visibility==='visible'&&Number(s.opacity)>0;});
  texts.push({text:n.textContent.trim(),visible,rect:rect(b)});
 }
 return {schema_version:'1.0',canvas:{x:0,y:0,width:r.width,height:r.height},fields:[...root.querySelectorAll('[data-field]')].map(el=>({field_id:el.dataset.field,...inspect(el)})),assets:[...root.querySelectorAll('img')].map(el=>({asset_id:el.dataset.asset,src:el.getAttribute('src'),complete:el.complete,natural_width:el.naturalWidth,natural_height:el.naturalHeight,object_fit:getComputedStyle(el).objectFit,...inspect(el)})),all_text_nodes:texts,dom_summary:root.outerHTML};
}
