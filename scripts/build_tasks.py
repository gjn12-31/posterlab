"""Build 10 independent events × 3 controlled variants from cached sources."""
import json, re, shutil
from datetime import datetime,timedelta
from pathlib import Path
from PIL import Image,ImageDraw
from posterlab.storage import read_json,write_json,atomic_text,directory_hash,file_hash
ROOT=Path(__file__).resolve().parents[1]
SUMMARIES=[
('本讲座讨论如何将人工智能与光学原理结合，从已有测量数据中发现隐藏结构，并介绍其在生物医学成像与系外行星探测中的应用。','报告将以散射生物组织后的结构恢复，以及恒星强光背景中的微弱行星信号探测为例，介绍计算方法如何拓展既有成像设备的能力。'),
('本讲座围绕多智能体人工智能的激励机制与可扩展性，讨论如何构建能够面对现实复杂性、并满足对齐要求的智能体系统。','报告从智能体与人类共同组成的系统出发，关注多智能体深度学习中的机制设计与规模扩展问题。'),
('本讲座介绍面向机器人灵巧操作的原子技能方法，探讨如何让机器人获得更丰富的操作能力。','报告以人手感知和操纵物理世界的能力为背景，讨论机器人灵巧操作的挑战及相应研究思路。'),
('本讲座关注多体自旋系统中的量子疤痕现象，讨论混沌系统热化与更复杂量子信息之间的关系。','报告从相互作用粒子系统的热化问题出发，考察简单可观测量之外的波函数等结构所呈现的行为。'),
('本讲座介绍基于相位估计的玻色编码错误检测方法，涉及旋转对称编码、平移对称编码以及高保真态制备。','报告将从对称算符分解出发，介绍自适应量子相位估计在不同玻色量子纠错编码中的应用。'),
('本讲座讨论自旋压缩与光压缩在精密测量中的量子信息应用，关注相干原子与光相互作用系统的测量灵敏度。','报告以自旋投影噪声和光子散粒噪声等经典限制为背景，探讨利用量子资源改进测量的研究方向。'),
('本讲座讨论使用量子比特投影测量共享非定域性的研究，关注量子测量与非定域关联之间的关系。','报告围绕非定域性的共享问题展开，介绍量子信息研究中的相关理论方法与研究进展。'),
('本讲座讨论生成流网络的方法论问题，关注这一生成建模框架的研究思路及其关键方法。','报告围绕生成流网络展开讨论，帮助听众理解相关方法的出发点与理论研究背景。'),
('本讲座讨论视觉推理从简单任务向困难任务的泛化，关注视觉语言模型中的模态不平衡问题。','报告以视觉推理任务为背景，分析模型的泛化表现，并探讨缓解不同模态之间不平衡的研究方向。'),
('本讲座讨论大语言模型中上下文增强学习的作用，关注上下文信息如何影响模型的学习过程。','报告围绕上下文增强学习展开，介绍相关研究问题与方法，讨论这一方向对理解大语言模型的意义。')]


def art(folder,index):
    folder.mkdir(parents=True,exist_ok=True)
    logo=Image.new('RGB',(256,256),'#1749b4');d=ImageDraw.Draw(logo)
    d.rounded_rectangle((52,44,205,212),radius=24,outline='white',width=12)
    d.line([(89,172),(89,87),(158,87),(174,105),(158,127),(89,127)],fill='white',width=14)
    logo.save(folder/'logo.png')
    hero=Image.new('RGB',(1200,440),'#0b2458');d=ImageDraw.Draw(hero)
    for x in range(0,1200,60):d.line((x,0,x,440),fill='#17376b',width=1)
    for y in range(0,440,55):d.line((0,y,1200,y),fill='#17376b',width=1)
    for j in range(7):
        x=280+j*110;y=220+int(90*__import__('math').sin((j+index)*.9))
        d.line((80,220,x,y),fill='#3389ef',width=3);d.ellipse((x-26,y-26,x+26,y+26),outline='#76c7ff',width=5)
    d.ellipse((62,202,98,238),fill='#d8efff');hero.save(folder/'hero.jpg',quality=94)


