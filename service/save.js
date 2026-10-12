// Service for the Bluesky app (node 0.4.12 on webOS CE, ES5 only).
//
// A web app cannot keep a file it has fetched. This service saves a picture to
// the TouchPad's storage with the system's curl, which on webOS Community
// Edition speaks current TLS (node's own stack does not reach cdn.bsky.app).
//
// Bluesky's CDN serves WebP by default; an "@jpeg" suffix makes it hand back
// JPEG, which is what the tablet can open.
//
// Every answer carries "ok". A failure has ok: false and "error", a sentence
// the app can show.

if (typeof require === "undefined") {
	require = IMPORTS.require;
}

var child_process = require("child_process");
var fs = require("fs");

var FOLDER = "/media/internal/TouchSky";
var CURL = "/usr/bin/curl";
var AGENT = "Bluesky-webOS/0.1";

function log(msg) {
	try { console.log("[bssvc] " + msg); } catch (e) {}
}

function fail(future, text) {
	future.result = {returnValue: true, ok: false, error: text};
	return future;
}

function mkdirs(path) {
	var parts = path.split("/");
	var at = "";
	for (var i = 1; i < parts.length; i++) {
		at += "/" + parts[i];
		try { fs.mkdirSync(at, 493 /* 0755 */); } catch (e) {}
	}
}

// The storage is FAT: these cannot be in a name, nor a dot or space at its end.
function safeName(text) {
	return String(text || "").replace(/[\\\/:*?"<>|\x00-\x1f]/g, "_").replace(/[. ]+$/, "").replace(/^\s+/, "").substring(0, 120);
}

// {url, name} -> {file}: fetch a picture into Bluesky/<name>. One already there
// is left as it is.
var saveAssistant = function() {};
saveAssistant.prototype.run = function(future) {
	var args = this.controller.args || {};
	var url = String(args.url || "");
	var name = safeName(args.name);
	if (!/^https?:\/\//i.test(url) || !name) {
		return fail(future, "That picture has no address to save from.");
	}
	// Ask the Bluesky CDN for JPEG, not WebP.
	if (/cdn\.bsky\.app/.test(url)) {
		url = url.replace(/@[a-z]+$/i, "") + "@jpeg";
	}
	if (!/\.[a-z0-9]{2,5}$/i.test(name)) {
		name += ".jpg";
	}
	var file = FOLDER + "/" + name;
	mkdirs(FOLDER);
	try {
		fs.statSync(file);
		future.result = {returnValue: true, ok: true, file: file, already: true};
		return future;
	} catch (e) {}
	var err = "";
	var child;
	try {
		child = child_process.spawn(CURL, ["-sS", "-L", "--fail", "-A", AGENT, "--max-time", "300", "-o", file + ".part", url]);
	} catch (e2) {
		return fail(future, "The picture could not be fetched.");
	}
	child.stderr.on("data", function(d) { err += d.toString(); });
	child.on("exit", function(code) {
		if (code !== 0) {
			try { fs.unlinkSync(file + ".part"); } catch (e3) {}
			log("save " + url + ": curl " + code + " " + err.replace(/\s+/g, " ").substring(0, 200));
			fail(future, code === 23 ? "The TouchPad's storage is full." :
				(code === 6 || code === 7 || code === 28 ? "Bluesky could not be reached." : "The picture could not be fetched."));
			return;
		}
		try {
			fs.renameSync(file + ".part", file);
		} catch (e4) {
			fail(future, "The picture could not be saved.");
			return;
		}
		future.result = {returnValue: true, ok: true, file: file};
	});
	return future;
};
