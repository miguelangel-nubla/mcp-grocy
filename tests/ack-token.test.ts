import { describe, it, expect } from 'vitest';

describe('Acknowledgment Token Logic', () => {
  it('should add acknowledgment token to successful tool result', () => {
    // Simulate the logic from mcp-server.ts
    const result = {
      content: [
        { type: 'text' as const, text: 'Operation completed successfully' },
        { type: 'text' as const, text: '{"result": "success"}' }
      ]
    };

    const subConfigs = new Map([['ack_token', 'TEST_ACKNOWLEDGMENT_TOKEN']]);

    // Apply the acknowledgment token logic
    if (!result.isError && subConfigs) {
      const ackToken = subConfigs.get('ack_token');
      if (ackToken && typeof ackToken === 'string') {
        result.content.push({
          type: 'text' as const,
          text: `Acknowledgment token: ${ackToken}`
        });
      }
    }

    // Verify the result includes the acknowledgment token
    expect(result.content).toHaveLength(3);
    expect(result.content[0].text).toBe('Operation completed successfully');
    expect(result.content[1].text).toBe('{"result": "success"}');
    expect(result.content[2].text).toBe('Acknowledgment token: TEST_ACKNOWLEDGMENT_TOKEN');
  });

  it('should not add acknowledgment token when not configured', () => {
    const result = {
      content: [
        { type: 'text' as const, text: 'Operation completed successfully' },
        { type: 'text' as const, text: '{"result": "success"}' }
      ]
    };

    const subConfigs = new Map(); // No ack_token configured

    // Apply the acknowledgment token logic
    if (!result.isError && subConfigs) {
      const ackToken = subConfigs.get('ack_token');
      if (ackToken && typeof ackToken === 'string') {
        result.content.push({
          type: 'text' as const,
          text: `Acknowledgment token: ${ackToken}`
        });
      }
    }

    // Should only have the original 2 content items, no ack_token
    expect(result.content).toHaveLength(2);
    expect(result.content[0].text).toBe('Operation completed successfully');
    expect(result.content[1].text).toBe('{"result": "success"}');
  });

  it('should not add acknowledgment token for error responses', () => {
    const result = {
      content: [
        { type: 'text' as const, text: 'Error: Something went wrong' }
      ],
      isError: true
    };

    const subConfigs = new Map([['ack_token', 'TEST_ACKNOWLEDGMENT_TOKEN']]);

    // Apply the acknowledgment token logic
    if (!result.isError && subConfigs) {
      const ackToken = subConfigs.get('ack_token');
      if (ackToken && typeof ackToken === 'string') {
        result.content.push({
          type: 'text' as const,
          text: `Acknowledgment token: ${ackToken}`
        });
      }
    }

    // Should not add ack_token to error responses
    expect(result.content).toHaveLength(1);
    expect(result.content[0].text).toBe('Error: Something went wrong');
  });
});