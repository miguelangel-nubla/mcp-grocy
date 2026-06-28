# Grocy API Response Format Documentation

The dev tool **`system_dev_test_request`** returns a JSON payload with request details, response information, and validation results. Other tools (e.g. `inventory_stock_get_all`, `shopping_list_add_item`) return the Grocy API body as text content (typically stringified JSON).

## `system_dev_test_request` tool response structure

```json
{
  "request": {
    "url": "https://your-own-demo.grocy.info/api/objects/products/1",
    "method": "GET",
    "headers": {
      "GROCY-API-KEY": "[REDACTED]",
      "Accept": "application/json",
      "Content-Type": "application/json"
    },
    "body": null,
    "authMethod": "apikey"
  },
  "response": {
    "statusCode": 200,
    "statusText": "OK",
    "timing": "123ms",
    "headers": {
      "content-type": "application/json; charset=utf-8",
      "date": "Mon, 01 Jul 2024 12:00:00 GMT"
    },
    "body": {
      "id": "1",
      "name": "Cookies",
      "description": null,
      "product_group_id": "1"
      // ... other product fields ...
    }
  },
  "validation": {
    "isError": false,
    "messages": ["Request completed successfully"]
  }
}
```

## Setting Up Your Own Private Demo Instance

Before testing the API, you may want to set up your own private Grocy demo instance. This gives you a persistent environment for development and testing without having to install Grocy locally.

### Creating a Private Demo Instance

1. Visit [https://demo.grocy.info](https://demo.grocy.info)
2. At the top of the page, find the "Create a private demo instance" section
3. Fill in the form to create your personalized demo
4. Once created, you'll receive:
   - A unique URL for your instance (e.g., `https://your-name-xxxxx.demo.grocy.info`)
   - An API key for API access
   - Login credentials (username/password) for web access

### Benefits of Private Demo Instances

- **Persistence**: Your data remains available for a longer period (compared to the temporary demo)
- **Privacy**: Only you have access to your instance
- **Testing**: Ideal for testing API integrations without affecting production data
- **No Installation**: No need to host Grocy on your own server

### Using Your Private Demo in API Requests

Configure your environment with the private demo details:

```
GROCY_BASE_URL=https://your-name-xxxxx.demo.grocy.info
GROCY_API_KEY=your-private-api-key
```

These values can be set in your `.env` file for local development or in your project configuration for production use.

## Response Fields for `system_dev_test_request`

### Request Details (`request`)

- `url`: Full URL of the Grocy API endpoint called, including base URL and path.
- `method`: HTTP method used (e.g., GET, POST, PUT, DELETE).
- `headers`: Request headers sent to the Grocy API. Sensitive headers like `GROCY-API-KEY` will have their values redacted.
- `body`: Request body sent (if applicable, e.g., for POST/PUT requests).
- `authMethod`: Authentication method used. For Grocy, this will typically be `apikey` if `GROCY_API_KEY` is configured, or `none`.

### Response Details (`response`)

- `statusCode`: HTTP status code returned by the Grocy API (e.g., 200, 400, 401).
- `statusText`: HTTP status message (e.g., "OK", "Bad Request").
- `timing`: Duration of the API request in milliseconds.
- `headers`: Response headers received from the Grocy API.
- `body`: Response body content from the Grocy API. This will be the JSON data returned by Grocy.

### Validation (`validation`)

- `isError`: Boolean, `true` if the HTTP status code is 400 or higher, indicating an error.
- `messages`: Array of messages, including success messages or error details.
- `truncated` (optional): If the response body exceeds `REST_RESPONSE_SIZE_LIMIT`, this object will contain details about the truncation.
  - `originalSize`: The original size of the response body in bytes.
  - `returnedSize`: The size of the truncated response body returned.
  - `truncationPoint`: The byte offset where truncation occurred.
  - `sizeLimit`: The configured `REST_RESPONSE_SIZE_LIMIT`.

## Specialized Grocy Tools Response Format

Tools like `inventory_stock_get_all`, `inventory_products_get`, `shopping_list_add_item`, etc., return successful Grocy API responses as structured MCP tool output:

- `structuredContent.data`: the parsed Grocy response.
- `content`: short human-readable status text.

Example shape for a product-related read (illustrative):

```json
{
  "content": [
    {
      "type": "text",
      "text": "Product retrieved successfully"
    }
  ],
  "structuredContent": {
    "data": {
      "id": "1",
      "name": "Cookies"
    }
  }
}
```

If an error occurs with a specialized tool, the response will typically look like:

```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"error\": \"Failed to get stock: API error (401) Unauthorized - Please check your API key and permissions.\"}"
    }
  ],
  "isError": true
}
```

## Error response example for `system_dev_test_request`

If **`system_dev_test_request`** encounters an API error (e.g., authentication failure):

```json
{
  "request": {
    "url": "https://your-own-demo.grocy.info/api/objects/products",
    "method": "GET",
    "headers": {
      "GROCY-API-KEY": "[REDACTED]"
    },
    "body": null,
    "authMethod": "apikey"
  },
  "response": {
    "statusCode": 401,
    "statusText": "Unauthorized",
    "timing": "50ms",
    "headers": {
      /* ... headers ... */
    },
    "body": {
      "error_message": "API key is missing or invalid."
    }
  },
  "validation": {
    "isError": true,
    "messages": ["Request failed with status 401", "API key is missing or invalid."]
  }
}
```
