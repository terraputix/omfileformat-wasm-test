import { OmFileReader } from "./lib/OmFileReader";
import { FileBackend } from "./lib/backends/FileBackend";
import { MemoryHttpBackend } from "./lib/backends/MemoryS3Backend";
import { OmFileReaderBackend } from "./lib/backends/OmFileReaderBackend";
import { Range, OmDataType, TypedArray } from "./lib/types";
import fs from "fs/promises";
import path from "path";

// Define Plotly globally since it's included via CDN
declare global {
  interface Window {
    Plotly: any;
  }
}

/**
 * Main application class to handle state and DOM interactions
 */
class OmFileViewer {
  // State
  private reader: OmFileReader | null = null;
  private currentTimestamp = 0;
  private maxTimestamp = 0;
  private dimensions: number[] = [];

  // DOM elements
  private loadButton: HTMLButtonElement;
  private dataUrlInput: HTMLInputElement;
  private fileInput: HTMLInputElement;
  private prevButton: HTMLButtonElement;
  private nextButton: HTMLButtonElement;
  private timestampLabel: HTMLElement;
  private plotArea: HTMLElement;

  constructor() {
    // Get DOM elements
    this.loadButton = document.getElementById("loadButton") as HTMLButtonElement;
    this.dataUrlInput = document.getElementById("dataUrl") as HTMLInputElement;
    this.fileInput = document.getElementById("fileInput") as HTMLInputElement;
    this.prevButton = document.getElementById("prevButton") as HTMLButtonElement;
    this.nextButton = document.getElementById("nextButton") as HTMLButtonElement;
    this.timestampLabel = document.getElementById("timestampLabel") as HTMLElement;
    this.plotArea = document.getElementById("plotArea") as HTMLElement;

    // Initialize event listeners
    this.loadButton.addEventListener("click", () => this.loadData());
    this.prevButton.addEventListener("click", () => this.showPreviousTimestamp());
    this.nextButton.addEventListener("click", () => this.showNextTimestamp());

    this.fileInput.addEventListener("change", () => this.handleFileSelection());
  }

