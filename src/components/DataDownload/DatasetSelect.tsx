import React from 'react';
import { useTranslation } from 'react-i18next';
import { DownloadDataset } from '../../types/download';
import { DATASETS, datasetInfo } from './datasets';

interface DatasetSelectProps {
  value: DownloadDataset;
  onChange: (value: DownloadDataset) => void;
}

/** Data level picker of the download: trips, or monthly figures per district. */
const DatasetSelect: React.FC<DatasetSelectProps> = ({ value, onChange }) => {
  const { t } = useTranslation('download');

  return (
    <>
      <div className="form-selectgroup d-flex">
        {(Object.keys(DATASETS) as DownloadDataset[]).map(optionValue => {
          const { icon: Icon, label } = DATASETS[optionValue];
          return (
            <label key={optionValue} className="form-selectgroup-item flex-fill">
              <input
                type="radio"
                name="dataset_select"
                value={optionValue}
                className="form-selectgroup-input"
                checked={optionValue === value}
                onChange={() => onChange(optionValue)}
              />
              <span className="form-selectgroup-label d-flex align-items-center justify-content-center">
                <Icon className="icon me-2" size={18} stroke={1.75} />
                {t(label)}
              </span>
            </label>
          );
        })}
      </div>
      <small className="form-hint mt-2">{t(datasetInfo(value).hint)}</small>
    </>
  );
};

export default DatasetSelect;
