// HLS video relay for the Bluesky app (node 0.4.12 on webOS CE, ES5 only).
//
// The TouchPad's media player fetches over its 2011 HTTP stack (libsoup + GnuTLS
// 2), which cannot reach a modern HTTPS server, and GStreamer also refuses a
// playlist the CDN labels "text/plain". webOS CE's /usr/bin/curl can fetch the
// real stream; this relay serves it back on 127.0.0.1 over plain HTTP, with the
// correct content type, so hlsdemux picks it up.
//
// A playlist (/p/<url>) is fetched, its variant and segment URLs rewritten to
// point back here, and served as application/vnd.apple.mpegurl. A segment
// (/s/<url>) is streamed straight through, range requests included. Only Bluesky
// hosts are relayed, so this is not an open proxy.

if (typeof require === "undefined") {
	require = IMPORTS.require;
}

var http = require("http");
var urlmod = require("url");
var child_process = require("child_process");

var CURL = "/usr/bin/curl";
var AGENT = "Bluesky-webOS/0.1";

var server = null;
var port = 0;
var waiting = [];

function log(msg) {
	try { console.log("[bshls] " + msg); } catch (e) {}
}

// base64url, so a whole URL fits in a path segment.
function enc(s) {
	return new Buffer(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function dec(s) {
	s = String(s).replace(/-/g, "+").replace(/_/g, "/");
	while (s.length % 4) { s += "="; }
	return new Buffer(s, "base64").toString("utf8");
}

// Only Bluesky's own hosts are relayed.
function allowed(u) {
	var m = /^https?:\/\/([^\/]+)/i.exec(u || "");
	if (!m) { return false; }
	var host = m[1].toLowerCase().replace(/:\d+$/, "");
	return /(^|\.)bsky\.app$/.test(host) || /(^|\.)bsky\.network$/.test(host) ||
		/(^|\.)bsky\.social$/.test(host);
}

// A URL in a playlist -> a full local relay URL, resolved against the playlist.
// Full URLs (not /p paths): gst 0.10's hlsdemux resolves absolute paths naively
// and would produce /p//p/..., so spell out host and port.
function local(ref, base) {
	ref = String(ref).replace(/^\s+|\s+$/g, "");
	if (!ref) { return ref; }
	var abs = urlmod.resolve(base, ref);
	if (!allowed(abs)) { return ref; }
	return "http://127.0.0.1:" + port + (/\.m3u8(\?|$)/i.test(abs) ? "/p/" : "/s/") + enc(abs);
}

// The first variant URL of a master playlist (lowest rendition — kinder to the
// old decoder, and it avoids the device measuring the fast local relay as a huge
// bitrate and thrashing between variants).
function firstVariant(text, base) {
	var lines = text.split(/\r?\n/);
	for (var i = 0; i < lines.length; i++) {
		if (/^#EXT-X-STREAM-INF/i.test(lines[i])) {
			for (var j = i + 1; j < lines.length; j++) {
				var l = lines[j].replace(/^\s+|\s+$/g, "");
				if (l && l.charAt(0) !== "#") { return urlmod.resolve(base, l); }
			}
		}
	}
	return null;
}

function rewritePlaylist(text, base) {
	var lines = text.split(/\r?\n/);
	for (var i = 0; i < lines.length; i++) {
		var line = lines[i];
		if (line.charAt(0) === "#") {
			lines[i] = line.replace(/URI="([^"]+)"/g, function(all, u) {
				return 'URI="' + local(u, base) + '"';
			});
		} else if (line.replace(/\s/g, "")) {
			lines[i] = local(line, base);
		}
	}
	return lines.join("\n");
}

var PASS = {"content-type": true, "content-length": true, "content-range": true, "accept-ranges": true};

// A playlist: fetch, rewrite, serve as m3u8.
function servePlaylist(realUrl, res) {
	var child = child_process.spawn(CURL, ["-sS", "-L", "--max-time", "30", "-A", AGENT, realUrl]);
	var buf = "";
	var tooBig = false;
	child.stdout.on("data", function(c) {
		buf += c.toString("binary");
		if (buf.length > 4 * 1024 * 1024) { tooBig = true; try { child.kill(); } catch (e) {} }
	});
	child.stderr.on("data", function(d) { log("playlist curl: " + String(d).replace(/\s+$/, "")); });
	child.on("exit", function(code) {
		if (tooBig || code !== 0 || !buf) {
			try { res.writeHead(502, {"Content-Length": "0"}); res.end(); } catch (e) {}
			return;
		}
		// A master playlist: serve just one rendition's media playlist instead,
		// so the player never switches variants.
		if (/#EXT-X-STREAM-INF/i.test(buf)) {
			var v = firstVariant(buf, realUrl);
			if (v && allowed(v)) { servePlaylist(v, res); return; }
		}
		var body = new Buffer(rewritePlaylist(buf, realUrl), "utf8");
		try {
			res.writeHead(200, {"Content-Type": "application/vnd.apple.mpegurl", "Content-Length": String(body.length)});
			res.end(body);
		} catch (e2) {}
	});
}

