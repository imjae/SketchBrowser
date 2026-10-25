import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, join, extname } from 'node:path';
import { chromium } from '@playwright/test';
import { inside } from './core.mjs';

export async function verifyAndPreview({root,slug,path:targetPath,kind='article',afterHash,dataDir}) {
  targetPath ||= `/writing/${slug}/`;
  const contentSelector=kind==='portfolio'?'main.rp-main':'article.prose';
  const dist=join(root,'dist');
  const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.json':'application/json'};
  const server=createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const file=inside(dist,resolve(dist,'.'+pathname+(pathname.endsWith('/')?'index.html':'')));res.setHeader('Content-Type',types[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.statusCode=404;res.end();}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'chrome',headless:true});
    const page=await browser.newPage({viewport:{width:1280,height:900}});
    const home=await page.goto(origin+'/');if(home.status()!==200)throw new Error('Home 미리보기 실패');
    if(await page.locator('a[href^="/writing/"]').count()<1)throw new Error('Home 글 목록 확인 실패');
    const article=await page.goto(origin+targetPath);if(article.status()!==200)throw new Error('수정한 대상 미리보기 실패');
    await page.locator(contentSelector).waitFor();
    if(await page.locator('link[rel="stylesheet"]').count()<1 || !await page.evaluate(()=>[...document.styleSheets].some(sheet=>sheet.href?.includes('/_astro/') && sheet.cssRules.length>0)))throw new Error('블로그 스타일을 불러오지 못했습니다.');
    if(await page.locator(contentSelector).getAttribute('data-sketch-source')!==afterHash)throw new Error('미리보기와 수정 원본 버전이 다릅니다.');
    if(await page.locator('.mermaid-diagram').count())await page.waitForFunction(()=>[...document.querySelectorAll('.mermaid-diagram')].every(el=>el.querySelector('svg')),null,{timeout:30000});
    await page.screenshot({path:join(dataDir,'preview-desktop.png'),fullPage:true});
    const styles=[];
    for(const href of await page.locator('link[rel="stylesheet"]').evaluateAll(els=>els.map(el=>el.getAttribute('href')))){
      if(!href.startsWith('/'))continue;
      const css=await readFile(inside(dist,join(dist,href)),'utf8');
      styles.push(css.replace(/url\((['"]?)([^)'"\s]+)\1\)/g,(all,quote,url)=>url.startsWith('data:')?all:`url("${new URL(url,'https://imjae.github.io'+href).href}")`));
    }
    const html=await page.evaluate(css=>{
      const doc=document.documentElement.cloneNode(true);
      doc.querySelectorAll('script,link[rel="stylesheet"],link[rel="modulepreload"],meta[http-equiv],form,button,input').forEach(el=>el.remove());
      doc.querySelectorAll('iframe').forEach(el=>{const p=document.createElement('p');p.textContent='영상은 공개 글에서 재생할 수 있습니다.';el.replaceWith(p);});
      doc.querySelectorAll('*').forEach(el=>{for(const a of [...el.attributes])if(a.name.startsWith('on')||a.name==='srcdoc')el.removeAttribute(a.name);});
      doc.querySelectorAll('[src]').forEach(el=>{const src=el.getAttribute('src');if(src&&!src.startsWith('data:'))el.setAttribute('src',new URL(src,'https://imjae.github.io'+location.pathname).href);});
      doc.querySelectorAll('[srcset]').forEach(el=>el.removeAttribute('srcset'));
      doc.querySelectorAll('a').forEach(el=>{const href=el.getAttribute('href');if(href&&!href.startsWith('#'))el.removeAttribute('href');el.removeAttribute('target');});
      const style=document.createElement('style');style.textContent=css.join('\n');doc.querySelector('head').append(style);
      return '<!doctype html>'+doc.outerHTML;
    },styles);
    if(!styles.length)throw new Error('미리보기에 글 스타일이 없습니다.');
    await page.setViewportSize({width:390,height:844});await page.reload();
    await page.screenshot({path:join(dataDir,'preview-mobile.png'),fullPage:true});
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2);if(overflow)throw new Error('수정 글의 모바일 가로 넘침을 확인해 주세요.');
    await page.goto(origin+'/writing/');const search=page.locator('input[type="search"]').first();await search.fill('CLI');
    await page.waitForTimeout(300);if(await page.locator('a[href="/writing/cli-agent-harness/"]:visible').count()<1)throw new Error('모바일 검색 확인 실패');
    await page.goto(origin+'/writing/cli-agent-harness/');if(await page.locator('article.prose').count()!==1)throw new Error('긴 글 확인 실패');
    return html;
  } finally {await browser?.close();await new Promise(r=>server.close(r));}
}
