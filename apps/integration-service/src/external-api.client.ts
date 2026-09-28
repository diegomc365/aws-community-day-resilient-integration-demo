import { Injectable } from '@nestjs/common';

export class ExternalApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

@Injectable()
export class ExternalApiClient {
  private readonly baseUrl: string;

  constructor() {
    const value = process.env.EXTERNAL_API_URL;
    if (!value) throw new Error('EXTERNAL_API_URL is required');
    this.baseUrl = value.replace(/\/$/, '');
  }

  async createTransaction(orderNumber: string): Promise<string> {
    const result = await this.post('/transactions', { orderNumber });
    if (typeof result.id !== 'string' || !result.id) {
      throw new ExternalApiError(502, 'INVALID_EXTERNAL_RESPONSE', 'External API returned no transaction ID');
    }
    return result.id;
  }

  async confirmTransaction(id: string): Promise<void> {
    await this.post(`/transactions/${encodeURIComponent(id)}/confirm`, {});
  }

  private async post(path: string, body: object): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      throw new ExternalApiError(503, 'EXTERNAL_API_UNAVAILABLE', 'External service temporarily unavailable');
    }

    const data = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      throw new ExternalApiError(
        response.status,
        typeof data.code === 'string' ? data.code : 'EXTERNAL_API_ERROR',
        typeof data.message === 'string' ? data.message : 'External API request failed',
      );
    }
    return data;
  }
}
