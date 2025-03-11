#include "om_file_reader.h"
#include "om_common.h"
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>


EMSCRIPTEN_KEEPALIVE
uint64_t om_variable_get_dimension_count(const OmVariable_t* variable) {
    OmDimensions_t dims = om_variable_get_dimensions(variable);
    return dims.count;
}

EMSCRIPTEN_KEEPALIVE
uint64_t om_variable_get_dimension_value(const OmVariable_t* variable, uint64_t index) {
    OmDimensions_t dims = om_variable_get_dimensions(variable);
    if (index >= dims.count) return 0;
    return dims.values[index];
}

// Similarly for chunks
EMSCRIPTEN_KEEPALIVE
uint64_t om_variable_get_chunk_count(const OmVariable_t* variable) {
    OmDimensions_t chunks = om_variable_get_chunks(variable);
    return chunks.count;
}

EMSCRIPTEN_KEEPALIVE
uint64_t om_variable_get_chunk_value(const OmVariable_t* variable, uint64_t index) {
    OmDimensions_t chunks = om_variable_get_chunks(variable);
    if (index >= chunks.count) return 0;
    return chunks.values[index];
}

/// Helper function to convert OmError_t to OmFileError
OmFileError convert_om_error(OmError_t error) {
  switch (error) {
  case ERROR_OK:
    return OM_FILE_ERROR_OK;
  default:
    printf("FOUND ERROR: %d\n", error);
    return OM_FILE_ERROR_DECODER;
  }
}

static OmFileError js_get_bytes(void* backend_data, uint64_t offset, uint64_t count, uint8_t* buffer) {
    JsBackend* js_backend = (JsBackend*)backend_data;

    // Validate parameters
    if (offset + count > js_backend->total_size) {
        return OM_FILE_ERROR_INVALID_ARGUMENT;
    }

    if (!buffer) {
        return OM_FILE_ERROR_INVALID_ARGUMENT;
    }

    int result = EM_ASM_INT({
        try {
            const callback = Module.callbacks[$0];
            const offset = $1;
            const count = $2;
            const buffer = $3;

            const result = callback(offset, count);

            // Validate returned data
            if (!(result instanceof Uint8Array)) {
                console.error('Invalid return type from callback');
                return 3; // OM_FILE_ERROR_IO
            }

            if (result.length !== Number(count)) {
                console.error('count:', count, 'result.length:', result.length);
                console.error('Callback returned wrong number of bytes');
                return 3; // OM_FILE_ERROR_IO
            }

            HEAPU8.set(result, buffer);
            return 0; // OM_FILE_ERROR_OK
        } catch (error) {
            console.error('Error in get_bytes:', error);
            return 3; // OM_FILE_ERROR_IO
        }
    }, js_backend->get_bytes_callback,
        offset,
        count,
        buffer
    );

    return (OmFileError)result;
}

EMSCRIPTEN_KEEPALIVE
OmFileReader *create_reader_from_js(int callback_index, size_t total_size) {
  JsBackend *js_backend = malloc(sizeof(JsBackend));
  if (!js_backend)
    return NULL;

  js_backend->get_bytes_callback = callback_index;
  js_backend->total_size = total_size;

  OmFileBackend *backend = malloc(sizeof(OmFileBackend));
  if (!backend) {
    free(js_backend);
    return NULL;
  }

  backend->get_bytes = js_get_bytes;
  backend->backend_data = js_backend;
  backend->total_size = total_size;

  OmFileReader *reader = NULL;
  OmFileError error = om_file_reader_new(backend, &reader);

  if (error != OM_FILE_ERROR_OK) {
    free(js_backend);
    free(backend);
    return NULL;
  }

  return reader;
}

