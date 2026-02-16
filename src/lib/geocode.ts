// GovMap API for Gush/Helka and Nominatim for address geocoding

export interface GeoResult {
  lat: number;
  lng: number;
  label: string;
}

// Search by Gush (block) and Helka (parcel) using GovMap
export async function searchByGushHelka(gush: number, helka: number): Promise<GeoResult> {
  try {
    // Use GovMap's public parcel search endpoint
    const response = await fetch(
      `https://es.govmap.gov.il/TldSearch/api/DetailsByQuery?query=${gush}/${helka}&lyrs=024&gid=govmap`,
      {
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`GovMap API error: ${response.status}`);
    }

    const data = await response.json();

    if (data?.data?.length > 0) {
      const result = data.data[0];
      // GovMap returns coordinates in Israel TM Grid (EPSG:2039)
      // We need to convert to WGS84 (lat/lng)
      if (result.X && result.Y) {
        const { lat, lng } = israelTMToWGS84(result.X, result.Y);
        return {
          lat,
          lng,
          label: `גוש ${gush}, חלקה ${helka}`,
        };
      }
    }

    // Fallback: try Nominatim with "gush helka" as text
    throw new Error('NOT_FOUND');
  } catch (error) {
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      throw new Error('לא נמצאו תוצאות עבור גוש/חלקה זה');
    }
    
    // If GovMap fails (CORS etc.), try alternative approach
    // Use a known cadastral search fallback
    try {
      const fallbackResponse = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=parcel+${gush}+${helka}+Israel&limit=1`
      );
      const fallbackData = await fallbackResponse.json();
      if (fallbackData.length > 0) {
        return {
          lat: parseFloat(fallbackData[0].lat),
          lng: parseFloat(fallbackData[0].lon),
          label: `גוש ${gush}, חלקה ${helka}`,
        };
      }
    } catch {
      // ignore fallback errors
    }

    throw new Error('לא ניתן לאתר את הגוש/חלקה. ייתכן שהמספרים שגויים.');
  }
}

// Search by address using Nominatim
export async function searchByAddress(address: string): Promise<GeoResult> {
  const query = encodeURIComponent(address + ', Israel');
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1&countrycodes=il`
  );

  if (!response.ok) {
    throw new Error('שגיאה בשירות החיפוש');
  }

  const data = await response.json();

  if (!data || data.length === 0) {
    throw new Error('לא נמצאה כתובת תואמת');
  }

  return {
    lat: parseFloat(data[0].lat),
    lng: parseFloat(data[0].lon),
    label: data[0].display_name || address,
  };
}

// Convert Israel Transverse Mercator (ITM / EPSG:2039) to WGS84
function israelTMToWGS84(x: number, y: number): { lat: number; lng: number } {
  // Approximate conversion from ITM to WGS84
  // Based on the Helmert transformation parameters
  const B = 6356752.3141;
  const a = 6378137.0;
  const e = 0.0818191908426;
  const lam0 = (35.2045169444 * Math.PI) / 180;
  const phi0 = (31.7343936111 * Math.PI) / 180;
  const k0 = 1.0000067;
  const E0 = 219529.584;
  const N0 = 626907.39;

  const dE = x - E0;
  const dN = y - N0;

  // Inverse Transverse Mercator
  const M = N0 + dN;
  const mu = M / (a * k0 * (1 - e * e / 4 - 3 * e * e * e * e / 64));

  const e1 = (1 - Math.sqrt(1 - e * e)) / (1 + Math.sqrt(1 - e * e));
  const phi1 =
    mu +
    (3 * e1 / 2 - 27 * Math.pow(e1, 3) / 32) * Math.sin(2 * mu) +
    (21 * e1 * e1 / 16 - 55 * Math.pow(e1, 4) / 32) * Math.sin(4 * mu) +
    (151 * Math.pow(e1, 3) / 96) * Math.sin(6 * mu);

  const N1 = a / Math.sqrt(1 - e * e * Math.sin(phi1) * Math.sin(phi1));
  const T1 = Math.tan(phi1) * Math.tan(phi1);
  const C1 = (e * e * Math.cos(phi1) * Math.cos(phi1)) / (1 - e * e);
  const R1 = (a * (1 - e * e)) / Math.pow(1 - e * e * Math.sin(phi1) * Math.sin(phi1), 1.5);
  const D = dE / (N1 * k0);

  const lat =
    phi1 -
    ((N1 * Math.tan(phi1)) / R1) *
      (D * D / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1) * Math.pow(D, 4) / 24 +
        (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1) * Math.pow(D, 6) / 720);

  const lng =
    lam0 +
    (D - (1 + 2 * T1 + C1) * Math.pow(D, 3) / 6 +
      (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * (e * e / (1 - e * e)) + 24 * T1 * T1) *
        Math.pow(D, 5) / 120) /
      Math.cos(phi1);

  return {
    lat: (lat * 180) / Math.PI,
    lng: (lng * 180) / Math.PI,
  };
}
