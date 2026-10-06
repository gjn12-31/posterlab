"""One request/second, exact public pages only; cached snapshots, no login/circumvention."""
import argparse, re, time
from pathlib import Path
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser
import httpx
from bs4 import BeautifulSoup
from posterlab.storage import write_json, atomic_text, file_hash, now

ROOT = Path(__file__).resolve().parents[1]
PAGE_IDS = ['2824','2833','2828','2830','2825','2823','2822','2811','2810','2809']


def collect(refresh=False):
    client = httpx.Client(timeout=30, follow_redirects=True, headers={'User-Agent':'PosterLabResearch/0.1 (educational, 10 public notices; no personal contact collection)'})
    robots_url='https://iiis.tsinghua.edu.cn/robots.txt'
    robots=client.get(robots_url)
    policy = RobotFileParser(); policy.parse(robots.text.splitlines() if robots.status_code == 200 else [])
    if robots.status_code not in (200,404): raise RuntimeError(f'robots unavailable: {robots.status_code}')
    records=[]
    for i,pid in enumerate(PAGE_IDS,1):
        event=f'e{i:03d}'; folder=ROOT/'data/sources'/event; folder.mkdir(parents=True,exist_ok=True)
        url=f'https://iiis.tsinghua.edu.cn/en/info/1044/{pid}.htm'
        if robots.status_code==200 and not policy.can_fetch('PosterLabResearch',url): raise RuntimeError('robots disallows '+url)
        raw=folder/'page.html'
        if refresh or not raw.exists():
            time.sleep(1)
            response=client.get(url); response.raise_for_status()
            raw.write_bytes(response.content)
            write_json(folder/'fetch.json',{'url':url,'accessed_at':now(),'http_status':response.status_code,'robots_status':robots.status_code,'page_sha256':file_hash(raw)})
        soup=BeautifulSoup(raw.read_bytes(),'html.parser')
        content=soup.select_one('.v_news_content')
        if not content: raise ValueError(f'Content selector missing: {url}')
        text=content.get_text(' ',strip=True)
        title=soup.select_one('h3').get_text(' ',strip=True)
        patterns={'speaker':r'演讲人[：:]\s*(.*?)\s*时间[：:]', 'when':r'时间[：:]\s*(.*?)\s*地点[：:]', 'venue':r'地点[：:]\s*(.*?)\s*内容[：:]', 'abstract':r'内容[：:]\s*(.*?)(?:个人简介|$)'}
        fields={key:re.search(pattern,text,re.S).group(1).strip() for key,pattern in patterns.items()}
        print(event,title,fields['when'])
        atomic_text(folder/'body.txt',title+'\n'+content.get_text('\n',strip=True))
        records.append({'event_id':event,'source_url':url,'title':title,**fields,'fetch':__import__('json').loads((folder/'fetch.json').read_text())})
    write_json(ROOT/'data/collected_events.json',records)
    atomic_text(ROOT/'data/source_manifest.jsonl','\n'.join(__import__('json').dumps({**r['fetch'],'event_id':r['event_id'],'title':r['title'],'snapshot':f'data/sources/{r["event_id"]}/page.html','text_snapshot':f'data/sources/{r["event_id"]}/body.txt','rights':'Source copyright retained; local educational evidence. No original university images redistributed.'},ensure_ascii=False) for r in records)+'\n')

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--refresh',action='store_true');collect(p.parse_args().refresh)
