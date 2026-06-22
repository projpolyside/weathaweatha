/* ─────────────────────────────────────────────
   WeatherWise — script.js
   Vanilla JavaScript · WeatherAPI.com
───────────────────────────────────────────── */

const API_BASE = "/api";

/* ── Unit state ── */
let unit = "F"; // "F" or "C"
let lastWeatherData = null;

function toC(f) { return (f - 32) * 5 / 9; }
function fmtDeg(f) {
  return unit === "F"
    ? Math.round(f) + "°F"
    : Math.round(toC(f)) + "°C";
}

/* ── DOM refs ── */
const searchForm = document.getElementById("searchForm");
const cityInput = document.getElementById("cityInput");
const searchError = document.getElementById("searchError");
const loadingState = document.getElementById("loadingState");
const resultsSection = document.getElementById("resultsSection");
const landingHints = document.getElementById("landingHints");
const footerYear = document.getElementById("footerYear");

/* Set footer year */
if (footerYear) footerYear.textContent = new Date().getFullYear();

/* ── Utility helpers ── */
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * clamp(t, 0, 1);

function scoreColor(score) {
  if (score >= 70) return "high";
  if (score >= 40) return "mid";
  return "low";
}


/* ── Scoring algorithms ── */

/**
 * Running Score (0–100)
 * Ideal: 50–65°F, humidity 40–60%, UV <3, AQI <50, no rain
 */
function calcRunningScore(d) {
  const f = d.current.temp_f;
  const hum = d.current.humidity;
  const uv = d.current.uv;
  const aqi = d.current.air_quality?.["us-epa-index"] ?? 1;
  const rain = d.forecast.forecastday[0].day.daily_chance_of_rain;

  let s = 100;
  // Temperature penalty
  if (f < 32 || f > 95) s -= 50;
  else if (f < 45 || f > 85) s -= 25;
  else if (f < 50 || f > 75) s -= 10;
  // Humidity
  if (hum > 85) s -= 25;
  else if (hum > 70) s -= 12;
  else if (hum > 60) s -= 5;
  // UV
  if (uv > 8) s -= 20;
  else if (uv > 5) s -= 10;
  // AQI (1=Good…6=Hazardous)
  if (aqi >= 5) s -= 30;
  else if (aqi >= 4) s -= 18;
  else if (aqi >= 3) s -= 8;
  // Rain chance
  s -= rain * 0.4;

  return clamp(Math.round(s), 0, 100);
}

/**
 * Laundry Score (0–100)
 * Ideal: low humidity, good wind, sunny, no rain
 */
function calcLaundryScore(d) {
  const hum = d.current.humidity;
  const wind = d.current.wind_mph;
  const rain = d.forecast.forecastday[0].day.daily_chance_of_rain;
  const cloud = d.current.cloud;

  let s = 100;
  if (hum > 85) s -= 40;
  else if (hum > 70) s -= 20;
  else if (hum > 55) s -= 8;

  // Wind helps drying (up to 15 mph ideal)
  if (wind < 3) s -= 15;
  else if (wind > 30) s -= 20; // too strong

  // Rain is a big killer
  s -= rain * 0.7;

  // Cloud cover
  if (cloud > 80) s -= 15;
  else if (cloud > 60) s -= 7;

  return clamp(Math.round(s), 0, 100);
}

/**
 * Hair Frizz Risk
 * Driven primarily by humidity
 */
function calcFrizzRisk(d) {
  const hum = d.current.humidity;
  if (hum >= 75) return { level: "High", cls: "high", score: 100 };
  if (hum >= 55) return { level: "Moderate", cls: "med", score: 55 };
  return { level: "Low", cls: "low", score: 20 };
}

/**
 * Outdoor Activity Score (0–100)
 */
