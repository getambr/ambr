/**
 * DACS-2 recipe registry — transcribed from the public spec (§7.4.2).
 *
 * The Demos `demosdk` web2 module is a GENERIC HTTP proxy; the verification
 * "recipes" (which registry to hit + how to parse it) live in the DACS standard,
 * not in code. We transcribe the ones we use. The registry is steward-maintained
 * (KyneSys Labs) and versioned per-scheme — bump `recipeVersion` when the spec
 * revises a recipe.
 *
 * MVP ships only `lei` (GLEIF). `ofac-clear` / `finra-crd` / `sam-uei` slot in
 * here later with the same shape (note: `ofac-clear` is `negativeMatch: true`).
 */

import type { Recipe } from './types';

/** LEI via GLEIF (§7.4.2). consensus-backed-proxy → DAHR. */
export const LEI_RECIPE: Recipe = {
  recipeVersion: 1,
  scheme: 'lei',
  defaultMethod: {
    kind: 'consensus-backed-proxy',
    endpoint: {
      method: 'GET',
      // Collection endpoint (filter[lei]=…), NOT the single-record
      // /lei-records/{id} path: the collection returns `data` as an ARRAY
      // (so the `$.data[0]` parser paths match) and yields a clean empty array
      // on a non-existent LEI instead of a 404. Brackets are pre-URL-encoded.
      // (The DACS spec §7.4.2 lists the single-record URL but array-style
      // paths — that pairing is inconsistent against the live API; verified
      // 2026-06-03 against api.gleif.org.)
      urlTemplate: 'https://api.gleif.org/api/v1/lei-records?filter%5Blei%5D={identifier}',
    },
  },
  defaultMaxAgeSec: 60 * 60 * 24 * 30, // 30 days
  parserRules: {
    format: 'json',
    successJsonPath: '$.data[0].attributes.lei',
    dataMap: {
      legalName: '$.data[0].attributes.entity.legalName.name',
      status: '$.data[0].attributes.registration.status',
    },
  },
  negativeMatch: false,
  retryClass: 'transient',
};

const REGISTRY: Record<string, Recipe> = {
  lei: LEI_RECIPE,
};

export function getRecipe(scheme: string): Recipe | null {
  return REGISTRY[scheme] ?? null;
}

/**
 * ISO 17442 LEI: 20 chars, [A-Z0-9]{18} + 2 check digits. We validate the
 * coarse shape (20 alphanumerics) — GLEIF is the authority on validity.
 */
export function isLei(value: string): boolean {
  return /^[A-Z0-9]{18}[0-9]{2}$/i.test(value.trim());
}
