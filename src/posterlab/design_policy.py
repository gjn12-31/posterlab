"""Creative direction is guidance, while content and execution remain verifiable."""
import base64
import os
from PIL import Image, ImageChops

MODES = {
    'polish': '精细调整：执行用户明确要求的局部修改。保留未要求变更的视觉关系，必要时联动排版以解决问题。',
    'redesign': '明显改版：根据需求重新作出设计决策，允许重写整个HTML、调整构图、字体组合、主视觉、色彩、信息组织。旧图不是必须保留的模板。用清楚可见且有目的的设计变化解决问题，不以多加几个装饰或微调几个数值代替改版。',
    'reimagine': '全新方案：仅保留准确事实与用户明确指定的要求，从新的视觉概念出发重新设计。不要沿用旧HTML结构、旧构图或默认锁定旧风格；参考图用于理解哪里需要突破，不作为复刻目标。',
}

def model_options(model, purpose='design'):
    if purpose == 'design':
        # StepFun Chat Completions documents omitted max_tokens as unrestricted
        # within the model context. Thinking and artwork share this budget;
        # an arbitrary small limit can truncate otherwise valid HTML.
        # https://platform.stepfun.com/docs/zh/api-reference/chat/chat-completion-create
        options = {}
        if model in ('step-5-preview', 'step-3.7-flash'):
            options['reasoning_effort'] = os.getenv('STEP_DESIGN_EFFORT','high')
        return options
    if model == 'step-5-preview':
        return {'reasoning_effort': 'medium', 'max_tokens': 16000}
    options={'max_tokens': 10000}
    if model == 'step-3.7-flash':options['reasoning_effort']='medium'
    return options

def supports_images(model):
    return model in ('step-5-preview','step-3.7-flash')

def image_part(path):
    return {'type':'image_url','image_url':{'url':'data:image/png;base64,'+base64.b64encode(path.read_bytes()).decode(),'detail':'high'}}

def estimate_cost(model, usage):
    # Do not apply the older text-model tariff to another model.
    incoming,outgoing=usage.get('prompt_tokens'),usage.get('completion_tokens')
    if type(incoming) is not int or type(outgoing) is not int:return None
    if model == 'step-3.5-flash':return (incoming*.7+outgoing*2.1)/1e6
    return None

def visual_delta(before, after):
    """Observable pixel difference, explicitly not an aesthetic improvement score."""
    with Image.open(before) as a, Image.open(after) as b:
        a=a.convert('RGB').resize((216,288));b=b.convert('RGB').resize((216,288))
        diff=ImageChops.difference(a,b)
        changed=sum(max(p)>24 for p in (diff.get_flattened_data() if hasattr(diff,"get_flattened_data") else diff.getdata()))
        return {'changed_pixel_percent':round(changed/(216*288)*100,1),
                'meaning':'缩略图中颜色变化超过阈值的像素比例；不是审美评分，也不保证质量提升。'}
