import { PageNotes, validStrokes } from '../model';

export const BLOG_REPOSITORY = 'imjae/imjae.github.io' as const;
export const BLOG_ORIGIN = 'https://imjae.github.io';
const sha256 = /^[a-f0-9]{64}$/;
const commit = /^[a-f0-9]{40}$/;
const identifier = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;

// Resolved from a pinned Git tree by the blog adapter, never from page-provided paths.
export type BlogTarget = {
  version: 1;
  repository: typeof BLOG_REPOSITORY;
  canonicalUrl: string;
  slug: string;
  sourcePath: string;
  baseCommit: string;
  sourceSha256: string;
};

export type AnnotationRegion = {
  id: string;
  strokeIds: string[];
  quote: { exact: string; prefix: string; suffix: string; heading: string };
  // CSS document coordinates at capture time, not the current scroll offset.
  bounds: { x: number; y: number; width: number; height: number };
  image: { fileName: string; mime: 'image/png'; sha256: string; bytes: number; width: number; height: number };
};

export type RevisionRequest = {
  version: 1;
  id: string;
  createdAt: string;
  target: BlogTarget;
  page: PageNotes;
  // null means the page did not expose a verifiable source revision.
  capturedSourceSha256: string | null;
  instruction: string;
  regions: AnnotationRegion[];
};

function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function canonicalArticleUrl(value: string): string {
  const url = new URL(value);
  requireValue(url.origin === BLOG_ORIGIN && !url.username && !url.password, '지원하는 블로그 주소가 아닙니다.');
  const path = /^\/writing\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/.exec(url.pathname);
  requireValue(path, '첫 버전은 공개된 글 본문만 지원합니다.');
  return `${BLOG_ORIGIN}/writing/${path[1]}/`;
}

export function canonicalReviewUrl(value: string): string {
  const url = new URL(value);
  requireValue(!url.username && !url.password && [BLOG_ORIGIN, 'https://imjae-blog-author.imjae-game-dev-notes.workers.dev'].includes(url.origin), '지원하는 블로그 주소가 아닙니다.');
  if (/^\/portfolio\/krafton-2027\/?$/.test(url.pathname)) return `${BLOG_ORIGIN}/portfolio/krafton-2027/`;
  return canonicalArticleUrl(`${BLOG_ORIGIN}${url.pathname}`);
}

export function validateTarget(target: BlogTarget): void {
  requireValue(target?.version === 1 && target.repository === BLOG_REPOSITORY, '저장소 규격을 확인해 주세요.');
  requireValue(identifier.test(target.slug) && target.canonicalUrl === `${BLOG_ORIGIN}/writing/${target.slug}/`, '글 주소가 일치하지 않습니다.');
  requireValue(/^content\/articles\/(gameplay|graphics|tools|ai|notes|math|reading)\/[a-z0-9-]+\.md$/.test(target.sourcePath), '허용되지 않은 원본 경로입니다.');
  requireValue(commit.test(target.baseCommit) && sha256.test(target.sourceSha256), '원본 버전을 확인해 주세요.');
}

// This validates a typed local draft. A future HTTP handler must separately parse
// unknown input, enforce upload limits, and verify the referenced PNG bytes.
export function createRevisionRequest(input: RevisionRequest): RevisionRequest {
  validateTarget(input.target);
  requireValue(input.version === 1 && uuid.test(input.id), '요청 식별자를 확인해 주세요.');
  requireValue(Number.isFinite(Date.parse(input.createdAt)), '요청 시각을 확인해 주세요.');
  requireValue(input.page.version === 1 && canonicalArticleUrl(input.page.url) === input.target.canonicalUrl, '필기와 원본 글이 다릅니다.');
  requireValue(typeof input.page.title === 'string' && input.page.title.length <= 300 && Number.isFinite(Date.parse(input.page.updatedAt)), '필기 정보를 확인해 주세요.');
  requireValue(validStrokes(input.page.strokes) && input.page.strokes.length > 0, '유효한 필기가 필요합니다.');
  requireValue(input.capturedSourceSha256 === null || sha256.test(input.capturedSourceSha256), '읽은 원문의 버전이 올바르지 않습니다.');
  requireValue(typeof input.instruction === 'string' && input.instruction.length <= 4000, '요청 설명은 4,000자 이내로 적어 주세요.');
  requireValue(input.regions.length > 0 && input.regions.length <= 12, '필기 영역은 1~12개까지 보낼 수 있습니다.');
  const strokes = new Set(input.page.strokes.map(stroke => stroke.id));
  requireValue(strokes.size === input.page.strokes.length, '필기 식별자가 중복되었습니다.');
  const ids = new Set<string>(), images = new Set<string>();
  let totalBytes = 0;
  for (const region of input.regions) {
    requireValue(identifier.test(region.id) && !ids.has(region.id), '영역 식별자를 확인해 주세요.');
    ids.add(region.id);
    requireValue(region.strokeIds.length > 0 && region.strokeIds.every(id => strokes.has(id)) && new Set(region.strokeIds).size === region.strokeIds.length, '영역의 필기를 찾을 수 없습니다.');
    const { exact, prefix, suffix, heading } = region.quote;
    requireValue([exact, prefix, suffix, heading].every(text => typeof text === 'string'), '원문 문맥을 확인해 주세요.');
    requireValue(exact.trim().length > 0 && exact.length <= 8000 && prefix.length <= 1000 && suffix.length <= 1000 && heading.length <= 300, '원문 문맥의 길이를 확인해 주세요.');
    const { x, y, width, height } = region.bounds;
    requireValue([x, y, width, height].every(n => Number.isFinite(n) && n >= 0 && n <= 10_000_000) && width > 0 && height > 0, '필기 영역 좌표가 올바르지 않습니다.');
    const image = region.image;
    requireValue(image.mime === 'image/png' && /^[a-z0-9-]+\.png$/.test(image.fileName) && !images.has(image.fileName), '필기 이미지 이름을 확인해 주세요.');
    images.add(image.fileName);
    requireValue(sha256.test(image.sha256) && Number.isSafeInteger(image.bytes) && image.bytes > 0 && image.bytes <= 5_000_000, '필기 이미지 크기와 해시를 확인해 주세요.');
    requireValue([image.width, image.height].every(n => Number.isSafeInteger(n) && n > 0 && n <= 8192), '이미지 해상도를 확인해 주세요.');
    totalBytes += image.bytes;
  }
  requireValue(totalBytes <= 20_000_000, '요청 이미지 합계는 20MB 이하여야 합니다.');
  // The user may continue drawing while the submitted revision is being reviewed.
  return JSON.parse(JSON.stringify(input)) as RevisionRequest;
}

export function captureStatus(request: RevisionRequest): 'ready' | 'source-unverified' | 'source-changed' {
  if (request.capturedSourceSha256 === null) return 'source-unverified';
  return request.capturedSourceSha256 === request.target.sourceSha256 ? 'ready' : 'source-changed';
}
