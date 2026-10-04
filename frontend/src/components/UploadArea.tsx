import type { ChangeEvent, DragEvent } from 'react';

interface Props {
  onUpload: (file: File) => void;
  isProcessing: boolean;
  errorMessage: string | null;
  errorDetails: string[] | null;
}

const UPLOAD_INPUT_ID = 'marketlens-csv-upload';

export function UploadArea({ onUpload, isProcessing, errorMessage, errorDetails }: Props) {
  function handleFile(file: File | undefined) {
    if (file) onUpload(file);
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    handleFile(event.target.files?.[0]);
    event.currentTarget.value = '';
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.currentTarget.classList.add('upload-area-dragging');
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.currentTarget.classList.remove('upload-area-dragging');
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.currentTarget.classList.remove('upload-area-dragging');
    handleFile(event.dataTransfer.files[0]);
  }

  return (
    <div
      className="upload-area"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input id={UPLOAD_INPUT_ID} type="file" accept=".csv,text/csv" hidden onChange={handleChange} />
      <label htmlFor={UPLOAD_INPUT_ID} className="upload-area-label">
        <span className="upload-area-icon">↑</span>
        <strong>{isProcessing ? 'Processing upload…' : 'Drop a CSV file here or choose one'}</strong>
        <small>Required columns: date, open, high, low, close, volume</small>
      </label>
      {errorMessage && (
        <div className="upload-area-error" role="alert">
          <strong>{errorMessage}</strong>
          {errorDetails && errorDetails.length > 0 && (
            <ul>
              {errorDetails.map((detail) => <li key={detail}>{detail}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
