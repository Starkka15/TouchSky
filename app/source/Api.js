/* Talking to Bluesky over the AT Protocol (XRPC): plain JSON over HTTPS.
	Sign in once with an app password; everything after carries a bearer token.
	When the short-lived access token expires, swap in a fresh one with the
	refresh token and try the call again. */

BS.Api = {
	// The host the app talks to. bsky.social is the entryway: it serves the
	// app.bsky.* reads and proxies the repo writes to the account's own server.
	host: function() {
		return BS.pref("host", "bsky.social");
	},

	setHost: function(h) {
		h = String(h || "").replace(/^https?:\/\//, "").replace(/\/+$/, "");
		BS.setPref("host", h || "bsky.social");
	},

	url: function(method) {
		return "https://" + BS.Api.host() + "/xrpc/" + method;
	},

	// One XRPC call.
	//   method:   "app.bsky.feed.getTimeline"
	//   opts:     {post: true} for a procedure (POST), else a query (GET)
	//             {params: {...}} query string; {body: {...}} JSON body
	//             {token: "..."} a specific bearer; {auth: false} for none
	//   callback: (error, data). error is "" on success.
	call: function(method, opts, callback) {
		opts = opts || {};
		var isPost = !!opts.post;
		var url = "https://" + (opts.host || BS.Api.host()) + "/xrpc/" + method;
		if (opts.params) {
			var parts = [];
			for (var k in opts.params) {
				if (!opts.params.hasOwnProperty(k)) { continue; }
				var v = opts.params[k];
				if (v === undefined || v === "") { continue; }
				if (v && v.length !== undefined && typeof v !== "string") {
					// An array: repeat the key for each value.
					for (var vi = 0; vi < v.length; vi++) {
						parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(v[vi]));
					}
				} else {
					parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(v));
				}
			}
			if (parts.length) { url += "?" + parts.join("&"); }
		}
		var token = opts.auth === false ? "" :
			(opts.token !== undefined ? opts.token : ((BS.session() || {}).accessJwt || ""));

		var req = new XMLHttpRequest();
		var done = false;
		var timer = setTimeout(function() {
			try { req.abort(); } catch (e) {}
			finish(0, "");
		}, 30000);
		function finish(status, text) {
			if (done) { return; }
			done = true;
			clearTimeout(timer);
			BS.Api.handle(method, opts, status, text, callback);
		}
		try {
			req.open(isPost ? "POST" : "GET", url, true);
			if (token) { req.setRequestHeader("Authorization", "Bearer " + token); }
			if (isPost) { req.setRequestHeader("Content-Type", "application/json"); }
			// Direct-message calls are proxied to the chat service.
			if (opts.proxy) { req.setRequestHeader("atproto-proxy", "did:web:api.bsky.chat#bsky_chat"); }
			req.onreadystatechange = function() {
				if (req.readyState === 4) { finish(req.status, req.responseText); }
			};
			req.send(isPost && opts.body ? enyo.json.stringify(opts.body) : null);
		} catch (e) {
			finish(0, "");
		}
	},

	// Read a reply, refresh the token once if it has expired, else report.
	handle: function(method, opts, status, text, callback) {
		var data = null;
		if (text) {
			try { data = enyo.json.parse(text); } catch (e) {}
		}
		if (status >= 200 && status < 300) {
			callback("", data || {});
			return;
		}
		var err = (data && data.error) || "";
		// The access token has run out: get a new one and try the call again,
		// but only once, and never for the refresh call itself.
		if (!opts._retried && opts.auth !== false && opts.token === undefined &&
				method !== "com.atproto.server.refreshSession" &&
				(err === "ExpiredToken" || err === "InvalidToken" || status === 401)) {
			BS.Api.refresh(function(ok) {
				if (ok) {
					var again = {};
					for (var k in opts) { if (opts.hasOwnProperty(k)) { again[k] = opts[k]; } }
					again._retried = true;
					BS.Api.call(method, again, callback);
				} else {
					callback("signin", data);
				}
			});
			return;
		}
		if (status === 0) {
			callback("Bluesky could not be reached.", data);
			return;
		}
		var msg = (data && (data.message || data.error)) || ("Bluesky answered with an error (" + status + ").");
		callback(msg, data);
	},

	// ---- session ----

	// Sign in with a handle (or email) and an app password.
	login: function(identifier, password, callback) {
		BS.Api.call("com.atproto.server.createSession", {
			post: true, auth: false,
			body: {identifier: String(identifier || "").replace(/^@/, ""), password: String(password || "")}
		}, function(error, data) {
			if (error) {
				callback(error === "signin" ? "That handle or app password was not accepted." : error);
				return;
			}
			BS.setSession({
				accessJwt: data.accessJwt, refreshJwt: data.refreshJwt,
				did: data.did, handle: data.handle
			});
			callback("", data);
		});
	},

	// Trade the refresh token for a new pair. callback(ok).
	refresh: function(callback) {
		var s = BS.session();
		if (!s || !s.refreshJwt) { callback(false); return; }
		BS.Api.call("com.atproto.server.refreshSession", {
			post: true, token: s.refreshJwt
		}, function(error, data) {
			if (error || !data || !data.accessJwt) { callback(false); return; }
			BS.setSession({
				accessJwt: data.accessJwt, refreshJwt: data.refreshJwt,
				did: data.did, handle: data.handle
			});
			callback(true);
		});
	},

	logout: function() {
		BS.clearSession();
	},

	// ---- reading ----

	// A profile, for the rail avatar and the profile screen. callback(error, profile).
	profile: function(actor, callback) {
		BS.Api.call("app.bsky.actor.getProfile", {params: {actor: actor}}, callback);
	},

	// The home feed. callback(error, {feed, cursor}).
	timeline: function(cursor, callback) {
		BS.Api.call("app.bsky.feed.getTimeline", {
			params: {limit: 30, cursor: cursor || ""}
		}, callback);
	},

	// The account's settings, including its saved/pinned feeds.
	// callback(error, {preferences}).
	preferences: function(callback) {
		BS.Api.call("app.bsky.actor.getPreferences", {}, callback);
	},

	// Metadata for feed generators. uris is an array. callback(error, {feeds}).
	feedGenerators: function(uris, callback) {
		BS.Api.call("app.bsky.feed.getFeedGenerators", {params: {feeds: uris}}, callback);
	},

	// Posts from a custom feed. callback(error, {feed, cursor}).
	feed: function(feedUri, cursor, callback) {
		BS.Api.call("app.bsky.feed.getFeed", {
			params: {feed: feedUri, limit: 30, cursor: cursor || ""}
		}, callback);
	},

	// Posts from a list. callback(error, {feed, cursor}).
	listFeed: function(listUri, cursor, callback) {
		BS.Api.call("app.bsky.feed.getListFeed", {
			params: {list: listUri, limit: 30, cursor: cursor || ""}
		}, callback);
	},

	// Someone's lists. callback(error, {lists, cursor}).
	lists: function(actor, cursor, callback) {
		BS.Api.call("app.bsky.graph.getLists", {
			params: {actor: actor, limit: 50, cursor: cursor || ""}
		}, callback);
	},

	// ---- direct messages (served by the chat host directly) ----

	CHAT_HOST: "api.bsky.chat",

	// Conversations. callback(error, {convos, cursor}).
	convos: function(cursor, callback) {
		BS.Api.call("chat.bsky.convo.listConvos", {
			host: BS.Api.CHAT_HOST, params: {limit: 30, cursor: cursor || ""}
		}, callback);
	},

	// Messages in a conversation. callback(error, {messages, cursor}).
	messages: function(convoId, cursor, callback) {
		BS.Api.call("chat.bsky.convo.getMessages", {
			host: BS.Api.CHAT_HOST, params: {convoId: convoId, limit: 40, cursor: cursor || ""}
		}, callback);
	},

	// Send a message. callback(error, message).
	sendMessage: function(convoId, text, callback) {
		BS.Api.call("chat.bsky.convo.sendMessage", {
			post: true, host: BS.Api.CHAT_HOST,
			body: {convoId: convoId, message: {text: String(text || "")}}
		}, callback);
	},

	// A post with its ancestors and replies. callback(error, {thread}).
	postThread: function(uri, callback) {
		BS.Api.call("app.bsky.feed.getPostThread", {
			params: {uri: uri, depth: 6, parentHeight: 20}
		}, callback);
	},

	// Someone's own posts. callback(error, {feed, cursor}).
	authorFeed: function(actor, cursor, callback) {
		BS.Api.call("app.bsky.feed.getAuthorFeed", {
			params: {actor: actor, limit: 30, cursor: cursor || ""}
		}, callback);
	},

	// Search posts. callback(error, {posts, cursor}).
	searchPosts: function(q, cursor, callback) {
		BS.Api.call("app.bsky.feed.searchPosts", {
			params: {q: q, limit: 25, cursor: cursor || ""}
		}, callback);
	},

	// Search people. callback(error, {actors, cursor}).
	searchActors: function(q, cursor, callback) {
		BS.Api.call("app.bsky.actor.searchActors", {
			params: {q: q, limit: 25, cursor: cursor || ""}
		}, callback);
	},

	// Who liked/reposted/followed/replied/mentioned. callback(error, {notifications, cursor}).
	notifications: function(cursor, callback) {
		BS.Api.call("app.bsky.notification.listNotifications", {
			params: {limit: 30, cursor: cursor || ""}
		}, callback);
	},

	// How many unread notifications. callback(error, {count}).
	unreadCount: function(callback) {
		BS.Api.call("app.bsky.notification.getUnreadCount", {}, callback);
	},

	// Mark notifications read up to now.
	markSeen: function(callback) {
		BS.Api.call("app.bsky.notification.updateSeen", {
			post: true, body: {seenAt: new Date().toISOString()}
		}, callback || function() {});
	},

	// ---- writing: all repo records under our own DID ----

	// Post some text. reply is an optional {root:{uri,cid}, parent:{uri,cid}}.
	post: function(text, reply, callback) {
		var s = BS.session();
		if (!s) { callback("Not signed in."); return; }
		var record = {
			"$type": "app.bsky.feed.post",
			text: String(text || ""),
			createdAt: new Date().toISOString(),
			langs: ["en"]
		};
		var facets = BS.Api.linkFacets(record.text);
		if (facets.length) { record.facets = facets; }
		if (reply) { record.reply = reply; }
		BS.Api.call("com.atproto.repo.createRecord", {
			post: true,
			body: {repo: s.did, collection: "app.bsky.feed.post", record: record}
		}, callback);
	},

	// Like a post. subject is {uri, cid}. callback(error, {uri}) — keep that uri
	// to undo the like later.
	like: function(subject, callback) {
		BS.Api.createLike("app.bsky.feed.like", subject, callback);
	},

	repost: function(subject, callback) {
		BS.Api.createLike("app.bsky.feed.repost", subject, callback);
	},

	createLike: function(collection, subject, callback) {
		var s = BS.session();
		if (!s) { callback("Not signed in."); return; }
		BS.Api.call("com.atproto.repo.createRecord", {
			post: true,
			body: {
				repo: s.did, collection: collection,
				record: {
					"$type": collection,
					subject: {uri: subject.uri, cid: subject.cid},
					createdAt: new Date().toISOString()
				}
			}
		}, callback);
	},

	// Undo a like or repost, given the record's own at:// uri.
	remove: function(collection, uri, callback) {
		var s = BS.session();
		if (!s) { callback("Not signed in."); return; }
		BS.Api.call("com.atproto.repo.deleteRecord", {
			post: true,
			body: {repo: s.did, collection: collection, rkey: BS.rkeyOf(uri)}
		}, callback);
	},

	unlike: function(uri, callback) { BS.Api.remove("app.bsky.feed.like", uri, callback); },
	unrepost: function(uri, callback) { BS.Api.remove("app.bsky.feed.repost", uri, callback); },

	// Follow someone. callback(error, {uri}) — keep that uri to unfollow later.
	follow: function(did, callback) {
		var s = BS.session();
		if (!s) { callback("Not signed in."); return; }
		BS.Api.call("com.atproto.repo.createRecord", {
			post: true,
			body: {
				repo: s.did, collection: "app.bsky.graph.follow",
				record: {"$type": "app.bsky.graph.follow", subject: did, createdAt: new Date().toISOString()}
			}
		}, callback);
	},

	unfollow: function(uri, callback) { BS.Api.remove("app.bsky.graph.follow", uri, callback); },

	// Links in the text become clickable facets (byte ranges, as the protocol wants).
	linkFacets: function(text) {
		var out = [];
		var re = /https?:\/\/[^\s]+/g;
		var m;
		while ((m = re.exec(text))) {
			var url = m[0].replace(/[.,;:!?)\]]+$/, "");    // trailing punctuation is not part of it
			var start = BS.Api.byteLen(text.substring(0, m.index));
			var end = start + BS.Api.byteLen(url);
			out.push({
				index: {byteStart: start, byteEnd: end},
				features: [{"$type": "app.bsky.richtext.facet#link", uri: url}]
			});
		}
		return out;
	},

	// How many bytes a string is as UTF-8 (facets count bytes, not characters).
	byteLen: function(str) {
		return unescape(encodeURIComponent(str)).length;
	}
};
