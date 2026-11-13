/**
 * MÓDULO: EXCEL & ZIP MANAGER
 * Responsável por:
 * 1. SheetJS: Geração e leitura da planilha modelo com suporte a Marcas (.xlsx).
 * 2. ExcelJS: Geração da planilha final estilizada (célula Cor em ARGB, coluna Marca e Representante colorido em negrito).
 * 3. JSZip & FileSaver.js: Empacotamento do print do mapa e da planilha em um arquivo .zip.
 */

const ExcelManager = (() => {

  function hexToArgb(hex) {
    if (!hex) return 'FF000000';
    const clean = hex.replace('#', '').trim().toUpperCase();
    if (clean.length === 6) return 'FF' + clean;
    if (clean.length === 3) return 'FF' + clean.split('').map(c => c + c).join('');
    return 'FF000000';
  }

  /**
   * Baixa a Planilha Modelo para o Estado Selecionado com a coluna "Marca" (SheetJS)
   */
  function downloadTemplate(estadoSigla, municipios, marcasDisponiveis) {
    if (!municipios || municipios.length === 0) {
      throw new Error('Nenhum município disponível para gerar o modelo.');
    }

    const marcaPadrao = marcasDisponiveis && marcasDisponiveis[0] ? marcasDisponiveis[0].nome : 'Marca 1';

    // Colunas: ID IBGE, Estado, Município, Marca, Representante, Cor Hex
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

    // Filtrar apenas linhas com "Representante" e "ID IBGE" preenchidos
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

    // Colunas: Nº, Cor, Estado, Município, Marca, Representante
    sheet.columns = [
      { header: 'Nº', key: 'seq', width: 8 },
      { header: 'Cor', key: 'cor', width: 12 },
      { header: 'Estado', key: 'estado', width: 12 },
      { header: 'Município', key: 'municipio', width: 30 },
      { header: 'Marca', key: 'marca', width: 18 },
      { header: 'Representante', key: 'representante', width: 30 }
    ];

    // Estilo do Cabeçalho
    const headerRow = sheet.getRow(1);
    headerRow.height = 28;
    headerRow.eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1F2937' } // Gray-800
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF374151' } },
        bottom: { style: 'medium', color: { argb: 'FF111827' } },
        left: { style: 'thin', color: { argb: 'FF374151' } },
        right: { style: 'thin', color: { argb: 'FF374151' } }
      };
    });

    // Ordenar pelo sequencial Nº crescente do mapa
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

      // Célula Nº
      const cellSeq = row.getCell('seq');
      cellSeq.alignment = { vertical: 'middle', horizontal: 'center' };
      cellSeq.font = { bold: true, size: 10, color: { argb: 'FF374151' } };

      // Célula Cor: Fundo pintado com a cor exata em ARGB, sem texto
      const cellCor = row.getCell('cor');
      cellCor.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: argbColor }
      };

      // Célula Estado
      const cellEstado = row.getCell('estado');
      cellEstado.alignment = { vertical: 'middle', horizontal: 'center' };
      cellEstado.font = { bold: true, size: 10, color: { argb: 'FF4F46E5' } };

      // Célula Município
      const cellMun = row.getCell('municipio');
      cellMun.alignment = { vertical: 'middle', horizontal: 'left' };
      cellMun.font = { size: 10, color: { argb: 'FF111827' } };

      // Célula Marca
      const cellMarca = row.getCell('marca');
      cellMarca.alignment = { vertical: 'middle', horizontal: 'center' };
      cellMarca.font = { bold: true, size: 10, color: { argb: 'FF4B5563' } };

      // Célula Representante: Escrito com a MESMA COR em NEGRITO
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
   * Empacota o print do mapa e a planilha Excel em .zip e inicia o download
   */
  async function downloadZipPackage(imageBlob, excelBuffer) {
    const zip = new JSZip();

    zip.file('mapa_representantes.png', imageBlob);
    zip.file('tabela_representantes.xlsx', excelBuffer);

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
    downloadZipPackage
  };
})();
