
/**
 * Observatório Parlamentar
 * Consulta dados oficiais da Câmara dos Deputados.
 */

// --- CONFIGURAÇÕES ---
const CONFIG = {
    API_URL: 'https://dadosabertos.camara.leg.br/api/v2',

    // Chave de API do CorsProxy
    // Cole sua chave entre as aspas abaixo.
    PROXY_API_KEY: 'bb1421f8',

    ITEMS_PER_PAGE: 100,
    CACHE_EXPIRATION_MS: 1000 * 60 * 30
};

// --- CONSTRUÇÃO DA URL DO PROXY ---
function buildProxyUrl(endpoint) {
    const targetUrl = `${CONFIG.API_URL}${endpoint}`;

    const params = new URLSearchParams({
        key: CONFIG.PROXY_API_KEY,
        url: targetUrl
    });

    return `https://corsproxy.io/?${params.toString()}`;
}

// --- MÓDULO DE SERVIÇO DE DADOS ---
const FederalChamberService = {

    async request(endpoint) {
        const url = buildProxyUrl(endpoint);

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(
                `Erro HTTP ${response.status} ao consultar a API.`
            );
        }

        return await response.json();
    },

    // Busca todas as páginas de um endpoint paginado.
    async fetchAllPages(endpoint) {
        let allData = [];
        let page = 1;

        while (true) {
            const separator = endpoint.includes('?') ? '&' : '?';

            const paginatedEndpoint =
                `${endpoint}${separator}pagina=${page}&itens=${CONFIG.ITEMS_PER_PAGE}`;

            const json = await this.request(paginatedEndpoint);

            const data = json.dados || [];

            allData = allData.concat(data);

            if (data.length < CONFIG.ITEMS_PER_PAGE) {
                break;
            }

            page++;

            // Proteção contra paginação excessiva.
            if (page > 100) {
                console.warn('Limite de páginas atingido.');
                break;
            }
        }

        return allData;
    },

    async fetchDeputies() {
        return await this.fetchAllPages(
            '/deputados?ordem=ASC&ordenarPor=nome'
        );
    },

    async fetchDeputyById(id) {
        const json = await this.request(`/deputados/${id}`);
        return json.dados;
    },

    async fetchDeputyExpenses(id) {
        const anoAtual = new Date().getFullYear();

        return await this.fetchAllPages(
            `/deputados/${id}/despesas?ano=${anoAtual}&ordem=DESC&ordenarPor=dataDocumento`
        );
    },

    async fetchDeputyPropositions(id) {
        const json = await this.request(
            `/proposicoes?idDeputadoAutor=${id}&ordem=DESC&ordenarPor=id&pagina=1&itens=${CONFIG.ITEMS_PER_PAGE}`
        );

        return json.dados || [];
    }
};

// --- ESTADO DA APLICAÇÃO ---
const AppState = {
    deputies: [],
    filteredDeputies: [],
    selectedDeputy: null,
    currentUfFilter: '',
    currentPartyFilter: '',
    currentSearchQuery: ''
};

// --- ELEMENTOS DA INTERFACE ---
const DOM = {
    kpiTotalDeputados: document.getElementById('kpi-total-deputados'),
    kpiTotalEstados: document.getElementById('kpi-total-estados'),
    searchInput: document.getElementById('search-input'),
    filterUf: document.getElementById('filter-uf'),
    filterParty: document.getElementById('filter-party'),
    loadingSpinner: document.getElementById('loading-spinner'),
    errorMessage: document.getElementById('error-message'),
    deputiesView: document.getElementById('deputies-view'),
    deputiesGrid: document.getElementById('deputies-grid'),
    profileView: document.getElementById('profile-view'),
    profileContent: document.getElementById('profile-content'),
    btnBack: document.getElementById('btn-back')
};

// --- INICIALIZAÇÃO ---
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

async function initApp() {
    setupEventListeners();
    await loadInitialData();
}

// --- EVENTOS ---
function setupEventListeners() {

    DOM.searchInput.addEventListener('input', (e) => {
        AppState.currentSearchQuery = e.target.value.toLowerCase().trim();
        applyFilters();
    });

    DOM.filterUf.addEventListener('change', (e) => {
        AppState.currentUfFilter = e.target.value;
        applyFilters();
    });

    DOM.filterParty.addEventListener('change', (e) => {
        AppState.currentPartyFilter = e.target.value;
        applyFilters();
    });

    DOM.btnBack.addEventListener('click', () => {
        showListView();
        hideError();
    });

    // Evento dos botões de perfil.
    DOM.deputiesGrid.addEventListener('click', (e) => {
        const button = e.target.closest('[data-deputy-id]');

        if (button) {
            openProfile(Number(button.dataset.deputyId));
        }
    });
}