  /**
   * Handle when a file is selected via the file input
   */
  private async handleFileSelection(): Promise<void> {
    const files = this.fileInput.files;
    if (files && files.length > 0) {
      try {
        // Create backend for the selected file
        const backend = await this.createBackend(files[0]);

        // Create and initialize reader
        this.reader = await OmFileReader.create(backend);

        // Get dimensions and setup UI
        this.setupDimensionsAndUI();

        // Load and display initial data
        await this.loadAndDisplayData();
      } catch (error) {
        console.error("Error loading file:", error);
        alert(`Error loading file: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        console.log("File loaded");
      }
    }
  }

  /**
   * Setup dimensions and UI after reader is initialized
   */
  private setupDimensionsAndUI(): void {
    if (!this.reader) return;

    // Get dimensions
    this.dimensions = this.reader.getDimensions();
    console.log("Dimensions:", this.dimensions);

    if (this.dimensions.length < 2) {
      throw new Error("Data must have at least 2 dimensions");
    }

    // Assume last dimension is time
    this.maxTimestamp = this.dimensions[this.dimensions.length - 1] - 1;
    this.currentTimestamp = 0;

    // Update UI
    this.prevButton.disabled = this.currentTimestamp === 0;
    this.nextButton.disabled = this.currentTimestamp >= this.maxTimestamp;
    this.timestampLabel.textContent = `Timestamp: ${this.currentTimestamp}`;
  }

  /**
   * Creates the appropriate backend based on the input type (URL or File)
   */
  private async createBackend(input: string | File): Promise<OmFileReaderBackend> {
    // Check if input is a File object (local file)
    if (input instanceof File) {
      console.log("Creating FileBackend for local file:", input.name);
      return new FileBackend(input);
    }

    // Input is a URL string
    const url = input as string;

    // For HTTP or HTTPS URLs, use MemoryHttpBackend
    console.log("Creating MemoryHttpBackend for URL:", url);
    return new MemoryHttpBackend({
      url: url,
      maxFileSize: 500 * 1024 * 1024, // 500 MB
      debug: true,
      onProgress: (loaded, total) => {
        const percent = Math.round((loaded / total) * 100);
        console.log(`Downloaded: ${loaded} / ${total} bytes (${percent}%)`);
      },
    });
  }

  /**
   * Loads data from the specified URL
   */
  private async loadData(): Promise<void> {
    try {
      const url = this.dataUrlInput.value.trim();
      if (!url) {
        alert("Please enter a valid URL");
        return;
      }

      this.loadButton.disabled = true;
      this.loadButton.textContent = "Loading...";

      // Create appropriate backend
      const backend = await this.createBackend(url);

      // Create and initialize the OM file reader
      this.reader = await OmFileReader.create(backend);

      // Get dimensions
      this.dimensions = this.reader.getDimensions();
      console.log("Dimensions:", this.dimensions);

      if (this.dimensions.length < 2) {
        throw new Error("Data must have at least 2 dimensions");
      }

      // Assume last dimension is time
      this.maxTimestamp = this.dimensions[this.dimensions.length - 1] - 1;
      this.currentTimestamp = 0;

      // Update UI
      this.prevButton.disabled = this.currentTimestamp === 0;
      this.nextButton.disabled = this.currentTimestamp >= this.maxTimestamp;
      this.timestampLabel.textContent = `Timestamp: ${this.currentTimestamp}`;

      // Load and display initial data
      await this.loadAndDisplayData();

      this.loadButton.textContent = "Load Data";
      this.loadButton.disabled = false;
    } catch (error) {
      console.error("Error loading data:", error);
      alert(`Error loading data: ${error instanceof Error ? error.message : String(error)}`);
      this.loadButton.textContent = "Load Data";
      this.loadButton.disabled = false;
    }
  }

  /**
   * Loads and displays data for the current timestamp
   */
  private async loadAndDisplayData(): Promise<void> {
    if (!this.reader) {
      console.error("Reader not initialized");
      return;
    }

    try {
      // Create ranges for each dimension
      const ranges: Range[] = this.dimensions.map((dim, i) => {
        if (i === 0) {
          // if (i === this.dimensions.length - 1) {
          // Time dimension - select only current timestamp
          return { start: this.currentTimestamp, end: this.currentTimestamp + 1 };
        } else {
          // Other dimensions - select all
          return { start: 0, end: dim };
        }
      });

      // Read data for the specified dimensions
      const data = await this.reader.read(OmDataType.FloatArray, ranges);

      console.log(data);

      // Reshape data for plotting
      const rows = this.dimensions[1];
      const cols = this.dimensions[2];
      const plotData: number[][] = [];

      // Create 2D array for heatmap
      for (let i = 0; i < rows; i++) {
        const row: number[] = [];
        for (let j = 0; j < cols; j++) {
          row.push(data[i * cols + j]);
        }
        plotData.push(row);
      }

      // Find min/max for color scaling
      let min = Number.POSITIVE_INFINITY;
      let max = Number.NEGATIVE_INFINITY;

      for (let i = 0; i < data.length; i++) {
        if (!isNaN(data[i])) {
          if (data[i] < min) min = data[i];
          if (data[i] > max) max = data[i];
        }
      }

      // Create heatmap configuration
      const heatmap = {
        z: plotData,
        type: "heatmap",
        colorscale: "Viridis",
        zmin: min,
        zmax: max,
      };

      const layout = {
        title: `Data Visualization - Timestamp ${this.currentTimestamp}`,
        margin: {
          l: 50,
          r: 50,
          b: 50,
          t: 50,
        },
      };

      // Plot using Plotly
      window.Plotly.newPlot(this.plotArea, [heatmap], layout);
    } catch (error) {
      console.error("Error displaying data:", error);
      alert(`Error displaying data: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Navigate to the previous timestamp
   */
  private async showPreviousTimestamp(): Promise<void> {
    if (this.currentTimestamp > 0) {
      this.currentTimestamp--;
      this.timestampLabel.textContent = `Timestamp: ${this.currentTimestamp}`;
      this.prevButton.disabled = this.currentTimestamp === 0;
      this.nextButton.disabled = false;
      await this.loadAndDisplayData();
    }
  }

  /**
   * Navigate to the next timestamp
   */
  private async showNextTimestamp(): Promise<void> {
    if (this.currentTimestamp < this.maxTimestamp) {
      this.currentTimestamp++;
      this.timestampLabel.textContent = `Timestamp: ${this.currentTimestamp}`;
      this.prevButton.disabled = false;
      this.nextButton.disabled = this.currentTimestamp >= this.maxTimestamp;
      await this.loadAndDisplayData();
    }
  }
}

/**
 * Initialize the application when the DOM is ready
 */
document.addEventListener("DOMContentLoaded", () => {
  new OmFileViewer();
});
