import {
  BadRequestException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

export type ExternalMode = 'SUCCESS' | 'TRANSIENT_ERROR' | 'BUSINESS_ERROR';

export interface ExternalModes {
  create: ExternalMode;
  confirm: ExternalMode;
}

export interface ExternalStats {
  createCalls: number;
  confirmCalls: number;
  transactionsCreated: number;
}

const TRANSACTION_ID = 'EXT-78432';
const VALID_MODES: readonly ExternalMode[] = [
  'SUCCESS',
  'TRANSIENT_ERROR',
  'BUSINESS_ERROR',
];

@Injectable()
export class ExternalApiService {
  private modes: ExternalModes = { create: 'SUCCESS', confirm: 'SUCCESS' };
  private stats: ExternalStats = {
    createCalls: 0,
    confirmCalls: 0,
    transactionsCreated: 0,
  };
  private transactionExists = false;

  createTransaction(): { id: string } {
    this.stats.createCalls += 1;
    this.applyMode(this.modes.create);

    if (!this.transactionExists) {
      this.transactionExists = true;
      this.stats.transactionsCreated += 1;
    }

    return { id: TRANSACTION_ID };
  }

  confirmTransaction(id: string): { id: string; status: 'CONFIRMED' } {
    this.stats.confirmCalls += 1;

    if (!this.transactionExists || id !== TRANSACTION_ID) {
      throw new NotFoundException({
        code: 'TRANSACTION_NOT_FOUND',
        message: 'Transaction not found',
      });
    }

    this.applyMode(this.modes.confirm);
    return { id, status: 'CONFIRMED' };
  }

  getModes(): ExternalModes {
    return { ...this.modes };
  }

  setModes(body: unknown): ExternalModes {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Mode must be an object');
    }

    const values = body as Record<string, unknown>;
    const keys = Object.keys(values);
    if (keys.length === 0 || keys.some((key) => key !== 'create' && key !== 'confirm')) {
      throw new BadRequestException('Specify create and/or confirm mode');
    }

    for (const key of keys) {
      if (!VALID_MODES.includes(values[key] as ExternalMode)) {
        throw new BadRequestException(`Invalid ${key} mode`);
      }
    }

    this.modes = { ...this.modes, ...values } as ExternalModes;
    return this.getModes();
  }

  getStats(): ExternalStats {
    return { ...this.stats };
  }

  reset(): { status: 'reset' } {
    this.modes = { create: 'SUCCESS', confirm: 'SUCCESS' };
    this.stats = { createCalls: 0, confirmCalls: 0, transactionsCreated: 0 };
    this.transactionExists = false;
    return { status: 'reset' };
  }

  private applyMode(mode: ExternalMode): void {
    if (mode === 'TRANSIENT_ERROR') {
      throw new HttpException(
        {
          code: 'EXTERNAL_API_UNAVAILABLE',
          message: 'External service temporarily unavailable',
        },
        500,
      );
    }

    if (mode === 'BUSINESS_ERROR') {
      throw new HttpException(
        {
          code: 'ORDER_CLOSED',
          message: 'The operation cannot be processed',
        },
        422,
      );
    }
  }
}
