import maplibregl from "maplibre-gl";
import { MusicBrainzApi } from "musicbrainz-api";
//import MaplibreGeocoder from "@maplibre/maplibre-gl-geocoder";
import "@maplibre/maplibre-gl-geocoder/dist/maplibre-gl-geocoder.css";
import "maplibre-gl/dist/maplibre-gl.css";

const origin = document.getElementById("origin");
const artistList = document.getElementById("artists");
//const searchOptions = document.getElementById("select-search-options");
const styles = {
  dark: "https://tiles.openfreemap.org/styles/dark",
};

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

map.on("mousemove", (e) => {
  try {
    document.getElementById("info").innerHTML =
      `${JSON.stringify(e.point)}<br />${JSON.stringify(e.lngLat.wrap())}`;
  } catch (error) {
    console.error("Error getting coordinates under mouse cursor: ", error);
  }
});

map.on("click", async (e) => {
  console.log(e.lngLat.lng, e.lngLat.lat);
  clearResult();
  const location = await getLocationFromCoords(e.lngLat.lng, e.lngLat.lat);
  const artists = await getArtistsFromArea(location.mbid);
  console.log(artists);
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
    clearResult();
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
                           wikibase:radius "10";
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

function clearResult() {
  origin.innerHTML = "";
  origin.setAttribute("style", "display: none;");
  artistList.innerHTML = "";
  artistList.setAttribute("style", "display: none;");
}
