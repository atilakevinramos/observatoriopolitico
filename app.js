/**
 * Observatório Parlamentar
 * Arquitetura baseada em serviços para facilitação de futuras expansões (Senadores, Estaduais).
 */

const CONFIG = {
    BASE_URL: 'https://dadosabertos.camara.leg.br/api/v2',
    CACHE_EXPIRATION_MS: 1000 * 60 * 30 // 30 minutos
};

// --- MÓDULO DE SERVIÇO DE DADOS (CÂMARA DOS DEPUTADOS) ---
const FederalChamberService = {
    async fetchDeputies() {
        const response = await fetch(`${CONFIG.BASE_URL}/deputados?ordem=ASC&ordenarPor=nome`);
        if (!response.ok) throw new Error('Falha ao consultar a lista de deputados.');
        const json = await response.json();
        return json.dados;
    },

    async fetchDeputyById(id) {
        const response = await fetch(`${CONFIG.BASE_URL}/deputados/${id}`);
        if (!response.ok) throw new Error('Falha ao consultar os dados do parlamentar.');
        const json = await response.json();
        return json.dados;
    },

    async fetchDeputyExpenses(id) {
        // Busca as despesas mais recentes ordenadas por data
        const response = await fetch(`${CONFIG.BASE_URL}/deputados/${id}/despesas?ordem=DESC&ordenarPor=dataDocumento&itens=100`);
        if (!response.ok) throw new Error('Falha ao consultar despesas.');
        const json = await response.json();
        return json.dados;
    },

    async fetchDeputyPropositions(id) {
        const response = await fetch(`${CONFIG.BASE_URL}/proposicoes?idDeputadoAutor=${id}&ordem=DESC&ordenarPor=id&itens=100`);
        if (!response.ok) throw new Error('Falha ao consultar proposições.');
        const json = await response.json();
        return json.dados;
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
        showError('Não foi possível carregar os dados dos deputados federais. Verifique sua conexão e tente novamente.');
        console.error(err);
    } finally {
        showLoading(false);
    }
}

// --- RENDERIZAÇÃO E FILTROS DO DASHBOARD ---
function populateKPIs(deputies) {
    DOM.kpiTotalDeputados.textContent = deputies.length;
    
    const states = new Set(deputies.map(d => d.siglaUf));
    DOM.kpiTotalEstados.textContent = states.size;
}

function populateFilterDropdowns(deputies) {
    const states = [...new Set(deputies.map(d => d.siglaUf))].sort();
    const parties = [...new Set(deputies.map(d => d.siglaPartido))].sort();

    states.forEach(uf => {
        if (uf) {
            const opt = document.createElement('option');
            opt.value = uf;
            opt.textContent = uf;
            DOM.filterUf.appendChild(opt);
        }
    });

    parties.forEach(party => {
        if (party) {
            const opt = document.createElement('option');
            opt.value = party;
            opt.textContent = party;
            DOM.filterParty.appendChild(opt);
        }
    });
}

function applyFilters() {
    AppState.filteredDeputies = AppState.deputies.filter(deputy => {
        const matchesName = deputy.nome.toLowerCase().includes(AppState.currentSearchQuery);
        const matchesUf = AppState.currentUfFilter === '' || deputy.siglaUf === AppState.currentUfFilter;
        const matchesParty = AppState.currentPartyFilter === '' || deputy.siglaPartido === AppState.currentPartyFilter;
        return matchesName && matchesUf && matchesParty;
    });

    renderDeputiesList(AppState.filteredDeputies);
}

function renderDeputiesList(deputies) {
    DOM.deputiesGrid.innerHTML = '';

    if (deputies.length === 0) {
        DOM.deputiesGrid.innerHTML = '<p class="status-message">Nenhum deputado encontrado com os filtros selecionados.</p>';
        return;
    }

    deputies.forEach(deputy => {
        const card = document.createElement('div');
        card.className = 'deputy-card';

        const photoUrl = deputy.urlFoto || 'https://via.placeholder.com/150x200?text=Sem+Foto';
        
        card.innerHTML = `
            <img src="${photoUrl}" alt="${deputy.nome}" class="deputy-avatar" loading="lazy">
            <div class="deputy-info">
                <h3 class="deputy-name">${deputy.nome}</h3>
                <p class="deputy-meta">${deputy.siglaPartido || 'N/A'} - ${deputy.siglaUf || 'N/A'}</p>
                <button class="btn-primary" onclick="openProfile(${deputy.id})">Ver Perfil Completo</button>
            </div>
        `;
        DOM.deputiesGrid.appendChild(card);
    });
}

