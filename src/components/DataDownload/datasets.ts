import React from 'react';
import { IconSailboat, IconCalendarMonth } from '@tabler/icons-react';
import { DownloadDataset } from '../../types/download';

/**
 * What differs between the two data levels of Data Download, in the order the picker shows them.
 * Every component reads its level from here rather than comparing the dataset name.
 * The strings are `download` keys.
 */
export interface DatasetInfo {
  icon: React.ElementType;
  label: string;
  hint: string;
  /** Subtitle of the data dictionary */
  dictionarySubtitle: string;
  /** Shown when a preview finds no rows */
  noDataHint: string;
  /** How to read the preview, when the level needs it */
  previewNote?: string;
  /** Trips take status, scope, species and survey; monthly figures only country and district */
  tripFilters: boolean;
}

export const DATASETS: Record<DownloadDataset, DatasetInfo> = {
  landings: {
    icon: IconSailboat,
    label: 'filters.datasetTrips',
    hint: 'filters.datasetTripsHint',
    dictionarySubtitle: 'metadata.subtitle',
    noDataHint: 'preview.noDataHint',
    tripFilters: true
  },
  'district-months': {
    icon: IconCalendarMonth,
    label: 'filters.datasetMonthly',
    hint: 'filters.datasetMonthlyHint',
    dictionarySubtitle: 'metadata.subtitleMonthly',
    noDataHint: 'preview.noDataMonthlyHint',
    previewNote: 'preview.monthlyNote',
    tripFilters: false
  }
};

/** The level's details; no dataset means trips. */
export const datasetInfo = (dataset?: DownloadDataset): DatasetInfo => DATASETS[dataset ?? 'landings'];
