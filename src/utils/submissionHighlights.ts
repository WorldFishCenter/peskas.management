import type { AlertCatch, SubmissionItem } from '../types/validation';

/**
 * Where a survey's alerts point in its KoboToolbox form, read from the pipeline that raises them.
 * A pipeline change to which answers an alert checks must be copied here.
 */
export interface AlertFields {
  /** The repeat group whose entries `alert_catches.catch_number` counts, from 1. */
  catchRepeat: string;
  /** Alert code, as written in `alert_flag` → the questions (KoboToolbox names) its check reads. */
  fields: Record<string, string[]>;
  /** Fish lengths kept in a repeat of their own, tied to a catch line by species. */
  lengths?: { repeat: string; species: string; catchSpecies: string };
}

/** The alerts raised on one submission, and how many catch lines its record has. */
export interface SubmissionAlerts {
  codes: string[];
  catches: AlertCatch[];
  lines: number;
}

// peskas.kenya.data.pipeline: get_trips_flags, get_catch_flags, get_indicators_flags (KEFS v2).
const KEFS_TRIP_TIMES = ['time_out', 'time_in', 'Enter_date_and_time_sel_left_for_fishing', 'Enter_date_and_time_the_vessel_landed'];
const KEFS_VALUE = ['TotalCatchWeight', 'PricePerKg', 'TValue'];
const KEFS_SAMPLE = ['sample_weight', 'SampleWeight', 'TotalCatchWeight'];
const KEFS_LENGTH = ['marinespecies', 'Indicate_the_length_ecies_of_fish_in_cm'];

const FISHERS = ['no_men_fishers', 'no_women_fishers', 'no_child_fishers'];
const bins = (...ranges: string[]) => ranges.map(r => `no_individuals_${r}`);

// peskas.mozambique.data.pipeline: Lurio and DINAPA. Trip alerts worked out from the catch (8, 9, 10, 14) mark only the
// trip's own answers, not every catch line.
const LURIO_COUNTS = [
  ...bins('5_10', '10_15', '15_20', '20_25', '25_30', '30_35', '35_40', '40_45', '45_50', '50_55', '55_60', 'over60', 'over35'),
  'fish_length_over60', 'fish_length_over35'
];
const LURIO_SPECIES = ['selected_species', 'group_species_001'];
const LURIO_PRICE = ['catch_price', 'total_catch_value'];
const BINS_TO_100 = bins('5_10', '10_15', '15_20', '20_25', '25_30', '30_40', '40_50', '50_60', '60_70', '70_80', '80_90', '90_100');
const DINAPA_SPECIES = ['fish_group', ...['SP', 'TS', 'SH', 'FSH', 'CRB', 'CE', 'LO', 'CR', 'MA', 'OY', 'FI', 'FFI', 'RA', 'SHK', 'TL', 'RF', 'MZZ'].map(g => `species_${g}`)];
const DINAPA_TRIP_TIMES = ['fishing_start', 'fishing_end'];

// peskas.zanzibar.data.pipeline, WorldFish forms. SSF 1.1 and 1.2 keep fish over 1 m in a repeat
// inside each catch line.
const zanzibar = (species: string[], over100: string[]): AlertFields => {
  const counts = [...BINS_TO_100, ...over100];
  return {
    catchRepeat: 'species_group',
    fields: {
      '1': ['catch_outcome', ...species],
      '2': [...species, 'n_buckets', ...counts],
      '3': [...species, ...counts],
      '4': [...species, ...counts],
      '5': ['weight_bucket'],
      '6': ['n_buckets'],
      '7': [...BINS_TO_100, ...over100.filter(n => n.startsWith('no_'))],
      '8': ['catch_price'],
      '9': [...FISHERS, 'trip_duration'],
      '10': ['catch_price', ...FISHERS, 'trip_duration'],
      '11': ['landing_date'],
      '12': ['trip_duration'],
      '13': FISHERS,
      '14': ['catch_price']
    }
  };
};
const ZANZIBAR_SPECIES = ['fish_group', ...['RF', 'SR', 'SP', 'LP', 'TL', 'MC'].map(g => `species_${g}`)];

