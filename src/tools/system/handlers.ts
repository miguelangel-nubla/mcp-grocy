import { BaseToolHandler } from '../base.js';
import { ToolResult, ToolHandler } from '../types.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import apiClient from '../../api/client.js';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { AppError } from '../../utils/errors.js';
import { refuseRawWrite } from './write-guard.js';

export class SystemToolHandlers extends BaseToolHandler {
  private redactHeaders(headers: Record<string, unknown>): Record<string, unknown> {
    const redacted = { ...headers };
    const sensitiveHeaders = new Set([
      'grocy-api-key',
      'authorization',
      'x-api-key',
      'proxy-authorization',
    ]);

    for (const key of Object.keys(redacted)) {
      if (sensitiveHeaders.has(key.toLowerCase())) {
        redacted[key] = '[REDACTED]';
      }
    }

    return redacted;
  }

  /**
   * Truncate a string to at most `maxBytes` UTF-8 bytes without splitting a codepoint.
   */
  private truncateStringToUtf8Bytes(
    str: string,
    maxBytes: number,
  ): { text: string; byteLength: number } {
    const buf = Buffer.from(str, 'utf8');
    if (buf.length <= maxBytes) {
      return { text: str, byteLength: buf.length };
    }
    let end = maxBytes;
    while (end > 0) {
      while (end > 0 && (buf[end - 1]! & 0xc0) === 0x80) {
        end--;
      }
      if (end === 0) {
        break;
      }
      const text = buf.subarray(0, end).toString('utf8');
      if (Buffer.byteLength(text, 'utf8') === end) {
        return { text, byteLength: end };
      }
      end--;
    }
    return { text: '', byteLength: 0 };
  }

  private applyResponseSizeLimit(body: unknown): {
    body: unknown;
    truncated?: {
      originalSize: number;
      returnedSize: number;
      truncationPoint: number;
      sizeLimit: number;
    };
  } {
    const sizeLimit = config.grocy.response_size_limit;
    const jsonBody = JSON.stringify(body);
    const originalSize = Buffer.byteLength(jsonBody, 'utf8');

    if (originalSize <= sizeLimit) {
      return { body };
    }

    const { text: truncatedJsonBody, byteLength: prefixBytes } = this.truncateStringToUtf8Bytes(
      jsonBody,
      sizeLimit,
    );
    const returnedSize = Buffer.byteLength(truncatedJsonBody, 'utf8');

    return {
      body: `${truncatedJsonBody}...[TRUNCATED]`,
      truncated: {
        originalSize,
        returnedSize,
        truncationPoint: prefixBytes,
        sizeLimit,
      },
    };
  }

  // ==================== CORE SYSTEM UTILITIES ====================

  public getLocations: ToolHandler = async (): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const data = await this.apiCall('/objects/locations');
      return this.createSuccess(data);
    });
  };

  public getQuantityUnits: ToolHandler = async (): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const data = await this.apiCall('/objects/quantity_units');
      return this.createSuccess(data);
    });
  };

  public getUsers: ToolHandler = async (): Promise<ToolResult> => {
    return this.executeToolHandler(async () => {
      const data = await this.apiCall('/users');
      return this.createSuccess(data);
    });
  };

  // ==================== DEVELOPER UTILITIES ====================

  public callGrocyApi: ToolHandler = async (args: any): Promise<ToolResult> => {
    const { endpoint, method = 'GET', body = null } = args;

    if (!endpoint) {
      throw new McpError(ErrorCode.InvalidParams, 'Missing required parameter: endpoint');
    }

    // Remove leading /api/ if present
    const cleanEndpoint = endpoint.replace(/^\/?(?:api\/)?/, '');
    const refused = refuseRawWrite(method, cleanEndpoint, body);
    if (refused) {
      return this.createError(refused);
    }

    try {
      const response = await apiClient.request(`/${cleanEndpoint}`, {
        method,
        body,
      });

      return this.createSuccess(response.data);
    } catch (error: any) {
      logger.error(`Error calling Grocy API endpoint ${endpoint}`, 'api', { error });
      return this.createError(`Failed to call Grocy API endpoint ${endpoint}: ${error.message}`);
    }
  };

  public testRequest: ToolHandler = async (args: any): Promise<ToolResult> => {
    const { method, endpoint, body, headers = {} } = args;

    if (!method || !endpoint) {
      throw new McpError(ErrorCode.InvalidParams, 'method and endpoint are required');
    }

    const normalizedEndpoint = `/${endpoint.replace(/^\/+|\/+$/g, '')}`;
    const refused = refuseRawWrite(method, normalizedEndpoint, body);
    if (refused) {
      return this.createError(refused);
    }
    const requestHeaders = { ...config.getCustomHeaders(), ...headers };
    const safeRequestHeaders = this.redactHeaders(requestHeaders);

    const request = {
      url: `${config.grocy.base_url}${normalizedEndpoint}`,
      method,
      headers: safeRequestHeaders,
      body,
      authMethod: config.grocy.api_key ? 'apikey' : 'none',
    };
    const startTime = Date.now();

    try {
      const response = await apiClient.request(normalizedEndpoint, {
        method,
        body,
        headers: requestHeaders,
      });
      const responseWithLimit = this.applyResponseSizeLimit(response.data);

      return this.createSuccess({
        request,
        response: {
          statusCode: response.status,
          timing: `${Date.now() - startTime}ms`,
          headers: response.headers,
          body: responseWithLimit.body,
        },
        validation: {
          isError: false,
          messages: ['Request completed successfully'],
          ...(responseWithLimit.truncated ? { truncated: responseWithLimit.truncated } : {}),
        },
      });
    } catch (error: any) {
      // The client throws an ApiError on any status >= 400; report Grocy's answer as the tool documents.
      if (error instanceof AppError && error.category === 'API' && error.statusCode !== undefined) {
        const responseData = error.details?.responseData;
        const responseWithLimit = this.applyResponseSizeLimit(responseData ?? null);
        const grocyMessage =
          responseData && typeof responseData === 'object' ? responseData.error_message : undefined;
        return this.createSuccess({
          request,
          response: {
            statusCode: error.statusCode,
            timing: `${Date.now() - startTime}ms`,
            body: responseWithLimit.body,
          },
          validation: {
            isError: true,
            messages: [
              `Request failed with status ${error.statusCode}`,
              ...(grocyMessage ? [String(grocyMessage)] : []),
            ],
            ...(responseWithLimit.truncated ? { truncated: responseWithLimit.truncated } : {}),
          },
        });
      }
      return this.createError(`Test request failed: ${error.message}`, { request });
    }
  };
}
