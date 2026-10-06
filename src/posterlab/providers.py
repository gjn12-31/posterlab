import base64, os, time
from pathlib import Path
import httpx
from .schemas import ModelResponse
from .storage import write_json, atomic_text, dumps, sha256, file_hash


class ProviderError(RuntimeError):
    def __init__(self,message,kind='service_failed'):
        super().__init__(message);self.kind=kind


def validate_model_config(config,role):
    model=config['models'][role]
    if not model['model'] or not os.getenv(model['api_key_env']):raise ProviderError(f'{role} 模型 ID / API Key 尚未配置','configuration_error')
    if not model['base_url'].startswith('https://'):raise ProviderError('供应商地址必须为 HTTPS','configuration_error')
    return model


def payload_for(request,model):
    blocks=[{'type':'text','text':request.text}]
    anthropic=model['provider']=='anthropic_messages'
    if model['provider'] not in ('anthropic_messages','dashscope_chat'): raise ValueError('未知供应商协议')
    for image in request.images:
        if file_hash(image.path)!=image.sha256:raise ValueError('输入图片 hash 变化')
        encoded=base64.b64encode(Path(image.path).read_bytes()).decode()
        blocks.append({'type':'text','text':image.label})
        blocks.append({'type':'image','source':{'type':'base64','media_type':image.mime_type,'data':encoded}} if anthropic else {'type':'image_url','image_url':{'url':f'data:{image.mime_type};base64,{encoded}'}})
    payload={'model':model['model'],'max_tokens':model['max_output_tokens'],'messages':[{'role':'user','content':blocks}]}
    if anthropic:payload['system']=request.system
    else:
        payload['messages'].insert(0,{'role':'system','content':request.system});payload['stream']=False
    reserved=set(payload)
    if reserved.intersection(model['provider_options']): raise ValueError('provider_options 不得覆盖结构字段')
    payload.update(model['provider_options']);return payload


def parse_response(raw,model,elapsed):
    if model['provider']=='anthropic_messages':
        text=''.join(b['text'] for b in raw.get('content',[]) if b.get('type')=='text');stop=raw.get('stop_reason')
    else:
        choice=raw['choices'][0];text=choice['message'].get('content') or '';stop=choice.get('finish_reason')
        if not isinstance(text,str):raise ValueError('返回文本格式无效')
    return ModelResponse(response_id=raw.get('id'),text=text,stop_reason=stop,usage=raw.get('usage') or {},latency_seconds=elapsed,model=raw.get('model') or model['model'],truncated=stop in ('length','max_tokens'))


def call_model(request,config,budget,out_dir,pilot=True,transport=None):
    model=validate_model_config(config,request.role);payload=payload_for(request,model)
    out_dir=Path(out_dir);out_dir.mkdir(parents=True,exist_ok=True)
    if (out_dir/'response.json').exists():return ModelResponse.model_validate_json((out_dir/'response.json').read_text())
    # An orphaned request must never be silently resent.
    if list(out_dir.glob('attempt-*.json')):raise ProviderError('已有未完成请求记录，请人工核对远端状态','unknown_remote_state')
    write_json(out_dir/'request.redacted.json',{'request':request.model_dump(mode='json'),'model_config':model,'payload_sha256':sha256(dumps(payload))})
    key=os.environ[model['api_key_env']]
    anthropic=model['provider']=='anthropic_messages'
    headers={'Content-Type':'application/json'}
    headers.update({'x-api-key':key,'anthropic-version':'2023-06-01'} if anthropic else {'Authorization':'Bearer '+key})
    h=config['http'];timeout=httpx.Timeout(connect=h['connect_timeout_seconds'],read=h['read_timeout_seconds'],write=h['write_timeout_seconds'],pool=h['pool_timeout_seconds'])
    with httpx.Client(timeout=timeout,transport=transport,follow_redirects=False) as client:
        for attempt in range(1,h['max_retries']+2):
            record=budget.reserve(request,attempt,pilot);log=out_dir/f'attempt-{attempt}.json';write_json(log,record)
            start=time.perf_counter();response=None;retry=False;delay=1
            try:
                response=client.post(model['base_url'].rstrip('/')+('/messages' if anthropic else '/chat/completions'),headers=headers,json=payload)
                elapsed=time.perf_counter()-start
                if response.status_code>=400:
                    retry=response.status_code in (429,500,502,503,504)
                    try: delay=max(1,float(response.headers.get('Retry-After','1')))
                    except ValueError: retry=False
                    kind='permission_error' if response.status_code in (401,403) else ('configuration_error' if response.status_code==400 else 'service_failed')
                    raise ProviderError(f'HTTP {response.status_code}',kind)
                # Keep raw body even for malformed JSON; no content retries.
                atomic_text(out_dir/f'response-{attempt}.raw.txt',response.text.replace(key,'[REDACTED]'))
                raw=response.json();write_json(out_dir/'response.raw.json',raw)
                result=parse_response(raw,model,elapsed);write_json(out_dir/'response.json',result)
                updates={'status':'complete','http_status':response.status_code,'duration_seconds':elapsed,'usage_raw':result.usage,'provider_response_id':result.response_id,'returned_model':result.model,'billing_status':'estimate_unavailable'}
                budget.settle(record,**updates);write_json(log,{**record,**updates});return result
            except (httpx.TransportError,ProviderError,ValueError,KeyError,IndexError) as error:
                if isinstance(error,httpx.TransportError):retry=True;kind='unknown_remote_state';message=type(error).__name__
                elif isinstance(error,ProviderError):kind=error.kind;message=str(error)
                else:kind='invalid_response';message=type(error).__name__;retry=False
                updates={'status':kind,'http_status':response.status_code if response is not None else None,'duration_seconds':time.perf_counter()-start,'error':message,'billing_status':'unknown'}
                budget.settle(record,**updates);write_json(log,{**record,**updates})
                if retry and attempt<=h['max_retries'] and delay<=10:time.sleep(delay);continue
                raise ProviderError(message,kind) from None
