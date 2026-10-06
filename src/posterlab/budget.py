from filelock import FileLock
from .storage import read_json, write_json, now


class BudgetError(RuntimeError): pass


class Budget:
    """Reserve before every HTTP attempt. Unknown bills retain their entire reservation."""
    def __init__(self,config):
        self.config=config;self.root=config.path(config['paths']['ledger']);self.root.mkdir(parents=True,exist_ok=True)
        self.path=self.root/'attempts.json'
    def records(self):return read_json(self.path) if self.path.exists() else []
    def reserve(self,request,attempt,pilot=True):
        limits=self.config['limits']
        with FileLock(str(self.path)+'.lock'):
            rows=self.records()
            if len(rows)>=limits['max_attempts_total']:raise BudgetError('全局请求次数已到上限')
            if pilot and sum(r['pilot'] for r in rows)>=limits['pilot_max_attempts']:raise BudgetError('Pilot 请求次数已到上限；请核定预算后继续')
            currency=limits['currency'][request.role];reserve=limits['reservations'][request.role]
            if not pilot:
                cap=limits['money_caps'][currency]
                if not limits['prices_confirmed'] or cap is None or reserve is None or reserve<=0:raise BudgetError('正式请求需要确认定价、金额上限和每次费用预留')
                if any(r['currency']==currency and r['reservation'] is None and r['cost_estimate'] is None for r in rows):raise BudgetError('存在未核定 Pilot 费用，请先核账')
                total=sum(r['cost_estimate'] if r['cost_estimate'] is not None else (r['reservation'] or 0) for r in rows if r['currency']==currency)
                if total+reserve>cap:raise BudgetError(f'{currency} 预算不足')
            record={'id':len(rows)+1,'logical_call_id':request.logical_call_id,'role':request.role,'purpose':request.purpose,'attempt':attempt,'pilot':pilot,'started_at':now(),'status':'sending','currency':currency,'reservation':reserve,'cost_estimate':None,'usage_raw':None,'billing_status':'unknown'}
            rows.append(record);write_json(self.path,rows);return record
    def settle(self,record,**updates):
        with FileLock(str(self.path)+'.lock'):
            rows=self.records();rows[record['id']-1].update(updates);write_json(self.path,rows)
