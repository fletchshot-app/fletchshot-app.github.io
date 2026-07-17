/* Fletch LP 共有スクリプト */

/* ============================================================
   ★ 公開前に必ず設定: メール登録フォーム（FAQ内「アップデートだけ知りたい」）の送信先。
   Formspree なら "https://formspree.io/f/XXXXXXXX"。
   空のままだと送信時に案内メッセージを出すだけで送信しない。
   ============================================================ */
var FORM_ENDPOINT = "https://formspree.io/f/mgojqeqw";

/* ============================================================
   ★ 公開前に必ず設定: Mac App Store の製品ページURL。
   審査通過 → 発行された URL に差し替える。
   プレースホルダ（idXXXXXXXXXX を含む）のままだと [data-store] は
   全ボタンがdisabled表示になる（誤って古いリンクを撒かないための安全弁）。
   ============================================================ */
var APP_STORE_URL = "https://apps.apple.com/app/idXXXXXXXXXX"; // TODO: replace at launch

/* ============================================================
   （任意）ストアCTAクリックの自前計測エンドポイント（outbound beacon）。
   空文字のままなら何も送信しない no-op。設定する場合は intent=store-click を
   受けられる別エンドポイント（Formspreeの別フォーム等）を用意すること。
   ============================================================ */
var STORE_BEACON_ENDPOINT = "";

