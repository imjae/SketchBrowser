// Pure domain rules. Session authentication, database transactions, Git checks,
// image verification and deployment credentials belong to the future server.
export type Review = {
  id: string;
  requestId: string;
  generation: number;
  baseCommit: string;
  headCommit: string;
  previewSha256: string;
  diffSha256: string;
  checksSha256: string;
  checksPassed: boolean;
};
export type Job = {
  requestId: string;
  generation: number;
  status: 'queued' | 'preparing' | 'needs-clarification' | 'awaiting-approval' | 'approved' | 'deploying' | 'deployed' | 'rejected' | 'failed' | 'deployment-failed';
  review?: Review;
  approval?: { ownerId: string; review: Review };
};

function fail(message: string): never { throw new Error(message); }
function sameReview(a: Review, b: Review): boolean {
  return (Object.keys(a) as (keyof Review)[]).every(key => a[key] === b[key]);
}

export function newJob(requestId: string): Job {
  if (!requestId) fail('요청 식별자가 필요합니다.');
  return { requestId, generation: 1, status: 'queued' };
}

export function startPreparation(job: Job): Job {
  if (job.status !== 'queued') fail('대기 중인 요청만 처리할 수 있습니다.');
  return { ...job, status: 'preparing' };
}

export function stopPreparation(job: Job, reason: 'needs-clarification' | 'failed'): Job {
  if (job.status !== 'preparing') fail('진행 중인 수정 요청이 아닙니다.');
  return { ...job, status: reason };
}

export function publishReview(job: Job, review: Review): Job {
  if (job.status !== 'preparing' || review.requestId !== job.requestId || review.generation !== job.generation) fail('현재 수정 요청의 결과가 아닙니다.');
  if (!review.id || !review.checksPassed || ![review.baseCommit, review.headCommit].every(s => /^[a-f0-9]{40}$/.test(s)) ||
    ![review.previewSha256, review.diffSha256, review.checksSha256].every(s => /^[a-f0-9]{64}$/.test(s))) fail('검증된 미리보기가 필요합니다.');
  if (review.baseCommit === review.headCommit) fail('변경된 결과가 없습니다.');
  return { ...job, status: 'awaiting-approval', review: { ...review }, approval: undefined };
}

// ownerId comes only from an authenticated server session, never a JSON body.
export function approveReview(job: Job, displayedReview: Review, currentMain: string, ownerId: string): Job {
  if (job.status !== 'awaiting-approval' || !job.review || !ownerId) fail('승인 대기 중인 결과가 아닙니다.');
  if (!sameReview(job.review, displayedReview)) fail('미리보기가 바뀌었습니다. 새 결과를 확인해 주세요.');
  if (currentMain !== job.review.baseCommit) fail('블로그 원본이 바뀌었습니다. 다시 검증해야 합니다.');
  return { ...job, status: 'approved', approval: { ownerId, review: { ...job.review } } };
}

export function reviseJob(job: Job): Job {
  if (['deploying', 'deployed', 'deployment-failed'].includes(job.status)) fail('배포를 시작한 요청은 별도 수정 요청으로 이어 주세요.');
  return { requestId: job.requestId, generation: job.generation + 1, status: 'queued' };
}

export function rejectReview(job: Job): Job {
  if (!['awaiting-approval', 'approved'].includes(job.status)) fail('검토 중인 결과가 아닙니다.');
  return { ...job, status: 'rejected', approval: undefined };
}

export function startDeployment(job: Job, currentMain: string, actualReview: Review): Job {
  if (job.status !== 'approved' || !job.approval || !job.review) fail('사용자의 배포 승인이 필요합니다.');
  if (!sameReview(job.review, job.approval.review) || !sameReview(job.review, actualReview)) fail('승인 이후 결과가 바뀌었습니다.');
  if (currentMain !== job.review.baseCommit) fail('블로그 원본이 바뀌었습니다. 다시 검증해야 합니다.');
  return { ...job, status: 'deploying' };
}

export function finishDeployment(job: Job, evidence: {
  headCommit: string; pages: 'success' | 'failure'; authoring: 'success' | 'failure'; liveVerified: boolean;
}): Job {
  if (job.status !== 'deploying' || evidence.headCommit !== job.review?.headCommit) fail('승인된 커밋의 배포 결과가 아닙니다.');
  const success = evidence.pages === 'success' && evidence.authoring === 'success' && evidence.liveVerified;
  return { ...job, status: success ? 'deployed' : 'deployment-failed' };
}
