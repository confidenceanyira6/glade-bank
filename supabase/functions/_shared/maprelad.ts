import type { ProviderAdapter } from "./provider.ts";

// MAPRELAD ADAPTER: intentionally everything-disabled.
//
// No Maprelad API documentation, sandbox credentials, or account capability confirmation was available
// when this was built, so NO endpoint, auth scheme, payload shape or webhook signature scheme is
// implemented here. Inventing them would risk sending real money to the wrong place or accepting
// forged webhooks. See docs/MAPRELAD.md for the exact information required to enable each operation.
//
// To enable an operation: implement the method from the OFFICIAL docs, make supports() return true
// for it, add provider-sandbox tests, then insert the provider and an approved corridor row.
export const maprelad: ProviderAdapter = {
  code: "maprelad",
  supports: () => false,
};
