import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import type { SaveObjects } from './contracts.js';
import type { ServerConfig } from './config.js';

export class S3SaveObjects implements SaveObjects {
  private readonly client: S3Client;
  constructor(private readonly config: ServerConfig['s3']) {
    this.client = new S3Client({ region: 'auto', endpoint: config.endpoint, forcePathStyle: config.forcePathStyle, credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey } });
  }
  async put(key: string, bytes: Uint8Array): Promise<void> {
    await this.client.send(new PutObjectCommand({ Bucket: this.config.bucket, Key: key, Body: bytes, ContentType: 'application/gzip', CacheControl: 'private, no-store' }), { abortSignal: AbortSignal.timeout(90_000) });
  }
  async get(key: string): Promise<Uint8Array> {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.config.bucket, Key: key }), { abortSignal: AbortSignal.timeout(90_000) });
    if (!result.Body || (result.ContentLength ?? 0) > 110 * 1024 * 1024) throw new Error('Invalid save body');
    return result.Body.transformToByteArray();
  }
  async delete(key: string): Promise<void> { await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }), { abortSignal: AbortSignal.timeout(30_000) }); }
  async *oldObjects(before: Date): AsyncIterable<string> {
    let token: string | undefined;
    do {
      const page = await this.client.send(new ListObjectsV2Command({ Bucket: this.config.bucket, Prefix: 'saves/', ContinuationToken: token }), { abortSignal: AbortSignal.timeout(30_000) });
      for (const item of page.Contents ?? []) if (item.Key && item.LastModified && item.LastModified < before) yield item.Key;
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
  }
}
