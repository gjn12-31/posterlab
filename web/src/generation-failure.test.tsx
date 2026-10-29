import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { GenerationFailure } from './GenerationFailure';
import type { Job } from './chat-model';

const base = { id:'job-visible-123', state:'failed', error:'模型服务暂时限流', retry_not_before:Date.now()/1000+60, failure:{code:'provider_rate_limit',stage:'provider',message:'模型服务暂时限流',suggestion:'等待后重试',charge_uncertain:false} } as Job;
it('renders rate-limit cooldown, task identity, and only available recovery actions', () => {
  const html=renderToStaticMarkup(<GenerationFailure job={base} busy={false} recover={()=>{}} retry={()=>{}} />);
  expect(html).toContain('等待 60 秒后可重试');
  expect(html).toContain('disabled');
  expect(html).toContain('job-visible-123');
  expect(html).not.toContain('本地修复并出图');
});
it('explains unknown charges and offers saved-design recovery', () => {
  const job={...base,can_rerender:true,retry_not_before:null,failure:{...base.failure!,charge_uncertain:true}};
  const html=renderToStaticMarkup(<GenerationFailure job={job} busy={false} recover={()=>{}} retry={()=>{}} />);
  expect(html).toContain('可能产生额外费用');
  expect(html).toContain('本地修复并出图');
  expect(html).toContain('按原需求重新生成');
});
it('supports historical failures without structured metadata', () => {
  const html=renderToStaticMarkup(<GenerationFailure job={{...base,failure:null,retry_not_before:null}} busy={false} recover={()=>{}} retry={()=>{}} />);
  expect(html).toContain('这次海报没有完成');
  expect(html).toContain(base.error);
});
