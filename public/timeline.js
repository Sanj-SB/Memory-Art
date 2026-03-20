// Timeline side panel helpers.

function openTimeline() {
  const panel = document.getElementById('timelinePanel');
  if (!panel) return;
  console.log(`[DEBUG:TIMELINE] Opening timeline panel`);
  populateTimeline();
  panel.classList.add('open');
}

function closeTimeline() {
  const panel = document.getElementById('timelinePanel');
  if (panel) {
    console.log(`[DEBUG:TIMELINE] Closing timeline panel`);
    panel.classList.remove('open');
  }
}

function populateTimeline() {
  const origEl = document.getElementById('tlOriginal');
  const entriesEl = document.getElementById('tlEntries');
  if (!origEl || !entriesEl) return;

  const mem = (rawFocusIdx >= 0 && rawFocusIdx < memories.length) ? memories[rawFocusIdx] : null;
  if (!mem) {
    console.log(`[DEBUG:TIMELINE] populateTimeline: no valid memory at index ${rawFocusIdx}`);
    origEl.textContent = '';
    entriesEl.innerHTML = '<div class="tl-empty">no memory selected</div>';
    return;
  }

  console.log(`[DEBUG:TIMELINE] Populating for memory #${rawFocusIdx}: "${mem.originalSentence}" (${(mem.timeline || []).length} entries)`);
  origEl.textContent = `"${mem.originalSentence}"`;

  const tl = mem.timeline || [];
  if (tl.length <= 1) {
    entriesEl.innerHTML = '<div class="tl-empty">no changes yet — this memory is unchanged</div>';
    return;
  }

  let html = '';
  for (let i = tl.length - 1; i >= 0; i--) {
    const entry = tl[i];
    const ago = formatTimeAgo(entry.time);
    if (entry.type === 'created') {
      html += `<div class="tl-entry">
        <div class="tl-entry-label">born · ${ago}</div>
        <div class="tl-entry-text">"${entry.text}"</div>
      </div>`;
    } else if (entry.type === 'merge') {
      const simPct = entry.similarity ? `${(entry.similarity * 100).toFixed(0)}% similarity` : '';
      const srcA = entry.prev || '';
      const srcB = entry.partnerSentence || '';
      html += `<div class="tl-entry">
        <div class="tl-entry-label">merged · ${ago}</div>
        <div class="tl-entry-text">"${entry.text}"</div>
        ${simPct ? `<div class="tl-entry-sim">${simPct}</div>` : ''}
        ${srcA && srcB ? `<div class="tl-entry-merge-meta">merged from:<br>"${srcA}" + "${srcB}"</div>` : ''}
      </div>`;
    } else if (entry.type === 'recall') {
      html += `<div class="tl-entry">
        <div class="tl-entry-label">recalled · ${ago}</div>
        <div class="tl-entry-text">"${entry.text}"</div>
      </div>`;
    }
  }
  entriesEl.innerHTML = html;
}
