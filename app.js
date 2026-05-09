// ════════════════════════════════════════════════════════
//  Gap AI — app.js
//  Made by Farhad
// ════════════════════════════════════════════════════════

// ─── DOM refs ─────────────────────────────────────────
const chatEl      = document.getElementById('chat');
const promptEl    = document.getElementById('prompt');
const sendBtn     = document.getElementById('send-btn');
const imgPreview  = document.getElementById('img-preview');
const plusMenu    = document.getElementById('plus-menu');
const convList    = document.getElementById('conversation-list');
const sidebar     = document.getElementById('sidebar');

// ─── State ────────────────────────────────────────────
let pendingImages        = [];   // { dataUrl, mediaType }
let conversationHistory  = [];   // OpenRouter messages array
let conversations        = [];   // saved sidebar sessions
let currentConvId        = null;
let isBusy               = false;

// ─── Backend URL (your Node.js server) ────────────────
fetch("https://gap-ai.onrender.com/api/chat"

// ══════════════════════════════════════════════════════
//  TEXTAREA
// ══════════════════════════════════════════════════════
function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 150) + 'px';
}

function updateSendBtn() {
  const active = promptEl.value.trim().length > 0 || pendingImages.length > 0;
  sendBtn.classList.toggle('active', active);
}

function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

// ══════════════════════════════════════════════════════
//  FILE / IMAGE HANDLING
// ══════════════════════════════════════════════════════
function handleFiles(files) {
  [...files].forEach(file => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = e => {
      pendingImages.push({ dataUrl: e.target.result, mediaType: file.type });
      addThumb(e.target.result, pendingImages.length - 1);
      updateSendBtn();
    };
    reader.readAsDataURL(file);
  });
  document.getElementById('file-input').value = '';
}

function addThumb(url, idx) {
  imgPreview.classList.add('has-images');
  const w = document.createElement('div');
  w.className   = 'preview-thumb';
  w.dataset.idx = idx;
  w.innerHTML   = `<img src="${url}" alt="preview"/>
                   <button class="remove-thumb" onclick="removeThumb(this)">✕</button>`;
  imgPreview.appendChild(w);
}

function removeThumb(btn) {
  const w   = btn.closest('.preview-thumb');
  const idx = parseInt(w.dataset.idx);
  pendingImages.splice(idx, 1);
  w.remove();
  imgPreview.querySelectorAll('.preview-thumb').forEach((el, i) => el.dataset.idx = i);
  if (!pendingImages.length) imgPreview.classList.remove('has-images');
  updateSendBtn();
}

// ══════════════════════════════════════════════════════
//  SEND MESSAGE  (streaming via fetch)
// ══════════════════════════════════════════════════════
async function sendMessage() {
  if (isBusy) return;
  const text = promptEl.value.trim();
  if (!text && !pendingImages.length) return;

  isBusy = true;
  hideWelcome();

  // ── User bubble ──────────────────────────────────
  let uHTML = text ? `<span>${esc(text)}</span>` : '';
  pendingImages.forEach(({ dataUrl }) => uHTML += `<img src="${dataUrl}" alt="image"/>`);
  appendMsg('user', uHTML);

  // ── Build message for API ─────────────────────────
  // We send the text. If images are attached, we mention it to the AI.
  let messageText = text;
  if (pendingImages.length > 0) {
    messageText += `\n\n[The user also attached ${pendingImages.length} image(s). Acknowledge you can see them were uploaded, but note image analysis depends on the model used.]`;
  }

  conversationHistory.push({ role: 'user', content: messageText });

  // ── Save first message as conversation title ──────
  if (conversationHistory.filter(m => m.role === 'user').length === 1) {
    saveConversationTitle(text || 'Image upload');
  }

  // ── Clear input ───────────────────────────────────
  promptEl.value = '';
  promptEl.style.height = 'auto';
  pendingImages = [];
  imgPreview.innerHTML = '';
  imgPreview.classList.remove('has-images');
  updateSendBtn();

  // ── AI bubble with typing indicator ──────────────
  const aiEl  = appendMsg('ai', '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>');
  const bubble = aiEl.querySelector('.bubble');

  try {
    // Try streaming first, fall back to normal fetch
    const reply = await fetchWithStreaming(bubble);
    conversationHistory.push({ role: 'assistant', content: reply });
    saveCurrentConversation();
  } catch (err) {
    bubble.innerHTML = `<span style="color:#f87171">⚠ ${esc(err.message)}<br><small>Make sure your server is running on port 3000.</small></span>`;
  }

  isBusy = false;
  chatEl.scrollTop = chatEl.scrollHeight;
}

