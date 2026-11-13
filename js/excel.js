/**
 * MÓDULO: EXCEL, PDF & ZIP MANAGER
 * Responsável por:
 * 1. SheetJS: Geração e leitura da planilha modelo com suporte a Marcas (.xlsx).
 * 2. ExcelJS: Geração da planilha final estilizada (célula Cor em ARGB, coluna Marca e Representante colorido em negrito).
 * 3. jsPDF & autoTable: Geração do Relatório Executivo em PDF com 2 páginas:
 *    - Folha 1: Foto do Estado com mapa colorido e números.
 *    - Folha 2: Legenda com o resumo detalhado (Nº, Cor preenchida, Município, Marca e Representante).
 * 4. JSZip & FileSaver.js: Empacotamento do PNG, XLSX e PDF em um único arquivo .zip.
 */

const ExcelManager = (() => {

  function hexToArgb(hex) {
    if (!hex) return 'FF000000';
    const clean = hex.replace('#', '').trim().toUpperCase();
    if (clean.length === 6) return 'FF' + clean;
    if (clean.length === 3) return 'FF' + clean.split('').map(c => c + c).join('');
    return 'FF000000';
  }

  function hexToRgb(hex) {
    if (!hex) return { r: 59, g: 130, b: 246 };
    const clean = hex.replace('#', '').trim();
    if (clean.length === 6) {
      const bigint = parseInt(clean, 16);
      return {
        r: (bigint >> 16) & 255,
        g: (bigint >> 8) & 255,
        b: bigint & 255
      };
    }
    return { r: 59, g: 130, b: 246 };
  }

  function isDarkColor(hex) {
    const rgb = hexToRgb(hex);
    const yiq = ((rgb.r * 299) + (rgb.g * 587) + (rgb.b * 114)) / 1000;
    return yiq < 140;
  }

  /**
   * Baixa a Planilha Modelo para o Estado Selecionado com a coluna "Marca" (SheetJS)
   */
  function downloadTemplate(estadoSigla, municipios, marcasDisponiveis) {
    if (!municipios || municipios.length === 0) {
      throw new Error('Nenhum município disponível para gerar o modelo.');
    }

    const marcaPadrao = marcasDisponiveis && marcasDisponiveis[0] ? marcasDisponiveis[0].nome : 'Marca 1';

    const rows = municipios.map(m => {
      return {
        'ID IBGE': m.id,
        'Estado': estadoSigla,
        'Município': m.nome,
        'Marca': marcaPadrao,
        'Representante': '',
        'Cor Hex': ''
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);

    worksheet['!cols'] = [
      { wch: 14 }, // ID IBGE
      { wch: 8 },  // Estado
      { wch: 32 }, // Município
      { wch: 16 }, // Marca
      { wch: 30 }, // Representante
      { wch: 12 }  // Cor Hex
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Municípios');

    const fileName = `modelo_representantes_${estadoSigla.toLowerCase()}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  }

  /**
   * Lê o arquivo de planilha enviado pelo usuário (SheetJS)
   */
  async function readImportFile(file) {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

    if (!rows || rows.length === 0) {
      throw new Error('A planilha está vazia.');
    }

    const validRows = rows.filter(row => {
      const rep = row['Representante'] || row['representante'] || row['REPRESENTANTE'];
      const id = row['ID IBGE'] || row['ID'] || row['IBGE'] || row['id_ibge'] || row['Codigo'];
      return rep && String(rep).trim() !== '' && id && String(id).trim() !== '';
    });

    return validRows;
  }

  /**
   * Gera a Planilha Final Padronizada (Mesmo formato da planilha de importação)
   * Colunas: ID IBGE, Estado, Município, Marca, Representante, Cor Hex
   * Célula Cor Hex preenchida com a cor exata em ARGB e código legível.
   */
  async function generateStyledExcelBuffer(itensCadastrados) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Gestor de Representantes';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Municípios', {
      views: [{ showGridLines: true }]
    });

    sheet.columns = [
      { header: 'ID IBGE', key: 'idIbge', width: 14 },
      { header: 'Estado', key: 'estado', width: 10 },
      { header: 'Município', key: 'municipio', width: 32 },
      { header: 'Marca', key: 'marca', width: 18 },
      { header: 'Representante', key: 'representante', width: 30 },
      { header: 'Cor Hex', key: 'corHex', width: 14 }
    ];

    const headerRow = sheet.getRow(1);
    headerRow.height = 28;
    headerRow.eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0F172A' } // Slate-900 Corporativo
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF334155' } },
        bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
        left: { style: 'thin', color: { argb: 'FF334155' } },
        right: { style: 'thin', color: { argb: 'FF334155' } }
      };
    });

    const itensOrdenados = [...itensCadastrados].sort((a, b) => a.seqId - b.seqId);

    itensOrdenados.forEach(item => {
      const argbColor = hexToArgb(item.cor);
      const isDark = isDarkColor(item.cor);

      const row = sheet.addRow({
        idIbge: Number(item.municipioId) || item.municipioId,
        estado: item.estadoSigla,
        municipio: item.municipioNome,
        marca: item.marcaNome,
        representante: item.representante,
        corHex: item.cor
      });

      row.height = 22;

      // ID IBGE
      const cellId = row.getCell('idIbge');
      cellId.alignment = { vertical: 'middle', horizontal: 'center' };
      cellId.font = { size: 10, color: { argb: 'FF374151' } };

      // Estado
      const cellEstado = row.getCell('estado');
      cellEstado.alignment = { vertical: 'middle', horizontal: 'center' };
      cellEstado.font = { bold: true, size: 10, color: { argb: 'FF7C3AED' } };

      // Município
      const cellMun = row.getCell('municipio');
      cellMun.alignment = { vertical: 'middle', horizontal: 'left' };
      cellMun.font = { size: 10, bold: true, color: { argb: 'FF111827' } };

      // Marca
      const cellMarca = row.getCell('marca');
      cellMarca.alignment = { vertical: 'middle', horizontal: 'center' };
      cellMarca.font = { bold: true, size: 10, color: { argb: 'FF4B5563' } };

      // Representante
      const cellRep = row.getCell('representante');
      cellRep.alignment = { vertical: 'middle', horizontal: 'left' };
      cellRep.font = { bold: true, size: 10, color: { argb: 'FF111827' } };

      // Cor Hex (Fundo ARGB com texto contrastado)
      const cellCorHex = row.getCell('corHex');
      cellCorHex.alignment = { vertical: 'middle', horizontal: 'center' };
      cellCorHex.font = { bold: true, size: 10, color: { argb: isDark ? 'FFFFFFFF' : 'FF000000' } };
      cellCorHex.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: argbColor }
      };

      row.eachCell(cell => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
        };
      });
    });

    return await workbook.xlsx.writeBuffer();
  }

  /**
   * Gera o Relatório Executivo em PDF em 2 páginas:
   * - Folha 1: Mapa do Estado com números e malhas coloridas
   * - Folha 2: Resumo e Legenda Executiva (Nº, Cor preenchida, Município, Marca e Representante)
   */
  function getCorNome(hex) {
    if (!hex) return 'padrão';
    const clean = hex.toLowerCase().trim();
    const map = {
      '#eab308': 'amarelo',
      '#facc15': 'amarelo',
      '#f59e0b': 'amarelo ouro',
      '#6b7280': 'cinza',
      '#94a3b8': 'cinza claro',
      '#64748b': 'cinza ardósia',
      '#3b82f6': 'azul',
      '#2563eb': 'azul real',
      '#10b981': 'verde',
      '#059669': 'verde esmeralda',
      '#8b5cf6': 'violeta',
      '#7c3aed': 'roxo',
      '#ec4899': 'rosa',
      '#ef4444': 'vermelho',
      '#dc2626': 'vermelho carmesim',
      '#f97316': 'laranja',
      '#14b8a6': 'turquesa',
      '#06b6d4': 'ciano'
    };
    if (map[clean]) return map[clean];

    const rgb = hexToRgb(clean);
    const { r, g, b } = rgb;
    if (r > 200 && g > 180 && b < 100) return 'amarelo';
    if (r > 200 && g < 100 && b < 100) return 'vermelho';
    if (r < 100 && g > 180 && b < 100) return 'verde';
    if (r < 100 && g < 100 && b > 200) return 'azul';
    if (r > 150 && g < 100 && b > 150) return 'roxo';
    if (r > 200 && g > 100 && b < 60) return 'laranja';
    if (Math.abs(r - g) < 25 && Math.abs(g - b) < 25) return 'cinza';
    return clean;
  }

  function drawFeatureGeometry(ctx, geometry, project) {
    if (!geometry) return;
    ctx.beginPath();
    if (geometry.type === 'Polygon') {
      geometry.coordinates.forEach(ring => {
        ring.forEach(([lng, lat], i) => {
          const [px, py] = project(lng, lat);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.closePath();
      });
    } else if (geometry.type === 'MultiPolygon') {
      geometry.coordinates.forEach(poly => {
        poly.forEach(ring => {
          ring.forEach(([lng, lat], i) => {
            const [px, py] = project(lng, lat);
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          });
          ctx.closePath();
        });
      });
    }
  }

  function getLargestRing(geometry) {
    if (!geometry) return null;
    if (geometry.type === 'Polygon') {
      return geometry.coordinates[0] || null;
    }
    if (geometry.type === 'MultiPolygon') {
      let maxArea = -1;
      let bestRing = null;
      geometry.coordinates.forEach(poly => {
        const ring = poly[0];
        if (ring && ring.length >= 3) {
          let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
          ring.forEach(([x, y]) => {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          });
          const approx = (maxX - minX) * (maxY - minY);
          if (approx > maxArea) {
            maxArea = approx;
            bestRing = ring;
          }
        }
      });
      return bestRing;
    }
    return null;
  }

  function getRingCentroid(ring, project) {
    if (!ring || ring.length < 3) return null;
    let area = 0, cx = 0, cy = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [x0, y0] = project(ring[j][0], ring[j][1]);
      const [x1, y1] = project(ring[i][0], ring[i][1]);
      const f = (x0 * y1 - x1 * y0);
      area += f;
      cx += (x0 + x1) * f;
      cy += (y0 + y1) * f;
    }
    area = area * 0.5;
    if (Math.abs(area) > 1e-4) {
      return { x: cx / (6 * area), y: cy / (6 * area) };
    }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    ring.forEach(([lng, lat]) => {
      const [px, py] = project(lng, lat);
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    });
    return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  }

  function drawRoundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  /**
   * Renderiza o Mapa Vetorial Executivo em Alta Definição (Canvas 2400x1500)
   * Segue as diretrizes estritas de Geomarketing Corporativo:
   * - Fundo limpo (#FFFFFF)
   * - Cidades "Fora da lista": Preenchimento branco e contorno cinza suave
   * - Cidades com Representante: Preenchimento com a cor institucional e contorno nítido
   * - Numeração proporcional e centralizada nos centróides das cidades
   * - Destaque (Callouts/Tags) para representantes com poucas cidades
   * - Indicador de Norte cartográfico (N ↑) no canto superior direito
   */
  async function renderExecutiveVectorMap(malhaMunicipios, itensCadastrados, estadoInfo, todosMunicipios) {
    if (!malhaMunicipios || !malhaMunicipios.features) {
      throw new Error('Malha municipal do estado não disponível para renderização vetorial.');
    }

    // 1. Mapeamento de itens por cidade (código IBGE)
    const itensPorCidade = new Map();
    itensCadastrados.forEach(it => {
      const cod = String(it.municipioId);
      if (!itensPorCidade.has(cod)) {
        itensPorCidade.set(cod, []);
      }
      itensPorCidade.get(cod).push(it);
    });

    // 2. Agrupamento por representante
    const repMap = new Map();
    itensCadastrados.forEach(it => {
      const repKey = (it.representante || 'Sem Representante').trim();
      if (!repMap.has(repKey)) {
        repMap.set(repKey, {
          nome: repKey,
          cor: it.cor || '#6B7280',
          corNome: getCorNome(it.cor),
          cidades: new Map()
        });
      }
      const g = repMap.get(repKey);
      const cod = String(it.municipioId);
      if (!g.cidades.has(cod)) {
        g.cidades.set(cod, {
          id: it.municipioId,
          nome: it.municipioNome,
          codarea: cod,
          cor: it.cor || '#6B7280'
        });
      }
    });

    const repGroups = Array.from(repMap.values()).map(g => {
      const cidadesArr = Array.from(g.cidades.values());
      cidadesArr.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      return {
        ...g,
        cidades: cidadesArr
      };
    });

    // 3. Atribuição de numeração ou callouts
    const cityVisualMap = new Map();

    repGroups.forEach(rg => {
      if (rg.cidades.length > 6) {
        rg.cidades.forEach((c, idx) => {
          c.num = idx + 1;
          cityVisualMap.set(c.codarea, {
            num: idx + 1,
            isCallout: false,
            text: String(idx + 1),
            cor: rg.cor
          });
        });
      } else {
        rg.cidades.forEach((c) => {
          cityVisualMap.set(c.codarea, {
            num: null,
            isCallout: true,
            text: c.nome,
            cor: rg.cor
          });
        });
      }
    });

    const totalMunicipiosEstado = malhaMunicipios.features.length;
    const totalAtendidos = itensPorCidade.size;
    const totalForaDaLista = Math.max(0, totalMunicipiosEstado - totalAtendidos);

    const marcasSet = new Set(itensCadastrados.map(it => it.marcaNome).filter(Boolean));
    const marcasTexto = Array.from(marcasSet).join(' e ');

    // 4. Criação do Canvas Offscreen de Alta Resolução (2400 x 1500)
    const canvas = document.createElement('canvas');
    canvas.width = 2400;
    canvas.height = 1500;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 5. Bounding Box geográfico
    let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;

    function processCoords(coords) {
      if (typeof coords[0] === 'number') {
        const [lng, lat] = coords;
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      } else {
        coords.forEach(processCoords);
      }
    }

    malhaMunicipios.features.forEach(f => {
      if (f.geometry && f.geometry.coordinates) {
        processCoords(f.geometry.coordinates);
      }
    });

    if (!isFinite(minLng) || !isFinite(maxLng)) {
      minLng = -50; maxLng = -40; minLat = -15; maxLat = -5;
    }

    const midLat = (minLat + maxLat) / 2;
    const cosLat = Math.cos((midLat * Math.PI) / 180);

    const padX = 160;
    const padY = 130;
    const availW = canvas.width - padX * 2;
    const availH = canvas.height - padY * 2;

    const deltaX = (maxLng - minLng) * cosLat;
    const deltaY = (maxLat - minLat);

    const scale = Math.min(availW / deltaX, availH / deltaY);
    const renderW = deltaX * scale;
    const renderH = deltaY * scale;

    const offsetX = padX + (availW - renderW) / 2;
    const offsetY = padY + (availH - renderH) / 2;

    function project(lng, lat) {
      const x = offsetX + (lng - minLng) * cosLat * scale;
      const y = offsetY + (maxLat - lat) * scale;
      return [x, y];
    }

    // 6. Desenho das geometrias
    // Passo 1: Cidades Fora da Lista
    malhaMunicipios.features.forEach(f => {
      const cod = String(f.properties ? (f.properties.codarea || f.id || '') : '');
      if (itensPorCidade.has(cod)) return;

      ctx.save();
      drawFeatureGeometry(ctx, f.geometry, project);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill('evenodd');
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 1.3;
      ctx.stroke();
      ctx.restore();
    });

    // Passo 2: Cidades Atendidas
    const centroidsList = [];

    malhaMunicipios.features.forEach(f => {
      const cod = String(f.properties ? (f.properties.codarea || f.id || '') : '');
      const itens = itensPorCidade.get(cod);
      if (!itens) return;

      const cor = itens[0].cor || '#6B7280';
      ctx.save();
      drawFeatureGeometry(ctx, f.geometry, project);
      ctx.fillStyle = cor;
      ctx.fill('evenodd');
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.restore();

      const ring = getLargestRing(f.geometry);
      if (ring) {
        const c = getRingCentroid(ring, project);
        if (c) {
          centroidsList.push({
            cod,
            x: c.x,
            y: c.y,
            cor,
            visual: cityVisualMap.get(cod)
          });
        }
      }
    });

    // Passo 3: Números ou Callouts
    centroidsList.forEach(item => {
      if (!item.visual) return;

      if (!item.visual.isCallout) {
        const numText = String(item.visual.num);
        const isDark = isDarkColor(item.cor);

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = numText.length > 2 
          ? 'bold 13px Helvetica, Arial, sans-serif'
          : 'bold 15px Helvetica, Arial, sans-serif';

        ctx.shadowColor = isDark ? 'rgba(0, 0, 0, 0.6)' : 'rgba(255, 255, 255, 0.8)';
        ctx.shadowBlur = 3;
        ctx.fillStyle = isDark ? '#FFFFFF' : '#0F172A';
        ctx.fillText(numText, item.x, item.y);
        ctx.restore();

      } else {
        const labelText = item.visual.text;
        ctx.save();
        ctx.font = 'bold 14px Helvetica, Arial, sans-serif';
        const textW = ctx.measureText(labelText).width;
        const boxW = textW + 16;
        const boxH = 24;

        ctx.fillStyle = '#FEF08A';
        ctx.strokeStyle = '#CA8A04';
        ctx.lineWidth = 1.5;

        drawRoundedRect(ctx, item.x - boxW / 2, item.y - boxH / 2, boxW, boxH, 4);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#0F172A';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(labelText, item.x, item.y);
        ctx.restore();
      }
    });

    // Passo 4: Indicador de Norte Cartográfico
    ctx.save();
    const northX = canvas.width - 130;
    const northY = 110;

    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 22px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', northX, northY);

    ctx.beginPath();
    ctx.moveTo(northX, northY + 8);
    ctx.lineTo(northX, northY + 54);
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(northX - 6, northY + 20);
    ctx.lineTo(northX, northY + 8);
    ctx.lineTo(northX + 6, northY + 20);
    ctx.fillStyle = '#0F172A';
    ctx.fill();
    ctx.restore();

    const dataUrl = canvas.toDataURL('image/png');
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));

    return {
      blob,
      dataUrl,
      width: canvas.width,
      height: canvas.height,
      repGroups,
      totalMunicipiosEstado,
      totalAtendidos,
      totalForaDaLista,
      marcasTexto
    };
  }

  /**
   * Gera o Relatório Executivo em PDF com 2 Páginas no Padrão Geomarketing Corporativo:
   * - Folha 1: Mapa Territorial Vetorial Limpo com Numeração e Legenda Executiva
   * - Folha 2: Relação Toponímica de Municípios em 4 Colunas e Validação da Base
   */
  async function generatePdfReport(vectorMapResult, stateInfo, itensCadastrados, todosMunicipios) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      throw new Error('Biblioteca jsPDF não carregada.');
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();   // 297 mm
    const pageHeight = doc.internal.pageSize.getHeight(); // 210 mm
    const today = new Date().toLocaleDateString('pt-BR');

    const estadoNome = stateInfo ? stateInfo.nome : 'ESTADO';
    const repGroups = (vectorMapResult && vectorMapResult.repGroups) ? vectorMapResult.repGroups : [];
    const totalForaDaLista = (vectorMapResult && vectorMapResult.totalForaDaLista !== undefined) ? vectorMapResult.totalForaDaLista : 0;
    const totalAtendidos = (vectorMapResult && vectorMapResult.totalAtendidos !== undefined) ? vectorMapResult.totalAtendidos : itensCadastrados.length;
    const marcasTexto = (vectorMapResult && vectorMapResult.marcasTexto) ? vectorMapResult.marcasTexto : '';

    // ==========================================
    // FOLHA 1: MAPA EXECUTIVO
    // ==========================================
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');

    // Título Principal
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.setTextColor(15, 23, 42); // Navy Corporativo #0F172A
    doc.text(estadoNome.toUpperCase(), 16, 18);

    // Subtítulo
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(100, 116, 139); // Slate #64748B
    const sub = 'Divisão de atendimento comercial' + (marcasTexto ? ' | ' + marcasTexto : '');
    doc.text(sub, 16, 25);

    // Imagem do Mapa Vetorial de Alta Resolução
    if (vectorMapResult && vectorMapResult.dataUrl) {
      doc.addImage(vectorMapResult.dataUrl, 'PNG', 16, 28, 265, 148);
    }

    // Legenda no rodapé da Página 1
    const legendY = 182;
    let currX = 16;

    repGroups.forEach(rep => {
      const rgb = hexToRgb(rep.cor);
      doc.setFillColor(rgb.r, rgb.g, rgb.b);
      doc.rect(currX, legendY - 3.5, 7.5, 4.5, 'F');
      doc.setDrawColor(148, 163, 184);
      doc.setLineWidth(0.2);
      doc.rect(currX, legendY - 3.5, 7.5, 4.5, 'D');

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      const repLabel = `${rep.nome} · ${rep.cidades.length} cidades`;
      doc.text(repLabel, currX + 9.5, legendY);

      const strW = doc.getTextWidth(repLabel);
      currX += 9.5 + strW + 10;
    });

    // Amostra "Fora da lista"
    doc.setFillColor(255, 255, 255);
    doc.rect(currX, legendY - 3.5, 7.5, 4.5, 'F');
    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.2);
    doc.rect(currX, legendY - 3.5, 7.5, 4.5, 'D');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    const foraLabel = `Fora da lista · ${totalForaDaLista} cidades`;
    doc.text(foraLabel, currX + 9.5, legendY);

    // Nota explicativa
    const repComNumeros = repGroups.find(r => r.cidades.length > 6);
    const textoNota = repComNumeros
      ? `Os números identificam as cidades de ${repComNumeros.nome} na relação da página 2.`
      : 'Os números identificam as cidades na relação da página 2.';

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(textoNota, 16, 191);

    // Rodapé de fontes cartográficas
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(`Fonte territorial: IBGE, API de Malhas (simplificada). Atendimento: planilha fornecida. | Elaborado em ${today}`, 16, 199);

    // ==========================================
    // FOLHA 2: RELAÇÃO DE MUNICÍPIOS
    // ==========================================
    doc.addPage('a4', 'landscape');
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(15, 23, 42);
    doc.text('RELAÇÃO DE MUNICÍPIOS', 16, 18);

    let yPos = 28;

    repGroups.forEach(rep => {
      if (yPos > 180) {
        doc.addPage('a4', 'landscape');
        yPos = 20;
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);

      const hasNumbers = rep.cidades.length > 6;
      const titleRep = `${rep.nome} · ${rep.corNome}${hasNumbers ? ' | Numeração correspondente ao mapa' : ''}`;
      doc.text(titleRep, 16, yPos);
      yPos += 5.5;

      if (!hasNumbers) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        doc.setTextColor(51, 65, 85);
        const line = rep.cidades.map(c => c.nome).join('   •   ');
        doc.text(line, 16, yPos);
        yPos += 11;

      } else {
        const colWidth = 66;
        const rows = Math.ceil(rep.cidades.length / 4);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(30, 41, 59);

        rep.cidades.forEach((city, idx) => {
          const col = Math.floor(idx / rows);
          const row = idx % rows;
          const cx = 16 + col * colWidth;
          const cy = yPos + row * 4.4;

          const numStr = String(city.num || idx + 1).padStart(3, '0');
          doc.text(`${numStr}  ${city.nome}`, cx, cy);
        });

        yPos += rows * 4.4 + 9;
      }
    });

    const validacaoY = Math.max(yPos + 4, 191);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text('Validação da base', 16, validacaoY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`${totalAtendidos} municípios únicos da lista localizados no mapa. Municípios em branco não tiveram atendimento atribuído.`, 16, validacaoY + 5);

    return doc.output('blob');
  }

  /**
   * Empacota o PNG, XLSX e PDF em .zip e inicia o download
   */
  async function downloadZipPackage(imageBlob, excelBuffer, pdfBlob) {
    const zip = new JSZip();

    zip.file('mapa_representantes.png', imageBlob);
    zip.file('tabela_representantes.xlsx', excelBuffer);
    if (pdfBlob) {
      zip.file('relatorio_representantes.pdf', pdfBlob);
    }

    const zipBlob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });

    const timestamp = new Date().toISOString().slice(0, 10);
    saveAs(zipBlob, `relatorio_representantes_${timestamp}.zip`);
  }

  return {
    downloadTemplate,
    readImportFile,
    generateStyledExcelBuffer,
    renderExecutiveVectorMap,
    generatePdfReport,
    downloadZipPackage
  };
})();
