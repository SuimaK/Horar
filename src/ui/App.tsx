import { useState } from 'preact/hooks';
import type { ChartMoment } from '../core/input/chart-input';
import { checkLine } from '../core/input/check-line';
import { BuildForm } from './BuildForm';

export const DISCLAIMER = 'Описание геометрии карты по правилам традиционной астрологии. Не является прогнозом и рекомендацией.';

export function App() {
  const [moment, setMoment] = useState<ChartMoment | null>(null);

  return (
    <div class="app">
      <header class="app-header">
        <h1>Хорар</h1>
        <p class="subtitle">Карта неба на момент и место</p>
      </header>
      <main>
        {moment && (
          <section class="chart-placeholder" aria-labelledby="chart-title">
            <h2 id="chart-title">Карта</h2>
            <p class="check-line">{checkLine(moment)}</p>
            {moment.placeName && <p>{moment.placeName}</p>}
            <p>Часовой пояс: {moment.timeZone ?? 'смещение задано вручную'}</p>
            <p class="muted">Расчёт положений, домов и аспектов появится на следующем этапе разработки.</p>
            <button type="button" class="secondary" onClick={() => setMoment(null)}>Изменить ввод</button>
          </section>
        )}
        <div hidden={moment !== null}>
          <BuildForm onBuild={setMoment} />
        </div>
      </main>
      <footer class="disclaimer">{DISCLAIMER}</footer>
    </div>
  );
}
