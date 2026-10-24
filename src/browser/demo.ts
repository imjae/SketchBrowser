import { PRACTICE_URL } from '../urls';

export function demoHtml(url: string): string {
  const practice = url === PRACTICE_URL;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
  <title>${practice ? '나만의 연습 노트' : '웹 위에, 나의 생각을.'}</title>
  <style>
  *{box-sizing:border-box}html{background:#fbfaf6;color:#292d35;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.9}
  body{margin:0}main{max-width:860px;margin:auto;padding:72px 64px 96px}.eyebrow{font-size:11px;letter-spacing:3px;color:#71876d;font-weight:700}
  .top{display:flex;justify-content:space-between;border-bottom:1px solid #e7e5de;padding-bottom:20px;font-size:12px;color:#85877e}
  h1{font-family:Georgia,'Noto Serif KR',serif;font-size:52px;line-height:1.35;letter-spacing:-2px;font-weight:500;margin:35px 0 24px}h1 em{font-style:normal;color:#53775b}
  .intro{font-size:18px;color:#747870;max-width:580px}.meta{font-size:12px;color:#92968d;margin:26px 0 40px}
  .hero{height:180px;background:#e8ede3;border-radius:4px;position:relative;overflow:hidden;margin-bottom:46px;display:flex;align-items:center;justify-content:center}
  .circle{position:absolute;border:1px solid #b3c2ab;border-radius:50%;width:270px;height:270px;right:20px;top:-50px}.circle.small{width:210px;height:210px;right:50px;top:-20px}
  .hero-text{font:italic 36px Georgia,serif;color:#4e6850;z-index:1;letter-spacing:-1px}.hero small{position:absolute;bottom:16px;left:22px;font-size:10px;letter-spacing:2px;color:#84927a}
  h2{font-size:21px;letter-spacing:-.5px;margin-top:36px}p{font-size:16px;line-height:2;color:#51584f}blockquote{border-left:3px solid #8fa884;margin:30px 0;padding:12px 24px;background:#f1f3ec;color:#607456;font-size:19px}
  .steps{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:32px 0}.step{border-top:1px solid #d8ded1;padding:16px 0}.step b{font-size:11px;letter-spacing:1px;color:#829775}.step p{font-size:13px}
  .paper{height:430px;background:repeating-linear-gradient(transparent,transparent 35px,#dfe4da 35px,#dfe4da 36px);margin-top:25px;border-top:1px solid #dfe4da}
  footer{font-size:11px;letter-spacing:2px;border-top:1px solid #e0e4da;color:#9a9e95;margin-top:48px;padding-top:24px}
  @media(max-width:600px){main{padding:35px 26px 70px}h1{font-size:38px}.steps{gap:12px}.hero-text{font-size:29px}}
  </style></head><body><main>
  <div class="top"><span>THE SKETCH JOURNAL</span><span>VOL. 001 &nbsp; / &nbsp; 시작하기</span></div>
  <div style="margin-top:38px" class="eyebrow">A LITTLE SPACE FOR YOUR THOUGHTS</div>
  <h1 id="headline">${practice ? '생각을 펼치는<br><em>나만의 연습 노트.</em>' : '웹 위에,<br><em>나의 생각을.</em>'}</h1>
  <p class="intro" id="intro">${practice ? '정답도, 정해진 형식도 없어요. 아래 빈 공간에 자유롭게 쓰고 그려 보세요.' : '읽다가 떠오른 생각, 놓치고 싶지 않은 문장.<br>이제 웹페이지 위에 바로 남겨 보세요.'}</p>
  <div class="meta">SketchBrowser 팀 &nbsp; · &nbsp; 3분 읽기 &nbsp; · &nbsp; 필기 연습용 페이지</div>
  <div class="hero"><div class="circle"></div><div class="circle small"></div><span class="hero-text">Make room for your ideas.</span><small>READ. THINK. SKETCH.</small></div>
  <h2 id="section-one">${practice ? '여기서부터 자유롭게' : '읽는 것에서, 내 것으로 만드는 것까지'}</h2>
  <p id="paragraph-one">좋은 생각은 언제나 예고 없이 찾아옵니다. 웹에서 글을 읽을 때도 마찬가지예요. 마음에 드는 문장에 밑줄을 긋고, 여백에 짧은 메모를 남기는 것만으로도 읽기의 경험은 달라집니다.</p>
  <p id="paragraph-two">위쪽 도구에서 펜을 골라 이 문장 옆에 한마디 적어 보세요. 형광펜으로 중요한 부분을 표시하거나, 밑줄 도구로 곧은 선을 그을 수도 있어요. 필기는 획을 마칠 때마다 이 기기에 자동 저장됩니다.</p>
  <blockquote id="quote">“읽는 순간의 생각을, 그 문장이 있는 자리에.”</blockquote>
  <div class="steps"><div class="step"><b>01 &nbsp; READ</b><p>탐색 모드에서<br>페이지를 읽고 이동해요.</p></div><div class="step"><b>02 &nbsp; SKETCH</b><p>펜과 형광펜으로<br>생각을 남겨요.</p></div><div class="step"><b>03 &nbsp; REVISIT</b><p>저장한 페이지를 열어<br>다시 이어서 읽어요.</p></div></div>
  <h2 id="practice-heading">여백은 당신의 것</h2>
  <p id="practice-description">아래 공간에 첫 메모를 남겨 보세요. 스크롤하려면 탐색 도구로 바꿔 주세요. ‘펜만’ 옵션을 켜면 손가락과 손바닥으로 생기는 필기를 차단할 수 있어요.</p>
  <div class="paper" id="practice-paper"></div>
  <footer>SKETCHBROWSER &nbsp; / &nbsp; YOUR WEB, WITH YOUR THOUGHTS.</footer>
  </main></body></html>`;
}
