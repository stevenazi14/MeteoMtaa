# MeteoMtaa API and release guide

## Do I need to add an API key?

No. The app is connected to Open-Meteo's public geocoding and forecast endpoints. They do not need a key for eligible non-commercial use. You do not need to create a developer account, paste a credential, or edit a secret file. `js/config.js` contains public endpoint URLs and weather-field names only.

The free service is limited by its current terms and intended for non-commercial use. Open-Meteo currently states limits of 10,000 calls per day, 5,000 per hour, and 600 per minute; shared-IP hosting may hit limits sooner. The app avoids unnecessary requests and caches a location's forecast on the user's device for up to 48 hours. If the product becomes commercial, use a suitable paid plan through a server-side proxy; never expose a paid key in frontend code.

## What happens when someone searches?

1. The browser sends the city text to Open-Meteo Geocoding (`https://geocoding-api.open-meteo.com/v1/search`).
2. If there are several matches, MeteoMtaa shows the matching city/region/country choices. The user picks the intended one.
3. MeteoMtaa sends the selected latitude and longitude to Open-Meteo Forecast (`https://api.open-meteo.com/v1/forecast`).
4. The response updates the current card, hourly strip, five-day list, planner, activity suggestion, and compare card. Forecast times are formatted in the location's timezone.
5. Successful forecasts are saved locally for offline fallback. A cached forecast is labeled with its retrieval time and a stale-data warning.

The Geocoding request asks for five results and English labels. Forecast requests ask for current temperature, apparent temperature, humidity, rain, weather code, wind and day/night status; hourly temperature, humidity, rain chance/amount, weather code, wind and gusts; and daily weather code, high/low temperatures, rain chance/amount, sunrise, and sunset. The API request and response mapping live in `js/weather-api.js` and settings live in `js/config.js`.

## Weather suggestions and recommendations

The Weather Window Planner evaluates the actual hourly forecast for rain chance, wind, and temperature, then ranks suitable periods for the chosen activity. The Forecast Change Lens compares current values with the next several returned hours. The “Mtaa moment” suggestion is selected from current forecast conditions—for example, cooler weather can suggest a warm café break; a high rain chance can suggest a covered stop. These are practical ideas, not safety guarantees.

## Test on your computer

Open PowerShell in the project folder and run:

```powershell
py -m http.server 8000
```

Open <http://localhost:8000>. Search a city such as `Nairobi`, `Mombasa`, `London`, or `Tokyo`. If the name has several matches, select the right country/region. Try Celsius/Fahrenheit, different planner activities and limits, a comparison city, and the saved-place control. Stop the server with Ctrl+C.

If weather cannot load, check that the computer is online and retry. After a successful load, turn off connectivity and reload/search a previously loaded place to see the labeled saved snapshot. A fresh geocoding search still requires a network connection unless that city's cached forecast is available.

## Free hosting: Render Static Site

1. Create a GitHub repository for this project and push the files. For a personal internship project, a public repository works with GitHub Free.
2. Sign in to Render and choose **New → Static Site**.
3. Connect GitHub, choose the MeteoMtaa repository and branch.
4. Leave **Build Command** empty. Set **Publish Directory** to `.` (the project root).
5. Create the static site. Render deploys it to an HTTPS `onrender.com` address and can redeploy after future pushes.
6. Open the published site, search multiple cities, exercise planner/comparison, and confirm the browser address uses HTTPS.

Render currently offers free static sites and HTTPS, subject to its included bandwidth/build allowances and current plan terms. A second option is GitHub Pages: push to a public repo, then open **Settings → Pages**, choose **Deploy from a branch**, select the branch and `/ (root)`, and save. Confirm the Pages URL publishes over HTTPS.

## Install on Android

1. Open the deployed HTTPS URL in Android Chrome.
2. Open Chrome's menu and choose **Install app** or **Add to Home screen** (wording varies by Android/Chrome version).
3. Confirm the MeteoMtaa name and icon. The app shell can open offline after it has been cached; getting fresh weather still needs internet.

This installs a Progressive Web App. It does not produce an APK or Play Store listing. Those require an additional Android packaging/signing phase.

## Attribution

The page credits and links Open-Meteo for weather data and GeoNames for location search data. Keep these credits when changing the footer or publishing.
