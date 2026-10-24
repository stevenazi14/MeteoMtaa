import { getForecast, searchLocations } from './weather-api.js';

const DEFAULT_LOCATION = {
  name: 'Nairobi', country: 'Kenya', countryCode: 'KE', admin1: 'Nairobi',
  latitude: -1.286389, longitude: 36.817223, timezone: 'Africa/Nairobi',
};
const CACHE_PREFIX = 'meteomtaa:forecast:';
const CACHE_MAX_AGE = 48 * 60 * 60 * 1000;
const activities = {
  laundry: { label: 'Laundry', preference: 'dry', tip: 'Dry conditions help laundry dry outdoors.' },
  walk: { label: 'Walk or run', preference: 'mild', tip: 'Milder temperatures and lighter wind feel more comfortable for a walk or run.' },
  garden: { label: 'Gardening', preference: 'mild', tip: 'A mild stretch and light wind can make garden tasks more comfortable.' },
  event: { label: 'Outdoor plans', preference: 'calm', tip: 'Lower rain and wind make outdoor plans more comfortable.' },
};
let selectedLocation = DEFAULT_LOCATION;
let selectedForecast = null;
let isFahrenheit = false;
let searchController;
let forecastController;
let comparisonController;
let searchSequence = 0;
let forecastSequence = 0;
let toastTimer;
let compareLocations = new Map();
let dismissedSuggestion = false;

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const safeStorage = {
  read(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } },
  write(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Private browsing may block storage. */ } },
};
const localDateParts = (timestamp, timezone) => Object.fromEntries(
  new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(timestamp * 1000)).filter((part) => part.type !== 'literal').map(({ type, value }) => [type, value]),
);
const dateKey = (timestamp, timezone) => {
  const parts = localDateParts(timestamp, timezone);
  return `${parts.year}-${parts.month}-${parts.day}`;
};
const formatTime = (timestamp, timezone, options = { hour: 'numeric', minute: '2-digit' }) => {
  if (!Number.isFinite(timestamp)) return '—';
  return new Intl.DateTimeFormat('en-KE', { ...options, timeZone: timezone }).format(new Date(timestamp * 1000));
};
const formatTemperature = (value) => {
  if (!Number.isFinite(value)) return '—';
  const shown = isFahrenheit ? Math.round(value * 9 / 5 + 32) : Math.round(value);
  return `${shown}°`;
};
const formatWind = (value) => {
  if (!Number.isFinite(value)) return '—';
  return `${Math.round(isFahrenheit ? value * 0.621371 : value)} ${isFahrenheit ? 'mph' : 'km/h'}`;
};
function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 3200);
}
function cacheKey(location) {
  return `${CACHE_PREFIX}${location.latitude.toFixed(3)}:${location.longitude.toFixed(3)}`;
}
function getCachedForecast(location) {
  const entry = safeStorage.read(cacheKey(location));
  if (!entry?.forecast || Date.now() - entry.savedAt > CACHE_MAX_AGE) return null;
  return entry;
}
function conditionFor(code, isDay = true) {
  if (code === 0) return { text: 'Clear sky', label: isDay ? 'Sunshine' : 'Clear night', icon: isDay ? '☀' : '☾' };
  if ([1, 2].includes(code)) return { text: code === 1 ? 'Mainly clear' : 'Partly cloudy', label: 'Some clouds', icon: isDay ? '⛅' : '☁' };
  if (code === 3) return { text: 'Overcast', label: 'Cloudy skies', icon: '☁' };
  if ([45, 48].includes(code)) return { text: 'Foggy', label: 'Low visibility', icon: '🌫️' };
  if ([51, 53, 55, 56, 57].includes(code)) return { text: 'Drizzle', label: 'Light rain', icon: '🌦️' };
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { text: 'Rain showers', label: 'Rain nearby', icon: '🌧️' };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { text: 'Snowfall', label: 'Snow nearby', icon: '❄️' };
  if ([95, 96, 99].includes(code)) return { text: 'Thunderstorms', label: 'Storms nearby', icon: '⛈️' };
  return { text: 'Changing skies', label: 'Forecast available', icon: '🌤️' };
}
function weatherGlyph(code, isDay = true) {
  return conditionFor(code, isDay).icon;
}
function setDataStatus(message, state = 'loading') {
  $('#data-status').textContent = message;
  $('#data-status').dataset.state = state;
  $('#app-status').innerHTML = `<i></i> ${state === 'live' ? 'LIVE WEATHER' : state === 'stale' ? 'SAVED SNAPSHOT' : state === 'error' ? 'WEATHER OFFLINE' : 'LOADING WEATHER'}`;
  $('#app-status').dataset.state = state;
}
function showLoading(location) {
  selectedForecast = null;
  $('#location-name').textContent = `${location.name}${location.country ? `, ${location.country}` : ''}`;
  $('#location-time').textContent = location.timezone.replaceAll('_', ' ');
  $('#weather-description').textContent = 'Finding the latest forecast…';
  $('#sun-face').textContent = '☁';
  $('#updated-stamp').textContent = 'Waiting for data';
  $('#condition-label').textContent = 'Loading conditions';
  $('#current-temp').innerHTML = '—<span>°</span>';
  $('#feels-like').textContent = '—';
  $('#humidity').innerHTML = '—<span>%</span>';
  $('#wind').innerHTML = '— <span>km/h</span>';
  $('#rain').innerHTML = '—<span>%</span>';
  $('#sunrise').textContent = '—'; $('#sunset').textContent = '—';
  $('#hourly-strip').innerHTML = '<div class="weather-state">Loading hourly forecast…</div>';
  $('#week-list').innerHTML = '<div class="weather-state">Loading the week ahead…</div>';
  $('#change-insights').innerHTML = '<p class="loading-note">Reading the latest forecast…</p>';
  $('#activity-suggestion').hidden = true;
  renderPlanner();
}
function renderHourly() {
  const list = $('#hourly-strip');
  if (!selectedForecast) return;
  const now = Math.floor(Date.now() / 1000) - 3600;
  const upcoming = selectedForecast.hourly.filter((hour) => hour.time >= now).slice(0, 8);
  list.innerHTML = upcoming.map((hour, index) => {
    const condition = conditionFor(hour.code);
    const rain = Number.isFinite(hour.rainChance) ? `${Math.round(hour.rainChance)}%` : '—';
    return `<article class="hour-card ${index === 0 ? 'current-hour' : ''}"><span class="hour-time">${index === 0 ? 'Next' : formatTime(hour.time, selectedForecast.timezone, { hour: 'numeric' })}</span><span class="hour-icon" aria-hidden="true">${condition.icon}</span><strong>${formatTemperature(hour.temperature)}</strong><span class="hour-rain">☂ ${rain}</span></article>`;
  }).join('') || '<div class="weather-state">No more hourly forecasts are available today.</div>';
}
function renderWeek() {
  const list = $('#week-list');
  if (!selectedForecast) return;
  list.innerHTML = selectedForecast.daily.slice(0, 5).map((day, index) => {
    const condition = conditionFor(day.code);
    const dayName = index === 0 ? 'Today' : new Intl.DateTimeFormat('en-KE', { weekday: 'short', timeZone: selectedForecast.timezone }).format(new Date(day.time * 1000));
    const rain = Number.isFinite(day.rainChance) ? `${Math.round(day.rainChance)}%` : '—';
    return `<div class="week-row"><span class="week-day">${dayName}${index === 0 ? '<small>Local forecast</small>' : ''}</span><span class="week-icon" aria-hidden="true">${condition.icon}</span><span class="week-description">${condition.text}</span><span class="week-rain">☂ ${rain}</span><span class="week-temps"><b>${formatTemperature(day.high)}</b><span>${formatTemperature(day.low)}</span></span></div>`;
  }).join('');
}
function plannerForecast() {
  if (!selectedForecast) return [];
  const now = Math.floor(Date.now() / 1000) - 3600;
  return selectedForecast.hourly.filter((item) => item.time >= now).slice(0, 12).map((item, index) => ({
    ...item,
    hour: Number(new Intl.DateTimeFormat('en-GB', { timeZone: selectedForecast.timezone, hour: '2-digit', hourCycle: 'h23' }).format(new Date(item.time * 1000))),
    index,
  }));
}
function plannerScore(hour, activity) {
  const rainLimit = Number($('#rain-limit').value);
  const windLimit = Number($('#wind-limit').value);
  const heatLimit = Number($('#heat-limit').value);
  if (![hour.rainChance, hour.wind, hour.temperature].every(Number.isFinite) ||
      hour.rainChance > rainLimit || hour.wind > windLimit || hour.temperature > heatLimit) return null;
  const rainScore = 1 - hour.rainChance / Math.max(1, rainLimit || 10);
  const windScore = 1 - hour.wind / Math.max(1, windLimit);
  const heatScore = activity.preference === 'mild'
    ? 1 - Math.abs(hour.temperature - 24) / Math.max(10, heatLimit - 12)
    : 1 - hour.temperature / Math.max(1, heatLimit + 5);
  const weights = activity.preference === 'dry' ? [0.5, 0.2, 0.3]
    : activity.preference === 'calm' ? [0.4, 0.4, 0.2] : [0.3, 0.25, 0.45];
  return Math.round(Math.max(0, Math.min(1, rainScore * weights[0] + windScore * weights[1] + heatScore * weights[2])) * 100);
}
function formatPlannerHour(timestamp) {
  return formatTime(timestamp, selectedForecast.timezone, { hour: 'numeric' });
}
function renderPlanner() {
  const results = $('#planner-results');
  if (!selectedForecast) {
    results.innerHTML = '<div class="planner-result-board"><div class="planner-result-top"><span>YOUR WEATHER WINDOW</span><span class="preview-data-tag">LIVE DATA REQUIRED</span></div><div class="planner-empty"><strong>Waiting for a forecast</strong><span>Choose a city above to find a weather window for your plans.</span></div></div>';
    return;
  }
  const activity = activities[$('.activity-chip.selected')?.dataset.activity || 'laundry'];
  const period = $('#planner-period').value;
  const forecast = plannerForecast();
  const available = forecast.filter((hour) => period === 'any' || (period === 'morning' ? hour.hour < 12 : hour.hour >= 12));
  const eligible = available.map((hour) => ({ ...hour, score: plannerScore(hour, activity) })).filter((hour) => hour.score !== null);
  const blocks = [];
  for (let i = 0; i < eligible.length;) {
    const block = [eligible[i]];
    let next = i + 1;
    while (next < eligible.length && eligible[next].time === block.at(-1).time + 3600) block.push(eligible[next++]);
    const span = block.length >= 2 ? 2 : 1;
    for (let offset = 0; offset < block.length; offset += span) {
      const segment = block.slice(offset, Math.min(offset + span, block.length));
      blocks.push({ hours: segment, score: Math.round(segment.reduce((sum, hour) => sum + hour.score, 0) / segment.length) });
    }
    i = next;
  }
  blocks.sort((a, b) => b.score - a.score || b.hours.length - a.hours.length);
  const periodLabel = period === 'morning' ? 'morning' : period === 'afternoon' ? 'afternoon' : 'next 12 hours';
  const renderTimeline = () => `<div class="planner-timeline"><div class="timeline-title"><strong>Rain chance across the ${periodLabel}</strong><span><i></i> Within your limits</span></div><div class="timeline-hours">${forecast.map((hour) => {
    const matched = eligible.some((item) => item.index === hour.index);
    const barHeight = Math.max(8, Math.round((hour.rainChance ?? 0) * .65));
    const rain = Number.isFinite(hour.rainChance) ? `${Math.round(hour.rainChance)}%` : '—';
    return `<div class="timeline-hour ${matched ? 'matches' : ''}" aria-label="${formatPlannerHour(hour.time)}: ${rain} rain chance${matched ? ', within your limits' : ''}"><span class="timeline-value">${rain}</span><i style="height:${barHeight}px"></i><span class="timeline-time">${formatPlannerHour(hour.time).replace(' ', '')}</span></div>`;
  }).join('')}</div><div class="timeline-legend"><span>Hourly rain chance</span><span>Lower is drier</span></div></div>`;
  if (!blocks.length) {
    results.innerHTML = `<div class="planner-result-board"><div class="planner-result-top"><span>YOUR WEATHER WINDOW</span><span class="preview-data-tag">LIVE FORECAST</span></div><div class="planner-empty"><span class="empty-weather-icon">☁</span><strong>No hours fit those limits</strong><span>Try widening a limit or choosing another time of day.</span></div>${renderTimeline()}</div>`;
    return;
  }
  const [featured, ...alternatives] = blocks.slice(0, 3);
  const rainLow = Math.min(...featured.hours.map((item) => item.rainChance));
  const rainHigh = Math.max(...featured.hours.map((item) => item.rainChance));
  const windHigh = Math.max(...featured.hours.map((item) => item.wind));
  const tempLow = Math.min(...featured.hours.map((item) => item.temperature));
  const tempHigh = Math.max(...featured.hours.map((item) => item.temperature));
  const fit = featured.score >= 75 ? 'A lovely fit' : 'A possible fit';
  const explanation = `${activity.tip} Rain ${rainLow}–${rainHigh}%, wind up to ${Math.round(windHigh)} km/h, and ${Math.round(tempLow)}–${Math.round(tempHigh)}°C.`;
  const alternateHTML = alternatives.map((window, index) => `<article class="alternate-window"><span class="alternate-number">0${index + 2}</span><div><strong>${formatPlannerHour(window.hours[0].time)} – ${formatPlannerHour(window.hours.at(-1).time + 3600)}</strong><small>${Math.min(...window.hours.map((item) => item.rainChance))}–${Math.max(...window.hours.map((item) => item.rainChance))}% rain · Wind up to ${Math.round(Math.max(...window.hours.map((item) => item.wind)))} km/h</small></div><span class="alternate-fit">${window.score} fit</span></article>`).join('');
  results.innerHTML = `<div class="planner-result-board"><div class="planner-result-top"><span>YOUR WEATHER WINDOW</span><span class="preview-data-tag">LIVE FORECAST</span></div><div class="featured-window"><div class="featured-copy"><span class="fit-kicker">✦ &nbsp;${fit} for ${activity.label}</span><strong class="featured-time">${formatPlannerHour(featured.hours[0].time)} <span>to</span> ${formatPlannerHour(featured.hours.at(-1).time + 3600)}</strong><p>${explanation}</p></div><div class="fit-meter" style="--fit:${featured.score / 100}" aria-label="${featured.score} out of 100 fit score"><span>${featured.score}</span><small>FIT</small></div></div>${alternateHTML ? `<div class="alternate-heading">ALSO WORTH A LOOK</div><div class="alternate-list">${alternateHTML}</div>` : ''}${renderTimeline()}</div>`;
}
function renderWeatherInsights() {
  if (!selectedForecast) return;
  const { current, hourly, timezone } = selectedForecast;
  const future = hourly.filter((item) => item.time > current.time).slice(0, 6);
  const insights = [];
  const maxTemp = Math.max(current.temperature, ...future.map((item) => item.temperature).filter(Number.isFinite));
  const minTemp = Math.min(current.temperature, ...future.map((item) => item.temperature).filter(Number.isFinite));
  const futureRain = future.map((item) => item.rainChance).filter(Number.isFinite);
  if (maxTemp - current.temperature >= 3) insights.push({ icon: '↗', kind: 'warm', title: 'Warming up', text: `About ${Math.round(maxTemp - current.temperature)}° warmer during the next few hours.`, when: formatTime(future.find((item) => item.temperature === maxTemp)?.time, timezone, { hour: 'numeric' }) });
  if (current.temperature - minTemp >= 3) insights.push({ icon: '↘', kind: 'breezy', title: 'Cooler hours ahead', text: `Temperature may fall to ${formatTemperature(minTemp)} later.`, when: formatTime(future.find((item) => item.temperature === minTemp)?.time, timezone, { hour: 'numeric' }) });
  if (futureRain.length && Math.max(...futureRain) - (future[0]?.rainChance ?? 0) >= 25) insights.push({ icon: '☂', kind: 'breezy', title: 'Rain chance is rising', text: `It reaches ${Math.round(Math.max(...futureRain))}% in the next hours.`, when: formatTime(future.find((item) => item.rainChance === Math.max(...futureRain))?.time, timezone, { hour: 'numeric' }) });
  if (!insights.length) insights.push({ icon: '✦', kind: 'warm', title: 'Fairly steady for now', text: 'No major temperature or rain change appears in the next few hours.', when: 'Next hours' });
  $('#change-insights').innerHTML = insights.slice(0, 2).map((item) => `<div class="change-item"><span class="change-icon ${item.kind}">${item.icon}</span><div><strong>${item.title}</strong><p>${item.text}</p></div><span class="change-time">${item.when}</span></div>`).join('');

  const currentRain = future[0]?.rainChance ?? 0;
  const currentWind = current.wind ?? future[0]?.wind ?? 0;
  let suggestion;
  if (current.temperature <= 18) suggestion = { icon: '☕', title: 'Cozy coffee weather', text: `It’s ${formatTemperature(current.temperature)} now. A warm café break could suit this cooler spell.` };
  else if (currentRain >= 55 || current.code >= 61) suggestion = { icon: '☕', title: 'A café break could fit', text: `${Math.round(currentRain)}% rain chance nearby. Consider a covered stop while the showers pass.` };
  else if (current.temperature >= 30 && current.isDay) suggestion = { icon: '🧊', title: 'Take a cool-down break', text: `It’s ${formatTemperature(current.temperature)}. Look for shade and keep water nearby during the warmer hours.` };
  else if (currentRain <= 25 && currentWind <= 20) suggestion = { icon: '🚶', title: 'A pleasant time to step out', text: `Light rain chances and gentle wind make a short walk a reasonable option.` };
  else suggestion = { icon: '☁', title: 'Keep plans flexible', text: 'Check the hourly forecast again before heading out; conditions may change.' };
  const suggestionBox = $('#activity-suggestion');
  suggestionBox.hidden = dismissedSuggestion;
  suggestionBox.innerHTML = `<span class="suggestion-icon">${suggestion.icon}</span><div><span class="suggestion-kicker">A MTAA MOMENT</span><strong>${suggestion.title}</strong><p>${suggestion.text}</p></div><button type="button" class="suggestion-dismiss" aria-label="Dismiss suggestion">×</button>`;
}
function renderForecast() {
  if (!selectedForecast) return;
  const { current, daily, timezone } = selectedForecast;
  const condition = conditionFor(current.code, current.isDay);
  const localKey = dateKey(current.time, timezone);
  const todaysSun = daily.find((day) => dateKey(day.time, timezone) === localKey) || daily[0];
  const nearestHour = selectedForecast.hourly.find((hour) => hour.time >= current.time) || selectedForecast.hourly[0];
  $('#location-name').textContent = `${selectedLocation.name}${selectedLocation.country ? `, ${selectedLocation.country}` : ''}`;
  $('#location-time').textContent = new Intl.DateTimeFormat('en', { timeZone: timezone, timeZoneName: 'short' }).formatToParts(new Date(current.time * 1000)).find((part) => part.type === 'timeZoneName')?.value || timezone;
  $('#weather-description').textContent = condition.text;
  $('#condition-label').textContent = condition.label;
  $('#sun-face').textContent = condition.icon;
  $('#current-temp').innerHTML = `${formatTemperature(current.temperature).replace('°', '')}<span>°</span>`;
  $('#feels-like').textContent = formatTemperature(current.feelsLike);
  $('#humidity').innerHTML = `${Number.isFinite(current.humidity) ? Math.round(current.humidity) : '—'}<span>%</span>`;
  $('#wind').innerHTML = `${formatWind(current.wind)} <span></span>`;
  $('#rain').innerHTML = `${Number.isFinite(nearestHour?.rainChance) ? Math.round(nearestHour.rainChance) : '—'}<span>%</span>`;
  const rainNote = document.querySelector('.rain small');
  if (rainNote) rainNote.textContent = 'Chance in the next forecast hour';
  $('#sunrise').textContent = todaysSun?.sunrise ? formatTime(todaysSun.sunrise, timezone) : '—';
  $('#sunset').textContent = todaysSun?.sunset ? formatTime(todaysSun.sunset, timezone) : '—';
  renderHourly(); renderWeek(); renderPlanner(); renderWeatherInsights(); renderCompare();
}
function setFavoriteState() {
  const favorites = safeStorage.read('meteomtaa:favorites') || [];
  const isSaved = favorites.some((item) => item.latitude === selectedLocation.latitude && item.longitude === selectedLocation.longitude);
  $('#favorite-button').setAttribute('aria-pressed', String(isSaved));
  $('#favorite-button').innerHTML = `<span>${isSaved ? '★' : '☆'}</span> ${isSaved ? 'Saved' : 'Save place'}`;
}
function showCachedForecast(location, entry) {
  selectedLocation = entry.location || location;
  selectedForecast = entry.forecast;
  $('#location-name').textContent = `${selectedLocation.name}${selectedLocation.country ? `, ${selectedLocation.country}` : ''}`;
  setDataStatus(`Saved forecast · retrieved ${formatTime(Math.floor(entry.savedAt / 1000), selectedForecast.timezone)}`, 'stale');
  $('#weather-description').dataset.stale = 'true';
  $('#updated-stamp').textContent = `Saved ${formatTime(Math.floor(entry.savedAt / 1000), selectedForecast.timezone)}`;
  showToast('Showing a saved forecast. Weather data may be out of date.');
  setFavoriteState(); renderForecast();
}
async function loadForecast(location) {
  forecastController?.abort();
  forecastController = new AbortController();
  const requestId = ++forecastSequence;
  selectedLocation = location;
  dismissedSuggestion = false;
  showLoading(location);
  setDataStatus('Getting current weather and forecast…', 'loading');
  try {
    const forecast = await getForecast(location, { signal: forecastController.signal });
    if (requestId !== forecastSequence) return;
    selectedForecast = forecast;
    safeStorage.write(cacheKey(location), { savedAt: Date.now(), location, forecast });
    $('#weather-description').dataset.stale = 'false';
    setDataStatus(`Live forecast · updated ${formatTime(forecast.current.time, forecast.timezone)}`, 'live');
    $('#updated-stamp').textContent = `Updated ${formatTime(forecast.current.time, forecast.timezone)}`;
    compareLocations.set(cacheKey(location), { location, forecast });
    setFavoriteState(); renderForecast();
  } catch (error) {
    if (error.name === 'AbortError' || requestId !== forecastSequence) return;
    const cached = getCachedForecast(location);
    if (cached) return showCachedForecast(location, cached);
    selectedForecast = null;
    setDataStatus(navigator.onLine ? 'Could not load live weather' : 'You are offline', 'error');
    $('#weather-description').textContent = 'Weather is unavailable';
    $('#condition-label').textContent = error.message || 'Check your connection and try again.';
    $('#current-temp').innerHTML = '—<span>°</span>';
    $('#hourly-strip').innerHTML = '<div class="weather-state">Forecast could not be loaded. Please retry.</div>';
    $('#week-list').innerHTML = '<div class="weather-state">No live forecast available.</div>';
    renderPlanner();
    showToast(error.message || 'Could not connect to the weather service.');
  }
}
function renderSearchResults(locations) {
  resultLocations = locations;
  const panel = $('#search-results');
  panel.innerHTML = locations.map((location, index) => `<button type="button" class="search-result" role="option" aria-selected="false" data-result-index="${index}"><span class="location-pin">⌖</span><span><strong>${escapeHtml(location.name)}</strong><small>${escapeHtml([location.admin1, location.country].filter(Boolean).join(', '))}</small></span><span class="result-arrow">↗</span></button>`).join('');
  panel.hidden = false;
}
async function searchCity() {
  const query = $('#city-search').value.trim();
  if (query.length < 2) return showToast('Enter at least two letters to search for a city.');
  searchController?.abort();
  searchController = new AbortController();
  const requestId = ++searchSequence;
  $('#search-button').disabled = true;
  $('#search-button').textContent = 'Searching…';
  $('#search-results').hidden = true;
  try {
    const locations = await searchLocations(query, { signal: searchController.signal });
    if (requestId !== searchSequence) return;
    if (!locations.length) {
      $('#search-results').innerHTML = '<div class="search-message">No cities matched that name. Try adding a country, such as “Springfield, US”.</div>';
      $('#search-results').hidden = false;
    } else if (locations.length === 1) {
      $('#city-search').value = '';
      await loadForecast(locations[0]);
    } else {
      renderSearchResults(locations);
    }
  } catch (error) {
    if (error.name === 'AbortError' || requestId !== searchSequence) return;
    const cached = findCachedLocation(query);
    if (cached) {
      $('#city-search').value = '';
      showCachedForecast(cached.location, cached);
    } else {
      showToast(error.message || 'City search is unavailable. Check your internet connection.');
    }
  } finally {
    if (requestId === searchSequence) {
      $('#search-button').disabled = false;
      $('#search-button').innerHTML = 'Find my weather <span>→</span>';
    }
  }
}
function findCachedLocation(query) {
  const normalized = query.toLocaleLowerCase();
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(CACHE_PREFIX)) continue;
      const entry = safeStorage.read(key);
      if (entry?.location?.name?.toLocaleLowerCase().includes(normalized) && Date.now() - entry.savedAt <= CACHE_MAX_AGE) return entry;
    }
  } catch { /* Storage can be disabled by the browser. */ }
  return null;
}
function selectSearchResult(index) {
  const result = $('#search-results');
  const button = result.querySelector(`[data-result-index="${index}"]`);
  if (!button) return;
  const location = resultLocations[Number(index)];
  if (!location) return;
  result.hidden = true;
  $('#city-search').value = '';
  loadForecast(location);
}
let resultLocations = [];
async function loadInitialWeather() {
  const cached = getCachedForecast(DEFAULT_LOCATION);
  if (cached) showCachedForecast(DEFAULT_LOCATION, cached);
  else showLoading(DEFAULT_LOCATION);
  await loadForecast(DEFAULT_LOCATION);
}
function toggleUnits() {
  isFahrenheit = !isFahrenheit;
  $('.unit-toggle').innerHTML = isFahrenheit ? '<span>°C</span><span class="chosen">°F</span>' : '<span class="chosen">°C</span><span>°F</span>';
  $('.unit-toggle').setAttribute('aria-label', `Switch to ${isFahrenheit ? 'Celsius' : 'Fahrenheit'}`);
  if (selectedForecast) renderForecast();
}
function updateActivity(button) {
  document.querySelectorAll('.activity-chip').forEach((chip) => {
    const chosen = chip === button;
    chip.classList.toggle('selected', chosen);
    chip.setAttribute('aria-pressed', String(chosen));
  });
  renderPlanner();
}
function updateToday() {
  $('#today-label').textContent = new Intl.DateTimeFormat('en-KE', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date()).toLocaleUpperCase() + ' · YOUR LOCAL WEATHER';
}
async function addCompareCity() {
  const query = $('#compare-search').value.trim();
  if (query.length < 2) return showToast('Enter a city name to compare.');
  if (compareLocations.size >= 3) return showToast('Compare up to three places. Remove one before adding another.');
  comparisonController?.abort();
  comparisonController = new AbortController();
  const button = $('#add-compare');
  button.disabled = true;
  button.textContent = 'Finding…';
  try {
    const locations = await searchLocations(query, { signal: comparisonController.signal });
    const location = locations[0];
    if (!location) return showToast('No matching place found. Try adding its country.');
    const key = cacheKey(location);
    if (!compareLocations.has(key)) {
      const forecast = await getForecast(location, { signal: comparisonController.signal });
      compareLocations.set(key, { location, forecast });
      safeStorage.write(cacheKey(location), { savedAt: Date.now(), location, forecast });
    }
    $('#compare-search').value = '';
    renderCompare();
  } catch (error) {
    if (error.name !== 'AbortError') showToast(error.message || 'Could not load that city for comparison.');
  } finally {
    button.disabled = false;
    button.textContent = '＋ Add city';
  }
}
function renderCompare() {
  const container = $('#compare-cities');
  if (!container) return;
  if (selectedForecast) compareLocations.set(cacheKey(selectedLocation), { location: selectedLocation, forecast: selectedForecast });
  const entries = [...compareLocations.entries()];
  if (!entries.length) {
    container.innerHTML = '<div class="compare-empty">Load a forecast, then add a city to compare.</div>';
    return;
  }
  container.innerHTML = entries.map(([key, item]) => {
    const condition = conditionFor(item.forecast.current.code, item.forecast.current.isDay);
    const next = item.forecast.hourly.find((hour) => hour.time >= item.forecast.current.time);
    const rain = Number.isFinite(next?.rainChance) ? `${Math.round(next.rainChance)}%` : '—';
    return `<article class="compare-city"><div class="compare-place"><span class="place-dot dot-orange"></span><strong>${escapeHtml(item.location.name)}</strong><small>${escapeHtml(item.location.countryCode || '')}</small></div><div class="compare-weather">${condition.icon} <b>${formatTemperature(item.forecast.current.temperature)}</b></div><div class="compare-meta">Rain ${rain} <span>·</span> Wind ${formatWind(item.forecast.current.wind)}</div>${entries.length > 1 ? `<button class="compare-remove" data-remove-compare="${key}" aria-label="Remove ${escapeHtml(item.location.name)}">×</button>` : ''}</article>`;
  }).join('');
}

