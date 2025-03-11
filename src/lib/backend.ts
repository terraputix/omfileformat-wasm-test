// OmFileReaderBackend.ts
export interface OmFileReaderBackend {
  /**
   * Get bytes from the backend at the specified offset and size
   * @param offset The offset in bytes from the start of the file
   * @param size The number of bytes to read
   */
  getBytes(offset: number, size: number): Promise<Uint8Array>;

  /**
   * Get the total size of the file in bytes
   */
  count(): Promise<number>;
}

export class FetchBackend implements OmFileReaderBackend {
  private url: string;
  private fileSize: number | null = null;

  constructor(url: string) {
    this.url = url;
  }

  async initialize(): Promise<FetchBackend> {
    // Get file size via HEAD request
    const response = await fetch(this.url, { method: "HEAD" });
    const contentLength = response.headers.get("content-length");
    if (contentLength) {
      this.fileSize = parseInt(contentLength, 10);
    } else {
      // If content-length is not available, try to get the whole file
      const fullResponse = await fetch(this.url);
      const buffer = await fullResponse.arrayBuffer();
      this.fileSize = buffer.byteLength;
    }
    return this;
  }

  async getBytes(offset: number, size: number): Promise<Uint8Array> {
    const response = await fetch(this.url, {
      headers: { Range: `bytes=${offset}-${offset + size - 1}` },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return new Uint8Array(await response.arrayBuffer());
  }

  async count(): Promise<number> {
    if (this.fileSize === null) {
      await this.initialize();
    }
    return this.fileSize!;
  }
}