// peskas.timor.data.pipeline: only 11 is located; 17 and 22 are trip alerts.
const TIMOR_COUNTS = bins('5_10', '10_15', '15_20', '20_25', '25_30', '30_35', '35_40', '40_45', '45_50', '50_55', '55_60', 'over60');
const timor = (site: string[], habitat: string[], extra: Record<string, string[]>): AlertFields => ({
  catchRepeat: 'species_group',
  fields: {
    '1': ['IMEI'], '2': ['IMEI'], '3': ['IMEI'],
    '4': ['date'],
    '5': ['duration'],
    '6': ['total_catch_value'],
    '11': TIMOR_COUNTS,
    '12': ['boat_type'],
    '13': ['has_boat', 'boat_type'],
    '14': ['gear_type'],
    '15': ['has_boat', 'gear_type'],
    '16': site,
    '17': ['total_catch_value'],
    '18': FISHERS,
    '19': habitat,
    '20': ['mesh_size', 'mesh_size_other'],
    ...extra
  }
});

export const ALERT_FIELDS: Record<string, AlertFields> = {
  aNKjDfXDKyW3JLtaCdxDp5: {
    catchRepeat: 'OverallSampleWeight',
    lengths: { repeat: 'PrioritySpeciesCatch', species: 'priorityspecies', catchSpecies: 'marinespecies' },
    fields: {
      '1': ['hp'],
      '1.1': ['Did_you_CATCH_FISH_TODAY', 'TotalCatchWeight'],
      '2': ['NumCrew'],
      '3': KEFS_TRIP_TIMES,
      '4.1': ['Did_you_CATCH_FISH_TODAY', ...KEFS_VALUE],
      '4.2': ['Did_you_CATCH_FISH_TODAY', ...KEFS_VALUE],
      '4.3': KEFS_VALUE,
      '5.1': KEFS_SAMPLE,
      '5.2': ['WeightSpcsSample', ...KEFS_SAMPLE],
      '5.3': KEFS_LENGTH,
      '5.4': KEFS_LENGTH,
      '6.1': ['TotalCatchWeight', 'NumCrew', ...KEFS_TRIP_TIMES],
      '6.2': [...KEFS_VALUE, 'NumCrew', ...KEFS_TRIP_TIMES],
      '6.3': KEFS_VALUE,
      '6.4': KEFS_VALUE,
      '7': ['date_data']
    }
  },
  ajEruvrFJCzmi4cmWs9PAc: zanzibar(['species'], ['fish_length_over100']),
  acbfEuAzqAnCGm8Mqenr56: zanzibar(ZANZIBAR_SPECIES, ['fish_length_over100', 'no_individuals_over100']),
  a6vXSMtDFgPCASg7ASfgUR: zanzibar(ZANZIBAR_SPECIES, ['fish_length_over100', 'no_individuals_over100']),
  akwPVCiz5f8KxQ8hTpgEUY: {
    catchRepeat: 'group_species',
    fields: {
      '1': ['catch_outcome', ...LURIO_SPECIES],
      '2': [...LURIO_SPECIES, ...LURIO_COUNTS, 'n_buckets', 'weight_bucket'],
      '3': [...LURIO_SPECIES, ...LURIO_COUNTS],
      '4': [...LURIO_SPECIES, ...LURIO_COUNTS],
      '5': ['weight_bucket'],
      '6': ['n_buckets'],
      '7': LURIO_COUNTS,
      '8': LURIO_PRICE,
      '9': [...FISHERS, 'trip_duration'],
      '10': [...LURIO_PRICE, ...FISHERS, 'trip_duration'],
      '11': [...FISHERS, 'survey_activity', 'catch_outcome'],
      '12': ['trip_duration'],
      '13': ['landing_date'],
      '14': LURIO_PRICE
    }
  },
  apobg7g9x9c5ZqHbcn69T3: {
    catchRepeat: 'species_group',
    fields: {
      '1': ['catch_outcome', ...DINAPA_SPECIES],
      '2': [...DINAPA_SPECIES, 'counting_method', 'catch_weight', 'n_buckets', 'weight_bucket', ...BINS_TO_100],
      '3': [...DINAPA_SPECIES, ...BINS_TO_100],
      '4': [...DINAPA_SPECIES, ...BINS_TO_100],
      '5': ['weight_bucket'],
      '6': ['n_buckets'],
      '7': BINS_TO_100,
      '8': ['catch_price'],
      '9': [...FISHERS, ...DINAPA_TRIP_TIMES],
      '10': ['catch_price', ...FISHERS, ...DINAPA_TRIP_TIMES],
      '11': [...FISHERS, 'survey_activity'],
      '12': DINAPA_TRIP_TIMES,
      '13': ['landing_date'],
      '14': ['catch_price']
    }
  },
  aaztUDtRzb9SpSV7i9iptb: timor(['landing_site_name'], ['habitat_boat', 'habitat_no_boat', 'Habitat_no_boat'], {
    '21': ['how_many_gleaners_today'],
    '22': ['total_catch_value']
  }),
  aEoWV7aprG47Q4uTpaopgD: timor(
    ['Ainaro', 'Atauro', 'Baucau', 'Bobonaro', 'Covalima', 'Dili', 'Lautem', 'Liqui_a', 'Manatuto', 'Manufahi', 'Viqueque', 'RAEOA'],
    ['habitat'],
    { '21': [], '22': ['total_catch_value', 'catch_outcome'] }
  )
};

