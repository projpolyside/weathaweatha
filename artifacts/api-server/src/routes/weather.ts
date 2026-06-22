import { Router } from "express";

const WEATHER_API_KEY = "26f52f5124764170b83110956262206";
const BASE_URL = "https://api.weatherapi.com/v1";

const router = Router();

router.get("/weather", async (req, res) => {
  const city = req.query.city as string | undefined;

  if (!city || city.trim() === "") {
    res.status(400).json({ error: "Missing required query parameter: city" });
    return;
  }

  const url = `${BASE_URL}/forecast.json?key=${WEATHER_API_KEY}&q=${encodeURIComponent(city.trim())}&days=7&aqi=yes&alerts=no`;

  try {
    const upstream = await fetch(url);
    const body = await upstream.json();

    if (!upstream.ok) {
      res.status(upstream.status).json(body);
      return;
    }

    res.json(body);
  } catch (err) {
    req.log.error({ err }, "Weather API proxy error");
    res.status(502).json({ error: "Failed to reach weather service. Please try again." });
  }
});

export default router;
