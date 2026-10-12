/* Shared helpers: logging, banners, settings, and the signed-in session. */
var BS = BS || {};

BS.log = function(msg) {
	try { console.log("[bsky] " + msg); } catch (e) {}
};

BS.banner = function(text) {
	try {
		enyo.windows.addBannerMessage(String(text), "{}");
	} catch (e) {
		BS.log(text);
	}
};

// ---- settings, as plain strings ----

BS.pref = function(key, fallback) {
	try {
		var v = localStorage.getItem("bs." + key);
		return v === null || v === undefined ? fallback : v;
	} catch (e) {
		return fallback;
	}
};

BS.setPref = function(key, value) {
	try { localStorage.setItem("bs." + key, String(value)); } catch (e) {}
};

// A setting that holds a list or an object.
BS.stored = function(key, fallback) {
	try {
		var v = enyo.json.parse(BS.pref(key, ""));
		return v === null || v === undefined ? fallback : v;
	} catch (e) {
		return fallback;
	}
};

BS.store = function(key, value) {
	BS.setPref(key, enyo.json.stringify(value));
};

// ---- the session: tokens and who we are, kept on the tablet ----
// {accessJwt, refreshJwt, did, handle}. Treat the tablet accordingly.

BS.session = function() {
	return BS.stored("session", null);
};

BS.setSession = function(s) {
	BS.store("session", s);
};

BS.clearSession = function() {
	try { localStorage.removeItem("bs.session"); } catch (e) {}
};

BS.loggedIn = function() {
	var s = BS.session();
	return !!(s && s.accessJwt && s.did);
};

// ---- saved posts (bookmarks), kept on the tablet, newest first ----

BS.SAVED_MAX = 200;

BS.saved = function() {
	return BS.stored("saved", []);
};

BS.isSaved = function(uri) {
	var list = BS.saved();
	for (var i = 0; i < list.length; i++) {
		if (list[i].uri === uri) { return true; }
	}
	return false;
};

// Add or remove; returns whether it is saved afterwards.
BS.toggleSave = function(post) {
	var list = BS.saved();
	for (var i = 0; i < list.length; i++) {
		if (list[i].uri === post.uri) {
			list.splice(i, 1);
			BS.store("saved", list);
			return false;
		}
	}
	list.unshift(post);
	if (list.length > BS.SAVED_MAX) { list.length = BS.SAVED_MAX; }
	BS.store("saved", list);
	return true;
};

// Copy text to the clipboard where the WebKit allows it; returns success.
BS.copyText = function(text) {
	try {
		var ta = document.createElement("textarea");
		ta.value = String(text);
		ta.style.position = "absolute";
		ta.style.left = "-9999px";
		document.body.appendChild(ta);
		ta.select();
		var ok = document.execCommand && document.execCommand("copy");
		document.body.removeChild(ta);
		return !!ok;
	} catch (e) {
		return false;
	}
};

// ---- small formatters ----

BS.count = function(n) {
	n = Number(n) || 0;
	if (n >= 1000000) { return (Math.round(n / 100000) / 10) + "M"; }
	if (n >= 1000) { return (Math.round(n / 100) / 10) + "K"; }
	return String(n);
};

// "just now", "5m", "3h", "2d", or a date for anything older than a week.
BS.timeAgo = function(iso) {
	if (!iso) { return ""; }
	var then = new Date(iso).getTime();
	if (!then) { return ""; }
	var secs = Math.max(0, Math.floor((new Date().getTime() - then) / 1000));
	if (secs < 45) { return "now"; }
	if (secs < 90) { return "1m"; }
	var mins = Math.floor(secs / 60);
	if (mins < 60) { return mins + "m"; }
	var hrs = Math.floor(mins / 60);
	if (hrs < 24) { return hrs + "h"; }
	var days = Math.floor(hrs / 24);
	if (days < 7) { return days + "d"; }
	var d = new Date(then);
	return (d.getMonth() + 1) + "/" + d.getDate() + "/" + String(d.getFullYear()).substring(2);
};