const sameNumber = (a: string | undefined, b: string | undefined): boolean => {
  const x = parseFloat(a ?? '');
  return !Number.isNaN(x) && x === parseFloat(b ?? '');
};

/** Whether a stored catch number is one of the record's catch lines. */
export const isCatchLine = (alerts: SubmissionAlerts, c: AlertCatch): boolean =>
  c.catch_number >= 1 && c.catch_number <= alerts.lines;

/**
 * The alert codes to show on one answer. `line` is the catch line (from 1) the answer sits in, or
 * null outside the catch lines. In a line, a code the pipeline located marks only the lines it
 * named, and a code with no location marks every line. A catch number past the record's lines
 * (Zanzibar SSF 1.1 and 1.2 number fish over 1 m that way) marks the answer holding its value;
 * that rule can go once the Zanzibar pipeline numbers them within their catch line.
 */
export const fieldCodes = (
  survey: AlertFields,
  alerts: SubmissionAlerts,
  name: string,
  value: string | undefined,
  line: number | null
): string[] =>
  alerts.codes.filter(code => {
    if (!survey.fields[code]?.includes(name)) return false;
    if (line === null) return true;
    const located = alerts.catches.filter(c => c.code === code);
    return located.length === 0 || located.some(c =>
      c.catch_number === line || (!isCatchLine(alerts, c) && sameNumber(c.value, value)));
  });

/** The first item called `name`, looking inside groups but not repeats. */
export const findItem = (items: SubmissionItem[], name: string): SubmissionItem | undefined => {
  for (const item of items) {
    if (item.name === name) return item;
    const inner = item.type === 'group' ? findItem(item.items, name) : undefined;
    if (inner) return inner;
  }
  return undefined;
};

const firstValue = (item: SubmissionItem | undefined): string | undefined =>
  item?.type === 'field' ? item.value[0] ?? undefined : undefined;

/** The catch line a fish's length row belongs to: the first with its species, as the pipeline joins them; -1 if none. */
export const lengthRowLine = (survey: AlertFields, row: SubmissionItem[], catchLines: SubmissionItem[][]): number => {
  if (!survey.lengths) return -1;
  const { species, catchSpecies } = survey.lengths;
  const value = firstValue(findItem(row, species));
  const i = value === undefined ? -1 : catchLines.findIndex(line => firstValue(findItem(line, catchSpecies)) === value);
  return i >= 0 ? i + 1 : -1;
};
