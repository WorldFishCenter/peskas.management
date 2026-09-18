import { Taxon } from '../types/download';

/**
 * The species filter holds a bare FAO ASFIS code, but its datalist offers
 * "SKJ — Skipjack tuna (Scombridae)" so the browser's native typeahead matches the common name
 * and the family too. Writing that label and reading the code back out are two halves of one
 * format, so they share a separator here rather than a hand-typed em dash at each end.
 */
const TAXON_SEP = ' — ';

export const taxonLabel = (tx: Taxon) =>
  `${tx.code}${TAXON_SEP}${tx.english_name || tx.scientific_name}${tx.family ? ` (${tx.family})` : ''}`;

/** What the input shows: the code from a picked option, or free text exactly as typed. */
export const taxonInput = (value: string) =>
  value.includes(TAXON_SEP) ? value.split(TAXON_SEP)[0].trim() : value;

/** The same thing as an FAO code, for lookup and validation. */
export const toTaxonCode = (value: string) => taxonInput(value).trim().toUpperCase();
