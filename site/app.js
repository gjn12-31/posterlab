'use strict';
const $ = id => document.getElementById(id);
const FIELDS = ['title','speaker','date','time','venue','description'];
const DEFAULT = {title:'人工智能与创新设计',speaker:'设计分享嘉宾',date:'2026-10-24',time:'14:00–16:00',venue:'创意空间 · 一层展厅',description:'从一个灵感开始，探索人工智能与设计的更多可能。一起分享创作方法，交流新鲜想法，把想象变成看得见的作品。'};
const THEMES = {paper:{name:'暖纸人文',bg:'#f4ecde',ink:'#633832',accent:'#b76750',soft:'#e6cfb1'},blue:{name:'蓝调学术',bg:'#edf2ff',ink:'#193c7b',accent:'#456bd1',soft:'#d2defa'},sage:{name:'青绿漫想',bg:'#eaf0e7',ink:'#244b41',accent:'#668c69',soft:'#d5dfb7'}};
const STORE = 'posterlab.works.v1';
let theme='paper', optimized=false, currentId=null, samples=[], works=[], renderIssues=[], toastTimer;
try { const saved=JSON.parse(localStorage.getItem(STORE)||'[]'); works=Array.isArray(saved)?saved.filter(validWork).slice(0,30):[]; } catch { /* Storage may be disabled. Saving will report it. */ }
function validWork(w) { return w && typeof w.id==='string' && THEMES[w.theme] && w.fields && FIELDS.every(k=>typeof w.fields[k]==='string' && w.fields[k].length<=1200); }
function fields(){return Object.fromEntries(FIELDS.map(k=>[k,$(k).value.trim()]));}
function fill(values){FIELDS.forEach(k=>$(k).value=values[k]||'');}
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3500);}
function page(name){document.querySelectorAll('.page').forEach(el=>el.hidden=el.id!==name);document.querySelectorAll('.nav').forEach(el=>{const active=el.dataset.page===name;el.classList.toggle('active',active);if(active)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});if(name==='gallery')gallery();window.scrollTo({top:0,behavior:'smooth'});}
function chooseTheme(value){theme=THEMES[value]?value:'paper';document.querySelectorAll('.theme').forEach(el=>{el.classList.toggle('selected',el.dataset.theme===theme);el.setAttribute('aria-pressed',String(el.dataset.theme===theme));});}
function dirty(){optimized=false;currentId=null;$('versions').hidden=true;$('preview-label').textContent='实时预览 · 修改后记得保存';render();}
function font(ctx,size,bold=false){ctx.font=`${bold?'600':'400'} ${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`;}
function wrap(ctx,text,width){const lines=[];for(const paragraph of String(text).split('\n')){let line='';for(const char of paragraph){if(ctx.measureText(line+char).width>width && line){lines.push(line.trimEnd());line=char.trimStart();}else line+=char;}lines.push(line);}return lines;}
function draw(canvas,values,key,better){
 const c=canvas.getContext('2d'),p=THEMES[key];canvas.width=1080;canvas.height=1440;c.fillStyle=p.bg;c.fillRect(0,0,1080,1440);const issues=[];
 c.save();c.globalAlpha=.28;c.strokeStyle=p.accent;c.lineWidth=1.5;for(let r=225;r<=365;r+=45){c.beginPath();c.arc(1010,70,r,0,Math.PI*2);c.stroke();}c.restore();
 c.fillStyle=p.accent;font(c,20,true);c.fillText('POSTERLAB  /  创意分享',72,89);font(c,18);c.fillText('让 每 一 个 好 想 法 ， 被 看 见',72,161);
 const width=936,title=values.title||'写下你的好想法';let size=better?110:100;let lines;
 do {font(c,size,true);lines=wrap(c,title,width);if(lines.length*size*1.24<=310)break;size-=2;} while(size>36);
 if(size<48)issues.push('标题内容较多，建议精简，让主题更醒目。');
 c.fillStyle=p.ink;let y=215;for(const line of lines){c.fillText(line,72,y+size);y+=size*1.24;}y+=34;
 // Decorative artwork is drawn locally and never depends on an external image.
 const artHeight=values.description.length<280?280:175;c.save();c.beginPath();c.rect(72,y,width,artHeight);c.clip();c.fillStyle=p.soft;c.fillRect(72,y,width,artHeight);
 if(key==='blue'){for(let i=0;i<8;i++){c.save();c.translate(200+i*125,y+95);c.rotate(-.55);c.fillStyle=i%2?p.accent:p.bg;c.globalAlpha=.65;c.fillRect(-40,-130,48,290);c.restore();}}
 else if(key==='sage'){for(let i=0;i<7;i++){c.beginPath();c.fillStyle=i%2?p.accent:p.bg;c.globalAlpha=.65;c.ellipse(180+i*135,y+130-i*10,90,145,.65,0,Math.PI*2);c.fill();}}
 else{for(let i=0;i<7;i++){c.beginPath();c.strokeStyle=p.accent;c.lineWidth=2.5;c.arc(760,y+105,65+i*28,0,Math.PI*2);c.stroke();}c.fillStyle=p.accent;c.beginPath();c.arc(260,y+175,126,Math.PI,Math.PI*2);c.fill();c.fillStyle=p.bg;c.beginPath();c.arc(260,y+175,78,Math.PI,Math.PI*2);c.fill();}c.restore();y+=artHeight+35;
 c.strokeStyle=p.accent;c.globalAlpha=.5;c.beginPath();c.moveTo(72,y);c.lineTo(1008,y);c.stroke();c.globalAlpha=1;y+=27;
 function fact(label,value,x,w){c.fillStyle=p.accent;font(c,18);c.fillText(label,x,y+18);font(c,28,true);const ls=wrap(c,value||'待填写',w);c.fillStyle=p.ink;ls.forEach((line,i)=>c.fillText(line,x,y+58+i*38));return 66+(ls.length-1)*38;}
 y+=Math.max(fact('主讲人',values.speaker,72,445),fact('活动日期',values.date,570,438))+22;
 y+=Math.max(fact('时间',values.time,72,445),fact('地点',values.venue,570,438))+24;
 const desc=values.description||'';let body=better?30:28,descLines,available=1308-y;
 do{font(c,body);descLines=wrap(c,desc,width);if(descLines.length*body*1.6<=available)break;body--;}while(body>14);
 const contentFits=descLines.length*body*1.6<=available;
 if(body<24)issues.push('内容较长，介绍字号偏小，建议缩短介绍或地点。');
 if(!contentFits)issues.push('内容超出了画面，请缩短标题、地点或活动介绍后再下载。');
 c.fillStyle=p.ink;c.save();c.beginPath();c.rect(72,y,width,Math.max(0,available));c.clip();descLines.forEach((line,i)=>c.fillText(line,72,y+body+i*body*1.6));c.restore();
 c.strokeStyle=p.accent;c.globalAlpha=.45;c.beginPath();c.moveTo(72,1350);c.lineTo(1008,1350);c.stroke();c.globalAlpha=1;c.fillStyle=p.accent;font(c,17);c.fillText('灵感，在这里发生。',72,1390);c.textAlign='right';c.fillText('POSTERLAB · 模板作品',1008,1390);c.textAlign='left';
 for(const k of FIELDS)if(!values[k])issues.push(({title:'标题',speaker:'主讲人',date:'日期',time:'时间',venue:'地点',description:'活动介绍'})[k]+'尚未填写。');
 return {issues,contentFits};
}
function render(){const result=draw($('poster'),fields(),theme,optimized);renderIssues=result.issues;$('download').disabled=!result.contentFits;$('check-summary').textContent=result.issues.length?`有 ${result.issues.length} 条排版建议`:'排版检查通过 · 文字完整，画面清晰';$('check-list').replaceChildren();for(const msg of result.issues.length?result.issues:['文字已完整显示。','图片尺寸为 1080 × 1440。','活动信息请在发布前自行核对。']){const li=document.createElement('li');li.textContent=msg;$('check-list').append(li);}return result;}
function validate(){for(const k of FIELDS){if(!$(k).value.trim()){const detail=$(k).closest('details');if(detail)detail.open=true;$(k).focus();toast('请先填写完整的活动信息。');return false;}}if(!$('editor').reportValidity())return false;return true;}
function persist(){try{localStorage.setItem(STORE,JSON.stringify(works));return true;}catch{toast('浏览器暂时无法保存，请下载图片保留作品。');return false;}}
function save(){if(!validate())return false;currentId=currentId||crypto.randomUUID();const work={id:currentId,fields:fields(),theme,optimized,updated:new Date().toISOString()};works=[work,...works.filter(w=>w.id!==currentId)].slice(0,30);return persist();}
function gallery(){const grid=$('gallery-grid');grid.replaceChildren();if(!works.length){const empty=document.createElement('p');empty.className='empty';empty.textContent='还没有作品。制作一张海报，让灵感在这里留下来。';grid.append(empty);return;}for(const w of works){const card=document.createElement('article');card.className='work-card';const thumb=document.createElement('canvas');draw(thumb,w.fields,w.theme,w.optimized);const img=document.createElement('img');img.src=thumb.toDataURL('image/webp',.65);img.alt=w.fields.title;const body=document.createElement('div'),title=document.createElement('h2'),note=document.createElement('p'),open=document.createElement('button'),remove=document.createElement('button');title.textContent=w.fields.title;note.textContent=THEMES[w.theme].name+' · '+new Date(w.updated).toLocaleDateString('zh-CN');open.textContent='继续编辑';open.className='secondary';open.onclick=()=>{fill(w.fields);chooseTheme(w.theme);optimized=!!w.optimized;currentId=w.id;$('sample').value='';$('source-note').hidden=true;$('versions').hidden=!optimized;versionButtons();render();$('preview-label').textContent='我的作品 · 随时继续创作';page('studio');};remove.textContent='删除';remove.className='delete';remove.setAttribute('aria-label','删除作品 '+w.fields.title);remove.onclick=()=>{if(window.confirm('删除这张已保存的作品？')){works=works.filter(x=>x.id!==w.id);persist();gallery();}};body.append(title,note,open,remove);card.append(img,body);grid.append(card);}}
function versionButtons(){$('original').classList.toggle('active',!optimized);$('revised').classList.toggle('active',optimized);}
$('editor').noValidate=true;
$('editor').onsubmit=event=>{event.preventDefault();if(save()){$('preview-label').textContent='已保存到我的作品';toast('海报已保存，可以下载分享了。');}render();};
FIELDS.forEach(k=>$(k).addEventListener('input',dirty));
document.querySelectorAll('.theme').forEach(el=>el.onclick=()=>{chooseTheme(el.dataset.theme);dirty();});
document.querySelectorAll('.nav').forEach(el=>el.onclick=()=>page(el.dataset.page));
$('new-work').onclick=()=>{fill(DEFAULT);chooseTheme('paper');$('sample').value='';$('source-note').hidden=true;dirty();page('studio');};
$('optimize').onclick=()=>{if(!validate())return;optimized=true;$('versions').hidden=false;versionButtons();render();if(save())toast('排版已调整并保存，可以对比原版。');$('preview-label').textContent='优化版 · 调整文字层级与间距';};
$('original').onclick=()=>{optimized=false;versionButtons();render();$('preview-label').textContent='原版预览';};
$('revised').onclick=()=>{optimized=true;versionButtons();render();$('preview-label').textContent='优化版预览';};
$('download').onclick=()=>{if(!validate()||!render().contentFits)return;const a=document.createElement('a');a.download=(fields().title.slice(0,40).replace(/[<>:"/\\|?*\x00-\x1f]/g,'_')||'海报')+'.png';$('poster').toBlob(blob=>{if(!blob){toast('图片导出失败，请重试。');return;}const url=URL.createObjectURL(blob);a.href=url;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);toast('图片已导出，快去分享吧。');},'image/png');};
$('sample').onchange=()=>{const s=samples.find(x=>x.id===$('sample').value);fill(s?s.fields:DEFAULT);$('source-note').hidden=!s;if(s)$('source-link').href=s.source_url;dirty();};
fill(DEFAULT);render();
fetch('samples.json').then(r=>{if(!r.ok)throw new Error('samples');return r.json();}).then(data=>{samples=data;for(const s of samples){const option=document.createElement('option');option.value=s.id;option.textContent=s.name;$('sample').append(option);}}).catch(()=>toast('示例暂时加载失败，仍可自由创作。'));
