# MeteoMtaa

Responsive, installable weather dashboard built with HTML, CSS, and vanilla JavaScript modules.

## Live weather

The app requests live city matches from Open-Meteo Geocoding and then fetches current, hourly, and five-day weather from Open-Meteo Forecast. The default view starts with live Nairobi weather. Search results can be selected when a city name matches multiple places. No API key is needed for eligible non-commercial use.

Forecasts are cached on the device for up to 48 hours. If a location cannot be refreshed, the app labels the saved forecast and retrieval time. It handles request timeouts, offline/network failures, empty searches, rate limits, and malformed responses.

## Weather features

- Current conditions, apparent temperature, humidity, hourly precipitation chance, wind, sunrise, and sunset.
- Next-hour conditions and five-day forecast formatted in the selected location's timezone.
- Weather Window Planner scores real hourly forecast values against activity, time, rain, wind, and temperature settings.
- Forecast Change Lens highlights temperature/rain changes and offers a weather-based activity idea, such as a warm café break during cool or wet conditions.
- Mtaa Compare loads live forecasts for up to three cities.
- Celsius/Fahrenheit display, saved locations, service-worker app-shell cache, responsive and keyboard-friendly controls.

Activity ideas are suggestions based on the returned forecast and are not guarantees about safety or conditions.

## Run locally

From the project root:

```powershell
py -m http.server 8000
```

Open <http://localhost:8000>. Stop the server with Ctrl+C. Localhost is treated as a secure context for service workers.

## Project files

- `index.html` — dashboard and accessible controls.
- `styles.css` — responsive layout, visual system, and reduced-motion support.
- `js/main.js` — state, rendering, caching, planner, comparisons, and interactions.
- `js/weather-api.js` — Open-Meteo geocoding/forecast requests and response validation.
- `js/config.js` — endpoint, units, variables, and timeout settings. There is no public API key to enter.
- `manifest.webmanifest`, `service-worker.js`, `icons/icon.svg` — PWA install metadata and offline app shell.
- `docs/API_AND_HOSTING.md` — data flow, local review, free hosting, and Android install guide.

## Hosting and Android

This is a static project with no build command. Publish the repository root to a static host that serves HTTPS. After hosting, Android users can install the PWA from Chrome using **Install app** or **Add to Home screen**. This is an installable web app, not an APK.

Open-Meteo weather data is licensed under CC BY 4.0 and requires attribution. City name data is based on GeoNames. The footer links to both providers.
