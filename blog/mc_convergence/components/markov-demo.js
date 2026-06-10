const SIZE_CLASS = {
  default: 'markov-embed-frame',
  medium: 'markov-embed-frame-medium',
  large: 'markov-embed-frame-large',
  'large-ish': 'markov-embed-frame-large-ish'
};

class MarkovDemo extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.config = null;
    this.iframe = null;
    this.ready = false;
    this.onMessage = this.onMessage.bind(this);
    this.onFrameLoad = this.onFrameLoad.bind(this);
  }

  connectedCallback() {
    this.render();
    window.addEventListener('message', this.onMessage);
    this.loadConfig();
  }

  disconnectedCallback() {
    window.removeEventListener('message', this.onMessage);
    if (this.iframe) {
      this.iframe.removeEventListener('load', this.onFrameLoad);
    }
  }

  render() {
    const size = this.getAttribute('size') || 'default';
    const frameClass = SIZE_CLASS[size] || SIZE_CLASS.default;
    const viewerSrc = this.getAttribute('viewer-src') || './viewer.html';

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          width: 100%;
          box-sizing: border-box;
        }

        .markov-embed-wrapper {
          max-width: 100%;
          margin: 0 auto;
        }

        iframe {
          display: block;
          width: 100%;
          border: 0;
          border-radius: 10px;
          overflow: hidden;
          background: white;
        }

        .markov-embed-frame {
          height: clamp(320px, 52vh, 390px);
        }

        .markov-embed-frame-medium {
          height: clamp(400px, 62vh, 500px);
        }

        .markov-embed-frame-large {
          height: clamp(560px, 76vh, 700px);
        }

        .markov-embed-frame-large-ish {
          height: clamp(500px, 70vh, 620px);
        }

        @media (max-width: 700px) {
          .markov-embed-frame,
          .markov-embed-frame-medium,
          .markov-embed-frame-large,
          .markov-embed-frame-large-ish {
            height: min(82dvh, 620px);
            min-height: 430px;
          }
        }
      </style>
      <div class="markov-embed-wrapper">
        <iframe class="${frameClass}" src="${viewerSrc}" title="${this.titleText()}"></iframe>
      </div>
    `;

    this.iframe = this.shadowRoot.querySelector('iframe');
    this.iframe.addEventListener('load', this.onFrameLoad);
  }

  titleText() {
    return this.getAttribute('title') || 'Interactive Markov chain demo';
  }

  async loadConfig() {
    const configUrl = this.getAttribute('config');
    if (!configUrl) {
      console.error('<markov-demo> missing config attribute.');
      return;
    }

    try {
      const response = await fetch(configUrl, { credentials: 'same-origin' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      this.config = await response.json();
      this.sendConfig();
    } catch (error) {
      console.error(`Failed to load Markov demo config: ${configUrl}`, error);
    }
  }

  onFrameLoad() {
    this.ready = true;
    this.sendConfig();
  }

  onMessage(event) {
    if (!this.iframe || event.source !== this.iframe.contentWindow) return;
    if (event.data && event.data.type === 'markovViewerReady') {
      this.ready = true;
      this.sendConfig();
    }
  }

  sendConfig() {
    if (!this.ready || !this.config || !this.iframe || !this.iframe.contentWindow) return;
    this.iframe.contentWindow.postMessage(this.messagePayload(), '*');
  }

  messagePayload() {
    const payload = {
      type: 'loadMarkovConfig',
      config: this.config,
      mode: this.getAttribute('mode') || 'sample',
      allowPanning: this.getAttribute('allow-panning') === 'true'
    };

    this.copyAttr(payload, 'start-state-label', 'startStateLabel');
    this.copyAttr(payload, 'start-black-state-label', 'startBlackStateLabel');
    this.copyAttr(payload, 'start-green-state-label', 'startGreenStateLabel');
    this.copyAttr(payload, 'proof-target-state-label', 'proofTargetStateLabel');
    this.copyNumberAttr(payload, 'start-state-id', 'startStateId');
    this.copyNumberAttr(payload, 'start-black-state-id', 'startBlackStateId');
    this.copyNumberAttr(payload, 'start-green-state-id', 'startGreenStateId');
    this.copyNumberAttr(payload, 'proof-target-state-id', 'proofTargetStateId');

    return payload;
  }

  copyAttr(payload, attr, key) {
    const value = this.getAttribute(attr);
    if (value !== null && value !== '') payload[key] = value;
  }

  copyNumberAttr(payload, attr, key) {
    const raw = this.getAttribute(attr);
    if (raw === null || raw === '') return;
    const value = Number(raw);
    if (Number.isFinite(value)) payload[key] = value;
  }
}

customElements.define('markov-demo', MarkovDemo);
