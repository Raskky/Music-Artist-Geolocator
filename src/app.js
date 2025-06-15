import maplibregl from "maplibre-gl";
import { MusicBrainzApi } from "musicbrainz-api";
import "@maplibre/maplibre-gl-geocoder/dist/maplibre-gl-geocoder.css";
import "maplibre-gl/dist/maplibre-gl.css";
import { circle } from "@turf/turf";

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
  container: "map", // container id
  style: "https://tiles.openfreemap.org/styles/dark", // style URL
  center: [-123.4, 47.9], // starting position [lng, lat]
  zoom: 6, // starting zoom
});

mapStyleSelector.addEventListener("change", (e) => {
  console.log(e.target.value);
  const selectedStyle = e.target.value.toLowerCase();
  console.log(selectedStyle);
  map.setStyle(styles[selectedStyle]);
});

map.on("error", (e) => {
  console.error("Map error: ", e.error);
});

map.on("mousemove", (e) => {
  try {
    document.getElementById("info").innerHTML =
      `${JSON.stringify(e.point)}<br />${JSON.stringify(e.lngLat.wrap())}`;
  } catch (error) {
    console.error("Error getting coordinates under mouse cursor: ", error);
  }
});

map.on("click", async (e) => {
  try {
    console.log(map.getZoom());
    let radius = 1;
    clearScreen();
    drawCircle(radius, e.lngLat.lng, e.lngLat.lat);
    const location = await getLocationFromCoords(e.lngLat.lng, e.lngLat.lat);
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
    console.error("Error handling click: ", error);
  }
});

async function getLocationFromCoords(lng, lat) {
  try {
    const sparql = `
        #pragma hint.timeout 5000
        SELECT ?city ?cityLabel ?country ?countryLabel ?mbid WHERE {

          SERVICE wikibase:around {
            ?city wdt:P625 ?coords .
            bd:serviceParam wikibase:center "POINT(${lng} ${lat})"^^geo:wktLiteral;
                           wikibase:radius "5";
                           wikibase:timeout 3000.
          }

          # Entity type filters
          ?city wdt:P31/wdt:P279* wd:Q486972 .

          # Country lookup with minimal optional paths
          { ?city wdt:P17 ?country }
          UNION
          { ?city wdt:P131* ?country . ?country wdt:P31 wd:Q6256 }

          # Required MBID (remove if not always needed)
          ?city wdt:P982 ?mbid .

          # Labels last
          SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
        }
        LIMIT 1
      `;

    const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(sparql)}&format=json`;
    const response = await fetch(url);
    const data = await response.json();
    const result = data.results.bindings[0];

    return {
      city: result?.cityLabel?.value || "Unknown",
      country: result?.countryLabel?.value || "Unknown",
      mbid: result?.mbid?.value || null,
    };
  } catch (error) {
    console.log("Error reverse geocoding area: ", error);
    return null;
  }
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
    console.error("Error browsing artists from area: ", error);
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
    console.error("Couldn't get random artists", error);
  }
}

function clearScreen() {
  origin.innerHTML = "";
  origin.setAttribute("style", "display: none;");
  artistList.innerHTML = "";
  artistList.setAttribute("style", "display: none;");
}

function drawCircle(radius, lng, lat) {
  if (map.getLayer("location-radius-outline"))
    map.removeLayer("location-radius-outline");
  if (map.getLayer("location-radius")) map.removeLayer("location-radius");
  if (map.getSource("location-radius")) map.removeSource("location-radius");

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
