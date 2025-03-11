import { describe, beforeAll, afterEach, it, expect, beforeEach } from "vitest";
import { getWasmModule, initWasm } from "../lib/wasm";
import { DataType, OmFileReader, Range } from "../lib/OmFileReader";
import { OmFileReaderBackend } from "../lib/backend";
import fs from "fs/promises";
import path from "path";

// Define a test backend implementation that works with ArrayBuffer
class TestBackend implements OmFileReaderBackend {
  private data: ArrayBuffer;

  constructor(data: ArrayBuffer) {
    this.data = data;
  }

  async getBytes(offset: number, size: number): Promise<Uint8Array> {
    // Add safety checks
    if (offset < 0 || offset > this.data.byteLength || size < 0 || offset + size > this.data.byteLength) {
      throw new Error(`Invalid range: offset=${offset}, size=${size}, buffer size=${this.data.byteLength}`);
    }

    return new Uint8Array(this.data.slice(offset, offset + size));
  }

  async count(): Promise<number> {
    return this.data.byteLength;
  }
}

describe("OmFileReader", () => {
  let testFileData: ArrayBuffer;
  let reader: OmFileReader;
  let wasm: any; // The WASM module

  // Initialize WASM and load test file before all tests
  beforeAll(async () => {
    wasm = await initWasm();
    console.log("WASM module initialized");

    // Load the test file
    // Currently this file is not committed to the repository
    // Thus we skip tests in CI according to the vitest configuration
    const filePath = path.join(__dirname, "../../test-data/read_test.om");
    const fileBuffer = await fs.readFile(filePath);
    testFileData = fileBuffer.buffer;
  });

  beforeEach(() => {
    const backend = new TestBackend(testFileData);
    reader = new OmFileReader(backend, wasm);
  });

  afterEach(() => {
    if (reader) {
      reader.dispose();
    }
  });

  it("should successfully initialize a reader", async () => {
    await expect(reader.initialize()).resolves.not.toThrow();
  });

  // it("should fail to initialize reader with invalid data", async () => {
  //   const invalidBackend = new TestBackend(new ArrayBuffer(10)); // Too small to be valid
  //   const invalidReader = new OmFileReader(invalidBackend, wasm);

  //   await expect(invalidReader.initialize()).rejects.toThrow();
  // });

  // Test getting name - this exercises the string handling
  it("should get the variable name if available", async () => {
    await reader.initialize();
    const name = reader.getName();
    console.log("Variable name:", name);
    // The name could be null if not set in file, so we just verify the API
    expect(typeof name === "string" || name === null).toBe(true);
  });

  // Test getting dimensions
  it("should correctly report dimensions", async () => {
    await reader.initialize();
    const dimensions = reader.getDimensions();

    expect(dimensions).toStrictEqual([721, 1440, 104]);
  });

  // Test getting chunk dimensions
  it("should correctly report chunk dimensions", async () => {
    await reader.initialize();
    const chunks = reader.getChunkDimensions();

    expect(chunks).toStrictEqual([1, 29, 104]);
    // Chunk dimensions array length should match file dimensions
    const dims = reader.getDimensions();
    expect(chunks.length).toBe(dims.length);
  });

  // Test data type and compression
  it("should report data type and compression correctly", async () => {
    await reader.initialize();
    const dataType = reader.dataType();
    const compression = reader.compression();

    expect(dataType).toBe(DataType.FloatArray);
    expect(compression).toBe(0); // PforDelta2dInt16
  });

  // Test scale factor and add offset
  it("should report scale factor and add offset", async () => {
    await reader.initialize();
    const scaleFactor = reader.scaleFactor();
    const addOffset = reader.addOffset();

    expect(scaleFactor).toBe(20);
    expect(addOffset).toBe(0);
  });

  // Test number of children
  it("should report the correct number of children", async () => {
    await reader.initialize();
    const numChildren = reader.numberOfChildren();
    // Test file does not have children
    expect(numChildren).toBe(0);
  });

  it("should successfully read data", async () => {
    await reader.initialize();

    const dimReadRange: Range[] = [
      { start: BigInt(0), end: BigInt(10) },
      { start: BigInt(0), end: BigInt(10) },
      { start: BigInt(0), end: BigInt(10) },
    ];

    const output = await reader.read(wasm.DATA_TYPE_FLOAT_ARRAY, dimReadRange);
    expect(output).toBeInstanceOf(Float32Array);

    console.log("Output data:", output.slice(0, 10));

    expect(Array.from(output.slice(0, 10))).toEqual(
      expect.arrayContaining([
        expect.closeTo(-24.25, 0.001),
        expect.closeTo(-24.75, 0.001),
        expect.closeTo(-23.85, 0.001),
        expect.closeTo(-23.95, 0.001),
        expect.closeTo(-25.45, 0.001),
        expect.closeTo(-25.9, 0.001),
        expect.closeTo(-26.4, 0.001),
        expect.closeTo(-26.45, 0.001),
        expect.closeTo(-26.2, 0.001),
        expect.closeTo(-26.2, 0.001),
      ])
    );
  });

  // it("should successfully readInto data", async () => {
  //   await reader.initialize();

  //   // Adjust these values according to your test file's dimensions
  //   const outputSize = 1000; // Adjust based on your test data
  //   const output = new Float32Array(outputSize);
  //   const dimReadRange: Range[] = [
  //     { start: 0, end: 10 },
  //     { start: 0, end: 10 },
  //     { start: 0, end: 10 },
  //   ];

  //   await expect(reader.readInto(wasm.DATA_TYPE_FLOAT32, output, dimReadRange)).resolves.not.toThrow();

  //   expect(Array.from(output.slice(0, 10))).toEqual(
  //     expect.arrayContaining([
  //       expect.closeTo(-24.25, 0.001),
  //       expect.closeTo(-24.75, 0.001),
  //       expect.closeTo(-23.85, 0.001),
  //       expect.closeTo(-23.95, 0.001),
  //       expect.closeTo(-25.45, 0.001),
  //       expect.closeTo(-25.9, 0.001),
  //       expect.closeTo(-26.4, 0.001),
  //       expect.closeTo(-26.45, 0.001),
  //       expect.closeTo(-26.2, 0.001),
  //       expect.closeTo(-26.2, 0.001),
  //     ])
  //   );
  // });

  // it("should fail with invalid dimensions", async () => {
  //   await reader.initialize();

  //   const output = new Float32Array(1000);
  //   const dimReadRange: Range[] = [
  //     { start: 0, end: 10 }, // Wrong number of dimensions
  //   ];

  //   await expect(reader.readInto(wasm.DATA_TYPE_FLOAT32, output, dimReadRange)).rejects.toThrow();
  // });

  // it("should handle out-of-bounds reads", async () => {
  //   await reader.initialize();

  //   const output = new Float32Array(10); // Too small for the data
  //   const dimReadRange: Range[] = [
  //     { start: 0, end: 100 },
  //     { start: 0, end: 100 },
  //     { start: 0, end: 100 },
  //   ]; // This would require a much larger buffer

  //   await expect(reader.readInto(wasm.DATA_TYPE_FLOAT32, output, dimReadRange)).rejects.toThrow();
  // });

  // it("should properly clean up resources", async () => {
  //   await reader.initialize();
  //   reader.dispose();

  //   // Attempting to use the reader after disposal should throw
  //   const dimReadRange: Range[] = [
  //     { start: 0, end: 10 },
  //     { start: 0, end: 10 },
  //     { start: 0, end: 10 },
  //   ];

  //   await expect(reader.read(wasm.DATA_TYPE_FLOAT32, dimReadRange)).rejects.toThrow();
  // });

  // // Test getting dimensions
  // it("should correctly report dimensions", async () => {
  //   await reader.initialize();
  //   const dimensions = reader.getDimensions();
  //   expect(dimensions).to.be.an("array");
  //   expect(dimensions.length).to.be.greaterThan(0);
  // });

  // // Test getting chunks
  // it("should correctly report chunk dimensions", async () => {
  //   await reader.initialize();
  //   const chunks = reader.getChunkDimensions();
  //   expect(chunks).to.be.an("array");
  //   expect(chunks.length).to.be.greaterThan(0);
  // });

  // // Test getting children if applicable
  // it("should handle children correctly", async () => {
  //   await reader.initialize();
  //   const numChildren = reader.numberOfChildren();

  //   if (numChildren > 0) {
  //     const child = await reader.getChild(0);
  //     expect(child).not.to.be.null;

  //     if (child) {
  //       // Test that child operations work
  //       const childDimensions = child.getDimensions();
  //       expect(childDimensions).to.be.an("array");
  //     }
  //   }
  // });

  // // Test flat variable metadata
  // it("should retrieve metadata correctly", async () => {
  //   await reader.initialize();
  //   const metadata = await reader.getFlatVariableMetadata();
  //   expect(metadata).to.be.an("object");
  // });
});