// --- VISÃO DE PERFIL INDIVIDUAL ---
async function openProfile(deputyId) {
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
        showError('Erro ao carregar os dados detalhados do parlamentar.');
        console.error(err);
    } finally {
        showLoading(false);
    }
}

function renderProfile(details, expenses, propositions) {
    const statusInfo = details.ultimoStatus || {};
    const photoUrl = statusInfo.urlFoto || 'https://via.placeholder.com/150x200?text=Sem+Foto';
    const startDate = details.dataNascimento ? statusInfo.data : 'Não informado pela API';

    // Processamento estrito de Despesas
    let totalSpent = 0;
    const categoryTotals = {};
    
    expenses.forEach(exp => {
        const value = exp.valorLiquido || 0;
        totalSpent += value;
        const cat = exp.tipoDespesa || 'Outras Despesas';
        categoryTotals[cat] = (categoryTotals[cat] || 0) + value;
    });

    // Processamento estrito de Proposições
    const propStats = {
        total: propositions.length,
        tramitacao: 0,
        outros: 0
    };

    // Nota: A API de listagem simples não retorna o status consolidado de "aprovado" sem consultar proposição por proposição individualmente.
    // Classificamos estritamente o que está em tramitação sem inferir aprovação.
    propositions.forEach(p => {
        if (p.statusProposicao && p.statusProposicao.ambito) {
            propStats.tramitacao++;
        } else {
            propStats.outros++;
        }
    });

    // Formatação em BRL
    const formatCurrency = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

    // HTML das categorias de despesas
    let expensesRows = Object.entries(categoryTotals)
        .map(([cat, val]) => `<tr><td>${cat}</td><td>${formatCurrency(val)}</td></tr>`)
        .join('');

    if (!expensesRows) {
        expensesRows = '<tr><td colspan="2">Nenhuma despesa declarada no lote consultado.</td></tr>';
    }

    // HTML de Proposições
    let propRows = propositions.slice(0, 10).map(p => `
        <tr>
            <td><strong>${p.siglaTipo} ${p.numero}/${p.ano}</strong></td>
            <td>${p.ementa || 'Sem ementa informada'}</td>
        </tr>
    `).join('');

    if (!propRows) {
        propRows = '<tr><td colspan="2">Nenhuma proposição recente encontrada.</td></tr>';
    }

    DOM.profileContent.innerHTML = `
        <div class="profile-header-card">
            <img src="${photoUrl}" alt="${details.nomeCivil}" class="profile-avatar">
            <div class="profile-details-main">
                <h2>${details.nomeCivil || statusInfo.nome}</h2>
                <p><strong>Nome Parlamentar:</strong> ${statusInfo.nomeParlamentar || statusInfo.nome}</p>
                <p><strong>Partido / UF:</strong> ${statusInfo.siglaPartido} - ${statusInfo.siglaUf}</p>
                <p><strong>Situação Parlamentar:</strong> ${statusInfo.situacao || 'Em Exercício'}</p>
                <p><strong>Condição de Posse:</strong> ${statusInfo.condicaoEleitoral || 'Não informada'}</p>
            </div>
        </div>

        <div class="profile-grid">
            <!-- PAINEL DE DESPESAS -->
            <div class="panel-card">
                <h3>Cota Parlamentar (Despesas)</h3>
                <p><strong>Total Gasto no Período Consultado:</strong> ${formatCurrency(totalSpent)}</p>
                
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
                <p class="source-notice">Fonte: API de Dados Abertos / Amostra dos últimos 100 lançamentos processados.</p>
            </div>

            <!-- PAINEL DE PROPOSIÇÕES -->
            <div class="panel-card">
                <h3>Proposições de Autoria</h3>
                <p><strong>Total de Proposições Apresentadas (Amostra):</strong> ${propStats.total}</p>
                
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
                    Nota: O status de aprovação definitiva exige consulta individualizada a cada norma jurídica vinculada.
                </p>
            </div>
        </div>
    `;
}

// --- AUXILIARES DE NAVEGAÇÃO E INTERFACE ---
function showListView(show = true) {
    if (show) {
        DOM.deputiesView.classList.remove('hidden');
        DOM.profileView.classList.add('hidden');
    } else {
        DOM.deputiesView.classList.add('hidden');
        DOM.profileView.classList.remove('hidden');
    }
}

function showLoading(show = true) {
    if (show) {
        DOM.loadingSpinner.classList.remove('hidden');
    } else {
        DOM.loadingSpinner.classList.add('hidden');
    }
}

function showError(msg) {
    DOM.errorMessage.textContent = msg;
    DOM.errorMessage.classList.remove('hidden');
}

function hideError() {
    DOM.errorMessage.classList.add('hidden');
}