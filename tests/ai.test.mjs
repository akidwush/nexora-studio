import {test} from 'node:test';
import assert from 'node:assert/strict';
import {localSceneFromPrompt,validatePrompt,validateScene} from '../src/ai/scene.js';
import {createHandler} from '../api/generate-motion.js';
const sample=()=>({template:'waves',energy:'calm',title:'OCEAN ENERGY',subtitle:'A NEW MOTION STORY',palette:{background:'#052839',primary:'#0D94C2',accent:'#81EDE3',text:'#FFFFFF'}});
function res(){
 return {statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;return this;},status(c){this.statusCode=c;return this;},json(d){this.body=d;return this;}};
}
const env={AI_PUBLIC_ENABLED:'true',VERCEL:'1',GEMINI_API_KEY:'secret-test-key',GEMINI_MODEL:'gemini-2.5-flash',UPSTASH_REDIS_REST_URL:'https://example.upstash.io',UPSTASH_REDIS_REST_TOKEN:'test-redis-secret',AI_RATE_SALT:'salt-value-longer-than-24-chars'};
const req={method:'POST',headers:{origin:'https://studio.example',host:'studio.example','content-type':'application/json','x-forwarded-for':'203.0.113.42'},body:{prompt:'Create glowing ocean motion'}};
test('Local Draft generates a bounded deterministic scene without claiming to be AI',()=>{
 const first=localSceneFromPrompt('Calm blue ocean wave animation');
 assert.deepEqual(first,localSceneFromPrompt('Calm blue ocean wave animation'));
 assert.equal(first.template,'waves');assert.equal(first.energy,'calm');
 assert.equal(first.palette.background,'#052839');
});
test('input/palette validation rejects code-shaped and invalid outputs',()=>{
 assert.throws(()=>validatePrompt('hi'));
 assert.throws(()=>validateScene({...sample(),palette:{...sample().palette,primary:'url(javascript:alert(1))'}}));
 assert.throws(()=>validateScene({...sample(),template:'eval()'}));
 assert.throws(()=>validateScene({...sample(),title:'X'.repeat(100)}));
 assert.equal(validateScene({...sample(),title:'<script>Oops</script> Safe'}).title,'Oops Safe');
});
test('AI endpoint is fail-closed without backend settings',async()=>{
 const result=await createHandler({env:{},fetchImpl:()=>{throw Error('should not fetch');}})(req,res());
 assert.equal(result.statusCode,503);assert.equal(result.body.ok,false);
});
test('backend capability GET exposes readiness not secrets',async()=>{
 const result=await createHandler({env,fetchImpl:()=>{throw Error('should not fetch');}})({...req,method:'GET'},res());
 assert.deepEqual(result.body,{ok:true,ready:true,mode:'server-ai'});
 assert.ok(!JSON.stringify(result.body).includes(env.GEMINI_API_KEY));
});
test('AI endpoint validates same origin and input before rate limit',async()=>{
 let calls=0;const handler=createHandler({env,fetchImpl:()=>{calls++;}});
 const bad=await handler({...req,headers:{...req.headers,origin:'https://attacker.test'}},res());
 assert.equal(bad.statusCode,403);assert.equal(calls,0);
 const small=await handler({...req,body:{prompt:'tiny'}},res());
 assert.equal(small.statusCode,400);assert.equal(calls,0);
});
test('rate-limited request cannot reach paid AI provider',async()=>{
 let calls=0;
 const handler=createHandler({env,fetchImpl:async()=>{calls++;return {ok:true,json:async()=>({result:null})};}});
 const result=await handler(req,res());
 assert.equal(result.statusCode,429);assert.equal(calls,1);
});
test('limiter failure fails closed and never reaches model',async()=>{
 const handler=createHandler({env,fetchImpl:async()=>{throw Error('redis offline');}});
 const result=await handler(req,res());
 assert.equal(result.statusCode,503);
});
test('valid AI JSON becomes validated scene, without exposing provider key',async()=>{
 const requests=[];
 const handler=createHandler({env,fetchImpl:async(url,options)=>{
   requests.push({url,options});
   return url.includes('upstash.io')?{ok:true,json:async()=>({result:'OK'})}:
     {ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify(sample())}]}}]})};
 }});
 const result=await handler(req,res());
 assert.equal(result.statusCode,200);
 assert.deepEqual(result.body.scene,validateScene(sample()));
 assert.equal(result.body.mode,'gemini');
 assert.equal(requests.length,2);
 assert.equal(requests[1].options.headers['x-goog-api-key'],env.GEMINI_API_KEY);
 assert.ok(!JSON.stringify(result.body).includes(env.GEMINI_API_KEY));
 assert.equal(requests[1].options.body.includes('responseMimeType'),true);
});
test('invalid model output rejected without trying to run code',async()=>{
 const handler=createHandler({env,fetchImpl:async(url)=>url.includes('upstash.io')?
   {ok:true,json:async()=>({result:'OK'})}:
   {ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify({...sample(),palette:{...sample().palette,accent:'red'}})}]}}]})}});
 const result=await handler(req,res());
 assert.equal(result.statusCode,502);
});
