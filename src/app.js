import maplibregl from "maplibre-gl";
import { MusicBrainzApi } from "musicbrainz-api";
import "@maplibre/maplibre-gl-geocoder/dist/maplibre-gl-geocoder.css";
import "maplibre-gl/dist/maplibre-gl.css";
import { circle } from "@turf/turf";

let saveMapStateTimeout;

const styles = {
  dark: "https://tiles.openfreemap.org/styles/dark",
  positron: "https://tiles.openfreemap.org/styles/positron",
  bright: "https://tiles.openfreemap.org/styles/bright",
  liberty: "https://tiles.openfreemap.org/styles/liberty",
};

const origin = document.getElementById("origin");
const artistList = document.getElementById("artists");

const mapStyleSelector = document.getElementById("map-style-selector");
for (let style in styles) {
  const option = document.createElement("option");
  option.value = style;
  option.innerHTML = style.charAt(0).toUpperCase() + style.slice(1);
  mapStyleSelector.appendChild(option);
}

const mbApi = new MusicBrainzApi({
  appName: "artist-map",
  appVersion: "0.0.1",
  appContactInfo: "alaxandergeraskov1@gmail.com",
});

const map = new maplibregl.Map({
  container: "map",
  style: "https://tiles.openfreemap.org/styles/dark",
  center: [0, 0],
  zoom: 6,
});

// Preserve style between sessions
const savedStyle = localStorage.getItem("mapStyle");
if (savedStyle && styles[savedStyle]) {
  mapStyleSelector.value = savedStyle;
  map.setStyle(styles[savedStyle]);
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") clearScreen();
});

mapStyleSelector.addEventListener("change", (e) => {
  const selectedStyle = e.target.value.toLowerCase();
  localStorage.setItem("mapStyle", selectedStyle);
  // 0.5s transition effect
  map.getCanvas().style.transition = "opacity 0.5s";
  map.getCanvas().style.opacity = "0";
  setTimeout(() => {
    map.setStyle(styles[selectedStyle]);
    map.once("styledata", () => {
      map.getCanvas().style.opacity = "1";
    });
  }, 500);
});

map.on("error", (e) => {
  console.error("Map error: ", e.error);
});

map.on("load", loadMapState);
map.on("move", saveMapState);
map.on("zoom", saveMapState);

map.on("mousemove", (e) => {
  try {
    document.getElementById("info").innerHTML =
      `${JSON.stringify(e.point)}<br />${JSON.stringify(e.lngLat.wrap())}`;
  } catch (error) {
    console.error("Error getting coordinates under mouse cursor:", error);
  }
});

map.on("click", async (e) => {
  try {
    console.log(map.getZoom());
    let radius = 1;
    clearScreen();
    drawCircle(radius, e.lngLat.lng, e.lngLat.lat);
    const location = await getLocationFromCoords(e.lngLat.lng, e.lngLat.lat);
    console.log(location);
    const artists = await getArtistsFromArea(location.mbid);
    const randomArtists = await getRandomArtists(artists, 10);

    if (randomArtists && randomArtists.length > 0) {
      origin.innerHTML = `${location.city}, ${location.country}`;
      origin.setAttribute("style", "display: block;");
      const p = document.createElement("p");
      artistList.setAttribute("style", "display: block;");
      p.innerHTML = `<b>10 Artists from ${location.city}, ${location.country}</b>`;
      artistList.appendChild(p);

      randomArtists.forEach((a) => {
        const ul = document.createElement("ul");
        ul.innerHTML = a.name;
        artistList.appendChild(ul);
      });
    } else {
      clearScreen();
    }
  } catch (error) {
    console.error("Error handling click:", error);
  }
});

async function getLocationFromCoords(lng, lat) {
  let result = await tryQuery(lng, lat, 3);
  if (!result || result.results.bindingslength === 0) {
    result = await tryQuery(lng, lat, 50);
  }
  const data = result?.results?.bindings[0];
  return {
    city: data?.cityLabel?.value || "Unknown",
    country: data?.countryLabel?.value || "Unknown",
    mbid: data?.mbid?.value || null,
  };
}

