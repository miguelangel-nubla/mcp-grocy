import { describe, it, expect, vi, afterEach } from 'vitest';
import { ApiError, AppError, ErrorHandler, ValidationError } from '../src/utils/errors.js';
import { logger } from '../src/utils/logger.js';

describe('ErrorHandler.logError', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not serialize raw non-AppError objects (which may carry request headers)', () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const err = new Error('connect ECONNREFUSED') as any;
    err.code = 'ECONNREFUSED';
    err.config = { headers: { 'GROCY-API-KEY': 'secret-key' } };

    ErrorHandler.logError(err, 'API GET /test');

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [message, category, data] = errorSpy.mock.calls[0];
    expect(message).toBe('API GET /test: connect ECONNREFUSED');
    expect(category).toBe('ERROR');
    expect(data).toEqual({ name: 'Error', code: 'ECONNREFUSED', stack: err.stack });
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('secret-key');
  });

  it('handles non-Error values', () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    ErrorHandler.logError('plain failure');
    expect(errorSpy).toHaveBeenCalledWith('plain failure', 'ERROR', {
      name: undefined,
      code: undefined,
      stack: undefined,
    });
  });
});

describe('ApiError.fromAxiosError', () => {
  it('prefers the Grocy error_message', () => {
    const err = ApiError.fromAxiosError(
      { response: { status: 400, data: { error_message: 'Product does not exist' } }, config: {} },
      'GET /api/test',
    );
    expect(err.message).toBe('Product does not exist');
    expect(err.statusCode).toBe(400);
  });

  it('falls back to message, then HTTP status', () => {
    expect(
      ApiError.fromAxiosError({ response: { status: 500, data: { message: 'boom' } }, config: {} })
        .message,
    ).toBe('boom');
    expect(
      ApiError.fromAxiosError({ response: { status: 502, data: {} }, config: {} }).message,
    ).toBe('HTTP 502');
  });
});

describe('AppError subclasses', () => {
  it('are instances of their own class', () => {
    const v = new ValidationError('bad input', 'op');
    expect(v).toBeInstanceOf(ValidationError);
    expect(v).toBeInstanceOf(AppError);
    expect(v).toBeInstanceOf(Error);
    expect(new ApiError('boom', 500)).toBeInstanceOf(ApiError);
  });
});
