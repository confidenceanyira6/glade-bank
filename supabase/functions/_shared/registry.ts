import { maprelad } from "./maprelad.ts";
import type { ProviderAdapter } from "./provider.ts";

const adapters: Record<string, ProviderAdapter> = { [maprelad.code]: maprelad };

/** 'demo' is deliberately NOT registered: demo transfers can never reach a provider adapter. */
export function getAdapter(code: string | null | undefined): ProviderAdapter | null {
  if (!code) return null;
  return adapters[code] ?? null;
}
