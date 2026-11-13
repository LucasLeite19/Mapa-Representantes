/**
 * MÓDULO: MAP MANAGER
 * Responsável pelo Leaflet, camadas de fundo (tiles),
 * destaque de Estado, divisão detalhada de municípios com interatividade (hover e clique),
 * renderização de malhas com suporte a múltiplas marcas (SVG stripes), rótulos centrais permanentes e exportação.
 */

const MapManager = (() => {
  let map = null;
  let currentTileLayer = null;
  let previewLayer = null;
  let isFullscreen = false;

  // Camadas de destaque de Estado e divisões municipais
  let stateBoundaryLayer = null;
  let municipalDivisionsLayer = null;
  let showDivisions = true;

  // Mapa de camadas ativas de cidades cadastradas: municipioId -> { layer, geoJson, items }
  const cityLayersMap = new Map();

  const BRASIL_CENTER = [-14.235, -51.9253];
  const BRASIL_ZOOM = 4;

  // Provedores de Mapa com crossOrigin: 'anonymous'
  const TILE_PROVIDERS = {
    esri: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      options: {
        maxZoom: 19,
        crossOrigin: 'anonymous',
        attribution: 'Tiles &copy; Esri &mdash; Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
      }
    },
    osm: {
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      options: {
        maxZoom: 19,
        subdomains: ['a', 'b', 'c'],
        crossOrigin: 'anonymous',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }
    },
    google: {
      url: 'https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
      options: {
        maxZoom: 20,
        subdomains: ['0', '1', '2', '3'],
        crossOrigin: 'anonymous',
        attribution: '&copy; Google Maps Híbrido'
      }
    },
    carto: {
      url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
      options: {
        maxZoom: 19,
        subdomains: 'abcd',
        crossOrigin: 'anonymous',
        attribution: '&copy; <a href="https://carto.com/">CARTO</a>'
      }
    }
  };

  /**
   * Inicializa o Leaflet (SVG renderer para padrões dinâmicos)
   */
  function init() {
    const mapEl = document.getElementById('map');
    if (!mapEl) return;

    map = L.map('map', {
      zoomControl: true,
      preferCanvas: false
    }).setView(BRASIL_CENTER, BRASIL_ZOOM);

    setTileProvider('esri');

    setTimeout(() => {
      map.invalidateSize();
    }, 150);
  }

  function setTileProvider(providerKey) {
    const config = TILE_PROVIDERS[providerKey];
    if (!config || !map) return;

    if (currentTileLayer) {
      map.removeLayer(currentTileLayer);
    }

    currentTileLayer = L.tileLayer(config.url, config.options);
    currentTileLayer.addTo(map);

    // Garante que o mapa base fique no fundo de todas as sobreposições
    currentTileLayer.bringToBack();

    document.querySelectorAll('.btn-tile-layer').forEach(btn => {
      if (btn.dataset.layer === providerKey) {
        btn.classList.add('btn-tile-active');
        btn.classList.remove('btn-tile-inactive');
      } else {
        btn.classList.remove('btn-tile-active');
        btn.classList.add('btn-tile-inactive');
      }
    });
  }

  /**
   * Configura o DESTAQUE DO ESTADO e as DIVISÕES MUNICIPAIS DETALHADAS
   */
  function setStateHighlight(stateBorderGeoJson, municipalitiesGeoJson, municipiosMap, onCityClick) {
    clearStateHighlight();
    if (!map) return;

    // 1. Camada de Divisões Municipais (linhas finas de todas as cidades do estado)
    if (municipalitiesGeoJson) {
      municipalDivisionsLayer = L.geoJSON(municipalitiesGeoJson, {
        style: () => ({
          color: '#FFFFFF',
          weight: 0.9,
          opacity: 0.7,
          fillColor: '#4F46E5',
          fillOpacity: 0.02
        }),
        onEachFeature: (feature, layer) => {
          const codArea = String(feature.properties ? (feature.properties.codarea || '') : '');
          const nomeCidade = municipiosMap.get(codArea) || 'Município';

          // Tooltip ao passar o mouse
          layer.bindTooltip(nomeCidade, {
            permanent: false,
            direction: 'center',
            className: 'city-hover-tooltip'
          });

          // Efeitos de Hover
          layer.on('mouseover', () => {
            // Se a cidade já estiver cadastrada com representantes, não sobrepõe estilo
            if (!cityLayersMap.has(codArea)) {
              layer.setStyle({
                color: '#FBBF24',
                weight: 2.2,
                opacity: 1,
                fillColor: '#F59E0B',
                fillOpacity: 0.28
              });
              layer.bringToFront();
            }
          });

          layer.on('mouseout', () => {
            if (!cityLayersMap.has(codArea)) {
              municipalDivisionsLayer.resetStyle(layer);
            }
          });

          // Clique na cidade: seleciona automaticamente no formulário
          layer.on('click', () => {
            if (onCityClick && codArea) {
              onCityClick(codArea);
            }
          });
        }
      });

      if (showDivisions) {
        municipalDivisionsLayer.addTo(map);
      }
    }

    // 2. Camada de Contorno Externo do Estado (Borda destacada e elegante)
    if (stateBorderGeoJson) {
      stateBoundaryLayer = L.geoJSON(stateBorderGeoJson, {
        style: {
          color: '#6366F1',       // Indigo destacado
          weight: 3.5,
          opacity: 0.95,
          fill: false,
          interactive: false
        }
      }).addTo(map);
    }

    // 3. Garante que os municípios já cadastrados fiquem sempre por cima das linhas do estado
    bringRegisteredCitiesToFront();
  }

  function clearStateHighlight() {
    if (stateBoundaryLayer && map) {
      map.removeLayer(stateBoundaryLayer);
      stateBoundaryLayer = null;
    }
    if (municipalDivisionsLayer && map) {
      map.removeLayer(municipalDivisionsLayer);
      municipalDivisionsLayer = null;
    }
  }

  function toggleMunicipalDivisions(visible) {
    showDivisions = visible;
    if (!map || !municipalDivisionsLayer) return;

    if (showDivisions) {
      if (!map.hasLayer(municipalDivisionsLayer)) {
        municipalDivisionsLayer.addTo(map);
        bringRegisteredCitiesToFront();
      }
    } else {
      if (map.hasLayer(municipalDivisionsLayer)) {
        map.removeLayer(municipalDivisionsLayer);
      }
    }
  }

  function bringRegisteredCitiesToFront() {
    cityLayersMap.forEach(entry => {
      if (entry && entry.layer) {
        entry.layer.bringToFront();
      }
    });
    if (previewLayer) {
      previewLayer.bringToFront();
    }
  }

  /**
   * Mostra contorno de preview com linha amarela pontilhada
   */
  function showPreview(geoJson) {
    clearPreview();
    if (!geoJson || !map) return;

    previewLayer = L.geoJSON(geoJson, {
      style: {
        color: '#F59E0B',
        weight: 3.5,
        dashArray: '6, 8',
        fillColor: '#FBBF24',
        fillOpacity: 0.28
      }
    }).addTo(map);

    previewLayer.bringToFront();

    map.fitBounds(previewLayer.getBounds(), {
      maxZoom: 12,
      padding: [45, 45]
    });
  }

  function clearPreview() {
    if (previewLayer && map) {
      map.removeLayer(previewLayer);
      previewLayer = null;
    }
  }

  function getOrCreateSvgDefs() {
    const svg = document.querySelector('#map svg');
    if (!svg) return null;
    let defs = svg.querySelector('defs');
    if (!defs) {
      defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      svg.insertBefore(defs, svg.firstChild);
    }
    return defs;
  }

  function createStripePattern(municipioId, cores) {
    const defs = getOrCreateSvgDefs();
    if (!defs) return null;

    const patternId = `stripe-pat-${municipioId}`;
    let pattern = document.getElementById(patternId);
    if (!pattern) {
      pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
      pattern.setAttribute('id', patternId);
      pattern.setAttribute('patternUnits', 'userSpaceOnUse');
      pattern.setAttribute('patternTransform', 'rotate(45)');
      defs.appendChild(pattern);
    }

    pattern.innerHTML = '';
    const stripeWidth = 14;
    const totalSize = stripeWidth * cores.length;
    pattern.setAttribute('width', totalSize);
    pattern.setAttribute('height', totalSize);

    cores.forEach((cor, idx) => {
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', idx * stripeWidth);
      rect.setAttribute('y', 0);
      rect.setAttribute('width', stripeWidth);
      rect.setAttribute('height', totalSize);
      rect.setAttribute('fill', cor);
      rect.setAttribute('fill-opacity', '0.85');
      pattern.appendChild(rect);
    });

    return `url(#${patternId})`;
  }

  function buildTooltipHtml(cidadeNome, itensDaCidade) {
    let rowsHtml = '';
    itensDaCidade.forEach(it => {
      rowsHtml += `
        <div class="flex items-center justify-between gap-2 py-0.5 border-b border-gray-700 last:border-0">
          <div class="flex items-center gap-1.5 overflow-hidden">
            <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background-color: ${it.cor};"></span>
            <span class="rep-brand-badge brand-${it.marcaId || '1'}">${escapeHtml(it.marcaNome || 'Marca')}</span>
            <span class="font-semibold text-white text-xs truncate">${escapeHtml(it.representante)}</span>
          </div>
          <span class="text-amber-400 font-extrabold text-[10px] ml-1 flex-shrink-0">Nº ${it.seqId}</span>
        </div>
      `;
    });

    return `
      <div class="rep-marker-label">
        <div class="rep-marker-city-title flex items-center justify-between">
          <span>${escapeHtml(cidadeNome)}</span>
          <span class="text-[9px] font-normal text-indigo-300 ml-2">(${itensDaCidade.length}/6 marcas)</span>
        </div>
        <div class="flex flex-col gap-0.5">
          ${rowsHtml}
        </div>
      </div>
    `;
  }

  function syncMunicipalityLayer(municipioId, geoJson, itensDaCidade) {
    if (!map) return;

    const mIdStr = String(municipioId);

    if (!itensDaCidade || itensDaCidade.length === 0) {
      if (cityLayersMap.has(mIdStr)) {
        const entry = cityLayersMap.get(mIdStr);
        map.removeLayer(entry.layer);
        cityLayersMap.delete(mIdStr);
      }
      return;
    }

    const cidadeNome = itensDaCidade[0].municipioNome;
    const cores = itensDaCidade.map(it => it.cor);
    let entry = cityLayersMap.get(mIdStr);

    if (!entry) {
      const layer = L.geoJSON(geoJson, {
        style: {
          weight: 1.8,
          color: '#111827',
          opacity: 0.95
        }
      });

      layer.on('mouseover', () => {
        layer.setStyle({ weight: 3.5, color: '#FFFFFF' });
      });
      layer.on('mouseout', () => {
        layer.setStyle({ weight: 1.8, color: '#111827' });
      });

      layer.addTo(map);
      layer.bringToFront();

      entry = { layer, geoJson, items: itensDaCidade };
      cityLayersMap.set(mIdStr, entry);
    } else {
      entry.items = itensDaCidade;
    }

    const layer = entry.layer;
    if (cores.length === 1) {
      layer.setStyle({
        fillColor: cores[0],
        fillOpacity: 0.78,
        weight: 1.8,
        color: '#111827'
      });
      layer.eachLayer(l => {
        if (l._path) {
          l._path.setAttribute('fill', cores[0]);
          l._path.setAttribute('fill-opacity', '0.78');
        }
      });
    } else {
      const patternUrl = createStripePattern(mIdStr, cores);
      layer.setStyle({
        weight: 2.2,
        color: '#000000',
        fillOpacity: 0.92
      });
      if (patternUrl) {
        layer.eachLayer(l => {
          if (l._path) {
            l._path.setAttribute('fill', patternUrl);
            l._path.setAttribute('fill-opacity', '0.92');
          }
        });
      }
    }

    layer.unbindTooltip();
    layer.bindTooltip(buildTooltipHtml(cidadeNome, itensDaCidade), {
      permanent: true,
      direction: 'center',
      className: 'rep-custom-tooltip'
    });

    layer.bringToFront();
    return entry;
  }

  function removeMunicipality(municipioId, itensRestantes) {
    syncMunicipalityLayer(municipioId, null, itensRestantes);
  }

  function fitToBounds(bounds) {
    if (!map || !bounds) return;
    map.fitBounds(bounds, { padding: [25, 25] });
  }

  function fitAllRegisteredCities() {
    if (!map || cityLayersMap.size === 0) return;
    const allLayers = [];
    cityLayersMap.forEach(entry => allLayers.push(entry.layer));
    const group = L.featureGroup(allLayers);
    map.fitBounds(group.getBounds(), { padding: [35, 35] });
  }

  function resetToBrasil() {
    if (map) {
      map.setView(BRASIL_CENTER, BRASIL_ZOOM);
    }
  }

  function toggleFullScreen() {
    const wrapper = document.getElementById('mapWrapper');
    const iconExpand = document.getElementById('iconExpand');
    const iconCompress = document.getElementById('iconCompress');
    const textFullScreen = document.getElementById('textFullScreen');

    isFullscreen = !isFullscreen;

    if (isFullscreen) {
      wrapper.classList.add('map-fullscreen');
      if (iconExpand) iconExpand.classList.add('hidden');
      if (iconCompress) iconCompress.classList.remove('hidden');
      if (textFullScreen) textFullScreen.textContent = 'Sair';
    } else {
      wrapper.classList.remove('map-fullscreen');
      if (iconExpand) iconExpand.classList.remove('hidden');
      if (iconCompress) iconCompress.classList.add('hidden');
      if (textFullScreen) textFullScreen.textContent = 'Tela Cheia';
    }

    setTimeout(() => {
      if (map) map.invalidateSize();
    }, 200);

    return isFullscreen;
  }

  async function captureMapScreenshot() {
    const mapElement = document.getElementById('map');
    if (!mapElement) throw new Error('Elemento do mapa não encontrado');

    const zoomControls = mapElement.querySelectorAll('.leaflet-control-zoom');
    zoomControls.forEach(ctrl => ctrl.style.display = 'none');

    await new Promise(resolve => setTimeout(resolve, 500));

    try {
      const scale = 2;
      const origWidth = mapElement.offsetWidth;
      const origHeight = mapElement.offsetHeight;

      const blob = await domtoimage.toBlob(mapElement, {
        width: origWidth * scale,
        height: origHeight * scale,
        style: {
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          width: `${origWidth}px`,
          height: `${origHeight}px`
        },
        filter: (node) => {
          if (node.classList) {
            if (node.classList.contains('leaflet-control-zoom')) return false;
            if (node.classList.contains('no-export')) return false;
          }
          return true;
        }
      });

      return blob;
    } finally {
      zoomControls.forEach(ctrl => ctrl.style.display = '');
    }
  }

  function escapeHtml(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  return {
    init,
    setTileProvider,
    setStateHighlight,
    clearStateHighlight,
    toggleMunicipalDivisions,
    showPreview,
    clearPreview,
    syncMunicipalityLayer,
    removeMunicipality,
    fitToBounds,
    fitAllRegisteredCities,
    resetToBrasil,
    toggleFullScreen,
    captureMapScreenshot,
    getCityLayer: (mId) => cityLayersMap.get(String(mId)),
    getMapInstance: () => map
  };
})();