EMSCRIPTEN_KEEPALIVE
OmFileError
decode_with_reader(OmFileReader *reader, uint8_t *output, size_t output_size,
                   OmDataType_t data_type,
                   const uint64_t *dim_read_start, // Array of start positions
                   const uint64_t *dim_read_end,   // Array of end positions
                   const uint64_t *into_cube_offset,
                   const uint64_t *into_cube_dimension,
                   uint64_t dimension_count,
                   uint64_t io_size_max,  // Optional, will use default if 0
                   uint64_t io_size_merge // Optional, will use default if 0
) {
  if (!reader || !output || !dim_read_start || !dim_read_end ||
      !into_cube_offset || !into_cube_dimension) {
    return OM_FILE_ERROR_INVALID_ARGUMENT;
  }

  // Use defaults if not specified
  if (io_size_max == 0)
    io_size_max = 65536;
  if (io_size_merge == 0)
    io_size_merge = 512;

  // Verify data type
  if (data_type != om_variable_get_type(reader->variable)) {
    return OM_FILE_ERROR_DATA_TYPE_MISMATCH;
  }

  // Prepare read parameters
  uint64_t *read_offset = malloc(dimension_count * sizeof(uint64_t));
  uint64_t *read_count = malloc(dimension_count * sizeof(uint64_t));

  if (!read_offset || !read_count) {
    free(read_offset);
    free(read_count);
    return OM_FILE_ERROR_OUT_OF_MEMORY;
  }

  // Add bounds check
  if (dimension_count > 1000) { // or some reasonable maximum
    printf("Warning: Suspicious dimension_count value\n");
    return OM_FILE_ERROR_INVALID_ARGUMENT;
  }

  // Calculate read_count from start and end positions
  for (uint64_t i = 0; i < dimension_count; i++) {
    read_offset[i] = dim_read_start[i];
    read_count[i] = dim_read_end[i] - dim_read_start[i];
  }

  // Initialize decoder
  OmDecoder_t decoder;
  OmError_t init_error = om_decoder_init(
      &decoder, reader->variable, dimension_count, read_offset, read_count,
      into_cube_offset, into_cube_dimension, io_size_merge, io_size_max);

  // Free arrays that are no longer needed
  // free(read_offset);
  // free(read_count);

  if (init_error != ERROR_OK) {
    return convert_om_error(init_error);
  }

  // Allocate chunk buffer with proper size
  uint64_t chunk_buffer_size = om_decoder_read_buffer_size(&decoder);
  uint8_t *chunk_buffer = malloc(chunk_buffer_size);
  if (!chunk_buffer) {
    return OM_FILE_ERROR_OUT_OF_MEMORY;
  }
  // Perform decoding
  OmFileError error =
      om_file_reader_decode(reader, &decoder, output, chunk_buffer);

  free(chunk_buffer);
  return error;
}

EMSCRIPTEN_KEEPALIVE
void destroy_reader(OmFileReader *reader) {
  if (reader) {
    if (reader->backend) {
      if (reader->backend->backend_data) {
        free(reader->backend->backend_data);
      }
      free(reader->backend);
    }
    free(reader->variable_data);
    free(reader);
  }
}

static void cleanup_and_free(uint8_t *data1, uint8_t *data2,
                             OmFileReader *reader) {
  free(data1);
  free(data2);
  free(reader);
}

static OmFileError read_variable_data(const OmFileBackend *backend,
                                      uint64_t offset, uint64_t size,
                                      uint8_t **out_data) {
  if (size == 0 || offset + size > backend->total_size) {
    return OM_FILE_ERROR_INVALID_ARGUMENT;
  }

  *out_data = malloc(size);
  if (!*out_data) {
    return OM_FILE_ERROR_OUT_OF_MEMORY;
  }

  return backend->get_bytes(backend->backend_data, offset, size, *out_data);
}

