// Supabase Edge Function. The backend key stays in the managed function environment.
export function makeHandler({env, fetcher = fetch, logger = console}) {
  const allowed = new Set(['https://lumentia.vercel.app']);
  const actions = new Set(['status','setup','login','logout','sync','list','receive','pay','bind_prior']);
  return async function handle(req) {
    const origin = req.headers.get('origin');
    const headers = {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin','X-Content-Type-Options':'nosniff'};
    if (origin && !allowed.has(origin)) return new Response(JSON.stringify({ok:false,error:'허용되지 않은 출처입니다.'}),{status:403,headers});
    if (origin) Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'content-type','Access-Control-Allow-Methods':'POST, OPTIONS'});
    if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
    const reply=(obj,status=200)=>new Response(JSON.stringify(obj),{status,headers});
    if(req.method!=='POST')return reply({ok:false,error:'POST 요청만 지원합니다.'},405);
    if(!req.headers.get('content-type')?.startsWith('application/json'))return reply({ok:false,error:'JSON 요청이 필요합니다.'},415);
    try {
      const reader=req.body?.getReader(); let size=0; const chunks=[];
      if(!reader)return reply({ok:false,error:'요청 내용이 없습니다.'},400);
      for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>80000){await reader.cancel();return reply({ok:false,error:'요청이 너무 큽니다.'},413);}chunks.push(value);}
      const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
      const body=JSON.parse(new TextDecoder().decode(bytes));
      if(!body || !actions.has(body.action))return reply({ok:false,error:'지원하지 않는 요청입니다.'},400);
      // Never accept client-provided IP or database role/permissions.
      body.ip=req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
      const key=JSON.parse(env.get('SUPABASE_SECRET_KEYS') || '{}').default || env.get('SUPABASE_SERVICE_ROLE_KEY');
      if(!key)throw new Error('missing_backend_config');
      const backendHeaders={'Content-Type':'application/json',apikey:key};
      if(!key.startsWith('sb_secret_'))backendHeaders.Authorization='Bearer '+key;
      const response=await fetcher(env.get('SUPABASE_URL')+'/rest/v1/rpc/lumentia_gateway',{method:'POST',headers:backendHeaders,body:JSON.stringify({p:body}),signal:AbortSignal.timeout(15000)});
      if(!response.ok){logger.error('lumentia_database_request_failed',response.status);return reply({ok:false,error:'지급 기록 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.'},503);}
      const result=await response.json();
      return reply(result,result.ok?200:([400,401,403,404,409,429].includes(result.code)?result.code:400));
    }catch(error){
      if(error instanceof SyntaxError)return reply({ok:false,error:'요청 내용을 확인해 주세요.'},400);
      logger.error('lumentia_gateway_failed',error?.name || 'Error');
      return reply({ok:false,error:'연결을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.'},503);
    }
  };
}
