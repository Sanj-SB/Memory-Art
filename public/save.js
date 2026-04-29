(function attachImoriaSaveFlow(windowObj) {
  if (windowObj.imoriaSaveFlow) return;

  function $(id) {
    return document.getElementById(id);
  }

  function resolveQrRenderer(windowRef) {
    const candidates = [
      windowRef && windowRef.QRCode,
      windowRef && windowRef.qrcode,
      windowRef && windowRef.QRCodeLib
    ];
    for (const candidate of candidates) {
      if (candidate && typeof candidate.toCanvas === 'function') return candidate;
    }
    return null;
  }

  async function ensureQrRenderer(windowRef) {
    const existing = resolveQrRenderer(windowRef);
    if (existing) return existing;

    const sources = [
      'https://cdn.jsdelivr.net/npm/qrcode@1.5.4/build/qrcode.min.js',
      'https://unpkg.com/qrcode@1.5.4/build/qrcode.min.js'
    ];

    for (const src of sources) {
      try {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = src;
          script.async = true;
          script.onload = () => resolve();
          script.onerror = () => reject(new Error(`Failed to load ${src}`));
          document.head.appendChild(script);
        });
        const renderer = resolveQrRenderer(windowRef);
        if (renderer) return renderer;
      } catch (e) {
        console.warn('QR script load attempt failed:', e);
      }
    }

    throw new Error('QR generator is unavailable');
  }

  class ImoriaSaveFlow {
    constructor() {
      this.initialized = false;
      this.overlay = null;
      this.choiceView = null;
      this.loadingView = null;
      this.qrView = null;
      this.errorEl = null;
      this.qrCanvas = null;
      this.qrWrap = null;
      this.qrImgFallback = null;
    }

    init() {
      if (this.initialized) return;
      this.overlay = $('saveOverlay');
      this.choiceView = $('saveModalChoiceView');
      this.loadingView = $('saveModalLoadingView');
      this.qrView = $('saveModalQrView');
      this.errorEl = $('saveModalError');
      this.qrCanvas = $('saveQrCanvas');
      this.qrWrap = $('saveQrWrap');

      const closeBtn = $('closeSaveOverlayBtn');
      const laptopBtn = $('downloadToLaptopBtn');
      const phoneBtn = $('saveOnPhoneBtn');
      const backBtn = $('saveModalBackBtn');

      if (closeBtn) closeBtn.addEventListener('click', () => this.close());
      if (backBtn) backBtn.addEventListener('click', () => this.showChoice());
      if (laptopBtn) laptopBtn.addEventListener('click', () => this.downloadToLaptop());
      if (phoneBtn) phoneBtn.addEventListener('click', () => this.saveOnPhone());

      if (this.overlay) {
        this.overlay.addEventListener('click', (e) => {
          if (e.target === this.overlay) this.close();
        });
      }

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.overlay && this.overlay.style.display === 'flex') {
          this.close();
        }
      });

      this.initialized = true;
    }

    setError(message) {
      if (this.errorEl) this.errorEl.textContent = message || '';
    }

    setView(viewName) {
      if (!this.choiceView || !this.loadingView || !this.qrView) return;
      this.choiceView.style.display = viewName === 'choice' ? 'block' : 'none';
      this.loadingView.style.display = viewName === 'loading' ? 'block' : 'none';
      this.qrView.style.display = viewName === 'qr' ? 'block' : 'none';
    }

    open() {
      this.init();
      if (!this.overlay) return;
      this.showChoice();
      this.overlay.style.display = 'flex';
    }

    close() {
      if (!this.overlay) return;
      this.overlay.style.display = 'none';
      this.setError('');
      this.setView('choice');
      if (this.qrWrap) this.qrWrap.classList.remove('is-visible');
      if (this.qrCanvas) {
        this.qrCanvas.style.display = '';
        const ctx = this.qrCanvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, this.qrCanvas.width, this.qrCanvas.height);
      }
      if (this.qrImgFallback && this.qrImgFallback.remove) {
        this.qrImgFallback.remove();
        this.qrImgFallback = null;
      }
    }

    showChoice() {
      this.setError('');
      this.setView('choice');
      if (this.qrWrap) this.qrWrap.classList.remove('is-visible');
    }

    showLoading() {
      this.setError('');
      this.setView('loading');
      if (this.qrWrap) this.qrWrap.classList.remove('is-visible');
    }

    async downloadToLaptop() {
      try {
        if (typeof exportMemoryCardForCurrentMode !== 'function') {
          throw new Error('Postcard export is unavailable');
        }
        await exportMemoryCardForCurrentMode();
        this.close();
      } catch (e) {
        console.warn('Laptop download failed:', e);
        this.setError('Could not download postcard right now.');
      }
    }

    async saveOnPhone() {
      this.showLoading();
      try {
        if (typeof exportMemoryCardBlobForCurrentMode !== 'function') {
          throw new Error('Postcard export is unavailable');
        }
        if (typeof uploadPostcardBlobAndGetSignedUrl !== 'function') {
          throw new Error('Supabase upload is unavailable');
        }
        const { blob } = await exportMemoryCardBlobForCurrentMode();
        const { signedUrl } = await uploadPostcardBlobAndGetSignedUrl(blob);

        this.setView('qr');
        await this.renderQr(signedUrl);

        requestAnimationFrame(() => {
          if (this.qrWrap) this.qrWrap.classList.add('is-visible');
        });
      } catch (e) {
        console.warn('Phone save failed:', e);
        windowObj.__imoriaLastSaveError = e;
        this.showChoice();
        const rawMsg = e && e.message ? e.message : '';
        if (/bucket.*not.*found|storage bucket "postcards" was not found/i.test(rawMsg)) {
          this.setError('Storage bucket "postcards" is missing. Create it in Supabase Storage.');
        } else if (/policy denied upload|row-level security|permission|unauthorized|forbidden/i.test(rawMsg)) {
          this.setError('Storage policy denied upload. Add INSERT policy on storage.objects for bucket_id = postcards and role authenticated.');
        } else if (/signed url/i.test(rawMsg)) {
          this.setError('Upload worked, but signed-link creation failed. Add SELECT policy on storage.objects for bucket_id = postcards and role authenticated.');
        } else if (/QR generator is unavailable/i.test(rawMsg)) {
          this.setError('QR service is currently blocked on this network. Please use "Download to Laptop" for now.');
        } else {
          this.setError(`Could not create phone save link. ${rawMsg || 'Please try again.'}`);
        }
      }
    }

    async renderQr(signedUrl) {
      if (!this.qrCanvas) throw new Error('QR canvas is unavailable');
      try {
        const qrRenderer = await ensureQrRenderer(windowObj);
        this.qrCanvas.style.display = '';
        if (this.qrImgFallback && this.qrImgFallback.remove) {
          this.qrImgFallback.remove();
          this.qrImgFallback = null;
        }
        await qrRenderer.toCanvas(this.qrCanvas, signedUrl, {
          width: 280,
          margin: 1,
          color: {
            dark: '#060A19',
            light: '#FFFFFF'
          }
        });
        return;
      } catch (e) {
        console.warn('Primary QR renderer failed, using image fallback:', e);
      }

      // Fallback: generate QR as hosted image when JS QR libs are blocked.
      const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(signedUrl)}`;
      const img = document.createElement('img');
      img.alt = 'Scan to open postcard';
      img.className = 'save-qr-canvas';
      img.src = qrSrc;

      await new Promise((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('QR generator is unavailable'));
      });

      this.qrCanvas.style.display = 'none';
      if (this.qrImgFallback && this.qrImgFallback.remove) this.qrImgFallback.remove();
      this.qrImgFallback = img;
      if (this.qrWrap) this.qrWrap.appendChild(img);
    }
  }

  windowObj.imoriaSaveFlow = new ImoriaSaveFlow();
  windowObj.openSaveModal = function openSaveModal() {
    windowObj.imoriaSaveFlow.open();
  };
})(window);