function calcOutdoorScore(d) {
  const f = d.current.temp_f;
  const uv = d.current.uv;
  const aqi = d.current.air_quality?.["us-epa-index"] ?? 1;
  const rain = d.forecast.forecastday[0].day.daily_chance_of_rain;
  const wind = d.current.wind_mph;

  let s = 100;
  if (f < 35 || f > 100) s -= 45;
  else if (f < 45 || f > 90) s -= 20;
  else if (f < 55 || f > 85) s -= 8;

  if (uv > 10) s -= 25;
  else if (uv > 7) s -= 12;

  if (aqi >= 5) s -= 30;
  else if (aqi >= 4) s -= 15;
  else if (aqi >= 3) s -= 5;

  s -= rain * 0.5;

  if (wind > 30) s -= 20;
  else if (wind > 20) s -= 8;

  return clamp(Math.round(s), 0, 100);
}

/**
 * Sleep Comfort Score (0–100)
 * Based on tonight's low temp and humidity
 */
function calcSleepScore(d) {
  const lowF = d.forecast.forecastday[0].day.mintemp_f;
  const hum = d.current.humidity;

  let s = 100;
  // Ideal sleep temp: 60–67°F
  if (lowF < 50 || lowF > 80) s -= 40;
  else if (lowF < 55 || lowF > 75) s -= 18;
  else if (lowF < 58 || lowF > 70) s -= 6;

  if (hum > 80) s -= 25;
  else if (hum > 65) s -= 10;

  return clamp(Math.round(s), 0, 100);
}

/**
 * Bike Ride Score (0–100)
 */
function calcBikeScore(d) {
  const f = d.current.temp_f;
  const wind = d.current.wind_mph;
  const rain = d.forecast.forecastday[0].day.daily_chance_of_rain;
  const uv = d.current.uv;

  let s = 100;
  if (f < 35 || f > 95) s -= 45;
  else if (f < 45 || f > 85) s -= 20;
  else if (f < 50 || f > 80) s -= 8;

  if (wind > 25) s -= 35;
  else if (wind > 15) s -= 15;
  else if (wind > 10) s -= 5;

  s -= rain * 0.65;

  if (uv > 9) s -= 15;
  else if (uv > 6) s -= 6;

  return clamp(Math.round(s), 0, 100);
}

/* ── AQI label ── */
function aqiLabel(idx) {
  const labels = [
    "—",
    "Good",
    "Moderate",
    "Unhealthy for Sensitive",
    "Unhealthy",
    "Very Unhealthy",
    "Hazardous",
  ];
  return labels[clamp(idx, 0, 6)] ?? "—";
}

/* ── Weather icon (WeatherAPI returns icon URLs) ── */
function weatherIcon(iconUrl) {
  if (!iconUrl) return "🌤️";
  const url = iconUrl.startsWith("//") ? "https:" + iconUrl : iconUrl;
  return `<img src="${url}" alt="weather icon" loading="lazy" />`;
}

/* ── Day-of-week ── */
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function dayName(dateStr, isToday) {
  if (isToday) return "Today";
  const d = new Date(dateStr + "T12:00:00");
  return DAYS[d.getDay()];
}