// ─── Streaming fetch ──────────────────────────────────
async function fetchWithStreaming(bubble) {
  let fullText = '';

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: conversationHistory, stream: true })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Server error ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || '';

  // ── Streaming (SSE) ────────────────────────────────
  if (contentType.includes('text/event-stream')) {
    bubble.innerHTML = '<span class="cursor"></span>';
    const reader  = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') break;

        try {
          const json  = JSON.parse(data);
          const delta = json.choices?.[0]?.delta?.content || '';
          fullText   += delta;
          bubble.innerHTML = renderMarkdown(fullText) + '<span class="cursor"></span>';
          chatEl.scrollTop = chatEl.scrollHeight;
        } catch (_) {}
      }
    }

    bubble.innerHTML = renderMarkdown(fullText);
    return fullText;
  }

  // ── Non-streaming (normal JSON) ────────────────────
  const data = await response.json();
  fullText   = data.choices?.[0]?.message?.content || '_(no response)_';
  bubble.innerHTML = renderMarkdown(fullText);
  return fullText;
}

// ══════════════════════════════════════════════════════
//  MARKDOWN RENDERER  (no external library needed)
// ══════════════════════════════════════════════════════
function renderMarkdown(raw) {
  let t = raw;

  // Code blocks first (protect them)
  const blocks = [];
  t = t.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    blocks.push(`<pre><code class="lang-${lang}">${escCode(code.trim())}</code></pre>`);
    return `%%BLOCK${blocks.length - 1}%%`;
  });

  // Inline code
  t = t.replace(/`([^`]+)`/g, (_, c) => `<code>${escCode(c)}</code>`);

  // Headings
  t = t.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  t = t.replace(/^### (.+)$/gm,  '<h3>$1</h3>');
  t = t.replace(/^## (.+)$/gm,   '<h2>$1</h2>');
  t = t.replace(/^# (.+)$/gm,    '<h1>$1</h1>');

  // Blockquote
  t = t.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');

  // Bold / italic
  t = t.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  t = t.replace(/\*\*(.+?)\*\*/g,     '<strong>$1</strong>');
  t = t.replace(/\*(.+?)\*/g,         '<em>$1</em>');
  t = t.replace(/__(.+?)__/g,         '<strong>$1</strong>');
  t = t.replace(/_(.+?)_/g,           '<em>$1</em>');

  // Horizontal rule
  t = t.replace(/^---$/gm, '<hr/>');

  // Tables
  t = t.replace(/^\|(.+)\|$/gm, (line) => line); // keep as-is, process below
  t = parseTable(t);

  // Unordered lists
  t = t.replace(/(^[-*•] .+$(\n[-*•] .+$)*)/gm, match => {
    const items = match.split('\n').map(l => `<li>${l.replace(/^[-*•] /, '')}</li>`).join('');
    return `<ul>${items}</ul>`;
  });

  // Ordered lists
  t = t.replace(/(^\d+\. .+$(\n\d+\. .+$)*)/gm, match => {
    const items = match.split('\n').map(l => `<li>${l.replace(/^\d+\. /, '')}</li>`).join('');
    return `<ol>${items}</ol>`;
  });

  // Links
  t = t.replace(/\[(.+?)\]\((https?:\/\/[^\)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

  // Paragraphs
  t = t.split(/\n{2,}/).map(block => {
    if (/^<(h[1-6]|ul|ol|pre|hr|blockquote|table)/.test(block.trim())) return block;
    if (block.includes('%%BLOCK')) return block;
    return `<p>${block.replace(/\n/g, '<br/>')}</p>`;
  }).join('\n');

  // Restore code blocks
  blocks.forEach((b, i) => { t = t.replace(`%%BLOCK${i}%%`, b); });

  return t;
}

function parseTable(text) {
  const lines = text.split('\n');
  let result = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].startsWith('|') && i + 1 < lines.length && /^\|[-| :]+\|$/.test(lines[i+1])) {
      const headers = lines[i].split('|').filter(c => c.trim()).map(c => `<th>${c.trim()}</th>`).join('');
      let rows = '';
      i += 2;
      while (i < lines.length && lines[i].startsWith('|')) {
        rows += '<tr>' + lines[i].split('|').filter(c => c.trim()).map(c => `<td>${c.trim()}</td>`).join('') + '</tr>';
        i++;
      }
      result.push(`<table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`);
    } else {
      result.push(lines[i]);
      i++;
    }
  }
  return result.join('\n');
}

// ══════════════════════════════════════════════════════
//  SIDEBAR / CONVERSATIONS
// ══════════════════════════════════════════════════════
function toggleSidebar() {
  sidebar.classList.toggle('hidden');
}

function saveConversationTitle(title) {
  const id  = Date.now();
  currentConvId = id;
  const conv = { id, title: title.slice(0, 40), messages: [] };
  conversations.unshift(conv);
  renderSidebar();
}

function saveCurrentConversation() {
  const conv = conversations.find(c => c.id === currentConvId);
  if (conv) conv.messages = [...conversationHistory];
}

function renderSidebar() {
  convList.innerHTML = conversations.map(c => `
    <div class="conv-item ${c.id === currentConvId ? 'active' : ''}" onclick="loadConversation(${c.id})">
      <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      ${esc(c.title)}
    </div>`).join('');
}

function loadConversation(id) {
  const conv = conversations.find(c => c.id === id);
  if (!conv) return;
  currentConvId = id;
  conversationHistory = [...conv.messages];

  // Rebuild chat UI
  chatEl.innerHTML = '';
  for (let i = 0; i < conversationHistory.length; i++) {
    const m = conversationHistory[i];
    appendMsg(m.role === 'user' ? 'user' : 'ai',
      m.role === 'user' ? `<span>${esc(m.content)}</span>` : renderMarkdown(m.content));
  }
  renderSidebar();
}

function newChat() {
  conversationHistory = [];
  currentConvId = null;
  chatEl.innerHTML = `
    <div id="welcome">
      <div class="welcome-icon">G</div>
      <div class="welcome-title">Hi, I'm Gap AI</div>
      <div class="welcome-sub">Ask me anything — I was made by Farhad to help you.</div>
      <div class="suggestions">
        <div class="suggestion-chip" onclick="useSuggestion(this)">Who is Cristiano Ronaldo?</div>
        <div class="suggestion-chip" onclick="useSuggestion(this)">What time is it?</div>
        <div class="suggestion-chip" onclick="useSuggestion(this)">Write me a poem</div>
        <div class="suggestion-chip" onclick="useSuggestion(this)">Latest news today</div>
      </div>
    </div>`;
  renderSidebar();
}

// ══════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════
function appendMsg(role, html) {
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  div.innerHTML = `
    <div class="avatar ${role}">${role === 'ai' ? 'G' : 'U'}</div>
    <div class="bubble">${html}</div>`;
  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
  return div;
}

function hideWelcome() {
  const w = document.getElementById('welcome');
  if (!w) return;
  w.style.transition = 'opacity .3s';
  w.style.opacity = '0';
  setTimeout(() => w.remove(), 300);
}

function useSuggestion(el) {
  promptEl.value = el.textContent;
  promptEl.dispatchEvent(new Event('input'));
  promptEl.focus();
  sendMessage();
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function escCode(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Plus Menu ─────────────────────────────────────────
function toggleMenu(e) {
  e.stopPropagation();
  plusMenu.classList.toggle('open');
}

function closeMenu() { plusMenu.classList.remove('open'); }

document.addEventListener('click', e => {
  if (!document.getElementById('plus-wrap').contains(e.target)) closeMenu();
});

function pickFiles() {
  closeMenu();
  document.getElementById('file-input').click();
}

function menuAction(action) {
  closeMenu();
  const prefills = {
    'create-image':  'Create an image of: ',
    'deep-research': 'Deep research on: ',
    'web-search':    'Search the web for: ',
    'projects':      'Open project: ',
    'more':          '',
  };
  const text = prefills[action];
  if (text) {
    promptEl.value = text;
    promptEl.dispatchEvent(new Event('input'));
    promptEl.focus();
    promptEl.setSelectionRange(text.length, text.length);
  }
}