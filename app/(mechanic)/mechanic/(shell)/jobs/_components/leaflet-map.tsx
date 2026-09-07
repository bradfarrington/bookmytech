"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { LatLng } from "@/lib/geo/postcodes";

// Live OpenStreetMap service-area map (Leaflet + OSM tiles — free, no key, no
// billing). Only ever rendered client-side: `area-map.tsx` loads it through
// next/dynamic with ssr:false because Leaflet touches `window` on import.
//
// The radius circle is drawn in real metres so it stays honest at any zoom,
// and the map re-fits to it whenever the radius changes — the availability
// page's slider updates the preview live.

export interface LeafletPin {
  id: string;
  lat: number;
  lng: number;
  label: string;
}

export interface LeafletAreaMapProps {
  base: LatLng;
  radiusMiles: number;
  pins: LeafletPin[];
}

const METRES_PER_MILE = 1609.344;
// Design tokens (docs/03-design-system.md) — Leaflet paints these on canvas /
// SVG so they can't come from Tailwind classes.
const BRAND_BLUE = "#2563eb";
const SUCCESS_GREEN = "#22c55e";

// OSM's tile usage policy requires attribution; Leaflet's control shows it.
const OSM_TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

export default function LeafletAreaMap({ base, radiusMiles, pins }: LeafletAreaMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const baseMarkerRef = useRef<L.CircleMarker | null>(null);
  const pinsLayerRef = useRef<L.LayerGroup | null>(null);

  // Create the map once; tear it down with the component.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;

    const map = L.map(el, {
      // Wheel-zoom hijacks page scrolling on a dashboard; buttons + pinch still work.
      scrollWheelZoom: false,
      attributionControl: true,
    });
    L.tileLayer(OSM_TILES, { maxZoom: 19, attribution: OSM_ATTRIBUTION }).addTo(map);
    mapRef.current = map;

    // The card may finish laying out a frame after mount; make sure tiles fill it.
    const raf = requestAnimationFrame(() => map.invalidateSize());

    return () => {
      cancelAnimationFrame(raf);
      map.remove();
      mapRef.current = null;
      circleRef.current = null;
      baseMarkerRef.current = null;
      pinsLayerRef.current = null;
    };
  }, []);

  // Base point + radius circle. Re-runs when the slider moves.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const centre: L.LatLngTuple = [base.lat, base.lng];
    const metres = Math.max(0.5, radiusMiles) * METRES_PER_MILE;

    // Set the view FIRST. A Leaflet map with no view yet defers every addLayer
    // until one exists, so the circle below wouldn't be on the map and asking
    // it for bounds would throw. Bounds come from the point itself: a square
    // of the circle's diameter, which is exactly what fits the circle.
    map.fitBounds(L.latLng(centre).toBounds(metres * 2), { padding: [12, 12], animate: false });

    if (!circleRef.current) {
      circleRef.current = L.circle(centre, {
        radius: metres,
        color: BRAND_BLUE,
        weight: 1.5,
        dashArray: "4 4",
        fillColor: BRAND_BLUE,
        fillOpacity: 0.12,
      }).addTo(map);
    } else {
      circleRef.current.setLatLng(centre);
      circleRef.current.setRadius(metres);
    }

    if (!baseMarkerRef.current) {
      baseMarkerRef.current = L.circleMarker(centre, {
        radius: 6,
        color: "#ffffff",
        weight: 2,
        fillColor: BRAND_BLUE,
        fillOpacity: 1,
      })
        .bindTooltip("Your base")
        .addTo(map);
    } else {
      baseMarkerRef.current.setLatLng(centre);
    }
  }, [base.lat, base.lng, radiusMiles]);

  // Job pins — one green dot per upcoming job, positioned at its real postcode.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!pinsLayerRef.current) pinsLayerRef.current = L.layerGroup().addTo(map);
    const layer = pinsLayerRef.current;
    layer.clearLayers();
    for (const pin of pins) {
      L.circleMarker([pin.lat, pin.lng], {
        radius: 5,
        color: "#ffffff",
        weight: 1.5,
        fillColor: SUCCESS_GREEN,
        fillOpacity: 1,
      })
        .bindTooltip(pin.label)
        .addTo(layer);
    }
  }, [pins]);

  return (
    <div
      ref={containerRef}
      className="h-64 w-full"
      role="img"
      aria-label="Map of your service area"
    />
  );
}