$('#search-button').addEventListener('click', searchCity);
$('#city-search').addEventListener('keydown', (event) => { if (event.key === 'Enter') searchCity(); });
$('#city-search').addEventListener('input', () => { if (!$('#city-search').value.trim()) $('#search-results').hidden = true; });
$('#search-results').addEventListener('click', (event) => {
  const button = event.target.closest('[data-result-index]');
  if (button) selectSearchResult(button.dataset.resultIndex);
});
document.addEventListener('click', (event) => {
  if (!event.target.closest('.search-row') && !event.target.closest('#search-results')) $('#search-results').hidden = true;
});
$('.unit-toggle').addEventListener('click', toggleUnits);
$('#hour-scroll').addEventListener('click', () => $('#hourly-strip').scrollBy({ left: $('#hourly-strip').clientWidth, behavior: 'smooth' }));
$('#favorite-button').addEventListener('click', () => {
  const favorites = safeStorage.read('meteomtaa:favorites') || [];
  const exists = favorites.some((item) => item.latitude === selectedLocation.latitude && item.longitude === selectedLocation.longitude);
  const next = exists ? favorites.filter((item) => item.latitude !== selectedLocation.latitude || item.longitude !== selectedLocation.longitude)
    : [...favorites, selectedLocation];
  safeStorage.write('meteomtaa:favorites', next);
  setFavoriteState();
  showToast(exists ? 'Place removed from saved places.' : 'Place saved on this device.');
});
document.querySelectorAll('.activity-chip').forEach((button) => button.addEventListener('click', () => updateActivity(button)));
$('#planner-period').addEventListener('change', renderPlanner);
[['rain-limit', 'rain-limit-value', '%'], ['wind-limit', 'wind-limit-value', ' km/h'], ['heat-limit', 'heat-limit-value', '°C']].forEach(([inputId, outputId, unit]) => {
  const input = $(`#${inputId}`);
  const output = $(`#${outputId}`);
  const update = () => { output.value = `${input.value}${unit}`; output.textContent = output.value; renderPlanner(); };
  input.addEventListener('input', update);
  update();
});
$('#add-compare').addEventListener('click', addCompareCity);
$('#compare-search').addEventListener('keydown', (event) => { if (event.key === 'Enter') addCompareCity(); });
$('#compare-cities').addEventListener('click', (event) => {
  const button = event.target.closest('[data-remove-compare]');
  if (button) { compareLocations.delete(button.dataset.removeCompare); renderCompare(); }
});
$('#activity-suggestion').addEventListener('click', (event) => {
  if (event.target.closest('.suggestion-dismiss')) { dismissedSuggestion = true; $('#activity-suggestion').hidden = true; }
});
document.querySelectorAll('.nav-link').forEach((link) => link.addEventListener('click', () => {
  document.querySelectorAll('.nav-link').forEach((item) => item.classList.toggle('active', item === link));
}));
if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (window.__meteomtaaWorkerRefresh) return;
    window.__meteomtaaWorkerRefresh = true;
    location.reload();
  });
  window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch((error) => console.info('Offline app shell is unavailable.', error)));
}
window.addEventListener('offline', () => setDataStatus('Offline · trying saved forecast', 'stale'));
window.addEventListener('online', () => { if (selectedLocation) loadForecast(selectedLocation); });

updateToday();
$('#rain-limit-value').textContent = `${$('#rain-limit').value}%`;
$('#wind-limit-value').textContent = `${$('#wind-limit').value} km/h`;
$('#heat-limit-value').textContent = `${$('#heat-limit').value}°C`;
resultLocations = [];
renderPlanner();
loadInitialWeather();
