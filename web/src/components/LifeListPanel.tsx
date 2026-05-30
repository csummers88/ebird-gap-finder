import { useRef, useState } from 'react';
import type { LifeListSummary } from '@gap/shared';

interface Props {
  summary: LifeListSummary | null;
  uploading: boolean;
  onUpload: (file: File) => void;
  onClear: () => void;
}

export function LifeListPanel({ summary, uploading, onUpload, onClear }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (file) onUpload(file);
  }

  if (!summary) {
    return (
      <div
        className={`upload ${dragging ? 'dragging' : ''}`}
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
        {uploading ? (
          <p>Parsing your life list…</p>
        ) : (
          <>
            <p className="upload-title">Drop your MyEBirdData.csv here</p>
            <p className="hint">
              or click to choose a file. Get it from eBird → <em>Download My Data</em>.
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="summary">
      <div className="summary-stats">
        <Stat label="species seen" value={summary.speciesCount.toLocaleString()} />
        <Stat label="rows parsed" value={summary.rowCount.toLocaleString()} />
        {summary.earliestDate && (
          <Stat label="range" value={`${summary.earliestDate} → ${summary.latestDate}`} />
        )}
      </div>
      {summary.topCounties.length > 0 && (
        <div className="summary-counties">
          <span className="hint">Top counties:</span>{' '}
          {summary.topCounties.map((c) => `${c.county} (${c.count})`).join(' · ')}
        </div>
      )}
      {(summary.unmatchedRowCount > 0 || summary.nonSpeciesRowCount > 0) && (
        <div className="summary-warn">
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
        </div>
      )}
      <button className="link-button" onClick={onClear}>
        Replace life list
      </button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}
