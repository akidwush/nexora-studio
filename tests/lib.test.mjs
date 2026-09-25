import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPreviewDoc } from '../src/lib/preview.js';
import { pixelGridToSvg } from '../src/lib/vector.js';
test('preview keeps script and style content inside their tags',()=>{
  const doc=buildPreviewDoc({css:'</style><h1>break',js:'</script><h1>break'});
  assert.ok(!doc.includes('</style><h1>break'));
  assert.ok(!doc.includes('</script><h1>break'));
  assert.match(doc,/connect-src 'none'/);
});
test('vector mosaic makes actual SVG rectangles',()=>{
  const svg=pixelGridToSvg({width:2,height:1,data:new Uint8ClampedArray([255,0,0,255,0,0,255,128])},200,100);
  assert.match(svg,/fill="#ff0000"/);
  assert.match(svg,/fill="#0000ff" fill-opacity="0.502"/);
  assert.match(svg,/width="200" height="100"/);
});
test('invalid raster grid is rejected',()=>{
  assert.throws(()=>pixelGridToSvg({width:0,height:1,data:[]},1,1));
});
