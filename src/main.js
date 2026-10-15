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

async function fichaHTML(elementId) {
    
    const element = document.getElementById(elementId);

    if (!element) {
        console.error(`Elemento #${elementId} não encontrado.`);
        return;
    }

    const fichas = ['dd', 't20'];
    for (const ficha of fichas) {
        try {
            const response = await fetch(`./src/fichas/${ficha}.html`);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const html = await response.text();

            console.log(`Ficha carregada: ${ficha}`, html);

        } catch (error) {
            console.error(`Erro ao carregar ${ficha}.html:`, error);
        }
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    await incHTML('mainNav', './src/inc/nav.html');
    await fichaHTML('fichas');
});