// Create new reader
OmFileError om_file_reader_new(const OmFileBackend *backend,
                               OmFileReader **reader) {
  if (!backend || !reader || !backend->get_bytes || backend->total_size == 0) {
    return OM_FILE_ERROR_INVALID_ARGUMENT;
  }

  OmFileReader *new_reader = malloc(sizeof(OmFileReader));
  if (!new_reader)
    return OM_FILE_ERROR_OUT_OF_MEMORY;

  uint64_t header_size = om_header_size();
  uint8_t *header_data = NULL;

  OmFileError error = read_variable_data(backend, 0, header_size, &header_data);
  if (error != OM_FILE_ERROR_OK) {
    free(new_reader);
    return error;
  }

  OmHeaderType_t header_type = om_header_type(header_data);

  if (header_type == OM_HEADER_INVALID) {
    cleanup_and_free(header_data, NULL, new_reader);
    return OM_FILE_ERROR_NOT_AN_OM_FILE;
  }

  uint8_t *variable_data = NULL;
  size_t variable_data_size = 0;

  if (header_type == OM_HEADER_LEGACY) {
    variable_data = header_data;
    variable_data_size = header_size;
  } else if (header_type == OM_HEADER_READ_TRAILER) {
    uint64_t trailer_size = om_trailer_size();
    uint64_t trailer_offset = backend->total_size - trailer_size;

    uint8_t *trailer_data = NULL;
    error = read_variable_data(backend, trailer_offset, trailer_size,
                               &trailer_data);
    if (error != OM_FILE_ERROR_OK) {
      cleanup_and_free(header_data, NULL, new_reader);
      return error;
    }

    uint64_t var_offset = 0, var_size = 0;
    if (!om_trailer_read(trailer_data, &var_offset, &var_size)) {
      cleanup_and_free(header_data, trailer_data, new_reader);
      return OM_FILE_ERROR_NOT_AN_OM_FILE;
    }

    free(trailer_data);
    error = read_variable_data(backend, var_offset, var_size, &variable_data);
    if (error != OM_FILE_ERROR_OK) {
      cleanup_and_free(header_data, NULL, new_reader);
      return error;
    }

    variable_data_size = var_size;
    free(header_data);
  }

  new_reader->backend = (OmFileBackend *)backend;
  new_reader->variable_data = variable_data;
  new_reader->variable_data_size = variable_data_size;
  new_reader->variable = om_variable_init(variable_data);

  *reader = new_reader;
  return OM_FILE_ERROR_OK;
}

// Main decode function
OmFileError om_file_reader_decode(const OmFileReader *reader,
                                  OmDecoder_t *decoder, void *output,
                                  uint8_t *chunk_buffer) {
  if (!reader || !decoder || !output || !chunk_buffer) {
    return OM_FILE_ERROR_INVALID_ARGUMENT;
  }

  OmError_t om_error = ERROR_OK;
  OmDecoder_indexRead_t index_read;

  om_decoder_init_index_read(decoder, &index_read);

  while (om_decoder_next_index_read(decoder, &index_read)) {
    uint8_t *index_data = malloc(index_read.count);
    if (!index_data)
      return OM_FILE_ERROR_OUT_OF_MEMORY;

    OmFileError error = reader->backend->get_bytes(
        reader->backend->backend_data, index_read.offset, index_read.count,
        index_data);

    if (error != OM_FILE_ERROR_OK) {
      free(index_data);
      return error;
    }

    OmDecoder_dataRead_t data_read;
    om_decoder_init_data_read(&data_read, &index_read);

    while (om_decoder_next_data_read(decoder, &data_read, index_data,
                                     index_read.count, &om_error)) {
      uint8_t *data = malloc(data_read.count);
      if (!data) {
        free(index_data);
        return OM_FILE_ERROR_OUT_OF_MEMORY;
      }

      error =
          reader->backend->get_bytes(reader->backend->backend_data,
                                     data_read.offset, data_read.count, data);

      if (error != OM_FILE_ERROR_OK) {
        free(data);
        free(index_data);
        return error;
      }

      if (!om_decoder_decode_chunks(decoder, data_read.chunkIndex,
                                    (const void *)data, data_read.count,
                                    (void *)output, (void *)chunk_buffer,
                                    &om_error)) {
        free(data);
        free(index_data);
        return convert_om_error(om_error);
      }
      free(data);
    }
    free(index_data);

    if (om_error != ERROR_OK) {
      return convert_om_error(om_error);
    }
  }

  return OM_FILE_ERROR_OK;
}
