import fs from "node:fs";
import path from "node:path";
import { logger } from "./logger";

export interface StorageProvider {
  upload(key: string, buffer: Buffer, contentType: string): Promise<string>;
  get(key: string): Promise<Buffer>;
  getUrl(key: string): string;
  delete(key: string): Promise<void>;
}

export class LocalStorageProvider implements StorageProvider {
  private baseDir: string;
  private publicBaseUrl: string;

  constructor(options?: { baseDir?: string; publicBaseUrl?: string }) {
    this.baseDir = options?.baseDir || path.resolve(process.cwd(), "storage");
    this.publicBaseUrl =
      options?.publicBaseUrl ||
      process.env.STORAGE_PUBLIC_URL ||
      `http://localhost:${process.env.PORT || 3001}/storage`;

    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  async upload(key: string, buffer: Buffer, _contentType: string): Promise<string> {
    const sanitizedKey = key.replace(/^\/+/, "");
    const filePath = path.join(this.baseDir, sanitizedKey);
    const dir = path.dirname(filePath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    await fs.promises.writeFile(filePath, buffer);
    logger.debug(`[STORAGE] Saved file to ${filePath}`);

    return this.getUrl(sanitizedKey);
  }

  async get(key: string): Promise<Buffer> {
    const sanitizedKey = key.replace(/^\/+/, "");
    const filePath = path.join(this.baseDir, sanitizedKey);

    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${key}`);
    }

    return fs.promises.readFile(filePath);
  }

  getUrl(key: string): string {
    const sanitizedKey = key.replace(/^\/+/, "");
    return `${this.publicBaseUrl}/${sanitizedKey}`;
  }

  async delete(key: string): Promise<void> {
    const sanitizedKey = key.replace(/^\/+/, "");
    const filePath = path.join(this.baseDir, sanitizedKey);

    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  }
}

export function createStorageProvider(): StorageProvider {
  const provider = process.env.STORAGE_PROVIDER || "local";

  if (provider === "local") {
    return new LocalStorageProvider();
  }

  // Fallback to local
  logger.warn(`Unknown STORAGE_PROVIDER "${provider}", falling back to local disk storage`);
  return new LocalStorageProvider();
}

export const defaultStorage = createStorageProvider();