/* ── Generate narrative summary ── */
function buildSummary(d, scores) {
  const f = d.current.temp_f;
  const hum = d.current.humidity;
  const cond = d.current.condition.text;
  const rain = d.forecast.forecastday[0].day.daily_chance_of_rain;
  const sunset = d.forecast.forecastday[0].astro.sunset;
  const aqi = d.current.air_quality?.["us-epa-index"] ?? 1;

  // Temp description
  let tempDesc = "comfortable";
  if (f >= 95) tempDesc = "extremely hot";
  else if (f >= 85) tempDesc = "hot and muggy";
  else if (f >= 75) tempDesc = "warm";
  else if (f >= 65) tempDesc = "pleasant";
  else if (f >= 50) tempDesc = "cool";
  else if (f >= 35) tempDesc = "cold";
  else tempDesc = "very cold";

  // Humidity description
  let humDesc = "";
  if (hum >= 75) humDesc = "and humid";
  else if (hum <= 30) humDesc = "and dry";

  let intro = `Today is ${tempDesc}${humDesc ? " " + humDesc : ""}`;
  if (cond) intro += ` with ${cond.toLowerCase()}`;
  intro += ".";

  const bullets = [];

  // Running
  if (scores.running >= 70)
    bullets.push("Great day for a run — conditions are ideal.");
  else if (scores.running >= 40)
    bullets.push("Running is possible but not ideal — stay hydrated.");
  else bullets.push("Skip outdoor running today — conditions are poor.");

  // Laundry
  if (scores.laundry >= 70)
    bullets.push("Clothes will dry well outside — good laundry day.");
  else if (scores.laundry >= 40)
    bullets.push("Laundry may take longer — check rain before hanging.");
  else bullets.push("Avoid outdoor drying — rain or high humidity today.");

  // Frizz
  if (scores.frizz.level === "High")
    bullets.push("High frizz risk — consider anti-humidity hair products.");
  else if (scores.frizz.level === "Moderate")
    bullets.push("Moderate frizz risk — hair may need extra attention.");

  // Outdoor
  if (scores.outdoor >= 70)
    bullets.push("Outdoor plans look great — enjoy the day.");
  else if (scores.outdoor >= 40)
    bullets.push("Outdoor activities are manageable with precautions.");
  else
    bullets.push("Consider rescheduling outdoor plans — not ideal conditions.");

  // Bike
  if (scores.bike >= 70)
    bullets.push("Excellent day to ride — grab your bike.");
  else if (scores.bike < 40)
    bullets.push("Biking not recommended today due to wind or rain.");

  // Sleep
  if (scores.sleep >= 70)
    bullets.push("Tonight should be comfortable for sleep.");
  else if (scores.sleep < 40)
    bullets.push("Sleep comfort may be poor — consider AC or extra blankets.");

  // AQI
  if (aqi >= 4)
    bullets.push("Air quality is poor — limit prolonged outdoor exposure.");

  // Sunset tip
  if (scores.running < 60 && scores.outdoor < 60) {
    bullets.push(`Outdoor activities may be more pleasant after ${sunset}.`);
  }

  // Rain tip
  if (rain >= 60) bullets.push(`${rain}% chance of rain — carry an umbrella.`);

  return { intro, bullets };
}

/* ── Render helpers ── */

function renderStatGrid(d) {
  const grid = document.getElementById("statGrid");
  const aqi = d.current.air_quality?.["us-epa-index"] ?? null;

  const stats = [
    {
      label: "Feels Like",
      value: fmtDeg(d.current.feelslike_f),
      desc:
        d.current.temp_f > d.current.feelslike_f
          ? "Cooler than actual"
          : "Warmer than actual",
    },
    {
      label: "Humidity",
      value: d.current.humidity + "%",
      desc: d.current.humidity > 65 ? "High — frizz risk" : "Comfortable",
    },
    {
      label: "UV Index",
      value: d.current.uv,
      desc:
        d.current.uv >= 8
          ? "Very high — wear SPF"
          : d.current.uv >= 6
            ? "High"
            : "Moderate or lower",
    },
    {
      label: "Wind",
      value: Math.round(d.current.wind_mph) + " mph",
      desc: d.current.wind_dir,
    },
    {
      label: "AQI",
      value: aqi ? aqiLabel(aqi) : "N/A",
      desc: aqi ? `Index ${aqi}/6` : "",
    },
    {
      label: "Rain Chance",
      value: d.forecast.forecastday[0].day.daily_chance_of_rain + "%",
      desc: "Today's probability",
    },
    {
      label: "Sunrise",
      value: d.forecast.forecastday[0].astro.sunrise,
      desc: "Local time",
    },
    {
      label: "Sunset",
      value: d.forecast.forecastday[0].astro.sunset,
      desc: "Local time",
    },
  ];

  grid.innerHTML = stats
    .map(
      (st) => `
    <div class="stat-pill" role="listitem">
      <span class="stat-label">${st.label}</span>
      <span class="stat-value">${st.value}</span>
      ${st.desc ? `<span class="stat-desc">${st.desc}</span>` : ""}
    </div>
  `,
    )
    .join("");
}

