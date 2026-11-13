/**
 * MÓDULO: MAP MANAGER
 * Responsável pela instância do Leaflet, camadas de fundo (tiles),
 * renderização de malhas GeoJSON, rótulos permanentes, tela cheia e captura de print.
 */

const MapManager = (() => {
  let map = null;
  let currentTileLayer = null;
  let previewLayer = null;
  let isFullscreen = false;

  // Centro inicial do Brasil
  const BRASIL_CENTER = [-14.235, -51.9253];
  const BRASIL_ZOOM = 4;

  // Provedores de Mapa de Fundo com crossOrigin: 'anonymous'
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
   * Inicializa o mapa do Leaflet
   */
  function init() {
    const mapElement = document.getElementById('map');
    if (!mapElement) return;

    map = L.map('mapElement' in window ? 'mapElement' : 'map', {
      zoomControl: true,
      preferCanvas: true
    }).setView(BRASIL_CENTER, BRASIL_ZOOM);

    // Adiciona Esri Satélite como padrão obrigatório
    setTileProvider('esri');

    // Forçar Leaflet a recalcular as dimensões exatas da div após o carregamento
    setTimeout(() => {
      map.invalidateSize();
    }, 150);
  }

  /**
   * Alterna a camada de fundo (tile provider)
   */
  function setTileProvider(providerKey) {
    const config = TILE_PROVIDERS[providerKey];
    if (!config || !map) return;

    if (currentTileLayer) {
      map.removeLayer(currentTileLayer);
    }

    currentTileLayer = L.tileLayer(config.url, config.options);
    currentTileLayer.addTo(map);

    // Atualiza classes dos botões de camada
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
   * Mostra o contorno do município em modo PREVIEW com linha amarela pontilhada
   */
  function showPreview(geoJson) {
    clearPreview();
    if (!geoJson || !map) return;

    previewLayer = L.geoJSON(geoJson, {
      style: {
        color: '#F59E0B',        // Amarelo âmbar vibrante
        weight: 3.5,
        dashArray: '6, 8',       // Linha pontilhada
        fillColor: '#FBBF24',
        fillOpacity: 0.25
      }
    }).addTo(map);

    // Foca o mapa no município com zoom suave
    map.fitBounds(previewLayer.getBounds(), {
      maxZoom: 12,
      padding: [45, 45]
    });
  }

  /**
   * Remove o contorno de preview
   */
  function clearPreview() {
    if (previewLayer && map) {
      map.removeLayer(previewLayer);
      previewLayer = null;
    }
  }

  /**
   * Adiciona a malha definitiva com preenchimento da cor escolhida e rótulo permanente
   */
  function addMunicipalityLayer(item) {
    if (!map || !item.geoJson) return null;

    const layer = L.geoJSON(item.geoJson, {
      style: {
        fillColor: item.cor,
        fillOpacity: 0.72,
        color: '#1F2937',
        weight: 1.5,
        opacity: 0.95
      }
    });

    // Rótulo permanente centralizado com Nº identificador e Nome do Representante
    const tooltipHtml = `
      <div class="rep-marker-label">
        <span class="rep-marker-badge">Nº ${item.seqId}</span>
        <span class="rep-marker-name">${escapeHtml(item.representante)}</span>
      </div>
    `;

    layer.bindTooltip(tooltipHtml, {
      permanent: true,
      direction: 'center',
      className: 'rep-custom-tooltip'
    });

    // Feedback visual suave de hover
    layer.on('mouseover', () => {
      layer.setStyle({ weight: 3, color: '#FFFFFF' });
    });
    layer.on('mouseout', () => {
      layer.setStyle({ weight: 1.5, color: '#1F2937' });
    });

    layer.addTo(map);
    return layer;
  }

  /**
   * Remove uma camada de município do mapa
   */
  function removeLayer(layer) {
    if (layer && map) {
      map.removeLayer(layer);
    }
  }

  /**
   * Atualiza a cor de preenchimento de uma camada
   */
  function updateLayerColor(layer, novaCor) {
    if (layer) {
      layer.setStyle({ fillColor: novaCor });
    }
  }

  /**
   * Enquadra a visão no Estado informado
   */
  function fitToBounds(bounds) {
    if (!map || !bounds) return;
    map.fitBounds(bounds, { padding: [25, 25] });
  }

  /**
   * Enquadra um grupo de camadas ou todos os municípios cadastrados
   */
  function fitLayers(layers) {
    if (!map || !layers || layers.length === 0) return;
    const group = L.featureGroup(layers);
    map.fitBounds(group.getBounds(), { padding: [35, 35] });
  }

  /**
   * Reseta o mapa para a visão geral do Brasil
   */
  function resetToBrasil() {
    if (map) {
      map.setView(BRASIL_CENTER, BRASIL_ZOOM);
    }
  }

  /**
   * Alterna modo Tela Cheia
   */
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
   * Tira print do mapa em Alta Resolução (Scale: 2) usando dom-to-image
   * Oculta controles de zoom e aplica delay de 500ms antes da captura
   */
  async function captureMapScreenshot() {
    const mapElement = document.getElementById('map');
    if (!mapElement) throw new Error('Elemento do mapa não encontrado');

    // 1. Ocultar controles de zoom nativos do Leaflet
    const zoomControls = mapElement.querySelectorAll('.leaflet-control-zoom');
    zoomControls.forEach(ctrl => ctrl.style.display = 'none');

    // 2. Delay de 500ms para estabilização de renderização
    await new Promise(resolve => setTimeout(resolve, 500));

    try {
      const scale = 2; // Alta Qualidade scale: 2
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
      // Restaurar visibilidade dos controles de zoom
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
    showPreview,
    clearPreview,
    addMunicipalityLayer,
    removeLayer,
    updateLayerColor,
    fitToBounds,
    fitLayers,
    resetToBrasil,
    toggleFullScreen,
    captureMapScreenshot,
    getMapInstance: () => map
  };
})();
