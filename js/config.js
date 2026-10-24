// Open-Meteo's public endpoints do not require a key for eligible non-commercial use.
// Do not put private credentials in this frontend file. A commercial Open-Meteo key,
// if ever needed, must be used by a server-side proxy and never shipped to browsers.
export const API_CONFIG = Object.freeze({
  geocodingUrl: 'https://geocoding-api.open-meteo.com/v1/search',
  forecastUrl: 'https://api.open-meteo.com/v1/forecast',
  requestTimeoutMs: 12_000,
  forecastDays: 5,
  language: 'en',
  units: Object.freeze({ temperature: 'celsius', wind: 'kmh', precipitation: 'mm' }),
  currentVariables: [
    'temperature_2m', 'relative_humidity_2m', 'apparent_temperature', 'is_day',
    'precipitation', 'weather_code', 'wind_speed_10m', 'wind_direction_10m',
  ],
  hourlyVariables: [
    'temperature_2m', 'relative_humidity_2m', 'precipitation_probability',
    'precipitation', 'weather_code', 'wind_speed_10m', 'wind_gusts_10m',
  ],
  dailyVariables: [
    'weather_code', 'temperature_2m_max', 'temperature_2m_min',
    'precipitation_probability_max', 'precipitation_sum', 'sunrise', 'sunset',
  ],
});
