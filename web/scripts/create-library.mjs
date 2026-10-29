import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import * as icons from 'lucide-react';
import {writeFileSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve('web/public/library');const entries=[];
const iconList=[['Coffee','咖啡','餐饮 市集'],['Music','音乐','演出 节日'],['CalendarDays','日历','活动 时间'],['MapPin','地点','地址 地图'],['Leaf','叶片','自然 环保'],['ShoppingBag','购物袋','零售 电商'],['Sparkles','星光','新品 科技'],['GraduationCap','学士帽','课程 校园'],['Heart','爱心','公益 节庆'],['Ticket','票券','演出 报名'],['Mic','麦克风','分享 演出'],['Camera','相机','摄影 展览']];
for(const [key,name,tags] of iconList)for(const [tone,color] of [['ink','#242530'],['ivory','#f6f0e7']]){
 const id=key.toLowerCase()+'-'+tone;
 writeFileSync(root+'/'+id+'.svg',renderToStaticMarkup(React.createElement(icons[key],{size:256,color,strokeWidth:1.35})));
 entries.push({id,name:name+' · '+(tone==='ink'?'墨黑':'象牙白'),kind:'icon',tags,tone,source:'Lucide',source_url:'https://lucide.dev/icons/'+key.replace(/[A-Z]/g,(m,i)=>(i?'-':'')+m.toLowerCase()),license:'ISC / MIT（部分图标）',license_url:'https://lucide.dev/license',path:'assets/'+id+'.png',preview:'/library/'+id+'.png'});
}
const backgrounds=[
 ['aurora','极光流沙','科技 艺术 银紫',`<defs><radialGradient id="g"><stop stop-color="#b8b1ef"/><stop offset="1" stop-color="#11142a"/></radialGradient><radialGradient id="a"><stop stop-color="#94dccb"/><stop offset="1" stop-color="#94dccb" stop-opacity="0"/></radialGradient></defs><rect width="1080" height="1440" fill="#0d1324"/><ellipse cx="800" cy="200" rx="900" ry="800" fill="url(#g)"/><ellipse cx="50" cy="1100" rx="720" ry="680" fill="url(#a)"/>`],
 ['paper','暖调纸张','杂志 人文 奶油',`<rect width="1080" height="1440" fill="#efe8dc"/><path d="M60 60H1020V1380H60Z" stroke="#b6a994" fill="none" stroke-width="1"/><path d="M760 0V1440M0 1130H1080" stroke="#c1b49f" opacity=".35"/><circle cx="960" cy="190" r="160" fill="#cfbfa5" opacity=".24"/>`],
 ['cobalt','钴蓝秩序','商务 理性 网格',`<rect width="1080" height="1440" fill="#174bc4"/><g stroke="#aec6ff" opacity=".18">${Array.from({length:20},(_,i)=>`<path d="M${i*80} 0V1440M0 ${i*80}H1080"/>`).join('')}</g><circle cx="1100" cy="1450" r="710" fill="#a8c6fe" opacity=".22"/><circle cx="1100" cy="1450" r="510" fill="none" stroke="#a8c6fe" stroke-width="2"/>`],
 ['botanical','森野留白','自然 生活 绿色',`<rect width="1080" height="1440" fill="#e9edda"/><ellipse cx="1060" cy="1150" rx="430" ry="750" transform="rotate(-34 1060 1150)" fill="#60764d"/><ellipse cx="1060" cy="1400" rx="250" ry="640" transform="rotate(25 1060 1400)" fill="#354f3d"/><circle cx="120" cy="130" r="330" fill="#d5dec1"/>`],
 ['sunset','落日胶片','温暖 橙色 市集',`<defs><linearGradient id="g" x2="0" y2="1"><stop stop-color="#e8a6b9"/><stop offset=".55" stop-color="#f1ba88"/><stop offset="1" stop-color="#d9714c"/></linearGradient></defs><rect width="1080" height="1440" fill="url(#g)"/><circle cx="820" cy="470" r="320" fill="#ffe5aa" opacity=".8"/><path d="M0 1180Q450 900 1080 1140V1440H0" fill="#7b405d" opacity=".5"/>`],
 ['noir','午夜轨道','音乐 暗黑 霓虹',`<rect width="1080" height="1440" fill="#111123"/><g stroke="#b79be8" fill="none" opacity=".45">${[220,340,460,580,700].map(r=>`<circle cx="980" cy="250" r="${r}"/>`).join('')}</g><path d="M-200 1500L1000 700M0 1500L1200 800M200 1500L1400 900" stroke="#82daca" stroke-width="2" opacity=".4"/>`],
 ['coral','珊瑚碰撞','青年 节日 撞色',`<rect width="1080" height="1440" fill="#ff835c"/><path d="M750 0H1080V1440H900L200 800Z" fill="#372649"/><circle cx="80" cy="1230" r="240" fill="#ffcc78"/><path d="M850 230l30 95 100-20-65 80 65 80-100-20-30 95-30-95-100 20 65-80-65-80 100 20Z" fill="#f4ecd9"/>`],
 ['pearl','珍珠光面','品牌 高级 简约',`<defs><radialGradient id="g"><stop stop-color="#fcf9ef"/><stop offset=".6" stop-color="#ddd9e8"/><stop offset="1" stop-color="#a8a9bd"/></radialGradient></defs><rect width="1080" height="1440" fill="#f2f0eb"/><ellipse cx="1000" cy="900" rx="660" ry="800" fill="url(#g)"/><ellipse cx="1000" cy="900" rx="460" ry="600" fill="none" stroke="#faf7f0" stroke-width="2"/>`]
];
for(const [id,name,tags,content] of backgrounds){writeFileSync(root+'/'+id+'.svg',`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1440" viewBox="0 0 1080 1440">${content}</svg>`);entries.push({id,name,kind:'background',tags,source:'PosterLab 原创',source_url:'',license:'CC0-1.0',license_url:'https://creativecommons.org/publicdomain/zero/1.0/',path:'assets/'+id+'.png',preview:'/library/'+id+'.png'});}
writeFileSync(root+'/catalog.json',JSON.stringify(entries,null,2));
writeFileSync(root+'/LICENSE.txt',readFileSync('web/node_modules/lucide-react/LICENSE','utf8')+'\n\nPosterLab original backgrounds: aurora, paper, cobalt, botanical, sunset, noir, coral, pearl. Dedicated under CC0 1.0: https://creativecommons.org/publicdomain/zero/1.0/\n');
console.log('Created',entries.length,'source assets');
