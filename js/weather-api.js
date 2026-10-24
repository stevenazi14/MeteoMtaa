import { API_CONFIG } from './config.js';

async function fetchJson(url, { signal } = {}) {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(new DOMException('Request timed out', 'TimeoutError')), API_CONFIG.requestTimeoutMs);
  const abortFromCaller = () => timeoutController.abort(signal.reason || new DOMException('Request cancelled', 'AbortError'));
  if (signal?.aborted) abortFromCaller();
  else signal?.addEventListener('abort', abortFromCaller, { once: true });
  try {
    const response = await fetch(url, { signal: timeoutController.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) {
      const error = new Error(response.status === 429
        ? 'The weather service is busy right now. Wait a moment and try again.'
        : response.status >= 500
          ? 'The weather service is temporarily unavailable. Try again shortly.'
          : `Weather service returned ${response.status}.`);
      error.status = response.status;
      throw error;
    }
    const payload = await response.json();
    if (payload?.error) throw new Error(payload.reason || 'The weather service returned an error.');
    return payload;
  } catch (error) {
    if (timeoutController.signal.aborted && timeoutController.signal.reason?.name === 'TimeoutError') {
      throw new Error('The request took too long. Check your connection and try again.');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener('abort', abortFromCaller);
  }
}

export async function searchLocations(query, { signal } = {}) {
  const params = new URLSearchParams({ name: query, count: '5', language: API_CONFIG.language, format: 'json' });
  const payload = await fetchJson(`${API_CONFIG.geocodingUrl}?${params}`, { signal });
  if (payload.results !== undefined && !Array.isArray(payload.results)) throw new Error('The location search returned an unexpected response.');
  return (payload.results || []).map((place) => {
    if (!Number.isFinite(place.latitude) || !Number.isFinite(place.longitude) || !place.name) return null;
    return {
      id: place.id,
      name: place.name,
      admin1: place.admin1 || '',
      country: place.country || '',
      countryCode: place.country_code || '',
      latitude: place.latitude,
      longitude: place.longitude,
      timezone: place.timezone || 'auto',
    };
  }).filter(Boolean);
}

export async function getForecast(location, { signal } = {}) {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    current: API_CONFIG.currentVariables.join(','),
    hourly: API_CONFIG.hourlyVariables.join(','),
    daily: API_CONFIG.dailyVariables.join(','),
    temperature_unit: API_CONFIG.units.temperature,
    wind_speed_unit: API_CONFIG.units.wind,
    precipitation_unit: API_CONFIG.units.precipitation,
    timezone: location.timezone || 'auto',
    timeformat: 'unixtime',
    forecast_days: String(API_CONFIG.forecastDays),
  });
  const payload = await fetchJson(`${API_CONFIG.forecastUrl}?${params}`, { signal });
  const current = payload.current;
  const hourly = payload.hourly;
  const daily = payload.daily;
  if (!current || !Array.isArray(hourly?.time) || !Array.isArray(daily?.time) ||
      !Number.isFinite(current.temperature_2m) || hourly.time.length === 0 || daily.time.length === 0) {
    throw new Error('The forecast response is missing required weather fields.');
  }
  const hourlyRows = hourly.time.map((time, index) => ({
    time,
    temperature: hourly.temperature_2m?.[index] ?? null,
    humidity: hourly.relative_humidity_2m?.[index] ?? null,
    rainChance: hourly.precipitation_probability?.[index] ?? null,
    precipitation: hourly.precipitation?.[index] ?? null,
    code: hourly.weather_code?.[index] ?? null,
    wind: hourly.wind_speed_10m?.[index] ?? null,
    gust: hourly.wind_gusts_10m?.[index] ?? null,
  }));
  const dailyRows = daily.time.map((time, index) => ({
    time,
    code: daily.weather_code?.[index] ?? null,
    high: daily.temperature_2m_max?.[index] ?? null,
    low: daily.temperature_2m_min?.[index] ?? null,
    rainChance: daily.precipitation_probability_max?.[index] ?? null,
    precipitation: daily.precipitation_sum?.[index] ?? null,
    sunrise: daily.sunrise?.[index] ?? null,
    sunset: daily.sunset?.[index] ?? null,
  }));
  return {
    timezone: payload.timezone || location.timezone || 'UTC',
    current: {
      time: current.time,
      temperature: current.temperature_2m,
      feelsLike: current.apparent_temperature ?? current.temperature_2m,
      humidity: current.relative_humidity_2m ?? null,
      precipitation: current.precipitation ?? null,
      code: current.weather_code ?? null,
      wind: current.wind_speed_10m ?? null,
      windDirection: current.wind_direction_10m ?? null,
      isDay: current.is_day !== 0,
    },
    hourly: hourlyRows,
    daily: dailyRows,
  };
}
