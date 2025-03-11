import { describe, it, expect } from "vitest";
import { S3Backend } from "../lib/backends/S3Backend";
import { OmFileReader } from "../lib/OmFileReader";
import { initWasm } from "../lib/wasm";
import { OmDataType } from "../lib/types";

describe("S3Backend", () => {
  // This test needs network access to S3, so mark it as slow
  it("should read data from S3 correctly", async () => {
    // Initialize WASM module
    await initWasm();

    // Create S3 backend with anonymous access (public bucket)
    const s3Backend = new S3Backend({
      region: "us-west-2",
      bucket: "openmeteo",
      key: "data/dwd_icon_d2/temperature_2m/chunk_3960.om",
    });

    // Create and initialize reader
    const reader = await OmFileReader.create(s3Backend);

    try {
      // Define ranges similar to the Python slice [57812:57813, 0:100]
      const ranges = [
        { start: 57812, end: 57813 },
        { start: 0, end: 100 },
      ];

      // Read the data - assuming it's a float array (temperature data)
      const data = await reader.read(OmDataType.FloatArray, ranges);

      // Expected data from the Python test
      const expected = [18.0, 17.7, 17.65, 17.45, 17.15, 17.6, 18.7, 20.75, 21.7, 22.65];

      // Check first 10 values to match expected with small tolerance for floating point differences
      const tolerance = 0.001;
      const actual = Array.from(data.slice(0, 10));

      // Log values for debugging
      console.log("Expected:", expected);
      console.log("Actual:", actual);

      // Check each value with tolerance
      for (let i = 0; i < expected.length; i++) {
        expect(actual[i]).toBeCloseTo(expected[i], 2); // 2 decimal places tolerance
      }
    } finally {
      // Clean up resources
      reader.dispose();
    }
  }, 30000); // 30 second timeout for network request
});
