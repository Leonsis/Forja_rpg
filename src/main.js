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

    try {
        const response = await fetch('./src/fichas/dd.html');

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        element.innerHTML = await response.text();
    } catch (error) {
        console.error(`Erro ao carregar ./src/fichas/dd.html:`, error);
    }
    /*
    try {
        const response2 = await fetch('./src/fichas/dd.html');

        if (!response2.ok) {
            throw new Error(`HTTP ${response2.status}`);
        }

        element.innerHTML = await response2.text();
    } catch (error) {
        console.error(`Erro ao carregar ./src/fichas/dd.html:`, error);
    }*/
}

document.addEventListener('DOMContentLoaded', async () => {
    await incHTML('mainNav', './src/inc/nav.html');
    await fichaHTML('fichas');
});