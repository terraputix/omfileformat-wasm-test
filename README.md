# OmFileFormat JavaScript

A JavaScript reader for the [Open-Meteo File Format](https://github.com/open-meteo/om-file-format/)!

## Overview

This library provides JavaScript/TypeScript bindings to the OmFileFormat C library through WebAssembly. It enables efficient reading of OmFile data in web browsers and Node.js environments.

## Features

- Read OmFile format (scientific data format optimized for meteorological data)
- High-performance data access through WebAssembly
- Browser and Node.js compatibility
- TypeScript type definitions included

## Building from Source

### Prerequisites

- Node.js 16+
- Docker (for building the WebAssembly component)

### Build Steps

We compile the project using the Emscripten Docker container

1. Clone the repository with submodules:
   ```bash
   git clone --recursive https://github.com/terraputix/omfiles-js.git
   cd omfiles-js
   ```

2. Install dependencies and build the WebAssembly and TypeScript code:
   ```bash
   docker pull emscripten/emsdk
   npm install
   npm run build # This will use the emscripten/emsdk Docker container to build the WebAssembly module!
   ```

3. Run the tests:
   ```bash
   npm run test
   ```


## License

This code depends on [TurboPFor](https://github.com/powturbo/TurboPFor-Integer-Compression) and [open-meteo](https://github.com/open-meteo/open-meteo) code their license restrictions apply.

## Contributing

Contributions are welcome! Please feel free to open an Issue or to submit a Pull Request.
