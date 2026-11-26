import { useEffect, useRef, useState } from 'preact/hooks';
import { countryName, loadCityIndex, type City, type CityIndex } from '../core/geo/cities';

interface Props {
  value: string;
  onInput: (text: string) => void;
  onSelect: (city: City) => void;
  placeholder?: string;
}

export function cityLabel(c: City): string {
  const where = [c.region, countryName(c.country)].filter(Boolean).join(', ');
  return where ? `${c.name}, ${where}` : c.name;
}

export function CitySearch({ value, onInput, onSelect, placeholder = "Начните вводить название" }: Props) {
  const [index, setIndex] = useState<CityIndex | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = 'city-results';
  const blurTimer = useRef<number>();

  useEffect(() => {
    loadCityIndex().then(setIndex, () => setFailed(true));
  }, []);

  const results = index && value.trim().length >= 2 ? index.search(value) : [];
  const show = open && results.length > 0;

  const choose = (c: City) => {
    onSelect(c);
    setOpen(false);
  };

  return (
    <div class="city-search">
      <input
        id="place"
        type="search"
        role="combobox"
        aria-expanded={show}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={show ? `city-${results[active]?.id}` : undefined}
        autocomplete="off"
        spellcheck={false}
        placeholder={placeholder}
        value={value}
        onInput={(e) => {
          onInput((e.target as HTMLInputElement).value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          blurTimer.current = window.setTimeout(() => setOpen(false), 150);
        }}
        onKeyDown={(e) => {
          if (!show) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, results.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            choose(results[active]);
          } else if (e.key === 'Escape') setOpen(false);
        }}
      />
      {failed && <p class="hint error">Справочник городов не загрузился. Координаты можно ввести вручную.</p>}
      {show && (
        <ul id={listId} role="listbox" class="city-results">
          {results.map((c, i) => (
            <li
              id={`city-${c.id}`}
              key={c.id}
              role="option"
              aria-selected={i === active}
              class={i === active ? 'active' : ''}
              onMouseDown={(e) => {
                e.preventDefault();
                window.clearTimeout(blurTimer.current);
                choose(c);
              }}
            >
              <span class="city-name">{c.name}</span>
              <span class="city-meta">
                {[c.nameOriginal, c.region, countryName(c.country)].filter(Boolean).join(' · ')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
