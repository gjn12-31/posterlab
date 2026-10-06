"""Build the public browser examples from the collected benchmark notices."""
import json
from pathlib import Path
from posterlab.studio import SAMPLE_NAMES

ROOT = Path(__file__).resolve().parents[1]

def main():
    records = json.loads((ROOT / 'data/collected_events.json').read_text())
    samples = []
    for i, event in enumerate(records):
        notice = ROOT / 'data/tasks' / f"{event['event_id']}-standard" / 'public/sources/notice.txt'
        fields = {}
        for line in notice.read_text().splitlines():
            key, sep, value = line.partition('：')
            if sep and key in ['title', 'speaker', 'date', 'time', 'venue', 'description']:
                fields[key] = value
        if len(fields) != 6:
            raise ValueError(f"Incomplete example: {event['event_id']}")
        samples.append(dict(id=event['event_id'], name=SAMPLE_NAMES[i], fields=fields, source_url=event['source_url']))
    (ROOT / 'site/samples.json').write_text(json.dumps(samples, ensure_ascii=False, indent=2) + '\n')

if __name__ == '__main__':
    main()
