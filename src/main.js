async function includeHTML(elementId, path) {
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

document.addEventListener('DOMContentLoaded', async () => {
    await includeHTML('mainNav', './inc/nav.html');
});