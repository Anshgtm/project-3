import { Component } from 'react';
import { DatasetPicker } from './DatasetPicker';
import { UploadArea } from './UploadArea';
import { AnalysisView } from './AnalysisView';
import { Footer } from './Footer';
import { listDatasets, uploadDataset, getDatasetAnalysis, ValidationError } from '../api/datasets';
import type { DatasetListItem, DatasetAnalysis, AppState } from '../types';

function initState() {
  return {
    datasets: [] as DatasetListItem[],
    selectedId: null as number | null,
    analysis: null as DatasetAnalysis | null,
    appState: 'loading-datasets' as AppState,
    errorMessage: null as string | null,
    errorDetails: null as string[] | null,
  };
}

export class Dashboard extends Component {
  state = initState();

  async loadDatasets() {
    try {
      const result = await listDatasets();
      this.setState({ datasets: result.datasets });
      if (result.datasets.length > 0) {
        this.setState({ selectedId: result.datasets[0].id, appState: 'loading-analysis' });
        await this.loadAnalysis(result.datasets[0].id);
      } else {
        this.setState({ appState: 'empty' });
      }
    } catch {
      this.setState({ appState: 'error', errorMessage: 'Could not load datasets.' });
    }
  }

  componentDidMount() {
    this.loadDatasets();
  }

  async loadAnalysis(id: number) {
    try {
      const a = await getDatasetAnalysis(id);
      this.setState({ analysis: a, appState: 'ready' });
    } catch {
      this.setState({ appState: 'error', analysis: null, errorMessage: 'Could not load analysis for the selected dataset.' });
    }
  }

  async handleUpload(file: File) {
    this.setState({ appState: 'uploading', errorMessage: null, errorDetails: null });
    try {
      const result = await uploadDataset(file);
      const updatedDatasets = [...this.state.datasets, result.dataset];
      this.setState({ datasets: updatedDatasets, selectedId: result.dataset.id, appState: 'loading-analysis' });
      await this.loadAnalysis(result.dataset.id);
    } catch (err) {
      if (err instanceof ValidationError) {
        this.setState({ appState: 'validation-error', errorMessage: err.message, errorDetails: err.details });
      } else {
        this.setState({ appState: 'validation-error', errorMessage: err instanceof Error ? err.message : 'Upload failed.', errorDetails: null });
      }
    }
  }

  handlePickerSelect(id: number) {
    this.setState({ selectedId: id, appState: 'loading-analysis', analysis: null });
    this.loadAnalysis(id);
  }

  render() {
    const { datasets, selectedId, analysis, appState, errorMessage, errorDetails } = this.state;

    return (
      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '16px', fontFamily: 'system-ui, sans-serif' }}>
        <h1 style={{ marginBottom: '4px' }}>StockLens</h1>

        <UploadArea
          onUpload={this.handleUpload.bind(this)}
          isProcessing={appState === 'uploading'}
          errorMessage={appState === 'validation-error' ? errorMessage : null}
          errorDetails={appState === 'validation-error' ? errorDetails : null}
        />

        {appState === 'loading-datasets' ? (
          <div style={{ textAlign: 'center', padding: '32px' }}>Loading datasets...</div>
        ) : datasets.length > 0 ? (
          <>
            <DatasetPicker
              datasets={datasets}
              selectedId={selectedId}
              onSelect={this.handlePickerSelect.bind(this)}
            />
            <AnalysisView analysis={analysis} state={appState} />
          </>
        ) : appState === 'empty' ? (
          <div style={{ textAlign: 'center', padding: '32px', color: '#666' }}>
            No datasets available. Upload a CSV to get started.
          </div>
        ) : null}

        {appState === 'error' && errorMessage && (
          <div style={{ textAlign: 'center', padding: '16px', color: '#d32f2f' }}>
            {errorMessage}
          </div>
        )}

        <Footer />
      </div>
    );
  }
}