function renderCani(scores) {
  const grid = document.getElementById("caniGrid");

  const items = [
    {
      label: "Run Today",
      icon: "🏃",
      ok: scores.running >= 60 ? "yes" : scores.running >= 35 ? "warn" : "no",
      reason:
        scores.running >= 60
          ? "Conditions are good for running"
          : scores.running >= 35
            ? "Manageable with precautions"
            : "Not a great day to run",
    },
    {
      label: "Ride A Bike",
      icon: "🚴",
      ok: scores.bike >= 60 ? "yes" : scores.bike >= 35 ? "warn" : "no",
      reason:
        scores.bike >= 60
          ? "Wind and temps are bike-friendly"
          : scores.bike >= 35
            ? "Possible but take care"
            : "Wind or rain makes biking risky",
    },
    {
      label: "Dry Clothes Outside",
      icon: "👗",
      ok: scores.laundry >= 60 ? "yes" : scores.laundry >= 35 ? "warn" : "no",
      reason:
        scores.laundry >= 60
          ? "Low humidity, good wind"
          : scores.laundry >= 35
            ? "May take longer than usual"
            : "Rain or humidity — use a dryer",
    },
    {
      label: "Avoid Hair Frizz",
      icon: "💇",
      ok:
        scores.frizz.level === "Low"
          ? "yes"
          : scores.frizz.level === "Moderate"
            ? "warn"
            : "no",
      reason:
        scores.frizz.level === "Low"
          ? "Low humidity — frizz is unlikely"
          : scores.frizz.level === "Moderate"
            ? "Some frizz possible"
            : "High humidity — frizz is very likely",
    },
    {
      label: "Go Outside",
      icon: "🌿",
      ok: scores.outdoor >= 60 ? "yes" : scores.outdoor >= 35 ? "warn" : "no",
      reason:
        scores.outdoor >= 60
          ? "Great day to be outside"
          : scores.outdoor >= 35
            ? "Okay but be mindful of UV/AQI"
            : "Conditions are not ideal outdoors",
    },
    {
      label: "Sleep Well Tonight",
      icon: "😴",
      ok: scores.sleep >= 60 ? "yes" : scores.sleep >= 35 ? "warn" : "no",
      reason:
        scores.sleep >= 60
          ? "Comfortable sleeping temperature"
          : scores.sleep >= 35
            ? "Slightly warm or cool tonight"
            : "Uncomfortable — adjust accordingly",
    },
  ];

  grid.innerHTML = items
    .map((it) => {
      const symbol = it.ok === "yes" ? "✓" : it.ok === "warn" ? "~" : "✗";
      return `
      <div class="cani-card" role="listitem">
        <div class="cani-badge cani-badge--${it.ok}" aria-hidden="true">${symbol}</div>
        <div>
          <div class="cani-label">${it.icon} ${it.label}</div>
          <div class="cani-reason">${it.reason}</div>
        </div>
      </div>
    `;
    })
    .join("");
}

