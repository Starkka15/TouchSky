/* Explore: a search box over results, either posts or people. Posts reuse
	BS.Post; people are rows that open a profile when tapped. */
enyo.kind({
	name: "BS.Explore",
	kind: enyo.VFlexBox,
	className: "bs-feed",
	events: {
		onReply: "",
		onSave: "",
		onPick: "",
		onOpen: ""
	},
	components: [
		{kind: "HFlexBox", align: "center", className: "bs-search-bar", components: [
			{name: "search", kind: "SearchInput", hint: "Search Bluesky", flex: 1, className: "bs-search-input",
				onkeydown: "searchKey", onCancel: "cleared", autoCapitalize: "lowercase",
				autocorrect: false, spellcheck: false},
			{name: "posts", kind: "Button", caption: "Posts", className: "enyo-button-blue bs-mode",
				onclick: "postsMode"},
			{name: "people", kind: "Button", caption: "People", className: "enyo-button-dark bs-mode",
				onclick: "peopleMode"}
		]},
		{name: "note", className: "bs-feed-note", showing: false},
		{name: "scroller", kind: "Scroller", flex: 1, accelerated: false, onScroll: "scrolled", components: [
			{name: "list"}
		]}
	],

	create: function() {
		this.inherited(arguments);
		this.mode = "posts";
		this.query = "";
		this.cursor = "";
		this.loading = false;
		this.more = true;
		this.turn = 0;
	},

	open: function() {
		// Nothing to load until there is a query; let the box take focus.
		enyo.asyncMethod(this.$.search, "forceFocusEnableKeyboard");
	},

	showNote: function(text) {
		this.$.note.setContent(text || "");
		this.$.note.setShowing(!!text);
	},

	// ---- mode toggle ----

	postsMode: function() { this.setMode("posts"); },
	peopleMode: function() { this.setMode("people"); },

	setMode: function(mode) {
		if (this.mode === mode) { return; }
		this.mode = mode;
		this.$.posts.setClassName("enyo-button-" + (mode === "posts" ? "blue" : "dark") + " bs-mode");
		this.$.people.setClassName("enyo-button-" + (mode === "people" ? "blue" : "dark") + " bs-mode");
		if (this.query) { this.runSearch(this.query); }
	},

	// ---- searching ----

	searchKey: function(inSender, inEvent) {
		if (inEvent.keyCode === 13) {
			this.runSearch(this.$.search.getValue());
		}
	},

	cleared: function() {
		this.query = "";
		this.$.list.destroyControls();
		if (this.$.list.hasNode()) { this.$.list.render(); }
		this.showNote("");
	},

	runSearch: function(q) {
		q = String(q || "").replace(/^\s+|\s+$/g, "");
		this.query = q;
		var turn = ++this.turn;
		this.cursor = "";
		this.more = true;
		this.$.list.destroyControls();
		if (this.$.list.hasNode()) { this.$.list.render(); }
		this.$.scroller.scrollTo(0, 0);
		if (!q) { this.showNote(""); return; }
		this.loading = true;
		this.showNote("Searching…");
		this.fetch(turn, false);
	},

	loadMore: function() {
		if (this.loading || !this.more || !this.cursor || !this.query) { return; }
		this.loading = true;
		this.fetch(this.turn, true);
	},

	fetch: function(turn, append) {
		var self = this;
		var done = function(error, data) {
			if (turn !== self.turn) { return; }
			self.loading = false;
			if (error) {
				self.showNote(error === "signin" ? "Please sign in again." : error);
				return;
			}
			self.cursor = data.cursor || "";
			self.more = !!data.cursor;
			if (self.mode === "posts") { self.showPosts(data.posts || [], append); }
			else { self.showActors(data.actors || [], append); }
		};
		if (this.mode === "posts") { BS.Api.searchPosts(this.query, this.cursor, done); }
		else { BS.Api.searchActors(this.query, this.cursor, done); }
	},

	showPosts: function(posts, append) {
		if (!append) { this.$.list.destroyControls(); }
		for (var i = 0; i < posts.length; i++) {
			if (!posts[i] || !posts[i].uri) { continue; }
			var row = this.$.list.createComponent({
				kind: "BS.Post", owner: this,
				onReply: "rowReply", onSave: "rowSave", onPick: "rowPick", onOpen: "rowOpen"
			});
			row.setItem({post: posts[i]});
		}
		if (this.$.list.hasNode()) { this.$.list.render(); }
		this.showNote(this.$.list.getControls().length ? "" : "No posts found.");
	},

	showActors: function(actors, append) {
		if (!append) { this.$.list.destroyControls(); }
		var pending = [];
		for (var i = 0; i < actors.length; i++) {
			this.addActor(actors[i], pending);
		}
		if (this.$.list.hasNode()) { this.$.list.render(); }
		BS.fillEmoji(pending);
		this.showNote(this.$.list.getControls().length ? "" : "No people found.");
	},

	addActor: function(a, pending) {
		var name = BS.emojiHtml(a.displayName || a.handle || "");
		pending.push.apply(pending, name.list);
		var bioHtml = "";
		if (a.description) {
			var bio = BS.emojiHtml(a.description.replace(/\n+/g, " "));
			pending.push.apply(pending, bio.list);
			bioHtml = "<div class='bs-actor-bio'>" + bio.html + "</div>";
		}
		var row = this.$.list.createComponent({
			kind: "HFlexBox", className: "bs-notif", handle: a.did || a.handle,
			onclick: "actorTap", owner: this,
			components: [
				{className: "bs-notif-avatar"},
				{allowHtml: true, flex: 1, content:
					"<span class='bs-name'>" + name.html + "</span> " +
					"<span class='bs-handle'>@" + BS.escape(a.handle || "") + "</span>" + bioHtml}
			]
		});
		BS.bg(row.getControls()[0], BS.avatarThumb(a.avatar));
	},

	actorTap: function(inSender) {
		if (inSender.handle) { this.doPick(inSender.handle); }
	},

	rowReply: function(inSender, post) { this.doReply(post); },
	rowSave: function(inSender, info) { this.doSave(info); },
	rowPick: function(inSender, handle) { this.doPick(handle); },
	rowOpen: function(inSender, uri) { this.doOpen(uri); },

	scrolled: function() {
		if (!this.$.list.getControls().length) { return; }
		var sc = this.$.scroller;
		var b = sc.getBoundaries();
		if (b && (b.bottom - (sc.scrollTop || 0)) < 800) { this.loadMore(); }
	},

	toTop: function() {
		this.$.scroller.scrollTo(0, 0);
	}
});
