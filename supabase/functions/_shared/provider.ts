// Provider-independent adapter interface. Transaction logic never talks to a provider directly.
// An operation is only available when the adapter explicitly implements AND declares it.

export type Capability =
  | "quote"
  | "create_transfer"
  | "get_transfer_status"
  | "verify_webhook"
  | "create_receiving_account";

export interface QuoteInput {
  sourceCountry: string; sourceCurrency: string;
  destinationCountry: string; destinationCurrency: string;
  sourceAmount: string; // decimal string, never a float
}
export interface QuoteResult {
  quoteId: string; fee: string; rate: string; destinationAmount: string; expiresAt: string;
}
export interface CreateTransferInput {
  reference: string; // our unique reference, used as the provider-side idempotency key
  quoteId: string | null;
  sourceAmount: string; sourceCurrency: string; destinationCurrency: string;
  recipient: { name: string; bankName: string | null; accountNumber: string; routingCode: string | null; country: string };
}
export type ProviderStatus = "processing" | "completed" | "failed";

export type VerifiedEvent =
  | { kind: "incoming_payment"; eventId: string; type: string; providerReference: string; receivingAccountRef: string;
      amount: string; currency: string; fee: string; senderName: string | null }
  | { kind: "transfer_status"; eventId: string; type: string; providerReference: string; status: ProviderStatus; reason?: string }
  | { kind: "ignored"; eventId: string; type: string };

/** Provider definitively refused the request (safe to treat as failed). */
export class ProviderRejectedError extends Error {}
/** Outcome unknown (timeout, 5xx, network). NEVER retry automatically; reconcile instead. */
export class ProviderUncertainError extends Error {}

export interface ProviderAdapter {
  code: string;
  supports(cap: Capability): boolean;
  quote?(input: QuoteInput): Promise<QuoteResult>;
  createTransfer?(input: CreateTransferInput): Promise<{ providerReference: string }>;
  getTransferStatus?(providerReference: string): Promise<{ status: ProviderStatus; reason?: string }>;
  /** Must return null when the documented signature/replay checks fail. */
  verifyWebhook?(req: Request, rawBody: string): Promise<VerifiedEvent | null>;
}
