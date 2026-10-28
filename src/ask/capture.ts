import { InkCommand } from '../model';

type Exchange = (command: InkCommand, signal: AbortSignal) => Promise<{ ready?: boolean; image?: string }>;

// Shared sequencing can be checked with real browser pixels without packaging Android.
export async function captureQuestionImage(options: {
  nonce: string; selectionId: string; signal: AbortSignal;
  exchange: Exchange; snapshot(): Promise<string>; release(command: InkCommand): void;
}): Promise<string> {
  const { nonce, selectionId, signal, exchange, snapshot, release } = options;
  const checkAbort = () => { if (signal.aborted) throw new Error('질문을 취소했어요.'); };
  try {
    checkAbort();
    const ready = await exchange({ type: 'questionCapture', nonce, selectionId }, signal);
    if (!ready.ready) throw new Error('질문 영역을 다시 지정해 주세요.');
    checkAbort();
    const image = await new Promise<string>((resolve,reject) => {
      const cleanup = () => { clearTimeout(timer); signal.removeEventListener('abort',cancelled); };
      const cancelled = () => { cleanup(); reject(new Error('질문을 취소했어요.')); };
      const timer = setTimeout(() => { cleanup(); reject(new Error('영역 준비가 지연됐어요. 다시 시도해 주세요.')); },7000);
      signal.addEventListener('abort',cancelled,{once:true});
      if(signal.aborted){cancelled();return;}
      void snapshot().then(value=>{cleanup();resolve(value);},error=>{cleanup();reject(error);});
    });
    checkAbort();
    const masked = await exchange({ type: 'questionMask', nonce, image }, signal);
    checkAbort();
    if (typeof masked.image !== 'string' || masked.image.length > 4_000_000 ||
      !/^iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(masked.image)) throw new Error('영역 이미지를 준비하지 못했어요.');
    return masked.image;
  } finally { release({ type: 'questionRelease', nonce }); }
}
