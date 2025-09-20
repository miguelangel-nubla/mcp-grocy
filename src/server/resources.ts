import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { SERVER_NAME } from '../version.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export class ResourceHandler {
  private __dirname: string;

  constructor() {
    const __filename = fileURLToPath(import.meta.url);
    this.__dirname = path.dirname(__filename);
  }

  public async listResources() {
    return {
      resources: [
        {
          uri: `${SERVER_NAME}://examples`,
          name: 'Grocy API Usage Examples',
          description: 'Detailed examples of using the Grocy API',
          mimeType: 'text/markdown'
        },
        {
          uri: `${SERVER_NAME}://response-format`,
          name: 'Response Format Documentation',
          description: 'Documentation of the response format and structure',
          mimeType: 'text/markdown'
        },
        {
          uri: `${SERVER_NAME}://config`,
          name: 'Configuration Documentation',
          description: 'Documentation of all configuration options and how to use them',
          mimeType: 'text/markdown'
        }
      ]
    };
  }

  public async readResource(uri: string) {
    const uriPattern = new RegExp(`^${SERVER_NAME}://(.+)$`);
    const match = uri.match(uriPattern);
    
    if (!match) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Invalid resource URI format: ${uri}`
      );
    }

    const resource = match[1];
    
    try {
      // In the built app, resources are in build/resources
      // In development, they're in src/resources
      const resourcePath = path.join(this.__dirname, '../resources', `${resource}.md`);
      const content = await fs.promises.readFile(resourcePath, 'utf8');

      return {
        contents: [{
          uri,
          mimeType: 'text/markdown',
          text: content
        }]
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Resource not found: ${resource}`
      );
    }
  }
}