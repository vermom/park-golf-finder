export type DrivingRoute = {
  distanceKm: number;
  durationMinutes: number;
};

type BRouterResponse = {
  features?: Array<{
    properties?: {
      'track-length'?: string | number;
      'total-time'?: string | number;
    };
  }>;
};

export function brouterUrl(
  origin: { latitude: number; longitude: number },
  destination: { latitude: number; longitude: number },
) {
  const points = `${origin.longitude},${origin.latitude}|${destination.longitude},${destination.latitude}`;
  const params = new URLSearchParams({
    lonlats: points,
    profile: 'car-fast',
    alternativeidx: '0',
    format: 'geojson',
  });
  return `https://brouter.de/brouter?${params.toString()}`;
}

export function parseBrouterRoute(payload: BRouterResponse): DrivingRoute {
  const properties = payload.features?.[0]?.properties;
  const distanceMeters = Number(properties?.['track-length']);
  const durationSeconds = Number(properties?.['total-time']);
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0 || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error('자동차 경로를 찾지 못했습니다.');
  }
  return {
    distanceKm: distanceMeters / 1000,
    durationMinutes: Math.max(1, Math.round(durationSeconds / 60)),
  };
}

export function formatDrivingRoute(route: DrivingRoute) {
  const distance = route.distanceKm < 10 ? route.distanceKm.toFixed(1) : Math.round(route.distanceKm).toLocaleString('ko-KR');
  const hours = Math.floor(route.durationMinutes / 60);
  const minutes = route.durationMinutes % 60;
  const duration = hours ? `${hours}시간${minutes ? ` ${minutes}분` : ''}` : `${minutes}분`;
  return `약 ${distance}km · ${duration}`;
}
