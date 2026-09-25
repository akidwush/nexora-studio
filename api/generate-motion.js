// Vercel Function: opt-in Gemini orchestration. No user-provided code or remote URLs accepted.
// FAIL CLOSED: no paid model calls unless an operator enables AI, a Redis rate limiter,
// a fixed server-side Gemini model, and a trustworthy Vercel ingress.
import {createHmac} from 'node:crypto';
import {validatePrompt,validateScene} from '../src/ai/scene.js';

function errorResponse(res,code,message){
 return res.status(code).json({ok:false,error:message});
}
export function createHandler({env=process.env,fetchImpl=globalThis.fetch}={}){
 const ready=()=>env.AI_PUBLIC_ENABLED==='true'&&env.VERCEL==='1'&&
   Boolean(env.GEMINI_API_KEY&&env.GEMINI_MODEL&&/^[A-Za-z0-9._-]{3,90}$/.test(env.GEMINI_MODEL))&&
   Boolean(env.UPSTASH_REDIS_REST_URL&&env.UPSTASH_REDIS_REST_TOKEN&&env.AI_RATE_SALT?.length>=24);
 return async function handler(req,res){
   res.setHeader('Cache-Control','no-store');
   res.setHeader('X-Content-Type-Options','nosniff');
   if(req.method==='GET')return res.status(200).json({ok:true,ready:ready(),mode:'server-ai'});
   if(req.method!=='POST')return errorResponse(res,405,'Method not allowed.');
   if(!ready())return errorResponse(res,503,'Server AI is not configured. Local Draft remains available.');
   // Only accept browser requests from this deployment origin. This is CSRF protection,
   // not an authentication substitute: production authorization is a separate gate.
   const origin=req.headers?.origin,host=req.headers?.host;
   if(typeof origin!=='string'||typeof host!=='string')return errorResponse(res,403,'Invalid request origin.');
   try{if(new URL(origin).host!==host||new URL(origin).protocol!=='https:')return errorResponse(res,403,'Cross-origin requests disabled.');}
   catch{return errorResponse(res,403,'Invalid request origin.');}
   const forwarded=req.headers['x-forwarded-for'];
   const ip=typeof forwarded==='string'?forwarded.split(',')[0].trim():'';
   if(!ip||ip.length>75||!/^[a-fA-F0-9.:]+$/.test(ip))return errorResponse(res,403,'Client network identity unavailable.');
   if(!req.headers['content-type']?.toLowerCase().includes('application/json'))return errorResponse(res,415,'Expected JSON request.');
   let prompt;
   try{
     if(JSON.stringify(req.body).length>2400)throw new Error('Payload too large.');
     prompt=validatePrompt(req.body?.prompt);
   }catch{return errorResponse(res,400,'Supply a description between 8 and 500 characters.');}
   let limiterUrl;
   try{
     const u=new URL(env.UPSTASH_REDIS_REST_URL);
     if(u.protocol!=='https:'||!u.hostname.endsWith('.upstash.io'))throw new Error();
     limiterUrl=u.origin;
   }catch{return errorResponse(res,503,'Server rate limiter is not configured correctly.');}
   const key='nexora-studio:ai:'+createHmac('sha256',env.AI_RATE_SALT).update(ip).digest('hex');
   try{
     const check=await fetchImpl(limiterUrl,{
       method:'POST',
       headers:{Authorization:'Bearer '+env.UPSTASH_REDIS_REST_TOKEN,'Content-Type':'application/json'},
       body:JSON.stringify(['SET',key,'1','EX','60','NX']),
       signal:AbortSignal.timeout(3500)
     });
     if(!check.ok)throw new Error('limiter_unavailable');
     const allowed=await check.json();
     if(allowed.result!=='OK')return errorResponse(res,429,'Please wait one minute before requesting another AI scene.');
   }catch{return errorResponse(res,503,'AI requests are paused while rate limiting is unavailable.');}
   const instructions=[
     'Create one professional, attractive motion-graphics visual concept from the user request.',
     'Respond with one JSON object only, without markdown and without source code.',
     'Use exactly these fields: template (orbit, kinetic or waves), energy (calm, balanced or bold),',
     'title (plain text up to 38 characters), subtitle (plain text up to 90 characters),',
     'palette (object with background, primary, accent, text; each a valid six-digit #RRGGBB hex color).',
     'Ensure readable text contrast. This is not a request to execute HTML, links, JavaScript, or CSS.',
     'You are choosing safe configuration values for existing local canvas rendering templates.'
   ].join(' ');
   const controller=new AbortController();
   const timer=setTimeout(()=>controller.abort(),12000);
   try{
     const response=await fetchImpl('https://generativelanguage.googleapis.com/v1beta/models/'+env.GEMINI_MODEL+':generateContent',{
       method:'POST',
       headers:{'Content-Type':'application/json','x-goog-api-key':env.GEMINI_API_KEY},
       body:JSON.stringify({
         systemInstruction:{parts:[{text:instructions}]},
         contents:[{role:'user',parts:[{text:'Motion concept: '+prompt}]}],
         generationConfig:{responseMimeType:'application/json',temperature:.65,maxOutputTokens:512}
       }),
       signal:controller.signal
     });
     if(!response.ok)return errorResponse(res,response.status===429?429:502,response.status===429?'AI provider is busy. Try again later.':'AI provider request failed.');
     const parsed=await response.json();
     const text=parsed?.candidates?.[0]?.content?.parts?.map(p=>p?.text??'').join('')??'';
     if(text.length>8000||!text)throw new Error('empty_or_oversize_ai_response');
     const scene=validateScene(JSON.parse(text));
     return res.status(200).json({ok:true,mode:'gemini',scene});
   }catch(err){
     return errorResponse(res,err?.name==='AbortError'?504:502,err?.name==='AbortError'?'AI generation timed out.':'AI did not return a usable scene. Try another prompt.');
   }finally{clearTimeout(timer);}
 };
}
export default createHandler();