// Text straight into HTML content.
BS.escape = function(text) {
	return String(text === undefined || text === null ? "" : text)
		.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
};

// Is this a YouTube link? Those open in the MeTube app instead.
BS.youtubeUrl = function(url) {
	var m = /^https?:\/\/([^\/]+)/i.exec(url || "");
	if (!m) { return false; }
	var host = m[1].toLowerCase().replace(/^(www|m)\./, "");
	return host === "youtube.com" || host === "youtu.be" ||
		host === "youtube-nocookie.com" || host === "music.youtube.com";
};

// The record key (last path part) of an at:// URI, for deleting likes and reposts.
BS.rkeyOf = function(uri) {
	var s = String(uri || "");
	return s.substring(s.lastIndexOf("/") + 1);
};

// ---- images ----
// This WebKit cannot decode the WebP that cdn.bsky.app serves, and its image
// loader cannot reach that host anyway. So fetch the bytes over XHR (which does
// work), asking the CDN for JPEG with an "@jpeg" suffix, and hand WebKit a
// data: URI. Results are cached, since avatars repeat across a feed.

BS.imgCache = {};
BS._imgKeys = [];
BS.IMG_CACHE_MAX = 300;

// Smaller avatars: the thumbnail preset is a few KB instead of ~100.
BS.avatarThumb = function(url) {
	return url ? String(url).replace("/img/avatar/", "/img/avatar_thumbnail/") : url;
};

// Paint a picture as a control's CSS background, fetched over XHR as a data: URI.
BS.bg = function(ctrl, url) {
	if (!url) { ctrl.applyStyle("background-image", "none"); return; }
	BS.imgLoad(url, function(data) {
		if (data) { ctrl.applyStyle("background-image", "url(" + data + ")"); }
	});
};

// callback(dataUri) — "" if it could not be had.
BS.imgLoad = function(url, callback) {
	if (!url) { callback(""); return; }
	if (BS.imgCache.hasOwnProperty(url)) { callback(BS.imgCache[url]); return; }
	var fetchUrl = url;
	if (/cdn\.bsky\.app/.test(url)) {
		fetchUrl = String(url).replace(/@[a-z]+$/i, "") + "@jpeg";
	}
	var xhr = new XMLHttpRequest();
	var done = false;
	var timer = setTimeout(function() {
		try { xhr.abort(); } catch (e) {}
		finish("");
	}, 30000);
	function finish(v) {
		if (done) { return; }
		done = true;
		clearTimeout(timer);
		BS.imgCache[url] = v;
		BS._imgKeys.push(url);
		if (BS._imgKeys.length > BS.IMG_CACHE_MAX) {
			delete BS.imgCache[BS._imgKeys.shift()];
		}
		callback(v);
	}
	try {
		xhr.open("GET", fetchUrl, true);
		try { xhr.overrideMimeType("text/plain; charset=x-user-defined"); } catch (e) {}
		xhr.onreadystatechange = function() {
			if (xhr.readyState !== 4) { return; }
			var d = xhr.responseText || "";
			if (xhr.status !== 200 || !d.length) { finish(""); return; }
			try {
				var b0 = d.charCodeAt(0) & 0xff, b1 = d.charCodeAt(1) & 0xff;
				var mime = (b0 === 0x89 && b1 === 0x50) ? "image/png" :
					(b0 === 0x47 && b1 === 0x49) ? "image/gif" : "image/jpeg";
				var bytes = [];
				for (var i = 0; i < d.length; i++) {
					bytes.push(String.fromCharCode(d.charCodeAt(i) & 0xff));
				}
				finish("data:" + mime + ";base64," + btoa(bytes.join("")));
			} catch (e) {
				finish("");
			}
		};
		xhr.send(null);
	} catch (e) {
		finish("");
	}
};

