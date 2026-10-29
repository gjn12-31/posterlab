import {it,expect} from 'vitest';
import {radarPoints,type Metric} from './EvaluationPanel';
it('radar plots actual scores on a fixed zero to 100 scale',()=>{
 const values=Array.from({length:6},(_,i)=>({id:String(i),score:0} as Metric));
 expect(radarPoints(values).split(' ')).toEqual(Array(6).fill('160,140'));
 expect(radarPoints(values.map(x=>({...x,score:100}))).split(' ')[0]).toBe('160,44');
 expect(radarPoints(values.map(x=>({...x,score:50}))).split(' ')[0]).toBe('160,92');
});
