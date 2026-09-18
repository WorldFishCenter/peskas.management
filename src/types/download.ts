/**
 * Type definitions for Data Download feature
 *
 * This module defines TypeScript interfaces for the data download functionality,
 * including filters, API responses, and component props.
 */

/**
 * Filter parameters for data download
 */
export interface DownloadFilters {
  /** Country identifier (e.g., 'zanzibar', 'mozambique') - Admin only, pre-filled for regular users */
  country?: string;

  /** Array of survey IDs (asset_ids) - filtered by user permissions */
  survey_id?: string[];

  /** GAUL level 2 administrative code (single selection) */
  gaul_2?: string;

  /** Data validation status */
  status: 'validated' | 'raw';

  /** FAO ASFIS species code (optional) */
  catch_taxon?: string;

  /** Data scope - trip information, catch information, or all data (optional) */
  scope?: 'trip_info' | 'catch_info' | '';
}

/**
 * One row of downloaded data. The schema is dynamic — it depends on the survey and the
 * selected scope — so values are narrowed at the point of rendering.
 */
export type DataRow = Record<string, unknown>;

/**
 * Country option for dropdown
 */
export interface CountryOption {
  /** Country code (e.g., 'zanzibar') */
  code: string;

  /** Display name */
  name: string;

  /** Whether the country row is active */
  active?: boolean;
}

/**
 * District (GAUL Level 2) option for dropdown
 */
export interface District {
  /** GAUL Level 2 code */
  code: string;

  /** District name */
  name: string;

  /** Associated country code */
  country_id?: string;

  /** Name of the survey this district belongs to, when districts were cascaded from one */
  survey_label?: string;
}

/**
 * A FAO ASFIS taxon, as offered by the species filter's picker.
 */
export interface Taxon {
  /** 3-letter FAO ASFIS code (e.g. 'SKJ') — the value `catch_taxon` takes */
  code: string;

  /** Latin name (e.g. 'Katsuwonus pelamis') */
  scientific_name: string;

  /** Common English name (e.g. 'Skipjack tuna') */
  english_name: string;

  /** Taxonomic family (e.g. 'Scombridae'), normalised to Title Case by the taxa sync */
  family: string;
}

/**
 * A survey, as returned by `/surveys` and by `/data-download/metadata`.
 *
 * The single declaration for the whole app — `src/api/admin.ts` re-exports it. `_id` and
 * `description` are only sent by `/surveys`; `kobo_config` is deliberately absent because
 * it holds an API token and is projected out server-side.
 */
export interface Survey {
  /** KoboToolbox asset ID */
  asset_id: string;

  /** Survey name */
  name: string;

  /** Associated country code */
  country_id: string;

  /** Whether survey is active */
  active: boolean;

  /** MongoDB id, stringified — `/surveys` only */
  _id?: string;

  /** Free-text description — `/surveys` only */
  description?: string;
}

/**
 * API response for preview endpoint
 */
export interface PreviewResponse {
  success: boolean;
  data: DataRow[];
  total_count: number;
  filters_applied: DownloadFilters;
}

/**
 * Field description from PeSKAS API metadata
 *
 * Comprehensive documentation for a single data field including type,
 * unit, examples, and semantic information.
 *
 * Based on: https://github.com/WorldFishCenter/peskas-api/blob/main/src/peskas_api/schema/field_metadata.py
 */
export interface FieldDescription {
  /** Field identifier */
  name?: string;

  /** Human-readable description explaining what this field represents */
  description: string;

  /** Data type: 'string', 'integer', 'float', 'date', 'datetime' */
  data_type?: string;

  /** Unit of measurement (e.g., 'kg', 'cm', 'hours', 'meters') */
  unit?: string;

  /** Sample data instances (array of examples) */
  examples?: unknown[];

  /** Enumerated categorical options (possible values) */
  possible_values?: string[];

  /** Numeric min/max bounds (tuple: [min, max]) */
  value_range?: [number | null, number | null] | null;

  /** Whether field is mandatory */
  required?: boolean;

  /** Formal ontology definition URL for semantic web interoperability */
  ontology_url?: string;

  /** Documentation or dataset catalog links */
  url?: string;
}

/**
 * Field metadata response from API
 *
 * Contains metadata for all fields in the landings dataset,
 * optionally filtered by scope (trip_info or catch_info).
 */
export interface FieldMetadata {
  /** Map of field names to their descriptions */
  fields: Record<string, FieldDescription>;

  /** The scope filter applied (if any) */
  scope?: string;

  /** Optional message (e.g., when metadata is unavailable) */
  message?: string;
}
