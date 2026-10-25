import { canonicalReviewUrl } from './contract';

export type ReviewBlock = {
  code: 'unsupported-page' | 'page-loading' | 'notes-loading';
  message: string;
};

export function reviewBlockReason(url: string, pageLoading: boolean, notesLoading: boolean): ReviewBlock | null {
  try { canonicalReviewUrl(url); }
  catch {
    return {
      code: 'unsupported-page',
      message: '블로그의 개별 글이나 크래프톤 포트폴리오에서 필기를 전송해 주세요. 홈·목록·다른 포트폴리오는 지원하지 않아요.',
    };
  }
  if (pageLoading) return { code: 'page-loading', message: '글을 불러오는 중이에요. 로딩이 끝나면 필기를 전송해 주세요.' };
  if (notesLoading) return { code: 'notes-loading', message: '저장한 필기를 복원하는 중이에요. 복원이 끝나면 전송해 주세요.' };
  return null;
}
