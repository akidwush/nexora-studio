// Local HTML/CSS animation presets. No external scripts or remote assets.
export const MOTION_PRESETS = Object.freeze([
  {
    id: 'orbit', label: 'Orbit Glow',
    html: '<div class="scene"><div class="orbit"></div><div class="core"></div><div class="copy"><span class="eyebrow">NEXORA / 001</span><h1>CREATE<br><em>IN MOTION.</em></h1><p>Everything starts with an idea.</p></div></div>',
    css: '.scene{width:100%;height:100vh;min-height:300px;overflow:hidden;position:relative;display:grid;place-items:center;background:radial-gradient(circle at 65% 40%,#4c2b81,#0d0d23 65%);color:white;font:700 clamp(20px,5vw,60px)/1.1 system-ui}.orbit{width:55vmin;height:55vmin;border:2px solid #9677e77a;border-radius:50%;box-shadow:0 0 60px #b07cff45;animation:spin 8s linear infinite}.core{position:absolute;width:24vmin;height:24vmin;border-radius:35%;background:linear-gradient(135deg,#d9bdff,#6040dc);box-shadow:0 20px 75px #9776e8b0;animation:float 3s ease-in-out infinite}.copy{position:absolute;left:8%;bottom:10%;z-index:2}.copy h1{font-size:inherit;letter-spacing:-.05em;margin:8px 0}.copy h1 em{font-style:normal;color:#c5adff}.eyebrow{font-size:11px;letter-spacing:.2em;color:#b8a8dc}.copy p{font-size:12px;font-weight:400;color:#bab1cd}@keyframes spin{to{transform:rotate(360deg)}}@keyframes float{50%{transform:translateY(-15px) rotate(15deg)}}',
    js: '// Orbit Glow: self-running, CSS-only animation.'
  },
  {
    id:'neon',label:'Neon Typography',
    html:'<div class="neon-scene"><span class="eyebrow">NEXORA STUDIO PRESENTS</span><h1>THE NEXT<br><strong>FRAME.</strong></h1><div class="light"></div></div>',
    css:'.neon-scene{height:100vh;min-height:300px;display:flex;flex-direction:column;justify-content:center;align-items:center;position:relative;overflow:hidden;background:#070814;color:white;font-family:system-ui}.eyebrow{z-index:1;font-size:clamp(9px,1.5vw,15px);letter-spacing:.35em;color:#a7aacd}.neon-scene h1{z-index:1;font-size:clamp(46px,10vw,140px);line-height:.95;text-align:center;letter-spacing:-.09em;margin:32px 0;text-shadow:0 0 50px #7588ff80;animation:reveal 3s ease-in-out infinite alternate}.neon-scene strong{color:#a4b2ff}.light{position:absolute;width:70vmin;height:70vmin;border-radius:50%;background:#6178d850;filter:blur(95px);animation:shift 4s ease-in-out infinite alternate}@keyframes reveal{from{opacity:.55;transform:scale(.96)}to{opacity:1;transform:scale(1.025)}}@keyframes shift{to{transform:translate(30%,-15%)}}',
    js:'// Neon Typography: browser-native CSS animations.'
  },
  {
    id:'kinetic',label:'Kinetic Shapes',
    html:'<section class="frame"><span>STUDIO / 003</span><div class="shapes"><div class="one"></div><div class="two"></div><div class="three"></div></div><h1>DESIGN<br>IN FLOW</h1></section>',
    css:'.frame{height:100vh;min-height:300px;background:#ffede1;color:#271535;font-family:system-ui;position:relative;overflow:hidden;display:flex;flex-direction:column;justify-content:space-between;padding:8%}.frame>span{font-size:12px;letter-spacing:.24em;font-weight:700}.frame h1{font-size:clamp(45px,10vw,120px);line-height:.88;letter-spacing:-.08em;margin:0;z-index:2}.shapes{position:absolute;inset:5%;display:grid;place-items:center}.shapes div{width:34vmin;height:34vmin;position:absolute;box-shadow:0 20px 40px #29102b25}.one{border-radius:50%;background:#fa5c5e;animation:dance 3s ease-in-out infinite alternate}.two{border-radius:22%;background:#7e54dc;mix-blend-mode:multiply;animation:dance 3.3s ease-in-out infinite alternate-reverse}.three{border-radius:50% 8% 50% 8%;background:#ffba54;mix-blend-mode:multiply;animation:twist 4s linear infinite}@keyframes dance{to{transform:translate(35%,25%) rotate(55deg)}}@keyframes twist{to{transform:rotate(360deg)}}',
    js:'// Kinetic Shapes: tweak CSS keyframes and hit Run preview.'
  },
  {
    id:'minimal',label:'Minimal Reveal',
    html:'<main class="minimal"><span>THE CREATIVE PROCESS / 004</span><h1>LESS,<br><em>BUT BETTER.</em></h1><p>Find the magic in every frame.</p><div class="rule"></div></main>',
    css:'.minimal{height:100vh;min-height:300px;padding:9%;background:#eeeae5;color:#15141d;display:flex;flex-direction:column;justify-content:center;position:relative;font-family:system-ui}.minimal>span{position:absolute;top:9%;font-weight:700;font-size:12px;letter-spacing:.13em}.minimal h1{font-size:clamp(45px,10vw,135px);line-height:.94;letter-spacing:-.09em;margin:0;animation:rise 2.5s ease-in-out infinite alternate}.minimal h1 em{font-style:normal;color:#d65b43}.minimal p{font-size:clamp(12px,1.7vw,18px);color:#57525c}.rule{width:40%;height:5px;background:#d65b43;animation:grow 2.5s ease-in-out infinite alternate}@keyframes rise{from{opacity:.45;transform:translateY(15px)}to{opacity:1;transform:translateY(-8px)}}@keyframes grow{to{width:85%}}',
    js:'// Minimal Reveal: mobile friendly, no JS dependencies.'
  }
]);
export function getMotionPreset(id){return MOTION_PRESETS.find(p=>p.id===id)??null;}
