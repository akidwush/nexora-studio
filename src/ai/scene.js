// Declarative and intentionally narrow. No arbitrary JavaScript, CSS, remote resources or URLs.
const PALETTES=Object.freeze({
  midnight:{background:'#0D1033',primary:'#725AFF',accent:'#D5A3FF',text:'#FFFFFF'},
  sunset:{background:'#32142B',primary:'#FE734E',accent:'#FFD080',text:'#FFFAEF'},
  ocean:{background:'#052839',primary:'#0D94C2',accent:'#81EDE3',text:'#FFFFFF'},
  forest:{background:'#092A23',primary:'#4EA978',accent:'#D7ED9A',text:'#FFFFFF'},
  rose:{background:'#35172E',primary:'#EF6C9A',accent:'#FFD2E2',text:'#FFFFFF'}
});
export const SCENE_PALETTES=PALETTES;
export const SCENE_TEMPLATES=Object.freeze(['orbit','kinetic','waves']);
export const SCENE_ENERGIES=Object.freeze(['calm','balanced','bold']);
export function validatePrompt(value){
 if(typeof value!=='string')throw new Error('Prompt must be text.');
 const prompt=value.replace(/[\u0000-\u001F\u007F]/g,' ').trim().replace(/\s+/g,' ');
 if(prompt.length<8||prompt.length>500)throw new Error('Write a description between 8 and 500 characters.');
 return prompt;
}
function cleanText(value,limit,required){
 if(typeof value!=='string')throw new Error('Generated scene text is invalid.');
 const text=value.replace(/[\u0000-\u001F\u007F]/g,' ').replace(/<[^>]*>/g,'').trim().replace(/\s+/g,' ');
 if((required&&!text)||text.length>limit)throw new Error('Generated scene text exceeds allowed limits.');
 return text;
}
function cleanColor(value){
 if(typeof value!=='string'||!/^#[0-9a-fA-F]{6}$/.test(value))throw new Error('Scene colors must be 6-digit hex values.');
 return value.toUpperCase();
}
export function validateScene(scene){
 if(!scene||typeof scene!=='object'||Array.isArray(scene))throw new Error('Scene must be a structured object.');
 if(!SCENE_TEMPLATES.includes(scene.template))throw new Error('Unknown scene motion template.');
 if(!SCENE_ENERGIES.includes(scene.energy))throw new Error('Unknown scene motion energy.');
 if(!scene.palette||typeof scene.palette!=='object'||Array.isArray(scene.palette))throw new Error('Invalid scene palette.');
 return {
   version:1,
   template:scene.template,
   energy:scene.energy,
   title:cleanText(scene.title,38,true),
   subtitle:cleanText(scene.subtitle,90,false),
   palette:{
     background:cleanColor(scene.palette.background),
     primary:cleanColor(scene.palette.primary),
     accent:cleanColor(scene.palette.accent),
     text:cleanColor(scene.palette.text)
   }
 };
}
export function localSceneFromPrompt(value){
 const prompt=validatePrompt(value),p=prompt.toLowerCase();
 const paletteKey=/sunset|sunrise|warm|orange|sun|matahari|senja/.test(p)?'sunset':
   /ocean|sea|water|blue|laut|air|biru/.test(p)?'ocean':
   /forest|nature|green|jungle|hutan|hijau/.test(p)?'forest':
   /rose|pink|love|romance|merah muda/.test(p)?'rose':'midnight';
 const template=/wave|flow|ocean|gelombang|laut|air/.test(p)?'waves':
   /shape|kinetic|square|geometr|bentuk|kotak/.test(p)?'kinetic':'orbit';
 const energy=/bold|energetic|exciting|fast|cepat|energi/.test(p)?'bold':
   /calm|slow|soft|gentle|tenang|lembut/.test(p)?'calm':'balanced';
 const headline=prompt.replace(/[.!?]+$/g,'').split(/[,.;]/)[0].slice(0,38).trim();
 return validateScene({template,energy,title:headline||'MAKE IDEAS MOVE',subtitle:'Created from a local preset • edit before export',palette:PALETTES[paletteKey]});
}
