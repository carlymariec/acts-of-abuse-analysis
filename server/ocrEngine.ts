import path from 'node:path';
import sharp from 'sharp';
import { createWorker, PSM, type Worker } from 'tesseract.js';

export interface OcrLine {
  lineNumber: number;
  text: string;
  confidence: number;
}

export interface OcrResult {
  text: string;
  confidence: number;
  lines: OcrLine[];
  width: number;
  height: number;
}

const LOCAL_LANG_PATH = path.join(
  process.cwd(),
  'node_modules/@tesseract.js-data/eng/4.0.0_best_int'
);

let workerPromise: Promise<Worker> | null = null;
let workerQueue: Promise<unknown> = Promise.resolve();

async function getOcrWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker('eng', 1, {
      langPath: LOCAL_LANG_PATH,
      cacheMethod: 'none',
      gzip: true,
    });
  }
  return workerPromise;
}

async function preprocessImageForOcr(
  inputBuffer: Buffer
): Promise<{ pngBuffer: Buffer; width: number; height: number }> {
  const base = sharp(inputBuffer, { failOn: 'none' }).rotate();
  const meta = await base.metadata();
  const origWidth = meta.width || 1200;

  let pipeline = sharp(inputBuffer, { failOn: 'none' }).rotate();
  if (origWidth < 1600) {
    const targetWidth = Math.min(3200, Math.max(1600, origWidth * 2));
    pipeline = pipeline.resize({ width: targetWidth, kernel: 'lanczos3' });
  }

  const { data, info } = await pipeline
    .grayscale()
    .normalize()
    .sharpen({ sigma: 1.0 })
    .png()
    .toBuffer({ resolveWithObject: true });

  return {
    pngBuffer: data,
    width: info.width,
    height: info.height,
  };
}

export function runOcrOnImage(inputBuffer: Buffer): Promise<OcrResult> {
  const job = workerQueue.then(async (): Promise<OcrResult> => {
    const { pngBuffer, width, height } = await preprocessImageForOcr(inputBuffer);
    const worker = await getOcrWorker();

    await worker.setParameters({
      tessedit_pageseg_mode: PSM.AUTO,
      preserve_interword_spaces: '1',
    });

    let result = await worker.recognize(pngBuffer);
    let text = (result.data.text || '').trim();
    let confidence = Number((result.data.confidence || 0).toFixed(1));

    // Retry sparse screenshots/columns with PSM.SPARSE_TEXT if low confidence or nearly empty
    if (confidence < 45 || text.length < 10) {
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SPARSE_TEXT,
        preserve_interword_spaces: '1',
      });
      const retry = await worker.recognize(pngBuffer);
      const retryText = (retry.data.text || '').trim();
      const retryConf = Number((retry.data.confidence || 0).toFixed(1));
      if (retryText.length > text.length || retryConf > confidence) {
        result = retry;
        text = retryText;
        confidence = retryConf;
      }
    }

    const rawLines = (result.data as unknown as { lines?: Array<{ text?: string; confidence?: number }> })
      .lines;

    let lines: OcrLine[] = [];
    if (Array.isArray(rawLines) && rawLines.length > 0) {
      lines = rawLines
        .map((ln, idx) => ({
          lineNumber: idx + 1,
          text: (ln.text || '').trim(),
          confidence: Number((ln.confidence ?? confidence).toFixed(1)),
        }))
        .filter((ln) => ln.text.length > 0);
    }

    if (lines.length === 0 && text.length > 0) {
      lines = text
        .split(/\r?\n/)
        .map((t, idx) => ({
          lineNumber: idx + 1,
          text: t.trim(),
          confidence,
        }))
        .filter((ln) => ln.text.length > 0);
    }

    return {
      text,
      confidence,
      lines,
      width,
      height,
    };
  });

  // Keep queue moving even if one image fails
  workerQueue = job.catch(() => undefined);
  return job;
}
