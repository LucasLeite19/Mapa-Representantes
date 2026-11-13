/**
 * MÓDULO PRINCIPAL: APP CONTROLLER
 * Coordena interface, eventos, regras de negócio e sincronização entre mapa e tabela.
 * Suporta destaque visual do Estado, detalhamento cartográfico de todas as cidades com clique direto no mapa,
 * e até 6 marcas por município. 100% volátil em memória.
 */

const App = (() => {
  const state = {
    estados: [],
    municipiosAtuais: [],
    estadoSelecionado: null,
    estadoBounds: null,
    marcas: [
      { id: 1, nome: 'Marca 1' },
      { id: 2, nome: 'Marca 2' },
      { id: 3, nome: 'Marca 3' },
      { id: 4, nome: 'Marca 4' },
      { id: 5, nome: 'Marca 5' },
      { id: 6, nome: 'Marca 6' }
    ],
    itensCadastrados: [],
    nextSeqId: 1,
    previewGeoJson: null,
    isExporting: false
  };

  /**
   * Inicialização do Sistema
   */
  async function init() {
    MapManager.init();
    bindEvents();
    renderSelectMarcas();
    setCorAtual(getRandomColor());
    await carregarEstados();
    renderTabela();
    atualizarMetricas();
  }

  /**
   * Renderiza as opções do <select id="selectMarca">
   */
  function renderSelectMarcas(municipioId = null) {
    const select = document.getElementById('selectMarca');
    if (!select) return;

    select.innerHTML = '';

    const marcasOcupadas = new Set();
    if (municipioId) {
      state.itensCadastrados
        .filter(it => String(it.municipioId) === String(municipioId))
        .forEach(it => marcasOcupadas.add(Number(it.marcaId)));
    }

    state.marcas.forEach(marca => {
      const opt = document.createElement('option');
      opt.value = marca.id;
      opt.dataset.nome = marca.nome;

      if (marcasOcupadas.has(marca.id)) {
        opt.disabled = true;
        opt.textContent = `${marca.nome} (Já cadastrada nesta cidade)`;
      } else {
        opt.textContent = marca.nome;
      }
      select.appendChild(opt);
    });

    const primeiraDisponivel = Array.from(select.options).find(opt => !opt.disabled);
    if (primeiraDisponivel) {
      select.value = primeiraDisponivel.value;
    }
  }

  /**
   * Vinculação de Eventos da Interface
   */
  function bindEvents() {
    // Seletor de Estados
    document.getElementById('selectEstado').addEventListener('change', (e) => {
      onEstadoChange(e.target.value);
    });

    // Seletor de Municípios
    document.getElementById('selectMunicipio').addEventListener('change', (e) => {
      onMunicipioChange(e.target.value);
    });

    // Checkbox para ligar/desligar visualização das divisões municipais
    const checkDivisoes = document.getElementById('checkDivisoesCidades');
    if (checkDivisoes) {
      checkDivisoes.addEventListener('change', (e) => {
        MapManager.toggleMunicipalDivisions(e.target.checked);
      });
    }

    // Campo de Representante: auto preenche cor existente
    const inputRep = document.getElementById('inputRepresentante');
    inputRep.addEventListener('input', () => {
      const nomeDigitado = inputRep.value.trim().toLowerCase();
      if (!nomeDigitado) return;

      const existente = state.itensCadastrados.find(
        it => it.representante.trim().toLowerCase() === nomeDigitado
      );
      if (existente) {
        setCorAtual(existente.cor);
      }
    });

    // Color Picker & Hex Input
    const inputCor = document.getElementById('inputCor');
    const inputCorHex = document.getElementById('inputCorHex');
    const btnCorAleatoria = document.getElementById('btnCorAleatoria');

    inputCor.addEventListener('input', (e) => {
      inputCorHex.value = e.target.value.toUpperCase();
    });

    inputCorHex.addEventListener('input', (e) => {
      let val = e.target.value.trim();
      if (!val.startsWith('#')) val = '#' + val;
      if (/^#[0-9A-F]{6}$/i.test(val)) {
        inputCor.value = val;
      }
    });

    btnCorAleatoria.addEventListener('click', () => {
      setCorAtual(getRandomColor());
    });

    // Botão Salvar Representante (Manual)
    document.getElementById('btnSalvarRepresentante').addEventListener('click', salvarRepresentanteManual);

    // Abas de Navegação (Manual vs Massa)
    const tabManual = document.getElementById('tabManual');
    const tabMassa = document.getElementById('tabMassa');
    const contentManual = document.getElementById('contentManual');
    const contentMassa = document.getElementById('contentMassa');

    tabManual.addEventListener('click', () => {
      tabManual.className = 'flex-1 py-3 px-4 text-xs sm:text-sm font-semibold border-b-2 border-indigo-600 text-indigo-600 flex items-center justify-center gap-1.5 transition-colors';
      tabMassa.className = 'flex-1 py-3 px-4 text-xs sm:text-sm font-semibold border-b-2 border-transparent text-gray-500 hover:text-gray-700 flex items-center justify-center gap-1.5 transition-colors';
      contentManual.classList.remove('hidden');
      contentMassa.classList.add('hidden');
    });

    tabMassa.addEventListener('click', () => {
      tabMassa.className = 'flex-1 py-3 px-4 text-xs sm:text-sm font-semibold border-b-2 border-indigo-600 text-indigo-600 flex items-center justify-center gap-1.5 transition-colors';
      tabManual.className = 'flex-1 py-3 px-4 text-xs sm:text-sm font-semibold border-b-2 border-transparent text-gray-500 hover:text-gray-700 flex items-center justify-center gap-1.5 transition-colors';
      contentMassa.classList.remove('hidden');
      contentManual.classList.add('hidden');
    });

    // Botões de Camadas de Fundo do Mapa
    document.querySelectorAll('.btn-tile-layer').forEach(btn => {
      btn.addEventListener('click', (e) => {
        MapManager.setTileProvider(e.currentTarget.dataset.layer);
      });
    });

    // Botão Enquadrar (Reset Zoom)
    document.getElementById('btnResetZoom').addEventListener('click', () => {
      if (state.itensCadastrados.length > 0) {
        MapManager.fitAllRegisteredCities();
      } else if (state.estadoBounds) {
        MapManager.fitToBounds(state.estadoBounds);
      } else {
        MapManager.resetToBrasil();
      }
    });

    // Botão Tela Cheia
    document.getElementById('btnFullScreen').addEventListener('click', () => {
      MapManager.toggleFullScreen();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const wrapper = document.getElementById('mapWrapper');
        if (wrapper && wrapper.classList.contains('map-fullscreen')) {
          MapManager.toggleFullScreen();
        }
      }
    });

    // Busca Rápida na Tabela
    document.getElementById('inputBuscaTabela').addEventListener('input', renderTabela);

    // Importação em Massa: Baixar Modelo
    document.getElementById('btnBaixarModelo').addEventListener('click', baixarPlanilhaModelo);

    // Importação em Massa: Upload de Arquivo
    const inputFile = document.getElementById('inputFilePlanilha');
    const dropZone = document.getElementById('dropZonePlanilha');

    dropZone.addEventListener('click', () => inputFile.click());

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('border-indigo-600', 'bg-indigo-50');
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('border-indigo-600', 'bg-indigo-50');
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('border-indigo-600', 'bg-indigo-50');
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        processarPlanilhaUpload(e.dataTransfer.files[0]);
      }
    });

    inputFile.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        processarPlanilhaUpload(e.target.files[0]);
        inputFile.value = '';
      }
    });

    // Botão Baixar Pacote (.zip)
    document.getElementById('btnBaixarPacote').addEventListener('click', baixarPacoteFinal);

    // Modal de Gerenciar Nomes das Marcas
    const btnGerenciarMarcas = document.getElementById('btnGerenciarMarcas');
    const modalMarcas = document.getElementById('modalMarcas');
    const btnFecharModalMarcas = document.getElementById('btnFecharModalMarcas');
    const btnSalvarNomesMarcas = document.getElementById('btnSalvarNomesMarcas');

    if (btnGerenciarMarcas && modalMarcas) {
      btnGerenciarMarcas.addEventListener('click', () => {
        state.marcas.forEach(m => {
          const inp = document.getElementById(`inputNomeMarca${m.id}`);
          if (inp) inp.value = m.nome;
        });
        modalMarcas.classList.remove('hidden');
      });

      btnFecharModalMarcas.addEventListener('click', () => {
        modalMarcas.classList.add('hidden');
      });

      btnSalvarNomesMarcas.addEventListener('click', () => {
        state.marcas.forEach(m => {
          const inp = document.getElementById(`inputNomeMarca${m.id}`);
          if (inp && inp.value.trim()) {
            m.nome = inp.value.trim();
          }
        });

        state.itensCadastrados.forEach(it => {
          const marcaObj = state.marcas.find(m => m.id === Number(it.marcaId));
          if (marcaObj) it.marcaNome = marcaObj.nome;
        });

        const cidadesUnicas = new Set(state.itensCadastrados.map(it => String(it.municipioId)));
        cidadesUnicas.forEach(mId => {
          const itensDaCidade = state.itensCadastrados.filter(it => String(it.municipioId) === mId);
          MapManager.syncMunicipalityLayer(mId, null, itensDaCidade);
        });

        const selectMun = document.getElementById('selectMunicipio');
        renderSelectMarcas(selectMun ? selectMun.value : null);
        renderTabela();
        modalMarcas.classList.add('hidden');
        showToast('Nomes das marcas atualizados com sucesso!', 'success');
      });
    }
  }

  /**
   * Carrega os Estados da Federação via IBGEService
   */
  async function carregarEstados() {
    const select = document.getElementById('selectEstado');
    try {
      const estados = await IBGEService.getEstados();
      state.estados = estados;

      select.innerHTML = '<option value="">Selecione um Estado...</option>';
      estados.forEach(uf => {
        const opt = document.createElement('option');
        opt.value = uf.id;
        opt.dataset.sigla = uf.sigla;
        opt.dataset.nome = uf.nome;
        opt.textContent = `${uf.nome} (${uf.sigla})`;
        select.appendChild(opt);
      });
    } catch (err) {
      console.error(err);
      select.innerHTML = '<option value="">Erro ao carregar Estados</option>';
      showToast('Falha ao carregar estados do IBGE.', 'error');
    }
  }

  /**
   * Ação ao trocar o Estado selecionado:
   * 1. Enquadra o mapa no Estado.
   * 2. Destaca as fronteiras externas do Estado.
   * 3. Carrega e exibe a divisão detalhada de todos os municípios com clique e hover.
   */
  async function onEstadoChange(estadoId) {
    const selectMunicipio = document.getElementById('selectMunicipio');
    const labelTotal = document.getElementById('labelTotalMunicipios');
    const infoModelo = document.getElementById('infoModeloEstado');

    MapManager.clearPreview();
    MapManager.clearStateHighlight();
    state.previewGeoJson = null;

    if (!estadoId) {
      state.estadoSelecionado = null;
      state.municipiosAtuais = [];
      state.estadoBounds = null;
      selectMunicipio.innerHTML = '<option value="">Selecione um Estado primeiro</option>';
      selectMunicipio.disabled = true;
      labelTotal.textContent = '';
      infoModelo.textContent = 'Nenhum Estado selecionado';
      MapManager.resetToBrasil();
      renderSelectMarcas(null);
      return;
    }

    const uf = state.estados.find(e => String(e.id) === String(estadoId));
    state.estadoSelecionado = uf;
    infoModelo.textContent = `Estado Selecionado: ${uf.nome} (${uf.sigla})`;

    // Enquadramento imediato via Bounding Box pré-computada
    const bounds = IBGEService.getEstadoBounds(uf.sigla);
    if (bounds) {
      state.estadoBounds = bounds;
      MapManager.fitToBounds(bounds);
    }

    selectMunicipio.disabled = true;
    selectMunicipio.innerHTML = '<option value="">Carregando municípios...</option>';
    labelTotal.textContent = 'Carregando malhas...';

    try {
      // 1. Carrega lista tabular dos municípios
      const municipios = await IBGEService.getMunicipios(uf.id);
      state.municipiosAtuais = municipios;
      atualizarSelectMunicipios();
      labelTotal.textContent = `${municipios.length} municípios`;

      // Cria mapa de lookup rápido: codarea (ID IBGE 7 dígitos) -> Nome
      const municipiosMap = new Map();
      municipios.forEach(m => municipiosMap.set(String(m.id), m.nome));

      // 2. Carrega simultaneamente a malha externa do Estado e as divisões municipais detalhadas
      const [malhaEstado, malhaMunicipios] = await Promise.all([
        IBGEService.getMalhaEstado(uf.sigla).catch(e => {
          console.warn('Falha contorno estado:', e);
          return null;
        }),
        IBGEService.getMalhaMunicipiosEstado(uf.sigla).catch(e => {
          console.warn('Falha divisão municípios:', e);
          return null;
        })
      ]);

      // 3. Aplica o destaque no mapa com suporte ao clique direto na cidade
      MapManager.setStateHighlight(malhaEstado, malhaMunicipios, municipiosMap, (clickedMunicipioId) => {
        // Ao clicar em uma cidade no mapa, seleciona automaticamente no <select>
        if (selectMunicipio && clickedMunicipioId) {
          selectMunicipio.value = clickedMunicipioId;
          onMunicipioChange(clickedMunicipioId);
          showToast(`Cidade selecionada no mapa!`, 'info');
        }
      });

    } catch (err) {
      console.error(err);
      selectMunicipio.innerHTML = '<option value="">Erro ao carregar municípios</option>';
      showToast('Falha ao carregar dados do IBGE para o estado.', 'error');
    } finally {
      selectMunicipio.disabled = false;
    }
  }

  /**
   * Atualiza as opções do <select id="selectMunicipio">
   */
  function atualizarSelectMunicipios() {
    const select = document.getElementById('selectMunicipio');
    const valorAnterior = select.value;
    select.innerHTML = '<option value="">Selecione um Município ou clique no mapa...</option>';

    const contagemPorCidade = new Map();
    state.itensCadastrados.forEach(it => {
      const key = String(it.municipioId);
      contagemPorCidade.set(key, (contagemPorCidade.get(key) || 0) + 1);
    });

    state.municipiosAtuais.forEach(m => {
      const opt = document.createElement('option');
      const mId = String(m.id);
      opt.value = m.id;
      opt.dataset.nome = m.nome;

      const qtdMarcas = contagemPorCidade.get(mId) || 0;
      if (qtdMarcas >= 6) {
        opt.disabled = true;
        opt.textContent = `${m.nome} (6/6 marcas - Esgotado)`;
      } else if (qtdMarcas > 0) {
        opt.textContent = `${m.nome} (${qtdMarcas}/6 marcas cadastradas)`;
      } else {
        opt.textContent = m.nome;
      }
      select.appendChild(opt);
    });

    if (valorAnterior && (contagemPorCidade.get(String(valorAnterior)) || 0) < 6) {
      select.value = valorAnterior;
    }

    renderSelectMarcas(select.value);
  }

  /**
   * Ação ao selecionar um município
   */
  async function onMunicipioChange(municipioId) {
    MapManager.clearPreview();
    state.previewGeoJson = null;

    renderSelectMarcas(municipioId);

    const helper = document.getElementById('helperMunicipio');
    if (!municipioId) {
      helper.classList.add('hidden');
      return;
    }

    helper.classList.remove('hidden');

    try {
      const geoJson = await IBGEService.getMalhaMunicipio(municipioId);
      state.previewGeoJson = geoJson;
      MapManager.showPreview(geoJson);
    } catch (err) {
      console.error(err);
      showToast('Não foi possível obter o contorno do município no IBGE.', 'warning');
    } finally {
      helper.classList.add('hidden');
    }
  }

  /**
   * Cadastro Manual: Salvar Representante
   */
  async function salvarRepresentanteManual() {
    const selectEstado = document.getElementById('selectEstado');
    const selectMunicipio = document.getElementById('selectMunicipio');
    const selectMarca = document.getElementById('selectMarca');
    const inputRep = document.getElementById('inputRepresentante');
    const inputCor = document.getElementById('inputCor');

    const estadoId = selectEstado.value;
    const municipioId = selectMunicipio.value;
    const marcaId = Number(selectMarca.value);
    const nome = inputRep.value.trim();
    const cor = inputCor.value.toUpperCase();

    if (!estadoId) {
      showToast('Selecione um Estado.', 'warning');
      return;
    }
    if (!municipioId) {
      showToast('Selecione um Município ou clique diretamente no mapa.', 'warning');
      return;
    }
    if (!marcaId) {
      showToast('Selecione uma Marca.', 'warning');
      return;
    }
    if (!nome) {
      showToast('Digite o nome do Representante.', 'warning');
      inputRep.focus();
      return;
    }

    const marcaJaExiste = state.itensCadastrados.some(
      it => String(it.municipioId) === String(municipioId) && Number(it.marcaId) === marcaId
    );
    if (marcaJaExiste) {
      showToast('Esta marca já está cadastrada para este município!', 'warning');
      return;
    }

    const totalNestaCidade = state.itensCadastrados.filter(
      it => String(it.municipioId) === String(municipioId)
    ).length;
    if (totalNestaCidade >= 6) {
      showToast('Limite máximo de 6 marcas por município atingido!', 'warning');
      return;
    }

    const optUf = selectEstado.options[selectEstado.selectedIndex];
    const optMun = selectMunicipio.options[selectMunicipio.selectedIndex];
    const optMarca = selectMarca.options[selectMarca.selectedIndex];
    const municipioNome = optMun.dataset.nome || optMun.textContent.split(' (')[0].trim();
    const marcaNome = optMarca.dataset.nome || optMarca.textContent.split(' (')[0].trim();

    let geoJson = state.previewGeoJson;
    if (!geoJson) {
      try {
        geoJson = await IBGEService.getMalhaMunicipio(municipioId);
      } catch (e) {
        showToast('Erro ao obter malha do município no IBGE.', 'error');
        return;
      }
    }

    MapManager.clearPreview();
    state.previewGeoJson = null;

    sincronizarCorRepresentante(nome, cor);

    const seqId = state.nextSeqId++;
    const item = {
      id: 'rep_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      seqId: seqId,
      estadoId: optUf.value,
      estadoSigla: optUf.dataset.sigla,
      estadoNome: optUf.dataset.nome,
      municipioId: municipioId,
      municipioNome: municipioNome,
      marcaId: marcaId,
      marcaNome: marcaNome,
      representante: nome,
      cor: cor,
      geoJson: geoJson
    };

    state.itensCadastrados.unshift(item);

    const itensDestaCidade = state.itensCadastrados.filter(it => String(it.municipioId) === String(municipioId));
    MapManager.syncMunicipalityLayer(municipioId, geoJson, itensDestaCidade);

    atualizarSelectMunicipios();
    renderTabela();
    atualizarMetricas();

    selectMunicipio.value = '';
    renderSelectMarcas(null);
    setCorAtual(getRandomColor());

    if (state.estadoBounds) {
      MapManager.fitToBounds(state.estadoBounds);
    }

    showToast(`${municipioNome} cadastrado na ${marcaNome} com sucesso (Nº ${seqId})!`, 'success');
  }

  function sincronizarCorRepresentante(nomeRep, novaCor) {
    const nomeLower = nomeRep.trim().toLowerCase();
    let atualizados = 0;
    const cidadesAfetadas = new Set();

    state.itensCadastrados.forEach(it => {
      if (it.representante.trim().toLowerCase() === nomeLower && it.cor !== novaCor) {
        it.cor = novaCor;
        cidadesAfetadas.add(String(it.municipioId));
        atualizados++;
      }
    });

    if (atualizados > 0) {
      cidadesAfetadas.forEach(mId => {
        const itensDaCidade = state.itensCadastrados.filter(it => String(it.municipioId) === mId);
        MapManager.syncMunicipalityLayer(mId, null, itensDaCidade);
      });
      renderTabela();
    }
  }

  function renderTabela() {
    const tbody = document.getElementById('tabelaCorpo');
    const badgeCount = document.getElementById('badgeTableCount');
    const termo = (document.getElementById('inputBuscaTabela').value || '').trim().toLowerCase();

    let itens = state.itensCadastrados;
    if (termo) {
      itens = itens.filter(it =>
        it.municipioNome.toLowerCase().includes(termo) ||
        it.representante.toLowerCase().includes(termo) ||
        it.marcaNome.toLowerCase().includes(termo) ||
        it.estadoSigla.toLowerCase().includes(termo) ||
        String(it.seqId).includes(termo)
      );
    }

    badgeCount.textContent = `${state.itensCadastrados.length} ${state.itensCadastrados.length === 1 ? 'item' : 'itens'}`;

    if (itens.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="py-10 text-center text-gray-400">
            ${state.itensCadastrados.length === 0 ? 'Nenhum município cadastrado ainda.' : 'Nenhum registro encontrado para a busca.'}
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = '';

    itens.forEach(item => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-gray-50 transition-colors border-b border-gray-100';

      tr.innerHTML = `
        <td class="py-3 px-4 text-center font-bold text-gray-700">
          <span class="inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-bold bg-gray-100 text-gray-800 border border-gray-300">
            Nº ${item.seqId}
          </span>
        </td>
        <td class="py-3 px-4 text-center">
          <div class="flex items-center justify-center space-x-1.5">
            <div class="w-6 h-6 rounded-md shadow-sm border border-black border-opacity-20 flex-shrink-0" style="background-color: ${item.cor};"></div>
            <span class="text-xs font-mono uppercase text-gray-500">${item.cor}</span>
          </div>
        </td>
        <td class="py-3 px-4 text-center">
          <span class="px-2 py-0.5 rounded text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
            ${item.estadoSigla}
          </span>
        </td>
        <td class="py-3 px-4 font-semibold text-gray-800">
          ${escapeHtml(item.municipioNome)}
        </td>
        <td class="py-3 px-4 text-center">
          <span class="rep-brand-badge brand-${item.marcaId}">
            ${escapeHtml(item.marcaNome)}
          </span>
        </td>
        <td class="py-3 px-4 font-medium text-gray-700">
          <div class="flex items-center gap-1.5">
            <span class="w-2.5 h-2.5 rounded-full" style="background-color: ${item.cor};"></span>
            <span>${escapeHtml(item.representante)}</span>
          </div>
        </td>
        <td class="py-3 px-4 text-center">
          <div class="flex items-center justify-center space-x-2">
            <button data-id="${item.id}" class="btn-focar text-indigo-600 hover:text-indigo-800 p-1.5 hover:bg-indigo-50 rounded-md transition-colors" title="Focar no mapa">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </button>
            <button data-id="${item.id}" class="btn-remover text-rose-500 hover:text-rose-700 p-1.5 hover:bg-rose-50 rounded-md transition-colors" title="Remover registro">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </button>
          </div>
        </td>
      `;

      tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.btn-remover').forEach(btn => {
      btn.addEventListener('click', (e) => {
        removerItem(e.currentTarget.dataset.id);
      });
    });

    tbody.querySelectorAll('.btn-focar').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        const item = state.itensCadastrados.find(it => it.id === id);
        if (item) {
          const entry = MapManager.getCityLayer(item.municipioId);
          if (entry && entry.layer) {
            const map = MapManager.getMapInstance();
            map.fitBounds(entry.layer.getBounds(), { maxZoom: 12, padding: [50, 50] });
            entry.layer.setStyle({ weight: 4, color: '#FFFFFF' });
            setTimeout(() => {
              if (entry.layer) entry.layer.setStyle({ weight: 1.8, color: '#111827' });
            }, 1800);
          }
        }
      });
    });
  }

  function removerItem(id) {
    const index = state.itensCadastrados.findIndex(it => it.id === id);
    if (index === -1) return;

    const item = state.itensCadastrados[index];
    const mId = String(item.municipioId);

    state.itensCadastrados.splice(index, 1);

    const itensRestantesDaCidade = state.itensCadastrados.filter(it => String(it.municipioId) === mId);
    MapManager.syncMunicipalityLayer(mId, null, itensRestantesDaCidade);

    atualizarSelectMunicipios();
    renderTabela();
    atualizarMetricas();

    showToast(`${item.municipioNome} (${item.marcaNome}) removido.`, 'info');
  }

  function atualizarMetricas() {
    document.getElementById('metricTotalCidades').textContent = new Set(
      state.itensCadastrados.map(it => String(it.municipioId))
    ).size;
    const reps = new Set(state.itensCadastrados.map(it => it.representante.trim().toLowerCase())).size;
    document.getElementById('metricTotalReps').textContent = reps;
  }

  function baixarPlanilhaModelo() {
    if (!state.estadoSelecionado) {
      showToast('Selecione primeiro um Estado para gerar a planilha modelo.', 'warning');
      return;
    }
    if (!state.municipiosAtuais || state.municipiosAtuais.length === 0) {
      showToast('Aguarde o carregamento dos municípios.', 'warning');
      return;
    }

    try {
      ExcelManager.downloadTemplate(
        state.estadoSelecionado.sigla,
        state.municipiosAtuais,
        state.marcas
      );
      showToast(`Modelo de planilha baixado (${state.municipiosAtuais.length} cidades).`, 'success');
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  async function processarPlanilhaUpload(file) {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      showToast('Selecione um arquivo Excel (.xlsx ou .xls).', 'error');
      return;
    }

    try {
      const rows = await ExcelManager.readImportFile(file);
      if (rows.length === 0) {
        showToast('Nenhuma linha preenchida com Representante e ID IBGE encontrada.', 'warning');
        return;
      }
      await executarImportacaoEmLote(rows);
    } catch (err) {
      console.error(err);
      showToast('Erro ao ler a planilha: ' + err.message, 'error');
    }
  }

  async function executarImportacaoEmLote(rows) {
    const modal = document.getElementById('modalProgresso');
    const txtProgresso = document.getElementById('modalProgressoTexto');
    const pctProgresso = document.getElementById('modalProgressoPorcentagem');
    const barraProgresso = document.getElementById('modalProgressoBarra');

    modal.classList.remove('hidden');

    const total = rows.length;
    let concluidos = 0;
    let adicionados = 0;
    let erros = 0;

    const coresReps = new Map();
    state.itensCadastrados.forEach(it => {
      coresReps.set(it.representante.trim().toLowerCase(), it.cor);
    });

    const cidadesModificadas = new Set();
    const batchSize = 4;

    for (let i = 0; i < total; i += batchSize) {
      const lote = rows.slice(i, i + batchSize);

      await Promise.all(lote.map(async (row) => {
        const idIbge = String(row['ID IBGE'] || row['ID'] || row['IBGE'] || row['id_ibge'] || row['Codigo']).trim();
        const nomeRep = String(row['Representante'] || row['representante'] || row['REPRESENTANTE']).trim();
        const nomeMun = String(row['Município'] || row['Municipio'] || row['municipio'] || 'Município').trim();
        const siglaUf = String(row['Estado'] || row['UF'] || row['uf'] || (state.estadoSelecionado ? state.estadoSelecionado.sigla : 'BR')).trim();
        let nomeMarca = String(row['Marca'] || row['marca'] || row['MARCA'] || '').trim();
        let corHex = String(row['Cor Hex'] || row['Cor'] || row['cor'] || '').trim().toUpperCase();

        try {
          let marcaObj = null;
          if (nomeMarca) {
            marcaObj = state.marcas.find(m => m.nome.toLowerCase() === nomeMarca.toLowerCase());
          }
          if (!marcaObj) {
            const marcasUsadas = new Set(
              state.itensCadastrados.filter(it => String(it.municipioId) === idIbge).map(it => it.marcaId)
            );
            marcaObj = state.marcas.find(m => !marcasUsadas.has(m.id)) || state.marcas[0];
          }

          const idxAntigo = state.itensCadastrados.findIndex(
            it => String(it.municipioId) === idIbge && it.marcaId === marcaObj.id
          );
          if (idxAntigo !== -1) {
            state.itensCadastrados.splice(idxAntigo, 1);
          }

          const qtdAtual = state.itensCadastrados.filter(it => String(it.municipioId) === idIbge).length;
          if (qtdAtual >= 6) {
            return;
          }

          const repKey = nomeRep.toLowerCase();
          if (!corHex || !/^#[0-9A-F]{6}$/i.test(corHex)) {
            if (coresReps.has(repKey)) {
              corHex = coresReps.get(repKey);
            } else {
              corHex = getRandomColor();
              coresReps.set(repKey, corHex);
            }
          } else {
            coresReps.set(repKey, corHex);
            sincronizarCorRepresentante(nomeRep, corHex);
          }

          const geoJson = await IBGEService.getMalhaMunicipio(idIbge);
          if (!geoJson) throw new Error('Malha vazia');

          const seqId = state.nextSeqId++;
          const item = {
            id: 'rep_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
            seqId: seqId,
            estadoId: '',
            estadoSigla: siglaUf,
            estadoNome: '',
            municipioId: idIbge,
            municipioNome: nomeMun,
            marcaId: marcaObj.id,
            marcaNome: marcaObj.nome,
            representante: nomeRep,
            cor: corHex,
            geoJson: geoJson
          };

          state.itensCadastrados.unshift(item);
          cidadesModificadas.add(idIbge);
          adicionados++;

        } catch (err) {
          console.error(`Erro no município ${idIbge}:`, err);
          erros++;
        } finally {
          concluidos++;
          const pct = Math.round((concluidos / total) * 100);
          txtProgresso.textContent = `${concluidos} de ${total} municípios`;
          pctProgresso.textContent = `${pct}%`;
          barraProgresso.style.width = `${pct}%`;
        }
      }));
    }

    cidadesModificadas.forEach(mId => {
      const itensDaCidade = state.itensCadastrados.filter(it => String(it.municipioId) === mId);
      const geoJson = itensDaCidade[0] ? itensDaCidade[0].geoJson : null;
      MapManager.syncMunicipalityLayer(mId, geoJson, itensDaCidade);
    });

    modal.classList.add('hidden');

    atualizarSelectMunicipios();
    renderTabela();
    atualizarMetricas();

    if (state.itensCadastrados.length > 0) {
      MapManager.fitAllRegisteredCities();
    }

    showToast(`Importação concluída! ${adicionados} adicionados com sucesso${erros > 0 ? `, ${erros} com falha` : ''}.`, adicionados > 0 ? 'success' : 'warning');
  }

  async function baixarPacoteFinal() {
    if (state.isExporting) return;

    if (state.itensCadastrados.length === 0) {
      showToast('Cadastre ao menos um município antes de exportar o pacote.', 'warning');
      return;
    }

    state.isExporting = true;
    const btn = document.getElementById('btnBaixarPacote');
    const btnText = document.getElementById('btnBaixarPacoteText');
    const originalText = btnText.innerHTML;

    try {
      btn.classList.add('opacity-75', 'cursor-wait');
      btnText.textContent = 'Gerando print do mapa...';

      const imageBlob = await MapManager.captureMapScreenshot();

      btnText.textContent = 'Gerando planilha estilizada...';
      const excelBuffer = await ExcelManager.generateStyledExcelBuffer(state.itensCadastrados);

      btnText.textContent = 'Compactando arquivo .zip...';
      await ExcelManager.downloadZipPackage(imageBlob, excelBuffer);

      showToast('Pacote .zip gerado e baixado com sucesso!', 'success');

    } catch (err) {
      console.error(err);
      showToast('Erro ao exportar pacote: ' + err.message, 'error');
    } finally {
      state.isExporting = false;
      btnText.innerHTML = originalText;
      btn.classList.remove('opacity-75', 'cursor-wait');
    }
  }

  function setCorAtual(corHex) {
    const val = corHex.toUpperCase();
    document.getElementById('inputCor').value = val;
    document.getElementById('inputCorHex').value = val;
  }

  function getRandomColor() {
    const hue = Math.floor(Math.random() * 360);
    return hslToHex(hue, 75, 52);
  }

  function hslToHex(h, s, l) {
    s /= 100;
    l /= 100;
    const a = s * Math.min(l, 1 - l);
    const f = n => {
      const k = (n + h / 30) % 12;
      const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
      return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
  }

  function showToast(mensagem, tipo = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `pointer-events-auto flex items-center p-3.5 rounded-xl shadow-lg border text-xs sm:text-sm font-medium transition-all transform duration-300 translate-y-2 opacity-0 max-w-sm ${
      tipo === 'success' ? 'bg-emerald-800 text-emerald-100 border-emerald-700' :
      tipo === 'error' ? 'bg-rose-800 text-rose-100 border-rose-700' :
      tipo === 'warning' ? 'bg-amber-800 text-amber-100 border-amber-700' :
      'bg-gray-800 text-gray-100 border-gray-700'
    }`;

    const icon = tipo === 'success' ? '✓' : tipo === 'error' ? '✕' : tipo === 'warning' ? '⚠' : 'ℹ';
    toast.innerHTML = `<span class="mr-2 text-base font-bold">${icon}</span><span>${mensagem}</span>`;

    container.appendChild(toast);
    requestAnimationFrame(() => {
      toast.classList.remove('translate-y-2', 'opacity-0');
    });

    setTimeout(() => {
      toast.classList.add('opacity-0', 'translate-y-2');
      setTimeout(() => toast.remove(), 300);
    }, 4000);
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
    init
  };
})();

window.addEventListener('DOMContentLoaded', App.init);
