// Carrega elementos da DOM
document.addEventListener('DOMContentLoaded', async () => {
    await incHTML('mainNav', './src/inc/nav.html');    
    await buttonFichas();
    await fichaHTML('fichas');
});

async function incHTML(elementId, path) {
    const element = document.getElementById(elementId);

    if (!element) {
        console.error(`Elemento #${elementId} não encontrado.`);
        return;
    }

    try {
        const response = await fetch(path);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        element.innerHTML = await response.text();
    } catch (error) {
        console.error(`Erro ao carregar ${path}:`, error);
    }
}


const fichas = [
    { id: 'dd', nome: 'D&D 5e', icone: 'fas fa-dice-d20' },
    { id: 't20', nome: 'Tormenta 20', icone: 'fas fa-dragon' },
    { id: 'oprpg', nome: 'Ordem Paranormal', icone: 'fas fa-eye' }
];

async function fichaHTML(elementId) {
    const element = document.getElementById(elementId);

    if (!element) {
        console.error(`Elemento #${elementId} não encontrado.`);
        return;
    }

    for (const ficha of fichas) {
        try {
            const response = await fetch(`./src/fichas/${ficha.id}.html`);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const html = await response.text();

            const div = document.createElement('div');
            div.id = `ficha-${ficha.id}`;
            div.innerHTML = html;

            // Esconde as fichas inicialmente
            div.hidden = true;

            element.appendChild(div);

            console.log(`Ficha ${ficha.nome} carregada.`);
        } catch (error) {
            console.error(`Erro ao carregar ${ficha.id}.html:`, error);
        }
    }
}

function buttonFichas() {
    const vSystemOptions = document.getElementById('systemOptions');

    if (!vSystemOptions) {
        console.error('Elemento #systemOptions não encontrado.');
        return;
    }

    // Evita duplicar os botões
    vSystemOptions.replaceChildren();

    for (const ficha of fichas) {
        const button = document.createElement('button');

        button.type = 'button';
        button.dataset.system = ficha.id;
        button.setAttribute('role', 'tab');
        button.setAttribute('aria-selected', 'false');

        const icon = document.createElement('i');
        icon.className = ficha.icone;
        icon.setAttribute('aria-hidden', 'true');

        button.append(icon, document.createTextNode(` ${ficha.nome}`));

        button.addEventListener('click', () => {
            selecionarFicha(ficha.id);
        });

        vSystemOptions.appendChild(button);
    }
}