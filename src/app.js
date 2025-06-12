import maplibregl from "maplibre-gl";
import { MusicBrainzApi } from "musicbrainz-api";
import MaplibreGeocoder from "@maplibre/maplibre-gl-geocoder";
import "@maplibre/maplibre-gl-geocoder/dist/maplibre-gl-geocoder.css";
import "maplibre-gl/dist/maplibre-gl.css";

const mbApi = new MusicBrainzApi({
  appName: "artist-map",
  appVersion: "0.0.1",
  appContactInfo: "alaxandergeraskov1@gmail.com",
});

const map = new maplibregl.Map({
  container: "map", // container id
  style: "https://tiles.openfreemap.org/styles/dark", // style URL
  center: [-74, 41], // starting position [lng, lat]
  zoom: 6, // starting zoom
});

const geocoderApi = {
  forwardGeocode: async (config) => {
    let location = "";
    const features = [];
    const searchOptions = document.getElementById("select-search-options");
    if (searchOptions.value === "artist") {
      try {
        const mbApiResult = await mbApi.search("artist", {
          query: `${config.query}`,
        });
        const mbApiResultCity = mbApiResult.artists.find(
          (artist) => artist.name.toLowerCase() == config.query.toLowerCase(),
        )["begin-area"]["name"];
        const mbApiResultCountry = mbApiResult.artists.find(
          (artist) => artist.name.toLowerCase() == config.query.toLowerCase(),
        )["country"];
        if (typeof mbApiResultCountry !== "undefined") {
          location = `${mbApiResultCity}, ${mbApiResultCountry}`;
        } else location = mbApiResultCity;
        const origin = document.getElementById("origin");
        origin.setAttribute("style", "display: block;");
        origin.innerHTML = location;
      } catch (error) {
        console.error("Error parsing artist's properties\n", error);
      }
    }
    if (searchOptions.value === "area") {
      location = config.query;
      try {
        const request = `https://nominatim.openstreetmap.org/search?q=${
          location
        }&format=geojson&polygon_geojson=1&addressdetails=1`;
        const response = await fetch(request);
        const geojson = await response.json();
        for (const feature of geojson.features) {
          const center = [
            feature.bbox[0] + (feature.bbox[2] - feature.bbox[0]) / 2,
            feature.bbox[1] + (feature.bbox[3] - feature.bbox[1]) / 2,
          ];
          const point = {
            type: "Feature",
            geometry: {
              type: "Point",
              coordinates: center,
            },
            place_name: feature.properties.display_name,
            country_code: feature.properties.address.country_code,
            city: feature.properties.address.city,
            properties: feature.properties,
            text: feature.properties.display_name,
            place_type: ["place"],
            center,
          };
          features.push(point);
        }
        //console.log(features);
      } catch (e) {
        console.error(`Failed to forwardGeocode with error: ${e}`);
      }
      return {
        features,
      };
    }
  },
};

const geocoder = new MaplibreGeocoder(geocoderApi, {
  //showResultsWhileTyping: true,
  minLength: 3,
  maplibregl,
});

const geocoderContainer = document.getElementById("geocoder-container");
geocoderContainer.appendChild(geocoder.onAdd(map));
const artistOption = document.createElement("option");
artistOption.id = "artist-option";
artistOption.innerHTML = "artist";
const areaOption = document.createElement("option");
areaOption.id = "area-option";
areaOption.innerHTML = "area";
const selectSearchOptions = document.createElement("select");
selectSearchOptions.id = "select-search-options";
selectSearchOptions.options.add(artistOption);
selectSearchOptions.options.add(areaOption);
geocoderContainer.appendChild(selectSearchOptions);

geocoder.on("result", (e) => {
  clearResult();
  //console.log(e.result);
  searchAndDisplayArtists(e.result.city, e.result.country_code);
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
  clearResult();
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${e.lngLat.lat}&lon=${e.lngLat.lng}&format=geojson&polygon_geojson=1&addressdetails=1`,
    );
    const data = await response.json();
    if (data.features) {
      searchAndDisplayArtists(data.features[0]);
    }
  } catch (error) {
    console.error("Error reverse geocoding coordinates", error);
    return [];
  }
});

async function searchAndDisplayArtists(feature) {
  console.log(feature);
  const countryCode = feature.properties.address["country_code"].toUpperCase();
  let city = "";
  if (feature.properties.address.city) {
    city = feature.properties.address.city;
  } else city = feature.properties.address.town;
  const origin = document.getElementById("origin");
  const artistList = document.getElementById("artists");
  let areaOnClick = [];
  try {
    const area_response = await mbApi.search("area", {
      query: `iso:"${feature.properties.address["ISO3166-2-lvl4"]}" AND area:"${city}"`,
    });
    areaOnClick = area_response.areas[0];
  } catch (error) {
    console.error("Error fetching area: ", error);
    return [];
  }

  try {
    const artist_response = await mbApi.browse("artist", {
      area: areaOnClick.id,
      limit: 100,
    });
    const artists = artist_response.artists;
    //console.log(artist_response);
    const artistNames = artists.map((artist) => artist.name);
    const n = 10;
    const randomArtists = getRandomArtists(artistNames, n);

    if (randomArtists && randomArtists.length > 0) {
      origin.innerHTML = `${city}, ${countryCode}`;
      origin.setAttribute("style", "display: block;");
      const p = document.createElement("p");
      artistList.setAttribute("style", "display: block;");
      p.innerHTML = `<b>${n} Artists from ${city}, ${countryCode}</b>`;
      artistList.appendChild(p);

      randomArtists.forEach((a) => {
        const ul = document.createElement("ul");
        ul.innerHTML = a;
        artistList.appendChild(ul);
      });
    } else {
      clearResult();
    }
  } catch (error) {
    console.error("Error fetching artists: ", error);
    return [];
  }
}

function clearResult() {
  const origin = document.getElementById("origin");
  const artistList = document.getElementById("artists");
  origin.innerHTML = "";
  origin.setAttribute("style", "display: none;");
  artistList.innerHTML = "";
  artistList.setAttribute("style", "display: none;");
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
