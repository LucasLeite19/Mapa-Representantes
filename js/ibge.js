/**
 * MÓDULO: IBGE SERVICE
 * Responsável por todas as consultas à API de Localidades e Malhas do IBGE,
 * incluindo cache de requisições e coordenadas limites (bounding boxes) dos 27 estados.
 */

const IBGEService = (() => {
  // Cache em memória para evitar requisições repetidas de GeoJSON
  const geoCache = new Map();

  // Bounding Boxes [ [minLat, minLng], [maxLat, maxLng] ] de todos os 27 estados do Brasil
  // Garante que o zoom no Estado seja instantâneo e não dependa do download de malhas pesadas
  const UF_BOUNDS = {
    AC: [[-11.145, -73.990], [-7.111, -66.623]],
    AL: [[-10.504, -38.237], [-8.813, -35.152]],
    AP: [[-1.236, -54.876], [4.442, -49.865]],
    AM: [[-9.818, -73.796], [2.247, -56.097]],
    BA: [[-18.349, -46.617], [-8.533, -37.348]],
    CE: [[-7.858, -41.424], [-2.784, -37.253]],
    DF: [[-16.052, -48.287], [-15.500, -47.308]],
    ES: [[-21.302, -41.880], [-17.892, -39.664]],
    GO: [[-19.499, -53.251], [-12.395, -45.906]],
    MA: [[-10.262, -48.755], [-1.049, -41.794]],
    MT: [[-18.041, -61.633], [-7.349, -50.225]],
    MS: [[-24.068, -58.175], [-17.166, -51.339]],
    MG: [[-22.923, -51.056], [-14.233, -39.856]],
    PA: [[-9.841, -58.898], [2.591, -46.061]],
    PB: [[-8.303, -38.765], [-6.026, -34.793]],
    PR: [[-26.717, -54.619], [-22.516, -48.024]],
    PE: [[-9.483, -41.358], [-7.121, -34.793]],
    PI: [[-10.929, -45.994], [-2.747, -40.370]],
    RJ: [[-23.369, -44.889], [-20.763, -40.957]],
    RN: [[-6.983, -38.581], [-4.831, -34.975]],
    RS: [[-33.751, -57.649], [-27.081, -49.691]],
    RO: [[-13.694, -66.621], [-7.969, -59.774]],
    RR: [[-1.581, -64.825], [5.272, -58.887]],
    SC: [[-29.351, -53.837], [-25.956, -48.357]],
    SP: [[-25.312, -53.110], [-19.779, -44.161]],
    SE: [[-11.569, -38.245], [-9.515, -36.393]],
    TO: [[-13.468, -50.742], [-5.168, -45.688]]
  };

  /**
   * Obtém todos os Estados do Brasil ordenados por nome
   */
  async function getEstados() {
    const url = 'https://servicodados.ibge.gov.br/api/v1/localidades/estados?orderBy=nome';
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Falha ao obter Estados: HTTP ${res.status}`);
    return await res.json();
  }

  /**
   * Obtém os municípios de um determinado Estado
   */
  async function getMunicipios(ufId) {
    const url = `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${ufId}/municipios?orderBy=nome`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Falha ao obter Municípios: HTTP ${res.status}`);
    return await res.json();
  }

  /**
   * Obtém a malha GeoJSON de um município específico
   */
  async function getMalhaMunicipio(municipioId) {
    const key = `MUN_${municipioId}`;
    if (geoCache.has(key)) {
      return geoCache.get(key);
    }
    const url = `https://servicodados.ibge.gov.br/api/v3/malhas/municipios/${municipioId}?formato=application/vnd.geo+json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Falha ao obter malha do município ${municipioId}: HTTP ${res.status}`);
    const data = await res.json();
    geoCache.set(key, data);
    return data;
  }

  /**
   * Retorna os limites (LatLngBounds) pré-computados para um Estado pela sigla (ex: 'SP')
   */
  function getEstadoBounds(sigla) {
    if (!sigla) return null;
    const key = sigla.toUpperCase();
    return UF_BOUNDS[key] || null;
  }

  return {
    getEstados,
    getMunicipios,
    getMalhaMunicipio,
    getEstadoBounds
  };
})();
