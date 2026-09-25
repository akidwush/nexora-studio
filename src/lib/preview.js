// Never render untrusted output in the app DOM. iframe sandbox MUST omit allow-same-origin.
export function buildPreviewDoc({html='',css='',js=''}={}) {
  const safeCss=String(css).replace(/<\/style/gi,'<\\/style');
  const safeJs=String(js).replace(/<\/script/gi,'<\\/script');
  const csp="default-src 'none'; base-uri 'none'; object-src 'none'; form-action 'none'; connect-src 'none'; frame-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:;";
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="'+csp+'"><style>html,body{margin:0;min-height:100%}*{box-sizing:border-box}'+safeCss+'</style></head><body>'+String(html)+'<script>'+safeJs+'</script></body></html>';
}
