/**
 * MÓDULO: MAP MANAGER
 * Responsável pelo Leaflet, camadas de fundo (tiles),
 * divisões municipais em cores de alto contraste para todos os tipos de mapas,
 * rótulos compactos iniciais (Município + Representante) e detalhamento completo no hover/clique.
 */

const MapManager = (() => {
  let map = null;
  let currentTileKey = 'esri';
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

  // Cores fortes e contrastantes das divisões municipais para cada tipo de mapa
  const DIVISION_STYLES = {
    esri: {
      color: '#38BDF8',       // Azul Céu / Ciano vibrante - contraste altíssimo sobre Satélite escuro
      weight: 1.25,
      opacity: 0.85,
      fillColor: '#38BDF8',
      fillOpacity: 0.03
    },
    osm: {
      color: '#1E3A8A',       // Azul Marinho Escuro - destaque nítido sobre OpenStreetMap claro
      weight: 1.35,
      opacity: 0.85,
      fillColor: '#1E3A8A',
      fillOpacity: 0.02
    },
    google: {
      color: '#1E3A8A',       // Azul Marinho Escuro - destaque nítido sobre Google Maps
      weight: 1.35,
      opacity: 0.85,
      fillColor: '#1E3A8A',
      fillOpacity: 0.02
    },
    carto: {
      color: '#0F172A',       // Slate Preto/Grafite Profundo - contraste total sobre CartoDB Light
      weight: 1.4,
      opacity: 0.9,
      fillColor: '#0F172A',
      fillOpacity: 0.02
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

    currentTileKey = providerKey;

    if (currentTileLayer) {
      map.removeLayer(currentTileLayer);
    }

    currentTileLayer = L.tileLayer(config.url, config.options);
    currentTileLayer.addTo(map);
    currentTileLayer.bringToBack();

    // Atualiza estilo das divisões municipais para a cor de alto contraste do mapa escolhido
    applyDivisionStyle();

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

  function applyDivisionStyle() {
    if (!municipalDivisionsLayer) return;
    const style = DIVISION_STYLES[currentTileKey] || DIVISION_STYLES.esri;
    municipalDivisionsLayer.setStyle(style);
  }

  /**
   * Configura o DESTAQUE DO ESTADO e as DIVISÕES MUNICIPAIS DETALHADAS
   */
  function setStateHighlight(stateBorderGeoJson, municipalitiesGeoJson, municipiosMap, onCityClick) {
    clearStateHighlight();
    if (!map) return;

    const divStyle = DIVISION_STYLES[currentTileKey] || DIVISION_STYLES.esri;

    // 1. Camada de Divisões Municipais
    if (municipalitiesGeoJson) {
      municipalDivisionsLayer = L.geoJSON(municipalitiesGeoJson, {
        style: () => ({ ...divStyle }),
        onEachFeature: (feature, layer) => {
          const codArea = String(feature.properties ? (feature.properties.codarea || '') : '');
          const nomeCidade = municipiosMap.get(codArea) || 'Município';

          // Tooltip ao passar o mouse sobre a cidade não cadastrada
          layer.bindTooltip(nomeCidade, {
            permanent: false,
            direction: 'center',
            className: 'city-hover-tooltip'
          });

          layer.on('mouseover', () => {
            if (!cityLayersMap.has(codArea)) {
              layer.setStyle({
                color: '#F59E0B',
                weight: 2.5,
                opacity: 1,
                fillColor: '#F59E0B',
                fillOpacity: 0.3
              });
              layer.bringToFront();
            }
          });

          layer.on('mouseout', () => {
            if (!cityLayersMap.has(codArea)) {
              municipalDivisionsLayer.resetStyle(layer);
            }
          });

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

    // 2. Camada de Contorno Externo do Estado (Borda proeminente)
    if (stateBorderGeoJson) {
      stateBoundaryLayer = L.geoJSON(stateBorderGeoJson, {
        style: {
          color: '#4F46E5',       // Indigo Forte
          weight: 4,
          opacity: 1,
          fill: false,
          interactive: false
        }
      }).addTo(map);
    }

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
        applyDivisionStyle();
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
   * Preview com linha amarela pontilhada
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

  /**
   * RÓTULO COMPACTO PERMANENTE: Apenas Município e Representante(s)
   * Evita sobreposições e poluição visual no mapa
   */
  function buildCompactTooltipHtml(cidadeNome, itensDaCidade) {
    const nomesReps = [...new Set(itensDaCidade.map(it => it.representante))].join(', ');
    return `
      <div class="rep-compact-label">
        <span class="font-extrabold text-white text-[10px]">${escapeHtml(cidadeNome)}</span>
        <span class="text-amber-300 font-bold text-[9px]">${escapeHtml(nomesReps)}</span>
      </div>
    `;
  }

  /**
   * CARD DETALHADO (Exibido no HOVER ou no CLIQUE):
   * Mostra todas as marcas, representantes, badges, números e cores
   */
  function buildDetailedCardHtml(cidadeNome, itensDaCidade) {
    let rowsHtml = '';
    itensDaCidade.forEach(it => {
      rowsHtml += `
        <div class="flex items-center justify-between gap-2 py-1 border-b border-gray-700 last:border-0">
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
          <span class="text-[9px] font-semibold text-indigo-300 ml-2">(${itensDaCidade.length}/6 marcas)</span>
        </div>
        <div class="flex flex-col gap-0.5">
          ${rowsHtml}
        </div>
      </div>
    `;
  }

  /**
   * Adiciona ou atualiza a cidade no mapa
   * - De início: exibe apenas Município e Representante compacto
   * - No hover ou clique: exibe card detalhado com todas as marcas
   */
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

      layer.addTo(map);
      layer.bringToFront();

      entry = { layer, geoJson, items: itensDaCidade };
      cityLayersMap.set(mIdStr, entry);
    } else {
      entry.items = itensDaCidade;
    }

    const layer = entry.layer;

    // Pintura: sólida se 1 marca, listras se 2 a 6 marcas
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

    // 1. Rótulo COMPACTO inicial (Município e Representante apenas)
    layer.unbindTooltip();
    layer.bindTooltip(buildCompactTooltipHtml(cidadeNome, itensDaCidade), {
      permanent: true,
      direction: 'center',
      className: 'rep-compact-tooltip'
    });

    // 2. No HOVER: Transiciona para o card DETALHADO
    layer.off('mouseover');
    layer.on('mouseover', () => {
      layer.setStyle({ weight: 3.5, color: '#FFFFFF' });
      layer.unbindTooltip();
      layer.bindTooltip(buildDetailedCardHtml(cidadeNome, entry.items), {
        permanent: true,
        direction: 'center',
        className: 'rep-custom-tooltip'
      }).openTooltip();
    });

    // Ao sair com o mouse: Retorna ao rótulo compacto
    layer.off('mouseout');
    layer.on('mouseout', () => {
      layer.setStyle({ weight: 1.8, color: '#111827' });
      layer.unbindTooltip();
      layer.bindTooltip(buildCompactTooltipHtml(cidadeNome, entry.items), {
        permanent: true,
        direction: 'center',
        className: 'rep-compact-tooltip'
      }).openTooltip();
    });

    // 3. No CLIQUE: Abre Popup rico com todas as marcas e dados completos
    layer.unbindPopup();
    layer.bindPopup(buildDetailedCardHtml(cidadeNome, itensDaCidade), {
      className: 'rep-detailed-popup',
      autoPan: true
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

  /**
   * Captura screenshot em alta resolução (scale: 2) usando dom-to-image.
   * Se targetBounds for informado, enquadra o estado selecionado, aguarda a estabilização
   * dos tiles e retorna tanto o Blob (para o zip) quanto a dataUrl com largura e altura (para o PDF).
   */
  async function captureMapScreenshot(targetBounds) {
    const mapElement = document.getElementById('map');
    if (!mapElement) throw new Error('Elemento do mapa não encontrado');

    const zoomControls = mapElement.querySelectorAll('.leaflet-control-zoom');
    zoomControls.forEach(ctrl => ctrl.style.display = 'none');

    // Salvar estado atual do mapa para restaurar depois
    let prevCenter = null;
    let prevZoom = null;
    if (map) {
      prevCenter = map.getCenter();
      prevZoom = map.getZoom();

      if (targetBounds && typeof targetBounds.isValid === 'function' && targetBounds.isValid()) {
        map.fitBounds(targetBounds, { padding: [25, 25], animate: false });
      }
    }

    // Aguardar 600ms para renderizar completamente as camadas e polígonos
    await new Promise(resolve => setTimeout(resolve, 600));

    try {
      const scale = 2;
      const origWidth = mapElement.offsetWidth || 800;
      const origHeight = mapElement.offsetHeight || 560;

      // dom-to-image toPng para obter a dataURL (necessária para jsPDF)
      const dataUrl = await domtoimage.toPng(mapElement, {
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

      // Converter dataUrl em Blob para o pacote .zip
      const res = await fetch(dataUrl);
      const blob = await res.blob();

      return {
        blob,
        dataUrl,
        width: origWidth * scale,
        height: origHeight * scale
      };
    } finally {
      zoomControls.forEach(ctrl => ctrl.style.display = '');
      if (map && prevCenter && prevZoom && targetBounds) {
        map.setView(prevCenter, prevZoom, { animate: false });
      }
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
