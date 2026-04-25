import { useState, useEffect } from 'react';
import SetupPage from './pages/SetupPage';
import DBListPage from './pages/DBListPage';
import TalkPage from './pages/TalkPage';
import { getConfig, fetchModels } from './api';

export default function App() {
  const [page, setPage] = useState('loading');
  const [config, setConfig] = useState(null);
  const [models, setModels] = useState([]);
  const [db, setDb] = useState(null);

  useEffect(() => {
    getConfig().then(async data => {
      if (data.configured) {
        setConfig({ provider: data.provider, model: data.model });
        setPage('dblist');
        // Load model list in background — needs apiKey which we don't have client-side
        // Models list will be fetched from setup page on first run; for subsequent runs
        // we show just the current model in the switcher with a static label
        setModels([{ value: data.model, label: data.model }]);
      } else {
        setPage('setup');
      }
    }).catch(() => setPage('setup'));
  }, []);

  if (page === 'loading') {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="loading-dots">
          <div className="loading-dot"/><div className="loading-dot"/><div className="loading-dot"/>
        </div>
      </div>
    );
  }

  if (page === 'setup') {
    return (
      <SetupPage
        onComplete={(cfg, fetchedModels) => {
          setConfig(cfg);
          setModels(fetchedModels || [{ value: cfg.model, label: cfg.model }]);
          setPage('dblist');
        }}
      />
    );
  }

  if (page === 'dblist') {
    return (
      <DBListPage
        config={config}
        models={models}
        onSelectDB={(selectedDb) => {
          setDb(selectedDb);
          setPage('talk');
        }}
        onModelChange={(model) => setConfig(c => ({ ...c, model }))}
      />
    );
  }

  if (page === 'talk') {
    return (
      <TalkPage
        config={config}
        models={models}
        db={db}
        onBack={() => setPage('dblist')}
        onModelChange={(model) => setConfig(c => ({ ...c, model }))}
      />
    );
  }

  return null;
}
