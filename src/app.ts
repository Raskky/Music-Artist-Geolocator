import maplibregl from "maplibre-gl";
import { MusicBrainzApi } from "musicbrainz-api";
import "maplibre-gl/dist/maplibre-gl.css";

interface Styles {
  [key: string]: string;
  dark: string;
  positron: string;
  bright: string;
  liberty: string;
}

interface LocationData {
  city: string;
  country: string;
  mbid: string | null;
}

interface Artist {
  name: string;
  [key: string]: any; // For additional properties from MusicBrainzApi
}

interface MapState {
  lng: number;
  lat: number;
  zoom: number;
}

interface WikidataResponse {
  results?: {
    bindings: Array<{
      cityLabel?: { value: string };
      countryLabel?: { value: string };
      mbid?: { value: string };
    }>;
  };
}

const styles: Styles = {
  dark: "https://tiles.openfreemap.org/styles/dark",
  positron: "https://tiles.openfreemap.org/styles/positron",
  bright: "https://tiles.openfreemap.org/styles/bright",
  liberty: "https://tiles.openfreemap.org/styles/liberty",
};

const origin = document.getElementById("origin") as HTMLElement;
const artistList = document.getElementById("artist-list") as HTMLElement;
const mapStyleSelector = document.getElementById(
  "map-style-selector",
) as HTMLSelectElement;

for (const style in styles) {
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

const marker = new maplibregl.Marker();
const popup = new maplibregl.Popup({
  closeOnClick: false,
  focusAfterOpen: true,
});

let saveMapStateTimeout: NodeJS.Timeout;

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") clearScreen();
});

mapStyleSelector.addEventListener("change", (e: Event) => {
  const target = e.target as HTMLSelectElement;
  const selectedStyle = target.value.toLowerCase();

  if (styles[selectedStyle]) {
    localStorage.setItem("mapStyle", selectedStyle);
  }
  // 0.5s transition effect
  const canvas = map.getCanvas();
  canvas.style.transition = "opacity 0.5s";
  canvas.style.opacity = "0";

  setTimeout(() => {
    map.setStyle(styles[selectedStyle]);
    map.once("styledata", () => {
      canvas.style.opacity = "1";
    });
  }, 500);
});

map.on("error", (e: { error: Error }) => {
  console.error("Map error: ", e.error);
});

map.on("load", loadMapState);
map.on("move", saveMapState);
map.on("zoom", saveMapState);

map.on("click", async (e: maplibregl.MapMouseEvent) => {
  clearScreen();
  try {
    console.log(map.getZoom());
    marker.setLngLat(e.lngLat).addTo(map);
    const location = await getLocationFromCoords(e.lngLat.lng, e.lngLat.lat);

    if (location.mbid) {
      const artists = await getArtistsFromArea(location.mbid);
      const randomArtists = artists ? getRandomArtists(artists, 10) : null;

      if (randomArtists && randomArtists.length > 0) {
        origin.innerHTML = `${location.city}, ${location.country}`;
        origin.style.display = "block";

        const p = document.createElement("p");
        p.id = "artist-list-info";
        artistList.style.display = "block";
        p.innerHTML = `<b>10 Artists from ${location.city}, ${location.country}</b>`;
        artistList.appendChild(p);

        randomArtists.forEach((a: Artist) => {
          const ul = document.createElement("ul");
          ul.innerHTML = a.name;
          artistList.appendChild(ul);
        });

        const artistElement = document.getElementById("artists");
        if (artistElement) {
          popup
            .setLngLat(e.lngLat)
            .setMaxWidth("none")
            .setOffset(45)
            .setHTML(artistElement.innerHTML)
            .addTo(map);

          popup.on("close", () => {
            clearScreen();
          });
        }
      } else {
        clearScreen();
      }
    } else {
      clearScreen();
    }
  } catch (error) {
    console.error("Error handling click:", error);
  }
});

// Preserve style between sessions
const savedStyle = localStorage.getItem("mapStyle");
if (savedStyle && styles[savedStyle]) {
  mapStyleSelector.value = savedStyle;
  map.setStyle(styles[savedStyle]);
}

async function getLocationFromCoords(
  lng: number,
  lat: number,
): Promise<LocationData> {
  let result = await tryQuery(lng, lat, 3);
  if (!result || !result.results || result.results.bindings.length === 0) {
    result = await tryQuery(lng, lat, 50);
  }
  console.log(result);
  const data = result?.results?.bindings[0];
  return {
    city: data?.cityLabel?.value || "Unknown",
    country: data?.countryLabel?.value || "Unknown",
    mbid: data?.mbid?.value || null,
  };
}

async function tryQuery(
  lng: number,
  lat: number,
  radius: number,
): Promise<WikidataResponse> {
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
             FILTER NOT EXISTS { ?city wdt:P31/wdt:P279* wd:Q3497294 }  # Exclude districts
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

async function getArtistsFromArea(areaMBID: string): Promise<Artist[] | null> {
  try {
    const response = await mbApi.browse("artist", {
      area: areaMBID,
      limit: 100,
    });
    return response.artists;
  } catch (error) {
    console.error("Error browsing artists from area:", error);
    return null;
  }
}

function getRandomArtists(artists: Artist[], n: number) {
  try {
    return [...artists].sort(() => Math.random() - 0.5).slice(0, n);
  } catch (error) {
    console.error("Couldn't get random artists:", error);
    return [];
  }
}

function clearScreen(): void {
  marker.remove();
  popup.remove();

  if (map.getLayer("maplibrelg-marker")) map.removeLayer("maplibregl-marker");
  if (map.getLayer("location-radius-outline"))
    map.removeLayer("location-radius-outline");
  if (map.getLayer("location-radius")) map.removeLayer("location-radius");
  if (map.getSource("location-radius")) map.removeSource("location-radius");

  origin.innerHTML = "";
  origin.style.display = "none";
  artistList.innerHTML = "";
  artistList.style.display = "none";
}

function saveMapState(): void {
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

function loadMapState(): void {
  const savedState = localStorage.getItem("mapState");
  if (savedState) {
    try {
      const { lng, lat, zoom } = JSON.parse(savedState) as MapState;
      map.jumpTo({ center: [lng, lat], zoom });
    } catch (error) {
      console.error("Failed to load saved map state:", error);
    }
  }
}
