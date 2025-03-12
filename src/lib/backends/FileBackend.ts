import { OmFileReaderBackend } from "./OmFileReaderBackend";

export class FileBackend implements OmFileReaderBackend {
  private data: ArrayBuffer;

  /**
   * Create a FileBackend from an ArrayBuffer, which could be:
   * - Loaded from a file on the filesystem
   * - Passed from a File/Blob input in the browser
   * - Created for testing purposes
   */
  constructor(data: ArrayBuffer) {
    this.data = data;
  }

  /**
   * Static factory method to create a FileBackend from a URL in the browser
   */
  static async fromUrl(url: string): Promise<FileBackend> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch file: ${response.status} ${response.statusText}`);
    }
    const data = await response.arrayBuffer();
    return new FileBackend(data);
  }

  /**
   * In Node.js environments, create a FileBackend from a file path
   */
  static async fromPath(filePath: string): Promise<FileBackend> {
    // This would use fs/promises in Node.js
    // You'd need to check the environment and handle accordingly
    if (typeof window === "undefined") {
      // Node.js environment
      const fs = await import("fs/promises");
      const buffer = await fs.readFile(filePath);
      return new FileBackend(buffer.buffer);
    } else {
      throw new Error("Reading from file path is not supported in browser environments");
    }
  }

  async getBytes(offset: number, size: number): Promise<Uint8Array> {
    if (offset < 0 || offset > this.data.byteLength || size < 0 || offset + size > this.data.byteLength) {
      throw new Error(`Invalid range: offset=${offset}, size=${size}, buffer size=${this.data.byteLength}`);
    }
    return new Uint8Array(this.data.slice(offset, offset + size));
  }

  async count(): Promise<number> {
    return this.data.byteLength;
  }
}