// ---- emoji ----
// This WebKit's font has no color emoji, so they come out as tofu boxes. Swap
// each for a Twemoji PNG, fetched through the same image loader (which turns it
// into a data: URI this WebKit can show). If one can't be had, the original
// character is put back rather than left blank.

BS.EMOJI_BASE = "https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/72x72/";
BS.EMOJI_BLANK = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
BS._emN = 0;

// Emoji clusters: flags, keycaps, the BMP symbol ranges, and astral emoji with
// their skin tones and ZWJ sequences.
BS.EMOJI_RE = /(?:\uD83C[\uDDE6-\uDDFF]){2}|[#*0-9]️?⃣|(?:[©®‼⁉™ℹ↔-↙↩↪⌚⌛⌨⏏⏩-⏳⏸-⏺Ⓜ▪▫▶◀◻-◾☀-⛿✀-➿⤴⤵⬅-⬇⬛⬜⭐⭕〰〽㊗㊙]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|\uD83E[\uDC00-\uDFFF])(?:️|\uD83C[\uDFFB-\uDFFF])?(?:‍(?:[☀-➿]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|\uD83E[\uDC00-\uDFFF])(?:️|\uD83C[\uDFFB-\uDFFF])?)*/g;

// The codepoints of a cluster (no String.codePointAt on this engine).
BS.codePoints = function(str) {
	var cps = [];
	for (var i = 0; i < str.length; i++) {
		var cc = str.charCodeAt(i);
		if (cc >= 0xD800 && cc <= 0xDBFF && i + 1 < str.length) {
			var cc2 = str.charCodeAt(i + 1);
			if (cc2 >= 0xDC00 && cc2 <= 0xDFFF) {
				cps.push((cc - 0xD800) * 0x400 + (cc2 - 0xDC00) + 0x10000);
				i++;
				continue;
			}
		}
		cps.push(cc);
	}
	return cps;
};

// Twemoji's filename rule: drop the FE0F variation selector unless the cluster
// is a ZWJ sequence; join the codepoints in hex with hyphens.
BS.twemojiName = function(cluster) {
	var cps = BS.codePoints(cluster);
	var hasZWJ = false, i;
	for (i = 0; i < cps.length; i++) { if (cps[i] === 0x200D) { hasZWJ = true; break; } }
	var hex = [];
	for (i = 0; i < cps.length; i++) {
		if (!hasZWJ && cps[i] === 0xFE0F) { continue; }
		hex.push(cps[i].toString(16));
	}
	return hex.join("-");
};

// Turn text into HTML with <img> placeholders for emoji; returns {html, list},
// list being [{id, url, cluster}] to fill in once the nodes exist.
BS.emojiHtml = function(text) {
	text = String(text === undefined || text === null ? "" : text);
	var re = BS.EMOJI_RE;
	re.lastIndex = 0;
	var out = "", last = 0, m, list = [];
	while ((m = re.exec(text))) {
		out += BS.escape(text.substring(last, m.index)).replace(/\n/g, "<br>");
		var cluster = m[0];
		var name = BS.twemojiName(cluster);
		if (name) {
			var id = "em" + (BS._emN++);
			list.push({id: id, url: BS.EMOJI_BASE + name + ".png", cluster: cluster});
			out += "<img id='" + id + "' class='bs-emoji' src='" + BS.EMOJI_BLANK + "'>";
		} else {
			out += BS.escape(cluster);
		}
		last = m.index + cluster.length;
	}
	out += BS.escape(text.substring(last)).replace(/\n/g, "<br>");
	return {html: out, list: list};
};

// Fill the <img> placeholders made by emojiHtml. Call once their nodes exist.
BS.fillEmoji = function(list) {
	for (var i = 0; i < list.length; i++) {
		(function(e) {
			BS.imgLoad(e.url, function(data) {
				var n = document.getElementById(e.id);
				if (!n) { return; }
				if (data) { n.src = data; }
				else if (n.parentNode) { n.parentNode.replaceChild(document.createTextNode(e.cluster), n); }
			});
		})(list[i]);
	}
};
