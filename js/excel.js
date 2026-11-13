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
   * Gera a Planilha Final Avançada com cores em ARGB e coluna Marca (ExcelJS)
   */
  async function generateStyledExcelBuffer(itensCadastrados) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Gestor de Representantes';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Representantes', {
      views: [{ showGridLines: true }]
    });

    sheet.columns = [
      { header: 'Nº', key: 'seq', width: 8 },
      { header: 'Cor', key: 'cor', width: 12 },
      { header: 'Estado', key: 'estado', width: 12 },
      { header: 'Município', key: 'municipio', width: 30 },
      { header: 'Marca', key: 'marca', width: 18 },
      { header: 'Representante', key: 'representante', width: 30 }
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

      const row = sheet.addRow({
        seq: item.seqId,
        cor: '', // Regra: Sem texto na coluna cor!
        estado: item.estadoSigla,
        municipio: item.municipioNome,
        marca: item.marcaNome,
        representante: item.representante
      });

      row.height = 22;

      // Nº
      const cellSeq = row.getCell('seq');
      cellSeq.alignment = { vertical: 'middle', horizontal: 'center' };
      cellSeq.font = { bold: true, size: 10, color: { argb: 'FF374151' } };

      // Cor de fundo exata em ARGB
      const cellCor = row.getCell('cor');
      cellCor.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: argbColor }
      };

      // Estado
      const cellEstado = row.getCell('estado');
      cellEstado.alignment = { vertical: 'middle', horizontal: 'center' };
      cellEstado.font = { bold: true, size: 10, color: { argb: 'FF4F46E5' } };

      // Município
      const cellMun = row.getCell('municipio');
      cellMun.alignment = { vertical: 'middle', horizontal: 'left' };
      cellMun.font = { size: 10, color: { argb: 'FF111827' } };

      // Marca
      const cellMarca = row.getCell('marca');
      cellMarca.alignment = { vertical: 'middle', horizontal: 'center' };
      cellMarca.font = { bold: true, size: 10, color: { argb: 'FF4B5563' } };

      // Representante com texto na mesma cor em negrito
      const cellRep = row.getCell('representante');
      cellRep.alignment = { vertical: 'middle', horizontal: 'left' };
      cellRep.font = {
        bold: true,
        color: { argb: argbColor },
        size: 11
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
  async function generatePdfReport(mapDataUrl, mapWidth, mapHeight, stateInfo, itensCadastrados) {
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
    const now = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const estadoNome = stateInfo ? `${stateInfo.nome} (${stateInfo.sigla})` : 'Brasil';
    const totalCidades = new Set(itensCadastrados.map(it => String(it.municipioId))).size;
    const totalReps = new Set(itensCadastrados.map(it => it.representante.toLowerCase())).size;

    // ==========================================
    // FOLHA 1: MAPA COLORIDO DO ESTADO
    // ==========================================
    doc.setFillColor(76, 29, 149); // Roxo Corporativo (#4C1D95)
    doc.rect(0, 0, pageWidth, 28, 'F');

    // Título Superior
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text('GESTOR DE REPRESENTANTES - MAPA TERRITORIAL', 14, 12);

    // Subtítulo
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(237, 233, 254);
    doc.text(`Estado: ${estadoNome}  |  Emissão: ${today} às ${now}`, 14, 21);

    // Métricas no canto direito
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(255, 255, 255);
    doc.text(`Municípios Cadastrados: ${totalCidades}   |   Representantes: ${totalReps}`, pageWidth - 14, 16, { align: 'right' });

    // Enquadramento Seguro da Imagem do Mapa na Folha 1
    const maxW = 269;
    const maxH = 162;
    const safeW = (Number(mapWidth) > 0) ? Number(mapWidth) : 1600;
    const safeH = (Number(mapHeight) > 0) ? Number(mapHeight) : 1000;
    const imgRatio = safeW / safeH;

    let renderW = maxW;
    let renderH = maxW / imgRatio;
    if (renderH > maxH) {
      renderH = maxH;
      renderW = maxH * imgRatio;
    }
    if (!isFinite(renderW) || renderW <= 0) renderW = maxW;
    if (!isFinite(renderH) || renderH <= 0) renderH = maxH;

    const posX = (pageWidth - renderW) / 2;
    const posY = 33 + (maxH - renderH) / 2;

    if (isFinite(posX) && isFinite(posY) && isFinite(renderW) && isFinite(renderH)) {
      doc.setDrawColor(221, 214, 254);
      doc.setLineWidth(0.4);
      doc.rect(posX - 0.5, posY - 0.5, renderW + 1, renderH + 1);
    }

    if (mapDataUrl && typeof mapDataUrl === 'string' && mapDataUrl.startsWith('data:image/')) {
      doc.addImage(mapDataUrl, 'PNG', posX, posY, renderW, renderH);
    }

    // Rodapé Folha 1
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text('Documento Oficial de Distribuição Comercial  |  Página 1 de 2', 14, 204);

    // ==========================================
    // FOLHA 2: RESUMO EXECUTIVO E LEGENDA
    // ==========================================
    doc.addPage('a4', 'landscape');

    // Cabeçalho Folha 2
    doc.setFillColor(76, 29, 149);
    doc.rect(0, 0, pageWidth, 28, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text('LEGENDA E RESUMO EXECUTIVO DOS REPRESENTANTES', 14, 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(237, 233, 254);
    doc.text(`Relação detalhada dos municípios cadastrados, marcas e representantes  |  Estado: ${estadoNome}`, 14, 21);

    // Tabela Executiva
    const tableData = [...itensCadastrados]
      .sort((a, b) => a.seqId - b.seqId)
      .map(it => [
        `Nº ${it.seqId}`,
        it.cor, // Hex usado no didDrawCell para desenhar o quadrado colorido
        it.estadoSigla,
        it.municipioNome,
        it.marcaNome,
        it.representante
      ]);

    doc.autoTable({
      startY: 34,
      margin: { left: 14, right: 14 },
      head: [['Nº', 'Cor', 'Estado', 'Município', 'Marca', 'Representante']],
      body: tableData,
      theme: 'striped',
      headStyles: {
        fillColor: [109, 40, 217], // Roxo #6D28D9
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'center',
        fontSize: 9
      },
      bodyStyles: {
        fontSize: 8.5,
        textColor: [0, 0, 0],
        valign: 'middle'
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 18, fontStyle: 'bold' },
        1: { halign: 'center', cellWidth: 18 },
        2: { halign: 'center', cellWidth: 20 },
        3: { cellWidth: 65, fontStyle: 'bold' },
        4: { halign: 'center', cellWidth: 40 },
        5: { cellWidth: 80 }
      },
      didDrawCell: function (data) {
        if (data.section === 'body' && data.column.index === 1) {
          const hex = data.cell.raw;
          if (hex && typeof hex === 'string') {
            const rgb = hexToRgb(hex);
            doc.setFillColor(rgb.r, rgb.g, rgb.b);
            doc.setDrawColor(76, 29, 149);
            doc.setLineWidth(0.3);
            const size = 5;
            const x = data.cell.x + (data.cell.width - size) / 2;
            const y = data.cell.y + (data.cell.height - size) / 2;
            if (isFinite(x) && isFinite(y) && isFinite(size)) {
              doc.roundedRect(x, y, size, size, 1, 1, 'FD');
            }
          }
        }
      }
    });

    // Rodapé Folha 2
    const finalY = doc.internal.pageSize.getHeight() - 6;
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text('Documento Oficial de Distribuição Comercial  |  Página 2 de 2', 14, finalY);

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
    generatePdfReport,
    downloadZipPackage
  };
})();