// --- CARREGAMENTO INICIAL ---
async function loadInitialData() {
    showLoading(true);
    hideError();

    try {
        const deputies = await FederalChamberService.fetchDeputies();

        AppState.deputies = deputies;
        AppState.filteredDeputies = deputies;

        populateKPIs(deputies);
        populateFilterDropdowns(deputies);
        renderDeputiesList(deputies);

    } catch (err) {
        console.error('Erro ao carregar deputados:', err);

        showError(
            'Não foi possível carregar os dados dos deputados federais. ' +
            'Verifique sua conexão, o acesso ao CorsProxy e tente novamente.'
        );

    } finally {
        showLoading(false);
    }
}

// --- INDICADORES DO DASHBOARD ---
function populateKPIs(deputies) {
    DOM.kpiTotalDeputados.textContent = deputies.length;

    const states = new Set(
        deputies.map(d => d.siglaUf).filter(Boolean)
    );

    DOM.kpiTotalEstados.textContent = states.size;
}

// --- FILTROS ---
function populateFilterDropdowns(deputies) {

    DOM.filterUf.innerHTML =
        '<option value="">Todos os Estados</option>';

    DOM.filterParty.innerHTML =
        '<option value="">Todos os Partidos</option>';

    const states = [
        ...new Set(deputies.map(d => d.siglaUf).filter(Boolean))
    ].sort();

    const parties = [
        ...new Set(deputies.map(d => d.siglaPartido).filter(Boolean))
    ].sort();

    states.forEach(uf => {
        const option = document.createElement('option');
        option.value = uf;
        option.textContent = uf;
        DOM.filterUf.appendChild(option);
    });

    parties.forEach(party => {
        const option = document.createElement('option');
        option.value = party;
        option.textContent = party;
        DOM.filterParty.appendChild(option);
    });
}

function applyFilters() {
    AppState.filteredDeputies = AppState.deputies.filter(deputy => {

        const name = (deputy.nome || '').toLowerCase();

        const matchesName =
            name.includes(AppState.currentSearchQuery);

        const matchesUf =
            AppState.currentUfFilter === '' ||
            deputy.siglaUf === AppState.currentUfFilter;

        const matchesParty =
            AppState.currentPartyFilter === '' ||
            deputy.siglaPartido === AppState.currentPartyFilter;

        return matchesName && matchesUf && matchesParty;
    });

    renderDeputiesList(AppState.filteredDeputies);
}

// --- SEGURANÇA PARA EXIBIÇÃO DE TEXTOS ---
function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => {
        const entities = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };

        return entities[char];
    });
}

// --- LISTA DE DEPUTADOS ---
function renderDeputiesList(deputies) {
    DOM.deputiesGrid.innerHTML = '';

    if (deputies.length === 0) {
        DOM.deputiesGrid.innerHTML =
            '<p class="status-message">Nenhum deputado encontrado com os filtros selecionados.</p>';

        return;
    }

    deputies.forEach(deputy => {

        const card = document.createElement('div');
        card.className = 'deputy-card';

        const photoUrl = escapeHTML(
            deputy.urlFoto ||
            'https://via.placeholder.com/150x200?text=Sem+Foto'
        );

        const name = escapeHTML(deputy.nome);
        const party = escapeHTML(deputy.siglaPartido || 'N/A');
        const uf = escapeHTML(deputy.siglaUf || 'N/A');

        card.innerHTML = `
            <img
                src="${photoUrl}"
                alt="${name}"
                class="deputy-avatar"
                loading="lazy"
            >

            <div class="deputy-info">
                <h3 class="deputy-name">${name}</h3>

                <p class="deputy-meta">
                    ${party} - ${uf}
                </p>

                <button
                    class="btn-primary"
                    data-deputy-id="${Number(deputy.id)}"
                >
                    Ver Perfil Completo
                </button>
            </div>
        `;

        DOM.deputiesGrid.appendChild(card);
    });
}

// --- PERFIL INDIVIDUAL ---
async function openProfile(deputyId) {

    AppState.selectedDeputy = deputyId;

    showListView(false);

    DOM.profileContent.innerHTML = '';

    showLoading(true);
    hideError();

    try {

        const [details, expenses, propositions] = await Promise.all([

            FederalChamberService.fetchDeputyById(deputyId),

            FederalChamberService.fetchDeputyExpenses(deputyId),

            FederalChamberService.fetchDeputyPropositions(deputyId)

        ]);

        renderProfile(details, expenses, propositions);

    } catch (err) {

        console.error('Erro ao carregar perfil:', err);

        showError(
            'Erro ao carregar os dados detalhados do parlamentar. ' +
            'Tente novamente.'
        );

    } finally {
        showLoading(false);
    }
}