function renderScoreCards(scores) {
  const grid = document.getElementById("scoresGrid");

  const cards = [
    {
      emoji: "🏃",
      name: "Running Score",
      sub: "How good today is for a run",
      score: scores.running,
      verdict:
        scores.running >= 70
          ? "<strong>Excellent!</strong> Ideal conditions for running outside."
          : scores.running >= 50
            ? "<strong>Good.</strong> Acceptable — stay hydrated and use SPF."
            : scores.running >= 30
              ? "<strong>Marginal.</strong> Try early morning or after sunset."
              : "<strong>Poor.</strong> Best to skip or run indoors today.",
    },
    {
      emoji: "👗",
      name: "Laundry Score",
      sub: "Clothes drying outdoors",
      score: scores.laundry,
      verdict:
        scores.laundry >= 70
          ? "<strong>Perfect!</strong> Clothes will dry fast in this weather."
          : scores.laundry >= 50
            ? "<strong>Good.</strong> Should dry — check rain forecast first."
            : scores.laundry >= 30
              ? "<strong>Slow drying.</strong> High humidity is a factor."
              : "<strong>Use a dryer.</strong> Rain or humidity will keep clothes damp.",
    },
    {
      emoji: "🌿",
      name: "Outdoor Activity",
      sub: "General outdoor suitability",
      score: scores.outdoor,
      verdict:
        scores.outdoor >= 70
          ? "<strong>Great day outside!</strong> UV and AQI are in good range."
          : scores.outdoor >= 50
            ? "<strong>Manageable.</strong> Apply sunscreen and stay aware."
            : scores.outdoor >= 30
              ? "<strong>Caution.</strong> AQI or UV may be elevated."
              : "<strong>Stay indoors</strong> if possible — conditions are unfavorable.",
    },
    {
      emoji: "😴",
      name: "Sleep Comfort",
      sub: "Tonight's sleep comfort",
      score: scores.sleep,
      verdict:
        scores.sleep >= 70
          ? "<strong>Great night ahead!</strong> Comfortable temperature expected."
          : scores.sleep >= 50
            ? "<strong>Decent.</strong> Light blanket should do it."
            : scores.sleep >= 30
              ? "<strong>Slightly off.</strong> May be too warm or cool."
              : "<strong>Uncomfortable.</strong> Use AC or extra warmth tonight.",
    },
    {
      emoji: "🚴",
      name: "Bike Ride Score",
      sub: "Cycling suitability",
      score: scores.bike,
      verdict:
        scores.bike >= 70
          ? "<strong>Let's ride!</strong> Wind and temp are bike-friendly."
          : scores.bike >= 50
            ? "<strong>Rideable.</strong> Watch for wind gusts."
            : scores.bike >= 30
              ? "<strong>Tough.</strong> High wind or rain makes it harder."
              : "<strong>Skip it.</strong> Conditions are unsafe for cycling.",
    },
  ];

  grid.innerHTML = cards
    .map((c) => {
      const col = scoreColor(c.score);
      return `
      <div class="score-card" role="listitem">
        <div class="score-header">
          <div class="score-meta">
            <div class="score-emoji" aria-hidden="true">${c.emoji}</div>
            <div>
              <div class="score-name">${c.name}</div>
              <div class="score-sub">${c.sub}</div>
            </div>
          </div>
          <div class="score-number score-number--${col}" aria-label="${c.score} out of 100">${c.score}<span style="font-size:.9rem;opacity:.5">/100</span></div>
        </div>
        <div class="score-bar-track" role="progressbar" aria-valuenow="${c.score}" aria-valuemin="0" aria-valuemax="100">
          <div class="score-bar-fill score-bar-fill--${col}" style="width:${c.score}%"></div>
        </div>
        <div class="score-verdict">${c.verdict}</div>
      </div>
    `;
    })
    .join("");

  /* Hair frizz — separate wide card */
  const fr = scores.frizz;
  const frizzCard = `
    <div class="score-card" role="listitem" style="grid-column: 1 / -1">
      <div class="score-header">
        <div class="score-meta">
          <div class="score-emoji" aria-hidden="true">💇</div>
          <div>
            <div class="score-name">Hair Frizz Risk</div>
            <div class="score-sub">Based on relative humidity</div>
          </div>
        </div>
        <span class="frizz-badge frizz-badge--${fr.cls}">${fr.level} Risk</span>
      </div>
      <div class="score-bar-track" role="progressbar" aria-valuenow="${fr.score}" aria-valuemin="0" aria-valuemax="100">
        <div class="score-bar-fill score-bar-fill--${fr.cls === "high" ? "low" : fr.cls === "med" ? "mid" : "high"}" style="width:${fr.score}%"></div>
      </div>
      <div class="score-verdict">
        ${
          fr.level === "Low"
            ? "<strong>Low risk.</strong> Humidity is comfortable — your hair should behave today."
            : fr.level === "Moderate"
              ? "<strong>Moderate risk.</strong> Some frizz likely — consider a light serum."
              : "<strong>High risk.</strong> Humidity is elevated — anti-humidity products recommended."
        }
      </div>
    </div>
  `;

  grid.innerHTML += frizzCard;
}

function renderSummary(d, scores) {
  const { intro, bullets } = buildSummary(d, scores);
  document.getElementById("summaryText").textContent = intro;
  document.getElementById("summaryBullets").innerHTML = bullets
    .map((b) => `<li>${b}</li>`)
    .join("");
}

