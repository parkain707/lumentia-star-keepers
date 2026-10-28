const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {webcrypto} = require('node:crypto');
const root = path.resolve(__dirname,'..');
function harness(options={}) {
  let now=options.now || Date.parse('2026-10-28T01:00:00Z'), clock=0, frame;
  const storage=options.storage || new Map(); const ui=[]; const intervals=[]; const errors=[];
  const noop=()=>{};
  let randomSeed=options.seed || 12345;
  const seededMath=Object.create(Math);
  seededMath.random=()=>{randomSeed=(Math.imul(randomSeed,1664525)+1013904223)>>>0;return randomSeed/4294967296;};
  class TestDate extends Date { constructor(...args){super(...(args.length?args:[now]));} static now(){return now;} }
  const ctx=vm.createContext({console,Date:TestDate,Math:seededMath,TextEncoder,crypto:webcrypto,navigator:{},
    document:{readyState:'loading',visibilityState:'visible',addEventListener:noop,getElementById:()=>null},
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>{if(options.failWrites)throw new Error('quota');storage.set(k,String(v));},removeItem:k=>storage.delete(k)},
    performance:{now:()=>clock},setInterval:fn=>{intervals.push(fn);return intervals.length;},clearInterval:noop,
    setTimeout:noop,clearTimeout:noop,requestAnimationFrame:cb=>{frame=cb;return 1;},
    SFX:{play:noop,setEnabled:noop},ART:{makeBackdrop:()=>({})},addEventListener:noop,location:{reload:noop}});
  ctx.window=ctx;
  const run=code=>vm.runInContext(code,ctx);
  for(const file of ['data','challenge','auth','ui','battle','game'])vm.runInContext(fs.readFileSync(path.join(root,'js',file+'.js'),'utf8'),ctx,{filename:file+'.js'});
  for(const k of run('Object.keys(UI)'))if(typeof run('UI')[k]==='function')run('UI')[k]=(...args)=>ui.push({method:k,args});
  run('Auth.setCurrentUser("test-keeper")');
  run('Game.reloadFromAuth()');
  run('Battle.init({getContext:()=>({})},{getBoundingClientRect:()=>({width:800,height:1000})})');
  const obj=code=>JSON.parse(JSON.stringify(run(code)));
  return {run,obj,storage,ui,ctx,errors,intervals,setNow:t=>{now=t;},advance:ms=>{now+=ms;},step:seconds=>{
    for(let i=0;i<seconds*60;i++){clock+=1000/60;now+=1000/60;try{frame(clock);}catch(e){errors.push(e);throw e;}}
  }};
}
module.exports={harness};
