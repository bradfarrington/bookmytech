"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// The mechanic's latest shared position on an OpenStreetMap map (Leaflet, no
// key). Client-only: live-location.tsx loads it with next/dynamic and
// ssr:false, because Leaflet touches `window` on import. One dot, no route and
// no ETA: we don't have either.

const BRAND_BLUE = "#2563eb";
const OSM_TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

export default function LiveLocationMap({ lat, lng, label }: { lat: number; lng: number; label: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.CircleMarker | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;
    const map = L.map(el, { scrollWheelZoom: false, attributionControl: true });
    L.tileLayer(OSM_TILES, { maxZoom: 19, attribution: OSM_ATTRIBUTION }).addTo(map);
    mapRef.current = map;
    const raf = requestAnimationFrame(() => map.invalidateSize());
    return () => {
      cancelAnimationFrame(raf);
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const point: L.LatLngTuple = [lat, lng];
    if (!markerRef.current) {
      map.setView(point, 14, { animate: false });
      markerRef.current = L.circleMarker(point, {
        radius: 9,
        color: "#ffffff",
        weight: 3,
        fillColor: BRAND_BLUE,
        fillOpacity: 1,
      })
        .bindTooltip(label)
        .addTo(map);
      return;
    }
    markerRef.current.setLatLng(point);
    // Follow the dot only when it leaves the view, so a customer who has
    // panned around isn't yanked back every refresh.
    if (!map.getBounds().contains(point)) map.panTo(point);
  }, [lat, lng, label]);

  return (
    // `isolate` keeps Leaflet's high z-index panes under the sticky header.
    <div
      ref={containerRef}
      role="img"
      aria-label={`Map showing ${label}'s last shared location`}
      className="isolate h-44 w-full bg-blue-50"
    />
  );
}
