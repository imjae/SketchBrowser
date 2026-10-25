import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewBlockReason } from '../src/review/availability';

test('지원하지 않는 페이지는 전송할 수 없는 이유를 반환한다', () => {
  for (const url of [
    'https://imjae.github.io/portfolio/another/?edit=1',
    'https://imjae-blog-author.imjae-game-dev-notes.workers.dev/portfolio/another/?edit=1',
    'https://imjae.github.io/writing/',
    'https://imjae.github.io/',
  ]) {
    const block = reviewBlockReason(url, false, false);
    assert.equal(block?.code, 'unsupported-page');
    assert.match(block!.message, /포트폴리오/);
  }
});

test('공개·소유자 편집 주소의 크래프톤 포트폴리오를 지원한다', () => {
  for(const origin of ['https://imjae.github.io','https://imjae-blog-author.imjae-game-dev-notes.workers.dev'])
    assert.equal(reviewBlockReason(origin+'/portfolio/krafton-2027/?edit=1#ai',false,false),null);
});

test('공개 글의 쿼리와 문단 링크는 전송을 막지 않는다', () => {
  for (const suffix of ['/', '/?edit=1', '/?from=tablet#section', '#section']) {
    assert.equal(reviewBlockReason('https://imjae.github.io/writing/cli-agent-harness'+suffix, false, false), null);
  }
});

test('페이지 로딩과 필기 복원은 서로 구분하고 준비 후 전송을 허용한다', () => {
  const url = 'https://imjae.github.io/writing/cli-agent-harness/';
  assert.equal(reviewBlockReason(url, true, true)?.code, 'page-loading');
  assert.equal(reviewBlockReason(url, false, true)?.code, 'notes-loading');
  assert.equal(reviewBlockReason(url, false, false), null);
});

test('주소 판정은 실제 캡처와 동일하게 다른 출처와 잘못된 slug를 거절한다', () => {
  for (const url of [
    'https://example.com/writing/cli-agent-harness/',
    'https://imjae.github.io/writing/not_valid/',
    'https://user@imjae.github.io/writing/cli-agent-harness/',
  ]) assert.equal(reviewBlockReason(url, false, false)?.code, 'unsupported-page');
});
