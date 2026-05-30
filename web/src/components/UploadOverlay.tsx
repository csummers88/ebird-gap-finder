import { useRef, useState } from 'react';
import type { LifeListSummary } from '@gap/shared';
import { Icons } from './Icons.js';

interface Props {
  summary: LifeListSummary | null;
  uploading: boolean;
  /** When true the overlay can be dismissed (a list is already loaded). */
  dismissable: boolean;
  onUpload: (file: File) => void;
  onClear: () => void;
  onClose: () => void;
}

/**
 * Warm field-guide modal for loading / managing the eBird life-list CSV.
 * Doubles as the first-run state (no list yet, not dismissable) and the
 * "manage" state opened from the life-list chip.
 */
export function UploadOverlay({ summary, uploading, dismissable, onUpload, onClear, onClose }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (file) onUpload(file);
  }

  return (
    <div className="overlay-scrim" onClick={() => dismissable && onClose()}>
      <div className="overlay-card" onClick={(e) => e.stopPropagation()}>
        {dismissable && (
          <button type="button" className="overlay-close" onClick={onClose} aria-label="Close">
            <Icons.close size={16} />
          </button>
        )}

        <div className="overlay-mark">
          <Icons.binoculars size={26} />
        </div>
        <h2 className="overlay-title">{summary ? 'Your life list' : 'Welcome to Gap Finder'}</h2>
        <p className="overlay-sub">
          {summary
            ? 'Loaded and ready. Replace it any time with a fresh export.'
            : 'Upload your personal eBird export to see which nearby species you still need.'}
        </p>

        {summary && (
          <div className="overlay-summary">
            <SummaryStat value={summary.speciesCount.toLocaleString()} label="species seen" />
            <SummaryStat value={summary.rowCount.toLocaleString()} label="rows parsed" />
            {summary.earliestDate && (
              <SummaryStat value={`${summary.earliestDate} → ${summary.latestDate}`} label="range" />
            )}
          </div>
        )}

        {summary && summary.topCounties.length > 0 && (
          <p className="overlay-counties">
            Top counties: {summary.topCounties.map((c) => `${c.county} (${c.count})`).join(' · ')}
          </p>
        )}

        {summary && (summary.unmatchedRowCount > 0 || summary.nonSpeciesRowCount > 0) && (
          <p className="overlay-warn">
            {summary.nonSpeciesRowCount > 0 && (
              <span>{summary.nonSpeciesRowCount} non-species rows (sp./slash/hybrid) skipped. </span>
            )}
            {summary.unmatchedRowCount > 0 && (
              <span>
                {summary.unmatchedRowCount} rows didn’t match the taxonomy
                {summary.unmatchedSamples.length > 0 &&
                  ` (e.g. ${summary.unmatchedSamples.slice(0, 3).join(', ')})`}
                .
              </span>
            )}
          </p>
        )}

        <div
          className={`dropzone ${dragging ? 'dragging' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handleFiles(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(e) => handleFiles(e.target.files)}
          />
          <span className="dropzone-icon">
            <Icons.upload size={20} />
          </span>
          {uploading ? (
            <p className="dropzone-title">Parsing your life list…</p>
          ) : (
            <>
              <p className="dropzone-title">{summary ? 'Drop a new MyEBirdData.csv' : 'Drop your MyEBirdData.csv here'}</p>
              <p className="dropzone-hint">
                or click to choose a file. Get it from eBird → <em>Download My Data</em>.
              </p>
            </>
          )}
        </div>

        {summary && (
          <div className="overlay-actions">
            <button type="button" className="btn-ghost danger" onClick={onClear}>
              Clear life list
            </button>
            <button type="button" className="btn-solid" onClick={onClose}>
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="overlay-stat">
      <span className="overlay-stat-value">{value}</span>
      <span className="overlay-stat-label">{label}</span>
    </div>
  );
}
