// Synthetic API responses shaped exactly like the real services.

const HOUR = 3600;

/** Open-Meteo /v1/forecast response with timeformat=unixtime. */
export function forecastJson({ now = Date.now(), timezone = 'Africa/Cairo', offset = 3 * HOUR, baseTemp = 24, rainSoon = false } = {}) {
  const nowS = Math.floor(now / 1000);
  // Local midnight (in the fixture's fixed offset) for "today".
  const midnight = Math.floor((nowS + offset) / 86400) * 86400 - offset;
  const days = 10;
  const hourly = { time: [], temperature_2m: [], apparent_temperature: [], precipitation_probability: [], precipitation: [], weather_code: [], is_day: [], wind_speed_10m: [], wind_direction_10m: [], relative_humidity_2m: [], uv_index: [] };
  for (let i = 0; i < days * 24; i++) {
    const t = midnight + i * HOUR;
    const hod = i % 24;
    hourly.time.push(t);
    hourly.temperature_2m.push(Number((baseTemp + 6 * Math.sin(((hod - 9) / 24) * 2 * Math.PI)).toFixed(1)));
    hourly.apparent_temperature.push(Number((baseTemp + 1 + 6 * Math.sin(((hod - 9) / 24) * 2 * Math.PI)).toFixed(1)));
    hourly.precipitation_probability.push(hod >= 15 && hod <= 18 ? 60 : 5);
    hourly.precipitation.push(hod >= 15 && hod <= 18 ? 1.2 : 0);
    hourly.weather_code.push(hod >= 15 && hod <= 18 ? 61 : 2);
    hourly.is_day.push(hod >= 6 && hod < 18 ? 1 : 0);
    hourly.wind_speed_10m.push(12);
    hourly.wind_direction_10m.push(315);
    hourly.relative_humidity_2m.push(55);
    hourly.uv_index.push(hod >= 6 && hod < 18 ? 5 : 0);
  }
  const daily = { time: [], weather_code: [], temperature_2m_max: [], temperature_2m_min: [], precipitation_probability_max: [], precipitation_sum: [], sunrise: [], sunset: [], uv_index_max: [], wind_speed_10m_max: [], wind_direction_10m_dominant: [] };
  for (let d = 0; d < days; d++) {
    const t = midnight + d * 86400;
    daily.time.push(t);
    daily.weather_code.push(d % 3 === 0 ? 61 : 2);
    daily.temperature_2m_max.push(baseTemp + 6 + (d % 3));
    daily.temperature_2m_min.push(baseTemp - 6 - (d % 2));
    daily.precipitation_probability_max.push(d % 3 === 0 ? 60 : 10);
    daily.precipitation_sum.push(d % 3 === 0 ? 4.8 : 0);
    daily.sunrise.push(t + 6 * HOUR);
    daily.sunset.push(t + 18 * HOUR);
    daily.uv_index_max.push(7);
    daily.wind_speed_10m_max.push(25);
    daily.wind_direction_10m_dominant.push(315);
  }
  const q = Math.floor(nowS / 900) * 900;
  const minutely = { time: [], precipitation: [] };
  for (let i = 0; i < 8; i++) {
    minutely.time.push(q + i * 900);
    minutely.precipitation.push(rainSoon && i >= 2 ? 0.6 : 0);
  }
  return {
    latitude: 30.04,
    longitude: 31.24,
    timezone,
    utc_offset_seconds: offset,
    current: {
      time: Math.floor(nowS / 900) * 900,
      interval: 900,
      temperature_2m: baseTemp,
      relative_humidity_2m: 55,
      apparent_temperature: baseTemp + 1,
      is_day: 1,
      precipitation: 0,
      weather_code: 2,
      cloud_cover: 40,
      pressure_msl: 1013.2,
      wind_speed_10m: 14.4,
      wind_direction_10m: 315,
      wind_gusts_10m: 30,
      dew_point_2m: 14.3,
      visibility: 24140,
      uv_index: 5.4,
    },
    hourly,
    daily,
    minutely_15: minutely,
  };
}

export const geocodingJson = {
  results: [
    { id: 360630, name: 'Cairo', latitude: 30.06263, longitude: 31.24967, country_code: 'EG', timezone: 'Africa/Cairo', country: 'Egypt', admin1: 'Cairo Governorate' },
    { id: 4945588, name: 'Cairo', latitude: 37.0053, longitude: -89.1765, country_code: 'US', timezone: 'America/Chicago', country: 'United States', admin1: 'Illinois', postcodes: ['62914'] },
  ],
};

export const airQualityJson = {
  current: {
    time: 1760425200,
    us_aqi: 87, european_aqi: 45,
    pm2_5: 28.1, pm10: 60.3, ozone: 80, nitrogen_dioxide: 20, sulphur_dioxide: 4, carbon_monoxide: 300,
    us_aqi_pm2_5: 87, us_aqi_pm10: 53, us_aqi_ozone: 40, us_aqi_nitrogen_dioxide: 18, us_aqi_sulphur_dioxide: 3, us_aqi_carbon_monoxide: 4,
    alder_pollen: null, birch_pollen: null, grass_pollen: 12.5, mugwort_pollen: 0, olive_pollen: 95, ragweed_pollen: null,
  },
};

export function nwsAlertsJson(now = Date.now()) {
  return {
    features: [
      { properties: { id: 'urn:a:1', event: 'Flood Watch', headline: 'Flood Watch until tonight', severity: 'Moderate', urgency: 'Expected', description: 'Heavy rain may cause flooding.', instruction: 'Avoid low-lying areas.', senderName: 'NWS Chicago', effective: new Date(now - 3600e3).toISOString(), expires: new Date(now + 6 * 3600e3).toISOString() } },
      { properties: { id: 'urn:a:2', event: 'Tornado Warning', headline: 'Tornado Warning', severity: 'Extreme', urgency: 'Immediate', description: 'Take shelter.', senderName: 'NWS Chicago', effective: new Date(now - 600e3).toISOString(), expires: new Date(now + 3600e3).toISOString() } },
      { properties: { id: 'urn:a:old', event: 'Heat Advisory', headline: 'Expired', severity: 'Minor', expires: new Date(now - 3600e3).toISOString() } },
    ],
  };
}
