import { useState } from 'preact/hooks';
import { DEFAULT_SETTINGS, type ChartSettings } from '../core/astro/chart';
import type { ChartMoment } from '../core/input/chart-input';
import { BuildForm } from './BuildForm';
import { ChartView } from './ChartView';
import { loadSettings, saveSettings } from './storage';

export const DISCLAIMER = 'Описание геометрии карты по правилам традиционной астрологии. Не является прогнозом и рекомендацией.';

export function App() {
  const [moment, setMoment] = useState<ChartMoment | null>(null);
  const [settings, setSettings] = useState<ChartSettings>(() => loadSettings(DEFAULT_SETTINGS));

  const changeSettings = (s: ChartSettings) => {
    setSettings(s);
    saveSettings(s);
  };

  return (
    <div class="app">
      <header class="app-header">
        <h1>Хорар</h1>
        <p class="subtitle">Карта неба на момент и место</p>
      </header>
      <main>
        {moment && <ChartView moment={moment} settings={settings} onSettings={changeSettings} onEdit={() => setMoment(null)} />}
        <div hidden={moment !== null}>
          <BuildForm onBuild={setMoment} />
        </div>
      </main>
      <footer class="disclaimer">{DISCLAIMER}</footer>
    </div>
  );
}
