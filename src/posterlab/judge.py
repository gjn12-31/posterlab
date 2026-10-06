import re
from .schemas import JudgeReport,ModelRequest
from .prompt_builder import image_input
from .storage import dumps


def build_judge_request(image_path,task,answer,prompts,rubric,artifact_id,logical_id):
    payload={'fields':{k:v.model_dump(mode='json') for k,v in answer.fields.items()},'forbidden_stale_dates':answer.forbidden_stale_dates}
    return ModelRequest(role='judge',logical_call_id=logical_id,purpose='independent_image_judgment',system=prompts['judge_system'],text=prompts['judge_user']+'\n'+dumps({'artifact_id':artifact_id,'brief':task.brief,'correct_facts':payload,'rubric':rubric,'output_schema':JudgeReport.model_json_schema()}),images=[image_input(image_path,'待评价海报（匿名单图）')])


def parse_judge(text,required_fields,artifact_id):
    text=text.strip()
    if text.startswith('```'):
        match=re.fullmatch(r'```(?:json)?\s*\n(.*?)\n```',text,re.S)
        if not match:raise ValueError('评审响应不是唯一 JSON')
        text=match.group(1)
    report=JudgeReport.model_validate_json(text)
    actual=[f.field_id for f in report.fields]
    if len(actual)!=len(set(actual)) or set(actual)!=set(required_fields):raise ValueError('评审字段缺失或重复')
    if report.artifact_id!=artifact_id:raise ValueError('匿名作品 ID 不匹配')
    return report