def main():
    events=read_json(ROOT/'data/collected_events.json');rows=[]
    for i,event in enumerate(events):
        eid=event['event_id'];base,long=SUMMARIES[i]
        when=event['when']; match=re.search(r'(\d{1,2}:\d{2}\s*[-–]\s*\d{1,2}:\d{2}),\s*([A-Za-z]+\s+\d+,\s*\d{4})',when)
        if not match:raise ValueError(when)
        date=datetime.strptime(match[2],'%b %d, %Y').date();clock=match[1].replace(' ','')
        speaker=event['speaker'].split('[')[0].strip()
        for variant,suffix in [('standard','standard'),('date_update','update'),('long_text','long')]:
            task_id=eid+'-'+suffix;root=ROOT/'data/tasks'/task_id/'public';root.mkdir(parents=True,exist_ok=True)
            art(root/'assets',i)
            description=base+long if variant=='long_text' else base
            values={'title':event['title'],'speaker':speaker,'date':date.isoformat(),'time':clock,'venue':event['venue'],'description':description}
            source='来源：'+event['source_url']+'\n以下为从来源提取的活动事实；简介为项目整理的中文摘要，并非学校原文。\n'
            source+='\n'.join(k+'：'+v for k,v in values.items())+'\n'
            atomic_text(root/'sources/notice.txt',source)
            source_files=['sources/notice.txt'];stale=[]
            if variant=='date_update':
                new=(date+timedelta(days=7)).isoformat();stale=[date.isoformat(),f'{date.year}年{date.month}月{date.day}日']
                atomic_text(root/'sources/update.txt',f'【实验构造的改期通知，并非真实活动改期】\n原定 {date.isoformat()} 改为 {new}，其余内容不变。\n')
                values['date']=new;source_files.append('sources/update.txt')
            brief='制作学术活动海报，蓝白配色；固定 1080×1440 像素。标题不小于48px，其他字段不小于24px，使用 PosterSans。\n必须展示 title、speaker、date、time、venue、description，简介必须完整原文保留，只允许空白变化。\n日期只允许 YYYY-MM-DD 或 YYYY年M月D日；明确更新优先。\n使用给定 logo 与 hero。logo 是项目演示标识，不代表学校官方标识；不得暗示主办方授权。logo 不得裁切拉伸，hero 可裁切。\n每字段一个 data-field，每素材一个 img data-asset；遵守 html-v1 静态合同。'
            atomic_text(root/'brief.md',brief)
            write_json(root/'task.json',{'schema_version':'1.0','task_id':task_id,'canvas':{'width':1080,'height':1440},'source_files':source_files,'brief_file':'brief.md','asset_manifest':'assets.json','required_fields':list(values),'minimum_font_px':{'title':48,'body':24},'style_requirements':['蓝白配色','学术风格','信息清晰'],'verbatim_fields':['description'],'output_contract_version':'html-v1'})
            assets=[]
            for aid,ext,role in [('logo','png','PosterLab 演示标识（非校方标识）'),('hero','jpg','项目原创抽象主题示意图')]:
                path=f'assets/{aid}.{ext}'
                with Image.open(root/path) as img:w,h=img.size
                assets.append({'asset_id':aid,'path':path,'mime_type':'image/png' if ext=='png' else 'image/jpeg','width':w,'height':h,'required':True,'role':role,'fit_policy':'contain' if aid=='logo' else 'cover_or_contain','crop_allowed':aid!='logo','license':'Project-created geometric artwork, CC0-1.0','redistribution':True})
            write_json(root/'assets.json',{'schema_version':'1.0','assets':assets})
            fields={k:{'value':v,'match':'normalized_exact'} for k,v in values.items()}
            current=datetime.strptime(values['date'],'%Y-%m-%d').date()
            fields['date'].update(match='allowed_forms',allowed_forms=[values['date'],f'{current.year}年{current.month}月{current.day}日'])
            fields['time'].update(match='allowed_forms',allowed_forms=[clock,clock.replace('-','–')])
            answer=ROOT/'data/answers'/f'{task_id}.json'
            write_json(answer,{'schema_version':'1.0','task_id':task_id,'fields':fields,'forbidden_stale_dates':stale,'critical_fields':list(values),'source_review':{'reviewer_a':'','reviewer_b':'','confirmed':False}})
            rows.append({'schema_version':'1.0','task_id':task_id,'event_id':eid,'variant':variant,'split':'dev' if i<2 else 'test','public_dir':root.relative_to(ROOT).as_posix(),'answer_path':answer.relative_to(ROOT).as_posix(),'public_sha256':directory_hash(root),'answer_sha256':file_hash(answer),'source_url':event['source_url'],'changed_fields':[] if variant=='standard' else ['date' if variant=='date_update' else 'description']})
    atomic_text(ROOT/'data/manifest.jsonl','\n'.join(json.dumps(r,ensure_ascii=False) for r in rows)+'\n')
    print('Built',len(events),'events /',len(rows),'tasks; 2 dev + 8 test events; human review pending')

if __name__=='__main__':main()