async function tryQuery(lng, lat, radius) {
  const sparql = `
     #pragma hint.timeout 3000
     SELECT ?city ?cityLabel ?country ?countryLabel ?mbid WHERE {
       SERVICE wikibase:around {
         ?city wdt:P625 ?coords .
         bd:serviceParam wikibase:center "POINT(${lng} ${lat})"^^geo:wktLiteral;
                        wikibase:radius "${radius}";
                        wikibase:timeout 2000.
       }

       # Strict city definition with priority system
       {
         # First priority: Major global cities
         VALUES ?majorCities { wd:Q60 wd:Q84 wd:Q90 }  # NYC, London, Paris
         ?city wdt:P31 ?majorCities .
       }
       UNION
       {
         # Second priority: Official city designation
         ?city wdt:P31 wd:Q515 .  # City proper
         FILTER NOT EXISTS { ?city wdt:P31/wdt:P279* wd:Q3497294 }  # Exclude districts
       }
       UNION
       {
         # Third priority: Large urban settlements
         ?city wdt:P31/wdt:P279* wd:Q486972 .  # Human settlement
         ?city wdt:P1082 ?pop .  # Population
         FILTER(?pop > 14000)  # Only larger populations
         FILTER NOT EXISTS { ?city wdt:P31/wdt:P279* wd:Q3497294 }  # Exclude districts
       }

       # Country information
       { ?city wdt:P17 ?country }
       UNION
       { ?city wdt:P131* ?country . ?country wdt:P31 wd:Q6256 }

       ?city wdt:P982 ?mbid .

       SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
     }
     LIMIT 1
   `;

  const response = await fetch(
    `https://query.wikidata.org/sparql?query=${encodeURIComponent(sparql)}&format=json`,
  );
  return await response.json();
}

async function getArtistsFromArea(areaMBID) {
  try {
    const response = await mbApi.browse("artist", {
      area: areaMBID,
      limit: 100,
    });
    const artists = response.artists;
    return artists;
  } catch (error) {
    console.error("Error browsing artists from area:", error);
    return null;
  }
}

function getRandomArtists(artists, n) {
  try {
    const randomArtists = artists
      .sort(() => Math.random() - Math.random())
      .slice(0, n);
    return randomArtists;
  } catch (error) {
    console.error("Couldn't get random artists:", error);
  }
}

function clearScreen() {
  if (map.getLayer("location-radius-outline"))
    map.removeLayer("location-radius-outline");
  if (map.getLayer("location-radius")) map.removeLayer("location-radius");
  if (map.getSource("location-radius")) map.removeSource("location-radius");
  origin.innerHTML = "";
  origin.setAttribute("style", "display: none;");
  artistList.innerHTML = "";
  artistList.setAttribute("style", "display: none;");
}

function drawCircle(radius, lng, lat) {
  clearScreen();
  let center = [lng, lat];
  let options = { steps: 64, units: "kilometers" };
  let result = circle(center, radius, options);

  // Add the circle as a GeoJSON source
  map.addSource("location-radius", { type: "geojson", data: result });

  // Add a fill layer with some transparency
  map.addLayer({
    id: "location-radius",
    type: "fill",
    source: "location-radius",
    paint: { "fill-color": "#8CCFFF", "fill-opacity": 0.5 },
  });

  // Add a line layer to draw the circle outline
  map.addLayer({
    id: "location-radius-outline",
    type: "line",
    source: "location-radius",
    paint: { "line-color": "#0094ff", "line-width": 3 },
  });
}

function saveMapState() {
  clearTimeout(saveMapStateTimeout);
  saveMapStateTimeout = setTimeout(() => {
    const center = map.getCenter();
    localStorage.setItem(
      "mapState",
      JSON.stringify({
        lng: center.lng,
        lat: center.lat,
        zoom: map.getZoom(),
      }),
    );
  }, 500);
}

function loadMapState() {
  const savedState = localStorage.getItem("mapState");
  if (savedState) {
    try {
      const { lng, lat, zoom } = JSON.parse(savedState);
      map.jumpTo({ center: [lng, lat], zoom });
    } catch (error) {
      console.error("Failed to load saved map state:", error);
    }
  }
}
