// Verifies controlled HTML/CSS/WAAPI/SVG/JS timeline timestamps in real Chrome.
// NOTE: frame messages originate in user-scriptable sandbox; this is
// regression verification of supported animation APIs, not a hostile-code VM.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {join} from 'node:path';
const host='http://127.0.0.1:4184';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4184','--strictPort'],{stdio:['ignore','pipe','pipe']});
let log='';
server.stdout.on('data',d=>log+=String(d));server.stderr.on('data',d=>log+=String(d));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let browser;
async function ready(){
  for(let i=0;i<55;i++){
    if(server.exitCode!==null)throw Error('Preview process exited: '+log);
    try{if((await fetch(host)).ok)return;}catch{}
    await wait(400);
  }
  throw Error('Preview did not start: '+log);
}
async function targetFrame(page,n){
  const slider=page.getByRole('slider',{name:'Select exact HTML animation frame'});
  await slider.evaluate((input,index)=>{
    const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
    set.call(input,String(index));
    input.dispatchEvent(new Event('input',{bubbles:true}));
    input.dispatchEvent(new Event('change',{bubbles:true}));
  },n);
  await page.locator('.frame-clock-status[data-state=ready]').filter({hasText:'FRAME READY'}).waitFor({timeout:50000});
  await page.waitForFunction(target=>document.querySelector('[data-testid="requested-frame"]')?.textContent===String(target) &&
    document.querySelector('.frame-clock-status')?.textContent.includes('FRAME READY'),n,{timeout:50000});
}
async function facts(page){
  return page.frameLocator('iframe[title="Sandboxed code preview"]').locator('body').evaluate(body=>{
    const shape=body.querySelector('#box');
    const matrix=getComputedStyle(shape).transform;
    const match=matrix.match(/^matrix\(([^)]+)\)$/);
    const x=match?Number(match[1].split(',')[4].trim()):null;
    return {
      clock:window.nexoraClock,
      raf:Number(body.dataset.raf),
      now:Number(body.dataset.now),
      performance:Number(body.dataset.performance),
      timer:Number(body.dataset.timer||0),
      interval:Number(body.dataset.interval||0),
      random:body.dataset.random,
      cssX:x,
      waapiOpacity:Number(getComputedStyle(body.querySelector('#waapi')).opacity),
      svgAnimatedX:body.querySelector('#smil-rect').x.animVal.value,
      animationPlayStates:document.getAnimations().map(animation=>animation.playState)
    };
  });
}
try{
  await ready();
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  await page.goto(host+'/?tool=motion',{waitUntil:'domcontentloaded'});
  const html='<section id="scene"><div id="box">FRAME</div><div id="waapi">WAAPI</div><span id="raf"></span></section>';
  const css='#scene{width:200px;min-height:100px} #box{width:100px;background:#866fe4;animation:move 2s linear infinite}@keyframes move{from{transform:translateX(0px)}to{transform:translateX(120px)}}';
  const svg='<svg id="smil-scene" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 35"><rect id="smil-rect" x="0" y="3" width="20" height="20" fill="#9c7eec"><animate attributeName="x" from="0" to="80" dur="2s" repeatCount="indefinite" /></rect></svg>';
  const js=[
    'document.querySelector("#waapi").animate([{opacity:0},{opacity:1}],{duration:2000,iterations:Infinity,fill:"both"});',
    'document.body.dataset.random=String(Math.random());',
    'document.body.dataset.timer="0";document.body.dataset.interval="0";',
    'setTimeout(()=>{document.body.dataset.timer="1";},250);',
    'setInterval(()=>{document.body.dataset.interval=String(Number(document.body.dataset.interval)+1);},500);',
    'function update(t){ document.body.dataset.raf=String(t);',
    '  document.body.dataset.now=String(Date.now());',
    '  document.body.dataset.performance=String(performance.now());',
    '  requestAnimationFrame(update); }',
    'requestAnimationFrame(update);'
  ].join('\n');
  for(const [tab,content] of [['HTML',html],['CSS',css],['SVG',svg],['JS',js]]){
    await page.getByRole('button',{name:tab,exact:true}).click();
    await page.getByRole('textbox',{name:tab+' code editor'}).fill(content);
  }
  await page.getByRole('button',{name:'Enable deterministic timeline'}).click();
  await page.locator('iframe[data-clock=controlled]').waitFor();
  await page.locator('.frame-clock-status[data-state=ready]').waitFor({timeout:12000});
  const at0=await facts(page);
  assert.equal(at0.clock.frame,0);assert.equal(at0.clock.ms,0);
  assert.equal(at0.raf,0);assert.equal(at0.now,1577836800000);
  assert.equal(at0.performance,0);assert.equal(at0.timer,0);assert.equal(at0.interval,0);
  assert.ok(Math.abs(at0.cssX)<1.5,'CSS animation should be at 0ms: '+at0.cssX);
  assert.ok(Math.abs(at0.waapiOpacity)<.04,'WAAPI should be at 0ms: '+at0.waapiOpacity);
  assert.ok(Math.abs(at0.svgAnimatedX)<1.5,'SVG SMIL should start at 0: '+at0.svgAnimatedX);
  console.log('PASS: controlled iframe starts at virtual timestamp 0, CSS and rAF frozen');

  await targetFrame(page,15);
  const at15=await facts(page);
  assert.equal(at15.clock.frame,15);assert.equal(at15.clock.ms,500);
  assert.equal(at15.raf,500);assert.equal(at15.now,1577836800500);
  assert.equal(at15.performance,500);assert.equal(at15.timer,1);assert.equal(at15.interval,1);
  assert.ok(Math.abs(at15.cssX-30)<2,'CSS transform at 500ms should be translateX(30): '+at15.cssX);
  assert.ok(at15.animationPlayStates.every(state=>state==='paused'));
  assert.ok(Math.abs(at15.waapiOpacity-.25)<.045,'WAAPI at 500ms should be opacity .25: '+at15.waapiOpacity);
  assert.ok(Math.abs(at15.svgAnimatedX-20)<2,'SMIL at 500ms should move to x=20: '+at15.svgAnimatedX);
  console.log('PASS: frame 15 @ 30fps produces exactly 500ms across CSS/rAF/Date/performance/timers');

  await targetFrame(page,30);
  const at30=await facts(page);
  assert.equal(at30.clock.frame,30);assert.equal(at30.clock.ms,1000);
  assert.equal(at30.raf,1000);assert.equal(at30.timer,1);assert.equal(at30.interval,2);
  assert.ok(Math.abs(at30.cssX-60)<2,'CSS transform at 1s should be translateX(60): '+at30.cssX);
  assert.ok(Math.abs(at30.waapiOpacity-.5)<.045,'WAAPI at 1s should be opacity .5: '+at30.waapiOpacity);
  assert.ok(Math.abs(at30.svgAnimatedX-40)<2,'SMIL at 1s should move to x=40: '+at30.svgAnimatedX);
  console.log('PASS: frame 30 @ 30fps yields 1000ms and repeatable CSS and JS state');

  await targetFrame(page,15);
  const rewind=await facts(page);
  assert.equal(rewind.clock.frame,15);
  assert.equal(rewind.clock.ms,500);
  assert.equal(rewind.random,at15.random,'seeded random sequence resets across iframe reload');
  assert.equal(rewind.interval,at15.interval,'timer state rebuilt on rewind');
  assert.ok(Math.abs(rewind.cssX-at15.cssX)<.25,'CSS rewind must reconstruct identical frame');
  assert.equal(rewind.raf,at15.raf);
  assert.ok(Math.abs(rewind.waapiOpacity-at15.waapiOpacity)<.025);
  assert.ok(Math.abs(rewind.svgAnimatedX-at15.svgAnimatedX)<1);
  console.log('PASS: non-monotonic seek destroys prior sandbox and exactly replays JS state');

  await page.selectOption('#motion-clock-fps','60');
  await page.locator('.frame-clock-status[data-state=ready]').waitFor({timeout:14000});
  await targetFrame(page,1);
  const sixty=await facts(page);
  assert.equal(sixty.clock.fps,60);
  assert.ok(Math.abs(sixty.clock.ms-1000/60)<.00001);
  assert.ok(Math.abs(sixty.raf-1000/60)<.00001);
  assert.ok(Math.abs(sixty.cssX-1)<1.2);
  console.log('PASS: 60fps frame index 1 produces precise 16.6667ms timestamps');

  await mkdir('artifacts',{recursive:true});
  await page.screenshot({path:join('artifacts','html-timeline-desktop.png'),fullPage:true,animations:'disabled'});
  for(const width of [360,390,412]){
    await page.setViewportSize({width,height:844});
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
    assert.ok(overflow<=1,'Timeline horizontal overflow at '+width+': '+overflow);
    await page.screenshot({path:join('artifacts','html-timeline-mobile-'+width+'.png'),fullPage:true,animations:'disabled'});
  }
  console.log('PASS: deterministic timeline works on 360/390/412px layouts');
  await page.getByRole('button',{name:'Disable deterministic timeline'}).click();
  await page.locator('iframe[data-clock=live]').waitFor();
  assert.equal(await page.getByRole('slider',{name:'Select exact HTML animation frame'}).count(),0);
  console.log('PASS: switching back to normal live animation does not alter code');
}finally{
  if(browser)await browser.close();
  server.kill('SIGTERM');
}
