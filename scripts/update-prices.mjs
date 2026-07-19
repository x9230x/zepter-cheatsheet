// Робот обновления цен Zepter.
// Заходит на 3 страницы товаров, берёт розничную цену из первого
// атрибута data-remarket-itemvalue и перезаписывает prices.json.
// Запускается GitHub Actions по расписанию. Зависимостей нет (Node 20+).

import { readFile, writeFile } from 'node:fs/promises';

const PRODUCTS = {
  aqueenaevo: 'https://www.zepter.kz/aqueenapro/water-purifying-systems/aqueenaevo',
  aqueenapro: 'https://www.zepter.kz/aqueenapro/water-purifying-systems/aqueenapro',
};

// Страница каталога, где перечислены все сменные фильтры с ценами.
const CATALOG = 'https://www.zepter.kz/aqueenapro/water-purifying-systems';

// Артикулы сменных фильтров, которые показываем в шпаргалке.
const FILTER_IDS = [
  'WT-600-02', 'WT-600-01',
  'WT-100-72', 'WT-100-73', 'WT-100-74', 'WT-100-75', 'WT-100-15',
];

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/125.0 Safari/537.36';

// "391 500" из "391500,00"
function formatPrice(raw) {
  const digits = String(raw).split(',')[0].replace(/\D/g, '');
  if (!digits) return null;
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

async function getHtml(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ru' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.text();
}

async function fetchPrice(url) {
  const html = await getHtml(url);
  const m = html.match(/data-remarket-itemvalue="([\d,]+)"/);
  if (!m) throw new Error('цена не найдена в разметке');
  const price = formatPrice(m[1]);
  if (!price) throw new Error('не удалось разобрать цену: ' + m[1]);
  return price;
}

// По странице каталога вытаскивает цену каждого фильтра по его артикулу.
async function fetchFilters() {
  const html = await getHtml(CATALOG);
  const out = {};
  for (const id of FILTER_IDS) {
    const re = new RegExp(
      'data-remarket-productid="' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
        '"[\\s\\S]{0,400}?data-remarket-itemvalue="([\\d,]+)"',
    );
    const m = html.match(re);
    const price = m ? formatPrice(m[1]) : null;
    if (price) out[id] = price;
  }
  return out;
}

function todayAlmaty() {
  const parts = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Almaty', day: '2-digit', month: '2-digit', year: 'numeric',
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('day')}.${get('month')}.${get('year')}`;
}

async function main() {
  let prev = {};
  try { prev = JSON.parse(await readFile(new URL('../prices.json', import.meta.url), 'utf8')); }
  catch { /* первый запуск */ }

  const next = { ...prev };
  const report = [];

  for (const [key, url] of Object.entries(PRODUCTS)) {
    try {
      const price = await fetchPrice(url);
      const old = prev[key];
      next[key] = price;
      report.push(old === price ? `${key}: ${price} (без изменений)` : `${key}: ${old ?? '—'} -> ${price}`);
    } catch (err) {
      report.push(`${key}: ОШИБКА (${err.message}) — оставляю прежнее значение ${prev[key] ?? '—'}`);
    }
  }

  try {
    const filters = await fetchFilters();
    const prevFilters = prev.filters || {};
    next.filters = { ...prevFilters, ...filters };
    const changed = Object.keys(filters).filter((id) => prevFilters[id] !== filters[id]);
    report.push(
      changed.length
        ? `фильтры: обновлено ${changed.length} из ${Object.keys(filters).length} (${changed.join(', ')})`
        : `фильтры: ${Object.keys(filters).length} шт. без изменений`,
    );
  } catch (err) {
    report.push(`фильтры: ОШИБКА (${err.message}) — оставляю прежние цены`);
  }

  next.updated = todayAlmaty();

  await writeFile(
    new URL('../prices.json', import.meta.url),
    JSON.stringify(next, null, 2) + '\n',
    'utf8',
  );

  console.log('Готово. Дата: ' + next.updated);
  console.log(report.join('\n'));
}

main().catch((e) => { console.error(e); process.exit(1); });
