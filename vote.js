(function () {
  var room = new URLSearchParams(location.search).get('room') || ROOM;
  var box = document.getElementById('box');
  var store = {};
  try { store = JSON.parse(localStorage.getItem('aiVotes') || '{}'); } catch (e) {}
  function save() { try { localStorage.setItem('aiVotes', JSON.stringify(store)); } catch (e) {} }
  var me = store.me;
  if (!me) { me = store.me = Math.random().toString(36).slice(2) + Date.now().toString(36); save(); }

  var current = null, resets = {}, ready = false, sending = false;
  function key(p) { return p + ':' + (resets[p] || 0); }

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }

  var picked = [], draft = '';
  function shuffled(p) {
    var n = POLLS[p].opts.length, a = [], h = 0, i;
    for (i = 0; i < n; i++) a.push(i);
    for (i = 0; i < me.length; i++) h = (h * 31 + me.charCodeAt(i)) >>> 0;
    for (i = n - 1; i > 0; i--) { h = (h * 1103515245 + 12345) >>> 0; var j = h % (i + 1), t = a[i]; a[i] = a[j]; a[j] = t; }
    if (a.every(function (x, k) { return x === k; })) a.reverse();
    return a;
  }
  function btn(cls, text, fn, dis) { var b = el('button', cls, text); b.type = 'button'; b.onclick = fn; b.disabled = !!dis || sending; return b; }

  function render() {
    box.innerHTML = '';
    if (!current) { box.appendChild(el('p', 'wait', 'Please wait for the first question…')); return; }
    var poll = POLLS[current], type = poll.type || 'choice';
    var mine = store[key(current)];
    box.appendChild(el('p', 'q', poll.q));

    if (type === 'order') {
      if (mine !== undefined && !box.editing) {
        box.appendChild(el('p', 'thanks', 'Sent! Look at the screen.'));
        var ol = el('ol', 'mylist');
        mine.forEach(function (i) { ol.appendChild(el('li', '', poll.opts[i])); });
        box.appendChild(ol);
        box.appendChild(btn('opt small-btn', 'Change my answer', function () { box.editing = true; picked = []; render(); }));
        return;
      }
      box.appendChild(el('p', 'small left', 'Tap the steps in the correct order: first step first.'));
      var list = el('div', 'opts');
      shuffled(current).forEach(function (i) {
        var at = picked.indexOf(i);
        var b = btn('opt' + (at >= 0 ? ' chosen' : ''), '', function () { if (picked.indexOf(i) < 0) { picked.push(i); render(); } }, at >= 0);
        b.appendChild(el('span', 'num', at >= 0 ? String(at + 1) : ''));
        b.appendChild(el('span', '', poll.opts[i]));
        list.appendChild(b);
      });
      box.appendChild(list);
      var row = el('div', 'row');
      row.appendChild(btn('ghostbtn', 'Start again', function () { picked = []; render(); }, !picked.length));
      row.appendChild(btn('sendbtn', 'Send', function () { send({ seq: picked.slice() }, picked.slice(), function () { box.editing = false; }); }, picked.length !== poll.opts.length));
      box.appendChild(row);
      return;
    }

    if (type === 'text') {
      var ta = el('textarea', 'ta');
      ta.maxLength = 140; ta.rows = 4; ta.placeholder = 'Write your sentence in English…';
      ta.setAttribute('aria-label', 'Your answer');
      ta.value = draft || (typeof mine === 'string' ? mine : '');
      var cnt = el('p', 'small right', ta.value.length + ' / 140');
      ta.oninput = function () { draft = ta.value; cnt.textContent = ta.value.length + ' / 140'; sb.disabled = !ta.value.trim() || sending; };
      box.appendChild(ta); box.appendChild(cnt);
      var sb = btn('sendbtn', mine !== undefined ? 'Send again' : 'Send', function () { var v = ta.value.trim(); send({ txt: v }, v, function () { draft = ''; }); }, !ta.value.trim());
      box.appendChild(sb);
      if (mine !== undefined) box.appendChild(el('p', 'thanks', 'Thank you! Your sentence is on the screen.'));
      return;
    }

    var list2 = el('div', 'opts');
    poll.opts.forEach(function (o, i) {
      var b = btn('opt' + (mine === i ? ' chosen' : ''), '', function () { send({ o: i }, i); });
      b.appendChild(el('span', 'dot c' + i));
      b.appendChild(el('span', '', o));
      list2.appendChild(b);
    });
    box.appendChild(list2);
    if (mine !== undefined) {
      box.appendChild(el('p', 'thanks', 'Thank you! Your answer is on the screen.'));
      box.appendChild(el('p', 'small', 'You can tap another answer to change it.'));
    }
  }

  function send(payload, keep, after) {
    var p = current;
    payload.t = 'vote'; payload.p = p; payload.v = me; payload.at = Date.now();
    sending = true; render();
    fetch(NTFY + '/' + room, { method: 'POST', body: JSON.stringify(payload) })
      .then(function (r) { if (!r.ok) throw new Error(r.status); store[key(p)] = keep; save(); if (after) after(); })
      .catch(function () { alert('Sorry, your answer was not sent. Please try again.'); })
      .then(function () { sending = false; render(); });
  }

  function handle(msg) {
    var d; try { d = JSON.parse(msg); } catch (e) { return; }
    if (!d || !POLLS[d.p]) return;
    if (d.t === 'open') { if (current !== d.p) { picked = []; draft = ''; box.editing = false; } current = d.p; if (ready) render(); }
    else if (d.t === 'reset') { resets[d.p] = (resets[d.p] || 0) + 1; if (ready && d.p === current) render(); }
  }

  var es = new EventSource(NTFY + '/' + room + '/sse?since=all');
  es.onopen = function () { setTimeout(function () { ready = true; render(); }, 400); };
  es.onmessage = function (e) {
    var j; try { j = JSON.parse(e.data); } catch (x) { return; }
    if (j.event === 'message') handle(j.message);
  };
  es.onerror = function () { if (!current) { box.innerHTML = ''; box.appendChild(el('p', 'wait', 'Connecting… please check your internet.')); } };
})();
