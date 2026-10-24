import assert from 'node:assert/strict';
import test from 'node:test';
import { captureStatus, canonicalArticleUrl, createRevisionRequest, RevisionRequest } from '../src/review/contract';
import { approveReview, finishDeployment, newJob, publishReview, rejectReview, reviseJob, Review, startDeployment, startPreparation, stopPreparation } from '../src/review/workflow';

function request(): RevisionRequest {
  return {
    version: 1, id: '12345678-1234-1234-1234-123456789abc', createdAt: '2026-10-24T10:00:00.000Z',
    target: { version: 1, repository: 'imjae/imjae.github.io', canonicalUrl: 'https://imjae.github.io/writing/sample/', slug: 'sample',
      sourcePath: 'content/articles/tools/original-file.md', baseCommit: 'a'.repeat(40), sourceSha256: 'b'.repeat(64) },
    page: { version: 1, url: 'https://imjae.github.io/writing/sample/?from=tablet#section', title: '예시', updatedAt: '2026-10-24T10:00:00.000Z',
      strokes: [{ id: 'stroke-1', tool: 'pen', color: '#315de8', width: 3, anchor: null, points: [{ x: 100, y: 200, pressure: 0.5 }] }] },
    capturedSourceSha256: 'b'.repeat(64), instruction: '밑줄 친 문장을 간결하게 다듬어 주세요.',
    regions: [{ id: 'region-1', strokeIds: ['stroke-1'], quote: { exact: '원래 문장입니다.', prefix: '', suffix: '', heading: '소개' },
      bounds: { x: 0, y: 100, width: 600, height: 400 },
      image: { fileName: 'region-1.png', mime: 'image/png', sha256: 'c'.repeat(64), bytes: 40000, width: 1200, height: 800 } }],
  };
}

function review(): Review {
  return { id: 'review-1', requestId: 'request-1', generation: 1, baseCommit: 'a'.repeat(40), headCommit: 'b'.repeat(40),
    previewSha256: 'c'.repeat(64), diffSha256: 'd'.repeat(64), checksSha256: 'e'.repeat(64), checksPassed: true };
}
const pending = () => publishReview(startPreparation(newJob('request-1')), review());

test('수정 요청은 필기와 문맥의 독립된 스냅샷을 보관한다', () => {
  const draft = request();
  const submitted = createRevisionRequest(draft);
  draft.page.strokes[0].points[0].x = 999;
  draft.regions[0].quote.exact = '수정된 문장';
  assert.equal(submitted.page.strokes[0].points[0].x, 100);
  assert.equal(submitted.regions[0].quote.exact, '원래 문장입니다.');
  assert.equal(captureStatus(submitted), 'ready');
  assert.equal(canonicalArticleUrl(draft.page.url), draft.target.canonicalUrl);
});

test('외부 글, 경로 탈출, 잘못된 이미지·영역과 원문 불일치를 거절한다', () => {
  const invalid = [
    (r: RevisionRequest) => { r.page.url = 'https://example.com/writing/sample/'; },
    (r: RevisionRequest) => { r.target.sourcePath = 'content/articles/tools/../../AGENTS.md'; },
    (r: RevisionRequest) => { r.page.url = 'https://imjae.github.io/writing/another/'; },
    (r: RevisionRequest) => { r.regions[0].image.fileName = '../secret.png'; },
    (r: RevisionRequest) => { r.regions[0].image.bytes = 5_000_001; },
    (r: RevisionRequest) => { r.regions[0].bounds.x = NaN; },
    (r: RevisionRequest) => { r.regions[0].quote.exact = ''; },
    (r: RevisionRequest) => { r.regions[0].strokeIds = ['missing']; },
    (r: RevisionRequest) => { r.page.strokes.push(r.page.strokes[0]); },
    (r: RevisionRequest) => { r.regions.push(r.regions[0]); },
  ];
  for (const mutate of invalid) {
    const draft = request(); mutate(draft);
    assert.throws(() => createRevisionRequest(draft));
  }
  for (const url of ['http://imjae.github.io/writing/sample/', 'https://imjae.github.io/portfolio/', 'https://user@imjae.github.io/writing/sample/']) {
    assert.throws(() => canonicalArticleUrl(url));
  }
});

test('출처 해시가 없는 옛 필기와 달라진 글은 자동 편집 준비 완료로 취급하지 않는다', () => {
  const draft = request();
  draft.capturedSourceSha256 = null;
  assert.equal(captureStatus(createRevisionRequest(draft)), 'source-unverified');
  draft.capturedSourceSha256 = 'f'.repeat(64);
  assert.equal(captureStatus(createRevisionRequest(draft)), 'source-changed');
});

test('검사 실패·다른 요청의 결과로는 미리보기를 승인 대기에 올리지 않는다', () => {
  const preparing = startPreparation(newJob('request-1'));
  for (const bad of [{ ...review(), checksPassed: false }, { ...review(), generation: 2 }, { ...review(), requestId: 'other' }, { ...review(), headCommit: review().baseCommit }]) {
    assert.throws(() => publishReview(preparing, bad));
  }
  assert.equal(stopPreparation(preparing, 'needs-clarification').status, 'needs-clarification');
  assert.throws(() => publishReview(newJob('request-1'), review()));
});

test('승인은 사용자가 본 결과와 현재 main에 묶이며 승인 전 배포는 거절한다', () => {
  const job = pending();
  assert.throws(() => startDeployment(job, review().baseCommit, review()));
  assert.throws(() => approveReview(job, { ...review(), previewSha256: 'f'.repeat(64) }, review().baseCommit, 'owner'));
  assert.throws(() => approveReview(job, review(), '0'.repeat(40), 'owner'));
  const approved = approveReview(job, review(), review().baseCommit, 'owner');
  assert.throws(() => startDeployment(approved, '0'.repeat(40), review()));
  for (const field of ['headCommit', 'diffSha256', 'previewSha256', 'checksSha256'] as const) {
    assert.throws(() => startDeployment(approved, review().baseCommit, { ...review(), [field]: 'f'.repeat(64) }));
  }
  const deploying = startDeployment(approved, review().baseCommit, review());
  assert.throws(() => startDeployment(deploying, review().baseCommit, review()));
  assert.equal(deploying.status, 'deploying');
});

test('추가 수정과 거절은 승인을 없애고 늦게 도착한 이전 세대 결과를 거절한다', () => {
  const approved = approveReview(pending(), review(), review().baseCommit, 'owner');
  const revised = reviseJob(approved);
  assert.equal(revised.generation, 2);
  assert.equal(revised.review, undefined);
  assert.equal(revised.approval, undefined);
  assert.throws(() => publishReview(startPreparation(revised), review()));
  assert.throws(() => startDeployment(rejectReview(approved), review().baseCommit, review()));
});

test('동일 커밋의 공개·편집 서버 배포와 실제 주소 확인이 모두 끝나야 완료한다', () => {
  const job = startDeployment(approveReview(pending(), review(), review().baseCommit, 'owner'), review().baseCommit, review());
  const evidence = { headCommit: review().headCommit, pages: 'success' as const, authoring: 'success' as const, liveVerified: true };
  assert.equal(finishDeployment(job, evidence).status, 'deployed');
  assert.equal(finishDeployment(job, { ...evidence, authoring: 'failure' }).status, 'deployment-failed');
  assert.equal(finishDeployment(job, { ...evidence, liveVerified: false }).status, 'deployment-failed');
  assert.throws(() => finishDeployment(job, { ...evidence, headCommit: 'f'.repeat(40) }));
});