// A segment (or key): stream it straight through.
function serveSegment(realUrl, req, res) {
	var args = ["-s", "-S", "-i", "-N", "-L", "--http1.1", "--connect-timeout", "20", "-A", AGENT];
	if (req.method === "HEAD") { args.push("-I"); }
	if (req.headers.range) { args.push("-H", "Range: " + req.headers.range); }
	args.push(realUrl);
	var child = child_process.spawn(CURL, args);
	var head = "", started = false, finished = false;

	function finish() {
		if (finished) { return; }
		finished = true;
		try { child.kill(); } catch (e) {}
	}
	child.stdout.on("data", function(chunk) {
		if (finished) { return; }
		if (!started) {
			head += chunk.toString("binary");
			// With -i -L, each redirect hop prints its own header block; skip the
			// 3xx ones and act on the final response.
			while (true) {
				var end = head.indexOf("\r\n\r\n");
				if (end < 0) {
					if (head.length > 131072) { try { res.writeHead(502); res.end(); } catch (e) {} finish(); }
					return;
				}
				var lines = head.substring(0, end).split("\r\n");
				var status = parseInt((lines[0].split(" ")[1]) || "502", 10);
				if (status >= 300 && status < 400) {
					head = head.substring(end + 4);
					continue;
				}
				var headers = {};
				for (var i = 1; i < lines.length; i++) {
					var c = lines[i].indexOf(":");
					if (c > 0) {
						var name = lines[i].substring(0, c).toLowerCase();
						if (PASS[name]) { headers[name] = lines[i].substring(c + 1).replace(/^\s+|\s+$/g, ""); }
					}
				}
				if (!headers["content-type"]) { headers["content-type"] = "video/MP2T"; }
				started = true;
				res.writeHead(status, headers);
				var rest = new Buffer(head.substring(end + 4), "binary");
				head = "";
				if (rest.length) { res.write(rest); }
				return;
			}
		}
		if (res.write(chunk) === false) { child.stdout.pause(); }
	});
	res.on("drain", function() { if (!finished) { child.stdout.resume(); } });
	child.stderr.on("data", function(d) { log("segment curl: " + String(d).replace(/\s+$/, "")); });
	child.on("exit", function() {
		finished = true;
		try { res.end(); } catch (e) {}
	});
	req.connection.on("close", finish);
}

function handle(req, res) {
	var m = /^\/([ps])\/([A-Za-z0-9_\-]+)/.exec(req.url || "");
	if (!m || (req.method !== "GET" && req.method !== "HEAD")) {
		res.writeHead(404, {"Content-Length": "0"});
		res.end();
		return;
	}
	var real;
	try { real = dec(m[2]); } catch (e) { real = ""; }
	if (!allowed(real)) {
		res.writeHead(403, {"Content-Length": "0"});
		res.end();
		return;
	}
	if (m[1] === "p") { servePlaylist(real, res); }
	else { serveSegment(real, req, res); }
}

function withServer(cb) {
	if (port) { cb(null, port); return; }
	waiting.push(cb);
	if (server) { return; }
	server = http.createServer(handle);
	server.on("error", function(e) {
		log("server error: " + e);
		var w = waiting; waiting = []; server = null;
		for (var i = 0; i < w.length; i++) { w[i](e); }
	});
	server.listen(0, "127.0.0.1", function() {
		port = server.address().port;
		log("listening on 127.0.0.1:" + port);
		var w = waiting; waiting = [];
		for (var i = 0; i < w.length; i++) { w[i](null, port); }
	});
}

// ---- luna command: video ----------------------------------------------------
// {url: "https://video.bsky.app/.../playlist.m3u8"} -> {returnValue, url}
var videoAssistant = function() {};
videoAssistant.prototype.run = function(future) {
	var a = this.controller.args || {};
	if (!a.url || !allowed(a.url)) {
		future.result = {returnValue: false, errorText: "missing or non-Bluesky url"};
		return future;
	}
	withServer(function(err, p) {
		if (err) {
			future.result = {returnValue: false, errorText: "could not listen: " + err};
			return;
		}
		future.result = {returnValue: true, url: "http://127.0.0.1:" + p + "/p/" + enc(a.url)};
	});
	return future;
};

// ---- luna command: ping -----------------------------------------------------
// Keeps the service alive while a video plays.
var pingAssistant = function() {};
pingAssistant.prototype.run = function(future) {
	future.result = {returnValue: true, port: port};
	return future;
};