(function () {
  "use strict";

  /* --- 流入元計測: ?src=hn|x|hatena をhiddenフィールドへ --- */
  var src = new URLSearchParams(location.search).get("src") || "direct";

  /* --- Mac App Store CTA: URL注入・プレースホルダ安全弁・outbound計測 --- */
  var storePlaceholder = /idXXXXXXXXXX/.test(APP_STORE_URL);
  document.querySelectorAll("[data-store]").forEach(function (a) {
    if (storePlaceholder) {
      a.classList.add("disabled");
      a.setAttribute("aria-disabled", "true");
      a.addEventListener("click", function (e) { e.preventDefault(); });
      return;
    }
    var url = APP_STORE_URL + (APP_STORE_URL.indexOf("?") >= 0 ? "&" : "?") + "src=" + encodeURIComponent(src);
    a.setAttribute("href", url);
    a.addEventListener("click", function () {
      if (!STORE_BEACON_ENDPOINT) return;
      var lang = document.documentElement.lang;
      var body = new URLSearchParams({ intent: "store-click", src: src, lang: lang });
      if (navigator.sendBeacon) {
        navigator.sendBeacon(STORE_BEACON_ENDPOINT, body);
      } else {
        fetch(STORE_BEACON_ENDPOINT, { method: "POST", body: body, keepalive: true }).catch(function () {});
      }
    });
  });

  /* --- メール登録フォーム（FAQ内「アップデートだけ知りたい」の1つのみ） --- */
  document.querySelectorAll("form.signup").forEach(function (form) {
    var hidden = form.querySelector('input[name="source"]');
    if (hidden) hidden.value = src;

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var msg = form.parentElement.querySelector(".formmsg");
      var lang = document.documentElement.lang;
      if (!FORM_ENDPOINT) {
        msg.className = "formmsg err";
        msg.textContent = lang === "ja"
          ? "（準備中：フォーム送信先が未設定です）"
          : "(Not wired up yet: form endpoint is not configured)";
        return;
      }
      var btn = form.querySelector("button");
      btn.disabled = true;
      fetch(FORM_ENDPOINT, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: new FormData(form),
      })
        .then(function (r) {
          if (!r.ok) throw new Error("bad status");
          msg.className = "formmsg ok";
          msg.textContent = lang === "ja"
            ? "登録した。次のメジャーアップデートまで、他には何も送らない。"
            : "You're in. Next email is the next major release.";
          form.reset();
        })
        .catch(function () {
          msg.className = "formmsg err";
          msg.textContent = lang === "ja"
            ? "送信に失敗した。時間をおいてもう一度試してほしい。"
            : "Something failed. Please try again in a moment.";
        })
        .finally(function () {
          btn.disabled = false;
        });
    });
  });

  /* --- 実機メディア枠 ---
     素材（lp/media/）が未配置・読み込み失敗の figure は枠ごと隠す。
     公開時に素材が揃っていなくてもページが破れない保険。 */
  var reduceMotionMedia = matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.querySelectorAll("figure[data-media]").forEach(function (fig) {
    var m = fig.querySelector("img, video");
    if (!m) return;
    m.addEventListener("error", function () { fig.style.display = "none"; });
    if (m.tagName === "VIDEO" && reduceMotionMedia) {
      /* 動きを抑える設定の閲覧者には自動再生せず、手動再生に切り替える */
      m.removeAttribute("autoplay");
      m.pause();
      m.controls = true;
    }
  });

  /* --- 選択範囲フレーム演出のサイズ表示（装飾のみ。本物の値を出す。フレームは複数ある） --- */
  document.querySelectorAll(".capture-decor").forEach(function (cap) {
    var readout = cap.querySelector(".readout");
    if (!readout || !("ResizeObserver" in window)) return;
    new ResizeObserver(function () {
      readout.textContent =
        Math.round(cap.offsetWidth) + " × " + Math.round(cap.offsetHeight);
    }).observe(cap);
  });

  /* ヒーローの矢印はページ先頭の装飾フレームを指す */
  var capture = document.querySelector(".capture-decor");

  /* --- ヒーローの tapered arrow（始点細→矢頭へ太る塗り面。製品の魂） --- */
  var canvas = document.getElementById("arrowCanvas");
  var hero = document.querySelector(".hero");
  var fromEl = document.getElementById("arrowFrom");
  if (!canvas || !hero || !fromEl || !capture) return;

  var reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  function pinkColor() {
    return getComputedStyle(document.documentElement).getPropertyValue("--pink").trim();
  }

  /* 始点→終点をゆるい曲線で結び、幅を tail→tip に線形補間した輪郭を塗る。
     実物採寸（2026-07-06）: Skitchの矢印は付け根（始点）が細く、矢頭に向かって太くなる */
  function drawTaperedArrow(ctx, x0, y0, x1, y1, w, t) {
    var dx = x1 - x0, dy = y1 - y0;
    var len = Math.hypot(dx, dy);
    if (len < 40) return;

    /* 描画進行 t (0..1): 終点を曲線上で手前に */
    var cx = (x0 + x1) / 2 + -dy * 0.18; /* 垂直方向にふくらませる制御点 */
    var cy = (y0 + y1) / 2 + dx * 0.18;
    function q(s) {
      var u = 1 - s;
      return {
        x: u * u * x0 + 2 * u * s * cx + s * s * x1,
        y: u * u * y0 + 2 * u * s * cy + s * s * y1,
      };
    }
    /* 接線は導関数で厳密に取る。差分近似だと s=sHead の最終点で
       p2-p=(0,0) → atan2(0,0)=0 に化け、矢頭の付け根で輪郭が折れる */
    function qAngle(s) {
      var u = 1 - s;
      return Math.atan2(
        2 * u * (cy - y0) + 2 * s * (y1 - cy),
        2 * u * (cx - x0) + 2 * s * (x1 - cx)
      );
    }
    var end = q(t);
    var headLen = Math.min(len * t * 0.30, w * 3.6) * (0.4 + 0.6 * t);
    /* 矢頭の付け根位置（曲線上を少し戻る） */
    var sHead = Math.max(0.05, t - headLen / len);
    var hb = q(sHead);
    var ang = Math.atan2(end.y - hb.y, end.x - hb.x);

    var tailHalf = w * 0.16;
    var tipHalf = w * 0.85;
    var headHalf = w * 1.75;

    var steps = 40;
    var left = [], right = [];
    for (var i = 0; i <= steps; i++) {
      var s = (i / steps) * sHead;
      var p = q(s);
      var a = qAngle(s);
      var half = tailHalf + (tipHalf - tailHalf) * (s / sHead);
      left.push({ x: p.x + Math.cos(a + Math.PI / 2) * half, y: p.y + Math.sin(a + Math.PI / 2) * half });
      right.push({ x: p.x + Math.cos(a - Math.PI / 2) * half, y: p.y + Math.sin(a - Math.PI / 2) * half });
    }

    ctx.beginPath();
    ctx.moveTo(left[0].x, left[0].y);
    left.forEach(function (p) { ctx.lineTo(p.x, p.y); });
    /* 矢頭（塗り三角） */
    ctx.lineTo(hb.x + Math.cos(ang + Math.PI / 2) * headHalf, hb.y + Math.sin(ang + Math.PI / 2) * headHalf);
    ctx.lineTo(end.x, end.y);
    ctx.lineTo(hb.x + Math.cos(ang - Math.PI / 2) * headHalf, hb.y + Math.sin(ang - Math.PI / 2) * headHalf);
    for (var j = right.length - 1; j >= 0; j--) ctx.lineTo(right[j].x, right[j].y);
    ctx.closePath();
    ctx.fillStyle = pinkColor();
    ctx.fill();
  }

  var progress = reduceMotion ? 1 : 0;
  var raf = null;

  function render() {
    var rect = hero.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    var ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);
    if (getComputedStyle(canvas).display === "none") return;

    var f = fromEl.getBoundingClientRect();
    var c = capture.getBoundingClientRect();
    var x0 = f.right - rect.left + 36;
    var y0 = f.top - rect.top + f.height / 2;
    var x1 = c.right - rect.left - 30;
    var y1 = c.top - rect.top - 26;
    drawTaperedArrow(ctx, x0, y0, x1, y1, 11, Math.max(0.05, progress));
  }

  function animate() {
    progress = Math.min(1, progress + 0.028);
    /* ease-out */
    render();
    if (progress < 1) raf = requestAnimationFrame(animate);
  }

  window.addEventListener("resize", render);
  if (reduceMotion) {
    render();
  } else {
    setTimeout(function () { raf = requestAnimationFrame(animate); }, 350);
  }
})();
