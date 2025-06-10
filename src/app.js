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
    let locationToGeocode = "";
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
          locationToGeocode = `${mbApiResultCity}, ${mbApiResultCountry}`;
        } else locationToGeocode = mbApiResultCity;
        const origin = document.getElementById("origin");
        origin.setAttribute("style", "display: block;");
        origin.innerHTML = locationToGeocode;
      } catch (error) {
        console.error("Error parsing artist's properties\n", error);
      }
    }
    if (searchOptions.value === "area") {
      locationToGeocode = config.query;
    }

    try {
      const request = `https://nominatim.openstreetmap.org/search?q=${
        locationToGeocode
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
          properties: feature.properties,
          text: feature.properties.display_name,
          place_type: ["place"],
          center,
        };
        features.push(point);
      }
    } catch (e) {
      console.error(`Failed to forwardGeocode with error: ${e}`);
    }
    return {
      features,
    };
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
    const dataOnClick = await response.json();
    console.log(dataOnClick);

    if (
      dataOnClick.features &&
      dataOnClick.features.length > 0 &&
      (dataOnClick.features[0].properties.address.city ||
        dataOnClick.features[0].properties.address.town)
    ) {
      let city = "";
      if (dataOnClick.features[0].properties.address.city) {
        city = dataOnClick.features[0].properties.address.city;
      } else {
        city = dataOnClick.features[0].properties.address.town;
      }
      const countryCode =
        dataOnClick.features[0].properties.address.country_code.toUpperCase();
      console.log(city, countryCode);
      searchAndDisplayArtists(city, countryCode);
    }
  } catch (error) {
    console.error("Error reverse geocoding coordinates", error);
  }
});

async function searchAndDisplayArtists(city, countryCode) {
  const origin = document.getElementById("origin");
  const artistList = document.getElementById("artists");
  origin.innerHTML = "";
  artistList.innerHTML = "";
  try {
    const result = await mbApi.search("artist", {
      query: `beginarea:"${city}" AND country:${countryCode}`,
      limit: 100,
    });
    const artists = result.artists;
    console.log(artists);
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
    console.error("Error searching artists: ", error);
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
