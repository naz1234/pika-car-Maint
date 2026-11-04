const dialog = document.querySelector('#pdfViewer');
const title = document.querySelector('#pdfTitle');
const pages = document.querySelector('#pdfPages');
const status = document.querySelector('#pdfStatus');
const pageLabel = document.querySelector('#pdfPageLabel');
const retry = document.querySelector('#pdfRetry');
const controls = [...dialog.querySelectorAll('[data-pdf-control]')];
let current;
let library;
let libraryAttempt = 0;

function updateControls(session, loading = false) {
  const ready = session.pdf && !loading;
  for (const button of controls) {
    const action = button.dataset.pdfControl;
    button.disabled = !ready || (action === 'previous' && session.page === 1) ||
      (action === 'next' && session.page === session.pdf.numPages) ||
      (action === 'out' && session.zoom <= 1) || (action === 'in' && session.zoom >= 3);
  }
  pageLabel.textContent = session.pdf ? `Page ${session.page} of ${session.pdf.numPages}` : 'Loading…';
  dialog.querySelector('[data-pdf-control="fit"]').textContent = `${Math.round(session.zoom * 100)}%`;
}

function showError(session) {
  if (current !== session) return;
  status.textContent = 'This PDF could not be displayed. Check your connection and try again, or use Back to return.';
  retry.hidden = false;
  updateControls(session);
  if (!session.pdf) pageLabel.textContent = 'Not loaded';
}

async function renderPage(session) {
  const generation = ++session.generation;
  session.renderTask?.cancel();
  updateControls(session, true);
  retry.hidden = true;
  status.textContent = 'Loading page…';
  try {
    const page = await session.pdf.getPage(session.page);
    if (current !== session || generation !== session.generation) return;
    const base = page.getViewport({ scale: 1 });
    const fitWidth = Math.max(200, pages.clientWidth - 24);
    const viewport = page.getViewport({ scale: Math.min(fitWidth, 1100) / base.width * session.zoom });
    // Keep a single page in memory and stay below mobile canvas size limits.
    const density = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(4000000 / (viewport.width * viewport.height)));
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width * density);
    canvas.height = Math.floor(viewport.height * density);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', `${session.document.filename}, page ${session.page} of ${session.pdf.numPages}`);
    pages.replaceChildren(canvas);
    pages.scrollTo(0, 0);
    session.renderTask = page.render({ canvasContext: canvas.getContext('2d'), viewport,
      transform: [density, 0, 0, density, 0, 0] });
    await session.renderTask.promise;
    if (current !== session || generation !== session.generation) return;
    status.textContent = '';
    updateControls(session);
  } catch (error) {
    if (error.name !== 'RenderingCancelledException' && generation === session.generation) showError(session);
  }
}

function release() {
  const session = current;
  current = null;
  session?.renderTask?.cancel();
  session?.loadingTask?.destroy().catch(() => {});
  pages.replaceChildren();
}

export async function openDocument(document) {
  release();
  const session = current = { document, page: 1, zoom: 1, generation: 0 };
  title.textContent = document.filename;
  status.textContent = 'Opening PDF…';
  retry.hidden = true;
  updateControls(session, true);
  if (!dialog.open) dialog.showModal();
  try {
    const suffix = libraryAttempt ? `?retry=${libraryAttempt}` : '';
    library ||= import(`/vendor/pdfjs/pdf.min.mjs${suffix}`);
    const pdfjs = await library;
    if (current !== session) return;
    pdfjs.GlobalWorkerOptions.workerSrc = `/vendor/pdfjs/pdf.worker.min.mjs${suffix}`;
    session.loadingTask = pdfjs.getDocument({
      url: `/api/documents/${document.id}`,
      cMapUrl: '/vendor/pdfjs/cmaps/', standardFontDataUrl: '/vendor/pdfjs/standard_fonts/',
      wasmUrl: '/vendor/pdfjs/wasm/', useWasm: false, disableFontFace: true, disableWorkerRendering: true
    });
    session.pdf = await session.loadingTask.promise;
    if (current === session) await renderPage(session);
  } catch {
    if (current === session) {
      // Browsers cache failed module imports, including a failed worker fallback.
      library = null;
      libraryAttempt++;
      showError(session);
    }
  }
}

dialog.querySelector('#pdfBack').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', release);
retry.addEventListener('click', () => {
  if (current?.pdf) renderPage(current);
  else if (current) openDocument(current.document);
});
for (const button of controls) button.addEventListener('click', () => {
  if (!current?.pdf) return;
  const action = button.dataset.pdfControl;
  if (action === 'previous') current.page--;
  if (action === 'next') current.page++;
  if (action === 'out') current.zoom = Math.max(1, current.zoom - 0.5);
  if (action === 'in') current.zoom = Math.min(3, current.zoom + 0.5);
  if (action === 'fit') current.zoom = 1;
  renderPage(current);
});
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (current?.pdf) renderPage(current); }, 150);
});
