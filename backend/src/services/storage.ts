/**
 * Supabase S3-compatible resume file storage.
 *
 * Uses the S3-compatible endpoint Supabase exposes (Storage v1 / S3). The
 * service is env-driven and best-effort: if storage is not configured, resume
 * parsing still works and uploads are silently skipped.
 *
 * Env:
 *   SUPABASE_S3_ENDPOINT     e.g. https://<project>.storage.supabase.co/storage/v1/s3
 *   SUPABASE_S3_ACCESS_KEY
 *   SUPABASE_S3_SECRET_KEY
 *   SUPABASE_S3_REGION       default us-east-1 (Supabase convention)
 *   SUPABASE_S3_BUCKET       default "resumes"
 *   SUPABASE_S3_PATH_STYLE   default "true" (Supabase requires path-style)
 */

import { randomUUID } from 'crypto';
import path from 'path';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';

function envBool(v: string | undefined, def: boolean): boolean {
  if (v === undefined || v === '') return def;
  return v !== 'false' && v !== '0';
}

function getConfig() {
  return {
    endpoint: process.env.SUPABASE_S3_ENDPOINT || '',
    accessKey: process.env.SUPABASE_S3_ACCESS_KEY || '',
    secretKey: process.env.SUPABASE_S3_SECRET_KEY || '',
    region: process.env.SUPABASE_S3_REGION || 'us-east-1',
    bucket: process.env.SUPABASE_S3_BUCKET || 'resumes',
    pathStyle: envBool(process.env.SUPABASE_S3_PATH_STYLE, true),
  };
}

export function isStorageConfigured(): boolean {
  const { endpoint, accessKey, secretKey } = getConfig();
  return !!(endpoint && accessKey && secretKey);
}

let client: S3Client | null = null;
function getClient(): S3Client {
  if (!client) {
    const cfg = getConfig();
    client = new S3Client({
      region: cfg.region,
      endpoint: cfg.endpoint,
      credentials: {
        accessKeyId: cfg.accessKey,
        secretAccessKey: cfg.secretKey,
      },
      forcePathStyle: cfg.pathStyle,
    });
  }
  return client;
}

/** Normalize "resume.pdf" / "Resume (2).docx" -> ".pdf". Falls back to ".txt". */
function extFromFilename(filename: string): string {
  const ext = path.extname(filename || '').toLowerCase();
  return /^\.[a-z0-9]{1,5}$/.test(ext) ? ext : '.txt';
}

export interface StoredFile {
  key: string;
  url: string;
}

/** Download URL served by our own backend (apiFetch prepends BACKEND_URL). */
function fileUrl(key: string): string {
  return `/api/intelligence/resume/file/${encodeURIComponent(key)}`;
}

/**
 * Upload a resume buffer to the S3 bucket. Best-effort: returns null when
 * storage is not configured or the upload fails (callers should continue
 * without persisting a file reference).
 */
export async function uploadResumeFile(
  buffer: Buffer,
  filename: string,
): Promise<StoredFile | null> {
  if (!isStorageConfigured()) return null;
  const cfg = getConfig();
  const key = `${randomUUID()}${extFromFilename(filename)}`;
  try {
    await getClient().send(
      new PutObjectCommand({
        Bucket: cfg.bucket,
        Key: key,
        Body: buffer,
        ContentType: extFromFilename(filename) === '.pdf' ? 'application/pdf' : 'text/plain',
      }),
    );
    return { key, url: fileUrl(key) };
  } catch (err) {
    console.error('[Storage] Resume upload failed:', (err as Error).message);
    return null;
  }
}

/** Stream the stored object back as a Buffer (small resumes only, 5MB cap). */
export async function getResumeFile(key: string): Promise<Buffer | null> {
  if (!isStorageConfigured()) return null;
  const cfg = getConfig();
  try {
    const res = await getClient().send(
      new GetObjectCommand({ Bucket: cfg.bucket, Key: key }),
    );
    const body = res.Body as { transformToByteArray(): Promise<Uint8Array> } | undefined;
    if (!body) return null;
    return Buffer.from(await body.transformToByteArray());
  } catch (err) {
    console.error('[Storage] Resume download failed:', (err as Error).message);
    return null;
  }
}

export async function deleteResumeFile(key: string): Promise<boolean> {
  if (!isStorageConfigured()) return false;
  const cfg = getConfig();
  try {
    await getClient().send(
      new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }),
    );
    return true;
  } catch (err) {
    console.error('[Storage] Resume delete failed:', (err as Error).message);
    return false;
  }
}

export { fileUrl };