function renderForecast(d) {
  const grid = document.getElementById("forecastGrid");
  const days = d.forecast.forecastday;

  grid.innerHTML = days
    .map(
      (day, i) => `
    <div class="forecast-day${i === 0 ? " today" : ""}" role="listitem">
      <div class="fd-weekday">${dayName(day.date, i === 0)}</div>
      <div class="fd-icon">${weatherIcon(day.day.condition.icon)}</div>
      <div class="fd-high">${unit === "F" ? Math.round(day.day.maxtemp_f) : Math.round(toC(day.day.maxtemp_f))}°</div>
      <div class="fd-low">${unit === "F" ? Math.round(day.day.mintemp_f) : Math.round(toC(day.day.mintemp_f))}°</div>
      ${day.day.daily_chance_of_rain > 10 ? `<div class="fd-rain">💧 ${day.day.daily_chance_of_rain}%</div>` : ""}
    </div>
  `,
    )
    .join("");
}

function renderOverview(d) {
  document.getElementById("locationName").textContent =
    `${d.location.name}, ${d.location.country}`;
  document.getElementById("localTime").textContent =
    d.location.localtime.split(" ")[1];
  const rawTemp = unit === "F" ? d.current.temp_f : toC(d.current.temp_f);
  document.getElementById("tempValue").textContent = Math.round(rawTemp);
  document.getElementById("tempUnit").textContent = unit === "F" ? "°F" : "°C";
  document.getElementById("weatherCondition").textContent =
    d.current.condition.text;
  document.getElementById("feelsLike").textContent =
    `Feels like ${fmtDeg(d.current.feelslike_f)}`;
  document.getElementById("weatherIconWrap").innerHTML = weatherIcon(
    d.current.condition.icon,
  );
  const toggleLabel = document.getElementById("unitToggleLabel");
  if (toggleLabel) toggleLabel.textContent = unit === "F" ? "Switch to °C" : "Switch to °F";
}

/* ── API fetch ── */
async function fetchWeather(city) {
  const url = `${API_BASE}/weather?city=${encodeURIComponent(city)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Error ${res.status}`);
  }
  return res.json();
}

/* ── Main render ── */
async function loadWeather(city) {
  // Reset
  searchError.textContent = "";
  loadingState.hidden = false;
  resultsSection.hidden = true;
  landingHints.hidden = true;

  try {
    const data = await fetchWeather(city);
    lastWeatherData = data;

    /* Compute all scores */
    const scores = {
      running: calcRunningScore(data),
      laundry: calcLaundryScore(data),
      frizz: calcFrizzRisk(data),
      outdoor: calcOutdoorScore(data),
      sleep: calcSleepScore(data),
      bike: calcBikeScore(data),
    };

    /* Render sections */
    renderOverview(data);
    renderStatGrid(data);
    renderCani(scores);
    renderScoreCards(scores);
    renderSummary(data, scores);
    renderForecast(data);

    loadingState.hidden = true;
    resultsSection.hidden = false;
    landingHints.hidden = true;

    /* Smooth scroll to results */
    resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    loadingState.hidden = true;
    landingHints.hidden = false;
    resultsSection.hidden = true;

    let msg = err.message || "Unable to fetch weather. Please try again.";
    if (msg.toLowerCase().includes("no matching location")) {
      msg = "City not found — please check the spelling and try again.";
    }
    if (msg.toLowerCase().includes("api key")) {
      msg = "Invalid API key. Please add your WeatherAPI.com key to script.js.";
    }
    searchError.textContent = msg;
  }
}

/* ── Event listeners ── */
searchForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const city = cityInput.value.trim();
  if (!city) {
    searchError.textContent = "Please enter a city name.";
    cityInput.focus();
    return;
  }
  loadWeather(city);
});

document.querySelectorAll(".chip").forEach((btn) => {
  btn.addEventListener("click", () => {
    const city = btn.dataset.city;
    cityInput.value = city;
    loadWeather(city);
  });
});

/* Allow Enter key in the input */
cityInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    searchForm.dispatchEvent(new Event("submit"));
  }
});

/* ── Unit toggle ── */
document.getElementById("unitToggle").addEventListener("click", () => {
  if (!lastWeatherData) return;
  unit = unit === "F" ? "C" : "F";
  renderOverview(lastWeatherData);
  renderStatGrid(lastWeatherData);
  renderForecast(lastWeatherData);
});