// --- RENDERIZAÇÃO DO PERFIL ---
function renderProfile(details, expenses, propositions) {

    const statusInfo = details.ultimoStatus || {};

    const photoUrl = escapeHTML(
        statusInfo.urlFoto ||
        'https://via.placeholder.com/150x200?text=Sem+Foto'
    );

    // --- DESPESAS ---
    let totalSpent = 0;

    const categoryTotals = {};

    expenses.forEach(exp => {

        const value = Number(exp.valorLiquido) || 0;

        totalSpent += value;

        const category = exp.tipoDespesa || 'Outras Despesas';

        categoryTotals[category] =
            (categoryTotals[category] || 0) + value;
    });

    const formatCurrency = (value) => {

        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(value);
    };

    const expensesRows = Object.entries(categoryTotals)

        .map(([category, value]) => `
            <tr>
                <td>${escapeHTML(category)}</td>
                <td>${formatCurrency(value)}</td>
            </tr>
        `)

        .join('') ||

        '<tr><td colspan="2">Nenhuma despesa encontrada no período consultado.</td></tr>';

    // --- PROPOSIÇÕES ---
    const propRows = propositions.slice(0, 10)

        .map(proposition => `
            <tr>
                <td>
                    <strong>
                        ${escapeHTML(proposition.siglaTipo)}
                        ${escapeHTML(proposition.numero)}/${escapeHTML(proposition.ano)}
                    </strong>
                </td>

                <td>
                    ${escapeHTML(
                        proposition.ementa || 'Sem ementa informada'
                    )}
                </td>
            </tr>
        `)

        .join('') ||

        '<tr><td colspan="2">Nenhuma proposição recente encontrada.</td></tr>';

    const currentYear = new Date().getFullYear();

    const deputyName = escapeHTML(
        details.nomeCivil ||
        statusInfo.nome ||
        'Nome não informado'
    );

    const parliamentaryName = escapeHTML(
        statusInfo.nomeParlamentar ||
        statusInfo.nome ||
        'Não informado'
    );

    const party = escapeHTML(statusInfo.siglaPartido || 'Não informado');

    const uf = escapeHTML(statusInfo.siglaUf || 'Não informado');

    const situation = escapeHTML(
        statusInfo.situacao || 'Não informada'
    );

    const electionCondition = escapeHTML(
        statusInfo.condicaoEleitoral || 'Não informada'
    );

    DOM.profileContent.innerHTML = `

        <div class="profile-header-card">

            <img
                src="${photoUrl}"
                alt="${deputyName}"
                class="profile-avatar"
            >

            <div class="profile-details-main">

                <h2>${deputyName}</h2>

                <p>
                    <strong>Nome Parlamentar:</strong>
                    ${parliamentaryName}
                </p>

                <p>
                    <strong>Partido / UF:</strong>
                    ${party} - ${uf}
                </p>

                <p>
                    <strong>Situação Parlamentar:</strong>
                    ${situation}
                </p>

                <p>
                    <strong>Condição de Posse:</strong>
                    ${electionCondition}
                </p>

            </div>

        </div>

        <div class="profile-grid">

            <div class="panel-card">

                <h3>Cota Parlamentar (Despesas)</h3>

                <p>
                    <strong>Total Gasto em ${currentYear}:</strong>
                    ${formatCurrency(totalSpent)}
                </p>

                <table class="data-table">

                    <thead>
                        <tr>
                            <th>Categoria da Despesa</th>
                            <th>Valor Total</th>
                        </tr>
                    </thead>

                    <tbody>
                        ${expensesRows}
                    </tbody>

                </table>

                <p class="source-notice">
                    Fonte: API de Dados Abertos da Câmara dos Deputados.
                    Período: ${currentYear}.
                    Foram consultadas as páginas disponíveis da API.
                </p>

            </div>

            <div class="panel-card">

                <h3>Proposições de Autoria</h3>

                <p>
                    <strong>Proposições encontradas:</strong>
                    ${propositions.length}
                </p>

                <table class="data-table">

                    <thead>
                        <tr>
                            <th>Tipo / Número</th>
                            <th>Ementa</th>
                        </tr>
                    </thead>

                    <tbody>
                        ${propRows}
                    </tbody>

                </table>

                <p class="source-notice">
                    Fonte: API de Dados Abertos da Câmara dos Deputados.
                    Consulta limitada às 100 proposições mais recentes.
                    A quantidade encontrada não representa necessariamente
                    toda a produção legislativa do parlamentar.
                </p>

            </div>

        </div>
    `;
}

// --- NAVEGAÇÃO ---
function showListView(show = true) {

    if (show) {

        DOM.deputiesView.classList.remove('hidden');

        DOM.profileView.classList.add('hidden');

    } else {

        DOM.deputiesView.classList.add('hidden');

        DOM.profileView.classList.remove('hidden');
    }
}

// --- CARREGAMENTO ---
function showLoading(show = true) {

    if (show) {

        DOM.loadingSpinner.classList.remove('hidden');

    } else {

        DOM.loadingSpinner.classList.add('hidden');
    }
}

// --- MENSAGENS ---
function showError(message) {

    DOM.errorMessage.textContent = message;

    DOM.errorMessage.classList.remove('hidden');
}

function hideError() {

    DOM.errorMessage.classList.add('hidden');
}
